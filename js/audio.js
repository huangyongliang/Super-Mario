/*
 * Sound effects and music, synthesised with the Web Audio API: pulse and triangle waves plus noise,
 * like an 8-bit console. All of the tunes are original. Nothing plays until the first key press or
 * tap, because browsers keep audio locked until then.
 */
(function (SM) {
  'use strict';

  const STORAGE_KEY = 'sm-html-muted';
  const LOOKAHEAD = 0.12;
  const MUSIC_VOLUME = 0.55;
  const SFX_VOLUME = 0.7;

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuffer = null;
  const waves = {};
  let muted = false;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    muted = false;
  }

  // ---------------------------------------------------------------- set-up

  function pulseWave(duty) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_VOLUME;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOLUME;
      musicBus.connect(master);
      waves.pulse12 = pulseWave(0.125);
      waves.pulse25 = pulseWave(0.25);
      waves.pulse50 = pulseWave(0.5);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !paused) ctx.resume();
  }

  function ready() {
    return !!ctx && ctx.state !== 'closed';
  }

  const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(note) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
    if (!m) throw new Error('bad note ' + note);
    let semi = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    semi += (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }

  function oscillator(wave, f, t) {
    const o = ctx.createOscillator();
    if (wave === 'triangle' || wave === 'sine' || wave === 'sawtooth') o.type = wave;
    else o.setPeriodicWave(waves[wave] || waves.pulse50);
    o.frequency.setValueAtTime(f, t);
    return o;
  }

  // ---------------------------------------------------------------- sound effects

  // A tone gliding from f0 to f1 (Hz) over `dur` seconds.
  function sweep(bus, wave, f0, f1, dur, vol, t, curve) {
    const o = oscillator(wave, f0, t);
    if (f1 !== f0) {
      if (curve === 'linear') o.frequency.linearRampToValueAtTime(f1, t + dur);
      else o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function blip(bus, wave, note, dur, vol, t) {
    const f = typeof note === 'number' ? note : freq(note);
    sweep(bus, wave, f, f, dur, vol, t);
  }

  function noise(bus, dur, vol, t, filter, from, to) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter || 'lowpass';
    f.frequency.setValueAtTime(from || 3000, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  function arpeggio(notes, step, wave, vol, t) {
    notes.forEach(function (n, i) {
      blip(sfxBus, wave, n, step * 1.1, vol, t + i * step);
    });
  }

  const SFX = {
    jump: function (t) {
      sweep(sfxBus, 'pulse25', 300, 640, 0.14, 0.22, t);
    },
    jumpBig: function (t) {
      sweep(sfxBus, 'pulse25', 220, 470, 0.16, 0.22, t);
    },
    coin: function (t) {
      blip(sfxBus, 'pulse25', 'A5', 0.06, 0.2, t);
      sweep(sfxBus, 'pulse25', freq('E6'), freq('E6'), 0.32, 0.2, t + 0.06);
    },
    bump: function (t) {
      sweep(sfxBus, 'triangle', 180, 70, 0.1, 0.5, t);
      noise(sfxBus, 0.06, 0.15, t, 'lowpass', 600);
    },
    break: function (t) {
      noise(sfxBus, 0.28, 0.5, t, 'lowpass', 2400, 300);
      sweep(sfxBus, 'triangle', 160, 50, 0.16, 0.5, t);
    },
    stomp: function (t) {
      sweep(sfxBus, 'pulse50', 520, 180, 0.09, 0.22, t);
      sweep(sfxBus, 'pulse50', 700, 300, 0.07, 0.15, t + 0.06);
    },
    kick: function (t) {
      sweep(sfxBus, 'pulse25', 1000, 280, 0.08, 0.2, t);
      noise(sfxBus, 0.05, 0.15, t, 'highpass', 2000);
    },
    sprout: function (t) {
      ['C5', 'G5', 'C6', 'D5', 'A5', 'D6', 'E5', 'B5', 'E6'].forEach(function (n, i) {
        blip(sfxBus, 'pulse12', n, 0.04, 0.16, t + i * 0.035);
      });
    },
    powerup: function (t) {
      arpeggio(['C5', 'E5', 'G5', 'D5', 'F#5', 'A5', 'E5', 'G#5', 'B5', 'F#5', 'A#5', 'C#6', 'G#5', 'C6', 'D#6'], 0.035, 'pulse25', 0.17, t);
    },
    '1up': function (t) {
      arpeggio(['C6', 'E6', 'G6', 'C7'], 0.075, 'pulse25', 0.2, t);
      blip(sfxBus, 'pulse25', 'G6', 0.1, 0.2, t + 0.32);
      blip(sfxBus, 'pulse25', 'C7', 0.2, 0.2, t + 0.42);
    },
    shrink: function (t) {
      for (let i = 0; i < 3; i++) sweep(sfxBus, 'pulse50', 520, 130, 0.12, 0.18, t + i * 0.13);
    },
    pipe: function (t) {
      for (let i = 0; i < 3; i++) sweep(sfxBus, 'pulse50', 360, 110, 0.1, 0.2, t + i * 0.12);
    },
    fireball: function (t) {
      sweep(sfxBus, 'pulse12', 900, 1500, 0.05, 0.16, t);
      noise(sfxBus, 0.06, 0.12, t, 'highpass', 3000);
    },
    flag: function (t) {
      sweep(sfxBus, 'pulse25', 1400, 260, 0.9, 0.14, t);
    },
    tick: function (t) {
      blip(sfxBus, 'pulse12', 1760, 0.025, 0.08, t);
    },
    crumble: function (t) {
      noise(sfxBus, 0.07, 0.25, t, 'lowpass', 1500);
    },
    bossFall: function (t) {
      sweep(sfxBus, 'pulse50', 700, 70, 1.2, 0.18, t);
    },
    bossHit: function (t) {
      sweep(sfxBus, 'pulse50', 240, 110, 0.12, 0.25, t);
      noise(sfxBus, 0.1, 0.2, t, 'lowpass', 900);
    },
    bossDie: function (t) {
      sweep(sfxBus, 'pulse25', 1000, 260, 0.08, 0.2, t);
      sweep(sfxBus, 'pulse50', 600, 60, 1.1, 0.18, t + 0.1);
    },
    flame: function (t) {
      noise(sfxBus, 0.55, 0.3, t, 'lowpass', 900, 200);
    },
    pause: function (t) {
      arpeggio(['E6', 'C6', 'E6', 'C6'], 0.06, 'pulse25', 0.16, t);
    },
    star: function () {},
    starEnd: function () {},
  };

  function play(name) {
    if (!ready() || paused) return;
    const fx = SFX[name];
    if (fx) fx(ctx.currentTime + 0.005);
  }

  // ---------------------------------------------------------------- music

  /*
   * A track is a string of notes: "C5:2 E5 r:4 ..." where the number is the length in sixteenth
   * notes (default 2) and r is a rest. Drum tracks use k (kick), s (snare) and h (hi-hat).
   */
  function parseTrack(text) {
    const events = [];
    let step = 0;
    text.trim().split(/\s+/).forEach(function (token) {
      const parts = token.split(':');
      const len = parts[1] ? parseFloat(parts[1]) : 2;
      if (parts[0] !== 'r') events.push({ step: step, len: len, note: parts[0] });
      step += len;
    });
    return { events: events, length: step };
  }

  // Chord-based accompaniment, one chord per bar of 16 steps.
  const CHORD_TONES = {
    C: ['C', 'E', 'G'], Am: ['A', 'C', 'E'], F: ['F', 'A', 'C'], G: ['G', 'B', 'D'], Dm: ['D', 'F', 'A'],
    Em: ['E', 'G', 'B'], E: ['E', 'G#', 'B'], G7: ['G', 'B', 'F'], Bb: ['Bb', 'D', 'F'], A: ['A', 'C#', 'E'],
  };
  function pitchClass(name) {
    return NOTE_INDEX[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0);
  }
  // `name` in the octave that puts it at or just above `base` (which is in `octave`).
  function above(name, base, octave) {
    return name + (pitchClass(name) < pitchClass(base) ? octave + 1 : octave);
  }
  function bassLine(chords, octave) {
    return chords.map(function (c) {
      const t = CHORD_TONES[c];
      const lo = t[0] + octave;
      const hi = t[0] + (octave + 1);
      const fifth = above(t[2], t[0], octave);
      return [lo + ':2', 'r:2', fifth + ':2', lo + ':2', hi + ':2', 'r:2', fifth + ':2', lo + ':2'].join(' ');
    }).join(' ');
  }
  function offbeats(chords, octave) {
    return chords.map(function (c) {
      const t = CHORD_TONES[c];
      const a = t[1] + octave;
      const b = above(t[2], t[1], octave);
      return ['r:2', a + ':1', 'r:1', 'r:2', b + ':1', 'r:1', 'r:2', a + ':1', 'r:1', 'r:2', b + ':1', 'r:1'].join(' ');
    }).join(' ');
  }
  function repeat(text, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(text);
    return out.join(' ');
  }

  const OVERWORLD_CHORDS = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'C', 'F', 'G', 'Em', 'Am', 'F', 'G', 'E', 'G7'];

  const SONGS = {
    overworld: {
      bpm: 160, loop: true,
      tracks: [
        { wave: 'pulse25', vol: 0.13, notes:
          'E5 G5 C6:3 G5:1 E5 G5 A5 G5  E5 C5 A4:4 C5 E5 D5 C5 ' +
          'F5 A5 C6:3 A5:1 F5 A5 Bb5 A5  G5:4 D5 G5 B5:4 r:4 ' +
          'E5 G5 C6:3 G5:1 E5 G5 C6 E6  D6 C6 A5:4 E5 A5 G5 E5 ' +
          'F5 E5 D5 F5 G5 F5 E5 D5  C5:6 r:2 G4 A4 B4 r:2 ' +
          'A5:3 G5:1 F5 A5 C6:4 A5:4  B5:3 A5:1 G5 B5 D6:4 B5:4 ' +
          'G5 E5 B4 E5 G5 B5 A5 G5  A5:6 E5 C5 E5 A5:4 ' +
          'F5 A5 C6 F6 E6 C6 A5 C6  D6 B5 G5 D5 G5 B5 D6:4 ' +
          'E6:3 D6:1 C6 B5 G#5:4 E5:4  G5 F5 E5 D5 B4 D5 G5:4' },
        { wave: 'pulse50', vol: 0.06, notes: offbeats(OVERWORLD_CHORDS, 4) },
        { wave: 'triangle', vol: 0.32, notes: bassLine(OVERWORLD_CHORDS, 2) },
        { wave: 'drums', vol: 0.5, notes: repeat('k h s h k k s h', 16) },
      ],
    },
    underground: {
      bpm: 120, loop: true,
      tracks: [
        { wave: 'pulse12', vol: 0.13, notes: repeat(
          'E4:1 r:1 E5:1 r:1 B4 r:2 D5:1 r:1 C5:1 r:1 B4 r:2 ' +
          'A4:1 r:1 A5:1 r:1 E5 r:2 G5:1 r:1 F#5:1 r:1 E5 r:2 ' +
          'C5:1 r:1 C6:1 r:1 G5 r:2 B5:1 r:1 A5:1 r:1 G5 r:2 ' +
          'B4:1 r:1 B5:1 r:1 F#5 r:2 D#5 F#5 B4 r:2', 1) + ' ' +
          'E4:1 r:1 E5:1 r:1 B4 r:2 D5:1 r:1 C5:1 r:1 B4 r:2 ' +
          'A4:1 r:1 A5:1 r:1 E5 r:2 G5:1 r:1 F#5:1 r:1 E5 r:2 ' +
          'C5:1 r:1 C6:1 r:1 G5 r:2 B5:1 r:1 A5:1 r:1 G5 r:2 ' +
          'E5:4 B4 G4 E4:4 r:4' },
        { wave: 'triangle', vol: 0.34, notes:
          repeat('E2 E3 E2 E3 E2 E3 E2 E3', 1) + ' ' + repeat('A2 A3 A2 A3 A2 A3 A2 A3', 1) + ' ' +
          repeat('C3 C4 C3 C4 C3 C4 C3 C4', 1) + ' ' + repeat('B2 B3 B2 B3 B2 B3 B2 B3', 1) + ' ' +
          repeat('E2 E3 E2 E3 E2 E3 E2 E3', 1) + ' ' + repeat('A2 A3 A2 A3 A2 A3 A2 A3', 1) + ' ' +
          repeat('C3 C4 C3 C4 C3 C4 C3 C4', 1) + ' ' + 'E2:4 B2:4 E2:4 r:4' },
        { wave: 'drums', vol: 0.35, notes: repeat('k:4 h:2 h:2 s:4 h:4', 8) },
      ],
    },
    castle: {
      bpm: 138, loop: true,
      tracks: [
        { wave: 'pulse25', vol: 0.11, notes: repeat(
          'D5:1 F5:1 A5:1 F5:1 D5:1 F5:1 A5:1 F5:1 C#5:1 E5:1 A5:1 E5:1 C#5:1 E5:1 A5:1 E5:1 ' +
          'D5:1 F5:1 Bb5:1 F5:1 D5:1 F5:1 Bb5:1 F5:1 D5:1 G5:1 Bb5:1 G5:1 C#5:1 E5:1 G5:1 E5:1 ' +
          'D5:1 F5:1 A5:1 F5:1 D5:1 F5:1 A5:1 F5:1 C#5:1 E5:1 A5:1 E5:1 C#5:1 E5:1 A5:1 E5:1 ' +
          'D5:1 F5:1 A5:1 D6:1 C#6:1 A5:1 G5:1 E5:1 F5:1 D5:1 E5:1 C#5:1 D5:4', 2) },
        { wave: 'pulse50', vol: 0.07, notes: repeat('D4:8 C#4:8 Bb3:8 A3:8 D4:8 C#4:8 D4:4 E4:4 A3:8', 2) },
        { wave: 'triangle', vol: 0.34, notes: repeat(
          'D2 D2 D3 D2 A1 A1 A2 A1  Bb1 Bb1 Bb2 Bb1 A1 A1 A2 A1  D2 D2 D3 D2 A1 A1 A2 A1  D2 D2 D3 D2 A1 A2 D2:4', 2) },
        { wave: 'drums', vol: 0.4, notes: repeat('k h:1 h:1 s h k h:1 h:1 s h', 8) },
      ],
    },
    star: {
      bpm: 184, loop: true,
      tracks: [
        { wave: 'pulse25', vol: 0.12, notes: repeat(
          'C5:1 E5:1 G5:1 C6:1 r:1 G5:1 C6 B5:1 G5:1 D5:1 B5:1 r:1 G5:1 B5 ' +
          'A5:1 F5:1 C5:1 A5:1 r:1 F5:1 A5 G5:1 E5:1 C5:1 G5:1 r:1 E5:1 G5', 2) },
        { wave: 'triangle', vol: 0.3, notes: repeat('C3 G3 C3 G3 G2 D3 G2 D3 F2 C3 F2 C3 C3 G3 C3 G3', 2) },
        { wave: 'drums', vol: 0.45, notes: repeat('k h s h k h s h:1 h:1', 4) },
      ],
    },
    clear: {
      bpm: 150, loop: false,
      tracks: [
        { wave: 'pulse25', vol: 0.14, notes: 'G4 C5 E5 G5:4 E5 G5 C6:6 r:2 A5 B5 C6 D6:4 B5 G5 C6:12' },
        { wave: 'pulse50', vol: 0.07, notes: 'E4 G4 C5 E5:4 C5 E5 G5:6 r:2 F5 G5 A5 B5:4 G5 D5 E5:12' },
        { wave: 'triangle', vol: 0.32, notes: 'C3:8 G2:4 C3:8 r:2 F2:8 G2:6 C3:12' },
      ],
    },
    castleClear: {
      bpm: 132, loop: false,
      tracks: [
        { wave: 'pulse25', vol: 0.14, notes:
          'C5 G4 C5 E5 G5:4 E5 C5  D5 A4 D5 F5 A5:4 F5 D5  E5 G5 C6 E6 D6 B5 G5 B5  C6:16' },
        { wave: 'pulse50', vol: 0.07, notes: 'E4:8 G4:8 F4:8 A4:8 G4:8 F4:8 E4:16' },
        { wave: 'triangle', vol: 0.32, notes: 'C3:4 G2:4 C3:4 G2:4 D3:4 A2:4 D3:4 A2:4 C3:4 E3:4 G2:4 B2:4 C3:16' },
        { wave: 'drums', vol: 0.4, notes: 'k h s h k h s h k h s h k h s h k h s h k h s h k:16' },
      ],
    },
    die: {
      bpm: 120, loop: false,
      tracks: [
        { wave: 'pulse25', vol: 0.14, notes: 'G5:1 F#5:1 F5:1 E5:1 r:4 G4:3 F#4:3 F4:3 E4:6 r:2 C4 G3 C4:8' },
        { wave: 'triangle', vol: 0.3, notes: 'r:8 C3:3 B2:3 Bb2:3 A2:6 r:2 G2 G2 C2:8' },
      ],
    },
    gameOver: {
      bpm: 100, loop: false,
      tracks: [
        { wave: 'pulse25', vol: 0.13, notes: 'E5:4 D5:4 C5:4 B4:4 A4:6 r:2 E4 F4 E4 D4 C4:4 B3:4 A3:12' },
        { wave: 'triangle', vol: 0.3, notes: 'A2:8 E2:8 F2:8 C3:4 D3:4 E2:8 A2:12' },
      ],
    },
    hurry: {
      bpm: 180, loop: false,
      tracks: [
        { wave: 'pulse25', vol: 0.14, notes: 'E6:1 r:1 E6:1 r:1 F6:1 r:1 F6:1 r:1 F#6:1 r:1 F#6:1 r:1 G6:6 r:4' },
        { wave: 'pulse50', vol: 0.07, notes: 'G5:1 r:1 G5:1 r:1 Ab5:1 r:1 Ab5:1 r:1 A5:1 r:1 A5:1 r:1 B5:6 r:4' },
      ],
    },
  };

  Object.keys(SONGS).forEach(function (name) {
    const song = SONGS[name];
    song.parsed = song.tracks.map(function (tr) {
      const p = parseTrack(tr.notes);
      return { wave: tr.wave, vol: tr.vol, events: p.events, length: p.length };
    });
    song.length = Math.max.apply(null, song.parsed.map(function (t) {
      return t.length;
    }));
  });

  function drum(kind, vol, t) {
    if (kind === 'k') {
      sweep(musicBus, 'sine', 160, 45, 0.1, vol * 0.9, t);
    } else if (kind === 's') {
      noise(musicBus, 0.11, vol * 0.5, t, 'bandpass', 1800);
    } else {
      noise(musicBus, 0.03, vol * 0.25, t, 'highpass', 7000);
    }
  }

  function scheduleNote(track, ev, t, stepDur) {
    if (track.wave === 'drums') {
      drum(ev.note, track.vol, t);
      return;
    }
    const dur = ev.len * stepDur;
    const o = oscillator(track.wave, freq(ev.note), t);
    const g = ctx.createGain();
    const v = track.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    if (track.wave === 'triangle') {
      g.gain.setValueAtTime(v, t + dur * 0.85);
    } else {
      g.gain.linearRampToValueAtTime(v * 0.6, t + Math.min(0.12, dur * 0.5));
      g.gain.setValueAtTime(v * 0.6, t + dur * 0.85);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 0.97);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur);
  }

  let current = null;
  let timer = null;
  let paused = false;

  function tick() {
    if (!current || !ready()) return;
    const song = current.song;
    const stepDur = 60 / (song.bpm * current.tempo) / 4;
    while (current.nextTime < ctx.currentTime + LOOKAHEAD) {
      const step = current.step;
      song.parsed.forEach(function (track, ti) {
        const evs = track.events;
        let k = current.cursor[ti];
        while (k < evs.length && evs[k].step === step) {
          scheduleNote(track, evs[k], current.nextTime, stepDur);
          k++;
        }
        current.cursor[ti] = k;
      });
      current.step++;
      current.nextTime += stepDur;
      if (current.step >= song.length) {
        if (!song.loop) {
          const done = current.onEnd;
          const endAt = current.nextTime;
          current = null;
          if (done) {
            setTimeout(done, Math.max(0, (endAt - ctx.currentTime) * 1000));
          }
          return;
        }
        current.step = 0;
        current.cursor = song.parsed.map(function () {
          return 0;
        });
      }
    }
  }

  // Cuts off notes that are already scheduled by swapping in a fresh music bus.
  function silenceMusic() {
    if (!ready()) return;
    const old = musicBus;
    const now = ctx.currentTime;
    old.gain.setValueAtTime(old.gain.value, now);
    old.gain.linearRampToValueAtTime(0, now + 0.03);
    setTimeout(function () {
      old.disconnect();
    }, 100);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(master);
  }

  /* Plays a song. options: tempo (multiplier), onEnd (called when a non-looping song ends). */
  function music(name, options) {
    options = options || {};
    stopMusic();
    if (!ready()) return;
    const song = SONGS[name];
    if (!song) return;
    current = {
      name: name,
      song: song,
      tempo: options.tempo || 1,
      onEnd: options.onEnd || null,
      step: 0,
      cursor: song.parsed.map(function () {
        return 0;
      }),
      nextTime: ctx.currentTime + 0.05,
    };
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }

  function stopMusic() {
    if (current) silenceMusic();
    current = null;
  }

  function playing() {
    return current ? current.name : null;
  }

  // Pausing plays a chime and then freezes all audio; music picks up where it stopped.
  function setPaused(on) {
    if (!ready()) {
      paused = on;
      return;
    }
    if (on) {
      SFX.pause(ctx.currentTime + 0.005);
      paused = true;
      setTimeout(function () {
        if (paused) ctx.suspend();
      }, 320);
    } else {
      paused = false;
      ctx.resume().then(function () {
        SFX.pause(ctx.currentTime + 0.005);
      });
    }
  }

  function toggleMute() {
    muted = !muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (e) {
      // Storage can be unavailable (private mode, file://); muting still works for this session.
    }
    if (master) master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
    return muted;
  }

  SM.Audio = {
    unlock: unlock,
    play: play,
    music: music,
    stopMusic: stopMusic,
    playing: playing,
    setPaused: setPaused,
    toggleMute: toggleMute,
    isMuted: function () {
      return muted;
    },
    SONGS: SONGS,
    freq: freq,
  };
})((globalThis.SM = globalThis.SM || {}));
