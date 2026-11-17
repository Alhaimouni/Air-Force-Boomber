// Main game: renderer, hangar, flight loop, cameras, weapons, threats, traffic, money.
(function () {
  'use strict';
  const T = THREE, V3 = T.Vector3, clamp = G.clamp, $ = (id) => document.getElementById(id);
  const g = G.game = { state: 'loading', view: 0, missiles: [], traffic: [], bombs: [], flareObjs: [], time: 0, mapRange: 6000, impact: null, impactT: 0, locked: false, pullUp: false, audioTransonic: 0 };

  // ---------- save
  const SAVE_KEY = 'airboomber.v1';
  let save = { money: 0, owned: ['f16', 'a320'], sandbox: false, last: 0, defence: true, startAp: 0, startCity: 0, mLevel: 1, mLevelSel: 0, mTarget: -1, assist: 2, flareRefill: true, paint: {}, mode: 'free', freeStart: 'rw', mCities: 1, rTime: 180, rCity: 0, rDef: false, lWhere: 0, lDist: 9000, best: {} };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.owned) save = Object.assign(save, s); } catch (e) { /* no save */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
  if (!save.paint || typeof save.paint !== 'object') save.paint = {};
  if (!save.best || typeof save.best !== 'object') save.best = {};
  const paintOf = (id) => save.paint[id] || {};
  const owns = (id) => save.sandbox || save.owned.indexOf(id) >= 0 || G.aircraftById(id).price === 0;

  // ---------- renderer / scenes
  const canvas = $('gl'), hudC = $('hud');
  // graphics settings (saved separately from the game save)
  const GFX_KEY = 'airboomber.gfx';
  const PRESETS = {
    low: { scale: 0.6, shadows: false, view: 28, fx: 0.4, sea: false },
    medium: { scale: 0.8, shadows: true, view: 36, fx: 0.7, sea: true },
    high: { scale: 1, shadows: true, view: 46, fx: 1, sea: true },
    ultra: { scale: 1.5, shadows: true, view: 70, fx: 1.6, sea: true }
  };
  // Auto quality: a ladder of settings from full detail down to the lightest. The game starts on the rung that suits the
  // device, then watches the frame rate and moves down a rung when it cannot hold the target, or back up when it has room.
  const LADDER = [
    { scale: 1, shadows: true, view: 46, fx: 1, sea: true },
    { scale: 0.85, shadows: true, view: 46, fx: 1, sea: true },
    { scale: 0.75, shadows: true, view: 40, fx: 0.7, sea: true },
    { scale: 0.67, shadows: false, view: 36, fx: 0.7, sea: true },
    { scale: 0.58, shadows: false, view: 30, fx: 0.4, sea: false },
    { scale: 0.5, shadows: false, view: 26, fx: 0.4, sea: false }
  ];
  const nav = window.navigator || {}, isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || ((nav.maxTouchPoints || 0) > 1 && Math.min(window.screen.width, window.screen.height) < 900);
  const gfx = Object.assign({ preset: 'auto', aa: true, fpsCap: 0, showFps: false, power: 'high-performance', autoLvl: -1, v: 2 }, PRESETS.high);
  try { const s = JSON.parse(localStorage.getItem(GFX_KEY)); if (s) { Object.assign(gfx, s); if (s.v !== 2) { gfx.preset = 'auto'; gfx.autoLvl = -1; gfx.v = 2; } } } catch (e) { /* defaults */ }
  const saveGfx = () => { try { localStorage.setItem(GFX_KEY, JSON.stringify(gfx)); } catch (e) { /* ignore */ } };
  const isAuto = () => gfx.preset === 'auto';
  const useAA = () => (isAuto() ? !(isMobile && (window.devicePixelRatio || 1) >= 2) : gfx.aa); // on a dense phone screen MSAA costs a lot and shows little
  const bootGfx = { aa: useAA(), power: gfx.power }; // these two only take effect when the renderer is created
  const renderer = new T.WebGLRenderer({ canvas, antialias: bootGfx.aa, logarithmicDepthBuffer: true, powerPreference: gfx.power, stencil: false });
  const auto = { lvl: 0, n: 0, t: 0, low: 0, ok: 0, hold: 0, backoff: 20, wait: 3, from: -1 };
  const eff = () => (isAuto() ? LADDER[auto.lvl] : gfx); // the settings actually in force
  // device pixels per CSS pixel: Auto never renders above 2x (a 3x phone screen is nine times the work of 1x for no visible gain)
  const pxRatio = () => (isAuto() ? Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2) * eff().scale) : clamp((window.devicePixelRatio || 1) * gfx.scale, 0.4, 3));
  renderer.setPixelRatio(pxRatio());
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  g.renderer = renderer; g.hctx = hudC.getContext('2d');
  const scene = new T.Scene(); scene.fog = new T.FogExp2(0xa9c3dc, 0.000042);
  const camera = g.camera = new T.PerspectiveCamera(60, 1, 0.5, 3e7);
  const sky = G.makeSky(); sky.scale.setScalar(120); scene.add(sky);
  // ---------- space: stars, a curved Earth far below, and the Moon
  const stars = (function () {
    const p = [], r = G.rng(808);
    for (let i = 0; i < 2600; i++) { const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u); p.push(Math.cos(a) * s * 900, u * 900, Math.sin(a) * s * 900); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    const m = new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    m.frustumCulled = false; m.renderOrder = -9; scene.add(m); return m;
  })();
  (function buildGlobe() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'), img = x.createImageData(1024, 512);
    for (let j = 0; j < 512; j++) for (let i = 0; i < 1024; i++) {
      const n = G.fbm(i / 70, j / 70, 5), lat = Math.abs(j - 256) / 256, k = (j * 1024 + i) * 4, cl = G.fbm(i / 40 + 50, j / 22 + 9, 4);
      let r = 14, gg = 52, b = 104;
      if (n > 0.6) { const t = Math.min(1, (n - 0.6) * 6), dry = Math.max(0, G.fbm(i / 120 + 7, j / 120, 2) - 0.45) * 2; r = 40 + t * 30 + dry * 120; gg = 86 + t * 20 + dry * 50; b = 40 + dry * 30; }
      if (lat > 0.86) { r = gg = b = 235; }
      if (cl > 0.6) { const t = Math.min(1, (cl - 0.6) * 5) * 0.8; r += (245 - r) * t; gg += (245 - gg) * t; b += (248 - b) * t; }
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = 'rgb(14,52,104)'; [256, 768].forEach((u) => { x.beginPath(); x.arc(u, 256, 16, 0, 7); x.fill(); }); // open ocean under the play area
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const R = 6371000, geo = new T.SphereGeometry(R, 160, 120); geo.rotateX(Math.PI / 2);
    const globe = new T.Mesh(geo, new T.MeshLambertMaterial({ map: tex }));
    globe.position.set(0, -R - 90, 0); globe.frustumCulled = false; scene.add(globe);
    const glow = new T.Mesh(new T.SphereGeometry(R * 1.012, 96, 72), new T.MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.16, side: T.BackSide, depthWrite: false, fog: false }));
    glow.position.copy(globe.position); glow.frustumCulled = false; scene.add(glow);
  })();
  (function buildMoon() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'), r = G.rng(1969);
    x.fillStyle = '#9a9894'; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(70,70,74,${0.25 + r() * 0.3})`; x.beginPath(); x.ellipse(r() * 1024, r() * 512, 30 + r() * 110, 20 + r() * 70, r() * 3, 0, 7); x.fill(); }
    for (let i = 0; i < 900; i++) {
      const cx = r() * 1024, cy = r() * 512, cr = 1.5 + r() * r() * 22;
      x.fillStyle = 'rgba(60,60,62,0.35)'; x.beginPath(); x.arc(cx, cy, cr, 0, 7); x.fill();
      x.strokeStyle = 'rgba(215,213,208,0.5)'; x.lineWidth = Math.max(1, cr * 0.15); x.beginPath(); x.arc(cx - cr * 0.12, cy - cr * 0.12, cr, 0, 7); x.stroke();
    }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const moon = new T.Mesh(new T.SphereGeometry(G.MOON.r, 96, 64), new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, fog: false }));
    moon.position.copy(G.MOON.pos); moon.frustumCulled = false; scene.add(moon); scene.environment = null;
  })();
  const envScene = new T.Scene(); envScene.add(G.makeSky());
  const pm = new T.PMREMGenerator(renderer); const env = pm.fromScene(envScene, 0, 1, 5000).texture;
  scene.environment = env;
  scene.add(new T.HemisphereLight(0xcfe2ff, 0x5a5644, 0.4));
  const sun = new T.DirectionalLight(0xfff1dc, 3.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 1200; sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // hangar scene
  const hs = new T.Scene(); hs.background = new T.Color(0x0b0d10); hs.environment = env; hs.fog = new T.Fog(0x0b0d10, 120, 320);
  const hcam = new T.PerspectiveCamera(42, 1, 0.5, 600);
  (function buildHangar() {
    const fc = document.createElement('canvas'); fc.width = fc.height = 512; const fx = fc.getContext('2d');
    fx.fillStyle = '#3a3d41'; fx.fillRect(0, 0, 512, 512); fx.strokeStyle = '#2b2e31'; fx.lineWidth = 3; fx.strokeRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) { fx.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},255,0.02)`; fx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
    const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(24, 24); ft.colorSpace = T.SRGBColorSpace;
    const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ map: ft, roughness: 0.32, metalness: 0.35 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; hs.add(floor);
    const ag = new T.CylinderGeometry(70, 70, 260, 40, 1, true, Math.PI / 2, Math.PI); ag.rotateX(Math.PI / 2);
    hs.add(new T.Mesh(ag, new T.MeshStandardMaterial({ color: 0x4a5057, roughness: 0.7, metalness: 0.4, side: T.BackSide })));
    for (let z = -120; z <= 120; z += 30) {
      const rib = new T.Mesh(new T.TorusGeometry(69, 1.2, 6, 40, Math.PI), new T.MeshStandardMaterial({ color: 0x2c3035, roughness: 0.6, metalness: 0.6 })); rib.position.z = z; hs.add(rib);
      const lamp = new T.Mesh(new T.BoxGeometry(26, 0.6, 3), new T.MeshBasicMaterial({ color: 0xfff6e0 })); lamp.position.set(0, 66, z + 15); hs.add(lamp);
    }
    const back = new T.Mesh(new T.PlaneGeometry(160, 80), new T.MeshStandardMaterial({ color: 0x33383d, roughness: 0.8 })); back.position.set(0, 40, -128); hs.add(back);
    hs.add(new T.HemisphereLight(0xdfe8ff, 0x3a3833, 0.7));
    const k = new T.DirectionalLight(0xfff4e0, 2.6); k.position.set(30, 70, 40); k.castShadow = true; k.shadow.mapSize.set(2048, 2048);
    const kc = k.shadow.camera; kc.left = -45; kc.right = 45; kc.top = 45; kc.bottom = -45; kc.far = 200; hs.add(k);
    const r = new T.DirectionalLight(0x9fc0ff, 1.0); r.position.set(-50, 30, -40); hs.add(r);
  })();
  let hModel = null, hIdx = clamp(save.last || 0, 0, G.AIRCRAFT.length - 1), hAng = 0.7, hPitch = 0.22, hDrag = false, hZoom = 1;
  g.hView = (a, p, z) => { hAng = a; hPitch = p; hZoom = z || 1; };

  function resize() {
    const W = g.W = window.innerWidth, H = g.H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(W, H, false); camera.aspect = hcam.aspect = W / H; camera.updateProjectionMatrix(); hcam.updateProjectionMatrix();
    hudC.width = W * dpr; hudC.height = H * dpr; g.hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hudC.style.filter = 'drop-shadow(0 0 ' + (1.5 / dpr).toFixed(2) + 'px rgba(0,0,0,0.7))';
  }
  window.addEventListener('resize', resize); resize();

  function gpuName() {
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unknown'; } catch (e) { return 'Unknown'; }
  }
  // pick the starting rung for Auto from what the browser says about the device
  function autoStart() {
    if (gfx.autoLvl >= 0 && gfx.autoLvl < LADDER.length) return gfx.autoLvl; // what worked last time
    const gpu = gpuName(), cores = nav.hardwareConcurrency || 4, mem = nav.deviceMemory || 4;
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 5;
    if (isMobile) return /Apple/i.test(gpu) ? 2 : cores >= 8 && mem >= 6 ? 3 : 4;
    if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc\(tm\) a|apple m/i.test(gpu)) return 0;
    if (/intel|uhd|iris|mali|adreno|powervr/i.test(gpu)) return cores >= 8 ? 2 : 3;
    return cores >= 8 ? 1 : 2;
  }
  function applyGfx() {
    const E = eff();
    if (Math.abs(renderer.getPixelRatio() - pxRatio()) > 1e-3) renderer.setPixelRatio(pxRatio());
    resize();
    sun.castShadow = !!E.shadows;
    g.fogBase = 0.000042 * clamp(46 / E.view, 0.6, 1.7);
    if (g.world) { g.world.cullDist = E.view * 1000; if (g.world.seaU) g.world.seaU.amp.value = E.sea ? 1 : 0; }
    if (G.fx) G.fx.quality = E.fx;
    $('fps').classList.toggle('hidden', !gfx.showFps);
  }
  function syncGfxUI() {
    const E = eff();
    $('gPreset').value = gfx.preset; $('gScale').value = Math.round(E.scale * 100); $('gScaleV').textContent = Math.round(E.scale * 100) + '%';
    $('gView').value = E.view; $('gViewV').textContent = E.view + ' km'; $('gFx').value = Math.round(E.fx * 100); $('gFxV').textContent = Math.round(E.fx * 100) + '%';
    $('gShadows').checked = E.shadows; $('gSea').checked = E.sea; $('gAA').checked = bootGfx.aa && useAA();
    $('gAuto').textContent = isAuto() ? 'Auto is holding ' + Math.min(60, gfx.fpsCap || 60) + ' FPS by adjusting resolution and detail. Now on step ' + (auto.lvl + 1) + ' of ' + LADDER.length + (auto.lvl ? '' : ' (full detail)') + '. Moving any slider below switches to Custom.' : 'Fixed settings. Choose Auto to let the game adjust itself to this device.'; $('gFpsCap').value = String(gfx.fpsCap); $('gShowFps').checked = gfx.showFps; $('gPower').value = gfx.power;
    $('gGpu').textContent = gpuName();
    $('gReload').classList.toggle('hidden', useAA() === bootGfx.aa && gfx.power === bootGfx.power);
    const px = renderer.getDrawingBufferSize(new T.Vector2()); $('gRes').textContent = px.x + ' × ' + px.y + ' pixels';
  }
  function setGfx(k, v, custom) { if ((custom || k === 'aa') && isAuto()) { Object.assign(gfx, LADDER[auto.lvl], { aa: bootGfx.aa }); gfx.preset = 'custom'; } gfx[k] = v; if (custom) gfx.preset = 'custom'; saveGfx(); applyGfx(); syncGfxUI(); }
  $('gPreset').onchange = (e) => { const p = PRESETS[e.target.value]; if (p) Object.assign(gfx, p); gfx.preset = e.target.value; if (isAuto()) { auto.lvl = autoStart(); auto.wait = 3; auto.low = auto.ok = 0; } saveGfx(); applyGfx(); syncGfxUI(); };
  $('gScale').oninput = (e) => setGfx('scale', +e.target.value / 100, true);
  $('gView').oninput = (e) => setGfx('view', +e.target.value, true);
  $('gFx').oninput = (e) => setGfx('fx', +e.target.value / 100, true);
  $('gShadows').onchange = (e) => setGfx('shadows', e.target.checked, true);
  $('gSea').onchange = (e) => setGfx('sea', e.target.checked, true);
  $('gAA').onchange = (e) => setGfx('aa', e.target.checked);
  $('gFpsCap').onchange = (e) => setGfx('fpsCap', +e.target.value);
  $('gShowFps').onchange = (e) => setGfx('showFps', e.target.checked);
  $('gPower').onchange = (e) => setGfx('power', e.target.value);
  $('gReload').onclick = () => location.reload();
  const openSettings = () => { syncGfxUI(); $('settings').classList.remove('hidden'); };
  $('btnSettings').onclick = openSettings; $('btnSettings2').onclick = openSettings;
  $('btnSettingsClose').onclick = () => $('settings').classList.add('hidden');

  // ---------- UI helpers
  function msg(text, cls) {
    const d = document.createElement('div'); d.className = 'msg ' + (cls || ''); d.textContent = text; $('msgs').prepend(d);
    setTimeout(() => d.classList.add('out'), 3200); setTimeout(() => d.remove(), 4000);
    while ($('msgs').children.length > 6) $('msgs').lastChild.remove();
  }
  function refreshMoney() { $('money').textContent = G.money(save.money); $('sortie').textContent = g.state === 'fly' || g.state === 'dead' ? 'Sortie ' + G.money(g.sortie || 0) : ''; }
  function earn(n, text) {
    if (!n) return; save.money = Math.max(0, save.money + n); g.sortie = (g.sortie || 0) + n; persist(); refreshMoney();
    msg((n > 0 ? '+' : '−') + G.money(Math.abs(n)) + '  ' + text, n > 0 ? 'cash' : 'bad'); if (n > 0) G.audio.cash();
  }

  function showHangarAircraft() {
    const s = G.AIRCRAFT[hIdx];
    buildHangarModel(); paintUI();
    $('hName').textContent = s.name; $('hRole').textContent = s.role + ' · ' + s.origin; $('hStats').textContent = s.stats;
    const tw = (s.thrustAB || s.thrustDry) / (s.mass * 9.81);
    const bars = [['Top speed', s.machLimit / 2.35, 'Mach ' + s.machLimit], ['Thrust / weight', tw / 1.25, tw.toFixed(2)], ['Agility', s.rollRate / 4.2 * 0.6 + s.maxG / 9 * 0.4, s.maxG + ' g'],
      ['Mass', s.mass / 150000, (s.mass / 1000).toFixed(1) + ' t'], ['Wingspan', s.span / 52.4, s.span.toFixed(1) + ' m']];
    $('hBars').innerHTML = bars.map((b) => `<div class="bar"><span>${b[0]}</span><i><b style="width:${clamp(b[1], 0.03, 1) * 100}%"></b></i><em>${b[2]}</em></div>`).join('');
    $('hWeapons').innerHTML = s.weapons.length ? s.weapons.map((w) => `<li>${w.count} × ${G.WEAPONS[w.type].name}</li>`).join('') + (s.flares ? `<li>${s.flares} × flares</li>` : '') : s.id === 'an225' ? '<li>Unarmed — 250 t of cargo; earns money by landing safely</li>' : s.id === 'sr71' ? '<li>Unarmed reconnaissance — outruns what it cannot fight</li><li>' + s.flares + ' × flares</li>' : '<li>Unarmed — earns money by landing safely</li>';
    const own = owns(s.id);
    $('hPrice').textContent = own ? 'In your hangar' : 'Price ' + G.money(s.price);
    $('btnBuy').style.display = own ? 'none' : ''; $('btnBuy').disabled = save.money < s.price;
    $('btnBuy').textContent = save.money < s.price ? 'Need ' + G.money(s.price - save.money) + ' more' : 'Buy for ' + G.money(s.price);
    $('hCount').textContent = (hIdx + 1) + ' / ' + G.AIRCRAFT.length;
    save.last = hIdx; persist(); refreshMoney(); modeUI();
  }
  function buildHangarModel() {
    const s = G.AIRCRAFT[hIdx];
    if (hModel) hs.remove(hModel);
    hModel = G.buildAircraft(s, { noCockpit: true, detail: true, paint: paintOf(s.id) }); hModel.position.y = s.gearH; if (s.rocket) { hModel.rotation.x = Math.PI / 2; hModel.scale.setScalar(0.8); hModel.position.y = s.gearH * 0.8; } hs.add(hModel);
    hTest = -1; g.hModel = hModel;
  }
  // paint shop: scheme, custom colours and pattern, finish, canopy tint (airliner: livery only)
  const opts = (list, sel) => list.map((o) => `<option value="${o[0]}"${String(o[0]) === String(sel) ? ' selected' : ''}>${o[1]}</option>`).join('');
  function paintUI() {
    const s = G.AIRCRAFT[hIdx], p = paintOf(s.id), air = s.id === 'a320';
    const noPaint = !!s.rocket || (s.civil && s.id !== 'a320'); // civil types other than the airliner fly in their own colours
    $('paintBox').classList.toggle('hidden', noPaint);
    if (noPaint) return;
    const sc = air ? null : (G.PAINTS.find((q) => q.id === p.scheme) || G.PAINTS[0]);
    $('pScheme').innerHTML = air ? opts(G.LIVERIES.map((n, i) => [i, n + ' livery']), p.livery || 0) : opts(G.PAINTS.map((q) => [q.id, q.name]), sc.id);
    $('pCustom').classList.toggle('hidden', air || sc.id !== 'custom');
    $('pFinishRow').classList.toggle('hidden', air); $('pGlassRow').classList.toggle('hidden', air);
    $('pPat').innerHTML = opts(G.PATTERNS, p.pat || 'solid'); $('pC1').value = p.c1 || '#7c858e'; $('pC2').value = p.c2 || '#3f4a55';
    $('pFinish').innerHTML = opts(G.FINISHES, p.finish || 'std'); $('pGlass').innerHTML = opts(G.GLASSES, p.glass || 'def');
    const cols = air ? [] : sc.id === 'custom' ? ((p.pat || 'solid') === 'solid' ? [p.c1 || '#7c858e'] : [p.c1 || '#7c858e', p.c2 || '#3f4a55']) : (sc.cols || []);
    $('pSw').innerHTML = cols.map((c) => `<i style="background:${c}"></i>`).join('') + (cols.length ? `<span>${sc.id === 'custom' ? (G.PATTERNS.find((q) => q[0] === (p.pat || 'solid')) || [0, ''])[1] : ({ solid: 'Solid colour', blotch: 'Blotch camouflage', splinter: 'Splinter camouflage', digital: 'Digital camouflage', stripes: 'Stripe camouflage' })[sc.pat]}</span>` : (air ? '' : '<span>Original service colours</span>'));
  }
  function setPaint(k, v) {
    const id = G.AIRCRAFT[hIdx].id; save.paint[id] = Object.assign({}, save.paint[id]); save.paint[id][k] = v; persist(); buildHangarModel(); paintUI();
  }
  let hTest = -1;
  function toHangar() {
    g.state = 'hangar'; if (document.pointerLockElement) document.exitPointerLock();
    ['pause', 'summary', 'help'].forEach((id) => $(id).classList.add('hidden'));
    $('hangar').classList.remove('hidden'); $('flightUI').classList.add('hidden'); g.hctx.clearRect(0, 0, g.W, g.H);
    G.audio.silence(); $('objective').classList.add('hidden'); showHangarAircraft();
  }

  // ---------- flight setup
  function startFlight(air, quiet) {
    const s = g.spec = G.AIRCRAFT[hIdx];
    G.audio.init(); G.audio.setAircraft(s);
    if (g.model) scene.remove(g.model);
    g.model = G.buildAircraft(s, { paint: paintOf(s.id) }); scene.add(g.model);
    g.flight = s.rocket ? new G.RocketFlight(s) : new G.Flight(s);
    if (s.rocket) air = false;
    const ct = g.targetCity = g.forceCity || G.CITIES[save.startCity] || G.CITIES[0]; g.forceCity = null;
    g.defence = g.mode === 'free' ? save.defence : g.mode === 'rush' ? save.rDef : false;
    if (air) g.flight.reset(new V3(ct.x, 1800, ct.z + (ct.rz || ct.r) + 7000), 0, Math.min(230, s.machLimit * 300));
    const apIdx = g.forceAp != null ? g.forceAp : save.startAp; g.forceAp = null;
    let ap = g.homeAp = G.AIRPORTS[apIdx] || G.AIRPORTS[0];
    const CV = G.CARRIER; let fromCarrier = !air && apIdx === G.AIRPORTS.length;
    if (s.rocket) fromCarrier = false;
    if (fromCarrier && s.span > 22) { fromCarrier = false; g.tooBig = true; } else g.tooBig = false;
    g.cat = fromCarrier;
    if (fromCarrier) { ap = g.homeAp = CV; g.flight.reset(new V3(CV.x - 4, CV.deckY + s.gearH, CV.z - 30), 0, 0); }
    else if (s.rocket) { ap = g.homeAp = G.PAD; g.flight.reset(new V3(G.PAD.x, s.gearH, G.PAD.z)); g.spaceDone = false; g.moonNear = false; g.moonLanded = false; }
    else if (!air) g.flight.reset(new V3(ap.x, s.gearH, ap.z + 1650), 0, 0);
    g.ammo = s.weapons.map((w) => ({ def: G.WEAPONS[w.type], count: w.count, max: w.count })); g.weaponIdx = 0; g.flares = s.flares;
    g.state = 'fly'; g.time = 0; g.sortie = 0; g.hasFlown = !!air; g.view = 0; g.camYaw = 0; g.camPitch = 0; g.zoom = 1; g.dropT = 0; g.flareT = 0; g.passT = 0; g.deadT = 0;
    g.gearPrev = g.flight.gear; g.flapPrev = g.flight.flaps; g.flapSet = g.flight.flapsTarget; g.hotBrakes = false; g.flapOverMsg = false; g.gearMove = g.flapMove = false; g.bump = 0; g.buffet = 0; g.headY = 0; g.gearWarn = false; g.squealT = 0;
    g.deadCam = null; g.hasFlownMission = false; $('btnAgain').textContent = 'Fly again'; g.helpHidden = false; g.camFwd = new V3(0, 0, -1); g.model.visible = true; g.shock = null; g.samGrace = 25;
    g.missiles.forEach((m) => scene.remove(m.mesh)); g.missiles.length = 0;
    clearMission(); g.diff = diffFor(curLevel()); g.flakT = 3; g.flakBursts = [];
    $('hangar').classList.add('hidden'); $('summary').classList.add('hidden'); $('pause').classList.add('hidden'); $('flightUI').classList.remove('hidden');
    refreshMoney();
    if (!quiet) msg(s.name + (air ? ' — air start, ' + ct.name + ' is 7 km ahead' : (s.rocket ? ' — on the pad at the Space Center. Hold Shift to ignite; the Moon is high to the north-east' : fromCarrier ? ' — on the catapult. Full throttle to launch' : ' — cleared for take-off, ' + ap.name + ' runway 36')), '');
    if (g.tooBig) msg(s.name + ' is too large for the carrier — starting at ' + ap.name, 'bad');
    if (g.mode === 'free' && !g.defence && !s.civil) msg('City air defence is switched off', '');
    if (!air) $('help').classList.remove('hidden');
  }
  g.assistLevel = () => save.assist;
  g.currentWeapon = () => (g.ammo && g.ammo.length ? g.ammo[g.weaponIdx] : null);
  g.ammoCount = () => { const w = g.currentWeapon(); return w ? w.count : 0; };

  // ---------- input
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'PageUp', 'PageDown'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.repeat) return; keys[e.code] = true;
    if (g.state === 'hangar') {
      if (e.code === 'ArrowLeft') $('btnPrev').click(); if (e.code === 'ArrowRight') $('btnNext').click(); if (e.code === 'Enter' && !$('btnStart').disabled && !(e.target && /^(SELECT|BUTTON|INPUT|SUMMARY)$/.test(e.target.tagName))) $('btnStart').click();
      const mi = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (mi >= 0) setMode(MODES[mi]);
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (g.state === 'fly') { g.state = 'pause'; $('pause').classList.remove('hidden'); G.audio.silence(); if (document.pointerLockElement) document.exitPointerLock(); } else if (g.state === 'pause') resume(); return; }
    if (e.code === 'KeyM') msg(G.audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (e.code === 'KeyH') $('help').classList.toggle('hidden');
    if (g.state !== 'fly') return;
    const f = g.flight;
    if (e.code === 'KeyG') { if (f.onGround) msg('Gear stays down on the ground'); else if (!g.spec.rocket) { f.gearTarget = f.gearTarget ? 0 : 1; G.audio.clunk(); msg('Gear ' + (f.gearTarget ? 'coming down' : 'retracting') + (f.gearTarget && f.ias * G.KTS > f.vle ? ' — above the ' + f.vle + ' kt gear limit' : ''), f.gearTarget && f.ias * G.KTS > f.vle ? 'bad' : ''); } }
    if (e.code === 'KeyF' && !g.spec.rocket) { // three flap settings: up -> take-off -> landing
      f.flapsTarget = f.flapsTarget >= 1 ? 0 : f.flapsTarget + 0.5;
      if (f.flapsTarget > 0 && f.ias * G.KTS > f.vfe * 1.12) { f.flapsTarget = 0; msg('Too fast for flaps — slow below ' + f.vfe + ' kt', 'bad'); }
      else msg('Flaps ' + (f.flapsTarget >= 1 ? 'full — landing' : f.flapsTarget > 0 ? 'half — take-off' : 'up'));
    }
    if (e.code === 'KeyV') { g.view = 1 - g.view; g.camYaw = 0; g.camPitch = 0; }
    if (e.code === 'KeyX' && g.ammo.length) { g.weaponIdx = (g.weaponIdx + 1) % g.ammo.length; msg('Selected ' + g.currentWeapon().def.name); G.audio.beep(900, 0.05, 0.1); }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyN') g.mapRange = g.mapRange === 6000 ? 12000 : g.mapRange === 12000 ? 30000 : g.mapRange === 30000 ? 60000 : 6000;
    if (e.code === 'Home') { g.camYaw = 0; g.camPitch = 0; }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let mouseDown = false;
  hudC.addEventListener('mousedown', (e) => {
    if (g.state === 'hangar') { hDrag = true; return; }
    if (e.button === 2) { g.camYaw = 0; g.camPitch = 0; return; }
    mouseDown = true; if (g.state === 'fly' && !document.pointerLockElement && hudC.requestPointerLock) { try { const p = hudC.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ } }
  });
  window.addEventListener('mouseup', () => { mouseDown = false; hDrag = false; });
  hudC.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (g.state === 'hangar') { if (hDrag) { hAng -= e.movementX * 0.006; hPitch = clamp(hPitch + e.movementY * 0.004, -0.12, 1.1); } return; }
    if (g.state !== 'fly' && g.state !== 'dead') return;
    if (document.pointerLockElement === hudC || mouseDown) {
      g.camYaw -= e.movementX * 0.0032; g.camPitch = clamp(g.camPitch - e.movementY * 0.0032, -1.45, 1.45);
      if (g.view === 1) g.camYaw = clamp(g.camYaw, -2.7, 2.7);
    }
  });
  window.addEventListener('wheel', (e) => { if (g.state === 'hangar') { if (!e.target.closest || !e.target.closest('.card')) hZoom = clamp(hZoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.35, 1.5); return; } g.zoom = clamp((g.zoom || 1) * (e.deltaY > 0 ? 1.12 : 0.89), 0.45, 4); }, { passive: true });
  function resume() { g.state = 'fly'; $('pause').classList.add('hidden'); }

  $('btnPrev').onclick = () => { hIdx = (hIdx + G.AIRCRAFT.length - 1) % G.AIRCRAFT.length; showHangarAircraft(); };
  $('btnNext').onclick = () => { hIdx = (hIdx + 1) % G.AIRCRAFT.length; showHangarAircraft(); };
  $('btnBuy').onclick = () => { const s = G.AIRCRAFT[hIdx]; if (save.money >= s.price) { save.money -= s.price; save.owned.push(s.id); persist(); G.audio.init(); G.audio.cash(); showHangarAircraft(); } };
  $('pScheme').onchange = (e) => setPaint(G.AIRCRAFT[hIdx].id === 'a320' ? 'livery' : 'scheme', G.AIRCRAFT[hIdx].id === 'a320' ? +e.target.value : e.target.value);
  $('pPat').onchange = (e) => setPaint('pat', e.target.value);
  $('pC1').onchange = (e) => setPaint('c1', e.target.value); $('pC2').onchange = (e) => setPaint('c2', e.target.value);
  $('pFinish').onchange = (e) => setPaint('finish', e.target.value); $('pGlass').onchange = (e) => setPaint('glass', e.target.value);
  $('btnTest').onclick = () => { hTest = 0; };
  $('sandbox').onchange = (e) => { save.sandbox = e.target.checked; persist(); showHangarAircraft(); };
  $('defence').onchange = (e) => { save.defence = e.target.checked; persist(); modeUI(); };
  $('startAp').innerHTML = G.AIRPORTS.map((a, i) => `<option value="${i}">${a.name}</option>`).join('') + `<option value="${G.AIRPORTS.length}">${G.CARRIER.name} (at sea)</option>`;
  $('startAp').onchange = (e) => { save.startAp = +e.target.value; persist(); modeUI(); };
  $('startCity').innerHTML = G.CITIES.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
  $('startCity').onchange = (e) => { save.startCity = +e.target.value; persist(); modeUI(); };
  G.onCrush = (res) => earn(Math.round(res.money / 100) * 100, (res.destroyed ? res.destroyed + ' crushed' : 'damage') + ' by a falling tower');
  $('btnResume').onclick = resume; $('btnHangar').onclick = toHangar; $('btnSumHangar').onclick = toHangar; $('btnAgain').onclick = () => restart(); $('btnRestart').onclick = () => restart();
  $('btnResetCity').onclick = () => location.reload();
  // ---------- game modes and the hangar menu
  const MODES = ['free', 'mission', 'rush', 'landing'], MODE_NAMES = { free: 'Free flight', mission: 'Strike mission', rush: 'Demolition rush', landing: 'Landing challenge' };
  const fmtT = (t) => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const missionCities = (L, n) => { const e = enemyCities(), i0 = save.mTarget >= 0 && e[save.mTarget] ? save.mTarget : (L + 2) % e.length, out = []; for (let i = 0; i < clamp(n, 1, e.length); i++) out.push(e[(i0 + i) % e.length]); return out; };
  const landSites = () => G.AIRPORTS.map((a) => a.name).concat([G.CARRIER.name + ' (at sea)']);
  function setMode(md) { if (MODES.indexOf(md) < 0) return; save.mode = md; persist(); modeUI(); }
  function modeUI() {
    const s = G.AIRCRAFT[hIdx], own = owns(s.id), md = MODES.indexOf(save.mode) >= 0 ? save.mode : 'free', e = enemyCities();
    document.querySelectorAll('.mode').forEach((b) => { const on = b.dataset.mode === md; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    document.querySelectorAll('.opts').forEach((o) => o.classList.toggle('on', o.dataset.for === md));
    $('sandbox').checked = save.sandbox;
    $('freeStart').value = save.freeStart; $('rowAp').classList.toggle('hidden', save.freeStart === 'air'); $('rowCity').classList.toggle('hidden', save.freeStart !== 'air');
    $('defence').checked = save.defence; $('startAp').value = String(save.startAp); $('startCity').value = String(save.startCity);
    $('mCities').innerHTML = e.map((c, i) => `<option value="${i + 1}">${i + 1} ${i ? 'cities' : 'city'}</option>`).join(''); $('mCities').value = String(clamp(save.mCities, 1, e.length));
    $('mLevel').innerHTML = `<option value="0">Auto — next is level ${clamp(save.mLevel, 1, 10)}</option>` + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => `<option value="${l}">Level ${l} — ${LEVEL_NAMES[l]}</option>`).join('');
    $('mLevel').value = String(save.mLevelSel);
    $('mTarget').innerHTML = '<option value="-1">Auto</option>' + e.map((c, i) => `<option value="${i}">${c.name}</option>`).join(''); $('mTarget').value = String(save.mTarget);
    $('mAssist').value = String(save.assist); $('mFlares').checked = save.flareRefill;
    $('rTime').value = String(save.rTime); $('rCity').innerHTML = e.map((c, i) => `<option value="${i}">${c.name}</option>`).join(''); $('rCity').value = String(save.rCity); $('rDef').checked = save.rDef;
    $('lWhere').innerHTML = landSites().map((n, i) => `<option value="${i}">${n}</option>`).join(''); $('lWhere').value = String(save.lWhere); $('lDist').value = String(save.lDist);
    let brief = '', best = '', why = '';
    if (md === 'free') {
      brief = save.freeStart === 'air' ? `Start in the air 7 km from ${(G.CITIES[save.startCity] || G.CITIES[0]).name}.` : `Take off from ${landSites()[save.startAp] || landSites()[0]}.`;
      brief += ' No objectives: explore, bomb, land where you like. ' + (save.defence ? 'Missile sites will shoot at armed aircraft.' : 'Air defence is off.');
    } else if (md === 'mission') {
      const L = curLevel(), d = diffFor(L), cs = missionCities(L, save.mCities), n = cs.length;
      brief = `Level ${L} (${LEVEL_NAMES[L]}): destroy ${d.sites} defence sites around ${cs.map((c) => c.name).join(', then ')}. ` + (n > 1 ? 'After each city, land at the airfield you are given to refuel and rearm. ' : 'Then land at the airfield you are given. ') +
        `The clock runs the whole time. Up to ${d.maxMsl} missile${d.maxMsl > 1 ? 's' : ''} in the air${d.flak ? ', plus anti-aircraft guns' : ''}. Reward ${G.money(d.reward * n)}.`;
      const bt = save.best['m' + L + 'x' + n]; best = bt ? 'Best time ' + fmtT(bt) : '';
    } else if (md === 'rush') {
      brief = `Air start next to ${(e[save.rCity] || e[0]).name} with ${save.rTime / 60} minutes on the clock. Every building you destroy adds to your score; bombs are reloaded when you run out. ` + (save.rDef ? 'The city shoots back.' : 'Air defence is off.');
      const bs = save.best['r' + save.rTime]; best = bs ? 'Best score ' + G.money(bs) : '';
    } else {
      brief = `Start lined up ${save.lDist / 1000} km out from ${landSites()[save.lWhere]}. Lower the gear and flaps, touch down softly on the centreline near the touchdown zone, then stop. You are graded out of 100.`;
      const bl = save.best['l' + save.lWhere]; best = bl ? 'Best landing ' + bl + ' / 100' : '';
    }
    if (!own) why = 'Buy this aircraft first, or switch on Sandbox';
    else if (s.rocket && md !== 'free') why = 'The rocket only flies in Free flight';
    else if ((md === 'mission' || md === 'rush') && (s.civil || !s.weapons.length)) why = 'This mode needs an armed aircraft';
    else if (md === 'landing' && save.lWhere === G.AIRPORTS.length && s.span > 22) why = 'This aircraft is too large for the carrier';
    $('mBrief').textContent = brief; $('modeBest').textContent = best;
    $('btnStart').disabled = !!why; $('startNote').textContent = why; $('btnStart').textContent = 'Start — ' + MODE_NAMES[md];
  }
  document.querySelectorAll('.mode').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  const bind = (id, key, num, chk) => { $(id).onchange = (e) => { save[key] = chk ? e.target.checked : num ? +e.target.value : e.target.value; persist(); modeUI(); }; };
  bind('freeStart', 'freeStart'); bind('mCities', 'mCities', true); bind('mLevel', 'mLevelSel', true); bind('mTarget', 'mTarget', true); bind('mAssist', 'assist', true); bind('mFlares', 'flareRefill', false, true);
  bind('rTime', 'rTime', true); bind('rCity', 'rCity', true); bind('rDef', 'rDef', false, true); bind('lWhere', 'lWhere', true); bind('lDist', 'lDist', true);
  function startGame(md) {
    if (g.state === 'hangar' && $('btnStart').disabled) return;
    g.mode = md;
    if (md === 'mission') startMission(); else if (md === 'rush') startRush(); else if (md === 'landing') startLanding(); else startFlight(save.freeStart === 'air');
  }
  function restart() { startGame(g.mode || 'free'); }
  $('btnStart').onclick = () => startGame(save.mode);
  // show the end-of-round summary
  function endRound(title, text, again) {
    g.state = 'pause'; G.audio.silence(); if (document.pointerLockElement) document.exitPointerLock();
    $('objective').classList.add('hidden'); $('sumTitle').textContent = title; $('sumText').textContent = text; $('btnAgain').textContent = again || 'Play again'; $('summary').classList.remove('hidden');
  }
  const newBest = (key, v, lower) => { const o = save.best[key]; if (o == null || (lower ? v < o : v > o)) { save.best[key] = v; persist(); return true; } return false; };
  $('btnHelpClose').onclick = () => $('help').classList.add('hidden');

  // ---------- temp vectors
  const _a = new V3(), _b = new V3(), _c = new V3(), _fwd = new V3(), _up = new V3(), _right = new V3(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ');
  const X = new V3(1, 0, 0), Y = new V3(0, 1, 0);

  // ---------- weapons
  function dropBomb() {
    const w = g.currentWeapon(), f = g.flight; if (!w || w.count <= 0 || f.onGround) return;
    w.count--; g.dropT = w.def.nuke ? 1.2 : 0.16;
    const mesh = G.buildBomb(w.def); scene.add(mesh);
    const side = (w.count % 2 ? 1 : -1) * Math.min(g.spec.span * 0.12, 2.5);
    const pos = new V3(side, -1.4, 0).applyQuaternion(f.q).add(f.pos);
    const vel = f.vel.clone().addScaledVector(_up.set(0, 1, 0).applyQuaternion(f.q), -4);
    g.bombs.push({ mesh, pos, vel, def: w.def, t: 0 }); G.audio.release();
    if (w.def.nuke) msg('Special weapon released — turn away and climb', 'bad');
  }
  function detonate(b, p) {
    const d = camera.position.distanceTo(p), pd = g.flight.pos.distanceTo(p), R = b.def.radius;
    let res;
    if (b.def.nuke) {
      G.fx.megaBlast(p, R, camera.position); G.audio.megaBlast(d);
      res = g.world.blast(p, R, b.def.power, (dist) => dist / 450 + Math.random() * 0.8);
      if (pd < R * 2.6) g.shock = { t: pd / 450, dmg: pd < R * 1.3 ? 200 : 70 };
    } else {
      G.fx.explosion(p, R, camera.position); G.audio.explosion(d, R / 50);
      res = g.world.blast(p, R, b.def.power);
      if (pd < R * 0.7 && g.state === 'fly') hurt(90 * (1 - pd / (R * 0.7)), 'Caught in your own blast');
      if (pd < R * 4 && g.state === 'fly' && !g.flight.onGround) { // pressure wave shoves the aircraft
        const k = 30 * (1 - pd / (R * 4)) * Math.min(1, 15000 / g.spec.mass + 0.3); _c.copy(g.flight.pos).sub(p).normalize(); g.flight.vel.addScaledVector(_c, k); g.flight.w.x += (Math.random() - 0.5) * k * 0.03; g.flight.w.z += (Math.random() - 0.5) * k * 0.06; G.fx.shake = Math.max(G.fx.shake, k / 25);
      }
    }
    hitSubs(p, R);
    if (res.penalty) earn(-res.penalty, 'You hit your own base');
    if (res.money) {
      const mult = b.def.nuke ? 0.04 : Math.min(2.5, 1 + 0.06 * Math.max(0, res.destroyed - 1));
      const txt = res.destroyed ? res.destroyed + (res.destroyed === 1 ? ' building' : ' buildings') + ' destroyed' + (mult > 1.01 ? '  ×' + mult.toFixed(2) + ' combo' : '') : res.damaged + ' damaged';
      earn(Math.round(res.money * mult * (b.ally ? 0.3 : 1) / 100) * 100, txt + (b.ally ? ' by your wingman' : ''));
      if (!b.ally && save.flareRefill && g.spec.flares && res.names.indexOf('SAM site') >= 0 && g.flares < g.spec.flares) { g.flares = g.spec.flares; msg('Flares refilled', ''); }
      res.names.slice(0, 3).forEach((n) => msg(n + ' destroyed', 'big'));
    } else if (!res.penalty && !(g.subs || []).some((s) => !s.alive && s.m.position.distanceTo(p) < Math.max(80, R))) msg('No effect on target', '');
  }
  function updateBombs(dt) {
    for (let i = g.bombs.length - 1; i >= 0; i--) {
      const b = g.bombs[i]; b.t += dt;
      const sp = b.vel.length(), k = b.ally ? 0 : 0.00005 * sp;
      b.vel.x -= b.vel.x * k * dt; b.vel.y -= (9.81 + b.vel.y * k) * dt; b.vel.z -= b.vel.z * k * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos); _a.copy(b.pos).add(b.vel); b.mesh.lookAt(_a); b.mesh.rotateY(Math.PI);
      const gh = g.world.groundHeight(b.pos.x, b.pos.z);
      if (b.pos.y <= gh || (b.t > 0.5 && g.world.collide(b.pos, 1.5))) {
        if (b.pos.y < gh) b.pos.y = gh;
        scene.remove(b.mesh); g.bombs.splice(i, 1); detonate(b, b.pos);
      }
    }
  }
  function predictImpact() {
    const f = g.flight; if (f.onGround || !g.ammoCount()) { g.impact = null; return; }
    const p = _a.copy(f.pos), v = _b.copy(f.vel); p.y -= 1.4; let t = 0; const dt = 0.1;
    while (t < 80) {
      const k = 0.00005 * v.length(); v.x -= v.x * k * dt; v.y -= (9.81 + v.y * k) * dt; v.z -= v.z * k * dt; p.addScaledVector(v, dt); t += dt;
      if (p.y <= g.world.groundHeight(p.x, p.z)) break;
    }
    if (!g.impact) g.impact = new V3(); g.impact.copy(p); g.impactT = t;
  }
  function hurt(dmg, reason) {
    const f = g.flight; f.health -= dmg; G.fx.shake = Math.max(G.fx.shake, 1);
    if (f.health <= 0) f.crash(reason); else msg('Aircraft damaged — hull ' + Math.round(f.health) + '%', 'bad');
  }

  // ---------- flares & missile threats
  function popFlare() {
    if (g.flares <= 0) return; g.flares--; g.flareT = 0.25; G.audio.pop();
    const f = g.flight, pos = f.pos.clone(), vel = f.vel.clone().multiplyScalar(0.7).addScaledVector(_up.set(0, 1, 0).applyQuaternion(f.q), -18).addScaledVector(_right.set(1, 0, 0).applyQuaternion(f.q), (g.flares % 2 ? 1 : -1) * 14);
    const fl = { pos, vel, t: 0 }; g.flareObjs.push(fl);
    g.missiles.forEach((m) => { if (!m.decoy && Math.random() < g.diff.decoy) { m.decoy = fl; } });
  }
  function launchMissile(site) {
    const mesh = G.buildMissile(); scene.add(mesh);
    const pos = new V3(site.x, site.y, site.z), dir = _a.copy(g.flight.pos).sub(pos).normalize(); dir.y = Math.max(dir.y, 0.5); dir.normalize();
    g.missiles.push({ mesh, pos, dir: dir.clone(), speed: 80, t: 0, dist: 1e9, minDist: 1e9, away: 0, decoy: null });
    msg('Missile launch detected', 'bad'); G.audio.whoosh();
    G.fx.explosion({ x: site.x, y: 4, z: site.z }, 12, camera.position);
  }
  function updateThreats(dt) {
    const f = g.flight, w = g.world;
    g.locked = false; g.samGrace -= dt; g.flakT -= dt;
    for (let i = g.flakBursts.length - 1; i >= 0; i--) {
      const fb = g.flakBursts[i]; fb.t -= dt; if (fb.t > 0) continue;
      g.flakBursts.splice(i, 1); G.fx.flak(fb.p); const dd = fb.p.distanceTo(f.pos); G.audio.explosion(camera.position.distanceTo(fb.p), 0.3);
      if (dd < 120) G.fx.shake = Math.max(G.fx.shake, 0.5 * (1 - dd / 120));
      if (dd < 42 && g.state === 'fly') hurt(6 + Math.random() * 9, 'Shot down by anti-aircraft fire');
    }
    const D = g.diff, mc = g.mission ? g.mission.city.name : null;
    if (!g.spec.civil && g.state === 'fly') {
      w.sams.forEach((s) => {
        if (!s.alive || !(g.defence || s.city === mc)) return;
        const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
        if (d < D.range && f.agl > 70 && !f.onGround) {
          g.locked = true; s.cool -= dt;
          if (s.cool <= 0 && g.missiles.length < D.maxMsl && g.samGrace < 0) { s.cool = D.cool * (0.75 + Math.random() * 0.6); launchMissile(s); }
          if (D.flak && d < 4200 && f.pos.y < 3600 && g.flakT <= 0) { // anti-aircraft guns lead the target
            g.flakT = D.flakRate * (0.6 + Math.random() * 0.8); const tt = Math.hypot(d, f.pos.y) / 760;
            g.flakBursts.push({ t: tt, p: new V3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(D.flakErr).add(f.pos).addScaledVector(f.vel, tt) });
          }
        }
      });
    }
    for (let i = g.flareObjs.length - 1; i >= 0; i--) {
      const fl = g.flareObjs[i]; fl.t += dt; fl.vel.multiplyScalar(Math.exp(-1.2 * dt)); fl.vel.y -= 9.8 * dt; fl.pos.addScaledVector(fl.vel, dt);
      G.fx.fire.spawn(fl.pos.x, fl.pos.y, fl.pos.z, 0, 0, 0, 0.35, 5, 2, 1, 0.9, 0.7, 1, 0, 0);
      if (Math.random() < 0.5) G.fx.trail(fl.pos.x, fl.pos.y, fl.pos.z, 1.5, 0.3, 2.5);
      if (fl.t > 4.5) g.flareObjs.splice(i, 1);
    }
    for (let i = g.missiles.length - 1; i >= 0; i--) {
      const m = g.missiles[i]; m.t += dt;
      const tp = m.decoy ? m.decoy.pos : f.pos, tv = m.decoy ? m.decoy.vel : f.vel;
      const dist = m.pos.distanceTo(tp);
      if (m.t < 3.5) m.speed = Math.min(g.diff.mslSpeed, m.speed + 300 * dt); else m.speed -= (10 + m.speed * 0.012) * dt;
      _a.copy(tp).addScaledVector(tv, Math.min(dist / Math.max(m.speed, 100), 6) * 0.85).sub(m.pos).normalize();
      const ang = m.dir.angleTo(_a), maxTurn = (m.t < 0.6 ? 0.2 : g.diff.mslG * 9.81 / Math.max(m.speed, 200)) * dt;
      if (ang > 1e-4) { m.dir.lerp(_a, Math.min(1, maxTurn / ang)).normalize(); m.speed -= Math.min(ang, maxTurn) * m.speed * 0.25; }
      m.pos.addScaledVector(m.dir, m.speed * dt);
      m.mesh.position.copy(m.pos); _b.copy(m.pos).add(m.dir); m.mesh.lookAt(_b); m.mesh.rotateY(Math.PI);
      if (m.t < 9) { G.fx.trail(m.pos.x, m.pos.y, m.pos.z, 3, 0.5, 4); G.fx.flame(m.pos.x, m.pos.y, m.pos.z, 4); }
      const pd = m.pos.distanceTo(f.pos); m.dist = pd;
      if (pd < m.minDist) { m.minDist = pd; m.away = 0; } else m.away += dt;
      let end = null;
      if (!m.decoy && pd < 24 && g.state === 'fly') end = 'hit';
      else if (m.decoy && dist < 30) end = 'decoyed';
      else if ((m.away > 0.8 && pd > 140) || m.t > 24 || (m.t > 5 && m.speed < 230) || m.pos.y < w.groundHeight(m.pos.x, m.pos.z) || (m.decoy && m.decoy.t > 4.4)) end = m.decoy ? 'decoyed' : 'evaded';
      if (end) {
        scene.remove(m.mesh); g.missiles.splice(i, 1);
        G.fx.explosion(m.pos, 18, camera.position); G.audio.explosion(camera.position.distanceTo(m.pos), 0.5);
        if (end === 'hit') hurt(60, 'Shot down by a surface-to-air missile');
        else if (g.state === 'fly') earn(end === 'evaded' ? 20000 : 8000, end === 'evaded' ? 'Missile out-maneuvered' : 'Missile decoyed by flares');
      } else if (g.state === 'fly') G.audio.warn('missile', dt, 1 - clamp(pd / 4000, 0, 1));
    }
    if (g.locked && !g.missiles.length && g.state === 'fly') G.audio.warn('lock', dt, 0);
  }

  // ---------- other air traffic: high-altitude routes, city overflights, airport arrivals and departures
  function spawnTraffic() {
    const r = G.rng(555), a320 = G.aircraftById('a320'), CT = G.CITY;
    // traffic never moves its control surfaces, so each one is baked down to a few meshes; only the gear and the flames stay separate
    const bake = (m) => {
      const ud = m.userData, gear = ud.gear && ud.gear.isObject3D ? ud.gear : null; G.flattenModel(m, [gear].concat(ud.flames || [])); if (gear) G.flattenModel(gear, []);
      const nm = G.navMats, nav = [], rest = []; m.traverse((o) => { (o.isMesh && (o.material === nm.red || o.material === nm.green || o.material === nm.white || o.material === nm.beacon) ? nav : rest).push(o); });
      ud.lod = { nav, rest, s: 2 }; return m;
    };
    const add = (spec, cx, cz, R, alt, speed, phase, dir, livery) => {
      const model = bake(G.buildAircraft(spec, { noCockpit: true, livery, lights: true })); if (model.userData.gear) model.userData.gear.visible = false; scene.add(model);
      g.traffic.push({ kind: 'circle', model, spec, cx, cz, R, alt, speed, phase, dir });
    };
    const pair = (id, cx, cz, R, alt, speed, ph, dir) => { const spec = G.aircraftById(id); add(spec, cx, cz, R, alt, speed, ph, dir); add(spec, cx, cz, R + 60, alt - 15, speed * (R + 60) / R, ph - dir * 0.012, dir); };
    for (let i = 0; i < 8; i++) add(a320, r.range(-26000, 3000), r.range(-32000, 2000), r.range(12000, 30000), r.range(2600, 10500), r.range(190, 240), r() * 6.28, r.chance(0.5) ? 1 : -1, i % 5);
    pair('su27', r.range(-20000, 0), r.range(-30000, 0), 7000, 3200, 230, r() * 6.28, 1);
    pair('f22', r.range(-20000, 0), r.range(-30000, 0), 9000, 5200, 240, r() * 6.28, -1);
    // over the city
    add(a320, CT.x, CT.z, 4600, 1400, 150, 0.5, 1, 2); add(a320, CT.x + 500, CT.z, 6200, 2200, 170, 3.4, -1, 4); add(a320, CT.x, CT.z - 400, 3000, 1000, 130, 5, 1, 1);
    pair('f16', CT.x, CT.z, 3300, 820, 190, 2.0, -1); pair('a10', CT.x, CT.z, 4200, 620, 140, 4.2, 1); pair('j20', CT.x, CT.z, 6500, 2600, 230, 1.0, 1); pair('rafale', CT.x, CT.z, 5000, 1700, 210, 5.5, -1);
    add(G.aircraftById('b52'), CT.x - 2000, CT.z + 3000, 16000, 7600, 230, 2.2, 1); add(G.aircraftById('tu160'), -15000, -20000, 22000, 9000, 260, 4.0, -1); pair('mig29', -24000, 4000, 8000, 2800, 220, 0.4, 1); pair('typhoon', -8000, -34000, 8000, 3200, 225, 3.0, -1);
    // airport movements
    const types = [['a320', 'a320', 'a320', 'a320', 'f16', 'a320'], ['typhoon', 'mig29', 'b1', 'f16', 'su27', 'a10'], ['a320', 'rafale', 'b52', 'a320', 'a320', 'f35'],
      ['a320', 'a320', 'a320', 'typhoon', 'a320', 'a320'], ['a320', 'a320', 'f35', 'a320', 'j20', 'a320'], ['a320', 'a320', 'mig29', 'a320', 'su57', 'a320']];
    G.CITIES.forEach((ct, i) => { if (i && !ct.town) { add(a320, ct.x, ct.z, ct.r + 2200, 1500, 150, i, i % 2 ? 1 : -1, i % 5); pair(['typhoon', 'rafale', 'f16', 'mig29', 'su27'][i % 5], ct.x, ct.z, ct.r + 900, 800, 200, i * 1.3, i % 2 ? -1 : 1); } });
    G.AIRPORTS.forEach((ap, i) => {
      (types[i] || ['a320', 'a320']).forEach((id, k) => {
        const spec = G.aircraftById(id), model = bake(G.buildAircraft(spec, { noCockpit: true, lights: true, livery: (i * 3 + k) % 5 })); model.visible = false; scene.add(model);
        g.traffic.push({ kind: 'ap', model, spec, ap, mode: k % 2 === 1 ? 'depart' : 'land', phase: 'wait', wait: 2 + k * 24 + i * 6, s: 0, v: 0, alt: 0, xoff: 0, yaw: 0, pitch: 0 });
      });
    });
  }
  function updateApTraffic(t, dt) {
    const ap = t.ap, sp = t.spec, f = g.flight, m = t.model, vApp = sp.civil ? 72 : 82;
    const playerOnRw = g.state === 'fly' && f.onGround && Math.abs(f.pos.x - ap.x) < 70 && Math.abs(f.pos.z - ap.z) < 1950;
    if (t.phase === 'wait') {
      t.wait -= dt; if (t.wait > 0) return;
      const others = g.traffic.filter((o) => o !== t && o.kind === 'ap' && o.ap === ap && o.phase !== 'wait');
      if (t.mode === 'land') {
        if (others.some((o) => o.mode === 'land' && o.s > 6000)) { t.wait = 12; return; }
        t.phase = 'approach'; t.s = 15000; t.v = vApp * 1.3; t.alt = 800;
      } else {
        if (playerOnRw || others.some((o) => (o.mode === 'land' && o.s < 6000 && o.phase !== 'exit') || (o.mode === 'depart' && o.s > -3500))) { t.wait = 5; return; }
        t.phase = 'roll'; t.s = -90; t.v = 0; t.alt = 0;
      }
      t.xoff = 0; t.yaw = 0; t.pitch = 0; m.visible = true;
    }
    const done = (w) => { t.phase = 'wait'; t.wait = w; m.visible = false; };
    if (t.phase === 'approach') {
      t.v += (vApp - t.v) * Math.min(1, dt * 0.25); t.s -= t.v * dt;
      t.alt = Math.max(0, (t.s + 320) * 0.0524); t.pitch += ((t.alt < 14 ? 0.1 : 0.045) - t.pitch) * Math.min(1, dt * 1.5);
      if (playerOnRw && t.s < 3800 && t.s > -200) t.phase = 'goaround';
      else if (t.s <= -320) { t.phase = 'landroll'; t.alt = 0; for (let i = 0; i < 6; i++) G.fx.smoke.spawn(m.position.x + (Math.random() - 0.5) * 6, 0.6, m.position.z, 0, 2, -t.v * 0.2, 2.2, 2, 13, 0.85, 0.85, 0.85, 0.4, 0.8, 0); }
    } else if (t.phase === 'goaround') {
      t.v += (vApp * 1.3 - t.v) * Math.min(1, dt * 0.3); t.s -= t.v * dt; t.alt += 11 * dt; t.pitch += (0.17 - t.pitch) * Math.min(1, dt);
      if (t.s < -12000) done(40 + Math.random() * 30);
    } else if (t.phase === 'landroll') {
      t.v = Math.max(12, t.v - 2.3 * dt); t.s -= t.v * dt; t.pitch += (0 - t.pitch) * Math.min(1, dt * 1.2);
      if (t.s <= -2350) t.phase = 'exit';
    } else if (t.phase === 'exit') {
      t.yaw += (-Math.PI / 2 - t.yaw) * Math.min(1, dt * 0.9); t.xoff += 11 * dt * Math.min(1, -t.yaw);
      t.s -= 11 * dt * Math.max(0, Math.cos(t.yaw)) * 0.3;
      if (t.xoff > 150) done(20 + Math.random() * 30);
    } else if (t.phase === 'roll') {
      t.v += (sp.civil ? 2.5 : 6.5) * dt; t.s -= t.v * dt;
      if (t.v > vApp * 1.02) t.pitch += (0.16 - t.pitch) * Math.min(1, dt * 0.8);
      if (t.v > vApp * 1.12) t.phase = 'climb';
    } else if (t.phase === 'climb') {
      t.v = Math.min(sp.civil ? 135 : 200, t.v + (sp.civil ? 1.6 : 5) * dt); t.s -= t.v * dt; t.alt += t.v * (sp.civil ? 0.14 : 0.24) * dt;
      t.pitch += ((sp.civil ? 0.2 : 0.3) - t.pitch) * Math.min(1, dt * 0.6);
      if (t.s < -20000) done(15 + Math.random() * 30);
    }
    m.position.set(ap.x + t.xoff, t.alt + sp.gearH, ap.z + 1750 + t.s);
    _e.set(t.pitch, t.yaw, 0, 'YXZ'); m.quaternion.setFromEuler(_e);
    if (m.userData.gear) m.userData.gear.visible = t.alt < 350;
    (m.userData.flames || []).forEach((fl) => { fl.visible = (t.phase === 'roll' || t.phase === 'climb') && !sp.civil; fl.scale.set(1, 1, 0.8 + Math.random() * 0.3); });
  }
  function updateTraffic(dt) {
    const f = g.flight;
    g.traffic.forEach((t) => {
      const m = t.model;
      if (t.kind === 'ap') updateApTraffic(t, dt);
      else {
        t.phase += t.dir * t.speed / t.R * dt;
        const c = Math.cos(t.phase), s = Math.sin(t.phase);
        m.position.set(t.cx + t.R * c, t.alt, t.cz + t.R * s);
        const vx = -s * t.dir, vz = c * t.dir;
        _e.set(0, Math.atan2(-vx, -vz), -t.dir * Math.atan(t.speed * t.speed / (9.81 * t.R)), 'YXZ'); m.quaternion.setFromEuler(_e);
        if (t.alt > 7000) m.userData.engines.forEach((en) => { _a.set(en[0], en[1], en[2] + 6).applyQuaternion(m.quaternion).add(m.position); G.fx.trail(_a.x, _a.y, _a.z, 5, 0.35, 14); });
      }
      if (m.visible && g.state === 'fly' && m.position.distanceTo(f.pos) < (t.spec.span + g.spec.span) * 0.45) {
        G.fx.explosion(m.position, 40, camera.position); f.crash('Collision with another aircraft');
        if (t.kind === 'ap') { t.phase = 'wait'; t.wait = 60; m.visible = false; } else t.alt = -500;
      }
      // an aircraft too far away to cover a pixel is not drawn, and its marker lights only show close in (layer 3 is never rendered)
      const L = m.userData.lod;
      if (L && m.visible) { const d = m.position.distanceTo(camera.position), k = g.world.lodK || 1, st = d > t.spec.span * 1300 * k ? 0 : d > 2500 * k ? 1 : 2;
        if (st !== L.s) { L.s = st; for (let i = 0; i < L.rest.length; i++) L.rest[i].layers.set(st ? 0 : 3); for (let i = 0; i < L.nav.length; i++) L.nav[i].layers.set(st === 2 ? 0 : 3); } }
    });
  }

  // ---------- submarines: cruise in a circle, surfacing and diving on a cycle
  function spawnNaval() {
    g.subs = [];
    const mk = (cx, cz, R, friendly, ph) => { const m = G.buildSubmarine(); scene.add(m); g.subs.push({ m, cx, cz, R, a: ph, t: ph * 23, friendly, alive: true, depth: 0 }); };
    const c = G.CARRIER;
    mk(c.x - 300, c.z, 1300, true, 0.6); mk(13500, -11000, 1800, false, 2.1); mk(15500, 45500, 1700, false, 4.0); mk(33000, 14000, 2200, false, 5.2);
  }
  // ---------- a fleet of fifteen big hot-air balloons drifting together over the Jordanian desert, each at its own height
  function spawnBalloons() {
    g.balloons = []; const r = G.rng(1508), pos = [];
    const schemes = [[0xc8102e, 0xf2ecdc], [0x1c4fa0, 0xf2c81e], [0xf28c1e, 0x6a1e8a], [0x1f8f5a, 0xf2ecdc, 0xc8102e], [0xf2c81e, 0xc8102e, 0x1c4fa0, 0x1f8f5a], [0x12a5b5, 0xf2ecdc], [0xd0246a, 0xf2c81e], [0x2a2d31, 0xf28c1e],
      [0xf2ecdc, 0x1c4fa0, 0xc8102e], [0x7a3fb0, 0xf2ecdc], [0xc8102e, 0xf2c81e], [0x1f8f5a, 0xf2c81e], [0x1c4fa0, 0xf2ecdc], [0xf28c1e, 0xf2ecdc, 0x2a2d31], [0xc8102e, 0x1c4fa0, 0xf2ecdc, 0xf2c81e]];
    for (let i = 0; i < 15; i++) {
      let ox = 0, oz = 0; for (let k = 0; k < 40; k++) { const a = r() * 6.283, d = Math.sqrt(r()) * 1200; ox = Math.cos(a) * d; oz = Math.sin(a) * d; if (!pos.some((q) => Math.hypot(q[0] - ox, q[1] - oz) < 230)) break; }
      pos.push([ox, oz]);
      const R = r.range(20, 28), m = G.buildBalloon(schemes[i], R); scene.add(m);
      g.balloons.push({ m, R, ox, oz, alt: 420 + i * 165 + r.range(-60, 60), amp: r.range(50, 130), ph: r() * 6.283, w: r.range(0.02, 0.045), spin: r.range(-0.03, 0.03), burn: r() * 8, alive: true });
    }
    g.fleet = { cx: -47200, cz: 40600, R: 7200, a: 0.4, sp: 6.5 }; // the whole fleet rides the same wind, round Amman, Madaba and Queen Alia
  }
  function updateBalloons(dt) {
    const f = g.flight, F = g.fleet; F.a += F.sp / F.R * dt;
    const fx0 = F.cx + Math.cos(F.a) * F.R, fz0 = F.cz + Math.sin(F.a) * F.R;
    for (let i = 0; i < g.balloons.length; i++) {
      const b = g.balloons[i]; if (!b.alive) continue;
      b.ph += b.w * dt; b.burn -= dt; const m = b.m, fl = m.userData.flame;
      m.position.set(fx0 + b.ox, b.alt + Math.sin(b.ph) * b.amp, fz0 + b.oz); m.rotation.y += b.spin * dt;
      if (b.burn < -1.6) b.burn = 3 + Math.random() * 7; fl.visible = b.burn < 0; // the burner fires in bursts
      if (g.state !== 'fly' || f.crashed) continue;
      const dx = f.pos.x - m.position.x, dy = f.pos.y - m.position.y, dz = f.pos.z - m.position.z, rp = g.spec.span * 0.3, k = b.R / 13;
      if (Math.abs(dx) > 80 || Math.abs(dz) > 80 || Math.abs(dy) > 90) continue;
      const env = (dx * dx + dz * dz) / ((b.R + rp) * (b.R + rp)) + ((dy - k * -2) * (dy - k * -2)) / ((17 * k + rp) * (17 * k + rp)) < 1, basket = Math.hypot(dx, dz) < 3 * k + rp && dy < -14 * k && dy > -29 * k - rp;
      if (env || basket) { b.alive = false; m.visible = false; G.fx.explosion(m.position, 40, camera.position); G.audio.explosion(camera.position.distanceTo(m.position), 0.7); f.crash('Collided with a hot-air balloon'); }
    }
  }
  function updateNaval(dt) {
    (g.subs || []).forEach((s) => {
      if (!s.alive) { if (s.m.position.y > G.SEA - 40) { s.m.position.y -= 3 * dt; s.m.rotation.x += 0.05 * dt; } return; }
      s.t += dt; s.a += 7 / s.R * dt;
      const p = s.t % 96, d = p < 52 ? 0 : p < 62 ? (p - 52) / 10 : p < 86 ? 1 : 1 - (p - 86) / 10; // 0 surfaced .. 1 deep
      s.depth = d;
      const x = s.cx + Math.cos(s.a) * s.R, z = s.cz + Math.sin(s.a) * s.R;
      s.m.position.set(x, G.SEA - 2.2 - d * 24, z);
      _e.set((p >= 52 && p < 62 ? -0.12 : p >= 86 ? 0.12 : 0) * Math.sin(Math.PI * (p < 62 ? (p - 52) / 10 : (p - 86) / 10)), Math.atan2(Math.sin(s.a), -Math.cos(s.a)), 0, 'YXZ'); s.m.quaternion.setFromEuler(_e);
      if (d < 0.5 && Math.random() < 0.5) { // wake and bow foam
        const k = Math.random() < 0.5 ? 50 : -50; _a.set(0, 0, k).applyQuaternion(s.m.quaternion);
        G.fx.trail(x + _a.x + (Math.random() - 0.5) * 6, G.SEA + 0.6, z + _a.z + (Math.random() - 0.5) * 6, 4, 0.45, 5);
      }
      if ((p > 86 && p < 87.5) || (p > 52 && p < 54)) for (let i = 0; i < 3; i++) G.fx.trail(x + (Math.random() - 0.5) * 60, G.SEA + 1, z + (Math.random() - 0.5) * 60, 6, 0.5, 4, 0, 3, 0);
    });
  }
  function hitSubs(p, R) {
    (g.subs || []).forEach((s) => {
      if (!s.alive || s.depth > 0.6 || s.m.position.distanceTo(p) > Math.max(70, R * 0.8)) return;
      s.alive = false; G.fx.explosion(s.m.position, 60, camera.position); G.fx.addEmitter({ x: s.m.position.x, y: G.SEA + 2, z: s.m.position.z, size: 9, life: 30, fire: 10 });
      if (s.friendly) earn(-60000, 'You sank a friendly submarine'); else { earn(220000, 'Submarine sunk'); msg('Submarine destroyed', 'big'); }
    });
  }

  // ---------- difficulty levels and strike missions
  const lerp = G.lerp;
  const LEVEL_NAMES = ['', 'Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard', 'Extreme', 'Extreme'];
  function diffFor(L) {
    const t = (clamp(L, 1, 10) - 1) / 9;
    return { level: L, range: lerp(6000, 9500, t), cool: lerp(24, 7, t), maxMsl: 1 + Math.floor(t * 3.01), mslSpeed: lerp(760, 1000, t), mslG: lerp(17, 34, t),
      decoy: lerp(0.45, 0.18, t), flak: L >= 4, flakErr: lerp(260, 70, t), flakRate: lerp(3.2, 1.1, t), sites: Math.min(10, 3 + Math.round(L * 0.7)), reward: 120000 * L };
  }
  const curLevel = () => clamp(save.mLevelSel > 0 ? save.mLevelSel : save.mLevel, 1, 10);
  const enemyCities = () => G.CITIES.filter((c) => !c.town);
  const missionTarget = (L) => { const e = enemyCities(); return save.mTarget >= 0 && e[save.mTarget] ? e[save.mTarget] : e[(L + 2) % e.length]; };
  g.diff = diffFor(3);
  function clearMission() {
    if (g.wing) g.wing.forEach((wm) => scene.remove(wm.model));
    g.wing = []; g.mission = null; g.rush = null; g.landCh = null; g.landNav = null; $('objective').classList.add('hidden');
  }
  function ensureSites(city, n) {
    const w = g.world, R = (city.rx || city.r);
    let live = w.sams.filter((s) => s.alive && s.city === city.name), tries = 0;
    while (live.length < n && tries++ < 80) {
      const pe = G.cityEdge(city, Math.random() * 6.283, 350 + Math.random() * 650), x = pe[0], z = pe[1];
      if (w.surfaceAt(x, z) !== 'grass' || w.rawHeight(x, z) < -0.5 || w.rawHeight(x, z) > 30 || live.some((s) => Math.hypot(s.x - x, s.z - z) < 420)) continue;
      if (G.AIRPORTS.some((ap) => Math.abs(x - ap.x) < 900 && Math.abs(z - ap.z) < 2400)) continue;
      live.push(G.addSam(w, city, x, z));
    }
    return live;
  }
  function setObjective(lines) { const o = $('objective'); o.innerHTML = lines.map((l, i) => `<div class="${i ? '' : 'ttl'}">${l}</div>`).join(''); o.classList.remove('hidden'); }
  function startMission() {
    const L = curLevel(), cities = missionCities(L, save.mCities), city = cities[0];
    // depart from an airfield that does not belong to the target
    let ap = save.startAp;
    const bad = (i) => i < G.AIRPORTS.length && ((G.AIRPORTS[i].city || 'New York') === city.key);
    if (bad(ap)) ap = [1, 0, 2, 3, 4, 5].find((i) => !bad(i));
    g.forceAp = ap;
    startFlight(false);
    g.diff = diffFor(L);
    const targets = ensureSites(city, g.diff.sites);
    g.mission = { level: L, cities, idx: 0, city, targets, phase: 'attack', left: targets.length, total: targets.length, rtb: null, t: 0, wrongT: 0, shown: -1 };
    targets.forEach((t) => { t.cool = 8 + Math.random() * 10; });
    if (save.assist >= 2) {
      const sp = G.aircraftById(g.spec.span > 22 ? 'f16' : g.spec.id);
      for (let i = 0; i < 2; i++) { const model = G.buildAircraft(sp, { noCockpit: true, lights: true, paint: sp === g.spec ? paintOf(sp.id) : null }); if (model.userData.gear) model.userData.gear.visible = false; scene.add(model); g.wing.push({ model, a: i * 3.14, next: 50 + i * 20 }); }
    }
    const d = Math.hypot(city.x - g.flight.pos.x, city.z - g.flight.pos.z);
    msg('MISSION — LEVEL ' + L + ' (' + LEVEL_NAMES[L] + '): destroy the air defences of ' + city.name + (cities.length > 1 ? ' — city 1 of ' + cities.length : ''), 'big');
    msg(targets.length + ' sites, ' + (d / 1000).toFixed(0) + ' km away' + (g.diff.flak ? ' — expect anti-aircraft fire' : '') + (g.wing.length ? ' — two wingmen are on station' : ''), '');
    updateObjective();
  }
  function updateObjective() {
    const m = g.mission; if (!m) return;
    const clock = '<span class="tm">TIME ' + fmtT(m.t) + '</span>' + (m.cities.length > 1 ? ' · CITY ' + (m.idx + 1) + ' / ' + m.cities.length : '');
    if (m.phase === 'attack') setObjective(['LEVEL ' + m.level + ' · ' + LEVEL_NAMES[m.level].toUpperCase() + ' — STRIKE ' + m.city.name.toUpperCase(), clock, 'Destroy the defence sites: ' + (m.total - m.left) + ' / ' + m.total, 'Then land at the airfield you are given']);
    else if (m.phase === 'rtb') setObjective(['LEVEL ' + m.level + ' — ' + (m.idx < m.cities.length - 1 ? 'LAND TO REFUEL AND REARM' : 'RETURN TO BASE'), clock, 'All ' + m.total + ' sites destroyed', 'Land at ' + m.rtb.name + ' and stop on the runway']);
  }
  // next leg of a multi-city mission: repaired, rearmed and lined up on the runway again
  function nextCity(m, ap) {
    const f = g.flight;
    earn(Math.round(g.diff.reward * 0.3), m.city.name + ' cleared — stage ' + (m.idx + 1) + ' of ' + m.cities.length);
    m.idx++; m.city = m.cities[m.idx];
    f.reset(new V3(ap.x, g.spec.gearH, ap.z + 1650), 0, 0); f.health = 100; g.ammo.forEach((a) => { a.count = a.max; }); g.flares = g.spec.flares;
    g.hasFlown = false; g.landing = false; g.hasFlownMission = false; g.samGrace = 25; g.gearPrev = f.gear; g.flapPrev = f.flaps; g.flapSet = f.flapsTarget;
    m.targets = ensureSites(m.city, g.diff.sites); m.targets.forEach((t) => { t.cool = 8 + Math.random() * 10; });
    m.left = m.total = m.targets.length; m.phase = 'attack'; m.rtb = null;
    g.wing.forEach((wm) => { wm.model.visible = true; wm.next = 40 + Math.random() * 20; });
    const d = Math.hypot(m.city.x - f.pos.x, m.city.z - f.pos.z);
    msg('Refuelled and rearmed — next target: ' + m.city.name + ', ' + (d / 1000).toFixed(0) + ' km', 'big'); updateObjective();
  }
  function updateMission(dt) {
    const m = g.mission, f = g.flight; if (!m || g.state !== 'fly') return;
    m.t += dt;
    if (Math.floor(m.t) !== m.shown) { m.shown = Math.floor(m.t); updateObjective(); }
    if (m.phase === 'attack') {
      const left = m.targets.filter((t) => t.alive).length;
      if (left !== m.left) {
        m.left = left;
        if (left > 0) { msg('Defence site destroyed — ' + left + ' left', 'big'); updateObjective(); }
        else {
          const nx = m.cities[m.idx + 1], ok = G.AIRPORTS.filter((ap) => (ap.city || 'New York') !== m.city.key && !(nx && (ap.city || 'New York') === nx.key));
          m.rtb = ok[Math.floor(Math.random() * ok.length)]; m.phase = 'rtb';
          earn(Math.round(g.diff.reward * 0.4), 'All defences of ' + m.city.name + ' destroyed');
          msg((nx ? 'Land at ' + m.rtb.name + ' to refuel and rearm for ' + nx.name : 'Return to base: land at ' + m.rtb.name), 'big'); updateObjective();
        }
      }
      // wingmen circle the target and take turns bombing a remaining site
      g.wing.forEach((wm, i) => {
        const R = (m.city.rx || m.city.r) + 2000 + i * 500, sp = 200; wm.a += sp / R * dt;
        const cx = Math.cos(wm.a), sx = Math.sin(wm.a); wm.model.position.set(m.city.x + R * cx, 1500 + i * 150, m.city.z + R * sx);
        _e.set(0, Math.atan2(sx, -cx), -Math.atan(sp * sp / (9.81 * R)), 'YXZ'); wm.model.quaternion.setFromEuler(_e);
        wm.next -= dt;
        if (wm.next <= 0 && !f.onGround) {
          wm.next = 34 + Math.random() * 16;
          const live = m.targets.filter((t) => t.alive); if (!live.length) return;
          const p = wm.model.position; let tg = live[0], bd = 1e12; live.forEach((t) => { const d2 = Math.hypot(t.x - p.x, t.z - p.z); if (d2 < bd) { bd = d2; tg = t; } });
          const def = G.WEAPONS.mk84, mesh = G.buildBomb(def), tt = Math.sqrt(2 * (p.y - 5) / 9.81); scene.add(mesh);
          g.bombs.push({ mesh, pos: p.clone(), vel: new V3((tg.x - p.x) / tt, 0, (tg.z - p.z) / tt), def, t: 0, ally: true });
          msg('Wingman: bombs away', '');
        }
      });
    } else if (m.phase === 'rtb') {
      g.wing.forEach((wm, i) => { wm.model.position.y += 20 * dt; wm.model.position.x += 60 * dt; if (wm.model.position.y > 6000) wm.model.visible = false; });
      const ap = m.rtb;
      if (f.onGround && f.V < 2 && g.hasFlownMission) {
        if (Math.abs(f.pos.x - ap.x) < 700 && Math.abs(f.pos.z - ap.z) < 1950) {
          if (m.idx < m.cities.length - 1) { nextCity(m, ap); return; }
          m.phase = 'done';
          const bonus = Math.round(g.diff.reward * (0.6 + f.health / 250));
          earn(bonus, 'Mission complete — level ' + m.level);
          if (save.mLevel <= m.level) save.mLevel = Math.min(10, m.level + 1); persist();
          const n = m.cities.length, rec = newBest('m' + m.level + 'x' + n, Math.round(m.t), true);
          endRound('Mission complete', 'Level ' + m.level + ' cleared in ' + fmtT(m.t) + (rec ? ' — a new best time' : ' (best ' + fmtT(save.best['m' + m.level + 'x' + n]) + ')') + ': the defences of ' + m.cities.map((c) => c.name).join(', ') + ' are destroyed and you landed at ' + ap.name + '. Earned ' + G.money(g.sortie || 0) + '.' + (save.mLevelSel === 0 && m.level < 10 ? ' Next: level ' + save.mLevel + '.' : ''),
            save.mLevelSel === 0 && m.level < 10 ? 'Next mission (level ' + save.mLevel + ')' : 'Fly this mission again');
        } else if (m.t - m.wrongT > 12) { m.wrongT = m.t; msg('Wrong airfield — you must land at ' + ap.name, 'bad'); }
      }
    }
    if (!f.onGround) g.hasFlownMission = true;
  }

  // ---------- demolition rush: a fixed time to do as much damage as possible
  function startRush() {
    const e = enemyCities(), city = e[save.rCity] || e[0];
    g.forceCity = city; startFlight(true, true);
    g.rush = { t: save.rTime, total: save.rTime, city, shown: -1, rearmT: 0 };
    msg('DEMOLITION RUSH — ' + city.name + ' is 7 km ahead', 'big'); updateRush(0);
  }
  function updateRush(dt) {
    const r = g.rush; if (!r || g.state !== 'fly') return;
    r.t -= dt;
    if (Math.ceil(r.t) !== r.shown) {
      r.shown = Math.ceil(r.t);
      setObjective(['DEMOLITION RUSH — ' + r.city.name.toUpperCase(), '<span class="tm">TIME LEFT ' + fmtT(r.shown) + '</span>', 'Damage score ' + G.money(Math.max(0, g.sortie || 0)), 'Bombs reload when you run out']);
      if (r.shown <= 10 && r.shown > 0) G.audio.beep(880, 0.08, 0.12);
    }
    if (g.ammo.length && g.ammo.every((a) => a.count <= 0)) { r.rearmT += dt; if (r.rearmT > 5) { r.rearmT = 0; g.ammo.forEach((a) => { a.count = a.max; }); msg('Bombs reloaded', ''); } }
    if (r.t <= 0) {
      const sc = Math.max(0, Math.round(g.sortie || 0)), rec = sc > 0 && newBest('r' + r.total, sc);
      endRound("Time's up", 'You did ' + G.money(sc) + ' of damage to ' + r.city.name + ' in ' + fmtT(r.total) + (rec ? ' — a new best score.' : '. Best: ' + G.money(save.best['r' + r.total] || 0) + '.'), 'Rush again');
    }
  }

  // ---------- landing challenge: start on final approach, graded on the touchdown
  function startLanding() {
    const s = G.AIRCRAFT[hIdx], CV = G.CARRIER, cv = save.lWhere === G.AIRPORTS.length, ap = cv ? CV : (G.AIRPORTS[save.lWhere] || G.AIRPORTS[0]);
    startFlight(true, true);
    const f = g.flight, endZ = cv ? CV.z + 166 : ap.z + 1800, gy = cv ? CV.deckY : 0, d = save.lDist;
    const vs = Math.sqrt(2 * s.mass * 9.81 / (1.225 * s.S * (s.CL0 + s.flapCL + s.CLa * s.alphaStall * 0.9)));
    f.reset(new V3(ap.x, gy + s.gearH + d * 0.0524 + 20, endZ + d), 0, clamp(vs * 1.55, 65, 150)); f.throttle = 0.45; f.rpm = 0.45;
    g.camFwd.set(0, 0, -1); g.gearPrev = f.gear; g.flapPrev = f.flaps; g.flapSet = f.flapsTarget;
    g.landCh = { ap, cv, endZ, td: null, t: 0, shown: -1, idealZ: cv ? CV.z + 70 : ap.z + 1500, offS: cv ? 10 : 22, zS: cv ? 90 : 450, limit: s.sinkLimit * (cv ? 1.9 : 1) };
    g.landNav = { phase: 'rtb', rtb: { x: ap.x, z: cv ? CV.z + 70 - 1700 : ap.z, name: cv ? 'Carrier' : ap.name } };
    msg('LANDING CHALLENGE — ' + ap.name + ', ' + (d / 1000) + ' km ahead', 'big'); updateLanding(0);
  }
  function updateLanding(dt) {
    const c = g.landCh, f = g.flight; if (!c || g.state !== 'fly') return;
    c.t += dt;
    if (Math.floor(c.t * 2) !== c.shown) {
      c.shown = Math.floor(c.t * 2);
      const dz = f.pos.z - c.endZ;
      setObjective(['LANDING CHALLENGE — ' + c.ap.name.toUpperCase(), '<span class="tm">TIME ' + fmtT(c.t) + '</span> · ' + (c.td ? 'TOUCHDOWN ' + Math.round(c.td.sink * 196.85) + ' FT/MIN' : dz > 0 ? 'THRESHOLD ' + (dz / 1000).toFixed(1) + ' KM' : 'OVER THE ' + (c.cv ? 'DECK' : 'RUNWAY')),
        c.td ? 'Brake [B] and stop' : 'Gear ' + (f.gearTarget ? 'down ✓' : 'UP — press G') + ' · flaps ' + (f.flapsTarget >= 1 ? 'full ✓' : 'press F'), 'Soft touchdown, on the centreline, in the touchdown zone']);
    }
    if (c.td && f.onGround && f.V < 2) {
      const on = c.cv ? g.world.onDeck(c.td.x, c.td.z) : Math.abs(c.td.x - c.ap.x) < 60 && Math.abs(c.td.z - c.ap.z) < 1900;
      const soft = on ? Math.round(40 * clamp(1 - (c.td.sink - 0.6) / (c.limit - 0.6), 0, 1)) : 0, line = on ? Math.round(30 * clamp(1 - Math.abs(c.td.x - c.ap.x) / c.offS, 0, 1)) : 0, spot = on ? Math.round(30 * clamp(1 - Math.abs(c.td.z - c.idealZ) / c.zS, 0, 1)) : 0;
      const sc = soft + line + spot, grade = sc >= 90 ? 'S' : sc >= 75 ? 'A' : sc >= 55 ? 'B' : sc >= 35 ? 'C' : 'D', rec = sc > 0 && newBest('l' + save.lWhere, sc);
      if (sc > 0) earn(sc * 600, 'Landing grade ' + grade);
      endRound(on ? 'Landing grade ' + grade + ' — ' + sc + ' / 100' : 'Missed the ' + (c.cv ? 'deck' : 'runway'),
        on ? 'Touchdown ' + Math.round(c.td.sink * 196.85) + ' ft/min: ' + soft + ' / 40.  Centreline, ' + Math.abs(c.td.x - c.ap.x).toFixed(1) + ' m off: ' + line + ' / 30.  Touchdown point, ' + Math.abs(c.td.z - c.idealZ).toFixed(0) + ' m from the zone: ' + spot + ' / 30.  Time ' + fmtT(c.t) + '.' + (rec ? '  A new best landing.' : '')
          : 'You came down away from ' + c.ap.name + '. Line up with the marker and try again.', 'Fly it again');
    }
  }

  // ---------- per-frame aircraft visuals
  const s_rocket = (gm) => !!gm.spec.rocket;
  const pose = { gear: 1, flaps: 0, brake: 0, pitch: 0, roll: 0, yaw: 0, alpha: 0, onGround: true, V: 0, rpm: 0, ab: 0, throttle: 0, steer: 0, decel: 0, bump: 0, brakeTemp: 15, gearTarget: 1, flapsTarget: 0, nz: 1 };
  function syncModel(dt) {
    const f = g.flight, m = g.model, ud = m.userData, fx = G.fx;
    const cockpit = g.view === 1 && g.state === 'fly';
    if (ud.cockpit) ud.cockpit.visible = cockpit; if (ud.core) ud.core.visible = !cockpit; if (ud.fp) ud.fp.visible = cockpit;
    // drive every moving part from the flight state: gear legs and doors, flaps, slats, control surfaces, brakes, nozzles
    const c = f.ctl || pose;
    pose.gear = f.gear; pose.flaps = f.flaps; pose.brake = f.brake; pose.pitch = f.ctl ? c.pitch : 0; pose.roll = f.ctl ? c.roll : 0; pose.yaw = f.ctl ? c.yaw : 0;
    pose.alpha = f.alpha; pose.onGround = f.onGround; pose.V = f.V; pose.rpm = f.rpm; pose.ab = f.ab; pose.throttle = f.throttle; pose.steer = clamp(pose.yaw + pose.roll * 0.6, -1, 1);
    pose.decel = f.decel || 0; pose.bump = g.bump || 0; g.bump = 0; pose.brakeTemp = f.brakeTemp || 15; pose.gearTarget = f.gearTarget; pose.flapsTarget = f.flapsTarget; pose.nz = f.nz;
    const A = G.poseAircraft(m, pose, g.state === 'fly' ? dt : 0);
    m.position.copy(f.pos); m.quaternion.copy(f.q);
    if (ud.legs) { m.position.y += A.dy; if (A.dip) { _q.setFromAxisAngle(X, -A.dip); m.quaternion.multiply(_q); } } // strut travel and brake dive
    if (ud.stores && g.ammo && g.ammo.length) { const a = g.ammo[0], left = Math.ceil(a.count / a.max * ud.stores.length); ud.stores.forEach((b, i) => { b.visible = i < left; }); }
    (ud.flames || []).forEach((fl) => { fl.visible = f.ab > 0.03; const k = f.ab * (0.85 + Math.random() * 0.3); fl.scale.set(1, 1, Math.max(0.05, k)); });
    if (g.state !== 'fly') return;
    if (s_rocket(g) && f.ab > 0.05) {
      const rho = G.atmosphere(f.pos.y).rho;
      ud.engines.forEach((en) => {
        _a.set(en[0], en[1], en[2] + 20).applyQuaternion(f.q).add(f.pos); _b.set(0, 0, 60).applyQuaternion(f.q).add(f.vel);
        fx.flame(_a.x, _a.y, _a.z, 9, _b.x * 0.4, _b.y * 0.4, _b.z * 0.4);
        if (rho > 0.002 && Math.random() < 0.8) fx.smoke.spawn(_a.x, _a.y, _a.z, _b.x * 0.15 + (Math.random() - 0.5) * 8, _b.y * 0.15, _b.z * 0.15 + (Math.random() - 0.5) * 8, 8 + Math.random() * 6, 12, 70, 0.92, 0.92, 0.92, Math.min(0.75, 0.2 + rho), 0.4, -0.2);
      });
    }
    const eng = ud.engines, world = (p, zoff) => _a.set(p[0], p[1], p[2] + (zoff || 0)).applyQuaternion(f.q).add(f.pos);
    if (!g.spec.rocket) {
      const kias = f.ias * G.KTS, gearMove = f.gear > 0.001 && f.gear < 0.999;
      // gear: lock clunks and status calls
      if (f.gear >= 0.999 && g.gearPrev < 0.999) { G.audio.lock(); fx.shake = Math.max(fx.shake, 0.12); if (!f.onGround) msg('Gear down and locked — three greens', ''); }
      if (f.gear <= 0.001 && g.gearPrev > 0.001) { G.audio.lock(); msg('Gear up and locked', ''); }
      if (f.flaps !== g.flapPrev && Math.abs(f.flaps - f.flapsTarget) < 1e-4 && f.flapsTarget !== g.flapSet) { g.flapSet = f.flapsTarget; G.audio.clunk(); }
      g.gearMove = gearMove; g.flapMove = Math.abs(f.flaps - f.flapsTarget) > 1e-4; g.gearPrev = f.gear; g.flapPrev = f.flaps;
      // airframe buffet from gear, flaps and speed brakes hanging in the airflow
      const qk = clamp(f.qbar / 22000, 0, 1.2);
      g.buffet = qk * (f.gear * 0.45 + (f.onGround ? 0 : f.brake * 0.8) + f.flaps * 0.2) + (f.flapOver ? 0.35 : 0) + (f.gearOver ? 0.4 : 0) + (gearMove && !f.onGround ? 0.12 : 0);
      // vapour streaming off the flap ends when the wing is working hard
      if (ud.flapTips && f.flaps > 0.3 && !f.onGround && f.ias > 55 && (f.nz > 1.5 || f.alpha > 0.13) && f.pos.y < 6000) ud.flapTips.forEach((tp) => { if (Math.random() < 0.7) { const p = world(tp); fx.trail(p.x, p.y, p.z, 0.5 + f.flaps * 0.5, 0.22, 0.5); } });
      if (ud.legs && f.onGround) {
        const hot = f.brakeTemp > 520, hard = f.brake > 0.5 && f.V > 28;
        if (hard || hot) ud.legs.forEach((l) => {
          if (l.nose) return;
          _a.set(l.x, -g.spec.gearH + 0.35, l.root.position.z).applyQuaternion(f.q).add(f.pos);
          if (hard && Math.random() < 0.55) fx.smoke.spawn(_a.x, _a.y, _a.z, f.vel.x * 0.35, 1.2, f.vel.z * 0.35, 1.3, 0.9, 5, 0.86, 0.86, 0.88, 0.22 + clamp(f.V / 200, 0, 0.3), 0.9, 0);
          if (hot && Math.random() < 0.25) fx.smoke.spawn(_a.x, _a.y, _a.z, 0, 1.6, 0, 2.6, 0.6, 3.5, 0.7, 0.7, 0.72, clamp((f.brakeTemp - 480) / 600, 0.05, 0.4), 0.4, -0.6);
        });
        g.squealT -= dt; if (hard && f.V > 45 && g.squealT <= 0) { g.squealT = 0.9; G.audio.squeal(); }
        if (hot && !g.hotBrakes) { g.hotBrakes = true; msg('Hot brakes — ' + Math.round(f.brakeTemp) + ' °C, braking is fading', 'bad'); }
      }
      if (f.brakeTemp < 380) g.hotBrakes = false;
      if (f.flapOver && !g.flapOverMsg) { g.flapOverMsg = true; msg('Flap overspeed — limit ' + f.vfe + ' kt', 'bad'); } if (!f.flapOver) g.flapOverMsg = false;
      // gear warning horn: low, slow, throttled back and the wheels are still up
      g.gearWarn = !f.onGround && f.gearTarget < 1 && f.agl < 240 && f.vel.y < -1 && kias < 230 && f.throttle < 0.5 && g.time > 6;
    }
    if (f.pos.y > 7500 && f.rpm > 0.3) eng.forEach((en) => { const p = world(en, 8); fx.trail(p.x, p.y, p.z, 4, 0.4, 8); });
    else if (f.rpm > 0.75 && Math.random() < 0.3) eng.forEach((en) => { const p = world(en, 2); fx.smoke.spawn(p.x, p.y, p.z, 0, 0, 0, 1.2, 1.5, 7, 0.2, 0.2, 0.2, 0.1, 0, 0); });
    if (f.nz > 5.5 || (g.audioTransonic > 0.4)) ud.tips.forEach((tp) => { const p = world(tp); fx.trail(p.x, p.y, p.z, 1.2, 0.35, 0.7); });
    if (g.audioTransonic > 0.3) { // condensation cone
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.283, r = g.spec.span * 0.33;
        _a.set(Math.cos(a) * r, Math.sin(a) * r * 0.8, g.spec.length * 0.12).applyQuaternion(f.q).add(f.pos);
        fx.smoke.spawn(_a.x, _a.y, _a.z, f.vel.x * 0.97, f.vel.y * 0.97, f.vel.z * 0.97, 0.13, g.spec.span * 0.25, g.spec.span * 0.6, 1, 1, 1, 0.3 * g.audioTransonic, 0, 0);
      }
    }
    if (f.health < 60 && Math.random() < 0.6) { const p = world(eng[0]); fx.darkTrail(p.x, p.y, p.z, 3); if (f.health < 35) fx.flame(p.x, p.y, p.z, 3); }
    if (f.onGround && f.V > 20 && f.surface !== 'paved' && Math.random() < 0.5) fx.smoke.spawn(f.pos.x, f.pos.y - g.spec.gearH + 0.5, f.pos.z, 0, 2, 0, 2, 3, 14, 0.5, 0.45, 0.35, 0.35, 0.5, 0);
  }

  function updateCamera(dt) {
    const f = g.flight, s = g.spec, fx = G.fx;
    _fwd.set(0, 0, -1).applyQuaternion(f.q);
    const shake = fx.shake * 1.2 + g.audioTransonic * 0.12 + (g.buffet || 0) * 0.09 + (f.onGround && f.surface !== 'paved' ? clamp(f.V / 60, 0, 1) * 0.15 : 0) + (f.stalled ? 0.08 : 0);
    if (g.view === 1 && g.state === 'fly') {
      // the eye rides with the airframe (strut travel, brake dive); g-load presses the head down, lateral load leans it
      const e = s.cam.cockpit, mq = g.model.quaternion;
      g.headY += (clamp((f.nz - 1) * 0.006, -0.012, 0.04) - g.headY) * Math.min(1, dt * 5);
      g.headX = (g.headX || 0) + (clamp(-f.beta * 0.25 + (f.w ? f.w.z * 0.006 : 0), -0.03, 0.03) - (g.headX || 0)) * Math.min(1, dt * 4);
      camera.position.set(e[0] + g.headX + (Math.random() - 0.5) * shake * 0.03, e[1] - g.headY + (Math.random() - 0.5) * shake * 0.03, e[2]).applyQuaternion(mq).add(g.model.position);
      _q.setFromAxisAngle(Y, g.camYaw); _q2.setFromAxisAngle(X, g.camPitch);
      camera.quaternion.copy(mq).multiply(_q).multiply(_q2);
      camera.fov = clamp(72 * Math.sqrt(g.zoom), 30, 100); camera.near = 0.04;
    } else if (g.state === 'dead' && g.deadCam) {
      // after a building strike the camera hangs back on the line the aircraft flew in on (known to be clear air) and
      // slowly pulls away and up, so the fire and any collapse stay in view instead of the view circling into a wall
      const c = g.deadCam; c.d = Math.min(c.max, c.d + dt * (c.d < c.d0 ? 60 : 7)); c.h += dt * 2.2;
      camera.position.copy(c.look).addScaledVector(c.dir, -c.d); camera.position.y += c.h;
      const gh = g.world.groundHeight(camera.position.x, camera.position.z) + 3; if (camera.position.y < gh) camera.position.y = gh;
      camera.up.set(0, 1, 0); camera.lookAt(c.look.x, c.look.y - Math.min(c.drop, (c.d - c.d0) * 0.25), c.look.z);
      camera.fov = 58; camera.near = 1;
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake;
    } else {
      g.camFwd.lerp(_fwd, 1 - Math.exp(-4 * dt)).normalize();
      let by = Math.atan2(-g.camFwd.x, -g.camFwd.z), bp = Math.asin(clamp(g.camFwd.y, -1, 1));
      if (s.rocket) { by = 0.6; bp = 0.25; }
      const yaw = by + g.camYaw, pitch = clamp(bp * 0.75 + g.camPitch - 0.16, -1.5, 1.5), dist = s.cam.dist * g.zoom * (g.state === 'dead' ? 2.5 : 1);
      _a.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      _b.copy(f.pos); _b.y += s.cam.height * 0.35;
      camera.position.copy(_b).addScaledVector(_a, -dist);
      const gh = g.world.groundHeight(camera.position.x, camera.position.z) + 1.5; if (camera.position.y < gh) camera.position.y = gh;
      camera.up.set(0, 1, 0); camera.lookAt(_b);
      camera.fov = 58 + clamp(f.V / 340, 0, 2) * 6; camera.near = 1;
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake;
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const cpg = g.model.userData.cp; if (cpg && cpg.glass) cpg.glass.uniforms.sunV.value.copy(G.SUN).transformDirection(camera.matrixWorldInverse); // sun glint on the canopy
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    const space = G.smoothstep(14000, 75000, camera.position.y);
    sky.material.uniforms.space.value = space; stars.material.opacity = G.smoothstep(0.35, 1, space);
    scene.fog.density = (g.fogBase || 0.000042) * (1 - space) * (1 - space) * Math.exp(-Math.max(0, camera.position.y) / 30000);
    sun.position.copy(f.pos).addScaledVector(G.SUN, 500); sun.target.position.copy(f.pos);
    fx.setScale(g.H, camera.fov);
  }

  // The aircraft has flown into a building. What happens to the building depends on how heavy and fast the aircraft was
  // and how big the building is: a house is flattened; a tower hit by a fighter burns on the floors that were struck;
  // a tower hit by something heavy burns, then its structure gives way and it comes down.
  function buildingStrike(b) {
    const f = g.flight, w = g.world, s = g.spec, V = Math.max(f.V, 40), mass = s.rocket ? s.dryMass + s.fuelMass * f.fuel : s.mass, tall = b.top > 45;
    g.bldHit = true;
    { const hv = Math.hypot(f.vel.x, f.vel.z) || 1, dir = new V3(f.vel.x / hv, 0, f.vel.z / hv), d0 = 70 + s.span * 2.2; // how far back the wreck camera settles
      g.deadCam = { look: f.pos.clone(), dir, d: Math.min(d0, s.cam.dist), d0, max: d0 + 190, h: 6, drop: Math.min(f.pos.y * 0.5, 60) }; }
    G.fx.planeImpact(f.pos, f.vel, s.span, mass, camera.position);
    G.audio.explosion(camera.position.distanceTo(f.pos), clamp(1 + Math.sqrt(mass / 12000) * 0.35, 1.2, 2.6));
    w.blast(f.pos, 12 + s.span * 0.25, 0.35); // windows and small structures right at the point of entry
    if (!b.alive) return;
    b.hp -= Math.sqrt(mass / 12000) * (V / 150) * 1.1;
    if (b.hp <= 0) w.destroy(b, tall ? 3 + Math.random() * 3 : 0.35, tall ? null : f.pos); // a tower stands for a few seconds before it goes
    else {
      w.scorchAt(b, f.pos, 16 + s.span * 0.9);
      if (!tall && !b.scorched) w.scorch(b);
      if (tall && b.hp / b.maxHp < 0.5) { w.destroy(b, 15 + Math.random() * 12, null); setTimeout(() => { if (g.state === 'dead') msg('The fire has weakened the structure — the tower is coming down', 'bad'); }, 9000); }
    }
  }

  function finishSortie(reason) {
    g.state = 'dead'; g.deadT = 0; g.model.visible = false;
    const f = g.flight;
    if (g.bldHit) g.bldHit = false; // the strike on the building has already made its own fireball and fires
    else {
      G.fx.explosion(f.pos, 55, camera.position); G.audio.explosion(camera.position.distanceTo(f.pos), 1.5);
      G.fx.addEmitter({ x: f.pos.x, y: Math.max(1, g.world.groundHeight(f.pos.x, f.pos.z) + 1), z: f.pos.z, size: 10, life: 40, fire: 20 });
    }
    if (document.pointerLockElement) document.exitPointerLock();
    if (g.mission) g.mission.phase = 'failed';
    const md = g.mode;
    $('objective').classList.add('hidden');
    $('btnAgain').textContent = md === 'mission' ? 'Retry mission' : md === 'rush' ? 'Rush again' : md === 'landing' ? 'Fly it again' : 'Fly again';
    $('sumTitle').textContent = md === 'mission' ? 'Mission failed' : md === 'rush' ? 'Rush over — aircraft lost' : md === 'landing' ? 'Landing failed' : 'Aircraft lost';
    $('sumText').textContent = reason + '.  ' + (md === 'rush' ? 'A crash does not count toward your best score. ' : '') + 'Sortie earnings kept: ' + G.money(g.sortie || 0) + '.';
    setTimeout(() => { if (g.state === 'dead') $('summary').classList.remove('hidden'); }, 2800);
  }

  // ---------- main update
  let panelT = 0, predT = 0;
  function update(dt) {
    const f = g.flight, w = g.world, fx = G.fx;
    g.time += dt;
    if (g.time > 9 && !g.helpHidden) { g.helpHidden = true; $('help').classList.add('hidden'); }
    if (g.state === 'fly') {
      const k = keys;
      const input = {
        pitch: (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0),
        roll: g.spec.rocket ? (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0) : (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
        yaw: g.spec.rocket ? (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) : (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0),
        throttleDelta: ((k.ShiftLeft || k.ShiftRight || k.Equal || k.PageUp ? 1 : 0) - (k.KeyZ || k.ControlLeft || k.Minus || k.PageDown ? 1 : 0)) * 0.45,
        brake: !!k.KeyB
      };
      f.update(dt, input, w);
      if (f.onGround && !f.crashed && w.onDeck(f.pos.x, f.pos.z)) {
        _fwd.set(0, 0, -1).applyQuaternion(f.q); _fwd.y = 0; _fwd.normalize();
        if (g.cat && f.throttle > 0.85) { // steam catapult
          if (!g.catFired) { g.catFired = true; msg('Catapult launch', 'big'); G.audio.whoosh(); }
          f.vel.addScaledVector(_fwd, 31 * dt);
          if (Math.random() < 0.6) G.fx.trail(f.pos.x, f.pos.y - g.spec.gearH + 0.3, f.pos.z, 2.5, 0.5, 1.6);
        } else if (g.landing && f.V > 1.5 && f.throttle < 0.9) { // arrestor wire
          if (!g.hooked) { g.hooked = true; msg('Wire caught', 'big'); G.audio.clunk(); G.fx.shake = Math.max(G.fx.shake, 0.5); }
          f.vel.multiplyScalar(Math.max(0, 1 - 32 * dt / Math.max(f.V, 1)));
        }
      } else if (!f.onGround) { if (g.catFired) g.cat = false; g.catFired = false; g.hooked = false; }
      f.events.forEach((ev) => {
        if (ev.type === 'flaprelief') { msg('Flap load relief — too fast, flaps retracting', 'bad'); return; }
        if (ev.type === 'touchdown' && g.spec.rocket) {
          G.audio.touchdown(ev.sink || 1); fx.shake = Math.max(fx.shake, 0.4);
          if (ev.body === 'moon') { if (!g.moonLanded) { g.moonLanded = true; earn(5000000, 'You landed on the Moon'); msg('THE EAGLE HAS LANDED', 'big'); } }
          else if (g.hasFlown) { earn(g.spaceDone ? 600000 : 20000, g.spaceDone ? 'Returned from space and landed' : 'Rocket landed'); f.fuel = 1; msg('Refuelled', ''); }
        } else if (ev.type === 'touchdown') {
          G.audio.touchdown(ev.sink); fx.shake = Math.max(fx.shake, 0.2 + ev.sink * 0.1);
          g.bump = ev.sink; // compresses the struts
          if (g.landCh && !g.landCh.td) g.landCh.td = { sink: ev.sink, x: f.pos.x, z: f.pos.z };
          const legs = g.model.userData.legs || [];
          legs.forEach((l) => { // tyre smoke where each main wheel spins up
            if (l.nose) return; _a.set(l.x, -g.spec.gearH + 0.35, l.root.position.z).applyQuaternion(f.q).add(f.pos);
            for (let i = 0; i < 6; i++) fx.smoke.spawn(_a.x + (Math.random() - 0.5) * 1.5, _a.y, _a.z + (Math.random() - 0.5) * 1.5, f.vel.x * 0.25, 1.5 + Math.random() * 1.5, f.vel.z * 0.25, 2.5, 1.5, 11, 0.85, 0.85, 0.85, 0.4, 0.8, 0);
          });
          if (!legs.length) for (let i = 0; i < 10; i++) fx.smoke.spawn(f.pos.x + (Math.random() - 0.5) * 6, f.pos.y - g.spec.gearH + 0.4, f.pos.z, f.vel.x * 0.2, 2, f.vel.z * 0.2, 2.5, 2, 14, 0.85, 0.85, 0.85, 0.4, 0.8, 0);
          if (g.hasFlown) g.landing = true;
        } else if (ev.type === 'liftoff') { g.hasFlown = true; g.landing = false; if (g.spec.rocket) { msg(ev.body === 'moon' ? 'Lift-off from the Moon' : 'LIFT-OFF', 'big'); for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, sp = 20 + Math.random() * 50; fx.smoke.spawn(f.pos.x, f.pos.y - g.spec.gearH + 2, f.pos.z, Math.cos(a) * sp, 3 + Math.random() * 10, Math.sin(a) * sp, 9 + Math.random() * 8, 20, 110, 0.9, 0.9, 0.9, 0.7, 0.5, -0.3); } } }
      });
      f.events.length = 0;
      if (!f.crashed) {
        const hit = w.collide(f.pos, g.spec.span * 0.28);
        if (hit) { f.crash('Flew into ' + (hit.name ? 'the ' + hit.name : 'a building')); buildingStrike(hit); }
      }
      if (g.spec.rocket && !f.crashed) {
        if (!g.spaceDone && f.pos.y > 100000) { g.spaceDone = true; earn(250000, 'Crossed the Kármán line — you are in space'); }
        if (!g.moonNear && f.moonDist < 40000) { g.moonNear = true; earn(1000000, 'Lunar approach'); msg('Flip around and burn to slow down before the surface', ''); }
        if (f.fuel <= 0 && !g.fuelOut) { g.fuelOut = true; msg('Propellant exhausted', 'bad'); } if (f.fuel > 0.01) g.fuelOut = false;
      }
      if (g.shock) { g.shock.t -= dt; if (g.shock.t <= 0) { const d = g.shock.dmg; g.shock = null; hurt(d, 'Destroyed by the blast wave'); f.vel.y += 12; } }
      if (f.crashed) { finishSortie(f.crashReason); }
      else {
        g.dropT -= dt; g.flareT -= dt; g.passT -= dt;
        if (keys.Space && g.dropT <= 0) dropBomb();
        if (keys.KeyC && g.flareT <= 0 && !f.onGround) popFlare();
        // low pass bonus
        if (!f.onGround && f.V > 90 && g.passT <= 0) {
          const cl = w.nearestClearance(f.pos);
          if (cl < 38) { g.passT = 3; earn(2500, 'Low pass between buildings'); }
        }
        // landing reward
        if (g.landing && f.onGround && f.V < 2) {
          g.landing = false; g.hasFlown = false;
          const onRw = f.surface === 'paved' && G.AIRPORTS.some((a) => Math.abs(f.pos.x - a.x) < 600 && Math.abs(f.pos.z - a.z) < 1900);
          const onCv = w.onDeck(f.pos.x, f.pos.z);
          if (onCv) { earn(35000, 'Carrier landing'); f.health = 100; g.ammo.forEach((a) => { a.count = a.max; }); g.flares = g.spec.flares; g.cat = true; g.catFired = false; msg('Repaired and rearmed — full throttle to launch again', ''); }
          else if (onRw) { earn(g.spec.civil ? (g.spec.id === 'an225' ? 90000 : 40000) : 12000, g.spec.id === 'an225' ? 'Cargo delivered safely' : g.spec.civil ? 'Passengers delivered safely' : 'Safe landing'); f.health = 100; g.ammo.forEach((a) => { a.count = a.max; }); g.flares = g.spec.flares; msg('Aircraft repaired and rearmed', ''); }
          else earn(3000, 'Off-field landing');
        }
        g.pullUp = !f.onGround && f.vel.y < -12 && f.agl / -f.vel.y < 4.5 && f.gear < 0.9;
        if (f.stalled) G.audio.warn('stall', dt, 0); else if (g.pullUp && !g.missiles.length) G.audio.warn('pullup', dt, 0); else if (g.gearWarn && !g.missiles.length) G.audio.warn('gear', dt, 0);
      }
      predT -= dt; if (predT <= 0) { predT = 0.05; predictImpact(); }
    } else if (g.state === 'dead') { g.deadT += dt; g.camYaw += dt * 0.15; g.impact = null; }

    updateBombs(dt); updateThreats(dt); updateTraffic(dt); updateNaval(dt); updateBalloons(dt); updateMission(dt); updateRush(dt); updateLanding(dt);
    w.lodK = (g.H || 1080) * renderer.getPixelRatio() / 1080 * 0.5774 / Math.tan(camera.fov * 0.008727); // pixels per metre against 1080p at 60°
    w.update(dt, camera.position); syncModel(dt); updateCamera(dt); fx.update(dt, camera.position);
    const cockpit = g.view === 1 && g.state === 'fly';
    _a.copy(camera.position).sub(f.pos).normalize();
    G.audio.update({ rpm: f.rpm, ab: f.ab, V: f.V, mach: f.mach, cockpit, rear: _a.dot(_fwd.set(0, 0, 1).applyQuaternion(f.q)), active: g.state === 'fly', gearMove: g.gearMove, flapMove: g.flapMove, buffet: g.buffet, air: cockpit ? Math.max(0.5, Math.min(1, G.atmosphere(f.pos.y).rho / 0.25)) : Math.min(1, G.atmosphere(f.pos.y).rho / 0.25) }, dt);
    g.audioTransonic = g.state === 'fly' ? (G.audio.ctx ? G.audio.transonic || 0 : Math.exp(-Math.pow((f.mach - 1) / 0.055, 2))) : 0;
    if (G.audio.boomed) { G.audio.boomed = false; msg('SONIC BOOM — Mach 1', 'big'); fx.shake = Math.max(fx.shake, 0.6); }
    setOp(elFlash, clamp(fx.flash, 0, 1));
    const gl = f.nz > 7 ? (f.nz - 7) / 3 : f.nz < -2 ? (-2 - f.nz) / 2 : 0;
    g.vig = (g.vig || 0) + (clamp(gl, 0, 0.92) - (g.vig || 0)) * Math.min(1, dt * 1.5);
    setOp(elVig, g.state === 'fly' ? g.vig : 0);
    if (g.state === 'fly') { G.drawHUD(g); panelT -= dt; if (cockpit && panelT <= 0) { panelT = 0.1; G.drawPanel(g); } }
    else g.hctx.clearRect(0, 0, g.W, g.H);
    const hudOn = g.state === 'fly'; if (hudC._on !== hudOn) { hudC._on = hudOn; hudC.style.visibility = hudOn ? 'visible' : 'hidden'; } // the symbology goes with the aircraft
  }

  // overlay opacities are only written when they actually change, so an idle overlay costs no style work
  const elVig = $('vig'), elFlash = $('flash'), setOp = (el, v) => { v = Math.round(v * 200) / 200; if (el._op !== v) { el._op = v; el.style.opacity = v; } };
  function renderWorld() {
    renderer.render(scene, camera);
    const cp = g.model && g.model.userData.cockpit;
    if (cp && cp.visible && g.view === 1) {
      renderer.autoClear = false; renderer.shadowMap.autoUpdate = false; renderer.clearDepth(); camera.layers.set(1);
      renderer.render(scene, camera);
      camera.layers.set(0); renderer.shadowMap.autoUpdate = true; renderer.autoClear = true;
    }
  }
  const hPose = { gear: 1, flaps: 0, brake: 0, pitch: 0, roll: 0, yaw: 0, alpha: 0, onGround: true, V: 0, rpm: 0, ab: 0, throttle: 0, steer: 0, decel: 0, bump: 0, brakeTemp: 15, gearTarget: 1, flapsTarget: 0, nz: 0.2 };
  let last = performance.now(), fpsN = 0, fpsT = performance.now(), navT = 0;
  function setAutoLvl(l) { auto.lvl = l; auto.low = auto.ok = 0; auto.wait = 2.5; gfx.autoLvl = l; saveGfx(); applyGfx(); if (!$('settings').classList.contains('hidden')) syncGfxUI(); }
  // Auto quality controller, run once a frame with the real time since the last one
  const hz = []; let pauseR = 0, dtS = 1 / 60;
  function autoTune(raw) {
    if (g.state === 'hangar' && hz.length < 90 && raw < 0.1) { // the hangar is light enough to run at the screen's refresh rate: learn it
      hz.push(raw); if (hz.length === 90) { const m = hz.slice(20).sort((a, b) => a - b)[35], f = 1 / m; auto.refresh = f > 45 ? [50, 60, 72, 75, 90, 100, 120, 144, 165, 240].reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a)) : 60; }
    }
    if (!isAuto() || g.state !== 'fly') { auto.n = 0; auto.t = 0; return; }
    if (raw > 0.4) { auto.n = 0; auto.t = 0; auto.wait = Math.max(auto.wait, 1); return; } // tab switch or a one-off hitch: not the device's steady speed
    if (auto.wait > 0) { auto.wait -= raw; return; }
    auto.n++; auto.t += raw; if (auto.t < 1) return;
    const fps = auto.n / auto.t, tgt = Math.min(60, auto.refresh || 60, gfx.fpsCap || 60); auto.n = 0; auto.t = 0; auto.hold -= 1; auto.fps = fps;
    if (fps < tgt * 0.85) {
      auto.ok = 0; auto.low++;
      if ((auto.low >= 2 || fps < tgt * 0.55) && auto.lvl < LADDER.length - 1) {
        const to = Math.min(LADDER.length - 1, auto.lvl + (fps < tgt * 0.5 ? 2 : 1));
        if (auto.from === auto.lvl + 1) auto.backoff = Math.min(300, auto.backoff * 2); // it was tried one rung up and could not hold: wait longer before trying again
        auto.from = -1; auto.hold = auto.backoff; setAutoLvl(to);
      }
    } else if (fps >= tgt * 0.96) {
      auto.low = 0; auto.ok++;
      if (auto.ok >= 8 && auto.hold <= 0 && auto.lvl > 0) { auto.from = auto.lvl; setAutoLvl(auto.lvl - 1); }
    } else { auto.low = 0; auto.ok = 0; }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (gfx.fpsCap > 0 && now - last < 1000 / gfx.fpsCap - 1.5) return; // frame limiter
    const raw = (now - last) / 1000; last = now;
    // frame pacing: the display's own timing jitters by a millisecond or two; feeding that straight into the simulation
    // makes motion shimmer, so small variations are smoothed out and only real changes in frame time pass through
    let dt = Math.min(0.05, raw); dtS = Math.abs(dt - dtS) < 0.004 ? dtS + (dt - dtS) * 0.2 : dt; dt = dtS;
    autoTune(raw);
    fpsN++; if (now - fpsT >= 500) { if (gfx.showFps) $('fps').textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS · ' + renderer.info.render.calls + ' draws · ' + (renderer.info.render.triangles / 1e6).toFixed(2) + 'M tris · ' + renderer.getPixelRatio().toFixed(2) + 'x' + (isAuto() ? ' · auto ' + (auto.lvl + 1) + '/' + LADDER.length : ''); fpsN = 0; fpsT = now; }
    navT += dt; const nt = navT % 1.3; // navigation lights: strobe flashes, beacon pulses
    G.navMats.white.visible = nt < 0.07 || (nt > 0.18 && nt < 0.25); G.navMats.beacon.visible = (navT % 1.0) < 0.5;
    if (g.state === 'hangar') {
      if (!hDrag) hAng += dt * 0.12;
      const s = G.AIRCRAFT[hIdx], d = (Math.max(s.span, s.length) * 1.25 + 14) * hZoom;
      hcam.position.set(Math.sin(hAng) * Math.cos(hPitch) * d, s.gearH + 1 + Math.sin(hPitch) * d, Math.cos(hAng) * Math.cos(hPitch) * d);
      hcam.lookAt(0, s.gearH * 0.8, 0);
      if (hTest >= 0 && hModel && !s.rocket) { // control-surface test: flaps, air brakes, then a full stick and rudder sweep
        hTest += dt; const t = hTest, w = (a, b) => G.smoothstep(a, a + 1.2, t) * (1 - G.smoothstep(b, b + 1.2, t));
        hPose.flaps = w(0.2, 9.5); hPose.brake = w(2, 4.5); hPose.pitch = Math.sin(clamp(t - 5, 0, 3) * 2.094) * (t > 5 && t < 8 ? 1 : 0); hPose.roll = Math.sin(clamp(t - 6.5, 0, 3) * 2.094) * (t > 6.5 && t < 9.5 ? 1 : 0); hPose.yaw = hPose.roll; hPose.steer = hPose.yaw;
        hPose.rpm = w(1, 9) * 0.9; hPose.ab = w(3.5, 6.5);
        G.poseAircraft(hModel, hPose, dt); (hModel.userData.flames || []).forEach((fl) => { fl.visible = hPose.ab > 0.03; fl.scale.set(1, 1, Math.max(0.05, hPose.ab * (0.85 + Math.random() * 0.3))); });
        if (t > 11.5) hTest = -1;
      }
      renderer.render(hs, hcam);
    } else if (g.state === 'fly' || g.state === 'dead') { update(dt); renderWorld(); }
    else if (g.state === 'pause') { if (now - pauseR > 250) { pauseR = now; renderWorld(); } } // nothing moves while paused: redraw four times a second, not sixty
  }

  // ---------- boot
  setTimeout(() => {
    G.fx = new G.FX(scene);
    g.world = new G.World(scene);
    spawnTraffic(); spawnNaval(); spawnBalloons();
    scene.traverse((o) => { if (o.isLight) o.layers.enable(1); }); // the cockpit pass (layer 1) is lit by the same lights
    if (isAuto()) auto.lvl = autoStart();
    applyGfx();
    renderer.compile(scene, camera); // build every shader now, so none is compiled mid-flight (that is what causes first-look stutter)
    $('loading').classList.add('hidden');
    toHangar();
    requestAnimationFrame(frame);
  }, 60);
})();
