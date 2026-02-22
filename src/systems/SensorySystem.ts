import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore } from '../components/Building';
import { distSq } from '../utils/Math';
import { ComponentStorage } from '../ecs/Component';
import { ResourceGrid, Resource, GRID_SIZE, CELL_SIZE, GRID_CELLS } from '../world/ResourceGrid';
import type { FactionManager } from '../world/FactionSystem';
import type { CritterManager } from '../world/PreyCritters';
import type { MonsterManager } from '../world/MonsterManager';
import { MONSTER_EMOJI, MAX_MONSTERS } from '../world/MonsterManager';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block, BLOCK_PROPS } from '../voxel/BlockTypes';
import { VocabularyStore, learn } from '../components/Vocabulary';

// Food types kept for backward compat (ground coloring in main.ts)
export const enum FoodType { Berry = 0, Grass = 1, Root = 2 }

export interface FoodData {
  energy: number;
  type: FoodType;
}
export const FoodStore = new ComponentStorage<FoodData>();

const SIGHT_RANGE = 20;
const SIGHT_RANGE_SQ = SIGHT_RANGE * SIGHT_RANGE;
const CROWD_RANGE = 12;
const CROWD_RANGE_SQ = CROWD_RANGE * CROWD_RANGE;
const CROWD_CAP = 8; // 8 neighbors = density 1.0
const RESOURCE_SCAN_RADIUS = 5; // grid cells to scan around creature

export class SensorySystem extends System {
  readonly query = SensesStore.bit | TransformStore.bit;
  readonly priority = 10;

  grid: ResourceGrid | null = null;
  voxelWorld: VoxelWorld | null = null;
  factionManager: FactionManager | null = null;
  critterManager: CritterManager | null = null;
  monsterManager: MonsterManager | null = null;

  update(world: World, _dt: number): void {
    const creatures = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    for (const id of creatures) {
      const senses = SensesStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id);
      const myFaction = social?.factionId ?? -1;

      // ── Nearest creature + crowd density ───────────────────────────
      let bestCreatureDSq = Infinity;
      let bestCreatureId = -1;
      let bestCX = 0;
      let bestCZ = 0;
      let nearbyTotal = 0;
      let nearbyFaction = 0;

      for (const cid of creatures) {
        if (cid === id) continue;
        const cl = LifecycleStore.get(cid);
        if (cl && cl.stage === LifeStage.Dead) continue;
        const ct = TransformStore.get(cid)!;
        const dsq = distSq(transform.x, transform.z, ct.x, ct.z);
        if (dsq < bestCreatureDSq && dsq < SIGHT_RANGE_SQ) {
          bestCreatureDSq = dsq;
          bestCreatureId = cid;
          bestCX = ct.x;
          bestCZ = ct.z;
        }
        // Crowd density: count creatures within 12 units
        if (dsq < CROWD_RANGE_SQ) {
          nearbyTotal++;
          const otherSocial = SocialStore.get(cid);
          if (otherSocial && otherSocial.factionId === myFaction) {
            nearbyFaction++;
          }
        }
      }
      senses.crowdDensity = Math.min(1, nearbyTotal / CROWD_CAP);
      senses.nearbyFactionCount = nearbyFaction;

      if (bestCreatureId >= 0) {
        senses.creatureVisible = true;
        senses.nearestCreatureId = bestCreatureId;
        senses.nearestCreatureDist = Math.sqrt(bestCreatureDSq) / SIGHT_RANGE;
        const dx = bestCX - transform.x;
        const dz = bestCZ - transform.z;
        const angleToCreature = Math.atan2(dx, dz);
        let relAngle = angleToCreature - transform.rotation;
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
        senses.nearestCreatureAngle = relAngle / Math.PI;
      } else {
        senses.creatureVisible = false;
        senses.nearestCreatureId = -1;
        senses.nearestCreatureDist = 1;
        senses.nearestCreatureAngle = 0;
      }

      // ── Resource sensing (voxel world or grid) ──────────────────────
      if (this.voxelWorld) {
        // Voxel-based resource sensing: scan nearby surface blocks for mineable resources
        const [cbx, , cbz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);
        const scanR = RESOURCE_SCAN_RADIUS * 2; // block-level radius

        // Current cell equivalent
        const surfY = this.voxelWorld.getHeight(cbx, cbz);
        const surfBlock = this.voxelWorld.getBlock(cbx, surfY, cbz);
        senses.currentCell = cbx * 1000 + cbz; // encode as unique ID
        senses.currentBiome = 0;
        senses.currentResource = surfBlock;
        senses.currentResourceAmount = (BLOCK_PROPS[surfBlock].mineable && BLOCK_PROPS[surfBlock].mineYield !== null) ? 1.0 : 0;

        let bestResDSq = Infinity;
        let bestResWX = 0;
        let bestResWZ = 0;
        let bestResType = 0;
        let foundResource = false;

        for (let dx = -scanR; dx <= scanR; dx += 2) {
          for (let dz = -scanR; dz <= scanR; dz += 2) {
            const bx = cbx + dx;
            const bz = cbz + dz;
            const h = this.voxelWorld.getHeight(bx, bz);
            if (h <= 0) continue;
            // Check surface block
            const block = this.voxelWorld.getBlock(bx, h, bz);
            if (block !== Block.Air && BLOCK_PROPS[block].mineable && BLOCK_PROPS[block].mineYield !== null) {
              const [wx, , wz] = this.voxelWorld.blockToWorld(bx, h, bz);
              const dsq = distSq(transform.x, transform.z, wx, wz);
              if (dsq < bestResDSq) {
                bestResDSq = dsq;
                bestResWX = wx;
                bestResWZ = wz;
                bestResType = block;
                foundResource = true;
              }
            }
          }
        }

        if (foundResource) {
          senses.resourceVisible = true;
          senses.nearestResourceCell = -1;
          senses.nearestResourceDist = Math.min(1, Math.sqrt(bestResDSq) / SIGHT_RANGE);
          senses.nearestResourceType = bestResType;
          senses.nearestResourceAmount = 1.0;
          const ddx = bestResWX - transform.x;
          const ddz = bestResWZ - transform.z;
          const angle = Math.atan2(ddx, ddz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          senses.nearestResourceAngle = relAngle / Math.PI;
        } else {
          senses.resourceVisible = false;
          senses.nearestResourceCell = -1;
          senses.nearestResourceDist = 1;
          senses.nearestResourceAngle = 0;
          senses.nearestResourceType = 0;
          senses.nearestResourceAmount = 0;
        }

        senses.foodVisible = senses.resourceVisible;
        senses.nearestFoodAngle = senses.nearestResourceAngle;
        senses.nearestFoodDist = senses.nearestResourceDist;
        senses.nearestFoodId = -1;
      } else if (this.grid) {
        const cellIdx = this.grid.worldToCell(transform.x, transform.z);
        if (cellIdx >= 0) {
          senses.currentCell = cellIdx;
          senses.currentBiome = this.grid.biome[cellIdx];
          senses.currentResource = this.grid.resource[cellIdx];
          senses.currentResourceAmount = this.grid.amount[cellIdx];
        } else {
          senses.currentCell = -1;
          senses.currentBiome = 0;
          senses.currentResource = 0;
          senses.currentResourceAmount = 0;
        }

        let bestResDSq = Infinity;
        let bestResCell = -1;
        let bestResWX = 0;
        let bestResWZ = 0;
        let bestResType = 0;
        let bestResAmount = 0;

        const cgx = Math.floor((transform.x + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);
        const cgz = Math.floor((transform.z + GRID_SIZE * CELL_SIZE / 2) / CELL_SIZE);

        for (let dz = -RESOURCE_SCAN_RADIUS; dz <= RESOURCE_SCAN_RADIUS; dz++) {
          for (let dx = -RESOURCE_SCAN_RADIUS; dx <= RESOURCE_SCAN_RADIUS; dx++) {
            const gx = cgx + dx;
            const gz = cgz + dz;
            if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;
            const idx = gz * GRID_SIZE + gx;
            if (this.grid.resource[idx] === Resource.Empty) continue;
            if (this.grid.amount[idx] < 0.2) continue;
            if (this.grid.cooldown[idx] > 0) continue;

            const wx = (gx - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
            const wz = (gz - GRID_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
            const dsq = distSq(transform.x, transform.z, wx, wz);
            if (dsq < bestResDSq) {
              bestResDSq = dsq;
              bestResCell = idx;
              bestResWX = wx;
              bestResWZ = wz;
              bestResType = this.grid.resource[idx];
              bestResAmount = this.grid.amount[idx];
            }
          }
        }

        if (bestResCell >= 0) {
          senses.resourceVisible = true;
          senses.nearestResourceCell = bestResCell;
          senses.nearestResourceDist = Math.min(1, Math.sqrt(bestResDSq) / SIGHT_RANGE);
          senses.nearestResourceType = bestResType;
          senses.nearestResourceAmount = bestResAmount;
          const ddx = bestResWX - transform.x;
          const ddz = bestResWZ - transform.z;
          const angle = Math.atan2(ddx, ddz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          senses.nearestResourceAngle = relAngle / Math.PI;
        } else {
          senses.resourceVisible = false;
          senses.nearestResourceCell = -1;
          senses.nearestResourceDist = 1;
          senses.nearestResourceAngle = 0;
          senses.nearestResourceType = 0;
          senses.nearestResourceAmount = 0;
        }

        senses.foodVisible = senses.resourceVisible;
        senses.nearestFoodAngle = senses.nearestResourceAngle;
        senses.nearestFoodDist = senses.nearestResourceDist;
        senses.nearestFoodId = -1;
      }

      // ── Building sensing ────────────────────────────
      let bestBldgDSq = Infinity;
      let bestBldgId = -1;
      let bestBldgX = 0;
      let bestBldgZ = 0;
      let bestBldgType = -1;
      let bestBldgFaction = -1;

      for (const bid of buildings) {
        const bt = TransformStore.get(bid)!;
        const dsq = distSq(transform.x, transform.z, bt.x, bt.z);
        if (dsq < bestBldgDSq && dsq < SIGHT_RANGE_SQ) {
          bestBldgDSq = dsq;
          bestBldgId = bid;
          bestBldgX = bt.x;
          bestBldgZ = bt.z;
          const bd = BuildingStore.get(bid)!;
          bestBldgType = bd.type;
          bestBldgFaction = bd.factionId;
        }
      }

      if (bestBldgId >= 0) {
        senses.buildingVisible = true;
        senses.nearestBuildingId = bestBldgId;
        senses.nearestBuildingDist = Math.min(1, Math.sqrt(bestBldgDSq) / SIGHT_RANGE);
        senses.nearestBuildingType = bestBldgType;
        senses.nearestBuildingFaction = bestBldgFaction;
        const dx = bestBldgX - transform.x;
        const dz = bestBldgZ - transform.z;
        const angle = Math.atan2(dx, dz);
        let relAngle = angle - transform.rotation;
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
        senses.nearestBuildingAngle = relAngle / Math.PI;
      } else {
        senses.buildingVisible = false;
        senses.nearestBuildingId = -1;
        senses.nearestBuildingDist = 1;
        senses.nearestBuildingAngle = 0;
        senses.nearestBuildingType = -1;
        senses.nearestBuildingFaction = -1;
      }

      // ── Threat sensing ──────────────────────────────
      // Enemy creatures nearby = threat
      senses.threatVisible = false;
      senses.threatLevel = 0;
      senses.nearestThreatAngle = 0;
      senses.nearestThreatDist = 1;

      if (bestCreatureId >= 0 && this.factionManager) {
        const otherSocial = SocialStore.get(bestCreatureId);
        if (otherSocial) {
          const relation = this.factionManager.getRelation(myFaction, otherSocial.factionId);
          if (relation < -0.3) {
            senses.threatVisible = true;
            senses.threatLevel = Math.min(1, Math.abs(relation));
            senses.nearestThreatDist = senses.nearestCreatureDist;
            senses.nearestThreatAngle = senses.nearestCreatureAngle;
          }
        }
      }

      // ── Prey sensing ───────────────────────────────
      senses.preyVisible = false;
      senses.nearestPreyIndex = -1;
      senses.nearestPreyDist = 1;
      senses.nearestPreyAngle = 0;
      senses.nearestPreyType = -1;

      if (this.critterManager) {
        let bestPreyDSq = Infinity;
        let bestPreyIdx = -1;
        let bestPreyX = 0;
        let bestPreyZ = 0;

        for (let ci = 0; ci < this.critterManager.count; ci++) {
          if (!this.critterManager.alive[ci]) continue;
          const px = this.critterManager.x[ci];
          const pz = this.critterManager.z[ci];
          const dsq = distSq(transform.x, transform.z, px, pz);
          if (dsq < bestPreyDSq && dsq < SIGHT_RANGE_SQ) {
            bestPreyDSq = dsq;
            bestPreyIdx = ci;
            bestPreyX = px;
            bestPreyZ = pz;
          }
        }

        if (bestPreyIdx >= 0) {
          senses.preyVisible = true;
          senses.nearestPreyIndex = bestPreyIdx;
          senses.nearestPreyDist = Math.min(1, Math.sqrt(bestPreyDSq) / SIGHT_RANGE);
          senses.nearestPreyType = this.critterManager.type[bestPreyIdx];
          const dx = bestPreyX - transform.x;
          const dz = bestPreyZ - transform.z;
          const angle = Math.atan2(dx, dz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          senses.nearestPreyAngle = relAngle / Math.PI;
        }
      }

      // ── Monster sensing ────────────────────────────────
      senses.monsterVisible = false;
      senses.nearestMonsterDist = 1;
      senses.nearestMonsterAngle = 0;
      senses.nearestMonsterIndex = -1;
      senses.nearestMonsterType = -1;

      if (this.monsterManager) {
        let bestMonsterDSq = Infinity;
        let bestMonsterIdx = -1;
        let bestMonsterX = 0;
        let bestMonsterZ = 0;

        for (let mi = 0; mi < MAX_MONSTERS; mi++) {
          if (!this.monsterManager.alive[mi]) continue;
          const mx = this.monsterManager.x[mi];
          const mz = this.monsterManager.z[mi];
          const dsq = distSq(transform.x, transform.z, mx, mz);
          if (dsq < bestMonsterDSq && dsq < SIGHT_RANGE_SQ) {
            bestMonsterDSq = dsq;
            bestMonsterIdx = mi;
            bestMonsterX = mx;
            bestMonsterZ = mz;
          }
        }

        if (bestMonsterIdx >= 0) {
          senses.monsterVisible = true;
          senses.nearestMonsterIndex = bestMonsterIdx;
          senses.nearestMonsterDist = Math.min(1, Math.sqrt(bestMonsterDSq) / SIGHT_RANGE);
          senses.nearestMonsterType = this.monsterManager.type[bestMonsterIdx];
          const dx = bestMonsterX - transform.x;
          const dz = bestMonsterZ - transform.z;
          const angle = Math.atan2(dx, dz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          senses.nearestMonsterAngle = relAngle / Math.PI;
        }
      }

      // ── Vocabulary discovery from environment ─────────────
      const vocab = VocabularyStore.get(id);
      if (vocab && Math.random() < 0.01) { // low chance per tick to avoid spam
        // Water nearby → learn water emoji
        if (this.voxelWorld && this.voxelWorld.isWaterAt(
          transform.x + Math.cos(transform.rotation) * 3,
          transform.z + Math.sin(transform.rotation) * 3,
        )) {
          learn(vocab, '💧');
        }
        // Building nearby → learn building emoji
        if (senses.buildingVisible && senses.nearestBuildingDist < 0.3) {
          learn(vocab, '🏠');
        }
        // Prey visible → learn prey emoji
        if (senses.preyVisible) {
          learn(vocab, '🐾');
        }
        // Monster visible → learn monster emoji
        if (senses.monsterVisible && senses.nearestMonsterType > 0) {
          const mEmoji = MONSTER_EMOJI[senses.nearestMonsterType];
          if (mEmoji) learn(vocab, mEmoji);
        }
      }
    }
  }
}
