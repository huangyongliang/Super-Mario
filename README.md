# Super Mario – HTML5 Edition

A Super Mario style platformer written in plain HTML5, CSS and JavaScript. There is no build step
and nothing to install: open `index.html` in a browser and play.

**Play online:** <https://huangyongliang.github.io/Super-Mario/>

It has four worlds (overground, underground, treetops and a castle), the classic power-ups and
enemies, warp pipes, a flagpole finish, a castle boss with a collapsing bridge, synthesized sound
effects and music, and keyboard, gamepad and touch controls.

## Playing

Open `index.html` directly from disk, or serve the folder and open it in a browser:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

| Action                       | Keyboard                       | Gamepad        | Touch          |
| ---------------------------- | ------------------------------ | -------------- | -------------- |
| Move                         | `←` `→` or `A` `D`             | D-pad or stick | ◀ ▶            |
| Duck / enter a pipe          | `↓` or `S`                     | D-pad down     | ▼              |
| Jump (hold to jump higher)   | `X`, `Space`, `↑`, `W` or `K`  | A or Y         | A              |
| Run / throw fireballs        | `Z`, `Shift` or `J`            | B or X         | B              |
| Start / pause                | `Enter` (`P` or `Esc` pauses)  | Start          | II             |
| Sound on / off               | `M`                            | Select         | ♫              |
| Fullscreen                   | `F`                            |                | ⛶              |

You start with three lives. A mushroom makes you big, a fire flower lets you throw fireballs and a
star makes you briefly invincible; 100 coins or a green mushroom give an extra life. Getting hit
while big shrinks you instead of costing a life. Passing the midway point of a level means you
restart from there after losing a life. Leave the title screen alone for a few seconds and it plays
a demo of each world in turn.

To jump straight to a world, add `?level=N` to the address, for example `index.html?level=4` for
the castle.

### What is in the game

- **1-1**: the overground, with question blocks, brick blocks, a hidden 1-up, a multi-coin brick, a
  star, pipes and a bonus coin room under one of them.
- **1-2**: underground, with piranha plants in pipes, a coin room, looping lifts over a pit and a
  sideways pipe out to the flagpole.
- **1-3**: treetops over a bottomless sky, with sliding, rising and falling lifts and red Koopas that
  turn back at ledges.
- **1-4**: a castle with lava pits, lava bubbles, rotating fire bars and a fire-breathing boss
  guarding the bridge. Defeat the boss with five fireballs, or get past it and grab the axe.

Movement follows the feel of the original: walk and run speeds, skidding when you turn, jumps that
go higher the faster you run, a short grace period for jumping just after running off a ledge,
jump presses remembered just before landing, and some forgiveness for clipping the corner of a
block with your head.

## How it is built

Everything is plain scripts on a global `SM` object, so the page also works from `file://`. Styles
and scripts are linked with relative paths, so the same files work from a local server and from the
GitHub Pages project URL above. The game logic has no browser dependencies, which lets the tests
run it in Node. The Pages workflow publishes `index.html`, `css/` and `js/` only.

| File                     | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `js/config.js`           | Screen size, tile ids, physics constants, score tables               |
| `js/level-data.js`       | The level maps as text, with a key to the map characters             |
| `js/level-loader.js`     | Turns the maps into tiles, enemies, warps and scenery                |
| `js/world.js`            | One level's state and its step function: blocks, camera, timer, pipes, the flagpole and castle endings |
| `js/player.js`           | Player movement, collisions, power-ups, damage and triggers          |
| `js/entities.js`         | Enemies, items, lifts, fireballs, fire bars, the boss and how they interact |
| `js/art/*.js`            | All pixel art, drawn as text grids, plus the bitmap fonts            |
| `js/sprites.js`          | Builds and caches canvases from the pixel art, draws text            |
| `js/render.js`           | Draws a world and the HUD                                            |
| `js/audio.js`            | Synthesized sound effects and a small music sequencer (Web Audio)    |
| `js/input.js`            | Keyboard, gamepad and touch input                                    |
| `js/demo.js`             | Recorded button presses for the title screen demos (generated)       |
| `js/main.js`             | Screens, lives, level flow and the 60 frames per second loop         |

The screen is 400×240 pixels (25×15 tiles of 16 pixels) and is scaled up to fit the window with
crisp pixels.

### Making levels

Each map in `js/level-data.js` is drawn with one character per tile: `#` ground, `B` bricks, `?`
coin blocks, `M` power-up blocks, `P` pipes, `g` and `k` enemies, `F` the flagpole, `@` the start
and so on. The key at the top of that file lists every character. The loader reports a mistake
such as a row of the wrong length or an unknown character with its exact position.

## Tests

The tests need only Node.js (version 18 or newer):

```bash
node tests/run.js           # everything
node tests/run.js "koopa"   # only tests whose name contains "koopa"
```

They play small purpose-built maps to check individual rules, such as jump heights, blocks and
coins, stomping, shells, piranha plants, fireballs, star power, ducking, lifts, pipes, the timer, the
flagpole and the castle ending. They also check that every start, checkpoint and warp pipe in the
real levels is sound.

A search-based player (`tests/solver.js`) then finishes every world starting small, big and with
fire power, and from each checkpoint, which proves that each level can be completed. The title
screen demos are runs found by that player; after changing the physics or a map, regenerate them
with `node tests/make-demo.js` (the tests tell you when they are out of date).

## Credits and disclaimer

This is a non-commercial fan project made for learning and fun. It is not affiliated with or
endorsed by Nintendo. *Super Mario* and related names and characters are trademarks of Nintendo.
All of the pixel art, sound effects and music in this repository are original work made for this
project; no assets from Nintendo games are included.
