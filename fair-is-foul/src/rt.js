/* Fair Is Foul: real-time game logic. No DOM. Runs in browser and Node. */
(function (root) {
  'use strict';

  const TILE = 16, W = 58, H = 28;
  /* Room rectangles include their 1-tile wall ring: [x0, y0, x1, y1] */
  const RECTS = {
    kitchen: [2, 2, 15, 13], cellar: [2, 14, 15, 25],
    hall: [16, 2, 31, 17], chapel: [16, 18, 31, 25],
    stairs: [32, 2, 45, 13], courtyard: [32, 14, 45, 25],
    bedchamber: [46, 2, 57, 7], battlements: [46, 8, 57, 17], armory: [46, 18, 57, 25],
  };
  const ROOMS = Object.keys(RECTS);
  const LABEL = {
    hall: 'Great Hall', kitchen: 'Kitchen', cellar: 'Cellar', chapel: 'Chapel', courtyard: 'Courtyard',
    armory: 'Armory', stairs: 'Stairs', battlements: 'Battlements', bedchamber: 'Bedchamber',
  };
  const DOORS = [
    { a: 'kitchen', b: 'hall', t: [[15, 7], [16, 7], [15, 8], [16, 8]] },
    { a: 'kitchen', b: 'cellar', t: [[8, 13], [9, 13], [8, 14], [9, 14]] },
    { a: 'cellar', b: 'chapel', t: [[15, 21], [16, 21], [15, 22], [16, 22]] },
    { a: 'chapel', b: 'hall', t: [[23, 17], [24, 17], [23, 18], [24, 18]] },
    { a: 'hall', b: 'stairs', t: [[31, 6], [32, 6], [31, 7], [32, 7]] },
    { a: 'hall', b: 'courtyard', t: [[31, 15], [32, 15], [31, 16], [32, 16]] },
    { a: 'stairs', b: 'bedchamber', keep: true, t: [[45, 4], [46, 4], [45, 5], [46, 5]] },
    { a: 'stairs', b: 'battlements', t: [[45, 10], [46, 10], [45, 11], [46, 11]] },
    { a: 'battlements', b: 'armory', t: [[51, 17], [52, 17], [51, 18], [52, 18]] },
    { a: 'armory', b: 'courtyard', t: [[45, 21], [46, 21], [45, 22], [46, 22]] },
  ];
  const ADJ = {};
  ROOMS.forEach(r => ADJ[r] = []);
  DOORS.forEach(d => { ADJ[d.a].push(d.b); ADJ[d.b].push(d.a); });

  const WALK = [], ROOM_OF = [];
  for (let y = 0; y < H; y++) { WALK.push(new Array(W).fill(false)); ROOM_OF.push(new Array(W).fill(null)); }
  ROOMS.forEach(r => {
    const [x0, y0, x1, y1] = RECTS[r];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      ROOM_OF[y][x] = r;
      if (x > x0 && x < x1 && y > y0 && y < y1) WALK[y][x] = true;
    }
  });
  DOORS.forEach(d => d.t.forEach(([x, y]) => { WALK[y][x] = true; }));

  const RDIST = {};
  ROOMS.forEach(s => {
    const d = { [s]: 0 }, q = [s];
    for (let i = 0; i < q.length; i++) for (const v of ADJ[q[i]]) if (!(v in d)) { d[v] = d[q[i]] + 1; q.push(v); }
    RDIST[s] = d;
  });

  /* Task stations: (x, y) is the prop tile, the stand tile is (x, y + 1) */
  const STATIONS = [
    { id: 'torches', room: 'hall', x: 20, y: 3, name: 'Light the hall torches' },
    { id: 'throne', room: 'hall', x: 24, y: 3, name: 'Polish the throne' },
    { id: 'cauldron', room: 'kitchen', x: 5, y: 4, name: 'Stir the cauldron' },
    { id: 'roast', room: 'kitchen', x: 11, y: 4, name: 'Carve the roast' },
    { id: 'barrel', room: 'cellar', x: 5, y: 17, name: 'Tap the wine barrel' },
    { id: 'crates', room: 'cellar', x: 11, y: 21, name: 'Stack the crates' },
    { id: 'candles', room: 'chapel', x: 20, y: 20, name: 'Light the candles' },
    { id: 'bell', room: 'chapel', x: 27, y: 20, name: 'Ring the chapel bell' },
    { id: 'well', room: 'courtyard', x: 38, y: 18, name: 'Draw water from the well' },
    { id: 'trough', room: 'courtyard', x: 42, y: 21, name: 'Feed the horses' },
    { id: 'swords', room: 'armory', x: 49, y: 20, name: 'Sharpen the swords' },
    { id: 'armor', room: 'armory', x: 54, y: 20, name: 'Polish the armor' },
    { id: 'banner', room: 'stairs', x: 36, y: 4, name: 'Mend the banner' },
    { id: 'sweep', room: 'stairs', x: 41, y: 9, name: 'Sweep the stairs' },
    { id: 'beacon', room: 'battlements', x: 52, y: 11, name: 'Tend the beacon' },
    { id: 'arrows', room: 'battlements', x: 49, y: 14, name: 'Count the arrows' },
    { id: 'bed', room: 'bedchamber', x: 50, y: 4, name: 'Make the royal bed' },
    { id: 'desk', room: 'bedchamber', x: 54, y: 4, name: 'Seal the letter' },
  ];
  const STATION = {};
  STATIONS.forEach(s => { s.sx = s.x; s.sy = s.y + 1; STATION[s.id] = s; });
  const WELL = STATION.well;

  const NAMES = ['Ross', 'Lennox', 'Angus', 'Menteith', 'Caithness', 'Seyton', 'Fleance', 'Siward', 'Donalbain', 'Malcolm', 'Macduff', 'Banquo'];
  const COLORS = ['#d9433b', '#3f78d8', '#43a85a', '#e0b52f', '#8a4fc4', '#e6802e', '#d65fa0', '#35b8c6', '#e8e8f0', '#8d6a4a', '#9bd34a', '#7a7f99'];

  const CFG = {
    tasksPer: 8, botTask: [8, 13], speed: 4.5, killCd: 26, firstCd: 26, killRange: 1.9,
    bloodDur: 12, washTime: 2.5, darkDur: 12, snuffTime: 1.2, snuffProb: 0.5, riskProb: 0.1,
    sample: 3, recall: 0.75, sloppy: 0.18, sigma: 1.1, frameProb: 0.5, threshold: 2.0,
    bodySight: 3, blood: true, dark: true, meetCd: 12, maxTime: 1800,
    reportRange: 1.8, witnessRange: 4.5, bloodSight: 3.2, lockDur: 15, ghostDur: 10, lockRange: 2.6,
    manualReport: true, witnessMeeting: false,
  };

  /* ---------- seeded random ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class RNG {
    constructor(s) { this.f = mulberry32(s >>> 0); }
    random() { return this.f(); }
    range(a, b) { return a + (b - a) * this.f(); }
    choice(a) { return a[Math.floor(this.f() * a.length)]; }
    shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    gauss(m, s) { let u = 0, v = 0; while (!u) u = this.f(); while (!v) v = this.f(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    weighted(opts, w) { let t = 0; for (const x of w) t += x; let r = this.f() * t; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; } return opts[opts.length - 1]; }
  }

  /* ---------- map helpers ---------- */
  function roomAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    return ROOM_OF[ty][tx];
  }
  function walkable(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H && WALK[ty][tx]; }
  function nearestWalkable(tx, ty) {
    if (walkable(tx, ty)) return [tx, ty];
    let best = null, bd = 1e9;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (walkable(tx + dx, ty + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [tx + dx, ty + dy]; } }
    }
    return best;
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function findPath(sx, sy, tx, ty, blocked) {
    const s = nearestWalkable(Math.floor(sx), Math.floor(sy)), t = nearestWalkable(tx, ty);
    if (!s || !t) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const q = [s[1] * W + s[0]];
    prev[q[0]] = q[0];
    const goal = t[1] * W + t[0];
    for (let i = 0; i < q.length && prev[goal] === -1; i++) {
      const cx = q[i] % W, cy = (q[i] / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(nx, ny) || prev[ny * W + nx] !== -1 || (blocked && blocked.has(ny * W + nx))) continue;
        if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
        prev[ny * W + nx] = q[i]; q.push(ny * W + nx);
      }
    }
    if (prev[goal] === -1) return [];
    const path = [];
    let cur = goal;
    while (cur !== s[1] * W + s[0]) { path.push([(cur % W) + 0.5, ((cur / W) | 0) + 0.5]); cur = prev[cur]; }
    return path.reverse();
  }
  function randTile(rng, room) {
    const [x0, y0, x1, y1] = RECTS[room];
    return [x0 + 1 + Math.floor(rng.random() * (x1 - x0 - 1)), y0 + 1 + Math.floor(rng.random() * (y1 - y0 - 1))];
  }

  /* ---------- the game ---------- */
  class RT {
    constructor(o) {
      o = o || {};
      this.cfg = Object.assign({}, CFG, o.cfg || {});
      this.rng = new RNG(o.seed || 1);
      const n = o.n || 8, k = o.k || Math.max(1, Math.floor(n / 4));
      this.n = n; this.k = k;
      this.humans = new Set(o.humans || []);
      this.humanId = o.human === undefined ? (o.humans ? -1 : 0) : o.human;
      if (this.humanId >= 0) this.humans.add(this.humanId);
      let usurps = this.rng.shuffle(Array.from({ length: n }, (_, i) => i));
      const hr = o.humanRole || 'random';
      if (this.humanId >= 0 && hr !== 'random') {
        const others = usurps.filter(i => i !== this.humanId);
        usurps = hr === 'usurper' ? [this.humanId].concat(others.slice(0, k - 1)) : others.slice(0, k);
      } else usurps = usurps.slice(0, k);
      if (o.usurpers) usurps = o.usurpers.slice();
      const us = new Set(usurps);
      const names = this.rng.shuffle(NAMES).slice(0, n);
      const cols = this.rng.shuffle(COLORS).slice(0, n);
      this.players = [];
      for (let i = 0; i < n; i++) {
        const u = us.has(i);
        const st = this.rng.shuffle(STATIONS).slice(0, this.cfg.tasksPer);
        const spot = randTile(this.rng, 'hall');
        this.players.push({
          id: i, name: names[i], color: cols[i], usurp: u, alive: true, ghost: false,
          x: spot[0] + 0.5, y: spot[1] + 0.5, path: [], face: 'd', moving: false,
          tasks: u ? [] : st.map(s => ({ st: s.id, done: false })),
          nextKill: this.cfg.firstCd, bloodUntil: 0, action: null, actT: 0, wait: this.rng.range(0, 3), thinkT: 0,
          goal: null, plan: null, huntRoom: null, curTask: null, lockLeft: 1, ghostLeft: 1,
        });
      }
      this.tasksTotal = this.players.reduce((s, p) => s + p.tasks.length, 0);
      this.tasksDone = 0;
      this.time = 0; this.g = 0; this.startG = 0; this.nextSample = this.cfg.sample;
      this.dark = {}; this.bodies = []; this.truth = {}; this.obs = []; this.kills = []; this.killWitness = [];
      this.meeting = null; this.meetings = 0; this.ejections = []; this.over = null; this.events = [];
      this.totalKills = 0;
      this.locks = []; this.haunts = []; this.lockedSet = new Set();
    }

    me() { return this.humanId >= 0 ? this.players[this.humanId] : null; }
    isDark(room) { return (this.dark[room] || 0) > this.time; }
    roomOf(p) { return roomAt(p.x, p.y); }
    alivePlayers() { return this.players.filter(p => p.alive); }
    emit(type, data) { this.events.push(Object.assign({ type, time: this.time }, data || {})); }
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    /* ----- main step ----- */
    update(dt) {
      if (this.over || this.meeting) return;
      this.time += dt;
      if (this.locks.length) { const n0 = this.locks.length; this.locks = this.locks.filter(l => l.until > this.time); if (this.locks.length !== n0) this.relock(); }
      if (this.haunts.length) this.haunts = this.haunts.filter(h => h.until > this.time);
      for (const p of this.players) {
        if (!(p.alive || p.ghost)) continue;
        if (p.action) this.tickAction(p, dt);
        else if (p.path.length) this.move(p, dt); else p.moving = false;
        if (!this.humans.has(p.id)) this.think(p, dt);
        else this.humanTick(p);
        if (this.meeting || this.over) return;
      }
      while (this.time >= this.nextSample) { this.sample(); this.nextSample += this.cfg.sample; }
      if (this.time > this.cfg.maxTime) this.over = { winner: 'none', cause: 'timeout' };
    }

    move(p, dt) {
      let d = this.cfg.speed * dt * (p.ghost ? 1.1 : 1);
      p.moving = true;
      while (d > 0 && p.path.length) {
        const [tx, ty] = p.path[0];
        if (this.lockedSet.size && !p.usurp && !p.ghost && this.lockedSet.has((ty | 0) * W + (tx | 0)) && !this.lockedSet.has((p.y | 0) * W + (p.x | 0))) { p.path = []; p.moving = false; return; }
        const dx = tx - p.x, dy = ty - p.y, ds = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) p.face = dx > 0 ? 'r' : 'l'; else if (ds > 0.01) p.face = dy > 0 ? 'd' : 'u';
        if (ds <= d) { p.x = tx; p.y = ty; p.path.shift(); d -= ds; }
        else { p.x += dx / ds * d; p.y += dy / ds * d; d = 0; }
      }
      if (!p.path.length) p.moving = false;
    }

    tickAction(p, dt) {
      p.moving = false;
      p.actT -= dt;
      if (p.actT > 0) return;
      const a = p.action;
      p.action = null;
      if (a === 'working') { this.finishTask(p, p.curTask); p.curTask = null; }
      else if (a === 'washing') { p.bloodUntil = 0; this.emit('wash', { id: p.id }); }
      else if (a === 'snuffing') { this.dark[this.roomOf(p)] = this.time + this.cfg.darkDur; this.emit('snuff', { id: p.id, room: this.roomOf(p) }); }
    }

    sample() {
      const g = this.g, occ = {};
      const tr = {};
      for (const p of this.players) {
        if (!p.alive) continue;
        const r = this.roomOf(p);
        tr[p.id] = r;
        (occ[r] = occ[r] || []).push(p.id);
      }
      this.truth[g] = tr;
      for (const r of Object.keys(occ)) {
        if (this.isDark(r)) continue;
        for (const o of occ[r]) for (const q of occ[r]) if (o !== q) this.obs.push([g, o, this.appearOf(o, q), r, this.players[q].bloodUntil > this.time && this.dist(this.players[o], this.players[q]) <= this.cfg.bloodSight && !this.appearChanged(o, q)]);
      }
      this.g++;
    }

    /* ----- tasks and actions (shared by humans and bots) ----- */
    finishTask(p, t) {
      if (!t || t.done) return;
      t.done = true; this.tasksDone++;
      this.emit('task', { id: p.id, st: t.st });
      if (this.tasksDone >= this.tasksTotal) this.over = { winner: 'thane', cause: 'tasks' };
    }
    stationNear(p) {
      if (p.usurp) return null;
      const r = this.roomOf(p);
      for (const t of p.tasks) {
        if (t.done) continue;
        const s = STATION[t.st];
        if (s.room === r && Math.hypot(p.x - (s.sx + 0.5), p.y - (s.sy + 0.5)) < 2.4) return t;
      }
      return null;
    }
    completeTask(p, t) { if (p.alive || p.ghost) this.finishTask(p, t); }

    victimsNear(p) {
      const r = this.roomOf(p);
      return this.players.filter(q => q.alive && !q.usurp && q.id !== p.id && this.roomOf(q) === r && this.dist(p, q) <= this.cfg.killRange);
    }
    canKill(p) { return p.alive && p.usurp && this.time >= p.nextKill && !p.action && this.victimsNear(p).length > 0; }
    kill(p, t) {
      if (!t) { const v = this.victimsNear(p); if (!v.length) return false; t = v[0]; }
      if (!p.alive || !p.usurp || this.time < p.nextKill || !t.alive) return false;
      const room = this.roomOf(p), dark = this.isDark(room);
      t.alive = false; t.ghost = true; t.path = []; t.action = null; t.moving = false;
      const body = { id: t.id, x: t.x, y: t.y, room, reported: false, g: this.g };
      this.bodies.push(body);
      this.kills.push({ g: this.g, killer: p.id, victim: t.id, room, time: this.time });
      this.totalKills++;
      p.nextKill = this.time + this.cfg.killCd;
      p.bloodUntil = this.cfg.blood ? this.time + this.cfg.bloodDur : 0;
      p.path = []; p.action = null;
      const wit = [];
      if (!dark) for (const q of this.players) if (q.alive && !q.usurp && q.id !== t.id && this.roomOf(q) === room && this.dist(q, p) <= this.cfg.witnessRange) { wit.push(q); this.killWitness.push([this.g, q.id, this.appearOf(q.id, p.id), t.id]); }
      this.emit('kill', { killer: p.id, victim: t.id, room, dark, witnesses: wit.map(w => w.id) });
      this.checkWin();
      if (!this.over && wit.length && this.cfg.witnessMeeting) this.callMeeting({ finder: wit[0].id, body, witnessed: true, killer: p.id });
      return true;
    }
    startSnuff(p) { if (!this.cfg.dark || p.action || !p.usurp) return false; p.action = 'snuffing'; p.actT = this.cfg.snuffTime; p.path = []; return true; }
    nearWell(p) { return this.roomOf(p) === 'courtyard' && Math.hypot(p.x - (WELL.sx + 0.5), p.y - (WELL.sy + 0.5)) < 2.2; }
    startWash(p) { if (p.action || !p.usurp || !this.nearWell(p)) return false; p.action = 'washing'; p.actT = this.cfg.washTime; p.path = []; return true; }
    bodyNear(p, r) {
      const room = this.roomOf(p);
      for (const b of this.bodies) if (!b.reported && b.room === room && Math.hypot(p.x - b.x, p.y - b.y) < r) return b;
      return null;
    }
    report(p) {
      if (!p.alive) return false;
      const b = this.bodyNear(p, this.cfg.reportRange);
      if (!b || this.meeting) return false;
      this.callMeeting({ finder: p.id, body: b });
      return true;
    }
    humanTick(p) {
      if (this.cfg.manualReport) return;
      if (p.alive && !p.usurp && !this.meeting) {
        const b = this.bodyNear(p, 2.8);
        if (b) this.callMeeting({ finder: p.id, body: b });
      }
    }
    setHuman(id, on) {
      const p = this.players[id]; if (!p) return;
      if (on) this.humans.add(id); else { this.humans.delete(id); p.goal = null; p.plan = null; p.curTask = null; if (p.action === 'working') p.action = null; }
    }
    humanMove(x, y, id) {
      const p = id === undefined ? this.me() : this.players[id];
      if (!p || !(p.alive || p.ghost) || this.meeting || this.over) return;
      if (p.action === 'washing' || p.action === 'snuffing') { p.action = null; }
      const t = nearestWalkable(Math.floor(x), Math.floor(y));
      if (!t) return;
      p.path = findPath(p.x, p.y, t[0], t[1], this.blockedFor(p));
      if (!p.path.length) p.path = findPath(p.x, p.y, t[0], t[1]);
    }

    /* ----- usurper abilities: door key and Banquo's ghost ----- */
    blockedFor(p) { return (p.usurp || p.ghost || !this.lockedSet.size) ? null : this.lockedSet; }
    relock() { this.lockedSet = new Set(); this.locks.forEach(l => DOORS[l.di].t.forEach(([x, y]) => this.lockedSet.add(y * W + x))); }
    isLocked(di) { return this.locks.some(l => l.di === di); }
    doorNear(p) {
      let best = -1, bd = 1e9;
      DOORS.forEach((d, i) => {
        if (d.keep) return;
        const cx = d.t.reduce((s, t) => s + t[0] + 0.5, 0) / d.t.length, cy = d.t.reduce((s, t) => s + t[1] + 0.5, 0) / d.t.length;
        const dd = Math.hypot(p.x - cx, p.y - cy);
        if (dd < bd) { bd = dd; best = i; }
      });
      return bd <= this.cfg.lockRange ? best : -1;
    }
    canLock(p) { if (!p.usurp || !p.alive || p.action || p.lockLeft <= 0) return false; const di = this.doorNear(p); return di >= 0 && !this.isLocked(di); }
    lockDoor(p) {
      if (!this.canLock(p)) return false;
      const di = this.doorNear(p);
      this.locks.push({ di, until: this.time + this.cfg.lockDur, by: p.id });
      p.lockLeft--; this.relock();
      this.emit('lock', { door: di, a: DOORS[di].a, b: DOORS[di].b });
      return true;
    }
    ghostTargets(p) { const room = this.roomOf(p); return room ? this.players.filter(q => q.alive && this.roomOf(q) === room).map(q => q.id) : []; }
    canGhost(p) { return p.usurp && p.alive && !p.action && p.ghostLeft > 0 && this.ghostTargets(p).length >= 2 && !this.haunts.some(h => h.room === this.roomOf(p)); }
    summonGhost(p) {
      if (!this.canGhost(p)) return false;
      const room = this.roomOf(p), order = this.rng.shuffle(this.ghostTargets(p)), map = {};
      order.forEach((id, i) => { map[id] = order[(i + 1) % order.length]; });
      this.haunts.push({ room, until: this.time + this.cfg.ghostDur, map, by: p.id });
      p.ghostLeft--;
      this.emit('ghost', { room });
      return true;
    }
    /* who viewer v believes q is. During a haunting everyone in the room except the caster sees swapped faces. */
    appearOf(v, q) {
      if (!this.haunts.length) return q;
      const pq = this.players[q], pv = this.players[v], room = this.roomOf(pq);
      if (!pv || this.roomOf(pv) !== room) return q;
      for (const h of this.haunts) if (h.room === room && h.by !== v && h.map[q] !== undefined) return h.map[q];
      return q;
    }
    appearChanged(v, q) { return this.appearOf(v, q) !== q; }
    witnessNotes(id) {
      return this.killWitness.filter(k => k[0] >= this.startG && k[1] === id).map(k => ({ killer: k[2], victim: k[3] }));
    }

    /* ----- bots ----- */
    think(p, dt) {
      if (p.usurp) { if (p.alive) this.thinkUsurp(p, dt); } else this.thinkThane(p, dt);
    }
    goTo(p, tx, ty) { p.path = findPath(p.x, p.y, tx, ty, this.blockedFor(p)); if (!p.path.length) p.path = findPath(p.x, p.y, tx, ty); }
    thinkThane(p, dt) {
      const c = this.cfg, rng = this.rng;
      if (p.alive && !this.meeting) {
        const b = this.bodyNear(p, c.bodySight);
        if (b && !this.isDark(b.room)) { this.callMeeting({ finder: p.id, body: b }); return; }
      }
      if (p.action) return;
      if (p.path.length) return;
      if (p.goal && p.goal.t) {
        const s = STATION[p.goal.t.st];
        if (this.roomOf(p) === s.room && Math.hypot(p.x - (s.sx + 0.5), p.y - (s.sy + 0.5)) < 1.2) {
          p.action = 'working'; p.actT = rng.range(c.botTask[0], c.botTask[1]); p.curTask = p.goal.t; p.goal = null; p.face = 'u'; return;
        }
        p.goal = null;
      }
      const pend = p.tasks.filter(t => !t.done);
      if (pend.length) {
        const here = this.roomOf(p) || 'hall';
        let best = null, bd = 1e9;
        for (const t of pend) { const d = RDIST[here][STATION[t.st].room] + rng.random() * 0.8; if (d < bd) { bd = d; best = t; } }
        const s = STATION[best.st];
        p.goal = { t: best };
        this.goTo(p, s.sx, s.sy);
        return;
      }
      p.wait -= dt;
      if (p.wait > 0) return;
      p.wait = rng.range(2, 6);
      const room = rng.choice(ROOMS), tile = randTile(rng, room);
      this.goTo(p, tile[0], tile[1]);
    }
    thinkUsurp(p, dt) {
      const c = this.cfg, rng = this.rng;
      if (p.action) return;
      if (c.blood && p.bloodUntil > this.time) {
        if (this.nearWell(p)) { this.startWash(p); return; }
        if (p.goal !== 'well') { p.goal = 'well'; this.goTo(p, WELL.sx, WELL.sy); }
        return;
      }
      if (p.goal === 'well') p.goal = null;
      p.thinkT -= dt;
      if (p.thinkT > 0) return;
      p.thinkT = 0.3;
      const room = this.roomOf(p);
      const ready = this.time >= p.nextKill;
      const vict = this.players.filter(q => q.alive && !q.usurp && this.roomOf(q) === room);
      if (ready && vict.length) {
        const dark = this.isDark(room);
        let hunt = false;
        if (vict.length === 1 || dark) hunt = true;
        else {
          if (p.huntRoom !== room) { p.huntRoom = room; const r = rng.random(); p.plan = (c.dark && r < c.snuffProb) ? 'snuff' : (r < c.snuffProb + c.riskProb ? 'risk' : 'leave'); }
          if (p.plan === 'snuff') { p.plan = 'kill'; this.startSnuff(p); return; }
          if (p.plan === 'risk') hunt = true;
        }
        if (hunt) {
          let t = vict[0], bd = 1e9;
          for (const q of vict) { const d = this.dist(p, q); if (d < bd) { bd = d; t = q; } }
          if (bd <= c.killRange) { this.kill(p, t); return; }
          this.goTo(p, Math.floor(t.x), Math.floor(t.y));
          p.goal = 'hunt';
          return;
        }
      } else p.huntRoom = null;
      if (p.path.length && p.goal !== 'hunt') return;
      if (p.goal === 'hunt') { p.goal = null; p.path = []; }
      p.wait -= 0.3;
      if (p.wait > 0) return;
      p.wait = rng.range(2, 5);
      const pend = {};
      for (const q of this.players) if (q.alive && !q.usurp) for (const t of q.tasks) if (!t.done) { const r = STATION[t.st].room; pend[r] = (pend[r] || 0) + 1; }
      const opts = ROOMS.filter(r => r !== room);
      const tr = rng.weighted(opts, opts.map(r => 1 + (pend[r] || 0)));
      const tile = randTile(rng, tr);
      this.goTo(p, tile[0], tile[1]);
    }

    /* ----- win ----- */
    checkWin() {
      if (this.over) return;
      const ua = this.players.filter(p => p.alive && p.usurp).length;
      const ta = this.players.filter(p => p.alive && !p.usurp).length;
      if (ua === 0) this.over = { winner: 'thane', cause: 'votes' };
      else if (ua >= ta) this.over = { winner: 'usurper', cause: 'parity' };
    }

    /* ----- meetings ----- */
    callMeeting(info) {
      if (this.meeting || this.over) return;
      this.meetings++;
      const body = info.body;
      if (body) body.reported = true;
      for (const b of this.bodies) b.reported = true;
      const rng = this.rng;
      const period = [];
      for (let g = this.startG; g < this.g; g++) period.push(g);
      const periodKills = this.kills.filter(k => k.g >= this.startG);
      const alive = this.alivePlayers();
      const aid = new Set(alive.map(p => p.id));
      const claims = new Map();
      const alibi = {};
      for (const q of alive) {
        const danger = new Set();
        if (q.usurp) for (const k of periodKills) if (k.killer === q.id) { for (let g = k.g - 2; g <= k.g + 1; g++) danger.add(g); }
        const fake = rng.choice(ROOMS);
        alibi[q.id] = fake;
        const arr = [];
        for (const g of period) {
          const tr = this.truth[g];
          if (tr && tr[q.id] !== undefined) {
            let r = tr[q.id];
            if (danger.has(g)) r = fake;
            arr.push({ g, room: r });
          }
        }
        claims.set(q.id, arr);
      }
      const usurpIds = new Set(alive.filter(p => p.usurp).map(p => p.id));
      const reports = [];
      for (const [g, o, q, r, bl] of this.obs) {
        if (g < this.startG || !aid.has(o)) continue;
        if (usurpIds.has(o) && usurpIds.has(q)) continue;
        if (this.humans.has(o)) { reports.push([g, o, q, r, bl, false]); continue; }
        if (rng.random() > this.cfg.recall) continue;
        reports.push([g, o, q, r, bl, false]);
      }
      const thanes = alive.filter(p => !p.usurp).map(p => p.id);
      for (const u of usurpIds) {
        if (this.humans.has(u)) continue;
        const mine = periodKills.filter(k => k.killer === u);
        if (mine.length && thanes.length && rng.random() < this.cfg.frameProb) {
          const k = rng.choice(mine);
          reports.push([Math.max(this.startG, k.g - 1), u, rng.choice(thanes), k.room, false, true]);
        }
      }
      this.meeting = {
        n: this.meetings, info, period, claims, reports, alibi, phase: 'talk',
        victims: periodKills.map(k => ({ id: k.victim, room: k.room })),
        result: null,
      };
      this.meeting.stories = this.buildStories();
      this.emit('meeting', { n: this.meetings });
    }

    compressRoute(arr) {
      const out = [];
      for (const { room } of arr) if (!out.length || out[out.length - 1] !== room) out.push(room);
      return out.slice(-5);
    }
    buildStories() {
      const M = this.meeting, rng = this.rng, out = {};
      for (const [id, arr] of M.claims) {
        const p = this.players[id];
        const route = this.compressRoute(arr);
        const seen = [], seenKey = new Set(), blood = [];
        for (const [g, o, q, r, bl] of M.reports) {
          if (o !== id) continue;
          const key = q + '|' + r;
          if (!seenKey.has(key)) { seenKey.add(key); seen.push({ who: q, room: r }); }
          if (bl && !p.usurp) blood.push({ who: q, room: r });
        }
        const picks = rng.shuffle(seen).slice(0, 2);
        const bl = blood.length ? rng.choice(blood) : null;
        out[id] = { route, picks, blood: bl, witness: M.info.witnessed && M.info.finder === id ? M.info.killer : null };
      }
      return out;
    }
    humanAlibi(room) {
      const M = this.meeting, me = this.me();
      if (!M || !me || !me.usurp || !me.alive) return;
      const periodKills = this.kills.filter(k => k.g >= this.startG && k.killer === me.id);
      const danger = new Set();
      periodKills.forEach(k => { for (let g = k.g - 2; g <= k.g + 1; g++) danger.add(g); });
      M.alibi[me.id] = room;
      M.claims.set(me.id, M.claims.get(me.id).map(c => danger.has(c.g) ? { g: c.g, room } : c));
      M.stories = this.buildStories();
    }
    notebook(id) {
      const me = id === undefined ? this.me() : this.players[id], M = this.meeting;
      if (!me || !M) return [];
      const byG = {};
      for (const [g, o, q, r] of this.obs) if (o === me.id && g >= this.startG) (byG[g] = byG[g] || { room: r, who: [] }).who.push(q);
      const rows = [];
      for (const g of M.period) {
        const tr = this.truth[g];
        if (!tr || tr[me.id] === undefined) continue;
        const room = tr[me.id], who = (byG[g] ? byG[g].who : []).slice().sort();
        const last = rows[rows.length - 1];
        const key = room + '|' + who.join(',');
        if (last && last.key === key) continue;
        rows.push({ key, room, who });
      }
      return rows.slice(-8);
    }

    analyze() {
      const M = this.meeting, c = this.cfg;
      const alive = this.alivePlayers();
      const aid = new Set(alive.map(p => p.id));
      const usurpIds = new Set(alive.filter(p => p.usurp).map(p => p.id));
      const susp = {}, why = {};
      const add = (q, pts, text) => { susp[q] = (susp[q] || 0) + pts; (why[q] = why[q] || []).push({ pts, text }); };
      for (const [g, w, k] of this.killWitness) if (g >= this.startG && aid.has(w)) add(k, 50, `${this.players[w].name} saw the stabbing`);
      const bs = {};
      for (const [g, o, q, r, bl] of M.reports) if (bl && !usurpIds.has(o)) (bs[q] = bs[q] || new Set()).add(o);
      for (const q of Object.keys(bs)) add(+q, 4 * Math.min(2, bs[q].size), 'was seen with blood on them');
      const groups = new Map();
      const push = (k, v) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); };
      for (const [id, arr] of M.claims) for (const { g, room } of arr) push(id + ',' + g, [id, room, true]);
      for (const [g, o, q, r] of M.reports) push(q + ',' + g, [o, r, false]);
      const plural = new Map();
      for (const [key, stm] of groups) {
        const cnt = {};
        for (const [, r] of stm) cnt[r] = (cnt[r] || 0) + 1;
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
        if (top.length === 1) { plural.set(key, stm[0][1]); continue; }
        if (top[0][1] > top[1][1]) {
          plural.set(key, top[0][0]);
          for (const [who, r, selfc] of stm) if (r !== top[0][0]) add(who, selfc ? 2 : 1, selfc ? 'their story did not match what others saw' : 'a sighting they reported was contradicted');
        } else for (const [who, , selfc] of stm) add(who, selfc ? 1 : 0.5, 'stories disagree');
      }
      const bodyRooms = new Set(this.kills.filter(k => k.g >= this.startG).map(k => k.room));
      for (const br of bodyRooms) for (const q of alive) {
        for (const g of M.period) if (plural.get(q.id + ',' + g) === br) { add(q.id, 1.5, 'was near the body'); break; }
      }
      return { susp, why };
    }

    /* Resolve the vote. humanVote: player id, 'skip', or undefined (no human vote). */
    resolveVotes(humanVote) {
      const M = this.meeting, c = this.cfg, rng = this.rng;
      if (!M || M.phase === 'result') return M && M.result;
      const { susp, why } = this.analyze();
      const S = q => susp[q] || 0;
      const alive = this.alivePlayers();
      const votes = [], tally = {};
      let skip = 0;
      for (const v of alive) {
        const others = alive.filter(p => p.id !== v.id);
        let tgt;
        if (this.humans.has(v.id)) {
          const hv = (humanVote !== null && typeof humanVote === 'object') ? humanVote[v.id] : (v.id === this.humanId ? humanVote : undefined);
          tgt = hv === undefined ? 'skip' : hv;
        }
        else if (v.usurp) {
          const cand = others.filter(p => !p.usurp).sort((a, b) => S(b.id) - S(a.id));
          if (!cand.length) continue;
          tgt = (S(cand[0].id) < 1 && rng.random() < 0.5) ? 'skip' : cand[0].id;
        } else if (rng.random() < c.sloppy) tgt = rng.choice(others).id;
        else {
          let best = null, bs = -1e9;
          for (const p of others) { const s = S(p.id) + rng.gauss(0, c.sigma); if (s > bs) { bs = s; best = p.id; } }
          tgt = (S(best) < c.threshold && bs < c.threshold) ? 'skip' : best;
        }
        votes.push([v.id, tgt]);
        if (tgt === 'skip') skip++; else tally[tgt] = (tally[tgt] || 0) + 1;
      }
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      let ejected = null;
      if (top.length && top[0][1] > skip && (top.length === 1 || top[0][1] > top[1][1])) ejected = +top[0][0];
      if (ejected !== null) {
        const e = this.players[ejected];
        e.alive = false; e.ghost = !e.usurp; e.path = []; e.action = null;
        this.ejections.push(e.usurp);
      }
      const rows = alive.map(p => ({ id: p.id, score: S(p.id), why: (why[p.id] || []).map(w => w.text).filter((v, i, a) => a.indexOf(v) === i) }))
        .filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      M.result = { votes, tally, skip, ejected, ejectedUsurp: ejected === null ? null : this.players[ejected].usurp, rows };
      M.phase = 'result';
      this.checkWin();
      return M.result;
    }

    endMeeting() {
      const M = this.meeting;
      if (!M) return;
      this.meeting = null;
      this.bodies = [];
      this.dark = {};
      this.locks = []; this.haunts = []; this.relock();
      for (const p of this.players) p.bloodUntil = 0;
      this.startG = this.g;
      for (const p of this.players) {
        if (!(p.alive || p.ghost)) continue;
        const t = randTile(this.rng, 'hall');
        p.x = t[0] + 0.5; p.y = t[1] + 0.5; p.path = []; p.action = null; p.goal = null; p.moving = false; p.huntRoom = null;
        if (p.usurp) p.nextKill = Math.max(p.nextKill, this.time + this.cfg.meetCd);
      }
    }
  }

  const API = { RT, CFG, TILE, W, H, RECTS, ROOMS, LABEL, DOORS, ADJ, WALK, ROOM_OF, STATIONS, STATION, WELL, NAMES, COLORS, roomAt, walkable, findPath, RDIST, RNG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RTG = API;
})(typeof window !== 'undefined' ? window : globalThis);
