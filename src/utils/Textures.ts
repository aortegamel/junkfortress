import Phaser from 'phaser';

/**
  * Every sprite in the game is generated here at boot - there are no art assets.
  * The sizes below double as the physics dimensions of the junk, so they are exact.
  */

type DrawFn = (g: Phaser.GameObjects.Graphics) => void;
type Point = Phaser.Types.Math.Vector2Like;

// Shared palette. Wood and steel each get one family of tones so they never read as each other.
const WOOD = 0xa9803f, WOOD_LIT = 0xc9a05f, WOOD_DARK = 0x6f5326, WOOD_END = 0x7c5c2c;
const STEEL = 0x6d7681, STEEL_LIT = 0x9aa4ae, STEEL_DARK = 0x4a525b;
const IRON = 0x1c1e22, IRON_LIT = 0x3c4249, RUST = 0x8a5a3a, OUTLINE = 0x171a15;
const Z_SKIN = 0x7d9a63, Z_SKIN_DARK = 0x556b45, Z_RAG = 0x4d5f42, Z_LEG = 0x3f4f36;
const P_JACKET = 0x46586b, P_JACKET_DARK = 0x36455a, P_SKIN = 0xc09a6b, P_CAP = 0x2a2f36;

// Runs are seeded and Math.random is banned, so all texture grain comes from a fixed hash.
function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ 0x4a554e4b;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: DrawFn): Phaser.Textures.CanvasTexture {
  // Re-baking into an existing key would composite over the old pixels.
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return scene.textures.get(key) as Phaser.Textures.CanvasTexture;
}

/** Filled polygon plus optional outline - the creature silhouettes are all polygons. */
function poly(g: Phaser.GameObjects.Graphics, points: Point[], color: number, outline?: number): void {
  g.fillStyle(color, 1);
  g.fillPoints(points, true);
  if (outline === undefined) return;
  g.lineStyle(2, outline, 1);
  g.strokePoints(points, true);
}

function editPixels(tex: Phaser.Textures.CanvasTexture, edit: (d: Uint8ClampedArray, w: number, h: number) => void): void {
  const ctx = tex.getContext();
  const image = ctx.getImageData(0, 0, tex.width, tex.height);
  edit(image.data, tex.width, tex.height);
  ctx.putImageData(image, 0, 0);
  tex.refresh();
}

/** Lightness grain on drawn pixels only, so silhouettes keep their shape. */
function grain(tex: Phaser.Textures.CanvasTexture, amount: number, scaleX = 1, scaleY = 1): void {
  editPixels(tex, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) continue;
        const n = (hash2(Math.floor(x / scaleX), Math.floor(y / scaleY)) - 0.5) * 2 * amount;
        const r = d[i] + n;
        const g2 = d[i + 1] + n;
        const b = d[i + 2] + n;
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g2 < 0 ? 0 : g2 > 255 ? 255 : g2;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  });
}

/** Fills behind what is already drawn - sky falloff and soft glows need this. */
function behind(tex: Phaser.Textures.CanvasTexture, fill: (ctx: CanvasRenderingContext2D) => void): void {
  const ctx = tex.getContext();
  ctx.globalCompositeOperation = 'destination-over';
  fill(ctx);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
}

/** Core dot plus a radial falloff behind it: muzzle flash and sparks. */
function glowBlob(scene: Phaser.Scene, key: string, size: number, core: number, coreR: number, hot: string, midpoint: string): void {
  const mid = size / 2;
  const tex = paint(scene, key, size, size, (g) => {
    g.fillStyle(core, 1);
    g.fillCircle(mid, mid, coreR);
  });
  behind(tex, (ctx) => {
    const glow = ctx.createRadialGradient(mid, mid, coreR, mid, mid, mid);
    glow.addColorStop(0, hot);
    glow.addColorStop(0.5, midpoint);
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  });
}

function drawPlank(scene: Phaser.Scene): void {
  const tex = paint(scene, 'plank', 160, 22, (g) => {
    // Column slabs give a sawn, slightly uneven silhouette.
    for (let x = 0; x < 160; x += 2) {
      const top = hash2(x, 7) < 0.5 ? 1 : 2;
      const bottom = hash2(x, 13) < 0.4 ? 21 : 20;
      g.fillStyle(x < 9 || x > 151 ? WOOD_END : WOOD, 1);
      g.fillRect(x, top, 2, bottom - top);
      g.fillStyle(WOOD_LIT, 0.9);
      g.fillRect(x, top, 2, 2);
      g.fillStyle(WOOD_DARK, 0.8);
      g.fillRect(x, bottom - 2, 2, 2);
    }

    for (let k = 0; k < 18; k++) {
      g.fillStyle(hash2(k, 11) < 0.35 ? WOOD_DARK : WOOD_LIT, 0.35);
      g.fillRect(Math.floor(hash2(k, 5) * 130), 3 + Math.floor(hash2(k, 3) * 15), 12 + Math.floor(hash2(k, 9) * 90), 1);
    }

    g.fillStyle(0x4c4a44, 1);
    for (const x of [14, 146]) {
      for (const y of [7, 15]) g.fillCircle(x, y, 1.5);
    }
  });

  grain(tex, 12, 5, 1);
}

function drawMetalSheet(scene: Phaser.Scene): void {
  const tex = paint(scene, 'metal_sheet', 150, 18, (g) => {
    g.fillStyle(STEEL_DARK, 1);
    g.fillRect(0, 0, 150, 18);
    g.fillStyle(STEEL, 1);
    g.fillRect(1, 1, 148, 16);
    // The bright top edge is what separates steel from wood at a glance.
    g.fillStyle(STEEL_LIT, 1);
    g.fillRect(1, 1, 148, 2);
    g.fillStyle(0x545c65, 1);
    g.fillRect(1, 15, 148, 2);

    for (let k = 0; k < 16; k++) {
      g.fillStyle(hash2(k, 37) < 0.5 ? 0x808993 : 0x5b646e, 0.55);
      g.fillRect(Math.floor(hash2(k, 27) * 90), 3 + Math.floor(hash2(k, 21) * 11), 20 + Math.floor(hash2(k, 31) * 60), 1);
    }

    for (const x of [20, 75, 130]) {
      for (const y of [4, 14]) {
        g.fillStyle(0x3a4148, 1);
        g.fillCircle(x, y, 2.5);
        g.fillStyle(0xb9c1c9, 1);
        g.fillCircle(x, y, 1.5);
      }
    }

    g.fillStyle(RUST, 0.75);
    g.fillRect(96, 2, 7, 14);
    g.fillStyle(0xa16a42, 0.7);
    g.fillRect(97, 4, 4, 10);
  });

  grain(tex, 7, 1, 3);
}

function drawAnvil(scene: Phaser.Scene): void {
  const tex = paint(scene, 'anvil', 70, 45, (g) => {
    g.fillStyle(IRON, 1);
    g.fillTriangle(3, 11, 22, 6, 22, 16);
    g.fillRect(20, 6, 46, 8);
    g.fillRect(22, 14, 42, 10);
    g.fillRect(28, 24, 30, 9);
    g.fillRect(10, 33, 54, 8);
    g.fillRect(4, 41, 66, 3);

    g.fillStyle(IRON_LIT, 1);
    g.fillRect(20, 6, 46, 2);
    g.lineStyle(1, IRON_LIT, 0.7);
    g.lineBetween(4, 10, 21, 7);
    // Rim light: dark iron vanishes against the dark junkyard otherwise.
    g.lineStyle(1, 0xb9c2cb, 0.85);
    g.lineBetween(20, 4, 66, 4);
    g.lineBetween(3, 11, 22, 5);
    g.lineBetween(4, 44, 70, 44);
    g.lineBetween(3, 11, 3, 44);

    g.fillStyle(0x6a3f22, 0.35);
    g.fillRect(26, 16, 11, 5);
    g.fillRect(33, 30, 9, 4);
    g.fillRect(50, 35, 8, 4);
  });

  grain(tex, 8, 2, 2);
}

/** Nail head lower left, shaft driven up and right: the angle reads as "driven into" at slot size. */
function drawNail(scene: Phaser.Scene): void {
  const tex = paint(scene, 'nail', 18, 18, (g) => {
    poly(g, [{ x: 5, y: 12 }, { x: 15.5, y: 3.5 }, { x: 7, y: 14 }], STEEL);
    poly(g, [{ x: 8.6, y: 14.4 }, { x: 2.7, y: 9.1 }, { x: 1.4, y: 10.6 }, { x: 7.3, y: 15.9 }], STEEL_DARK);

    g.lineStyle(1, STEEL_LIT, 0.9);
    g.lineBetween(7, 12, 14, 4.5);
    g.lineBetween(3, 9.8, 7.4, 14.6);
    g.lineStyle(1, 0x2b3037, 0.9);
    g.lineBetween(6, 14.6, 15.6, 4);

    // Rust blooms near the tip, where a used nail would pit first.
    g.fillStyle(RUST, 0.6);
    g.fillRect(11, 5, 4, 2);
    g.fillRect(5, 10, 3, 2);
    g.fillStyle(0xa16a42, 0.5);
    g.fillRect(12, 6, 2, 1);
  });

  grain(tex, 6, 2, 2);
}

function drawChain(scene: Phaser.Scene): void {
  const tex = paint(scene, 'chain', 24, 24, (g) => {
    const link = (cx: number, cy: number, w: number, h: number) => {
      // Dark halo keeps the links readable against dark junk.
      g.lineStyle(4.5, 0x22262b, 1);
      g.strokeEllipse(cx, cy, w, h);
      g.lineStyle(3, 0x7d868f, 1);
      g.strokeEllipse(cx, cy, w, h);
      g.lineStyle(1, 0xc2cad1, 0.8);
      g.strokeEllipse(cx, cy, w - 2.5, h - 2.5);
    };

    link(12, 8.5, 12, 8.5);
    link(12, 15.5, 8.5, 12);

    // Near strand of the upper link crossing the lower one: this is what reads as a link.
    g.lineStyle(3, 0x7d868f, 1);
    g.beginPath();
    g.arc(12, 8.5, 4.5, Math.PI * 0.2, Math.PI * 0.8);
    g.strokePath();
  });

  grain(tex, 6, 2, 2);
}

/** Transparent wood cracks and metal dents, drawn at rising alpha as hp drops. */
function drawDamage(scene: Phaser.Scene): void {
  const SPLIT = 0x140e06;

  paint(scene, 'crack', 160, 22, (g) => {
    g.lineStyle(1, SPLIT, 0.9);
    for (let k = 0; k < 5; k++) {
      let x = 10 + Math.floor(hash2(k, 61) * 110);
      let y = 4 + Math.floor(hash2(k, 67) * 14);
      const steps = 4 + Math.floor(hash2(k, 71) * 4);
      for (let s = 0; s < steps; s++) {
        const nx = x + 6 + Math.floor(hash2(k * 17 + s, 73) * 8);
        const ny = y + (hash2(k * 17 + s, 79) < 0.5 ? -2 : 2);
        g.lineBetween(x, y, nx, ny);
        if (hash2(k * 17 + s, 83) < 0.4) g.lineBetween(x, y, nx - 3, ny + (ny > y ? 5 : -5));
        x = nx;
        y = Math.max(2, Math.min(20, ny));
      }
    }

    g.fillStyle(SPLIT, 0.6);
    for (let k = 0; k < 5; k++) {
      g.fillRect(10 + Math.floor(hash2(k, 87) * 130), 4 + Math.floor(hash2(k, 89) * 14), 3, 1);
    }
  });

  paint(scene, 'dent', 150, 18, (g) => {
    for (let k = 0; k < 4; k++) {
      const x = 18 + Math.floor(hash2(k, 91) * 115);
      const y = 5 + Math.floor(hash2(k, 97) * 8);
      g.fillStyle(0x2f353d, 0.75);
      g.fillEllipse(x, y, 16, 8);
      g.lineStyle(1, 0xc8d0d8, 0.3);
      g.strokeEllipse(x, y + 1, 15, 7);
    }

    g.lineStyle(1, 0xd2d9e0, 0.35);
    for (let k = 0; k < 8; k++) {
      const x = Math.floor(hash2(k, 101) * 120);
      const y = 2 + Math.floor(hash2(k, 103) * 14);
      g.lineBetween(x, y, x + 6 + Math.floor(hash2(k, 107) * 26), y + (hash2(k, 109) < 0.6 ? 0 : 2));
    }
  });
}

function drawZombie(scene: Phaser.Scene): void {
  const torso: Point[] = [{ x: 11, y: 26 }, { x: 33, y: 19 }, { x: 37, y: 40 }, { x: 13, y: 46 }];
  const armUpper: Point[] = [{ x: 12, y: 25 }, { x: 2, y: 29 }, { x: 4, y: 35 }, { x: 13, y: 32 }];
  const armLower: Point[] = [{ x: 12, y: 33 }, { x: 3, y: 37 }, { x: 5, y: 43 }, { x: 13, y: 40 }];

  const tex = paint(scene, 'zombie', 44, 64, (g) => {
    g.fillStyle(Z_LEG, 1);
    g.fillRect(11, 44, 9, 15);
    g.fillRect(23, 44, 9, 15);
    g.fillStyle(Z_SKIN_DARK, 1);
    g.fillRect(9, 57, 12, 7);
    g.fillRect(22, 57, 12, 7);

    poly(g, torso, Z_RAG, OUTLINE);
    g.fillStyle(0x5b6252, 1);
    g.fillRect(14, 30, 16, 6);

    // Both arms reach forward: the reaching silhouette is what reads at a glance.
    poly(g, armUpper, Z_RAG, OUTLINE);
    poly(g, armLower, Z_RAG, OUTLINE);
    g.fillStyle(Z_SKIN_DARK, 1);
    g.fillRect(0, 28, 4, 6);
    g.fillRect(1, 36, 4, 6);

    // Head drops forward and low - the hunch is the zombie read.
    g.fillStyle(Z_SKIN, 1);
    g.fillRoundedRect(5, 8, 16, 18, 5);
    g.fillStyle(Z_SKIN_DARK, 1);
    g.fillRect(5, 20, 13, 6);
    g.fillStyle(0x38452f, 1);
    g.fillRect(6, 7, 15, 4);
    g.lineStyle(2, OUTLINE, 1);
    g.strokeRoundedRect(5, 8, 16, 18, 5);

    g.fillStyle(0xeae6c8, 1);
    g.fillCircle(10, 15, 2.6);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(10, 15, 1.1);
  });

  grain(tex, 6, 2, 2);
}

function drawPlayer(scene: Phaser.Scene): void {
  const tex = paint(scene, 'player', 28, 46, (g) => {
    g.fillStyle(0x2f3439, 1);
    g.fillRect(9, 30, 5, 12);
    g.fillRect(15, 30, 5, 12);
    g.fillStyle(0x21262b, 1);
    g.fillRect(8, 40, 7, 6);
    g.fillRect(14, 40, 7, 6);

    g.fillStyle(P_JACKET, 1);
    g.fillRoundedRect(7, 15, 15, 17, 3);
    g.fillStyle(0x5d7288, 1);
    g.fillRect(8, 17, 2, 13);
    g.fillStyle(0x2b3037, 1);
    g.fillRect(7, 29, 15, 2);

    // Arm and pistol hand point right, into the wave.
    g.fillStyle(P_JACKET_DARK, 1);
    g.fillRect(16, 20, 9, 5);
    g.fillStyle(P_SKIN, 1);
    g.fillRect(22, 19, 5, 5);
    g.fillRoundedRect(10, 5, 12, 12, 3);
    g.fillStyle(P_CAP, 1);
    g.fillRect(8, 3, 16, 6);
    g.fillRect(21, 7, 6, 2);

    g.lineStyle(1.5, OUTLINE, 1);
    g.strokeRoundedRect(10, 5, 12, 12, 3);
    g.strokeRoundedRect(7, 15, 15, 17, 3);
    g.strokeRect(8, 3, 16, 6);
    g.lineBetween(21, 7, 27, 7);
    g.strokeRect(8, 40, 7, 6);
    g.strokeRect(14, 40, 7, 6);
  });

  grain(tex, 5, 2, 2);
}

function drawCore(scene: Phaser.Scene): void {
  const tex = paint(scene, 'core', 96, 96, (g) => {
    g.fillStyle(0x22221f, 1);
    g.fillRect(2, 2, 92, 92);
    g.fillStyle(0x4a4a44, 1);
    g.fillRect(4, 4, 88, 88);
    g.fillStyle(0x3d3d38, 1);
    g.fillRect(4, 78, 88, 14);

    g.fillStyle(STEEL, 1);
    g.fillRect(14, 20, 68, 54);
    g.fillStyle(STEEL_LIT, 1);
    g.fillRect(14, 20, 68, 3);
    g.fillStyle(STEEL_DARK, 1);
    g.fillRect(14, 71, 68, 3);

    for (const x of [21, 48, 75]) {
      for (const y of [27, 67]) {
        g.fillStyle(0x2c3136, 1);
        g.fillCircle(x, y, 3.4);
        g.fillStyle(0xb8c0c8, 1);
        g.fillCircle(x, y, 1.8);
      }
    }

    // The amber vent is the only light down here: "protect this".
    g.fillStyle(0xffb040, 0.12);
    g.fillRect(24, 32, 48, 36);
    g.fillStyle(0x7a4f2a, 1);
    g.fillRect(30, 36, 36, 26);
    g.fillStyle(0xb06a30, 1);
    g.fillRect(33, 39, 30, 20);
    g.fillStyle(0xffb040, 1);
    g.fillRect(36, 43, 24, 12);
    g.fillStyle(0xffd070, 1);
    g.fillRect(40, 46, 16, 6);
    g.fillStyle(0x53290f, 1);
    for (let x = 38; x < 60; x += 6) g.fillRect(x, 43, 2, 12);

    g.fillStyle(RUST, 0.4);
    g.fillRect(20, 74, 5, 14);
    g.fillRect(66, 74, 6, 12);
  });

  grain(tex, 10, 2, 2);
}

function drawGround(scene: Phaser.Scene): void {
  const tex = paint(scene, 'ground', 64, 64, (g) => {
    g.fillStyle(0x232320, 1);
    g.fillRect(0, 0, 64, 64);
    // Darker lip along the tile top reads as the ground line under the arena.
    g.fillStyle(0x191918, 1);
    g.fillRect(0, 0, 64, 2);

    for (let i = 0; i < 110; i++) {
      const size = hash2(i, 105) < 0.7 ? 1 : 2;
      g.fillStyle(hash2(i, 107) < 0.5 ? 0x2c2c28 : 0x1b1b19, 0.9);
      g.fillRect(Math.floor(hash2(i, 101) * 64), Math.floor(hash2(i, 103) * 64), size, size);
    }

    g.fillStyle(0x2f2f2a, 0.6);
    for (let i = 0; i < 12; i++) {
      g.fillRect(Math.floor(hash2(i, 111) * 60), 6 + Math.floor(hash2(i, 113) * 54), 3, 2);
    }
  });

  grain(tex, 7, 3, 3);
}

/** Junkyard backdrop. Nothing above the ground line is brighter than #2a2a2e. */
function drawBackground(scene: Phaser.Scene): void {
  const tex = paint(scene, 'bg', 1280, 720, (g) => {
    g.fillStyle(0x101114, 1);
    for (let i = 0; i < 8; i++) {
      const x = i * 170 - 40;
      g.fillTriangle(x, 656, x + 90, 656 - (40 + Math.floor(hash2(i, 201) * 46)), x + 180, 656);
    }

    for (let i = 0; i < 16; i++) {
      const w = 40 + Math.floor(hash2(i, 211) * 70);
      const x = Math.floor(hash2(i, 213) * 1240);
      const top = 660 - (30 + Math.floor(hash2(i, 217) * 95));
      g.fillStyle(hash2(i, 219) < 0.5 ? 0x15161a : 0x1b1c20, 1);
      g.fillRect(x, top, w, 660 - top);
      if (hash2(i, 223) < 0.5) {
        g.fillStyle(0x1e2024, 1);
        g.fillRect(x + w * 0.4, top - 18, 10, 18);
      }
      g.fillStyle(0x2a2a2e, 0.75);
      for (let k = 0; k < Math.max(1, Math.floor((w - 10) / 11)); k++) {
        g.fillRect(x + 6 + k * 11, top + 8, 4, 5);
      }
    }

    g.lineStyle(2, 0x1e2024, 1);
    g.lineBetween(958, 660, 1002, 480);
    g.lineBetween(1042, 660, 998, 480);
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const y = 660 - t * 180;
      g.lineBetween(958 + t * 44, y, 1042 - t * 44, y - 30);
      g.lineBetween(958 + t * 44, y - 30, 1042 - t * 44, y - 30);
    }
    g.lineBetween(936, 520, 1064, 520);
    g.lineBetween(946, 492, 1054, 492);

    // Tower crane, the tallest thing in the skyline.
    g.fillStyle(0x1c1e22, 1);
    g.fillRect(1122, 470, 10, 190);
    g.fillRect(900, 470, 250, 6);
    g.fillRect(1160, 476, 70, 5);
    g.fillRect(1118, 486, 26, 20);
    g.lineStyle(1, 0x24272b, 1);
    g.lineBetween(940, 476, 940, 560);
    g.lineBetween(1006, 476, 1006, 534);
    g.fillStyle(RUST, 0.55);
    g.fillRect(1122, 520, 3, 60);

    const car = (x: number, y: number) => {
      g.fillStyle(0x111214, 1);
      g.fillCircle(x + 16, y + 20, 8);
      g.fillCircle(x + 60, y + 20, 8);
      g.fillStyle(0x191a1d, 1);
      g.fillRoundedRect(x, y, 76, 20, 5);
      g.fillRect(x + 18, y - 12, 34, 13);
      g.fillStyle(0x22252a, 0.7);
      g.fillRect(x + 22, y - 9, 26, 6);
      g.fillStyle(RUST, 0.5);
      g.fillRect(x + 26, y + 4, 22, 5);
    };
    car(296, 632);
    car(676, 638);

    g.lineStyle(1, 0x272b31, 0.35);
    for (let x = 0; x < 1280; x += 10) {
      g.lineBetween(x, 660, x + 14, 606);
      g.lineBetween(x + 14, 660, x, 606);
    }
    g.lineStyle(1, 0x1c1f23, 1);
    g.lineBetween(0, 606, 1280, 606);
    for (let x = 20; x < 1280; x += 64) g.lineBetween(x, 606, x, 660);

    g.fillStyle(RUST, 0.45);
    g.fillRect(420, 612, 30, 3);
    g.fillRect(838, 600, 22, 3);

    // Below the ground line - the ground tile draws over this band anyway.
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(0, 660, 1280, 60);
  });

  // The sky goes behind the silhouettes drawn above.
  behind(tex, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 660);
    sky.addColorStop(0, '#0a0a0b');
    sky.addColorStop(0.72, '#131418');
    sky.addColorStop(1, '#1b1c21');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1280, 720);
  });
}

function drawBullet(scene: Phaser.Scene, key: string, base: number, tip: number, tail: number): void {
  paint(scene, key, 20, 4, (g) => {
    g.fillStyle(tail, 0.9);
    g.fillRect(0, 1, 6, 2);
    g.fillStyle(base, 1);
    g.fillRect(3, 0, 14, 4);
    g.fillStyle(tip, 1);
    g.fillRect(15, 0, 5, 4);
    g.fillStyle(tip, 0.55);
    g.fillRect(3, 0, 16, 1);
  });
}

/** Wood splinters and metal debris - the two particle fragments. */
function drawFragments(scene: Phaser.Scene): void {
  paint(scene, 'splinter', 12, 4, (g) => {
    poly(g, [{ x: 0, y: 2 }, { x: 4, y: 0 }, { x: 11, y: 1 }, { x: 9, y: 3 }, { x: 2, y: 3 }], WOOD);
    g.fillStyle(WOOD_DARK, 1);
    g.fillRect(2, 3, 7, 1);
  });

  paint(scene, 'debris', 10, 10, (g) => {
    poly(g, [{ x: 1, y: 4 }, { x: 5, y: 1 }, { x: 9, y: 3 }, { x: 8, y: 8 }, { x: 3, y: 9 }], 0x7d868f, 0x23272c);
    poly(g, [{ x: 1, y: 4 }, { x: 5, y: 1 }, { x: 7, y: 3 }, { x: 3, y: 5 }], STEEL_LIT);
  });

  const tex = paint(scene, 'dust', 20, 20, (g) => {
    g.fillStyle(0x9aa0a0, 0.3);
    g.fillCircle(10, 10, 7);
    g.fillStyle(0x8f9592, 0.25);
    g.fillCircle(7, 11, 5);
    g.fillCircle(13, 9, 4.5);
  });

  behind(tex, (ctx) => {
    const puff = ctx.createRadialGradient(10, 10, 2, 10, 10, 10);
    puff.addColorStop(0, 'rgba(140,146,144,0.35)');
    puff.addColorStop(1, 'rgba(120,126,124,0)');
    ctx.fillStyle = puff;
    ctx.fillRect(0, 0, 20, 20);
  });
}

export function createTextures(scene: Phaser.Scene): void {
  drawPlank(scene);
  drawMetalSheet(scene);
  drawAnvil(scene);
  drawChain(scene);
  drawNail(scene);
  drawDamage(scene);
  drawZombie(scene);
  drawPlayer(scene);
  drawCore(scene);
  drawGround(scene);
  drawBackground(scene);
  drawFragments(scene);
  drawBullet(scene, 'bullet-player', 0xffe680, 0xfffbe0, 0xffc94d);
  drawBullet(scene, 'bullet-zombie', 0xff9a4d, 0xffd8a0, 0xd4661f);
  glowBlob(scene, 'flash', 32, 0xfff3c4, 4.5, 'rgba(255,214,140,0.9)', 'rgba(255,150,60,0.45)');
  glowBlob(scene, 'spark', 8, 0xffffff, 1.4, 'rgba(255,232,150,0.95)', 'rgba(255,190,90,0.4)');
}
