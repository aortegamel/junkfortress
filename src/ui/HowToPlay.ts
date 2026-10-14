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

/** Same beats as the title screen, in the order a new player needs them: goal, build, fight, junk. */
const SECTIONS: HowSection[] = [
 {
  heading: 'THE IDEA',
  lines: [
   'Zombies march in from the right, firing nonstop.',
   'Keep the CORE (left) — and yourself — alive until the last one drops.',
   'Your pistol dents them. Your fortress does the real killing.',
  ],
 },
 {
  heading: '1. BUILD YOUR FORT',
  lines: [
   'Click junk on the right, then click the arena to place it.',
   'Pieces drop as you place them, then settle where they land.',
   'Green outline = clear spot. Red = the core or other junk is in the way.',
   'Q / E angles a piece — angled metal bounces bullets back at the horde.',
   'Click a placed piece to move it. Right-click it to take it back.',
   'Chain: click two pieces (max 220 px). A chain stays flexible.',
   'Nail: click both sides of a joint where two pieces touch.',
   'A nail welds that joint solid. A chain pulls. One nail end may be ground.',
   'Only a nail to the ground holds junk up. Moving or taking back returns nails.',
   'Signature move: hang the anvil over the lane and drop it on them.',
  ],
 },
 {
  heading: '2. FIGHT THE WAVE',
  lines: [
   'A / D or arrow keys move. Space / W jumps. Mouse aims, click fires.',
   'Let ricochets and falling anvils do the work — the pistol is backup.',
   'ESC pauses anytime.',
  ],
 },
 {
  heading: 'THE JUNK',
  lines: [
   'Wooden Plank — soaks bullets, cracks fast. Wide and light.',
   'Metal Sheet — bounces bullets. Angle it! Stronger than wood.',
   'Chain — hangs heavy things and stays flexible. Breaks if shot enough.',
   'Nail — locks two touching pieces rigid. Ground nail = the piece holds still.',
   'Anvil — crushes zombies, keeps bouncing bullets after it lands.',
  ],
 },
];

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
 track(scene.add.rectangle(cx, cy, 880, 680, 0x141414, 1).setDepth(91).setStrokeStyle(2, 0x444444));

 track(
  scene.add
   .text(cx, 96, 'HOW TO PLAY', { fontFamily: MONO, fontSize: '30px', color: '#e8e0d0' })
   .setOrigin(0.5)
   .setDepth(92),
 );

 let y = 126;
 for (const section of SECTIONS) {
  track(
   scene.add
    .text(cx - 400, y, section.heading, { fontFamily: MONO, fontSize: '15px', color: '#7fd07f' })
    .setOrigin(0, 0)
    .setDepth(92),
  );
  y += 24;
  for (const line of section.lines) {
   track(
    scene.add
     .text(cx - 400, y, line, {
      fontFamily: MONO,
      fontSize: '13px',
      color: '#b8b2a6',
      wordWrap: { width: 800 },
     })
     .setOrigin(0, 0)
     .setDepth(92),
   );
   y += 17;
  }
  y += 6;
 }

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
