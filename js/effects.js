// Particles (smoke / fire), blast effects, shock rings, scorch marks, clouds.
(function () {
  'use strict';
  const T = THREE, clamp = G.clamp;

  function puffTexture(hard) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), r = G.rng(hard ? 11 : 4);
    for (let i = 0; i < 26; i++) {
      const px = 64 + (r() - 0.5) * 56, py = 64 + (r() - 0.5) * 56, rad = 14 + r() * 26;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    const g = x.createRadialGradient(64, 64, 30, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  const _tv = new T.Vector3();
  const VS = `#include <common>
    #include <logdepthbuf_pars_vertex>
    attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float scale;
    void main(){ vC = pcolor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
      gl_PointSize = min(size*scale/max(-mv.z,0.5), 1600.0);
      #include <logdepthbuf_vertex>
    }`;
  const FS = `#include <common>
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D map; varying vec4 vC;
    void main(){
      #include <logdepthbuf_fragment>
      vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a*t.a); if (gl_FragColor.a < 0.004) discard; }`;

  class Particles {
    constructor(n, additive, tex) {
      this.n = n; this.next = 0;
      this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
      this.life = new Float32Array(n); this.max = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
      this.base = new Float32Array(n * 4); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
      const g = this.geo = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('pcolor', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage)); g.setAttribute('size', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
      this.alive = 0;
      this.mat = new T.ShaderMaterial({ uniforms: { map: { value: tex }, scale: { value: 600 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending });
      this.additive = additive;
      this.mesh = new T.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 5;
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
      const i = this.next; this.next = (i + 1) % this.n; this.live = true;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
      this.drag[i] = drag || 0; this.grav[i] = grav || 0;
    }
    update(dt) {
      if (!this.live) return; // nothing has been spawned since the last particle died
      const p = this.pos, v = this.vel, c = this.col, b = this.base; let alive = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) { if (this.size[i] !== 0) this.size[i] = 0; continue; }
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.size[i] = 0; continue; }
        alive++;
        const k = 1 - this.life[i] / this.max[i], d = Math.exp(-this.drag[i] * dt), j = i * 3, q = i * 4;
        v[j] *= d; v[j + 1] = v[j + 1] * d - this.grav[i] * dt; v[j + 2] *= d;
        p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
        if (p[j + 1] < 0.3 && this.grav[i] > 0) { p[j + 1] = 0.3; v[j + 1] = 0; v[j] *= 0.5; v[j + 2] *= 0.5; }
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
        if (this.additive) { const f = (1 - k) * (1 - k); c[q] = b[q] * f; c[q + 1] = b[q + 1] * f * (1 - k * 0.6); c[q + 2] = b[q + 2] * f * (1 - k); c[q + 3] = b[q + 3] * Math.min(1, (1 - k) * 2); }
        else if (this.hold) { c[q] = b[q]; c[q + 1] = b[q + 1]; c[q + 2] = b[q + 2]; c[q + 3] = b[q + 3] * Math.min(1, k * 12) * Math.min(1, (1 - k) * 3.5); }
        else { c[q] = b[q]; c[q + 1] = b[q + 1]; c[q + 2] = b[q + 2]; c[q + 3] = b[q + 3] * Math.min(1, k * 10) * (1 - k) * (1 - k * 0.4); }
      }
      if (alive || this.alive) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.pcolor.needsUpdate = true; this.geo.attributes.size.needsUpdate = true; }
      this.mesh.visible = alive > 0; if (!alive && !this.alive) this.live = false; this.alive = alive;
    }
  }

  // rigid debris chunks: ballistic flight, ground bounce with energy loss, spin, then settle
  class Debris {
    constructor(scene, n) {
      this.n = n; this.next = 0; this.alive = 0;
      this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.r = new Float32Array(n * 3); this.w = new Float32Array(n * 3);
      this.s = new Float32Array(n * 3); this.life = new Float32Array(n);
      const mat = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05 });
      this.mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, n);
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.castShadow = false;
      const c = new T.Color(), d = new T.Object3D(); d.scale.set(0, 0, 0); d.updateMatrix();
      for (let i = 0; i < n; i++) { const g = 0.25 + Math.random() * 0.3; this.mesh.setColorAt(i, c.setRGB(g, g * 0.97, g * 0.92)); this.mesh.setMatrixAt(i, d.matrix); }
      this.d = d; this.mesh.visible = false; scene.add(this.mesh);
    }
    spawn(x, y, z, vx, vy, vz, size) {
      const i = this.next, j = i * 3; this.next = (i + 1) % this.n;
      this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
      this.r[j] = Math.random() * 6; this.r[j + 1] = Math.random() * 6; this.r[j + 2] = Math.random() * 6;
      this.w[j] = (Math.random() - 0.5) * 9; this.w[j + 1] = (Math.random() - 0.5) * 9; this.w[j + 2] = (Math.random() - 0.5) * 9;
      this.s[j] = size * (0.5 + Math.random()); this.s[j + 1] = size * (0.3 + Math.random() * 0.6); this.s[j + 2] = size * (0.5 + Math.random());
      this.life[i] = 16 + Math.random() * 10;
    }
    update(dt) {
      if (!this.alive && !this._dirty) { let any = false; for (let i = 0; i < this.n; i++) if (this.life[i] > 0) { any = true; break; } if (!any) { this.mesh.visible = false; return; } }
      const p = this.p, v = this.v, r = this.r, w = this.w, s = this.s, d = this.d; let alive = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) continue;
        const j = i * 3; this.life[i] -= dt;
        if (this.life[i] <= 0) { d.scale.set(0, 0, 0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); continue; }
        alive++;
        const rest = s[j + 1] * 0.5 + 0.3, moving = Math.abs(v[j]) + Math.abs(v[j + 1]) + Math.abs(v[j + 2]) > 0.4 || p[j + 1] > rest + 0.05;
        if (moving) {
          v[j + 1] -= 9.81 * dt; const dr = Math.exp(-0.08 * dt); v[j] *= dr; v[j + 2] *= dr;
          p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
          r[j] += w[j] * dt; r[j + 1] += w[j + 1] * dt; r[j + 2] += w[j + 2] * dt;
          if (p[j + 1] < rest) { // impact: lose energy, keep some bounce
            p[j + 1] = rest;
            if (v[j + 1] < -2) { v[j + 1] = -v[j + 1] * 0.28; v[j] *= 0.6; v[j + 2] *= 0.6; w[j] *= 0.5; w[j + 1] *= 0.5; w[j + 2] *= 0.5; }
            else { v[j + 1] = 0; v[j] *= 0.8; v[j + 2] *= 0.8; w[j] *= 0.7; w[j + 1] *= 0.7; w[j + 2] *= 0.7; }
          }
        }
        const k = Math.min(1, this.life[i] / 2);
        d.position.set(p[j], p[j + 1], p[j + 2]); d.rotation.set(r[j], r[j + 1], r[j + 2]); d.scale.set(s[j] * k, s[j + 1] * k, s[j + 2] * k); d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
      }
      this.alive = alive; this.mesh.visible = alive > 0; this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class FX {
    constructor(scene) {
      this.scene = scene;
      const tex = puffTexture();
      this.smoke = new Particles(7000, false, tex); this.fire = new Particles(3500, true, tex);
      this.mush = new Particles(3500, false, tex); this.mush.hold = true; this.mush.mesh.renderOrder = 5;
      scene.add(this.smoke.mesh, this.mush.mesh, this.fire.mesh);
      this.emitters = []; this.rings = []; this.balls = []; this.decals = []; this.shake = 0; this.flash = 0;
      this.ballGeo = new T.SphereGeometry(1, 24, 16);
      this.ringGeo = new T.RingGeometry(0.9, 1, 64); this.ringGeo.rotateX(-Math.PI / 2);
      this.decalGeo = new T.CircleGeometry(1, 24); this.decalGeo.rotateX(-Math.PI / 2);
      this.decalMat = new T.MeshBasicMaterial({ color: 0x0c0b0a, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      this.lights = [];
      for (let i = 0; i < 2; i++) { const l = new T.PointLight(0xffb060, 0, 0, 1.6); scene.add(l); this.lights.push(l); }
      this.chunks = new Debris(scene, 700); this.camPos = new T.Vector3();
      this._clouds(tex);
      this.wind = new T.Vector3(5, 0, 2);
    }

    _clouds(tex) {
      const r = G.rng(77), pos = [], col = [], size = [];
      for (let i = 0; i < 230; i++) {
        const cx = r.range(-75000, 50000), cz = r.range(-75000, 45000), cy = r.range(1700, 4200), n = r.int(5, 12), spread = r.range(300, 900);
        for (let k = 0; k < n; k++) {
          const yy = r.range(-0.2, 0.5);
          pos.push(cx + r.range(-1, 1) * spread, cy + yy * 260, cz + r.range(-1, 1) * spread * 0.7);
          const sh = 0.78 + yy * 0.35 + r() * 0.1; col.push(sh, sh, sh * 1.03, 0.55); size.push(r.range(500, 1100));
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('pcolor', new T.Float32BufferAttribute(col, 4)); g.setAttribute('size', new T.Float32BufferAttribute(size, 1));
      this.cloudMat = new T.ShaderMaterial({ uniforms: { map: { value: tex }, scale: { value: 600 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
      const m = new T.Points(g, this.cloudMat); m.frustumCulled = false; m.renderOrder = 4; this.scene.add(m);
    }

    setScale(h, fov) { const s = h / (2 * Math.tan(fov * Math.PI / 360)); this.smoke.mat.uniforms.scale.value = s; this.mush.mat.uniforms.scale.value = s; this.fire.mat.uniforms.scale.value = s; this.cloudMat.uniforms.scale.value = s; }

    trail(x, y, z, size, alpha, life, vx, vy, vz) { this.smoke.spawn(x, y, z, vx || 0, vy || 0, vz || 0, life, size, size * 4, 1, 1, 1, alpha, 0.3, 0); }
    darkTrail(x, y, z, size) { this.smoke.spawn(x, y, z, 0, 2, 0, 3.5, size, size * 5, 0.08, 0.08, 0.08, 0.6, 0.2, -1); }
    flame(x, y, z, size, vx, vy, vz) { this.fire.spawn(x, y, z, vx || 0, vy || 0, vz || 0, 0.5, size, size * 2, 1, 0.6, 0.2, 0.9, 1, 0); }

    addEmitter(e) {
      e.t = 0; e.acc = 0; this.emitters.push(e);
      if (this.emitters.length > 80) { const i = this.emitters.findIndex((x) => !x.mush); if (i >= 0) this.emitters.splice(i, 1); }
    }

    ring(p, maxR, speed, color, opacity) {
      const m = new T.Mesh(this.ringGeo, new T.MeshBasicMaterial({ color: color || 0xffffff, transparent: true, opacity: opacity || 0.5, depthWrite: false, side: T.DoubleSide }));
      m.position.set(p.x, Math.max(p.y, 1), p.z); this.scene.add(m); this.rings.push({ m, r: 2, maxR, speed, o: opacity || 0.5 });
    }
    decal(p, r) {
      const m = new T.Mesh(this.decalGeo, this.decalMat); m.position.set(p.x, 0.45, p.z); m.scale.set(r, 1, r); m.matrixAutoUpdate = false; m.updateMatrix(); this.scene.add(m);
      this.decals.push(m); if (this.decals.length > 160) this.scene.remove(this.decals.shift());
    }
    light(p, intensity, dur) {
      const l = this.lights[0].userData.t > this.lights[1].userData.t ? this.lights[1] : this.lights[0];
      l.position.set(p.x, p.y + 20, p.z); l.intensity = intensity; l.userData.t = dur; l.userData.d = dur; l.userData.i = intensity;
    }

    // conventional blast; R = damage radius
    explosion(p, R, camPos) {
      const s = R / 50, rs = Math.sqrt(s), f = this.fire, sm = this.smoke, y = Math.max(p.y, 1), rnd = Math.random;
      const ball = new T.Mesh(this.ballGeo, new T.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 1, fog: false, depthWrite: false }));
      ball.position.set(p.x, y + 3 * s, p.z); this.scene.add(ball); this.balls.push({ m: ball, t: 0, R: 17 * s, dur: 0.8 + 0.3 * s, rise: 8, grow: 0.16 });
      for (let i = 0; i < 26; i++) { // white-hot core burst
        const a = rnd() * 6.283, e = rnd() * 1.5, sp = (25 + rnd() * 45) * rs;
        f.spawn(p.x, y, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 0.3 + rnd() * 0.5, 7 * s, 30 * s, 1, 0.88, 0.6, 1, 3.5, 0);
      }
      for (let i = 0; i < 22; i++) { // rolling orange fire that rises
        const a = rnd() * 6.283, sp = rnd() * 14 * rs;
        f.spawn(p.x + Math.cos(a) * 5 * s, y + rnd() * 6 * s, p.z + Math.sin(a) * 5 * s, Math.cos(a) * sp, (8 + rnd() * 20) * rs, Math.sin(a) * sp, 0.9 + rnd() * 0.9, 10 * s, 36 * s, 1, 0.5, 0.14, 0.85, 1.4, -5);
      }
      for (let i = 0; i < 40; i++) { // sparks
        const a = rnd() * 6.283, sp = (15 + rnd() * 70) * rs;
        f.spawn(p.x, y, p.z, Math.cos(a) * sp, (10 + rnd() * 70) * rs, Math.sin(a) * sp, 1.2 + rnd() * 1.8, 1.4 * s, 0.5 * s, 1, 0.82, 0.45, 1, 0.25, 15);
      }
      for (let i = 0; i < 24; i++) { // debris chunks
        const a = rnd() * 6.283, sp = (10 + rnd() * 55) * rs, g = 0.05 + rnd() * 0.12;
        sm.spawn(p.x, y + 1, p.z, Math.cos(a) * sp, (18 + rnd() * 55) * rs, Math.sin(a) * sp, 2.4 + rnd() * 1.8, 2.4 * s, 1.3 * s, g, g * 0.9, g * 0.8, 1, 0.15, 17);
      }
      for (let i = 0; i < 30; i++) { // black smoke
        const a = rnd() * 6.283, sp = rnd() * 11 * s, g = 0.05 + rnd() * 0.1;
        sm.spawn(p.x + Math.cos(a) * 6 * s, y + rnd() * 10 * s, p.z + Math.sin(a) * 6 * s, Math.cos(a) * sp + 3, 6 + rnd() * 15 * rs, Math.sin(a) * sp, 7 + rnd() * 8, 12 * s, 62 * s, g, g, g, 0.85, 0.5, -0.7);
      }
      for (let i = 0; i < 24; i++) { // dust skirt along the ground
        const a = i / 24 * 6.283 + rnd() * 0.2, sp = (26 + rnd() * 14) * s;
        sm.spawn(p.x, 2, p.z, Math.cos(a) * sp, 1.5, Math.sin(a) * sp, 3 + rnd() * 2.5, 8 * s, 44 * s, 0.58, 0.52, 0.43, 0.5, 1.5, 0);
      }
      if (p.y < 60) this.debris(p.x, y + 2, p.z, Math.round(6 + 6 * s), 22 * rs, 0.9 * rs);
      this.ring(p, R * 1.8, 340, 0xffffff, 0.4);
      this.ring({ x: p.x, y: 2, z: p.z }, R * 0.9, 70, 0xb8a482, 0.5);
      if (p.y < 15) { this.decal(p, R * 0.42); this.addEmitter({ x: p.x, y: 2, z: p.z, size: 4 + 6 * s, life: 16 + 10 * s, fire: 4 + 3 * s }); }
      this.light(p, 4000 * s * s, 0.6);
      const d = camPos ? camPos.distanceTo(p) : 1000;
      this.shake = Math.max(this.shake, clamp(s * 130 / (d + 30), 0, 1.3));
    }

    megaBlast(p, R, camPos) {
      const y = Math.max(p.y, 30), f = this.fire, mu = this.mush, rnd = Math.random;
      const ball = new T.Mesh(this.ballGeo, new T.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 1, fog: false, depthWrite: false }));
      ball.position.set(p.x, y, p.z); this.scene.add(ball); this.balls.push({ m: ball, t: 0, R: R * 0.24 });
      this.ring(p, R * 4, 450, 0xffffff, 0.5); this.ring({ x: p.x, y: 3, z: p.z }, R * 1.8, 160, 0xcbb89a, 0.6);
      for (let i = 0; i < 150; i++) { // base surge: dust rolling outward along the ground, stays for minutes
        const a = rnd() * 6.283, sp = 40 + rnd() * 230, g = 0.5 + rnd() * 0.14;
        mu.spawn(p.x, 8 + rnd() * 30, p.z, Math.cos(a) * sp, 2 + rnd() * 8, Math.sin(a) * sp, 70 + rnd() * 60, 120, 480, g, g * 0.93, g * 0.84, 0.6, 0.3, 0);
      }
      for (let i = 0; i < 90; i++) {
        const a = rnd() * 6.283, e = rnd() * 1.5, sp = 60 + rnd() * 120;
        f.spawn(p.x, y, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 3 + rnd() * 4, 120, 420, 1, 0.75, 0.4, 0.9, 0.7, -6);
      }
      this.addEmitter({ x: p.x, y: 10, z: p.z, size: 150, life: 300, mush: 1, R });
      this.decal(p, R * 0.5);
      this.light(p, 4e7, 6);
      const d = camPos ? camPos.distanceTo(p) : 5000;
      this.flash = Math.max(this.flash, clamp(4000 / (d + 500), 0.25, 1) * 1.4);
      this.pendingShake = { t: d / 450, a: clamp(9000 / (d + 500), 0.3, 2.5) };
    }

    // An aircraft flying into a building. Unlike a bomb this is a fuel fire with momentum: the fireball bursts back out
    // of the entry wound and rolls up the facade, a jet of flame and wreckage is punched out of the far side along the
    // line of flight, pulverised concrete and glass rain down, and the floors it hit go on burning under black smoke.
    planeImpact(p, vel, span, mass, camPos) {
      const V = Math.hypot(vel.x, vel.y, vel.z) || 1, dx = vel.x / V, dy = vel.y / V, dz = vel.z / V, f = this.fire, sm = this.smoke, rnd = Math.random;
      const s = clamp(span / 12, 0.8, 3.4), k = clamp(Math.sqrt(mass / 12000), 0.8, 5), y = Math.max(p.y, 2), wx = -dz, wz = dx, half = span * 0.42, q = this.quality || 1;
      const N = (n) => Math.max(4, Math.round(n * Math.min(1.3, q) * Math.min(2, 0.7 + k * 0.3)));
      const ball = new T.Mesh(this.ballGeo, new T.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 1, fog: false, depthWrite: false }));
      ball.position.set(p.x - dx * 5, y, p.z - dz * 5); this.scene.add(ball); this.balls.push({ m: ball, t: 0, R: 13 * s, dur: 1.5 + 0.3 * s, rise: 10, grow: 0.3 });
      for (let i = 0; i < N(16); i++) { // the instant of impact: a white-hot flash across the wingspan
        const o = (rnd() - 0.5) * 2 * half, a = rnd() * 6.283, sp = 20 + rnd() * 40;
        f.spawn(p.x + wx * o, y + (rnd() - 0.5) * 3, p.z + wz * o, Math.cos(a) * sp - dx * 20, rnd() * 30, Math.sin(a) * sp - dz * 20, 0.25 + rnd() * 0.4, 6 * s, 24 * s, 1, 0.9, 0.65, 1, 3.5, 0);
      }
      for (let i = 0; i < N(46); i++) { // fuel fireball blowing back out of the hole and climbing the wall
        const o = (rnd() - 0.5) * 2 * half, back = 8 + rnd() * 34;
        f.spawn(p.x + wx * o - dx * 3, y + (rnd() - 0.5) * 5, p.z + wz * o - dz * 3, -dx * back + (rnd() - 0.5) * 16, 6 + rnd() * 26, -dz * back + (rnd() - 0.5) * 16, 1.1 + rnd() * 1.5, 9 * s, 40 * s, 1, 0.48, 0.12, 0.85, 1.1, -6);
      }
      for (let i = 0; i < N(30); i++) { // flame and burning fuel punched through and out of the far side
        const sp = V * (0.22 + rnd() * 0.5), o = (rnd() - 0.5) * 2 * half * 0.7;
        f.spawn(p.x + wx * o, y + (rnd() - 0.5) * 4, p.z + wz * o, dx * sp + (rnd() - 0.5) * 22, dy * sp + rnd() * 16, dz * sp + (rnd() - 0.5) * 22, 0.7 + rnd() * 1.1, 8 * s, 30 * s, 1, 0.55, 0.16, 0.85, 1.6, 2);
      }
      for (let i = 0; i < N(60); i++) { // burning fragments arcing away and falling
        const a = rnd() * 6.283, sp = 12 + rnd() * 60, fw = rnd() * V * 0.35;
        f.spawn(p.x, y, p.z, Math.cos(a) * sp + dx * fw, 8 + rnd() * 50, Math.sin(a) * sp + dz * fw, 1.6 + rnd() * 2.4, 1.5 * s, 0.5 * s, 1, 0.78, 0.4, 1, 0.2, 16);
      }
      for (let i = 0; i < N(40); i++) { // thick black fuel smoke boiling upward
        const o = (rnd() - 0.5) * 2 * half, g = 0.03 + rnd() * 0.07;
        sm.spawn(p.x + wx * o - dx * rnd() * 8, y + rnd() * 8, p.z + wz * o - dz * rnd() * 8, -dx * rnd() * 10 + (rnd() - 0.5) * 8, 7 + rnd() * 16, -dz * rnd() * 10 + (rnd() - 0.5) * 8, 10 + rnd() * 10, 13 * s, 70 * s, g, g, g, 0.9, 0.4, -0.8);
      }
      for (let i = 0; i < N(34); i++) { // pulverised concrete and plaster: a pale cloud thrown out and sinking
        const a = rnd() * 6.283, sp = 10 + rnd() * 34, g = 0.62 + rnd() * 0.18, fw = (rnd() - 0.3) * V * 0.25;
        sm.spawn(p.x, y + (rnd() - 0.5) * 6, p.z, Math.cos(a) * sp + dx * fw, (rnd() - 0.4) * 14, Math.sin(a) * sp + dz * fw, 5 + rnd() * 6, 7 * s, 42 * s, g, g * 0.96, g * 0.9, 0.55, 1.2, 1.5);
      }
      for (let i = 0; i < N(70); i++) { // glass and paper glittering down the face of the building
        const a = rnd() * 6.283, sp = 6 + rnd() * 30, g = 0.82 + rnd() * 0.18;
        sm.spawn(p.x + wx * (rnd() - 0.5) * 2 * half, y + (rnd() - 0.5) * 8, p.z + wz * (rnd() - 0.5) * 2 * half, Math.cos(a) * sp - dx * 6, 4 + rnd() * 18, Math.sin(a) * sp - dz * 6, 6 + rnd() * 7, 0.55, 0.8, g, g, g * 0.97, 0.9, 0.9, 3.2);
      }
      // masonry dropping from the wound, and the aircraft's own wreckage carrying on through
      for (let i = 0; i < Math.round(8 + 4 * s); i++) this.chunks.spawn(p.x + wx * (rnd() - 0.5) * 2 * half - dx * 2, y + (rnd() - 0.5) * 4, p.z + wz * (rnd() - 0.5) * 2 * half - dz * 2, -dx * rnd() * 9 + (rnd() - 0.5) * 8, rnd() * 6, -dz * rnd() * 9 + (rnd() - 0.5) * 8, 1.1 * Math.sqrt(s));
      for (let i = 0; i < Math.round(7 + 5 * s); i++) { const sp = V * (0.18 + rnd() * 0.45); this.chunks.spawn(p.x, y, p.z, dx * sp + (rnd() - 0.5) * 18, dy * sp + rnd() * 14, dz * sp + (rnd() - 0.5) * 18, (0.7 + rnd() * 0.9) * Math.sqrt(s)); }
      // the fire that stays: the floors that were hit, fed by the fuel, with secondary fires along the wing line and below
      this.addEmitter({ x: p.x, y, z: p.z, size: 7 + 4 * s, life: 150, fire: 100 });
      this.addEmitter({ x: p.x + wx * half * 0.6, y: y + 2, z: p.z + wz * half * 0.6, size: 4 + 2 * s, life: 110, fire: 70 });
      this.addEmitter({ x: p.x - wx * half * 0.6, y: y - 2, z: p.z - wz * half * 0.6, size: 4 + 2 * s, life: 110, fire: 70 });
      this.addEmitter({ x: p.x + dx * Math.min(18, 6 + span * 0.4), y: y + 1, z: p.z + dz * Math.min(18, 6 + span * 0.4), size: 5 + 2 * s, life: 120, fire: 80 });
      if (y > 14) this.addEmitter({ x: p.x - dx * 9, y: 2, z: p.z - dz * 9, size: 4 + 2 * s, life: 70, fire: 40 }); // burning wreckage in the street below
      this.ring(p, 60 + 30 * s, 300, 0xffffff, 0.3);
      this.light(p, 6000 * s * s, 1.4);
      const d = camPos ? camPos.distanceTo(p) : 500;
      this.shake = Math.max(this.shake, clamp(s * k * 90 / (d + 30), 0.3, 1.6)); this.flash = Math.max(this.flash, clamp(60 * s / (d + 40), 0, 0.5));
    }

    // throw n chunks outward from a point
    debris(x, y, z, n, speed, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = speed * (0.3 + Math.random());
        this.chunks.spawn(x, Math.max(y, 1), z, Math.cos(a) * sp, speed * (Math.random() * 1.1 - 0.15), Math.sin(a) * sp, size);
      }
    }
    // a pancaking building hits the ground: dust rolls outward along the streets
    collapseEnd(b) {
      const n = Math.round(clamp(8 + b.top * 0.12, 8, 34)), sp = 12 + Math.sqrt(b.top) * 2.4, sz = 14 + b.hw * 0.7;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283 + Math.random() * 0.3, g = 0.5 + Math.random() * 0.14;
        this.smoke.spawn(b.x + Math.cos(a) * b.hw, 3 + Math.random() * 8, b.z + Math.sin(a) * b.hd, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 9 + Math.random() * 8, sz, sz * 3.4, g, g * 0.95, g * 0.86, 0.6, 0.55, -0.2);
      }
      this.debris(b.x, 4, b.z, Math.round(clamp(b.top * 0.06, 3, 14)), 10 + Math.sqrt(b.top), clamp(b.hw * 0.1, 1, 3));
      const d = this.camPos.distanceTo(_tv.set(b.x, 0, b.z));
      this.shake = Math.max(this.shake, clamp(b.top * 0.9 / (d + 60), 0, 0.8));
      if (b.top > 50 && G.audio) G.audio.explosion(d, clamp(b.top / 220, 0.3, 1.3));
    }
    // a toppled tower slams down along (dx,dz)
    toppleImpact(px, pz, dx, dz, len, wid) {
      for (let s = 0; s < len; s += 16) {
        const x = px + dx * s, z = pz + dz * s, g = 0.48 + Math.random() * 0.16;
        for (let k = -1; k <= 1; k += 2) this.smoke.spawn(x, 4, z, -dz * k * 20 + dx * 5, 4 + Math.random() * 6, dx * k * 20 + dz * 5, 9 + Math.random() * 7, 16 + wid * 0.5, 60 + wid * 1.5, g, g * 0.95, g * 0.86, 0.62, 0.6, -0.2);
        if (s % 32 === 0) this.debris(x, 5, z, 4, 16, clamp(wid * 0.1, 1.2, 3.5));
      }
      const d = this.camPos.distanceTo(_tv.set(px + dx * len * 0.5, 0, pz + dz * len * 0.5));
      this.shake = Math.max(this.shake, clamp(len * 2.2 / (d + 60), 0, 1.4));
      if (G.audio) G.audio.explosion(d, clamp(len / 150, 0.6, 1.8));
    }
    // anti-aircraft shell burst
    flak(p) {
      for (let i = 0; i < 7; i++) { const g = 0.08 + Math.random() * 0.1; this.smoke.spawn(p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8, p.z + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 5 + Math.random() * 4, 6, 34, g, g, g, 0.8, 1.2, 0); }
      for (let i = 0; i < 5; i++) this.fire.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.25, 8, 18, 1, 0.8, 0.5, 1, 2, 0);
    }
    collapseStart(b) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.283, g = 0.45 + Math.random() * 0.15;
        this.smoke.spawn(b.x + Math.cos(a) * b.hw, 3, b.z + Math.sin(a) * b.hd, Math.cos(a) * 14, 4, Math.sin(a) * 14, 6 + Math.random() * 5, 12, 20 + b.hw * 1.2, g, g * 0.95, g * 0.86, 0.6, 0.7, 0);
      }
    }
    collapseDust(b, k) {
      const a = Math.random() * 6.283, g = 0.42 + Math.random() * 0.14, top = b.top * (1 - k * k);
      this.smoke.spawn(b.x + Math.cos(a) * b.hw, Math.random() * Math.min(top, 40), b.z + Math.sin(a) * b.hd, Math.cos(a) * 10, 3 + Math.random() * 6, Math.sin(a) * 10, 5 + Math.random() * 5, 10, 22 + b.hw, g, g * 0.95, g * 0.86, 0.55, 0.6, -0.3);
      if (Math.random() < 0.35) this.fire.spawn(b.x + (Math.random() - 0.5) * b.hw, Math.random() * Math.min(top, 60), b.z + (Math.random() - 0.5) * b.hd, 0, 5, 0, 0.8, 6, 16, 1, 0.6, 0.25, 0.8, 0.5, 0);
    }

    update(dt, camPos) {
      const w = this.wind; if (camPos) this.camPos.copy(camPos);
      const budget = (this.emitters.length > 40 ? 0.5 : 1) * (this.quality || 1);
      for (let i = this.emitters.length - 1; i >= 0; i--) {
        const e = this.emitters[i]; e.t += dt;
        if (e.t > e.life) { this.emitters.splice(i, 1); continue; }
        const fade = 1 - e.t / e.life;
        if (e.mush) { // mushroom cloud: stem, rolling cap and collar, sustained for minutes
          const mu = this.mush, topY = e.R * 2.1, capY = Math.min(e.t * 70, topY), grown = capY / topY, late = e.t > e.life - 60 ? Math.max(0, (e.life - e.t) / 60) : 1;
          e.acc += dt * (e.t < 45 ? 26 : 13) * late;
          while (e.acc > 1) {
            e.acc--;
            const a = Math.random() * 6.283, g = 0.3 + Math.random() * 0.16, pick = Math.random();
            if (pick < 0.34) { // stem
              const rr = 60 + Math.random() * 90, yy = Math.random() * capY;
              mu.spawn(e.x + Math.cos(a) * rr, yy, e.z + Math.sin(a) * rr, Math.cos(a) * 3 + w.x * 0.15, 16 + Math.random() * 10, Math.sin(a) * 3 + w.z * 0.15, 34 + Math.random() * 14, 170, 330, g, g * 0.93, g * 0.86, 0.85, 0.12, 0);
            } else if (pick < 0.86) { // cap
              const rr = Math.sqrt(Math.random()) * e.R * (0.18 + 0.3 * grown), lift = (1 - rr / (e.R * 0.5)) * 220 * grown, br = g + 0.3;
              mu.spawn(e.x + Math.cos(a) * rr, capY + lift + (Math.random() - 0.5) * 140, e.z + Math.sin(a) * rr, Math.cos(a) * 16 + w.x * 0.15, 5 + Math.random() * 6, Math.sin(a) * 16 + w.z * 0.15, 42 + Math.random() * 18, 300, 640, br, br * 0.95, br * 0.88, 0.9, 0.14, 0);
            } else { // collar under the cap
              const rr = e.R * (0.22 + 0.12 * Math.random()) * grown;
              mu.spawn(e.x + Math.cos(a) * rr, capY * 0.72 + (Math.random() - 0.5) * 80, e.z + Math.sin(a) * rr, Math.cos(a) * 10, -3, Math.sin(a) * 10, 30 + Math.random() * 12, 200, 420, g + 0.18, g + 0.14, g + 0.08, 0.7, 0.15, 0);
            }
            if (e.t < 14 && Math.random() < 0.5) this.fire.spawn(e.x + Math.cos(a) * 70, capY * (0.5 + Math.random() * 0.5), e.z + Math.sin(a) * 70, 0, 55, 0, 2.8, 170, 340, 1, 0.55, 0.2, 0.7 * (1 - e.t / 14), 0.3, 0);
          }
          continue;
        }
        const far = camPos ? Math.hypot(camPos.x - e.x, camPos.z - e.z) > 9000 : false;
        e.acc += dt * (far ? 1.2 : 4.5) * budget;
        while (e.acc > 1) {
          e.acc--;
          const g = 0.07 + Math.random() * 0.12, s = e.size;
          this.smoke.spawn(e.x + (Math.random() - 0.5) * s, e.y + Math.random() * 3, e.z + (Math.random() - 0.5) * s, w.x + (Math.random() - 0.5) * 3, 9 + Math.random() * 7, w.z + (Math.random() - 0.5) * 3, 9 + Math.random() * 6, s * 0.7, s * 4.5, g, g, g, 0.6 * Math.min(1, fade * 3), 0.05, 0);
          if (e.t < e.fire) this.fire.spawn(e.x + (Math.random() - 0.5) * s * 0.8, e.y + Math.random() * 2, e.z + (Math.random() - 0.5) * s * 0.8, 0, 6 + Math.random() * 6, 0, 0.9, s * 0.5, s * 1.3, 1, 0.55, 0.2, 0.8, 0.4, 0);
        }
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.r += r.speed * dt; r.m.scale.set(r.r, 1, r.r); r.m.material.opacity = r.o * (1 - r.r / r.maxR);
        if (r.r >= r.maxR) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
      }
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i]; b.t += dt;
        const k = b.t / (b.dur || 9), s = b.R * (0.25 + 0.75 * Math.min(1, Math.sqrt(b.t / (b.grow || 1.5))));
        b.m.scale.setScalar(s); b.m.position.y += dt * (b.rise || 28) * Math.min(1, b.t / (b.dur ? 0.3 : 2));
        b.m.material.opacity = clamp(1.2 - k * 1.2, 0, 1); b.m.material.color.setRGB(1, 0.95 - k * 0.55, 0.8 - k * 0.7);
        if (k >= 1) { this.scene.remove(b.m); b.m.material.dispose(); this.balls.splice(i, 1); }
      }
      this.lights.forEach((l) => { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.i * Math.max(0, l.userData.t / l.userData.d); } else l.intensity = 0; });
      if (this.pendingShake) { this.pendingShake.t -= dt; if (this.pendingShake.t <= 0) { this.shake = Math.max(this.shake, this.pendingShake.a); this.pendingShake = null; } }
      this.shake *= Math.exp(-2.2 * dt); this.flash *= Math.exp(-1.7 * dt);
      this.smoke.update(dt); this.mush.update(dt); this.fire.update(dt); this.chunks.update(dt);
    }
  }
  G.FX = FX;
})();
