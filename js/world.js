/*
 * The simulation of one level. A world is plain data so it can be copied and stepped without a
 * browser; everything that is heard or seen is reported through `world.events` and `world.fx`.
 */
(function (SM) {
  'use strict';

  const T = SM.T;
  const TILE = SM.TILE;
  const SOLID = SM.SOLID;
  const SCORE = SM.SCORE;

  const MULTI_COIN_HITS = 10;
  const BUMP_FRAMES = 12;
  const FLAG_SLIDE_SPEED = 2;
  const SCENE_TIMEOUT = 600;
  const CLEAR_FANFARE_FRAMES = 330;
  const AUTO_RIGHT = { right: true };
  const NO_PRESS = {};

  // ---------------------------------------------------------------- tiles

  function tileAt(w, tx, ty) {
    if (tx < w.zx0 || tx >= w.zx1) return T.WALL;
    if (ty < 0 || ty >= w.h) return T.AIR;
    return w.tiles[ty * w.w + tx];
  }

  function solidAt(w, tx, ty) {
    return SOLID[tileAt(w, tx, ty)] === 1;
  }

  function boxHitsSolid(w, x, y, bw, bh) {
    const x1 = Math.ceil((x + bw) / TILE) - 1;
    const y1 = Math.ceil((y + bh) / TILE) - 1;
    for (let ty = Math.floor(y / TILE); ty <= y1; ty++) {
      for (let tx = Math.floor(x / TILE); tx <= x1; tx++) {
        if (solidAt(w, tx, ty)) return true;
      }
    }
    return false;
  }

  // Moves a box sideways and stops it at walls. Returns true when it was stopped.
  function moveX(w, e, dx) {
    if (dx === 0) return false;
    e.x += dx;
    const y1 = Math.ceil((e.y + e.h) / TILE) - 1;
    const tx = dx > 0 ? Math.ceil((e.x + e.w) / TILE) - 1 : Math.floor(e.x / TILE);
    for (let ty = Math.floor(e.y / TILE); ty <= y1; ty++) {
      if (solidAt(w, tx, ty)) {
        e.x = dx > 0 ? tx * TILE - e.w : (tx + 1) * TILE;
        return true;
      }
    }
    return false;
  }

  // Moves a box up or down. Returns 1 when it landed, -1 when it hit a ceiling, 0 otherwise.
  function moveY(w, e, dy) {
    if (dy === 0) return 0;
    e.y += dy;
    const x1 = Math.ceil((e.x + e.w) / TILE) - 1;
    const ty = dy > 0 ? Math.ceil((e.y + e.h) / TILE) - 1 : Math.floor(e.y / TILE);
    for (let tx = Math.floor(e.x / TILE); tx <= x1; tx++) {
      if (solidAt(w, tx, ty)) {
        e.y = dy > 0 ? ty * TILE - e.h : (ty + 1) * TILE;
        return dy > 0 ? 1 : -1;
      }
    }
    return 0;
  }

  // ---------------------------------------------------------------- setup

  function setZone(w, zi) {
    const zone = w.level.zones[zi];
    w.zone = zi;
    w.zx0 = zone.x0;
    w.zx1 = zone.x1;
  }

  function create(levelIndex, opts) {
    opts = opts || {};
    const L = SM.Levels.get(levelIndex);
    const w = {
      levelIndex: levelIndex,
      level: L,
      w: L.w,
      h: L.h,
      tiles: L.tiles.slice(),
      contents: Object.assign({}, L.contents),
      multi: {},
      bridge: L.bridge.slice(),
      zone: 0,
      zx0: 0,
      zx1: 0,
      camX: 0,
      player: null,
      ents: [],
      fx: [],
      bumps: [],
      events: [],
      prevJump: false,
      prevRun: false,
      jumpHeld: false,
      frame: 0,
      time: L.time,
      timerOn: true,
      hurry: false,
      timeUp: false,
      score: opts.score || 0,
      coins: opts.coins || 0,
      lives: opts.lives === undefined ? SM.START_LIVES : opts.lives,
      status: 'play',
      checkpointReached: false,
      seq: null,
      flagY: L.flag ? L.flag.topY + 1 : 0,
      message: 0,
      rng: ((levelIndex + 1) * 2654435761) >>> 0,
      nextId: 1,
    };
    const fromCheckpoint = !!(opts.fromCheckpoint && L.checkpoint);
    const at = fromCheckpoint ? L.checkpoint : L.start;
    w.checkpointReached = fromCheckpoint;
    setZone(w, at.zone);
    L.spawns.forEach(function (s) {
      SM.Ent.spawnFromLevel(w, s);
    });
    w.player = SM.Player.create(at.tx * TILE + 2, (at.ty + 1) * TILE, opts.power || 0);
    updateCamera(w, true);
    return w;
  }

  // Copies everything that changes during play. Effects are cosmetic and are not carried over.
  function clone(w) {
    const c = Object.assign({}, w);
    c.tiles = w.tiles.slice();
    c.contents = Object.assign({}, w.contents);
    c.multi = Object.assign({}, w.multi);
    c.bridge = w.bridge.slice();
    c.player = Object.assign({}, w.player);
    c.ents = w.ents.map(function (e) {
      return Object.assign({}, e);
    });
    c.seq = w.seq ? Object.assign({}, w.seq) : null;
    c.fx = [];
    c.bumps = [];
    c.events = [];
    return c;
  }

  // Deterministic random integer in [0, n).
  function rnd(w, n) {
    let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  }

  // ---------------------------------------------------------------- score, coins, blocks

  function addScore(w, points, x, y) {
    if (points === '1UP') {
      w.lives++;
      w.events.push('1up');
    } else {
      w.score += points;
    }
    if (x !== undefined) w.fx.push({ kind: 'score', text: String(points), x: x, y: y, t: 0 });
  }

  function addCoin(w) {
    w.coins++;
    w.score += SCORE.coin;
    w.events.push('coin');
    if (w.coins >= 100) {
      w.coins -= 100;
      w.lives++;
      w.events.push('1up');
    }
  }

  function popCoin(w, tx, ty) {
    addCoin(w);
    w.fx.push({ kind: 'coin', x: tx * TILE, y: ty * TILE, t: 0 });
  }

  // Whatever stands on a block that is struck from below gets knocked.
  function knockAbove(w, tx, ty) {
    if (ty > 0 && w.tiles[(ty - 1) * w.w + tx] === T.COIN) {
      w.tiles[(ty - 1) * w.w + tx] = T.AIR;
      popCoin(w, tx, ty - 1);
    }
    SM.Ent.knockFromBelow(w, tx * TILE, ty * TILE);
  }

  function bump(w, tx, ty) {
    w.bumps.push({ tx: tx, ty: ty, t: 0 });
    knockAbove(w, tx, ty);
  }

  function hitBlock(w, tx, ty, big) {
    const i = ty * w.w + tx;
    const tile = w.tiles[i];
    if (tile !== T.BRICK && tile !== T.QBLOCK && tile !== T.HIDDEN) {
      w.events.push('bump');
      return;
    }
    const content = w.contents[i];
    if (content === 'coin' || content === 'multi') {
      let left = 0;
      if (content === 'multi') {
        left = (w.multi[i] === undefined ? MULTI_COIN_HITS : w.multi[i]) - 1;
        w.multi[i] = left;
      }
      if (left <= 0) {
        w.tiles[i] = T.USED;
        delete w.contents[i];
      }
      bump(w, tx, ty);
      popCoin(w, tx, ty - 1);
    } else if (content) {
      const type = content === 'power' ? (big ? 'flower' : 'mushroom')
        : content === 'star' ? 'star' : 'oneup';
      w.tiles[i] = T.USED;
      delete w.contents[i];
      bump(w, tx, ty);
      SM.Ent.spawnItem(w, type, tx, ty);
      w.events.push('sprout');
    } else if (tile === T.BRICK && big) {
      w.tiles[i] = T.AIR;
      w.score += SCORE.brick;
      w.events.push('break');
      knockAbove(w, tx, ty);
      for (let k = 0; k < 4; k++) {
        w.fx.push({
          kind: 'debris',
          x: tx * TILE + (k % 2) * 8,
          y: ty * TILE + (k < 2 ? 0 : 8),
          vx: k % 2 ? 1.2 : -1.2,
          vy: k < 2 ? -5 : -3.5,
          t: 0,
        });
      }
    } else {
      if (tile !== T.BRICK) w.tiles[i] = T.USED;
      w.events.push('bump');
      bump(w, tx, ty);
    }
  }

  // ---------------------------------------------------------------- per-frame housekeeping

  function updateFx(w) {
    for (let i = w.fx.length - 1; i >= 0; i--) {
      const f = w.fx[i];
      f.t++;
      let life = 12;
      if (f.kind === 'score') {
        f.y -= 0.5;
        life = 48;
      } else if (f.kind === 'coin') {
        life = 30;
      } else if (f.kind === 'debris') {
        f.vy += 0.3;
        f.x += f.vx;
        f.y += f.vy;
        life = 90;
      }
      if (f.t >= life) w.fx.splice(i, 1);
    }
    for (let i = w.bumps.length - 1; i >= 0; i--) {
      if (++w.bumps[i].t >= BUMP_FRAMES) w.bumps.splice(i, 1);
    }
  }

  // The camera only moves when the player leaves the middle band of the screen.
  function updateCamera(w, snap) {
    const p = w.player;
    const cx = p.x + p.w / 2;
    const ahead = SM.VIEW_W * 0.45;
    const behind = SM.VIEW_W * 0.3;
    if (snap) w.camX = cx - SM.VIEW_W * 0.4;
    else if (cx - w.camX > ahead) w.camX = cx - ahead;
    else if (cx - w.camX < behind) w.camX = cx - behind;
    w.camX = Math.max(w.zx0 * TILE, Math.min(w.zx1 * TILE - SM.VIEW_W, w.camX));
  }

  function tickTimer(w) {
    if (!w.timerOn || w.frame % SM.TIMER_TICK_FRAMES !== 0 || w.time <= 0) return;
    w.time--;
    if (w.time === SM.HURRY_TIME && !w.hurry) {
      w.hurry = true;
      w.events.push('hurry');
    }
    if (w.time === 0) {
      w.timeUp = true;
      SM.Player.die(w, false);
    }
  }

  // ---------------------------------------------------------------- pipes

  function startWarp(w, index) {
    const p = w.player;
    SM.Player.standUp(p);
    p.state = 'pipeIn';
    p.t = 0;
    p.warp = index;
    p.vx = 0;
    p.vy = 0;
    w.events.push('pipe');
  }

  function pipeFrame(w) {
    const p = w.player;
    const warp = w.level.warps[p.warp];
    p.t++;
    if (p.state === 'pipeIn') {
      const down = warp.enter === 'down';
      if (down) p.y += 1;
      else p.x += 1;
      if (p.t < (down ? p.h : TILE) + 8) return;
      setZone(w, warp.toZone);
      if (warp.exit === 'up') {
        p.x = (warp.toTx + 1) * TILE - p.w / 2;
        p.y = (warp.toTy + 1) * TILE;
        p.state = 'pipeOut';
        p.t = 0;
        p.dir = 1;
        w.events.push('pipe');
      } else {
        p.x = warp.toTx * TILE + 2;
        p.y = warp.toTy * TILE;
        p.state = 'normal';
        p.onGround = false;
      }
      w.events.push('zone');
      updateCamera(w, true);
    } else {
      const top = (warp.toTy + 1) * TILE - p.h;
      p.y -= 1;
      if (p.y <= top) {
        p.y = top;
        p.state = 'normal';
        p.onGround = true;
      }
    }
  }

  // ---------------------------------------------------------------- end-of-level scenes

  function startFlag(w) {
    const p = w.player;
    const flag = w.level.flag;
    SM.Player.standUp(p);
    const height = flag.baseY - (p.y + p.h);
    const points = height >= 128 ? 5000 : height >= 96 ? 2000 : height >= 64 ? 800
      : height >= 32 ? 400 : 100;
    addScore(w, points, flag.x + 8, Math.max(flag.topY, p.y));
    p.state = 'flag';
    p.vx = 0;
    p.vy = 0;
    p.dir = 1;
    p.star = 0;
    p.invuln = 0;
    p.x = flag.x - p.w + 2;
    p.y = Math.max(p.y, flag.topY - 4);
    w.timerOn = false;
    w.seq = { kind: 'flag', step: 0, t: 0, since: 0 };
    w.events.push('flag');
  }

  function startAxe(w) {
    const p = w.player;
    const axe = w.level.axe;
    w.tiles[axe.ty * w.w + axe.tx] = T.AIR;
    SM.Player.standUp(p);
    p.state = 'axe';
    p.vx = 0;
    p.vy = 0;
    p.star = 0;
    p.invuln = 0;
    w.timerOn = false;
    w.seq = { kind: 'axe', step: 0, t: 0, since: 0 };
    w.events.push('axe');
  }

  // Pays out the remaining time. Returns true once the clock has run down.
  function countDownTime(w, s) {
    if (w.time <= 0) return true;
    const n = Math.min(w.time, 2);
    w.time -= n;
    w.score += n * SCORE.timeBonus;
    if (s.t % 4 === 0) w.events.push('tick');
    return false;
  }

  function flagScene(w, s) {
    const p = w.player;
    const flag = w.level.flag;
    if (s.step === 0) {
      const floor = flag.baseY - p.h;
      const flagFloor = flag.baseY - TILE;
      p.y = Math.min(floor, p.y + FLAG_SLIDE_SPEED);
      w.flagY = Math.min(flagFloor, w.flagY + FLAG_SLIDE_SPEED);
      if (p.y >= floor && w.flagY >= flagFloor) nextStep(s);
    } else if (s.step === 1) {
      if (s.t === 12) {
        p.dir = -1;
        p.x = flag.x - 2;
      }
      if (s.t >= 30) {
        nextStep(s);
        p.state = 'walk';
        p.dir = 1;
        p.onGround = true;
        w.events.push('clear');
      }
    } else if (s.step === 2) {
      s.since++;
      SM.Player.move(w, AUTO_RIGHT, NO_PRESS);
      const door = w.level.castle.x + 2 * TILE + TILE / 2;
      if (p.x + p.w / 2 >= door || s.t > SCENE_TIMEOUT) {
        p.state = 'gone';
        nextStep(s);
      }
    } else {
      s.since++;
      if (countDownTime(w, s) && s.since >= CLEAR_FANFARE_FRAMES) w.status = 'complete';
    }
  }

  function axeScene(w, s) {
    const p = w.player;
    if (s.step === 0) {
      if (s.t % 4 !== 0) return;
      if (w.bridge.length > 0) {
        w.tiles[w.bridge.pop()] = T.AIR;
        w.events.push('crumble');
      } else {
        SM.Ent.dropBoss(w);
        nextStep(s);
      }
    } else if (s.step === 1) {
      if (!SM.Ent.bossFalling(w) || s.t > 150) {
        nextStep(s);
        p.state = 'walk';
        p.dir = 1;
        w.events.push('clear');
      }
    } else if (s.step === 2) {
      s.since++;
      SM.Player.move(w, AUTO_RIGHT, NO_PRESS);
      const stop = w.level.toad.tx * TILE - 24;
      if (p.x + p.w >= stop || s.t > SCENE_TIMEOUT) {
        p.state = 'idle';
        p.vx = 0;
        nextStep(s);
      }
    } else {
      s.since++;
      SM.Player.move(w, NO_PRESS, NO_PRESS);
      w.message = s.t > 150 ? 2 : s.t > 30 ? 1 : 0;
      if (countDownTime(w, s) && s.t > 420) w.status = 'complete';
    }
  }

  function nextStep(s) {
    s.step++;
    s.t = 0;
  }

  // ---------------------------------------------------------------- step

  function normalFrame(w, input, pressed) {
    SM.Ent.updateLifts(w);
    SM.Player.update(w, input, pressed);
    SM.Ent.updateAll(w);
    SM.Ent.interact(w);
    SM.Ent.sweep(w);
    updateCamera(w, false);
    tickTimer(w);
    const cp = w.level.checkpoint;
    if (cp && !w.checkpointReached && cp.zone === w.zone && w.player.x >= cp.tx * TILE) {
      w.checkpointReached = true;
    }
  }

  // Advances the world by one sixtieth of a second.
  // `input` holds the buttons that are down: left, right, down, jump, run.
  function step(w, input) {
    w.events.length = 0;
    if (w.status !== 'play') return;
    w.frame++;
    const pressed = { jump: !!input.jump && !w.prevJump, run: !!input.run && !w.prevRun };
    w.prevJump = !!input.jump;
    w.prevRun = !!input.run;
    w.jumpHeld = !!input.jump;

    const state = w.player.state;
    if (state === 'normal') {
      normalFrame(w, input, pressed);
    } else if (state === 'grow' || state === 'shrink') {
      SM.Player.transition(w);
    } else if (state === 'dying') {
      SM.Player.dying(w);
    } else if (state === 'pipeIn' || state === 'pipeOut') {
      pipeFrame(w);
    } else if (w.seq) {
      w.seq.t++;
      if (w.seq.kind === 'flag') flagScene(w, w.seq);
      else axeScene(w, w.seq);
      SM.Ent.sweep(w);
      updateCamera(w, false);
    }
    updateFx(w);
  }

  SM.World = {
    create: create,
    clone: clone,
    step: step,
    rnd: rnd,
    tileAt: tileAt,
    solidAt: solidAt,
    boxHitsSolid: boxHitsSolid,
    moveX: moveX,
    moveY: moveY,
    addScore: addScore,
    addCoin: addCoin,
    popCoin: popCoin,
    hitBlock: hitBlock,
    startWarp: startWarp,
    startFlag: startFlag,
    startAxe: startAxe,
    BUMP_FRAMES: BUMP_FRAMES,
  };
})((globalThis.SM = globalThis.SM || {}));
