/* Everything that moves besides the player: enemies, power-ups, lifts, fireballs and castle hazards. */
(function (SM) {
  'use strict';

  const TILE = SM.TILE;
  const P = SM.PHYS;
  const SCORE = SM.SCORE;
  const World = SM.World;

  // Collision box sizes [width, height]. A piranha plant's height is however far it has risen.
  const SIZE = {
    goomba: [14, 14], koopa: [14, 22], piranha: [16, 0],
    mushroom: [14, 14], oneup: [14, 14], flower: [14, 14], star: [14, 14],
    fireball: [8, 8], lift: [48, 8], podoboo: [12, 14], firebar: [0, 0],
    boss: [32, 32], flame: [24, 8], toad: [16, 24],
  };
  const SHELL_H = 14;
  const WALK_SPEED = 0.5;
  const SHELL_SPEED = 3;
  const ITEM_SPEED = 1;
  const FIREBALL_SPEED = 3.5;
  const MAX_FIREBALLS = 2;
  const EMERGE_FRAMES = 32;
  const KICK_GRACE_FRAMES = 10;
  const SHELL_REST_FRAMES = 300;
  const SHELL_WAKE_FRAMES = 90;
  const PIRANHA_HEIGHT = 24;
  const PIRANHA_SHY_DISTANCE = 34;
  const LIFT_RANGE = 64;
  const LIFT_RATE = (2 * Math.PI) / 240;
  const LIFT_LOOP = 272;
  const FIREBAR_SPACING = 8;
  const FIREBAR_SPEED = 0.03;
  const BOSS_HP = 5;

  // ---------------------------------------------------------------- spawning

  function spawn(w, type, x, y, props) {
    const e = {
      id: w.nextId++, type: type, x: x, y: y, w: SIZE[type][0], h: SIZE[type][1],
      vx: 0, vy: 0, dir: -1, state: 'walk', t: 0, zone: w.zone, onGround: false, dead: false,
    };
    if (props) Object.assign(e, props);
    w.ents.push(e);
    return e;
  }

  function spawnFromLevel(w, s) {
    const cx = s.tx * TILE;
    const cy = s.ty * TILE;
    const size = SIZE[s.type];
    let e;
    if (s.type === 'piranha') {
      e = spawn(w, s.type, cx + 8, cy, { baseY: cy, off: 0, state: 'down', t: 60 });
    } else if (s.type === 'lift') {
      e = spawn(w, s.type, cx, cy, { x0: cx, y0: cy, prevX: cx, prevY: cy, falling: false, state: '' });
    } else if (s.type === 'podoboo') {
      e = spawn(w, s.type, cx + 2, cy + 8, { homeY: cy + 8, state: 'wait', t: 30 + ((s.tx * 37) % 90) });
    } else if (s.type === 'firebar') {
      e = spawn(w, s.type, cx + 8, cy + 8, {
        len: 6, a0: (s.tx * 1.7) % (2 * Math.PI), spin: s.tx % 2 ? 1 : -1, state: '',
      });
    } else if (s.type === 'boss') {
      // The boss paces the bridge it stands on.
      let minX = cx - 3 * TILE;
      let maxX = cx + TILE;
      if (w.level.bridge.length > 0) {
        const first = w.level.bridge[0] % w.w;
        const last = w.level.bridge[w.level.bridge.length - 1] % w.w;
        minX = (first + 1) * TILE;
        maxX = (last - 1) * TILE - size[0];
      }
      e = spawn(w, s.type, cx, cy + TILE - size[1], {
        hp: BOSS_HP, minX: minX, maxX: maxX, walkDir: -1, walkT: 40, jumpT: 120, fireT: 90, mouthT: 0,
      });
    } else {
      e = spawn(w, s.type, cx + (TILE - size[0]) / 2, cy + TILE - size[1], null);
    }
    if (s.props) Object.assign(e, s.props);
    e.zone = s.zone;
    return e;
  }

  // Power-ups start inside their block and rise out of it.
  function spawnItem(w, type, tx, ty) {
    return spawn(w, type, tx * TILE + 1, ty * TILE + TILE - SIZE[type][1], { state: 'emerge', dir: 1 });
  }

  function byId(w, id) {
    for (let i = 0; i < w.ents.length; i++) {
      if (w.ents[i].id === id) return w.ents[i];
    }
    return null;
  }

  function findBoss(w) {
    for (let i = 0; i < w.ents.length; i++) {
      if (w.ents[i].type === 'boss' && !w.ents[i].dead) return w.ents[i];
    }
    return null;
  }

  // ---------------------------------------------------------------- movement

  function fall(w, e) {
    e.vy = Math.min(e.vy + P.entGravity, P.entMaxFall);
    const r = World.moveY(w, e, e.vy);
    if (r !== 0) e.vy = 0;
    e.onGround = r === 1;
  }

  function walk(w, e, speed) {
    if (World.moveX(w, e, e.dir * speed)) e.dir = -e.dir;
    fall(w, e);
  }

  // Knocked-out enemies drop through the scenery.
  function tumble(e) {
    e.vy = Math.min(e.vy + P.entGravity, P.entMaxFall + 1);
    e.x += e.vx;
    e.y += e.vy;
  }

  const UPDATE = {
    goomba: function (w, e) {
      if (e.state === 'flat') {
        if (++e.t > 30) e.dead = true;
      } else if (e.state === 'flip') {
        tumble(e);
      } else {
        walk(w, e, WALK_SPEED);
      }
    },

    koopa: function (w, e) {
      if (e.grace > 0) e.grace--;
      if (e.state === 'walk') {
        if (e.red && e.onGround) {
          const ahead = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
          const below = Math.floor((e.y + e.h + 1) / TILE);
          if (!World.solidAt(w, Math.floor(ahead / TILE), below)) e.dir = -e.dir;
        }
        walk(w, e, WALK_SPEED);
      } else if (e.state === 'shell') {
        fall(w, e);
        if (++e.t > SHELL_REST_FRAMES) {
          e.state = 'wake';
          e.t = 0;
        }
      } else if (e.state === 'wake') {
        fall(w, e);
        if (++e.t > SHELL_WAKE_FRAMES) {
          e.state = 'walk';
          e.y -= SIZE.koopa[1] - SHELL_H;
          e.h = SIZE.koopa[1];
          e.dir = w.player.x < e.x ? -1 : 1;
        }
      } else if (e.state === 'slide') {
        if (World.moveX(w, e, e.dir * SHELL_SPEED)) {
          e.dir = -e.dir;
          w.events.push('bump');
        }
        fall(w, e);
      } else {
        tumble(e);
      }
    },

    piranha: function (w, e) {
      if (e.state === 'down') {
        const p = w.player;
        if (e.t > 0) e.t--;
        else if (Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) > PIRANHA_SHY_DISTANCE) e.state = 'rise';
      } else if (e.state === 'rise') {
        e.off += 0.5;
        if (e.off >= PIRANHA_HEIGHT) {
          e.off = PIRANHA_HEIGHT;
          e.state = 'up';
          e.t = 70;
        }
      } else if (e.state === 'up') {
        if (--e.t <= 0) e.state = 'sink';
      } else {
        e.off -= 0.5;
        if (e.off <= 0) {
          e.off = 0;
          e.state = 'down';
          e.t = 80;
        }
      }
      e.y = e.baseY - e.off;
      e.h = e.off;
    },

    fireball: function (w, e) {
      e.t++;
      if (World.moveX(w, e, e.vx)) {
        fizzle(w, e);
        return;
      }
      e.vy = Math.min(e.vy + 0.3, 4);
      const r = World.moveY(w, e, e.vy);
      if (r === 1) e.vy = -2.8;
      else if (r === -1) fizzle(w, e);
    },

    podoboo: function (w, e) {
      if (e.state === 'wait') {
        if (--e.t <= 0) {
          e.state = 'jump';
          e.y = e.homeY;
          e.vy = -(5 + World.rnd(w, 3) * 0.3);
        }
        return;
      }
      e.y += e.vy;
      e.vy += 0.12;
      if (e.vy > 0 && e.y >= e.homeY) {
        e.y = e.homeY;
        e.state = 'wait';
        e.t = 50 + World.rnd(w, 90);
      }
    },

    flame: function (w, e) {
      e.t++;
      e.x += e.vx;
    },

    boss: function (w, e) {
      if (e.state !== 'walk') {
        e.vy = Math.min(e.vy + 0.25, 5);
        e.y += e.vy;
        return;
      }
      const p = w.player;
      e.dir = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
      if (e.mouthT > 0) e.mouthT--;
      if (e.onGround) {
        if (--e.walkT <= 0) {
          e.walkDir = World.rnd(w, 3) - 1;
          e.walkT = 30 + World.rnd(w, 60);
        }
        e.x += e.walkDir * 0.5;
        if (e.x < e.minX) {
          e.x = e.minX;
          e.walkDir = 1;
        }
        if (e.x > e.maxX) {
          e.x = e.maxX;
          e.walkDir = -1;
        }
        if (--e.jumpT <= 0) {
          e.vy = -3.4;
          e.jumpT = 110 + World.rnd(w, 110);
        }
      }
      e.vy = Math.min(e.vy + 0.1, 3);
      const r = World.moveY(w, e, e.vy);
      if (r !== 0) e.vy = 0;
      e.onGround = r === 1;
      if (--e.fireT <= 0) {
        e.fireT = 120 + World.rnd(w, 100);
        e.mouthT = 24;
        // High flames pass over a small player; low ones have to be jumped.
        const low = World.rnd(w, 2) === 1;
        spawn(w, 'flame', e.dir < 0 ? e.x - 20 : e.x + e.w - 4, e.y + (low ? 18 : 4), {
          vx: e.dir * 1.5, dir: e.dir, state: '',
        });
        w.events.push('flame');
      }
    },
  };

  ['mushroom', 'oneup', 'flower', 'star'].forEach(function (type) {
    UPDATE[type] = function (w, e) {
      if (e.state === 'emerge') {
        e.y -= TILE / EMERGE_FRAMES;
        if (++e.t >= EMERGE_FRAMES) e.state = 'move';
        return;
      }
      if (type === 'flower') return;
      if (World.moveX(w, e, e.dir * ITEM_SPEED)) e.dir = -e.dir;
      if (type !== 'star') {
        fall(w, e);
        return;
      }
      e.vy = Math.min(e.vy + 0.2, P.entMaxFall);
      const r = World.moveY(w, e, e.vy);
      if (r === 1) e.vy = -4;
      else if (r === -1) e.vy = 0;
    };
  });

  function updateLifts(w) {
    for (let i = 0; i < w.ents.length; i++) {
      const e = w.ents[i];
      if (e.type !== 'lift' || e.zone !== w.zone) continue;
      e.prevX = e.x;
      e.prevY = e.y;
      e.t++;
      const phase = (1 - Math.cos(e.t * LIFT_RATE)) / 2;
      if (e.kind === 'h') {
        e.x = e.x0 + LIFT_RANGE * phase;
      } else if (e.kind === 'v') {
        e.y = e.y0 + LIFT_RANGE * phase;
      } else if (e.kind === 'up') {
        e.y -= 1;
        if (e.y < -TILE) {
          e.y += LIFT_LOOP;
          e.prevY = e.y;
        }
      } else if (e.kind === 'down') {
        e.y += 1;
        if (e.y > LIFT_LOOP - TILE) {
          e.y -= LIFT_LOOP;
          e.prevY = e.y;
        }
      } else if (e.falling) {
        e.vy = Math.min(e.vy + 0.08, 3);
        e.y += e.vy;
        if (e.y > w.h * TILE + 32) e.dead = true;
      }
    }
  }

  // How far outside its box a thing can reach (fire bars swing around their pivot).
  function reach(e) {
    return e.type === 'firebar' ? e.len * FIREBAR_SPACING : 0;
  }

  function isNear(w, e) {
    const r = reach(e);
    return e.x + e.w + r > w.camX - SM.ACTIVE_MARGIN && e.x - r < w.camX + SM.VIEW_W + SM.ACTIVE_MARGIN;
  }

  // Enemies only move while they are on or near the screen.
  function updateAll(w) {
    const count = w.ents.length;
    for (let i = 0; i < count; i++) {
      const e = w.ents[i];
      const update = UPDATE[e.type];
      if (!update || e.dead || e.zone !== w.zone) continue;
      if (!isNear(w, e)) {
        if (e.type === 'fireball' || e.type === 'flame' || e.state === 'slide' || e.state === 'flip') {
          e.dead = true;
        }
        continue;
      }
      update(w, e);
      if (e.y > w.h * TILE + 48) e.dead = true;
    }
  }

  function sweep(w) {
    let kept = 0;
    for (let i = 0; i < w.ents.length; i++) {
      if (!w.ents[i].dead) w.ents[kept++] = w.ents[i];
    }
    w.ents.length = kept;
  }

  // ---------------------------------------------------------------- hits

  function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function touching(a, b) {
    return overlaps(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
  }

  // The player's box is trimmed a little so that near misses stay misses.
  function hitsPlayer(p, x, y, bw, bh) {
    return overlaps(p.x + 1, p.y + 2, p.w - 2, p.h - 2, x, y, bw, bh);
  }

  function fizzle(w, e) {
    e.dead = true;
    w.fx.push({ kind: 'puff', x: e.x - 4, y: e.y - 4, t: 0 });
  }

  function knockOut(w, e, dir, points) {
    if (e.type === 'koopa' && e.h !== SHELL_H) {
      e.y += e.h - SHELL_H;
      e.h = SHELL_H;
    }
    e.state = 'flip';
    e.vx = dir;
    e.vy = -3;
    World.addScore(w, points, e.x, e.y - 8);
    w.events.push('kick');
  }

  // A hit from a fireball or from a player with star power.
  function burn(w, e, dir) {
    if (e.type === 'boss') {
      if (--e.hp > 0) {
        w.events.push('bossHit');
        return;
      }
      e.state = 'flip';
      e.vy = -2;
      World.addScore(w, SCORE.boss, e.x + 8, e.y);
      w.events.push('bossDie');
    } else if (e.type === 'piranha' || e.type === 'podoboo') {
      e.dead = true;
      w.fx.push({ kind: 'puff', x: e.x, y: e.y, t: 0 });
      World.addScore(w, SCORE.fireKill, e.x, e.y - 8);
      w.events.push('kick');
    } else {
      knockOut(w, e, dir, e.type === 'goomba' ? 100 : SCORE.fireKill);
    }
  }

  function isWalker(e) {
    return (e.type === 'goomba' && e.state === 'walk') || (e.type === 'koopa' && e.state !== 'flip');
  }

  function burns(e) {
    return isWalker(e) || (e.type === 'piranha' && e.off > 4) || (e.type === 'boss' && e.state === 'walk');
  }

  function shellHit(w, shell, victim) {
    const chain = SCORE.shellChain;
    knockOut(w, victim, shell.dir, chain[Math.min(shell.chain, chain.length - 1)]);
    shell.chain++;
  }

  function stomps(p, e) {
    return p.vy > 0 && p.y + p.h <= e.y + Math.max(8, e.h * 0.6);
  }

  function bounce(w, p) {
    p.vy = P.stompBounce;
    p.jumpHolding = w.jumpHeld;
    p.onGround = false;
    p.coyote = 0;
  }

  function stomp(w, p, e) {
    const chain = SCORE.stompChain;
    World.addScore(w, chain[Math.min(p.combo, chain.length - 1)], e.x, e.y - 8);
    p.combo++;
    bounce(w, p);
    w.events.push('stomp');
  }

  function firebarAngle(w, e) {
    return e.a0 + e.spin * w.frame * FIREBAR_SPEED;
  }

  function touchPlayer(w, p, e) {
    const starred = p.star > 0;
    switch (e.type) {
      case 'goomba':
        if (e.state !== 'walk' || !hitsPlayer(p, e.x, e.y, e.w, e.h)) return;
        if (starred) {
          knockOut(w, e, p.dir, 100);
        } else if (stomps(p, e)) {
          e.state = 'flat';
          e.t = 0;
          stomp(w, p, e);
        } else {
          SM.Player.hurt(w);
        }
        return;

      case 'koopa':
        if (e.state === 'flip' || !hitsPlayer(p, e.x, e.y, e.w, e.h)) return;
        if (starred) {
          knockOut(w, e, p.dir, SCORE.fireKill);
        } else if (e.grace > 0) {
          return;
        } else if (e.state === 'shell' || e.state === 'wake') {
          e.state = 'slide';
          e.dir = p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1;
          e.chain = 0;
          e.grace = KICK_GRACE_FRAMES;
          World.addScore(w, SCORE.kick, e.x, e.y - 8);
          w.events.push('kick');
          if (stomps(p, e)) bounce(w, p);
        } else if (stomps(p, e)) {
          if (e.state === 'walk') {
            e.y += e.h - SHELL_H;
            e.h = SHELL_H;
          }
          e.state = 'shell';
          e.t = 0;
          e.grace = KICK_GRACE_FRAMES;
          stomp(w, p, e);
        } else {
          SM.Player.hurt(w);
        }
        return;

      case 'piranha':
        if (e.off <= 6 || !hitsPlayer(p, e.x + 3, e.y + 2, 10, e.off - 2)) return;
        if (starred) burn(w, e, p.dir);
        else SM.Player.hurt(w);
        return;

      case 'podoboo':
        if (e.state !== 'jump' || !hitsPlayer(p, e.x + 1, e.y + 1, e.w - 2, e.h - 2)) return;
        if (starred) burn(w, e, p.dir);
        else SM.Player.hurt(w);
        return;

      case 'flame':
        if (hitsPlayer(p, e.x + 2, e.y + 1, e.w - 4, e.h - 2)) SM.Player.hurt(w);
        return;

      case 'boss':
        if (e.state === 'walk' && hitsPlayer(p, e.x + 3, e.y + 3, e.w - 6, e.h - 3)) SM.Player.hurt(w);
        return;

      case 'firebar': {
        const a = firebarAngle(w, e);
        for (let k = 0; k < e.len; k++) {
          const d = k * FIREBAR_SPACING;
          if (hitsPlayer(p, e.x + Math.cos(a) * d - 3, e.y + Math.sin(a) * d - 3, 6, 6)) {
            SM.Player.hurt(w);
            return;
          }
        }
        return;
      }

      case 'mushroom':
      case 'flower':
      case 'star':
      case 'oneup':
        if (e.state === 'emerge' || !overlaps(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) return;
        e.dead = true;
        if (e.type === 'oneup') {
          World.addScore(w, '1UP', e.x, e.y - 8);
          return;
        }
        World.addScore(w, SCORE.powerup, e.x, e.y - 8);
        if (e.type === 'star') {
          p.star = SM.STAR_FRAMES;
          w.events.push('star');
        } else {
          SM.Player.grow(w, e.type === 'flower' ? 2 : 1);
        }
        return;
    }
  }

  // Resolves everything that touches this frame: fireballs, shells, walkers and the player.
  function interact(w) {
    const near = [];
    for (let i = 0; i < w.ents.length; i++) {
      const e = w.ents[i];
      if (!e.dead && e.zone === w.zone && isNear(w, e)) near.push(e);
    }

    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (a.dead) continue;
      if (a.type === 'fireball') {
        for (let j = 0; j < near.length; j++) {
          const b = near[j];
          if (b.dead || !burns(b) || !touching(a, b)) continue;
          fizzle(w, a);
          burn(w, b, a.vx > 0 ? 1 : -1);
          break;
        }
        continue;
      }
      for (let j = i + 1; j < near.length && isWalker(a); j++) {
        const b = near[j];
        if (b.dead || !isWalker(b) || !touching(a, b)) continue;
        const aSlides = a.state === 'slide';
        const bSlides = b.state === 'slide';
        if (aSlides && bSlides) {
          shellHit(w, a, b);
          shellHit(w, b, a);
        } else if (aSlides) {
          shellHit(w, a, b);
        } else if (bSlides) {
          shellHit(w, b, a);
        } else {
          // Walkers turn away from each other; a resting shell is just an obstacle.
          const away = a.x < b.x ? -1 : 1;
          if (a.state === 'walk') a.dir = away;
          if (b.state === 'walk') b.dir = -away;
        }
      }
    }

    const p = w.player;
    for (let i = 0; i < near.length && p.state === 'normal'; i++) {
      if (!near[i].dead) touchPlayer(w, p, near[i]);
    }
  }

  // Called when a block is struck from below: enemies standing on it are knocked out, items hop.
  function knockFromBelow(w, bx, by) {
    for (let i = 0; i < w.ents.length; i++) {
      const e = w.ents[i];
      const feet = e.y + e.h;
      if (e.dead || e.zone !== w.zone || e.x >= bx + TILE || e.x + e.w <= bx) continue;
      if (feet <= by - 4 || feet > by + 1) continue;
      const away = e.x + e.w / 2 < bx + TILE / 2 ? -1 : 1;
      if (isWalker(e)) {
        knockOut(w, e, away, 100);
      } else if ((e.type === 'mushroom' || e.type === 'oneup' || e.type === 'star') && e.state === 'move') {
        e.vy = -3;
        if (e.type !== 'star') e.dir = away;
      }
    }
  }

  function throwFireball(w) {
    const p = w.player;
    let live = 0;
    for (let i = 0; i < w.ents.length; i++) {
      if (w.ents[i].type === 'fireball' && !w.ents[i].dead) live++;
    }
    if (live >= MAX_FIREBALLS) return;
    spawn(w, 'fireball', p.dir > 0 ? p.x + p.w - 2 : p.x - 6, p.y + 8, {
      vx: p.dir * FIREBALL_SPEED, vy: 1.5, dir: p.dir, state: '',
    });
    p.throwT = 8;
    w.events.push('fireball');
  }

  function dropBoss(w) {
    const boss = findBoss(w);
    if (!boss || boss.state !== 'walk') return;
    boss.state = 'fall';
    boss.vy = 0;
    w.events.push('bossFall');
  }

  // Moves a falling boss during the bridge scene. Returns false once it is gone.
  function bossFalling(w) {
    const boss = findBoss(w);
    if (!boss) return false;
    UPDATE.boss(w, boss);
    if (boss.y > w.h * TILE + 40) boss.dead = true;
    return !boss.dead;
  }

  SM.Ent = {
    SIZE: SIZE,
    SHELL_H: SHELL_H,
    PIRANHA_HEIGHT: PIRANHA_HEIGHT,
    FIREBAR_SPACING: FIREBAR_SPACING,
    spawn: spawn,
    spawnFromLevel: spawnFromLevel,
    spawnItem: spawnItem,
    byId: byId,
    updateLifts: updateLifts,
    updateAll: updateAll,
    interact: interact,
    sweep: sweep,
    knockFromBelow: knockFromBelow,
    throwFireball: throwFireball,
    firebarAngle: firebarAngle,
    dropBoss: dropBoss,
    bossFalling: bossFalling,
  };
})((globalThis.SM = globalThis.SM || {}));
