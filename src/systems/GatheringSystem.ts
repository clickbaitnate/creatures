import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, addItem, hasSpace, ItemType } from '../components/Inventory';
import { SensesStore } from '../components/Senses';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { SocialStore, Activity } from '../components/Social';
import { VocabularyStore, ITEM_EMOJI, learn } from '../components/Vocabulary';
import { clamp, distSq } from '../utils/Math';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { Block, BLOCK_PROPS } from '../voxel/BlockTypes';
import { simStats } from '../stats/SimStats';
import { BLOCK_SIZE } from '../voxel/VoxelWorld';
import type { WaterFlow } from '../voxel/WaterFlow';
import type { MiningParticles } from '../creatures/MiningParticles';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';

const GATHER_ENERGY_COST = 0.0002;
let gatherCounters = new Map<number, number>(); // track per-creature gather count for milestones

// Minecraft-style: must be touching the block to mine it.
// Scan radius = 1 block — ONLY the blocks directly adjacent to the creature.
const MINE_SCAN_RADIUS = 1;
// World-space distance to mine (must be within 1 block = 0.5 world units)
const MINE_REACH_SQ = 0.36; // ~0.6 world units squared (slightly > 0.5 for tolerance)

// Per-creature voxel mining state
interface MineState {
  targetBX: number;
  targetBY: number;
  targetBZ: number;
  progress: number;
  totalTicks: number;
}

const mineStates = new Map<number, MineState>();

export class GatheringSystem extends System {
  readonly query = MotorStore.bit | TransformStore.bit | InventoryStore.bit;
  readonly priority = 57;

  voxelWorld: VoxelWorld | null = null;
  waterFlow: WaterFlow | null = null;
  miningParticles: MiningParticles | null = null;

  update(world: World, _dt: number): void {
    if (!this.voxelWorld) return;
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      const inv = InventoryStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const genome = GenomeStore.get(id)?.genome;

      if (!biochem || !genome) {
        inv.gatherTarget = -1;
        inv.gatherProgress = 0;
        continue;
      }

      // Auto-gather when hungry, or when brain says gather
      const autoGather = biochem.chemicals[ChemId.Hunger] > 0.25;
      if (!motor.wantGather && !autoGather) {
        inv.gatherTarget = -1;
        inv.gatherProgress = 0;
        mineStates.delete(id);
        continue;
      }

      if (!hasSpace(inv)) {
        inv.gatherTarget = -1;
        inv.gatherProgress = 0;
        mineStates.delete(id);
        continue;
      }

      // Find a mineable block right next to the creature
      let ms = mineStates.get(id);

      if (!ms) {
        const hungerLevel = biochem.chemicals[ChemId.Hunger];
        const target = this.findAdjacentMineTarget(transform, hungerLevel);
        if (!target) {
          inv.gatherTarget = -1;
          inv.gatherProgress = 0;
          continue;
        }
        const [bx, by, bz] = target;
        const block = this.voxelWorld!.getBlock(bx, by, bz);
        ms = {
          targetBX: bx, targetBY: by, targetBZ: bz,
          progress: 0,
          totalTicks: BLOCK_PROPS[block].mineTicks || 15,
        };
        mineStates.set(id, ms);
      }

      // Check if target block still exists
      const block = this.voxelWorld!.getBlock(ms.targetBX, ms.targetBY, ms.targetBZ);
      if (block === Block.Air || block === Block.Water) {
        mineStates.delete(id);
        continue;
      }

      // Must be right next to the block to mine (Minecraft-style reach)
      const [twx, , twz] = this.voxelWorld!.blockToWorld(ms.targetBX, ms.targetBY, ms.targetBZ);
      const dsq = distSq(transform.x, transform.z, twx, twz);
      if (dsq > MINE_REACH_SQ) {
        // Revalidate: check if water is between us and target now
        const [curBX, , curBZ] = this.voxelWorld!.worldToBlock(transform.x, 0, transform.z);
        if (this.waterBetween(curBX, curBZ, ms.targetBX, ms.targetBZ)) {
          // Path is blocked by water — abandon this target
          mineStates.delete(id);
          inv.gatherTarget = -1;
          inv.gatherProgress = 0;
          continue;
        }
        // Too far — face the target and walk toward it
        const dx = twx - transform.x;
        const dz = twz - transform.z;
        transform.rotation = Math.atan2(dx, dz);
        motor.forward = 1.0;
        continue;
      }

      // Mining in progress — creature is right next to the block
      ms.progress++;
      biochem.chemicals[ChemId.Energy] = Math.max(0, biochem.chemicals[ChemId.Energy] - GATHER_ENERGY_COST);

      // Tool bonus
      let toolMult = 1;
      if (block === Block.Wood || block === Block.Plank || block === Block.Leaf) {
        if (inv.equippedTool === ItemType.StoneAxe) toolMult = 2;
        else if (inv.equippedTool === ItemType.MetalAxe) toolMult = 3;
      }
      if (block === Block.Stone || block === Block.Cobblestone || block === Block.OreBlock) {
        if (inv.equippedTool === ItemType.StonePick) toolMult = 2;
        else if (inv.equippedTool === ItemType.MetalPick) toolMult = 3;
      }

      const social = SocialStore.get(id);
      if (social) social.activity = Activity.Gathering;

      inv.gatherProgress = ms.progress / Math.ceil(ms.totalTicks / toolMult);

      if (ms.progress >= Math.ceil(ms.totalTicks / toolMult)) {
        // Mining complete
        const props = BLOCK_PROPS[block];
        if (props.mineYield !== null) {
          addItem(inv, props.mineYield);
          simStats.recordGather();
        }
        // Spawn break particles
        if (this.miningParticles) {
          const [pwx, pwy, pwz] = this.voxelWorld!.blockToWorld(ms.targetBX, ms.targetBY, ms.targetBZ);
          this.miningParticles.spawnBreakParticles(pwx, pwy, pwz, props.color ?? 0x888888);
        }
        this.voxelWorld!.setBlock(ms.targetBX, ms.targetBY, ms.targetBZ, Block.Air);
        if (this.waterFlow) {
          this.waterFlow.markDirty(ms.targetBX, ms.targetBZ);
        }
        mineStates.delete(id);

        // Reward
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.15, 0, 1);

        // Diary: gather milestone every 10th gather
        const gc = (gatherCounters.get(id) ?? 0) + 1;
        gatherCounters.set(id, gc);
        if (gc % 10 === 0) {
          const gDiary = DiaryStore.get(id);
          if (gDiary) addDiaryEntry(gDiary, 0, DiaryEventType.GatherMilestone, {
            detail: `${gc} blocks mined`,
          });
        }

        // Vocabulary
        const vocab = VocabularyStore.get(id);
        const item = props.mineYield;
        const emoji = item !== null ? (ITEM_EMOJI[item] ?? '📦') : '📦';
        if (vocab && item !== null) {
          learn(vocab, emoji);
        }

        if (social && Math.random() < 0.3) {
          social.speechEmoji = emoji;
          social.speechTimer = 30;
        }

        inv.gatherTarget = -1;
        inv.gatherProgress = 0;
      }
    }
  }

  /** Food-yielding block types (only actual food plants, not terrain grass) */
  private static FOOD_BLOCKS = new Set([Block.BerryBush, Block.TallGrass]);

  /** Find a mineable block immediately adjacent to the creature (radius 3 blocks).
   *  When hungry, prioritize food blocks. Rejects any target across water. */
  private findAdjacentMineTarget(
    transform: { x: number; z: number },
    hunger: number,
  ): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const hungryMode = hunger > 0.25;

    // In hungry mode, first look for food only
    if (hungryMode) {
      const food = this.scanNearby(transform, true);
      if (food) return food;
    }

    // General: any mineable block with yield
    return this.scanNearby(transform, false);
  }

  /** Scan only immediately adjacent blocks (±3 block radius, step 1).
   *  Rejects targets if ANY column between creature and target has water. */
  private scanNearby(
    transform: { x: number; z: number },
    foodOnly: boolean,
  ): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const [cbx, , cbz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);

    // Reject if creature is standing in/next to water — don't mine from water edge
    if (this.columnHasWater(cbx, cbz)) return null;

    let bestDSq = Infinity;
    let best: [number, number, number] | null = null;

    for (let dx = -MINE_SCAN_RADIUS; dx <= MINE_SCAN_RADIUS; dx++) {
      for (let dz = -MINE_SCAN_RADIUS; dz <= MINE_SCAN_RADIUS; dz++) {
        const bx = cbx + dx;
        const bz = cbz + dz;

        // Line-of-sight water check: walk every column from creature to target
        // and reject if ANY intermediate column has water
        if (dx !== 0 || dz !== 0) {
          if (this.waterBetween(cbx, cbz, bx, bz)) continue;
        }

        const height = this.voxelWorld.getHeight(bx, bz);
        if (height <= 1) continue;

        const block = this.voxelWorld.getBlock(bx, height, bz);
        let targetBlock = -1;
        let targetY = height;

        if (block === Block.Air || block === Block.Water) {
          const below = this.voxelWorld.getBlock(bx, height - 1, bz);
          if (below === Block.Air || below === Block.Water || !BLOCK_PROPS[below].mineable) continue;
          if (BLOCK_PROPS[below].mineYield === null) continue;
          if (foodOnly && !GatheringSystem.FOOD_BLOCKS.has(below)) continue;
          targetBlock = below;
          targetY = height - 1;
        } else if (BLOCK_PROPS[block].mineable && BLOCK_PROPS[block].mineYield !== null) {
          if (foodOnly && !GatheringSystem.FOOD_BLOCKS.has(block)) continue;
          targetBlock = block;
          targetY = height;
        }

        if (targetBlock < 0) continue;

        const dsq = dx * dx + dz * dz;
        if (dsq < bestDSq) {
          bestDSq = dsq;
          best = [bx, targetY, bz];
        }
      }
    }
    return best;
  }

  /** Check if a block column has water at or above the solid surface */
  private columnHasWater(bx: number, bz: number): boolean {
    if (!this.voxelWorld) return false;
    const h = this.voxelWorld.getHeight(bx, bz);
    if (this.voxelWorld.getBlock(bx, h, bz) === Block.Water) return true;
    if (this.voxelWorld.getBlock(bx, h + 1, bz) === Block.Water) return true;
    if (this.voxelWorld.getBlock(bx, h + 2, bz) === Block.Water) return true;
    return false;
  }

  /** Walk from (ax,az) to (bx,bz) checking every column for water.
   *  Uses Bresenham-style stepping to hit every column along the line. */
  private waterBetween(ax: number, az: number, bx: number, bz: number): boolean {
    let dx = Math.abs(bx - ax);
    let dz = Math.abs(bz - az);
    const sx = ax < bx ? 1 : -1;
    const sz = az < bz ? 1 : -1;
    let err = dx - dz;
    let cx = ax, cz = az;

    while (cx !== bx || cz !== bz) {
      const e2 = err * 2;
      if (e2 > -dz) { err -= dz; cx += sx; }
      if (e2 < dx) { err += dx; cz += sz; }
      // Check this intermediate column (skip start, include end)
      if (this.columnHasWater(cx, cz)) return true;
    }
    return false;
  }
}
