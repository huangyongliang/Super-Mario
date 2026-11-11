/* Draws a world onto the 400x240 canvas: scenery, tiles, things, the player, effects and the HUD. */
(function (SM) {
  'use strict';

  const T = SM.T;
  const TILE = SM.TILE;
  const VIEW_W = SM.VIEW_W;
  const ART = SM.ART;
  const S = SM.Sprites;

  const QBLOCK_SHINE = ['#fca030', '#fca030', '#fca030', '#e08820', '#b86410', '#e08820'];
  const COIN_SHINE = [['#fcb020', '#fcf0a0'], ['#fcb020', '#fcf0a0'], ['#e09018', '#fcd060'], ['#b86c10', '#e8a838']];
  const FLOWER_PALS = ['flowerA', 'flowerB', 'flowerC', 'flowerD'];
  const STAR_PALS = ['starA', 'starB', 'starC', 'starD'];
  const PLAYER_STAR_PALS = ['mario', 'marioStar1', 'marioStar2', 'marioStar3'];
  const GROW_SEQUENCE = [0, 1, 0, 1, 0, 1, 1, 0, 1, 1];
  const CASTLE_FLAG_RISE = 60;

  const PLAIN_TILES = [];
  PLAIN_TILES[T.USED] = 'used';
  PLAIN_TILES[T.PIPE_TL] = 'pipeTL';
  PLAIN_TILES[T.PIPE_TR] = 'pipeTR';
  PLAIN_TILES[T.PIPE_L] = 'pipeL';
  PLAIN_TILES[T.PIPE_R] = 'pipeR';
  PLAIN_TILES[T.HPIPE_MT] = 'hpipeMT';
  PLAIN_TILES[T.HPIPE_MB] = 'hpipeMB';
  PLAIN_TILES[T.HPIPE_T] = 'hpipeT';
  PLAIN_TILES[T.HPIPE_B] = 'hpipeB';
  PLAIN_TILES[T.TREE_L] = 'treeL';
  PLAIN_TILES[T.TREE_M] = 'treeM';
  PLAIN_TILES[T.TREE_R] = 'treeR';
  PLAIN_TILES[T.TRUNK] = 'trunk';
  PLAIN_TILES[T.BRIDGE] = 'bridge';
  PLAIN_TILES[T.AXE] = 'axe';
  PLAIN_TILES[T.POLE] = 'pole';
  PLAIN_TILES[T.POLE_TOP] = 'poleTop';
  const THEMED_TILES = [];
  THEMED_TILES[T.GROUND] = 'ground';
  THEMED_TILES[T.BRICK] = 'brick';
  THEMED_TILES[T.HARD] = 'hard';
  THEMED_TILES[T.WALL] = 'wall';

  function themeOf(w) {
    return w.level.zones[w.zone].theme;
  }

  // A block sprite in the colours of the current theme.
  function themed(name, theme, extra, extraKey) {
    const t = ART.themes[theme];
    const overrides = { a: t.a, h: t.h, d: t.d };
    if (extra) Object.assign(overrides, extra);
    return S.get(name, null, false, false, overrides, theme + (extraKey || ''));
  }

  function shine(frame, length) {
    return Math.floor(frame / 8) % length;
  }

  function tileImage(w, tile, tx, ty, theme, frame) {
    const plain = PLAIN_TILES[tile];
    if (plain) return S.get(plain);
    const block = THEMED_TILES[tile];
    if (block) return themed(block, theme);
    if (tile === T.QBLOCK) {
      const k = shine(frame, QBLOCK_SHINE.length);
      return themed('qblock', theme, { q: QBLOCK_SHINE[k] }, 'q' + k);
    }
    if (tile === T.COIN) {
      const k = shine(frame, COIN_SHINE.length);
      return S.get('coin', null, false, false, { q: COIN_SHINE[k][0], h: COIN_SHINE[k][1] }, 'c' + k);
    }
    if (tile === T.LAVA) {
      if (ty > 0 && w.tiles[(ty - 1) * w.w + tx] === T.LAVA) return S.get('lava');
      return S.get((Math.floor(frame / 16) + tx) % 2 ? 'lavaTop1' : 'lavaTop0');
    }
    return null;
  }

  // ---------------------------------------------------------------- scenery

  function drawScenery(ctx, w, cam) {
    const deco = w.level.deco;
    for (let i = 0; i < deco.length; i++) {
      const d = deco[i];
      if (d.zone !== w.zone) continue;
      let name;
      if (d.kind === 'cloud') name = 'cloud' + d.size;
      else if (d.kind === 'bush') name = 'bush' + d.size;
      else name = d.kind;
      const img = S.get(name);
      const x = d.x - cam;
      if (x + img.width < 0 || x > VIEW_W) continue;
      ctx.drawImage(img, x, d.kind === 'cloud' ? d.y : d.y - img.height);
    }
  }

  function drawCastle(ctx, w, cam, theme) {
    const c = w.level.castle;
    if (!c || c.zone !== w.zone || c.x - cam > VIEW_W || c.x + 5 * TILE - cam < 0) return;
    const x = c.x - cam;
    const put = function (name, col, row) {
      ctx.drawImage(themed(name, theme), x + col * TILE, c.y + row * TILE);
    };
    // A flag rises over the castle once the player is inside.
    const s = w.seq;
    if (s && s.kind === 'flag' && s.step === 3) {
      const rise = Math.min(1, s.since / CASTLE_FLAG_RISE);
      const top = c.y - Math.round(rise * 22);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, c.y - 40, 5 * TILE, 40);
      ctx.clip();
      ctx.fillStyle = '#d0d0d8';
      ctx.fillRect(x + 2 * TILE + 7, top, 2, 24);
      ctx.drawImage(S.get('flag', null, true), x + 2 * TILE + 9, top);
      ctx.restore();
    }
    for (let col = 1; col <= 3; col++) put('castleTop', col, 0);
    put('castleBrick', 1, 1);
    put('castleWindow', 2, 1);
    put('castleBrick', 3, 1);
    for (let col = 0; col < 5; col++) put('castleTop', col, 2);
    for (let row = 3; row <= 4; row++) {
      for (let col = 0; col < 5; col++) {
        if (col !== 2) put('castleBrick', col, row);
      }
    }
    put('castleDoorTop', 2, 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 2 * TILE, c.y + 4 * TILE, TILE, TILE);
  }

  function drawTiles(ctx, w, cam, theme, frame) {
    const bumps = {};
    for (let i = 0; i < w.bumps.length; i++) {
      const b = w.bumps[i];
      bumps[b.ty * w.w + b.tx] = -Math.round(Math.sin((b.t / SM.World.BUMP_FRAMES) * Math.PI) * 5);
    }
    const tx0 = Math.max(w.zx0, Math.floor(cam / TILE));
    const tx1 = Math.min(w.zx1 - 1, Math.floor((cam + VIEW_W) / TILE));
    for (let ty = 0; ty < w.h; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const tile = w.tiles[i];
        if (tile === T.AIR || tile === T.HIDDEN) continue;
        const img = tileImage(w, tile, tx, ty, theme, frame);
        if (img) ctx.drawImage(img, tx * TILE - cam, ty * TILE + (bumps[i] || 0));
      }
    }
  }

  function drawFlag(ctx, w, cam) {
    const flag = w.level.flag;
    if (!flag || flag.zone !== w.zone) return;
    ctx.drawImage(S.get('flag'), flag.x - 17 - cam, Math.round(w.flagY));
  }

  // ---------------------------------------------------------------- things

  // Sprites are drawn centred on the bottom edge of the thing's collision box.
  function atFeet(ctx, img, e, cam) {
    ctx.drawImage(img, Math.round(e.x + e.w / 2 - img.width / 2) - cam, Math.round(e.y + e.h - img.height));
  }

  function drawThing(ctx, w, e, cam, frame) {
    const theme = themeOf(w);
    switch (e.type) {
      case 'goomba': {
        const pal = theme === 'underground' ? 'goombaDark' : 'goomba';
        if (e.state === 'flat') atFeet(ctx, S.get('goombaFlat', pal), e, cam);
        else if (e.state === 'flip') atFeet(ctx, S.get('goomba', pal, false, true), e, cam);
        else atFeet(ctx, S.get('goomba', pal, Math.floor(frame / 10) % 2 === 1), e, cam);
        return;
      }
      case 'koopa': {
        const pal = e.red ? 'koopaRed' : 'koopa';
        let img;
        if (e.state === 'walk') img = S.get(Math.floor(frame / 10) % 2 ? 'koopa1' : 'koopa0', pal, e.dir < 0);
        else if (e.state === 'wake') img = S.get(Math.floor(frame / 5) % 2 ? 'shellFeet' : 'shell', pal);
        else if (e.state === 'flip') img = S.get('shell', pal, false, true);
        else img = S.get('shell', pal);
        atFeet(ctx, img, e, cam);
        return;
      }
      case 'piranha':
        ctx.drawImage(S.get(Math.floor(frame / 12) % 2 ? 'piranha1' : 'piranha0'), Math.round(e.x) - cam, Math.round(e.y));
        return;
      case 'mushroom':
        atFeet(ctx, S.get('mushroom'), e, cam);
        return;
      case 'oneup':
        atFeet(ctx, S.get('mushroom', 'oneup'), e, cam);
        return;
      case 'flower':
        atFeet(ctx, S.get('flower', FLOWER_PALS[Math.floor(frame / 4) % 4]), e, cam);
        return;
      case 'star':
        atFeet(ctx, S.get('star', STAR_PALS[Math.floor(frame / 3) % 4]), e, cam);
        return;
      case 'fireball': {
        const k = Math.floor(e.t / 3) % 4;
        ctx.drawImage(S.get('fireball', null, k === 1 || k === 2, k >= 2), Math.round(e.x) - cam, Math.round(e.y));
        return;
      }
      case 'lift':
        for (let i = 0; i < e.w / TILE; i++) ctx.drawImage(S.get('lift'), Math.round(e.x) + i * TILE - cam, Math.round(e.y));
        return;
      case 'podoboo':
        if (e.state === 'jump') atFeet(ctx, S.get('podoboo', null, false, e.vy > 0), e, cam);
        return;
      case 'firebar': {
        const a = SM.Ent.firebarAngle(w, e);
        for (let k = 0; k < e.len; k++) {
          const d = k * SM.Ent.FIREBAR_SPACING;
          const flip = (Math.floor(frame / 4) + k) % 2 === 1;
          ctx.drawImage(S.get('fireball', null, flip, flip),
            Math.round(e.x + Math.cos(a) * d - 4) - cam, Math.round(e.y + Math.sin(a) * d - 4));
        }
        return;
      }
      case 'boss': {
        let name = Math.floor(frame / 16) % 2 ? 'boss1' : 'boss0';
        if (e.mouthT > 0 && e.state === 'walk') name = 'bossRoar';
        atFeet(ctx, S.get(name, null, e.dir < 0, e.state === 'flip'), e, cam);
        return;
      }
      case 'flame':
        ctx.drawImage(S.get(Math.floor(frame / 4) % 2 ? 'flame1' : 'flame0', null, e.dir < 0), Math.round(e.x) - cam, Math.round(e.y));
        return;
      case 'toad':
        atFeet(ctx, S.get('toad'), e, cam);
        return;
    }
  }

  // Emerging power-ups and piranha plants are drawn first so that blocks and pipes cover them.
  function isBehind(e) {
    return e.type === 'piranha' || e.state === 'emerge';
  }

  // ---------------------------------------------------------------- the player

  function playerPose(w, p) {
    const big = p.power > 0;
    const prefix = big ? 'big_' : 'small_';
    switch (p.state) {
      case 'dying':
        return 'small_die';
      case 'grow':
      case 'shrink': {
        let k = GROW_SEQUENCE[Math.min(GROW_SEQUENCE.length - 1, Math.floor((p.t / SM.Player.TRANSITION_FRAMES) * GROW_SEQUENCE.length))];
        if (p.state === 'shrink') k = 1 - k;
        return k ? 'big_stand' : 'small_stand';
      }
      case 'flag':
        return prefix + 'climb';
      case 'walk':
      case 'pipeOut':
      case 'pipeIn':
        if (p.state !== 'walk' && w.level.warps[p.warp].enter === 'down') return prefix + 'stand';
        return prefix + 'walk' + (Math.floor(w.frame / 6) % 3);
      case 'normal':
        if (p.duck) return 'big_duck';
        if (big && p.throwT > 0) return 'big_throw';
        if (!p.onGround) return prefix + 'jump';
        if (p.skid) return prefix + 'skid';
        if (p.vx !== 0) return prefix + 'walk' + (Math.floor(p.walkT / 9) % 3);
        return prefix + 'stand';
      default:
        return prefix + 'stand';
    }
  }

  function playerPalette(w, p) {
    if (p.star > 0) {
      const speed = p.star < 120 ? 6 : 2;
      return PLAYER_STAR_PALS[Math.floor(w.frame / speed) % PLAYER_STAR_PALS.length];
    }
    const power = p.state === 'shrink' ? p.fromPower : p.state === 'grow' ? Math.max(p.power, 1) : p.power;
    return power === 2 ? 'marioFire' : 'mario';
  }

  function drawPlayer(ctx, w, cam) {
    const p = w.player;
    if (p.state === 'gone') return;
    if (p.invuln > 0 && p.state === 'normal' && Math.floor(w.frame / 2) % 2 === 0) return;
    let pose = playerPose(w, p);
    let pal = playerPalette(w, p);
    if (pose === 'small_die') pal = 'mario';
    if (pose.indexOf('small_') === 0 && pal === 'marioFire' && p.state !== 'shrink') pal = 'mario';
    const img = S.get(pose, pal, p.dir < 0 && pose !== 'small_die');
    ctx.drawImage(img, Math.round(p.x) - 2 - cam, Math.round(p.y + p.h) - img.height);
  }

  // ---------------------------------------------------------------- effects

  function drawEffects(ctx, w, cam, theme) {
    for (let i = 0; i < w.fx.length; i++) {
      const f = w.fx[i];
      if (f.kind === 'score') {
        S.text(ctx, f.text, Math.round(f.x) - cam, Math.round(f.y), { tiny: true, shadow: '#000000' });
      } else if (f.kind === 'coin') {
        const names = ['coin', 'coinSpin1', 'coinSpin2', 'coinSpin1'];
        const y = f.y - 5 * f.t + 0.165 * f.t * f.t;
        ctx.drawImage(S.get(names[Math.floor(f.t / 3) % 4]), f.x - cam, Math.round(y));
      } else if (f.kind === 'debris') {
        const flip = Math.floor(f.t / 4) % 2 === 1;
        const t = ART.themes[theme];
        ctx.drawImage(S.get('debris', null, flip, false, { a: t.a, h: t.h, d: t.d }, theme), Math.round(f.x) - cam, Math.round(f.y));
      } else if (f.kind === 'puff') {
        ctx.drawImage(S.get('puff' + Math.min(2, Math.floor(f.t / 4))), Math.round(f.x) - cam, Math.round(f.y));
      }
    }
  }

  // ---------------------------------------------------------------- world and HUD

  function drawWorld(ctx, w) {
    const theme = themeOf(w);
    const cam = Math.round(w.camX);
    const frame = w.frame;
    ctx.fillStyle = ART.themes[theme].sky;
    ctx.fillRect(0, 0, VIEW_W, SM.VIEW_H);
    drawScenery(ctx, w, cam);
    drawCastle(ctx, w, cam, theme);

    const inPipe = w.player.state === 'pipeIn' || w.player.state === 'pipeOut';
    const visible = [];
    for (let i = 0; i < w.ents.length; i++) {
      const e = w.ents[i];
      if (e.dead || e.zone !== w.zone) continue;
      if (e.x > cam + VIEW_W + 64 || e.x + e.w < cam - 64) continue;
      if (isBehind(e)) drawThing(ctx, w, e, cam, frame);
      else visible.push(e);
    }
    if (inPipe) drawPlayer(ctx, w, cam);
    drawTiles(ctx, w, cam, theme, frame);
    drawFlag(ctx, w, cam);
    for (let i = 0; i < visible.length; i++) drawThing(ctx, w, visible[i], cam, frame);
    if (!inPipe) drawPlayer(ctx, w, cam);
    drawEffects(ctx, w, cam, theme);
  }

  function pad(n, width) {
    let s = String(Math.max(0, Math.floor(n)));
    while (s.length < width) s = '0' + s;
    return s;
  }

  /* info: { name, score, coins, world, time (null hides it), frame } */
  function drawHud(ctx, info) {
    const o = { shadow: '#000000' };
    S.text(ctx, info.name || 'MARIO', 32, 8, o);
    S.text(ctx, pad(info.score, 6), 32, 17, o);
    const k = shine(info.frame || 0, COIN_SHINE.length);
    ctx.drawImage(S.get('hudCoin', null, false, false, { q: COIN_SHINE[k][0], h: COIN_SHINE[k][1] }, 'c' + k), 136, 16);
    S.text(ctx, '*' + pad(info.coins, 2), 144, 17, o);
    S.text(ctx, 'WORLD', 232, 8, o);
    S.text(ctx, info.world, 240, 17, o);
    S.text(ctx, 'TIME', 328, 8, o);
    if (info.time !== null && info.time !== undefined) S.text(ctx, pad(info.time, 3), 336, 17, o);
  }

  SM.Render = { drawWorld: drawWorld, drawHud: drawHud, pad: pad, themeOf: themeOf };
})((globalThis.SM = globalThis.SM || {}));
