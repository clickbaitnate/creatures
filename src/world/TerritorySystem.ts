// Territory grid: 100x100, each cell owned by factionId or -1
// Recalculated every 100 ticks by scanning creature positions and building locations
// Gerrymandering pass: resource valuation, border pressure, strategic corridor claims

import { TransformStore } from '../components/Transform';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore } from '../components/Building';
import type { World } from '../ecs/World';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block } from '../voxel/BlockTypes';
import type { FactionManager, Faction } from './FactionSystem';

// Territory uses its own grid covering the 200×200 world (WORLD_HALF=100)
export const GRID_SIZE = 100;
const CELL_SIZE = 2;
const GRID_CELLS = GRID_SIZE * GRID_SIZE;

const RECALC_INTERVAL = 100;
const CLAIM_RADIUS = 5; // units
const CLAIM_RADIUS_CELLS = Math.ceil(CLAIM_RADIUS / CELL_SIZE);
const BORDER_PRESSURE_RADIUS = 3; // cells

export class TerritorySystem {
  owner: Int16Array; // faction ID per cell, -1 = unclaimed
  contested: Uint8Array; // 1 = contested
  resourceValues: Float32Array; // per-cell resource score
  gerrymanderScore = new Map<number, number>(); // factionId → landGrab 0-1
  displacedCreatures = new Set<number>(); // creatures whose home was taken

  factionManager: FactionManager | null = null;
  voxelWorld: VoxelWorld | null = null;

  private tickCounter = 0;
  private factionCellCounts = new Map<number, number>();
  private resourceScanDone = false;

  constructor() {
    this.owner = new Int16Array(GRID_CELLS).fill(-1);
    this.contested = new Uint8Array(GRID_CELLS);
    this.resourceValues = new Float32Array(GRID_CELLS);
  }

  tick(world: World): void {
    this.tickCounter++;
    if (this.tickCounter < RECALC_INTERVAL) return;
    this.tickCounter = 0;

    // Scan resources once, then every 500 ticks (resources change slowly)
    if (!this.resourceScanDone || (this.tickCounter === 0 && Math.random() < 0.2)) {
      this.scanResources();
    }

    this.recalculate(world);
  }

  /** Scan voxel world to score each grid cell by nearby resources */
  private scanResources(): void {
    if (!this.voxelWorld) return;
    this.resourceValues.fill(0);

    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        // Convert grid cell to world position (center of cell)
        const wx = gx * CELL_SIZE - GRID_SIZE * CELL_SIZE / 2 + CELL_SIZE / 2;
        const wz = gz * CELL_SIZE - GRID_SIZE * CELL_SIZE / 2 + CELL_SIZE / 2;
        const [bx, , bz] = this.voxelWorld.worldToBlock(wx, 0, wz);

        let score = 0;
        // Sample blocks in a 3x3 column area around cell center
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const h = this.voxelWorld.getHeight(bx + dx, bz + dz);
            for (let dy = -2; dy <= 3; dy++) {
              const block = this.voxelWorld.getBlock(bx + dx, h + dy, bz + dz);
              switch (block) {
                case Block.Wood: score += 1; break;
                case Block.Stone: case Block.Cobblestone: score += 2; break;
                case Block.OreBlock: case Block.Coal: score += 3; break;
                case Block.IronOre: case Block.GoldOre: score += 4; break;
                case Block.BerryBush: score += 1; break;
                case Block.Mushroom: score += 0.5; break;
              }
            }
          }
        }
        this.resourceValues[gz * GRID_SIZE + gx] = score;
      }
    }
    this.resourceScanDone = true;
  }

  private recalculate(world: World): void {
    // Count faction presence per cell
    const influence = new Map<number, Float32Array>(); // factionId -> cell influence array
    const factionPops = new Map<number, number>(); // factionId → alive member count

    const creatures = world.query(SocialStore.bit | TransformStore.bit);
    for (const id of creatures) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const fid = social.factionId;

      factionPops.set(fid, (factionPops.get(fid) ?? 0) + 1);

      if (!influence.has(fid)) {
        influence.set(fid, new Float32Array(GRID_CELLS));
      }
      const arr = influence.get(fid)!;

      // Add influence to nearby cells
      const cgx = Math.floor((transform.x + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      const cgz = Math.floor((transform.z + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);

      for (let dz = -CLAIM_RADIUS_CELLS; dz <= CLAIM_RADIUS_CELLS; dz++) {
        for (let dx = -CLAIM_RADIUS_CELLS; dx <= CLAIM_RADIUS_CELLS; dx++) {
          const gx = cgx + dx;
          const gz = cgz + dz;
          if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;
          const idx = gz * GRID_SIZE + gx;
          const dist = Math.sqrt(dx * dx + dz * dz) * CELL_SIZE;
          if (dist <= CLAIM_RADIUS) {
            arr[idx] += 1.0 - dist / CLAIM_RADIUS; // falloff with distance
          }
        }
      }
    }

    // Buildings add extra influence
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);
    for (const bid of buildings) {
      const bdata = BuildingStore.get(bid)!;
      const bt = TransformStore.get(bid)!;
      const fid = bdata.factionId;

      if (!influence.has(fid)) {
        influence.set(fid, new Float32Array(GRID_CELLS));
      }
      const arr = influence.get(fid)!;

      const cgx = Math.floor((bt.x + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      const cgz = Math.floor((bt.z + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);

      for (let dz = -CLAIM_RADIUS_CELLS; dz <= CLAIM_RADIUS_CELLS; dz++) {
        for (let dx = -CLAIM_RADIUS_CELLS; dx <= CLAIM_RADIUS_CELLS; dx++) {
          const gx = cgx + dx;
          const gz = cgz + dz;
          if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;
          const idx = gz * GRID_SIZE + gx;
          arr[idx] += 2.0; // buildings have strong influence
        }
      }
    }

    // ── Gerrymandering pass: resource-seeking + border pressure ──
    const hasSettlement = this.factionManager
      ? this.factionManager.activeFactions.some(f => f.settlementTier === 'Camp' || f.settlementTier === 'Hamlet' || f.settlementTier === 'Village' || f.settlementTier === 'Town')
      : false;

    if (hasSettlement) {
      // Resource bonus: factions gain extra influence toward resource-rich cells near their border
      for (const [fid, arr] of influence) {
        const pop = factionPops.get(fid) ?? 0;
        if (pop < 3) continue; // too small to gerrymander

        for (let i = 0; i < GRID_CELLS; i++) {
          if (arr[i] > 0.1 && this.resourceValues[i] > 0) {
            // Strategic corridor claim: bonus influence toward valuable cells
            arr[i] += this.resourceValues[i] * 0.15; // +0.15 per resource point
          }
        }
      }

      // Border pressure: larger factions push into smaller neighbors' territory
      for (const [fidA, arrA] of influence) {
        const popA = factionPops.get(fidA) ?? 0;
        for (const [fidB, arrB] of influence) {
          if (fidA >= fidB) continue;
          const popB = factionPops.get(fidB) ?? 0;
          if (popA === popB) continue;

          const bigPop = Math.max(popA, popB);
          const smallPop = Math.max(1, Math.min(popA, popB));
          const ratio = bigPop / smallPop;
          if (ratio < 1.3) continue; // need meaningful size difference

          const bigArr = popA > popB ? arrA : arrB;
          const pressure = Math.min(2.0, 0.5 * ratio);

          // Apply pressure to border cells
          for (let i = 0; i < GRID_CELLS; i++) {
            if (this.contested[i] || (arrA[i] > 0.1 && arrB[i] > 0.1)) {
              bigArr[i] += pressure;
            }
          }
        }
      }
    }

    // Assign ownership
    const prevOwner = new Int16Array(this.owner);
    this.factionCellCounts.clear();

    for (let i = 0; i < GRID_CELLS; i++) {
      let bestFaction = -1;
      let bestInfluence = 0;
      let secondInfluence = 0;

      for (const [fid, arr] of influence) {
        if (arr[i] > bestInfluence) {
          secondInfluence = bestInfluence;
          bestInfluence = arr[i];
          bestFaction = fid;
        } else if (arr[i] > secondInfluence) {
          secondInfluence = arr[i];
        }
      }

      if (bestInfluence > 0.5) {
        this.owner[i] = bestFaction;
        this.contested[i] = (secondInfluence > bestInfluence * 0.7) ? 1 : 0;
        this.factionCellCounts.set(bestFaction, (this.factionCellCounts.get(bestFaction) ?? 0) + 1);
      } else {
        this.owner[i] = -1;
        this.contested[i] = 0;
      }
    }

    // ── Compute gerrymander scores and displaced creatures ──
    if (hasSettlement) {
      this.computeGerrymanderScores(factionPops);
      this.updateDisplacedCreatures(prevOwner, creatures);
    }
  }

  private computeGerrymanderScores(factionPops: Map<number, number>): void {
    this.gerrymanderScore.clear();

    for (const [fid, cellCount] of this.factionCellCounts) {
      const pop = factionPops.get(fid) ?? 0;
      if (pop === 0) continue;

      // Natural territory ≈ pop * (CLAIM_RADIUS_CELLS^2 * PI) — what you'd expect from creature influence alone
      const naturalCells = pop * Math.PI * CLAIM_RADIUS_CELLS * CLAIM_RADIUS_CELLS * 0.4;
      const excess = Math.max(0, cellCount - naturalCells);
      // landGrab 0-1: how much territory was grabbed beyond natural borders
      const landGrab = Math.min(1, excess / Math.max(naturalCells, 1));
      this.gerrymanderScore.set(fid, landGrab);
    }
  }

  private updateDisplacedCreatures(
    prevOwner: Int16Array,
    creatures: number[],
  ): void {
    this.displacedCreatures.clear();

    for (const id of creatures) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id);
      const transform = TransformStore.get(id);
      if (!social || !transform) continue;

      const gx = Math.floor((transform.x + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      const gz = Math.floor((transform.z + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;

      const idx = gz * GRID_SIZE + gx;
      const cellOwner = this.owner[idx];
      // Displaced if living in territory owned by a different faction
      if (cellOwner >= 0 && cellOwner !== social.factionId) {
        this.displacedCreatures.add(id);
      }
    }
  }

  /** Get resource value for a grid cell */
  getResourceValue(cellIdx: number): number {
    return this.resourceValues[cellIdx] ?? 0;
  }

  /** Get gerrymander score for a faction (0-1) */
  getGerrymanderScore(factionId: number): number {
    return this.gerrymanderScore.get(factionId) ?? 0;
  }

  /** Get territory count for a faction */
  getTerritory(factionId: number): number {
    return this.factionCellCounts.get(factionId) ?? 0;
  }

  /** Get contested cell count between two factions */
  getContestedCells(factionA: number, factionB: number): number {
    let count = 0;
    for (let i = 0; i < GRID_CELLS; i++) {
      if (this.contested[i] && (this.owner[i] === factionA || this.owner[i] === factionB)) {
        count++;
      }
    }
    return count;
  }

  /** Find capital cell for a faction (cell with most buildings) */
  findCapital(world: World, factionId: number): [number, number] | null {
    const buildingCounts = new Uint8Array(GRID_CELLS);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    for (const bid of buildings) {
      const bdata = BuildingStore.get(bid)!;
      if (bdata.factionId !== factionId) continue;
      const bt = TransformStore.get(bid)!;
      const gx = Math.floor((bt.x + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      const gz = Math.floor((bt.z + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
      if (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
        buildingCounts[gz * GRID_SIZE + gx]++;
      }
    }

    let bestIdx = -1;
    let bestCount = 0;
    for (let i = 0; i < GRID_CELLS; i++) {
      if (this.owner[i] === factionId && buildingCounts[i] > bestCount) {
        bestCount = buildingCounts[i];
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      return [bestIdx % GRID_SIZE, Math.floor(bestIdx / GRID_SIZE)];
    }
    return null;
  }

  /** Convert grid cell index to world coordinates (center of cell) */
  cellToWorld(cellIdx: number): [number, number] {
    const gx = cellIdx % GRID_SIZE;
    const gz = Math.floor(cellIdx / GRID_SIZE);
    const wx = gx * CELL_SIZE - GRID_SIZE * CELL_SIZE / 2 + CELL_SIZE / 2;
    const wz = gz * CELL_SIZE - GRID_SIZE * CELL_SIZE / 2 + CELL_SIZE / 2;
    return [wx, wz];
  }
}
