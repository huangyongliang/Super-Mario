/* Turns the ASCII maps in level-data.js into tile grids, spawn lists and warp tables. */
(function (SM) {
  'use strict';

  const T = SM.T;
  const TILE = SM.TILE;
  const ROWS = SM.ROWS;

  const TILE_CHARS = {
    '#': T.GROUND, X: T.HARD, B: T.BRICK, '%': T.WALL,
    '?': T.QBLOCK, M: T.QBLOCK, S: T.BRICK, C: T.BRICK, L: T.HIDDEN, H: T.HIDDEN,
    o: T.COIN, '=': T.BRIDGE, '~': T.LAVA, j: T.LAVA, A: T.AXE, f: T.USED, T: T.TREE_M,
  };
  const BLOCK_CONTENTS = { '?': 'coin', M: 'power', S: 'star', C: 'multi', L: '1up', H: 'coin' };
  const SPAWN_CHARS = {
    g: { type: 'goomba' },
    k: { type: 'koopa' },
    r: { type: 'koopa', props: { red: true } },
    '-': { type: 'lift', props: { kind: 'h' } },
    '|': { type: 'lift', props: { kind: 'v' } },
    u: { type: 'lift', props: { kind: 'up' } },
    d: { type: 'lift', props: { kind: 'down' } },
    _: { type: 'lift', props: { kind: 'fall' } },
    j: { type: 'podoboo' },
    f: { type: 'firebar' },
    Z: { type: 'boss' },
    t: { type: 'toad' },
  };
  const PREFAB_CHARS = 'PV>F^';
  const FLAGPOLE_TILES = 9;

  function stitchZones(def) {
    const zones = [];
    let width = 0;
    def.zones.forEach(function (zone, zi) {
      const rows = [];
      for (let r = 0; r < ROWS; r++) rows.push('');
      zone.map.forEach(function (segment, si) {
        const where = 'level ' + def.name + ', zone ' + zi + ', segment ' + si;
        if (segment.length !== ROWS) {
          throw new Error(where + ': expected ' + ROWS + ' rows but found ' + segment.length);
        }
        const segmentWidth = segment[0].length;
        for (let r = 0; r < ROWS; r++) {
          if (segment[r].length !== segmentWidth) {
            throw new Error(where + ': row ' + r + ' is ' + segment[r].length +
              ' wide but row 0 is ' + segmentWidth);
          }
          rows[r] += segment[r];
        }
      });
      const zoneWidth = rows[0].length;
      if (zoneWidth * TILE < SM.VIEW_W) {
        throw new Error('level ' + def.name + ', zone ' + zi + ' is narrower than the screen');
      }
      zones.push({ x0: width, x1: width + zoneWidth, theme: zone.theme, rows: rows });
      width += zoneWidth;
    });
    return { zones: zones, width: width };
  }

  function parse(def, index) {
    const stitched = stitchZones(def);
    const width = stitched.width;
    const L = {
      index: index,
      name: def.name,
      time: def.time,
      w: width,
      h: ROWS,
      tiles: new Uint8Array(width * ROWS),
      contents: {},
      zones: stitched.zones.map(function (z) {
        return { x0: z.x0, x1: z.x1, theme: z.theme };
      }),
      spawns: [],
      markers: {},
      start: null,
      checkpoint: null,
      flag: null,
      castle: null,
      axe: null,
      bridge: [],
      toad: null,
      warps: [],
      deco: [],
    };
    const prefabs = [];

    stitched.zones.forEach(function (zone, zi) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < zone.rows[r].length; c++) {
          const ch = zone.rows[r][c];
          if (ch === ' ') continue;
          const x = zone.x0 + c;
          const i = r * width + x;
          let known = false;
          if (TILE_CHARS[ch] !== undefined) {
            L.tiles[i] = TILE_CHARS[ch];
            if (BLOCK_CONTENTS[ch]) L.contents[i] = BLOCK_CONTENTS[ch];
            if (ch === '=') L.bridge.push(i);
            if (ch === 'A') L.axe = { tx: x, ty: r, zone: zi };
            known = true;
          }
          if (SPAWN_CHARS[ch]) {
            const spawn = SPAWN_CHARS[ch];
            L.spawns.push({ type: spawn.type, tx: x, ty: r, zone: zi, props: spawn.props || null });
            if (ch === 't') L.toad = { tx: x, ty: r, zone: zi };
            known = true;
          }
          if (PREFAB_CHARS.indexOf(ch) >= 0) {
            prefabs.push({ ch: ch, x: x, r: r, zi: zi });
          } else if (ch === '@') {
            L.start = { tx: x, ty: r, zone: zi };
          } else if (ch === 'c') {
            L.checkpoint = { tx: x, ty: r, zone: zi };
          } else if (ch >= '1' && ch <= '9') {
            L.markers[ch] = { tx: x, ty: r, zone: zi };
          } else if (!known) {
            throw new Error('level ' + def.name + ": unknown map character '" + ch +
              "' at column " + x + ', row ' + r);
          }
        }
      }
    });

    function set(x, r, tile) {
      L.tiles[r * width + x] = tile;
    }
    function isFree(x, r) {
      return r < ROWS && L.tiles[r * width + x] === T.AIR;
    }

    prefabs.forEach(function (p) {
      if (p.ch === 'P' || p.ch === 'V') {
        set(p.x, p.r, T.PIPE_TL);
        set(p.x + 1, p.r, T.PIPE_TR);
        for (let r = p.r + 1; isFree(p.x, r) && isFree(p.x + 1, r); r++) {
          set(p.x, r, T.PIPE_L);
          set(p.x + 1, r, T.PIPE_R);
        }
        if (p.ch === 'V') L.spawns.push({ type: 'piranha', tx: p.x, ty: p.r, zone: p.zi, props: null });
      } else if (p.ch === '>') {
        set(p.x, p.r, T.HPIPE_MT);
        set(p.x, p.r + 1, T.HPIPE_MB);
        const end = L.zones[p.zi].x1;
        for (let x = p.x + 1; x < end && isFree(x, p.r) && isFree(x, p.r + 1); x++) {
          set(x, p.r, T.HPIPE_T);
          set(x, p.r + 1, T.HPIPE_B);
        }
      } else if (p.ch === 'F') {
        set(p.x, p.r, T.HARD);
        for (let k = 1; k <= FLAGPOLE_TILES; k++) set(p.x, p.r - k, T.POLE);
        set(p.x, p.r - FLAGPOLE_TILES - 1, T.POLE_TOP);
        L.flag = {
          x: p.x * TILE + TILE / 2,
          topY: (p.r - FLAGPOLE_TILES) * TILE,
          baseY: p.r * TILE,
          zone: p.zi,
        };
      } else if (p.ch === '^') {
        // The marker is the bottom-left cell of a castle five tiles wide and tall.
        L.castle = { x: p.x * TILE, y: (p.r - 4) * TILE, zone: p.zi };
      }
    });

    // Each run of treetop tiles gets rounded ends and a single trunk under its middle.
    for (let r = 0; r < ROWS; r++) {
      for (let x = 0; x < width; x++) {
        if (L.tiles[r * width + x] !== T.TREE_M) continue;
        let end = x;
        while (end + 1 < width && L.tiles[r * width + end + 1] === T.TREE_M) end++;
        if (end > x) {
          set(x, r, T.TREE_L);
          set(end, r, T.TREE_R);
        }
        const mid = Math.floor((x + end) / 2);
        for (let below = r + 1; isFree(mid, below); below++) set(mid, below, T.TRUNK);
        x = end;
      }
    }

    (def.warps || []).forEach(function (warp) {
      const from = L.markers[warp.from];
      const to = L.markers[warp.to];
      const where = 'level ' + def.name + ', warp ' + warp.from + '->' + warp.to;
      if (!from || !to) throw new Error(where + ': marker is missing from the map');
      const below = function (m) {
        return L.tiles[(m.ty + 1) * width + m.tx];
      };
      if (warp.enter === 'down' && below(from) !== T.PIPE_TL) {
        throw new Error(where + ': the entry marker must sit above the left half of a pipe top');
      }
      if (warp.enter === 'right' && L.tiles[from.ty * width + from.tx + 1] !== T.HPIPE_MB) {
        throw new Error(where + ': the entry marker must sit left of the lower half of a pipe mouth');
      }
      if (warp.exit === 'up' && below(to) !== T.PIPE_TL) {
        throw new Error(where + ': the exit marker must sit above the left half of a pipe top');
      }
      L.warps.push({
        enter: warp.enter, tx: from.tx, ty: from.ty, zone: from.zone,
        exit: warp.exit, toTx: to.tx, toTy: to.ty, toZone: to.zone,
      });
    });

    if (!L.start) throw new Error('level ' + def.name + ' has no start (@)');
    if (!(L.flag && L.castle) && !L.axe) {
      throw new Error('level ' + def.name + ' needs a flagpole and castle (F, ^) or an axe (A)');
    }
    if (L.axe && !L.toad) throw new Error('level ' + def.name + ' has an axe but nobody to rescue (t)');

    decorate(L, index);
    return L;
  }

  // Scatters clouds, hills and bushes with a fixed seed so a level always looks the same.
  function decorate(L, index) {
    let seed = (index + 1) * 7919;
    function rnd(n) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed >> 8) % n;
    }
    function isFlat(x, n) {
      for (let i = 0; i < n; i++) {
        const cx = x + i;
        if (L.tiles[13 * L.w + cx] !== T.GROUND || L.tiles[12 * L.w + cx] !== T.AIR) return false;
        if (L.castle && cx * TILE >= L.castle.x - TILE && cx * TILE < L.castle.x + 6 * TILE) return false;
      }
      return true;
    }
    L.zones.forEach(function (zone, zi) {
      if (zone.theme !== 'overworld' && zone.theme !== 'sky') return;
      for (let x = zone.x0 + 1 + rnd(6); x < zone.x1 - 4; x += 6 + rnd(9)) {
        L.deco.push({ kind: 'cloud', size: 1 + rnd(3), x: x * TILE, y: 28 + rnd(56), zone: zi });
      }
      if (zone.theme !== 'overworld') return;
      let x = zone.x0 + rnd(4);
      while (x < zone.x1 - 6) {
        const pick = rnd(5);
        const kind = pick === 0 ? 'bigHill' : pick === 1 ? 'smallHill' : 'bush';
        const size = kind === 'bush' ? 1 + rnd(3) : 0;
        const tiles = kind === 'bigHill' ? 5 : kind === 'smallHill' ? 3 : size + 1;
        if (isFlat(x, tiles)) {
          L.deco.push({ kind: kind, size: size, x: x * TILE, y: 13 * TILE, zone: zi });
          x += tiles + 2 + rnd(7);
        } else {
          x += 1;
        }
      }
    });
  }

  const cache = [];
  SM.Levels = {
    count: function () {
      return SM.LEVEL_DATA.length;
    },
    get: function (index) {
      if (!cache[index]) cache[index] = parse(SM.LEVEL_DATA[index], index);
      return cache[index];
    },
    parse: parse,
  };
})((globalThis.SM = globalThis.SM || {}));
