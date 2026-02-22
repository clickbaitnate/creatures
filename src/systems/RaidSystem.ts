// Raid system: event-driven raids triggered by PoliticsSystem when factions are at war
// Raid lifecycle: Mustering → Marching → Raiding → Retreating

import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SocialStore, Activity } from '../components/Social';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, removeItem, addItem, hasSpace, countItem, ItemType, totalItems } from '../components/Inventory';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import { BiochemStore } from '../components/Biochemistry';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import type { FactionManager, Faction } from '../world/FactionSystem';
import type { PoliticsSystem, NationData } from '../world/PoliticsSystem';
import type { TerritorySystem } from '../world/TerritorySystem';
import { distSq, clamp } from '../utils/Math';

export const enum RaidPhase {
  Mustering = 0,
  Marching = 1,
  Raiding = 2,
  Retreating = 3,
}

export interface Raid {
  id: number;
  attackerFaction: number;
  defenderFaction: number;
  raiders: number[];
  targetX: number;
  targetZ: number;
  homeX: number;
  homeZ: number;
  phase: RaidPhase;
  phaseTick: number;
  loot: Map<number, number>; // ItemType → count
  casualties: number;
  resolved: boolean;
}

const MUSTER_DURATION = 100;
const RAID_DURATION = 150;
const RETREAT_DURATION = 100;
const RAID_RANGE_SQ = 5 * 5;
const STEAL_CHANCE = 0.6;
const COMBAT_CHANCE = 0.2;

// All stealable item types
const STEALABLE: ItemType[] = [
  ItemType.RawBerry, ItemType.RawGrass, ItemType.RawRoot, ItemType.RawWood,
  ItemType.RawStone, ItemType.RawOre, ItemType.RawMeat, ItemType.Plank,
  ItemType.CutStone, ItemType.MetalIngot, ItemType.Coal, ItemType.RawIron,
  ItemType.RawGold, ItemType.IronIngot, ItemType.GoldIngot, ItemType.FoodBundle,
  ItemType.CookedMeat, ItemType.CookedBerry, ItemType.CookedFish, ItemType.LargeMeat,
];

export class RaidSystem {
  raids: Raid[] = [];
  private nextRaidId = 0;

  factionManager: FactionManager | null = null;
  politicsSystem: PoliticsSystem | null = null;
  territory: TerritorySystem | null = null;

  // Callbacks for event recording
  onRaidStart: ((raid: Raid) => void) | null = null;
  onRaidEnd: ((raid: Raid, success: boolean) => void) | null = null;

  /** Called by PoliticsSystem to launch a new raid */
  launchRaid(
    attackerFaction: number,
    defenderFaction: number,
    world: World,
  ): Raid | null {
    if (!this.factionManager || !this.territory) return null;

    const attacker = this.factionManager.activeFactions.find(f => f.id === attackerFaction);
    const defender = this.factionManager.activeFactions.find(f => f.id === defenderFaction);
    if (!attacker || !defender) return null;

    // Find target: defender's settlement or capital
    let targetX = defender.settlementX || 0;
    let targetZ = defender.settlementZ || 0;

    // Select raiders: members with aggression > 0.4, up to ceil(memberCount * 0.3)
    const maxRaiders = Math.ceil(attacker.memberIds.size * 0.3);
    const raiders: number[] = [];

    for (const memberId of attacker.memberIds) {
      if (raiders.length >= maxRaiders) break;
      const lc = LifecycleStore.get(memberId);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const gen = GenomeStore.get(memberId);
      if (gen && gen.genome.aggression > 0.4) {
        raiders.push(memberId);
      }
    }

    if (raiders.length === 0) return null;

    const raid: Raid = {
      id: this.nextRaidId++,
      attackerFaction,
      defenderFaction,
      raiders,
      targetX,
      targetZ,
      homeX: attacker.settlementX || 0,
      homeZ: attacker.settlementZ || 0,
      phase: RaidPhase.Mustering,
      phaseTick: 0,
      loot: new Map(),
      casualties: 0,
      resolved: false,
    };

    this.raids.push(raid);
    this.onRaidStart?.(raid);

    // Mark raiders
    for (const rid of raiders) {
      const motor = MotorStore.get(rid);
      if (motor) {
        motor.raidTargetX = targetX;
        motor.raidTargetZ = targetZ;
      }
      const social = SocialStore.get(rid);
      if (social) social.activity = Activity.Raiding;
    }

    return raid;
  }

  tick(world: World, currentTick: number): void {
    for (const raid of this.raids) {
      if (raid.resolved) continue;
      raid.phaseTick++;

      switch (raid.phase) {
        case RaidPhase.Mustering:
          this.tickMustering(raid, world);
          break;
        case RaidPhase.Marching:
          this.tickMarching(raid, world);
          break;
        case RaidPhase.Raiding:
          this.tickRaiding(raid, world, currentTick);
          break;
        case RaidPhase.Retreating:
          this.tickRetreating(raid, world, currentTick);
          break;
      }
    }

    // Clean up resolved raids (keep last 20 for history)
    this.raids = this.raids.filter(r => !r.resolved || this.raids.indexOf(r) >= this.raids.length - 20);
  }

  private tickMustering(raid: Raid, world: World): void {
    // Remove dead raiders
    raid.raiders = raid.raiders.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    });

    if (raid.raiders.length === 0) {
      raid.resolved = true;
      return;
    }

    if (raid.phaseTick >= MUSTER_DURATION) {
      raid.phase = RaidPhase.Marching;
      raid.phaseTick = 0;

      // Set raid target on all raiders
      for (const rid of raid.raiders) {
        const motor = MotorStore.get(rid);
        if (motor) {
          motor.raidTargetX = raid.targetX;
          motor.raidTargetZ = raid.targetZ;
        }
      }
    }
  }

  private tickMarching(raid: Raid, world: World): void {
    // Remove dead raiders
    raid.raiders = raid.raiders.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    });

    if (raid.raiders.length === 0) {
      raid.resolved = true;
      return;
    }

    // Check if any raider is near the target
    let anyNear = false;
    for (const rid of raid.raiders) {
      const t = TransformStore.get(rid);
      if (!t) continue;
      const dsq = distSq(t.x, t.z, raid.targetX, raid.targetZ);
      if (dsq < RAID_RANGE_SQ * 4) {
        anyNear = true;
        break;
      }
    }

    // MotorSystem handles the movement via raidTargetX/Z — see InstinctSystem instinct 26
    // Transition when first raider arrives or after timeout
    if (anyNear || raid.phaseTick > 600) {
      raid.phase = RaidPhase.Raiding;
      raid.phaseTick = 0;
    }
  }

  private tickRaiding(raid: Raid, world: World, currentTick: number): void {
    // Remove dead raiders
    raid.raiders = raid.raiders.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    });

    if (raid.raiders.length === 0) {
      this.resolveRaid(raid, world, currentTick, false);
      return;
    }

    // Every 10 ticks during raiding, each raider near target attempts theft/combat
    if (raid.phaseTick % 10 === 0) {
      const defenders = this.getDefenders(raid.defenderFaction, raid.targetX, raid.targetZ, world);

      for (const rid of raid.raiders) {
        const t = TransformStore.get(rid);
        if (!t) continue;

        const dsq = distSq(t.x, t.z, raid.targetX, raid.targetZ);
        if (dsq > RAID_RANGE_SQ) continue;

        // Try stealing from nearest defender
        if (Math.random() < STEAL_CHANCE && defenders.length > 0) {
          const defId = defenders[Math.floor(Math.random() * defenders.length)];
          const defInv = InventoryStore.get(defId);
          const raiderInv = InventoryStore.get(rid);
          if (defInv && raiderInv && hasSpace(raiderInv)) {
            // Find an item to steal
            for (const itemType of STEALABLE) {
              if (countItem(defInv, itemType) > 0) {
                removeItem(defInv, itemType, 1);
                addItem(raiderInv, itemType, 1);
                raid.loot.set(itemType, (raid.loot.get(itemType) ?? 0) + 1);
                break;
              }
            }
          }
        }

        // Combat exchange
        if (Math.random() < COMBAT_CHANCE && defenders.length > 0) {
          const defId = defenders[Math.floor(Math.random() * defenders.length)];
          const defSocial = SocialStore.get(defId);
          const raiderSocial = SocialStore.get(rid);

          // Both take damage
          if (defSocial) defSocial.health = Math.max(0, defSocial.health - 0.2);
          if (raiderSocial) raiderSocial.health = Math.max(0, raiderSocial.health - 0.2);

          // Check for casualties
          if (raiderSocial && raiderSocial.health <= 0) {
            raid.casualties++;
          }

          // Defender fights back if aggressive
          const defGen = GenomeStore.get(defId);
          if (defGen && defGen.genome.aggression > 0.5 && defSocial) {
            defSocial.activity = Activity.Fighting;
          }
        }
      }
    }

    if (raid.phaseTick >= RAID_DURATION) {
      // Begin retreat
      raid.phase = RaidPhase.Retreating;
      raid.phaseTick = 0;

      // Set raiders to move home
      for (const rid of raid.raiders) {
        const motor = MotorStore.get(rid);
        if (motor) {
          motor.raidTargetX = raid.homeX;
          motor.raidTargetZ = raid.homeZ;
        }
      }
    }
  }

  private tickRetreating(raid: Raid, world: World, currentTick: number): void {
    raid.raiders = raid.raiders.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    });

    if (raid.phaseTick >= RETREAT_DURATION || raid.raiders.length === 0) {
      const success = raid.casualties < raid.raiders.length * 0.5;
      this.resolveRaid(raid, world, currentTick, success);
    }
  }

  private resolveRaid(raid: Raid, world: World, currentTick: number, success: boolean): void {
    raid.resolved = true;

    // Clear raid state from raiders
    for (const rid of raid.raiders) {
      const motor = MotorStore.get(rid);
      if (motor) {
        motor.raidTargetX = 0;
        motor.raidTargetZ = 0;
      }
      const social = SocialStore.get(rid);
      if (social && social.activity === Activity.Raiding) {
        social.activity = Activity.Idle;
      }

      // Diary: raider
      const diary = DiaryStore.get(rid);
      if (diary) {
        const defFaction = this.factionManager?.activeFactions.find(f => f.id === raid.defenderFaction);
        let lootStr = '';
        if (raid.loot.size > 0) {
          let total = 0;
          for (const c of raid.loot.values()) total += c;
          lootStr = `${total} items`;
        }
        addDiaryEntry(diary, currentTick, DiaryEventType.Raided, {
          factionName: defFaction?.name ?? '',
          detail: lootStr,
        });
      }
    }

    // Diary for defenders
    const defenders = this.getDefenderMembers(raid.defenderFaction);
    for (const defId of defenders) {
      const diary = DiaryStore.get(defId);
      if (diary) {
        const attFaction = this.factionManager?.activeFactions.find(f => f.id === raid.attackerFaction);
        addDiaryEntry(diary, currentTick, DiaryEventType.WasRaided, {
          factionName: attFaction?.name ?? '',
        });
      }
    }

    // Update politics based on outcome
    if (this.politicsSystem) {
      const ndA = this.politicsSystem.getNation(raid.attackerFaction);
      const ndB = this.politicsSystem.getNation(raid.defenderFaction);

      if (success) {
        // Successful: territory shifts toward attacker
        if (ndA) ndA.warExhaustion = clamp(ndA.warExhaustion + 0.1, 0, 1);
      } else {
        // Failed: war exhaustion for attacker
        if (ndA) ndA.warExhaustion = clamp(ndA.warExhaustion + 0.3, 0, 1);
      }
    }

    // Absorption check: if defender faction has <= 2 members, absorb
    if (this.factionManager) {
      const defender = this.factionManager.activeFactions.find(f => f.id === raid.defenderFaction);
      if (defender && defender.memberIds.size <= 2 && defender.memberIds.size > 0) {
        // Remaining members defect to attacker
        const membersToDefect = Array.from(defender.memberIds);
        for (const memberId of membersToDefect) {
          const social = SocialStore.get(memberId);
          if (social) {
            social.factionId = raid.attackerFaction;
            defender.memberIds.delete(memberId);
            const attacker = this.factionManager.activeFactions.find(f => f.id === raid.attackerFaction);
            if (attacker) attacker.memberIds.add(memberId);
          }
        }
      }
    }

    this.onRaidEnd?.(raid, success);
  }

  private getDefenders(factionId: number, x: number, z: number, world: World): number[] {
    const defenders: number[] = [];
    const creatures = world.query(SocialStore.bit | TransformStore.bit);
    for (const id of creatures) {
      const lc = LifecycleStore.get(id);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const social = SocialStore.get(id);
      if (!social || social.factionId !== factionId) continue;
      const t = TransformStore.get(id)!;
      if (distSq(t.x, t.z, x, z) < RAID_RANGE_SQ * 4) {
        defenders.push(id);
      }
    }
    return defenders;
  }

  private getDefenderMembers(factionId: number): number[] {
    if (!this.factionManager) return [];
    const faction = this.factionManager.activeFactions.find(f => f.id === factionId);
    if (!faction) return [];
    return Array.from(faction.memberIds).filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    });
  }

  /** Get active (unresolved) raids */
  get activeRaids(): Raid[] {
    return this.raids.filter(r => !r.resolved);
  }

  /** Get all raids for a specific faction (attacker or defender) */
  getRaidsForFaction(factionId: number): Raid[] {
    return this.raids.filter(r => r.attackerFaction === factionId || r.defenderFaction === factionId);
  }
}
