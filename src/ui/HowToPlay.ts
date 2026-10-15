import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/Constants';

const MONO = 'monospace';

/** Local-only flag: returning players skip the first-fort checklist, but HELP stays one click away. */
const SEEN_KEY = 'junkfortress-howto-seen-v1';

export function hasSeenHowTo(): boolean {
 try {
  return window.localStorage.getItem(SEEN_KEY) === '1';
 } catch {
  return false;
 }
}

export function markHowToSeen(): void {
 try {
  window.localStorage.setItem(SEEN_KEY, '1');
 } catch {
  // Private browsing etc: the tutorial simply shows again next visit.
 }
}

interface HowSection {
 heading: string;
 lines: string[];
}

/** Two columns in play order: left gathers, builds and fights, right restarts and lists the junk. */
const COLUMNS: HowSection[][] = [
 [
  {
   heading: 'THE IDEA',
   lines: [
    'Zombies march in from the right, firing nonstop.',
    'Keep the CORE (left) and yourself alive until the last one drops.',
    'Your pistol dents them. Your fortress does the real killing.',
   ],
  },
  {
   heading: '1. GATHER JUNK',
   lines: [
    'Press GATHER JUNK (top left).',
    'Pick Hardware Store, Restaurant, Junkyard or Construction Site.',
    'Each location adds its junk to your kit once per run.',
   ],
  },
  {
   heading: '2. BUILD YOUR FORT',
   lines: [
    'Click junk on the right, then click the arena to place it.',
    'Gravity starts OFF. Junk stays where you place it, even mid-air.',
    'Green outline = clear spot. Red = something is in the way.',
    'Q / E rotates a piece. Angled metal bounces bullets back.',
    'Click a placed piece to move it. Moving returns its nails.',
    'Right-click a placed piece to return it to your kit.',
    'Nail: click both sides of a touching joint. It locks the joint rigid.',
    'One nail end may be ground. Only a ground nail holds junk up.',
    'Chain: click two pieces up to 220 px apart. A chain stays flexible.',
    'Signature move: chain the anvil, then move it mid-air over the lane.',
   ],
  },
  {
   heading: '3. DROP AND FIGHT',
   lines: [
    'ACTIVATE GRAVITY drops the fort. See what holds, then keep building.',
    'START WAVE drops the fort and starts the wave at once.',
    'A / D or arrow keys move. Space / W jumps high.',
    'You get one jump per landing. Land before you jump again.',
    'Mouse aims, click fires. ESC pauses.',
   ],
  },
 ],
 [
  {
   heading: '4. RESTART OR REBUILD',
   lines: [
    'ESC > RESTART RUN: back to build with the starting junk.',
    'The build area is empty, HP is full and gathering starts over.',
    'After a wave, REBUILD / TRY AGAIN keeps the fort that survived.',
    'Locations you gathered stay used.',
    'NEW JUNK starts a new run with a different starting kit.',
   ],
  },
  {
   heading: 'THE JUNK',
   lines: [
    'Wooden Plank — soaks bullets, cracks fast. Wide and light.',
    'Metal Sheet — bounces bullets. Angle it! Stronger than wood.',
    'Chain — hangs heavy things. Move a chained piece to set the hang. Breaks if shot.',
    'Nail — locks two touching pieces rigid. Ground nail = the piece holds still.',
    'Anvil — crushes zombies, keeps bouncing bullets after it lands.',
    'Propane Tank — explodes when shot. The blast rips apart nearby zombies and junk.',
    'Wooden Crate — a solid wood block. Tougher than a plank. Stack it into walls.',
    'Steel Girder — a long, heavy steel beam. The toughest junk. Bridges gaps.',
    'Refrigerator — a tall, heavy metal box. A ready-made wall that bounces bullets.',
   ],
  },
 ],
];

const PANEL_W = 1200;
const COLUMN_W = 560;

/**
 * Full-screen overlay; the caller owns closing (button, ENTER, ESC) via onClose.
 * The dim swallows clicks so nothing behind the panel can fire while it is open.
 */
export function showHowTo(scene: Phaser.Scene, onClose: () => void): Phaser.GameObjects.GameObject[] {
 const cx = GAME_WIDTH / 2;
 const cy = GAME_HEIGHT / 2;
 const ui: Phaser.GameObjects.GameObject[] = [];
 const track = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
  ui.push(obj);
  return obj;
 };

 track(scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setDepth(90).setInteractive());
 track(scene.add.rectangle(cx, cy, PANEL_W, 680, 0x141414, 1).setDepth(91).setStrokeStyle(2, 0x444444));

 track(
  scene.add
   .text(cx, 56, 'HOW TO PLAY', { fontFamily: MONO, fontSize: '30px', color: '#e8e0d0' })
   .setOrigin(0.5)
   .setDepth(92),
 );

 // Lines advance by their rendered height, so a wrapped line pushes the rest down instead of overlapping.
 COLUMNS.forEach((column, i) => {
  const x = cx - PANEL_W / 2 + 30 + i * (COLUMN_W + 30);
  let y = 86;
  for (const section of column) {
   track(
    scene.add
     .text(x, y, section.heading, { fontFamily: MONO, fontSize: '15px', color: '#7fd07f' })
     .setOrigin(0, 0)
     .setDepth(92),
   );
   y += 24;
   for (const line of section.lines) {
    const text = track(
     scene.add
      .text(x, y, line, {
       fontFamily: MONO,
       fontSize: '13px',
       color: '#b8b2a6',
       wordWrap: { width: COLUMN_W },
      })
      .setOrigin(0, 0)
      .setDepth(92),
    );
    y += text.height + 2;
   }
   y += 10;
  }
 });

 track(
  scene.add
   .text(cx, 660, '[ GOT IT — LET ME BUILD ]', {
    fontFamily: MONO,
    fontSize: '20px',
    color: '#7fd07f',
   })
   .setOrigin(0.5)
   .setPadding(24, 10)
   .setDepth(92)
   .setInteractive({ useHandCursor: true })
   .on('pointerdown', () => {
    markHowToSeen();
    onClose();
   }),
 );

 return ui;
}
