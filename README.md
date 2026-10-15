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

## Deploy

Cloudflare Workers deploys `dist/` as static assets through `wrangler.jsonc`.
Set these once in the Worker's dashboard:

| Setting | Value |
| --- | --- |
| Worker name | `junkfortress` (must match `name` in `wrangler.jsonc`) |
| Git production branch | `master` |
| Settings > Build > Build Variables and Secrets | `BUN_VERSION` = `1.4.3` |
| Build command | `bun run build` |
| Deploy command | `npx wrangler deploy` |

- The build installs dependencies before it runs the build command. A different build
  command cannot change the Bun version that reads `bun.lock`.
- `BUN_VERSION` must be a build variable. Wrangler `vars` are runtime variables and do not
  affect the build.

## Controls

| Screen | Input | Action |
| --- | --- | --- |
| Build | Left-click junk slot, then arena | Place a piece |
| Build | Left-click a placed piece | Pick it up to move it |
| Build | Right-click | Cancel, or take a piece back |
| Build | Q / E | Rotate the piece in hand |
| Build | DELETE / BACKSPACE | Return the piece in hand to inventory |
| Build | GATHER JUNK button (top left) | Open the gathering locations |
| Build | ESC with gathering open | Close gathering |
| Build | ACTIVATE GRAVITY button | Turn on build physics |
| Build | ENTER | Start the wave |
| Wave | A / D or arrows | Move |
| Wave | Space / W | Jump (again only after landing) |
| Wave | Mouse, left-click | Aim and fire |
| Both | ESC | Pause menu: RESUME, RESTART RUN, MAIN MENU |

## Gathering

The **GATHER JUNK** button (top left of the build screen) opens four locations. Click
**GATHER** on a card to add its junk to your inventory. **BACK TO BUILD** (or ESC) closes
the window. Physics holds still while it is open, and build input stays blocked.

| Location | Junk |
| --- | --- |
| Hardware Store | 3 planks, 2 metal sheets, 1 chain, 6 nails |
| Restaurant | 2 propane tanks, 1 refrigerator, 2 crates, 6 nails |
| Junkyard | 2 metal sheets, 1 girder, 1 anvil, 1 chain, 6 nails |
| Construction Site | 2 planks, 2 crates, 1 girder, 6 nails |

- Each location gives its junk once per run. The card then shows GATHERED, and another
  click gives nothing.
- The packages are fixed. Gathering does not change the seeded starting kit.

## Restart, rebuild and new junk

| Option | Where | Result |
| --- | --- | --- |
| RESTART RUN | Pause menu, in build or wave | Back to build on the same seed: the starting kit, an empty build area, full HP, cleared stats, gravity off, all four locations open again |
| REBUILD / TRY AGAIN | Result screen | Back to build with the fort that survived, repaired, and the used locations still used |
| NEW JUNK | Result screen | A new run with a new seed and a new starting kit |
| MAIN MENU | Pause menu | Back to the title screen with a fresh run |

## Building

- Gravity starts off at every build. Placed pieces stay exactly where you put them, even
  mid-air, so you can place, move, nail and chain freely.
- **ACTIVATE GRAVITY** (top bar, left of START WAVE) turns build physics on for the rest of
  that build. Pieces then fall and settle. The button changes to GRAVITY ON.
- **START WAVE** (or ENTER) always starts the wave in one click. Without gravity first, the
  wave starts from the placed poses and the fort drops as the wave begins.
- While a piece is in hand or an endpoint is being picked, physics holds still.
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
- The wave starts from where the fort stands, with every nail and chain intact.

## Junk

Each starting kit holds 3–4 planks, 3–4 metal sheets, 16 nails, and one each of chain, anvil,
propane tank, crate, girder and refrigerator. Gathering adds more (see above).

| Piece | Material | HP | Mass | Size |
| --- | --- | --- | --- | --- |
| Wooden Plank | wood | 200 | 8 kg | 160×22 |
| Metal Sheet | metal | 400 | 25 kg | 150×18 |
| Wooden Crate | wood | 350 | 18 kg | 70×70 |
| Steel Girder | metal | 1000 | 65 kg | 190×20 |
| Refrigerator | metal | 900 | 45 kg | 80×130 |
| Anvil | metal | 800 | 100 kg | 70×45 |
| Propane Tank | metal | 180 | 22 kg | 46×64 |

- Metal bounces bullets. Wood soaks them.
- A propane tank explodes when its HP runs out. The blast is louder than before, shakes the
  screen and damages zombies and junk within 200 px. An adjacent tank always chains.

## Wave

- The jump is higher than before. A new jump needs a landing first, on the ground or on a
  platform. There is no time cooldown.

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
