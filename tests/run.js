/*
 * Headless tests for the game simulation. Run with: node tests/run.js
 *
 * The first half plays small purpose-built maps to check individual rules (jumping, blocks, enemies,
 * power-ups, lifts, pipes, the castle ending). The second half lets a search-based player finish
 * every real level, starting small, big and with fire power, and from the checkpoint.
 */
'use strict';

const assert = require('assert');
const SM = require('./sim.js');
const solver = require('./solver.js');

const TILE = SM.TILE;
const T = SM.T;
const World = SM.World;
const REAL_LEVELS = SM.LEVEL_DATA.length;
const TEST_WIDTH = 44;

const tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

// Builds a one-zone map from { rowNumber: 'text' }. Rows 13 and 14 are ground unless given, and a
// flagpole and castle are added at the right-hand end unless the map has an axe.
function makeLevel(rows, options) {
  options = options || {};
  const map = [];
  for (let r = 0; r < SM.ROWS; r++) {
    let line = rows[r] !== undefined ? rows[r] : r >= 13 ? '#'.repeat(TEST_WIDTH) : '';
    assert(line.length <= TEST_WIDTH, 'test map row ' + r + ' is too wide');
    line = line + ' '.repeat(TEST_WIDTH - line.length);
    map.push(line);
  }
  const hasAxe = map.some(function (line) {
    return line.indexOf('A') >= 0;
  });
  if (!hasAxe) {
    const chars = map[12].split('');
    chars[TEST_WIDTH - 10] = 'F';
    chars[TEST_WIDTH - 7] = '^';
    map[12] = chars.join('');
  }
  SM.LEVEL_DATA.push({
    name: 'T' + SM.LEVEL_DATA.length,
    time: options.time || 300,
    warps: options.warps || [],
    zones: [{ theme: options.theme || 'overworld', map: [map] }],
  });
  return SM.LEVEL_DATA.length - 1;
}

function play(w, input, frames) {
  const heard = [];
  for (let i = 0; i < frames; i++) {
    World.step(w, input);
    for (let k = 0; k < w.events.length; k++) heard.push(w.events[k]);
  }
  return heard;
}

// Steps until `done(w)` is true and returns the number of frames it took.
function playUntil(w, input, done, limit) {
  limit = limit || 2000;
  for (let i = 1; i <= limit; i++) {
    World.step(w, typeof input === 'function' ? input(w, i) : input);
    if (done(w)) return i;
  }
  throw new Error('condition was not reached within ' + limit + ' frames');
}

function entsOf(w, type) {
  return w.ents.filter(function (e) {
    return e.type === type && !e.dead;
  });
}

function tile(w, tx, ty) {
  return w.tiles[ty * w.w + tx];
}

function feet(w) {
  return w.player.y + w.player.h;
}

// ------------------------------------------------------------------ movement

test('a held standing jump clears four tiles and a tap is much lower', function () {
  const idx = makeLevel({ 12: '  @' });
  const peak = function (hold) {
    const w = World.create(idx);
    let top = feet(w);
    for (let i = 0; i < 90; i++) {
      World.step(w, { jump: i < hold });
      top = Math.min(top, feet(w));
    }
    assert(w.player.onGround, 'the jump should be over');
    return 13 * TILE - top;
  };
  const held = peak(60);
  const tap = peak(1);
  assert(held >= 64 && held <= 72, 'held jump height ' + held);
  assert(tap >= 14 && tap <= 34, 'tapped jump height ' + tap);
});

test('running is faster than walking and a running jump is higher', function () {
  const idx = makeLevel({ 12: '  @' });
  const walk = World.create(idx);
  play(walk, { right: true }, 90);
  const run = World.create(idx);
  play(run, { right: true, run: true }, 90);
  assert(Math.abs(walk.player.vx - SM.PHYS.maxWalk) < 1e-9, 'walk speed ' + walk.player.vx);
  assert(Math.abs(run.player.vx - SM.PHYS.maxRun) < 1e-9, 'run speed ' + run.player.vx);
  let top = feet(run);
  for (let i = 0; i < 70; i++) {
    World.step(run, { right: true, run: true, jump: true });
    top = Math.min(top, feet(run));
  }
  assert(13 * TILE - top >= 76, 'running jump height ' + (13 * TILE - top));
});

test('turning around at speed skids before reversing', function () {
  const idx = makeLevel({ 12: '  @' });
  const w = World.create(idx);
  play(w, { right: true, run: true }, 90);
  World.step(w, { left: true, run: true });
  assert(w.player.skid && w.player.vx > 0 && w.player.dir === -1, 'should skid');
  playUntil(w, { left: true, run: true }, function () {
    return w.player.vx < 0;
  }, 60);
});

test('a jump pressed just after leaving a ledge still works', function () {
  const idx = makeLevel({ 12: '  @', 13: '######' + ' '.repeat(6) + '#'.repeat(32), 14: '######' + ' '.repeat(6) + '#'.repeat(32) });
  const w = World.create(idx);
  playUntil(w, { right: true, run: true }, function () {
    return !w.player.onGround;
  }, 200);
  play(w, { right: true, run: true }, 2);
  const heard = play(w, { right: true, run: true, jump: true }, 1);
  assert(heard.indexOf('jump') >= 0, 'coyote jump');
  playUntil(w, { right: true, run: true, jump: true }, function () {
    return w.player.onGround;
  }, 120);
  assert(w.player.x > 12 * TILE, 'should have crossed the gap');
});

test('a jump pressed just before landing is remembered', function () {
  const idx = makeLevel({ 12: '  @' });
  const w = World.create(idx);
  play(w, { jump: true }, 12);
  playUntil(w, {}, function () {
    return w.player.vy > 0 && feet(w) > 13 * TILE - 6;
  }, 120);
  assert(!w.player.onGround);
  const heard = play(w, { jump: true }, 6);
  assert(heard.indexOf('jump') >= 0, 'buffered jump');
});

test('falling into a pit costs a life', function () {
  const idx = makeLevel({ 12: '  @', 13: '#####   ' + '#'.repeat(36), 14: '#####   ' + '#'.repeat(36) });
  const w = World.create(idx);
  const heard = play(w, { right: true }, 400);
  assert(heard.indexOf('die') >= 0);
  assert.strictEqual(w.status, 'dead');
});

test('one-tile gaps can be run across', function () {
  const idx = makeLevel({ 12: '  @', 13: '########## ' + '#'.repeat(33), 14: '########## ' + '#'.repeat(33) });
  const w = World.create(idx);
  play(w, { right: true, run: true }, 150);
  assert.strictEqual(w.player.state, 'normal');
  assert(w.player.x > 14 * TILE);
});

// ------------------------------------------------------------------ blocks

test('coin blocks pay once and turn into used blocks', function () {
  const idx = makeLevel({ 9: '  ?', 12: '  @' });
  const w = World.create(idx);
  const heard = play(w, { jump: true }, 40);
  assert.strictEqual(w.coins, 1);
  assert.strictEqual(w.score, SM.SCORE.coin);
  assert(heard.indexOf('coin') >= 0);
  assert.strictEqual(tile(w, 2, 9), T.USED);
  play(w, {}, 30);
  const again = play(w, { jump: true }, 40);
  assert.strictEqual(w.coins, 1);
  assert(again.indexOf('bump') >= 0);
});

test('a multi-coin brick pays ten times', function () {
  const idx = makeLevel({ 9: '  C', 12: '  @' });
  const w = World.create(idx);
  for (let i = 0; i < 14; i++) {
    play(w, { jump: true }, 30);
    play(w, {}, 30);
  }
  assert.strictEqual(w.coins, 10);
  assert.strictEqual(tile(w, 2, 9), T.USED);
});

test('small players bump bricks and big players break them', function () {
  const idx = makeLevel({ 8: '  B', 9: '', 12: '  @' });
  const small = World.create(idx);
  play(small, { jump: true }, 40);
  assert.strictEqual(tile(small, 2, 8), T.BRICK);

  const big = World.create(idx, { power: 1 });
  const heard = play(big, { jump: true }, 40);
  assert.strictEqual(tile(big, 2, 8), T.AIR);
  assert(heard.indexOf('break') >= 0);
  assert.strictEqual(big.score, SM.SCORE.brick);
});

test('a mushroom comes out of a power-up block and makes the player big', function () {
  const idx = makeLevel({ 9: '  M', 12: '  @   X' });
  const w = World.create(idx);
  const heard = play(w, { jump: true }, 40);
  assert(heard.indexOf('sprout') >= 0);
  assert.strictEqual(entsOf(w, 'mushroom').length, 1);
  // The mushroom slides right, bounces off the hard block and comes back.
  playUntil(w, {}, function () {
    return w.player.state === 'grow';
  }, 600);
  playUntil(w, {}, function () {
    return w.player.state === 'normal';
  }, 120);
  assert.strictEqual(w.player.power, 1);
  assert.strictEqual(w.player.h, 32);
  assert.strictEqual(feet(w), 13 * TILE);
  assert.strictEqual(w.score, SM.SCORE.powerup);
});

test('the same block gives a big player a fire flower', function () {
  const idx = makeLevel({ 10: '  M', 12: '  @' });
  const w = World.create(idx, { power: 1 });
  play(w, { jump: true }, 60);
  assert.strictEqual(entsOf(w, 'flower').length, 1);
  assert.strictEqual(entsOf(w, 'flower')[0].y + 14, 10 * TILE, 'the flower rests on its block');
  // Step onto the block to take it.
  w.player.y = 10 * TILE - w.player.h;
  play(w, {}, 2);
  assert.strictEqual(w.player.power, 2);
  assert.strictEqual(entsOf(w, 'flower').length, 0);
});

test('hidden blocks appear only when struck from below', function () {
  const idx = makeLevel({ 9: '    L', 12: '  @' });
  const w = World.create(idx);
  // Walking and jumping through it from the side does nothing.
  play(w, { right: true }, 20);
  assert.strictEqual(tile(w, 4, 9), T.HIDDEN);
  // Falling onto the spot from above does nothing either.
  w.player.x = 4 * TILE + 2;
  w.player.y = 6 * TILE;
  play(w, {}, 60);
  assert.strictEqual(tile(w, 4, 9), T.HIDDEN);
  assert.strictEqual(feet(w), 13 * TILE);
  const under = World.create(idx);
  under.player.x = 4 * TILE + 2;
  play(under, { jump: true }, 40);
  assert.strictEqual(tile(under, 4, 9), T.USED);
  assert.strictEqual(entsOf(under, 'oneup').length, 1);
  const lives = under.lives;
  playUntil(under, function (w2) {
    const e = entsOf(w2, 'oneup')[0];
    return e && e.x > w2.player.x ? { right: true } : { left: true };
  }, function () {
    return under.lives === lives + 1;
  }, 900);
});

test('striking a block knocks out the enemy standing on it', function () {
  const idx = makeLevel({ 8: '   g', 9: '  BBBB', 12: '   @' });
  const w = World.create(idx);
  playUntil(w, { jump: true }, function () {
    return entsOf(w, 'goomba')[0].state === 'flip';
  }, 300);
  assert.strictEqual(w.score, 100);
});

test('coins are collected by touch and a hundred of them give a life', function () {
  const idx = makeLevel({ 12: '  @ ooo' });
  const w = World.create(idx);
  play(w, { right: true }, 120);
  assert.strictEqual(w.coins, 3);
  w.coins = 99;
  const lives = w.lives;
  World.addCoin(w);
  assert.strictEqual(w.coins, 0);
  assert.strictEqual(w.lives, lives + 1);
});

// ------------------------------------------------------------------ enemies

test('stomping a goomba squashes it and bounces the player', function () {
  const idx = makeLevel({ 12: '  @    g' });
  const w = World.create(idx);
  const goomba = entsOf(w, 'goomba')[0];
  w.player.x = goomba.x - 4;
  w.player.y = goomba.y - 60;
  w.player.onGround = false;
  playUntil(w, {}, function () {
    return goomba.state === 'flat';
  }, 100);
  assert.strictEqual(w.score, 100);
  assert(w.player.vy < 0, 'should bounce');
  assert.strictEqual(w.player.state, 'normal');
});

test('walking into a goomba kills a small player and shrinks a big one', function () {
  const idx = makeLevel({ 12: '  @    g' });
  const small = World.create(idx);
  play(small, { right: true }, 300);
  assert.strictEqual(small.status, 'dead');

  const big = World.create(idx, { power: 2 });
  const heard = play(big, { right: true }, 80);
  assert(heard.indexOf('shrink') >= 0);
  playUntil(big, {}, function () {
    return big.player.state === 'normal';
  }, 120);
  assert.strictEqual(big.player.power, 0);
  assert.strictEqual(big.player.h, 16);
  assert(big.player.invuln > 0);
  assert.strictEqual(big.status, 'play');
});

test('a kicked shell knocks out a row of enemies for rising scores', function () {
  const idx = makeLevel({ 12: '  @   k      g  g  g        X' });
  const w = World.create(idx);
  // Land on the koopa, then walk into the shell to kick it.
  const koopa = entsOf(w, 'koopa')[0];
  w.player.x = koopa.x - 14;
  w.player.y = koopa.y - 60;
  w.player.onGround = false;
  playUntil(w, {}, function () {
    return koopa.state === 'shell';
  }, 100);
  assert.strictEqual(koopa.h, SM.Ent.SHELL_H);
  assert.strictEqual(koopa.y + koopa.h, 13 * TILE);
  assert.strictEqual(w.score, 100);
  playUntil(w, {}, function () {
    return w.player.onGround;
  }, 200);
  playUntil(w, function (w2) {
    const k = entsOf(w2, 'koopa')[0];
    return k.x > w2.player.x ? { right: true } : { left: true };
  }, function () {
    return entsOf(w, 'koopa')[0].state === 'slide';
  }, 300);
  assert.strictEqual(entsOf(w, 'koopa')[0].dir, 1);
  playUntil(w, {}, function () {
    return entsOf(w, 'goomba').every(function (g) {
      return g.state === 'flip';
    });
  }, 600);
  assert.strictEqual(w.score, 100 + SM.SCORE.kick + 500 + 800 + 1000);
});

test('green koopas walk off ledges and red ones turn back', function () {
  const rows = { 8: '      k', 9: '   XXXXXX', 12: '  @' };
  const green = World.create(makeLevel(rows));
  play(green, {}, 400);
  assert(entsOf(green, 'koopa')[0].y > 10 * TILE, 'green koopa should have walked off');
  const red = World.create(makeLevel({ 8: '      r', 9: '   XXXXXX', 12: '  @' }));
  play(red, {}, 600);
  const k = entsOf(red, 'koopa')[0];
  assert.strictEqual(k.y + k.h, 9 * TILE, 'red koopa should still be on the ledge');
});

test('piranha plants rise from pipes but stay down while the player stands next to them', function () {
  const idx = makeLevel({ 11: '      V', 12: '  @' });
  const w = World.create(idx);
  playUntil(w, {}, function () {
    return entsOf(w, 'piranha')[0].state === 'up';
  }, 400);
  const beside = World.create(idx);
  playUntil(beside, { right: true }, function () {
    return beside.player.x + beside.player.w >= 6 * TILE;
  }, 200);
  play(beside, { right: true }, 600);
  assert.strictEqual(entsOf(beside, 'piranha')[0].off, 0);
  assert.strictEqual(beside.player.state, 'normal');
});

test('fireballs burn enemies, at most two at a time', function () {
  const idx = makeLevel({ 12: '  @        g   k' });
  const w = World.create(idx, { power: 2 });
  let thrown = 0;
  for (let i = 0; i < 20; i++) {
    thrown += play(w, { run: i % 2 === 0 }, 1).filter(function (e) {
      return e === 'fireball';
    }).length;
  }
  assert.strictEqual(thrown, 2);
  playUntil(w, function (w2, i) {
    return { run: i % 8 < 4 };
  }, function () {
    return entsOf(w, 'goomba')[0].state === 'flip' && entsOf(w, 'koopa')[0].state === 'flip';
  }, 600);
  assert.strictEqual(w.score, 100 + SM.SCORE.fireKill);
});

test('star power knocks enemies out on contact and wears off', function () {
  const idx = makeLevel({ 12: '  @    g  g' });
  const w = World.create(idx);
  SM.Ent.spawnItem(w, 'star', 2, 12);
  const heard = play(w, {}, 60).concat(play(w, { right: true }, 240));
  assert(heard.indexOf('star') >= 0);
  assert(entsOf(w, 'goomba').every(function (g) {
    return g.state === 'flip';
  }));
  assert.strictEqual(w.player.state, 'normal');
  const end = play(w, {}, SM.STAR_FRAMES);
  assert(end.indexOf('starEnd') >= 0);
  assert.strictEqual(w.player.star, 0);
});

// ------------------------------------------------------------------ ducking, lifts, pipes

test('a big player can duck-slide under a low ceiling and crawl out', function () {
  const idx = makeLevel({ 11: '        XXXX', 12: '  @' });
  const w = World.create(idx, { power: 1 });
  // Standing tall, the gap is blocked.
  play(w, { right: true, run: true }, 120);
  assert(w.player.x + w.player.w <= 8 * TILE + 0.01, 'a standing big player should be blocked');
  // Back up, run, duck and slide in; then crawl through.
  play(w, { left: true, run: true }, 50);
  playUntil(w, { right: true, run: true }, function () {
    return w.player.x + w.player.w > 7 * TILE;
  }, 200);
  play(w, { down: true }, 12);
  assert(w.player.duck, 'should be ducking');
  playUntil(w, { right: true }, function () {
    return w.player.x > 12 * TILE + 2 && !w.player.duck;
  }, 600);
  assert.strictEqual(w.player.h, 32);
});

test('lifts carry the player sideways and up and down', function () {
  const idx = makeLevel({
    5: '                 |',
    10: '      -',
    12: '  @',
  });
  const w = World.create(idx);
  const lifts = ['h', 'v'].map(function (kind) {
    return entsOf(w, 'lift').filter(function (e) {
      return e.kind === kind;
    })[0];
  });
  const p = w.player;
  // Stand on the sideways lift.
  p.x = lifts[0].x + 18;
  p.y = lifts[0].y - p.h;
  p.onGround = false;
  play(w, {}, 5);
  assert.strictEqual(p.ride, lifts[0].id);
  const offset = p.x - lifts[0].x;
  for (let i = 0; i < 300; i++) {
    World.step(w, {});
    assert(Math.abs(p.x - lifts[0].x - offset) < 1e-6, 'carried sideways');
    assert(Math.abs(feet(w) - lifts[0].y) < 1e-6, 'feet stay on the lift');
  }
  // And the vertical one.
  p.x = lifts[1].x + 18;
  p.y = lifts[1].y - p.h - 2;
  playUntil(w, {}, function () {
    return p.ride === lifts[1].id;
  }, 30);
  for (let i = 0; i < 300; i++) {
    World.step(w, {});
    assert(Math.abs(feet(w) - lifts[1].y) < 1e-6, 'feet stay on the moving lift');
  }
  // Lifts can be jumped through from below.
  p.x = lifts[0].x + 18;
  p.y = lifts[0].y + 10;
  p.vy = -6;
  p.onGround = false;
  play(w, {}, 3);
  assert.strictEqual(p.ride, 0);
  assert(feet(w) < lifts[0].y + 16 && p.vy < 0, 'should be passing up through the lift');
  playUntil(w, {}, function () {
    return p.ride === lifts[0].id;
  }, 100);
});

test('a falling lift drops once it is stood on', function () {
  const idx = makeLevel({ 8: '      _', 12: '  @' });
  const w = World.create(idx);
  const lift = entsOf(w, 'lift')[0];
  const y0 = lift.y;
  play(w, {}, 100);
  assert.strictEqual(lift.y, y0);
  w.player.x = lift.x + 10;
  w.player.y = lift.y - w.player.h - 1;
  play(w, {}, 60);
  assert(lift.y > y0 + 20, 'the lift should be falling');
});

test('pipes lead to the bonus room and back in world 1-1', function () {
  const w = World.create(0);
  const L = w.level;
  const p = w.player;
  const down = L.warps[0];
  p.x = (down.tx + 1) * TILE - p.w / 2;
  p.y = (down.ty + 1) * TILE - p.h;
  World.step(w, {});
  assert(p.onGround, 'should stand on the pipe');
  const heard = play(w, { down: true }, 2);
  assert(heard.indexOf('pipe') >= 0);
  playUntil(w, {}, function () {
    return w.zone === 1 && p.state === 'normal' && p.onGround;
  }, 200);
  assert.strictEqual(w.camX, L.zones[1].x0 * TILE);
  // Walk along the top of the bricks through a row of coins, drop off the end and into the exit.
  const x0 = L.zones[1].x0 * TILE;
  p.x = x0 + 6 * TILE + 2;
  p.y = 10 * TILE - p.h;
  playUntil(w, { right: true }, function () {
    return p.state === 'pipeIn';
  }, 900);
  assert.strictEqual(w.coins, 11);
  playUntil(w, {}, function () {
    return w.zone === 0 && p.state === 'normal';
  }, 300);
  const out = L.warps[1];
  assert.strictEqual(feet(w), (out.toTy + 1) * TILE);
  assert(Math.abs(p.x + p.w / 2 - (out.toTx + 1) * TILE) < 1);
});

// ------------------------------------------------------------------ clock, checkpoint, endings

test('running out of time is fatal and warns at 100', function () {
  const idx = makeLevel({ 12: '  @' }, { time: 102 });
  const w = World.create(idx);
  const heard = play(w, {}, 3 * SM.TIMER_TICK_FRAMES);
  assert(heard.indexOf('hurry') >= 0);
  w.time = 1;
  play(w, {}, SM.TIMER_TICK_FRAMES + 1);
  assert(w.timeUp);
  assert.strictEqual(w.player.state, 'dying');
});

test('passing the checkpoint moves the restart point', function () {
  const w = World.create(0);
  assert(!w.checkpointReached);
  w.player.x = w.level.checkpoint.tx * TILE + 4;
  World.step(w, {});
  assert(w.checkpointReached);
  const again = World.create(0, { fromCheckpoint: true });
  assert.strictEqual(Math.floor(again.player.x / TILE), again.level.checkpoint.tx);
  assert(again.camX > 0);
});

test('the flagpole pays more the higher it is grabbed and ends the level', function () {
  const idx = makeLevel({ 12: '  @' });
  // The pole stands on a block, so it cannot be reached by walking along the ground.
  const ground = World.create(idx);
  play(ground, { right: true, run: true }, 600);
  assert(!ground.seq);
  const low = World.create(idx);
  low.player.x = low.level.flag.x - 8 - low.player.w + 4;
  low.player.y = low.level.flag.baseY - low.player.h;
  playUntil(low, { right: true }, function () {
    return low.seq;
  }, 60);
  assert.strictEqual(low.score, 100);

  const high = World.create(idx);
  const flag = high.level.flag;
  high.player.x = flag.x - 1 - high.player.w - 0.5;
  high.player.y = flag.topY;
  high.player.vx = 1.5;
  high.player.onGround = false;
  playUntil(high, { right: true }, function () {
    return high.seq;
  }, 5);
  assert.strictEqual(high.score, 5000);
  const time = high.time;
  playUntil(high, {}, function () {
    return high.status === 'complete';
  }, 2000);
  assert.strictEqual(high.player.state, 'gone');
  assert.strictEqual(high.score, 5000 + time * SM.SCORE.timeBonus);
});

test('fire bars and lava bubbles hurt', function () {
  const bar = World.create(makeLevel({ 10: '      f', 12: '  @' }));
  playUntil(bar, { right: true }, function () {
    return bar.player.x > 5 * TILE;
  }, 200);
  playUntil(bar, {}, function () {
    return bar.player.state === 'dying';
  }, 400);

  const idx = makeLevel({ 12: '  @', 13: '#####~j~' + '#'.repeat(36), 14: '#####~~~' + '#'.repeat(36) });
  const bubble = World.create(idx);
  const b = entsOf(bubble, 'podoboo')[0];
  let top = b.y;
  for (let i = 0; i < 400; i++) {
    World.step(bubble, {});
    top = Math.min(top, b.y);
  }
  assert(top < 9 * TILE, 'the bubble should leap well above the lava, reached ' + top);
  assert.strictEqual(bubble.player.state, 'normal');
  const lava = World.create(idx);
  playUntil(lava, { right: true }, function () {
    return lava.player.state === 'dying';
  }, 300);
});

function castleLevel() {
  const wall = '%'.repeat(8);
  const far = '%'.repeat(TEST_WIDTH - 20);
  return makeLevel({
    2: '%'.repeat(TEST_WIDTH),
    9: '  @            Z    A      t',
    10: wall + '============' + far,
    11: wall + '            ' + far,
    12: wall + '            ' + far,
    13: wall + '~~~~~~~~~~~~' + far,
    14: wall + '~~~~~~~~~~~~' + far,
  }, { theme: 'castle' });
}

test('the axe drops the bridge and the boss and ends the castle', function () {
  const w = World.create(castleLevel());
  const p = w.player;
  const boss = entsOf(w, 'boss')[0];
  assert(boss, 'the boss should be there');
  assert.strictEqual(boss.y + boss.h, 10 * TILE);
  // Skip the fight: put the player on the last plank of the bridge.
  p.x = 19 * TILE;
  playUntil(w, { right: true }, function () {
    return w.seq;
  }, 200);
  const all = [];
  for (let i = 0; i < 3000 && w.status === 'play'; i++) {
    World.step(w, {});
    for (let k = 0; k < w.events.length; k++) all.push(w.events[k]);
  }
  assert.strictEqual(w.status, 'complete');
  assert(all.indexOf('crumble') >= 0 && all.indexOf('bossFall') >= 0 && all.indexOf('clear') >= 0);
  assert.strictEqual(w.bridge.length, 0);
  assert.strictEqual(tile(w, 10, 10), T.AIR);
  assert.strictEqual(entsOf(w, 'boss').length, 0);
  assert.strictEqual(w.message, 2);
  assert(p.x + p.w <= w.level.toad.tx * TILE, 'the player stops in front of the toad');
  assert.strictEqual(feet(w), 10 * TILE);
});

test('five fireballs defeat the boss', function () {
  const w = World.create(castleLevel(), { power: 2 });
  const p = w.player;
  p.x = 8 * TILE - p.w - 30;
  let heard = [];
  for (let i = 0; i < 1500 && entsOf(w, 'boss').length > 0 && entsOf(w, 'boss')[0].state === 'walk'; i++) {
    // Stand on the near ledge, duck under the high flames, hop over the low ones, keep throwing.
    const flames = entsOf(w, 'flame').filter(function (f) {
      return f.x - (p.x + p.w) < 40 && f.x + f.w > p.x - 4;
    });
    const low = flames.some(function (f) {
      return f.y > 9 * TILE;
    });
    heard = heard.concat(play(w, { run: i % 6 < 3, jump: low, down: flames.length > 0 && !low }, 1));
    if (p.state !== 'normal') break;
  }
  assert(heard.indexOf('bossDie') >= 0, 'the boss should be defeated; player state ' + p.state);
  assert.strictEqual(heard.filter(function (e) {
    return e === 'bossHit';
  }).length, 4);
  assert(w.score >= SM.SCORE.boss);
});

// ------------------------------------------------------------------ the real levels

function standsOnSolid(w, p) {
  const bottom = p.y + p.h;
  if (bottom % TILE !== 0) return false;
  for (let tx = Math.floor(p.x / TILE); tx <= Math.ceil((p.x + p.w) / TILE) - 1; tx++) {
    if (World.solidAt(w, tx, bottom / TILE)) return true;
  }
  return false;
}

test('every level start and checkpoint is a clear spot on solid ground', function () {
  for (let i = 0; i < REAL_LEVELS; i++) {
    [false, true].forEach(function (fromCheckpoint) {
      if (fromCheckpoint && !SM.Levels.get(i).checkpoint) return;
      [0, 1].forEach(function (power) {
        const w = World.create(i, { fromCheckpoint: fromCheckpoint, power: power });
        const p = w.player;
        const where = SM.LEVEL_DATA[i].name + (fromCheckpoint ? ' checkpoint' : ' start');
        assert(!World.boxHitsSolid(w, p.x, p.y, p.w, p.h), where + ' is inside a wall');
        assert(standsOnSolid(w, p), where + ' is not on the ground');
      });
    });
  }
});

test('no enemy or item starts inside a wall', function () {
  for (let i = 0; i < REAL_LEVELS; i++) {
    const w = World.create(i);
    w.ents.forEach(function (e) {
      if (e.type === 'piranha' || e.type === 'firebar' || e.type === 'lift' || e.type === 'podoboo') return;
      assert(!World.boxHitsSolid(w, e.x, e.y, e.w, e.h),
        SM.LEVEL_DATA[i].name + ': ' + e.type + ' at ' + Math.floor(e.x / TILE) + ',' + Math.floor(e.y / TILE) + ' is inside a wall');
    });
  }
});

test('every warp pipe can be entered and leads to solid ground in its zone', function () {
  for (let i = 0; i < REAL_LEVELS; i++) {
    const L = SM.Levels.get(i);
    L.warps.forEach(function (warp, k) {
      const where = L.name + ' warp ' + k;
      const w = World.create(i, { power: 1 });
      const zone = L.zones[warp.zone];
      w.zone = warp.zone;
      w.zx0 = zone.x0;
      w.zx1 = zone.x1;
      const p = w.player;
      p.y = (warp.ty + 1) * TILE - p.h;
      if (warp.enter === 'down') {
        p.x = (warp.tx + 1) * TILE - p.w / 2;
      } else {
        p.x = (warp.tx + 1) * TILE - p.w - 4;
      }
      World.step(w, {});
      assert(p.onGround && p.state === 'normal', where + ': cannot stand at the entrance');
      playUntil(w, warp.enter === 'down' ? { down: true } : { right: true }, function () {
        return p.state === 'pipeIn';
      }, 60);
      playUntil(w, {}, function () {
        return p.state === 'normal' && p.onGround;
      }, 400);
      assert.strictEqual(w.zone, warp.toZone, where + ': arrived in the wrong zone');
      assert(!World.boxHitsSolid(w, p.x, p.y, p.w, p.h), where + ': arrived inside a wall');
      const z = L.zones[warp.toZone];
      assert(w.camX >= z.x0 * TILE && w.camX + SM.VIEW_W <= z.x1 * TILE, where + ': camera outside the zone');
    });
  }
});

test('copies of a world replay identically', function () {
  const a = World.create(0);
  const inputs = [];
  for (let i = 0; i < 500; i++) inputs.push({ right: i % 90 < 70, run: true, jump: i % 50 < 22 });
  for (let i = 0; i < 250; i++) World.step(a, inputs[i]);
  const b = World.clone(a);
  for (let i = 250; i < 500; i++) {
    World.step(a, inputs[i]);
    World.step(b, inputs[i]);
  }
  assert.deepStrictEqual(b.player, a.player);
  assert.deepStrictEqual(b.ents, a.ents);
  assert.strictEqual(b.score, a.score);
});

for (let i = 0; i < REAL_LEVELS; i++) {
  const name = SM.LEVEL_DATA[i].name;
  [0, 1, 2].forEach(function (power) {
    test('world ' + name + ' can be finished starting ' + ['small', 'big', 'with fire'][power], function () {
      const result = solver.solve(i, { power: power });
      assert(result.solved, 'no route found after ' + result.expansions + ' attempts');
      const w = solver.replay(i, result.inputs, { power: power });
      assert.strictEqual(w.status, 'complete');
      return (result.inputs.length / 60).toFixed(1) + 's of play, ' + result.expansions + ' attempts';
    });
  });
  if (SM.Levels.get(i).checkpoint) {
    test('world ' + name + ' can be finished from its checkpoint', function () {
      const result = solver.solve(i, { fromCheckpoint: true });
      assert(result.solved, 'no route found after ' + result.expansions + ' attempts');
      const w = solver.replay(i, result.inputs, { fromCheckpoint: true });
      assert.strictEqual(w.status, 'complete');
      return (result.inputs.length / 60).toFixed(1) + 's of play, ' + result.expansions + ' attempts';
    });
  }
}

// ------------------------------------------------------------------ runner

let failed = 0;
const only = process.argv[2];
tests.forEach(function (t) {
  if (only && t.name.indexOf(only) < 0) return;
  const started = Date.now();
  try {
    const note = t.fn();
    console.log('ok    ' + t.name + (note ? ' (' + note + ')' : '') + '  [' + (Date.now() - started) + ' ms]');
  } catch (err) {
    failed++;
    console.log('FAIL  ' + t.name + '\n      ' + String(err && err.stack ? err.stack : err).split('\n').slice(0, 4).join('\n      '));
  }
});
console.log(failed === 0 ? '\nAll tests passed.' : '\n' + failed + ' test(s) failed.');
process.exit(failed === 0 ? 0 : 1);
