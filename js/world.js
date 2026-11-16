// World: sky, terrain, sea, airport, building registry, damage / collapse.
(function () {
  'use strict';
  const T = THREE, clamp = G.clamp, smoothstep = G.smoothstep;

  // ---------- noise
  const SEED = 1337;
  function hash2(ix, iz) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ SEED;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, o) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  G.fbm = fbm;

  const AIRPORTS = G.AIRPORTS = [
    { name: 'Capital Intl', x: 0, z: 0 },
    { name: 'Westfield AB', x: -27000, z: 5000, city: 'Westfield' },
    { name: 'Northpoint', x: -7000, z: -36000, city: 'Northpoint' },
    { name: 'Heathrow', x: -41500, z: -30000, city: 'London' },
    { name: 'Dubai Intl', x: -5600, z: 50000, city: 'Dubai' },
    { name: 'Cairo Intl', x: -27800, z: 41500, city: 'Cairo' },
    { name: 'Queen Alia Intl', x: -42500, z: 41800, city: 'Amman', noLink: true }
  ];
  // the first entry is the original metropolis (elliptical); the rest are circular
  const CITIES = G.CITIES = [
    { name: 'New York', x: 0, z: -9500, rx: 6000, rz: 5200, r: 6000, seed: 5, main: true },
    { name: 'Westfield', x: -23400, z: 4600, r: 2100, seed: 31, style: 'temperate', town: true, core: 0.22, mid: 0.52, hmax: 150, hmid: 60, tallP: 0.3 },
    { name: 'Northpoint', x: -9900, z: -36200, r: 2100, seed: 47, style: 'temperate', town: true, core: 0.22, mid: 0.52, hmax: 150, hmid: 60, tallP: 0.3 },
    { name: 'London', x: -34500, z: -30000, r: 3600, seed: 11, style: 'london', core: 0.2, mid: 0.6, hmax: 230, hmid: 60, tallP: 0.18 },
    { name: 'Paris', x: -56000, z: -8000, r: 3400, seed: 12, style: 'paris', core: 0.1, mid: 0.8, hmax: 170, hmid: 26, tallP: 0.02 },
    { name: 'Dubai', x: 600, z: 50000, r: 3800, seed: 13, style: 'gulf', core: 0.42, mid: 0.72, hmax: 400, hmid: 75, tallP: 0.45 },
    { name: 'Cairo', x: -21000, z: 42000, r: 3500, seed: 14, style: 'cairo', core: 0.1, mid: 0.72, hmax: 140, hmid: 34, tallP: 0.07 },
    // Jordan: the capital, the northern governorates of Zarqa and Irbid, Jerash and Madaba, and Petra in the south
    { name: 'Amman', x: -48000, z: 34000, r: 3600, seed: 15, style: 'levant', core: 0, mid: 0.52, hmax: 120, hmid: 22, tallP: 0.012 },
    { name: 'Zarqa', x: -40500, z: 28200, r: 1900, seed: 21, style: 'levant', green: 0.6, core: 0, mid: 0.4, hmax: 60, hmid: 18, tallP: 0, ind: 0.2 },
    { name: 'Irbid', x: -50500, z: 22000, r: 2200, seed: 22, style: 'levant', core: 0, mid: 0.45, hmax: 70, hmid: 20, tallP: 0.006 },
    { name: 'Jerash', x: -52500, z: 28000, r: 800, seed: 24, style: 'levant', town: true, core: 0, mid: 0.2, hmax: 30, hmid: 14, tallP: 0, ind: 0 },
    { name: 'Madaba', x: -51500, z: 41500, r: 850, seed: 25, style: 'levant', town: true, core: 0, mid: 0.2, hmax: 30, hmid: 14, tallP: 0, ind: 0 },
    { name: 'Petra', x: -56000, z: 50500, r: 950, seed: 23, style: 'levant', town: true, green: 0.22, core: 0, mid: 0.25, hmax: 30, hmid: 14, tallP: 0, ind: 0 }
  ];
  function cityS(c, a) {
    const sd = c.seed || 5, n = fbm(Math.cos(a) * 1.5 + sd * 1.37 + 20, Math.sin(a) * 1.5 + sd * 0.71 + 20, 3);
    return clamp(0.52 + (n - 0.28) * 1.25, 0.48, 1);
  }
  // normalised distance from a city's centre: below 1 is inside its outline
  G.cityDn = function (c, x, z) {
    const rx = c.rx || c.r, rz = c.rz || c.r, dx = (x - c.x) / rx, dz = (z - c.z) / rz, d = Math.hypot(dx, dz);
    if (d > 1.15) return d;
    return d / (cityS(c, Math.atan2(dz, dx)) * (0.93 + 0.14 * fbm(x / 520 + (c.seed || 5), z / 520, 2)));
  };
  // point on the outline in direction a, pushed out by `out` metres
  G.cityEdge = function (c, a, out) {
    const s = cityS(c, a), rx = (c.rx || c.r) * s + (out || 0), rz = (c.rz || c.r) * s + (out || 0);
    return [c.x + Math.cos(a) * rx, c.z + Math.sin(a) * rz];
  };
  const ISLANDS = G.ISLANDS = [
    { x: 22000, z: -20000, r: 4800, h: 520 }, { x: 31000, z: 4000, r: 3200, h: 300 }, { x: 18500, z: 21000, r: 2600, h: 170 },
    { x: 40000, z: -40000, r: 6500, h: 850 }, { x: 27000, z: 38000, r: 3800, h: 320 }, { x: 47000, z: 19000, r: 5200, h: 600 },
    { x: 16000, z: -42000, r: 2400, h: 140 }, { x: 36000, z: 58000, r: 4200, h: 260 }, { x: 58000, z: -8000, r: 3600, h: 380 }
  ];
  const LAKES = G.LAKES = [
    { x: -14000, z: -22000, r: 2300 }, { x: -22000, z: -12000, r: 1900 }, { x: -44500, z: -17000, r: 2700 }, { x: -52000, z: -36000, r: 2100 },
    { x: -20000, z: -47000, r: 2500 }, { x: -65000, z: -22000, r: 2000 }, { x: -39000, z: -3000, r: 1800 }, { x: -59000, z: 7000, r: 2200 },
    { x: -12500, z: 19500, r: 1500 }, { x: -36000, z: 49000, r: 1600 }, { x: -70000, z: -46000, r: 2400 }, { x: -30000, z: -58000, r: 2000 },
    { x: -58300, z: 37500, r: 2000 }, { x: -58600, z: 41000, r: 2000 } // the Dead Sea
  ];
  // land cover: where forests and farmland sit (shared by the ground shader and tree placement)
  function forestF(x, z) {
    const f = fbm(x / 2300 + 9, z / 2300 + 3, 3) * 0.75 + fbm(x / 700, z / 700 + 5, 2) * 0.25;
    return smoothstep(0.53, 0.63, f) * (1 - desertF(x, z));
  }
  function farmF(x, z, fo) {
    return (1 - smoothstep(0.02, 0.3, flatMask(x, z))) * (1 - desertF(x, z)) * (1 - fo) * smoothstep(0.3, 0.45, fbm(x / 5200 + 31, z / 5200 + 7, 2));
  }
  function desertF(x, z) { return smoothstep(15000, 26000, z + (fbm(x / 7000, z / 7000 + 4, 2) - 0.5) * 9000); }
  G.desertF = desertF;
  function flatMask(x, z) {
    const zc = clamp(z, -12500, 3000);
    let m = smoothstep(8200, 17500, Math.hypot(x, z - zc));
    for (let i = 1; i < AIRPORTS.length; i++) {
      const a = AIRPORTS[i], zz = clamp(z, a.z - 3500, a.z + 3500);
      m = Math.min(m, smoothstep(5800, 12500, Math.hypot(x - a.x, z - zz)));
    }
    for (let i = 1; i < CITIES.length; i++) { const c = CITIES[i]; m = Math.min(m, smoothstep(c.r + 3200, c.r + 11000, Math.hypot(x - c.x, z - c.z))); }
    return m;
  }
  function rawH(x, z) {
    const m = flatMask(x, z), des = desertF(x, z);
    const ridge = 1 - Math.abs(fbm(x / 9000 + 5, z / 9000 + 9, 4) * 2 - 1);
    let h = m * m * (ridge * ridge * 3100 + fbm(x / 2500, z / 2500, 3) * 500) * (1 - 0.5 * des) + Math.min(1, m * 5) * fbm(x / 1800 + 3, z / 1800, 2) * 60;
    h += Math.min(1, m * 4) * des * Math.abs(Math.sin(x / 520 + fbm(x / 3000, z / 3000, 2) * 9)) * 45; // dunes
    const coast = x + (fbm(z / 5000, 3.3, 2) - 0.5) * 3000;
    const s = smoothstep(6400, 9000, coast);
    h = h * (1 - s) - s * 80;
    for (let i = 0; i < LAKES.length; i++) {
      const lk = LAKES[i], d = Math.hypot(x - lk.x, z - lk.z) * (0.8 + 0.4 * vnoise(x / 1900 + i * 3, z / 1900));
      if (d < lk.r * 2) { const k = smoothstep(lk.r * 2, lk.r * 0.85, d); h = h * (1 - k) + (-15) * k; }
    }
    const edge = smoothstep(80000, 93000, Math.max(Math.abs(x), Math.abs(z)) + (fbm(x / 9000 + 2, z / 9000, 2) - 0.5) * 9000);
    h = h * (1 - edge) - edge * 80;
    for (let i = 0; i < ISLANDS.length; i++) {
      const il = ISLANDS[i], d = Math.hypot(x - il.x, z - il.z) * (0.85 + 0.3 * vnoise(x / 2600 + i, z / 2600));
      if (d < il.r) { const t = 1 - d / il.r, hi = -80 + smoothstep(0, 0.28, t) * 84 + smoothstep(0.28, 1, t) * il.h * (0.35 + 0.65 * fbm(x / 1500, z / 1500 + i, 3)); if (hi > h) h = hi; }
    }
    return h;
  }

  // ---------- geometry builder with facade attributes
  const colCache = {};
  const C = (hex) => colCache[hex] || (colCache[hex] = new T.Color(hex));
  G.C = C;
  const F0 = [1, 1, 0, 0];
  class GB {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.f = []; this.F = { p: [], n: [], c: [], u: [], f: [] }; this.M = { p: [], n: [], c: [], u: [], f: [] }; this._t = this; this.fine = 0; this.minx = 1e9; this.maxx = -1e9; this.minz = 1e9; this.maxz = -1e9; this.maxy = 0; this.ox = 0; this.oz = 0; } // F: small parts, drawn only up close; M: medium parts, dropped at long range
    _v(v, nx, ny, nz, col, uu, vv, fac) {
      const px = v[0] + this.ox, pz = v[2] + this.oz;
      const t = this._t; t.p.push(px, v[1], pz); t.n.push(nx, ny, nz); t.c.push(col.r, col.g, col.b); t.u.push(uu, vv);
      t.f.push(fac[0], fac[1], fac[2], fac[3]);
      if (px < this.minx) this.minx = px; if (px > this.maxx) this.maxx = px;
      if (pz < this.minz) this.minz = pz; if (pz > this.maxz) this.maxz = pz;
      if (v[1] > this.maxy) this.maxy = v[1];
    }
    tri(a, b, c, col, up) {
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (up && ny < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this._v(a, nx, ny, nz, col, 0, 0, F0); this._v(b, nx, ny, nz, col, 0, 0, F0); this._v(c, nx, ny, nz, col, 0, 0, F0);
    }
    quad(a, b, c, d, col, fac, u0, u1, v0, v1) {
      fac = fac || F0;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      u0 = u0 || 0; u1 = u1 || 0; v0 = v0 || 0; v1 = v1 || 0;
      this._v(a, nx, ny, nz, col, u0, v0, fac); this._v(b, nx, ny, nz, col, u1, v0, fac); this._v(c, nx, ny, nz, col, u1, v1, fac);
      this._v(a, nx, ny, nz, col, u0, v0, fac); this._v(c, nx, ny, nz, col, u1, v1, fac); this._v(d, nx, ny, nz, col, u0, v1, fac);
    }
    // extrude polygon [[x,z],...] between y0..y1; o: top (scale), twist (rad), segs, cx, cz, cap, capCol
    prism(poly, y0, y1, col, fac, o) {
      o = o || {};
      let P = poly;
      let A = 0;
      for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; A += P[i][0] * P[j][1] - P[j][0] * P[i][1]; }
      if (A > 0) P = P.slice().reverse();
      const n = P.length, top = o.top === undefined ? 1 : o.top, tw = o.twist || 0, segs = o.segs || (tw ? 20 : 1);
      let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (let i = 0; i < n; i++) { const q = P[i]; if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < bz0) bz0 = q[1]; if (q[1] > bz1) bz1 = q[1]; }
      const keep = this._t, tier = this._tier(bx1 - bx0, Math.abs(y1 - y0), bz1 - bz0); if (tier && keep === this) this._t = tier === 1 ? this.F : this.M;
      let cx = o.cx, cz = o.cz;
      if (cx === undefined) { cx = 0; cz = 0; P.forEach((p) => { cx += p[0] / n; cz += p[1] / n; }); }
      const lv = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, sc = 1 + (top - 1) * t, a = tw * t, ca = Math.cos(a), sa = Math.sin(a), y = y0 + (y1 - y0) * t;
        lv.push(P.map((p) => { const dx = (p[0] - cx) * sc, dz = (p[1] - cz) * sc; return [cx + dx * ca - dz * sa, y, cz + dx * sa + dz * ca]; }));
      }
      let per = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, len = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]);
        for (let s = 0; s < segs; s++) {
          this.quad(lv[s][i], lv[s][j], lv[s + 1][j], lv[s + 1][i], col, fac, per, per + len, lv[s][0][1], lv[s + 1][0][1]);
        }
        per += len;
      }
      if (o.cap !== false && top > 0.03) {
        const tp = lv[segs], cc = o.capCol || col;
        const tris = T.ShapeUtils.triangulateShape(tp.map((p) => new T.Vector2(p[0], p[2])), []);
        tris.forEach((f) => this.tri(tp[f[0]], tp[f[1]], tp[f[2]], cc, true));
      }
      this._t = keep;
      return this;
    }
    // Sort a part by size: 1 = small (could not cover a pixel from a few kilometres away), 2 = medium (the same from
    // ten), 0 = the bulk. Each tier is drawn only out to the range where it still shows (see World.update).
    _tier(a, b, c) { if (this.fine) return 1; const mx = Math.max(a, b, c), mid = a + b + c - mx - Math.min(a, b, c); return mid < 2.3 && mid * mx < 13 ? 1 : mid < 6.5 && mx < 14 ? 2 : 0; }
    box(x, y, z, w, h, d, col, fac, capCol, rot) {
      let P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
      const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
      P = P.map((p) => [x + p[0] * ca - p[1] * sa, z + p[0] * sa + p[1] * ca]);
      return this.prism(P, y, y + h, col, fac, { capCol });
    }
    cyl(x, y, z, r, h, n, col, fac, o) { if (r < 1.1 && n > 6) n = 6; return this.prism(GB.ngon(x, z, r, r, n), y, y + h, col, fac, o); }
    static ngon(x, z, rx, rz, n, rot) {
      const P = []; rot = rot || 0;
      for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; P.push([x + Math.cos(a) * rx, z + Math.sin(a) * rz]); }
      return P;
    }
    static rect(x, z, w, d) { return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]]; }
    // gable roof over rectangle; ridge along X if alongX
    gable(x, y, z, w, d, h, col, alongX, wallCol) {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, wc = wallCol || col;
      if (alongX) {
        this.quad([x0, y, z1], [x1, y, z1], [x1, y + h, z], [x0, y + h, z], col);
        this.quad([x1, y, z0], [x0, y, z0], [x0, y + h, z], [x1, y + h, z], col);
        this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, z], wc); this.tri([x1, y, z1], [x1, y, z0], [x1, y + h, z], wc);
      } else {
        this.quad([x1, y, z1], [x1, y, z0], [x, y + h, z0], [x, y + h, z1], col);
        this.quad([x0, y, z0], [x0, y, z1], [x, y + h, z1], [x, y + h, z0], col);
        this.tri([x0, y, z1], [x1, y, z1], [x, y + h, z1], wc); this.tri([x1, y, z0], [x0, y, z0], [x, y + h, z0], wc);
      }
      return this;
    }
    // roof slanting along x from yA (x0) to yB (x1), closed sides
    wedge(x0, x1, z0, z1, y0, yA, yB, col, fac, roofCol) {
      this.quad([x0, yA, z1], [x1, yB, z1], [x1, yB, z0], [x0, yA, z0], roofCol || col);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, yB, z1], [x0, yA, z1], col, fac, 0, x1 - x0, y0, yB);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, yA, z0], [x1, yB, z0], col, fac, 0, x1 - x0, y0, yA);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, yB, z0], [x1, yB, z1], col, fac, 0, z1 - z0, y0, yB);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, yA, z1], [x0, yA, z0], col, fac, 0, z1 - z0, y0, yA);
      return this;
    }
    add(geom, x, y, z, sx, sy, sz, col, rx, ry, rz) {
      const big = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)); // small copies of round shapes use a lighter mesh
      if (geom.userData.lo && big < 4.2) geom = geom.userData.lo; else if (geom.userData.mid && big < 13) geom = geom.userData.mid;
      const g = geom.index ? (geom.userData.flat || (geom.userData.flat = geom.toNonIndexed())) : geom;
      if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox, keep = this._t;
      const tier = this._tier((bb.max.x - bb.min.x) * Math.abs(sx), (bb.max.y - bb.min.y) * Math.abs(sy), (bb.max.z - bb.min.z) * Math.abs(sz)); if (tier && keep === this) this._t = tier === 1 ? this.F : this.M;
      const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx, sy, sz));
      const nm = new T.Matrix3().getNormalMatrix(m);
      const pos = g.attributes.position, nor = g.attributes.normal, v = new T.Vector3(), nn = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m); nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        this._v([v.x, v.y, v.z], nn.x, nn.y, nn.z, col, 0, 0, F0);
      }
      this._t = keep;
      return this;
    }
    build() {
      const g = new T.BufferGeometry(), all = (a, k) => a.concat(this.F[k], this.M[k]);
      g.setAttribute('position', new T.Float32BufferAttribute(all(this.p, 'p'), 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(all(this.n, 'n'), 3));
      g.setAttribute('color', new T.Float32BufferAttribute(all(this.c, 'c'), 3));
      g.setAttribute('fuv', new T.Float32BufferAttribute(all(this.u, 'u'), 2));
      g.setAttribute('facade', new T.Float32BufferAttribute(all(this.f, 'f'), 4));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }
  G.GB = GB;

  function makeCityMaterial() {
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, side: T.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 fuv;\nattribute vec4 facade;\nvarying vec2 vFuv;\nvarying vec4 vFacade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFuv = fuv; vFacade = facade;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFuv;\nvarying vec4 vFacade;\nfloat fhash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fMask = 0.0;
          {
            float st = vFacade.z;
            if (st > 0.5) {
              vec2 cell = vFuv / vFacade.xy; vec2 id = floor(cell); vec2 f = fract(cell);
              float wm; float avg; bool curtain = (st > 1.5 && st < 2.5);
              if (st < 1.5) { wm = step(0.22,f.x)*step(f.x,0.78)*step(0.22,f.y)*step(f.y,0.78); avg = 0.31; }
              else if (st < 2.5) { wm = step(0.05,f.x)*step(f.x,0.95)*step(0.08,f.y)*step(f.y,0.92); avg = 0.76; }
              else if (st < 3.5) { wm = step(0.3,f.y)*step(f.y,0.82); avg = 0.52; }
              else { wm = step(0.28,f.x)*step(f.x,0.72)*step(0.03,f.y); avg = 0.42; }
              float hsh = fhash(id + vFacade.w);
              vec3 glass = curtain ? diffuseColor.rgb*(0.5+0.8*hsh) : mix(vec3(0.015,0.03,0.05), vec3(0.14,0.22,0.32), hsh*hsh);
              vec3 wall = curtain ? diffuseColor.rgb*0.3+0.02 : diffuseColor.rgb;
              vec3 avgGlass = curtain ? diffuseColor.rgb*0.9 : vec3(0.06,0.1,0.15);
              vec2 fw = fwidth(cell); float lod = 1.0 - smoothstep(0.3, 0.9, max(fw.x,fw.y));
              vec3 cNear = mix(wall, glass, wm);
              vec3 cFar = mix(wall, avgGlass, avg);
              diffuseColor.rgb = mix(cFar, cNear, lod);
              fMask = wm*lod + avg*(1.0-lod)*0.6;
            }
          }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, fMask);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, fMask);');
    };
    return m;
  }

  // ---------- sky
  const SUN = new T.Vector3(0.45, 0.62, 0.64).normalize();
  G.SUN = SUN;
  function makeSky() {
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { sun: { value: SUN }, space: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sun; uniform float space;
        void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
          vec3 zen = vec3(0.13,0.32,0.68), hor = vec3(0.62,0.76,0.9);
          vec3 c = mix(hor, zen, pow(h, 0.55));
          if (d.y < 0.0) c = mix(hor, vec3(0.5,0.62,0.74), clamp(-d.y*6.0,0.0,1.0));
          float s = max(dot(d, sun), 0.0);
          c *= (1.0 - space);
          c += vec3(1.0,0.9,0.7)*pow(s, 900.0)*6.0 + vec3(1.0,0.85,0.6)*pow(s, 24.0)*0.28 + vec3(1.0,0.9,0.75)*pow(s,4.0)*0.08;
          gl_FragColor = vec4(c, 1.0); }`
    });
    const m = new T.Mesh(new T.SphereGeometry(1000, 32, 16), mat);
    m.frustumCulled = false; m.renderOrder = -10;
    return m;
  }
  G.makeSky = makeSky;

  function grassTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d'); const r = G.rng(7);
    x.fillStyle = '#b9b9b9'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const v = 150 + Math.floor(r() * 90);
      x.fillStyle = `rgba(${v},${v},${v},0.5)`;
      x.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
    }
    for (let i = 0; i < 60; i++) {
      const v = 150 + Math.floor(r() * 80);
      x.fillStyle = `rgba(${v},${v},${v},0.18)`;
      x.beginPath(); x.ellipse(r() * 512, r() * 512, 20 + r() * 60, 20 + r() * 60, 0, 0, 7); x.fill();
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }

  function runwayTexture() {
    const W = 256, H = 4096, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), r = G.rng(3);
    const ppm = H / 3600, pxm = W / 60;
    x.fillStyle = '#2b2d30'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 30000; i++) { const v = 30 + Math.floor(r() * 30); x.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; x.fillRect(r() * W, r() * H, 2, 2 + r() * 6); }
    x.fillStyle = '#e8e8e4';
    x.fillRect(1.2 * pxm, 0, 0.9 * pxm, H); x.fillRect(W - 2.1 * pxm, 0, 0.9 * pxm, H);
    for (let m = 120; m < 3480; m += 60) x.fillRect(W / 2 - 0.45 * pxm, m * ppm, 0.9 * pxm, 30 * ppm);
    const end = (flip) => {
      x.save(); if (flip) { x.translate(W, H); x.rotate(Math.PI); }
      // threshold bars (at top of canvas in this frame)
      for (let i = 0; i < 12; i++) { if (i === 5 || i === 6) continue; x.fillRect((4 + i * 4.4) * pxm, 8 * ppm, 2.2 * pxm, 30 * ppm); }
      x.font = 'bold ' + Math.round(13 * pxm) + 'px Arial'; x.textAlign = 'center';
      x.save(); x.translate(W / 2, 62 * ppm); x.scale(1, ppm / pxm * 2.2); x.rotate(Math.PI); x.fillText(flip ? '36' : '18', 0, 0); x.restore();
      [150, 300, 450, 600, 750].forEach((m, i) => {
        const wdt = i === 1 ? 6 : 1.8, n = i === 1 ? 1 : (i < 3 ? 3 : 2);
        for (let k = 0; k < n; k++) { x.fillRect((14 - wdt - k * 3) * pxm, m * ppm, wdt * pxm, 22 * ppm); x.fillRect((46 + k * 3) * pxm, m * ppm, wdt * pxm, 22 * ppm); }
      });
      x.fillStyle = 'rgba(8,8,8,0.35)';
      for (let i = 0; i < 70; i++) x.fillRect(W / 2 + (r() - 0.5) * 22 * pxm, (250 + r() * 500) * ppm, 0.7 * pxm, (40 + r() * 160) * ppm);
      x.fillStyle = '#e8e8e4';
      x.restore();
    };
    end(false); end(true);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 16;
    return t;
  }

  // ---------- World
  const N = 384, SIZE = 192000, HALF = SIZE / 2, CELL = SIZE / N;
  const PAD = G.PAD = { name: 'Space Center', x: 4300, z: 1500 };
  const SEA = G.SEA = -6;
  // aircraft carrier: bow points north (-z); deck outline in local x,z
  const CARRIER = G.CARRIER = { name: 'Aircraft Carrier', x: 15500, z: 1500, deckY: 16,
    deck: [[-19, -166], [19, -166], [30, -120], [37, -60], [37, 150], [30, 166], [-30, 166], [-39, 120], [-39, -20], [-28, -110]] };
  function onDeck(x, z) {
    const lx = x - CARRIER.x, lz = z - CARRIER.z;
    if (lx < -40 || lx > 38 || lz < -167 || lz > 167) return false;
    const P = CARRIER.deck; let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > lz) !== (P[j][1] > lz) && lx < (P[j][0] - P[i][0]) * (lz - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside; }
    return inside;
  }
  const CITY = CITIES[0];
  G.CITY = CITY;

  const _ax = new T.Vector3(), _q = new T.Quaternion(), _v = new T.Vector3();
  class World {
    constructor(scene) {
      this.scene = scene;
      this.buildings = []; this.grid = new Map(); this.collapsing = []; this.sams = []; this.cityGroups = []; this.curGroup = null;
      this.paved = [];
      this.cityMat = makeCityMaterial();
      this.destroyedCount = 0; this.targetCount = 0;
      this._terrain(); AIRPORTS.forEach((a, i) => this._airport(a, i)); this._carrier(); this._spaceCenter();
      G.buildCity(this); this._roads();
      this._batch();
      this._trees(); this._scenery();
      this._map();
    }

    _terrain() {
      const hs = this.heights = new Float32Array((N + 1) * (N + 1));
      const g = new T.PlaneGeometry(SIZE, SIZE, N, N); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      const cGrassA = new T.Color(0x567a38), cGrassB = new T.Color(0x7f8f48), cRock = new T.Color(0x7a7166), cSnow = new T.Color(0xf2f4f7),
        cSand = new T.Color(0xc9bb8e), cForest = new T.Color(0x3d5c30), cDry = new T.Color(0x9a8d58), cDesA = new T.Color(0xd2b47c), cDesB = new T.Color(0xb98f58), cRed = new T.Color(0x9a6a4a), c = new T.Color(), c2 = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = rawH(x, z);
        hs[i] = h; pos.setY(i, h);
      }
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = hs[i];
        const ix = i % (N + 1), iz = Math.floor(i / (N + 1));
        const hx = hs[iz * (N + 1) + Math.min(ix + 1, N)] - h, hz = hs[Math.min(iz + 1, N) * (N + 1) + ix] - h;
        const slope = Math.hypot(hx, hz) / CELL;
        const n1 = fbm(x / 1400, z / 1400, 3), n2 = vnoise(x / 420, z / 420);
        c.copy(cGrassA).lerp(cGrassB, n1).lerp(cDry, smoothstep(0.55, 0.9, n2) * 0.6).lerp(cForest, smoothstep(0.5, 0.75, fbm(x / 3000 + 9, z / 3000, 2)) * 0.7);
        const des = desertF(x, z);
        if (des > 0.01) c.lerp(c2.copy(cDesA).lerp(cDesB, n1 * 0.7 + n2 * 0.3), des);
        if (h < -1) c.copy(cSand);
        else if (h < 6 && rawH(x + 600, z) < -1) c.lerp(cSand, 0.7);
        if (h < -0.01 && h > -1) c.lerp(cSand, 0.6);
        c.lerp(des > 0.5 ? cRed : cRock, smoothstep(0.18, 0.5, slope) * 0.9 + smoothstep(600, 1500, h) * 0.5);
        if (h > 0.5 && h < 9 && x > 9000) c.lerp(cSand, 0.75);
        c.lerp(cSnow, smoothstep(1500, 2100, h + n2 * 300) * (1 - des));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const tex = grassTexture(); tex.repeat.set(SIZE / 260, SIZE / 260);
      // land-cover textures: forest and farmland masks, plus rivers and highways drawn as lines
      const CS = 1024, cc = document.createElement('canvas'); cc.width = cc.height = CS;
      const cx2 = cc.getContext('2d'), cim = cx2.createImageData(CS, CS);
      for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
        const x = (i + 0.5) / CS * SIZE - HALF, z = (j + 0.5) / CS * SIZE - HALF, k = (j * CS + i) * 4;
        const fx = Math.min(N - 1, (x + HALF) / CELL) | 0, fz = Math.min(N - 1, (z + HALF) / CELL) | 0, hh = hs[fz * (N + 1) + fx];
        let fo = 0, fa = 0;
        if (hh > 1 && hh < 1500) { fo = forestF(x, z); if (hh < 40) fa = farmF(x, z, fo); }
        cim.data[k] = fo * 255; cim.data[k + 1] = fa * 255; cim.data[k + 2] = hh > -0.3 ? desertF(x, z) * 255 : 0; cim.data[k + 3] = 255;
      }
      cx2.putImageData(cim, 0, 0);
      const coverTex = new T.CanvasTexture(cc); coverTex.flipY = false; coverTex.minFilter = T.LinearFilter; coverTex.generateMipmaps = false;
      const LS = 2048, lc = document.createElement('canvas'); lc.width = lc.height = LS; const lx = lc.getContext('2d');
      const tm = (v) => (v + HALF) / SIZE * LS;
      lx.fillStyle = '#000'; lx.fillRect(0, 0, LS, LS); lx.lineCap = 'round'; lx.lineJoin = 'round';
      const wiggle = (ax, az, bx, bz, amp, seed) => { // meandering path between two world points
        const n = 14, dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l; lx.beginPath(); lx.moveTo(tm(ax), tm(az));
        for (let s = 1; s <= n; s++) { const t = s / n, o = Math.sin(t * Math.PI) * amp * (vnoise(seed + t * 4.3, seed * 1.7) - 0.5) * 2; lx.lineTo(tm(ax + dx * t + nx * o), tm(az + dz * t + nz * o)); }
        lx.stroke();
      };
      lx.strokeStyle = '#0000ff'; lx.lineWidth = 1.5; // rivers: lake to lake, and out to the sea
      [[0, 1], [1, 6], [2, 3], [2, 5], [4, 11], [6, 7], [3, 10]].forEach((p, i) => wiggle(LAKES[p[0]].x, LAKES[p[0]].z, LAKES[p[1]].x, LAKES[p[1]].z, 2600, i + 2));
      wiggle(LAKES[0].x, LAKES[0].z, 9000, -26000, 2200, 31); wiggle(LAKES[1].x, LAKES[1].z, 8500, 9000, 3000, 37); wiggle(LAKES[4].x, LAKES[4].z, 9500, -52000, 2600, 41);
      wiggle(-57200, 15500, LAKES[12].x, LAKES[12].z - 1500, 1100, 53); // the River Jordan runs down to the Dead Sea
      lx.strokeStyle = '#ff0000'; lx.lineWidth = 1.1; // highways between cities
      const cityXY = (n) => { if (typeof n !== 'string') return n; const c = CITIES.find((q) => q.name === n); return [c.x, c.z]; };
      [['New York', 'Westfield'], ['Westfield', 'Paris'], ['New York', 'Northpoint'], ['Northpoint', 'London'], ['London', 'Paris'], ['Westfield', 'Cairo'], ['Cairo', 'Dubai'], ['Cairo', 'Amman'], ['Paris', 'Amman']]
        .concat([['London', 'Amman'], ['Northpoint', 'Paris'], ['Dubai', 'New York']])
        .concat([['Amman', 'Zarqa'], ['Amman', 'Jerash'], ['Jerash', 'Irbid'], ['Zarqa', 'Irbid'], ['Amman', 'Madaba'], ['Madaba', 'Petra'], ['Amman', [-42500, 40300]], ['Petra', 'Cairo'], ['Zarqa', 'Cairo'], ['Irbid', 'Westfield'], ['Paris', 'Westfield'], ['London', 'New York']]).forEach((p, i) => {
          const a = cityXY(p[0]), b = cityXY(p[1]), n = 12, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, ctl = [];
          for (let s = 0; s <= n; s++) { const t = s / n, o = Math.sin(t * Math.PI) * Math.min(1700, l * 0.13) * (vnoise(i * 3 + 60 + t * 4.3, (i * 3 + 60) * 1.7) - 0.5) * 2; ctl.push(new T.Vector3(a[0] + dx * t + nx * o, 0, a[1] + dz * t + nz * o)); }
          const pts = new T.CatmullRomCurve3(ctl).getSpacedPoints(Math.ceil(l / 110));
          (this.roadPaths || (this.roadPaths = [])).push(pts);
          lx.beginPath(); pts.forEach((q, k) => (k ? lx.lineTo(tm(q.x), tm(q.z)) : lx.moveTo(tm(q.x), tm(q.z)))); lx.stroke();
        });
      lx.globalCompositeOperation = 'lighter'; lx.filter = 'blur(7px)';
      CITIES.forEach((c) => { const R0 = (c.r + 5200) / SIZE * LS, g = lx.createRadialGradient(tm(c.x), tm(c.z), (c.r * 0.6) / SIZE * LS, tm(c.x), tm(c.z), R0); const gk = c.green === undefined ? 1 : c.green; g.addColorStop(0, 'rgba(0,255,0,' + 0.95 * gk + ')'); g.addColorStop(0.55, 'rgba(0,255,0,' + 0.6 * gk + ')'); g.addColorStop(1, 'rgba(0,255,0,0)'); lx.fillStyle = g; lx.beginPath(); lx.arc(tm(c.x), tm(c.z), R0, 0, 6.2832); lx.fill(); });
      lx.strokeStyle = 'rgba(0,255,0,0.4)'; lx.lineWidth = 22;
      (this.roadPaths || []).forEach((pts) => { lx.beginPath(); pts.forEach((q, k) => { if (k % 6 === 0) { if (k) lx.lineTo(tm(q.x), tm(q.z)); else lx.moveTo(tm(q.x), tm(q.z)); } }); lx.stroke(); });
      lx.filter = 'none'; lx.globalCompositeOperation = 'source-over';
      const lineTex = new T.CanvasTexture(lc); lineTex.flipY = false; lineTex.anisotropy = 8;
      const landMat = new T.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.96, metalness: 0 });
      landMat.onBeforeCompile = (sh) => {
        sh.uniforms.tCover = { value: coverTex }; sh.uniforms.tLines = { value: lineTex };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vTp; uniform sampler2D tCover; uniform sampler2D tLines;
            float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float tnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(thash(i), thash(i+vec2(1,0)), f.x), mix(thash(i+vec2(0,1)), thash(i+vec2(1,1)), f.x), f.y); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float lWater = 0.0;
            {
              vec2 uv = vTp.xz / ${SIZE.toFixed(1)} + 0.5;
              vec4 cov = texture2D(tCover, uv); vec4 lin = texture2D(tLines, uv);
              float dst = length(vTp - cameraPosition), nearK = clamp(1.0 - dst / 14000.0, 0.0, 1.0);
              float n1 = tnoise(vTp.xz * 0.012), n2 = tnoise(vTp.xz * 0.09), n3 = tnoise(vTp.xz * 0.9);
              // farmland: a patchwork of fields with hedgerow borders and plough lines
              vec2 fp = vTp.xz / 240.0 + (tnoise(vTp.xz * 0.0011) - 0.5) * 3.0; vec2 fid = floor(fp), ff = fract(fp);
              float fh = thash(fid), fh2 = thash(fid + 17.3);
              vec3 field = fh < 0.34 ? mix(vec3(0.20,0.36,0.10), vec3(0.34,0.46,0.14), fh2) : (fh < 0.68 ? mix(vec3(0.55,0.50,0.22), vec3(0.66,0.58,0.30), fh2) : mix(vec3(0.34,0.25,0.15), vec3(0.44,0.34,0.20), fh2));
              float ang = fh2 * 3.14159; float furrow = 0.93 + 0.07 * sin(dot(vTp.xz, vec2(cos(ang), sin(ang))) * 0.9);
              float hedge = smoothstep(0.0, 0.035, ff.x) * smoothstep(0.0, 0.035, ff.y) * smoothstep(0.0, 0.035, 1.0 - ff.x) * smoothstep(0.0, 0.035, 1.0 - ff.y);
              field = mix(vec3(0.10, 0.19, 0.08), field * mix(1.0, furrow, nearK), hedge);
              diffuseColor.rgb = mix(diffuseColor.rgb, field, cov.g * 0.9);
              // forest canopy
              vec3 canopy = vec3(0.055, 0.15, 0.05) * (0.65 + 0.5 * n2 + 0.45 * n3 * nearK);
              float fedge = smoothstep(0.35, 0.6, cov.r + (n2 - 0.5) * 0.35);
              diffuseColor.rgb = mix(diffuseColor.rgb, canopy, fedge * 0.92);
              // fine ground variation
              diffuseColor.rgb *= 0.86 + 0.28 * (n1 * 0.6 + n2 * 0.4) + (n3 - 0.5) * 0.16 * nearK;
              // desert floor: gravel plains, pale dry wadis with scrub along them, wind ripples, salt-crusted pans
              {
                float des = cov.b * (1.0 - cov.g);
                float gravel = smoothstep(0.45, 0.7, tnoise(vTp.xz * 0.0016 + 40.0));
                vec3 dc = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.68, 0.66), gravel * 0.75);
                float wv = abs(tnoise(vTp.xz * 0.00085 + 7.0) * 2.0 - 1.0) + (n2 - 0.5) * 0.02;
                float wadi = 1.0 - smoothstep(0.012, 0.04, wv);
                dc = mix(dc, vec3(0.66, 0.57, 0.42), wadi * 0.4);
                float scrub = step(0.82, tnoise(vTp.xz * 0.05)) * smoothstep(0.1, 0.03, wv) * (1.0 - wadi);
                dc = mix(dc, vec3(0.22, 0.27, 0.13), scrub * 0.8 * nearK + scrub * 0.3);
                float rip = sin(dot(vTp.xz, vec2(0.34, 0.2)) + tnoise(vTp.xz * 0.004) * 9.0);
                dc *= 1.0 + rip * 0.045 * nearK * (1.0 - gravel);
                float pan = smoothstep(0.8, 0.88, tnoise(vTp.xz * 0.0007 + 91.0));
                dc = mix(dc, vec3(0.74, 0.67, 0.54), pan * 0.25);
                // settled land near towns and roads: small walled plots, some planted, some ploughed, dirt lanes between
                vec2 pp = vTp.xz / 105.0 + (tnoise(vTp.xz * 0.0019) - 0.5) * 1.6; vec2 pid = floor(pp), pf = fract(pp);
                float ph = thash(pid), ph2 = thash(pid + 31.7), planted = step(ph, lin.g * 0.62);
                vec3 plot = ph2 < 0.3 ? mix(vec3(0.10, 0.19, 0.05), vec3(0.17, 0.25, 0.07), thash(pid + 5.1)) : (ph2 < 0.55 ? vec3(0.20, 0.21, 0.09) : (ph2 < 0.8 ? vec3(0.24, 0.16, 0.09) : vec3(0.36, 0.28, 0.16)));
                float pang = thash(pid + 9.7) > 0.5 ? 1.0 : 0.0; float rows = 0.9 + 0.1 * sin((pang > 0.5 ? vTp.x : vTp.z) * 0.8);
                float lane = smoothstep(0.0, 0.05, pf.x) * smoothstep(0.0, 0.05, pf.y) * smoothstep(0.0, 0.05, 1.0 - pf.x) * smoothstep(0.0, 0.05, 1.0 - pf.y);
                plot = mix(vec3(0.40, 0.33, 0.22), plot * mix(1.0, rows, nearK), lane);
                dc = mix(dc, plot, planted * 0.88);
                diffuseColor.rgb = mix(diffuseColor.rgb, dc, des);
              }
              // highways and rivers
              float road = smoothstep(0.32, 0.5, lin.r); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.17), road * 0.92);
              lWater = smoothstep(0.3, 0.5, lin.b) * (1.0 - road); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.24, 0.36), lWater);
            }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, lWater);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.5, lWater);');
      };
      const mesh = new T.Mesh(g, landMat);
      mesh.receiveShadow = true; this.scene.add(mesh);
      // animated sea: layered waves bend the surface normal, with crest highlights and whitecaps
      const seaMat = new T.MeshStandardMaterial({ color: 0x17547c, roughness: 0.14, metalness: 0.55 });
      const seaU = this.seaU = { time: { value: 0 }, amp: { value: 1 } };
      seaMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = seaU.time; sh.uniforms.uAmp = seaU.amp;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vWp; uniform float uTime; uniform float uAmp;
            float shash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
            float snoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(shash(i), shash(i+vec2(1,0)), f.x), mix(shash(i+vec2(0,1)), shash(i+vec2(1,1)), f.x), f.y); }
            vec3 seaWave(vec2 p, float t){ vec2 g = vec2(0.0); float h = 0.0; vec2 d; float ph;
              d = vec2(0.8,0.6);   ph = dot(p,d)*0.021 + t*0.9; g += d*cos(ph)*1.6*0.021;  h += sin(ph)*1.6;
              d = vec2(-0.5,0.86); ph = dot(p,d)*0.047 + t*1.3; g += d*cos(ph)*0.75*0.047; h += sin(ph)*0.75;
              d = vec2(0.3,-0.95); ph = dot(p,d)*0.11 + t*1.9;  g += d*cos(ph)*0.3*0.11;   h += sin(ph)*0.3;
              d = vec2(-0.9,-0.4); ph = dot(p,d)*0.26 + t*2.6;  g += d*cos(ph)*0.11*0.26;  h += sin(ph)*0.11;
              d = vec2(0.6,0.8);   ph = dot(p,d)*0.63 + t*3.4;  g += d*cos(ph)*0.04*0.63;  h += sin(ph)*0.04;
              return vec3(g, h); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float sDist = length(vWp - cameraPosition);
            float sFade = uAmp / (1.0 + sDist * 0.00022);
            vec3 sw = seaWave(vWp.xz, uTime);
            float swell = snoise(vWp.xz * 0.0006 + uTime * 0.01);
            diffuseColor.rgb *= 0.82 + 0.36 * swell;                                   // large-scale colour variation
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.5, 0.56), clamp(sw.z * 0.09, 0.0, 0.3) * sFade); // lighter crests
            float capN = snoise(vWp.xz * 0.035 + uTime * 0.12) * 0.6 + snoise(vWp.xz * 0.21 - uTime * 0.25) * 0.4;
            float cap = smoothstep(2.0, 2.55, sw.z + (capN - 0.5) * 1.6) * smoothstep(0.5, 0.75, capN) * clamp(1.6 - sDist * 0.0005, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.94, 0.96), clamp(cap, 0.0, 0.7));`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec3 wn = normalize(vec3(-sw.x * sFade * 1.5, 1.0, -sw.y * sFade * 1.5)); normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, clamp(cap, 0.0, 1.0));');
      };
      const sea = new T.Mesh(new T.CircleGeometry(420000, 96), seaMat);
      sea.rotation.x = -Math.PI / 2; sea.position.y = SEA; this.scene.add(sea);
    }

    rawHeight(x, z) {
      const fx = clamp((x + HALF) / CELL, 0, N - 0.001), fz = clamp((z + HALF) / CELL, 0, N - 0.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, hs = this.heights, k = iz * (N + 1) + ix;
      return (hs[k] * (1 - u) + hs[k + 1] * u) * (1 - v) + (hs[k + N + 1] * (1 - u) + hs[k + N + 2] * u) * v;
    }
    groundHeight(x, z) { return onDeck(x, z) ? CARRIER.deckY : Math.max(this.rawHeight(x, z), SEA); }
    onDeck(x, z) { return onDeck(x, z); }
    surfaceAt(x, z) {
      if (onDeck(x, z)) return 'paved';
      if (this.rawHeight(x, z) < SEA + 0.4) return 'water';
      for (let i = 0; i < this.paved.length; i++) { const p = this.paved[i]; if (x > p[0] && x < p[1] && z > p[2] && z < p[3]) return 'paved'; }
      for (let i = 0; i < CITIES.length; i++) { const t = CITIES[i]; if (Math.abs(x - t.x) < t.r + 200 && Math.abs(z - t.z) < t.r + 200 && G.cityDn(t, x, z) < 1.04) return 'paved'; }
      return 'grass';
    }

    _airport(ap, idx) {
      const sc = this.scene, ox = ap.x, oz = ap.z, main = idx === 0;
      if (!this.rwMat) {
        this.rwMat = new T.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.9 });
        this.apMat = new T.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.95 });
        this.shoulderMat = new T.MeshStandardMaterial({ color: 0x55585a, roughness: 0.95 });
        this.roadMat = new T.MeshStandardMaterial({ color: 0x2f3134, roughness: 0.95 });
      }
      const rw = new T.Mesh(new T.PlaneGeometry(60, 3600), this.rwMat);
      rw.rotation.x = -Math.PI / 2; rw.position.set(ox, 0.08, oz); rw.receiveShadow = true; sc.add(rw);
      const slab = (x0, x1, z0, z1, mat, y) => {
        const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), mat || this.apMat);
        m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2 + ox, y || 0.05, (z0 + z1) / 2 + oz); m.receiveShadow = true; sc.add(m);
        this.paved.push([x0 + ox, x1 + ox, z0 + oz, z1 + oz]);
      };
      this.paved.push([ox - 30, ox + 30, oz - 1800, oz + 1800]);
      slab(-42, 42, -1860, 1860, this.shoulderMat, 0.03);
      slab(130, 160, -1750, 1750);
      [-1700, -600, 600, 1700].forEach((z) => slab(30, 130, z - 15, z + 15));
      slab(160, 560, -480, 480);
      if (main) { slab(-410, -390, -4200, 1200, this.roadMat); slab(-390, 130, 1185, 1200, this.roadMat); }
      else if (!ap.noLink) { const t = CITIES.find((c) => c.name === ap.city), tx = t.x - ox; if (tx > 0) slab(560, tx - t.r, -410, -395, this.roadMat); else slab(tx + t.r, -42, -210, -195, this.roadMat); }
      // lights
      const lp = [], lc = [];
      const L = (x, z, r, g, b) => { lp.push(x + ox, 0.5, z + oz); lc.push(r, g, b); };
      for (let z = -1800; z <= 1800; z += 60) { L(-31, z, 1, 0.95, 0.8); L(31, z, 1, 0.95, 0.8); }
      for (let x = -27; x <= 27; x += 6) { L(x, 1802, 0.1, 1, 0.2); L(x, -1802, 1, 0.1, 0.1); }
      for (let i = 1; i <= 14; i++) for (let k = -1; k <= 1; k++) L(k * 3, 1800 + i * 30, 1, 1, 1);
      for (let z = -1740; z <= 1740; z += 90) L(145, z, 0.2, 0.4, 1);
      const lg = new T.BufferGeometry();
      lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new T.Float32BufferAttribute(lc, 3));
      sc.add(new T.Points(lg, new T.PointsMaterial({ size: 4, vertexColors: true, sizeAttenuation: false, fog: false, toneMapped: false })));
      // buildings
      const steel = [0x9aa3aa, 0xb7b9b4, 0x8c959c, 0xa9a08c], nh = main ? 4 : 2;
      for (let i = 0; i < nh; i++) {
        const gb = new GB(), col = C(steel[(i + idx) % 4]);
        const arch = new T.CylinderGeometry(1, 1, 1, 20, 1, false, 0, Math.PI);
        gb.add(arch, 0, 0, 0, 28, 80, 46, col, 0, 0, Math.PI / 2);
        gb.box(40.2, 0, 0, 0.6, 14, 70, C(0x3a3f45), null);
        gb.box(0, 0, 0, 80, 0.3, 92, C(0x4a4d50));
        this.addBuilding(gb, ox + 500, 0, oz - 330 + i * 220, { name: 'Hangar', airport: true, ch: 26 });
      }
      { // control tower
        const gb = new GB();
        gb.cyl(0, 0, 0, 5, 38, 10, C(0xc9c9c4), [3, 4, 1, 3]);
        gb.cyl(0, 38, 0, 9, 6, 10, C(0x2c4a6a), [2, 6, 2, 1], { top: 1.25, capCol: C(0x8a8c8e) });
        gb.cyl(0, 44, 0, 1, 10, 6, C(0xc23a2a));
        this.addBuilding(gb, ox + 300, 0, oz - 620, { name: 'Control tower', airport: true });
      }
      { // terminal
        const gb = new GB();
        if (main) { gb.box(0, 0, 0, 60, 18, 420, C(0x4d6f8f), [3, 4.5, 2, 9], C(0xd8d8d2)); gb.box(-40, 0, 0, 22, 9, 300, C(0xb0aeaa), [5, 4, 3, 4]); }
        else gb.box(0, 0, 0, 44, 12, 170, C(idx === 1 ? 0x8a917c : 0x4d6f8f), [3.5, 4, idx === 1 ? 3 : 2, 5], C(0xd8d8d2));
        this.addBuilding(gb, ox + 640, 0, oz + (main ? 0 : 260), { name: 'Terminal', airport: true });
      }
      // parked aircraft
      const parked = main ? [['a320', 545, -160], ['a320', 545, 0], ['a320', 545, 160]] : idx === 1 ? [['f16', 330, 60], ['typhoon', 330, 110], ['su27', 330, 170], ['mig29', 330, 230], ['a10', 330, 290], ['rafale', 330, 350], ['b1', 345, 430], ['b52', 400, -40], ['tu160', 250, -360]] : [['a320', 545, 250], ['a320', 430, 120]].slice(0, idx === 2 ? 2 : 1);
      parked.forEach((p, i) => {
        const spec = G.aircraftById(p[0]);
        const m = G.buildAircraft(spec, { livery: (i + idx * 2 + 1) % 5, noCockpit: true });
        m.position.set(ox + p[1], spec.gearH, oz + p[2]); m.rotation.y = -Math.PI / 2; sc.add(m);
      });
    }

    _carrier() {
      const c = CARRIER, gb = new GB(), hull = C(0x5d646c), deckC = C(0x33363a), white = C(0xe6e6e0), yel = C(0xd9b02a), Y = c.deckY;
      gb.prism([[0, -168], [14, -140], [20, -80], [20, 140], [16, 166], [-16, 166], [-20, 140], [-20, -80], [-14, -140]], -12, Y - 3, hull, null, { top: 1.0, cap: false });
      gb.prism(c.deck, Y - 3, Y, hull, null, { capCol: deckC });
      gb.box(-39, Y - 9, 40, 10, 6, 60, hull); gb.box(34, Y - 9, -10, 8, 6, 50, hull); // elevators / sponsons
      // deck markings
      for (let z = -160; z < 160; z += 16) gb.box(-4, Y, z + 4, 0.7, 0.06, 8, white);
      gb.box(-16, Y, -60, 0.6, 0.06, 200, white); gb.box(8, Y, -60, 0.6, 0.06, 200, white);
      gb.box(-22, Y, 60, 0.7, 0.06, 215, yel, null, null, 0.14); gb.box(4, Y, 60, 0.7, 0.06, 215, white, null, null, 0.14);
      for (let i = 0; i < 4; i++) gb.box(-9, Y + 0.05, 95 + i * 13, 44, 0.12, 0.5, C(0x9aa0a6), null, null, 0.14); // arrestor wires
      gb.box(-10, Y, -155, 0.7, 0.06, 20, yel); gb.box(10, Y, -155, 0.7, 0.06, 20, yel);
      [[24, 20], [26, 80], [-33, 30], [30, -70]].forEach((t) => { gb.box(t[0], Y, t[1], 2.2, 1.3, 3.6, yel); gb.box(t[0], Y + 1.3, t[1] + 0.6, 1.6, 0.9, 1.4, C(0x2a2c30)); });
      gb.box(34, Y, 125, 3, 9, 3, C(0xd9b02a)); gb.box(30, Y + 9, 125, 12, 1, 1.4, C(0xd9b02a)); // deck crane
      for (let z = -50; z <= 150; z += 25) { gb.box(36.4, Y, z, 0.3, 1.1, 0.3, white); gb.box(-38.4, Y, z * 0.6 + 50, 0.3, 1.1, 0.3, white); }
      const m = new T.Mesh(gb.build(), this.cityMat); m.position.set(c.x, 0, c.z); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m);
      // island superstructure (solid: you can fly into it)
      const ib = new GB(), grey = C(0x6c737b);
      ib.box(0, 0, 0, 11, 16, 34, grey, [3, 4, 1, 2]); ib.box(0, 16, -3, 12, 6, 22, grey, [2.2, 3, 3, 4]); ib.box(0, 22, -3, 8, 5, 12, grey, [2, 2.5, 3, 5]);
      ib.cyl(0, 27, 2, 1, 16, 8, grey); ib.box(0, 36, 2, 8, 3, 1, C(0x8a9097)); ib.box(0, 30, -6, 5, 3, 3, C(0x8a9097)); ib.add(new T.SphereGeometry(1, 12, 8), 0, 30, 10, 2.6, 2.6, 2.6, white);
      this.addBuilding(ib, c.x + 30, Y, c.z + 45, { name: 'carrier island', airport: true, ch: Y + 40, hp: 9 });
      // parked jets along the deck edge
      [['f35', 27, -40, 0.5], ['f16', 28, -15, 0.5], ['f35', 27, 105, 0.4], ['f22', -31, 70, -2.2]].forEach((p) => {
        const sp = G.aircraftById(p[0]), a = G.buildAircraft(sp, { noCockpit: true }); a.position.set(c.x + p[1], Y + sp.gearH, c.z + p[2]); a.rotation.y = p[3]; this.scene.add(a);
      });
      this.paved.push([c.x - 40, c.x + 38, c.z - 167, c.z + 167]);
      const radarMat = new T.MeshStandardMaterial({ color: 0x8a9097, metalness: 0.6, roughness: 0.4 });
      const spin = (x, y, z, w, h, sp) => { const r = new T.Mesh(new T.BoxGeometry(w, h, 0.5), radarMat); r.position.set(x, y, z); this.scene.add(r); (this.spinners || (this.spinners = [])).push({ m: r, sp }); };
      spin(c.x + 30, Y + 41, c.z + 47, 9, 3.4, 1.6); spin(c.x + 30, Y + 33, c.z + 39, 4, 2, -3.2);
      AIRPORTS.forEach((a) => spin(a.x + 300, 47.5, a.z - 620, 7, 2.6, 1.4));
      // escort destroyers
      const ship = (x, z, rot) => {
        const sb = new GB(), hc = C(0x6a7179), sc2 = C(0x7c838b), dk = C(0x3c4046);
        sb.prism([[0, -78], [7, -55], [9, -10], [9, 62], [6, 76], [-6, 76], [-9, 62], [-9, -10], [-7, -55]], -9, 4, hc, null, { capCol: dk });
        sb.box(0, 4, 4, 13, 6, 46, sc2, [2.4, 3, 1, 3]); sb.box(0, 10, -6, 10, 6, 18, sc2, [1.8, 2.5, 3, 4]); sb.box(0, 16, -8, 6, 3, 8, sc2);
        sb.cyl(0, 19, -6, 0.5, 16, 6, dk); sb.box(0, 30, -6, 6, 1.6, 0.6, dk); sb.cyl(0, 10, 20, 2.4, 9, 10, dk, null, { top: 0.8 });
        sb.cyl(0, 4, -40, 3, 2.4, 10, sc2); sb.add(new T.CylinderGeometry(0.35, 0.35, 9, 6), 0, 6, -46, 1, 1, 1, dk, Math.PI / 2.3, 0, 0);
        sb.box(0, 4, 52, 12, 1.2, 22, dk); sb.box(0, 4, 36, 11, 5, 8, sc2);
        const m = new T.Mesh(sb.build(), this.cityMat); m.position.set(x, 0, z); m.rotation.y = rot; m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = true; this.scene.add(m);
      };
      ship(c.x + 950, c.z - 700, 0.05); ship(c.x - 1150, c.z + 450, -0.08); ship(c.x + 300, c.z + 1500, 0.02);
    }

    _spaceCenter() {
      const p = PAD, sc = this.scene, red = C(0xb5382c), grey = C(0x9a9a96), wh = C(0xe8e8e4);
      const slab = (x0, x1, z0, z1, col, y) => { const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshStandardMaterial({ color: col, roughness: 0.95 })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2 + p.x, y || 0.06, (z0 + z1) / 2 + p.z); m.receiveShadow = true; sc.add(m); this.paved.push([x0 + p.x, x1 + p.x, z0 + p.z, z1 + p.z]); };
      slab(-90, 90, -90, 90, 0x6a6c6e); slab(-12, 12, 90, 900, 0x55585a); slab(-760, -12, 880, 900, 0x55585a);
      { const gb = new GB(); // service tower with swing arms
        gb.box(0, 0, 0, 13, 92, 13, red, [2.2, 3.5, 4, 3]); gb.box(0, 92, 0, 6, 14, 6, red); gb.cyl(0, 106, 0, 0.6, 22, 6, wh);
        [22, 44, 66].forEach((y) => gb.box(10, y, 0, 12, 2, 3, grey));
        this.addBuilding(gb, p.x - 30, 0, p.z, { name: 'launch tower', airport: true }); }
      [[55, 55], [-55, 55], [55, -55], [-55, -55]].forEach((o) => { const gb = new GB(); gb.cyl(0, 0, 0, 1.6, 120, 8, wh, null, { top: 0.3 }); this.addBuilding(gb, p.x + o[0], 0, p.z + o[1], { name: 'lightning mast', airport: true, fill: 0.05 }); });
      { const gb = new GB(); // vehicle assembly building
        gb.box(0, 0, 0, 160, 150, 120, wh, [10, 150, 4, 2], C(0xbdbdb8)); gb.box(-100, 0, 0, 50, 60, 100, grey, [4, 4, 3, 5]); gb.box(0, 30, 60.4, 30, 110, 0.6, C(0x4a5058));
        this.addBuilding(gb, p.x - 300, 0, p.z + 1000, { name: 'Vehicle Assembly Building', airport: true }); }
      { const gb = new GB(); gb.box(0, 0, 0, 60, 14, 30, wh, [3, 3.5, 3, 4]); gb.cyl(26, 14, 0, 6, 0.8, 16, grey); this.addBuilding(gb, p.x - 500, 0, p.z + 700, { name: 'Launch control', airport: true }); }
    }

    // register a building built in local coordinates
    addBuilding(gb, x, y, z, o) {
      o = o || {};
      const mesh = null, par = o.group || this.curGroup || this.scene; // drawn as part of a batch until it is hit (see _batch)
      const hw = (gb.maxx - gb.minx) / 2, hd = (gb.maxz - gb.minz) / 2, cx = x + (gb.maxx + gb.minx) / 2, cz = z + (gb.maxz + gb.minz) / 2;
      const h = o.ch || gb.maxy, vol = hw * 2 * hd * 2 * h * (o.fill || 0.6);
      const b = {
        mesh, x: cx, z: cz, hw, hd, h, top: gb.maxy, vol, hp: 1 + vol / 50000, alive: true, scorched: false,
        ox0: x, oy0: y, oz0: z, par, bm: null, rg: null, value: Math.max(1500, Math.round(vol * 0.5 * (o.mult || 1) / 100) * 100), name: o.name || null, airport: !!o.airport, kind: o.kind || 'bld', landmark: !!o.landmark
      };
      if (o.hp) b.hp = o.hp; if (o.value) b.value = o.value;
      b.maxHp = b.hp;
      this.buildings.push(b);
      (this._pend || (this._pend = [])).push({ b, gb }); if (this._batched) this._batch();
      if (!b.airport) this.targetCount++;
      const c0x = Math.floor((cx - hw) / 250), c1x = Math.floor((cx + hw) / 250), c0z = Math.floor((cz - hd) / 250), c1z = Math.floor((cz + hd) / 250);
      for (let ix = c0x; ix <= c1x; ix++) for (let iz = c0z; iz <= c1z; iz++) {
        const k = ix + ',' + iz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(b);
      }
      return b;
    }

    // Buildings are merged into one mesh per 700 m cell (two, in fact: the bulk, and a layer of small parts that is only
    // drawn up close), so a city costs a few dozen draw calls instead of thousands. A building keeps its vertex range and is
    // lifted out into a mesh of its own the moment it has to move.
    _batch() {
      const pend = this._pend || []; this._pend = []; this._batched = true; if (!pend.length) return;
      const CS = 700, groups = new Map(); this.fineBatches = this.fineBatches || [];
      pend.forEach((e) => { const k = e.b.par.uuid + '|' + Math.floor(e.b.ox0 / CS) + ',' + Math.floor(e.b.oz0 / CS); let a = groups.get(k); if (!a) groups.set(k, a = []); a.push(e); });
      groups.forEach((list) => {
        let cx = 0, cz = 0; list.forEach((e) => { cx += e.b.ox0; cz += e.b.oz0; }); cx = Math.round(cx / list.length); cz = Math.round(cz / list.length);
        const mk = (k) => {
          const src = (gb) => (k === 1 ? gb.F : k === 2 ? gb.M : gb); let nv = 0; list.forEach((e) => { nv += src(e.gb).p.length / 3; }); if (!nv) return null;
          const P = new Float32Array(nv * 3), Nn = new Int8Array(nv * 3), Cc = new Uint16Array(nv * 3), U = new Float32Array(nv * 2), Fc = new Float32Array(nv * 4); let o = 0;
          list.forEach((e) => {
            const a = src(e.gb), n = a.p.length / 3, b = e.b, dx = b.ox0 - cx, dz = b.oz0 - cz;
            (b.rg || (b.rg = [null, null, null]))[k] = [o, n];
            for (let i = 0; i < n; i++) {
              const j = (o + i) * 3;
              P[j] = a.p[i * 3] + dx; P[j + 1] = a.p[i * 3 + 1] + b.oy0; P[j + 2] = a.p[i * 3 + 2] + dz;
              Nn[j] = Math.round(a.n[i * 3] * 127); Nn[j + 1] = Math.round(a.n[i * 3 + 1] * 127); Nn[j + 2] = Math.round(a.n[i * 3 + 2] * 127);
              Cc[j] = Math.min(65535, a.c[i * 3] * 65535); Cc[j + 1] = Math.min(65535, a.c[i * 3 + 1] * 65535); Cc[j + 2] = Math.min(65535, a.c[i * 3 + 2] * 65535);
            }
            U.set(a.u, o * 2); Fc.set(a.f, o * 4); o += n;
          });
          const g = new T.BufferGeometry();
          g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(Nn, 3, true)); g.setAttribute('color', new T.BufferAttribute(Cc, 3, true));
          g.setAttribute('fuv', new T.BufferAttribute(U, 2)); g.setAttribute('facade', new T.BufferAttribute(Fc, 4)); g.computeBoundingSphere();
          const m = new T.Mesh(g, this.cityMat); m.position.set(cx, 0, cz); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); list[0].b.par.add(m);
          return m;
        };
        const bm = [mk(0), mk(1), mk(2)];
        list.forEach((e) => { e.b.bm = bm; e.b.bx = cx; e.b.bz = cz; });
        [1, 2].forEach((k) => { if (bm[k]) { const bs = bm[k].geometry.boundingSphere; this.fineBatches.push({ m: bm[k], x: cx + bs.center.x, y: bs.center.y, z: cz + bs.center.z, r: bs.radius, far: k === 1 ? 4200 : 10000 }); } });
      });
    }
    // lift a building out of its batch into a mesh of its own, so it can be moved
    _detach(b) {
      if (b.mesh) return b.mesh;
      const g = new T.BufferGeometry(), parts = b.bm ? [0, 1, 2].filter((k) => b.bm[k] && b.rg[k] && b.rg[k][1] > 0) : [];
      if (parts.length) {
        let total = 0; parts.forEach((k) => { total += b.rg[k][1]; });
        ['position', 'normal', 'color', 'fuv', 'facade'].forEach((nm) => {
          const a0 = b.bm[parts[0]].geometry.attributes[nm], sz = a0.itemSize, arr = new a0.array.constructor(total * sz); let o = 0;
          parts.forEach((k) => { const a = b.bm[k].geometry.attributes[nm], s0 = b.rg[k][0], n = b.rg[k][1]; arr.set(a.array.subarray(s0 * sz, (s0 + n) * sz), o); o += n * sz; });
          g.setAttribute(nm, new T.BufferAttribute(arr, sz, a0.normalized));
        });
        const pa = g.attributes.position.array, dx = b.bx - b.ox0, dz = b.bz - b.oz0;
        for (let i = 0; i < pa.length; i += 3) { pa[i] += dx; pa[i + 1] -= b.oy0; pa[i + 2] += dz; }
        parts.forEach((k) => { const a = b.bm[k].geometry.attributes.position, s0 = b.rg[k][0] * 3, n = b.rg[k][1] * 3; a.array.fill(0, s0, s0 + n); a.addUpdateRange(s0, n); a.needsUpdate = true; });
      } else g.setAttribute('position', new T.BufferAttribute(new Float32Array(9), 3));
      g.computeBoundingSphere();
      const m = new T.Mesh(g, this.cityMat); m.position.set(b.ox0, b.oy0, b.oz0); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      (b.par || this.scene).add(m); b.mesh = m; b.bm = null;
      return m;
    }

    forNear(x, z, r, fn) {
      const c0x = Math.floor((x - r) / 250), c1x = Math.floor((x + r) / 250), c0z = Math.floor((z - r) / 250), c1z = Math.floor((z + r) / 250);
      this._stamp = (this._stamp || 0) + 1;
      for (let ix = c0x; ix <= c1x; ix++) for (let iz = c0z; iz <= c1z; iz++) {
        const a = this.grid.get(ix + ',' + iz); if (!a) continue;
        for (let i = 0; i < a.length; i++) { const b = a[i]; if (b._s === this._stamp) continue; b._s = this._stamp; fn(b); }
      }
    }

    collide(p, r) {
      let hit = null;
      this.forNear(p.x, p.z, r, (b) => {
        if (hit || !b.alive) return;
        if (Math.abs(p.x - b.x) < b.hw + r && Math.abs(p.z - b.z) < b.hd + r && p.y < b.h + r) hit = b;
      });
      return hit;
    }

    nearestClearance(p) {
      let best = 1e9;
      this.forNear(p.x, p.z, 120, (b) => {
        if (!b.alive) return;
        const dx = Math.max(Math.abs(p.x - b.x) - b.hw, 0), dz = Math.max(Math.abs(p.z - b.z) - b.hd, 0), dy = Math.max(p.y - b.h, 0);
        const d = Math.hypot(dx, dz, dy); if (d < best) best = d;
      });
      return best;
    }

    // apply blast; returns stats. delayFn(dist) -> seconds before collapse starts
    blast(p, radius, power, delayFn, noTopple) {
      const out = { money: 0, destroyed: 0, damaged: 0, names: [], penalty: 0 };
      this.forNear(p.x, p.z, radius + 200, (b) => {
        if (!b.alive) return;
        const dx = Math.max(Math.abs(p.x - b.x) - b.hw, 0), dz = Math.max(Math.abs(p.z - b.z) - b.hd, 0), dy = Math.max(p.y - b.h, 0);
        const d = Math.hypot(dx, dz, dy);
        if (d > radius) return;
        const f = 1 - d / radius;
        b.hp -= power * 4 * f * f;
        if (b.hp <= 0) {
          this.destroy(b, delayFn ? delayFn(d) : Math.random() * 0.4, power > 100 || noTopple ? null : p);
          if (b.airport) out.penalty += 20000; else { out.money += b.value; out.destroyed++; if (b.name) out.names.push(b.name); }
        } else {
          if (!b.scorched) { this.scorch(b); if (!b.airport) { out.money += Math.round(b.value * 0.1); out.damaged++; } }
        }
      });
      return out;
    }

    scorch(b) {
      b.scorched = true;
      if (b.mesh) { const col = b.mesh.geometry.attributes.color; if (col) { const a = col.array; for (let i = 0; i < a.length; i++) a[i] *= 0.42; col.needsUpdate = true; } }
      else if (b.bm) [0, 1, 2].forEach((k) => { // darken its vertices inside the batch
        if (!b.bm[k] || !b.rg[k] || !b.rg[k][1]) return; const col = b.bm[k].geometry.attributes.color, a = col.array, s0 = b.rg[k][0] * 3, n = b.rg[k][1] * 3;
        for (let i = s0; i < s0 + n; i++) a[i] *= 0.42; col.addUpdateRange(s0, n); col.needsUpdate = true; });
      if (G.fx) G.fx.addEmitter({ x: b.x, y: b.top * 0.7, z: b.z, size: Math.min(30, 8 + b.hw * 0.4), life: 50, fire: 12 });
    }

    // from: blast position; tall slender buildings hit off-centre may topple away from it
    destroy(b, delay, from) {
      if (!b.alive) return;
      b.alive = false; this._detach(b);
      if (!b.airport) this.destroyedCount++;
      if (b.kind === 'sam' && b.sam) b.sam.alive = false;
      const c = { b, t: -delay, dust: 0, deb: 0, mode: 'pancake' };
      const wide = Math.max(b.hw, b.hd) * 2;
      if (from && b.top > 55 && b.top / wide > 1.5 && Math.random() < 0.55) {
        let dx = b.x - from.x, dz = b.z - from.z; const l = Math.hypot(dx, dz);
        if (l < 2) { const a = Math.random() * 6.283; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; }
        c.mode = 'topple'; c.dx = dx; c.dz = dz; c.th = 0.04; c.om = 0.05;
        const sup = Math.abs(dx) * b.hw + Math.abs(dz) * b.hd;
        c.px = b.x + dx * sup; c.pz = b.z + dz * sup;
      } else c.dur = clamp(Math.sqrt(2 * b.top / 5.2), 1.3, 11.5); // resisted free fall
      this.collapsing.push(c);
      this._mapKill(b);
    }

    update(dt, cam) {
      const fx = G.fx;
      if (this.seaU) this.seaU.time.value += dt;
      // level of detail: lodK is how many screen pixels a metre covers relative to a 1080p screen at the normal field of view,
      // so every cut-off below sits where the object has shrunk to well under a pixel, whatever the resolution or zoom
      const lod = clamp(this.lodK || 1, 0.75, 4), full = this.cullDist || 46000;
      if (cam && this.treeChunks) { const td = full * 0.55 + 9000, y2 = cam.y * cam.y; for (let i = 0; i < this.treeChunks.length; i++) { const t = this.treeChunks[i], dx = cam.x - t.x, dz = cam.z - t.z;
        if (t.far) { const lim = Math.min(t.far * lod, full) + t.pad; t.im.visible = dx * dx + dz * dz + y2 < lim * lim; } else t.im.visible = Math.abs(dx) < td && Math.abs(dz) < td && cam.y < 60000; } }
      if (cam && this.fineBatches) { for (let i = 0; i < this.fineBatches.length; i++) { const t = this.fineBatches[i], dx = cam.x - t.x, dy = cam.y - t.y, dz = cam.z - t.z, lim = t.far * lod + t.r; t.m.visible = dx * dx + dy * dy + dz * dz < lim * lim; } }
      if (this.spinners) for (let i = 0; i < this.spinners.length; i++) this.spinners[i].m.rotation.y += this.spinners[i].sp * dt;
      if (this.rotors) for (let i = 0; i < this.rotors.length; i++) this.rotors[i].m.rotation.z += this.rotors[i].sp * dt;
      if (cam) for (let i = 0; i < this.cityGroups.length; i++) { const g = this.cityGroups[i]; g.group.visible = Math.hypot(cam.x - g.x, cam.z - g.z) < (this.cullDist || 46000) + g.r; }
      for (let i = this.collapsing.length - 1; i >= 0; i--) {
        const c = this.collapsing[i], b = c.b, m = b.mesh;
        c.t += dt;
        if (c.t < 0) continue;
        if (!c.started) { c.started = true; m.matrixAutoUpdate = true; if (fx) { fx.collapseStart(b); fx.debris(b.x, Math.min(b.top * 0.6, 60), b.z, 6, 14, clamp(b.hw * 0.12, 1.2, 4)); } }
        let done = false;
        c.dust -= dt; c.deb -= dt;
        if (c.mode === 'topple') {
          c.om += 1.5 * 9.81 / b.top * Math.sin(c.th) * dt * 1.5; c.th += c.om * dt;
          const th = Math.min(c.th, 1.53), sink = b.top * 0.12 * (th / 1.53) * (th / 1.53);
          _ax.set(c.dz, 0, -c.dx); _q.setFromAxisAngle(_ax, th);
          _v.set(b.ox0 - c.px, 0, b.oz0 - c.pz).applyQuaternion(_q);
          m.position.set(c.px + _v.x, _v.y - sink, c.pz + _v.z); m.quaternion.copy(_q);
          if (c.dust <= 0 && fx) { c.dust = 0.15; fx.collapseDust(b, 0.2); }
          if (c.deb <= 0 && fx && th > 0.3) { c.deb = 0.25; const s = Math.sin(th) * b.top * Math.random(); fx.debris(c.px + c.dx * s, Math.cos(th) * b.top * 0.6, c.pz + c.dz * s, 2, 8, clamp(b.hw * 0.1, 1, 3)); }
          if (c.th >= 1.53) {
            done = true;
            const out = { money: 0, destroyed: 0, damaged: 0, names: [], penalty: 0 };
            for (let sdist = b.hw + 25; sdist < b.top; sdist += 45) {
              const r = this.blast({ x: c.px + c.dx * sdist, y: 4, z: c.pz + c.dz * sdist }, 32, 1.1, null, true);
              out.money += r.money; out.destroyed += r.destroyed; out.damaged += r.damaged;
            }
            if (fx) fx.toppleImpact(c.px, c.pz, c.dx, c.dz, b.top, Math.max(b.hw, b.hd));
            if (G.onCrush && out.money) G.onCrush(out);
            this._rubble(b, c);
          }
        } else {
          const k = c.t / c.dur;
          m.position.set(b.ox0 + Math.sin(c.t * 37) * 0.35, -b.top * k * k, b.oz0 + Math.cos(c.t * 29) * 0.35);
          m.rotation.z = (c.tilt || (c.tilt = (Math.random() - 0.5) * 0.14)) * k * k; m.rotation.x = (c.tilt2 || (c.tilt2 = (Math.random() - 0.5) * 0.1)) * k * k;
          if (c.dust <= 0 && fx) { c.dust = 0.1; fx.collapseDust(b, k); }
          if (c.deb <= 0 && fx && b.top > 25) { c.deb = 0.3; const a = Math.random() * 6.283; fx.debris(b.x + Math.cos(a) * b.hw, b.top * (1 - k * k) * Math.random(), b.z + Math.sin(a) * b.hd, 2, 9 + b.top * 0.03, clamp(b.hw * 0.1, 1, 3.2)); }
          if (k >= 1) { done = true; if (fx) fx.collapseEnd(b); this._rubble(b); }
        }
        if (done) {
          if (m.parent) m.parent.remove(m); m.geometry.dispose();
          if (fx) fx.addEmitter({ x: b.x, y: 3, z: b.z, size: clamp(10 + b.hw * 0.6, 12, 60), life: 70 + Math.random() * 60, fire: 25 });
          this.collapsing.splice(i, 1);
        }
      }
    }

    _rubble(b, c) {
      if (!this.rubbleGeo) {
        const g = new T.IcosahedronGeometry(1, 2), p = g.attributes.position, r = G.rng(5);
        for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.5; p.setXYZ(i, p.getX(i) * k, Math.max(0, p.getY(i)) * (0.4 + r() * 1.2), p.getZ(i) * k); }
        g.computeVertexNormals(); this.rubbleGeo = g;
        this.rubbleMat = new T.MeshStandardMaterial({ color: 0x3a3632, roughness: 1, flatShading: true });
      }
      const m = new T.Mesh(this.rubbleGeo, this.rubbleMat);
      if (c) { // toppled: a long ridge of rubble where the tower fell
        m.position.set(c.px + c.dx * b.top * 0.48, 0, c.pz + c.dz * b.top * 0.48);
        m.scale.set(b.top * 0.55, clamp(Math.max(b.hw, b.hd) * 0.5, 3, 16), Math.max(b.hw, b.hd) * 1.3); m.rotation.y = -Math.atan2(c.dz, c.dx);
      } else { m.position.set(b.x, 0, b.z); m.scale.set(b.hw * 1.15, clamp(b.top * 0.07, 2, 14), b.hd * 1.15); m.rotation.y = Math.random() * 6.28; }
      m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = true;
      (b.par || this.scene).add(m);
    }

    addCityGroup(c, group) { this.scene.add(group); this.cityGroups.push({ x: c.x, z: c.z, r: c.r, group }); }

    // highway ribbons laid over the terrain between the cities (bridges where they cross water)
    _roads() {
      const rc = document.createElement('canvas'); rc.width = 64; rc.height = 128; const rx = rc.getContext('2d');
      rx.fillStyle = '#27292c'; rx.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 500; i++) { const v = 32 + Math.floor(Math.random() * 22); rx.fillStyle = `rgba(${v},${v},${v},0.5)`; rx.fillRect(Math.random() * 64, Math.random() * 128, 2, 3); }
      rx.fillStyle = '#e6e6e0'; rx.fillRect(4, 0, 2, 128); rx.fillRect(58, 0, 2, 128);
      rx.fillStyle = '#e0b020'; rx.fillRect(31, 0, 2, 128);
      rx.fillStyle = '#dcdcd6'; rx.fillRect(17, 0, 1.5, 60); rx.fillRect(45, 0, 1.5, 60);
      const tex = new T.CanvasTexture(rc); tex.wrapT = T.RepeatWrapping; tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 16;
      const pos = [], uv = [], idx = []; let vi = 0;
      (this.roadPaths || []).forEach((pts) => {
        let run = 0, prevOK = false;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
          let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const h = this.rawHeight(p.x, p.z), y = Math.max(h, SEA + 5) + (Math.abs(h) < 0.02 ? 0.45 : 2.4);
          const blocked = CITIES.some((c) => Math.abs(p.x - c.x) < c.r + 300 && Math.abs(p.z - c.z) < c.r + 300 && G.cityDn(c, p.x, p.z) < 1.03) || AIRPORTS.some((a) => Math.abs(p.x - a.x) < 820 && Math.abs(p.z - a.z) < 2000);
          if (i) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
          pos.push(p.x - dz * 13, y, p.z + dx * 13, p.x + dz * 13, y, p.z - dx * 13); uv.push(0, run / 40, 1, run / 40);
          if (i && !blocked && prevOK) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
          prevOK = !blocked; vi += 2;
        }
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: tex, roughness: 0.9, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m);
    }

    // forests as instanced clumps of trees, split into chunks so far-away ones can be skipped
    _trees() {
      const r = G.rng(99), pts = [];
      (this.parkTrees || []).forEach((p) => pts.push([p[0], p[1], p[2] * 0.75, 1, true]));
      for (let i = 0; i < 620000; i++) {
        const isl = i % 7 === 0, x = isl ? r.range(9000, 62000) : r.range(-82000, 7000), z = r.range(-82000, 64000);
        const fo = forestF(x, z);
        if (r() > fo * 0.96 + 0.01) continue;
        const h = this.rawHeight(x, z);
        if (h < 1.5 || h > 1500 || this.surfaceAt(x, z) !== 'grass' || desertF(x, z) > 0.4) continue;
        if (AIRPORTS.some((a) => (Math.abs(x - a.x) < 320 && Math.abs(z - a.z) < 3400) || (x > a.x && x < a.x + 760 && Math.abs(z - a.z) < 900)) || Math.hypot(x - PAD.x, z - PAD.z) < 1200) continue;
        pts.push([x, z, r.range(0.8, 1.45), h > 420 || vnoise(x / 6000 + 2, z / 6000) > 0.56 ? 0 : 1, false]);
      }
      const merge = (parts) => { // parts: [geometry, x, y, z, sx, sy, sz]
        const pos = [], nor = [], v = new T.Vector3();
        parts.forEach((p) => { const gg = p[0].index ? p[0].toNonIndexed() : p[0], a = gg.attributes.position, n = gg.attributes.normal;
          for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); pos.push(v.x * p[4] + p[1], v.y * p[5] + p[2], v.z * p[6] + p[3]); v.fromBufferAttribute(n, i); nor.push(v.x, v.y, v.z); } });
        const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return bg;
      };
      const cone = new T.ConeGeometry(1, 1, 5, 1, true), blob = new T.IcosahedronGeometry(1, 0), single = [[0, 0, 1, 1]];
      const lay = [[0, 0, 1, 1], [9, 5, 0.85, 0.9], [-7, 8, 1.1, 0.8], [-4, -9, 0.9, 1.05]];
      const geos = [
        merge(lay.map((o) => [cone, o[0], 10 * o[3], o[1], 4.6 * o[2], 20 * o[3], 4.6 * o[2]])),
        merge(lay.map((o) => [blob, o[0], 8 * o[3], o[1], 6.5 * o[2], 7.5 * o[3], 6.5 * o[2]])),
        merge(single.map((o) => [blob, 0, 7, 0, 5, 6.5, 5]))
      ];
      const mat = new T.MeshLambertMaterial({ flatShading: true });
      const chunks = new Map(), CH = 12000;
      pts.forEach((p) => { const ty = p[4] ? 2 : p[3], k = Math.floor(p[0] / CH) + ',' + Math.floor(p[1] / CH) + ',' + ty; let a = chunks.get(k); if (!a) chunks.set(k, a = []); a.push(p); });
      const d = new T.Object3D(), c = new T.Color(); this.treeChunks = [];
      chunks.forEach((list, key) => {
        const ty = +key.split(',')[2], im = new T.InstancedMesh(geos[ty], mat, list.length); let sx = 0, sz = 0;
        list.forEach((p, i) => {
          d.position.set(p[0], this.groundHeight(p[0], p[1]) - 0.5, p[1]); d.scale.set(p[2], p[2] * r.range(0.85, 1.25), p[2]); d.rotation.y = r() * 6.28; d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
          if (ty === 0) c.setHSL(0.33 + r() * 0.05, 0.42, 0.075 + r() * 0.05); else c.setHSL(0.25 + r() * 0.09, 0.5, 0.1 + r() * 0.07);
          im.setColorAt(i, c); sx += p[0]; sz += p[1];
        });
        im.computeBoundingSphere(); im.matrixAutoUpdate = false;
        this.scene.add(im); this.treeChunks.push({ im, x: sx / list.length, z: sz / list.length });
      });
      this.treeCount = pts.length;
      // farmsteads scattered through the fields
      const barn = merge([[new T.BoxGeometry(1, 1, 1), 0, 2.5, 0, 9, 5, 15], [new T.ConeGeometry(1, 1, 4, 1), 0, 6.6, 0, 7.6, 3.2, 12.6], [new T.BoxGeometry(1, 1, 1), 9, 2, 3, 6, 4, 7], [new T.CylinderGeometry(1, 1, 1, 8), -8, 5, -4, 2.2, 10, 2.2]]);
      const farms = [];
      for (let i = 0; i < 9000 && farms.length < 1400; i++) {
        const x = r.range(-70000, 6500), z = r.range(-60000, 20000);
        if (farmF(x, z, forestF(x, z)) < 0.6 || this.surfaceAt(x, z) !== 'grass' || this.rawHeight(x, z) < 1) continue;
        if (AIRPORTS.some((a) => Math.abs(x - a.x) < 800 && Math.abs(z - a.z) < 3600)) continue;
        farms.push([x, z]);
      }
      const fim = new T.InstancedMesh(barn, new T.MeshLambertMaterial(), farms.length), cols = [0x8a3a2c, 0xd8d2c0, 0x6e5a48, 0xa8a49a, 0x7a3428];
      farms.forEach((p, i) => { d.position.set(p[0], 0, p[1]); d.scale.setScalar(r.range(0.9, 1.5)); d.rotation.y = r() * 6.28; d.updateMatrix(); fim.setMatrixAt(i, d.matrix); fim.setColorAt(i, c.set(cols[i % cols.length])); });
      fim.frustumCulled = false; this.scene.add(fim);
    }

    // ---------- scenery that fills the open country: villages and pylons along the highways, sprawl round the cities,
    // olive and palm groves, irrigated fields, greenhouses, desert rocks and mesas, Bedouin camps, wind and solar farms.
    // All instanced and non-colliding, bucketed into chunks so distant ones are skipped.
    _scenery() {
      const r = G.rng(4242), d = new T.Object3D(), col = new T.Color(), v = new T.Vector3(), self = this;
      const merge = (parts) => { // parts: [geometry, x, y, z, sx, sy, sz, colour, ry]
        const pos = [], nor = [], cl = [], e = new T.Euler(), q = new T.Quaternion(), m = new T.Matrix4(), nm = new T.Matrix3(), c = new T.Color();
        parts.forEach((p) => {
          const gg = p[0].index ? p[0].toNonIndexed() : p[0], a = gg.attributes.position, n = gg.attributes.normal;
          m.compose(new T.Vector3(p[1], p[2], p[3]), q.setFromEuler(e.set(0, p[8] || 0, 0)), new T.Vector3(p[4], p[5], p[6])); nm.getNormalMatrix(m); c.set(p[7] === undefined ? 0xffffff : p[7]);
          for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); cl.push(c.r, c.g, c.b); }
        });
        const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(cl, 3)); return bg;
      };
      const mat = new T.MeshLambertMaterial({ vertexColors: true }), flatMat = new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const lists = new Map();
      // item: [x, y, z, sx, sy, sz, ry, colour]
      const put = (key, x, y, z, sx, sy, sz, ry, hex) => { let a = lists.get(key); if (!a) lists.set(key, a = []); a.push([x, y, z, sx, sy, sz, ry, hex]); };
      const nearAp = (x, z, pad) => AIRPORTS.some((a) => Math.abs(x - a.x) < 900 + (pad || 0) && Math.abs(z - a.z) < 3700 + (pad || 0)) || Math.hypot(x - PAD.x, z - PAD.z) < 1500;
      const ok = (x, z, flat) => {
        const h = self.rawHeight(x, z); if (h < -0.2 || h > 1400) return -1;
        if (self.surfaceAt(x, z) !== 'grass' || nearAp(x, z)) return -1;
        if (flat && (Math.abs(self.rawHeight(x + 30, z) - h) > flat || Math.abs(self.rawHeight(x, z + 30) - h) > flat)) return -1;
        return h;
      };
      const B = new T.BoxGeometry(1, 1, 1), CY = new T.CylinderGeometry(1, 1, 1, 8), CN4 = new T.ConeGeometry(1, 1, 4, 1), CN = new T.ConeGeometry(1, 1, 8, 1), ICO = new T.IcosahedronGeometry(1, 0), SPH = new T.SphereGeometry(1, 8, 6);
      const HC = new T.CylinderGeometry(1, 1, 1, 10, 1, false, Math.PI / 2, Math.PI); HC.rotateX(Math.PI / 2);
      const TAP = new T.CylinderGeometry(0.68, 1, 1, 7), TRK = new T.CylinderGeometry(1, 1, 1, 5, 1, true); // trunks: five open sides
      const DISC = new T.CircleGeometry(1, 48); DISC.rotateX(-Math.PI / 2); const SEC_A = new T.CircleGeometry(1, 20, 0, Math.PI * 0.8); SEC_A.rotateX(-Math.PI / 2); const SEC_B = new T.CircleGeometry(1, 28, Math.PI * 0.8, Math.PI * 1.2); SEC_B.rotateX(-Math.PI / 2);
      const FY = 0.35; // every flat piece lies at one height: they never overlap, so nothing can flicker
      const PLN = new T.PlaneGeometry(1, 1); PLN.rotateX(-Math.PI / 2);
      const geos = {
        flatHouse: merge([[B, 0, 3, 0, 11, 6, 9, 0xffffff], [B, 0, 6.4, -4.3, 11, 0.8, 0.4, 0xffffff], [B, 0, 6.4, 4.3, 11, 0.8, 0.4, 0xffffff], [B, 2.5, 7.2, -1, 3, 2.4, 3.4, 0xf2ecdc], [CY, -3, 7, 2, 0.8, 1.6, 0.8, 0xe8e8e4], [B, 0, 1.6, 4.6, 2, 3.2, 0.2, 0x4a3a2c], [B, 7.5, 1.5, 1, 4, 3, 5, 0xeee6d2]]),
        flatHouse2: merge([[B, 0, 4.8, 0, 12, 9.6, 12, 0xffffff], [B, 0, 10, 0, 12.4, 0.8, 12.4, 0xe2d8c2], [B, -3, 10.9, -3, 3.2, 2.5, 3.6, 0xf2ecdc], [CY, 3, 11.2, 3, 0.85, 1.6, 0.85, 0xe8e8e4], [CY, 1, 11.2, 3, 0.85, 1.6, 0.85, 0x2c2c2c], [B, 0, 5, 6.5, 6, 1, 1.2, 0xd8ceb8]]),
        gableHouse: merge([[B, 0, 2.6, 0, 9, 5.2, 12, 0xffffff], [CN4, 0, 6.9, 0, 7.4, 3.4, 9.8, 0x8a4434, Math.PI / 4], [B, 3, 7, 3, 0.9, 3, 0.9, 0x6e3b30], [B, 7, 1.6, -2, 5, 3.2, 6, 0xd8d2c4]]),
        minaret: merge([[B, 0, 3.5, 0, 9, 7, 9, 0xf2ecdc], [SPH, 0, 7, 0, 3.2, 3, 3.2, 0x4f8f6a], [B, 6.5, 3, -3, 3, 6, 3, 0xf2ecdc], [CY, 6.5, 14, -3, 1.1, 16, 1.1, 0xf2ecdc], [CY, 6.5, 19, -3, 1.9, 0.7, 1.9, 0xe6dcc6], [CN, 6.5, 24.5, -3, 1.3, 5, 1.3, 0x4f8f6a]]),
        steeple: merge([[B, 0, 4, 0, 9, 8, 16, 0xd8d2c4], [CN4, 0, 10.5, 0, 7.5, 5, 12.5, 0x5c3a32, Math.PI / 4], [B, 0, 9, -10, 5, 18, 5, 0xd8d2c4], [CN4, 0, 23, -10, 4, 10, 4, 0x3c4a44, Math.PI / 4]]),
        waterTower: merge([[CY, 0, 9, 0, 0.9, 18, 0.9, 0xb8b8b4], [CY, 0, 20, 0, 4.2, 5, 4.2, 0xe8e8e4], [CN, 0, 23.6, 0, 4.4, 2.2, 4.4, 0xcfcfc8]]),
        pylon: merge([[CN4, 0, 17, 0, 3.4, 34, 3.4, 0x9aa0a6, Math.PI / 4], [B, 0, 27, 0, 16, 0.5, 0.5, 0x9aa0a6], [B, 0, 22, 0, 12, 0.5, 0.5, 0x9aa0a6], [B, 0, 32, 0, 9, 0.5, 0.5, 0x9aa0a6]]),
        rock: merge([[ICO, 0, 0.35, 0, 1, 0.62, 0.9, 0xffffff]]),
        mesa: merge([[TAP, 0, 0.5, 0, 1, 1, 1, 0xffffff], [TAP, 0.15, 0.3, -0.1, 1.45, 0.6, 1.35, 0xe6d2c2, 0.6], [TAP, -0.2, 1.1, 0.15, 0.5, 0.35, 0.45, 0xf0e0d0, 1.3], [ICO, -0.9, 0.2, 0.7, 0.55, 0.45, 0.6, 0xdcc6b4], [ICO, 1.0, 0.15, -0.6, 0.5, 0.35, 0.5, 0xe8d4c4]]),
        olive: merge([[ICO, 0, 2.8, 0, 3, 2.3, 3, 0xffffff], [TRK, 0, 0.8, 0, 0.3, 1.6, 0.3, 0x6a5238]]),
        palm: merge([[TRK, 0, 4.5, 0, 0.32, 9, 0.32, 0x8a7250], [ICO, 0, 9.4, 0, 3.4, 1.3, 3.4, 0x3f6a2c], [ICO, 0, 8.6, 0, 2.2, 1.6, 2.2, 0x4f7a34]]),
        greenhouse: merge([[HC, 0, 0, 0, 4, 3, 44, 0xffffff]]),
        tent: merge([[CN4, 0, 1.7, 0, 9, 3.4, 5, 0xffffff, Math.PI / 4], [B, 0, 0.5, 4.5, 8, 1, 0.2, 0xd8d0c0]]),
        solar: merge([[B, 0, 1.6, 0, 110, 0.15, 3.6, 0x1c2d52], [B, -40, 0.7, 0, 0.3, 1.4, 0.3, 0x8a8c8e], [B, 0, 0.7, 0, 0.3, 1.4, 0.3, 0x8a8c8e], [B, 40, 0.7, 0, 0.3, 1.4, 0.3, 0x8a8c8e]]),
        mast: merge([[CY, 0, 30, 0, 0.6, 20, 0.6, 0xc8102e], [CY, 0, 10, 0, 0.7, 20, 0.7, 0xf2f2f2], [CY, 0, 50, 0, 0.5, 20, 0.5, 0xf2f2f2], [B, 0, 1.5, 3, 4, 3, 4, 0xb8b8b4]]),
        turbine: merge([[CY, 0, 40, 0, 1.6, 80, 1.6, 0xf0f0ee], [B, 0, 81, 0.5, 3, 3, 8, 0xf0f0ee]]),
        boulder: null, disc: DISC, sectorA: SEC_A, sectorB: SEC_B, field: PLN
      };
      geos.boulder = geos.rock;
      const flatKeys = { disc: 1, sectorA: 1, sectorB: 1, field: 1 };
      [DISC, SEC_A, SEC_B, PLN].forEach((g) => g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)));
      const CREAM = [0xf2ecdc, 0xeae2cf, 0xf6f1e4, 0xe4dac4, 0xd9cdb2, 0xf8f4ea], TEMP = [0xe8e2d2, 0xd9c9a8, 0xc9d6dc, 0xe6d5c3, 0xdcc0a6, 0xf0ede6, 0xbfc9d6];
      this.villages = [];
      // a cluster of houses round a mosque or a church
      const village = (cx, cz, n, rad) => {
        const des = desertF(cx, cz) > 0.5; let made = 0;
        for (let i = 0; i < n; i++) {
          const a = r() * 6.283, rr = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, h = ok(x, z, 2.5); if (h < 0) continue;
          if (i === 0) put(des ? 'minaret' : 'steeple', x, h, z, 1, 1, 1, r() * 6.28, des ? r.pick(CREAM) : r.pick(TEMP));
          else if (i === 1 && n > 9) put('waterTower', x, h, z, 1, 1, 1, 0, 0xffffff);
          else { const k = des ? (r.chance(0.35) ? 'flatHouse2' : 'flatHouse') : 'gableHouse', s = r.range(0.85, 1.25); put(k, x, h, z, s, s, s, Math.round(r() * 4) * 1.5708 + r.range(-0.2, 0.2), des ? r.pick(CREAM) : r.pick(TEMP)); }
          made++;
        }
        if (made > 3) this.villages.push([cx, cz]);
      };
      // along the highways: a village every few kilometres and a line of pylons
      (this.roadPaths || []).forEach((pts) => {
        let since = 900 + r() * 900, gap = 1500 + r() * 1500;
        for (let i = 1; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1]; let dx = q.x - p.x, dz = q.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; since += l;
          if (i % 4 === 0) { const x = p.x - dz * 58, z = p.z + dx * 58, h = ok(x, z); if (h >= 0) put('pylon', x, h, z, 1, 1, 1, Math.atan2(dx, dz), 0xffffff); }
          if (since > gap) {
            since = 0; gap = 1500 + r() * 1800; const sd = r.chance(0.5) ? 1 : -1, off = r.range(170, 360);
            village(p.x - dz * off * sd, p.z + dx * off * sd, r.int(7, 18), r.range(110, 210));
          }
        }
      });
      // loose houses thinning out beyond every city's edge
      CITIES.forEach((c) => {
        const n = c.town ? 220 : 800, des = desertF(c.x, c.z) > 0.5;
        for (let i = 0; i < n; i++) {
          const p = G.cityEdge(c, r() * 6.283, 150 + r() * r() * 2600), h = ok(p[0], p[1], 2.5); if (h < 0) continue;
          const k = des ? (r.chance(0.4) ? 'flatHouse2' : 'flatHouse') : 'gableHouse', s = r.range(0.9, 1.3);
          put(k, p[0], h, p[1], s, s, s, Math.round(r() * 4) * 1.5708 + r.range(-0.15, 0.15), des ? r.pick(CREAM) : r.pick(TEMP));
        }
      });
      // hamlets away from the roads
      for (let i = 0; i < 1500; i++) { const x = r.range(-80000, 6500), z = r.range(-60000, 64000); if (ok(x, z, 3) >= 0 && !CITIES.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 900)) village(x, z, r.int(5, 11), r.range(80, 150)); }
      // desert rocks and boulders
      for (let i = 0; i < 70000; i++) {
        const x = r.range(-82000, 7000), z = r.range(12000, 66000); if (desertF(x, z) < 0.5 || r() > 0.45 + flatMask(x, z)) continue;
        const h = ok(x, z); if (h < 0) continue; const s = r.range(2, 9) * (r.chance(0.08) ? 3 : 1);
        put(s > 12 ? 'boulder' : 'rock', x, h - s * 0.15, z, s * r.range(0.8, 1.4), s * r.range(0.7, 1.5), s * r.range(0.8, 1.4), r() * 6.28, r.pick([0xb89a70, 0xa8845c, 0xc4a57c, 0x9a7654, 0xb08060]));
      }
      const jordan = (n) => CITIES.find((c) => c.name === n);
      // sandstone mesas ring Petra, standing in for the mountains the valley is cut into
      { const c = jordan('Petra');
        for (let i = 0; i < 150; i++) {
          const a = r() * 6.283, rr = r.range(1500, 7500), x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
          if (x > c.x - 3900 && x < c.x - 950 && z > c.z - 1500 && z < c.z + 650) continue;
          const h = ok(x, z); if (h < 0 || this.roadPaths.some((pp) => pp.some((p, k) => k % 3 === 0 && Math.abs(p.x - x) < 220 && Math.abs(p.z - z) < 220))) continue;
          const s = r.range(45, 150); put('mesa', x, h - 2, z, s, r.range(30, 95), s * r.range(0.7, 1.3), r() * 6.28, r.pick([0xc27a5c, 0xb86e52, 0xcc8a62, 0xa8644a, 0xd09070]));
        } }
      // olive groves on the plains of the north and round Madaba, date palms by the Dead Sea and the desert towns
      const grove = (cx, cz, key, nx, nz, sp, hexes) => {
        if (ok(cx, cz, 2) < 0 || ok(cx + nx * sp, cz + nz * sp, 2) < 0) return;
        const ry = r() * 0.6, ca = Math.cos(ry), sa = Math.sin(ry);
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const lx = a * sp + r.range(-1.5, 1.5), lz = b * sp + r.range(-1.5, 1.5), x = cx + lx * ca - lz * sa, z = cz + lx * sa + lz * ca, h = self.rawHeight(x, z); if (h < -0.2 || self.surfaceAt(x, z) !== 'grass') continue;
          const s = r.range(0.75, 1.2); put(key, x, h, z, s, s, s, r() * 6.28, r.pick(hexes));
        }
      };
      ['Irbid', 'Jerash', 'Madaba', 'Amman', 'Zarqa'].forEach((n, k) => { const c = jordan(n); for (let i = 0; i < (k < 3 ? 80 : 45); i++) { const p = G.cityEdge(c, r() * 6.283, r.range(350, 3600)); grove(p[0], p[1], 'olive', r.int(6, 10), r.int(6, 10), 13, [0x5a6b3a, 0x66754a, 0x4f6034, 0x6f7d50]); } });
      CITIES.forEach((c) => { if (desertF(c.x, c.z) < 0.5) return; for (let i = 0; i < 34; i++) { const p = G.cityEdge(c, r() * 6.283, r.range(250, 3000)); grove(p[0], p[1], 'palm', r.int(3, 6), r.int(3, 6), 11, [0xffffff, 0xe8f0e0, 0xd8e8d0]); } });
      [[-55600, 36000], [-55700, 39500], [-55900, 42300], [-56000, 34500]].forEach((p) => { for (let i = 0; i < 6; i++) grove(p[0] + r.range(-500, 500), p[1] + r.range(-800, 800), 'palm', 5, 5, 11, [0xffffff, 0xe0ecd8]); });
      // irrigated circles and field strips on the flat desert plains, plus plastic greenhouses
      const GREENS = [0x4f7a34, 0x5f8a3a, 0x3f6a2c, 0x7a9a48, 0x9a8a50, 0x6a5a3a];
      const flats = CITIES.filter((c) => desertF(c.x, c.z) > 0.5 && c.name !== 'Petra').map((c) => [c.x, c.z, c.r + 3100]).concat(AIRPORTS.filter((a) => desertF(a.x, a.z) > 0.5).map((a) => [a.x, a.z, 5600]));
      // every flat piece claims its rectangle, so no two ever overlap (overlapping coplanar pieces flicker) and none covers a highway
      const claims = new Map(), CL = 500, roadCells = new Set();
      (this.roadPaths || []).forEach((pts) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 20); for (let k = 0; k <= n; k++) roadCells.add(Math.floor((a.x + (b.x - a.x) * k / n) / 40) + ',' + Math.floor((a.z + (b.z - a.z) * k / n) / 40)); } });
      const free = (x0, x1, z0, z1) => {
        for (let ix = Math.floor(x0 / CL); ix <= Math.floor(x1 / CL); ix++) for (let iz = Math.floor(z0 / CL); iz <= Math.floor(z1 / CL); iz++) { const a = claims.get(ix + ',' + iz); if (a) for (let i = 0; i < a.length; i++) { const c = a[i]; if (x0 < c[1] && x1 > c[0] && z0 < c[3] && z1 > c[2]) return false; } }
        for (let ix = Math.floor((x0 - 30) / 40); ix <= Math.floor((x1 + 30) / 40); ix++) for (let iz = Math.floor((z0 - 30) / 40); iz <= Math.floor((z1 + 30) / 40); iz++) if (roadCells.has(ix + ',' + iz)) return false;
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const x = x0 + (x1 - x0) * i / 4, z = z0 + (z1 - z0) * j / 4; if (flatMask(x, z) > 0 || ok(x, z) < 0) return false; }
        return true;
      };
      const claim = (x0, x1, z0, z1) => { const c = [x0, x1, z0, z1]; for (let ix = Math.floor(x0 / CL); ix <= Math.floor(x1 / CL); ix++) for (let iz = Math.floor(z0 / CL); iz <= Math.floor(z1 / CL); iz++) { const k = ix + ',' + iz; let a = claims.get(k); if (!a) claims.set(k, a = []); a.push(c); } };
      const late = []; // things that stand beside the fields are placed after every field has claimed its ground
      for (let i = 0; i < 3000; i++) {
        const fz0 = flats[i % flats.length], fa = r() * 6.283, fr = Math.sqrt(r()) * fz0[2], x = fz0[0] + Math.cos(fa) * fr, z = fz0[1] + Math.sin(fa) * fr;
        if (desertF(x, z) < 0.6 || flatMask(x, z) > 0 || ok(x, z) < 0) continue;
        const t = r();
        if (t < 0.22) { const s = r.range(170, 360), g1 = r.pick(GREENS), g2 = r.pick(GREENS), split = r.chance(0.6), ry = r() * 6.28; if (!free(x - s - 12, x + s + 12, z - s - 12, z + s + 12)) continue;
          claim(x - s - 12, x + s + 12, z - s - 12, z + s + 12);
          if (split) { put('sectorA', x, FY, z, s, 1, s, ry, g2); put('sectorB', x, FY, z, s, 1, s, ry, g1); } else put('disc', x, FY, z, s, 1, s, 0, g1);
          late.push(['flatHouse', x + s + 22, z, 0, 0xe8e8e4]); }
        else if (t < 0.62) { const w = r.range(60, 150), l = r.range(120, 320), ry = Math.round(r() * 2) * 1.5708, n = r.int(1, 4), along = Math.abs(Math.sin(ry)) > 0.5; // along: the strip's long side runs east-west
          for (let k = 0; k < n; k++) { const fx = x + (along ? 0 : k * (w + 8)), fz = z + (along ? k * (w + 8) : 0), hx = (along ? l : w) / 2, hz = (along ? w : l) / 2, col = r.pick(GREENS);
            if (!free(fx - hx - 3, fx + hx + 3, fz - hz - 3, fz + hz + 3)) continue; claim(fx - hx - 3, fx + hx + 3, fz - hz - 3, fz + hz + 3); put('field', fx, FY, fz, w, 1, l, ry, col); } }
        else if (t < 0.75) { const ry = r() * 3.14, n = r.int(4, 10), cl = r.pick([0xf2f4f2, 0xe6ece8, 0xdfe6e0]); for (let k = 0; k < n; k++) late.push(['greenhouse', x + Math.cos(ry) * k * 9.5, z - Math.sin(ry) * k * 9.5, ry, cl, 26]); }
        else if (t < 0.8) { for (let k = 0; k < 3; k++) late.push(['tent', x + r.range(-25, 25), z + r.range(-25, 25), r() * 6.28, r.pick([0x2c2620, 0x3a3028, 0x4a3c30, 0xd8d0c0]), 8]); }
      }
      const clear = (x, z, pad) => { const a = claims.get(Math.floor(x / CL) + ',' + Math.floor(z / CL)); if (a) for (let i = 0; i < a.length; i++) { const c = a[i]; if (x > c[0] - pad && x < c[1] + pad && z > c[2] - pad && z < c[3] + pad) return false; } return true; };
      late.forEach((q) => { if (ok(q[1], q[2]) >= 0 && clear(q[1], q[2], q[5] || 6)) put(q[0], q[1], 0, q[2], q[0] === 'flatHouse' ? 0.8 : 1, q[0] === 'flatHouse' ? 0.8 : 1, q[0] === 'flatHouse' ? 0.8 : 1, q[3], q[4]); });
      // nothing else (rocks, houses, trees) may stand in a field
      lists.forEach((list, key) => { if (flatKeys[key]) return; let n = 0; for (let i = 0; i < list.length; i++) { const it = list[i]; if (clear(it[0], it[2], key === 'greenhouse' ? 26 : 4)) list[n++] = it; } list.length = n; });
      // solar farms outside the desert cities
      [['Zarqa', 2800, 0.3], ['Amman', 4600, 2.3], ['Petra', 2300, 1.2], ['Dubai', 5200, 3.6], ['Cairo', 4700, 5.2], ['Irbid', 3000, 0.9]].forEach((q) => {
        const c = jordan(q[0]), p = G.cityEdge(c, q[2], q[1]);
        for (let k = 0; k < 16; k++) for (let j = 0; j < 2; j++) { const x = p[0] + j * 124, z = p[1] + k * 7.5; if (ok(x, z, 1.5) >= 0 && ok(x + 55, z, 1.5) >= 0 && ok(x - 55, z, 1.5) >= 0) put('solar', x, self.rawHeight(x, z), z, 1, 1, 1, 0, 0xffffff); }
      });
      // radio masts on high ground
      for (let i = 0; i < 4000 && (lists.get('mast') || []).length < 70; i++) { const x = r.range(-80000, 6500), z = r.range(-60000, 64000), h = ok(x, z); if (h > 260 && h < 1300 && self.rawHeight(x + 400, z) < h && self.rawHeight(x - 400, z) < h && self.rawHeight(x, z + 400) < h && self.rawHeight(x, z - 400) < h) put('mast', x, h, z, 1, 1, 1, 0, 0xffffff); }
      // a wind farm on the ridge between Madaba and Petra; the rotors turn
      const blade = new T.BoxGeometry(1, 1, 1), rotorG = merge([0, 1, 2].map((k) => [blade, 0, 0, 0, 1, 1, 1, 0xf4f4f2]));
      { const pos = [], nor = [], pa = blade.toNonIndexed().attributes.position, na = blade.toNonIndexed().attributes.normal, m4 = new T.Matrix4(), q = new T.Quaternion();
        for (let k = 0; k < 3; k++) { m4.compose(new T.Vector3(0, 0, 0), q.setFromEuler(new T.Euler(0, 0, k * 2.0944)), new T.Vector3(1, 1, 1)); const m2 = new T.Matrix4().makeTranslation(0, 19, 0).scale(new T.Vector3(2.2, 38, 0.5)); m4.multiply(m2); const n3 = new T.Matrix3().getNormalMatrix(m4);
          for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m4); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z); } }
        rotorG.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); rotorG.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); rotorG.deleteAttribute('color'); }
      const rotMat = new T.MeshLambertMaterial({ color: 0xf4f4f2 }); this.rotors = [];
      for (let k = 0; k < 18; k++) {
        const x = -51800 + (k % 9) * 420 + (k > 8 ? 210 : 0), z = 45600 + (k > 8 ? 900 : 0) + Math.sin(k * 1.7) * 160, h = ok(x, z); if (h < 0) continue;
        put('turbine', x, h, z, 1, 1, 1, 0, 0xffffff);
        const rm = new T.Mesh(rotorG, rotMat); rm.position.set(x, h + 81, z + 5); rm.rotation.z = k * 0.7; this.scene.add(rm); this.rotors.push({ m: rm, sp: 1.1 + (k % 3) * 0.15, x, z });
      }
      // build the instanced meshes, split into chunks; small things get small chunks and a short draw distance (see update)
      const FAR = { rock: 6500, tent: 7000, olive: 9000, palm: 9000, pylon: 12000, greenhouse: 15000, flatHouse: 17000, flatHouse2: 17000, gableHouse: 17000, solar: 17000, waterTower: 20000, minaret: 22000, steeple: 22000 };
      lists.forEach((list, key) => {
        const buckets = new Map(), far = FAR[key] || 0, CH = far && far < 10000 ? 3000 : far ? 6000 : 8000;
        list.forEach((it) => { const k = Math.floor(it[0] / CH) + ',' + Math.floor(it[2] / CH); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(it); });
        buckets.forEach((items) => {
          const im = new T.InstancedMesh(geos[key], flatKeys[key] ? flatMat : mat, items.length); let sx = 0, sz = 0;
          items.forEach((it, i) => { d.position.set(it[0], it[1], it[2]); d.scale.set(it[3], it[4], it[5]); d.rotation.set(0, it[6], 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, col.set(it[7])); sx += it[0]; sz += it[2]; });
          im.computeBoundingSphere(); im.matrixAutoUpdate = false; if (!flatKeys[key]) im.castShadow = false; im.receiveShadow = !!flatKeys[key];
          this.scene.add(im); this.treeChunks.push({ im, x: sx / items.length, z: sz / items.length, far, pad: CH * 0.75 });
        });
      });
      this.sceneryCount = 0; lists.forEach((l) => { this.sceneryCount += l.length; });
    }

    // ---------- minimap
    _map() {
      const S = 2048, c = this.mapCanvas = document.createElement('canvas'); c.width = c.height = S;
      const x = this.mapCtx = c.getContext('2d');
      const SPAN = this.mapSpan = 128000; this.mapScale = S / SPAN; this.mapX0 = -74000; this.mapZ0 = -60000;
      const img = x.createImageData(384, 384);
      for (let j = 0; j < 384; j++) for (let i = 0; i < 384; i++) {
        const wx = this.mapX0 + (i + 0.5) / 384 * SPAN, wz = this.mapZ0 + (j + 0.5) / 384 * SPAN, h = this.rawHeight(wx, wz), k = (j * 384 + i) * 4;
        if (h < SEA) { img.data[k] = 16; img.data[k + 1] = 42; img.data[k + 2] = 66; }
        else { const v = clamp(h / 1500, 0, 1), ds = desertF(wx, wz); img.data[k] = 24 + v * 70 + ds * 62; img.data[k + 1] = 44 + v * 50 + ds * 22; img.data[k + 2] = 26 + v * 60 + ds * 10; }
        img.data[k + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = 384; tmp.getContext('2d').putImageData(img, 0, 0);
      x.imageSmoothingEnabled = true; x.drawImage(tmp, 0, 0, S, S);
      const mx = (wx) => (wx - this.mapX0) * this.mapScale, mz = (wz) => (wz - this.mapZ0) * this.mapScale;
      this.mx = mx; this.mz = mz;
      x.fillStyle = '#ffb13a'; x.fillRect(mx(PAD.x) - 2, mz(PAD.z) - 2, 4, 4);
      x.fillStyle = '#e8edf2'; x.fillRect(mx(CARRIER.x) - 1.5, mz(CARRIER.z - 166), 3, Math.max(5, 332 * this.mapScale));
      x.fillStyle = '#23262a';
      CITIES.forEach((t) => { x.beginPath(); for (let i = 0; i <= 72; i++) { const p = G.cityEdge(t, i / 72 * 6.2832, 120); if (i) x.lineTo(mx(p[0]), mz(p[1])); else x.moveTo(mx(p[0]), mz(p[1])); } x.fill(); });
      AIRPORTS.forEach((a) => {
        x.fillStyle = '#5a5f66'; x.fillRect(mx(a.x + 130), mz(a.z - 1750), 2, 3500 * this.mapScale); x.fillRect(mx(a.x + 160), mz(a.z - 480), 400 * this.mapScale, 960 * this.mapScale);
        x.fillStyle = '#c4cad0'; x.fillRect(mx(a.x - 30) - 1, mz(a.z - 1800), Math.max(3, 60 * this.mapScale), 3600 * this.mapScale);
      });
      x.fillStyle = '#8a8f96'; (this.villages || []).forEach((p) => x.fillRect(mx(p[0]) - 1, mz(p[1]) - 1, 2, 2));
      this.buildings.forEach((b) => {
        const t = clamp(b.h / 200, 0, 1);
        x.fillStyle = b.kind === 'sam' ? '#ff4040' : `rgb(${110 + t * 120},${120 + t * 110},${130 + t * 100})`;
        x.fillRect(mx(b.x - b.hw), mz(b.z - b.hd), Math.max(1.5, b.hw * 2 * this.mapScale), Math.max(1.5, b.hd * 2 * this.mapScale));
      });
    }
    _mapKill(b) {
      const x = this.mapCtx; if (!x) return;
      x.fillStyle = '#5a1c10';
      x.fillRect(this.mx(b.x - b.hw) - 0.5, this.mz(b.z - b.hd) - 0.5, Math.max(2.5, b.hw * 2 * this.mapScale + 1), Math.max(2.5, b.hd * 2 * this.mapScale + 1));
    }
  }
  G.World = World;
})();
