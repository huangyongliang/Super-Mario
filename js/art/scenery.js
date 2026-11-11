/*
 * Clouds, bushes and hills. These are smooth shapes, so they are rasterised from circles and
 * ellipses here instead of being drawn by hand; the result is the same kind of text sprite.
 */
(function (SM) {
  'use strict';

  const ART = (SM.ART = SM.ART || { palettes: {}, sprites: {}, themes: {} });

  Object.assign(ART.palettes, {
    cloud: { k: '#101010', w: '#fcfcfc', b: '#a8e4fc' },
    bush: { k: '#0c3c10', w: '#58d440', b: '#28a028' },
    hill: { k: '#0c3c10', w: '#30a830', b: '#1c8020', d: '#0c3c10' },
  });

  // Fills the inside of `inside(x, y)` with 'w', shades the lower part with 'b' and outlines it
  // with 'k'. Shapes may run off the bottom edge, which is then left open.
  function rasterise(w, h, inside, shadeFrom) {
    const filled = function (x, y) {
      return x >= 0 && x < w && y >= 0 && (y >= h ? inside(x, h - 1) : inside(x, y));
    };
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        if (!filled(x, y)) {
          row += '.';
        } else if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)) {
          row += 'k';
        } else {
          row += shadeFrom(x, y) ? 'b' : 'w';
        }
      }
      rows.push(row);
    }
    return rows;
  }

  function inCircles(circles) {
    return function (x, y) {
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i];
        const dx = x + 0.5 - c[0];
        const dy = y + 0.5 - c[1];
        if (dx * dx + dy * dy <= c[2] * c[2]) return true;
      }
      return false;
    };
  }

  // A cloud is a row of puffs; `size` is how many puffs sit along the top.
  function cloud(size, height) {
    const w = 32 + size * 16;
    const circles = [[11, height - 10, 9], [w - 11, height - 10, 9]];
    for (let i = 0; i < size; i++) circles.push([24 + i * 16, 12, 11]);
    for (let x = 12; x <= w - 12; x += 4) circles.push([x, height - 10, 9]);
    return rasterise(w, height, inCircles(circles), function (x, y) {
      return y >= height - 7;
    });
  }

  // A bush is a cloud sunk into the ground: bumps along the top and an open bottom.
  function bush(size, height) {
    const w = 32 + size * 16;
    const circles = [];
    for (let i = 0; i <= size + 1; i++) circles.push([10 + (i * (w - 20)) / (size + 1), 9, 9]);
    for (let x = 10; x <= w - 10; x += 4) circles.push([x, height + 3, 10]);
    return rasterise(w, height, inCircles(circles), function (x, y) {
      return y >= height - 5;
    });
  }

  const HILL_SPOT = ['.d.', 'ddd', 'ddd', '.d.'];

  function hill(w, h, spots) {
    const rx = w / 2;
    const inside = function (x, y) {
      const dx = (x + 0.5 - rx) / rx;
      const dy = (h - (y + 0.5)) / h;
      return dx * dx + dy * dy <= 1;
    };
    const rows = rasterise(w, h, inside, function () {
      return false;
    });
    spots.forEach(function (s) {
      HILL_SPOT.forEach(function (pattern, dy) {
        const r = rows[s[1] + dy].split('');
        for (let dx = 0; dx < pattern.length; dx++) {
          if (pattern[dx] !== '.') r[s[0] + dx] = pattern[dx];
        }
        rows[s[1] + dy] = r.join('');
      });
    });
    return rows;
  }

  for (let size = 1; size <= 3; size++) {
    ART.sprites['cloud' + size] = { pal: 'cloud', rows: cloud(size, 28) };
    ART.sprites['bush' + size] = { pal: 'bush', rows: bush(size, 18) };
  }
  ART.sprites.bigHill = { pal: 'hill', rows: hill(80, 38, [[30, 12], [46, 12], [38, 24]]) };
  ART.sprites.smallHill = { pal: 'hill', rows: hill(48, 22, [[22, 10]]) };
})((globalThis.SM = globalThis.SM || {}));
