// 2D HUD overlay: pitch ladder, flight path marker, tapes, minimap, warnings, impact pipper, cockpit panel.
(function () {
  'use strict';
  const T = THREE, clamp = G.clamp;
  const _v = new T.Vector3(), _d = new T.Vector3();
  const GREEN = '#6dff8f', RED = '#ff4b3a', AMBER = '#ffc341';

  function proj(g, v, out) {
    _v.copy(v).applyMatrix4(g.camera.matrixWorldInverse);
    if (_v.z > -0.5) return false;
    _v.applyMatrix4(g.camera.projectionMatrix);
    out[0] = (_v.x * 0.5 + 0.5) * g.W; out[1] = (-_v.y * 0.5 + 0.5) * g.H;
    return true;
  }
  function projDir(g, yaw, p, out) {
    const cp = Math.cos(p);
    _d.set(-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp).multiplyScalar(5000).add(g.camera.position);
    return proj(g, _d, out);
  }
  const A = [0, 0], B = [0, 0], P = [0, 0];

  G.drawHUD = function (g) {
    const x = g.hctx, W = g.W, H = g.H, f = g.flight, e = f.euler();
    const pitch = e.x, yaw = e.y, roll = e.z;
    x.clearRect(0, 0, W, H);
    x.lineWidth = 1.6; x.strokeStyle = GREEN; x.fillStyle = GREEN; x.font = '13px Consolas, monospace'; x.textBaseline = 'middle';
    // (the dark halo that keeps the symbology readable over bright ground is a single CSS drop-shadow on the canvas,
    // set in game.js: one GPU pass a frame instead of a blurred shadow behind each of several hundred strokes)
    const pd = pitch * 57.3;

    // pitch ladder (world-conformal)
    for (let p = -80; p <= 80; p += 10) {
      if (Math.abs(p - pd) > 26) continue;
      const pr = p / 57.3, inner = p === 0 ? 0.035 : 0.05, outer = p === 0 ? 0.42 : 0.13;
      x.setLineDash(p < 0 ? [7, 5] : []);
      for (let s = -1; s <= 1; s += 2) {
        if (projDir(g, yaw + s * inner, pr, A) && projDir(g, yaw + s * outer, pr, B)) {
          x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
          if (p !== 0) { x.textAlign = s < 0 ? 'left' : 'right'; x.fillText(String(Math.abs(p)), B[0] - s * 4 + (s < 0 ? -26 : 26), B[1]); }
        }
      }
    }
    x.setLineDash([]);
    // boresight
    _d.set(0, 0, -1).applyQuaternion(f.q).multiplyScalar(5000).add(g.camera.position);
    if (proj(g, _d, A)) { x.beginPath(); x.moveTo(A[0] - 14, A[1]); x.lineTo(A[0] - 5, A[1]); x.lineTo(A[0], A[1] + 5); x.lineTo(A[0] + 5, A[1]); x.lineTo(A[0] + 14, A[1]); x.stroke(); }
    // flight path marker
    let fpm = false;
    if (f.V > 15) {
      _d.copy(f.vel).normalize().multiplyScalar(5000).add(g.camera.position);
      if (proj(g, _d, P)) {
        fpm = true;
        x.beginPath(); x.arc(P[0], P[1], 7, 0, 6.283); x.moveTo(P[0] - 7, P[1]); x.lineTo(P[0] - 20, P[1]); x.moveTo(P[0] + 7, P[1]); x.lineTo(P[0] + 20, P[1]); x.moveTo(P[0], P[1] - 7); x.lineTo(P[0], P[1] - 15); x.stroke();
      }
    }
    // bomb impact pipper
    if (g.impact && g.ammoCount() > 0 && proj(g, g.impact, A)) {
      x.strokeStyle = AMBER; x.fillStyle = AMBER;
      if (fpm) { x.beginPath(); x.moveTo(P[0], P[1] + 8); x.lineTo(A[0], A[1] - 12); x.stroke(); }
      x.beginPath(); x.arc(A[0], A[1], 12, 0, 6.283); x.stroke(); x.fillRect(A[0] - 1.5, A[1] - 1.5, 3, 3);
      x.textAlign = 'left'; x.fillText((g.impactT).toFixed(1) + 's', A[0] + 17, A[1]);
      x.strokeStyle = GREEN; x.fillStyle = GREEN;
    }

    // Moon marker for the rocket
    if (g.spec.rocket && proj(g, G.MOON.pos, A)) {
      x.strokeStyle = AMBER; x.fillStyle = AMBER; x.beginPath(); x.moveTo(A[0], A[1] - 14); x.lineTo(A[0] + 14, A[1]); x.lineTo(A[0], A[1] + 14); x.lineTo(A[0] - 14, A[1]); x.closePath(); x.stroke();
      x.textAlign = 'center'; x.fillText('MOON ' + Math.max(0, f.moonDist / 1000).toFixed(f.moonDist < 20000 ? 1 : 0) + ' km', A[0], A[1] + 28);
      x.strokeStyle = GREEN; x.fillStyle = GREEN;
    }
    // speed / altitude boxes
    const cy = H * 0.5, lx = W * 0.5 - Math.min(330, W * 0.3), rx = W * 0.5 + Math.min(330, W * 0.3);
    const boxed = (bx, by, txt, align) => {
      x.font = 'bold 20px Consolas, monospace'; const w = 86;
      x.strokeRect(align === 'r' ? bx : bx - w, by - 15, w, 30); x.textAlign = 'center'; x.fillText(txt, align === 'r' ? bx + w / 2 : bx - w / 2, by + 1);
      x.font = '13px Consolas, monospace';
    };
    const rk = !!g.spec.rocket, car = !!g.spec.car, hiAlt = f.pos.y > 30000;
    boxed(lx, cy, String(Math.round(car ? f.V * 3.6 : rk ? f.V : f.ias * G.KTS)), 'l');
    x.textAlign = 'right';
    x.fillText(car ? 'KM/H' : rk ? 'M/S' : 'KIAS', lx, cy - 26);
    if (car) x.fillText(f.speed < -0.3 ? 'REVERSE' : f.brake > 0.2 ? 'BRAKE' : f.surface === 'paved' ? 'ROAD' : 'OFF-ROAD', lx, cy + 28);
    else {
      x.fillText('M ' + f.mach.toFixed(2), lx, cy + 28);
      x.fillText('G ' + f.nz.toFixed(1), lx, cy + 46);
      x.fillText('AOA ' + (f.alpha * 57.3).toFixed(0) + '°', lx, cy + 64);
    }
    boxed(rx, cy, hiAlt ? (f.pos.y / 1000).toFixed(1) : String(Math.round(f.pos.y * G.FT / 10) * 10), 'r');
    x.textAlign = 'left';
    x.fillText(hiAlt ? 'ALT KM' : 'ALT FT', rx, cy - 26);
    x.fillText(hiAlt ? 'R ' + (Math.max(0, f.agl) / 1000).toFixed(1) + ' KM' : 'R ' + Math.round(Math.max(0, f.agl) * G.FT), rx, cy + 28);
    x.fillText('VS ' + Math.round(f.vel.y * 196.85 / 10) * 10, rx, cy + 46);

    // heading tape
    const hdg = ((-yaw * 57.2958) % 360 + 360) % 360, ty = 46, tw = Math.min(260, W * 0.25);
    x.save(); x.beginPath(); x.rect(W / 2 - tw, ty - 26, tw * 2, 44); x.clip();
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = Math.floor((hdg - 50) / 10) * 10; d <= hdg + 50; d += 10) {
      const px = W / 2 + (d - hdg) * (tw / 45), dd = ((d % 360) + 360) % 360;
      x.beginPath(); x.moveTo(px, ty + 4); x.lineTo(px, ty + 14); x.stroke();
      x.textAlign = 'center'; x.fillText(names[dd] || String(dd / 10).padStart(2, '0'), px, ty - 8);
    }
    x.restore();
    x.beginPath(); x.moveTo(W / 2, ty + 16); x.lineTo(W / 2 - 6, ty + 26); x.lineTo(W / 2 + 6, ty + 26); x.closePath(); x.stroke();
    x.textAlign = 'center'; x.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', W / 2, ty + 38);

    // status block (bottom right)
    const bx = W - 250, by = H - 150, spec = g.spec;
    x.textAlign = 'left'; x.font = '14px Consolas, monospace';
    const hasAB = spec.thrustAB > 0, thr = Math.round((hasAB ? Math.min(f.throttle / 0.9, 1) : f.throttle) * 100);
    x.strokeRect(bx, by, 14, 110); x.fillRect(bx + 2, by + 108 - 106 * f.throttle, 10, 106 * f.throttle);
    if (f.ab > 0.05) { x.fillStyle = AMBER; x.fillRect(bx + 2, by + 2, 10, 106 * 0.1 * f.ab); x.fillStyle = GREEN; }
    let ly = by + 6; const line = (t, c) => { x.fillStyle = c || GREEN; x.fillText(t, bx + 26, ly); ly += 19; };
    line('THR ' + thr + '%' + (f.ab > 0.5 ? '  AB' : ''), f.ab > 0.5 ? AMBER : GREEN);
    if (!spec.rocket && !spec.car) { // systems: gear lights, flap position, speed brake / wheel brakes
      const sx = bx, sy = by - 66, st = G.smoothstep, blinkS = (performance.now() % 400) < 240;
      x.font = '12px Consolas, monospace'; x.lineWidth = 1.4;
      x.fillStyle = GREEN; x.fillText('GEAR', sx, sy + 14);
      [[sx + 76, sy + 2, -0.06], [sx + 62, sy + 20, 0.05], [sx + 90, sy + 20, 0]].forEach((q) => {
        const dn = st(0.14 + q[2], 0.9 + q[2], f.gear), locked = f.gear >= 0.999, up = f.gear <= 0.001;
        x.strokeStyle = up ? 'rgba(109,255,143,0.45)' : locked ? GREEN : AMBER; x.strokeRect(q[0] - 6, q[1] - 6, 12, 12);
        if (locked) { x.fillStyle = GREEN; x.fillRect(q[0] - 4, q[1] - 4, 8, 8); }
        else if (!up) { x.fillStyle = f.gearOver && blinkS ? RED : AMBER; x.fillRect(q[0] - 4, q[1] - 4 + 8 * (1 - dn), 8, 8 * dn); }
      });
      x.fillStyle = f.gearOver ? RED : f.gear >= 0.999 ? GREEN : f.gear <= 0.001 ? GREEN : AMBER;
      x.fillText(f.gear >= 0.999 ? 'DOWN' : f.gear <= 0.001 ? 'UP' : (f.gearTarget ? 'EXTEND' : 'RETRACT'), sx, sy + 28);
      // flap gauge: track with three detents and a moving pointer
      const fx0 = sx + 122, fy0 = sy - 2, fh = 32, fc = f.flapOver ? RED : Math.abs(f.flaps - f.flapsTarget) > 1e-4 ? AMBER : GREEN;
      x.strokeStyle = GREEN; x.beginPath(); x.moveTo(fx0, fy0); x.lineTo(fx0, fy0 + fh); [0, 0.5, 1].forEach((d) => { x.moveTo(fx0, fy0 + d * fh); x.lineTo(fx0 + (d === f.flapsTarget ? 9 : 5), fy0 + d * fh); }); x.stroke();
      x.fillStyle = fc; x.beginPath(); x.moveTo(fx0 - 2, fy0 + f.flaps * fh); x.lineTo(fx0 - 10, fy0 + f.flaps * fh - 5); x.lineTo(fx0 - 10, fy0 + f.flaps * fh + 5); x.closePath(); x.fill();
      x.fillText('FLAP', fx0 + 14, fy0 + 6); x.fillText(f.flaps < 0.02 ? 'UP' : Math.round(f.flaps * (spec.maxG > 5 ? 25 : 40)) + '°' + (f.flapsTarget >= 1 ? ' FULL' : f.flapsTarget > 0 ? ' T/O' : ''), fx0 + 14, fy0 + 22);
      // brake bar: speed brake in the air, wheel brakes with disc temperature on the ground
      const hotC = f.brakeTemp > 520 ? RED : f.brakeTemp > 320 ? AMBER : GREEN;
      x.strokeStyle = GREEN; x.strokeRect(sx, sy + 40, 60, 9);
      x.fillStyle = f.onGround ? hotC : AMBER; x.fillRect(sx + 1.5, sy + 41.5, 57 * f.brake, 6);
      x.fillStyle = f.brake > 0.05 ? (f.onGround ? hotC : AMBER) : GREEN;
      x.fillText(f.onGround ? 'WHL BRK ' + (f.brakeTemp > 60 ? Math.round(f.brakeTemp / 10) * 10 + '°C' : '') : 'SPD BRK' + (f.brake > 0.05 ? ' ' + Math.round(f.brake * 100) + '%' : ''), sx + 68, sy + 45);
      if (!f.onGround && f.brakeTemp > 120) { x.fillStyle = hotC; x.fillText('BRK ' + Math.round(f.brakeTemp / 10) * 10 + '°C', sx + 150, sy + 45); }
      x.font = '14px Consolas, monospace'; x.lineWidth = 1.6; x.strokeStyle = GREEN;
    }
    const w = g.currentWeapon();
    line(w ? w.def.short + '  × ' + w.count : (spec.rocket ? 'G ' + f.nz.toFixed(1) + '  LOCAL g ' + f.gLocal.toFixed(1) : spec.civil ? 'CIVIL — NO WEAPONS' : 'NO WEAPONS'), w && w.count === 0 ? RED : GREEN);
    if (spec.flares) line('FLARES ' + g.flares);
    if (f.fuel !== undefined) line('FUEL ' + Math.round(f.fuel * 100) + '%', f.fuel < 0.15 ? RED : GREEN);
    line('HULL ' + Math.max(0, Math.round(f.health)) + '%', f.health < 50 ? RED : GREEN);
    x.fillStyle = GREEN;

    // warnings
    x.textAlign = 'center'; x.font = 'bold 22px Consolas, monospace';
    let wy = H * 0.26; const blink = (performance.now() % 500) < 300;
    const warnTxt = (t, c) => { x.fillStyle = c; x.fillText(t, W / 2, wy); wy += 28; };
    if (g.missiles.length && blink) warnTxt('MISSILE  —  BREAK / FLARES [C]', RED);
    else if (g.locked && !g.missiles.length) { x.font = 'bold 15px Consolas, monospace'; warnTxt('RADAR LOCK', AMBER); x.font = 'bold 22px Consolas, monospace'; }
    if (f.stalled && blink) warnTxt('STALL', RED);
    if (g.pullUp && blink) warnTxt('PULL UP', RED);
    else if (g.gearWarn && blink) warnTxt('LANDING GEAR  [G]', RED);
    if (!spec.rocket) {
      x.font = 'bold 15px Consolas, monospace';
      if (f.gearOver) warnTxt('GEAR OVERSPEED — LIMIT ' + f.vle + ' KT', AMBER);
      if (f.flapOver) warnTxt('FLAP OVERSPEED — LIMIT ' + f.vfe + ' KT', AMBER);
      if (f.onGround && f.brakeTemp > 520) warnTxt('HOT BRAKES', AMBER);
      x.font = 'bold 22px Consolas, monospace';
    }
    if (g.audioTransonic > 0.25) { x.font = 'bold 15px Consolas, monospace'; warnTxt('TRANSONIC BUFFET', AMBER); }
    if (f.onGround && f.V < 3 && f.throttle < 0.05 && g.time < 12 && g.spec.rocket) { x.font = '15px Consolas, monospace'; warnTxt('Hold SHIFT to ignite · W/S pitch · A/D yaw · Q/E roll · Z cuts the engines', GREEN); }
    else if (g.spec.car) { if (f.V < 1 && g.time < 12) { x.font = '15px Consolas, monospace'; warnTxt('W / ↑ drive · S / ↓ brake, then reverse · A / D steer · B handbrake · V driver view', GREEN); } }
    else if (f.onGround && f.V < 3 && f.throttle < 0.05 && g.time < 12) { x.font = '15px Consolas, monospace'; warnTxt('Hold SHIFT for throttle · pull back [S / ↓] at rotation speed · H = help', GREEN); }
    x.fillStyle = GREEN; x.font = '13px Consolas, monospace';

    // missile direction arrows
    g.missiles.forEach((m) => {
      _d.copy(m.pos).applyMatrix4(g.camera.matrixWorldInverse);
      const a = Math.atan2(_d.x, -_d.y === 0 ? 1e-6 : _d.y), r = Math.min(W, H) * 0.3;
      const ang = Math.atan2(-_d.y, _d.x); // screen angle
      const px = W / 2 + Math.cos(ang) * r, py = H / 2 + Math.sin(ang) * r;
      x.save(); x.translate(px, py); x.rotate(ang); x.fillStyle = RED;
      x.beginPath(); x.moveTo(14, 0); x.lineTo(-8, -8); x.lineTo(-8, 8); x.closePath(); x.fill(); x.restore();
      x.fillStyle = RED; x.textAlign = 'center'; x.fillText((m.dist / 1000).toFixed(1) + ' km', px, py + 22); x.fillStyle = GREEN;
    });

    // mission target markers and steering cue
    const ms = g.mission || g.landNav;
    if (ms && (g.landNav || g.assistLevel() >= 1) && (ms.phase === 'attack' || ms.phase === 'rtb')) {
      const pts = ms.phase === 'attack' ? ms.targets.filter((t) => t.alive).map((t) => ({ x: t.x, y: 10, z: t.z, n: 'SAM' })) : [{ x: ms.rtb.x, y: 2, z: ms.rtb.z + 1700, n: 'LAND ' + ms.rtb.name.toUpperCase() }];
      let best = null, bd = 1e12; x.font = '12px Consolas, monospace';
      pts.forEach((t) => {
        const d = Math.hypot(t.x - f.pos.x, t.z - f.pos.z); if (d < bd) { bd = d; best = t; }
        _d.set(t.x, t.y, t.z);
        if (proj(g, _d, A) && A[0] > 0 && A[0] < W && A[1] > 0 && A[1] < H) {
          const c = ms.phase === 'attack' ? RED : GREEN, s = 11; x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 1.8;
          x.beginPath(); x.moveTo(A[0] - s, A[1] - s + 5); x.lineTo(A[0] - s, A[1] - s); x.lineTo(A[0] - s + 5, A[1] - s); x.moveTo(A[0] + s - 5, A[1] - s); x.lineTo(A[0] + s, A[1] - s); x.lineTo(A[0] + s, A[1] - s + 5);
          x.moveTo(A[0] + s, A[1] + s - 5); x.lineTo(A[0] + s, A[1] + s); x.lineTo(A[0] + s - 5, A[1] + s); x.moveTo(A[0] - s + 5, A[1] + s); x.lineTo(A[0] - s, A[1] + s); x.lineTo(A[0] - s, A[1] + s - 5); x.stroke();
          x.textAlign = 'center'; x.fillText(t.n + ' ' + (d / 1000).toFixed(1) + 'km', A[0], A[1] - s - 8);
        }
      });
      if (best) { // arrow toward the nearest objective when it is off-screen
        _d.set(best.x, best.y, best.z); const on = proj(g, _d, A) && A[0] > 40 && A[0] < W - 40 && A[1] > 40 && A[1] < H - 40;
        if (!on) {
          _d.set(best.x, best.y, best.z).applyMatrix4(g.camera.matrixWorldInverse); const ang = Math.atan2(-_d.y, _d.x), rr = Math.min(W, H) * 0.36, px = W / 2 + Math.cos(ang) * rr, py = H / 2 + Math.sin(ang) * rr, c = ms.phase === 'attack' ? RED : GREEN;
          x.save(); x.translate(px, py); x.rotate(ang); x.strokeStyle = c; x.lineWidth = 2.4; x.beginPath(); x.moveTo(-10, -9); x.lineTo(8, 0); x.lineTo(-10, 9); x.stroke(); x.restore();
          x.fillStyle = c; x.textAlign = 'center'; x.fillText(best.n + ' ' + (bd / 1000).toFixed(1) + 'km', px, py + 24);
        }
        if (ms.phase === 'attack' && g.impact && Math.hypot(g.impact.x - best.x, g.impact.z - best.z) < 55 && (performance.now() % 300) < 190) { x.fillStyle = AMBER; x.font = 'bold 20px Consolas, monospace'; x.textAlign = 'center'; x.fillText('RELEASE', W / 2, H * 0.62); }
      }
      x.strokeStyle = GREEN; x.fillStyle = GREEN; x.lineWidth = 1.6; x.font = '13px Consolas, monospace';
    }
    // minimap (heading-up)
    const mr = 88, mcx = 108, mcy = H - 108, wd = g.world;
    x.save(); x.shadowBlur = 0;
    x.beginPath(); x.arc(mcx, mcy, mr, 0, 6.283); x.clip();
    x.fillStyle = '#0b1218'; x.fillRect(mcx - mr, mcy - mr, mr * 2, mr * 2);
    x.translate(mcx, mcy); x.rotate(yaw);
    const range = g.mapRange, ppm = mr / range, s = ppm / wd.mapScale;
    x.globalAlpha = 0.9;
    x.drawImage(wd.mapCanvas, -wd.mx(f.pos.x) * s, -wd.mz(f.pos.z) * s, wd.mapCanvas.width * s, wd.mapCanvas.height * s);
    x.globalAlpha = 1;
    const dot = (wx, wz, c, r) => { x.fillStyle = c; x.beginPath(); x.arc((wx - f.pos.x) * ppm, (wz - f.pos.z) * ppm, r, 0, 6.283); x.fill(); };
    G.AIRPORTS.forEach((a) => { x.fillStyle = '#e8edf2'; x.fillRect((a.x - f.pos.x) * ppm - 1.5, (a.z - 1800 - f.pos.z) * ppm, 3, Math.max(4, 3600 * ppm)); });
    wd.sams.forEach((sm) => { if (sm.alive && Math.abs(sm.x - f.pos.x) < range && Math.abs(sm.z - f.pos.z) < range) dot(sm.x, sm.z, '#ff3b30', 3.2); });
    if (g.mission && g.mission.phase === 'attack') g.mission.targets.forEach((t) => { if (t.alive) { x.strokeStyle = '#ffffff'; x.lineWidth = 1.2; x.beginPath(); x.arc((t.x - f.pos.x) * ppm, (t.z - f.pos.z) * ppm, 6, 0, 6.283); x.stroke(); } });
    const rtbP = g.mission && g.mission.phase === 'rtb' ? g.mission.rtb : g.landNav ? g.landNav.rtb : null;
    if (rtbP) { x.strokeStyle = '#6dff8f'; x.lineWidth = 2; x.beginPath(); x.arc((rtbP.x - f.pos.x) * ppm, (rtbP.z - f.pos.z) * ppm, 8, 0, 6.283); x.stroke(); }
    if (range >= 30000) { x.fillStyle = '#e8edf2'; x.font = '10px Consolas, monospace'; x.textAlign = 'center'; G.CITIES.forEach((ct) => { if (ct.town) return; x.save(); x.translate((ct.x - f.pos.x) * ppm, (ct.z - f.pos.z) * ppm); x.rotate(-yaw); x.fillText(ct.name, 0, -8); x.restore(); }); }
    g.traffic.forEach((t) => { if (t.model.visible) dot(t.model.position.x, t.model.position.z, '#ffffff', 2); });
    g.missiles.forEach((m) => dot(m.pos.x, m.pos.z, '#ffe04a', 2.5));
    (g.blimps || []).forEach((b) => { if (b.alive) dot(b.m.position.x, b.m.position.z, '#ffd24a', 3); });
    (g.subs || []).forEach((s) => { if (s.alive && s.depth < 0.6) dot(s.m.position.x, s.m.position.z, s.friendly ? '#4ad8ff' : '#ff8a3a', 2.6); });
    x.fillStyle = '#e8edf2'; x.fillRect((G.CARRIER.x - f.pos.x) * ppm - 2, (G.CARRIER.z - 166 - f.pos.z) * ppm, 4, Math.max(6, 332 * ppm));
    if (g.impact) dot(g.impact.x, g.impact.z, AMBER, 2);
    x.restore();
    x.strokeStyle = GREEN; x.beginPath(); x.arc(mcx, mcy, mr, 0, 6.283); x.stroke();
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(mcx, mcy - 7); x.lineTo(mcx - 5, mcy + 5); x.lineTo(mcx + 5, mcy + 5); x.closePath(); x.fill();
    x.fillStyle = GREEN; x.textAlign = 'center'; x.fillText((range / 1000) + ' km', mcx, mcy + mr + 12);
    // bearing to city / runway
    const brg = (tx, tz, label, yy) => {
      const b = (Math.atan2(tx - f.pos.x, -(tz - f.pos.z)) * 57.2958 + 360) % 360, d = Math.hypot(tx - f.pos.x, tz - f.pos.z);
      x.textAlign = 'left'; x.fillText(label + ' ' + String(Math.round(b)).padStart(3, '0') + '° ' + (d / 1000).toFixed(1) + 'km', mcx + mr + 14, yy);
    };
    let nap = G.AIRPORTS[0], nd = 1e12; G.AIRPORTS.concat([{ name: 'Carrier', x: G.CARRIER.x, z: G.CARRIER.z - 1700 }]).forEach((a) => { const d = Math.hypot(a.x - f.pos.x, a.z - f.pos.z); if (d < nd) { nd = d; nap = a; } });
    let nct = G.CITIES[0], ncd = 1e12; G.CITIES.forEach((ct) => { if (ct.town) return; const d = Math.hypot(ct.x - f.pos.x, ct.z - f.pos.z); if (d < ncd) { ncd = d; nct = ct; } });
    brg(nct.x, nct.z, nct.name.toUpperCase(), H - 60); brg(nap.x, nap.z + 1700, 'RWY  ' + nap.name.toUpperCase(), H - 42);
    x.shadowBlur = 0;
  };

  // cockpit instrument panel: two multi-function displays drawn into a texture
  G.drawPanel = function (g) {
    const c = G.panelCanvas, x = c.getContext('2d'), f = g.flight, e = f.euler();
    x.fillStyle = '#16191c'; x.fillRect(0, 0, 512, 256);
    const bezel = (bx) => { x.fillStyle = '#2a2f35'; x.fillRect(bx - 6, 10, 236, 236); x.fillStyle = '#02060a'; x.fillRect(bx, 16, 224, 224); };
    bezel(16); bezel(272);
    // left display: attitude
    x.save(); x.beginPath(); x.rect(16, 16, 224, 224); x.clip();
    x.translate(128, 128); x.rotate(e.z); x.translate(0, e.x * 210);
    x.fillStyle = '#2470c8'; x.fillRect(-500, -700, 1000, 700); x.fillStyle = '#6e4a25'; x.fillRect(-500, 0, 1000, 700);
    x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.beginPath(); x.moveTo(-500, 0); x.lineTo(500, 0); x.stroke();
    x.fillStyle = '#ffffff'; x.font = '13px monospace'; x.textAlign = 'center';
    for (let p = -80; p <= 80; p += 10) { if (!p) continue; const yy = -p / 57.3 * 210; x.beginPath(); x.moveTo(-34, yy); x.lineTo(34, yy); x.stroke(); x.fillText(String(Math.abs(p)), 50, yy + 4); }
    x.restore();
    x.strokeStyle = '#ffd23a'; x.lineWidth = 4; x.beginPath(); x.moveTo(68, 128); x.lineTo(108, 128); x.lineTo(128, 142); x.lineTo(148, 128); x.lineTo(188, 128); x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(18, 108, 52, 40); x.fillRect(186, 108, 52, 40);
    x.fillStyle = '#7dffa0'; x.font = 'bold 17px monospace'; x.textAlign = 'center';
    x.fillText(String(Math.round(f.ias * G.KTS)), 44, 134); x.fillText(String(Math.round(f.pos.y * G.FT)), 212, 134);
    // right display: flight and engine data
    x.textAlign = 'left'; x.font = 'bold 17px monospace';
    const row = (k, v, y, col) => { x.fillStyle = '#5f8fa8'; x.fillText(k, 284, y); x.fillStyle = col || '#7dffa0'; x.fillText(v, 364, y); };
    row('HDG', String(Math.round(((-e.y * 57.3) % 360 + 360) % 360)).padStart(3, '0') + '°', 40);
    row('MACH', f.mach.toFixed(2), 61);
    row('G', f.nz.toFixed(1), 82, f.nz > 7 ? '#ffb13a' : '#7dffa0');
    row('AOA', (f.alpha * 57.3).toFixed(0) + '°', 103, f.stalled ? '#ff5040' : '#7dffa0');
    row('VS', String(Math.round(f.vel.y * 196.85 / 10) * 10), 124);
    const bar = (k, v, y, col) => { x.fillStyle = '#5f8fa8'; x.fillText(k, 284, y); x.strokeStyle = '#3f6070'; x.lineWidth = 1; x.strokeRect(344, y - 13, 140, 14); x.fillStyle = col; x.fillRect(346, y - 11, 136 * G.clamp(v, 0, 1), 10); };
    bar('RPM', f.rpm, 147, '#7dffa0'); bar('THR', f.throttle, 168, f.ab > 0.3 ? '#ffb13a' : '#7dffa0');
    // systems: gear lights, flaps, brakes
    x.fillStyle = '#5f8fa8'; x.fillText('GEAR', 284, 191);
    [[352, -0.06], [376, 0.05], [400, 0]].forEach((q) => {
      const locked = f.gear >= 0.999, up = f.gear <= 0.001;
      x.strokeStyle = '#3f6070'; x.strokeRect(q[0] - 8, 177, 16, 16);
      if (!up) { x.fillStyle = locked ? '#7dffa0' : f.gearOver ? '#ff5040' : '#ffb13a'; x.fillRect(q[0] - 6, 179, 12, 12 * G.smoothstep(0.14 + q[1], 0.9 + q[1], f.gear)); }
    });
    x.fillStyle = f.gear >= 0.999 ? '#7dffa0' : f.gear <= 0.001 ? '#5f8fa8' : '#ffb13a'; x.fillText(f.gear >= 0.999 ? 'DN' : f.gear <= 0.001 ? 'UP' : '···', 422, 191);
    bar('FLAP', f.flaps, 212, f.flapOver ? '#ff5040' : '#7dffa0');
    const w = g.currentWeapon(), hot = f.brakeTemp > 520;
    x.fillStyle = f.brake > 0.05 || hot ? (hot ? '#ff5040' : '#ffb13a') : '#ffd23a';
    x.fillText(f.brake > 0.05 || hot ? (f.onGround ? 'WHL BRK ' + Math.round(f.brakeTemp / 10) * 10 + '°C' : 'SPEED BRAKE ' + Math.round(f.brake * 100) + '%') : (w ? w.def.short + ' x' + w.count : 'NO STORES'), 284, 234);
    G.panelTexture().needsUpdate = true;
  };
})();
