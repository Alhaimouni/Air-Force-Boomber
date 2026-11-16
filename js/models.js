// Procedural aircraft models. Nose points to -Z, up +Y, right wing +X. Units: metres.
(function () {
  'use strict';
  const T = THREE, clamp = G.clamp;

  function std(color, metal, rough) {
    return new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough, side: T.DoubleSide });
  }
  const M = {
    dark: std(0x1b1d20, 0.6, 0.5),
    tire: std(0x111111, 0.0, 0.9),
    strut: std(0xb8bcc2, 0.8, 0.35),
    white: std(0xe9ecee, 0.3, 0.4),
    red: std(0xb02a25, 0.3, 0.5)
  };

  const V3 = T.Vector3, XA = new V3(1, 0, 0), YA = new V3(0, 1, 0), sstep = G.smoothstep;
  M.window = new T.MeshStandardMaterial({ color: 0x0a0d11, metalness: 1.0, roughness: 0.05 });
  M.strutW = std(0xd9dcdf, 0.35, 0.45); M.hub = std(0xa9adb2, 0.8, 0.35); M.spoke = std(0xe4e6e8, 0.3, 0.6);
  Object.keys(M).forEach((k) => { M[k].userData.noPaint = true; });
  let FULL = true, GLASS = null; // set per build: detailed (animated) model or light traffic model; canopy glass material

  function extr(pts, t, bs) {
    const sh = new T.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    return new T.ExtrudeGeometry(sh, { depth: t * 0.1, bevelEnabled: true, bevelThickness: t * 0.45, bevelSize: bs, bevelOffset: -bs, bevelSegments: 2, steps: 1 });
  }
  function surfG(pts, t, maxB) { const g = extr(pts, t, Math.min(t * 1.2, 0.25, maxB || 9)); g.rotateX(Math.PI / 2); g.translate(0, t * 0.05, 0); return g; }
  function finG(pts, t, maxB) { const g = extr(pts, t, Math.min(t, 0.2, maxB || 9)); g.rotateY(-Math.PI / 2); g.translate(t * 0.05, 0, 0); return g; }
  function surf(pts, t, mat) { return new T.Mesh(surfG(pts, t), mat); }
  function fin(pts, t, mat) { return new T.Mesh(finG(pts, t), mat); }
  function fus(profile, sx, sy, mat, seg) {
    const pts = profile.map((p) => new T.Vector2(Math.max(p[1], 0.001), p[0]));
    const g = new T.LatheGeometry(pts, seg || 22);
    g.rotateX(Math.PI / 2); g.scale(sx, sy, 1);
    g.computeVertexNormals();
    const ms = new T.Mesh(g, mat); ms.userData.prof = { p: profile, sx, sy, seg };
    return ms;
  }
  // a body lofted through cross-sections [z, halfWidth, yTop, yBottom]; each section is a superellipse (n = 2 is an
  // ellipse, higher is boxier), so the top and bottom lines can run independently: drooped noses, upswept tails
  function loft(st, mat, n, seg) {
    const K = seg || 28, pos = [], idx = [], ex = 2 / (n || 2.3);
    st.forEach((q) => { const hw = Math.max(q[1], 0.01), yc = (q[2] + q[3]) / 2, hh = Math.max((q[2] - q[3]) / 2, 0.01);
      for (let k = 0; k < K; k++) { const a = k / K * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.push(Math.sign(c) * Math.pow(Math.abs(c), ex) * hw, yc + Math.sign(sn) * Math.pow(Math.abs(sn), ex) * hh, q[0]); } });
    for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K, c = a + K, d = b + K; idx.push(a, b, c, b, d, c); }
    const cap = (i, flip) => { const q = st[i], o = pos.length / 3; pos.push(0, (q[2] + q[3]) / 2, q[0]); for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K; if (flip) idx.push(o, b, a); else idx.push(o, a, b); } };
    cap(0, true); cap(st.length - 1, false);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new T.Mesh(g, mat);
  }
  // a panel lying on a lofted body: the part of its skin between z0..z1 and angles a0..a1 (0 = right side, 90° = top),
  // lifted a few centimetres clear. Used for glazing that has to follow the hull.
  function skinPatch(st, n, z0, z1, a0, a1, mat, lift) {
    const ex = 2 / (n || 2.3), NZ = 6, NA = 14, pos = [], idx = [], k = 1 + (lift || 0.012);
    const at2 = (z) => { let i = 0; while (i < st.length - 2 && st[i + 1][0] < z) i++; const A = st[i], B = st[i + 1], t = clamp((z - A[0]) / (B[0] - A[0]), 0, 1); return [A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t]; };
    for (let i = 0; i <= NZ; i++) { const z = z0 + (z1 - z0) * i / NZ, q = at2(z), yc = (q[1] + q[2]) / 2, hh = (q[1] - q[2]) / 2;
      for (let j = 0; j <= NA; j++) { const a = (a0 + (a1 - a0) * j / NA) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); pos.push(Math.sign(c) * Math.pow(Math.abs(c), ex) * q[0] * k, yc + Math.sign(sn) * Math.pow(Math.abs(sn), ex) * hh * k, z); } }
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
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
  function limb(a, b, r, mat, r2) { // tapered cylinder from point a (radius r) to point b (radius r2)
    const d = new V3().subVectors(b, a), L = d.length(), ms = new T.Mesh(new T.CylinderGeometry(r2 || r, r, L, 8), mat);
    ms.position.copy(a).addScaledVector(d, 0.5); ms.quaternion.setFromUnitVectors(YA, d.normalize()); return ms;
  }
  const PL = (x, y, z, rz) => (o) => { o.position.set(x, y, z); if (rz) o.rotation.z = rz; };

  // ---------- hinged control surfaces
  // An outline (wing [x,z] or fin [z,y]) is notched along chosen edges and the removed strips become
  // separate panels on pivots, so flaps, ailerons, slats, elevators and rudders really move.
  // def: { e: edge index (pts[e] -> pts[e+1]), c: chord in metres, le: leading edge, taper, segs: [[f0, f1, kind, maxAngle], ...] }
  function cutOutline(pts, defs, zi) {
    const si = 1 - zi, n = pts.length, out = [], panels = [], gp = 0.004;
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[(i + 1) % n], d = defs.find((q) => q.e === i);
      out.push(A); if (!d) continue;
      const rev = Math.abs(A[si]) > Math.abs(B[si]), I = rev ? B : A, O = rev ? A : B, off = d.le ? d.c : -d.c;
      const E = (f) => [I[0] + (O[0] - I[0]) * f, I[1] + (O[1] - I[1]) * f];
      const Hh = (f) => { const p = E(f); p[zi] += off * (1 - (d.taper || 0) * f); return p; };
      const path = [];
      d.segs.forEach((sg) => {
        const f0 = sg[0], f1 = sg[1];
        path.push(E(f0), Hh(f0), Hh(f1), E(f1));
        panels.push({ kind: sg[2], max: sg[3], le: !!d.le, quad: [Hh(f0 + gp), Hh(f1 - gp), E(f1 - gp), E(f0 + gp)], h0: Hh(f0), h1: Hh(f1), e1: E(f1), c: d.c * (1 - (d.taper || 0) * f1) });
      });
      if (rev) path.reverse();
      path.forEach((p) => out.push(p));
    }
    return { out, panels };
  }
  function regSurf(m, rec) { (m.userData.surf || (m.userData.surf = [])).push(rec); }
  function mirrored(m, grp, side) { if (side < 0) { const f = new T.Group(); f.scale.x = -1; f.add(grp); m.add(f); } else m.add(grp); }
  // a flat plate hinged at its front edge (speed brakes, spoilers); o: { x, y, z, w, len, sweep, up, kind, max, mat }
  function plate(m, parent, o) {
    if (!FULL) return;
    const holder = new T.Group(); holder.position.set(o.x, o.y, o.z); holder.rotation.y = -(o.sweep || 0);
    const pv = new T.Group(), g = new T.BoxGeometry(o.w, o.th || 0.035, o.len); g.translate(0, 0, o.len / 2);
    pv.add(new T.Mesh(g, o.mat)); holder.add(pv); parent.add(holder);
    regSurf(m, { kind: o.kind || 'brake', max: o.max || 0.8, pivot: pv, axis: XA, sgn: o.up ? -1 : 1, side: o.side || 1 });
  }
  function ctl(m, zi, pts, t, mat, defs, place, mirror, o) {
    o = o || {};
    const mkG = zi ? surfG : finG;
    if (!FULL || !defs || !defs.length) { const w = new T.Mesh(mkG(pts, t), mat); place(w); if (mirror) both(m, w); else m.add(w); return; }
    const cut = cutOutline(pts, defs, zi), mainG = mkG(cut.out, t);
    const parts = cut.panels.map((p) => {
      const rel = p.quad.map((q) => [q[0] - p.h0[0], q[1] - p.h0[1]]), tp = Math.min(t, p.c * 0.6) * 0.92, split = p.kind === 'ailb' || p.kind === 'split';
      const geos = split ? [mkG(rel, tp * 0.5, p.c * 0.3), mkG(rel, tp * 0.5, p.c * 0.3)] : [mkG(rel, tp, p.c * 0.3)];
      if (split) { geos[0].translate(0, tp * 0.26, 0); geos[1].translate(0, -tp * 0.26, 0); }
      return { p, geos, split, pos: zi ? new V3(p.h0[0], 0, p.h0[1]) : new V3(0, p.h0[1], p.h0[0]),
        axis: (zi ? new V3(p.h1[0] - p.h0[0], 0, p.h1[1] - p.h0[1]) : new V3(0, p.h1[1] - p.h0[1], p.h1[0] - p.h0[0])).normalize() };
    });
    (mirror ? [1, -1] : [1]).forEach((side) => {
      const grp = new T.Group(); place(grp); grp.add(new T.Mesh(mainG, mat));
      parts.forEach((pt) => {
        pt.geos.forEach((geo, gi) => {
          const pv = new T.Group(); pv.position.copy(pt.pos); pv.add(new T.Mesh(geo, o.mat2 || mat)); grp.add(pv);
          regSurf(m, { kind: pt.split ? pt.p.kind + (gi ? 'L' : 'U') : pt.p.kind, max: pt.p.max, pivot: pv, axis: pt.axis, sgn: pt.p.le ? -1 : 1, side });
        });
        if (zi && (pt.p.kind === 'flap' || pt.p.kind === 'flaperon')) {
          grp.updateMatrix(); const v = new V3(pt.p.e1[0], 0, pt.p.e1[1]).applyMatrix4(grp.matrix);
          (m.userData.flapTips || (m.userData.flapTips = [])).push([v.x * side, v.y, v.z]);
        }
      });
      (o.plates || []).forEach((q) => plate(m, grp, { x: q[0], y: (q[5] ? -1 : 1) * t * 0.36, z: q[1], w: q[2], len: q[3], sweep: q[4], up: !q[5], kind: q[6] || 'spoiler', max: q[7] || 0.75, mat: o.mat2 || mat, side }));
      mirrored(m, grp, side);
    });
  }
  // a surface that pivots as a whole about a spanwise (wing) or vertical (fin) axis at chord position zp
  function allMove(m, zi, pts, t, mat, zp, place, mirror, kind, max) {
    const mkG = zi ? surfG : finG;
    if (!FULL) { const w = new T.Mesh(mkG(pts, t), mat); place(w); if (mirror) both(m, w); else m.add(w); return; }
    const g = mkG(pts.map((p) => (zi ? [p[0], p[1] - zp] : [p[0] - zp, p[1]])), t);
    (mirror ? [1, -1] : [1]).forEach((side) => {
      const grp = new T.Group(); place(grp); const pv = new T.Group(); pv.position.z = zp; pv.add(new T.Mesh(g, mat)); grp.add(pv);
      regSurf(m, { kind, max, pivot: pv, axis: zi ? XA : YA, sgn: 1, side });
      mirrored(m, grp, side);
    });
  }
  // variable exhaust nozzles: they close down at military power and open again in afterburner
  function nozzle(m, r1, r2, len, x, y, z, twin) {
    (twin ? [1, -1] : [1]).forEach((sd) => { const nz = at(cyl(r1, r2, len, M.dark, true), x * sd, y, z); m.add(nz); (m.userData.nozzles || (m.userData.nozzles = [])).push(nz); });
  }
  // canopy: tinted glass bubble with frame hoops
  function canopy(core, sx, sy, sz, x, y, z, bow) {
    const gl = at(blob(sx, sy, sz, GLASS), x, y, z); gl.userData.fpHide = true; gl.renderOrder = 2; core.add(gl);
    if (!FULL) return;
    (bow ? [-0.42, 0.5] : [0.5]).forEach((k) => {
      const q = Math.sqrt(1 - k * k) * 1.012, h = new T.Mesh(new T.TorusGeometry(1, 0.035, 6, 20, Math.PI), M.dark);
      h.scale.set(sx * q, sy * q, 1); h.position.set(x, y, z + k * sz); h.userData.fpHide = true; core.add(h);
    });
  }

  // ---------- landing gear: legs that swing into their bays behind doors, sprung oleo struts, spinning wheels
  function addGear(model, s, noseZ, mainZ, track, wr, bellyY, twin, o) {
    o = o || {};
    const g = new T.Group(), ud = model.userData; model.add(g); ud.gear = g;
    if (!FULL) {
      const mk0 = (x, z, r, dbl) => {
        const len = s.gearH + bellyY - r;
        const st = new T.Mesh(new T.CylinderGeometry(r * 0.16, r * 0.16, len, 8), M.strut);
        st.position.set(x, bellyY - len / 2, z); g.add(st);
        const wg = new T.CylinderGeometry(r, r, r * 0.55, 16); wg.rotateZ(Math.PI / 2);
        (dbl ? [-r * 0.45, r * 0.45] : [0]).forEach((q) => { const w = new T.Mesh(wg, M.tire); w.position.set(x + q, -s.gearH + r, z); g.add(w); });
      };
      (o.noseXs || [0]).forEach((nx) => mk0(nx, noseZ, wr * 0.75, twin)); (o.mainZs || [0]).forEach((dz) => { mk0(track, mainZ + dz, wr, twin); mk0(-track, mainZ + dz, wr, twin); });
      return;
    }
    ud.legs = []; ud.oleoD = wr * 0.42; ud.gearArm = Math.abs(noseZ - mainZ);
    const brakeMat = ud.brakeMat = new T.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.7, roughness: 0.5, emissive: 0xff3a05, emissiveIntensity: 0 }); brakeMat.userData.noPaint = true;
    const lampMat = ud.lampMat = new T.MeshBasicMaterial({ color: 0x30343a, fog: false, toneMapped: false });
    const doorMat = std(0x8a9096, 0.5, 0.45);
    const mk = (x, z, r, dbl, nose, phase) => {
      const L = s.gearH + bellyY - r; // bay pivot down to the axle
      const fold = nose ? (o.nose || 'fwd') : (o.main || (L > track * 0.85 ? 'fwd' : 'in'));
      const root = new T.Group(); root.position.set(x, bellyY, z); g.add(root);
      const piv = new T.Group(); root.add(piv);
      const steer = new T.Group(); piv.add(steer);
      steer.add(limb(new V3(0, 0, 0), new V3(0, -L * 0.6, 0), r * 0.2, M.strutW));
      steer.add(limb(new V3(0, -L * 0.06, r * 0.95), new V3(0, -L * 0.46, 0), r * 0.07, M.strut));
      const low = new T.Group(); steer.add(low);
      low.add(limb(new V3(0, -L * 0.48, 0), new V3(0, -L, 0), r * 0.12, M.strut));
      low.add(limb(new V3(0, -L * 0.62, r * 0.36), new V3(0, -L * 0.9, r * 0.1), r * 0.06, M.strutW));
      steer.add(limb(new V3(0, -L * 0.5, r * 0.1), new V3(0, -L * 0.62, r * 0.36), r * 0.06, M.strutW));
      const bogie = !nose && o.bogie, zs = bogie ? [-r * 1.15, r * 1.15] : [0], xs = dbl ? [-r * 0.5, r * 0.5] : [x >= 0 ? r * 0.3 : -r * 0.3];
      if (bogie) low.add(at(box(r * 0.24, r * 0.24, r * 2.5, M.strutW), 0, -L, 0));
      const wheels = [];
      zs.forEach((wz) => {
        const ax = new T.Mesh(new T.CylinderGeometry(r * 0.09, r * 0.09, r * 1.25, 8), M.strut); ax.rotation.z = Math.PI / 2; ax.position.set(dbl ? 0 : xs[0] * 0.5, -L, wz); if (!dbl) ax.scale.y = 0.5; low.add(ax);
        xs.forEach((wx) => {
          const wh = new T.Group(); wh.position.set(wx, -L, wz);
          const tg = new T.TorusGeometry(r * 0.7, r * 0.3, 8, 18); tg.rotateY(Math.PI / 2);
          const hg = new T.CylinderGeometry(r * 0.46, r * 0.46, r * 0.5, 14); hg.rotateZ(Math.PI / 2);
          wh.add(new T.Mesh(tg, M.tire), new T.Mesh(hg, nose ? M.hub : brakeMat), box(r * 0.54, r * 0.14, r * 0.86, M.spoke));
          low.add(wh); wheels.push(wh);
        });
      });
      const doors = [];
      if (fold === 'in') { // door carried on the leg
        piv.add(at(box(0.03, L * 0.72, r * 1.7, doorMat), Math.sign(x) * r * (dbl ? 0.95 : 0.62), -L * 0.4, 0));
      } else { // twin bay doors under the belly
        const dw = r * (dbl ? 1.0 : 0.62), dl = L + r * 1.1, zc = (fold === 'fwd' ? -1 : 1) * dl * 0.45;
        [1, -1].forEach((sd) => {
          const dg = new T.BoxGeometry(dw, 0.03, dl); dg.translate(-sd * dw / 2, 0, 0);
          const dr = new T.Mesh(dg, doorMat); dr.position.set(sd * dw, 0.01, zc); root.add(dr); doors.push({ o: dr, sd });
        });
      }
      if (nose) { // landing and taxi lights
        [-1, 1].forEach((sd) => { const lp = new T.Mesh(new T.SphereGeometry(r * 0.17, 8, 6), lampMat); lp.position.set(sd * r * 0.32, -L * 0.34, -r * 0.2); lp.scale.z = 0.6; steer.add(lp); });
      }
      ud.legs.push({ root, piv, steer, low, fold, nose, x, L, r, doors, wheels, phase });
    };
    // noseXs: side-by-side nose legs; mainZs: a row of main legs down each side (the An-225 has seven)
    (o.noseXs || [0]).forEach((nx, i) => mk(nx, noseZ, wr * 0.75, twin, true, -0.06 + i * 0.03));
    (o.mainZs || [0]).forEach((dz, i) => { mk(track, mainZ + dz, wr, twin, false, (i % 3) * 0.02); mk(-track, mainZ + dz, wr, twin, false, 0.01 + (i % 3) * 0.02); });
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
      // shock diamonds in the exhaust
      const dm = new T.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      for (let i = 0; i < 4; i++) { const d = new T.Mesh(new T.SphereGeometry(r * (0.42 - i * 0.07), 8, 6), dm); d.scale.z = 1.5; d.position.z = len * (0.1 + i * 0.13); grp.add(d); }
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

  const TE = (c, segs, taper) => ({ e: 2, c, segs, taper: taper === undefined ? 0.3 : taper });
  const LE = (c, segs, taper) => ({ e: 0, le: true, c, segs, taper: taper === undefined ? 0.5 : taper });
  const builders = {
    f16(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7c858e, 0.55, 0.42), b2 = std(0x5d666f, 0.55, 0.45);
      core.add(fus([[-7.5, 0], [-7.2, 0.12], [-6, 0.38], [-4.5, 0.62], [-3, 0.78], [0, 0.85], [3.5, 0.82], [6.3, 0.68], [7.3, 0.55]], 1, 1, b));
      core.add(at(fus([[-7.5, 0], [-7.2, 0.125], [-6.3, 0.34]], 1, 1, b2), 0, 0, -0.01));
      core.add(at(fus([[-3.6, 0.3], [-3.4, 0.55], [0, 0.62], [3, 0.4]], 1.15, 0.7, b), 0, -0.72, -0.6));
      core.add(at(cyl(0.5, 0.5, 0.12, M.dark), 0, -0.72, -4.15));
      ctl(m, 1, [[0.7, -1.6], [4.75, 1.9], [4.75, 3.0], [0.7, 3.5]], 0.15, b, [TE(0.75, [[0.1, 0.93, 'flaperon', 0.45]]), LE(0.45, [[0.08, 0.95, 'lef', 0.4]])], PL(0, 0.12, 0), true);
      both(m, at(surf([[0.3, -5.4], [0.95, -1.6], [0.95, 3.2], [0.3, 3.2]], 0.1, b), 0, 0.12, 0));
      allMove(m, 1, [[0.55, 5.0], [2.75, 6.5], [2.75, 7.3], [0.55, 7.1]], 0.1, b, 6.3, PL(0, 0, 0, -0.17), true, 'elev', 0.36);
      ctl(m, 0, [[2.4, 0.6], [5.9, 3.9], [7.0, 3.9], [7.1, 0.6]], 0.14, b2, [{ e: 2, c: 0.7, segs: [[0.12, 0.9, 'rud', 0.45]] }], PL(0, 0, 0), false);
      const vf = at(fin([[5, -0.4], [5.6, -1.2], [6.5, -1.2], [6.6, -0.4]], 0.06, b), 0.45, 0, 0); vf.rotation.z = 0.25; both(m, vf);
      canopy(core, 0.46, 0.55, 1.75, 0, 0.6, -3.9, false);
      nozzle(m, 0.6, 0.5, 1.0, 0, 0, 7.6);
      [1, -1].forEach((sd) => { // split speed brakes beside the nozzle
        plate(m, m, { x: sd * 0.95, y: 0.09, z: 6.2, w: 0.55, len: 1.05, up: true, max: 0.75, mat: b });
        plate(m, m, { x: sd * 0.95, y: -0.09, z: 6.2, w: 0.55, len: 1.05, up: false, max: 0.75, mat: b });
      });
      both(m, at(cyl(0.07, 0.07, 2.8, M.white), 4.82, 0.12, 2.3));
      m.userData.engines = [[0, 0, 8.0]]; m.userData.tips = [[4.8, 0.12, 3], [-4.8, 0.12, 3]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -3.6, 0.8, 1.2, 0.35, -0.75, false, { main: 'fwd', nose: 'aft' });
      m.userData.core = core; return m;
    },
    f22(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7d848c, 0.6, 0.4), b2 = std(0x666d75, 0.6, 0.42);
      core.add(fus([[-9.45, 0], [-9, 0.15], [-7.5, 0.5], [-5.5, 0.85], [-3, 1.1], [2, 1.15], [7, 1.0], [8.6, 0.85]], 1.6, 0.8, b, 8));
      ctl(m, 1, [[1.5, -2.6], [6.78, 3.1], [6.78, 4.5], [1.5, 5.9]], 0.18, b, [TE(1.0, [[0.06, 0.55, 'flaperon', 0.5], [0.58, 0.95, 'ail', 0.4]]), LE(0.6, [[0.08, 0.95, 'lef', 0.35]])], PL(0, 0.1, 0), true);
      both(m, at(surf([[0.6, -6.6], [1.7, -2.6], [1.7, 5.9], [0.6, 5.9]], 0.16, b), 0, 0.1, 0));
      allMove(m, 1, [[1.4, 5.6], [4.4, 8.2], [4.4, 9.6], [2.4, 9.9], [1.4, 8.6]], 0.12, b, 8.0, PL(0, 0.05, 0), true, 'elev', 0.34);
      ctl(m, 0, [[2.2, 0], [4.6, 2.9], [6.6, 2.9], [7.4, 0]], 0.13, b2, [{ e: 2, c: 0.9, segs: [[0.1, 0.9, 'rudb', 0.45]] }], PL(1.9, 0.55, 0, -0.49), true);
      const it = at(box(1.0, 0.95, 3.2, b), 1.5, -0.2, -3.6); it.rotation.z = 0.25; both(m, it);
      both(m, at(box(0.95, 0.9, 0.1, M.dark), 1.5, -0.2, -5.22));
      both(m, at(box(1.15, 0.55, 1.4, M.dark), 0.8, 0.02, 9.0));
      canopy(core, 0.55, 0.62, 2.1, 0, 0.72, -5.4, false);
      m.userData.engines = [[0.8, 0, 9.7], [-0.8, 0, 9.7]]; m.userData.tips = [[6.7, 0.1, 4], [-6.7, 0.1, 4]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -5.4, 1.2, 1.6, 0.4, -0.85, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    f35(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x5f666d, 0.6, 0.42), b2 = std(0x4f565d, 0.6, 0.45);
      core.add(fus([[-7.85, 0], [-7.5, 0.14], [-6, 0.5], [-4, 0.85], [-1.5, 1.05], [2.5, 1.05], [5.5, 0.85], [7.2, 0.62]], 1.4, 0.98, b, 10));
      ctl(m, 1, [[1.3, -1.0], [5.35, 2.3], [5.35, 3.4], [1.3, 4.6]], 0.18, b, [TE(0.85, [[0.08, 0.93, 'flaperon', 0.45]]), LE(0.5, [[0.08, 0.95, 'lef', 0.38]])], PL(0, 0.2, 0), true);
      allMove(m, 1, [[1.3, 4.6], [3.6, 6.6], [3.6, 7.9], [1.3, 7.6]], 0.12, b, 6.6, PL(0, 0.1, 0), true, 'elev', 0.36);
      ctl(m, 0, [[2.4, 0], [4.8, 2.5], [6.2, 2.5], [6.6, 0]], 0.13, b2, [{ e: 2, c: 0.7, segs: [[0.1, 0.9, 'rudb', 0.45]] }], PL(1.25, 0.65, 0, -0.35), true);
      const it = at(box(0.8, 0.95, 2.6, b), 1.35, 0.0, -3.0); it.rotation.y = -0.12; both(m, it);
      both(m, at(box(0.7, 0.85, 0.1, M.dark), 1.5, 0.0, -4.3));
      canopy(core, 0.5, 0.6, 1.9, 0, 0.78, -4.6, true);
      nozzle(m, 0.66, 0.55, 1.1, 0, 0, 7.6);
      m.userData.engines = [[0, 0, 8.1]]; m.userData.tips = [[5.3, 0.2, 3], [-5.3, 0.2, 3]];
      addFlames(m, m.userData.engines, 0.55, 7);
      addGear(m, s, -4.2, 0.9, 1.5, 0.38, -0.9, false, { main: 'fwd' });
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
      ctl(m, 1, [[2.0, -2.6], [7.35, 3.3], [7.35, 4.9], [2.0, 5.6]], 0.18, b, [TE(1.0, [[0.05, 0.62, 'flaperon', 0.45]]), LE(0.6, [[0.06, 0.95, 'lef', 0.4]], 0.4)], PL(0, 0.12, 0), true);
      allMove(m, 1, [[2.1, 6.4], [4.9, 9.2], [4.9, 10.3], [2.1, 9.9]], 0.12, b, 8.6, PL(0, 0, 0), true, 'elev', 0.34);
      ctl(m, 0, [[4.6, 0], [7.4, 3.9], [8.8, 3.9], [9.2, 0]], 0.14, b2, [{ e: 2, c: 0.9, segs: [[0.1, 0.9, 'rud', 0.45]] }], PL(2.15, 0.3, 0), true);
      canopy(core, 0.55, 0.62, 2.2, 0, 1.12, -6.3, true);
      plate(m, m, { x: 0, y: 1.3, z: -3.9, w: 1.15, len: 2.7, up: true, max: 0.95, mat: b, th: 0.05 }); // dorsal air brake
      nozzle(m, 0.64, 0.52, 1.0, 1.45, -0.4, 9.0, true);
      both(m, at(cyl(0.08, 0.08, 3.0, M.white), 7.4, 0.12, 4.0));
      m.userData.engines = [[1.45, -0.4, 9.5], [-1.45, -0.4, 9.5]]; m.userData.tips = [[7.4, 0.12, 4.8], [-7.4, 0.12, 4.8]];
      addFlames(m, m.userData.engines, 0.52, 7);
      addGear(m, s, -5.6, 1.0, 2.2, 0.45, -1.0, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    su57(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x6c7b8e, 0.55, 0.42), b2 = std(0x4f5c6e, 0.55, 0.45);
      core.add(at(fus([[-10, 0], [-9.6, 0.14], [-8, 0.5], [-6, 0.85], [-3.5, 1.0], [0, 0.8], [5, 0.5], [10, 0.2]], 1.3, 0.85, b, 10), 0, 0.3, 0));
      both(m, at(surf([[0, -7.2], [2.4, -2.9], [2.7, -2.9], [2.7, 6.6], [0, 6.6]], 0.36, b), 0, 0.1, 0));
      ctl(m, 1, [[2.5, -2.2], [7.05, 3.4], [7.05, 4.6], [2.5, 6.2]], 0.18, b2, [TE(0.95, [[0.05, 0.55, 'flaperon', 0.5], [0.58, 0.95, 'ail', 0.4]]), LE(0.55, [[0.06, 0.95, 'lef', 0.38]])], PL(0, 0.1, 0), true);
      allMove(m, 1, [[2.5, 6.3], [4.7, 8.6], [4.7, 9.7], [2.5, 9.6]], 0.12, b2, 8.3, PL(0, 0.05, 0), true, 'elev', 0.34);
      allMove(m, 0, [[4.8, 0], [6.4, 2.3], [7.8, 2.3], [8.4, 0]], 0.13, b2, 6.9, PL(2.5, 0.2, 0, -0.45), true, 'rudb', 0.4);
      both(m, at(fus([[-2.2, 0.5], [-1.6, 0.72], [6, 0.72], [8.8, 0.6]], 1, 1, b2), 1.55, -0.35, 0));
      both(m, at(box(1.25, 1.0, 2.6, b2), 1.55, -0.5, -2.6));
      both(m, at(box(1.15, 0.9, 0.1, M.dark), 1.55, -0.5, -3.92));
      canopy(core, 0.55, 0.6, 2.1, 0, 1.0, -5.6, true);
      nozzle(m, 0.62, 0.52, 1.0, 1.55, -0.35, 9.2, true);
      m.userData.engines = [[1.55, -0.35, 9.7], [-1.55, -0.35, 9.7]]; m.userData.tips = [[7, 0.1, 4.2], [-7, 0.1, 4.2]];
      addFlames(m, m.userData.engines, 0.52, 7);
      addGear(m, s, -5.2, 1.2, 2.2, 0.42, -0.95, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    a10(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x66706b, 0.35, 0.6), b2 = std(0x545e59, 0.35, 0.6);
      core.add(fus([[-8.1, 0], [-7.8, 0.3], [-6.5, 0.62], [-4, 0.8], [2, 0.78], [6, 0.5], [8.1, 0.2]], 1, 1.05, b));
      ctl(m, 1, [[0.6, -1.3], [8.76, -0.5], [8.76, 1.3], [0.6, 2.1]], 0.32, b, [TE(0.7, [[0.06, 0.56, 'flap', 0.6], [0.6, 0.96, 'ailb', 0.4]], 0.1)], PL(0, -0.5, 0, 0.05), true);
      both(m, at(fus([[-1.4, 0.2], [-1.0, 0.36], [1.6, 0.36], [2.4, 0.1]], 1, 1, b2), 2.6, -0.85, 0.6));
      both(m, at(fus([[-1.7, 0.6], [-1.5, 0.8], [1.2, 0.8], [1.9, 0.55]], 1, 1, b2), 1.6, 1.25, 4.0));
      both(m, at(cyl(0.7, 0.7, 0.08, M.dark), 1.6, 1.25, 2.38));
      both(m, at(box(0.9, 0.25, 1.4, b), 0.95, 0.85, 4.0));
      ctl(m, 1, [[0, 6.6], [2.9, 6.7], [2.9, 8.0], [0, 8.1]], 0.16, b, [TE(0.5, [[0.08, 0.92, 'elevTE', 0.4]], 0)], PL(0, 0.15, 0), true);
      ctl(m, 0, [[6.5, -0.5], [6.9, 2.3], [8.0, 2.3], [8.2, -0.5]], 0.14, b2, [{ e: 2, c: 0.45, segs: [[0.12, 0.9, 'rud', 0.45]] }], PL(2.9, 0.15, 0), true);
      canopy(core, 0.45, 0.55, 1.5, 0, 0.85, -4.9, true);
      m.add(at(cyl(0.13, 0.13, 1.5, M.dark), -0.1, -0.4, -8.2));
      m.userData.engines = [[1.6, 1.25, 6.0], [-1.6, 1.25, 6.0]]; m.userData.tips = [[8.7, -0.1, 1], [-8.7, -0.1, 1]];
      m.userData.flames = [];
      addGear(m, s, -5.6, 0.6, 2.6, 0.45, -0.8, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    b2(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x3b3f45, 0.45, 0.5), b2 = std(0x2c2f34, 0.45, 0.5);
      const half = [[0, -10.5], [26.2, 6.5], [23.0, 8.58], [15.0, 3.39], [9.0, 7.28], [5.5, 5.0], [0, 8.57]];
      if (FULL) {
        ctl(m, 1, half, 0.75, b, [{ e: 2, c: 1.5, segs: [[0.06, 0.5, 'elevon', 0.35], [0.56, 0.95, 'split', 0.8]] }, { e: 3, c: 1.4, segs: [[0.12, 0.88, 'elevon', 0.35]] }], PL(0, 0, 0), true);
      } else {
        const pts = half.concat(half.slice(1, -1).reverse().map((p) => [-p[0], p[1]]));
        m.add(at(surf(pts, 0.75, b), 0, 0, 0));
      }
      const hump = at(blob(3.3, 1.55, 7.2, b), 0, 0.45, -2.6); core.add(hump);
      const ws = at(blob(2.6, 1.1, 2.2, M.window), 0, 0.98, -6.4); ws.userData.fpHide = true; core.add(ws);
      both(m, at(blob(2.3, 1.05, 5.2, b), 5.2, 0.4, -0.6));
      both(m, at(box(2.6, 0.5, 0.3, M.dark), 5.2, 0.95, -3.9));
      both(m, at(box(2.4, 0.1, 2.2, b2), 5.2, 0.55, 4.6));
      m.userData.engines = [[4.3, 0.6, 5.2], [6.1, 0.6, 5.2], [-4.3, 0.6, 5.2], [-6.1, 0.6, 5.2]];
      m.userData.tips = [[25.5, 0, 7.5], [-25.5, 0, 7.5]];
      m.userData.flames = [];
      addGear(m, s, -5.5, 1.5, 6.0, 0.65, -0.6, true, { main: 'fwd', bogie: true });
      m.userData.core = core; return m;
    },
    mig29(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x98a29c, 0.5, 0.45), b2 = std(0x7b8780, 0.5, 0.45);
      const pod = at(fus([[-8.65, 0], [-8.2, 0.14], [-6.5, 0.5], [-5, 0.75], [-3, 0.8], [0, 0.6], [4, 0.4], [8.6, 0.15]], 1, 1, b), 0, 0.35, 0); core.add(pod);
      both(m, at(surf([[0, -5.6], [1.3, -2.0], [1.8, -2.0], [1.8, 5.0], [0, 5.0]], 0.3, b), 0, 0.1, 0));
      ctl(m, 1, [[1.7, -2.0], [5.68, 2.6], [5.68, 3.8], [1.7, 4.6]], 0.16, b, [TE(0.8, [[0.06, 0.55, 'flap', 0.5], [0.6, 0.95, 'ail', 0.4]]), LE(0.45, [[0.06, 0.95, 'lef', 0.38]])], PL(0, 0.1, 0), true);
      allMove(m, 1, [[1.6, 5.2], [3.8, 7.4], [3.8, 8.3], [1.6, 8.0]], 0.11, b, 7.0, PL(0, 0, 0), true, 'elev', 0.36);
      ctl(m, 0, [[3.4, 0], [5.8, 3.2], [6.9, 3.2], [7.2, 0]], 0.12, b2, [{ e: 2, c: 0.6, segs: [[0.12, 0.9, 'rud', 0.45]] }], PL(1.65, 0.25, 0, -0.1), true);
      both(m, at(fus([[-1.5, 0.45], [-1.1, 0.62], [5, 0.62], [7, 0.52]], 1, 1, b2), 0.95, -0.4, 0));
      both(m, at(box(1.0, 0.85, 2.3, b2), 0.95, -0.5, -2.2)); both(m, at(box(0.9, 0.75, 0.1, M.dark), 0.95, -0.5, -3.36));
      canopy(core, 0.48, 0.55, 1.7, 0, 0.95, -5.0, true);
      plate(m, m, { x: 0, y: 0.68, z: 5.0, w: 0.8, len: 1.9, up: true, max: 0.95, mat: b, th: 0.05 });
      plate(m, m, { x: 0, y: -0.02, z: 5.0, w: 0.8, len: 1.9, up: false, max: 0.95, mat: b, th: 0.05 });
      nozzle(m, 0.54, 0.45, 0.9, 0.95, -0.4, 7.4, true);
      m.userData.engines = [[0.95, -0.4, 7.9], [-0.95, -0.4, 7.9]]; m.userData.tips = [[5.6, 0.1, 3.4], [-5.6, 0.1, 3.4]];
      addFlames(m, m.userData.engines, 0.45, 6);
      addGear(m, s, -4.4, 0.8, 1.6, 0.38, -0.9, false, { main: 'fwd', nose: 'aft' });
      m.userData.core = core; return m;
    },
    rafale(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x7f8992, 0.55, 0.42), b2 = std(0x69737c, 0.55, 0.45);
      core.add(fus([[-7.6, 0], [-7.3, 0.12], [-6, 0.42], [-4, 0.72], [-1.5, 0.9], [3.5, 0.9], [6.4, 0.75], [7.4, 0.6]], 1.1, 0.95, b));
      ctl(m, 1, [[0.9, -1.6], [5.4, 4.6], [5.4, 5.4], [0.9, 5.9]], 0.15, b, [TE(0.7, [[0.06, 0.5, 'elevon', 0.4], [0.53, 0.95, 'elevon', 0.4]], 0.5), LE(0.4, [[0.3, 0.95, 'slat', 0.3]], 0.4)], PL(0, -0.05, 0), true);
      allMove(m, 1, [[0.8, -3.4], [2.3, -1.9], [2.3, -1.5], [0.8, -1.8]], 0.08, b2, -2.2, PL(0, 0.4, 0, 0.06), true, 'canard', 0.35);
      ctl(m, 0, [[2.2, 0.7], [5.7, 4.3], [6.7, 4.3], [7.1, 0.7]], 0.14, b2, [{ e: 2, c: 0.7, segs: [[0.12, 0.9, 'rud', 0.45]] }], PL(0, 0, 0), false);
      both(m, at(blob(0.5, 0.42, 1.7, b), 0.85, -0.45, -2.4)); both(m, at(cyl(0.34, 0.34, 0.06, M.dark), 0.9, -0.45, -3.9));
      canopy(core, 0.45, 0.55, 1.7, 0, 0.72, -4.2, true);
      nozzle(m, 0.44, 0.38, 0.9, 0.46, 0, 7.6, true);
      both(m, at(cyl(0.07, 0.07, 2.6, M.white), 5.45, -0.05, 4.6));
      m.userData.engines = [[0.46, 0, 8.1], [-0.46, 0, 8.1]]; m.userData.tips = [[5.4, 0, 5.2], [-5.4, 0, 5.2]];
      addFlames(m, m.userData.engines, 0.38, 5.5);
      addGear(m, s, -3.8, 1.2, 1.3, 0.35, -0.85, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    typhoon(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x8b939b, 0.55, 0.42), b2 = std(0x737c85, 0.55, 0.45);
      core.add(fus([[-8, 0], [-7.6, 0.14], [-6, 0.5], [-4, 0.75], [-1, 0.85], [4, 0.82], [7, 0.72], [7.9, 0.6]], 1.1, 0.95, b));
      ctl(m, 1, [[0.8, -2.0], [5.45, 5.2], [5.45, 6.0], [0.8, 6.3]], 0.15, b, [TE(0.75, [[0.06, 0.5, 'elevon', 0.4], [0.53, 0.95, 'elevon', 0.4]], 0.5), LE(0.4, [[0.25, 0.95, 'slat', 0.3]], 0.4)], PL(0, -0.1, 0), true);
      allMove(m, 1, [[0.6, -5.3], [2.0, -4.2], [2.0, -3.85], [0.6, -4.1]], 0.07, b2, -4.5, PL(0, 0.3, 0, -0.22), true, 'canard', 0.35);
      ctl(m, 0, [[2.5, 0.7], [6.3, 4.6], [7.4, 4.6], [7.6, 0.7]], 0.14, b2, [{ e: 2, c: 0.7, segs: [[0.12, 0.9, 'rud', 0.45]] }], PL(0, 0, 0), false);
      m.add(at(box(1.5, 0.75, 3.4, b), 0, -0.95, -1.6)); m.add(at(box(1.4, 0.65, 0.1, M.dark), 0, -0.95, -3.32));
      canopy(core, 0.46, 0.55, 1.7, 0, 0.7, -4.5, true);
      plate(m, m, { x: 0, y: 0.83, z: -2.7, w: 0.75, len: 2.3, up: true, max: 0.9, mat: b, th: 0.05 }); // dorsal air brake
      nozzle(m, 0.46, 0.4, 0.9, 0.48, 0, 8.1, true);
      both(m, at(cyl(0.1, 0.1, 2.2, b2), 5.5, -0.1, 5.2));
      m.userData.engines = [[0.48, 0, 8.6], [-0.48, 0, 8.6]]; m.userData.tips = [[5.45, -0.1, 5.8], [-5.45, -0.1, 5.8]];
      addFlames(m, m.userData.engines, 0.4, 6);
      addGear(m, s, -4.2, 1.6, 1.4, 0.36, -0.9, false, { main: 'in' });
      m.userData.core = core; return m;
    },
    j20(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x444a52, 0.6, 0.4), b2 = std(0x363b42, 0.6, 0.42);
      core.add(fus([[-10.6, 0], [-10.1, 0.15], [-8.5, 0.5], [-6, 0.9], [-3, 1.1], [3, 1.15], [8, 1.0], [10.2, 0.8]], 1.5, 0.8, b, 8));
      ctl(m, 1, [[1.6, -1.5], [6.5, 5.6], [6.5, 6.6], [1.6, 8.2]], 0.18, b, [TE(0.95, [[0.06, 0.5, 'flaperon', 0.45], [0.54, 0.95, 'ail', 0.4]], 0.4), LE(0.5, [[0.08, 0.95, 'lef', 0.35]], 0.4)], PL(0, 0.05, 0), true);
      both(m, at(surf([[0.6, -7.2], [1.7, -3.0], [1.7, 8.0], [0.6, 8.0]], 0.16, b), 0, 0.1, 0));
      allMove(m, 1, [[1.5, -4.6], [3.7, -2.6], [3.7, -2.0], [1.5, -2.2]], 0.1, b2, -2.9, PL(0, 0.25, 0, 0.12), true, 'canard', 0.35);
      allMove(m, 0, [[4.8, 0], [6.6, 2.7], [8.0, 2.7], [8.8, 0]], 0.13, b2, 7.2, PL(1.75, 0.5, 0, -0.46), true, 'rudb', 0.4);
      const vf = at(fin([[6.4, 0], [7.0, -1.1], [8.4, -1.1], [8.8, 0]], 0.08, b2), 1.5, -0.5, 0); vf.rotation.z = 0.35; both(m, vf);
      const it = at(box(1.0, 0.95, 3.0, b), 1.5, -0.2, -4.2); it.rotation.z = 0.2; both(m, it);
      both(m, at(box(0.95, 0.9, 0.1, M.dark), 1.5, -0.2, -5.72));
      canopy(core, 0.55, 0.62, 2.2, 0, 0.72, -6.6, false);
      nozzle(m, 0.6, 0.5, 1.0, 0.8, 0, 10.6, true);
      m.userData.engines = [[0.8, 0, 11.1], [-0.8, 0, 11.1]]; m.userData.tips = [[6.4, 0.05, 6.2], [-6.4, 0.05, 6.2]];
      addFlames(m, m.userData.engines, 0.5, 6.5);
      addGear(m, s, -6.0, 1.6, 1.8, 0.42, -0.9, false, { main: 'fwd' });
      m.userData.core = core; return m;
    },
    b1(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x4d5259, 0.5, 0.45), b2 = std(0x3d4248, 0.5, 0.48);
      core.add(fus([[-22.2, 0], [-21.5, 0.4], [-19, 1.1], [-15, 1.5], [-5, 1.6], [8, 1.5], [16, 1.0], [22.2, 0.3]], 1.1, 1, b, 20));
      both(m, at(surf([[1.2, -12], [4.4, -4], [4.4, 6], [1.2, 8.5]], 0.6, b), 0, -0.1, 0));
      ctl(m, 1, [[4.0, -3.5], [18.0, 5.5], [18.0, 7.8], [4.0, 2.6]], 0.4, b, [TE(1.3, [[0.05, 0.78, 'flap', 0.6]]), LE(0.8, [[0.05, 0.95, 'slat', 0.35]], 0.3)], PL(0, 0, 0), true, { plates: [[11.5, 2.85, 6.5, 1.0, 0.355, 0, 'spoilr']] });
      allMove(m, 1, [[0.6, 15.5], [6.8, 20.5], [6.8, 22.0], [0.6, 20.6]], 0.25, b, 19.2, PL(0, 2.2, 0), true, 'elev', 0.26);
      ctl(m, 0, [[13, 1.2], [19.5, 9.2], [21.6, 9.2], [21.9, 1.2]], 0.4, b2, [{ e: 2, c: 1.6, segs: [[0.2, 0.92, 'rud', 0.4]] }], PL(0, 0, 0), false);
      both(m, at(fus([[-4.4, 0.85], [-3.8, 1.05], [3.2, 1.05], [4.4, 0.85]], 1.9, 0.85, b2, 12), 3.4, -1.45, 2.4));
      both(m, at(box(3.6, 1.5, 0.12, M.dark), 3.4, -1.45, -2.05));
      const ws = at(blob(1.15, 0.6, 1.9, M.window), 0, 1.05, -17.6); ws.userData.fpHide = true; core.add(ws);
      const eng = [[2.5, -1.45, 6.9], [4.3, -1.45, 6.9], [-2.5, -1.45, 6.9], [-4.3, -1.45, 6.9]];
      eng.forEach((e) => nozzle(m, 0.72, 0.6, 0.9, e[0], e[1], e[2] - 0.1));
      m.userData.engines = eng.map((e) => [e[0], e[1], e[2] + 0.5]); m.userData.tips = [[17.8, 0, 7], [-17.8, 0, 7]];
      addFlames(m, m.userData.engines, 0.6, 8);
      addGear(m, s, -14, 2.5, 2.4, 0.6, -1.5, true, { main: 'aft', bogie: true });
      m.userData.core = core; return m;
    },
    tu160(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0xe6e9ec, 0.35, 0.4), b2 = std(0xc9ced3, 0.4, 0.42);
      core.add(fus([[-27, 0], [-26, 0.5], [-22, 1.3], [-16, 1.7], [0, 1.8], [14, 1.5], [22, 1.0], [27, 0.4]], 1.05, 1, b, 20));
      both(m, at(surf([[1.2, -17], [6.6, -3], [6.6, 9], [1.2, 12]], 0.7, b), 0, -0.2, 0));
      ctl(m, 1, [[6.2, -3], [23.0, 8], [23.0, 10.5], [6.2, 4]], 0.45, b, [TE(1.6, [[0.05, 0.7, 'flap', 0.6], [0.74, 0.96, 'ail', 0.35]]), LE(0.9, [[0.05, 0.95, 'slat', 0.35]], 0.3)], PL(0, -0.1, 0), true, { plates: [[13.5, 3.75, 7, 1.1, 0.369, 0, 'spoilr']] });
      allMove(m, 1, [[0.6, 19], [6.6, 24.5], [6.6, 26], [0.6, 25]], 0.28, b, 23.4, PL(0, 3.4, 0), true, 'elev', 0.26);
      ctl(m, 0, [[15, 1.5], [23, 10], [25.5, 10], [26.5, 1.5]], 0.45, b, [{ e: 2, c: 1.8, segs: [[0.34, 0.92, 'rud', 0.4]] }], PL(0, 0, 0), false);
      both(m, at(fus([[-6, 0.95], [-5.2, 1.2], [4, 1.2], [5.6, 0.95]], 2.0, 0.9, b2, 12), 4.3, -1.75, 4.4));
      both(m, at(box(4.2, 1.7, 0.12, M.dark), 4.3, -1.75, -1.65));
      const ws = at(blob(1.2, 0.6, 2.2, M.window), 0, 1.2, -21.2); ws.userData.fpHide = true; core.add(ws);
      const eng = [[3.2, -1.75, 10.2], [5.4, -1.75, 10.2], [-3.2, -1.75, 10.2], [-5.4, -1.75, 10.2]];
      eng.forEach((e) => nozzle(m, 0.9, 0.75, 1.0, e[0], e[1], e[2] - 0.2));
      m.userData.engines = eng.map((e) => [e[0], e[1], e[2] + 0.5]); m.userData.tips = [[22.8, -0.1, 9.5], [-22.8, -0.1, 9.5]];
      addFlames(m, m.userData.engines, 0.75, 10);
      addGear(m, s, -17, 3, 2.7, 0.65, -1.7, true, { main: 'aft', bogie: true });
      m.userData.core = core; return m;
    },
    b52(s) {
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x5a605b, 0.35, 0.6), b2 = std(0x484e4a, 0.35, 0.6);
      core.add(fus([[-24.2, 0], [-23.5, 0.8], [-21, 1.6], [-17, 1.9], [10, 1.9], [18, 1.3], [24.2, 0.5]], 1, 1.15, b, 20));
      ctl(m, 1, [[1.5, -8], [28.2, 6], [28.2, 8.2], [1.5, -0.2]], 0.6, b, [TE(1.7, [[0.04, 0.36, 'flap', 0.6], [0.42, 0.68, 'flap', 0.6]], 0.25)], PL(0, 1.7, 0, -0.035), true, { plates: [[21, 3.2, 6.5, 1.0, 0.305, 0, 'spoilr']] });
      ctl(m, 1, [[0.8, 18], [8, 22], [8, 24], [0.8, 23.5]], 0.3, b, [TE(0.9, [[0.06, 0.94, 'elevTE', 0.35]], 0.3)], PL(0, 0.8, 0), true);
      ctl(m, 0, [[17, 1.6], [20.5, 11], [23.5, 11], [24, 1.6]], 0.4, b2, [{ e: 2, c: 1.0, segs: [[0.1, 0.92, 'rud', 0.4]] }], PL(0, 0, 0), false);
      const eng = [];
      [10, 18].forEach((x) => {
        const z = -8 + (x - 1.5) * 0.52 - 0.5, y = 1.7 - x * 0.035 - 1.6;
        both(m, at(fus([[-2.6, 0.7], [-2.3, 0.86], [1.4, 0.86], [2.5, 0.6]], 1.95, 1, b2, 12), x, y, z));
        both(m, at(box(1.7, 1.5, 0.1, M.dark), x, y, z - 2.62)); both(m, at(box(0.3, 1.2, 3.2, b2), x, y + 0.9, z + 0.6));
        eng.push([x, y, z + 3], [-x, y, z + 3]);
      });
      both(m, at(fus([[-1.5, 0.1], [-1, 0.5], [3, 0.5], [4, 0.1]], 1, 1, b2, 10), 21, 0.6, 5.5));
      const ws = at(blob(1.5, 0.55, 1.6, M.window), 0, 1.7, -21.4); ws.userData.fpHide = true; core.add(ws);
      m.userData.engines = eng; m.userData.tips = [[28, 0.7, 7.5], [-28, 0.7, 7.5]];
      m.userData.flames = [];
      addGear(m, s, -15, 4, 1.6, 0.65, -2.0, true, { main: 'fwd', bogie: true });
      m.userData.core = core; return m;
    },
    sr71(s) { // long chined fuselage blended into a delta, an engine nacelle half-way out each wing with an inward-canted fin on top
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0x1b1d21, 0.35, 0.62), b2 = std(0x26292e, 0.35, 0.62);
      core.add(fus([[-16.4, 0], [-16.1, 0.1], [-14, 0.42], [-11, 0.7], [-6, 0.84], [4, 0.86], [10, 0.7], [14, 0.42], [16.4, 0.1]], 1, 0.92, b, 20));
      both(m, at(surf([[0.15, -15.9], [1.25, -11], [1.75, -5], [1.9, -1.2], [0.15, -1.2]], 0.16, b), 0, -0.05, 0)); // chines
      ctl(m, 1, [[0.7, -2.2], [8.47, 8.4], [8.47, 10.4], [0.7, 12.9]], 0.26, b, [TE(1.2, [[0.03, 0.4, 'elevon', 0.4], [0.62, 0.97, 'elevon', 0.4]], 0.45)], PL(0, -0.05, 0), true);
      both(m, at(fus([[-7.2, 0], [-5.6, 0.34], [-4.2, 0.72], [-3.2, 0.86], [3.5, 0.86], [5.6, 0.74]], 1, 1, b2, 18), 4.55, 0.05, 4.3)); // nacelles with inlet spikes
      allMove(m, 0, [[5.2, 0.8], [7.6, 3.6], [8.9, 3.6], [9.4, 0.8]], 0.16, b2, 7.6, PL(4.55, 0.1, 0, 0.26), true, 'rud', 0.35);
      canopy(core, 0.42, 0.42, 1.25, 0, 0.72, -11.1, true); canopy(core, 0.4, 0.38, 0.9, 0, 0.74, -9.1, false);
      nozzle(m, 0.86, 0.7, 1.1, 4.55, 0.05, 10.3, true);
      m.userData.engines = [[4.55, 0.05, 10.9], [-4.55, 0.05, 10.9]]; m.userData.tips = [[8.4, -0.05, 9.4], [-8.4, -0.05, 9.4]];
      addFlames(m, m.userData.engines, 0.7, 11);
      addGear(m, s, -9.5, 3.2, 2.4, 0.42, -0.8, false, { main: 'fwd', nose: 'aft' });
      m.userData.core = core; return m;
    },
an225(s) {
      // Shaped after the real aircraft: a deep fuselage with a blunt drooped nose that hinges up, a flat top line and an upswept
      // tail; a high, strongly swept wing with anhedral and a kinked trailing edge; six turbofans slung forward on pylons;
      // a dihedral tailplane with a fin on each tip; gear in long blisters low on the sides.
      const m = new T.Group(), core = new T.Group(); m.add(core);
      const b = std(0xeef0f2, 0.25, 0.42), b2 = std(0xc9ced3, 0.4, 0.42), blue = std(0x1c4fa0, 0.3, 0.5), yel = std(0xf2c81e, 0.3, 0.5), hot = std(0x6a6e73, 0.8, 0.4);
      const wy = 3.25, an = 0.07, wyAt = (x) => wy - x * an;                       // wing height, anhedral
      const le = (x) => -14 + (x - 3) * 25 / 41.2, te = (x) => (x < 14 ? 2.0 + (x - 3) * 2.8 / 11 : 4.8 + (x - 14) * 10.4 / 30.2);
      const hull = [[-42, 0.15, -0.7, -1.1], [-41.5, 1.0, 0.1, -1.9], [-40.6, 1.75, 0.95, -2.6], [-39.2, 2.4, 1.85, -3.1], [-37.2, 2.95, 2.75, -3.4], [-34.5, 3.22, 3.3, -3.5], [-31, 3.3, 3.5, -3.5],
        [8, 3.3, 3.5, -3.5], [16, 3.2, 3.5, -3.2], [23, 2.9, 3.48, -2.3], [30, 2.4, 3.4, -1.0], [36, 1.75, 3.25, 0.5], [40, 1.1, 3.1, 1.7], [42, 0.55, 2.95, 2.3]];
      core.add(loft(hull, b, 2.5, 32));
      [[0.72, 0.58, blue], [0.16, 0.3, yel]].forEach((q) => both(m, at(box(0.06, q[1], 47, q[2]), 3.285, q[0], -9.5)));   // blue-over-yellow cheat line
      // wing: root chord 16 m, kink at a third of the span, 4 m at the tip
      ctl(m, 1, [[3.0, -14], [44.2, 11.0], [44.2, 15.2], [14, 4.8], [3.0, 2.0]], 0.85, b, [
        { e: 2, c: 2.1, taper: 0.4, segs: [[0.04, 0.46, 'flap', 0.6], [0.52, 0.96, 'ail', 0.35]] }, { e: 3, c: 3.2, taper: 0.12, segs: [[0.1, 0.96, 'flap', 0.6]] },
        LE(1.1, [[0.05, 0.3, 'slat', 0.3], [0.33, 0.62, 'slat', 0.3], [0.65, 0.97, 'slat', 0.3]], 0.45)], PL(0, wy, 0, -an), true, { plates: [[21, 3.6, 8, 1.5, 0.33, 0, 'spoilr'], [32, 7.4, 8, 1.3, 0.33, 0, 'spoilr']] });
      core.add(loft([[-17.5, 2.2, 3.5, 3.1], [-14.5, 3.5, 4.35, 2.6], [-6, 3.7, 4.6, 2.6], [2, 3.5, 4.35, 2.6], [7, 2.2, 3.6, 3.1]], b, 2.6, 24));       // centre-section fairing over the fuselage
      [7.5, 17, 25.5, 34, 40.5].forEach((x) => both(m, at(fus([[-3.2, 0.08], [-1.4, 0.4], [1.6, 0.42], [3.6, 0.08]], 1, 1.1, b, 10), x, wyAt(x) - 0.78, te(x) - 1.3)));   // flap-track fairings
      // tail: dihedral tailplane, a swept fin on each tip, two-piece rudders
      const ty = 2.75, td = 0.1;
      ctl(m, 1, [[1.2, 30.6], [16.3, 36.6], [16.3, 41.4], [1.2, 40.6]], 0.55, b, [TE(1.6, [[0.05, 0.48, 'elevTE', 0.35], [0.52, 0.95, 'elevTE', 0.35]], 0.3)], PL(0, ty, 0, td), true);
      const fy = ty + 16.3 * td;
      ctl(m, 0, [[35.2, -2.0], [38.6, 9.2], [42.0, 9.2], [42.8, -2.0]], 0.42, b, [{ e: 2, c: 1.5, taper: 0.15, segs: [[0.06, 0.5, 'rud', 0.4], [0.53, 0.94, 'rud', 0.4]] }], PL(16.2, fy, 0), true);
      [[5.3, 0.55, blue, 4.6], [4.72, 0.3, yel, 4.9]].forEach((q) => both(m, at(box(0.46, q[1], q[3], q[2]), 16.2, fy + q[0], 39.45)));                         // fin flash
      both(m, at(loft([[-13, 0.2, -2.6, -3.0], [-10, 1.0, -1.9, -3.5], [-6, 1.35, -1.7, -3.62], [10, 1.35, -1.7, -3.62], [14, 1.0, -1.9, -3.5], [18, 0.2, -2.6, -3.0]], b, 2.6, 16), 3.75, 0, 1.5)); // main-gear blisters
      // six D-18T turbofans: a short fan cowl, a slimmer hot core behind it, hung ahead of the wing on a swept pylon
      const eng = [];
      [12.2, 20.8, 29.4].forEach((x) => {
        const y = wyAt(x) - 2.75, z = le(x) - 2.4;
        both(m, at(fus([[-3.1, 1.16], [-2.85, 1.4], [-1.2, 1.47], [0.2, 1.4], [0.7, 1.22]], 1, 1, b, 18), x, y, z));
        both(m, at(fus([[-2.3, 1.485], [-1.75, 1.49]], 1, 1, blue, 18), x, y, z)); both(m, at(fus([[-1.7, 1.49], [-1.45, 1.485]], 1, 1, yel, 18), x, y, z));
        both(m, at(cyl(1.15, 1.15, 0.1, M.dark), x, y, z - 2.9)); both(m, at(fus([[-3.5, 0], [-2.9, 0.42]], 1, 1, b, 10), x, y, z));
        both(m, at(fus([[0.5, 0.98], [2.3, 0.82], [2.9, 0.62]], 1, 1, hot, 14), x, y, z)); both(m, at(fus([[2.7, 0.5], [4.1, 0.05]], 1, 1, hot, 10), x, y, z));
        both(m, at(fin([[-1.9, 1.35], [1.2, 2.55], [5.4, 2.55], [2.6, 0.9]], 0.34, b), x, y, z));
        eng.push([x, y, z + 4.0], [-x, y, z + 4.0]);
      });
      // flight-deck glazing wrapped round the upper nose, with a row of side windows behind it
      [[-39.75, -38.5, 40, 140], [-38.42, -37.3, 22, 50], [-38.42, -37.3, 130, 158]].forEach((q) => { const ws = skinPatch(hull, 2.5, q[0], q[1], q[2], q[3], M.window); ws.userData.fpHide = true; core.add(ws); });
      [[-39.75, -38.5, 88.6, 91.4], [-39.75, -38.5, 63, 65], [-39.75, -38.5, 115, 117]].forEach((q) => { const fr = skinPatch(hull, 2.5, q[0], q[1], q[2], q[3], b, 0.02); fr.userData.fpHide = true; core.add(fr); });   // window posts
      m.userData.engines = eng; m.userData.tips = [[44, wyAt(44) - 0.1, 14], [-44, wyAt(44) - 0.1, 14]];
      m.userData.flames = [];
      addGear(m, s, -33.5, -5.5, 4.05, 0.62, -3.35, true, { main: 'in', nose: 'fwd', noseXs: [-1.0, 1.0], mainZs: [0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0] });
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
      wm.userData.noPaint = tm.userData.noPaint = true;
      core.add(fus([[-18.8, 0], [-18.3, 0.6], [-17, 1.35], [-15, 1.85], [-13.5, 1.98], [9, 1.98], [14, 1.4], [18.8, 0.35]], 1, 1, fm, 28));
      ctl(m, 1, [[1.7, -3.5], [17.0, 5.2], [17.0, 6.8], [6.5, 3.6], [1.7, 3.4]], 0.55, wm,
        [{ e: 2, c: 1.0, taper: 0.45, segs: [[0.04, 0.68, 'flap', 0.6], [0.72, 0.96, 'ail', 0.4]] }, { e: 3, c: 1.1, segs: [[0.08, 0.92, 'flap', 0.6]] }, LE(0.5, [[0.06, 0.96, 'slat', 0.4]], 0.4)],
        PL(0, -1.15, 0, 0.095), true, { plates: [[11, 3.15, 6.5, 0.95, 0.296, 0, 'spoilr']] });
      both(m, at(fin([[5.2, 0.4], [6.6, 2.0], [7.1, 2.0], [6.9, 0.4]], 0.1, tm), 17.0, 0.1, 0));
      both(m, at(fus([[-2.6, 0.95], [-2.4, 1.12], [0.5, 1.14], [2.2, 0.7]], 1, 1, M.white, 20), 5.75, -2.3, -1.4));
      both(m, at(cyl(1.0, 1.0, 0.1, M.dark), 5.75, -2.3, -3.85));
      both(m, at(box(0.25, 0.9, 3.0, wm), 5.75, -1.35, -0.6));
      ctl(m, 1, [[1.0, 13.6], [6.2, 16.6], [6.2, 17.8], [1.0, 17.2]], 0.3, wm, [TE(0.6, [[0.06, 0.94, 'elevTE', 0.4]], 0.3)], PL(0, 0.6, 0, 0.1), true);
      ctl(m, 0, [[11.5, 1.6], [16.2, 7.7], [18.0, 7.7], [18.3, 1.2]], 0.4, tm, [{ e: 2, c: 1.0, segs: [[0.08, 0.92, 'rud', 0.4]] }], PL(0, 0, 0), false);
      m.userData.engines = [[5.75, -2.3, 1.2], [-5.75, -2.3, 1.2]]; m.userData.tips = [[17, 0.5, 6.5], [-17, 0.5, 6.5]];
      m.userData.flames = [];
      addGear(m, s, -13.5, 1.8, 3.8, 0.6, -1.9, true, { main: 'in' });
      m.userData.core = core; return m;
    }
  };

  // ---------- cockpit interior at the pilot eye point. It is drawn in its own pass on top of the world
  // (layer 1), so nothing outside can ever cut through it, and it is closed all the way round below the sills.
  let panelTex = null, consoleTex = null;
  G.panelCanvas = document.createElement('canvas'); G.panelCanvas.width = 512; G.panelCanvas.height = 256;
  G.panelTexture = function () {
    if (!panelTex) { panelTex = new T.CanvasTexture(G.panelCanvas); panelTex.colorSpace = T.SRGBColorSpace; }
    return panelTex;
  };
  function consoleTexture() {
    if (consoleTex) return consoleTex;
    const c = document.createElement('canvas'); c.width = 128; c.height = 512; const x = c.getContext('2d'), r = G.rng(77);
    x.fillStyle = '#30353b'; x.fillRect(0, 0, 128, 512);
    for (let y = 6; y < 500; y += 62) {
      x.fillStyle = '#23272c'; x.fillRect(6, y, 116, 54); x.strokeStyle = '#596069'; x.lineWidth = 1; x.strokeRect(6.5, y + 0.5, 115, 53);
      const kind = r.int(0, 2);
      for (let i = 0; i < 5; i++) {
        const px = 18 + i * 23, py = y + 30;
        if (kind === 0) { x.fillStyle = '#0d0f11'; x.beginPath(); x.arc(px, py, 7, 0, 6.3); x.fill(); x.strokeStyle = '#d8dde2'; x.lineWidth = 2; x.beginPath(); const a = r() * 6.3; x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); x.stroke(); }
        else if (kind === 1) { x.fillStyle = '#0d0f11'; x.fillRect(px - 5, py - 8, 10, 16); x.fillStyle = '#cfd4d9'; x.fillRect(px - 2, py - (r.chance(0.5) ? 10 : -2), 4, 9); }
        else { x.fillStyle = r.chance(0.3) ? '#6dff8f' : r.chance(0.2) ? '#ffb13a' : '#15181b'; x.fillRect(px - 7, py - 6, 14, 12); x.strokeStyle = '#596069'; x.strokeRect(px - 7.5, py - 6.5, 15, 13); }
        x.fillStyle = '#aab2ba'; x.fillRect(px - 6, y + 8, 12, 2);
      }
    }
    consoleTex = new T.CanvasTexture(c); consoleTex.colorSpace = T.SRGBColorSpace; consoleTex.anisotropy = 4;
    return consoleTex;
  }
  const GVS = `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv;
      #include <logdepthbuf_vertex>
    }`;
  const GFS = `#include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 tint; uniform vec3 sunV; uniform float haze; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vN), v = normalize(vV); if (dot(n, v) < 0.0) n = -n;
      float f = pow(1.0 - dot(n, v), 3.0);
      float glint = pow(max(dot(reflect(-v, n), sunV), 0.0), 90.0);
      float glare = pow(max(dot(-v, sunV), 0.0), 14.0);                 // light scattered in the glass when looking toward the sun
      vec2 q = vP.xz * 46.0 + vP.y * 17.0; float scr = step(0.992, hsh(floor(q))) * (0.3 + 0.7 * glare);
      vec3 c = mix(tint, vec3(0.86, 0.93, 1.0), clamp(f * 0.7 + glare * 0.5, 0.0, 1.0)) + glint * 1.4;
      float a = haze + f * 0.4 + glare * 0.1 + glint * 0.7 + scr * 0.12;
      gl_FragColor = vec4(c, clamp(a, 0.0, 0.9)); }`;
  function insideGlass(tint, haze) {
    return new T.ShaderMaterial({ uniforms: { tint: { value: tint.clone().lerp(new T.Color(0x9fc6e6), 0.5) }, sunV: { value: new V3(0, 1, 0) }, haze: { value: haze } }, vertexShader: GVS, fragmentShader: GFS, transparent: true, depthWrite: false, side: T.DoubleSide });
  }
  function addCockpit(model, s) {
    const c = new T.Group(), ud = model.userData, P = ud.cp = {};
    const e = s.cam.cockpit; c.position.set(e[0], e[1], e[2]);
    const mk = (col, r, mt) => new T.MeshStandardMaterial({ color: col, roughness: r, metalness: mt || 0.1 });
    const bodyCol = (ud.baseColor || new T.Color(0x6a7078)).clone();
    const heavy = ['a320', 'b2', 'b1', 'b52', 'tu160', 'an225'].indexOf(s.id) >= 0, civ = !!s.civil;
    const frame = heavy ? mk(0x2b3036, 0.6, 0.4) : new T.MeshStandardMaterial({ color: bodyCol.clone().multiplyScalar(0.5), roughness: 0.5, metalness: 0.5 });
    const dark = mk(0x14161a, 0.9), mid = mk(0x30363c, 0.8), grey = mk(0x4a5158, 0.7), trim = mk(0x7a828b, 0.4, 0.7), suit = mk(civ ? 0xe9ecee : 0x4b5539, 0.95), legM = civ ? mk(0x1d2330, 0.9) : suit, vest = mk(civ ? 0xe9ecee : 0x39432e, 0.95),
      glove = mk(civ ? 0xc99a7a : 0x1f2226, 0.8), strap = mk(civ ? 0x30363c : 0x9a9f96, 0.9), yel = mk(0xd9b41e, 0.6), boot = mk(0x121316, 0.6), paper = mk(0xe6e2d4, 0.9), red = mk(0xb3261e, 0.6), seatM = mk(0x454b52, 0.95);
    const panelMat = new T.MeshBasicMaterial({ map: G.panelTexture(), fog: false, toneMapped: false });
    const consM = new T.MeshStandardMaterial({ map: consoleTexture(), roughness: 0.7, metalness: 0.2 });
    const put = (o, x, y, z, rx, rz, par) => { o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; (par || c).add(o); return o; };
    const lm = (a, b, r, mat, r2, par) => { const o = limb(new V3(a[0], a[1], a[2]), new V3(b[0], b[1], b[2]), r, mat, r2); (par || c).add(o); return o; };
    const flat = (w, d, mat) => { const g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return new T.Mesh(g, mat); };
    const gm = P.glass = insideGlass(GLASS.color, heavy ? 0.025 : 0.045);
    // the pilot's own body: torso, harness, legs, boots
    const body = (seatZ) => {
      put(box(0.38, 0.5, 0.2, suit), 0, -0.53, seatZ); put(box(0.46, 0.1, 0.21, suit), 0, -0.31, seatZ);
      put(box(0.3, 0.24, 0.05, vest), 0, -0.44, seatZ - 0.1);
      [-1, 1].forEach((sd) => {
        put(box(0.045, 0.46, 0.012, strap), sd * 0.09, -0.5, seatZ - 0.128);
        lm([sd * 0.1, -0.8, seatZ - 0.06], [sd * 0.15, -0.65, seatZ - 0.5], 0.085, legM, 0.07);
        lm([sd * 0.15, -0.65, seatZ - 0.5], [sd * 0.17, -0.93, seatZ - 0.92], 0.065, legM, 0.055);
        put(box(0.095, 0.085, 0.22, boot), sd * 0.17, -0.96, seatZ - 0.98, -0.25);
      });
      put(box(0.08, 0.06, 0.02, trim), 0, -0.64, seatZ - 0.13);
      put(box(0.13, 0.012, 0.17, paper), 0.15, -0.555, seatZ - 0.33, 0.33); // kneeboard
    };
    const arm = (sd, hand, par) => { // shoulder -> elbow fixed, forearm follows the control it holds
      const sh = [sd * 0.25, -0.33, 0.14], el = [sd * (Math.abs(hand[0]) > 0.25 ? 0.43 : 0.36), -0.6, hand[2] + 0.34];
      lm(sh, el, 0.06, suit, 0.05);
      return { el, sh };
    };
    if (heavy) {
      const cx = -e[0], hw = 1.25, xl = cx - hw, xr = cx + hw, wall = mk(0x596068, 0.85), wallD = mk(0x3b4147, 0.85), ceil = mk(0x6a7178, 0.9);
      put(box(hw * 2 + 0.1, 0.05, 2.5, wallD), cx, -1.07, -0.1);                                  // floor
      put(box(hw * 2 + 0.1, 0.05, 1.95, ceil), cx, 0.63, 0.12);                                  // ceiling
      put(box(hw * 2 + 0.1, 0.22, 0.12, wall), cx, 0.53, -0.82);                                 // windshield header
      put(box(hw * 2 + 0.1, 0.84, 0.06, wallD), cx, -0.67, -1.2);                                // nose bulkhead
      put(box(hw * 2 + 0.1, 1.75, 0.06, wall), cx, -0.22, 1.08);                                 // rear wall
      put(box(0.72, 1.5, 0.03, wallD), cx, -0.32, 1.04); put(box(0.05, 0.05, 0.04, trim), cx + 0.28, -0.3, 1.02);      // door
      [xl, xr].forEach((x) => {
        put(box(0.05, 0.82, 2.4, wall), x, -0.67, -0.1);                                          // side wall under the windows
        put(box(0.05, 0.92, 0.95, wall), x, 0.17, 0.62);                                          // solid wall behind the side window
        put(box(0.05, 0.22, 1.25, wall), x, 0.53, -0.45);                                         // header over the side window
        put(box(0.07, 0.7, 0.07, frame), x, 0.08, 0.14); put(box(0.06, 0.7, 0.06, frame), x, 0.08, -0.45);
        put(box(0.06, 0.04, 1.3, trim), x, -0.255, -0.5);
        const sg = new T.Mesh(new T.PlaneGeometry(1.25, 0.7), gm); sg.rotation.y = Math.PI / 2; put(sg, x, 0.08, -0.48);
      });
      [xl + 0.02, cx, xr - 0.02].forEach((x) => put(box(0.055, 0.82, 0.06, frame), x, 0.08, -0.985, -0.47));    // windshield posts
      [cx - hw / 2, cx + hw / 2].forEach((x) => { const wg = new T.Mesh(new T.PlaneGeometry(hw - 0.1, 0.8), gm); put(wg, x, 0.08, -0.985, -0.47); });
      put(box(hw * 2, 0.05, 0.62, dark), cx, -0.265, -0.9); put(box(hw * 2, 0.06, 0.03, dark), cx, -0.29, -0.595);   // glareshield
      put(box(hw * 2 - 0.08, 0.5, 0.3, mid), cx, -0.54, -0.82);                                                    // main panel
      [0, cx * 2].forEach((x) => put(new T.Mesh(new T.PlaneGeometry(0.72, 0.36), panelMat), x, -0.5, -0.665, -0.12));
      put(new T.Mesh(new T.PlaneGeometry(0.3, 0.36), consM), cx, -0.5, -0.665, -0.12);
      P.gearH = put(box(0.018, 0.018, 0.08, trim), cx + 0.2, -0.5, -0.64); put(box(0.03, 0.034, 0.018, red), 0, 0, 0.045, 0, 0, P.gearH);
      put(box(0.75, 0.07, 0.95, mid), cx, 0.585, -0.25); put(flat(0.68, 0.9, consM), cx, 0.548, -0.25, Math.PI);   // overhead panel
      put(box(0.46, 0.42, 1.15, mid), cx, -0.7, -0.12); put(flat(0.42, 1.0, consM), cx, -0.488, -0.1);             // pedestal
      const nT = s.id === 'a320' ? 2 : 4; P.levers = [];
      for (let i = 0; i < nT; i++) { const lv = new T.Group(); put(lv, cx + (i - (nT - 1) / 2) * 0.055, -0.5, -0.2); put(box(0.02, 0.13, 0.025, trim), 0, 0.06, 0, 0, 0, lv); put(box(0.045, 0.045, 0.06, s.id === 'a320' ? dark : paper), 0, 0.14, 0, 0, 0, lv); P.levers.push(lv); }
      P.flapL = new T.Group(); put(P.flapL, cx + 0.16, -0.5, 0.05); put(box(0.018, 0.1, 0.02, trim), 0, 0.05, 0, 0, 0, P.flapL); put(box(0.05, 0.035, 0.035, paper), 0, 0.11, 0, 0, 0, P.flapL);
      P.brkL = new T.Group(); put(P.brkL, cx - 0.16, -0.5, 0.05); put(box(0.018, 0.1, 0.02, trim), 0, 0.05, 0, 0, 0, P.brkL); put(box(0.05, 0.035, 0.035, dark), 0, 0.11, 0, 0, 0, P.brkL);
      // both seats
      [0, cx * 2].forEach((x) => { put(box(0.5, 0.95, 0.1, seatM), x, -0.42, 0.36); put(box(0.3, 0.22, 0.1, seatM), x, 0.1, 0.35); put(box(0.5, 0.1, 0.5, seatM), x, -0.86, 0.1); put(box(0.06, 0.12, 0.45, grey), x - 0.27, -0.72, 0.12); put(box(0.06, 0.12, 0.45, grey), x + 0.27, -0.72, 0.12); });
      body(0.2);
      // the other pilot
      const co = new T.Group(); put(co, cx * 2, 0, 0);
      put(box(0.38, 0.5, 0.2, mk(0xe9ecee, 0.9)), 0, -0.53, 0.2, 0, 0, co); put(box(0.46, 0.1, 0.21, mk(0xe9ecee, 0.9)), 0, -0.31, 0.2, 0, 0, co);
      put(new T.Mesh(new T.SphereGeometry(0.115, 12, 10), mk(0xc99a7a, 0.8)), 0, -0.1, 0.17, 0, 0, co); put(new T.Mesh(new T.SphereGeometry(0.12, 12, 8, 0, 6.3, 0, 1.25), mk(0x2a211a, 0.9)), 0, -0.09, 0.185, 0, 0, co);
      put(new T.Mesh(new T.TorusGeometry(0.122, 0.012, 6, 16, Math.PI), dark), 0, -0.1, 0.17, 0, 0, co); [-1, 1].forEach((sd) => put(box(0.03, 0.07, 0.06, dark), sd * 0.125, -0.1, 0.17, 0, 0, co));
      [-1, 1].forEach((sd) => { lm([sd * 0.1, -0.8, 0.14], [sd * 0.15, -0.65, -0.3], 0.085, mk(0x1d2330, 0.9), 0.07, co); lm([sd * 0.15, -0.65, -0.3], [sd * 0.17, -0.93, -0.72], 0.065, mk(0x1d2330, 0.9), 0.055, co); lm([sd * 0.25, -0.33, 0.2], [sd * 0.3, -0.6, 0.1], 0.055, mk(0xe9ecee, 0.9), 0.05, co); lm([sd * 0.3, -0.6, 0.1], [sd * 0.14, -0.62, -0.22], 0.05, mk(0xe9ecee, 0.9), 0.045, co); });
      // controls and arms: A320 side-stick, B-52 yoke, stick for the others; right hand rests on the thrust levers
      const ctlBase = s.id === 'a320' ? [-0.46, -0.6, -0.3] : [0, -0.98, -0.5];
      const stick = P.stick = new T.Group(); put(stick, ctlBase[0], ctlBase[1], ctlBase[2]);
      if (s.id === 'a320') { put(box(0.24, 0.05, 0.5, mid), -0.5, -0.63, -0.25); put(flat(0.2, 0.45, consM), -0.5, -0.603, -0.25); lm([0, 0, 0], [0, 0.13, 0], 0.016, dark, 0.02, stick); put(box(0.04, 0.07, 0.04, dark), 0, 0.15, 0, 0, 0, stick); P.gripY = 0.15; }
      else if (s.id === 'b52') { lm([0, 0, 0], [0, 0.5, 0.06], 0.025, dark, 0.02, stick); const wh = P.wheel = new T.Group(); put(wh, 0, 0.5, 0.06, 0, 0, stick); put(box(0.34, 0.03, 0.03, dark), 0, 0, 0, 0, 0, wh); [-1, 1].forEach((sd) => put(box(0.03, 0.13, 0.03, dark), sd * 0.17, 0.05, 0, 0, 0, wh)); P.gripY = 0.5; P.gripX = -0.17; }
      else { lm([0, 0, 0], [0, 0.46, 0], 0.016, dark, 0.014, stick); put(box(0.04, 0.1, 0.045, dark), 0, 0.5, 0, 0, 0, stick); P.gripY = 0.5; }
      const lh = [ctlBase[0] + (P.gripX || 0), ctlBase[1] + P.gripY, ctlBase[2] + (s.id === 'b52' ? 0.06 : 0)], la = arm(-1, lh);
      lm([la.el[0] - ctlBase[0], la.el[1] - ctlBase[1], la.el[2] - ctlBase[2]], [P.gripX || 0, P.gripY + 0.02, s.id === 'b52' ? 0.06 : 0], 0.05, suit, 0.042, stick);
      put(box(0.075, 0.075, 0.09, glove), P.gripX || 0, P.gripY + 0.03, s.id === 'b52' ? 0.06 : 0, 0, 0, stick);
      const th = P.thr = new T.Group(); put(th, cx - 0.06, -0.36, -0.2); P.thrZ = -0.2; P.thrRange = 0.14;
      const ra = arm(1, [cx - 0.06, -0.36, -0.2]); lm([ra.el[0] - (cx - 0.06), ra.el[1] + 0.36, ra.el[2] + 0.2], [0, 0.02, 0.02], 0.05, suit, 0.042, th); put(box(0.09, 0.07, 0.09, glove), 0, 0.02, 0, 0, 0, th);
    } else {
      const side = s.id === 'f16' || s.id === 'f35' || s.id === 'f22', bubble = s.id === 'f16' || s.id === 'f22';
      put(box(1.06, 0.04, 1.75, dark), 0, -1.01, -0.2);                                           // floor
      put(box(1.06, 0.8, 0.04, mid), 0, -0.63, -1.05);                                            // front bulkhead
      put(box(1.06, 0.86, 0.05, mid), 0, -0.6, 0.64); put(box(0.96, 0.05, 0.3, frame), 0, -0.2, 0.52);        // rear bulkhead and deck
      [-1, 1].forEach((sd) => {
        put(box(0.04, 0.78, 1.75, mid), sd * 0.51, -0.64, -0.2);                                  // side wall
        put(box(0.08, 0.05, 1.8, frame), sd * 0.5, -0.275, -0.2);                                 // canopy rail
        put(box(0.21, 0.44, 1.3, grey), sd * 0.385, -0.8, 0.0);                                   // console
        put(flat(0.2, 1.28, consM), sd * 0.385, -0.578, 0.0);
        put(box(0.14, 0.42, 0.04, grey), sd * 0.42, -0.5, -0.63);                                 // side instrument panel
        put(flat(0.12, 0.38, consM), sd * 0.42, -0.5, -0.608, Math.PI / 2);
        put(box(0.1, 0.13, 0.03, trim), sd * 0.17, -0.9, -1.0, -0.3);                             // rudder pedal
        put(box(0.03, 0.55, 0.03, trim), sd * 0.19, 0.2, 0.42);                                   // seat rails
      });
      put(box(0.94, 0.035, 0.56, dark), 0, -0.275, -0.8); put(box(0.94, 0.06, 0.03, dark), 0, -0.295, -0.52);   // glareshield
      put(box(0.72, 0.5, 0.3, dark), 0, -0.55, -0.74);                                                          // instrument panel
      put(new T.Mesh(new T.PlaneGeometry(0.62, 0.31), panelMat), 0, -0.47, -0.585, -0.1);
      put(box(0.19, 0.42, 0.36, grey), 0, -0.81, -0.62); put(new T.Mesh(new T.PlaneGeometry(0.17, 0.2), consM), 0, -0.72, -0.438);    // pedestal
      P.gearH = put(box(0.016, 0.016, 0.07, trim), -0.43, -0.42, -0.58); put(box(0.026, 0.03, 0.016, red), 0, 0, 0.04, 0, 0, P.gearH);
      // ejection seat
      put(box(0.46, 0.95, 0.1, seatM), 0, -0.45, 0.36); put(box(0.3, 0.26, 0.1, seatM), 0, 0.06, 0.34); put(box(0.46, 0.1, 0.5, seatM), 0, -0.86, 0.1);
      put(new T.Mesh(new T.TorusGeometry(0.05, 0.012, 6, 14), yel), 0, -0.76, -0.17, Math.PI / 2.6);
      body(0.2);
      // HUD combiner
      both(c, at(box(0.007, 0.21, 0.007, trim), 0.098, -0.105, -0.6));
      put(box(0.2, 0.007, 0.007, trim), 0, 0.0, -0.6);
      put(box(0.22, 0.06, 0.1, dark), 0, -0.245, -0.58);
      put(new T.Mesh(new T.PlaneGeometry(0.19, 0.2), new T.MeshBasicMaterial({ color: 0x8dffb0, transparent: true, opacity: 0.05, depthWrite: false, fog: false })), 0, -0.1, -0.6);
      // stick (side-stick or centre stick) with the right hand, throttle with the left
      const sb = side ? [0.385, -0.58, -0.3] : [0, -0.99, -0.42], gy = side ? 0.13 : 0.47;
      const stick = P.stick = new T.Group(); put(stick, sb[0], sb[1], sb[2]);
      lm([0, 0, 0], [0, gy - 0.03, 0], side ? 0.02 : 0.016, dark, 0.016, stick); put(box(0.04, 0.1, 0.045, dark), 0, gy + 0.02, 0, 0.2, 0, stick); put(box(0.012, 0.012, 0.012, red), 0.012, gy + 0.075, -0.01, 0, 0, stick);
      const ra = arm(1, [sb[0], sb[1] + gy, sb[2]]);
      lm([ra.el[0] - sb[0], ra.el[1] - sb[1], ra.el[2] - sb[2]], [0.01, gy + 0.02, 0.03], 0.05, suit, 0.042, stick); put(box(0.08, 0.08, 0.09, glove), 0.005, gy + 0.02, 0.012, 0, 0, stick);
      const th = P.thr = new T.Group(); put(th, -0.385, -0.5, -0.12); P.thrZ = -0.12; P.thrRange = 0.17;
      put(box(0.03, 0.1, 0.035, trim), 0, -0.04, 0, 0, 0, th); put(box(0.06, 0.06, 0.1, dark), 0.0, 0.02, 0, 0, 0, th);
      const la = arm(-1, [-0.385, -0.5, -0.12]);
      lm([la.el[0] + 0.385, la.el[1] + 0.5, la.el[2] + 0.12], [0, 0.04, 0.03], 0.05, suit, 0.042, th); put(box(0.085, 0.075, 0.1, glove), 0, 0.045, 0, 0, 0, th);
      // canopy: bow frame with mirrors, rear hoop, glass
      if (!bubble) {
        put(new T.Mesh(new T.TorusGeometry(0.5, 0.018, 8, 32, Math.PI), frame), 0, -0.275, -0.86);
        [-1, 0, 1].forEach((i) => { const a = Math.PI / 2 + i * 0.42, mr = box(0.085, 0.034, 0.012, mk(0xb9c6d2, 0.08, 1)); put(mr, Math.cos(a) * 0.455, -0.275 + Math.sin(a) * 0.455, -0.845); mr.rotation.z = a - Math.PI / 2; });
      }
      put(new T.Mesh(new T.TorusGeometry(0.5, 0.024, 8, 32, Math.PI), frame), 0, -0.275, 0.66);
      const glass = new T.Mesh(new T.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), gm); glass.scale.set(0.5, 0.66, 1.62); put(glass, 0, -0.275, -0.12);
    }
    c.traverse((o) => { o.layers.set(1); if (o.isMesh) o.castShadow = false; });
    c.visible = false; model.add(c); ud.cockpit = c;

    // first-person exterior: the real nose ahead of the panel and the spine behind the seat, capped where
    // the interior takes over, so the airframe is still there when you look around
    const fp = new T.Group(), zF = heavy ? -1e9 : e[2] - 1.07, zA = e[2] + (heavy ? 1.2 : 0.68);
    model.updateMatrixWorld(true);
    (ud.core ? ud.core.children.slice() : []).forEach((ch) => {
      if (!ch.isMesh || ch.userData.fpHide) return;
      const pr = ch.userData.prof;
      if (pr) {
        const Pf = pr.p, lf = zF - ch.position.z, la = zA - ch.position.z;
        const mat = ch.material.map && heavy && s.civil ? new T.MeshStandardMaterial({ color: 0xeef0f2, metalness: 0.3, roughness: 0.4, side: T.DoubleSide }) : ch.material;
        const rAt = (zc) => { for (let i = 0; i < Pf.length - 1; i++) if (Pf[i][0] <= zc && Pf[i + 1][0] >= zc) return Pf[i][1] + (Pf[i + 1][1] - Pf[i][1]) * (zc - Pf[i][0]) / Math.max(1e-6, Pf[i + 1][0] - Pf[i][0]); return null; };
        const add = (prof) => { const ms = fus(prof, pr.sx, pr.sy, mat, pr.seg); ms.position.copy(ch.position); ms.rotation.copy(ch.rotation); ms.castShadow = true; fp.add(ms); };
        if (Pf[0][0] < lf) { const r = rAt(lf); add(r === null ? Pf : Pf.filter((p) => p[0] < lf).concat([[lf, r], [lf, 0]])); }
        if (Pf[Pf.length - 1][0] > la) { const r = rAt(la); add(r === null ? Pf : [[la, 0], [la, r]].concat(Pf.filter((p) => p[0] > la))); }
      } else {
        const bb = new T.Box3().setFromObject(ch);
        if (bb.max.z < zF || bb.min.z > zA) fp.add(ch.clone());
      }
    });
    fp.visible = false; model.add(fp); ud.fp = fp;
  }

  // ---------- paint: colours, camouflage patterns, finishes and canopy tints
  G.PAINTS = [
    { id: 'factory', name: 'Factory finish' },
    { id: 'ghost', name: 'Air-superiority grey', pat: 'blotch', cols: ['#8c959e', '#6c7680', '#a7b0b8'] },
    { id: 'desert', name: 'Desert camouflage', pat: 'blotch', cols: ['#c4a878', '#8c6842', '#dccca2'] },
    { id: 'woodland', name: 'Woodland camouflage', pat: 'blotch', cols: ['#55633c', '#2c3824', '#7d6c49', '#1c2019'] },
    { id: 'jungle', name: 'Jungle tiger stripes', pat: 'stripes', cols: ['#5a6b3a', '#1d2418', '#7b7a46'] },
    { id: 'arctic', name: 'Arctic splinter', pat: 'splinter', cols: ['#e6ebf0', '#a9b4c0', '#6c7d90'] },
    { id: 'aggressor', name: 'Aggressor blue splinter', pat: 'splinter', cols: ['#5f82ad', '#2b4874', '#abc1d9'] },
    { id: 'digital', name: 'Digital grey', pat: 'digital', cols: ['#7f8c84', '#515d57', '#a6b0a8', '#333b38'] },
    { id: 'digidesert', name: 'Digital desert', pat: 'digital', cols: ['#c9b388', '#9a7a52', '#e0d3b0', '#6d5a40'] },
    { id: 'tiger', name: 'Tiger meet', pat: 'stripes', cols: ['#e09a1c', '#15120e'] },
    { id: 'navy', name: 'Naval grey-blue', pat: 'solid', cols: ['#5f6f7f'] },
    { id: 'night', name: 'Night black', pat: 'solid', cols: ['#1d1f23'] },
    { id: 'white', name: 'Anti-flash white', pat: 'solid', cols: ['#e8ebee'] },
    { id: 'custom', name: 'Custom colours…' }
  ];
  G.PATTERNS = [['solid', 'Solid colour'], ['blotch', 'Blotches'], ['splinter', 'Splinter'], ['digital', 'Digital'], ['stripes', 'Tiger stripes']];
  G.FINISHES = [['std', 'Standard', null], ['matte', 'Matte', [0.1, 0.9]], ['satin', 'Satin', [0.45, 0.45]], ['gloss', 'Gloss', [0.6, 0.18]], ['metal', 'Polished metal', [1.0, 0.22]]];
  G.GLASSES = [['def', 'Standard for this aircraft'], ['smoke', 'Smoke', 0x1a2a33, 0.5, 0.9], ['gold', 'Gold', 0x7a5c1e, 0.55, 1.0], ['clear', 'Clear', 0xcfe4f0, 0.14, 0.2], ['blue', 'Blue', 0x1c3d6b, 0.5, 0.9], ['amber', 'Amber', 0x8a4a18, 0.5, 0.9], ['mirror', 'Mirror', 0xd5dde4, 0.9, 1.0]];
  G.LIVERIES = ['Blue', 'Red', 'Orange', 'Green', 'Purple'];
  const glassCache = {};
  function glassMat(id) {
    if (glassCache[id]) return glassCache[id];
    const d = G.GLASSES.find((q) => q[0] === id) || G.GLASSES[1];
    const mt = new T.MeshPhysicalMaterial({ color: d[2], metalness: d[4], roughness: 0.05, transparent: true, opacity: d[3], clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.7 });
    mt.userData.noPaint = true;
    // glass turns mirror-like at glancing angles
    mt.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = mix(diffuseColor.a, 0.97, pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.2));\n#include <opaque_fragment>'); };
    return (glassCache[id] = mt);
  }
  const defGlass = (spec) => (['f16', 'f22', 'f35', 'su57', 'j20'].indexOf(spec.id) >= 0 ? 'gold' : 'smoke');
  function resolvePaint(spec, p) {
    if (!p || spec.rocket || spec.civil) return null;
    const sc = G.PAINTS.find((q) => q.id === p.scheme) || G.PAINTS[0];
    let pat = sc.pat, cols = sc.cols;
    if (sc.id === 'custom') { pat = p.pat || 'solid'; cols = [p.c1 || '#7c858e', p.c2 || '#3f4a55']; }
    const fd = G.FINISHES.find((q) => q[0] === p.finish), fin = fd ? fd[2] : null;
    if (!cols && !fin) return null;
    return { pat, hex: cols, cols: cols && cols.map((q) => new T.Color(q)), fin, key: pat + (cols || []).join('') };
  }
  let panelTileC = null;
  function panelTile() {
    if (panelTileC) return panelTileC;
    const c = panelTileC = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = G.rng(21);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9; i++) { const v = 232 + Math.floor(r() * 23); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 256, r() * 256, 40 + r() * 90, 30 + r() * 80); }
    x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 1.2;
    [0, 64, 128, 192].forEach((p) => { x.beginPath(); x.moveTo(p + 0.5, 0); x.lineTo(p + 0.5, 256); x.stroke(); x.beginPath(); x.moveTo(0, p + 0.5); x.lineTo(256, p + 0.5); x.stroke(); });
    x.strokeStyle = 'rgba(0,0,0,0.18)'; [32, 160].forEach((p) => { x.beginPath(); x.moveTo(p, 64); x.lineTo(p, 192); x.stroke(); });
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let p = 8; p < 256; p += 16) { [3, 67, 131, 195].forEach((q) => { x.fillRect(p, q, 1.6, 1.6); x.fillRect(q, p, 1.6, 1.6); }); }
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.strokeRect(84, 84, 30, 18); x.strokeRect(150, 20, 22, 26);
    return c;
  }
  function panelTexture(rx, ry) {
    const t = new T.CanvasTexture(panelTile()); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  // tileable camouflage; asp > 1 squeezes the pattern along v so it stays round on a long fuselage
  function camo(x, paint, W, H, sc, asp) {
    let hsh = 7; for (let i = 0; i < paint.key.length; i++) hsh = (hsh * 31 + paint.key.charCodeAt(i)) >>> 0;
    const cols = paint.hex, r = G.rng(hsh), VH = H * asp, nc = cols.length - 1;
    x.fillStyle = cols[0]; x.fillRect(0, 0, W, H);
    x.save(); x.scale(1, 1 / asp);
    const wrap = (fn) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { x.save(); x.translate(dx * W, dy * VH); fn(); x.restore(); } };
    const n = Math.max(4, Math.round(W * VH / (sc * sc) * 0.6));
    if (paint.pat === 'blotch') {
      for (let i = 0; i < n; i++) {
        const cx = r() * W, cy = r() * VH, parts = [];
        for (let k = 0; k < 6; k++) parts.push([cx + (r() - 0.5) * sc * 1.6, cy + (r() - 0.5) * sc * 1.6, sc * (0.28 + r() * 0.45)]);
        x.fillStyle = cols[1 + i % nc];
        wrap(() => { x.beginPath(); parts.forEach((p) => { x.moveTo(p[0] + p[2], p[1]); x.arc(p[0], p[1], p[2], 0, 6.2832); }); x.fill(); });
      }
    } else if (paint.pat === 'splinter') {
      for (let i = 0; i < n; i++) {
        const cx = r() * W, cy = r() * VH, nv = r.int(3, 5), a0 = r() * 6.28, pts = [];
        for (let k = 0; k < nv; k++) { const a = a0 + (k + r() * 0.6) * 6.2832 / nv, rad = sc * (0.5 + r() * 1.2); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
        x.fillStyle = cols[1 + i % nc];
        wrap(() => { x.beginPath(); pts.forEach((p, k) => (k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fill(); });
      }
    } else if (paint.pat === 'digital') {
      const cell = Math.max(8, Math.round(sc / 7));
      for (let i = 0; i < n * 2; i++) {
        const cx = Math.round(r() * W / cell) * cell, cy = Math.round(r() * VH / cell) * cell, sq = [];
        for (let k = 0; k < 30; k++) sq.push([cx + r.int(-5, 5) * cell, cy + r.int(-4, 4) * cell, cell * r.int(1, 2), cell * r.int(1, 2)]);
        x.fillStyle = cols[1 + i % nc];
        wrap(() => sq.forEach((q) => x.fillRect(q[0], q[1], q[2], q[3])));
      }
    } else if (paint.pat === 'stripes') {
      const nb = Math.max(3, Math.round(VH / (sc * 0.8)));
      for (let i = 0; i < nb; i++) {
        const y0 = (i + 0.5) * VH / nb, A1 = sc * (0.2 + r() * 0.3), p1 = r.int(1, 3), ph = r() * 6.28, q1 = r.int(2, 5), ph2 = r() * 6.28, th = sc * (0.2 + r() * 0.22);
        x.fillStyle = cols[1 + i % nc];
        const top = [], bot = [];
        for (let px = 0; px <= W; px += 12) {
          const u = px / W * 6.2832, yc = y0 + A1 * Math.sin(u * p1 + ph) + A1 * 0.4 * Math.sin(u * (p1 + 2) + ph2), tk = th * Math.max(0, 0.3 + Math.sin(u * q1 + ph2));
          top.push([px, yc - tk]); bot.push([px, yc + tk]);
        }
        for (let dy = -1; dy <= 1; dy++) { x.save(); x.translate(0, dy * VH); x.beginPath(); top.forEach((p, k) => (k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); bot.reverse().forEach((p) => x.lineTo(p[0], p[1])); bot.reverse(); x.closePath(); x.fill(); x.restore(); }
      }
    }
    x.restore();
  }
  const texCache = new Map();
  function paintTex(paint, kind, asp) {
    const key = paint.key + kind + (kind === 'lathe' ? asp : '');
    let t = texCache.get(key); if (t) return t;
    if (kind === 'other') { t = paintTex(paint, 'extr').clone(); t.repeat.set(0.3, 0.3); t.needsUpdate = true; }
    else {
      const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'), lathe = kind === 'lathe';
      camo(x, paint, 1024, 1024, lathe ? 330 : 150, lathe ? asp : 1);
      const nx = lathe ? 5 : 4, ny = lathe ? 9 : 4, tile = panelTile();
      x.globalCompositeOperation = 'multiply';
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) x.drawImage(tile, i * 1024 / nx, j * 1024 / ny, 1024 / nx, 1024 / ny);
      x.globalCompositeOperation = 'source-over';
      t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
      if (!lathe) t.repeat.set(1 / 12, 1 / 12);
    }
    texCache.set(key, t);
    if (texCache.size > 30) { const k0 = texCache.keys().next().value; texCache.get(k0).dispose(); texCache.delete(k0); }
    return t;
  }

  // ---------- shared detail: paint and panel lines, navigation lights, pilot, pitot, external stores
  let texExtr = null, texLathe = null;
  G.navMats = {
    red: new T.MeshBasicMaterial({ color: 0xff2a1a, fog: false, toneMapped: false }), green: new T.MeshBasicMaterial({ color: 0x22ff55, fog: false, toneMapped: false }),
    white: new T.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false }), beacon: new T.MeshBasicMaterial({ color: 0xff3020, fog: false, toneMapped: false })
  };
  function decorate(m, spec, opt) {
    const detail = !opt || opt.detail || !opt.noCockpit, lights = detail || (opt && opt.lights);
    if (!texExtr) { texExtr = panelTexture(0.33, 0.33); texLathe = panelTexture(5, 9); }
    const ud = m.userData, paint = resolvePaint(spec, opt && opt.paint), local = new Map();
    const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    const c0 = ud.core && ud.core.children[0], prim = c0 && c0.material && c0.material.color ? c0.material.color : new T.Color(0x808080), Lp = Math.max(0.01, lum(prim));
    ud.baseColor = paint && paint.cols ? paint.cols[0].clone() : prim.clone();
    m.traverse((o) => {
      if (!o.isMesh) return; const bm = o.material;
      if (!bm.isMeshStandardMaterial || bm.map || bm.transparent || bm.userData.noPaint) return;
      const ty = o.geometry.type, kind = ty === 'ExtrudeGeometry' ? 'extr' : ty === 'LatheGeometry' ? 'lathe' : 'other';
      let asp = 1;
      if (kind === 'lathe' && o.userData.prof) { const pr = o.userData.prof, P = pr.p; let rm = 0.1; P.forEach((q) => { rm = Math.max(rm, q[1]); }); asp = clamp(Math.round((P[P.length - 1][0] - P[0][0]) / (Math.PI * rm * (pr.sx + pr.sy))), 1, 6); }
      const key = bm.uuid + kind + asp; let mat = local.get(key);
      if (!mat) {
        mat = bm.clone(); mat.userData = { noPaint: true };
        const plain = kind === 'extr' ? texExtr : kind === 'lathe' ? texLathe : null;
        if (paint && paint.fin) { mat.metalness = paint.fin[0]; mat.roughness = paint.fin[1]; }
        if (paint && paint.cols) {
          const r = clamp(lum(bm.color) / Lp, 0.5, 1.3);
          if (paint.pat === 'solid') { mat.color.copy(paint.cols[0]).multiplyScalar(r); mat.map = plain; }
          else { mat.color.setScalar(Math.min(1, r)); mat.map = paintTex(paint, kind, asp); }
        } else mat.map = plain;
        local.set(key, mat);
      }
      o.material = mat;
    });
    if (spec.rocket || !lights) return;
    const big = spec.span > 22, k = clamp(spec.span / 12, 0.8, 2.4), lg = new T.SphereGeometry(0.11 * k, 8, 6);
    if (ud.tips && ud.tips.length >= 2) {
      const r = new T.Mesh(lg, G.navMats.green); r.position.set(ud.tips[0][0], ud.tips[0][1], ud.tips[0][2] - 0.6); m.add(r);
      const l = new T.Mesh(lg, G.navMats.red); l.position.set(ud.tips[1][0], ud.tips[1][1], ud.tips[1][2] - 0.6); m.add(l);
    }
    const st = new T.Mesh(lg, G.navMats.white); st.position.set(0, 0.25, spec.length * 0.49); m.add(st);
    const bc = new T.Mesh(lg, G.navMats.beacon); bc.position.set(0, -(big ? 2.0 : 0.95), 0); m.add(bc);
    if (!detail) return;
    if (!big) { // fighters: pilot, pitot probe, blade antennas, bombs on wing pylons
      const e = spec.cam.cockpit, core = ud.core || m, hp = (o) => { o.userData.fpHide = true; core.add(o); return o; };
      const helm = std(0xd8dade, 0.2, 0.5), suit = std(0x4a5240, 0.1, 0.9);
      hp(at(new T.Mesh(new T.SphereGeometry(0.15, 12, 10), helm), e[0], e[1] - 0.02, e[2] + 0.12));
      hp(at(blob(0.125, 0.075, 0.1, M.window), e[0], e[1] - 0.005, e[2] + 0.02));           // visor
      hp(at(box(0.085, 0.09, 0.09, M.dark), e[0], e[1] - 0.1, e[2] + 0.03));                  // oxygen mask
      hp(at(box(0.36, 0.42, 0.26, suit), e[0], e[1] - 0.36, e[2] + 0.16));
      hp(at(box(0.46, 0.1, 0.24, suit), e[0], e[1] - 0.2, e[2] + 0.16));
      hp(at(box(0.3, 0.62, 0.1, M.dark), e[0], e[1] - 0.14, e[2] + 0.42));                    // ejection seat
      hp(at(box(0.5, 0.04, 0.34, M.dark), e[0], e[1] - 0.3, e[2] - 0.62));                    // glareshield
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
    } else { // heavies: antennas along the spine
      [-0.2, 0.05, 0.25].forEach((t) => m.add(at(box(0.05, 0.5, 0.7, M.dark), 0, spec.id === 'b2' ? 1.9 : 2.1, spec.length * t)));
    }
  }

  // ---------- animation: move every hinged part to match the flight state
  // st: { gear, flaps, brake, pitch, roll, yaw, alpha, onGround, V, rpm, ab, throttle, steer, decel, bump, brakeTemp, gearTarget, flapsTarget }
  const REST = { gear: 1, flaps: 0, brake: 0, pitch: 0, roll: 0, yaw: 0, alpha: 0, onGround: true, V: 0, rpm: 0, ab: 0, throttle: 0, steer: 0, decel: 0, bump: 0, brakeTemp: 15, gearTarget: 1, flapsTarget: 0, nz: 0 };
  function surfAngle(s, st, A) {
    const sd = s.side, mx = s.max;
    switch (s.kind) {
      case 'flap': return st.flaps * mx;
      case 'flaperon': return clamp(st.flaps * mx * 0.8 - st.roll * sd * 0.3, -0.5, 0.7);
      case 'ail': return -st.roll * sd * mx;
      case 'ailbU': return -st.roll * sd * mx - st.brake * 0.75;
      case 'ailbL': return -st.roll * sd * mx + st.brake * 0.75;
      case 'splitU': return -(st.brake * 0.8 + clamp(st.yaw * sd, 0, 1) * 0.5);
      case 'splitL': return st.brake * 0.8 + clamp(st.yaw * sd, 0, 1) * 0.5;
      case 'elevon': return clamp(-st.pitch * mx - st.roll * sd * 0.25 + st.flaps * 0.1, -0.6, 0.6);
      case 'elev': return -st.pitch * mx - st.roll * sd * mx * 0.3;
      case 'elevTE': return -st.pitch * mx;
      case 'canard': return clamp(st.pitch * mx - st.alpha * 0.7, -0.5, 0.5) * (1 - A.gb) - A.gb * 0.9;
      case 'rud': return st.yaw * sd * mx;
      case 'rudb': return st.yaw * sd * mx + st.brake * 0.45;
      case 'lef': case 'slat': return A.lef * mx;
      case 'spoiler': return A.sp * mx;
      case 'spoilr': return Math.max(A.sp, clamp(st.roll * sd, 0, 1) * 0.6) * mx;
      case 'brake': return st.brake * mx;
    }
    return 0;
  }
  G.poseAircraft = function (m, st, dt) {
    st = st || REST;
    const ud = m.userData, A = ud.anim || (ud.anim = { ext: st.onGround ? 0 : 1, extV: 0, gk: st.onGround ? 1 : 0, dip: 0, spin: 0, spinW: 0, lef: 0, sp: 0, gb: 0, dy: 0 });
    const k = (r) => (dt ? Math.min(1, dt * r) : 1);
    A.lef += (clamp(Math.max(st.flaps, (st.alpha - 0.05) / 0.22), 0, 1) - A.lef) * k(3);
    A.sp += (Math.max(st.brake, st.onGround && st.throttle < 0.15 && st.V > 18 ? 1 : 0) - A.sp) * k(4);
    A.gb += ((st.onGround ? st.brake : 0) - A.gb) * k(4);
    if (ud.surf) for (let i = 0; i < ud.surf.length; i++) { const s = ud.surf[i]; s.pivot.quaternion.setFromAxisAngle(s.axis, surfAngle(s, st, A) * s.sgn); }
    if (ud.nozzles) { const q = 1 - 0.2 * sstep(0.15, 0.85, st.rpm) + 0.22 * st.ab; ud.nozzles.forEach((n) => n.scale.set(q, q, 1)); }
    A.dy = 0;
    if (ud.legs) {
      const gr = st.gear, d = ud.oleoD;
      ud.gear.visible = gr > 0.03;
      // oleo struts: a damped spring that droops in the air, takes the load on the ground and soaks up the touchdown
      const tgt = st.onGround ? clamp((st.nz || 0) * 0.9 - 0.15, 0, 0.75) : 1, h = Math.min(dt, 0.033);
      if (st.bump) A.extV -= st.bump * 2.2;
      A.extV += ((tgt - A.ext) * 110 - A.extV * 12) * h; A.ext = clamp(A.ext + A.extV * h, -1.3, 1);
      A.gk += ((st.onGround ? 1 : 0) - A.gk) * k(3);
      A.dip += ((st.onGround ? clamp(st.decel * 0.0032, -0.012, 0.028) : 0) - A.dip) * k(5);
      A.dy = A.ext * d * A.gk;
      if (st.onGround) A.spinW = st.V; else A.spinW *= Math.exp(-0.3 * dt);
      A.spin += A.spinW * dt;
      for (let i = 0; i < ud.legs.length; i++) {
        const l = ud.legs[i], dn = sstep(0.14 + l.phase, 0.9 + l.phase, gr), ang = (1 - dn) * 1.55, sh = sstep(0.03, 0.3, gr);
        if (l.fold === 'fwd') l.piv.rotation.x = ang; else if (l.fold === 'aft') l.piv.rotation.x = -ang; else l.piv.rotation.z = -Math.sign(l.x) * ang;
        l.piv.scale.setScalar(0.45 + 0.55 * sh); l.piv.position.y = (1 - sh) * l.r * 0.7;
        const da = sstep(0.0, 0.16, gr) * 1.45; l.doors.forEach((q) => { q.o.rotation.z = q.sd * da; });
        l.low.position.y = -A.ext * d + (l.nose ? A.dip * ud.gearArm : 0);
        l.steer.rotation.y = l.nose && st.onGround ? -st.steer * 0.6 : 0;
        const wa = -A.spin / l.r; l.wheels.forEach((w) => { w.rotation.x = wa; });
      }
      ud.brakeMat.emissiveIntensity = clamp((st.brakeTemp - 260) / 420, 0, 1) * 3;
      ud.lampMat.color.setHex(gr > 0.97 ? 0xfff6d8 : 0x30343a);
    }
    const P = ud.cp;
    if (P && ud.cockpit && ud.cockpit.visible) {
      if (P.stick) { P.stick.rotation.x = st.pitch * 0.17; P.stick.rotation.z = -st.roll * (P.wheel ? 0.02 : 0.17); }
      if (P.wheel) P.wheel.rotation.z = -st.roll * 0.9;
      if (P.thr) P.thr.position.z = P.thrZ - st.throttle * P.thrRange;
      if (P.levers) P.levers.forEach((lv) => { lv.rotation.x = 0.5 - st.throttle * 1.0; });
      if (P.gearH) P.gearH.position.y += ((st.gearTarget ? -0.5 : -0.42) + (P.levers ? 0 : 0.03) - P.gearH.position.y) * k(8);
      if (P.flapL) P.flapL.rotation.x = -0.4 + st.flapsTarget * 0.8;
      if (P.brkL) P.brkL.rotation.x = -0.4 + st.brake * 0.8;
    }
    return A;
  };

  G.buildAircraft = function (spec, opt) {
    opt = opt || {};
    const pt = opt.paint || {};
    FULL = !opt.noCockpit || !!opt.detail;
    GLASS = glassMat(pt.glass && pt.glass !== 'def' && G.GLASSES.some((q) => q[0] === pt.glass) ? pt.glass : defGlass(spec));
    if (spec.id === 'a320' && pt.livery != null && opt.livery == null) opt = Object.assign({}, opt, { livery: pt.livery });
    const m = builders[spec.id](spec, opt);
    m.traverse((o) => { if (o.isMesh && !(o.material.blending === T.AdditiveBlending)) { o.castShadow = true; } });
    decorate(m, spec, opt);
    m.traverse((o) => { if (o.isMesh && o.material && (o.material === G.navMats.red || o.material === G.navMats.green || o.material === G.navMats.white || o.material === G.navMats.beacon)) o.castShadow = false; });
    if (!opt.noCockpit && !spec.rocket) addCockpit(m, spec);
    if (FULL) G.poseAircraft(m, REST, 0);
    return m;
  };

  // Bake a model's static parts into one mesh per material. An aircraft built from fifty little meshes costs fifty draw
  // calls and fifty matrix updates a frame; baked, it costs a handful. Anything under `keep` (parts that move or are
  // switched on and off) is left alone.
  const HIDDEN = new T.MeshBasicMaterial({ visible: false });
  G.flattenModel = function (root, keep) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), kept = new Set(), groups = new Map(), gone = [];
    (keep || []).forEach((o) => { if (o) o.traverse((c) => kept.add(c)); });
    const m4 = new T.Matrix4(), n3 = new T.Matrix3(), v = new T.Vector3();
    root.traverse((o) => {
      if (o === root || !o.isMesh || o.isInstancedMesh || kept.has(o) || Array.isArray(o.material) || !o.geometry.attributes.position || !o.geometry.attributes.normal) return;
      for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return;
      const names = Object.keys(o.geometry.attributes).sort().join(','), k = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + o.renderOrder + '|' + o.layers.mask + '|' + names;
      let e = groups.get(k); if (!e) groups.set(k, e = { src: o, parts: [], n: 0 });
      e.parts.push(o); gone.push(o);
    });
    groups.forEach((e) => {
      if (e.parts.length < 2) { gone.splice(gone.indexOf(e.parts[0]), 1); return; }
      const geos = e.parts.map((o) => (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry)); let total = 0; geos.forEach((gg) => { total += gg.attributes.position.count; });
      const out = new T.BufferGeometry();
      Object.keys(geos[0].attributes).forEach((nm) => {
        const a0 = geos[0].attributes[nm], sz = a0.itemSize, arr = new a0.array.constructor(total * sz); let off = 0;
        geos.forEach((gg, gi) => {
          const a = gg.attributes[nm], o = e.parts[gi], n = a.count; m4.multiplyMatrices(inv, o.matrixWorld); const flip = m4.determinant() < 0;
          if (nm === 'normal') n3.getNormalMatrix(m4);
          for (let i = 0; i < n; i++) {
            const src = flip && i % 3 ? i + (i % 3 === 1 ? 1 : -1) : i, d = (off + i) * sz; // mirrored parts need their winding reversed
            if (nm === 'position') { v.fromBufferAttribute(a, src).applyMatrix4(m4); arr[d] = v.x; arr[d + 1] = v.y; arr[d + 2] = v.z; }
            else if (nm === 'normal') { v.fromBufferAttribute(a, src).applyMatrix3(n3).normalize(); arr[d] = v.x; arr[d + 1] = v.y; arr[d + 2] = v.z; }
            else for (let c = 0; c < sz; c++) arr[d + c] = a.array[src * sz + c];
          }
          off += n;
        });
        out.setAttribute(nm, new T.BufferAttribute(arr, sz, a0.normalized));
      });
      const mesh = new T.Mesh(out, e.src.material); mesh.castShadow = e.src.castShadow; mesh.receiveShadow = e.src.receiveShadow; mesh.renderOrder = e.src.renderOrder; mesh.layers.mask = e.src.layers.mask;
      mesh.matrixAutoUpdate = false; root.add(mesh);
    });
    // a merged mesh that still parents live parts keeps its node but draws nothing
    gone.forEach((o) => { if (o.children.length) { o.material = HIDDEN; return; } let p = o.parent; p.remove(o); while (p && p !== root && !p.children.length && !kept.has(p) && !p.isMesh) { const pp = p.parent; if (pp) pp.remove(p); p = pp; } });
    return root;
  };

  // a hot-air balloon: an envelope of coloured gores, a wicker basket on ropes and a burner. Origin at the envelope's centre.
  G.buildBalloon = function (cols, R) {
    const g = new T.Group(), k = R / 13, mats = cols.map((c) => new T.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, side: T.DoubleSide }));
    const prof = [[2.3, -21], [4.2, -18], [7.6, -13], [10.8, -7], [12.6, -1], [13, 4], [12, 8.5], [9.4, 11.6], [5.2, 13.4], [0.02, 14]].map((q) => new T.Vector2(q[0] * k, q[1] * k)), N = 16;
    for (let i = 0; i < N; i++) g.add(new T.Mesh(new T.LatheGeometry(prof, 2, i / N * Math.PI * 2, Math.PI * 2 / N), mats[i % mats.length]));
    const wicker = std(0x8a5a2b, 0.0, 0.9), dk = std(0x2a2d31, 0.4, 0.6), by = -27.5 * k;
    g.add(at(box(2.6 * k, 1.7 * k, 2.6 * k, wicker), 0, by, 0)); g.add(at(box(2.8 * k, 0.2 * k, 2.8 * k, dk), 0, by + 0.9 * k, 0));
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((q) => g.add(limb(new V3(q[0] * 1.25 * k, by + 0.9 * k, q[1] * 1.25 * k), new V3(q[0] * 1.9 * k, -21 * k, q[1] * 1.9 * k), 0.05 * k, dk)));
    g.add(at(box(0.9 * k, 0.5 * k, 0.9 * k, dk), 0, -23.2 * k, 0));
    const fl = new T.Mesh(new T.ConeGeometry(0.55 * k, 2.6 * k, 8), new T.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, fog: false })); fl.position.y = -21.6 * k;
    G.flattenModel(g, []); g.add(fl); g.userData.flame = fl; g.userData.R = R;
    return g;
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
