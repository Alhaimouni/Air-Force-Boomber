// Procedural aircraft models. Nose points to -Z, up +Y, right wing +X. Units: metres.
(function () {
  'use strict';
  const T = THREE;

  function std(color, metal, rough) {
    return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough, side: T.DoubleSide });
  }
  const M = {
    dark: std(0x1b1d20, 0.6, 0.5),
    tire: std(0x111111, 0.0, 0.9),
    strut: std(0xb8bcc2, 0.8, 0.35),
    glass: new T.MeshStandardMaterial({ color: 0x1a2a33, metalness: 0.95, roughness: 0.06, transparent: true, opacity: 0.72 }),
    goldGlass: new T.MeshStandardMaterial({ color: 0x5a4a1c, metalness: 1.0, roughness: 0.08, transparent: true, opacity: 0.8 }),
    white: std(0xe9ecee, 0.3, 0.4),
    red: std(0xb02a25, 0.3, 0.5)
  };

  function surf(pts, t, mat) {
    const sh = new T.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const bt = t * 0.45;
    const g = new T.ExtrudeGeometry(sh, { depth: t * 0.1, bevelEnabled: true, bevelThickness: bt, bevelSize: Math.min(t * 1.2, 0.25), bevelOffset: -Math.min(t * 1.2, 0.25), bevelSegments: 2, steps: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, t * 0.05, 0);
    return new T.Mesh(g, mat);
  }
  function fin(pts, t, mat) {
    const sh = new T.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const bt = t * 0.45;
    const g = new T.ExtrudeGeometry(sh, { depth: t * 0.1, bevelEnabled: true, bevelThickness: bt, bevelSize: Math.min(t, 0.2), bevelOffset: -Math.min(t, 0.2), bevelSegments: 2, steps: 1 });
    g.rotateY(-Math.PI / 2); g.translate(t * 0.05, 0, 0);
    return new T.Mesh(g, mat);
  }
  function fus(profile, sx, sy, mat, seg) {
    const pts = profile.map((p) => new T.Vector2(Math.max(p[1], 0.001), p[0]));
    const g = new T.LatheGeometry(pts, seg || 22);
    g.rotateX(Math.PI / 2); g.scale(sx, sy, 1);
    g.computeVertexNormals();
    return new T.Mesh(g, mat);
  }
  function blob(sx, sy, sz, mat) {
    const g = new T.SphereGeometry(1, 20, 14); g.scale(sx, sy, sz);
    return new T.Mesh(g, mat);
  }
  function cyl(r1, r2, len, mat, open) { // along Z, r1 at front (-z)
    const g = new T.CylinderGeometry(r2, r1, len, 18, 1, !!open); g.rotateX(Math.PI / 2);
    return new T.Mesh(g, mat);
  }
  function box(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }
  function both(parent, obj) {
    parent.add(obj);
    const f = new T.Group(); f.scale.x = -1; f.add(obj.clone()); parent.add(f);
    return obj;
  }

  function addGear(model, s, noseZ, mainZ, track, wr, bellyY, twin) {
    const g = new T.Group();
    const mk = (x, z, r, dbl) => {
      const len = s.gearH + bellyY - r;
      const st = new T.Mesh(new T.CylinderGeometry(r * 0.16, r * 0.16, len, 8), M.strut);
      st.position.set(x, bellyY - len / 2, z); g.add(st);
      const wg = new T.CylinderGeometry(r, r, r * 0.55, 16); wg.rotateZ(Math.PI / 2);
      const offs = dbl ? [-r * 0.45, r * 0.45] : [0];
      offs.forEach((o) => { const w = new T.Mesh(wg, M.tire); w.position.set(x + o, -s.gearH + r, z); g.add(w); });
    };
    mk(0, noseZ, wr * 0.75, twin);
    mk(track, mainZ, wr, twin); mk(-track, mainZ, wr, twin);
    model.add(g);
    model.userData.gear = g;
  }

  function addFlames(model, engines, r, len) {
    const flames = [];
    engines.forEach((e) => {
      const grp = new T.Group(); grp.position.set(e[0], e[1], e[2]);
      const g1 = new T.ConeGeometry(r, len, 14, 1, true); g1.rotateX(Math.PI / 2); g1.translate(0, 0, len / 2);
      const g2 = new T.ConeGeometry(r * 0.55, len * 0.6, 12, 1, true); g2.rotateX(Math.PI / 2); g2.translate(0, 0, len * 0.3);
      const m1 = new T.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
      const m2 = new T.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
      grp.add(new T.Mesh(g1, m1), new T.Mesh(g2, m2));
      grp.visible = false; model.add(grp); flames.push(grp);
    });
    model.userData.flames = flames;
  }

  function a320Texture(tailColor) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#eef0f2'; x.fillRect(0, 0, 512, 1024);
    const vy = (v) => 1024 * (1 - v);
    // belly
    x.fillStyle = '#c9ced4'; x.fillRect(0, 0, 512 * 0.12, 1024); x.fillRect(512 * 0.88, 0, 512 * 0.12, 1024);
    // cheat line
    x.fillStyle = tailColor;
    [0.235, 0.765].forEach((u) => x.fillRect(512 * u - 5, vy(6 / 7), 10, vy(2.2 / 7) - vy(6 / 7)));
    // cabin windows (between profile index 4 and 5)
    x.fillStyle = '#1b2530';
    for (let i = 0; i < 36; i++) {
      const v = 4 / 7 + (i + 0.8) / 37.5 / 7;
      [0.292, 0.708].forEach((u) => x.fillRect(512 * u - 3.5, vy(v) - 1, 7, 2.2));
    }
    // doors
    x.strokeStyle = '#8a9099'; x.lineWidth = 1;
    [4.03 / 7, 4.97 / 7].forEach((v) => [0.275, 0.725].forEach((u) => x.strokeRect(512 * u - 14, vy(v) - 2, 28, 4)));
    // cockpit windshield
    x.fillStyle = '#10161d';
    x.fillRect(512 * 0.33, vy(2.25 / 7), 512 * 0.34, vy(1.72 / 7) - vy(2.25 / 7));
    x.fillStyle = '#eef0f2'; x.fillRect(512 * 0.495, vy(2.25 / 7), 5, 40);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }

  const builders = {
    f16(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7c858e, 0.55, 0.42), b2 = std(0x5d666f, 0.55, 0.45);
      core.add(fus([[-7.5, 0], [-7.2, 0.12], [-6, 0.38], [-4.5, 0.62], [-3, 0.78], [0, 0.85], [3.5, 0.82], [6.3, 0.68], [7.3, 0.55]], 1, 1, b));
      core.add(at(fus([[-7.5, 0], [-7.2, 0.125], [-6.3, 0.34]], 1, 1, b2), 0, 0, -0.01));
      core.add(at(fus([[-3.6, 0.3], [-3.4, 0.55], [0, 0.62], [3, 0.4]], 1.15, 0.7, b), 0, -0.72, -0.6));
      core.add(at(cyl(0.5, 0.5, 0.12, M.dark), 0, -0.72, -4.15));
      both(m, at(surf([[0.7, -1.6], [4.75, 1.9], [4.75, 3.0], [0.7, 3.5]], 0.15, b), 0, 0.12, 0));
      both(m, at(surf([[0.3, -5.4], [0.95, -1.6], [0.95, 3.2], [0.3, 3.2]], 0.1, b), 0, 0.12, 0));
      const hs = at(surf([[0.55, 5.0], [2.75, 6.5], [2.75, 7.3], [0.55, 7.1]], 0.1, b), 0, 0, 0); hs.rotation.z = -0.17; both(m, hs);
      m.add(fin([[2.4, 0.6], [5.9, 3.9], [7.0, 3.9], [7.1, 0.6]], 0.14, b2));
      const vf = at(fin([[5, -0.4], [5.6, -1.2], [6.5, -1.2], [6.6, -0.4]], 0.06, b), 0.45, 0, 0); vf.rotation.z = 0.25; both(m, vf);
      core.add(at(blob(0.46, 0.55, 1.75, M.goldGlass), 0, 0.6, -3.9));
      m.add(at(cyl(0.6, 0.5, 1.0, M.dark, true), 0, 0, 7.6));
      both(m, at(cyl(0.07, 0.07, 2.8, M.white), 4.82, 0.12, 2.3));
      m.userData.engines = [[0, 0, 8.0]]; m.userData.tips = [[4.8, 0.12, 3], [-4.8, 0.12, 3]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -3.6, 0.8, 1.2, 0.35, -0.75);
      m.userData.core = core; return m;
    },
    f22(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7d848c, 0.6, 0.4), b2 = std(0x666d75, 0.6, 0.42);
      core.add(fus([[-9.45, 0], [-9, 0.15], [-7.5, 0.5], [-5.5, 0.85], [-3, 1.1], [2, 1.15], [7, 1.0], [8.6, 0.85]], 1.6, 0.8, b, 8));
      both(m, at(surf([[1.5, -2.6], [6.78, 3.1], [6.78, 4.5], [1.5, 5.9]], 0.18, b), 0, 0.1, 0));
      both(m, at(surf([[0.6, -6.6], [1.7, -2.6], [1.7, 5.9], [0.6, 5.9]], 0.16, b), 0, 0.1, 0));
      both(m, at(surf([[1.4, 5.6], [4.4, 8.2], [4.4, 9.6], [2.4, 9.9], [1.4, 8.6]], 0.12, b), 0, 0.05, 0));
      const vt = at(fin([[2.2, 0], [4.6, 2.9], [6.6, 2.9], [7.4, 0]], 0.13, b2), 1.9, 0.55, 0); vt.rotation.z = -0.49; both(m, vt);
      const it = at(box(1.0, 0.95, 3.2, b), 1.5, -0.2, -3.6); it.rotation.z = 0.25; both(m, it);
      both(m, at(box(0.95, 0.9, 0.1, M.dark), 1.5, -0.2, -5.22));
      both(m, at(box(1.15, 0.55, 1.4, M.dark), 0.8, 0.02, 9.0));
      core.add(at(blob(0.55, 0.62, 2.1, M.goldGlass), 0, 0.72, -5.4));
      m.userData.engines = [[0.8, 0, 9.7], [-0.8, 0, 9.7]]; m.userData.tips = [[6.7, 0.1, 4], [-6.7, 0.1, 4]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -5.4, 1.2, 1.6, 0.4, -0.85);
      m.userData.core = core; return m;
    },
    f35(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x5f666d, 0.6, 0.42), b2 = std(0x4f565d, 0.6, 0.45);
      core.add(fus([[-7.85, 0], [-7.5, 0.14], [-6, 0.5], [-4, 0.85], [-1.5, 1.05], [2.5, 1.05], [5.5, 0.85], [7.2, 0.62]], 1.4, 0.98, b, 10));
      both(m, at(surf([[1.3, -1.0], [5.35, 2.3], [5.35, 3.4], [1.3, 4.6]], 0.18, b), 0, 0.2, 0));
      both(m, at(surf([[1.3, 4.6], [3.6, 6.6], [3.6, 7.9], [1.3, 7.6]], 0.12, b), 0, 0.1, 0));
      const vt = at(fin([[2.4, 0], [4.8, 2.5], [6.2, 2.5], [6.6, 0]], 0.13, b2), 1.25, 0.65, 0); vt.rotation.z = -0.35; both(m, vt);
      const it = at(box(0.8, 0.95, 2.6, b), 1.35, 0.0, -3.0); it.rotation.y = -0.12; both(m, it);
      both(m, at(box(0.7, 0.85, 0.1, M.dark), 1.5, 0.0, -4.3));
      core.add(at(blob(0.5, 0.6, 1.9, M.goldGlass), 0, 0.78, -4.6));
      m.add(at(cyl(0.66, 0.55, 1.1, M.dark, true), 0, 0, 7.6));
      m.userData.engines = [[0, 0, 8.1]]; m.userData.tips = [[5.3, 0.2, 3], [-5.3, 0.2, 3]];
      addFlames(m, m.userData.engines, 0.55, 7);
      addGear(m, s, -4.2, 0.9, 1.5, 0.38, -0.9);
      m.userData.core = core; return m;
    },
    su27(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x8ba0b6, 0.5, 0.45), b2 = std(0x6d8299, 0.5, 0.45), b3 = std(0xdfe4e8, 0.4, 0.5);
      const pod = at(fus([[-10.95, 0], [-10.5, 0.15], [-8.5, 0.55], [-6.5, 0.85], [-4.5, 0.95], [-1, 0.8], [4, 0.5], [10.9, 0.18]], 1, 1, b), 0, 0.4, 0);
      pod.rotation.x = -0.035; core.add(pod);
      const rad = at(fus([[-10.95, 0], [-10.5, 0.155], [-9.2, 0.42]], 1, 1, b3), 0, 0.4, -0.02); rad.rotation.x = -0.035; core.add(rad);
      both(m, at(fus([[-1.6, 0.55], [-1.2, 0.74], [6, 0.74], [8.6, 0.62]], 1, 1, b2), 1.45, -0.4, 0));
      const it = at(box(1.2, 1.05, 2.8, b2), 1.45, -0.55, -2.4); both(m, it);
      both(m, at(box(1.1, 0.95, 0.1, M.dark), 1.45, -0.55, -3.82));
      both(m, at(surf([[0, -6.8], [1.6, -2.6], [2.2, -2.6], [2.2, 6.2], [0, 6.2]], 0.32, b), 0, 0.12, 0));
      both(m, at(surf([[2.0, -2.6], [7.35, 3.3], [7.35, 4.9], [2.0, 5.6]], 0.18, b), 0, 0.12, 0));
      both(m, at(surf([[2.1, 6.4], [4.9, 9.2], [4.9, 10.3], [2.1, 9.9]], 0.12, b), 0, 0.0, 0));
      both(m, at(fin([[4.6, 0], [7.4, 3.9], [8.8, 3.9], [9.2, 0]], 0.14, b2), 2.15, 0.3, 0));
      core.add(at(blob(0.55, 0.62, 2.2, M.glass), 0, 1.12, -6.3));
      both(m, at(cyl(0.64, 0.52, 1.0, M.dark, true), 1.45, -0.4, 9.0));
      both(m, at(cyl(0.08, 0.08, 3.0, M.white), 7.4, 0.12, 4.0));
      m.userData.engines = [[1.45, -0.4, 9.5], [-1.45, -0.4, 9.5]]; m.userData.tips = [[7.4, 0.12, 4.8], [-7.4, 0.12, 4.8]];
      addFlames(m, m.userData.engines, 0.52, 7);
      addGear(m, s, -5.6, 1.0, 2.2, 0.45, -1.0);
      m.userData.core = core; return m;
    },
    su57(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x6c7b8e, 0.55, 0.42), b2 = std(0x4f5c6e, 0.55, 0.45);
      core.add(at(fus([[-10, 0], [-9.6, 0.14], [-8, 0.5], [-6, 0.85], [-3.5, 1.0], [0, 0.8], [5, 0.5], [10, 0.2]], 1.3, 0.85, b, 10), 0, 0.3, 0));
      both(m, at(surf([[0, -7.2], [2.4, -2.9], [2.7, -2.9], [2.7, 6.6], [0, 6.6]], 0.36, b), 0, 0.1, 0));
      both(m, at(surf([[2.5, -2.2], [7.05, 3.4], [7.05, 4.6], [2.5, 6.2]], 0.18, b2), 0, 0.1, 0));
      both(m, at(surf([[2.5, 6.3], [4.7, 8.6], [4.7, 9.7], [2.5, 9.6]], 0.12, b2), 0, 0.05, 0));
      const vt = at(fin([[4.8, 0], [6.4, 2.3], [7.8, 2.3], [8.4, 0]], 0.13, b2), 2.5, 0.2, 0); vt.rotation.z = -0.45; both(m, vt);
      both(m, at(fus([[-2.2, 0.5], [-1.6, 0.72], [6, 0.72], [8.8, 0.6]], 1, 1, b2), 1.55, -0.35, 0));
      both(m, at(box(1.25, 1.0, 2.6, b2), 1.55, -0.5, -2.6));
      both(m, at(box(1.15, 0.9, 0.1, M.dark), 1.55, -0.5, -3.92));
      core.add(at(blob(0.55, 0.6, 2.1, M.goldGlass), 0, 1.0, -5.6));
      both(m, at(cyl(0.62, 0.52, 1.0, M.dark, true), 1.55, -0.35, 9.2));
      m.userData.engines = [[1.55, -0.35, 9.7], [-1.55, -0.35, 9.7]]; m.userData.tips = [[7, 0.1, 4.2], [-7, 0.1, 4.2]];
      addFlames(m, m.userData.engines, 0.52, 7);
      addGear(m, s, -5.2, 1.2, 2.2, 0.42, -0.95);
      m.userData.core = core; return m;
    },
    a10(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x66706b, 0.35, 0.6), b2 = std(0x545e59, 0.35, 0.6);
      core.add(fus([[-8.1, 0], [-7.8, 0.3], [-6.5, 0.62], [-4, 0.8], [2, 0.78], [6, 0.5], [8.1, 0.2]], 1, 1.05, b));
      const w = at(surf([[0.6, -1.3], [8.76, -0.5], [8.76, 1.3], [0.6, 2.1]], 0.32, b), 0, -0.5, 0); w.rotation.z = 0.05; both(m, w);
      both(m, at(fus([[-1.4, 0.2], [-1.0, 0.36], [1.6, 0.36], [2.4, 0.1]], 1, 1, b2), 2.6, -0.85, 0.6));
      both(m, at(fus([[-1.7, 0.6], [-1.5, 0.8], [1.2, 0.8], [1.9, 0.55]], 1, 1, b2), 1.6, 1.25, 4.0));
      both(m, at(cyl(0.7, 0.7, 0.08, M.dark), 1.6, 1.25, 2.38));
      both(m, at(box(0.9, 0.25, 1.4, b), 0.95, 0.85, 4.0));
      both(m, at(surf([[0, 6.6], [2.9, 6.7], [2.9, 8.0], [0, 8.1]], 0.16, b), 0, 0.15, 0));
      both(m, at(fin([[6.5, -0.5], [6.9, 2.3], [8.0, 2.3], [8.2, -0.5]], 0.14, b2), 2.9, 0.15, 0));
      core.add(at(blob(0.45, 0.55, 1.5, M.glass), 0, 0.85, -4.9));
      m.add(at(cyl(0.13, 0.13, 1.5, M.dark), -0.1, -0.4, -8.2));
      m.userData.engines = [[1.6, 1.25, 6.0], [-1.6, 1.25, 6.0]]; m.userData.tips = [[8.7, -0.1, 1], [-8.7, -0.1, 1]];
      m.userData.flames = [];
      addGear(m, s, -5.6, 0.6, 2.6, 0.45, -0.8);
      m.userData.core = core; return m;
    },
    b2(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x3b3f45, 0.45, 0.5), b2 = std(0x2c2f34, 0.45, 0.5);
      const half = [[0, -10.5], [26.2, 6.5], [23.0, 8.58], [15.0, 3.39], [9.0, 7.28], [5.5, 5.0], [0, 8.57]];
      const pts = half.concat(half.slice(1, -1).reverse().map((p) => [-p[0], p[1]]));
      m.add(at(surf(pts, 0.75, b), 0, 0, 0));
      const hump = at(blob(3.3, 1.55, 7.2, b), 0, 0.45, -2.6); core.add(hump);
      core.add(at(blob(2.6, 1.1, 2.2, M.dark), 0, 0.98, -6.4));
      both(m, at(blob(2.3, 1.05, 5.2, b), 5.2, 0.4, -0.6));
      both(m, at(box(2.6, 0.5, 0.3, M.dark), 5.2, 0.95, -3.9));
      both(m, at(box(2.4, 0.1, 2.2, b2), 5.2, 0.55, 4.6));
      m.userData.engines = [[4.3, 0.6, 5.2], [6.1, 0.6, 5.2], [-4.3, 0.6, 5.2], [-6.1, 0.6, 5.2]];
      m.userData.tips = [[25.5, 0, 7.5], [-25.5, 0, 7.5]];
      m.userData.flames = [];
      addGear(m, s, -5.5, 1.5, 6.0, 0.65, -0.6, true);
      m.userData.core = core; return m;
    },
    mig29(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x98a29c, 0.5, 0.45), b2 = std(0x7b8780, 0.5, 0.45);
      const pod = at(fus([[-8.65, 0], [-8.2, 0.14], [-6.5, 0.5], [-5, 0.75], [-3, 0.8], [0, 0.6], [4, 0.4], [8.6, 0.15]], 1, 1, b), 0, 0.35, 0); core.add(pod);
      both(m, at(surf([[0, -5.6], [1.3, -2.0], [1.8, -2.0], [1.8, 5.0], [0, 5.0]], 0.3, b), 0, 0.1, 0));
      both(m, at(surf([[1.7, -2.0], [5.68, 2.6], [5.68, 3.8], [1.7, 4.6]], 0.16, b), 0, 0.1, 0));
      both(m, at(surf([[1.6, 5.2], [3.8, 7.4], [3.8, 8.3], [1.6, 8.0]], 0.11, b), 0, 0, 0));
      const vt = at(fin([[3.4, 0], [5.8, 3.2], [6.9, 3.2], [7.2, 0]], 0.12, b2), 1.65, 0.25, 0); vt.rotation.z = -0.1; both(m, vt);
      both(m, at(fus([[-1.5, 0.45], [-1.1, 0.62], [5, 0.62], [7, 0.52]], 1, 1, b2), 0.95, -0.4, 0));
      both(m, at(box(1.0, 0.85, 2.3, b2), 0.95, -0.5, -2.2)); both(m, at(box(0.9, 0.75, 0.1, M.dark), 0.95, -0.5, -3.36));
      core.add(at(blob(0.48, 0.55, 1.7, M.glass), 0, 0.95, -5.0));
      both(m, at(cyl(0.54, 0.45, 0.9, M.dark, true), 0.95, -0.4, 7.4));
      m.userData.engines = [[0.95, -0.4, 7.9], [-0.95, -0.4, 7.9]]; m.userData.tips = [[5.6, 0.1, 3.4], [-5.6, 0.1, 3.4]];
      addFlames(m, m.userData.engines, 0.45, 6);
      addGear(m, s, -4.4, 0.8, 1.6, 0.38, -0.9);
      m.userData.core = core; return m;
    },
    rafale(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7f8992, 0.55, 0.42), b2 = std(0x69737c, 0.55, 0.45);
      core.add(fus([[-7.6, 0], [-7.3, 0.12], [-6, 0.42], [-4, 0.72], [-1.5, 0.9], [3.5, 0.9], [6.4, 0.75], [7.4, 0.6]], 1.1, 0.95, b));
      both(m, at(surf([[0.9, -1.6], [5.4, 4.6], [5.4, 5.4], [0.9, 5.9]], 0.15, b), 0, -0.05, 0));
      const cn = at(surf([[0.8, -3.4], [2.3, -1.9], [2.3, -1.5], [0.8, -1.8]], 0.08, b2), 0, 0.4, 0); cn.rotation.z = 0.06; both(m, cn);
      m.add(fin([[2.2, 0.7], [5.7, 4.3], [6.7, 4.3], [7.1, 0.7]], 0.14, b2));
      both(m, at(blob(0.5, 0.42, 1.7, b), 0.85, -0.45, -2.4)); both(m, at(cyl(0.34, 0.34, 0.06, M.dark), 0.9, -0.45, -3.9));
      core.add(at(blob(0.45, 0.55, 1.7, M.glass), 0, 0.72, -4.2));
      both(m, at(cyl(0.44, 0.38, 0.9, M.dark, true), 0.46, 0, 7.6));
      both(m, at(cyl(0.07, 0.07, 2.6, M.white), 5.45, -0.05, 4.6));
      m.userData.engines = [[0.46, 0, 8.1], [-0.46, 0, 8.1]]; m.userData.tips = [[5.4, 0, 5.2], [-5.4, 0, 5.2]];
      addFlames(m, m.userData.engines, 0.38, 5.5);
      addGear(m, s, -3.8, 1.2, 1.3, 0.35, -0.85);
      m.userData.core = core; return m;
    },
    typhoon(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x8b939b, 0.55, 0.42), b2 = std(0x737c85, 0.55, 0.45);
      core.add(fus([[-8, 0], [-7.6, 0.14], [-6, 0.5], [-4, 0.75], [-1, 0.85], [4, 0.82], [7, 0.72], [7.9, 0.6]], 1.1, 0.95, b));
      both(m, at(surf([[0.8, -2.0], [5.45, 5.2], [5.45, 6.0], [0.8, 6.3]], 0.15, b), 0, -0.1, 0));
      const cn = at(surf([[0.6, -5.3], [2.0, -4.2], [2.0, -3.85], [0.6, -4.1]], 0.07, b2), 0, 0.3, 0); cn.rotation.z = -0.22; both(m, cn);
      m.add(fin([[2.5, 0.7], [6.3, 4.6], [7.4, 4.6], [7.6, 0.7]], 0.14, b2));
      m.add(at(box(1.5, 0.75, 3.4, b), 0, -0.95, -1.6)); m.add(at(box(1.4, 0.65, 0.1, M.dark), 0, -0.95, -3.32));
      core.add(at(blob(0.46, 0.55, 1.7, M.glass), 0, 0.7, -4.5));
      both(m, at(cyl(0.46, 0.4, 0.9, M.dark, true), 0.48, 0, 8.1));
      both(m, at(cyl(0.1, 0.1, 2.2, b2), 5.5, -0.1, 5.2));
      m.userData.engines = [[0.48, 0, 8.6], [-0.48, 0, 8.6]]; m.userData.tips = [[5.45, -0.1, 5.8], [-5.45, -0.1, 5.8]];
      addFlames(m, m.userData.engines, 0.4, 6);
      addGear(m, s, -4.2, 1.6, 1.4, 0.36, -0.9);
      m.userData.core = core; return m;
    },
    j20(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x444a52, 0.6, 0.4), b2 = std(0x363b42, 0.6, 0.42);
      core.add(fus([[-10.6, 0], [-10.1, 0.15], [-8.5, 0.5], [-6, 0.9], [-3, 1.1], [3, 1.15], [8, 1.0], [10.2, 0.8]], 1.5, 0.8, b, 8));
      both(m, at(surf([[1.6, -1.5], [6.5, 5.6], [6.5, 6.6], [1.6, 8.2]], 0.18, b), 0, 0.05, 0));
      both(m, at(surf([[0.6, -7.2], [1.7, -3.0], [1.7, 8.0], [0.6, 8.0]], 0.16, b), 0, 0.1, 0));
      const cn = at(surf([[1.5, -4.6], [3.7, -2.6], [3.7, -2.0], [1.5, -2.2]], 0.1, b2), 0, 0.25, 0); cn.rotation.z = 0.12; both(m, cn);
      const vt = at(fin([[4.8, 0], [6.6, 2.7], [8.0, 2.7], [8.8, 0]], 0.13, b2), 1.75, 0.5, 0); vt.rotation.z = -0.46; both(m, vt);
      const vf = at(fin([[6.4, 0], [7.0, -1.1], [8.4, -1.1], [8.8, 0]], 0.08, b2), 1.5, -0.5, 0); vf.rotation.z = 0.35; both(m, vf);
      const it = at(box(1.0, 0.95, 3.0, b), 1.5, -0.2, -4.2); it.rotation.z = 0.2; both(m, it);
      both(m, at(box(0.95, 0.9, 0.1, M.dark), 1.5, -0.2, -5.72));
      core.add(at(blob(0.55, 0.62, 2.2, M.goldGlass), 0, 0.72, -6.6));
      both(m, at(cyl(0.6, 0.5, 1.0, M.dark, true), 0.8, 0, 10.6));
      m.userData.engines = [[0.8, 0, 11.1], [-0.8, 0, 11.1]]; m.userData.tips = [[6.4, 0.05, 6.2], [-6.4, 0.05, 6.2]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -6.0, 1.6, 1.8, 0.42, -0.9);
      m.userData.core = core; return m;
    },
    b1(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x4d5259, 0.5, 0.45), b2 = std(0x3d4248, 0.5, 0.48);
      core.add(fus([[-22.2, 0], [-21.5, 0.4], [-19, 1.1], [-15, 1.5], [-5, 1.6], [8, 1.5], [16, 1.0], [22.2, 0.3]], 1.1, 1, b, 20));
      both(m, at(surf([[1.2, -12], [4.4, -4], [4.4, 6], [1.2, 8.5]], 0.6, b), 0, -0.1, 0));
      both(m, at(surf([[4.0, -3.5], [18.0, 5.5], [18.0, 7.8], [4.0, 2.6]], 0.4, b), 0, 0, 0));
      both(m, at(surf([[0.6, 15.5], [6.8, 20.5], [6.8, 22.0], [0.6, 20.6]], 0.25, b), 0, 2.2, 0));
      m.add(fin([[13, 1.2], [19.5, 9.2], [21.6, 9.2], [21.9, 1.2]], 0.4, b2));
      both(m, at(fus([[-4.4, 0.85], [-3.8, 1.05], [3.2, 1.05], [4.4, 0.85]], 1.9, 0.85, b2, 12), 3.4, -1.45, 2.4));
      both(m, at(box(3.6, 1.5, 0.12, M.dark), 3.4, -1.45, -2.05));
      core.add(at(blob(1.15, 0.6, 1.9, M.dark), 0, 1.05, -17.6));
      const eng = [[2.5, -1.45, 6.9], [4.3, -1.45, 6.9], [-2.5, -1.45, 6.9], [-4.3, -1.45, 6.9]];
      eng.forEach((e) => m.add(at(cyl(0.72, 0.6, 0.9, M.dark, true), e[0], e[1], e[2] - 0.1)));
      m.userData.engines = eng.map((e) => [e[0], e[1], e[2] + 0.5]); m.userData.tips = [[17.8, 0, 7], [-17.8, 0, 7]];
      addFlames(m, m.userData.engines, 0.6, 8);
      addGear(m, s, -14, 2.5, 2.4, 0.6, -1.5, true);
      m.userData.core = core; return m;
    },
    tu160(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0xe6e9ec, 0.35, 0.4), b2 = std(0xc9ced3, 0.4, 0.42);
      core.add(fus([[-27, 0], [-26, 0.5], [-22, 1.3], [-16, 1.7], [0, 1.8], [14, 1.5], [22, 1.0], [27, 0.4]], 1.05, 1, b, 20));
      both(m, at(surf([[1.2, -17], [6.6, -3], [6.6, 9], [1.2, 12]], 0.7, b), 0, -0.2, 0));
      both(m, at(surf([[6.2, -3], [23.0, 8], [23.0, 10.5], [6.2, 4]], 0.45, b), 0, -0.1, 0));
      both(m, at(surf([[0.6, 19], [6.6, 24.5], [6.6, 26], [0.6, 25]], 0.28, b), 0, 3.4, 0));
      m.add(fin([[15, 1.5], [23, 10], [25.5, 10], [26.5, 1.5]], 0.45, b));
      both(m, at(fus([[-6, 0.95], [-5.2, 1.2], [4, 1.2], [5.6, 0.95]], 2.0, 0.9, b2, 12), 4.3, -1.75, 4.4));
      both(m, at(box(4.2, 1.7, 0.12, M.dark), 4.3, -1.75, -1.65));
      core.add(at(blob(1.2, 0.6, 2.2, M.dark), 0, 1.2, -21.2));
      const eng = [[3.2, -1.75, 10.2], [5.4, -1.75, 10.2], [-3.2, -1.75, 10.2], [-5.4, -1.75, 10.2]];
      eng.forEach((e) => m.add(at(cyl(0.9, 0.75, 1.0, M.dark, true), e[0], e[1], e[2] - 0.2)));
      m.userData.engines = eng.map((e) => [e[0], e[1], e[2] + 0.5]); m.userData.tips = [[22.8, -0.1, 9.5], [-22.8, -0.1, 9.5]];
      addFlames(m, m.userData.engines, 0.75, 10);
      addGear(m, s, -17, 3, 2.7, 0.65, -1.7, true);
      m.userData.core = core; return m;
    },
    b52(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x5a605b, 0.35, 0.6), b2 = std(0x484e4a, 0.35, 0.6);
      core.add(fus([[-24.2, 0], [-23.5, 0.8], [-21, 1.6], [-17, 1.9], [10, 1.9], [18, 1.3], [24.2, 0.5]], 1, 1.15, b, 20));
      const w = at(surf([[1.5, -8], [28.2, 6], [28.2, 8.2], [1.5, -0.2]], 0.6, b), 0, 1.7, 0); w.rotation.z = -0.035; both(m, w);
      both(m, at(surf([[0.8, 18], [8, 22], [8, 24], [0.8, 23.5]], 0.3, b), 0, 0.8, 0));
      m.add(fin([[17, 1.6], [20.5, 11], [23.5, 11], [24, 1.6]], 0.4, b2));
      const eng = [];
      [10, 18].forEach((x) => {
        const z = -8 + (x - 1.5) * 0.52 - 0.5, y = 1.7 - x * 0.035 - 1.6;
        both(m, at(fus([[-2.6, 0.7], [-2.3, 0.86], [1.4, 0.86], [2.5, 0.6]], 1.95, 1, b2, 12), x, y, z));
        both(m, at(box(1.7, 1.5, 0.1, M.dark), x, y, z - 2.62)); both(m, at(box(0.3, 1.2, 3.2, b2), x, y + 0.9, z + 0.6));
        eng.push([x, y, z + 3], [-x, y, z + 3]);
      });
      both(m, at(fus([[-1.5, 0.1], [-1, 0.5], [3, 0.5], [4, 0.1]], 1, 1, b2, 10), 21, 0.6, 5.5));
      core.add(at(blob(1.5, 0.55, 1.6, M.dark), 0, 1.7, -21.4));
      m.userData.engines = eng; m.userData.tips = [[28, 0.7, 7.5], [-28, 0.7, 7.5]];
      m.userData.flames = [];
      addGear(m, s, -15, 4, 1.6, 0.65, -2.0, true);
      m.userData.core = core; return m;
    },
    rocket(s) { // lies along -Z like the aircraft; the flight model stands it upright
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const or = std(0xd8742a, 0.2, 0.6), wh = std(0xeeeeea, 0.3, 0.45), dk = std(0x2a2c30, 0.6, 0.5);
      core.add(fus([[-8, 4.2], [34, 4.2], [35, 3.4]], 1, 1, or, 24));
      core.add(fus([[-23, 2.6], [-20, 2.7], [-14, 4.2], [-8, 4.2]], 1, 1, wh, 24));
      core.add(fus([[-30.5, 0.6], [-27, 2.5], [-23, 2.6]], 1, 1, wh, 20));
      core.add(fus([[-37, 0.1], [-35, 0.5], [-30.5, 0.6]], 1, 1, dk, 10));
      core.add(at(cyl(4.25, 4.25, 1.2, dk), 0, 0, -8)); core.add(at(cyl(4.25, 4.25, 0.8, dk), 0, 0, 20));
      [-6.2, 6.2].forEach((x) => {
        core.add(at(fus([[-9, 0], [-5, 1.9], [34, 1.9], [36, 2.3]], 1, 1, wh, 16), x, 0, 0));
        core.add(at(cyl(1.4, 2.0, 2.4, dk, true), x, 0, 37)); core.add(at(box(0.5, 0.6, 3, dk), x * 0.82, 0, 10)); core.add(at(box(0.5, 0.6, 3, dk), x * 0.82, 0, 28));
      });
      [[2, 2], [-2, 2], [2, -2], [-2, -2]].forEach((p) => core.add(at(cyl(0.9, 1.5, 2.6, dk, true), p[0], p[1], 36.2)));
      core.add(at(box(0.3, 9, 5, or), 0, 0, 32)); core.add(at(box(1.2, 0.5, 0.5, dk), 0, 2.6, -25));
      m.userData.engines = [[0, 0, 38], [6.2, 0, 38.5], [-6.2, 0, 38.5]]; m.userData.tips = [];
      addFlames(m, m.userData.engines, 2.3, 34);
      m.userData.core = core; return m;
    },
    a320(s, opt) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const liveries = ['#1c4fa0', '#c0262c', '#e98a15', '#16806a', '#5a2d82'];
      const col = liveries[(opt && opt.livery) || 0];
      const fm = new T.MeshStandardMaterial({ map: a320Texture(col), metalness: 0.3, roughness: 0.4, side: T.DoubleSide });
      const wm = std(0xd4d8dc, 0.5, 0.4), tm = std(new T.Color(col).getHex(), 0.3, 0.45);
      core.add(fus([[-18.8, 0], [-18.3, 0.6], [-17, 1.35], [-15, 1.85], [-13.5, 1.98], [9, 1.98], [14, 1.4], [18.8, 0.35]], 1, 1, fm, 28));
      const w = at(surf([[1.7, -3.5], [17.0, 5.2], [17.0, 6.8], [6.5, 3.6], [1.7, 3.4]], 0.55, wm), 0, -1.15, 0); w.rotation.z = 0.095; both(m, w);
      both(m, at(fin([[5.2, 0.4], [6.6, 2.0], [7.1, 2.0], [6.9, 0.4]], 0.1, tm), 17.0, 0.1, 0));
      both(m, at(fus([[-2.6, 0.95], [-2.4, 1.12], [0.5, 1.14], [2.2, 0.7]], 1, 1, M.white, 20), 5.75, -2.3, -1.4));
      both(m, at(cyl(1.0, 1.0, 0.1, M.dark), 5.75, -2.3, -3.85));
      both(m, at(box(0.25, 0.9, 3.0, wm), 5.75, -1.35, -0.6));
      const hs = at(surf([[1.0, 13.6], [6.2, 16.6], [6.2, 17.8], [1.0, 17.2]], 0.3, wm), 0, 0.6, 0); hs.rotation.z = 0.1; both(m, hs);
      m.add(fin([[11.5, 1.6], [16.2, 7.7], [18.0, 7.7], [18.3, 1.2]], 0.4, tm));
      m.userData.engines = [[5.75, -2.3, 1.2], [-5.75, -2.3, 1.2]]; m.userData.tips = [[17, 0.5, 6.5], [-17, 0.5, 6.5]];
      m.userData.flames = [];
      addGear(m, s, -13.5, 1.8, 3.8, 0.6, -1.9, true);
      m.userData.core = core; return m;
    }
  };

  // cockpit interior placed at the pilot eye point
  function addCockpit(model, s) {
    const c = new T.Group();
    const e = s.cam.cockpit; c.position.set(e[0], e[1], e[2]);
    const mk = (col, r, m) => new T.MeshStandardMaterial({ color: col, roughness: r, metalness: m || 0.1 });
    const frame = mk(0x474e56, 0.5, 0.55), dark = mk(0x1b1e22, 0.9), mid = mk(0x2c3138, 0.8), trim = mk(0x5c646d, 0.45, 0.6);
    const panelMat = new T.MeshBasicMaterial({ map: G.panelTexture(), fog: false, toneMapped: false });
    const heavy = ['a320', 'b2', 'b1', 'b52', 'tu160'].indexOf(s.id) >= 0;
    const put = (o, x, y, z, rx, rz) => { o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; c.add(o); return o; };
    if (heavy) {
      const cx = 0.5; // cabin centreline; the eye is the left seat
      put(box(2.4, 0.045, 0.5, dark), cx, -0.27, -0.72);
      put(box(2.4, 0.7, 0.3, dark), cx, -0.66, -0.74);
      [0, 1.0].forEach((x) => put(new T.Mesh(new T.PlaneGeometry(0.72, 0.36), panelMat), x, -0.47, -0.585, -0.16));
      put(box(0.26, 0.34, 0.02, mid), cx, -0.47, -0.59, -0.16);
      // windshield frame
      [-0.44, cx, 1.44].forEach((x) => put(box(0.045, 0.86, 0.05, frame), x, 0.1, -0.98, -0.34));
      put(box(2.4, 0.06, 0.07, frame), cx, 0.48, -0.84);
      put(box(2.4, 0.04, 0.05, trim), cx, -0.245, -0.96);
      [-0.66, 1.66].forEach((x) => { put(box(0.05, 0.8, 0.05, frame), x, 0.1, -0.35); put(box(0.05, 0.05, 1.5, frame), x, -0.27, -0.2); put(box(0.05, 0.05, 1.5, frame), x, 0.48, -0.2); put(box(0.05, 0.5, 1.9, mid), x - Math.sign(x - cx) * -0.02, -0.53, -0.1); });
      put(box(0.05, 0.8, 0.05, frame), -0.66, 0.1, 0.5);
      put(box(1.1, 0.05, 0.95, dark), cx, 0.56, -0.2); put(box(2.5, 0.05, 2.0, mid), cx, 0.64, 0.0);
      put(box(0.42, 0.34, 1.0, mid), cx, -0.66, -0.15);
      [-0.07, 0.07].forEach((x) => put(box(0.035, 0.14, 0.04, trim), cx + x, -0.45, -0.25, -0.5));
      put(box(0.04, 0.16, 0.04, trim), -0.42, -0.5, -0.38, -0.3);
      put(box(0.5, 0.75, 0.12, dark), 0, -0.35, 0.42);
    } else {
      const bodyCol = (model.userData.core && model.userData.core.children[0].material.color) || new T.Color(0x6a7078);
      const nose = blob(0.4, 0.22, 2.9, new T.MeshStandardMaterial({ color: bodyCol, metalness: 0.5, roughness: 0.45 })); put(nose, 0, -1.02, -3.5);
      put(box(0.68, 0.04, 0.38, dark), 0, -0.29, -0.6);
      put(box(0.68, 0.62, 0.3, dark), 0, -0.63, -0.7);
      put(new T.Mesh(new T.PlaneGeometry(0.6, 0.3), panelMat), 0, -0.465, -0.545, -0.2);
      both(c, at(box(0.17, 0.05, 1.1, mid), 0.36, -0.56, -0.02));
      both(c, at(box(0.04, 0.32, 1.9, mid), 0.47, -0.43, 0.0));
      both(c, at(box(0.035, 0.035, 2.4, frame), 0.47, -0.27, -0.05));
      put(new T.Mesh(new T.TorusGeometry(0.47, 0.014, 8, 32, Math.PI), frame), 0, -0.27, -0.76);
      put(new T.Mesh(new T.TorusGeometry(0.47, 0.02, 8, 32, Math.PI), frame), 0, -0.27, 0.6);
      // HUD combiner
      both(c, at(box(0.007, 0.21, 0.007, trim), 0.098, -0.105, -0.6));
      put(box(0.2, 0.007, 0.007, trim), 0, 0.0, -0.6);
      put(box(0.22, 0.06, 0.1, dark), 0, -0.245, -0.58);
      put(new T.Mesh(new T.PlaneGeometry(0.19, 0.2), new T.MeshBasicMaterial({ color: 0x8dffb0, transparent: true, opacity: 0.045, depthWrite: false, fog: false })), 0, -0.1, -0.6);
      // stick, throttle, seat
      put(new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.22, 8), trim), s.id === 'f16' || s.id === 'f35' || s.id === 'f22' ? 0.3 : 0, -0.58, -0.3);
      put(box(0.035, 0.07, 0.035, dark), s.id === 'f16' || s.id === 'f35' || s.id === 'f22' ? 0.3 : 0, -0.46, -0.3);
      put(box(0.05, 0.06, 0.1, trim), -0.36, -0.51, -0.25);
      put(box(0.34, 0.5, 0.1, dark), 0, -0.2, 0.42);
      const glass = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.05, side: T.BackSide, depthWrite: false, fog: false }));
      glass.scale.set(0.5, 0.6, 1.5); put(glass, 0, -0.27, -0.05);
    }
    c.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    c.visible = false; model.add(c); model.userData.cockpit = c;
  }

  let panelTex = null;
  G.panelCanvas = document.createElement('canvas'); G.panelCanvas.width = 512; G.panelCanvas.height = 256;
  G.panelTexture = function () {
    if (!panelTex) { panelTex = new T.CanvasTexture(G.panelCanvas); panelTex.colorSpace = T.SRGBColorSpace; }
    return panelTex;
  };

  // ---------- shared detail: panel lines, navigation lights, pilot, pitot, external stores
  function panelTexture(rx, ry) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = G.rng(21);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9; i++) { const v = 232 + Math.floor(r() * 23); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 256, r() * 256, 40 + r() * 90, 30 + r() * 80); }
    x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 1.2;
    [0, 64, 128, 192].forEach((p) => { x.beginPath(); x.moveTo(p + 0.5, 0); x.lineTo(p + 0.5, 256); x.stroke(); x.beginPath(); x.moveTo(0, p + 0.5); x.lineTo(256, p + 0.5); x.stroke(); });
    x.strokeStyle = 'rgba(0,0,0,0.18)'; [32, 160].forEach((p) => { x.beginPath(); x.moveTo(p, 64); x.lineTo(p, 192); x.stroke(); });
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let p = 8; p < 256; p += 16) { [3, 67, 131, 195].forEach((q) => { x.fillRect(p, q, 1.6, 1.6); x.fillRect(q, p, 1.6, 1.6); }); }
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.strokeRect(84, 84, 30, 18); x.strokeRect(150, 20, 22, 26);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  let texExtr = null, texLathe = null; const detailCache = new Map();
  G.navMats = {
    red: new T.MeshBasicMaterial({ color: 0xff2a1a, fog: false, toneMapped: false }), green: new T.MeshBasicMaterial({ color: 0x22ff55, fog: false, toneMapped: false }),
    white: new T.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false }), beacon: new T.MeshBasicMaterial({ color: 0xff3020, fog: false, toneMapped: false })
  };
  function decorate(m, spec, opt) {
    const detail = !opt || opt.detail || !opt.noCockpit, lights = detail || (opt && opt.lights);
    if (!texExtr) { texExtr = panelTexture(0.33, 0.33); texLathe = panelTexture(5, 9); }
    m.traverse((o) => {
      if (!o.isMesh || !o.material.isMeshStandardMaterial || o.material.map || o.material.transparent || o.material === M.tire || o.material === M.dark) return;
      const ty = o.geometry.type; if (ty !== 'ExtrudeGeometry' && ty !== 'LatheGeometry') return;
      const key = o.material.uuid + ty; let mat = detailCache.get(key);
      if (!mat) { mat = o.material.clone(); mat.map = ty === 'ExtrudeGeometry' ? texExtr : texLathe; detailCache.set(key, mat); }
      o.material = mat;
    });
    if (spec.rocket || !lights) return;
    const ud = m.userData, big = spec.span > 22, k = clamp(spec.span / 12, 0.8, 2.4), lg = new T.SphereGeometry(0.11 * k, 8, 6);
    if (ud.tips && ud.tips.length >= 2) {
      const r = new T.Mesh(lg, G.navMats.green); r.position.set(ud.tips[0][0], ud.tips[0][1], ud.tips[0][2] - 0.6); m.add(r);
      const l = new T.Mesh(lg, G.navMats.red); l.position.set(ud.tips[1][0], ud.tips[1][1], ud.tips[1][2] - 0.6); m.add(l);
    }
    const st = new T.Mesh(lg, G.navMats.white); st.position.set(0, 0.25, spec.length * 0.49); m.add(st);
    const bc = new T.Mesh(lg, G.navMats.beacon); bc.position.set(0, -(big ? 2.0 : 0.95), 0); m.add(bc);
    if (!detail) return;
    if (!big) { // fighters: pilot, pitot probe, blade antennas, bombs on wing pylons
      const e = spec.cam.cockpit, core = ud.core || m;
      core.add(at(new T.Mesh(new T.SphereGeometry(0.15, 10, 8), std(0xd8dade, 0.2, 0.5)), e[0], e[1] - 0.02, e[2] + 0.12));
      core.add(at(box(0.36, 0.42, 0.26, std(0x4a5240, 0.1, 0.9)), e[0], e[1] - 0.36, e[2] + 0.16));
      core.add(at(box(0.3, 0.5, 0.1, M.dark), e[0], e[1] - 0.2, e[2] + 0.42));
      m.add(at(cyl(0.022, 0.022, 1.3, M.strut), 0, 0, -spec.length / 2 - 0.5));
      m.add(at(box(0.03, 0.32, 0.4, M.dark), 0, 0.95, 0.5)); m.add(at(box(0.03, 0.26, 0.34, M.dark), 0, -0.95, 2.2));
      const first = spec.weapons[0];
      if (first) {
        ud.stores = [];
        for (let i = 0; i < 6; i++) {
          const side = i % 2 ? -1 : 1, kk = Math.floor(i / 2), x = side * spec.span * (0.2 + 0.085 * kk), bomb = G.buildBomb(G.WEAPONS[first.type]);
          bomb.position.set(x, -0.42, 1.3 + kk * 0.5); m.add(bomb);
          m.add(at(box(0.07, 0.3, 1.1, M.dark), x, -0.16, 1.3 + kk * 0.5));
          ud.stores.push(bomb);
        }
      }
    } else { // heavies: antennas along the spine and a landing-light pair
      [-0.2, 0.05, 0.25].forEach((t) => m.add(at(box(0.05, 0.5, 0.7, M.dark), 0, spec.id === 'b2' ? 1.9 : 2.1, spec.length * t)));
    }
  }
  const clamp = G.clamp;

  G.buildAircraft = function (spec, opt) {
    const m = builders[spec.id](spec, opt || {});
    m.traverse((o) => { if (o.isMesh && !(o.material.blending === T.AdditiveBlending)) { o.castShadow = true; } });
    decorate(m, spec, opt);
    m.traverse((o) => { if (o.isMesh && o.material && (o.material === G.navMats.red || o.material === G.navMats.green || o.material === G.navMats.white || o.material === G.navMats.beacon)) o.castShadow = false; });
    if ((!opt || !opt.noCockpit) && !spec.rocket) addCockpit(m, spec);
    return m;
  };

  G.buildBomb = function (w) {
    const g = new T.Group();
    const mat = std(w.color, 0.4, 0.6);
    const L = w.len, r = w.r;
    g.add(fus([[-L / 2, 0], [-L * 0.3, r], [L * 0.25, r], [L / 2, r * 0.35]], 1, 1, mat, 10));
    for (let i = 0; i < 4; i++) {
      const f = box(0.02, r * 2.6, L * 0.2, mat); f.position.z = L * 0.42; f.rotation.z = i * Math.PI / 4; g.add(f);
    }
    return g;
  };

  G.buildSubmarine = function () {
    const g = new T.Group(), hull = std(0x1e2226, 0.3, 0.6), dk = std(0x15181b, 0.3, 0.7);
    g.add(fus([[-55, 0], [-53, 2.6], [-46, 4.8], [-30, 5.5], [25, 5.5], [42, 3.6], [55, 0.6]], 1, 1, hull, 20));
    g.add(at(box(3.2, 9, 16, dk), 0, 8.5, -22)); g.add(at(box(2.4, 1.2, 12, dk), 0, 13.2, -22));
    g.add(at(box(11, 0.5, 4, dk), 0, 10, -24));
    [0, 1, 2].forEach((i) => g.add(at(new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 6 + i * 2, 6), dk), 0, 15 + i, -26 + i * 3)));
    g.add(at(box(16, 0.6, 5, dk), 0, 0, 48)); g.add(at(box(0.6, 14, 5, dk), 0, 0, 48));
    const prop = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.5, 7), std(0x8a7440, 0.9, 0.3)); prop.rotation.x = Math.PI / 2; prop.position.z = 56; g.add(prop);
    g.add(at(box(9.5, 0.3, 70, dk), 0, 5.3, 0));
    return g;
  };

  G.buildMissile = function () {
    const g = new T.Group();
    const mat = std(0xdfe3e6, 0.5, 0.4);
    g.add(fus([[-2.6, 0], [-2.0, 0.16], [2.4, 0.16], [2.6, 0.1]], 1, 1, mat, 10));
    for (let i = 0; i < 2; i++) { const f = box(0.03, 1.0, 0.7, mat); f.position.z = 2.1; f.rotation.z = i * Math.PI / 2; g.add(f); }
    return g;
  };
})();
