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
import type { MiningParticles } from '../creatures/MiningParticles';

const PLACE_COOLDOWN = 15;
const PLACE_RANGE_SQ = 1.0;  // Must be within ~1 world unit to place blocks
const MINE_RANGE_SQ = 0.36;  // Must be touching to mine (~0.6 world units)

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
  miningParticles: MiningParticles | null = null;

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

      // Find nearest active site if unassigned — prefer same-faction sites
      if (builder.siteId < 0) {
        const myFaction = social?.factionId ?? -1;
        let bestDSq = Infinity;
        let bestSite = -1;
        for (const site of this.sites) {
          if (!site.active || site.progress >= 1) continue;
          const [swx, , swz] = this.voxelWorld!.blockToWorld(
            site.originX + Math.floor(site.blueprint.width / 2),
            site.originY,
            site.originZ + Math.floor(site.blueprint.depth / 2),
          );
          let dsq = distSq(transform.x, transform.z, swx, swz);
          // Halve effective distance for same-faction sites
          if (site.factionId >= 0 && site.factionId === myFaction) dsq *= 0.5;
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

      // Cooperative reward: placing blocks near same-faction members → +Oxytocin
      if (social) {
        const myFaction = social.factionId;
        for (const otherId of entities) {
          if (otherId === id) continue;
          const otherSocial = SocialStore.get(otherId);
          if (!otherSocial || otherSocial.factionId !== myFaction) continue;
          const otherT = TransformStore.get(otherId);
          if (!otherT) continue;
          if (distSq(transform.x, transform.z, otherT.x, otherT.z) < 36) { // within 6 units
            biochem.chemicals[ChemId.Reward] = clamp(
              biochem.chemicals[ChemId.Reward] + 0.02, 0, 1);
            break; // one bonus per placement
          }
        }
      }

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
      }
      // Spawn break particles
      if (this.miningParticles) {
        const [pwx, pwy, pwz] = this.voxelWorld.blockToWorld(mbx, mby, mbz);
        this.miningParticles.spawnBreakParticles(pwx, pwy, pwz, props.color ?? 0x888888);
      }
      // Actually destroy the block - setBlock already marks chunks dirty
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
    const searchRadius = 2;  // Only adjacent blocks

    let bestDSq = Infinity;
    let best: [number, number, number] | null = null;

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dz = -searchRadius; dz <= searchRadius; dz++) {
        const bx = cbx + dx;
        const bz = cbz + dz;
        const surfY = this.voxelWorld.getHeight(bx, bz);
        if (surfY <= 0) continue;

        const dsq = dx * dx + dz * dz;
        if (dsq >= bestDSq) continue;

        // Water crossing check: even adjacent blocks can be across a 1-block water gap
        if (dsq > 0 && this.pathCrossesWater(cbx, cbz, bx, bz)) continue;

        for (let dy = 0; dy >= -3; dy--) {
          const by = surfY + dy;
          if (by < 1) break;
          const block = this.voxelWorld.getBlock(bx, by, bz);
          if (block === Block.Air || block === Block.Water) continue;
          const props = BLOCK_PROPS[block];
          if (!props.mineable) continue;

          if (props.mineYield === neededItem) {
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

  /** Check if path between two block coords crosses water */
  private pathCrossesWater(x0: number, z0: number, x1: number, z1: number): boolean {
    if (!this.voxelWorld) return false;
    const adx = Math.abs(x1 - x0);
    const adz = Math.abs(z1 - z0);
    const steps = Math.max(adx, adz, 1);
    for (let s = 0; s <= steps; s++) {
      const t = steps > 0 ? s / steps : 0;
      const mx = Math.round(x0 + (x1 - x0) * t);
      const mz = Math.round(z0 + (z1 - z0) * t);
      const h = this.voxelWorld.getHeight(mx, mz);
      if (this.voxelWorld.getBlock(mx, h, mz) === Block.Water) return true;
      if (this.voxelWorld.getBlock(mx, h + 1, mz) === Block.Water) return true;
      if (this.voxelWorld.getBlock(mx, h + 2, mz) === Block.Water) return true;
    }
    return false;
  }

  cleanup(deadIds: number[]): void {
    for (const id of deadIds) {
      builderStates.delete(id);
    }
  }
}
