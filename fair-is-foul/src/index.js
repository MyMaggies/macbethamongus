// Fair Is Foul - multiplayer server.
// One Durable Object per table (room code A, B, C ...). The object runs the real game
// (rt.js) at 20 ticks per second and sends each iPad what it needs to draw.
import RTG from './rt.js';

const R = RTG;
const MAX_SEATS = 5;
const TUNE = {
  minPlayers: 4,               // fewest players that can start a round (4 to 5 is much better)
  talkSecs: 90, voteSecs: 25, resultSecs: 9, revealSecs: 7,
  game: { killCd: 30, firstCd: 30, maxTime: 480, tasksPer: 6 },
};
const TICK_MS = 50;

const clean = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12) || 'Player';
const num = (v) => typeof v === 'number' && isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/(ws|status|ctl)\/([A-Za-z0-9]{1,8})$/);
    if (m) {
      const id = env.ROOM.idFromName(m[2].toUpperCase());
      return env.ROOM.get(id).fetch(req);
    }
    if (url.pathname === '/health') return new Response('fair is foul server ok');
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('not found', { status: 404 });
  },
};

export class Room {
  constructor(state, env) {
    this.env = env;
    this.seats = [];            // { id (seat), pid (player number this round), token, name, ready, ws, inRound, turns }
    this.phase = 'lobby';       // lobby | reveal | play | meeting | over
    this.G = null;
    this.timer = null; this.hb = null;
    this.last = Date.now(); this.tickN = 0;
    this.events = [];
    this.mt = null;             // meeting machine
    this.revealUntil = 0;
    this.lastResult = null;
    this.round = 0;
    this.lastMove = {};
  }

  /* ---------- connections ---------- */
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/status/')) {
      return new Response(JSON.stringify(this.status()), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    }
    if (url.pathname.startsWith('/ctl/')) return this.control(url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = { ws: server, seat: null };
    server.addEventListener('message', (e) => { try { this.onMsg(conn, JSON.parse(e.data)); } catch (err) { /* ignore bad input */ } });
    const gone = () => { try { server.close(1000, 'bye'); } catch (e) { /* already closed */ } this.onClose(conn); };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Teacher controls: /ctl/<table>?key=...&cmd=start|reset
  control(url) {
    const key = (this.env && this.env.TEACHER_KEY) || '';
    const cors = { 'access-control-allow-origin': '*' };
    if (!key || url.searchParams.get('key') !== key) return new Response('wrong key', { status: 403, headers: cors });
    const cmd = url.searchParams.get('cmd');
    if (cmd === 'start') {
      if ((this.phase === 'lobby' || this.phase === 'over') && this.startRound()) return new Response('started', { headers: cors });
      return new Response('cannot start now (need ' + TUNE.minPlayers + ' players online)', { status: 409, headers: cors });
    }
    if (cmd === 'reset') {
      this.stopTimers(); this.G = null; this.mt = null; this.events = []; this.phase = 'lobby'; this.lastResult = null;
      for (const s of this.seats) { s.inRound = false; s.ready = false; }
      this.sendLobby(); if (this.online().length) this.startHeartbeat();
      return new Response('reset', { headers: cors });
    }
    return new Response('unknown command', { status: 400, headers: cors });
  }

  status() {
    return { phase: this.phase, round: this.round, seats: this.seats.map((s) => ({ id: s.id, pid: s.pid, name: s.name, online: !!s.ws, ready: s.ready, inRound: s.inRound, turns: s.turns })) };
  }
  send(seat, obj) { if (seat && seat.ws) { try { seat.ws.send(JSON.stringify(obj)); } catch (e) { /* closed */ } } }
  all(fn) { for (const s of this.seats) if (s.ws) fn(s); }
  online() { return this.seats.filter((s) => s.ws); }

  onClose(conn) {
    const s = conn.seat;
    if (!s || s.ws !== conn.ws) return;
    s.ws = null; s.ready = false;
        if (!this.online().length) this.stopTimers();
    else { this.sendLobby(); this.maybeStart(); }
  }

  onMsg(conn, m) {
    if (m.t === 'hello') return this.onHello(conn, m);
    const s = conn.seat; if (!s) return;
    const G = this.G, id = s.pid;
    switch (m.t) {
      case 'ready':
        if (this.phase === 'lobby' || this.phase === 'over') { s.ready = !!m.v; this.sendLobby(); this.maybeStart(); }
        break;
      case 'name':
        if (this.phase === 'lobby' || this.phase === 'over') { s.name = clean(m.name); this.sendLobby(); }
        break;
      case 'move': {
        if (this.phase !== 'play' || !s.inRound || !num(m.x) || !num(m.y)) break;
        const now = Date.now(); if (now - (this.lastMove[id] || 0) < 60) break; this.lastMove[id] = now;
        if (m.x < 0 || m.y < 0 || m.x > R.W || m.y > R.H) break;
        G.humanMove(m.x, m.y, id); break;
      }
      case 'kill': { if (this.phase !== 'play' || !s.inRound) break; const p = G.players[id]; if (G.canKill(p)) G.kill(p, null); break; }
      case 'snuff': if (this.phase === 'play' && s.inRound) G.startSnuff(G.players[id]); break;
      case 'wash': if (this.phase === 'play' && s.inRound) G.startWash(G.players[id]); break;
      case 'report': if (this.phase === 'play' && s.inRound && G.players[id].alive) G.report(G.players[id]); break;
      case 'task': {
        if (this.phase !== 'play' || !s.inRound) break;
        const p = G.players[id]; if (p.usurp) break;
        const t = p.tasks.find((x) => x.st === m.st && !x.done); if (!t) break;
        const st = R.STATION[t.st];
        if (st.room !== G.roomOf(p) || Math.hypot(p.x - (st.sx + 0.5), p.y - (st.sy + 0.5)) > 3.2) break;
        G.completeTask(p, t); break;
      }
      case 'mready':
        if (this.phase === 'meeting' && this.mt && this.mt.stage === 'talk' && s.inRound) { this.mt.ready.add(id); this.sendMeetStage(); }
        break;
      case 'vote': {
        if (this.phase !== 'meeting' || !this.mt || this.mt.stage !== 'vote' || !s.inRound) break;
        const p = G.players[id]; if (!p.alive || !G.humans.has(id)) break;
        const v = m.v;
        if (v !== 'skip') { const q = G.players[v]; if (!q || !q.alive || v === id) break; }
        this.mt.votes[id] = v; this.sendMeetStage(); break;
      }
      default: break;
    }
  }

  onHello(conn, m) {
    let seat = m.token ? this.seats.find((s) => s.token === m.token) : null;
    if (!seat) {
      if (this.seats.length >= MAX_SEATS) { try { conn.ws.send(JSON.stringify({ t: 'full' })); } catch (e) { /* */ } return; }
      const used = new Set(this.seats.map((s) => s.id));
      let id = 0; while (used.has(id)) id++;
      seat = { id, pid: null, token: Math.random().toString(36).slice(2) + Date.now().toString(36), name: clean(m.name), ready: false, ws: null, inRound: false, turns: 0 };
      this.seats.push(seat);
    } else if (m.name && (this.phase === 'lobby' || this.phase === 'over')) seat.name = clean(m.name);
    if (seat.ws && seat.ws !== conn.ws) { const old = seat.ws; seat.ws = null; try { old.close(); } catch (e) { /* */ } }
    conn.seat = seat; seat.ws = conn.ws;
    this.send(seat, { t: 'hi', seat: seat.id, token: seat.token });
    this.sendLobby();
    if (this.G && seat.inRound && this.phase !== 'over') {
      this.send(seat, this.roundMsg(seat));
      if (this.phase === 'meeting') this.send(seat, this.meetMsg(seat));
      if (this.phase !== 'lobby') this.send(seat, this.snapshot(seat));
      if (!this.timer && this.phase !== 'lobby') { this.last = Date.now(); this.startTimers(); }
    }
    if (this.phase === 'over' && this.lastResult) this.send(seat, { t: 'over', result: this.lastResult });
    this.startHeartbeat();
  }

  sendLobby() {
    const seats = this.seats.map((s) => ({ id: s.id, name: s.name, ready: s.ready, online: !!s.ws }));
    this.all((s) => this.send(s, { t: 'lobby', phase: this.phase, seats, you: s.id, inRound: s.inRound, round: this.round, min: TUNE.minPlayers }));
  }

  maybeStart() {
    if (this.phase !== 'lobby' && this.phase !== 'over') return;
    const on = this.online();
    if (on.length >= TUNE.minPlayers && on.every((s) => s.ready)) this.startRound();
  }

  /* ---------- rounds ---------- */
  startRound() {
    const on = this.online();
    if (on.length < TUNE.minPlayers) return false;
    on.forEach((s, i) => { s.pid = i; });
    for (const s of this.seats) if (!s.ws) s.pid = null;
    const humanIds = on.map((s) => s.pid);
    // fairest usurper: fewest turns so far, random among ties
    const min = Math.min(...on.map((s) => s.turns));
    const pool = on.filter((s) => s.turns === min);
    const u = pool[Math.floor(Math.random() * pool.length)];
    u.turns++;
    const seed = 1 + Math.floor(Math.random() * 1e9);
    this.G = new R.RT({ n: on.length, k: 1, seed, humans: humanIds, usurpers: [u.pid], cfg: TUNE.game });
    this.G.players.forEach((p) => { const s = on[p.id]; p.color = R.COLORS[s.id % R.COLORS.length]; p.name = s.name; });
    for (const s of this.seats) { s.inRound = !!s.ws; s.ready = false; }
    this.round++;
    this.events = []; this.mt = null; this.lastResult = null; this.lastMove = {};
    this.phase = 'reveal'; this.revealUntil = Date.now() + TUNE.revealSecs * 1000;
    this.sendLobby();
    for (const s of on) { this.send(s, this.roundMsg(s)); this.send(s, this.snapshot(s)); }
    this.last = Date.now(); this.tickN = 0;
    this.startTimers();
    return true;
  }

  roundMsg(seat) {
    const G = this.G, p = G.players[seat.pid];
    return {
      t: 'round', phase: this.phase, you: seat.pid, usurp: p.usurp, round: this.round,
      revealLeft: Math.max(0, this.revealUntil - Date.now()),
      players: G.players.map((q) => ({ id: q.id, name: q.name, color: q.color, human: G.humans.has(q.id) })),
      mates: p.usurp ? G.players.filter((q) => q.usurp && q.id !== p.id).map((q) => q.name) : [],
    };
  }

  snapshot(seat) {
    const G = this.G, me = G.players[seat.pid];
    const ev = this.events.filter((e) => e.to === undefined || e.to === seat.pid).map((e) => { const c = Object.assign({}, e); delete c.to; return c; });
    return {
      t: 's', ph: this.phase, time: r2(G.time), g: G.g, sg: G.startG, td: G.tasksDone, tt: G.tasksTotal,
      dark: G.dark, meetings: G.meetings, kills: G.totalKills,
      bodies: G.bodies.map((b) => ({ id: b.id, x: r2(b.x), y: r2(b.y), room: b.room, reported: b.reported })),
      p: G.players.map((q) => ({ id: q.id, x: r2(q.x), y: r2(q.y), f: q.face, mv: q.moving, a: q.alive, gh: q.ghost, ac: q.action, bl: r2(q.bloodUntil) })),
      you: { usurp: me.usurp, nk: r2(me.nextKill), tasks: me.tasks.map((t) => [t.st, t.done]) },
      ev,
    };
  }

  /* ---------- timers ---------- */
  startTimers() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.startHeartbeat();
  }
  startHeartbeat() {
    if (!this.hb) this.hb = setInterval(() => this.all((s) => this.send(s, { t: 'hb' })), 3000);
  }
  stopTimers() {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.hb) clearInterval(this.hb); this.hb = null;
  }

  tick() {
    const G = this.G; if (!G) return;
    const now = Date.now();
    const dt = Math.min(0.2, (now - this.last) / 1000); this.last = now;
    if (this.phase === 'reveal') {
      if (now >= this.revealUntil) { this.phase = 'play'; this.sendLobby(); }
      return;
    }
    if (this.phase === 'play') {
      if (G.meeting) return this.startMeeting();
      G.update(dt);
      for (const e of G.events.splice(0)) {
        if (e.type === 'meeting') continue;
        const c = Object.assign({}, e);
        if (c.type === 'kill') { delete c.killer; delete c.witnesses; }
        this.events.push(c);
      }
      if (G.meeting) return this.startMeeting();
      if (G.over) return this.endRound();
      if (++this.tickN % 2 === 0) {
        for (const s of this.online()) if (s.inRound) this.send(s, this.snapshot(s));
        this.events = [];
      }
      return;
    }
    if (this.phase === 'meeting') this.meetTick(now);
  }

  /* ---------- meetings ---------- */
  startMeeting() {
    const G = this.G;
    this.phase = 'meeting';
    this.mt = { stage: 'talk', until: Date.now() + TUNE.talkSecs * 1000, ready: new Set(), votes: {} };
    for (const s of this.online()) if (s.inRound) { this.send(s, this.snapshot(s)); this.send(s, this.meetMsg(s)); }
    this.events = [];
  }
  aliveHumans() { return this.seats.filter((s) => s.ws && s.inRound && s.pid !== null && this.G.players[s.pid] && this.G.players[s.pid].alive); }
  meetMsg(seat) {
    const G = this.G, M = G.meeting, mt = this.mt, id = seat.pid, me = G.players[id];
    const stories = {};
    for (const q of G.players) if (q.alive && !G.humans.has(q.id) && M.stories[q.id]) stories[q.id] = M.stories[q.id];
    const sawIt = G.killWitness.some((k) => k[0] >= G.startG && k[1] === id);
    return {
      t: 'meet', n: M.n, info: { finder: M.info.finder, witnessed: !!M.info.witnessed, killer: M.info.witnessed ? M.info.killer : null },
      victims: M.victims, stories, sawIt, humans: Array.from(G.humans),
      alive: G.players.filter((q) => q.alive).map((q) => q.id),
      notebook: me.alive ? G.notebook(id) : [],
      stage: mt.stage, left: Math.max(0, mt.until - Date.now()),
      ready: Array.from(mt.ready), voted: Object.keys(mt.votes).map(Number),
      result: mt.stage === 'result' ? this.resultMsg() : null,
    };
  }
  resultMsg() {
    const r = this.G.meeting && this.G.meeting.result; if (!r) return null;
    return { votes: r.votes, skip: r.skip, ejected: r.ejected, ejectedUsurp: r.ejectedUsurp };
  }
  sendMeetStage() {
    const mt = this.mt; if (!mt) return;
    const msg = { t: 'mstage', stage: mt.stage, left: Math.max(0, mt.until - Date.now()), ready: Array.from(mt.ready), voted: Object.keys(mt.votes).map(Number), result: mt.stage === 'result' ? this.resultMsg() : null };
    this.all((s) => { if (s.inRound) this.send(s, msg); });
  }
  meetTick(now) {
    const mt = this.mt, G = this.G; if (!mt) return;
    if (now - (mt.sync || 0) > 1000) { mt.sync = now; this.sendMeetStage(); }
    const live = this.aliveHumans();
    if (mt.stage === 'talk') {
      if (now >= mt.until || (live.length && live.every((s) => mt.ready.has(s.pid)))) {
        mt.stage = 'vote'; mt.until = now + TUNE.voteSecs * 1000; this.sendMeetStage();
      }
    } else if (mt.stage === 'vote') {
      if (now >= mt.until || (live.length === 0) || live.every((s) => mt.votes[s.pid] !== undefined)) {
        G.resolveVotes(mt.votes);
        mt.stage = 'result'; mt.until = now + TUNE.resultSecs * 1000; this.sendMeetStage();
      }
    } else if (mt.stage === 'result') {
      if (now >= mt.until) {
        G.endMeeting(); this.mt = null;
        if (G.over) return this.endRound();
        this.phase = 'play'; this.last = Date.now(); this.events = [];
        this.all((s) => { if (s.inRound) { this.send(s, { t: 'mend' }); this.send(s, this.snapshot(s)); } });
      }
    }
  }

  /* ---------- end ---------- */
  endRound() {
    const G = this.G;
    this.phase = 'over';
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.lastResult = {
      winner: G.over.winner, cause: G.over.cause, meetings: G.meetings, kills: G.totalKills, round: this.round,
      roles: G.players.map((p) => ({ id: p.id, name: p.name, color: p.color, usurp: p.usurp, human: true })),
    };
    for (const s of this.seats) s.ready = false;
    this.all((s) => { this.send(s, this.snapshot(s)); this.send(s, { t: 'over', result: this.lastResult }); });
    this.sendLobby();
  }
}
