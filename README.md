# JUNK FORTRESS

Build a fort out of junk, then survive the wave that attacks it.
Zombies walk in from the right and shoot at you and at the CORE.

Phaser 3 + Matter physics + TypeScript, bundled by Vite.

## Run

```
npm install
npm run dev        # dev server
npm test           # unit tests
npm run typecheck  # types only
npm run build      # production build into dist/
npm run preview    # serve dist/
```

## Controls

| Screen | Input | Action |
| --- | --- | --- |
| Build | Left-click junk slot, then arena | Place a piece |
| Build | Left-click a placed piece | Pick it up to move it |
| Build | Right-click | Cancel, or take a piece back |
| Build | Q / E | Rotate the piece in hand |
| Build | DELETE / BACKSPACE | Return the piece in hand to inventory |
| Build | ENTER | Start the wave |
| Wave | A / D or arrows | Move |
| Wave | Space / W | Jump |
| Wave | Mouse, left-click | Aim and fire |
| Both | ESC | Menu |

## Building

- Placed pieces are live Matter bodies. They fall and settle instead of locking in the air.
- A ghost outline shows the spot. Green means the spot is clear, red means the core or
  another piece is in the way.
- **Nail** — click both sides of a joint where two pieces touch, or click a piece and the
  ground under it. The nail welds that joint rigid. Valid endpoints lie on the two pieces
  and stay within 24 px of each other.
- **Chain** — click two pieces within 220 px. A chain pulls and stays flexible rather than
  welding the pair solid.
- Only a nail to the ground holds a piece in place. A nailed group with no ground nail
  falls as one rigid body.
- Moving or taking back a piece returns its nails to inventory. Its chains come back too.
- The wave starts from where the fort settled, with every nail and chain intact.

## Layout

```
src/
  scenes/    BootScene, TitleScene, BuildScene, WaveScene, ResultScene
  systems/   WaveStructureManager (bodies, nails, chains), StructureSystem (rules),
             Audio, Effects
  entities/  Player, Zombie, Bullets
  state/     runStore — the single run state
  data/      item and wave tables
  utils/     arena drawing, textures, constants, RNG, bullet math, crush math
  ui/        help, pause menu, debug overlay
  debug/     debug API and scenario definitions
plan/        design documents
```
