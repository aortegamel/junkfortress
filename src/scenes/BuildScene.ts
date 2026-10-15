import Phaser from 'phaser';
import { CHAIN_MAX_HP, CHAIN_MAX_LENGTH, GAME_HEIGHT, GAME_WIDTH, GROUND_ANCHOR_ID, GROUND_Y, NAIL_MAX_LENGTH } from '../utils/Constants';
import { createArenaPhysics, drawArena, drawBuildZone } from '../utils/Arena';
import { runStore } from '../state/runStore';
import { showPauseMenu } from '../ui/PauseMenu';
import { ITEM_DEFINITIONS } from '../data/items';
import { chainPlacementCheck, nailPlacementCheck, placementCheck } from '../systems/StructureSystem';
import { sfx } from '../systems/Audio';
import { Effects } from '../systems/Effects';
import { WaveStructureManager } from '../systems/WaveStructureManager';
import { setDebugProvider } from '../debug/DebugApi';
import type { NailViolation, PlacementViolation } from '../systems/StructureSystem';
import type { ChainAnchor, ItemType, JunkLocationId, SavedBuildObject } from '../types/game';
import { hasSeenHowTo, markHowToSeen, showHowTo } from '../ui/HowToPlay';
import { GATHER_BACK_BTN, gatherButtonRect, gatherCardRect, showGatherPanel } from '../ui/GatherPanel';
import { JUNK_LOCATIONS } from '../data/gameData';

/** Short, plain-language reason shown where the ghost was refused. */
const REJECTION_TEXT: Record<PlacementViolation, string> = {
 'outside-zone': 'outside the build area',
 'overlaps-core': 'too close to the core',
 'overlaps-object': 'junk is in the way',
};

/** Attachments are either a chain or a nail, so one table covers both refusal reasons. */
const ATTACH_TEXT: Record<Exclude<NailViolation, 'too-long'>, string> = {
 'same-object': 'pick a different object',
 'missing-object': 'anchor must be on junk',
 'not-touching': 'nails need parts that touch',
 'outside-object': 'click on the junk itself',
};

function attachRejection(violation: NailViolation | null, nail: boolean): string {
 if (violation === null) return '';
 if (violation === 'too-long') return nail ? `nails reach ${NAIL_MAX_LENGTH}px` : `chain max ${CHAIN_MAX_LENGTH}px`;
 return ATTACH_TEXT[violation];
}

type BuildMode = 'idle' | 'placing' | 'moving' | 'chain' | 'nail';

/** Palette slots are fixed top-to-bottom, whatever the inventory holds. */
const PALETTE_ORDER: ItemType[] = ['plank', 'metal_sheet', 'chain', 'nail', 'anvil', 'propane', 'crate', 'girder', 'refrigerator'];

interface PendingAnchor {
 objectId: string; x: number; y: number;
}

/** Palette slot as pure data; x/y are the hit-area top-left (same convention as StructureSystem.Rect). */
interface SlotView {
 index: number; type: ItemType; count: number; x: number; y: number; w: number; h: number;
}

const SLOT_W = 74;
const SLOT_GAP = 6;
const PANEL_PAD = 8;
/**
 * The palette runs down the right edge, clear of BUILD_ZONE (x 60..700): a bar across the bottom
 * sits on the ground line, which is exactly where every ground placement has to be clicked.
 * Slot height divides the band between the top buttons and the floor, so every slot stays above GROUND_Y.
 */
const SLOT_X = GAME_WIDTH - 66;
const SLOT_TOP = 72;
const SLOT_BOTTOM = GROUND_Y - 16;
const SLOT_H = Math.floor((SLOT_BOTTOM - SLOT_TOP - (PALETTE_ORDER.length - 1) * SLOT_GAP) / PALETTE_ORDER.length);
const HINT_Y = GAME_HEIGHT - 40;
const START_BTN = { x: GAME_WIDTH / 2, y: 30, w: 260, h: 52 };
/** Left of START WAVE: the top bar reads in order, gravity first, then the wave. */
const GRAVITY_BTN = { x: START_BTN.x - START_BTN.w / 2 - 136, y: 30, w: 240, h: 52 };
/** Left of ACTIVATE GRAVITY, in the free top-left corner: optional supplies come before the build. */
const GATHER_BTN = { x: 123, y: 30, w: 230, h: 52 };
const ROTATE_STEP_DEG = 15;
const COLOR_VALID = 0x7fd07f;
const COLOR_INVALID = 0xd06a5f;
/** Ground is a one-pixel line, so a ground click is accepted a few pixels above and below it. */
const GROUND_CLICK_SLACK = 10;
const DEPTH = { ghost: 20, outline: 21, flash: 22, ui: 30, slot: 31 };
const HINTS: Record<BuildMode, string> = {
 idle: 'Gravity is on: junk falls and settles. Click junk to move it. Right-click returns it. GATHER JUNK adds optional supplies.',
 placing: 'Click to place. Pieces fall until they land. Q/E rotate. Right-click cancels.',
 moving: 'Click to move. Attached nails return to inventory. Q/E rotate. DEL returns the piece.',
 chain: 'Click two pieces (max 220 px). Chains flex. Right-click cancels.',
 nail: 'Click each side of a touching joint. One side can be ground. Nails lock the joint. Right-click cancels.',
};
/** Before ACTIVATE GRAVITY, pieces hold their placed pose, so these modes say so instead. */
const GRAVITY_OFF_HINTS: Partial<Record<BuildMode, string>> = {
 idle: 'Gravity is off: junk stays put in the BUILD AREA. GATHER JUNK adds optional supplies. ACTIVATE GRAVITY drops it. START WAVE works anytime.',
 placing: 'Click the BUILD AREA to place. Gravity is off, so it stays put, even mid-air. Q/E rotate. Right-click cancels.',
};

/** Session counter: ids stay unique across scene restarts, so saved nails and chains keep a stable owner. */
let idCounter = 0;

function mono(scene: Phaser.Scene, x: number, y: number, text: string, fontSize: string, color: string) {
 return scene.add.text(x, y, text, { fontFamily: 'monospace', fontSize, color });
}

function strokeRotatedRect(
 g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number,
 rotationDeg: number, color: number, thickness: number,
): void {
 g.lineStyle(thickness, color, 1).save();
 g.translateCanvas(x, y).rotateCanvas(Phaser.Math.DegToRad(rotationDeg));
 g.strokeRect(-w / 2, -h / 2, w, h).restore();
}


export class BuildScene extends Phaser.Scene {
 readonly sceneKey = 'BuildScene';

 private chainPreview!: Phaser.GameObjects.Graphics;
 private outline!: Phaser.GameObjects.Graphics;
 private denyFlash!: Phaser.GameObjects.Graphics;
 private fx!: Effects;
 private hintText!: Phaser.GameObjects.Text;
 private slots: SlotView[] = [];
 private slotUi: Phaser.GameObjects.GameObject[] = [];
 private structureManager!: WaveStructureManager;
 private mode: BuildMode = 'idle';
 private selectedType: ItemType | null = null;
 private ghost: Phaser.GameObjects.Image | null = null;
 private ghostRotation = 0;
 /** Why the last placement attempt was refused; surfaced through the debug state for automation. */
 private lastRejection: string | null = null;
 /** Live runStore object being moved; the store keeps its original pose until the move commits. */
 private moving: SavedBuildObject | null = null;
 private chainFirst: PendingAnchor | null = null;
 /** An edit holds the simulation still while a piece is in hand or an endpoint is being picked. */
 private physicsPaused = false;
 /** Build starts frozen; ACTIVATE GRAVITY turns the simulation on for the rest of this build. */
 private gravityOn = false;
 private gravityBtn!: Phaser.GameObjects.Rectangle;
 private gravityLabel!: Phaser.GameObjects.Text;
 private helpUi: Phaser.GameObjects.GameObject[] | null = null;
 private gatherUi: Phaser.GameObjects.GameObject[] | null = null;
 /** Edit pause in force when GATHER JUNK opened, restored on close. */
 private gatherResumePaused = false;
 private guideText: Phaser.GameObjects.Text | null = null;
 private guidePanel: Phaser.GameObjects.Rectangle | null = null;
 private guideDismiss: Phaser.GameObjects.Text | null = null;

 constructor() {
  super('BuildScene');
 }

 create(): void {
  // create() can run again on scene restart, so every editor field is reset here.
  this.mode = 'idle'; this.selectedType = null; this.moving = null; this.chainFirst = null;
  this.ghostRotation = 0; this.ghost = null; this.slots = []; this.slotUi = [];
  this.physicsPaused = false; this.gravityOn = false;
  this.helpUi = null; this.gatherUi = null; this.guideText = null; this.guidePanel = null; this.guideDismiss = null;

  drawArena(this);
  drawBuildZone(this);
  createArenaPhysics(this);
  // A restart inherits the previous world state, so the build's frozen start is applied explicitly.
  this.setPhysicsPaused(false);
  this.chainPreview = this.add.graphics().setDepth(DEPTH.ghost);
  this.outline = this.add.graphics().setDepth(DEPTH.outline);
  this.denyFlash = this.add.graphics().setDepth(DEPTH.flash);
  this.fx = new Effects(this);
  this.structureManager = new WaveStructureManager(this, { effects: this.fx });
  this.structureManager.syncBuild();
  this.buildChrome();
  this.renderInventory();
  this.updateHint();
  this.maybeShowGuide();

  this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer.x, pointer.y));
  this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) =>
   this.onPointerDown(pointer, over.length > 0),
  );
  const keys = this.input.keyboard;
  keys?.on('keydown', () => sfx.unlock());
  // Build shortcuts stay dead while GATHER JUNK is open; startWave() refuses on its own.
  const edit = (action: () => void) => () => {
   if (!this.gatherUi) action();
  };
  keys?.on('keydown-Q', edit(() => this.rotateGhost(-ROTATE_STEP_DEG)));
  keys?.on('keydown-E', edit(() => this.rotateGhost(ROTATE_STEP_DEG)));
  keys?.on('keydown-DELETE', edit(() => this.returnMovingToInventory()));
  keys?.on('keydown-BACKSPACE', edit(() => this.returnMovingToInventory()));
  keys?.on('keydown-ENTER', () => this.startWave());
  keys?.on('keydown-ESC', () => {
   if (this.gatherUi) this.closeGather();
   else if (this.helpUi) this.closeHelp();
   else showPauseMenu(this);
  });

  setDebugProvider(this);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
   this.structureManager.syncBuildPoses();
   this.structureManager.dispose();
   setDebugProvider(null);
  });
 }

 update(): void {
  this.structureManager.update();
  this.structureManager.syncBuildPoses();
  if (this.mode === 'placing') {
   const pointer = this.input.activePointer;
   this.updateGhostAt(pointer.x, pointer.y);
  }
 }

 private buildChrome(): void {
  // The panel claims clicks inside the palette column, so a stray click there never reaches the arena.
  const panelHeight = PALETTE_ORDER.length * SLOT_H + (PALETTE_ORDER.length - 1) * SLOT_GAP + PANEL_PAD * 2;
  const panelTop = SLOT_TOP - PANEL_PAD;
  this.add
   .rectangle(SLOT_X, panelTop + panelHeight / 2, SLOT_W + PANEL_PAD * 2, panelHeight, 0x101010, 0.94)
   .setDepth(DEPTH.ui)
   .setInteractive();
  this.hintText = mono(this, 16, HINT_Y, '', '13px', '#77726a').setDepth(DEPTH.ui);

  const start = this.add.rectangle(START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 0x1e2a1e, 1);
  start.setStrokeStyle(3, COLOR_VALID).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
  start.on('pointerdown', () => this.startWave());
  mono(this, START_BTN.x, START_BTN.y, '[ START WAVE ]', '24px', '#7fd07f').setOrigin(0.5).setDepth(DEPTH.slot);

  this.gravityBtn = this.add.rectangle(GRAVITY_BTN.x, GRAVITY_BTN.y, GRAVITY_BTN.w, GRAVITY_BTN.h, 0x2a2418, 1);
  this.gravityBtn.setStrokeStyle(3, 0xd0a85f).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
  this.gravityBtn.on('pointerdown', () => this.activateGravity());
  this.gravityLabel = mono(this, GRAVITY_BTN.x, GRAVITY_BTN.y, '[ ACTIVATE GRAVITY ]', '18px', '#e0b860');
  this.gravityLabel.setOrigin(0.5).setDepth(DEPTH.slot);

  const menu = mono(this, GAME_WIDTH - 60, 28, '[ MENU ]', '16px', '#e8e0d0');
  menu.setOrigin(0.5).setPadding(12, 8).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
  menu.on('pointerdown', () => showPauseMenu(this));
  const help = mono(this, GAME_WIDTH - 180, 28, '[ HELP ]', '16px', '#c8c2b8');
  help.setOrigin(0.5).setPadding(12, 8).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
  help.on('pointerdown', () => this.openHelp());

  const gather = this.add.rectangle(GATHER_BTN.x, GATHER_BTN.y, GATHER_BTN.w, GATHER_BTN.h, 0x18222a, 1);
  gather.setStrokeStyle(3, 0x5f9fd0).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
  gather.on('pointerdown', () => this.openGather());
  mono(this, GATHER_BTN.x, GATHER_BTN.y, '[ GATHER JUNK ]', '18px', '#8fc0e8').setOrigin(0.5).setDepth(DEPTH.slot);
 }

 private onPointerMove(x: number, y: number): void {
  if (this.mode === 'chain' || this.mode === 'nail') {
   this.updateAttachmentPreview(x, y);
   return;
  }
  this.updateGhostAt(x, y);
 }

 private onPointerDown(pointer: Phaser.Input.Pointer, overUi: boolean): void {
  sfx.unlock();
  if (overUi) return;
  this.structureManager.syncBuildPoses();
  const x = pointer.x;
  const y = pointer.y;
  if (pointer.rightButtonDown()) {
   this.handleRightClick(x, y);
   return;
  }
  if (this.mode === 'placing') this.tryPlace(x, y);
  else if (this.mode === 'moving') this.tryCommitMove(x, y);
  else if (this.mode === 'chain' || this.mode === 'nail') this.attachmentClick(x, y);
  else {
   const hit = this.hitTestObject(x, y);
   if (hit) this.startMoving(hit, x, y);
  }
 }

 private handleRightClick(x: number, y: number): void {
  if (this.mode !== 'idle') {
   this.cancelToIdle(); // puts a moving piece back at its store pose, or drops a selection
   return;
  }
  const hit = this.hitTestObject(x, y);
  if (hit) this.returnObjectToInventory(hit.id);
 }

 private selectType(type: ItemType): void {
  if (this.mode === 'moving') this.cancelToIdle();
  if (this.selectedType === type) {
   this.cancelToIdle();
   return;
  }
  this.selectedType = type;
  this.structureManager.syncBuildPoses();
  this.chainFirst = null;
  this.ghostRotation = 0;
  this.ghost?.destroy();
  this.ghost = null;
  this.chainPreview.clear();
  this.outline.clear();

  if (type === 'chain' || type === 'nail') {
   this.mode = type;
   this.setPhysicsPaused(true);
  } else {
   this.mode = 'placing';
   this.setPhysicsPaused(false);
   this.ghost = this.add.image(0, 0, type).setAlpha(0.55).setDepth(DEPTH.ghost);
   const pointer = this.input.activePointer;
   this.updateGhostAt(pointer.x, pointer.y);
  }
  this.renderInventory();
  this.updateHint();
 }

 private rotateGhost(delta: number): void {
  if (this.mode !== 'placing' && this.mode !== 'moving') return;
  this.ghostRotation = (this.ghostRotation + delta + 360) % 360;
  const pointer = this.input.activePointer;
  this.updateGhostAt(pointer.x, pointer.y);
 }

 private tryPlace(x: number, y: number): void {
  const type = this.selectedType;
  if (!type) return;
  const def = ITEM_DEFINITIONS[type];
  const candidate: SavedBuildObject = {
   id: `build-obj-${++idCounter}`, type, x, y, rotation: this.ghostRotation, hp: def.maxHp,
  };
  const result = placementCheck(candidate, runStore.get().placedObjects);
  if (!result.valid) {
   this.lastRejection = result.violations.join(',');
   this.deny((g) => strokeRotatedRect(g, x, y, def.width, def.height, this.ghostRotation, COLOR_INVALID, 3), REJECTION_TEXT[result.violations[0] ?? 'outside-zone'], x, y);
   return;
  }
  this.lastRejection = null;
  runStore.setPlacedObjects([...runStore.get().placedObjects, candidate]);
  this.structureManager.syncBuild();
  sfx.place();
  this.consumeSelected();
  this.renderInventory();
  this.updateHint();
 }

 private startMoving(obj: SavedBuildObject, x: number, y: number): void {
  this.structureManager.syncBuildPoses();
  this.setPhysicsPaused(true);
  this.moving = obj;
  this.chainFirst = null;
  this.ghostRotation = obj.rotation;
  this.mode = 'moving';
  this.ghost?.destroy();
  this.ghost = this.add.image(x, y, obj.type).setAlpha(0.55).setDepth(DEPTH.ghost);
  this.structureManager.getObjectImage(obj.id)?.setVisible(false);
  this.updateGhostAt(x, y);
  this.updateHint();
 }

 private tryCommitMove(x: number, y: number): void {
  const obj = this.moving;
  if (!obj) {
   this.cancelToIdle();
   return;
  }
  const other = this.hitTestObject(x, y);
  if (other && other.id !== obj.id) {
   this.cancelToIdle();
   this.startMoving(other, x, y);
   return;
  }
  const candidate: SavedBuildObject = { ...obj, x, y, rotation: this.ghostRotation };
  const moveResult = placementCheck(candidate, runStore.get().placedObjects);
  if (!moveResult.valid) {
   const def = ITEM_DEFINITIONS[obj.type];
   this.deny((g) => strokeRotatedRect(g, x, y, def.width, def.height, this.ghostRotation, COLOR_INVALID, 3), REJECTION_TEXT[moveResult.violations[0] ?? 'outside-zone'], x, y);
   return;
  }
  this.refundNails(obj.id);
  obj.x = x;
  obj.y = y;
  obj.rotation = this.ghostRotation;
  this.structureManager.syncBuild();
  sfx.place();
  this.cancelToIdle();
 }

 private returnMovingToInventory(): void {
  if (this.mode === 'moving' && this.moving) this.returnObjectToInventory(this.moving.id);
 }

 private returnObjectToInventory(id: string): void {
  const run = runStore.get();
  const obj = run.placedObjects.find((o) => o.id === id);
  if (!obj) return;
  const attached = run.chains.filter((c) => c.anchorA.objectId === id || c.anchorB.objectId === id);
  // Nails go back first: removing the object drops its dangling nails without a refund.
  this.refundNails(id);
  runStore.setPlacedObjects(run.placedObjects.filter((o) => o.id !== id));
  for (const chain of attached) {
   runStore.removeChain(chain.id);
   runStore.addInventoryItem('chain');
  }
  runStore.addInventoryItem(obj.type);
  this.structureManager.syncBuild();
  sfx.place();
  this.cancelToIdle();
 }

 /**
  * A nail endpoint is the clicked point itself: the joint it describes is where the two pieces meet,
  * so the click must land on one of them. Ground is a valid endpoint while the nail has no other.
  */
 private attachmentAnchorAt(x: number, y: number): PendingAnchor | null {
  const nail = this.mode === 'nail';
  const first = this.chainFirst;
  const hit = this.hitTestObject(x, y, nail ? first?.objectId : undefined);
  if (hit) return { objectId: hit.id, x, y };
  const groundFree = !first || first.objectId !== GROUND_ANCHOR_ID;
  if (nail && groundFree && Math.abs(y - GROUND_Y) <= GROUND_CLICK_SLACK) {
   return { objectId: GROUND_ANCHOR_ID, x, y: GROUND_Y };
  }
  return null;
 }

 private attachmentClick(x: number, y: number): void {
  this.structureManager.syncBuildPoses();
  this.setPhysicsPaused(true);
  const first = this.chainFirst;
  const anchor = this.attachmentAnchorAt(x, y);
  if (!anchor) {
   const groundPicked = first?.objectId === GROUND_ANCHOR_ID;
   this.deny(
    (g) => g.lineStyle(3, COLOR_INVALID, 1).strokeCircle(x, y, 12),
    this.attachmentMissText(groundPicked),
    x,
    y,
   );
   return;
  }
  if (!first) {
   this.chainFirst = anchor;
   this.updateAttachmentPreview(x, y);
   this.updateHint();
   return;
  }
  const nail = this.mode === 'nail';
  const check = nail
   ? nailPlacementCheck(first, anchor, runStore.get().placedObjects)
   : chainPlacementCheck(first, anchor, runStore.get().placedObjects);
  if (!check.valid) {
   this.lastRejection = check.violation;
   this.deny(
    (g) => g.lineStyle(4, COLOR_INVALID, 1).lineBetween(first.x, first.y, anchor.x, anchor.y),
    attachRejection(check.violation, nail),
    x,
    y,
   );
   return;
  }
  const savedAnchor = (point: PendingAnchor): ChainAnchor => {
   const obj = runStore.get().placedObjects.find((o) => o.id === point.objectId);
   return { objectId: point.objectId, x: point.x - (obj?.x ?? 0), y: point.y - (obj?.y ?? 0) };
  };
  const anchorA = savedAnchor(first);
  const anchorB = savedAnchor(anchor);
  if (nail) runStore.addNail({ id: `build-nail-${++idCounter}`, anchorA, anchorB });
  else runStore.addChain({ id: `build-chain-${++idCounter}`, anchorA, anchorB, hp: CHAIN_MAX_HP });
  this.lastRejection = null;
  this.chainFirst = null;
  this.chainPreview.clear();
  this.structureManager.syncBuild();
  sfx.place();
  this.consumeSelected();
  this.setPhysicsPaused(false);
  this.renderInventory();
  this.updateHint();
 }

 private attachmentMissText(groundPicked: boolean): string {
  if (this.mode !== 'nail') return 'click a piece of junk';
  return groundPicked ? 'now click the piece resting on the ground'
   : 'click junk or the ground where the two parts touch';
 }

 private updateAttachmentPreview(x: number, y: number): void {
  const preview = this.chainPreview;
  preview.clear();
  const first = this.chainFirst;
  if (!first) return;
  const anchor = this.attachmentAnchorAt(x, y);
  const valid = !!anchor && (this.mode === 'nail'
   ? nailPlacementCheck(first, anchor, runStore.get().placedObjects)
   : chainPlacementCheck(first, anchor, runStore.get().placedObjects)).valid;
  const color = valid ? COLOR_VALID : COLOR_INVALID;
  preview.lineStyle(3, color, 0.9).lineBetween(first.x, first.y, anchor?.x ?? x, anchor?.y ?? y);
  preview.fillStyle(color, 1).fillCircle(first.x, first.y, 5).fillCircle(anchor?.x ?? x, anchor?.y ?? y, 4);
 }

 private refundNails(objectId: string): void {
  for (const nail of runStore.get().nails.filter((n) => n.anchorA.objectId === objectId || n.anchorB.objectId === objectId)) {
   runStore.removeNail(nail.id);
   runStore.addInventoryItem('nail');
  }
 }

 private consumeSelected(): void {
  const type = this.selectedType;
  if (!type) return;
  const item = runStore.get().inventory.find((i) => i.type === type);
  if (item) runStore.removeInventoryItem(item.id);
  if (!runStore.get().inventory.some((i) => i.type === type)) this.cancelToIdle();
 }

 private cancelToIdle(): void {
  this.mode = 'idle';
  this.selectedType = null;
  this.chainFirst = null;
  this.moving = null;
  this.ghost?.destroy();
  this.ghost = null;
  this.outline.clear();
  this.chainPreview.clear();
  for (const obj of runStore.get().placedObjects) this.structureManager.getObjectImage(obj.id)?.setVisible(true);
  this.setPhysicsPaused(false);
  this.renderInventory();
  this.updateHint();
 }

 /**
  * One switch for the simulation: pieces in hand and pending endpoints must not drift, and nothing
  * moves at all until ACTIVATE GRAVITY. Pause and resume are idempotent, so this always applies.
  */
 private setPhysicsPaused(paused: boolean): void {
  this.physicsPaused = paused;
  if (paused || !this.gravityOn) this.matter.world.pause();
  else this.matter.world.resume();
 }

 /** One-way for this build: the button stays lit until the next build entry resets it. */
 private activateGravity(): void {
  sfx.unlock();
  if (this.gravityOn) return;
  this.gravityOn = true;
  this.setPhysicsPaused(this.physicsPaused);
  this.gravityBtn.setFillStyle(0x1c1c1c, 1).setStrokeStyle(2, 0x3a3a3a).disableInteractive();
  this.gravityLabel.setText('[ GRAVITY ON ]').setColor('#7fd07f');
  sfx.place();
  this.updateGuide();
  this.updateHint();
 }

 private updateGhostAt(x: number, y: number): void {
  if (this.mode !== 'placing' && this.mode !== 'moving') return;
  const moving = this.moving;
  const type = moving ? moving.type : this.selectedType;
  if (!this.ghost || !type) return;
  this.ghost.setPosition(x, y).setRotation(Phaser.Math.DegToRad(this.ghostRotation));
  const def = ITEM_DEFINITIONS[type];
  const candidate: SavedBuildObject = {
   id: moving?.id ?? 'ghost', type, x, y, rotation: this.ghostRotation, hp: def.maxHp,
  };
  const valid = placementCheck(candidate, runStore.get().placedObjects).valid;
  const color = valid ? COLOR_VALID : COLOR_INVALID;
  this.outline.clear();
  strokeRotatedRect(this.outline, x, y, def.width, def.height, this.ghostRotation, color, 2);
 }

 private deny(draw: (g: Phaser.GameObjects.Graphics) => void, hintText?: string, x?: number, y?: number): void {
  sfx.deny();
  if (hintText !== undefined && x !== undefined && y !== undefined) {
   this.fx.floatText(x, y - 30, hintText, '#ff8a7a');
  }
  const flash = this.denyFlash;
  draw(flash.clear().setAlpha(1));
  this.tweens.killTweensOf(flash);
  this.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.clear() });
 }

 private renderInventory(): void {
  for (const object of this.slotUi) object.destroy();
  this.slotUi = [];
  this.slots = [];

  // Fixed order: slots must never reshuffle under the pointer as junk is spent.
  PALETTE_ORDER.forEach((type, index) => {
   const cy = SLOT_TOP + index * (SLOT_H + SLOT_GAP) + SLOT_H / 2;
   const def = ITEM_DEFINITIONS[type];
   const count = runStore.get().inventory.filter((item) => item.type === type).length;
   const spent = count === 0;
   const active = type === this.selectedType;
   const rect = this.add.rectangle(SLOT_X, cy, SLOT_W, SLOT_H, active ? 0x2a3a2a : 0x1c1c1c, 1);
   rect.setStrokeStyle(2, active ? COLOR_VALID : 0x3a3a3a).setDepth(DEPTH.slot);
   if (!spent) rect.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectType(type));

   const icon = this.add.image(SLOT_X, cy - 12, type);
   icon.setScale(Math.min(1, 60 / def.width, 26 / def.height)).setDepth(DEPTH.slot);
   icon.setAlpha(spent ? 0.25 : 1);
   const label = mono(this, SLOT_X, cy + 20, def.name, '9px', spent ? '#5a564f' : '#c8c2b8').setOrigin(0.5).setDepth(DEPTH.slot);
   const badge = mono(this, SLOT_X + SLOT_W / 2 - 5, cy - SLOT_H / 2 + 3, String(count), '11px', spent ? '#5a564f' : '#e8e0d0');
   badge.setOrigin(1, 0).setDepth(DEPTH.slot);

   this.slotUi.push(rect, icon, label, badge);
   this.slots.push({ index, type, count, x: SLOT_X - SLOT_W / 2, y: cy - SLOT_H / 2, w: SLOT_W, h: SLOT_H });
  });
  this.updateGuide();
 }

 private hitTestObject(x: number, y: number, excludeId?: string, tolerance = 0): SavedBuildObject | null {
  let best: SavedBuildObject | null = null;
  let bestDist = Infinity;
  for (const obj of runStore.get().placedObjects) {
   if (obj.id === excludeId) continue;
   const def = ITEM_DEFINITIONS[obj.type];
   const angle = Phaser.Math.DegToRad(obj.rotation);
   const dx = x - obj.x;
   const dy = y - obj.y;
   const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
   const localY = dy * Math.cos(angle) - dx * Math.sin(angle);
   if (Math.abs(localX) > def.width / 2 + tolerance || Math.abs(localY) > def.height / 2 + tolerance) continue;
   const dist = dx * dx + dy * dy;
   if (dist < bestDist) {
    bestDist = dist;
    best = obj;
   }
  }
  return best;
 }

 private updateHint(): void {
  const picking = this.chainFirst !== null && (this.mode === 'chain' || this.mode === 'nail');
  if (!picking) {
   this.hintText.setText((!this.gravityOn && GRAVITY_OFF_HINTS[this.mode]) || HINTS[this.mode]);
   return;
  }
  this.hintText.setText(this.mode === 'nail'
   ? 'Click the other side of this joint, or the touching ground. Right-click cancels.'
   : 'Click the second piece. Right-click cancels.');
 }

 private openHelp(): void {
  if (this.helpUi) return;
  sfx.unlock();
  this.structureManager.syncBuildPoses();
  this.setPhysicsPaused(true);
  this.helpUi = showHowTo(this, () => this.closeHelp());
 }

 private closeHelp(): void {
  markHowToSeen();
  for (const obj of this.helpUi ?? []) obj.destroy();
  this.helpUi = null;
  if (this.mode !== 'moving' && !this.chainFirst) this.setPhysicsPaused(false);
 }

 private openGather(): void {
  if (this.gatherUi || this.helpUi) return;
  sfx.unlock();
  this.structureManager.syncBuildPoses();
  this.gatherResumePaused = this.physicsPaused;
  this.setPhysicsPaused(true);
  this.showGather();
 }

 /** Redrawn after every claim, so a gathered card reads GATHERED at once. */
 private showGather(): void {
  for (const obj of this.gatherUi ?? []) obj.destroy();
  this.gatherUi = showGatherPanel(this, runStore.get().gatheredLocations, (id) => this.gather(id), () => this.closeGather());
 }

 private gather(id: JunkLocationId): void {
  if (!runStore.gatherJunk(id)) {
   sfx.deny();
   return;
  }
  sfx.place();
  this.renderInventory();
  this.showGather();
 }

 private closeGather(): void {
  for (const obj of this.gatherUi ?? []) obj.destroy();
  this.gatherUi = null;
  this.setPhysicsPaused(this.gatherResumePaused);
 }

 /** First run only: a 7-step checklist that ticks itself off as the fort takes shape. */
 private maybeShowGuide(): void {
  if (hasSeenHowTo()) return;
  const panel = this.add.rectangle(236, 160, 448, 156, 0x101010, 0.92);
  // Interactive so arena clicks landing on the panel never place junk behind it.
  panel.setStrokeStyle(1, 0x3a3a3a).setDepth(DEPTH.ui).setInteractive();
  this.guidePanel = panel;
  this.guideText = mono(this, 32, 94, '', '12px', '#b8b2b6').setDepth(DEPTH.slot);
  const dismiss = mono(this, 428, 88, '[ x ]', '12px', '#77726a').setDepth(DEPTH.slot);
  dismiss.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
   markHowToSeen();
   this.hideGuide();
  });
  this.guideDismiss = dismiss;
  this.updateGuide();
 }

 private updateGuide(): void {
  const text = this.guideText;
  if (!text) return;
  const placed = runStore.get().placedObjects.length;
  const chained = runStore.get().chains.length > 0;
  const nailed = runStore.get().nails.length > 0;
  const gathered = runStore.get().gatheredLocations.length > 0;
  text.setText(
   [
    'FIRST FORT - zombies enter right, guard the CORE:',
    `${gathered ? '[x]' : '[ ]'} 1. Optional: GATHER JUNK (top-left) for extra junk`,
    `${placed > 0 ? '[x]' : '[ ]'} 2. Click junk, then BUILD AREA - no gravity yet`,
    `${placed >= 3 ? '[x]' : '[ ]'} 3. Place ${placed >= 3 ? '3/3' : `${placed}/3`} pieces - Q/E angles metal`,
    `${nailed ? '[x]' : '[ ]'} 4. Nail two touching pieces, or nail junk to ground`,
    `${chained ? '[x]' : '[ ]'} 5. Chain the anvil, then move it mid-air to hang it`,
    `${this.gravityOn ? '[x]' : '[ ]'} 6. ACTIVATE GRAVITY (top) to see what holds`,
    '[ ] 7. START WAVE (top) when ready',
   ].join('\n'),
  );
 }

 private hideGuide(): void {
  this.guideText?.destroy();
  this.guidePanel?.destroy();
  this.guideDismiss?.destroy();
  this.guideText = null;
  this.guidePanel = null;
  this.guideDismiss = null;
 }

 private startWave(): void {
  if (this.gatherUi) return;
  if (this.helpUi) {
   this.closeHelp();
   return;
  }
  this.cancelToIdle();
  this.structureManager.syncBuildPoses();
  this.hideGuide();
  markHowToSeen();
  sfx.unlock();
  runStore.setPhase('wave');
  // Explicit empty payload: Phaser keeps the previous scene data, which would silently re-run a
  // debug scenario after a rebuild.
  this.scene.start('WaveScene', {});
 }

 state(): Record<string, unknown> {
  this.structureManager.syncBuildPoses();
  const run = runStore.get();
  return {
   scene: 'build', phase: run.phase, seed: run.seed,
   inventoryCount: run.inventory.length, placedCount: run.placedObjects.length, chainCount: run.chains.length, nailCount: run.nails.length,
   mode: this.mode,
   selected: this.selectedType,
   helpOpen: this.helpUi !== null,
   gatherOpen: this.gatherUi !== null,
   gatheredLocations: [...run.gatheredLocations],
   ghostRotation: this.ghostRotation,
   lastRejection: this.lastRejection,
   placed: run.placedObjects.map((o) => ({ id: o.id, type: o.type, x: o.x, y: o.y, rotation: o.rotation, hp: o.hp })),
   chains: run.chains.map((c) => ({ id: c.id, a: c.anchorA.objectId, b: c.anchorB.objectId, hp: c.hp })),
   nails: run.nails.map((n) => ({ id: n.id, a: n.anchorA.objectId, b: n.anchorB.objectId, anchorA: n.anchorA, anchorB: n.anchorB })),
   pendingAnchor: this.chainFirst,
   physicsPaused: !this.matter.world.enabled,
   gravityOn: this.gravityOn,
   slots: this.slots.map((s) => ({ index: s.index, type: s.type, count: s.count, x: s.x, y: s.y, w: s.w, h: s.h })),
   startButton: {
    x: START_BTN.x - START_BTN.w / 2, y: START_BTN.y - START_BTN.h / 2, w: START_BTN.w, h: START_BTN.h,
   },
   gravityButton: {
    x: GRAVITY_BTN.x - GRAVITY_BTN.w / 2, y: GRAVITY_BTN.y - GRAVITY_BTN.h / 2, w: GRAVITY_BTN.w, h: GRAVITY_BTN.h,
   },
   gatherButton: {
    x: GATHER_BTN.x - GATHER_BTN.w / 2, y: GATHER_BTN.y - GATHER_BTN.h / 2, w: GATHER_BTN.w, h: GATHER_BTN.h,
   },
   gatherLocations: JUNK_LOCATIONS.map((loc, i) => ({
    id: loc.id, name: loc.name, claimed: run.gatheredLocations.includes(loc.id),
    card: gatherCardRect(i), button: gatherButtonRect(i),
   })),
   gatherBackButton: GATHER_BACK_BTN,
  };
 }
}
