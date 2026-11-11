/* Shared constants: screen geometry, tile ids, physics tuning and score tables. */
(function (SM) {
  'use strict';

  SM.TILE = 16;
  SM.VIEW_W = 400;
  SM.VIEW_H = 240;
  SM.ROWS = 15;

  const T = (SM.T = {
    AIR: 0,
    GROUND: 1,
    BRICK: 2,
    QBLOCK: 3,
    USED: 4,
    HARD: 5,
    WALL: 6,
    PIPE_TL: 7,
    PIPE_TR: 8,
    PIPE_L: 9,
    PIPE_R: 10,
    HPIPE_MT: 11,
    HPIPE_MB: 12,
    HPIPE_T: 13,
    HPIPE_B: 14,
    HIDDEN: 15,
    COIN: 16,
    TREE_L: 17,
    TREE_M: 18,
    TREE_R: 19,
    TRUNK: 20,
    BRIDGE: 21,
    AXE: 22,
    LAVA: 23,
    POLE: 24,
    POLE_TOP: 25,
  });

  SM.SOLID = new Uint8Array(32);
  [
    T.GROUND, T.BRICK, T.QBLOCK, T.USED, T.HARD, T.WALL,
    T.PIPE_TL, T.PIPE_TR, T.PIPE_L, T.PIPE_R,
    T.HPIPE_MT, T.HPIPE_MB, T.HPIPE_T, T.HPIPE_B,
    T.TREE_L, T.TREE_M, T.TREE_R, T.BRIDGE,
  ].forEach(function (id) {
    SM.SOLID[id] = 1;
  });

  // Speeds are pixels per frame and accelerations pixels per frame squared, at 60 frames per second.
  SM.PHYS = {
    minWalk: 0.074,
    walkAccel: 0.037,
    runAccel: 0.056,
    releaseDecel: 0.051,
    skidDecel: 0.102,
    skidTurn: 0.5625,
    maxWalk: 1.5625,
    maxRun: 2.5625,
    crawl: 0.5,
    maxFall: 4,
    stompBounce: -4,
    // The jump is chosen by horizontal speed at take-off: faster runs jump higher.
    // `hold` is gravity while the jump button is held on the way up, `fall` otherwise.
    jumps: [
      { below: 1, v0: -4, hold: 0.125, fall: 0.4375 },
      { below: 2.3125, v0: -4, hold: 0.1172, fall: 0.375 },
      { below: Infinity, v0: -5, hold: 0.15625, fall: 0.5625 },
    ],
    // Feet that clip this far into the top of a ledge are lifted onto it.
    stepUp: 4,
    // A head that clips a block corner by no more than this slides around it.
    cornerNudge: 4,
    coyoteFrames: 4,
    jumpBufferFrames: 5,
    entGravity: 0.3,
    entMaxFall: 4,
  };

  SM.SCORE = {
    stompChain: [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000, '1UP'],
    shellChain: [500, 800, 1000, 2000, 4000, 5000, 8000, '1UP'],
    coin: 200,
    brick: 50,
    powerup: 1000,
    kick: 400,
    fireKill: 200,
    boss: 5000,
    timeBonus: 50,
  };

  // Enemies wake up when they come this close to the edge of the screen.
  SM.ACTIVE_MARGIN = 32;
  SM.TIMER_TICK_FRAMES = 24;
  SM.HURRY_TIME = 100;
  SM.STAR_FRAMES = 600;
  SM.START_LIVES = 3;
})((globalThis.SM = globalThis.SM || {}));
