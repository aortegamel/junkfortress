import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/Constants';
import { JUNK_LOCATIONS } from '../data/gameData';
import { ITEM_DEFINITIONS } from '../data/items';
import type { JunkLocationId } from '../types/game';

const MONO = 'monospace';

/** Top-left rect, same convention as the BuildScene debug bounds. */
export interface UiRect {
 x: number; y: number; w: number; h: number;
}

const PANEL = { w: 1040, h: 620 };
const CARD_W = 236;
const CARD_H = 430;
const CARD_GAP = 16;
const CARD_TOP = 146;
const CARD_LEFT = GAME_WIDTH / 2 - (JUNK_LOCATIONS.length * CARD_W + (JUNK_LOCATIONS.length - 1) * CARD_GAP) / 2;
const ROW_TOP = 124;
const ROW_STEP = 44;
const BTN_W = 200;
const BTN_H = 48;
const BTN_CY = 390;
const COLOR_VALID = 0x7fd07f;
const DEPTH = { dim: 90, panel: 91, card: 92, content: 93 };

export const GATHER_BACK_BTN: UiRect = { x: GAME_WIDTH / 2 - 140, y: 602, w: 280, h: 48 };

export function gatherCardRect(index: number): UiRect {
 return { x: CARD_LEFT + index * (CARD_W + CARD_GAP), y: CARD_TOP, w: CARD_W, h: CARD_H };
}

export function gatherButtonRect(index: number): UiRect {
 const card = gatherCardRect(index);
 return { x: card.x + (CARD_W - BTN_W) / 2, y: card.y + BTN_CY - BTN_H / 2, w: BTN_W, h: BTN_H };
}

function button(
 scene: Phaser.Scene, r: UiRect, label: string, enabled: boolean, onClick: () => void,
): Phaser.GameObjects.GameObject[] {
 const rect = scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, enabled ? 0x1e2a1e : 0x1c1c1c, 1);
 rect.setStrokeStyle(enabled ? 3 : 2, enabled ? COLOR_VALID : 0x3a3a3a).setDepth(DEPTH.content);
 if (enabled) rect.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
 const text = scene.add
  .text(r.x + r.w / 2, r.y + r.h / 2, label, { fontFamily: MONO, fontSize: '20px', color: enabled ? '#7fd07f' : '#5a564f' })
  .setOrigin(0.5)
  .setDepth(DEPTH.content);
 return [rect, text];
}

/**
 * Full-screen overlay listing every junk location; the caller owns gathering and closing.
 * The dim swallows clicks, so nothing behind the panel can place or select junk.
 */
export function showGatherPanel(
 scene: Phaser.Scene,
 gathered: readonly JunkLocationId[],
 onGather: (id: JunkLocationId) => void,
 onClose: () => void,
): Phaser.GameObjects.GameObject[] {
 const cx = GAME_WIDTH / 2;
 const ui: Phaser.GameObjects.GameObject[] = [];
 const text = (x: number, y: number, value: string, fontSize: string, color: string, wrap?: number) => {
  const t = scene.add.text(x, y, value, { fontFamily: MONO, fontSize, color, wordWrap: wrap ? { width: wrap } : undefined });
  ui.push(t.setDepth(DEPTH.content));
  return t;
 };

 ui.push(scene.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setDepth(DEPTH.dim).setInteractive());
 ui.push(scene.add.rectangle(cx, GAME_HEIGHT / 2, PANEL.w, PANEL.h, 0x141414, 1).setDepth(DEPTH.panel).setStrokeStyle(2, 0x444444));
 text(cx, 86, 'GATHER JUNK', '30px', '#e8e0d0').setOrigin(0.5);
 text(cx, 120, 'Optional supplies. Each place gives its junk once per run. The junk goes to your palette.', '13px', '#b8b2a6')
  .setOrigin(0.5);

 JUNK_LOCATIONS.forEach((location, index) => {
  const card = gatherCardRect(index);
  const claimed = gathered.includes(location.id);
  const cardRect = scene.add.rectangle(card.x + card.w / 2, card.y + card.h / 2, card.w, card.h, 0x1a1a1a, 1);
  ui.push(cardRect.setStrokeStyle(2, claimed ? 0x2a2a2a : 0x3a3a3a).setDepth(DEPTH.card));
  const contents: Phaser.GameObjects.Components.Alpha[] = [
   text(card.x + 12, card.y + 14, location.name.toUpperCase(), '18px', '#e8e0d0'),
   text(card.x + 12, card.y + 44, location.description, '12px', '#9a948a', card.w - 24),
   text(card.x + 12, card.y + 100, 'CONTAINS:', '11px', '#7fd07f'),
  ];
  location.items.forEach(({ type, count }, row) => {
   const def = ITEM_DEFINITIONS[type];
   const y = card.y + ROW_TOP + row * ROW_STEP + 16;
   const icon = scene.add.image(card.x + 36, y, type).setDepth(DEPTH.content);
   icon.setScale(Math.min(1, 48 / def.width, 32 / def.height));
   ui.push(icon);
   contents.push(icon, text(card.x + 70, y, `${count} x ${def.name}`, '13px', '#c8c2b8').setOrigin(0, 0.5));
  });
  if (claimed) for (const obj of contents) obj.setAlpha(0.4);
  ui.push(...button(scene, gatherButtonRect(index), claimed ? '[ GATHERED ]' : '[ GATHER ]', !claimed, () => onGather(location.id)));
 });

 ui.push(...button(scene, GATHER_BACK_BTN, '[ BACK TO BUILD ]', true, onClose));
 return ui;
}
