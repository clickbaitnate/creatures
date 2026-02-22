// ConstructionSystem: Creatures carry blocks to construction sites, place block-by-block.
// Handles Tower of Babel progressive decay: tiredness → language confusion → fighting → exodus.

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, addItem, removeItem, countItem, hasSpace, ItemType } from '../components/Inventory';
import { SensesStore } from '../components/Senses';
import { SocialStore, Activity } from '../components/Social';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp, distSq } from '../utils/Math';
import { VoxelWorld, BLOCK_SIZE } from '../voxel/VoxelWorld';
import { Block, BLOCK_PROPS, BLOCK_TO_ITEM } from '../voxel/BlockTypes';
import {
  ConstructionSite, getNextUnplacedBlock, getRequiredItem, markPlaced,
} from '../voxel/Blueprint';

const PLACE_COOLDOWN = 15;
const PLACE_RANGE_SQ = 4.0; // 2 world units squared
const MINE_RANGE_SQ = 2.25; // 1.5 world units squared

// Per-creature construction state
interface BuilderState {
  siteId: number;           // assigned construction site, -1 if none
  targetBlock: { bx: number; by: number; bz: number; block: Block } | null;
  neededItem: ItemType;
  placeCooldown: number;
  mineTarget: [number, number, number] | null; // block coords to mine
  mineProgress: number;
  mineTicks: number;
  scatterAngle: number;     // for exodus scatter direction
  scattered: boolean;
}

const builderStates = new Map<number, BuilderState>();

function getBuilder(id: number): BuilderState {
  let s = builderStates.get(id);
  if (!s) {
    s = {
      siteId: -1,
      targetBlock: null,
      neededItem: ItemType.None,
      placeCooldown: 0,
      mineTarget: null,
      mineProgress: 0,
      mineTicks: 0,
      scatterAngle: Math.random() * Math.PI * 2,
      scattered: false,
    };
    builderStates.set(id, s);
  }
  return s;
}

export class ConstructionSystem extends System {
  readonly query = MotorStore.bit | TransformStore.bit | InventoryStore.bit;
  readonly priority = 64;

  voxelWorld: VoxelWorld | null = null;
  sites: ConstructionSite[] = [];

  // Babel decay state
  babelSiteId = 0; // the main tower site id
  languageAssigned = false;
  exodusTriggered = false;

  update(world: World, _dt: number): void {
    if (!this.voxelWorld) return;
    const entities = world.query(this.query);

    // Apply progressive decay based on babel tower progress
    const babelSite = this.sites.find(s => s.id === this.babelSiteId);
    if (babelSite) {
      this.applyBabelDecay(babelSite, entities);
    }

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const transform = TransformStore.get(id)!;
      const inv = InventoryStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const social = SocialStore.get(id);
      if (!biochem) continue;

      const builder = getBuilder(id);

      // Cooldown
      if (builder.placeCooldown > 0) {
        builder.placeCooldown--;
        continue;
      }

      // If scattered (exodus), don't build — just wander
      if (builder.scattered) continue;

      // Find nearest active site if unassigned
      if (builder.siteId < 0) {
        let bestDSq = Infinity;
        let bestSite = -1;
        for (const site of this.sites) {
          if (!site.active || site.progress >= 1) continue;
          const [swx, , swz] = this.voxelWorld!.blockToWorld(
            site.originX + Math.floor(site.blueprint.width / 2),
            site.originY,
            site.originZ + Math.floor(site.blueprint.depth / 2),
          );
          const dsq = distSq(transform.x, transform.z, swx, swz);
          if (dsq < bestDSq) {
            bestDSq = dsq;
            bestSite = site.id;
          }
        }
        builder.siteId = bestSite;
      }

      const site = this.sites.find(s => s.id === builder.siteId);
      if (!site || !site.active) {
        builder.siteId = -1;
        builder.targetBlock = null;
        continue;
      }

      // Get next block to place
      if (!builder.targetBlock) {
        builder.targetBlock = getNextUnplacedBlock(site);
        if (!builder.targetBlock) {
          // Site complete
          site.active = false;
          builder.siteId = -1;
          continue;
        }
        builder.neededItem = getRequiredItem(builder.targetBlock.block);
      }

      const needed = builder.neededItem;

      // Check if we have the needed item
      if (countItem(inv, needed) === 0) {
        // Need to mine a block from terrain to get the item
        this.doMining(id, builder, transform, inv, biochem, social);
        continue;
      }

      // Have item — walk to placement position
      const [targetWX, targetWY, targetWZ] = this.voxelWorld!.blockToWorld(
        builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz
      );

      const dsq = distSq(transform.x, transform.z, targetWX, targetWZ);

      if (dsq > PLACE_RANGE_SQ) {
        // Walk toward target
        const dx = targetWX - transform.x;
        const dz = targetWZ - transform.z;
        const angle = Math.atan2(dx, dz);
        transform.rotation = angle;
        // MotorSystem handles actual movement; we just set desire
        const motor = MotorStore.get(id);
        if (motor) {
          motor.forward = 1.0;
          motor.wantBuild = true;
        }
        if (social) social.activity = Activity.Walking;
        continue;
      }

      // At position — place block
      removeItem(inv, needed, 1);
      this.voxelWorld!.setBlock(
        builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz,
        builder.targetBlock.block,
      );
      markPlaced(site, builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz);

      builder.placeCooldown = PLACE_COOLDOWN;
      builder.targetBlock = null; // get next block next tick

      // Feedback
      biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.1, 0, 1);
      if (social) {
        social.activity = Activity.Building;
        if (Math.random() < 0.2) {
          social.speechEmoji = '🧱';
          social.speechTimer = 30;
        }
      }
    }
  }

  private doMining(
    id: number,
    builder: BuilderState,
    transform: { x: number; y: number; z: number; rotation: number },
    inv: any,
    biochem: any,
    social: any,
  ): void {
    if (!this.voxelWorld) return;

    // Find a mineable block nearby if no target
    if (!builder.mineTarget) {
      const target = this.findMineableBlock(transform, builder.neededItem);
      if (!target) return; // no mineable block found
      builder.mineTarget = target;
      builder.mineProgress = 0;
      const block = this.voxelWorld.getBlock(target[0], target[1], target[2]);
      builder.mineTicks = BLOCK_PROPS[block].mineTicks || 20;
    }

    const [mbx, mby, mbz] = builder.mineTarget;
    const [mwx, mwy, mwz] = this.voxelWorld.blockToWorld(mbx, mby, mbz);
    const dsq = distSq(transform.x, transform.z, mwx, mwz);

    if (dsq > MINE_RANGE_SQ) {
      // Walk to mine target
      const dx = mwx - transform.x;
      const dz = mwz - transform.z;
      transform.rotation = Math.atan2(dx, dz);
      const motor = MotorStore.get(id);
      if (motor) motor.forward = 1.0;
      if (social) social.activity = Activity.Walking;
      return;
    }

    // Mining
    builder.mineProgress++;
    if (social) social.activity = Activity.Gathering;

    // Tool speed bonus
    let toolMult = 1;
    const tool = inv.equippedTool;
    const block = this.voxelWorld.getBlock(mbx, mby, mbz);
    if (block === Block.Stone || block === Block.Cobblestone || block === Block.StoneBrick || block === Block.OreBlock) {
      if (tool === ItemType.StonePick) toolMult = 2;
      else if (tool === ItemType.MetalPick) toolMult = 3;
    }
    if (block === Block.Wood || block === Block.Plank) {
      if (tool === ItemType.StoneAxe) toolMult = 2;
      else if (tool === ItemType.MetalAxe) toolMult = 3;
    }

    const adjustedTicks = Math.ceil(builder.mineTicks / toolMult);
    if (builder.mineProgress >= adjustedTicks) {
      // Mine complete
      const props = BLOCK_PROPS[block];
      if (props.mineYield !== null && hasSpace(inv)) {
        addItem(inv, props.mineYield);
      } else if (hasSpace(inv)) {
        // Fallback: give the needed item directly
        addItem(inv, builder.neededItem);
      }
      this.voxelWorld.setBlock(mbx, mby, mbz, Block.Air);
      builder.mineTarget = null;
      builder.mineProgress = 0;

      biochem.chemicals[ChemId.Energy] = Math.max(0, biochem.chemicals[ChemId.Energy] - 0.01);

      if (social && Math.random() < 0.2) {
        social.speechEmoji = '⛏️';
        social.speechTimer = 25;
      }
    }
  }

  /** Find a surface block that yields the needed item type. */
  private findMineableBlock(
    transform: { x: number; z: number },
    neededItem: ItemType,
  ): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const [cbx, , cbz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);
    const searchRadius = 15; // block radius

    let bestDSq = Infinity;
    let best: [number, number, number] | null = null;

    for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += 2) {
        const bx = cbx + dx;
        const bz = cbz + dz;
        const surfY = this.voxelWorld.getHeight(bx, bz);
        if (surfY <= 0) continue;

        // Check top block and a few below
        for (let dy = 0; dy >= -3; dy--) {
          const by = surfY + dy;
          if (by < 1) break;
          const block = this.voxelWorld.getBlock(bx, by, bz);
          if (block === Block.Air || block === Block.Water) continue;
          const props = BLOCK_PROPS[block];
          if (!props.mineable) continue;

          // Does this block yield the needed item?
          if (props.mineYield === neededItem) {
            const dsq = dx * dx + dz * dz;
            if (dsq < bestDSq) {
              bestDSq = dsq;
              best = [bx, by, bz];
            }
            break; // found at this column, stop going deeper
          }
        }
      }
    }
    return best;
  }

  // ── Babel Progressive Decay ─────────────────────────────────

  private applyBabelDecay(site: ConstructionSite, entities: number[]): void {
    const progress = site.progress;

    // 40-60%: Tiredness
    if (progress > 0.4) {
      const tirednessRate = 0.0003 * progress * progress;
      for (const id of entities) {
        const biochem = BiochemStore.get(id);
        if (biochem) {
          biochem.chemicals[ChemId.Energy] = Math.max(0,
            biochem.chemicals[ChemId.Energy] - tirednessRate);
        }
      }
      // Grumbling at 40-60%
      if (progress < 0.6 && Math.random() < 0.005) {
        const id = entities[Math.floor(Math.random() * entities.length)];
        const social = SocialStore.get(id);
        if (social) {
          social.speechEmoji = '😩';
          social.speechTimer = 30;
        }
      }
    }

    // 60-75%: Language confusion
    if (progress > 0.6 && !this.languageAssigned) {
      this.languageAssigned = true;
      for (const id of entities) {
        const social = SocialStore.get(id);
        if (social) {
          social.language = 1 + Math.floor(Math.random() * 4); // 1-4
          social.speechEmoji = '❓🗣️';
          social.speechTimer = 50;
        }
      }
    }

    // 60-75%: Social penalties between different languages
    if (progress > 0.6 && progress < 0.85) {
      if (Math.random() < 0.01) {
        const id = entities[Math.floor(Math.random() * entities.length)];
        const social = SocialStore.get(id);
        if (social && social.language > 0) {
          social.speechEmoji = ['❓', '😕', '🗣️', '😤'][Math.floor(Math.random() * 4)];
          social.speechTimer = 25;
        }
      }
    }

    // 75-85%: Fights between language groups
    if (progress > 0.75 && progress < 0.85) {
      for (const id of entities) {
        const biochem = BiochemStore.get(id);
        if (biochem && Math.random() < 0.005) {
          biochem.chemicals[ChemId.Pain] = clamp(biochem.chemicals[ChemId.Pain] + 0.05, 0, 1);
          biochem.chemicals[ChemId.Punishment] = clamp(biochem.chemicals[ChemId.Punishment] + 0.03, 0, 1);
        }
      }
    }

    // 85%+: Mass exodus
    if (progress > 0.85 && !this.exodusTriggered) {
      this.exodusTriggered = true;
      site.active = false; // stop construction

      for (const id of entities) {
        const biochem = BiochemStore.get(id);
        const social = SocialStore.get(id);
        const builder = getBuilder(id);

        if (biochem) {
          biochem.chemicals[ChemId.Punishment] = clamp(biochem.chemicals[ChemId.Punishment] + 0.8, 0, 1);
          biochem.chemicals[ChemId.Pain] = clamp(biochem.chemicals[ChemId.Pain] + 0.5, 0, 1);
        }
        if (social) {
          social.factionId = -1; // become wanderer
          social.speechEmoji = '😱';
          social.speechTimer = 60;
        }

        builder.scattered = true;
        builder.siteId = -1;
        builder.targetBlock = null;
      }
    }
  }

  /** Clean up builder states for dead entities. */
  cleanup(deadIds: number[]): void {
    for (const id of deadIds) {
      builderStates.delete(id);
    }
  }
}
