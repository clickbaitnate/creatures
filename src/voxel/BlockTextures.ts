// Procedural 16×16 pixel-art textures for voxel blocks.
// Terrain blocks → single atlas (128×96, 8 cols × 6 rows).
// Building blocks → individual 16×16 CanvasTextures.

import * as THREE from 'three';
import { Block } from './BlockTypes';
import { BlockType } from '../buildings/Templates';

const TILE = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 6;

// ── Helpers ──────────────────────────────────────────────────

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function vary(base: number, amount: number): number {
  return Math.max(0, Math.min(255, base + Math.floor((Math.random() - 0.5) * 2 * amount)));
}

function colorShift(r: number, g: number, b: number, amount: number): [number, number, number] {
  return [vary(r, amount), vary(g, amount), vary(b, amount)];
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(x, y, w, h);
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number) {
  fillRect(ctx, x, y, 1, 1, r, g, b);
}

function fillBase(ctx: CanvasRenderingContext2D, r: number, g: number, b: number, noise: number) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [cr, cg, cb] = colorShift(r, g, b, noise);
      pixel(ctx, x, y, cr, cg, cb);
    }
  }
}

function seededRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ── Individual Tile Painters ──────────────────────────────────

function paintDirt(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 139, 105, 20, 12);
  // scattered darker spots
  const rng = seededRand(42);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    pixel(ctx, x, y, 110, 82, 15);
  }
}

function paintGrassTop(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 76, 175, 80, 15);
  // blade highlights
  const rng = seededRand(101);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    pixel(ctx, x, y, 100, 200, 90);
  }
}

function paintGrassSide(ctx: CanvasRenderingContext2D) {
  // top 3 rows green, rest dirt
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (y < 3) {
        const [r, g, b] = colorShift(76, 175, 80, 10);
        pixel(ctx, x, y, r, g, b);
      } else {
        const [r, g, b] = colorShift(139, 105, 20, 12);
        pixel(ctx, x, y, r, g, b);
      }
    }
  }
  // transition pixels
  const rng = seededRand(201);
  for (let x = 0; x < 16; x++) {
    if (rng() > 0.5) pixel(ctx, x, 3, 76, 160, 70);
    if (rng() > 0.7) pixel(ctx, x, 4, 90, 150, 60);
  }
}

function paintStone(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 128, 128, 128, 10);
  // cracks
  const rng = seededRand(300);
  for (let i = 0; i < 6; i++) {
    let x = Math.floor(rng() * 14) + 1;
    let y = Math.floor(rng() * 14) + 1;
    for (let s = 0; s < 3; s++) {
      pixel(ctx, x, y, 90, 90, 90);
      x += Math.floor(rng() * 3) - 1;
      y += Math.floor(rng() * 3) - 1;
    }
  }
}

function paintSand(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 232, 214, 142, 8);
  const rng = seededRand(400);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * 16);
    const y = Math.floor(rng() * 16);
    pixel(ctx, x, y, 210, 195, 120);
  }
}

function paintGravel(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 140, 140, 140, 15);
  const rng = seededRand(500);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rng() * 15);
    const y = Math.floor(rng() * 15);
    const shade = Math.floor(rng() * 40) + 110;
    fillRect(ctx, x, y, 2, 2, shade, shade, shade);
  }
}

function paintSnow(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 240, 240, 255, 5);
  const rng = seededRand(600);
  for (let i = 0; i < 6; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 220, 225, 240);
  }
}

function paintClay(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 196, 168, 130, 8);
  const rng = seededRand(700);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * 14);
    const y = Math.floor(rng() * 16);
    fillRect(ctx, x, y, 3, 1, 180, 152, 115);
  }
}

function paintWood(ctx: CanvasRenderingContext2D) {
  // bark side texture
  for (let y = 0; y < TILE; y++) {
    const base = 100 + (y % 4 < 2 ? 0 : 8);
    for (let x = 0; x < TILE; x++) {
      const [r, g, b] = colorShift(base, Math.floor(base * 0.6), Math.floor(base * 0.3), 6);
      pixel(ctx, x, y, r, g, b);
    }
  }
  // vertical grain lines
  const rng = seededRand(800);
  for (let x = 3; x < 16; x += 5) {
    for (let y = 0; y < 16; y++) {
      if (rng() > 0.3) pixel(ctx, x, y, 80, 48, 20);
    }
  }
}

function paintPlank(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < TILE; y++) {
    const plankIdx = Math.floor(y / 4);
    const base = 180 + plankIdx * 8;
    for (let x = 0; x < TILE; x++) {
      const [r, g, b] = colorShift(base, Math.floor(base * 0.75), Math.floor(base * 0.4), 5);
      pixel(ctx, x, y, r, g, b);
    }
    // seam lines between planks
    if (y % 4 === 0 && y > 0) {
      for (let x = 0; x < TILE; x++) {
        pixel(ctx, x, y, 130, 95, 50);
      }
    }
  }
}

function paintCobblestone(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 107, 107, 107, 8);
  // cobble grid
  const rng = seededRand(900);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const bx = gx * 4 + (gy % 2 ? 2 : 0);
      const by = gy * 4;
      const shade = Math.floor(rng() * 30) + 85;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const px = (bx + dx) % 16;
          const py = (by + dy) % 16;
          pixel(ctx, px, py, shade, shade, shade);
        }
      }
      // mortar line
      pixel(ctx, (bx + 3) % 16, by, 75, 75, 75);
      pixel(ctx, bx, (by + 3) % 16, 75, 75, 75);
    }
  }
}

function paintStoneBrick(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 144, 144, 144, 6);
  // horizontal mortar lines
  for (let x = 0; x < 16; x++) {
    pixel(ctx, x, 0, 100, 100, 100);
    pixel(ctx, x, 4, 100, 100, 100);
    pixel(ctx, x, 8, 100, 100, 100);
    pixel(ctx, x, 12, 100, 100, 100);
  }
  // vertical mortar (offset per row)
  for (let row = 0; row < 4; row++) {
    const offset = (row % 2) * 4;
    const y1 = row * 4 + 1;
    const y2 = row * 4 + 3;
    for (let y = y1; y <= y2; y++) {
      pixel(ctx, offset, y, 100, 100, 100);
      pixel(ctx, (offset + 8) % 16, y, 100, 100, 100);
    }
  }
}

function paintGlass(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 200, 230, 255, 3);
  // frame border
  for (let i = 0; i < 16; i++) {
    pixel(ctx, i, 0, 140, 160, 180);
    pixel(ctx, i, 15, 140, 160, 180);
    pixel(ctx, 0, i, 140, 160, 180);
    pixel(ctx, 15, i, 140, 160, 180);
  }
  // cross bar
  for (let i = 0; i < 16; i++) {
    pixel(ctx, 7, i, 160, 175, 190);
    pixel(ctx, 8, i, 160, 175, 190);
    pixel(ctx, i, 7, 160, 175, 190);
    pixel(ctx, i, 8, 160, 175, 190);
  }
  // highlight
  pixel(ctx, 3, 3, 240, 250, 255);
  pixel(ctx, 4, 3, 240, 250, 255);
  pixel(ctx, 3, 4, 235, 245, 255);
}

function paintThatch(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 212, 184, 92, 10);
  // woven pattern
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x + y) % 4 === 0) pixel(ctx, x, y, 190, 160, 70);
      if ((x - y + 16) % 4 === 0) pixel(ctx, x, y, 225, 200, 110);
    }
  }
}

function paintOre(ctx: CanvasRenderingContext2D) {
  // stone base with ore specks
  paintStone(ctx);
  const rng = seededRand(1100);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 184, 115, 51);
    pixel(ctx, x + 1, y, 184, 115, 51);
    pixel(ctx, x, y + 1, 160, 100, 40);
  }
}

function paintLeaf(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 45, 125, 45, 18);
  const rng = seededRand(1200);
  for (let i = 0; i < 10; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 60, 160, 60);
  }
  for (let i = 0; i < 5; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 30, 100, 30);
  }
}

function paintBerryBush(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 34, 139, 34, 15);
  const rng = seededRand(1300);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 180, 30, 60);
    pixel(ctx, x + 1, y, 200, 40, 70);
  }
}

function paintCoal(ctx: CanvasRenderingContext2D) {
  paintStone(ctx);
  const rng = seededRand(1400);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 30, 30, 30);
    pixel(ctx, x + 1, y, 25, 25, 25);
    pixel(ctx, x, y + 1, 35, 35, 35);
  }
}

function paintIronOre(ctx: CanvasRenderingContext2D) {
  paintStone(ctx);
  const rng = seededRand(1500);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 180, 120, 80);
    pixel(ctx, x + 1, y, 170, 110, 70);
    pixel(ctx, x, y + 1, 160, 100, 60);
  }
}

function paintGoldOre(ctx: CanvasRenderingContext2D) {
  paintStone(ctx);
  const rng = seededRand(1600);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 255, 215, 0);
    pixel(ctx, x + 1, y, 240, 200, 10);
    pixel(ctx, x, y + 1, 218, 165, 32);
  }
}

function paintCraftingTableTop(ctx: CanvasRenderingContext2D) {
  paintPlank(ctx);
  // grid pattern on top
  for (let i = 2; i < 14; i++) {
    pixel(ctx, i, 4, 90, 60, 30);
    pixel(ctx, i, 8, 90, 60, 30);
    pixel(ctx, i, 12, 90, 60, 30);
    pixel(ctx, 4, i, 90, 60, 30);
    pixel(ctx, 8, i, 90, 60, 30);
    pixel(ctx, 12, i, 90, 60, 30);
  }
}

function paintCraftingTableSide(ctx: CanvasRenderingContext2D) {
  paintPlank(ctx);
  // saw-tooth pattern on side
  for (let x = 2; x < 14; x += 3) {
    pixel(ctx, x, 6, 100, 65, 30);
    pixel(ctx, x, 7, 100, 65, 30);
    pixel(ctx, x + 1, 7, 100, 65, 30);
    pixel(ctx, x + 1, 8, 100, 65, 30);
  }
}

function paintFurnaceTop(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 105, 105, 105, 8);
  // hole in center
  for (let y = 5; y < 11; y++) {
    for (let x = 5; x < 11; x++) {
      pixel(ctx, x, y, 50, 50, 50);
    }
  }
}

function paintFurnaceSide(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 105, 105, 105, 8);
  // furnace opening
  for (let y = 8; y < 14; y++) {
    for (let x = 5; x < 11; x++) {
      if (y === 8) pixel(ctx, x, y, 60, 60, 60);
      else pixel(ctx, x, y, 40, 20, 10);
    }
  }
  // ember glow
  pixel(ctx, 7, 12, 255, 120, 20);
  pixel(ctx, 8, 13, 255, 80, 10);
  pixel(ctx, 6, 13, 200, 60, 5);
}

function paintDarkGrassTop(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 45, 94, 45, 12);
  const rng = seededRand(1700);
  for (let i = 0; i < 10; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 55, 110, 55);
  }
}

function paintDarkGrassSide(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (y < 3) {
        const [r, g, b] = colorShift(45, 94, 45, 8);
        pixel(ctx, x, y, r, g, b);
      } else {
        const [r, g, b] = colorShift(139, 105, 20, 12);
        pixel(ctx, x, y, r, g, b);
      }
    }
  }
}

function paintDeadGrassTop(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 168, 152, 96, 10);
  const rng = seededRand(1800);
  for (let i = 0; i < 8; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 185, 170, 110);
  }
}

function paintDeadGrassSide(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (y < 3) {
        const [r, g, b] = colorShift(168, 152, 96, 8);
        pixel(ctx, x, y, r, g, b);
      } else {
        const [r, g, b] = colorShift(139, 105, 20, 12);
        pixel(ctx, x, y, r, g, b);
      }
    }
  }
}

function paintCactusTop(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 45, 139, 45, 10);
  // radial pattern
  for (let i = 4; i < 12; i++) {
    pixel(ctx, i, 7, 35, 110, 35);
    pixel(ctx, i, 8, 35, 110, 35);
    pixel(ctx, 7, i, 35, 110, 35);
    pixel(ctx, 8, i, 35, 110, 35);
  }
}

function paintCactusSide(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 45, 139, 45, 8);
  // vertical ridges
  for (let y = 0; y < 16; y++) {
    pixel(ctx, 3, y, 35, 120, 35);
    pixel(ctx, 7, y, 35, 120, 35);
    pixel(ctx, 11, y, 35, 120, 35);
  }
  // spines
  const rng = seededRand(1900);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * 14) + 1;
    const y = Math.floor(rng() * 14) + 1;
    pixel(ctx, x, y, 200, 210, 140);
  }
}

function paintRedSand(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 194, 120, 78, 8);
  const rng = seededRand(2000);
  for (let i = 0; i < 8; i++) {
    pixel(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), 175, 105, 65);
  }
}

function paintPackedIce(ctx: CanvasRenderingContext2D) {
  fillBase(ctx, 160, 208, 240, 6);
  // cracks
  const rng = seededRand(2100);
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(rng() * 12) + 2;
    let y = Math.floor(rng() * 12) + 2;
    for (let s = 0; s < 4; s++) {
      pixel(ctx, x, y, 200, 230, 255);
      x += Math.floor(rng() * 3) - 1;
      y += Math.floor(rng() * 3) - 1;
    }
  }
}

function paintTorch(ctx: CanvasRenderingContext2D) {
  // transparent background with torch in center
  ctx.clearRect(0, 0, TILE, TILE);
  // stick
  for (let y = 6; y < 15; y++) {
    pixel(ctx, 7, y, 139, 90, 43);
    pixel(ctx, 8, y, 120, 78, 36);
  }
  // flame
  for (let y = 2; y < 7; y++) {
    const w = y < 4 ? 1 : 2;
    for (let dx = -w; dx <= w; dx++) {
      if (y < 3) pixel(ctx, 7 + dx, y, 255, 240, 80);
      else if (y < 5) pixel(ctx, 7 + dx, y, 255, 180, 20);
      else pixel(ctx, 7 + dx, y, 255, 120, 0);
    }
  }
}

function paintFlower(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE, TILE);
  // stem
  for (let y = 8; y < 15; y++) {
    pixel(ctx, 7, y, 40, 100, 30);
    pixel(ctx, 8, y, 45, 110, 35);
  }
  // petals
  const petalColor: [number, number, number] = [255, 102, 153];
  pixel(ctx, 7, 4, ...petalColor); pixel(ctx, 8, 4, ...petalColor);
  pixel(ctx, 6, 5, ...petalColor); pixel(ctx, 9, 5, ...petalColor);
  pixel(ctx, 6, 6, ...petalColor); pixel(ctx, 9, 6, ...petalColor);
  pixel(ctx, 7, 7, ...petalColor); pixel(ctx, 8, 7, ...petalColor);
  // center
  pixel(ctx, 7, 5, 255, 220, 50);
  pixel(ctx, 8, 5, 255, 220, 50);
  pixel(ctx, 7, 6, 255, 200, 40);
  pixel(ctx, 8, 6, 255, 200, 40);
}

function paintMushroom(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE, TILE);
  // stem
  for (let y = 9; y < 15; y++) {
    pixel(ctx, 7, y, 220, 210, 190);
    pixel(ctx, 8, y, 210, 200, 180);
  }
  // cap
  for (let x = 5; x < 11; x++) {
    pixel(ctx, x, 6, 204, 51, 68);
    pixel(ctx, x, 7, 204, 51, 68);
    pixel(ctx, x, 8, 180, 40, 55);
  }
  for (let x = 6; x < 10; x++) {
    pixel(ctx, x, 5, 204, 51, 68);
  }
  // spots
  pixel(ctx, 6, 6, 255, 240, 240);
  pixel(ctx, 9, 7, 255, 240, 240);
  pixel(ctx, 7, 5, 255, 240, 240);
}

function paintTallGrass(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE, TILE);
  // grass blades
  const rng = seededRand(2200);
  for (let i = 0; i < 6; i++) {
    const bx = Math.floor(rng() * 14) + 1;
    const height = Math.floor(rng() * 6) + 6;
    const shade = Math.floor(rng() * 40);
    for (let y = 16 - height; y < 16; y++) {
      pixel(ctx, bx, y, 80 + shade, 142 + shade, 35);
      if (rng() > 0.5) pixel(ctx, bx + 1, y, 70 + shade, 130 + shade, 30);
    }
  }
}

function paintSapling(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TILE, TILE);
  // trunk
  for (let y = 9; y < 15; y++) {
    pixel(ctx, 7, y, 100, 65, 30);
    pixel(ctx, 8, y, 90, 58, 25);
  }
  // leaves
  for (let y = 3; y < 10; y++) {
    const w = y < 5 ? 1 : (y < 8 ? 2 : 1);
    for (let dx = -w; dx <= w; dx++) {
      const [r, g, b] = colorShift(50, 150, 50, 15);
      pixel(ctx, 7 + dx, y, r, g, b);
    }
  }
}

function paintCampfire(ctx: CanvasRenderingContext2D) {
  // transparent background with fire
  ctx.clearRect(0, 0, TILE, TILE);
  // fire in center
  for (let y = 2; y < 14; y++) {
    for (let x = 4; x < 12; x++) {
      const dy = 14 - y;
      const dx = Math.abs(x - 8);
      if (dx < dy / 2) {
        if (y > 8) pixel(ctx, x, y, 255, 60, 0);
        else if (y > 5) pixel(ctx, x, y, 255, 160, 0);
        else pixel(ctx, x, y, 255, 230, 50);
      }
    }
  }
}

// ── Atlas Layout ─────────────────────────────────────────────
// Each solid terrain block gets an atlas slot. Blocks with different
// top vs side get TWO slots. Transparent/non-solid skip the atlas.

interface TileEntry {
  block: Block;
  face: 'all' | 'top' | 'side';
  paint: (ctx: CanvasRenderingContext2D) => void;
}

const TILE_LIST: TileEntry[] = [
  // row 0
  { block: Block.Dirt,          face: 'all',  paint: paintDirt },
  { block: Block.Grass,         face: 'top',  paint: paintGrassTop },
  { block: Block.Grass,         face: 'side', paint: paintGrassSide },
  { block: Block.Stone,         face: 'all',  paint: paintStone },
  { block: Block.Sand,          face: 'all',  paint: paintSand },
  { block: Block.Gravel,        face: 'all',  paint: paintGravel },
  { block: Block.Snow,          face: 'all',  paint: paintSnow },
  { block: Block.Clay,          face: 'all',  paint: paintClay },
  // row 1
  { block: Block.Wood,          face: 'all',  paint: paintWood },
  { block: Block.Plank,         face: 'all',  paint: paintPlank },
  { block: Block.Cobblestone,   face: 'all',  paint: paintCobblestone },
  { block: Block.StoneBrick,    face: 'all',  paint: paintStoneBrick },
  { block: Block.Glass,         face: 'all',  paint: paintGlass },
  { block: Block.Thatch,        face: 'all',  paint: paintThatch },
  { block: Block.OreBlock,      face: 'all',  paint: paintOre },
  { block: Block.Leaf,          face: 'all',  paint: paintLeaf },
  // row 2
  { block: Block.BerryBush,     face: 'all',  paint: paintBerryBush },
  { block: Block.Coal,          face: 'all',  paint: paintCoal },
  { block: Block.IronOre,       face: 'all',  paint: paintIronOre },
  { block: Block.GoldOre,       face: 'all',  paint: paintGoldOre },
  { block: Block.CraftingTable, face: 'top',  paint: paintCraftingTableTop },
  { block: Block.CraftingTable, face: 'side', paint: paintCraftingTableSide },
  { block: Block.Furnace,       face: 'top',  paint: paintFurnaceTop },
  { block: Block.Furnace,       face: 'side', paint: paintFurnaceSide },
  // row 3
  { block: Block.DarkGrass,     face: 'top',  paint: paintDarkGrassTop },
  { block: Block.DarkGrass,     face: 'side', paint: paintDarkGrassSide },
  { block: Block.DeadGrass,     face: 'top',  paint: paintDeadGrassTop },
  { block: Block.DeadGrass,     face: 'side', paint: paintDeadGrassSide },
  { block: Block.Cactus,        face: 'top',  paint: paintCactusTop },
  { block: Block.Cactus,        face: 'side', paint: paintCactusSide },
  { block: Block.RedSand,       face: 'all',  paint: paintRedSand },
  { block: Block.PackedIce,     face: 'all',  paint: paintPackedIce },
  // row 4
  { block: Block.Campfire,      face: 'all',  paint: paintCampfire },
  { block: Block.Torch,         face: 'all',  paint: paintTorch },
  { block: Block.Flower,        face: 'all',  paint: paintFlower },
  { block: Block.Mushroom,      face: 'all',  paint: paintMushroom },
  { block: Block.TallGrass,     face: 'all',  paint: paintTallGrass },
  { block: Block.Sapling,       face: 'all',  paint: paintSapling },
];

// Build lookup: block → { topIdx, sideIdx } into TILE_LIST
type TileIndexes = { topIdx: number; sideIdx: number };
const blockTileMap = new Map<Block, TileIndexes>();

for (let i = 0; i < TILE_LIST.length; i++) {
  const entry = TILE_LIST[i];
  let existing = blockTileMap.get(entry.block);
  if (!existing) {
    existing = { topIdx: i, sideIdx: i };
    blockTileMap.set(entry.block, existing);
  }
  if (entry.face === 'top') existing.topIdx = i;
  else if (entry.face === 'side') existing.sideIdx = i;
  // 'all' sets both on first encounter (already done above)
}

// ── Public API ───────────────────────────────────────────────

/**
 * Create terrain atlas texture (128×96, 8×6 tiles of 16×16).
 */
export function createTerrainAtlas(): THREE.CanvasTexture {
  const [canvas, atlasCtx] = createCanvas(ATLAS_COLS * TILE, ATLAS_ROWS * TILE);

  // Paint each tile into its atlas slot
  const [tileCanvas, tileCtx] = createCanvas(TILE, TILE);

  for (let i = 0; i < TILE_LIST.length; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);

    tileCtx.clearRect(0, 0, TILE, TILE);
    TILE_LIST[i].paint(tileCtx);
    atlasCtx.drawImage(tileCanvas, col * TILE, row * TILE);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Get atlas UV rect for a block face.
 * face: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
 * Returns [u0, v0, u1, v1] in 0..1 atlas space.
 */
export function getBlockUV(block: Block, face: number): [number, number, number, number] {
  const indexes = blockTileMap.get(block);
  if (!indexes) {
    // Fallback to Dirt tile (row 0, col 0)
    return [0, 1 - 1 / ATLAS_ROWS, 1 / ATLAS_COLS, 1];
  }

  // Top face (+Y=2) uses topIdx, everything else uses sideIdx
  const tileIdx = face === 2 ? indexes.topIdx : indexes.sideIdx;

  const col = tileIdx % ATLAS_COLS;
  const row = Math.floor(tileIdx / ATLAS_COLS);

  const u0 = col / ATLAS_COLS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS; // flip Y for GL convention
  const u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_ROWS;

  return [u0, v0, u1, v1];
}

/**
 * Create a standalone 16×16 texture for a building BlockType.
 */
export function createBuildingTexture(bt: BlockType): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(TILE, TILE);

  switch (bt) {
    case BlockType.Wood:   paintWood(ctx); break;
    case BlockType.Stone:  paintStone(ctx); break;
    case BlockType.Plank:  paintPlank(ctx); break;
    case BlockType.Cobble: paintCobblestone(ctx); break;
    case BlockType.Glass:  paintGlass(ctx); break;
    case BlockType.Thatch: paintThatch(ctx); break;
    case BlockType.Ore:    paintOre(ctx); break;
    case BlockType.Dirt:   paintDirt(ctx); break;
    case BlockType.Leaf:   paintLeaf(ctx); break;
    case BlockType.Fire:   paintCampfire(ctx); break;
    default:               paintStone(ctx); break;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
