// Politics system: war/peace/alliance/vassalization/trade
// Runs every 200 ticks, evaluates inter-faction dynamics

import type { World } from '../ecs/World';
import { GenomeStore } from '../components/Genome';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import type { FactionManager, Faction } from './FactionSystem';
import type { TerritorySystem } from './TerritorySystem';
import { clamp } from '../utils/Math';

const POLITICS_INTERVAL = 200;

export const enum GovernmentType {
  Tribal = 0,
  Autocracy = 1,
  Democracy = 2,
  Theocracy = 3,
  Commune = 4,
  Horde = 5,
}

export const GOVERNMENT_NAMES = ['Tribal', 'Autocracy', 'Democracy', 'Theocracy', 'Commune', 'Horde'];

export interface NationLaws {
  granaryTaxRate: number;  // 0-0.1
  militaryDraft: boolean;
  buildBonus: number;      // 1.0-1.3
  tradeBonus: boolean;
}

export interface NationData {
  territory: number;
  capital: [number, number] | null;
  government: GovernmentType;
  laws: NationLaws;
  warTargets: Set<number>;
  allies: Set<number>;
  vassals: Set<number>;
  overlord: number; // -1 if none
  warStartTick: Map<number, number>; // factionId → tick when war started
  warExhaustion: number; // 0-1, grows with long wars
  embassies: Set<number>; // faction IDs with embassies
}

export class PoliticsSystem {
  private tickCounter = 0;
  private globalTick = 0;
  nationData = new Map<number, NationData>();

  factionManager: FactionManager | null = null;
  territory: TerritorySystem | null = null;

  tick(world: World): void {
    this.globalTick++;
    this.tickCounter++;
    if (this.tickCounter < POLITICS_INTERVAL) return;
    this.tickCounter = 0;
    if (!this.factionManager || !this.territory) return;

    const factions = this.factionManager.activeFactions;

    // Ensure all factions have nation data
    for (const faction of factions) {
      if (!this.nationData.has(faction.id)) {
        this.nationData.set(faction.id, {
          territory: 0,
          capital: null,
          government: GovernmentType.Tribal,
          laws: { granaryTaxRate: 0, militaryDraft: false, buildBonus: 1.0, tradeBonus: false },
          warTargets: new Set(),
          allies: new Set(),
          vassals: new Set(),
          overlord: -1,
          warStartTick: new Map(),
          warExhaustion: 0,
          embassies: new Set(),
        });
      }
    }

    // Update territory counts and capitals
    for (const faction of factions) {
      const nd = this.nationData.get(faction.id)!;
      nd.territory = this.territory.getTerritory(faction.id);
      nd.capital = this.territory.findCapital(world, faction.id);
    }

    // Compute government types and laws from member traits
    for (const faction of factions) {
      this.computeGovernment(faction, world);
      this.computeLaws(faction, world);
    }

    // Evaluate diplomacy between all faction pairs
    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        this.evaluateDiplomacy(factions[i], factions[j], world);
      }
    }
  }

  private getMemberAverages(faction: Faction, world: World): {
    aggression: number; sociability: number; loyalty: number;
    creativity: number; monogamy: number; huntAffinity: number;
    hoardAffinity: number; count: number;
  } {
    let aggression = 0, sociability = 0, loyalty = 0, creativity = 0;
    let monogamy = 0, huntAffinity = 0, hoardAffinity = 0;
    let count = 0;

    for (const memberId of faction.memberIds) {
      const lc = LifecycleStore.get(memberId);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const gen = GenomeStore.get(memberId);
      if (!gen) continue;
      const g = gen.genome;
      aggression += g.aggression;
      sociability += g.sociability;
      loyalty += g.loyalty;
      creativity += g.creativity;
      monogamy += g.monogamy;
      huntAffinity += g.huntAffinity;
      hoardAffinity += g.hoardAffinity;
      count++;
    }

    if (count === 0) return { aggression: 0, sociability: 0, loyalty: 0, creativity: 0, monogamy: 0, huntAffinity: 0, hoardAffinity: 0, count: 0 };

    return {
      aggression: aggression / count,
      sociability: sociability / count,
      loyalty: loyalty / count,
      creativity: creativity / count,
      monogamy: monogamy / count,
      huntAffinity: huntAffinity / count,
      hoardAffinity: hoardAffinity / count,
      count,
    };
  }

  private computeGovernment(faction: Faction, world: World): void {
    const nd = this.nationData.get(faction.id)!;
    const avg = this.getMemberAverages(faction, world);

    if (avg.count < 5) {
      nd.government = GovernmentType.Tribal;
    } else if (avg.aggression > 0.6) {
      nd.government = GovernmentType.Autocracy;
    } else if (avg.sociability > 0.6 && avg.aggression < 0.4) {
      nd.government = GovernmentType.Democracy;
    } else if (avg.loyalty > 0.7) {
      nd.government = GovernmentType.Theocracy;
    } else if (avg.monogamy > 0.6 && avg.sociability > 0.6) {
      nd.government = GovernmentType.Commune;
    } else if (avg.aggression > 0.5 && avg.huntAffinity > 0.5) {
      nd.government = GovernmentType.Horde;
    } else {
      nd.government = GovernmentType.Tribal;
    }
  }

  private computeLaws(faction: Faction, world: World): void {
    const nd = this.nationData.get(faction.id)!;
    const avg = this.getMemberAverages(faction, world);

    nd.laws.granaryTaxRate = avg.hoardAffinity > 0.6 ? 0.1 : 0;
    nd.laws.militaryDraft = avg.aggression > 0.5;
    nd.laws.buildBonus = avg.creativity > 0.6 ? 1.3 : 1.0;
    nd.laws.tradeBonus = avg.sociability > 0.6;
  }

  private evaluateDiplomacy(factionA: Faction, factionB: Faction, world: World): void {
    if (!this.factionManager || !this.territory) return;

    const ndA = this.nationData.get(factionA.id)!;
    const ndB = this.nationData.get(factionB.id)!;
    const relation = this.factionManager.getRelation(factionA.id, factionB.id);
    const avgA = this.getMemberAverages(factionA, world);
    const avgB = this.getMemberAverages(factionB, world);
    const contestedCells = this.territory.getContestedCells(factionA.id, factionB.id);

    // War declaration
    if (!ndA.warTargets.has(factionB.id) && !ndB.warTargets.has(factionA.id)) {
      if (relation < -0.5 && avgA.aggression > 0.4 && contestedCells > 2) {
        ndA.warTargets.add(factionB.id);
        ndB.warTargets.add(factionA.id);
        ndA.warStartTick.set(factionB.id, this.globalTick);
        ndB.warStartTick.set(factionA.id, this.globalTick);
        // Remove alliance if exists
        ndA.allies.delete(factionB.id);
        ndB.allies.delete(factionA.id);
        // Worsen relations
        this.factionManager.setRelation(factionA.id, factionB.id, clamp(relation - 0.2, -1, 1));
      }
    }

    // War exhaustion and peace
    if (ndA.warTargets.has(factionB.id)) {
      const warStart = ndA.warStartTick.get(factionB.id) ?? this.globalTick;
      const warDuration = this.globalTick - warStart;

      // War exhaustion grows over time
      if (warDuration > 3000) {
        ndA.warExhaustion = clamp(ndA.warExhaustion + 0.01, 0, 1);
        ndB.warExhaustion = clamp(ndB.warExhaustion + 0.01, 0, 1);
      }

      // Peace treaty: exhaustion, weak, or relations improved
      if (relation > -0.2 || ndA.territory < 3 || ndB.territory < 3 ||
          ndA.warExhaustion > 0.7 || ndB.warExhaustion > 0.7) {
        ndA.warTargets.delete(factionB.id);
        ndB.warTargets.delete(factionA.id);
        ndA.warStartTick.delete(factionB.id);
        ndB.warStartTick.delete(factionA.id);
        ndA.warExhaustion = Math.max(0, ndA.warExhaustion - 0.3);
        ndB.warExhaustion = Math.max(0, ndB.warExhaustion - 0.3);
        this.factionManager.setRelation(factionA.id, factionB.id, clamp(relation + 0.1, -1, 1));
      }
    }

    // Alliance formation
    if (relation > 0.6 && avgA.loyalty > 0.5 && avgB.loyalty > 0.5 &&
        !ndA.warTargets.has(factionB.id)) {
      // Check for shared enemy
      let sharedEnemy = false;
      for (const target of ndA.warTargets) {
        if (ndB.warTargets.has(target)) { sharedEnemy = true; break; }
      }
      if (sharedEnemy || relation > 0.7) {
        ndA.allies.add(factionB.id);
        ndB.allies.add(factionA.id);
      }
    }

    // Vassalization: large faction absorbs small one
    if (ndA.territory > ndB.territory * 3 && relation > 0.3 && avgB.count < 3 && avgB.count > 0) {
      ndA.vassals.add(factionB.id);
      ndB.overlord = factionA.id;
    }
  }

  /** Check if two factions are at war */
  isAtWar(factionA: number, factionB: number): boolean {
    const ndA = this.nationData.get(factionA);
    return ndA?.warTargets.has(factionB) ?? false;
  }

  /** Check if two factions are allied */
  isAllied(factionA: number, factionB: number): boolean {
    const ndA = this.nationData.get(factionA);
    return ndA?.allies.has(factionB) ?? false;
  }

  getNation(factionId: number): NationData | undefined {
    return this.nationData.get(factionId);
  }
}
