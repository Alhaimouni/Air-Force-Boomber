// Global namespace + aircraft / weapon data (SI units unless noted)
window.G = {};
(function () {
  'use strict';
  G.KTS = 1.94384;
  G.FT = 3.28084;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.smoothstep = (a, b, x) => { const t = G.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  G.rng = function (seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  };
  G.money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  // International Standard Atmosphere
  G.atmosphere = function (alt) {
    const h = Math.max(alt, 0);
    let T, rho;
    if (h < 11000) {
      T = 288.15 - 0.0065 * h;
      rho = 1.225 * Math.pow(T / 288.15, 4.256);
    } else {
      T = 216.65;
      rho = 0.3639 * Math.exp(-(h - 11000) / 6341.6);
    }
    return { T, rho, a: Math.sqrt(401.874 * T) };
  };

  G.WEAPONS = {
    mk82:   { name: 'Mk-82 500 lb',        short: 'MK82',  radius: 55,  power: 1.0, len: 2.2, r: 0.14, color: 0x4a5240 },
    mk84:   { name: 'Mk-84 2000 lb',       short: 'MK84',  radius: 105, power: 2.6, len: 3.3, r: 0.23, color: 0x4a5240 },
    gbu31:  { name: 'GBU-31 JDAM 2000 lb', short: 'JDAM',  radius: 110, power: 2.8, len: 3.9, r: 0.23, color: 0x6b6f66 },
    gbu12:  { name: 'GBU-12 Paveway 500 lb', short: 'GBU12', radius: 60, power: 1.2, len: 3.3, r: 0.14, color: 0x4a5240 },
    fab500: { name: 'FAB-500 M-62',        short: 'FAB500', radius: 75, power: 1.6, len: 2.5, r: 0.2,  color: 0x7a7f84 },
    kab1500:{ name: 'KAB-1500 guided',     short: 'KAB1500', radius: 135, power: 3.6, len: 4.6, r: 0.29, color: 0x8a8f94 },
    ls6:    { name: 'LS-6 500 kg guided',  short: 'LS-6',  radius: 80,  power: 1.8, len: 3.0, r: 0.19, color: 0x8a8f94 },
    b61:    { name: 'B61-12 thermonuclear', short: 'B61 NUKE', radius: 1500, power: 400, len: 3.6, r: 0.17, color: 0xb9bcc0, nuke: true }
  };

  // sound: whine [idleHz, fullHz, gain, type], roar [bandHz, gain], rumble [lowpassHz, gain], ab gain
  G.AIRCRAFT = [
    {
      id: 'f16', name: 'F-16C Fighting Falcon', role: 'Multirole fighter', origin: 'USA', price: 0,
      mass: 12000, S: 27.87, span: 9.96, length: 15.06,
      thrustDry: 76300, thrustAB: 127000, machThrust: 0.1,
      CL0: 0.08, CLa: 4.0, alphaStall: 0.44, flapCL: 0.45, CD0: 0.0195, k: 0.115, CDw: 0.026,
      maxG: 9, minG: -3, rollRate: 4.2, pitchRate: 0.95, yawRate: 0.35, tauRoll: 0.14, tauPitch: 0.22,
      qRef: 5500, machLimit: 2.0, ceiling: 15240, gearH: 1.75, maxRot: 0.24, sinkLimit: 6, spool: 0.65,
      weapons: [{ type: 'mk82', count: 12 }, { type: 'mk84', count: 4 }], flares: 30,
      cam: { dist: 26, height: 5, cockpit: [0, 1.05, -3.6] },
      sound: { whine: [900, 3400, 0.05, 'sawtooth'], roar: [900, 0.5], rumble: [160, 0.5], ab: 0.9 },
      stats: 'Mach 2.0 · 9 g · 1 × F110-GE-129'
    },
    {
      id: 'a320', name: 'Airbus A320-200', role: 'Airliner (civil)', origin: 'Europe', price: 0, civil: true,
      mass: 68000, S: 122.6, span: 35.8, length: 37.57,
      thrustDry: 240000, thrustAB: 0, machThrust: -0.5,
      CL0: 0.28, CLa: 5.5, alphaStall: 0.26, flapCL: 0.95, CD0: 0.021, k: 0.037, CDw: 0.09,
      maxG: 2.5, minG: -1, rollRate: 0.42, pitchRate: 0.13, yawRate: 0.08, tauRoll: 0.6, tauPitch: 0.7,
      qRef: 3200, machLimit: 0.82, ceiling: 12100, gearH: 3.6, maxRot: 0.2, sinkLimit: 4, spool: 0.3,
      weapons: [], flares: 0,
      cam: { dist: 62, height: 12, cockpit: [-0.5, 1.0, -16.6] },
      sound: { whine: [240, 760, 0.07, 'sawtooth'], roar: [520, 0.42], rumble: [110, 0.4], ab: 0 },
      stats: 'Mach 0.82 · 2.5 g · 2 × CFM56-5B'
    },
    {
      id: 'su27', name: 'Sukhoi Su-27 Flanker', role: 'Air superiority fighter', origin: 'Russia', price: 150000,
      mass: 23400, S: 62, span: 14.7, length: 21.9,
      thrustDry: 150000, thrustAB: 245000, machThrust: 0.22,
      CL0: 0.1, CLa: 4.1, alphaStall: 0.52, flapCL: 0.4, CD0: 0.021, k: 0.11, CDw: 0.027,
      maxG: 9, minG: -3, rollRate: 3.6, pitchRate: 1.0, yawRate: 0.35, tauRoll: 0.18, tauPitch: 0.24,
      qRef: 5200, machLimit: 2.35, ceiling: 19000, gearH: 2.3, maxRot: 0.22, sinkLimit: 6, spool: 0.6,
      weapons: [{ type: 'fab500', count: 10 }, { type: 'kab1500', count: 2 }], flares: 36,
      cam: { dist: 34, height: 6.5, cockpit: [0, 1.5, -6.2] },
      sound: { whine: [620, 2500, 0.045, 'sawtooth'], roar: [650, 0.55], rumble: [130, 0.6], ab: 1.0 },
      stats: 'Mach 2.35 · 9 g · 2 × AL-31F'
    },
    {
      id: 'a10', name: 'A-10C Thunderbolt II', role: 'Ground attack', origin: 'USA', price: 200000,
      mass: 15500, S: 47.0, span: 17.53, length: 16.26,
      thrustDry: 80600, thrustAB: 0, machThrust: -0.55,
      CL0: 0.3, CLa: 5.0, alphaStall: 0.3, flapCL: 0.6, CD0: 0.044, k: 0.058, CDw: 0.12,
      maxG: 7.3, minG: -3, rollRate: 2.0, pitchRate: 0.6, yawRate: 0.3, tauRoll: 0.25, tauPitch: 0.3,
      qRef: 3800, machLimit: 0.6, ceiling: 13700, gearH: 2.1, maxRot: 0.22, sinkLimit: 6.5, spool: 0.4,
      weapons: [{ type: 'mk82', count: 18 }, { type: 'gbu12', count: 6 }], flares: 48,
      cam: { dist: 30, height: 6, cockpit: [0, 1.3, -4.7] },
      sound: { whine: [1500, 5200, 0.07, 'sine'], roar: [1300, 0.3], rumble: [150, 0.3], ab: 0 },
      stats: 'Mach 0.56 · 7.3 g · 2 × TF34-GE-100'
    },
    {
      id: 'f35', name: 'F-35A Lightning II', role: 'Stealth multirole', origin: 'USA', price: 450000,
      mass: 22000, S: 42.7, span: 10.7, length: 15.7,
      thrustDry: 125000, thrustAB: 191000, machThrust: 0.08,
      CL0: 0.1, CLa: 3.9, alphaStall: 0.5, flapCL: 0.4, CD0: 0.02, k: 0.125, CDw: 0.032,
      maxG: 9, minG: -3, rollRate: 3.8, pitchRate: 0.9, yawRate: 0.35, tauRoll: 0.16, tauPitch: 0.24,
      qRef: 5500, machLimit: 1.6, ceiling: 15240, gearH: 1.95, maxRot: 0.23, sinkLimit: 6, spool: 0.6,
      weapons: [{ type: 'gbu31', count: 2 }, { type: 'gbu12', count: 8 }], flares: 30,
      cam: { dist: 27, height: 5.2, cockpit: [0, 1.15, -4.3] },
      sound: { whine: [700, 2700, 0.035, 'sawtooth'], roar: [600, 0.7], rumble: [120, 0.75], ab: 1.1 },
      stats: 'Mach 1.6 · 9 g · 1 × F135-PW-100'
    },
    {
      id: 'f22', name: 'F-22A Raptor', role: 'Stealth air dominance', origin: 'USA', price: 700000,
      mass: 27000, S: 78.04, span: 13.56, length: 18.92,
      thrustDry: 232000, thrustAB: 312000, machThrust: 0.14,
      CL0: 0.1, CLa: 3.8, alphaStall: 0.6, flapCL: 0.35, CD0: 0.018, k: 0.12, CDw: 0.022,
      maxG: 9, minG: -3, rollRate: 4.0, pitchRate: 1.1, yawRate: 0.45, tauRoll: 0.15, tauPitch: 0.2,
      qRef: 5000, machLimit: 2.25, ceiling: 19800, gearH: 2.0, maxRot: 0.23, sinkLimit: 6, spool: 0.7,
      weapons: [{ type: 'gbu31', count: 2 }, { type: 'gbu12', count: 6 }], flares: 36,
      cam: { dist: 31, height: 6, cockpit: [0, 1.25, -5.0] },
      sound: { whine: [800, 3000, 0.035, 'sawtooth'], roar: [750, 0.65], rumble: [140, 0.7], ab: 1.1 },
      stats: 'Mach 2.25 · 9 g · supercruise · 2 × F119-PW-100'
    },
    {
      id: 'su57', name: 'Sukhoi Su-57 Felon', role: 'Stealth multirole', origin: 'Russia', price: 650000,
      mass: 26000, S: 78.8, span: 14.1, length: 20.1,
      thrustDry: 176000, thrustAB: 294000, machThrust: 0.12,
      CL0: 0.1, CLa: 3.9, alphaStall: 0.6, flapCL: 0.35, CD0: 0.019, k: 0.118, CDw: 0.024,
      maxG: 9, minG: -3, rollRate: 3.8, pitchRate: 1.1, yawRate: 0.45, tauRoll: 0.16, tauPitch: 0.2,
      qRef: 5000, machLimit: 2.0, ceiling: 20000, gearH: 2.1, maxRot: 0.23, sinkLimit: 6, spool: 0.65,
      weapons: [{ type: 'fab500', count: 8 }, { type: 'kab1500', count: 2 }], flares: 36,
      cam: { dist: 32, height: 6, cockpit: [0, 1.3, -5.4] },
      sound: { whine: [560, 2300, 0.04, 'sawtooth'], roar: [600, 0.6], rumble: [125, 0.65], ab: 1.0 },
      stats: 'Mach 2.0 · 9 g · 2 × AL-41F1'
    },
    {
      id: 'mig29', name: 'Mikoyan MiG-29 Fulcrum', role: 'Air superiority fighter', origin: 'Russia', price: 180000,
      mass: 15300, S: 38, span: 11.36, length: 17.3,
      thrustDry: 100000, thrustAB: 163000, machThrust: 0.2,
      CL0: 0.1, CLa: 4.0, alphaStall: 0.5, flapCL: 0.4, CD0: 0.021, k: 0.12, CDw: 0.027,
      maxG: 9, minG: -3, rollRate: 4.0, pitchRate: 1.0, yawRate: 0.35, tauRoll: 0.15, tauPitch: 0.22,
      qRef: 5300, machLimit: 2.25, ceiling: 18000, gearH: 1.9, maxRot: 0.23, sinkLimit: 6, spool: 0.65,
      weapons: [{ type: 'fab500', count: 6 }], flares: 30,
      cam: { dist: 29, height: 5.5, cockpit: [0, 1.25, -4.9] },
      sound: { whine: [680, 2700, 0.045, 'sawtooth'], roar: [700, 0.55], rumble: [135, 0.6], ab: 1.0 },
      stats: 'Mach 2.25 · 9 g · 2 × RD-33'
    },
    {
      id: 'rafale', name: 'Dassault Rafale C', role: 'Omnirole fighter', origin: 'France', price: 320000,
      mass: 15000, S: 45.7, span: 10.9, length: 15.27,
      thrustDry: 100000, thrustAB: 150000, machThrust: 0.14,
      CL0: 0.06, CLa: 3.3, alphaStall: 0.56, flapCL: 0.3, CD0: 0.018, k: 0.14, CDw: 0.024,
      maxG: 9, minG: -3.2, rollRate: 4.4, pitchRate: 1.1, yawRate: 0.4, tauRoll: 0.13, tauPitch: 0.2,
      qRef: 5000, machLimit: 1.8, ceiling: 15800, gearH: 1.85, maxRot: 0.25, sinkLimit: 6.5, spool: 0.7,
      weapons: [{ type: 'gbu12', count: 6 }, { type: 'mk82', count: 6 }], flares: 32,
      cam: { dist: 27, height: 5, cockpit: [0, 1.1, -3.9] },
      sound: { whine: [950, 3300, 0.045, 'sawtooth'], roar: [850, 0.5], rumble: [150, 0.5], ab: 0.9 },
      stats: 'Mach 1.8 · 9 g · 2 × Snecma M88'
    },
    {
      id: 'typhoon', name: 'Eurofighter Typhoon', role: 'Multirole fighter', origin: 'Europe', price: 360000,
      mass: 16000, S: 51.2, span: 10.95, length: 15.96,
      thrustDry: 120000, thrustAB: 180000, machThrust: 0.16,
      CL0: 0.05, CLa: 3.2, alphaStall: 0.56, flapCL: 0.3, CD0: 0.0175, k: 0.145, CDw: 0.022,
      maxG: 9, minG: -3, rollRate: 4.4, pitchRate: 1.15, yawRate: 0.4, tauRoll: 0.13, tauPitch: 0.2,
      qRef: 5000, machLimit: 2.0, ceiling: 16800, gearH: 1.9, maxRot: 0.25, sinkLimit: 6, spool: 0.7,
      weapons: [{ type: 'gbu12', count: 6 }, { type: 'gbu31', count: 2 }], flares: 32,
      cam: { dist: 28, height: 5.2, cockpit: [0, 1.15, -4.2] },
      sound: { whine: [900, 3200, 0.04, 'sawtooth'], roar: [800, 0.55], rumble: [145, 0.55], ab: 1.0 },
      stats: 'Mach 2.0 · 9 g · 2 × EJ200'
    },
    {
      id: 'j20', name: 'Chengdu J-20 Mighty Dragon', role: 'Stealth air superiority', origin: 'China', price: 600000,
      mass: 27000, S: 78, span: 13.0, length: 21.2,
      thrustDry: 172000, thrustAB: 284000, machThrust: 0.12,
      CL0: 0.07, CLa: 3.5, alphaStall: 0.55, flapCL: 0.3, CD0: 0.0185, k: 0.125, CDw: 0.023,
      maxG: 9, minG: -3, rollRate: 3.6, pitchRate: 1.0, yawRate: 0.4, tauRoll: 0.17, tauPitch: 0.22,
      qRef: 5000, machLimit: 2.0, ceiling: 20000, gearH: 2.1, maxRot: 0.23, sinkLimit: 6, spool: 0.65,
      weapons: [{ type: 'ls6', count: 6 }], flares: 36,
      cam: { dist: 33, height: 6, cockpit: [0, 1.3, -6.2] },
      sound: { whine: [600, 2400, 0.04, 'sawtooth'], roar: [620, 0.6], rumble: [125, 0.65], ab: 1.0 },
      stats: 'Mach 2.0 · 9 g · 2 × WS-10C'
    },
    {
      id: 'b52', name: 'B-52H Stratofortress', role: 'Strategic heavy bomber', origin: 'USA', price: 800000,
      mass: 185000, S: 370, span: 56.4, length: 48.5,
      thrustDry: 608000, thrustAB: 0, machThrust: -0.4,
      CL0: 0.3, CLa: 5.2, alphaStall: 0.27, flapCL: 0.8, CD0: 0.019, k: 0.042, CDw: 0.09,
      maxG: 2.0, minG: -0.8, rollRate: 0.3, pitchRate: 0.11, yawRate: 0.07, tauRoll: 0.8, tauPitch: 0.8,
      qRef: 3000, machLimit: 0.84, ceiling: 15000, gearH: 3.5, maxRot: 0.13, sinkLimit: 4, spool: 0.3,
      weapons: [{ type: 'mk82', count: 51 }, { type: 'mk84', count: 18 }, { type: 'gbu31', count: 12 }], flares: 0,
      cam: { dist: 80, height: 15, cockpit: [-0.5, 1.75, -21.6] },
      sound: { whine: [260, 800, 0.05, 'sawtooth'], roar: [450, 0.5], rumble: [95, 0.75], ab: 0 },
      stats: 'Mach 0.84 · 31 t of bombs · 8 × TF33-P-3'
    },
    {
      id: 'b1', name: 'B-1B Lancer', role: 'Supersonic heavy bomber', origin: 'USA', price: 950000,
      mass: 150000, S: 181, span: 36.0, length: 44.5,
      thrustDry: 260000, thrustAB: 548000, machThrust: 0.05,
      CL0: 0.18, CLa: 4.6, alphaStall: 0.3, flapCL: 0.75, CD0: 0.017, k: 0.06, CDw: 0.03,
      maxG: 3.0, minG: -1, rollRate: 0.75, pitchRate: 0.2, yawRate: 0.1, tauRoll: 0.45, tauPitch: 0.55,
      qRef: 3600, machLimit: 1.25, ceiling: 18000, gearH: 3.6, maxRot: 0.16, sinkLimit: 4.5, spool: 0.45,
      weapons: [{ type: 'mk82', count: 84 }, { type: 'mk84', count: 24 }, { type: 'gbu31', count: 24 }], flares: 40,
      cam: { dist: 72, height: 13, cockpit: [-0.5, 1.6, -17.9] },
      sound: { whine: [420, 1500, 0.035, 'sawtooth'], roar: [520, 0.65], rumble: [105, 0.8], ab: 1.2 },
      stats: 'Mach 1.25 · swing wing · 4 × F101-GE-102'
    },
    {
      id: 'tu160', name: 'Tupolev Tu-160 Blackjack', role: 'Supersonic strategic bomber', origin: 'Russia', price: 1000000,
      mass: 215000, S: 400, span: 46.0, length: 54.1,
      thrustDry: 548000, thrustAB: 980000, machThrust: 0.1,
      CL0: 0.16, CLa: 4.5, alphaStall: 0.3, flapCL: 0.7, CD0: 0.016, k: 0.058, CDw: 0.028,
      maxG: 2.5, minG: -1, rollRate: 0.6, pitchRate: 0.17, yawRate: 0.09, tauRoll: 0.5, tauPitch: 0.6,
      qRef: 3600, machLimit: 2.05, ceiling: 16000, gearH: 4.0, maxRot: 0.15, sinkLimit: 4.5, spool: 0.4,
      weapons: [{ type: 'fab500', count: 60 }, { type: 'kab1500', count: 12 }], flares: 40,
      cam: { dist: 86, height: 15, cockpit: [-0.5, 1.8, -21.8] },
      sound: { whine: [380, 1300, 0.035, 'sawtooth'], roar: [480, 0.7], rumble: [95, 0.9], ab: 1.3 },
      stats: 'Mach 2.05 · swing wing · 4 × NK-32'
    },
    {
      id: 'b2', name: 'B-2A Spirit', role: 'Stealth strategic bomber', origin: 'USA', price: 1200000,
      mass: 150000, S: 478, span: 52.4, length: 21.0,
      thrustDry: 308000, thrustAB: 0, machThrust: -0.15,
      CL0: 0.12, CLa: 4.4, alphaStall: 0.3, flapCL: 0.35, CD0: 0.0095, k: 0.062, CDw: 0.07,
      maxG: 2.4, minG: -1, rollRate: 0.5, pitchRate: 0.14, yawRate: 0.08, tauRoll: 0.6, tauPitch: 0.7,
      qRef: 3200, machLimit: 0.95, ceiling: 15200, gearH: 3.4, maxRot: 0.17, sinkLimit: 4.5, spool: 0.35,
      weapons: [{ type: 'b61', count: 4 }, { type: 'mk84', count: 16 }, { type: 'mk82', count: 40 }], flares: 0,
      cam: { dist: 70, height: 13, cockpit: [-0.6, 2.1, -6.6] },
      sound: { whine: [300, 900, 0.025, 'sine'], roar: [380, 0.5], rumble: [90, 0.8], ab: 0 },
      stats: 'Mach 0.95 · 16 × B61/B83 · 4 × F118-GE-100'
    }
    ,{
      id: 'rocket', name: 'Artemis Moon Rocket', role: 'Space launch vehicle', origin: 'USA', price: 2000000, civil: true, rocket: true,
      mass: 560000, S: 80, span: 16, length: 72, thrustDry: 14000000, thrustAB: 0,
      dryMass: 60000, fuelMass: 500000, thrust: 14000000, isp: 1100, cdA: 32,
      maxG: 4.5, rollRate: 0.7, machLimit: 25, ceiling: 1e9, gearH: 37,
      weapons: [], flares: 0,
      cam: { dist: 190, height: 0, cockpit: [0, 1.4, -30] },
      sound: { whine: [50, 80, 0.0, 'sine'], roar: [320, 1.0], rumble: [75, 1.3], ab: 1.6 },
      stats: 'To the Moon · 14,000 kN thrust · 500 t of propellant'
    }
  ];
  G.aircraftById = (id) => G.AIRCRAFT.find((a) => a.id === id);
})();
