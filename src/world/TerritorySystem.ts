// Territory grid: 25x25 (same as resource grid), each cell owned by factionId or -1
// Recalculated every 100 ticks by scanning creature positions and building locations

import { GRID_SIZE, CELL_SIZE, GRID_CELLS } from './ResourceGrid';
import { TransformStore } from '../components/Transform';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore } from '../components/Building';
import type { World } from '../ecs/World';

const RECALC_INTERVAL = 100;
const CLAIM_RADIUS = 5; // units
const CLAIM_RADIUS_CELLS = Math.ceil(CLAIM_RADIUS / CELL_SIZE);

export class TerritorySystem {
  owner: Int16Array; // faction ID per cell, -1 = unclaimed
  contested: Uint8Array; // 1 = contested
  private tickCounter = 0;
  private factionCellCounts = new Map<number, number>();

  constructor() {
    this.owner = new Int16Array(GRID_CELLS).fill(-1);
    this.contested = new Uint8Array(GRID_CELLS);
  }

  tick(world: World): void {
    this.tickCounter++;
    if (this.tickCounter < RECALC_INTERVAL) return;
    this.tickCounter = 0;
    this.recalculate(world);
  }

  private recalculate(world: World): void {
    // Count faction presence per cell
    const influence = new Map<number, Float32Array>(); // factionId -> cell influence array

    const creatures = world.query(SocialStore.bit | TransformStore.bit);
    for (const id of creatures) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const fid = social.factionId;

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

    // Assign ownership
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
}
