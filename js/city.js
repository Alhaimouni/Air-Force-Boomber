// Procedural city: many architectural styles, landmarks, districts, SAM sites.
(function () {
  'use strict';
  const T = THREE, GB = G.GB, C = G.C, clamp = G.clamp;
  let GLASS = [0x2c4a6a, 0x3f6b7c, 0x1c2a3a, 0x4d6f8f, 0x356b5c, 0x6b5a3a, 0x27323d, 0x5b7fa6, 0x2e5d7a, 0x4a3f5c, 0x7a8c96];
  let STONE = [0xc9b99a, 0xb5a88f, 0xd8d2c4, 0x9c948a, 0xa89f95, 0xcfc3ad, 0xb8a27e];
  let CONC = [0x9a9a96, 0x8a8c8e, 0xb0aeaa, 0x7d7f82, 0xa5a29b];
  let BRICK = [0x8a4b3a, 0x9c5a45, 0x7a4034, 0xa86a50, 0x6e3b30, 0xb07a5a, 0x93614c];
  let ROOF = [0x7a3b2e, 0x4a4f55, 0x8c5a3c, 0x3c4a44, 0x5c3a32, 0x2f3438, 0x9a4a35];
  let PAINT = [0xe8e2d2, 0xd9c9a8, 0xc9d6dc, 0xe6d5c3, 0xb8c7b0, 0xdcc0a6, 0xf0ede6, 0xd6b8a8, 0xbfc9d6];
  const sphere = new T.SphereGeometry(1, 20, 12), hemi = new T.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    cone = new T.ConeGeometry(1, 1, 12), torus = new T.TorusGeometry(1, 0.022, 6, 48), halfCyl = new T.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI),
    ico = new T.IcosahedronGeometry(1, 1);
  // lighter meshes for small copies (a 2 m dish or bush does not need 400 triangles)
  sphere.userData.lo = new T.SphereGeometry(1, 8, 5); sphere.userData.mid = new T.SphereGeometry(1, 13, 8);
  hemi.userData.lo = new T.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2); hemi.userData.mid = new T.SphereGeometry(1, 13, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cone.userData.lo = new T.ConeGeometry(1, 1, 7);
  let R; // current rng
  const fc = (cw, ch, st) => [cw, ch, st, Math.floor(R() * 90)];
  const pc = (arr) => C(R.pick(arr));
  const roofC = () => C(R.pick([0x4a4c4e, 0x5a5c5e, 0x3c3e40, 0x6a6862]));
  const spire = (gb, x, y, z, r, h, col) => gb.prism(GB.ngon(x, z, r, r, 8), y, y + h, col, null, { top: 0.02 });
  const antenna = (gb, x, y, z, h) => { gb.cyl(x, y, z, 0.6, h, 5, C(0xc8c8c8), null, { top: 0.3 }); };
  const roofClutter = (gb, w, d, h) => {
    const n = R.int(1, 3);
    for (let i = 0; i < n; i++) gb.box(R.range(-w * 0.25, w * 0.25), h, R.range(-d * 0.25, d * 0.25), R.range(4, w * 0.3), R.range(2, 5), R.range(4, d * 0.3), C(0x77797b));
  };

  // ---------- towers: (gb, w, d, h)
  const towers = {
    glassBox(gb, w, d, h) {
      gb.box(0, 0, 0, w, h, d, pc(GLASS), fc(R.range(1.6, 3), 3.7, 2), roofC());
      gb.box(0, h, 0, w * 0.55, 7, d * 0.55, pc(CONC)); if (R.chance(0.5)) antenna(gb, 0, h + 7, 0, h * 0.18);
    },
    setback(gb, w, d, h) {
      const n = R.int(3, 5), col = pc(STONE), f = fc(3, 3.7, 1); let y = 0;
      for (let i = 0; i < n; i++) {
        const s = 1 - i * (0.62 / n), hh = h * (i === 0 ? 0.45 : 0.55 / (n - 1));
        gb.box(0, y, 0, w * s, hh, d * s, col, f, roofC()); y += hh;
      }
      spire(gb, 0, y, 0, w * 0.1, h * 0.22, C(0x8f9aa0));
    },
    cylinder(gb, w, d, h) {
      const r = Math.min(w, d) / 2;
      gb.cyl(0, 0, 0, r, h, 24, pc(GLASS), fc(2.2, 3.7, 2), { capCol: roofC() });
      gb.cyl(0, h, 0, r * 0.6, 5, 16, pc(CONC));
    },
    twisted(gb, w, d, h) {
      const s = Math.min(w, d) * 0.78;
      gb.prism(GB.rect(0, 0, s, s), 0, h, pc(GLASS), fc(2.6, 3.7, 2), { twist: R.range(1.2, 2.6) * (R.chance(0.5) ? 1 : -1), segs: 26, capCol: roofC() });
    },
    pyramidTop(gb, w, d, h) {
      const s = Math.min(w, d), hb = h * 0.8;
      gb.box(0, 0, 0, s, hb, s, pc(STONE), fc(2.8, 3.7, R.chance(0.5) ? 1 : 4));
      gb.prism(GB.rect(0, 0, s, s), hb, h, C(R.pick([0x3f7a66, 0x2f3438, 0x7a5a3a])), null, { top: 0.02 });
      antenna(gb, 0, h, 0, 14);
    },
    tapered(gb, w, d, h) {
      gb.prism(GB.rect(0, 0, w, d), 0, h, pc(GLASS), fc(3, 3.7, 2), { top: R.range(0.45, 0.7), capCol: roofC() });
      antenna(gb, -w * 0.12, h, 0, h * 0.2); antenna(gb, w * 0.12, h, 0, h * 0.15);
    },
    hexTower(gb, w, d, h) {
      const r = Math.min(w, d) / 2;
      gb.prism(GB.ngon(0, 0, r, r, 6), 0, h, pc(GLASS), fc(2.4, 3.7, R.chance(0.6) ? 2 : 3), { capCol: roofC() });
      gb.prism(GB.ngon(0, 0, r * 0.5, r * 0.5, 6), h, h + 8, pc(CONC));
    },
    slantTop(gb, w, d, h) {
      const col = pc(GLASS), f = fc(2.4, 3.7, 2), hb = h * 0.82;
      gb.box(0, 0, 0, w, hb, d, col, f);
      gb.wedge(-w / 2, w / 2, -d / 2, d / 2, hb, hb + 1, h, col, f, C(0xb9c2c9));
    },
    stacked(gb, w, d, h) {
      const n = R.int(3, 5), hh = h / n, col = pc(GLASS), col2 = pc(CONC);
      for (let i = 0; i < n; i++) {
        const ox = (i % 2 ? 1 : -1) * w * 0.08, s = 0.82;
        gb.box(ox, i * hh, (i % 2 ? -1 : 1) * d * 0.06, w * s, hh - 3, d * s, col, fc(2.5, 3.6, 2), roofC(), i % 2 ? 0.12 : 0);
        gb.box(0, (i + 1) * hh - 3, 0, w * 0.55, 3, d * 0.55, col2);
      }
    },
    ellipse(gb, w, d, h) {
      gb.prism(GB.ngon(0, 0, w / 2, d * 0.3, 28), 0, h, pc(GLASS), fc(2.2, 3.7, 2), { capCol: roofC() });
      gb.prism(GB.ngon(0, 0, w * 0.2, d * 0.12, 16), h, h + 6, pc(CONC));
    },
    triangle(gb, w, d, h) {
      gb.prism(GB.ngon(0, 0, w * 0.6, d * 0.6, 3, R() * 6), 0, h, pc(R.chance(0.5) ? GLASS : STONE), fc(2.6, 3.7, R.chance(0.5) ? 2 : 1), { capCol: roofC() });
    },
    finSlab(gb, w, d, h) {
      gb.box(0, 0, 0, w, h, d * 0.45, pc(STONE), fc(2.2, h, 4), roofC());
      gb.box(0, 0, 0, w * 0.25, h + 9, d * 0.5, pc(CONC));
    },
    cross(gb, w, d, h) {
      const a = w / 2, b = w * 0.2, P = [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]];
      gb.prism(P, 0, h, pc(STONE), fc(3, 3.6, 1), { capCol: roofC() });
      gb.box(0, h, 0, b * 2, 10, b * 2, pc(CONC)); spire(gb, 0, h + 10, 0, b * 0.5, 22, C(0x8f9aa0));
    },
    weddingCake(gb, w, d, h) {
      const r = Math.min(w, d) / 2, n = R.int(3, 5), col = pc(STONE), f = fc(2.6, 3.7, 1); let y = 0;
      for (let i = 0; i < n; i++) { const hh = h / n; gb.cyl(0, y, 0, r * (1 - i * 0.7 / n), hh, 20, col, f, { capCol: roofC() }); y += hh; }
      spire(gb, 0, y, 0, r * 0.12, h * 0.18, C(0xc8c8c8));
    },
    notched(gb, w, d, h) {
      const col = pc(GLASS), f = fc(2.5, 3.7, 2);
      gb.box(-w * 0.2, 0, 0, w * 0.55, h, d * 0.8, col, f, roofC());
      gb.box(w * 0.22, 0, 0, w * 0.45, h * R.range(0.55, 0.8), d * 0.6, pc(GLASS), fc(2.5, 3.7, 3), roofC());
      antenna(gb, -w * 0.2, h, 0, 20);
    },
    octagon(gb, w, d, h) {
      const r = Math.min(w, d) / 2, col = pc(GLASS);
      gb.prism(GB.ngon(0, 0, r, r, 8, 0.39), 0, h * 0.7, col, fc(2.4, 3.7, 2), { capCol: roofC() });
      gb.prism(GB.ngon(0, 0, r, r, 8, 0.39), h * 0.7, h, col, fc(2.4, 3.7, 2), { top: 0.55, capCol: roofC() });
      antenna(gb, 0, h, 0, h * 0.12);
    }
  };
  let towerKeys = Object.keys(towers);

  // ---------- mid-rise
  const mids = {
    apartment(gb, w, d, h) {
      const col = pc(BRICK);
      gb.box(0, 0, 0, w, h, d, col, fc(3.2, 3.1, 1), roofC());
      gb.box(0, h, 0, w + 1.2, 1, d + 1.2, pc(STONE));
      if (R.chance(0.6)) { gb.cyl(w * 0.25, h + 1, d * 0.2, 2, 4, 8, C(0x6b4a35), null, { capCol: C(0x4a3525) }); }
    },
    office(gb, w, d, h) { gb.box(0, 0, 0, w, h, d, pc(CONC), fc(4, 3.6, 3), roofC()); roofClutter(gb, w, d, h); },
    brutalist(gb, w, d, h) {
      const col = pc(CONC);
      gb.box(0, 0, 0, w * 0.8, h * 0.85, d * 0.8, col, fc(3.5, 3.6, 1));
      gb.box(0, h * 0.85, 0, w, h * 0.15, d, col, fc(3.5, 3.6, 3), roofC());
      gb.box(-w * 0.45, 0, 0, w * 0.12, h + 4, d * 0.3, col); gb.box(w * 0.45, 0, 0, w * 0.12, h + 4, d * 0.3, col);
    },
    lshape(gb, w, d, h) {
      const a = w / 2, b = d / 2, t = 0.42;
      gb.prism([[-a, -b], [a, -b], [a, -b + d * t], [-a + w * t, -b + d * t], [-a + w * t, b], [-a, b]], 0, h, pc(R.chance(0.5) ? BRICK : PAINT), fc(3.2, 3.2, 1), { capCol: roofC() });
    },
    ushape(gb, w, d, h) {
      const a = w / 2, b = d / 2, t = w * 0.28;
      gb.prism([[-a, -b], [a, -b], [a, b], [a - t, b], [a - t, -b + t], [-a + t, -b + t], [-a + t, b], [-a, b]], 0, h, pc(STONE), fc(3.2, 3.4, 1), { capCol: roofC() });
    },
    parking(gb, w, d, h) { h = Math.min(h, 20); gb.box(0, 0, 0, w, h, d, pc(CONC), fc(7, 3.1, 3), C(0x55585a)); gb.box(w * 0.4, h, d * 0.4, 5, 3.5, 5, pc(CONC)); },
    hotel(gb, w, d, h) {
      gb.box(0, 0, 0, w, h, d * 0.4, pc(PAINT), fc(3.6, 3.1, 1), roofC());
      gb.box(0, 0, d * 0.3, w * 0.7, 7, d * 0.4, pc(GLASS), fc(3, 7, 2), roofC());
      gb.box(0, h, 0, w * 0.5, 3, 0.8, C(0xb0261e));
    },
    hospital(gb, w, d, h) {
      const a = w / 2, b = d / 2, t = w * 0.26, m = d * 0.16;
      gb.prism([[-a, -b], [-a + t, -b], [-a + t, -m], [a - t, -m], [a - t, -b], [a, -b], [a, b], [a - t, b], [a - t, m], [-a + t, m], [-a + t, b], [-a, b]], 0, h, C(0xeeeeea), fc(3.4, 3.5, 3), { capCol: roofC() });
      gb.cyl(0, h, 0, 5, 0.6, 12, C(0xb0261e));
    },
    mall(gb, w, d, h) {
      gb.box(0, 0, 0, w, 13, d, pc(PAINT), fc(w / 3, 13, 4), roofC());
      gb.prism(GB.rect(0, 0, w * 0.3, d * 0.3), 13, 22, pc(GLASS), fc(3, 3, 2), { top: 0.05 });
    },
    curtainMid(gb, w, d, h) { gb.box(0, 0, 0, w, h, d, pc(GLASS), fc(2, 3.6, 2), roofC()); roofClutter(gb, w, d, h); },
    roundMid(gb, w, d, h) { const r = Math.min(w, d) / 2; gb.cyl(0, 0, 0, r, h, 18, pc(PAINT), fc(3, 3.3, 3), { capCol: roofC() }); gb.cyl(0, h, 0, r * 0.4, 3, 10, pc(CONC)); },
    terrace(gb, w, d, h) {
      const col = pc(PAINT), n = 4;
      for (let i = 0; i < n; i++) gb.box(0, i * h / n, -i * d * 0.08, w, h / n, d * (1 - i * 0.16), col, fc(3.4, h / n, 3), C(0x5f7a4a));
    }
  };
  let midKeys = Object.keys(mids);

  // ---------- low-rise residential
  function house(gb, x, z, w, d, rot) {
    const h = R.range(5, 7.5), col = pc(PAINT), roof = pc(ROOF), ax = rot;
    gb.box(x, 0, z, w, h, d, col, fc(3.2, h / (h > 6.3 ? 2 : 1.6), 1));
    gb.gable(x, h, z, w + 0.8, d + 0.8, R.range(2.2, 3.6), roof, ax, col);
    if (R.chance(0.5)) gb.box(x + (ax ? w * 0.3 : 0), h, z + (ax ? 0 : d * 0.3), 0.9, 4.5, 0.9, C(0x7a4034));
  }
  const lows = {
    houses(gb, w, d) {
      const n = R.int(4, 5), alongX = w >= d, len = alongX ? w : d, step = len / n;
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + step * (i + 0.5);
        house(gb, alongX ? o : R.range(-2, 2), alongX ? R.range(-2, 2) : o, alongX ? step * 0.62 : R.range(11, 15), alongX ? R.range(11, 15) : step * 0.62, R.chance(0.5));
      }
    },
    rowhouse(gb, w, d) {
      const col = pc(BRICK), h = R.range(9, 12), dd = Math.min(d, 13);
      gb.box(0, 0, 0, w, h, dd, col, fc(3, 3, 1)); gb.gable(0, h, 0, w + 0.6, dd + 0.6, 3.5, pc(ROOF), true, col);
      for (let i = 0; i < 3; i++) gb.box(-w * 0.35 + i * w * 0.35, h + 1, 0, 1, 4, 1, C(0x6e3b30));
    },
    smallApt(gb, w, d) { const h = R.range(12, 18); gb.box(0, 0, 0, w * 0.8, h, d * 0.7, pc(R.chance(0.5) ? PAINT : BRICK), fc(3.2, 3, 1), roofC()); gb.box(0, h, 0, 4, 2.5, 4, pc(CONC)); },
    church(gb, w, d) {
      const col = pc(STONE), l = Math.min(w, 34);
      gb.box(0, 0, 0, l, 10, 12, col, fc(4, 10, 4)); gb.gable(0, 10, 0, l, 13, 6, pc(ROOF), true, col);
      gb.box(-l / 2 - 3, 0, 0, 7, 22, 7, col, fc(3.5, 7, 4)); gb.prism(GB.rect(-l / 2 - 3, 0, 7.6, 7.6), 22, 36, C(0x3c4a44), null, { top: 0.02 });
    },
    school(gb, w, d) {
      gb.box(0, 0, -d * 0.15, w * 0.9, 9, d * 0.35, pc(BRICK), fc(3.5, 4.5, 3), roofC());
      gb.box(-w * 0.3, 0, d * 0.15, w * 0.3, 7, d * 0.4, pc(BRICK), fc(3.5, 3.5, 3), roofC());
    },
    villa(gb, w, d) {
      const col = pc(PAINT), s = Math.min(w, d) * 0.5;
      gb.box(0, 0, 0, s, 7, s, col, fc(3.5, 3.5, 1)); gb.prism(GB.rect(0, 0, s + 1.2, s + 1.2), 7, 11, pc(ROOF), null, { top: 0.05 });
      gb.box(s * 0.7, 0, 0, s * 0.5, 3.5, s * 0.7, col, fc(3, 3.5, 1), roofC());
    }
  };
  let lowKeys = ['houses', 'houses', 'houses', 'rowhouse', 'smallApt', 'villa', 'houses', 'school'];

  // ---------- industrial
  const inds = {
    factory(gb, w, d) {
      const h = R.range(9, 14), col = pc(CONC), n = Math.max(2, Math.floor(w / 14)), sw = w / n;
      gb.box(0, 0, 0, w, h, d, col, fc(6, h, 3));
      for (let i = 0; i < n; i++) gb.wedge(-w / 2 + i * sw, -w / 2 + (i + 1) * sw, -d / 2, d / 2, h, h, h + 5, col, null, C(0x6f8ca0));
      for (let i = 0; i < R.int(1, 2); i++) { const cx = w * 0.3 - i * 9; gb.cyl(cx, 0, d * 0.4, 2.2, R.range(38, 60), 10, C(0x9c5a45), null, { top: 0.6 }); }
    },
    warehouse(gb, w, d) {
      const col = C(R.pick([0x8fa0a8, 0xa9a08c, 0x6f8298, 0xb9b3a4]));
      gb.box(0, 0, 0, w, 8, d, col, fc(w / 4, 8, 4));
      gb.add(halfCyl, 0, 8, 0, 6, w, d / 2, C(0x9aa3aa), 0, 0, Math.PI / 2);
    },
    tanks(gb, w, d) {
      const n = R.int(2, 4), r = Math.min(w, d) / (n > 2 ? 4.4 : 3.2);
      for (let i = 0; i < n; i++) {
        const x = (i % 2 ? 1 : -1) * r * 1.15, z = (i < 2 ? -1 : 1) * r * 1.15 * (n > 2 ? 1 : 0), hh = R.range(10, 18);
        gb.cyl(x, 0, z, r, hh, 18, C(R.pick([0xe6e6e0, 0xd0d4d6, 0xc9b99a])), null, { cap: false });
        gb.add(hemi, x, hh, z, r, r * 0.3, r, C(0xd8d8d2));
      }
    },
    silos(gb, w, d) {
      const n = R.int(3, 5), r = 4.5, hh = R.range(24, 34);
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * r * 2.1; gb.cyl(x, 0, 0, r, hh, 12, C(0xcfc9bb)); gb.add(cone, x, hh + 1.5, 0, r, 3, r, C(0x9a9a96)); }
      gb.box(0, hh, 0, n * r * 2, 3, 3, C(0x7d7f82)); gb.box(n * r + 4, 0, 0, 7, hh + 8, 7, C(0xa5a29b), fc(3, 4, 1));
    },
    depot(gb, w, d) { gb.box(0, 0, 0, w, 7, d * 0.7, C(R.pick([0x4a6f8a, 0x8a4b3a, 0x5a6b55])), fc(8, 7, 4), C(0x8a8c8e)); gb.box(-w * 0.3, 7, 0, 6, 2, 6, C(0x77797b)); }
  };
  const indKeys = Object.keys(inds);

  // ---------- landmarks
  const landmarks = {
    empire(gb) {
      const col = C(0xb5a88f), f = fc(2.8, 3.8, 4); let y = 0;
      [[70, 60, 30], [52, 46, 250], [40, 36, 40], [26, 24, 30], [14, 14, 22]].forEach((t) => { gb.box(0, y, 0, t[0], t[2], t[1], col, f, C(0x6a6862)); y += t[2]; });
      gb.cyl(0, y, 0, 5, 20, 12, C(0x8f9aa0), null, { top: 0.6 }); antenna(gb, 0, y + 20, 0, 55);
      return { name: 'Empire Tower', ch: 372 };
    },
    twin(gb) {
      const col = C(0x9fb0bd), f = fc(2.2, 3.8, 2);
      [-34, 34].forEach((x) => {
        let y = 0;
        [[22, 190], [18, 60], [13, 40], [8, 25]].forEach((t) => { gb.cyl(x, y, 0, t[0], t[1], 16, col, f, { capCol: C(0x8f9aa0) }); y += t[1]; });
        spire(gb, x, y, 0, 3, 55, C(0xc8ccd0));
      });
      gb.box(0, 140, 0, 50, 7, 7, C(0x8f9aa0), fc(3, 3.5, 3));
      return { name: 'Twin Towers', ch: 315 };
    },
    shard(gb) { gb.prism(GB.rect(0, 0, 62, 62), 0, 320, C(0x7fa3bf), fc(3, 3.8, 2), { top: 0.03 }); return { name: 'The Shard' }; },
    tvtower(gb) {
      gb.prism(GB.ngon(0, 0, 9, 9, 14), 0, 210, C(0xb9b6ae), null, { top: 0.4 });
      gb.add(sphere, 0, 205, 0, 16, 10, 16, C(0x8fa3b3));
      gb.cyl(0, 214, 0, 3, 30, 10, C(0xd8d8d2)); gb.cyl(0, 244, 0, 1.2, 70, 6, C(0xc23a2a), null, { top: 0.3 });
      return { name: 'TV Tower', ch: 240 };
    },
    needle(gb) {
      for (let i = 0; i < 3; i++) { const a = i * 2.094; gb.prism(GB.ngon(Math.cos(a) * 12, Math.sin(a) * 12, 2.5, 2.5, 6), 0, 150, C(0xe6e6e0), null, { top: 1, cx: 0, cz: 0, twist: 0 }); }
      gb.cyl(0, 0, 0, 4, 150, 8, C(0xd0d0cc));
      gb.cyl(0, 150, 0, 12, 4, 24, C(0xe6e6e0), null, { top: 2.2 }); gb.cyl(0, 154, 0, 26.4, 5, 24, C(0x3f6b7c), fc(2, 5, 2), { capCol: C(0xd98a2a) });
      gb.cyl(0, 159, 0, 26.4, 5, 24, C(0xd98a2a), null, { top: 0.25 }); antenna(gb, 0, 164, 0, 26);
      return { name: 'Sky Needle', ch: 165 };
    },
    capitol(gb) {
      const col = C(0xe6e2d6);
      gb.box(0, 0, 0, 170, 3, 90, C(0xbdb8aa)); gb.box(0, 3, 0, 150, 20, 60, col, fc(3.2, 20, 4), C(0xa9a59a));
      gb.box(0, 3, 34, 60, 20, 12, col, fc(4, 20, 4)); gb.gable(0, 23, 34, 62, 14, 7, col, true);
      gb.cyl(0, 23, 0, 22, 18, 24, col, fc(2.4, 18, 4));
      gb.add(hemi, 0, 41, 0, 22, 26, 22, C(0xdcd9cf)); gb.cyl(0, 66, 0, 4, 9, 10, col, fc(1.4, 9, 4)); spire(gb, 0, 75, 0, 2.5, 12, C(0xc9a94a));
      return { name: 'Capitol', ch: 60, mult: 3 };
    },
    cathedral(gb) {
      const col = C(0xa89f95), rf = C(0x4a4f55);
      gb.box(0, 0, 0, 30, 34, 90, col, fc(6, 34, 4)); gb.gable(0, 34, 0, 30, 90, 16, rf, false, col);
      gb.box(0, 0, 8, 76, 30, 24, col, fc(6, 30, 4)); gb.gable(0, 30, 8, 76, 24, 13, rf, true, col);
      [-17, 17].forEach((x) => { gb.box(x, 0, -44, 15, 68, 15, col, fc(5, 17, 4)); gb.prism(GB.rect(x, -44, 15, 15), 68, 110, rf, null, { top: 0.02 }); });
      spire(gb, 0, 50, 8, 4, 45, rf);
      return { name: 'Cathedral', ch: 68, mult: 3 };
    },
    mosque(gb) {
      const col = C(0xf0ece0), dome = C(0x2f8f8a), gold = C(0xc9a94a);
      gb.box(0, 0, 0, 70, 16, 70, col, fc(5, 16, 4), C(0xd8d2c4));
      gb.cyl(0, 16, 0, 20, 8, 20, col, fc(2.5, 8, 4)); gb.add(hemi, 0, 24, 0, 20, 20, 20, dome); spire(gb, 0, 44, 0, 1, 8, gold);
      [[-24, -24], [24, -24], [24, 24], [-24, 24]].forEach((p) => gb.add(hemi, p[0], 16, p[1], 8, 8, 8, dome));
      [[-39, -39], [39, -39], [39, 39], [-39, 39]].forEach((p) => {
        gb.cyl(p[0], 0, p[1], 2.4, 58, 10, col); gb.cyl(p[0], 40, p[1], 3.6, 1.5, 10, col); gb.cyl(p[0], 58, p[1], 3.2, 1.5, 10, col);
        gb.add(cone, p[0], 66, p[1], 2.6, 13, 2.6, dome);
      });
      return { name: 'Grand Mosque', ch: 44, mult: 3 };
    },
    pagoda(gb) {
      const red = C(0xa8322a), rf = C(0x2f4a3c); let y = 0;
      gb.box(0, 0, 0, 50, 4, 50, C(0xb8b2a4)); y = 4;
      for (let i = 0; i < 8; i++) {
        const s = 34 - i * 3.2;
        gb.box(0, y, 0, s, 8, s, red, fc(s / 5, 8, 1)); y += 8;
        gb.prism(GB.rect(0, 0, s + 12, s + 12), y, y + 1.2, rf); gb.prism(GB.rect(0, 0, s + 11, s + 11), y + 1.2, y + 4, rf, null, { top: 0.6 }); y += 4;
      }
      spire(gb, 0, y, 0, 2, 22, C(0xc9a94a));
      return { name: 'Tiered Tower', mult: 2 };
    },
    pyramid(gb) { gb.prism(GB.rect(0, 0, 124, 124), 0, 80, C(0x4d6f8f), fc(4, 4, 2), { top: 0.01 }); return { name: 'Glass Pyramid', fill: 0.33, mult: 2 }; },
    arch(gb) {
      const col = C(0xe9e6de), f = fc(3, 3.6, 1);
      gb.box(-42, 0, 0, 22, 95, 60, col, f); gb.box(42, 0, 0, 22, 95, 60, col, f); gb.box(0, 95, 0, 106, 20, 60, col, f, C(0xbdb8aa));
      return { name: 'Grand Arch', mult: 2 };
    },
    ferris(gb) {
      const w = C(0xeef0f2);
      gb.add(torus, 0, 68, 0, 58, 58, 58, w, 0, Math.PI / 2, 0);
      for (let i = 0; i < 8; i++) gb.box(0, 68, 0, 0.7, 116, 0.7, w, null, null, 0), 0;
      const sp = new T.BoxGeometry(0.7, 116, 0.7);
      for (let i = 0; i < 8; i++) gb.add(sp, 0, 68, 0, 1, 1, 1, w, i * Math.PI / 8, 0, 0);
      const leg = new T.BoxGeometry(2.2, 74, 2.2);
      [-1, 1].forEach((s) => { gb.add(leg, 6, 34, s * 17, 1, 1, 1, w, s * 0.25, 0, 0); gb.add(leg, -6, 34, s * 17, 1, 1, 1, w, s * 0.25, 0, 0); });
      for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; gb.add(sphere, 0, 68 + Math.sin(a) * 58, Math.cos(a) * 58, 2.2, 2.6, 3.4, C(0x3f6b7c)); }
      gb.box(0, 0, 0, 30, 5, 60, C(0x8a8c8e), fc(4, 5, 3));
      return { name: 'Observation Wheel', fill: 0.15, mult: 12, hp: 2 };
    },
    clock(gb) {
      const col = C(0xb8a27e), rf = C(0x33383d);
      gb.box(0, 0, 0, 15, 62, 15, col, fc(2.5, 6, 4)); gb.box(0, 62, 0, 18, 14, 18, col);
      const face = new T.CylinderGeometry(1, 1, 1, 20);
      [[0, 9.1, 0], [0, -9.1, 0], [9.1, 0, 1], [-9.1, 0, 1]].forEach((p) => gb.add(face, p[0] * (p[2] ? 1 : 0) + (p[2] ? 0 : 0), 69, p[2] ? 0 : p[1], 5.5, 0.5, 5.5, C(0xf2efe2), p[2] ? 0 : Math.PI / 2, 0, p[2] ? Math.PI / 2 : 0));
      gb.prism(GB.rect(0, 0, 18, 18), 76, 88, rf, null, { top: 0.55 }); gb.box(0, 88, 0, 8, 6, 8, col, fc(2, 6, 4)); gb.prism(GB.rect(0, 0, 9, 9), 94, 112, rf, null, { top: 0.02 });
      gb.box(0, 0, 40, 26, 24, 70, col, fc(3, 6, 4), rf);
      return { name: 'Clock Tower', mult: 4, ch: 96 };
    },
    obelisk(gb) {
      gb.box(0, 0, 0, 40, 2, 40, C(0xbdb8aa));
      gb.prism(GB.rect(0, 0, 16, 16), 2, 150, C(0xeceae4), null, { top: 0.68 }); gb.prism(GB.rect(0, 0, 10.9, 10.9), 150, 166, C(0xeceae4), null, { top: 0.02 });
      return { name: 'Obelisk', mult: 8, hp: 2 };
    },
    globe(gb) {
      gb.cyl(0, 0, 0, 18, 8, 16, C(0xb0aeaa), fc(3, 8, 3)); gb.add(ico, 0, 44, 0, 38, 38, 38, C(0xaebdc8));
      const g2 = gb; g2.cyl(0, 8, 0, 6, 6, 8, C(0x8a8c8e));
      return { name: 'Geodesic Sphere', fill: 0.5, mult: 3 };
    },
    stadium(gb) {
      const pts = [[66, 1], [72, 4], [104, 36], [112, 38], [114, 34], [114, 0]].map((p) => new T.Vector2(p[0], p[1]));
      gb.add(new T.LatheGeometry(pts, 40), 0, 0, 0, 1.25, 1, 1, C(0xc9c9c4));
      gb.add(new T.LatheGeometry([new T.Vector2(92, 40), new T.Vector2(116, 44), new T.Vector2(118, 42)], 40), 0, 0, 0, 1.25, 1, 1, C(0xf2f4f6));
      gb.prism(GB.ngon(0, 0, 82, 66, 32), 0, 1, C(0x3f8a3f));
      for (let i = 0; i < 4; i++) { const a = 0.785 + i * 1.571, x = Math.cos(a) * 150, z = Math.sin(a) * 122; gb.cyl(x, 0, z, 1.5, 62, 6, C(0x8a8c8e)); gb.box(x, 62, z, 12, 6, 3, C(0xe9ecee), null, null, -a + 1.57); }
      return { name: 'Stadium', fill: 0.35, mult: 2, ch: 42 };
    },
    power(gb) {
      const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12, y = t * 115, r = 30 * Math.sqrt(1 + Math.pow((y - 80) / 62, 2)) * 0.82; prof.push(new T.Vector2(r, y)); }
      const ct = new T.LatheGeometry(prof, 28);
      [[-70, -50], [-70, 50], [15, -70]].forEach((p) => gb.add(ct, p[0], 0, p[1], 1, 1, 1, C(0xc9c6bc)));
      gb.box(60, 0, 20, 70, 32, 110, C(0x8fa0a8), fc(8, 32, 4), C(0x6a6862));
      [[105, -30], [105, 0]].forEach((p) => {
        gb.cyl(p[0], 0, p[1], 5, 60, 12, C(0xd8d8d2), null, { top: 0.8 });
        gb.cyl(p[0], 60, p[1], 4, 50, 12, C(0xc23a2a), null, { top: 0.82 }); gb.cyl(p[0], 110, p[1], 3.3, 40, 12, C(0xd8d8d2), null, { top: 0.85 });
      });
      return { name: 'Power Plant', fill: 0.3, mult: 3, ch: 110, stacks: [[-70, 118, -50], [-70, 118, 50], [15, 118, -70], [105, 152, -30]] };
    }
  };

  function samSite(world, x, z, city) {
    const gb = new GB(), g1 = C(0x4f5b3c), g2 = C(0x3c4630);
    gb.cyl(0, 0, 0, 26, 0.5, 20, C(0x8a877c));
    gb.box(0, 0.5, 0, 9, 3, 13, g1);
    const tube = new T.BoxGeometry(1.6, 1.6, 11);
    for (let i = 0; i < 4; i++) gb.add(tube, (i - 1.5) * 2, 7, 0.5, 1, 1, 1, g2, 0.75, 0, 0);
    gb.box(15, 0.5, 9, 6, 4, 6, g1); gb.cyl(15, 4.5, 9, 0.6, 5, 6, g2);
    gb.add(new T.BoxGeometry(7, 4.5, 0.6), 15, 11.5, 9, 1, 1, 1, g2, -0.3, 0.6, 0);
    gb.box(-14, 0.5, -8, 5, 3.4, 9, g1);
    const b = world.addBuilding(gb, x, 0, z, { name: 'SAM site', kind: 'sam', hp: 1.3, value: 60000 });
    const site = { x, z, y: 9, alive: true, cool: 6 + Math.random() * 6, b, city: city || G.CITIES[0].name };
    b.sam = site; world.sams.push(site);
  }

  // ---------- regional styles: palettes and which building types each city uses
  const BASE = { GLASS, STONE, CONC, BRICK, ROOF, PAINT, low: lowKeys, mid: midKeys, tower: towerKeys, lawn: 0x587a3c, walk: 0x6b6c68, park: 0x47702f, trees: true };
  const STYLES = {
    temperate: {},
    london: { BRICK: [0x7a4a38, 0x8c5a44, 0x6a4034, 0x9a6a52, 0x5e3a30, 0xa07a5e], STONE: [0xcfc6b2, 0xb9b09c, 0xd8d2c4, 0xa69d8c], ROOF: [0x3c4046, 0x4a4f55, 0x5a4a44, 0x2f3438],
      low: ['rowhouse', 'rowhouse', 'rowhouse', 'houses', 'smallApt', 'school'], mid: ['apartment', 'apartment', 'lshape', 'ushape', 'office', 'curtainMid', 'brutalist', 'hotel'] },
    paris: { STONE: [0xe2d8c0, 0xd9cdb2, 0xe8e0cc, 0xd2c6aa], PAINT: [0xe8dfc8, 0xe2d8c0, 0xefe8d8], ROOF: [0x5a6670, 0x4f5a64, 0x66727c], lawn: 0x6f7a5c,
      low: ['haussmann', 'haussmann', 'haussmann', 'smallApt'], mid: ['haussmann', 'haussmann', 'haussmann', 'haussmann', 'hotel', 'ushape'], tower: ['glassBox', 'slantTop', 'tapered', 'ellipse', 'finSlab'] },
    gulf: { road: 0x5a544a, GLASS: [0x2c6a8a, 0x3f8fa8, 0x1c3a4a, 0x5ba0c6, 0x2e7d7a, 0x8a7440, 0x9fb8c6, 0x4d6f8f, 0x1f5f6f], STONE: [0xe6dcc4, 0xd8ccb0, 0xf0e8d6], CONC: [0xd0c8b8, 0xc4bca8, 0xddd6c8],
      BRICK: [0xe2d6ba, 0xd6c8a6, 0xeee4cc], PAINT: [0xf2ecdc, 0xe8dfc8, 0xf6f2e8, 0xe0d4b8], ROOF: [0xd8d0bc, 0xc8beaa], lawn: 0xc8b488, walk: 0x9a917c, park: 0x6f8a4a, trees: false,
      low: ['flats', 'flats', 'villa', 'smallApt', 'flats'], mid: ['curtainMid', 'hotel', 'roundMid', 'mall', 'terrace', 'office', 'curtainMid'],
      tower: ['glassBox', 'twisted', 'twisted', 'tapered', 'cylinder', 'ellipse', 'slantTop', 'octagon', 'weddingCake', 'stacked', 'hexTower', 'notched', 'triangle'] },
    cairo: { road: 0x5a544a, STONE: [0xcdb98e, 0xbfa97c, 0xd8c8a0], CONC: [0xb8a888, 0xa89878, 0xc4b494], BRICK: [0xa8764e, 0xb88a5e, 0x9a6a48, 0xc09a6c, 0xae8256], PAINT: [0xd8c8a0, 0xcdb98e, 0xe2d4b0, 0xc4ae84],
      ROOF: [0xb8a888, 0xa89878], lawn: 0xb89c6c, walk: 0x8a7e68, park: 0x6f8a4a, trees: false,
      low: ['flats', 'flats', 'flats', 'smallApt', 'flats', 'masjid'], mid: ['flatsMid', 'flatsMid', 'apartment', 'apartment', 'brutalist', 'lshape', 'masjid'], tower: ['glassBox', 'setback', 'finSlab', 'cross', 'pyramidTop', 'cylinder'] },
    levant: { road: 0x5a544a, GLASS: [0x2c4a6a, 0x3f6b7c, 0x4d6f8f, 0x5b86a8, 0x2e5d7a, 0x6b5a3a], STONE: [0xf0e8d6, 0xe6dcc6, 0xf4eee0], CONC: [0xdcd2bc, 0xd0c6b0], BRICK: [0xece2cc, 0xe2d6bc, 0xf2ead8, 0xe6dcc6], PAINT: [0xf2ecdc, 0xeae2cf, 0xf6f1e4, 0xe4dac4, 0xefe6d2, 0xf8f4ea],
      ROOF: [0xd8cdb6, 0xc8bca4], lawn: 0xc4b48e, walk: 0xa39a84, park: 0x6f8a4a, trees: false,
      low: ['ammanApt', 'ammanApt', 'ammanApt', 'ammanApt', 'flats', 'ammanVilla', 'ammanVilla', 'masjid'], mid: ['ammanBlock', 'ammanBlock', 'ammanBlock', 'flatsMid', 'flatsMid', 'hotel', 'masjid', 'mall'], tower: ['glassBox', 'tapered', 'slantTop', 'ellipse', 'notched'] }
  };
  let ST = BASE;
  function setStyle(name) {
    ST = Object.assign({}, BASE, STYLES[name] || {});
    GLASS = ST.GLASS; STONE = ST.STONE; CONC = ST.CONC; BRICK = ST.BRICK; ROOF = ST.ROOF; PAINT = ST.PAINT;
    lowKeys = ST.low; midKeys = ST.mid; towerKeys = ST.tower;
  }

  // ---------- extra building types
  lows.flats = function (gb, w, d) { // flat-roofed cubic houses with parapets and roof tanks
    const n = R.int(3, 5), alongX = w >= d, len = alongX ? w : d, step = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + step * (i + 0.5), fl = R.int(2, 4), h = fl * 3.1, bw = step * 0.78, bd = R.range(12, 17), col = pc(PAINT);
      const x = alongX ? o : R.range(-3, 3), z = alongX ? R.range(-3, 3) : o, ww = alongX ? bw : bd, dd = alongX ? bd : bw;
      gb.box(x, 0, z, ww, h, dd, col, fc(3.2, 3.1, 1), C(0xbfb5a0));
      gb.box(x, h, z, ww, 0.9, 0.4, col); gb.box(x, h, z + dd / 2 - 0.2, ww, 0.9, 0.4, col); gb.box(x, h, z - dd / 2 + 0.2, ww, 0.9, 0.4, col);
      if (R.chance(0.7)) gb.cyl(x + R.range(-2, 2), h, z + R.range(-2, 2), 0.8, 1.6, 8, C(R.pick([0xe8e8e4, 0x3a3a3a, 0x8a9aa8])));
      if (R.chance(0.4)) gb.box(x + ww * 0.25, h, z, 3, 2.6, 3, col);
    }
  };
  mids.flatsMid = function (gb, w, d, h) { // stepped limestone apartment block
    const col = pc(PAINT), f = fc(3.1, 3.1, 1), hh = Math.max(h, 16);
    gb.box(0, 0, 0, w, hh * 0.7, d, col, f, C(0xbfb5a0));
    gb.box(-w * 0.12, hh * 0.7, 0, w * 0.7, hh * 0.3, d * 0.8, col, f, C(0xbfb5a0));
    gb.cyl(w * 0.2, hh, d * 0.1, 1, 1.8, 8, C(0xe8e8e4)); gb.cyl(-w * 0.2, hh, -d * 0.2, 1, 1.8, 8, C(0x3a3a3a));
  };
  mids.haussmann = function (gb, w, d) { // perimeter block around a courtyard with a mansard roof
    const col = pc(STONE), rf = pc(ROOF), h = R.range(19, 23), t = Math.min(w, d) * 0.28, f = fc(2.6, 3.3, 1);
    const wing = (x, z, ww, dd) => { gb.box(x, 0, z, ww, h, dd, col, f); gb.prism(GB.rect(x, z, ww, dd), h, h + 4.5, rf, fc(2.6, 4.5, 1), { top: 0.82, capCol: C(0x4a4f55) }); };
    wing(0, -d / 2 + t / 2, w, t); wing(0, d / 2 - t / 2, w, t); wing(-w / 2 + t / 2, 0, t, d - 2 * t); wing(w / 2 - t / 2, 0, t, d - 2 * t);
    for (let i = 0; i < 4; i++) gb.box(R.range(-w * 0.4, w * 0.4), h + 4.5, (i % 2 ? 1 : -1) * (d / 2 - t / 2), 1.2, 2.5, 0.8, C(0xa8603c));
  };
  lows.haussmann = function (gb, w, d) { mids.haussmann(gb, w, d); };

  Object.assign(landmarks, {
    eiffel(gb) {
      const ir = C(0x6b5a48), ir2 = C(0x57493b);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((s) => {
        gb.prism(GB.rect(s[0] * 50, s[1] * 50, 16, 16), 0, 57, ir, null, { top: 0.6, cx: 0, cz: 0, cap: false });
        gb.prism(GB.rect(s[0] * 30, s[1] * 30, 10, 10), 57, 115, ir, null, { top: 0.52, cx: 0, cz: 0, cap: false });
        gb.box(s[0] * 50, 20, 0, 5, 5, 86, ir2, null, null, 0); gb.box(0, 20, s[1] * 50, 86, 5, 5, ir2);
      });
      gb.box(0, 55, 0, 76, 5, 76, ir2); gb.box(0, 113, 0, 44, 4, 44, ir2);
      gb.prism(GB.rect(0, 0, 36, 36), 117, 276, ir, null, { top: 0.14 });
      gb.box(0, 276, 0, 9, 6, 9, ir2); gb.cyl(0, 282, 0, 2, 12, 8, ir); antenna(gb, 0, 294, 0, 30);
      return { name: 'Eiffel Tower', fill: 0.12, mult: 14, hp: 3, ch: 290 };
    },
    triomphe(gb) {
      const col = C(0xe2d8c0), f = fc(4, 10, 4);
      gb.box(-17, 0, 0, 13, 30, 22, col, f); gb.box(17, 0, 0, 13, 30, 22, col, f); gb.box(0, 30, 0, 47, 20, 22, col, null, C(0xc9bea4));
      gb.box(0, 50, 0, 49, 2, 24, C(0xc9bea4));
      return { name: 'Arc de Triomphe', mult: 12, hp: 2.5 };
    },
    louvre(gb) {
      const col = C(0xddd2b8), rf = C(0x5a6670), f = fc(3, 5.5, 1);
      gb.box(0, 0, -52, 130, 22, 18, col, f, rf); gb.box(-56, 0, 0, 18, 22, 90, col, f, rf); gb.box(56, 0, 0, 18, 22, 90, col, f, rf);
      gb.prism(GB.rect(0, 10, 36, 36), 0, 22, C(0x6fa0c0), fc(3, 3, 2), { top: 0.02 });
      return { name: 'Louvre', mult: 5, fill: 0.3 };
    },
    burj(gb) {
      const col = C(0xa9bccb), f = fc(2.2, 3.8, 2); let y = 0;
      for (let i = 0; i < 10; i++) {
        const r = 44 * (1 - i / 11.5), hh = i === 0 ? 70 : 54;
        gb.prism(GB.ngon(0, 0, r, r, 6, i * 0.52), y, y + hh, col, f, { capCol: C(0x8f9aa0) });
        if (i < 6) for (let k = 0; k < 3; k++) { const a = k * 2.094 + i * 0.7; gb.prism(GB.ngon(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.42, r * 0.42, 8), y, y + hh * 0.8, col, f, { capCol: C(0x8f9aa0) }); }
        y += hh;
      }
      gb.cyl(0, y, 0, 3.4, 60, 8, C(0xc8ccd0), null, { top: 0.25 });
      return { name: 'Burj Khalifa', ch: 556, mult: 2 };
    },
    sail(gb) {
      const w = C(0xf2f2ee), g = C(0x5ba0c6);
      gb.prism([[-28, -24], [34, 0], [-28, 24]], 0, 200, g, fc(2.4, 3.8, 2), { top: 0.3, cx: -28, cz: 0, segs: 10, capCol: w });
      gb.box(-30, 0, 0, 5, 215, 6, w); gb.cyl(-30, 215, 0, 0.9, 40, 6, w);
      gb.cyl(-12, 178, 0, 12, 1.5, 16, w); gb.box(-22, 174, 0, 20, 3, 4, w);
      gb.cyl(0, 0, 0, 70, 1.2, 28, C(0xd8ccb0));
      return { name: 'Burj Al Arab', mult: 6, ch: 200, fill: 0.2 };
    },
    frame(gb) {
      const gold = C(0xc9a94a), f = fc(2.5, 3.5, 4);
      gb.box(-42, 0, 0, 12, 150, 18, gold, f); gb.box(42, 0, 0, 12, 150, 18, gold, f); gb.box(0, 138, 0, 96, 12, 18, gold, f); gb.box(0, 0, 0, 96, 6, 22, C(0xb8b0a0));
      return { name: 'Dubai Frame', mult: 10, fill: 0.25, hp: 2.5 };
    },
    gherkin(gb) {
      const col = C(0x3f6b7c), f = fc(2.4, 3.8, 2), rad = (y) => 27 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.12 + 0.88 * y / 182))), 0.6) + 1.5;
      for (let i = 0; i < 12; i++) { const y0 = i * 15, y1 = y0 + 15, r0 = rad(y0), r1 = rad(y1); gb.prism(GB.ngon(0, 0, r0, r0, 20, i * 0.16), y0, y1, col, f, { top: r1 / r0, cap: i === 11 }); }
      return { name: 'The Gherkin', ch: 175, mult: 3 };
    },
    towerBridge(gb) {
      const col = C(0xb8a88c), rf = C(0x4a6a7a), f = fc(3, 6, 4);
      [-34, 34].forEach((x) => { gb.box(x, 0, 0, 18, 58, 18, col, f); gb.prism(GB.rect(x, 0, 18, 18), 58, 74, rf, null, { top: 0.05 }); });
      gb.box(0, 40, 0, 52, 5, 8, C(0x5b8fa6)); gb.box(0, 8, 0, 130, 3, 14, C(0x6a7078)); gb.box(0, 0, 0, 130, 8, 6, col);
      return { name: 'Tower Bridge', mult: 10, fill: 0.25, hp: 2.5 };
    },
    cairoTower(gb) {
      const col = C(0xd8c8a0);
      gb.prism(GB.ngon(0, 0, 8, 8, 16), 0, 150, col, fc(1.6, 150, 4), { top: 0.85 }); gb.cyl(0, 0, 0, 16, 10, 16, col, fc(3, 5, 3));
      gb.cyl(0, 150, 0, 12, 14, 16, C(0x8f7a55), fc(2, 7, 3), { capCol: col }); gb.cyl(0, 164, 0, 4, 10, 10, col); antenna(gb, 0, 174, 0, 14);
      return { name: 'Cairo Tower', mult: 10, hp: 2.5, ch: 165 };
    },
    gpyr(gb, w, d, h) {
      const s = w; gb.prism(GB.rect(0, 0, s, s), 0, s * 0.62, C(0xc8ae78), null, { top: 0.01 });
      return { name: s > 200 ? 'Great Pyramid' : 'Pyramid', fill: 0.33, hp: 30, value: s > 200 ? 900000 : 400000 };
    }
  });

  // ---------- Jordan: limestone apartment blocks, villas, neighbourhood mosques and the country's landmarks
  const ubox = new T.BoxGeometry(1, 1, 1);
  const roofKit = (gb, x, h, z, ww, dd) => { // what every Amman roof carries: parapet, stair room, water tanks, solar heater, dish
    const col = C(0xe6dcc6), was = gb.fine; gb.fine = 1;
    gb.box(x, h, z - dd / 2 + 0.2, ww, 0.9, 0.4, col); gb.box(x, h, z + dd / 2 - 0.2, ww, 0.9, 0.4, col);
    gb.box(x - ww / 2 + 0.2, h, z, 0.4, 0.9, dd, col); gb.box(x + ww / 2 - 0.2, h, z, 0.4, 0.9, dd, col);
    gb.fine = 0; gb.box(x + ww * 0.22, h, z - dd * 0.2, 3.4, 2.7, 4, col, null, C(0xbfb5a0)); gb.fine = 1;
    const n = R.int(2, 4);
    for (let i = 0; i < n; i++) { const tx = x - ww * 0.3 + i * 2.4, tz = z + dd * 0.22; gb.box(tx, h, tz, 1.5, 1.3, 1.5, C(0x8a8c8e)); gb.cyl(tx, h + 1.3, tz, 0.85, 1.5, 8, C(R.chance(0.8) ? 0xf2f2ee : 0x2c2c2c)); }
    if (R.chance(0.7)) gb.add(ubox, x - ww * 0.15, h + 1.1, z - dd * 0.22, 2.6, 0.12, 1.7, C(0x1f2c44), 0.6, 0, 0);
    if (R.chance(0.6)) gb.add(hemi, x + ww * 0.05, h + 1.2, z + dd * 0.05, 0.8, 0.35, 0.8, C(0xd8d8d8), 2.2, 0, 0.4);
    gb.fine = was;
  };
  lows.ammanApt = function (gb, w, d) { // rows of four- to six-storey white limestone apartment buildings
    const alongX = w >= d, len = alongX ? w : d, n = R.int(3, 4), step = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + step * (i + 0.5), fl = R.int(3, 6), h = fl * 3.2, bw = step * R.range(0.72, 0.86), bd = R.range(17, 24), col = pc(PAINT);
      const x = alongX ? o : R.range(-3, 3), z = alongX ? R.range(-3, 3) : o, ww = alongX ? bw : bd, dd = alongX ? bd : bw;
      gb.box(x, 0, z, ww, h, dd, col, fc(3.0, 3.2, 1), C(0xc9bfa8));
      if (R.chance(0.45)) for (let f = 1; f < fl; f++) gb.box(x, f * 3.2, z + dd / 2 + 0.5, ww * 0.5, 1.0, 1.1, C(0xdcd2bc)); // balcony stack
      roofKit(gb, x, h, z, ww, dd);
    }
  };
  lows.ammanVilla = function (gb, w, d) { // stone villas behind garden walls, some with red tiled roofs
    const alongX = w >= d, len = alongX ? w : d, n = 3, step = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + step * (i + 0.5), x = alongX ? o : 0, z = alongX ? 0 : o, s = R.range(13, 17), col = pc(PAINT), h = R.chance(0.6) ? 7 : 10.2;
      gb.box(x, 0, z, s, h, s * 0.85, col, fc(3.2, 3.4, 1), C(0xc9bfa8));
      if (R.chance(0.5)) gb.prism(GB.rect(x, z, s + 1.4, s * 0.85 + 1.4), h, h + 3.4, C(R.pick([0xa8452c, 0x9a3d28, 0xb4553a])), null, { top: 0.08 });
      else { gb.box(x + s * 0.2, h, z, 3, 2.6, 3.4, col); gb.cyl(x - s * 0.25, h, z + 1, 0.8, 1.5, 8, C(0xf2f2ee)); }
      gb.box(x + s * 0.62, 0, z + s * 0.2, s * 0.4, 3.2, s * 0.45, col, fc(3, 3.2, 1), C(0xc9bfa8));
      const gw = step * 0.9, gd = 40, wc = C(0xd8ceb8);
      gb.box(x, 0, z - gd / 2, gw, 1.8, 0.4, wc); gb.box(x, 0, z + gd / 2, gw, 1.8, 0.4, wc);
      for (let k = 0; k < 3; k++) gb.add(cone, x - gw * 0.4 + k * 2.6, 4.5, z + gd * 0.36, 1.3, 9, 1.3, C(0x2f4a2a)); // cypress trees
      gb.add(sphere, x + gw * 0.36, 3, z - gd * 0.3, 2.6, 2.6, 2.6, C(0x55693a));
    }
  };
  function masjid(gb, x, z, s, domeCol, stone) { // neighbourhood mosque: prayer hall, dome and a slender minaret
    gb.box(x, 0, z, s, 7, s, stone, fc(3.4, 7, 4), C(0xcfc5ae));
    gb.cyl(x, 7, z, s * 0.3, 2, 14, stone); gb.add(hemi, x, 9, z, s * 0.3, s * 0.3, s * 0.3, domeCol);
    spire(gb, x, 9 + s * 0.3, z, 0.4, 3, C(0xc9a94a));
    const mx = x + s * 0.5 + 2.6, mz = z - s * 0.5 + 2;
    gb.box(mx, 0, mz, 3.6, 7, 3.6, stone); gb.cyl(mx, 7, mz, 1.3, 19, 8, stone); gb.cyl(mx, 21, mz, 2.2, 0.8, 8, stone); gb.add(cone, mx, 28.5, mz, 1.5, 5, 1.5, domeCol);
  }
  mids.masjid = function (gb, w, d) { masjid(gb, 0, 0, Math.min(w, d) * 0.6, C(R.pick([0x3f8f6a, 0x4a9bd1, 0xd8d2c0, 0x2f8f8a])), pc(PAINT)); };
  lows.masjid = function (gb, w, d) { masjid(gb, 0, 0, Math.min(w, d) * 0.5, C(R.pick([0x3f8f6a, 0x4a9bd1, 0xd8d2c0])), pc(PAINT)); };
  mids.ammanBlock = function (gb, w, d, h) { // commercial block: shopfronts below, stone-clad offices or flats above
    const hh = Math.max(h, 15), col = pc(PAINT);
    gb.box(0, 0, 0, w, 4.6, d, C(R.pick([0x27323d, 0x3a2f28, 0x2c3a44])), fc(4.5, 4.6, 2));
    gb.box(0, 4.6, 0, w + 1.6, 0.5, d + 1.6, C(R.pick([0xb0261e, 0x1f6f4a, 0x1c4fa0, 0xd8a01e, 0xe6dcc6])));
    gb.box(0, 5.1, 0, w * 0.95, hh - 5.1, d * 0.95, col, fc(2.9, 3.2, R.chance(0.6) ? 1 : 3), C(0xc9bfa8));
    roofKit(gb, 0, hh, 0, w * 0.95, d * 0.95);
    if (R.chance(0.35)) { gb.box(w * 0.2, hh, d * 0.3, 0.3, 5, 0.3, C(0x555555)); gb.box(w * 0.2, hh + 3, d * 0.3, 9, 4, 0.3, C(R.pick([0xb0261e, 0x1c4fa0, 0xf2f2ee]))); }
  };
  // tiered semicircular theatre cut into a hillside, open toward +z
  function theatre(gb, col, dk, R0, tiers) {
    for (let i = 0; i < tiers; i++) {
      const r0 = R0 + i * 3.2, r1 = r0 + 3.2, poly = [];
      for (let k = 0; k <= 18; k++) { const a = Math.PI + k / 18 * Math.PI; poly.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
      for (let k = 18; k >= 0; k--) { const a = Math.PI + k / 18 * Math.PI; poly.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
      gb.prism(poly, 0, 2 + i * 2.4, i % 5 === 4 ? dk : col);
    }
    const RO = R0 + tiers * 3.2;
    gb.cyl(0, 0, 0, R0, 0.5, 24, dk);
    gb.box(0, 0, 9, RO * 1.5, 8, 5, col, fc(4, 8, 4), dk);
    for (let i = -5; i <= 5; i++) gb.cyl(i * RO * 0.13, 0, 4.5, 0.8, 9, 8, col);
    gb.box(0, 9, 4.5, RO * 1.5, 1.2, 2.2, col);
    return RO;
  }
  const columnRow = (gb, x0, z0, x1, z1, n, h, col) => { for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0; gb.cyl(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.85, h, 8, col); } };
  const minaret = (gb, x, z, h, stone, cap, r) => {
    r = r || 2.2; gb.box(x, 0, z, r * 2.6, h * 0.22, r * 2.6, stone); gb.cyl(x, h * 0.22, z, r, h * 0.5, 10, stone); gb.cyl(x, h * 0.72, z, r * 1.6, 1.2, 10, stone);
    gb.cyl(x, h * 0.72 + 1.2, z, r * 0.75, h * 0.16, 10, stone); gb.add(cone, x, h * 0.94, z, r * 0.95, h * 0.12, r * 0.95, cap);
  };
  // sandstone cliff: a flat carved face on +z with broken rock piled behind and above it
  function cliff(gb, w, d, h, col, dk) {
    gb.box(0, 0, 0, w, h, d, col, null, dk);
    for (let i = 0; i < 7; i++) {
      const rx = R.range(w * 0.14, w * 0.3), px = R.range(-w * 0.42, w * 0.42), pz = R.range(-d * 0.6, d * 0.1), poly = [];
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.2832, rr = rx * R.range(0.7, 1.15); poly.push([px + Math.cos(a) * rr, pz + Math.sin(a) * rr * R.range(0.7, 1.1)]); }
      gb.prism(poly, 0, h * R.range(0.75, 1.3), i % 2 ? dk : col, null, { top: R.range(0.55, 0.85) });
    }
  }
  // carved Nabataean façade standing proud of a cliff face at z = zf
  function nabFacade(gb, x, zf, w, h, lt, dk, tall) {
    const lo = tall ? h * 0.48 : h * 0.72, nc = tall ? 6 : 4;
    gb.box(x, 0, zf + 0.2, w * 0.3, lo * 0.7, 0.6, dk);                                        // doorway in shadow
    for (let i = 0; i < nc; i++) gb.cyl(x - w / 2 + w * (i + 0.5) / nc, 0, zf + 1.6, w * 0.035, lo, 10, lt);
    gb.box(x, lo, zf + 1.2, w * 1.04, h * 0.06, 3, lt);
    gb.gable(x, lo + h * 0.06, zf + 1.2, w * (tall ? 0.62 : 1.0), 2.6, h * 0.1, lt, true, lt);
    if (tall) { // upper storey: round tholos between two half-pediments, topped by an urn
      const y = lo + h * 0.17;
      gb.cyl(x, y, zf + 1.6, w * 0.13, h * 0.2, 14, lt); gb.add(cone, x, y + h * 0.25, zf + 1.6, w * 0.15, h * 0.1, w * 0.15, lt); gb.add(sphere, x, y + h * 0.33, zf + 1.6, w * 0.035, h * 0.045, w * 0.035, lt);
      [-1, 1].forEach((s) => { gb.box(x + s * w * 0.36, y, zf + 1.4, w * 0.2, h * 0.2, 2.4, lt); gb.gable(x + s * w * 0.36, y + h * 0.2, zf + 1.4, w * 0.22, 2.4, h * 0.06, lt, true, lt); });
    }
  }
  Object.assign(landmarks, {
    citadel(gb) { // Jabal al-Qal'a: Temple of Hercules, Umayyad Palace, walls
      const col = C(0xe2d6bc), dk = C(0xcabd9f);
      gb.box(0, 0, 0, 250, 12, 170, dk); gb.box(0, 12, 0, 236, 1, 156, C(0xd6c9a8));
      for (let i = 0; i < 6; i++) gb.cyl(40 + i * 8, 13, -34, 1.8, i < 3 ? 13 : 5 + i * 1.2, 12, col);     // standing columns of the temple
      gb.box(48, 26, -34, 21, 2.6, 4.4, col); gb.box(60, 13, -22, 50, 1.2, 28, col);
      gb.box(-62, 13, 26, 46, 11, 46, col, fc(5, 11, 4), dk); gb.add(hemi, -62, 24, 26, 15, 13, 15, C(0x8a8478)); // Umayyad audience hall and its dome
      gb.box(-62, 13, -18, 60, 4, 30, col, fc(5, 4, 4)); gb.cyl(-14, 13, 44, 9, 2.5, 20, col, null, { capCol: dk });
      [[-118, 0, 3, 150], [118, 0, 3, 150], [0, -80, 236, 3], [0, 80, 236, 3]].forEach((q) => gb.box(q[0], 12, q[1], q[2], 5, q[3], col));
      [[-118, -80], [118, -80], [118, 80], [-118, 80], [0, -80]].forEach((q) => gb.box(q[0], 12, q[1], 9, 9, 9, col));
      return { name: 'Amman Citadel', value: 250000, hp: 4, fill: 0.12, ch: 30 };
    },
    romanTheatre(gb) {
      const col = C(0xe0d2b4), dk = C(0xc4b594);
      theatre(gb, col, dk, 20, 14);
      gb.box(0, 0, 44, 150, 0.4, 56, C(0xcfc3a8)); columnRow(gb, -70, 70, 70, 70, 16, 8, col); gb.box(0, 8, 70, 142, 1, 1.8, col); // Hashemite Plaza colonnade
      return { name: 'Roman Theatre', value: 300000, hp: 5, fill: 0.25, ch: 36 };
    },
    kingAbdullah(gb) { // King Abdullah I Mosque: octagonal hall under a blue mosaic dome
      const st = C(0xf0e8d6), blue = C(0x3f93cf), bl2 = C(0x2f77b0);
      gb.box(0, 0, 0, 120, 1, 110, C(0xd8ceb8));
      gb.prism(GB.ngon(0, 0, 38, 38, 8, 0.39), 1, 15, st, fc(4, 14, 4), { capCol: C(0xd6ccb6) });
      gb.cyl(0, 15, 0, 27, 4, 24, bl2); gb.add(hemi, 0, 19, 0, 27, 19, 27, blue); spire(gb, 0, 38, 0, 0.7, 7, C(0xc9a94a));
      minaret(gb, -48, 34, 56, st, blue); minaret(gb, 48, 34, 56, st, blue);
      gb.box(0, 1, 48, 60, 9, 12, st, fc(5, 9, 4));
      return { name: 'King Abdullah I Mosque', value: 320000, hp: 3, fill: 0.3, ch: 40 };
    },
    abuDarwish(gb) { // black and white striped stone
      const w = C(0xf2efe6), k = C(0x23211f);
      for (let i = 0; i < 7; i++) gb.box(0, i * 2, 0, 44, 2, 44, i % 2 ? k : w);
      gb.cyl(0, 14, 0, 11, 3, 16, k); gb.add(hemi, 0, 17, 0, 11, 10, 11, w);
      [[-17, -17], [17, -17], [17, 17], [-17, 17]].forEach((p) => gb.add(hemi, p[0], 14, p[1], 4, 4, 4, w));
      for (let i = 0; i < 12; i++) gb.cyl(28, i * 3.2, -16, 2.2, 3.2, 10, i % 2 ? k : w);
      gb.cyl(28, 38.4, -16, 3.2, 1, 10, w); gb.add(cone, 28, 42.5, -16, 2, 6, 2, k);
      return { name: 'Abu Darwish Mosque', value: 200000, hp: 2.5, fill: 0.3 };
    },
    husseinMosque(gb) { // Grand Husseini Mosque, downtown
      const st = C(0xead8c4), pk = C(0xd9b8a4);
      gb.box(0, 0, 0, 64, 12, 40, st, fc(5, 12, 4), C(0xcfc0a8)); gb.box(0, 0, 26, 64, 7, 12, pk, fc(5, 7, 4));
      gb.add(hemi, 0, 12, -4, 7, 6, 7, C(0x4f8a6a));
      minaret(gb, -36, 22, 38, pk, C(0xd8d2c0), 2); minaret(gb, 36, 22, 52, st, C(0xd8d2c0), 2.3);
      return { name: 'Grand Husseini Mosque', value: 220000, hp: 2.5, fill: 0.4 };
    },
    rotana(gb) { // Amman Rotana, the tallest tower in Jordan, with the Abdali podium
      const gl = C(0x5b86a8), f = fc(2.2, 3.7, 2);
      gb.box(0, 0, 0, 96, 14, 80, C(0x2c3a44), fc(4, 7, 2), C(0x9aa3aa));
      gb.prism(GB.ngon(-14, -6, 19, 13, 28), 14, 150, gl, f, { capCol: C(0x8f9aa0) });
      gb.prism(GB.ngon(-14, -6, 19, 13, 28), 150, 188, gl, f, { top: 0.3, cx: -26, cz: -6, capCol: C(0x8f9aa0) });
      gb.box(30, 14, 18, 26, 96, 24, C(0x3f6b7c), fc(2.4, 3.7, 2), C(0x6a7078)); gb.box(30, 110, 18, 12, 6, 12, C(0x8a8c8e));
      return { name: 'Amman Rotana Tower', ch: 188, mult: 3, fill: 0.3 };
    },
    abdali(gb) { // Abdali Boulevard: glass towers over a shopping street
      gb.box(0, 0, 0, 120, 10, 30, C(0xe6dcc6), fc(4, 5, 2), C(0x9fb8c6));
      gb.box(-40, 10, -34, 30, 118, 28, C(0x2e5d7a), fc(2.4, 3.7, 2), C(0x6a7078)); gb.wedge(-55, -25, -48, -20, 128, 128, 140, C(0x2e5d7a), null, C(0xb9c2c9));
      gb.cyl(4, 10, 36, 16, 96, 22, C(0x4d6f8f), fc(2.2, 3.7, 2), { capCol: C(0x6a7078) });
      gb.box(44, 10, -30, 28, 84, 28, C(0xdcd2bc), fc(2.8, 3.5, 1), C(0x6a7078)); gb.box(44, 94, -30, 14, 6, 14, C(0x8a8c8e));
      gb.box(-44, 10, 36, 26, 60, 26, C(0x6b5a3a), fc(2.6, 3.6, 2), C(0x6a7078));
      return { name: 'Abdali Boulevard', ch: 120, mult: 2.5, fill: 0.3 };
    },
    jordanGate(gb) { // twin towers on a shared podium at the Sixth Circle
      const gl = C(0x6f93b3), f = fc(2.4, 3.7, 2);
      gb.box(0, 0, 0, 110, 16, 56, C(0x3a4a58), fc(4, 8, 2), C(0x9aa3aa));
      gb.box(-30, 16, 0, 30, 134, 30, gl, f, C(0x8f9aa0), 0.12); gb.box(-30, 150, 0, 16, 8, 16, C(0x8a8c8e), null, null, 0.12);
      gb.box(32, 16, 0, 30, 122, 30, gl, f, C(0x8f9aa0), -0.12); gb.box(32, 138, 0, 16, 8, 16, C(0x8a8c8e), null, null, -0.12);
      return { name: 'Jordan Gate Towers', ch: 150, mult: 3, fill: 0.3 };
    },
    leRoyal(gb) { // Le Royal: stepped drum inspired by the spiral minaret of Samarra
      const st = C(0xe8dcc2);
      gb.box(0, 0, 0, 80, 10, 70, st, fc(4, 5, 3), C(0xc9bfa8));
      for (let i = 0; i < 7; i++) gb.cyl(0, 10 + i * 13, 0, 25 - i * 2.4, 13, 28, st, fc(2.6, 3.25, i % 2 ? 1 : 3), { capCol: C(0xc9bfa8) });
      gb.cyl(0, 101, 0, 7, 9, 16, C(0x8fa3b3)); antenna(gb, 0, 110, 0, 12);
      return { name: 'Le Royal Hotel', ch: 110, mult: 3, fill: 0.4 };
    },
    flagpole(gb) { // Raghadan flagpole flying the Jordanian flag
      gb.cyl(0, 0, 0, 1.7, 127, 10, C(0xd8d8d8), null, { top: 0.5 }); gb.box(0, 0, 0, 24, 2, 24, C(0xcabd9f));
      gb.box(17, 117, 0, 30, 5, 0.4, C(0x141414)); gb.box(17, 112, 0, 30, 5, 0.4, C(0xf2f2f2)); gb.box(17, 107, 0, 30, 5, 0.4, C(0x1a7a3a));
      gb.prism([[2, -0.3], [14, -0.3], [14, 0.3], [2, 0.3]], 107, 122, C(0xc8102e), null, { top: 1 });
      return { name: 'Raghadan Flagpole', value: 120000, hp: 1.5, fill: 0.05 };
    },
    abdounBridge(gb) { // cable-stayed bridge on Y-shaped pylons over Wadi Abdoun
      const cc = C(0xcfc9bb), cab = C(0xe8e8e4);
      for (let i = 0; i < 6; i++) { const x = -125 + i * 50, z = Math.sin((i - 2.5) * 0.55) * 22, zn = Math.sin((i - 1.5) * 0.55) * 22; gb.box(x, 30, (z + zn) / 2, 54, 2.4, 13, cc, null, C(0x4a4c4e), Math.atan2(zn - z, 50) * -1); }
      [-75, 0, 75].forEach((x) => {
        const z = Math.sin((x + 125) / 50 * 0.55 - 1.1) * 22;
        gb.box(x, 0, z, 6, 30, 5, cc); gb.add(ubox, x, 52, z - 7, 3, 46, 3.4, cc, 0.3, 0, 0); gb.add(ubox, x, 52, z + 7, 3, 46, 3.4, cc, -0.3, 0, 0);
        for (let k = 1; k <= 3; k++) [-1, 1].forEach((s) => gb.add(ubox, x + s * k * 5.5, 32 + (4 - k) * 7.5, z, 0.35, Math.hypot(k * 11, (4 - k) * 15), 0.35, cab, 0, 0, s * Math.atan2(k * 11, (4 - k) * 15)));
      });
      return { name: 'Abdoun Bridge', value: 350000, hp: 3, fill: 0.12, ch: 74 };
    },
    refinery(gb) { // Zarqa oil refinery: columns, pipe racks, tank farm, flare
      const st = C(0xb9bcc0), wh = C(0xe8e8e2), dk = C(0x5a5f66), rd = C(0xb0261e);
      gb.box(0, 0, 0, 300, 0.5, 300, C(0x6a665e));
      for (let i = 0; i < 7; i++) { const x = -110 + i * 22, h = 34 + (i * 37 % 40); gb.cyl(x, 0, -90, 3 + (i % 3), h, 12, st); gb.cyl(x, h * 0.5, -90, 5 + (i % 3), 0.8, 12, dk); gb.cyl(x, h * 0.85, -90, 5 + (i % 3), 0.8, 12, dk); gb.add(hemi, x, h, -90, 3 + (i % 3), 2.5, 3 + (i % 3), st); }
      for (let i = 0; i < 4; i++) gb.box(-40, 6, -60 + i * 16, 210, 1.4, 2.4, dk); for (let i = 0; i < 8; i++) gb.box(-140 + i * 28, 0, -36, 1.2, 7, 52, dk);
      for (let i = 0; i < 9; i++) { const x = -105 + (i % 3) * 52, z = 30 + Math.floor(i / 3) * 50; gb.cyl(x, 0, z, 19, 15, 24, wh, null, { capCol: C(0xcfcfc8) }); gb.cyl(x, 0, z, 19.6, 1.6, 24, dk); }
      for (let i = 0; i < 4; i++) { const x = 70 + (i % 2) * 34, z = 40 + Math.floor(i / 2) * 34; gb.add(sphere, x, 13, z, 11, 11, 11, wh); gb.cyl(x, 0, z, 8, 5, 8, dk, null, { cap: false }); }
      [0, 1].forEach((i) => { const x = 70 + i * 40; for (let k = 0; k < 10; k++) gb.cyl(x, k * 8, -100, 3.6 - k * 0.14, 8, 12, k % 2 ? wh : rd); });
      gb.cyl(125, 0, 110, 1.2, 92, 8, dk); gb.add(cone, 125, 97, 110, 3, 10, 3, C(0xff8a1e));
      gb.box(110, 0, -30, 44, 9, 26, C(0xdcd2bc), fc(4, 4.5, 3), C(0x8a8c8e)); gb.box(20, 0, -110, 30, 22, 20, st, fc(5, 5.5, 4));
      return { name: 'Jordan Petroleum Refinery', fill: 0.2, mult: 3, ch: 60, hp: 6, stacks: [[70, 82, -100], [110, 82, -100], [125, 102, 110]] };
    },
    campus(gb) { // Yarmouk University: teaching blocks round a lawn, library, gate
      const st = C(0xeae0ca), rf = C(0xc9bfa8);
      gb.box(0, 0, 0, 290, 0.4, 290, C(0xbfae88)); gb.box(0, 0.4, 0, 120, 0.3, 120, C(0x6f8a4a));
      [[0, -100, 220, 30], [0, 100, 220, 30], [-110, 0, 30, 150], [110, 0, 30, 150]].forEach((q) => gb.box(q[0], 0, q[1], q[2], 16, q[3], st, fc(3.2, 3.2, 3), rf));
      gb.box(0, 0.4, 0, 46, 24, 46, st, fc(3, 3.4, 1), rf); gb.add(hemi, 0, 24, 0, 12, 8, 12, C(0x8fa3b3));
      gb.box(-18, 0, 140, 6, 14, 6, st); gb.box(18, 0, 140, 6, 14, 6, st); gb.box(0, 14, 140, 48, 4, 7, st);
      gb.cyl(70, 0, 55, 16, 10, 20, st, fc(3, 5, 3), { capCol: rf }); gb.box(-70, 0, 55, 3, 26, 3, st); gb.box(-70, 20, 55, 6, 6, 6, C(0xf2efe6));
      return { name: 'Yarmouk University', fill: 0.25, mult: 2.5, ch: 24, hp: 5 };
    },
    hadrianArch(gb) { // triple triumphal arch at the entrance to Jerash
      const col = C(0xe0cfa8);
      [-15, -5.5, 5.5, 15].forEach((x) => gb.box(x, 0, 0, 4.6, 13, 9, col)); gb.box(0, 13, 0, 36, 4, 9, col); gb.box(0, 17, 0, 14, 5, 9, col); gb.gable(0, 22, 0, 15, 9, 3.5, col, true, col);
      [-10.2, 10.2].forEach((x) => gb.box(x, 9, 0, 5, 4, 9, col));
      return { name: "Hadrian's Arch", value: 180000, hp: 4, fill: 0.5 };
    },
    ovalForum(gb) { // Jerash: the oval plaza, the colonnaded street and the Temple of Artemis
      const col = C(0xe0cfa8), pv = C(0xcbbd9c);
      gb.prism(GB.ngon(0, 60, 44, 36, 32), 0, 0.5, pv);
      for (let i = 0; i < 40; i++) { const a = i / 40 * 6.2832; if (Math.sin(a) < -0.97) continue; gb.cyl(Math.cos(a) * 44, 0, 60 + Math.sin(a) * 36, 0.8, 7.5, 8, col); }
      for (let i = 0; i < 24; i++) { const a0 = i / 24 * 6.2832; gb.box(Math.cos(a0) * 44, 7.5, 60 + Math.sin(a0) * 36, 11, 0.9, 1.4, col, null, null, -a0 + Math.PI / 2); }
      gb.box(0, 0, -60, 9, 0.4, 170, pv); columnRow(gb, -6, 20, -6, -140, 22, 7.5, col); columnRow(gb, 6, 20, 6, -140, 22, 7.5, col);
      gb.box(-46, 0, -70, 46, 5, 30, col); columnRow(gb, -64, -82, -28, -82, 6, 14, col); columnRow(gb, -64, -58, -28, -58, 3, 14, col); gb.box(-46, 19, -82, 40, 1.6, 2.2, col);
      return { name: 'Jerash Roman City', value: 400000, hp: 6, fill: 0.1, ch: 16 };
    },
    jerashTheatre(gb) { theatre(gb, C(0xe0cfa8), C(0xc8b68e), 14, 10); return { name: 'Jerash South Theatre', value: 200000, hp: 4, fill: 0.25, ch: 26 }; },
    treasury(gb) { // Al-Khazneh, carved into a rose sandstone cliff
      const ro = C(0xc27a5c), dk = C(0x9a5540), lt = C(0xdba080);
      cliff(gb, 130, 70, 78, ro, dk); nabFacade(gb, 0, 35, 26, 40, lt, C(0x3a2018), true);
      return { name: 'Petra Treasury (Al-Khazneh)', value: 900000, hp: 30, fill: 0.7, ch: 78 };
    },
    monastery(gb) { // Ad Deir, the largest façade in Petra
      const ro = C(0xcc8a62), dk = C(0xa0603f), lt = C(0xe0aa84);
      cliff(gb, 150, 80, 70, ro, dk); nabFacade(gb, 0, 40, 46, 47, lt, C(0x3a2018), true);
      return { name: 'Petra Monastery (Ad Deir)', value: 900000, hp: 30, fill: 0.7, ch: 70 };
    },
    royalTombs(gb) {
      const ro = C(0xbf7458), dk = C(0x96523e), lt = C(0xd6997a);
      cliff(gb, 260, 70, 62, ro, dk);
      [[-90, 30, 34], [-30, 24, 28], [28, 34, 44], [92, 24, 30]].forEach((q) => nabFacade(gb, q[0], 35, q[1], q[2], lt, C(0x3a2018), q[2] > 40));
      return { name: 'Petra Royal Tombs', value: 600000, hp: 30, fill: 0.7, ch: 62 };
    },
    siq(gb) { // the narrow gorge that leads to the Treasury
      const ro = C(0xb86e52), dk = C(0x8e4e3a);
      for (let i = 0; i < 6; i++) {
        const x = -250 + i * 100, off = Math.sin(i * 1.3) * 14;
        [-1, 1].forEach((s) => { const poly = []; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832; poly.push([x + Math.cos(a) * 62 * R.range(0.85, 1.1), off + s * 46 + Math.sin(a) * 38 * R.range(0.85, 1.1)]); } gb.prism(poly, 0, R.range(55, 85), (i + (s > 0 ? 1 : 0)) % 2 ? dk : ro, null, { top: 0.82 }); });
      }
      return { name: 'The Siq', value: 300000, hp: 40, fill: 0.6, ch: 70 };
    },
    petraTheatre(gb) { theatre(gb, C(0xc98562), C(0xa6644a), 16, 11); return { name: 'Petra Theatre', value: 300000, hp: 20, fill: 0.3, ch: 30 }; },
    deadSeaResort(gb) {
      const st = C(0xf0e8d6);
      gb.box(0, 0, 0, 120, 22, 22, st, fc(3.4, 3.4, 3), C(0xc9bfa8)); gb.box(-50, 0, 30, 22, 14, 60, st, fc(3.4, 3.4, 3), C(0xc9bfa8)); gb.box(50, 0, 30, 22, 14, 60, st, fc(3.4, 3.4, 3), C(0xc9bfa8));
      gb.box(0, 0, 40, 60, 0.6, 26, C(0x4fb4d8)); for (let i = 0; i < 6; i++) gb.add(sphere, -36 + i * 14, 7, 62, 2.6, 2.2, 2.6, C(0x3f6a34));
      return { name: 'Dead Sea Resort', mult: 3, fill: 0.3 };
    }
  });

  let W = null;
  const place = (gen, x, z, w, d, h, o) => {
    const gb = new GB();
    const info = gen(gb, w, d, h) || {};
    return W.addBuilding(gb, x, 0, z, Object.assign(info, o || {}));
  };
  const BS = 170, BL = 136;
  const COL = { plaza: 0x8f8b80, yard: 0x5a5750 };
  // one mesh per residential block keeps the draw-call count down as the cities grow
  function resBlock(slabs, x, z) {
    slabs.box(x, 0, z, BL, 0.3, BL, C(ST.lawn));
    if (ST.trees) for (let i = 0; i < 5; i++) W.parkTrees.push([x + R.range(-64, 64), z + R.range(-8, 8) + (R.chance(0.5) ? 0 : R.range(-60, 60)), R.range(0.45, 0.8)]);
    const vertical = R.chance(0.5), gb = new GB();
    [-1, 1].forEach((l) => {
      gb.ox = vertical ? l * BL / 4 : 0; gb.oz = vertical ? 0 : l * BL / 4;
      lows[R.pick(lowKeys)](gb, vertical ? 46 : 112, vertical ? 112 : 46, 0);
    });
    if (R.chance(0.1)) { gb.ox = 0; gb.oz = 0; mids[R.pick(midKeys)](gb, 30, 30, R.range(30, 60)); }
    W.addBuilding(gb, x, 0, z, { fill: 0.22 });
  }
  function midBlock(slabs, x, z, hm, tallP) {
    slabs.box(x, 0, z, BL, 0.3, BL, C(ST.walk));
    [-1, 1].forEach((lz) => {
      const gb = new GB(); let any = false;
      [-1, 1].forEach((lx) => {
        if (R.chance(0.03)) return;
        any = true; gb.ox = lx * BL / 4; gb.oz = 0;
        const tall = R.chance(tallP === undefined ? 0.14 : tallP), s = R.range(40, 56);
        (tall ? towers[R.pick(towerKeys)] : mids[R.pick(midKeys)])(gb, s, R.range(40, 56), (tall ? hm * 1.8 : hm) * R.range(0.6, 1.15));
      });
      if (any) W.addBuilding(gb, x, 0, z + lz * BL / 4, { fill: 0.45 });
    });
  }
  function towerBlock(slabs, x, z, hmax) {
    slabs.box(x, 0, z, BL, 0.3, BL, C(ST.walk));
    if (R.chance(0.42)) {
      const s = R.range(54, 92);
      place(towers[R.pick(towerKeys)], x, z, s, s * R.range(0.75, 1), hmax * R.range(0.62, 1));
    } else {
      const lots = R.chance(0.65) ? [[-1, -1], [1, 1], [-1, 1], [1, -1]] : [[-1, 0], [1, 0]];
      lots.forEach((l) => {
        if (R.chance(0.05)) return;
        const s = R.range(36, 52), isMid = R.chance(0.12);
        place(isMid ? mids[R.pick(midKeys)] : towers[R.pick(towerKeys)], x + l[0] * BL / 4, z + l[1] * BL / 4, s, l[1] === 0 ? s * 1.8 : s, isMid ? R.range(30, 70) : hmax * R.range(0.4, 0.8));
      });
    }
  }
  function indBlock(slabs, x, z) {
    slabs.box(x, 0, z, BL, 0.3, BL, C(COL.yard));
    if (R.chance(0.5)) place(inds[R.pick(indKeys)], x, z, R.range(80, 120), R.range(60, 110), 0);
    else [[-1, 0], [1, 0]].forEach((l) => place(inds[R.pick(indKeys)], x + l[0] * BL / 4, z, 54, R.range(60, 110), 0));
  }
  function parkBlock(slabs, x, z) {
    slabs.box(x, 0, z, BL, 0.3, BL, C(ST.park));
    for (let i = 0; i < 16; i++) W.parkTrees.push([x + R.range(-60, 60), z + R.range(-60, 60), R.range(0.6, 1.2)]);
  }
  const baseMats = {};
  // street-coloured ground following the city's irregular outline
  function baseDisc(parent, city) {
    const col = ST.road || 0x303236, baseMat = baseMats[col] || (baseMats[col] = new T.MeshStandardMaterial({ color: col, roughness: 0.95 }));
    const sh = new T.Shape();
    for (let i = 0; i < 96; i++) { const p = G.cityEdge(city, i / 96 * 6.2832, 130); if (i) sh.lineTo(p[0] - city.x, p[1] - city.z); else sh.moveTo(p[0] - city.x, p[1] - city.z); }
    const geo = new T.ShapeGeometry(sh); geo.rotateX(Math.PI / 2);
    const base = new T.Mesh(geo, new T.MeshStandardMaterial({ color: col, roughness: 0.95, side: T.DoubleSide }));
    base.position.set(city.x, 0.04, city.z); base.receiveShadow = true; parent.add(base);
  }
  function landmarkAt(slabs, def, cx, cz, sz) {
    if (slabs) slabs.box(cx, 0, cz, sz, 0.3, sz, C(COL.plaza));
    const gb = new GB(), info = landmarks[def.t](gb, def.size || 0) || {};
    info.landmark = true; info.mult = (info.mult || 1) * 2.5; if (def.name) info.name = def.name;
    const b = W.addBuilding(gb, cx, 0, cz, info);
    if (info.stacks) b.stacks = info.stacks.map((p) => [cx + p[0], p[1], cz + p[2]]);
  }
  function reserve(defs) {
    const m = new Map();
    defs.forEach((l) => { const s = l.s || 1; for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) m.set((l.gx + a) + ',' + (l.gz + b), a === 0 && b === 0 ? l : 'skip'); });
    return m;
  }

  const LANDMARKS = {
    London: [{ gx: 0, gz: 0, t: 'shard' }, { gx: 2, gz: -1, t: 'gherkin' }, { gx: -3, gz: 1, t: 'clock', name: 'Big Ben' }, { gx: -2, gz: 3, t: 'ferris', name: 'London Eye' },
      { gx: 4, gz: 2, t: 'towerBridge' }, { gx: -5, gz: -3, t: 'tvtower', name: 'BT Tower' }, { gx: -10, gz: -6, t: 'stadium', s: 2, name: 'Wembley Stadium' }, { gx: 6, gz: 7, t: 'power', s: 2, name: 'Battersea Power Station' }],
    Paris: [{ gx: -2, gz: 1, t: 'eiffel' }, { gx: -6, gz: -2, t: 'triomphe' }, { gx: 3, gz: 0, t: 'louvre' }, { gx: 0, gz: 0, t: 'arch', name: 'Grande Arche' }, { gx: 5, gz: -5, t: 'stadium', s: 2, name: 'Stade de France' }],
    Dubai: [{ gx: 0, gz: 0, t: 'burj' }, { gx: -7, gz: 4, t: 'frame' }, { gx: 3, gz: -2, t: 'twin', name: 'Emirates Towers' }, { gx: -3, gz: -5, t: 'needle', name: 'Dubai Creek Tower' }, { gx: 6, gz: 5, t: 'globe', name: 'Museum Sphere' }],
    Cairo: [{ gx: -1, gz: 0, t: 'cairoTower' }, { gx: 4, gz: 3, t: 'stadium', s: 2, name: 'Cairo Stadium' }, { gx: -5, gz: -4, t: 'obelisk', name: 'Obelisk' }],
    Amman: [{ gx: -1, gz: -3, t: 'citadel', s: 2 }, { gx: 1, gz: 0, t: 'romanTheatre', s: 2 }, { gx: -1, gz: 1, t: 'husseinMosque' }, { gx: 4, gz: -2, t: 'flagpole' }, { gx: 4, gz: 3, t: 'abuDarwish' },
      { gx: -4, gz: -2, t: 'kingAbdullah' }, { gx: -6, gz: -1, t: 'rotana' }, { gx: -6, gz: 0, t: 'abdali' }, { gx: -7, gz: -1, t: 'abdali', name: 'Abdali Gateway' }, { gx: -8, gz: 2, t: 'leRoyal' },
      { gx: -10, gz: -3, t: 'jordanGate' }, { gx: -9, gz: 5, t: 'abdounBridge', s: 2 }, { gx: -6, gz: -8, t: 'stadium', s: 2, name: 'Amman International Stadium' }, { gx: -9, gz: -7, t: 'clock', name: 'University of Jordan Clock Tower' },
      { gx: 2, gz: -6, t: 'mosque', name: 'King Hussein Mosque' }, { gx: 7, gz: 5, t: 'tvtower', name: 'Jordan TV Tower' }],
    Zarqa: [{ gx: 5, gz: -4, t: 'refinery', s: 2 }, { gx: -5, gz: 4, t: 'power', s: 2, name: 'Hussein Thermal Power Station' }, { gx: 0, gz: 0, t: 'mosque', name: 'Zarqa Grand Mosque' }, { gx: -3, gz: -3, t: 'stadium', s: 2, name: 'Prince Mohammed Stadium' }],
    Irbid: [{ gx: 0, gz: 0, t: 'clock', name: 'Irbid Clock Tower' }, { gx: 3, gz: 2, t: 'campus', s: 2 }, { gx: -4, gz: -3, t: 'stadium', s: 2, name: 'Al-Hassan Stadium' }, { gx: -2, gz: 3, t: 'mosque', name: 'Irbid Grand Mosque' }, { gx: 2, gz: -3, t: 'leRoyal', name: 'Irbid Municipality Tower' }],
    Madaba: [{ gx: 0, gz: 0, t: 'cathedral', name: 'St George Church of the Map' }],
    Petra: [{ gx: 0, gz: 0, t: 'husseinMosque', name: 'Wadi Musa Mosque' }]
  };
  const EXTRAS = {
    Jerash: [{ t: 'hadrianArch', dx: -1250, dz: 420 }, { t: 'ovalForum', dx: -1250, dz: 60 }, { t: 'jerashTheatre', dx: -1400, dz: 150 }],
    Petra: [{ t: 'siq', dx: -1500, dz: 0 }, { t: 'treasury', dx: -1960, dz: -60 }, { t: 'petraTheatre', dx: -2250, dz: 150 }, { t: 'royalTombs', dx: -2500, dz: -260 }, { t: 'monastery', dx: -3300, dz: -900 }],
    Madaba: [{ t: 'deadSeaResort', dx: -2900, dz: -500 }, { t: 'deadSeaResort', dx: -2800, dz: -2600, name: 'Dead Sea Spa Hotel' }],
    Dubai: [{ t: 'sail', dx: 4350, dz: 700 }],
    Cairo: [{ t: 'gpyr', dx: -2900, dz: 3000, size: 230 }, { t: 'gpyr', dx: -3260, dz: 3360, size: 215 }, { t: 'gpyr', dx: -3520, dz: 3640, size: 105 }]
  };

  function buildCityGeneric(world, c) {
    setStyle(c.style); R = G.rng(c.seed);
    const group = new T.Group(); world.addCityGroup(c, group); world.curGroup = group;
    const slabs = new GB(), n = Math.ceil(c.r / BS), res = reserve(LANDMARKS[c.key] || []);
    baseDisc(group, c);
    for (let gx = -n; gx <= n; gx++) for (let gz = -n; gz <= n; gz++) {
      const x = c.x + gx * BS, z = c.z + gz * BS, dn = G.cityDn(c, x, z);
      const rv = res.get(gx + ',' + gz);
      if (rv === 'skip') continue;
      if (!rv && (dn > 0.98 || world.rawHeight(x, z) < -0.3)) continue;
      if (rv) { const s = rv.s || 1; landmarkAt(slabs, rv, x + (s - 1) * BS / 2, z + (s - 1) * BS / 2, BL + (s - 1) * BS); continue; }
      if (dn < c.core) towerBlock(slabs, x, z, G.lerp(c.hmax, c.hmax * 0.45, dn / c.core));
      else if (dn < c.mid) midBlock(slabs, x, z, G.lerp(c.hmid, 22, (dn - c.core) / (c.mid - c.core)), c.tallP);
      else if (R.chance(0.06)) parkBlock(slabs, x, z);
      else if (R.chance(c.ind != null ? c.ind : c.town ? 0.12 : 0)) indBlock(slabs, x, z);
      else resBlock(slabs, x, z);
    }
    (EXTRAS[c.key] || []).forEach((e) => landmarkAt(null, e, c.x + e.dx, c.z + e.dz, 0));
    const sm = new T.Mesh(slabs.build(), world.cityMat); sm.receiveShadow = true; group.add(sm);
    if (!c.town) for (let i = 0; i < 3; i++) { const a = c.seed + i * 2.094; const p = G.cityEdge(c, a, 380); samSite(world, p[0], p[1], c.name); }
    world.curGroup = null;
  }

  // Palm-shaped artificial island off the Dubai coast (visual; sits just above the sea)
  function palmIsland(world, x, z) {
    const sh = new T.Shape(), pts = [];
    const strip = (x0, z0, x1, z1, w) => { const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * w, nz = dx / l * w; const s = new T.Shape(); s.moveTo(x0 + nx, z0 + nz); s.lineTo(x1 + nx * 0.5, z1 + nz * 0.5); s.lineTo(x1 - nx * 0.5, z1 - nz * 0.5); s.lineTo(x0 - nx, z0 - nz); pts.push(s); };
    strip(-2600, 0, 1500, 0, 230);
    for (let i = 0; i < 8; i++) { const t = -400 + i * 250, len = 1500 - Math.abs(i - 3.5) * 190; strip(t, 0, t + len * 0.45, len, 90); strip(t, 0, t + len * 0.45, -len, 90); }
    const geo = new T.ShapeGeometry(pts); geo.rotateX(Math.PI / 2);
    const mat = new T.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.95, side: T.DoubleSide });
    const m = new T.Mesh(geo, mat); m.position.set(x, -4.2, z); m.receiveShadow = true; world.scene.add(m);
    const ring = new T.Mesh(new T.RingGeometry(2250, 2420, 64, 1, -1.9, 3.8), mat); ring.rotation.x = -Math.PI / 2; ring.position.set(x + 300, -4.2, z); world.scene.add(ring);
  }

  // add one more defence site to a city (used when a mission needs more targets)
  G.addSam = function (world, city, x, z) {
    const grp = world.cityGroups.find((q) => q.x === city.x && q.z === city.z);
    world.curGroup = grp ? grp.group : null; samSite(world, x, z, city.name); world.curGroup = null;
    return world.sams[world.sams.length - 1];
  };

  G.buildCity = function (world) {
    W = world; setStyle('temperate'); R = G.rng(2024);
    const main = G.CITY, CX = main.x, CZ = main.z, RX = main.rx, RZ = main.rz;
    const group = new T.Group(); world.addCityGroup(main, group); world.curGroup = group;
    baseDisc(group, main);
    const slabs = new GB();
    world.parkTrees = [];
    const res = reserve([
      { gx: 0, gz: 0, t: 'empire' }, { gx: 2, gz: -1, t: 'twin' }, { gx: -2, gz: 1, t: 'shard', name: 'Glass Spire' }, { gx: -1, gz: -3, t: 'tvtower' },
      { gx: 4, gz: 2, t: 'capitol', s: 2 }, { gx: 7, gz: -5, t: 'stadium', s: 2 },
      { gx: 1, gz: 5, t: 'pagoda' }, { gx: -3, gz: 6, t: 'pyramid' }, { gx: 7, gz: 1, t: 'arch' }, { gx: -8, gz: 0, t: 'ferris' },
      { gx: 3, gz: -5, t: 'clock' }, { gx: -1, gz: 8, t: 'obelisk' }, { gx: 8, gz: 6, t: 'globe' }, { gx: -16, gz: -6, t: 'power', s: 2 }, { gx: 4, gz: -10, t: 'needle' },
      { gx: -9, gz: 7, t: 'twin' }, { gx: 10, gz: -9, t: 'tvtower' }, { gx: 12, gz: 4, t: 'clock' }
    ]);
    for (let gx = -36; gx <= 36; gx++) for (let gz = -31; gz <= 31; gz++) {
      const x = CX + gx * BS, z = CZ + gz * BS, dn = G.cityDn(main, x, z);
      const rv = res.get(gx + ',' + gz);
      if (rv === 'skip') continue;
      if (!rv && (dn > 0.98 || world.rawHeight(x, z) < -0.3)) continue;
      if (rv) { const s = rv.s || 1; landmarkAt(slabs, rv, x + (s - 1) * BS / 2, z + (s - 1) * BS / 2, BL + (s - 1) * BS); continue; }
      if ((gx >= -4 && gx <= -3 && gz >= -1 && gz <= 0) || (dn > 0.2 && R.chance(0.045))) { parkBlock(slabs, x, z); continue; }
      const industrial = gx < -12 && Math.abs(gz + 3) < 7 && dn > 0.55;
      if (dn < 0.27) towerBlock(slabs, x, z, G.lerp(340, 140, dn / 0.27));
      else if (industrial) indBlock(slabs, x, z);
      else if (dn < 0.6) midBlock(slabs, x, z, G.lerp(125, 30, (dn - 0.27) / 0.33), G.lerp(0.4, 0.1, (dn - 0.27) / 0.33));
      else resBlock(slabs, x, z);
    }
    const sm = new T.Mesh(slabs.build(), world.cityMat); sm.receiveShadow = true; group.add(sm);
    for (let i = 0; i < 6; i++) { const p = G.cityEdge(main, 0.4 + i * 1.047, 420); if (world.rawHeight(p[0], p[1]) > -0.3) samSite(world, p[0], p[1], main.name); }
    world.curGroup = null;
    G.CITIES.slice(1).forEach((c) => buildCityGeneric(world, c));
    palmIsland(world, 12500, 50200);
    setStyle('temperate');
  };
})();
