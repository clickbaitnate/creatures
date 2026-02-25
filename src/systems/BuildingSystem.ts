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
import { InventoryStore, countItem, removeItem, ItemType } from '../components/Inventory';
import { MotorStore } from '../components/Motor';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, randFloat, clamp } from '../utils/Math';
import type { ResourceGrid } from '../world/ResourceGrid';
import { terrainY } from '../world/Environment';
import type { VoxelRenderer } from '../buildings/VoxelRenderer';
import type { ConstructionSystem } from './ConstructionSystem';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import {
  createHutBlueprint, createWatchtowerBlueprint, createFarmPlotBlueprint,
  createShrineBlueprint, createWallSegmentBlueprint, createStoragePitBlueprint,
  createCampfireBlueprint, createLonghouseBlueprint, createBridgeBlueprint,
  mutateBlueprint,
  type ConstructionSite,
} from '../voxel/Blueprint';
import { ExpressionStore } from '../components/Expression';
import { ZealotryStore } from '../components/Zealotry';
import { VocabularyStore, learn } from '../components/Vocabulary';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';

const BUILD_RANGE_SQ = 2;
const BUILD_COOLDOWN = 300;
let nextSiteId = 1;

// Settlement layout radii (world units from faction center)
const INNER_RING = 3;   // shelters/longhouses cluster here
const WALL_RING = 7;    // defensive walls
const OUTER_RING = 10;  // farms outside walls
const CENTER_RING = 1.5; // campfires at center

// Max buildings per faction per type
const MAX_PER_TYPE: Partial<Record<BuildingType, number>> = {
  [BuildingType.Shelter]: 3,
  [BuildingType.Longhouse]: 2,
  [BuildingType.Wall]: 8,
  [BuildingType.Farm]: 3,
  [BuildingType.Tower]: 2,
  [BuildingType.Granary]: 1,
  [BuildingType.Monument]: 1,
  [BuildingType.Campfire]: 1,
  [BuildingType.Workshop]: 1,
};

// Faction build queue cooldown
const FACTION_BUILD_INTERVAL = 100;

const BTYPE_NAMES = ['Shelter','Wall','Monument','Farm','Mine','Workshop','Granary','Tower','Campfire','Longhouse'];

export class BuildingSystem extends System {
  readonly query = SocialStore.bit | GenomeStore.bit | TransformStore.bit;
  readonly priority = 65;

  scene: THREE.Scene | null = null;
  grid: ResourceGrid | null = null;
  voxelRenderer: VoxelRenderer | null = null;
  constructionSystem: ConstructionSystem | null = null;
  voxelWorld: VoxelWorld | null = null;
  private buildTimers = new Map<number, number>();

  // Cached per-frame: faction center positions and building counts
  public factionCenters = new Map<number, { x: number; z: number; count: number }>();
  public factionBuildingCounts = new Map<number, Map<BuildingType, number>>();

  // Cooperative faction build queue
  private factionBuildQueue = new Map<number, BuildingType[]>();
  private factionBuildCooldown = new Map<number, number>();

  // Housing ratio tracking (0 = all individual, 1 = all communal)
  private factionHousingRatio = new Map<number, number>();

  update(world: World, _dt: number): void {
    if (!this.scene) return;

    const creatures = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    // Compute faction centers from creature positions
    this.computeFactionCenters(creatures);

    // Count existing buildings per faction per type
    this.computeFactionBuildingCounts(buildings);

    // Update housing ratios
    this.computeHousingRatios();

    // Faction-level build decisions (every ~100 ticks per faction)
    this.updateFactionBuildQueues(creatures);

    // Building effects on nearby creatures
    for (const bid of buildings) {
      const building = BuildingStore.get(bid)!;
      const bt = TransformStore.get(bid)!;
      building.age++;

      // Slow decay
      building.health -= 0.00005;
      if (building.health <= 0) {
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
        if (dsq > 25) continue;

        const social = SocialStore.get(cid)!;
        const biochem = BiochemStore.get(cid);
        if (!biochem) continue;

        const sameFaction = social.factionId === building.factionId;

        switch (building.type) {
          case BuildingType.Shelter:
            if (sameFaction) {
              biochem.chemicals[ChemId.Energy] = clamp(
                biochem.chemicals[ChemId.Energy] + 0.00015, 0, 1);
            }
            break;
          case BuildingType.Longhouse:
            if (sameFaction) {
              // More energy recovery than shelter + social reward (communal)
              biochem.chemicals[ChemId.Energy] = clamp(
                biochem.chemicals[ChemId.Energy] + 0.0003, 0, 1);
              biochem.chemicals[ChemId.Reward] = clamp(
                biochem.chemicals[ChemId.Reward] + 0.0005, 0, 1);
            }
            break;
          case BuildingType.Monument:
            if (sameFaction) {
              biochem.chemicals[ChemId.Reward] = clamp(
                biochem.chemicals[ChemId.Reward] + 0.0015, 0, 1);
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
            // Sensory range boost handled by Tower existing (future: could extend SensorySystem range)
            break;
          case BuildingType.Campfire:
            // Comfort aura handled by CookingSystem
            break;
        }
      }

      if (building.type === BuildingType.Farm && this.grid) {
        this.grid.setFarmland(bt.x, bt.z, 1);
      }
    }

    // Creature building behavior — cooperative faction-based
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

      // Build trigger: check if faction has a queued project
      if (biochem.chemicals[ChemId.Energy] < 0.12) continue;

      const factionId = social.factionId;
      const queue = this.factionBuildQueue.get(factionId);
      if (!queue || queue.length === 0) continue;

      // Creatures volunteer to build based on motor desire or random chance
      if (!motor?.wantBuild && Math.random() > 0.4) continue;

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

      const center = this.factionCenters.get(factionId);
      if (!center || center.count < 1) continue;

      const type = queue[0]; // take from front of queue
      const counts = this.factionBuildingCounts.get(factionId) ?? new Map();

      // Check resource cost
      const cost = BUILDING_COSTS[type];
      let canAfford = true;
      for (const [item, count] of cost.items) {
        if (countItem(inv, item) < count) {
          canAfford = false;
          break;
        }
      }

      if (!canAfford) {
        if (social.resources >= 3 && (type === BuildingType.Shelter || type === BuildingType.Wall || type === BuildingType.Campfire)) {
          social.resources -= 3;
        } else {
          continue;
        }
      } else {
        for (const [item, count] of cost.items) {
          removeItem(inv, item, count);
        }
      }

      // Compute organized placement position
      const pos = this.choosePlacement(type, center, counts, buildings);

      // Don't build on water
      if (this.voxelWorld && this.voxelWorld.isWaterAt(pos.x, pos.z)) continue;

      this.placeBuilding(world, type, pos.x, pos.z, factionId);

      // Only spawn construction site for complex structures — primitives pop up instantly
      if (this.constructionSystem && this.voxelWorld
        && type !== BuildingType.Campfire && type !== BuildingType.Shelter && type !== BuildingType.Longhouse) {
        this.spawnConstructionSite(cid, pos, type);
      }

      // Remove from queue (project initiated)
      queue.shift();

      social.activity = Activity.Building;
      const bVocab = VocabularyStore.get(cid);
      if (bVocab) {
        learn(bVocab, '🔨');
        social.speechEmoji = '🔨';
        social.speechTimer = 40;
      }
      this.buildTimers.set(cid, BUILD_COOLDOWN);

      biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.2, 0, 1);

      // Diary: build complete
      const bDiary = DiaryStore.get(cid);
      if (bDiary) addDiaryEntry(bDiary, 0, DiaryEventType.BuildComplete, {
        detail: BTYPE_NAMES[type] ?? 'structure',
      });
    }

    if (this.voxelRenderer) {
      this.voxelRenderer.rebuild();
    }
  }

  /** Get housing ratio for a faction (0 = all individual, 1 = all communal) */
  getHousingRatio(factionId: number): number {
    return this.factionHousingRatio.get(factionId) ?? 0;
  }

  /** Faction-level build decision loop */
  private updateFactionBuildQueues(creatures: number[]): void {
    for (const [factionId, center] of this.factionCenters) {
      if (center.count < 1) continue;

      // Cooldown per faction
      let cd = this.factionBuildCooldown.get(factionId) ?? 0;
      cd--;
      if (cd > 0) {
        this.factionBuildCooldown.set(factionId, cd);
        continue;
      }

      // Only queue if current queue is empty
      const queue = this.factionBuildQueue.get(factionId);
      if (queue && queue.length > 0) continue;

      const counts = this.factionBuildingCounts.get(factionId) ?? new Map();
      const type = this.chooseBuildingType(counts, factionId, center.count, creatures);
      if (type !== null) {
        this.factionBuildQueue.set(factionId, [type]);
      }
      this.factionBuildCooldown.set(factionId, FACTION_BUILD_INTERVAL);
    }
  }

  /** Compute average position of each faction's members */
  private computeFactionCenters(creatures: number[]): void {
    this.factionCenters.clear();
    const sums = new Map<number, { sx: number; sz: number; n: number }>();

    for (const cid of creatures) {
      const social = SocialStore.get(cid);
      const ct = TransformStore.get(cid);
      if (!social || !ct || social.factionId < 0) continue;

      const lifecycle = LifecycleStore.get(cid);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      let s = sums.get(social.factionId);
      if (!s) { s = { sx: 0, sz: 0, n: 0 }; sums.set(social.factionId, s); }
      s.sx += ct.x;
      s.sz += ct.z;
      s.n++;
    }

    for (const [fid, s] of sums) {
      this.factionCenters.set(fid, { x: s.sx / s.n, z: s.sz / s.n, count: s.n });
    }
  }

  /** Count buildings per faction per type */
  private computeFactionBuildingCounts(buildings: number[]): void {
    this.factionBuildingCounts.clear();

    for (const bid of buildings) {
      const building = BuildingStore.get(bid);
      if (!building) continue;

      let counts = this.factionBuildingCounts.get(building.factionId);
      if (!counts) { counts = new Map(); this.factionBuildingCounts.set(building.factionId, counts); }
      counts.set(building.type, (counts.get(building.type) ?? 0) + 1);
    }
  }

  /** Compute housing ratio per faction: Shelter=individual, Longhouse=communal */
  private computeHousingRatios(): void {
    this.factionHousingRatio.clear();
    for (const [factionId, counts] of this.factionBuildingCounts) {
      const shelters = counts.get(BuildingType.Shelter) ?? 0;
      const longhouses = counts.get(BuildingType.Longhouse) ?? 0;
      const total = shelters + longhouses;
      if (total === 0) {
        this.factionHousingRatio.set(factionId, 0);
      } else {
        this.factionHousingRatio.set(factionId, longhouses / total);
      }
    }
  }

  /** Building progression with Campfire first, genome-based housing choice */
  private chooseBuildingType(
    counts: Map<BuildingType, number>,
    factionId: number,
    memberCount: number,
    creatures: number[],
  ): BuildingType | null {
    const campfires = counts.get(BuildingType.Campfire) ?? 0;
    const shelters = counts.get(BuildingType.Shelter) ?? 0;
    const longhouses = counts.get(BuildingType.Longhouse) ?? 0;
    const walls = counts.get(BuildingType.Wall) ?? 0;
    const farms = counts.get(BuildingType.Farm) ?? 0;
    const towers = counts.get(BuildingType.Tower) ?? 0;
    const granaries = counts.get(BuildingType.Granary) ?? 0;
    const monuments = counts.get(BuildingType.Monument) ?? 0;
    const totalHousing = shelters + longhouses;

    // Stage 1: Campfire FIRST (one per faction, creates zone center)
    if (campfires < 1) return BuildingType.Campfire;
    // Stage 2: First teepee
    if (totalHousing < 1) return BuildingType.Shelter;
    // Stage 3: Second teepee
    if (totalHousing < 2) return BuildingType.Shelter;
    // Stage 4: Defensive walls (first pair)
    if (walls < 2) return BuildingType.Wall;
    // Stage 5: Farm
    if (farms < 1) return BuildingType.Farm;
    // Stage 6: Third teepee OR first longhouse (genome choice)
    if (totalHousing < 3) {
      return this.chooseHousingType(factionId, creatures);
    }
    // Stage 7: More walls
    if (walls < 4) return BuildingType.Wall;
    // Stage 8: Watchtower
    if (towers < 1) return BuildingType.Tower;
    // Stage 9: Workshop (unlocks metalworking)
    const workshops = counts.get(BuildingType.Workshop) ?? 0;
    if (workshops < 1) return BuildingType.Workshop;
    // Stage 10: Granary
    if (granaries < 1) return BuildingType.Granary;
    // Stage 10: Complete the wall ring
    if (walls < 8) return BuildingType.Wall;
    // Stage 11: More farms, housing, tower, monument
    if (farms < (MAX_PER_TYPE[BuildingType.Farm] ?? 3)) return BuildingType.Farm;
    if (totalHousing < 4) return this.chooseHousingType(factionId, creatures);
    if (towers < (MAX_PER_TYPE[BuildingType.Tower] ?? 2)) return BuildingType.Tower;
    if (monuments < 1) return BuildingType.Monument;

    return null;
  }

  /** Choose Shelter or Longhouse based on faction genome averages */
  private chooseHousingType(factionId: number, creatures: number[]): BuildingType {
    let sociability = 0, monogamy = 0, count = 0;
    for (const cid of creatures) {
      const social = SocialStore.get(cid);
      if (!social || social.factionId !== factionId) continue;
      const lc = LifecycleStore.get(cid);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const gen = GenomeStore.get(cid);
      if (!gen) continue;
      sociability += gen.genome.sociability;
      monogamy += gen.genome.monogamy;
      count++;
    }
    if (count === 0) return BuildingType.Shelter;
    sociability /= count;
    monogamy /= count;
    // Communal: high sociability + low monogamy → Longhouse
    if (sociability > 0.5 && monogamy < 0.6) return BuildingType.Longhouse;
    return BuildingType.Shelter;
  }

  /** Compute placement position based on building type and settlement layout */
  private choosePlacement(
    type: BuildingType,
    center: { x: number; z: number },
    counts: Map<BuildingType, number>,
    buildings: number[],
  ): { x: number; z: number } {
    const existing = counts.get(type) ?? 0;

    switch (type) {
      case BuildingType.Campfire: {
        // Central — near faction center, enforcing min distance from foreign campfires
        let px = center.x;
        let pz = center.z;

        // Gather all existing campfire positions from other factions
        const foreignCampfires: { x: number; z: number }[] = [];
        for (const bid of buildings) {
          const b = BuildingStore.get(bid);
          const bt = TransformStore.get(bid);
          if (b && bt && b.type === BuildingType.Campfire) {
            foreignCampfires.push({ x: bt.x, z: bt.z });
          }
        }

        // Push outward if too close to any existing campfire (min 20 units)
        const MIN_CAMPFIRE_DIST = 20;
        for (let attempt = 0; attempt < 5; attempt++) {
          let tooClose = false;
          for (const fc of foreignCampfires) {
            const dx = px - fc.x;
            const dz = pz - fc.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < MIN_CAMPFIRE_DIST && d > 0.1) {
              // Push outward along vector away from foreign campfire
              const push = (MIN_CAMPFIRE_DIST - d) + 2;
              px += (dx / d) * push;
              pz += (dz / d) * push;
              tooClose = true;
            }
          }
          if (!tooClose) break;
        }

        return { x: px, z: pz };
      }

      case BuildingType.Shelter: {
        const totalShelters = existing;
        const angle = (totalShelters / 4) * Math.PI * 2 + randFloat(-0.3, 0.3);
        const r = INNER_RING + randFloat(-0.5, 0.5);
        return {
          x: center.x + Math.cos(angle) * r,
          z: center.z + Math.sin(angle) * r,
        };
      }

      case BuildingType.Longhouse: {
        // Inner ring, spread around center
        const angle = (existing / 3) * Math.PI * 2 + Math.PI / 4 + randFloat(-0.2, 0.2);
        const r = INNER_RING + randFloat(0, 1);
        return {
          x: center.x + Math.cos(angle) * r,
          z: center.z + Math.sin(angle) * r,
        };
      }

      case BuildingType.Wall: {
        const angle = (existing / 8) * Math.PI * 2;
        const r = WALL_RING + randFloat(-0.3, 0.3);
        return {
          x: center.x + Math.cos(angle) * r,
          z: center.z + Math.sin(angle) * r,
        };
      }

      case BuildingType.Tower: {
        const towerAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        const angle = towerAngles[existing % towerAngles.length];
        return {
          x: center.x + Math.cos(angle) * WALL_RING,
          z: center.z + Math.sin(angle) * WALL_RING,
        };
      }

      case BuildingType.Farm: {
        const angle = (existing / 3) * Math.PI * 2 + Math.PI / 6;
        const r = OUTER_RING + randFloat(-0.5, 0.5);
        return {
          x: center.x + Math.cos(angle) * r,
          z: center.z + Math.sin(angle) * r,
        };
      }

      case BuildingType.Granary:
      case BuildingType.Monument: {
        return {
          x: center.x + randFloat(-1.5, 1.5),
          z: center.z + randFloat(-1.5, 1.5),
        };
      }

      default: {
        return {
          x: center.x + randFloat(-INNER_RING, INNER_RING),
          z: center.z + randFloat(-INNER_RING, INNER_RING),
        };
      }
    }
  }

  /** Spawn a voxel construction site at a specific position */
  private spawnConstructionSite(
    creatureId: number,
    pos: { x: number; z: number },
    buildingType: BuildingType,
  ): void {
    if (!this.voxelWorld || !this.constructionSystem) return;

    let bp;
    const zealotry = ZealotryStore.get(creatureId);

    switch (buildingType) {
      case BuildingType.Shelter: bp = createHutBlueprint(); break;
      case BuildingType.Wall: bp = createWallSegmentBlueprint(); break;
      case BuildingType.Tower: bp = createWatchtowerBlueprint(); break;
      case BuildingType.Farm: bp = createFarmPlotBlueprint(); break;
      case BuildingType.Monument:
        bp = (zealotry && zealotry.zealotry > 0.5) ? createShrineBlueprint() : createStoragePitBlueprint();
        break;
      case BuildingType.Granary: bp = createStoragePitBlueprint(); break;
      case BuildingType.Campfire: bp = createCampfireBlueprint(); break;
      case BuildingType.Longhouse: bp = createLonghouseBlueprint(); break;
      default: bp = createHutBlueprint(); break;
    }

    // Apply evolutionary mutation from genome
    const genome = GenomeStore.get(creatureId)?.genome;
    if (genome) {
      bp = mutateBlueprint(bp, genome.buildingMutationRate, genome.buildingMaterialPref);
    }

    // Place at the computed settlement position (not random offset)
    const [bx, , bz] = this.voxelWorld.worldToBlock(pos.x, 0, pos.z);
    const surfY = this.voxelWorld.getHeight(bx, bz);

    const social = SocialStore.get(creatureId);
    const site: ConstructionSite = {
      id: nextSiteId++,
      blueprint: bp,
      originX: bx - Math.floor(bp.width / 2),
      originY: surfY,
      originZ: bz - Math.floor(bp.depth / 2),
      placed: new Uint8Array(bp.width * bp.height * bp.depth),
      placedCount: 0,
      progress: 0,
      active: true,
      factionId: social?.factionId ?? -1,
    };

    this.constructionSystem.sites.push(site);
  }

  /** Create a bridge construction site across water */
  createBridgeSite(creatureId: number, startX: number, startZ: number, length: number = 7): void {
    if (!this.voxelWorld || !this.constructionSystem) return;
    
    const bp = createBridgeBlueprint(length);
    const [bx, , bz] = this.voxelWorld.worldToBlock(startX, 0, startZ);
    const surfY = this.voxelWorld.getHeight(bx, bz);
    
    const social = SocialStore.get(creatureId);
    const site: ConstructionSite = {
      id: nextSiteId++,
      blueprint: bp,
      originX: bx - Math.floor(bp.width / 2),
      originY: surfY,
      originZ: bz - Math.floor(bp.depth / 2),
      placed: new Uint8Array(bp.width * bp.height * bp.depth),
      placedCount: 0,
      progress: 0,
      active: true,
      factionId: social?.factionId ?? -1,
    };
    
    this.constructionSystem.sites.push(site);
  }

  placeBuilding(world: World, type: BuildingType, x: number, z: number, factionId: number): number {
    const id = world.spawn();
    const groundY = terrainY(x, z);

    const placeholder = new THREE.Object3D();
    placeholder.position.set(x, groundY, z);

    // Set capacity based on type
    let capacity = 0;
    if (type === BuildingType.Shelter) capacity = 2;
    else if (type === BuildingType.Longhouse) capacity = 6;

    world.addComponent(id, TransformStore, { x, y: groundY, z, rotation: randFloat(0, Math.PI * 2) });
    world.addComponent(id, RenderableStore, { object: placeholder });
    world.addComponent(id, BuildingStore, {
      type, factionId, health: 1.0, age: 0, storage: 0, workerCount: 0,
      capacity, occupants: 0, cookingQueue: 0,
    });

    if (this.voxelRenderer) {
      this.voxelRenderer.addBuilding(x, z, type, 0);
    }

    if (type === BuildingType.Farm && this.grid) {
      this.grid.setFarmland(x, z, 1);
    }

    return id;
  }
}
