/*
 * A search-based player. It copies the world, tries short bursts of button presses and keeps the
 * attempts that get closest to the goal, which proves that a level can be finished and produces a
 * replay of button presses that finishes it.
 */
'use strict';

const SM = require('./sim.js');

const TILE = SM.TILE;
const BURST_FRAMES = 6;
const ACTIONS = [
  { right: true, run: true },
  { right: true, run: true, jump: true },
  { right: true },
  { right: true, jump: true },
  {},
  { jump: true },
  { left: true, run: true },
  { left: true, run: true, jump: true },
];

class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(node) {
    const a = this.items;
    let i = a.length;
    a.push(node);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority >= node.priority) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = node;
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1].priority > a[child].priority) child++;
        if (a[child].priority <= last.priority) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return top;
  }
}

// How many warps away from the goal each zone is; zones that cannot reach it are left out.
function zoneDistances(L) {
  const goalZone = L.flag ? L.flag.zone : L.axe.zone;
  const dist = {};
  dist[goalZone] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    L.warps.forEach(function (warp) {
      if (dist[warp.toZone] !== undefined &&
          (dist[warp.zone] === undefined || dist[warp.zone] > dist[warp.toZone] + 1)) {
        dist[warp.zone] = dist[warp.toZone] + 1;
        changed = true;
      }
    });
  }
  return dist;
}

function makeProgress(L) {
  const dist = zoneDistances(L);
  const goalX = L.flag ? L.flag.x : L.axe.tx * TILE + 8;
  return function (w) {
    const p = w.player;
    const d = dist[w.zone];
    if (d === undefined) return -Infinity;
    let target = goalX;
    if (d > 0) {
      for (let i = 0; i < L.warps.length; i++) {
        const warp = L.warps[i];
        if (warp.zone === w.zone && dist[warp.toZone] === d - 1) target = (warp.tx + 1) * TILE;
      }
    }
    return -d * 100000 - Math.abs(target - (p.x + p.w / 2));
  };
}

function stateKey(w, timeBucket) {
  const p = w.player;
  return [
    w.zone, Math.round(p.x / 2), Math.round(p.y / 2), Math.round(p.vx * 2), Math.round(p.vy),
    p.onGround ? 1 : 0, p.power, p.state === 'normal' ? 0 : p.state, w.prevJump ? 1 : 0,
    Math.floor(w.frame / timeBucket),
  ].join(',');
}

// Shares unchanged tile grids between copies; a world is always copied again before it is stepped.
function shareTiles(child, parent) {
  const a = child.tiles;
  const b = parent.tiles;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return;
  }
  child.tiles = b;
}

/*
 * Options: power (0-2), fromCheckpoint, maxExpansions, timeCost (priority lost per frame),
 * timeBucket (frames; states that differ only by less time than this count as the same).
 * Returns { solved, inputs, frames, expansions, best }.
 */
function solve(levelIndex, options) {
  options = options || {};
  const maxExpansions = options.maxExpansions || 400000;
  const timeCost = options.timeCost === undefined ? 0.5 : options.timeCost;
  const timeBucket = options.timeBucket || 24;
  const actions = options.actions || ACTIONS;
  const L = SM.Levels.get(levelIndex);
  const progress = makeProgress(L);

  const start = SM.World.create(levelIndex, { power: options.power || 0, fromCheckpoint: options.fromCheckpoint });
  const open = new Heap();
  const seen = new Set();
  open.push({ w: start, parent: null, action: -1, priority: progress(start) });
  seen.add(stateKey(start, timeBucket));

  let expansions = 0;
  let best = -Infinity;
  let goal = null;
  while (open.size > 0 && expansions < maxExpansions && !goal) {
    const node = open.pop();
    expansions++;
    for (let a = 0; a < actions.length && !goal; a++) {
      const w = SM.World.clone(node.w);
      let alive = true;
      for (let f = 0; f < BURST_FRAMES; f++) {
        SM.World.step(w, actions[a]);
        if (w.player.state === 'dying' || w.status === 'dead') {
          alive = false;
          break;
        }
        if (w.seq) break;
      }
      if (!alive) continue;
      const child = { w: w, parent: node, action: a, priority: 0 };
      if (w.seq) {
        goal = child;
        break;
      }
      const key = stateKey(w, timeBucket);
      if (seen.has(key)) continue;
      seen.add(key);
      const pr = progress(w);
      if (pr === -Infinity) continue;
      if (pr > best) best = pr;
      child.priority = pr - timeCost * w.frame;
      shareTiles(w, node.w);
      open.push(child);
    }
    node.w = null;
  }

  if (!goal) return { solved: false, expansions: expansions, best: best };

  const bursts = [];
  for (let n = goal; n.parent; n = n.parent) bursts.push(n.action);
  bursts.reverse();
  const inputs = [];
  bursts.forEach(function (a) {
    for (let f = 0; f < BURST_FRAMES; f++) inputs.push(actions[a]);
  });
  return { solved: true, inputs: inputs, bursts: bursts, expansions: expansions, best: best };
}

// Plays a list of per-frame inputs on a fresh world, then lets the end-of-level scene finish.
function replay(levelIndex, inputs, options) {
  options = options || {};
  const w = SM.World.create(levelIndex, { power: options.power || 0, fromCheckpoint: options.fromCheckpoint });
  let i = 0;
  while (w.status === 'play' && !w.seq && i < inputs.length) SM.World.step(w, inputs[i++]);
  let extra = 0;
  while (w.status === 'play' && w.seq && extra++ < 3000) SM.World.step(w, {});
  return w;
}

module.exports = { solve: solve, replay: replay, ACTIONS: ACTIONS, BURST_FRAMES: BURST_FRAMES };
