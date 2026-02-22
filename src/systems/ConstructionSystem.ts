// ConstructionSystem: Creatures carry blocks to construction sites, place block-by-block.

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, addItem, removeItem, countItem, hasSpace, ItemType } from '../components/Inventory';
import { SocialStore, Activity } from '../components/Social';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp, distSq } from '../utils/Math';
import { VoxelWorld } from '../voxel/VoxelWorld';
import { Block, BLOCK_PROPS } from '../voxel/BlockTypes';
import { VocabularyStore, learn } from '../components/Vocabulary';
import {
  ConstructionSite, getNextUnplacedBlock, getRequiredItem, markPlaced,
} from '../voxel/Blueprint';

const PLACE_COOLDOWN = 15;
const PLACE_RANGE_SQ = 4.0;
const MINE_RANGE_SQ = 2.25;

interface BuilderState {
  siteId: number;
  targetBlock: { bx: number; by: number; bz: number; block: Block } | null;
  neededItem: ItemType;
  placeCooldown: number;
  mineTarget: [number, number, number] | null;
  mineProgress: number;
  mineTicks: number;
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

  update(world: World, _dt: number): void {
    if (!this.voxelWorld) return;
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const transform = TransformStore.get(id)!;
      const inv = InventoryStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const social = SocialStore.get(id);
      if (!biochem) continue;

      const builder = getBuilder(id);

      if (builder.placeCooldown > 0) {
        builder.placeCooldown--;
        continue;
      }

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

      if (!builder.targetBlock) {
        builder.targetBlock = getNextUnplacedBlock(site);
        if (!builder.targetBlock) {
          site.active = false;
          builder.siteId = -1;
          continue;
        }
        builder.neededItem = getRequiredItem(builder.targetBlock.block);
      }

      const needed = builder.neededItem;

      if (countItem(inv, needed) === 0) {
        this.doMining(id, builder, transform, inv, biochem, social);
        continue;
      }

      const [targetWX, , targetWZ] = this.voxelWorld!.blockToWorld(
        builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz
      );

      const dsq = distSq(transform.x, transform.z, targetWX, targetWZ);

      if (dsq > PLACE_RANGE_SQ) {
        const dx = targetWX - transform.x;
        const dz = targetWZ - transform.z;
        transform.rotation = Math.atan2(dx, dz);
        const motor = MotorStore.get(id);
        if (motor) {
          motor.forward = 1.0;
          motor.wantBuild = true;
        }
        if (social) social.activity = Activity.Walking;
        continue;
      }

      removeItem(inv, needed, 1);
      this.voxelWorld!.setBlock(
        builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz,
        builder.targetBlock.block,
      );
      markPlaced(site, builder.targetBlock.bx, builder.targetBlock.by, builder.targetBlock.bz);

      builder.placeCooldown = PLACE_COOLDOWN;
      builder.targetBlock = null;

      biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.1, 0, 1);
      if (social) {
        social.activity = Activity.Building;
        if (Math.random() < 0.2) {
          const cVocab = VocabularyStore.get(id);
          if (cVocab) {
            learn(cVocab, '🧱');
            social.speechEmoji = '🧱';
            social.speechTimer = 30;
          }
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

    if (!builder.mineTarget) {
      const target = this.findMineableBlock(transform, builder.neededItem);
      if (!target) return;
      builder.mineTarget = target;
      builder.mineProgress = 0;
      const block = this.voxelWorld.getBlock(target[0], target[1], target[2]);
      builder.mineTicks = BLOCK_PROPS[block].mineTicks || 20;
    }

    const [mbx, mby, mbz] = builder.mineTarget;
    const [mwx, , mwz] = this.voxelWorld.blockToWorld(mbx, mby, mbz);
    const dsq = distSq(transform.x, transform.z, mwx, mwz);

    if (dsq > MINE_RANGE_SQ) {
      const dx = mwx - transform.x;
      const dz = mwz - transform.z;
      transform.rotation = Math.atan2(dx, dz);
      const motor = MotorStore.get(id);
      if (motor) motor.forward = 1.0;
      if (social) social.activity = Activity.Walking;
      return;
    }

    builder.mineProgress++;
    if (social) social.activity = Activity.Gathering;

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
      const props = BLOCK_PROPS[block];
      if (props.mineYield !== null && hasSpace(inv)) {
        addItem(inv, props.mineYield);
      } else if (hasSpace(inv)) {
        addItem(inv, builder.neededItem);
      }
      this.voxelWorld.setBlock(mbx, mby, mbz, Block.Air);
      builder.mineTarget = null;
      builder.mineProgress = 0;

      biochem.chemicals[ChemId.Energy] = Math.max(0, biochem.chemicals[ChemId.Energy] - 0.01);

      if (social && Math.random() < 0.2) {
        const mVocab = VocabularyStore.get(id);
        if (mVocab) {
          learn(mVocab, '⛏️');
          social.speechEmoji = '⛏️';
          social.speechTimer = 25;
        }
      }
    }
  }

  private findMineableBlock(
    transform: { x: number; z: number },
    neededItem: ItemType,
  ): [number, number, number] | null {
    if (!this.voxelWorld) return null;

    const [cbx, , cbz] = this.voxelWorld.worldToBlock(transform.x, 0, transform.z);
    const searchRadius = 15;

    let bestDSq = Infinity;
    let best: [number, number, number] | null = null;

    for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += 2) {
        const bx = cbx + dx;
        const bz = cbz + dz;
        const surfY = this.voxelWorld.getHeight(bx, bz);
        if (surfY <= 0) continue;

        for (let dy = 0; dy >= -3; dy--) {
          const by = surfY + dy;
          if (by < 1) break;
          const block = this.voxelWorld.getBlock(bx, by, bz);
          if (block === Block.Air || block === Block.Water) continue;
          const props = BLOCK_PROPS[block];
          if (!props.mineable) continue;

          if (props.mineYield === neededItem) {
            const dsq = dx * dx + dz * dz;
            if (dsq < bestDSq) {
              bestDSq = dsq;
              best = [bx, by, bz];
            }
            break;
          }
        }
      }
    }
    return best;
  }

  cleanup(deadIds: number[]): void {
    for (const id of deadIds) {
      builderStates.delete(id);
    }
  }
}
