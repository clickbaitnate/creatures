// Deserializer: reconstructs game state from a SaveData object

import type { SaveData, SerializedBrain } from './SaveFormat';
import { base64ToUint8 } from './Compression';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { BrainStore } from '../components/Brain';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { MotorStore, createMotor } from '../components/Motor';
import { SensesStore, createSenses } from '../components/Senses';
import { LifecycleStore } from '../components/Lifecycle';
import { SocialStore } from '../components/Social';
import { InventoryStore } from '../components/Inventory';
import { MatingStore } from '../components/Mating';
import { ExpressionStore, createExpression } from '../components/Expression';
import { GoalStore, createGoal } from '../components/Goal';
import { ZealotryStore, createZealotry } from '../components/Zealotry';
import { MemoryStore, createMemory } from '../components/Memory';
import { VocabularyStore, createVocabulary } from '../components/Vocabulary';
import { CombatStore, createCombat } from '../components/Combat';
import { DiaryStore, createDiary } from '../components/Diary';
import { EggStore } from '../components/Egg';
import { BuildingStore } from '../components/Building';
import { resetEntityId } from '../ecs/Entity';
import type { FactionManager } from '../world/FactionSystem';
import type { TerritorySystem } from '../world/TerritorySystem';
import type { PoliticsSystem } from '../world/PoliticsSystem';
import type { CritterManager } from '../world/PreyCritters';
import type { MonsterManager } from '../world/MonsterManager';
import type { SephirothSystem } from '../world/Sephiroth';
import type { SeasonState } from '../world/Seasons';
import type { ZodiacCycle } from '../world/Zodiac';
import type { BrainState } from '../brain/CTRNN';
import { createSephirothMetrics } from '../world/Sephiroth';

export interface DeserializerTarget {
  voxelWorld: VoxelWorld;
  world: World;
  factionManager: FactionManager;
  territorySystem: TerritorySystem;
  politicsSystem: PoliticsSystem;
  critterManager: CritterManager;
  monsterManager: MonsterManager;
  sephirothSystem: SephirothSystem;
  seasonState: SeasonState;
  dayNight: { timeOfDay: number; dayCount: number; isNight: boolean; lightLevel: number; sunAngle: number };
  zodiac: ZodiacCycle;
  marketSystem: any;
  resourceGrid?: any;
  raidSystem?: any;
  dialecticSystem?: any;
  marketPanel?: any;
}

export interface DeserializeResult {
  generation: number;
  nextNameSeed: number;
  camera: { x: number; z: number; zoom: number; angle: number };
  /** Entity IDs that need meshes built (creatures) */
  creatureIds: number[];
  /** Entity IDs that are buildings */
  buildingIds: number[];
}

export function deserializeGame(save: SaveData, target: DeserializerTarget): DeserializeResult {
  const { voxelWorld, world, factionManager, territorySystem, politicsSystem,
    critterManager, monsterManager, sephirothSystem, seasonState, dayNight,
    zodiac, marketSystem } = target;

  // Reset entity ID counter
  resetEntityId(save.nextEntityId);

  // Restore voxel world
  voxelWorld.initSeedOffsets(save.seed);
  for (let i = 0; i < save.chunks.length; i++) {
    const blockData = base64ToUint8(save.chunks[i]);
    voxelWorld.chunks[i].blocks.set(blockData);
    voxelWorld.chunks[i].dirty = true;
  }

  // Restore time state
  seasonState.tick = save.seasonTick;
  // Recompute season from tick
  const SEASON_LENGTH = 1000;
  const CYCLE_LENGTH = 4000;
  const cyclePos = seasonState.tick % CYCLE_LENGTH;
  seasonState.season = Math.floor(cyclePos / SEASON_LENGTH) as any;

  dayNight.timeOfDay = save.dayNight.timeOfDay;
  dayNight.dayCount = save.dayNight.dayCount;
  dayNight.isNight = dayNight.timeOfDay < 0.25 || dayNight.timeOfDay > 0.75;
  dayNight.lightLevel = dayNight.isNight ? 0.15 : 1.0;

  zodiac.tick = save.zodiacTick;

  // Restore entities
  const creatureIds: number[] = [];
  const buildingIds: number[] = [];

  for (const se of save.entities) {
    // Register entity in ECS world with its original ID
    (world as any).masks.set(se.id, 0);

    if (se.transform) {
      world.addComponent(se.id, TransformStore, { ...se.transform });
    }

    if (se.brain) {
      const brain = deserializeBrain(se.brain);
      world.addComponent(se.id, BrainStore, { brain });
    }

    if (se.genome) {
      world.addComponent(se.id, GenomeStore, { genome: se.genome });
    }

    if (se.biochem) {
      world.addComponent(se.id, BiochemStore, { chemicals: new Float32Array(se.biochem) });
    }

    if (se.motor) {
      const motor = createMotor();
      Object.assign(motor, se.motor);
      // v3→v4 migration: ensure wantCook exists
      if (motor.wantCook === undefined) motor.wantCook = false;
      world.addComponent(se.id, MotorStore, motor);
    }

    if (se.senses) {
      world.addComponent(se.id, SensesStore, createSenses());
    }

    if (se.lifecycle) {
      world.addComponent(se.id, LifecycleStore, { ...se.lifecycle });
    }

    if (se.social) {
      world.addComponent(se.id, SocialStore, { ...se.social });
    }

    if (se.inventory) {
      world.addComponent(se.id, InventoryStore, {
        slots: se.inventory.slots.map((sl: any) => ({ item: sl.item, count: sl.count })),
        equippedTool: se.inventory.equippedTool,
        gatherTarget: se.inventory.gatherTarget ?? -1,
        gatherProgress: se.inventory.gatherProgress ?? 0,
      });
    }

    if (se.mating) {
      world.addComponent(se.id, MatingStore, { ...se.mating });
    }

    if (se.expression) {
      const expr = createExpression();
      Object.assign(expr, se.expression);
      world.addComponent(se.id, ExpressionStore, expr);
    }

    if (se.goal) {
      const goal = createGoal();
      Object.assign(goal, se.goal);
      world.addComponent(se.id, GoalStore, goal);
    }

    if (se.zealotry) {
      const z = createZealotry();
      Object.assign(z, se.zealotry);
      world.addComponent(se.id, ZealotryStore, z);
    }

    if (se.memory) {
      const mem = createMemory();
      mem.entries = se.memory.entries.map((e: any) => ({ ...e }));
      mem.nextSlot = se.memory.nextSlot;
      world.addComponent(se.id, MemoryStore, mem);
    }

    if (se.vocabulary) {
      const v = createVocabulary();
      v.known = new Set(se.vocabulary.known);
      v.recent = [...se.vocabulary.recent];
      world.addComponent(se.id, VocabularyStore, v);
    }

    // Combat net: load saved weights or initialize random for v2 saves
    if (se.combat) {
      world.addComponent(se.id, CombatStore, createCombat(
        se.combat.weightsIH, se.combat.biasH,
        se.combat.weightsHO, se.combat.biasO,
      ));
    } else if (se.genome && se.brain) {
      // v2 save: no combat data, initialize from genome or random
      const g = se.genome;
      world.addComponent(se.id, CombatStore, createCombat(
        g.combatWeightsIH, g.combatBiasH,
        g.combatWeightsHO, g.combatBiasO,
      ));
    }

    // Diary: restore from save or create empty for old saves
    if (se.diary) {
      const d = createDiary();
      d.entries = se.diary.entries.map((e: any) => ({ ...e }));
      d.nextSlot = se.diary.nextSlot;
      d.totalEvents = se.diary.totalEvents;
      d.killCount = se.diary.killCount;
      d.tradeCount = se.diary.tradeCount;
      d.offspringCount = se.diary.offspringCount;
      d.gatherCount = se.diary.gatherCount;
      world.addComponent(se.id, DiaryStore, d);
    } else if (se.genome && se.brain) {
      // v3 save without diary: create empty diary gracefully
      world.addComponent(se.id, DiaryStore, createDiary());
    }

    if (se.egg) {
      world.addComponent(se.id, EggStore, {
        genome: se.egg.genome,
        hatchTimer: se.egg.hatchTimer,
        parentFaction: se.egg.parentFaction,
      });
    }

    if (se.building) {
      // v3→v4 migration: default new BuildingData fields
      const bd = {
        ...se.building,
        capacity: se.building.capacity ?? 0,
        occupants: se.building.occupants ?? 0,
        cookingQueue: se.building.cookingQueue ?? 0,
      };
      world.addComponent(se.id, BuildingStore, bd);
      buildingIds.push(se.id);
    }

    // Track creatures (have genome + brain = living creature)
    if (se.genome && se.brain) {
      creatureIds.push(se.id);
    }
  }

  // Restore factions
  const fm = factionManager as any;
  fm.factions = [];
  fm.nextId = 0;
  if (fm.entityFaction) fm.entityFaction.clear();
  if (fm.socialBonds) fm.socialBonds.clear();

  for (const sf of save.factions) {
    const faction = {
      id: sf.id,
      name: sf.name,
      emoji: sf.emoji,
      memberIds: new Set(sf.memberIds),
      color: sf.color,
      relations: new Map(sf.relations),
      avgMonogamy: sf.avgMonogamy,
      breedingNorm: sf.breedingNorm,
      doctrine: sf.doctrine,
      philosophy: sf.philosophy,
      foundedTick: sf.foundedTick,
      settlementX: sf.settlementX ?? 0,
      settlementZ: sf.settlementZ ?? 0,
      settlementTier: sf.settlementTier ?? '',
      buildingCount: sf.buildingCount ?? 0,
    };
    fm.factions.push(faction);
    if (sf.id >= fm.nextId) fm.nextId = sf.id + 1;
  }

  for (const [eid, fid] of save.entityFaction) {
    if (fm.entityFaction) fm.entityFaction.set(eid, fid);
  }

  for (const bond of save.socialBonds) {
    const key = bond.a < bond.b ? `${bond.a}:${bond.b}` : `${bond.b}:${bond.a}`;
    if (fm.socialBonds) {
      fm.socialBonds.set(key, {
        entityA: bond.a, entityB: bond.b,
        strength: bond.strength, interactions: bond.interactions,
      });
    }
  }

  // Restore territory
  const ts = territorySystem as any;
  if (save.territory) {
    ts.owner.set(save.territory.owner);
    ts.contested.set(save.territory.contested);
  }

  // Restore politics
  const ps = politicsSystem as any;
  if (save.politics) {
    ps.tickCounter = save.politics.tickCounter;
    ps.globalTick = save.politics.globalTick;
    if (ps.nationData) ps.nationData.clear();
    for (const [fid, sn] of save.politics.nations) {
      if (ps.nationData) {
        ps.nationData.set(fid, {
          territory: sn.territory,
          capital: sn.capital,
          government: sn.government,
          laws: { ...sn.laws },
          warTargets: new Set(sn.warTargets),
          allies: new Set(sn.allies),
          vassals: new Set(sn.vassals),
          overlord: sn.overlord,
          warStartTick: new Map(sn.warStartTick),
          warExhaustion: sn.warExhaustion,
          embassies: new Set(sn.embassies),
        });
      }
    }
  }

  // Restore critters (v1 saves may have shorter arrays — set() handles naturally)
  const cm = critterManager as any;
  cm.count = Math.min(save.critters.count, cm.x.length);
  cm.x.fill(0); cm.z.fill(0); cm.type.fill(0); cm.alive.fill(0); cm.heading.fill(0);
  cm.x.set(save.critters.x.slice(0, cm.x.length));
  cm.z.set(save.critters.z.slice(0, cm.z.length));
  cm.type.set(save.critters.type.slice(0, cm.type.length));
  cm.alive.set(save.critters.alive.slice(0, cm.alive.length));
  cm.heading.set(save.critters.heading.slice(0, cm.heading.length));
  cm.breedTimer = save.critters.breedTimer;

  // Restore monsters
  const mmgr = monsterManager as any;
  mmgr.count = save.monsters.count;
  mmgr.type.set(save.monsters.type);
  mmgr.x.set(save.monsters.x);
  mmgr.z.set(save.monsters.z);
  mmgr.y.set(save.monsters.y);
  mmgr.vx.set(save.monsters.vx);
  mmgr.vz.set(save.monsters.vz);
  mmgr.health.set(save.monsters.health);
  mmgr.maxHealth.set(save.monsters.maxHealth);
  mmgr.targetCreature.set(save.monsters.targetCreature);
  mmgr.alive.set(save.monsters.alive);
  mmgr.attackCooldown.set(save.monsters.attackCooldown);
  mmgr.deathCounter = save.monsters.deathCounter;
  mmgr.spawnTimer = save.monsters.spawnTimer;

  // Restore market
  (marketSystem as any).totalTrades = save.market.totalTrades;

  // Restore sephiroth
  const ss = sephirothSystem as any;
  ss.metrics.clear();
  for (const [fid, data] of save.sephiroth) {
    const m = createSephirothMetrics();
    m.values.set(data.values);
    m.lastUpdate = data.lastUpdate;
    ss.metrics.set(fid, m);
  }

  // v5: Restore pillar states (backward-compatible)
  if (save.pillarStates && ss.pillars) {
    Object.assign(ss.pillars.jachin, save.pillarStates.jachin);
    Object.assign(ss.pillars.boaz, save.pillarStates.boaz);
    ss.pillars.balance = save.pillarStates.balance ?? 0;
    ss.pillars.pulseHistory = save.pillarStates.pulseHistory ?? [];
  }

  // v5: Restore raids
  if (save.raids && target.raidSystem) {
    const rs = target.raidSystem as any;
    rs.raids = [];
    for (const sr of save.raids) {
      rs.raids.push({
        ...sr,
        loot: new Map(sr.loot ?? []),
      });
    }
    rs.nextRaidId = Math.max(0, ...rs.raids.map((r: any) => r.id + 1));
  }

  // v5: Restore dialectic states
  if (save.dialecticStates && target.dialecticSystem) {
    const ds = target.dialecticSystem as any;
    ds.states.clear();
    for (const [fid, state] of save.dialecticStates) {
      ds.states.set(fid, { ...state });
    }
  }

  // v5: Restore market ledger
  if (save.marketLedger && target.marketPanel) {
    const mp = target.marketPanel as any;
    mp.tradeRecords = save.marketLedger.trades ?? [];
  }

  // v4→v5 migration: ensure wantRevolt exists on motors
  for (const id of creatureIds) {
    const motor = MotorStore.get(id);
    if (motor && (motor as any).wantRevolt === undefined) {
      (motor as any).wantRevolt = false;
      (motor as any).raidTargetX = 0;
      (motor as any).raidTargetZ = 0;
    }
  }

  return {
    generation: save.generation,
    nextNameSeed: save.nextNameSeed,
    camera: save.camera,
    creatureIds,
    buildingIds,
  };
}

function deserializeBrain(sb: SerializedBrain): BrainState {
  return {
    states: new Float32Array(sb.states),
    outputs: new Float32Array(sb.outputs),
    biases: new Float32Array(sb.biases),
    taus: new Float32Array(sb.taus),
    inputs: new Float32Array(sb.states.length), // fresh zeroed
    connFrom: new Uint8Array(sb.connFrom),
    connTo: new Uint8Array(sb.connTo),
    connWeights: new Float32Array(sb.connWeights),
    connCount: sb.connCount,
  };
}
