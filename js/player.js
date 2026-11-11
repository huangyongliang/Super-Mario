/* The player: running, jumping, ducking, tile and lift collisions, power-ups, damage and triggers. */
(function (SM) {
  'use strict';

  const T = SM.T;
  const TILE = SM.TILE;
  const P = SM.PHYS;
  const World = SM.World;

  const SMALL_H = 16;
  const BIG_H = 32;
  const TRANSITION_FRAMES = 45;
  const INVULNERABLE_FRAMES = 150;
  const DEATH_PAUSE_FRAMES = 30;
  const DEATH_TOTAL_FRAMES = 190;

  function create(x, bottomY, power) {
    const h = power > 0 ? BIG_H : SMALL_H;
    return {
      x: x,
      y: bottomY - h,
      w: 12,
      h: h,
      vx: 0,
      vy: 0,
      dir: 1,
      power: power, // 0 small, 1 super, 2 fire
      state: 'normal',
      t: 0,
      onGround: true,
      duck: false,
      skid: false,
      jumpHolding: false,
      gHold: P.jumps[0].hold,
      gFall: P.jumps[0].fall,
      airMax: P.maxWalk,
      coyote: 0,
      jumpBuf: 0,
      ride: 0,
      invuln: 0,
      star: 0,
      combo: 0,
      walkT: 0,
      throwT: 0,
      warp: -1,
      pit: false,
      fromPower: 0,
      nextPower: 0,
    };
  }

  function jumpFor(speed) {
    for (let i = 0; i < P.jumps.length; i++) {
      if (speed < P.jumps[i].below) return P.jumps[i];
    }
    return P.jumps[P.jumps.length - 1];
  }

  function toward0(v, amount) {
    if (v > 0) return Math.max(0, v - amount);
    return Math.min(0, v + amount);
  }

  function canStand(w, p) {
    return !World.boxHitsSolid(w, p.x, p.y - (BIG_H - SMALL_H), p.w, BIG_H - SMALL_H);
  }

  function duck(p) {
    p.duck = true;
    p.h = SMALL_H;
    p.y += BIG_H - SMALL_H;
  }

  function standUp(p) {
    if (!p.duck) return;
    p.duck = false;
    p.h = BIG_H;
    p.y -= BIG_H - SMALL_H;
  }

  // ---------------------------------------------------------------- collisions

  function moveX(w, p, dx) {
    p.x += dx;
    const y0 = Math.floor(p.y / TILE);
    const y1 = Math.ceil((p.y + p.h) / TILE) - 1;
    const tx = dx > 0 ? Math.ceil((p.x + p.w) / TILE) - 1 : Math.floor(p.x / TILE);
    let hit = false;
    let onlyFeet = true;
    for (let ty = y0; ty <= y1; ty++) {
      if (World.solidAt(w, tx, ty)) {
        hit = true;
        if (ty !== y1) onlyFeet = false;
      }
    }
    if (!hit) return false;
    if (onlyFeet && p.vy >= 0) {
      const top = y1 * TILE;
      const depth = p.y + p.h - top;
      if (depth > 0 && depth <= P.stepUp && !World.boxHitsSolid(w, p.x, top - p.h, p.w, p.h)) {
        p.y = top - p.h;
        p.vy = 0;
        return false;
      }
    }
    p.x = dx > 0 ? tx * TILE - p.w : (tx + 1) * TILE;
    return true;
  }

  // Returns -1 when the head struck a block, 1 when the feet landed, 0 otherwise.
  function moveY(w, p, dy) {
    p.y += dy;
    const x0 = Math.floor(p.x / TILE);
    const x1 = Math.ceil((p.x + p.w) / TILE) - 1;
    if (dy > 0) {
      const ty = Math.ceil((p.y + p.h) / TILE) - 1;
      for (let tx = x0; tx <= x1; tx++) {
        if (World.solidAt(w, tx, ty)) {
          p.y = ty * TILE - p.h;
          return 1;
        }
      }
      return 0;
    }

    const ty = Math.floor(p.y / TILE);
    const cameFromBelow = p.y - dy >= (ty + 1) * TILE - 0.001;
    const blocks = function (tx) {
      const tile = World.tileAt(w, tx, ty);
      return SM.SOLID[tile] === 1 || (tile === T.HIDDEN && cameFromBelow);
    };
    const left = blocks(x0);
    const right = x1 !== x0 && blocks(x1);
    if (!left && !right) return 0;

    const centre = Math.floor((p.x + p.w / 2) / TILE);
    let struck = centre;
    if (left !== right) {
      struck = left ? x0 : x1;
      if (struck !== centre) {
        // Only a corner of the head is under the block: slide around it if the overlap is small.
        const overlap = left ? (x0 + 1) * TILE - p.x : p.x + p.w - x1 * TILE;
        const nudged = left ? (x0 + 1) * TILE : x1 * TILE - p.w;
        if (overlap <= P.cornerNudge && !World.boxHitsSolid(w, nudged, p.y, p.w, p.h)) {
          p.x = nudged;
          return 0;
        }
      }
    }
    p.y = (ty + 1) * TILE;
    World.hitBlock(w, struck, ty, p.power > 0);
    return -1;
  }

  function standsOnTile(w, p) {
    const bottom = p.y + p.h;
    if (bottom % TILE !== 0) return false;
    const ty = bottom / TILE;
    const x1 = Math.ceil((p.x + p.w) / TILE) - 1;
    for (let tx = Math.floor(p.x / TILE); tx <= x1; tx++) {
      if (World.solidAt(w, tx, ty)) return true;
    }
    return false;
  }

  // Lifts are solid only from above: land on one when the feet cross its top on the way down.
  function landOnLift(w, p, dy) {
    if (dy < 0) return false;
    const bottom = p.y + p.h;
    const before = bottom - dy;
    for (let i = 0; i < w.ents.length; i++) {
      const e = w.ents[i];
      if (e.type !== 'lift' || e.dead || e.zone !== w.zone) continue;
      if (p.x + p.w <= e.x || p.x >= e.x + e.w) continue;
      if (before <= Math.max(e.y, e.prevY) + 0.01 && bottom >= e.y - 0.01) {
        // A lift rising under a low ceiling slips past instead of crushing its rider.
        if (World.boxHitsSolid(w, p.x, e.y - p.h, p.w, p.h)) continue;
        p.y = e.y - p.h;
        p.ride = e.id;
        if (e.kind === 'fall') e.falling = true;
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- movement

  function steer(w, p, input) {
    const dirIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speed = Math.abs(p.vx);
    if (!p.onGround) {
      // No friction in the air, and less control than on the ground.
      if (dirIn === 0) return;
      const forward = speed === 0 || Math.sign(p.vx) === dirIn;
      const accel = speed >= P.maxWalk ? P.runAccel : forward ? P.walkAccel : P.releaseDecel;
      p.vx += dirIn * accel;
      if (Math.abs(p.vx) > p.airMax) p.vx = Math.sign(p.vx) * p.airMax;
      p.dir = dirIn;
      return;
    }
    p.skid = false;
    if (p.duck) {
      // Ducking slides to a stop, except under a low ceiling where it crawls so nobody gets stuck.
      if (dirIn !== 0 && !canStand(w, p)) {
        p.vx = dirIn * P.crawl;
        p.dir = dirIn;
      } else {
        p.vx = toward0(p.vx, P.releaseDecel);
      }
    } else if (dirIn === 0) {
      p.vx = toward0(p.vx, P.releaseDecel);
    } else if (speed > 0 && Math.sign(p.vx) !== dirIn) {
      p.skid = speed > P.skidTurn;
      p.vx = p.skid ? p.vx + dirIn * P.skidDecel : 0;
      p.dir = dirIn;
    } else {
      const max = input.run ? P.maxRun : P.maxWalk;
      let s = Math.max(speed, P.minWalk);
      s = s > max ? Math.max(max, s - P.releaseDecel) : Math.min(max, s + (input.run ? P.runAccel : P.walkAccel));
      p.vx = dirIn * s;
      p.dir = dirIn;
    }
  }

  // One frame of movement: carry, duck, steer, jump, collide, gravity.
  function move(w, input, pressed) {
    const p = w.player;
    const wasOnGround = p.onGround;

    if (p.ride) {
      const lift = SM.Ent.byId(w, p.ride);
      if (lift) {
        World.moveX(w, p, lift.x - lift.prevX);
        World.moveY(w, p, lift.y - lift.prevY);
      }
    }

    if (p.onGround) {
      if (p.power > 0 && input.down) {
        if (!p.duck) duck(p);
      } else if (p.duck && canStand(w, p)) {
        standUp(p);
      }
    }

    steer(w, p, input);

    if (pressed.jump) p.jumpBuf = P.jumpBufferFrames;
    else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) p.coyote = P.coyoteFrames;
    else if (p.coyote > 0) p.coyote--;
    if (!input.jump) p.jumpHolding = false;

    if (p.jumpBuf > 0 && p.coyote > 0) {
      const speed = Math.abs(p.vx);
      const jump = jumpFor(speed);
      p.vy = jump.v0;
      p.gHold = jump.hold;
      p.gFall = jump.fall;
      p.airMax = speed > P.maxWalk ? P.maxRun : P.maxWalk;
      p.jumpHolding = !!input.jump;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.ride = 0;
      w.events.push(p.power > 0 ? 'jumpBig' : 'jump');
    }

    if (p.vx !== 0 && moveX(w, p, p.vx)) p.vx = 0;

    const dy = p.vy;
    if (dy !== 0 && moveY(w, p, dy) < 0) {
      p.vy = 1;
      p.jumpHolding = false;
    }

    p.ride = 0;
    const grounded = p.vy >= 0 && (standsOnTile(w, p) || landOnLift(w, p, dy));
    if (grounded) {
      p.vy = 0;
      p.combo = 0;
      p.walkT += Math.abs(p.vx);
    } else {
      if (wasOnGround && p.vy >= 0) {
        // Walked off a ledge: fall the way a jump from this speed would.
        const speed = Math.abs(p.vx);
        p.gFall = jumpFor(speed).fall;
        p.airMax = speed > P.maxWalk ? P.maxRun : P.maxWalk;
      }
      const gravity = p.jumpHolding && p.vy < 0 ? p.gHold : p.gFall;
      p.vy = Math.min(p.vy + gravity, P.maxFall);
    }
    p.onGround = grounded;
  }

  function collectCoins(w, p) {
    const x1 = Math.ceil((p.x + p.w) / TILE) - 1;
    const y1 = Math.min(w.h - 1, Math.ceil((p.y + p.h) / TILE) - 1);
    for (let ty = Math.max(0, Math.floor(p.y / TILE)); ty <= y1; ty++) {
      for (let tx = Math.floor(p.x / TILE); tx <= x1; tx++) {
        if (World.tileAt(w, tx, ty) === T.COIN) {
          w.tiles[ty * w.w + tx] = T.AIR;
          World.addCoin(w);
        }
      }
    }
  }

  // Pits, lava, the flagpole, the axe and warp pipes. Returns true when one of them took over.
  function triggers(w, p, input) {
    const L = w.level;
    const cx = p.x + p.w / 2;
    const bottom = p.y + p.h;

    if (p.y > w.h * TILE + 8) {
      die(w, true);
      return true;
    }
    if (World.tileAt(w, Math.floor(cx / TILE), Math.floor((bottom - 6) / TILE)) === T.LAVA) {
      die(w, false);
      return true;
    }

    const flag = L.flag;
    if (flag && flag.zone === w.zone && p.x + p.w >= flag.x - 1 && p.x <= flag.x + 1 &&
        bottom <= flag.baseY) {
      World.startFlag(w);
      return true;
    }

    const axe = L.axe;
    if (axe && axe.zone === w.zone && w.tiles[axe.ty * w.w + axe.tx] === T.AXE &&
        p.x < (axe.tx + 1) * TILE && p.x + p.w > axe.tx * TILE &&
        p.y < (axe.ty + 1) * TILE && bottom > axe.ty * TILE) {
      World.startAxe(w);
      return true;
    }

    if (!p.onGround) return false;
    for (let i = 0; i < L.warps.length; i++) {
      const warp = L.warps[i];
      if (warp.zone !== w.zone || Math.abs(bottom - (warp.ty + 1) * TILE) > 0.01) continue;
      const entering = warp.enter === 'down'
        ? input.down && Math.abs(cx - (warp.tx + 1) * TILE) <= 8
        : input.right && p.x + p.w >= (warp.tx + 1) * TILE - 0.5 && p.x < (warp.tx + 1) * TILE;
      if (entering) {
        World.startWarp(w, i);
        return true;
      }
    }
    return false;
  }

  function update(w, input, pressed) {
    const p = w.player;
    if (p.invuln > 0) p.invuln--;
    if (p.throwT > 0) p.throwT--;
    if (p.star > 0 && --p.star === 0) w.events.push('starEnd');

    move(w, input, pressed);
    if (pressed.run && p.power === 2 && !p.duck) SM.Ent.throwFireball(w);
    collectCoins(w, p);
    triggers(w, p, input);
  }

  // ---------------------------------------------------------------- power-ups and damage

  function grow(w, power) {
    const p = w.player;
    w.events.push('powerup');
    if (power <= p.power) return;
    if (p.power > 0) {
      p.power = power;
      return;
    }
    p.state = 'grow';
    p.t = 0;
    p.nextPower = power;
  }

  function hurt(w) {
    const p = w.player;
    if (p.state !== 'normal' || p.invuln > 0 || p.star > 0) return;
    if (p.power === 0) {
      die(w, false);
      return;
    }
    p.fromPower = p.power;
    p.power = 0;
    if (p.duck) {
      p.duck = false;
    } else {
      p.h = SMALL_H;
      p.y += BIG_H - SMALL_H;
    }
    p.state = 'shrink';
    p.t = 0;
    w.events.push('shrink');
  }

  // Runs while the world is frozen for the grow and shrink animations.
  function transition(w) {
    const p = w.player;
    if (++p.t < TRANSITION_FRAMES) return;
    if (p.state === 'grow') {
      p.power = p.nextPower;
      p.h = BIG_H;
      p.y -= BIG_H - SMALL_H;
      if (World.boxHitsSolid(w, p.x, p.y, p.w, p.h)) duck(p);
    } else {
      p.invuln = INVULNERABLE_FRAMES;
    }
    p.state = 'normal';
  }

  function die(w, pit) {
    const p = w.player;
    if (p.state === 'dying') return;
    if (p.h === BIG_H) p.y += BIG_H - SMALL_H;
    p.h = SMALL_H;
    p.power = 0;
    p.duck = false;
    p.state = 'dying';
    p.t = 0;
    p.pit = !!pit;
    p.vx = 0;
    p.vy = 0;
    p.star = 0;
    p.invuln = 0;
    w.timerOn = false;
    w.events.push('die');
  }

  function dying(w) {
    const p = w.player;
    p.t++;
    if (!p.pit) {
      if (p.t === DEATH_PAUSE_FRAMES) p.vy = -4.6;
      if (p.t > DEATH_PAUSE_FRAMES) {
        p.y += p.vy;
        p.vy = Math.min(p.vy + 0.18, 4.5);
      }
    }
    if (p.t >= DEATH_TOTAL_FRAMES) w.status = 'dead';
  }

  SM.Player = {
    create: create,
    update: update,
    move: move,
    grow: grow,
    hurt: hurt,
    die: die,
    dying: dying,
    transition: transition,
    standUp: standUp,
    TRANSITION_FRAMES: TRANSITION_FRAMES,
  };
})((globalThis.SM = globalThis.SM || {}));
