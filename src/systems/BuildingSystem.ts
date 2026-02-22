import * as THREE from 'three';
import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { SocialStore, Activity } from '../components/Social';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore, BuildingType, BUILDING_COSTS } from '../components/Building';
import { InventoryStore, countItem, removeItem, addItem, ItemType } from '../components/Inventory';
import { MotorStore } from '../components/Motor';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, randFloat, clamp } from '../utils/Math';
import type { ResourceGrid } from '../world/ResourceGrid';
import { terrainY } from '../world/Environment';
import type { VoxelRenderer } from '../buildings/VoxelRenderer';

const BUILD_RANGE_SQ = 3 * 3;
const BUILD_COOLDOWN = 300;

export class BuildingSystem extends System {
  readonly query = SocialStore.bit | GenomeStore.bit | TransformStore.bit;
  readonly priority = 65;

  scene: THREE.Scene | null = null;
  grid: ResourceGrid | null = null;
  voxelRenderer: VoxelRenderer | null = null;
  private buildTimers = new Map<number, number>();

  update(world: World, _dt: number): void {
    if (!this.scene) return;

    const creatures = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    // Building effects on nearby creatures
    for (const bid of buildings) {
      const building = BuildingStore.get(bid)!;
      const bt = TransformStore.get(bid)!;
      building.age++;

      // Slow decay
      building.health -= 0.00005;
      if (building.health <= 0) {
        // Remove from voxel renderer
        if (this.voxelRenderer) {
          this.voxelRenderer.removeBuilding(bt.x, bt.z);
        }
        const renderable = RenderableStore.get(bid);
        if (renderable?.object.parent) renderable.object.parent.remove(renderable.object);
        world.destroy(bid);
        continue;
      }

      // Apply effects to nearby creatures
      for (const cid of creatures) {
        const ct = TransformStore.get(cid)!;
        const dsq = distSq(bt.x, bt.z, ct.x, ct.z);
        if (dsq > 25) continue; // 5 unit radius

        const social = SocialStore.get(cid)!;
        const biochem = BiochemStore.get(cid);
        if (!biochem) continue;

        const sameFaction = social.factionId === building.factionId;

        switch (building.type) {
          case BuildingType.Shelter:
            if (sameFaction) {
              biochem.chemicals[ChemId.Energy] = clamp(
                biochem.chemicals[ChemId.Energy] + 0.0005, 0, 1);
            }
            break;
          case BuildingType.Monument:
            if (sameFaction) {
              biochem.chemicals[ChemId.Reward] = clamp(
                biochem.chemicals[ChemId.Reward] + 0.001, 0, 1);
            }
            break;
          case BuildingType.Wall:
            if (!sameFaction && dsq < 4) {
              const dx = ct.x - bt.x;
              const dz = ct.z - bt.z;
              const d = Math.sqrt(dsq) || 1;
              ct.x += (dx / d) * 0.02;
              ct.z += (dz / d) * 0.02;
            }
            break;
          case BuildingType.Tower:
            // Tower effect handled in SensorySystem (sight range bonus)
            break;
        }
      }

      // Farm: keep farmland alive around the building
      if (building.type === BuildingType.Farm && this.grid) {
        this.grid.setFarmland(bt.x, bt.z, 1);
      }
    }

    // Creature building behavior
    for (const cid of creatures) {
      const lifecycle = LifecycleStore.get(cid);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(cid)!;
      const { genome } = GenomeStore.get(cid)!;
      const biochem = BiochemStore.get(cid);
      const inv = InventoryStore.get(cid);
      const motor = MotorStore.get(cid);
      if (!biochem || !inv) continue;

      let timer = this.buildTimers.get(cid) ?? 0;
      if (timer > 0) {
        this.buildTimers.set(cid, timer - 1);
        continue;
      }

      // Build trigger: wantBuild from brain + has some creativity/energy
      if (genome.creativity < 0.15 || genome.buildAffinity < 0.1) continue;
      if (biochem.chemicals[ChemId.Energy] < 0.25) continue;
      if (!motor?.wantBuild && Math.random() > 0.05) continue;
      // 80% chance per tick when wanting to build (inventory cost is the real gate)
      if (Math.random() > 0.8) continue;

      const ct = TransformStore.get(cid)!;

      // Don't build too close to existing buildings
      let tooClose = false;
      for (const bid of buildings) {
        const bt2 = TransformStore.get(bid)!;
        if (distSq(ct.x, ct.z, bt2.x, bt2.z) < BUILD_RANGE_SQ) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Choose building type based on personality, situation, and available resources
      const type = this.chooseBuildingType(genome, biochem.chemicals, inv);
      if (type === null) continue;

      // Check resource cost
      const cost = BUILDING_COSTS[type];
      let canAfford = true;
      for (const [item, count] of cost.items) {
        if (countItem(inv, item) < count) {
          canAfford = false;
          break;
        }
      }

      // Fallback: allow building basic structures with raw social.resources
      if (!canAfford) {
        // Try basic types that can use old-style resources
        if (social.resources >= 3 && (type === BuildingType.Shelter || type === BuildingType.Wall)) {
          social.resources -= 3;
        } else {
          continue;
        }
      } else {
        for (const [item, count] of cost.items) {
          removeItem(inv, item, count);
        }
      }

      this.placeBuilding(world, type, ct.x + randFloat(-1, 1), ct.z + randFloat(-1, 1), social.factionId);
      social.activity = Activity.Building;
      social.speechEmoji = '🔨';
      social.speechTimer = 40;
      this.buildTimers.set(cid, BUILD_COOLDOWN);

      biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.2, 0, 1);
    }

    // Rebuild voxel meshes if dirty
    if (this.voxelRenderer) {
      this.voxelRenderer.rebuild();
    }
  }

  private chooseBuildingType(genome: any, chemicals: Float32Array, inv: any): BuildingType | null {
    // Priority: granary if hoarding, farm if gathering, workshop if creative, mine if near stone
    if (genome.hoardAffinity > 0.5 && genome.buildAffinity > 0.4) return BuildingType.Granary;
    if (genome.gatherAffinity > 0.5 && genome.creativity > 0.4) return BuildingType.Farm;
    if (genome.creativity > 0.6) return BuildingType.Workshop;
    if (genome.aggression > 0.5 && Math.random() < 0.4) return BuildingType.Wall;
    if (genome.loyalty > 0.5 && Math.random() < 0.3) return BuildingType.Monument;
    if (chemicals[ChemId.Hunger] > 0.3) return BuildingType.Farm;
    return BuildingType.Shelter;
  }

  placeBuilding(world: World, type: BuildingType, x: number, z: number, factionId: number): number {
    const id = world.spawn();
    const groundY = terrainY(x, z);

    // Create a simple invisible placeholder Object3D for the ECS
    const placeholder = new THREE.Object3D();
    placeholder.position.set(x, groundY, z);

    world.addComponent(id, TransformStore, { x, y: groundY, z, rotation: randFloat(0, Math.PI * 2) });
    world.addComponent(id, RenderableStore, { object: placeholder });
    world.addComponent(id, BuildingStore, { type, factionId, health: 1.0, age: 0, storage: 0, workerCount: 0 });

    // Register with voxel renderer
    if (this.voxelRenderer) {
      this.voxelRenderer.addBuilding(x, z, type, 0);
    }

    // Farm: set farmland on resource grid
    if (type === BuildingType.Farm && this.grid) {
      this.grid.setFarmland(x, z, 1);
    }

    return id;
  }
}
