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
import { BLOCK_SIZE } from '../voxel/VoxelWorld';
import type { WaterFlow } from '../voxel/WaterFlow';

const GATHER_ENERGY_COST = 0.0002;

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
      const senses = SensesStore.get(id);

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

      // Voxel mining: find a mineable surface block nearby
      let ms = mineStates.get(id);

      if (!ms) {
        // Find a surface block to mine — hungry creatures prioritize food blocks
        const hungerLevel = biochem.chemicals[ChemId.Hunger];
        const target = this.findMineTarget(transform, hungerLevel);
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

      // Walk to mine target if too far
      const [twx, , twz] = this.voxelWorld!.blockToWorld(ms.targetBX, ms.targetBY, ms.targetBZ);
      const dsq = distSq(transform.x, transform.z, twx, twz);
      if (dsq > 2.25) { // 1.5 world units
        const dx = twx - transform.x;
        const dz = twz - transform.z;
        transform.rotation = Math.atan2(dx, dz);
        motor.forward = 1.0;
        continue;
      }

      // Mining in progress
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
        }
        this.voxelWorld!.setBlock(ms.targetBX, ms.targetBY, ms.targetBZ, Block.Air);
        // Notify water flow system about mined block
        if (this.waterFlow) {
          this.waterFlow.markDirty(ms.targetBX, ms.targetBZ);
        }
        mineStates.delete(id);

        // Reward
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.15, 0, 1);

        // Vocabulary: learn the gathered item's emoji
        const vocab = VocabularyStore.get(id);
        const item = props.mineYield;
        const emoji = item !== null ? (ITEM_EMOJI[item] ?? '📦') : '📦';
        if (vocab && item !== null) {
          learn(vocab, emoji);
        }

        // Speech
        if (social && Math.random() < 0.3) {
          social.speechEmoji = emoji;
          social.speechTimer = 30;
        }

        inv.gatherTarget = -1;
        inv.gatherProgress = 0;
      }
    }
  }

  /** Food-yielding block types */
  private static FOOD_BLOCKS = new Set([Block.BerryBush, Block.TallGrass, Block.Grass, Block.DarkGrass]);

  /** Find nearest mineable surface block within scan radius.
   *  When hungry, prioritize food blocks (BerryBush, TallGrass, Grass). */
  private findMineTarget(transform: { x: number; z: number }, hunger: number): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const hungryMode = hunger > 0.25;
    const scanR = hunger > 0.5 ? 16 : 8; // wider search when starving

    // In hungry mode, first scan for food blocks only
    if (hungryMode) {
      const foodTarget = this.scanForBlocks(transform, scanR, true);
      if (foodTarget) return foodTarget;
    }

    // General mode: any mineable block
    return this.scanForBlocks(transform, 8, false);
  }

  /** Scan for mineable blocks. If foodOnly=true, only return food-yielding blocks. */
  private scanForBlocks(
    transform: { x: number; z: number },
    scanR: number,
    foodOnly: boolean,
  ): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const [cbx, , cbz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);
    let bestDSq = Infinity;
    let best: [number, number, number] | null = null;

    for (let dx = -scanR; dx <= scanR; dx += 2) {
      for (let dz = -scanR; dz <= scanR; dz += 2) {
        const bx = cbx + dx;
        const bz = cbz + dz;
        const height = this.voxelWorld.getHeight(bx, bz);
        if (height <= 1) continue;

        const block = this.voxelWorld.getBlock(bx, height, bz);
        // Prefer surface decorations and resources
        if (block === Block.Air || block === Block.Water) {
          // Check one below
          const below = this.voxelWorld.getBlock(bx, height - 1, bz);
          if (below === Block.Air || below === Block.Water || !BLOCK_PROPS[below].mineable) continue;
          if (BLOCK_PROPS[below].mineYield === null) continue;
          if (foodOnly && !GatheringSystem.FOOD_BLOCKS.has(below)) continue;
          const dsq = dx * dx + dz * dz;
          if (dsq < bestDSq) {
            bestDSq = dsq;
            best = [bx, height - 1, bz];
          }
        } else if (BLOCK_PROPS[block].mineable && BLOCK_PROPS[block].mineYield !== null) {
          if (foodOnly && !GatheringSystem.FOOD_BLOCKS.has(block)) continue;
          const dsq = dx * dx + dz * dz;
          if (dsq < bestDSq) {
            bestDSq = dsq;
            best = [bx, height, bz];
          }
        }
      }
    }
    return best;
  }
}
