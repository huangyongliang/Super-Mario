/*
 * Turns the text pixel art in js/art into canvases, once per sprite, palette and orientation, and
 * draws text with the bitmap fonts.
 */
(function (SM) {
  'use strict';

  const ART = SM.ART;
  const images = new Map();
  const palettes = new Map();
  const fonts = new Map();

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function rgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  // Sideways pipes are the upright pipe pieces mirrored across the diagonal.
  function transpose(rows) {
    const out = [];
    for (let x = 0; x < rows[0].length; x++) {
      let line = '';
      for (let y = 0; y < rows.length; y++) line += rows[y][x];
      out.push(line);
    }
    return out;
  }
  [['hpipeMT', 'pipeTL'], ['hpipeMB', 'pipeTR'], ['hpipeT', 'pipeL'], ['hpipeB', 'pipeR']].forEach(function (p) {
    ART.sprites[p[0]] = { pal: 'pipe', rows: transpose(ART.sprites[p[1]].rows) };
  });

  // A palette by name, or a named palette with some colours replaced ('base+key').
  function palette(name, overrides, key) {
    if (!overrides) return ART.palettes[name];
    const id = name + '+' + key;
    let pal = palettes.get(id);
    if (!pal) {
      pal = Object.assign({}, ART.palettes[name], overrides);
      palettes.set(id, pal);
    }
    return pal;
  }

  function build(rows, pal, flipX, flipY) {
    const w = rows[0].length;
    const h = rows.length;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const data = ctx.createImageData(w, h);
    const colours = {};
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || !pal[ch]) continue;
        const c = colours[ch] || (colours[ch] = rgb(pal[ch]));
        const o = ((flipY ? h - 1 - y : y) * w + (flipX ? w - 1 - x : x)) * 4;
        data.data[o] = c[0];
        data.data[o + 1] = c[1];
        data.data[o + 2] = c[2];
        data.data[o + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  /*
   * The canvas for sprite `name`. `pal` is a palette name (default: the sprite's own); `overrides`
   * replaces some of its colours and `key` names that variation for the cache.
   */
  function get(name, pal, flipX, flipY, overrides, key) {
    const sprite = ART.sprites[name];
    const palName = pal || sprite.pal;
    const id = name + '|' + palName + '|' + (key || '') + '|' + (flipX ? 1 : 0) + (flipY ? 1 : 0);
    let img = images.get(id);
    if (!img) {
      img = build(sprite.rows, palette(palName, overrides, key), flipX, flipY);
      images.set(id, img);
    }
    return img;
  }

  function draw(ctx, name, x, y, pal, flipX, flipY) {
    ctx.drawImage(get(name, pal, flipX, flipY), Math.round(x), Math.round(y));
  }

  // ---------------------------------------------------------------- text

  function fontAtlas(glyphs, size, colour) {
    const id = size + colour;
    let atlas = fonts.get(id);
    if (atlas) return atlas;
    const chars = Object.keys(glyphs);
    const gw = glyphs[chars[0]][0].length;
    const gh = glyphs[chars[0]].length;
    const canvas = makeCanvas(chars.length * (gw + 1), gh);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colour;
    const index = {};
    chars.forEach(function (ch, i) {
      index[ch] = i;
      glyphs[ch].forEach(function (row, y) {
        for (let x = 0; x < gw; x++) if (row[x] === '#') ctx.fillRect(i * (gw + 1) + x, y, 1, 1);
      });
    });
    atlas = { canvas: canvas, index: index, gw: gw, gh: gh };
    fonts.set(id, atlas);
    return atlas;
  }

  function textWidth(text, tiny) {
    return String(text).length * (tiny ? 4 : 8);
  }

  /*
   * Draws text with its top-left corner at x, y. Options: colour, shadow (colour), align
   * ('left' | 'center' | 'right'), scale, tiny (the small digit font).
   */
  function text(ctx, str, x, y, options) {
    options = options || {};
    str = String(str).toUpperCase();
    const scale = options.scale || 1;
    const advance = (options.tiny ? 4 : 8) * scale;
    let left = x;
    if (options.align === 'center') left = x - (str.length * advance) / 2;
    else if (options.align === 'right') left = x - str.length * advance;
    left = Math.round(left);
    if (options.shadow) {
      const shadow = Object.assign({}, options, { shadow: null, colour: options.shadow, align: 'left' });
      text(ctx, str, left + scale, y + scale, shadow);
    }
    const atlas = fontAtlas(options.tiny ? ART.tinyFont : ART.font, options.tiny ? 't' : 'n', options.colour || '#fcfcfc');
    for (let i = 0; i < str.length; i++) {
      const g = atlas.index[str[i]];
      if (g === undefined) continue;
      ctx.drawImage(
        atlas.canvas, g * (atlas.gw + 1), 0, atlas.gw, atlas.gh,
        left + i * advance, y, atlas.gw * scale, atlas.gh * scale
      );
    }
  }

  SM.Sprites = { get: get, draw: draw, text: text, textWidth: textWidth, makeCanvas: makeCanvas };
})((globalThis.SM = globalThis.SM || {}));
