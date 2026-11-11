/*
 * Keyboard, gamepad and touch input, merged into the buttons the game reads each frame:
 * held buttons (left, right, down, jump, run) and one-shot presses (start, pause, mute, fullscreen).
 */
(function (SM) {
  'use strict';

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyX: 'jump', KeyK: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run', KeyZ: 'run', KeyJ: 'run',
    Enter: 'start', NumpadEnter: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute',
    KeyF: 'fullscreen',
  };
  const HELD = ['left', 'right', 'down', 'jump', 'run'];
  const PAD_DEADZONE = 0.45;
  // Touches this close to a button still press it, so a thumb can sit between A and B.
  const TOUCH_SLACK = 14;

  function create(touchRoot) {
    const keys = new Set();
    const taps = {};
    const pointers = new Map();
    let padPrev = {};
    let rects = [];
    let anyPress = false;

    function press(action) {
      taps[action] = true;
      anyPress = true;
    }

    window.addEventListener('keydown', function (e) {
      const action = KEYS[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (HELD.indexOf(action) < 0) press(action);
      else anyPress = true;
    });
    window.addEventListener('keyup', function (e) {
      if (KEYS[e.code]) keys.delete(e.code);
    });
    window.addEventListener('blur', function () {
      keys.clear();
      pointers.clear();
    });

    // ------------------------------------------------------------ touch

    function measure() {
      if (!touchRoot) return;
      rects = Array.prototype.map.call(touchRoot.querySelectorAll('[data-hold]'), function (el) {
        const r = el.getBoundingClientRect();
        return { action: el.getAttribute('data-hold'), el: el, l: r.left, t: r.top, r: r.right, b: r.bottom };
      });
    }

    if (touchRoot) {
      const track = function (e) {
        if (!pointers.has(e.pointerId) && e.type !== 'pointerdown') return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      };
      const release = function (e) {
        pointers.delete(e.pointerId);
      };
      touchRoot.addEventListener('pointerdown', function (e) {
        const tap = e.target.closest('[data-tap]');
        if (tap) {
          e.preventDefault();
          press(tap.getAttribute('data-tap'));
          return;
        }
        if (!e.target.closest('[data-hold]')) return;
        e.preventDefault();
        if (rects.length === 0) measure();
        if (touchRoot.setPointerCapture) {
          try {
            touchRoot.setPointerCapture(e.pointerId);
          } catch (err) {
            // Some browsers refuse capture for synthetic pointers; tracking still works without it.
          }
        }
        anyPress = true;
        track(e);
      });
      touchRoot.addEventListener('pointermove', track);
      touchRoot.addEventListener('pointerup', release);
      touchRoot.addEventListener('pointercancel', release);
      touchRoot.addEventListener('contextmenu', function (e) {
        e.preventDefault();
      });
      window.addEventListener('resize', measure);
      window.addEventListener('orientationchange', measure);
    }

    function touchHeld(out) {
      rects.forEach(function (r) {
        r.el.classList.remove('down');
      });
      pointers.forEach(function (pt) {
        rects.forEach(function (r) {
          if (pt.x >= r.l - TOUCH_SLACK && pt.x <= r.r + TOUCH_SLACK && pt.y >= r.t - TOUCH_SLACK && pt.y <= r.b + TOUCH_SLACK) {
            out[r.action] = true;
            r.el.classList.add('down');
          }
        });
      });
    }

    // ------------------------------------------------------------ gamepads

    function gamepadHeld(out) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const now = {};
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad || !pad.connected) continue;
        const b = function (n) {
          return !!(pad.buttons[n] && pad.buttons[n].pressed);
        };
        const ax = pad.axes[0] || 0;
        const ay = pad.axes[1] || 0;
        if (b(14) || ax < -PAD_DEADZONE) out.left = true;
        if (b(15) || ax > PAD_DEADZONE) out.right = true;
        if (b(13) || ay > PAD_DEADZONE) out.down = true;
        if (b(0) || b(3)) out.jump = true;
        if (b(1) || b(2)) out.run = true;
        if (b(9)) now.start = true;
        if (b(8)) now.mute = true;
      }
      Object.keys(now).forEach(function (k) {
        if (!padPrev[k]) press(k);
      });
      if (out.jump && !padPrev.jump) anyPress = true;
      now.jump = !!out.jump;
      padPrev = now;
    }

    /*
     * Returns { held: {left, right, down, jump, run}, pressed: {start, pause, mute, fullscreen},
     * any } and clears the one-shot presses.
     */
    function poll() {
      const held = {};
      keys.forEach(function (code) {
        held[KEYS[code]] = true;
      });
      touchHeld(held);
      gamepadHeld(held);
      const result = {
        held: { left: !!held.left, right: !!held.right, down: !!held.down, jump: !!held.jump, run: !!held.run },
        pressed: { start: !!taps.start, pause: !!taps.pause, mute: !!taps.mute, fullscreen: !!taps.fullscreen },
        any: anyPress,
      };
      Object.keys(taps).forEach(function (k) {
        delete taps[k];
      });
      anyPress = false;
      return result;
    }

    return { poll: poll, measure: measure };
  }

  SM.Input = { create: create };
})((globalThis.SM = globalThis.SM || {}));
