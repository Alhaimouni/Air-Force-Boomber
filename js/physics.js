// Flight dynamics model: forces from lift/drag/thrust/gravity, rate-command attitude with
// dynamic-pressure-scaled authority, static stability, stall, compressibility drag, ground handling.
(function () {
  'use strict';
  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const clamp = G.clamp;
  const g0 = 9.80665;

  const _vb = new V3(), _fwd = new V3(), _up = new V3(), _right = new V3(), _F = new V3(), _vhat = new V3(),
    _lift = new V3(), _qi = new Q(), _dq = new Q(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _t = new V3();

  class Flight {
    constructor(spec) {
      this.spec = spec;
      this.pos = new V3(); this.vel = new V3(); this.q = new Q();
      this.w = new V3(); // body angular rates (x pitch-up, y yaw-left, z roll-left)
      this.throttle = 0; this.rpm = 0.03; this.ab = 0;
      this.gear = 1; this.gearTarget = 1; this.flaps = 0; this.flapsTarget = 0; this.brake = 0;
      this.ctl = { pitch: 0, roll: 0, yaw: 0 };
      this.onGround = false; this.crashed = false; this.crashReason = '';
      this.alpha = 0; this.beta = 0; this.mach = 0; this.V = 0; this.ias = 0; this.nz = 1; this.qbar = 0;
      this.stalled = false; this.agl = 0; this.thrust = 0; this.health = 100; this.surface = 'paved';
      this.brakeTemp = 15; this.decel = 0; this.flapOver = false; this.gearOver = false;
      this.vfe = spec.maxG > 5 ? 330 : 260; this.vle = spec.maxG > 5 ? 300 : 270; // flap / gear limit speeds, KIAS
      this.events = [];
    }

    reset(pos, heading, speed) {
      this.pos.copy(pos);
      _e.set(0, heading, 0, 'YXZ'); this.q.setFromEuler(_e);
      this.vel.set(0, 0, -speed).applyQuaternion(this.q);
      this.w.set(0, 0, 0);
      this.crashed = false; this.health = 100; this.events.length = 0; this.brake = 0; this.brakeTemp = 15; this.decel = 0;
      if (speed > 0) {
        this.throttle = 0.7; this.rpm = 0.7; this.gear = 0; this.gearTarget = 0; this.flaps = 0; this.flapsTarget = 0; this.onGround = false;
      } else {
        this.throttle = 0; this.rpm = 0.03; this.gear = 1; this.gearTarget = 1; this.flaps = 1; this.flapsTarget = 1; this.onGround = true;
      }
    }

    // input: {pitch, roll, yaw in -1..1 (targets), throttleDelta, brake}
    update(dt, input, world) {
      const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.008)));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.step(h, input, world);
    }

    step(dt, input, world) {
      const s = this.spec, c = this.ctl;
      if (this.crashed) return;
      // control surface / actuator lag
      const cr = (cur, tgt, rate) => cur + clamp(tgt - cur, -rate * dt, rate * dt);
      c.pitch = cr(c.pitch, input.pitch, 3.5); c.roll = cr(c.roll, input.roll, 5); c.yaw = cr(c.yaw, input.yaw, 3.5);
      this.throttle = clamp(this.throttle + input.throttleDelta * dt, 0, 1);
      this.gear = cr(this.gear, this.gearTarget, 0.35);
      this.flaps = cr(this.flaps, this.flapsTarget, 0.3);
      this.brake = cr(this.brake, input.brake ? 1 : 0, 3.2); // brake pressure / speed-brake actuator

      const hasAB = s.thrustAB > 0;
      const dryCmd = hasAB ? Math.min(this.throttle / 0.9, 1) : this.throttle;
      const dmg = this.health < 50 ? 0.55 : 1;
      this.rpm += clamp(dryCmd - this.rpm, -s.spool * dt, s.spool * dt * (0.4 + this.rpm));
      const abCmd = hasAB && this.rpm > 0.93 ? clamp((this.throttle - 0.9) / 0.1, 0, 1) : 0;
      this.ab = cr(this.ab, abCmd, 2.5);

      const atm = G.atmosphere(this.pos.y);
      _qi.copy(this.q).invert();
      _vb.copy(this.vel).applyQuaternion(_qi);
      const V = this.vel.length();
      const u = -_vb.z;
      let alpha = 0, beta = 0;
      if (V > 3) { alpha = Math.atan2(-_vb.y, Math.max(u, 0.5)); beta = Math.asin(clamp(_vb.x / V, -1, 1)); }
      const mach = V / atm.a, qbar = 0.5 * atm.rho * V * V;
      this.alpha = alpha; this.beta = beta; this.mach = mach; this.V = V; this.qbar = qbar;
      this.ias = V * Math.sqrt(atm.rho / 1.225);
      // limit speeds: flaps blow back one notch when badly oversped (load relief), the gear only buffets
      const kias = this.ias * G.KTS;
      this.flapOver = this.flaps > 0.08 && kias > this.vfe; this.gearOver = this.gear > 0.08 && kias > this.vle;
      if (this.flapsTarget > 0 && kias > this.vfe * 1.12 && this.flaps - this.flapsTarget < 0.08) { this.flapsTarget = Math.max(0, this.flapsTarget - 0.5); this.events.push({ type: 'flaprelief' }); }

      _fwd.set(0, 0, -1).applyQuaternion(this.q);
      _up.set(0, 1, 0).applyQuaternion(this.q);
      _right.set(1, 0, 0).applyQuaternion(this.q);

      // --- aerodynamic coefficients
      const cl0 = s.CL0 + this.flaps * s.flapCL;
      const aS = s.alphaStall, aSn = -aS * 0.75;
      let cl, stallDrag = 0;
      if (alpha > aS) {
        const clmax = cl0 + s.CLa * aS;
        cl = clmax * Math.max(0.55, 1 - (alpha - aS) * 2.2) * Math.max(0, Math.cos(alpha));
        stallDrag = 1.3 * Math.sin(alpha) * Math.sin(alpha);
      } else if (alpha < aSn) {
        const clmin = cl0 + s.CLa * aSn;
        cl = clmin * Math.max(0.55, 1 + (alpha - aSn) * 2.2) * Math.max(0, Math.cos(alpha));
        stallDrag = 1.3 * Math.sin(alpha) * Math.sin(alpha);
      } else cl = cl0 + s.CLa * alpha;
      this.stalled = alpha > aS * 0.97 && !this.onGround && V > 5;

      // transonic / supersonic wave drag
      let wave = 0;
      if (mach > 0.82) {
        wave = mach < 1.05 ? G.smoothstep(0.82, 1.05, mach) : Math.max(0.55, 1 - (mach - 1.05) * 0.45);
        if (mach > s.machLimit) wave += (mach - s.machLimit) * 6;
      }
      const cd = s.CD0 + s.k * cl * cl + wave * s.CDw + this.gear * 0.022 + this.flaps * 0.035 +
        this.brake * (this.onGround ? 0.05 : 0.065) + (this.gearOver ? 0.01 : 0) + stallDrag + 0.6 * beta * beta +
        (this.health < 50 ? 0.01 : 0);

      const L = qbar * s.S * cl, D = qbar * s.S * cd, Y = -qbar * s.S * 1.1 * beta;
      const lapse = Math.pow(atm.rho / 1.225, 0.75);
      const ceilF = clamp((s.ceiling + 1500 - this.pos.y) / 1500, 0, 1);
      const dry = (0.03 + 0.97 * this.rpm) * s.thrustDry * lapse * Math.max(0.25, 1 + s.machThrust * mach);
      const abT = this.ab * (s.thrustAB - s.thrustDry) * lapse * (1 + 0.35 * mach);
      const T = (dry + (hasAB ? abT : 0)) * ceilF * dmg;
      this.thrust = T;

      _F.set(0, -s.mass * g0, 0);
      _F.addScaledVector(_fwd, T);
      if (V > 0.5) {
        _vhat.copy(this.vel).multiplyScalar(1 / V);
        _F.addScaledVector(_vhat, -D);
        _lift.crossVectors(_right, _vhat).normalize();
        _F.addScaledVector(_lift, L);
        _F.addScaledVector(_right, Y);
      }
      this.nz = L / (s.mass * g0);

      // --- attitude: rate command with authority limited by dynamic pressure
      const auth = clamp(qbar / s.qRef, 0, 1);
      const hiQ = 1 / (1 + Math.max(0, qbar - 45000) / 60000);
      let pc = c.pitch;
      // g and alpha limiters (structural / fly-by-wire)
      const gUp = clamp((s.maxG - this.nz) / 1.2, -0.6, 1), gDn = clamp((this.nz - s.minG) / 1.2, -0.6, 1);
      const aUp = clamp((aS * 0.94 - alpha) / 0.07, -0.8, 1);
      if (pc > 0) pc = Math.min(pc, gUp, aUp); else pc = Math.max(pc, -gDn);
      if (gUp < 0 || aUp < 0) pc = Math.min(pc, Math.min(gUp, aUp));
      const stallAuth = this.stalled ? 0.45 : 1;

      let wx, wy, wz;
      if (this.onGround) {
        const weightOnWheels = clamp(1 - this.nz, 0, 1);
        wx = c.pitch > 0.05 ? c.pitch * s.pitchRate * auth * 0.7 : -0.25 - 0.5 * (1 - auth);
        const steer = clamp(c.yaw + c.roll * 0.6, -1, 1);
        const vs = clamp(V / 8, 0, 1) * (0.25 + 0.75 / (1 + V / 25));
        wy = -steer * 0.7 * vs * (0.3 + 0.7 * weightOnWheels) - 3.0 * beta * auth;
        wz = 0;
        this.w.set(wx, wy, 0);
      } else {
        const nTrim = clamp(_up.y, -0.3, 1);
        const aTrim = qbar > 50 ? clamp((nTrim * s.mass * g0 / (qbar * s.S) - cl0) / s.CLa, -0.1, aS * 0.85) : aS * 0.85;
        const Ka = 2.2, Kb = 3.2;
        wx = pc * s.pitchRate * auth * hiQ * stallAuth - Ka * (alpha - aTrim) * Math.min(1, auth * 1.5 + 0.15);
        wy = -c.yaw * s.yawRate * auth * hiQ - Kb * beta * Math.min(1, auth * 1.5 + 0.15);
        wz = -c.roll * s.rollRate * auth * hiQ * stallAuth;
        if (this.stalled) wz += Math.sin(this.pos.y * 0.37 + this.pos.x * 0.11) * 0.5; // wing drop
        if (this.health < 50) wz += 0.12;
        const kp = clamp(dt / s.tauPitch, 0, 1), kr = clamp(dt / s.tauRoll, 0, 1);
        this.w.x += (wx - this.w.x) * kp; this.w.y += (wy - this.w.y) * kp; this.w.z += (wz - this.w.z) * kr;
      }

      // --- ground reaction
      const gh = world.groundHeight(this.pos.x, this.pos.z);
      const gearH = s.gearH * (0.45 + 0.55 * (this.gear > 0.95 ? 1 : 0));
      let agl = this.pos.y - gearH - gh;
      this.agl = this.pos.y - s.gearH - gh;
      if (this.onGround) {
        if (_F.y < 0) _F.y = 0; // supported by gear
        const surf = world.surfaceAt(this.pos.x, this.pos.z);
        this.surface = surf;
        if (surf === 'water') { this.crash('Ditched in the sea'); return; }
        const fade = 1 - clamp((this.brakeTemp - 520) / 700, 0, 0.45); // hot brakes fade
        const mu = (surf === 'paved' ? 0.018 : 0.07) + this.brake * (surf === 'paved' ? 0.45 : 0.3) * fade;
        const wow = clamp(1 - this.nz, 0, 1);
        this.decel = (V > 0.5 ? mu * g0 * wow : 0) - T / s.mass;
        this.brakeTemp += this.brake * fade * wow * V * 0.95 * dt; // kinetic energy turned into heat in the discs
        // decompose horizontal velocity along heading
        _t.set(_fwd.x, 0, _fwd.z).normalize();
        const vf = this.vel.x * _t.x + this.vel.z * _t.z;
        let lx = this.vel.x - _t.x * vf, lz = this.vel.z - _t.z * vf;
        const grip = Math.exp(-9 * dt * (0.2 + 0.8 * wow));
        lx *= grip; lz *= grip;
        let vf2 = vf;
        const dec = mu * g0 * wow * dt;
        vf2 = Math.abs(vf2) <= dec ? (T / s.mass * dt > dec ? vf2 : 0) : vf2 - Math.sign(vf2) * dec;
        this.vel.x = _t.x * vf2 + lx; this.vel.z = _t.z * vf2 + lz;
      }

      if (!this.onGround) this.decel = 0;
      this.brakeTemp += (15 - this.brakeTemp) * (0.012 + V * 0.0004) * dt; // air cooling
      // integrate linear
      this.vel.addScaledVector(_F, dt / s.mass);
      this.pos.addScaledVector(this.vel, dt);

      // integrate attitude
      if (this.onGround) {
        _e.setFromQuaternion(this.q, 'YXZ');
        _e.z *= Math.exp(-8 * dt);
        _e.x = clamp(_e.x + this.w.x * dt, 0, s.maxRot);
        _e.y += this.w.y * dt;
        this.q.setFromEuler(_e);
      } else {
        const wm = this.w.length();
        if (wm > 1e-6) {
          _t.copy(this.w).multiplyScalar(1 / wm);
          _dq.setFromAxisAngle(_t, wm * dt);
          this.q.multiply(_dq).normalize();
        }
      }

      // contact
      const gh2 = world.groundHeight(this.pos.x, this.pos.z);
      agl = this.pos.y - gearH - gh2;
      if (agl <= 0) {
        if (!this.onGround) {
          _e.setFromQuaternion(this.q, 'YXZ');
          const sink = -this.vel.y, surf = world.surfaceAt(this.pos.x, this.pos.z);
          const slope = Math.abs(world.groundHeight(this.pos.x + 20, this.pos.z) - gh2) + Math.abs(world.groundHeight(this.pos.x, this.pos.z + 20) - gh2);
          const deck = world.onDeck ? world.onDeck(this.pos.x, this.pos.z) : false;
          if (agl < -3.5) return this.crash(deck ? 'Struck the carrier below deck level' : 'Crashed into terrain');
          if (surf === 'water') return this.crash('Crashed into the sea');
          if (this.gear < 0.95) return this.crash('Belly landing — gear was up');
          if (sink > s.sinkLimit * (deck ? 1.9 : 1)) return this.crash('Hard landing — ' + Math.round(sink * 196.85) + ' ft/min');
          if (Math.abs(_e.z) > 0.3) return this.crash('Wing strike');
          if (_e.x < -0.14 || _e.x > 0.5) return this.crash('Bad landing attitude');
          if (slope > 6 && !deck) return this.crash('Crashed into terrain');
          if (Math.abs(this.beta) > 0.45 && V > 30) return this.crash('Landed sideways');
          this.onGround = true;
          this.events.push({ type: 'touchdown', sink, surf });
        }
        this.pos.y = gh2 + gearH;
        if (this.vel.y < 0) this.vel.y = 0;
      } else if (this.onGround && agl > 0.15) {
        this.onGround = false;
        this.events.push({ type: 'liftoff' });
      }
      if (this.onGround && this.gear < 0.95 && this.gearTarget < 1) this.gearTarget = 1; // can't retract on the ground
    }

    crash(reason) {
      if (this.crashed) return;
      this.crashed = true; this.crashReason = reason;
      this.events.push({ type: 'crash', reason });
    }

    euler() { _e.setFromQuaternion(this.q, 'YXZ'); return _e; }
  }

  // ---------- rocket: thrust along the body axis, burning propellant, inverse-square gravity,
  // thinning atmosphere, and a Moon with its own gravity that can be landed on.
  G.MOON = { pos: new V3(120000, 520000, -200000), r: 40000, g: 1.62 };
  const RE = 600000; // gravity fall-off scale (compressed so the trip takes minutes, not days)
  const _n = new V3(), _dm = new V3();
  class RocketFlight {
    constructor(spec) {
      this.spec = spec; this.isRocket = true;
      this.pos = new V3(); this.vel = new V3(); this.q = new Q(); this.w = new V3();
      this.throttle = 0; this.rpm = 0; this.ab = 0; this.fuel = 1;
      this.gear = 1; this.gearTarget = 1; this.flaps = 0; this.flapsTarget = 0; this.brake = 0;
      this.onGround = true; this.body = 'earth'; this.crashed = false; this.crashReason = '';
      this.alpha = 0; this.beta = 0; this.mach = 0; this.V = 0; this.ias = 0; this.nz = 1; this.qbar = 0;
      this.stalled = false; this.agl = 0; this.thrust = 0; this.health = 100; this.surface = 'paved'; this.events = [];
      this.moonDist = 1e9; this.gLocal = g0; this.brakeTemp = 15; this.decel = 0;
    }
    reset(pos) {
      this.pos.copy(pos); _e.set(Math.PI / 2, 0, 0, 'YXZ'); this.q.setFromEuler(_e);
      this.vel.set(0, 0, 0); this.w.set(0, 0, 0); this.throttle = 0; this.fuel = 1; this.onGround = true; this.body = 'earth';
      this.crashed = false; this.health = 100; this.events.length = 0;
    }
    update(dt, input, world) { const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.01))); for (let i = 0; i < n; i++) this.step(dt / n, input, world); }
    step(dt, input, world) {
      if (this.crashed) return;
      const s = this.spec, M = G.MOON;
      this.throttle = clamp(this.throttle + input.throttleDelta * dt * 1.6, 0, 1);
      if (this.health < 50) this.throttle = Math.min(this.throttle, 0.6);
      const burning = this.fuel > 0 ? this.throttle : 0, mass = s.dryMass + s.fuelMass * this.fuel;
      const atm = G.atmosphere(this.pos.y), V = this.vel.length();
      this.V = V; this.mach = V / atm.a; this.qbar = 0.5 * atm.rho * V * V; this.ias = V * Math.sqrt(atm.rho / 1.225);
      _fwd.set(0, 0, -1).applyQuaternion(this.q);
      // gravity: Earth weakens with altitude and hands over to the Moon near it
      _dm.copy(M.pos).sub(this.pos); const d = _dm.length(); _dm.multiplyScalar(1 / d); this.moonDist = d - M.r;
      const kE = G.smoothstep(M.r * 2, M.r * 5, d), re = RE / (RE + Math.max(this.pos.y, 0)), gE = g0 * re * re * kE;
      const gM = d < M.r * 8 ? M.g * (M.r / d) * (M.r / d) : 0;
      _F.set(0, -gE * mass, 0).addScaledVector(_dm, gM * mass);
      this.gLocal = this.onGround ? (this.body === 'moon' ? gM : gE) : Math.max(gE, gM);
      // thrust, limited to 4.5 g so the crew survives as the tanks empty
      let T = burning * s.thrust * (1 + 0.15 * (1 - Math.min(1, atm.rho / 1.225)));
      if (T / mass > 4.5 * g0) T = 4.5 * g0 * mass;
      this.fuel = Math.max(0, this.fuel - T / (s.isp * g0) / s.fuelMass * dt);
      this.thrust = T; this.ab = burning; this.rpm = burning; this.nz = T / (mass * g0);
      _F.addScaledVector(_fwd, T);
      if (V > 0.5) { _vhat.copy(this.vel).multiplyScalar(1 / V); _F.addScaledVector(_vhat, -this.qbar * s.cdA); }
      // attitude: gimbal / thrusters, plus aerodynamic weathervaning while in the air
      _qi.copy(this.q).invert(); _vb.copy(this.vel).applyQuaternion(_qi);
      let alpha = 0, beta = 0;
      if (V > 20) { alpha = Math.atan2(-_vb.y, Math.max(-_vb.z, 0.5)); beta = Math.asin(clamp(_vb.x / V, -1, 1)); }
      this.alpha = alpha; this.beta = beta;
      const st = clamp(this.qbar / 9000, 0, 1) * 0.5, c = input;
      const wx = c.pitch * 0.4 - 1.4 * alpha * st, wy = -c.yaw * 0.4 - 1.4 * beta * st, wz = -c.roll * 0.7;
      const k = clamp(dt / 0.45, 0, 1);
      if (this.onGround) this.w.set(0, 0, 0);
      else { this.w.x += (wx - this.w.x) * k; this.w.y += (wy - this.w.y) * k; this.w.z += (wz - this.w.z) * k; }

      if (this.onGround) { // held down until thrust beats local weight
        if (this.body === 'moon') _n.copy(_dm).negate(); else _n.set(0, 1, 0);
        if (T * _fwd.dot(_n) > mass * this.gLocal * 1.02) { this.onGround = false; this.events.push({ type: 'liftoff', body: this.body }); }
        else { this.vel.set(0, 0, 0); this.agl = 0; return; }
      }
      this.vel.addScaledVector(_F, dt / mass); this.pos.addScaledVector(this.vel, dt);
      const wm = this.w.length();
      if (wm > 1e-6) { _t.copy(this.w).multiplyScalar(1 / wm); _dq.setFromAxisAngle(_t, wm * dt); this.q.multiply(_dq).normalize(); }

      // contact with Earth or the Moon
      _fwd.set(0, 0, -1).applyQuaternion(this.q);
      const gh = world.groundHeight(this.pos.x, this.pos.z), eAgl = this.pos.y - Math.max(5, s.gearH * Math.abs(_fwd.y)) - gh;
      _n.copy(this.pos).sub(M.pos); const dmn = _n.length(); _n.multiplyScalar(1 / dmn);
      const mAgl = dmn - M.r - Math.max(5, s.gearH * Math.abs(_fwd.dot(_n)));
      this.agl = Math.min(eAgl, mAgl);
      const speed = this.vel.length();
      if (eAgl <= 0) {
        if (speed < 9 && _fwd.y > 0.9) { this.onGround = true; this.body = 'earth'; this.pos.y = gh + s.gearH * Math.abs(_fwd.y); this.vel.set(0, 0, 0); this.surface = world.surfaceAt(this.pos.x, this.pos.z); this.events.push({ type: 'touchdown', sink: speed, body: 'earth' }); }
        else this.crash(speed >= 9 ? 'Hit the ground at ' + Math.round(speed) + ' m/s' : 'Tipped over on landing');
      } else if (mAgl <= 0) {
        if (speed < 10 && _fwd.dot(_n) > 0.9) { this.onGround = true; this.body = 'moon'; this.vel.set(0, 0, 0); this.events.push({ type: 'touchdown', sink: speed, body: 'moon' }); }
        else this.crash(speed >= 10 ? 'Crashed on the Moon at ' + Math.round(speed) + ' m/s' : 'Tipped over on the Moon');
      }
    }
    crash(reason) { if (this.crashed) return; this.crashed = true; this.crashReason = reason; this.events.push({ type: 'crash', reason }); }
    euler() { _e.setFromQuaternion(this.q, 'YXZ'); return _e; }
  }
  G.RocketFlight = RocketFlight;

  G.Flight = Flight;
})();
