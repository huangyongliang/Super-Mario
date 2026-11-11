/* The game around the levels: title screen, level intros, play, game over, the ending and the loop. */
(function (SM) {
  'use strict';

  const STEP_MS = 1000 / 60;
  const MAX_STEPS_PER_FRAME = 5;
  const INTRO_FRAMES = 160;
  const TIME_UP_FRAMES = 150;
  const GAME_OVER_FRAMES = 330;
  const ENDING_WAIT_FRAMES = 120;
  const DEMO_AFTER_FRAMES = 12 * 60;
  const DEMO_INTRO_FRAMES = 100;
  const DEMO_AFTER_FLAG_FRAMES = 240;
  const TOAST_FRAMES = 90;
  const TOP_KEY = 'sm-html-top';
  const W = SM.VIEW_W;
  const H = SM.VIEW_H;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  const app = document.getElementById('app');
  const touch = document.getElementById('touch');
  const help = document.getElementById('help');
  const input = SM.Input.create(touch);
  const Audio = SM.Audio;
  const S = SM.Sprites;
  const R = SM.Render;

  const game = {
    mode: 'title',
    t: 0,
    paused: false,
    level: 0,
    lives: SM.START_LIVES,
    score: 0,
    coins: 0,
    power: 0,
    fromCheckpoint: false,
    world: null,
    titleWorld: SM.World.create(0),
    top: loadTop(),
    held: {},
    toast: '',
    toastT: 0,
    touchUi: false,
    demoIndex: 0,
    demoRun: null,
  };
  let screenTapped = false;

  function loadTop() {
    try {
      return parseInt(window.localStorage.getItem(TOP_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveTop(score) {
    if (score <= game.top) return;
    game.top = score;
    try {
      window.localStorage.setItem(TOP_KEY, String(score));
    } catch (e) {
      // Without storage the top score just lasts for this visit.
    }
  }

  function showToast(text) {
    game.toast = text;
    game.toastT = TOAST_FRAMES;
  }

  // ---------------------------------------------------------------- flow

  function newGame(level) {
    game.level = level || 0;
    game.lives = SM.START_LIVES;
    game.score = 0;
    game.coins = 0;
    game.power = 0;
    game.fromCheckpoint = false;
    toIntro();
  }

  function toIntro() {
    game.mode = 'intro';
    game.t = 0;
    game.world = null;
    Audio.stopMusic();
  }

  function startLevel() {
    const w = SM.World.create(game.level, {
      score: game.score, coins: game.coins, lives: game.lives, power: game.power,
      fromCheckpoint: game.fromCheckpoint,
    });
    // A button still held from the menu should not count as a fresh press.
    w.prevJump = !!game.held.jump;
    w.prevRun = !!game.held.run;
    game.world = w;
    game.mode = 'play';
    game.paused = false;
    levelMusic(w);
  }

  function levelMusic(w) {
    if (w.player.star > 0) {
      Audio.music('star');
      return;
    }
    const theme = R.themeOf(w);
    const song = theme === 'underground' ? 'underground' : theme === 'castle' ? 'castle' : 'overworld';
    Audio.music(song, { tempo: w.hurry ? 1.3 : 1 });
  }

  function stillPlaying(w) {
    return game.mode === 'play' && game.world === w && w.status === 'play' && !w.seq &&
      w.player.state !== 'dying';
  }

  function handleEvents(w) {
    for (let i = 0; i < w.events.length; i++) {
      const ev = w.events[i];
      switch (ev) {
        case 'zone':
          if (w.player.star === 0 && Audio.playing() !== 'hurry') levelMusic(w);
          break;
        case 'star':
          Audio.music('star');
          break;
        case 'starEnd':
          if (stillPlaying(w)) levelMusic(w);
          break;
        case 'hurry':
          Audio.music('hurry', {
            onEnd: function () {
              if (stillPlaying(w)) levelMusic(w);
            },
          });
          break;
        case 'die':
          Audio.music('die');
          break;
        case 'flag':
          Audio.stopMusic();
          Audio.play('flag');
          break;
        case 'axe':
          Audio.stopMusic();
          break;
        case 'clear':
          Audio.music(w.level.axe ? 'castleClear' : 'clear');
          break;
        default:
          Audio.play(ev);
      }
    }
  }

  function onDeath(w) {
    game.lives = w.lives - 1;
    game.score = w.score;
    game.coins = w.coins;
    game.power = 0;
    game.fromCheckpoint = w.checkpointReached;
    saveTop(w.score);
    game.t = 0;
    if (w.timeUp) game.mode = 'timeup';
    else afterDeath();
  }

  function afterDeath() {
    if (game.lives > 0) {
      toIntro();
      return;
    }
    game.mode = 'gameover';
    game.t = 0;
    Audio.music('gameOver');
  }

  function onComplete(w) {
    game.score = w.score;
    game.coins = w.coins;
    game.lives = w.lives;
    game.power = w.player.power;
    game.fromCheckpoint = false;
    saveTop(w.score);
    game.level++;
    if (game.level < SM.Levels.count()) {
      toIntro();
      return;
    }
    game.mode = 'ending';
    game.t = 0;
    game.endWorld = w;
  }

  function toTitle() {
    game.mode = 'title';
    game.t = 0;
    game.world = null;
    game.titleWorld = SM.World.create(0);
    Audio.stopMusic();
  }

  // Demos replay recorded button presses through each world in turn, silently, until a button is
  // pressed.
  function startDemo() {
    const run = SM.DEMO.runs[game.demoIndex % SM.DEMO.runs.length];
    game.demoIndex++;
    game.demoRun = run;
    game.mode = 'demo';
    game.t = -DEMO_INTRO_FRAMES;
    game.world = SM.World.create(run.level);
  }

  function demoFrame() {
    const d = SM.DEMO;
    const w = game.world;
    if (game.t < 0) {
      game.t++;
      return;
    }
    const burst = Math.floor(game.t / d.burstFrames);
    game.t++;
    if (w.seq) {
      w.seq.demoT = (w.seq.demoT || 0) + 1;
      if (w.seq.demoT > DEMO_AFTER_FLAG_FRAMES) {
        toTitle();
        return;
      }
    }
    const bursts = game.demoRun.bursts;
    if (w.status !== 'play' || (!w.seq && burst >= bursts.length)) {
      toTitle();
      return;
    }
    SM.World.step(w, w.seq ? {} : d.actions[+bursts[burst]]);
  }

  function setPaused(on) {
    game.paused = on;
    Audio.setPaused(on);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (app.requestFullscreen) {
      app.requestFullscreen().catch(function () {});
    }
  }

  // ---------------------------------------------------------------- update

  function update() {
    const inp = input.poll();
    const tapped = screenTapped;
    screenTapped = false;
    if (inp.any || tapped) Audio.unlock();
    if (inp.pressed.mute) showToast(Audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
    if (inp.pressed.fullscreen) toggleFullscreen();
    if (game.toastT > 0) game.toastT--;
    const go = inp.pressed.start || tapped || (inp.held.jump && !game.held.jump);
    game.held = inp.held;

    switch (game.mode) {
      case 'title':
        game.titleWorld.frame++;
        if (go) newGame(0);
        else if (SM.DEMO && ++game.t >= DEMO_AFTER_FRAMES) startDemo();
        break;
      case 'demo':
        if (go || inp.pressed.pause) toTitle();
        else demoFrame();
        break;
      case 'intro':
        if (++game.t >= INTRO_FRAMES) startLevel();
        break;
      case 'play': {
        const w = game.world;
        if (inp.pressed.start || inp.pressed.pause) setPaused(!game.paused);
        if (game.paused) break;
        SM.World.step(w, inp.held);
        handleEvents(w);
        if (w.status === 'dead') onDeath(w);
        else if (w.status === 'complete') onComplete(w);
        break;
      }
      case 'timeup':
        if (++game.t >= TIME_UP_FRAMES) afterDeath();
        break;
      case 'gameover':
        if (++game.t >= GAME_OVER_FRAMES || (game.t > 60 && go)) toTitle();
        break;
      case 'ending':
        game.t++;
        if (game.endWorld) game.endWorld.frame++;
        if (game.t > ENDING_WAIT_FRAMES && go) toTitle();
        break;
    }
  }

  // ---------------------------------------------------------------- drawing

  function hud(world, time) {
    R.drawHud(ctx, {
      score: world ? world.score : game.score,
      coins: world ? world.coins : game.coins,
      world: SM.Levels.get(Math.min(game.level, SM.Levels.count() - 1)).name,
      time: time,
      frame: world ? world.frame : game.t,
    });
  }

  function black() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }

  function centred(text, y, options) {
    S.text(ctx, text, W / 2, y, Object.assign({ align: 'center', shadow: '#000000' }, options));
  }

  function blink(frames) {
    return Math.floor(frames / 30) % 2 === 0;
  }

  function drawTitle() {
    const w = game.titleWorld;
    R.drawWorld(ctx, w);
    R.drawHud(ctx, { score: 0, coins: 0, world: '1-1', time: null, frame: w.frame });
    // The title board.
    const bx = 76;
    const by = 36;
    const bw = 248;
    const bh = 104;
    ctx.fillStyle = '#4a1c04';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#fcc8a0';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#c8581c';
    ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
    ctx.fillStyle = '#fcc8a0';
    [[bx + 5, by + 5], [bx + bw - 8, by + 5], [bx + 5, by + bh - 8], [bx + bw - 8, by + bh - 8]].forEach(function (p) {
      ctx.fillRect(p[0], p[1], 3, 3);
    });
    S.text(ctx, 'SUPER', W / 2, by + 12, { align: 'center', scale: 3, colour: '#fcfcfc', shadow: '#4a1c04' });
    S.text(ctx, 'MARIO', W / 2, by + 44, { align: 'center', scale: 4, colour: '#fcfcfc', shadow: '#4a1c04' });
    S.text(ctx, 'HTML5 EDITION', W / 2, by + 84, { align: 'center', colour: '#fcd8a8', shadow: '#4a1c04' });
    if (blink(w.frame)) centred(game.touchUi ? 'TAP TO START' : 'PRESS ENTER TO START', 166);
    centred('TOP- ' + R.pad(game.top, 6), 182);
  }

  function drawIntro() {
    black();
    hud(null, null);
    const L = SM.Levels.get(game.level);
    centred('WORLD ' + L.name, 84);
    ctx.drawImage(S.get('small_stand'), 160, 106);
    S.text(ctx, '*  ' + game.lives, 186, 112);
    if (game.fromCheckpoint) centred('CONTINUING FROM THE CHECKPOINT', 150, { colour: '#a8a8a8' });
  }

  function drawPlay() {
    const w = game.world;
    R.drawWorld(ctx, w);
    hud(w, w.time);
    if (w.message >= 1) centred('THANK YOU MARIO!', 64);
    if (w.message >= 2) {
      centred('YOUR QUEST IS COMPLETE.', 88);
      centred('THE KINGDOM IS SAFE AGAIN!', 104);
    }
    if (game.paused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, W, H);
      centred('PAUSED', 100, { scale: 2 });
      centred(game.touchUi ? 'TAP II TO RESUME' : 'PRESS ENTER OR P TO RESUME', 132, { colour: '#c8c8c8' });
    }
  }

  function drawEnding() {
    if (game.endWorld) R.drawWorld(ctx, game.endWorld);
    else black();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, W, H);
    hud(game.endWorld, null);
    centred('CONGRATULATIONS!', 52, { scale: 2, colour: '#fcd034' });
    centred('YOU CLEARED EVERY WORLD.', 88);
    centred('FINAL SCORE  ' + R.pad(game.score, 6), 112);
    centred('TOP SCORE    ' + R.pad(game.top, 6), 128);
    centred('THANK YOU FOR PLAYING!', 152, { colour: '#a8e4fc' });
    if (game.t > ENDING_WAIT_FRAMES && blink(game.t)) {
      centred(game.touchUi ? 'TAP TO PLAY AGAIN' : 'PRESS ENTER TO PLAY AGAIN', 184);
    }
  }

  function drawDemo() {
    const w = game.world;
    if (game.t < 0) {
      black();
      R.drawHud(ctx, { score: 0, coins: 0, world: w.level.name, time: null, frame: 0 });
      centred('WORLD ' + w.level.name, 84);
      centred('DEMO', 120, { colour: '#fcd034' });
      return;
    }
    R.drawWorld(ctx, w);
    R.drawHud(ctx, { score: w.score, coins: w.coins, world: w.level.name, time: w.time, frame: w.frame });
    if (blink(game.t)) centred('DEMO', 40, { colour: '#fcd034' });
    centred(game.touchUi ? 'TAP TO PLAY' : 'PRESS ENTER TO PLAY', 56, { colour: '#fcfcfc' });
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    switch (game.mode) {
      case 'title':
        drawTitle();
        break;
      case 'demo':
        drawDemo();
        break;
      case 'intro':
        drawIntro();
        break;
      case 'play':
        drawPlay();
        break;
      case 'timeup':
        black();
        hud(null, 0);
        centred('TIME UP', 108);
        break;
      case 'gameover':
        black();
        hud(null, null);
        centred('GAME OVER', 108);
        break;
      case 'ending':
        drawEnding();
        break;
    }
    if (game.toastT > 0) centred(game.toast, 36, { colour: '#fcd034' });
  }

  // ---------------------------------------------------------------- page

  function fit() {
    const reserved = help && !help.hidden ? help.offsetHeight + 20 : 0;
    let s = Math.min(window.innerWidth / W, (window.innerHeight - reserved) / H);
    if (s >= 2) s = Math.floor(s);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
    input.measure();
  }

  function useTouchUi() {
    if (game.touchUi) return;
    game.touchUi = true;
    touch.hidden = false;
    if (help) help.hidden = true;
    document.body.classList.add('touch-ui');
    fit();
  }

  if (('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) {
    useTouchUi();
  }
  window.addEventListener('touchstart', useTouchUi, { passive: true });
  // Some browsers only let audio start from inside an input event handler.
  ['keydown', 'pointerdown', 'touchend'].forEach(function (type) {
    window.addEventListener(type, Audio.unlock, { passive: true });
  });
  canvas.addEventListener('pointerdown', function () {
    screenTapped = true;
  });
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.mode === 'play' && !game.paused) setPaused(true);
  });

  // ?level=3 starts a new game at that level, which is handy for testing.
  const params = new URLSearchParams(window.location.search);
  const startAt = parseInt(params.get('level'), 10);
  if (startAt >= 1 && startAt <= SM.Levels.count()) newGame(startAt - 1);

  fit();
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    acc += Math.min(250, now - last);
    last = now;
    let steps = 0;
    // A little tolerance keeps a 60 Hz display at exactly one step per frame despite timer jitter.
    while (acc >= STEP_MS - 1 && steps < MAX_STEPS_PER_FRAME) {
      update();
      acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    draw();
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  SM.game = game;
})((globalThis.SM = globalThis.SM || {}));
