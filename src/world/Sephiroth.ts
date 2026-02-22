// Sephiroth civilization metrics — 10 metrics per faction mapped to the Tree of Life
// Computed every 200 ticks from faction stats

import type { World } from '../ecs/World';
import { GenomeStore } from '../components/Genome';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BiochemStore } from '../components/Biochemistry';
import { BuildingStore, BuildingType } from '../components/Building';
import { TransformStore } from '../components/Transform';
import { ZealotryStore } from '../components/Zealotry';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import type { FactionManager, Faction } from './FactionSystem';
import type { PoliticsSystem } from './PoliticsSystem';
import type { TerritorySystem } from './TerritorySystem';
import { clamp } from '../utils/Math';

export const SEPHIRAH_NAMES = [
  'Keter',    // Crown — Transcendence
  'Chokhmah', // Wisdom — Knowledge
  'Binah',    // Understanding — Organization
  'Chesed',   // Mercy — Compassion
  'Gevurah',  // Severity — Military
  'Tiferet',  // Beauty — Culture
  'Netzach',  // Victory — Ambition
  'Hod',      // Splendor — Prosperity
  'Yesod',    // Foundation — Stability
  'Malkuth',  // Kingdom — Sovereignty
];

export interface SephirothMetrics {
  values: Float32Array; // 10 values, 0-10 scale
  lastUpdate: number;
}

export function createSephirothMetrics(): SephirothMetrics {
  return {
    values: new Float32Array(10),
    lastUpdate: 0,
  };
}

const UPDATE_INTERVAL = 200;

export class SephirothSystem {
  metrics = new Map<number, SephirothMetrics>();

  factionManager: FactionManager | null = null;
  politicsSystem: PoliticsSystem | null = null;
  territory: TerritorySystem | null = null;
  private tickCounter = 0;

  tick(world: World): void {
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL) return;
    this.tickCounter = 0;
    if (!this.factionManager) return;

    for (const faction of this.factionManager.activeFactions) {
      if (!this.metrics.has(faction.id)) {
        this.metrics.set(faction.id, createSephirothMetrics());
      }
      this.computeMetrics(faction, world);
    }
  }

  private computeMetrics(faction: Faction, world: World): void {
    const m = this.metrics.get(faction.id)!;
    const v = m.values;

    let memberCount = 0;
    let avgAggression = 0, avgCreativity = 0, avgSociability = 0;
    let avgEnergy = 0, avgZealotry = 0;
    let breedDiversity = new Set<string>();

    for (const memberId of faction.memberIds) {
      const lc = LifecycleStore.get(memberId);
      if (lc && lc.stage === LifeStage.Dead) continue;
      memberCount++;

      const gen = GenomeStore.get(memberId);
      if (gen) {
        avgAggression += gen.genome.aggression;
        avgCreativity += gen.genome.creativity;
        avgSociability += gen.genome.sociability;
        // Track breed diversity
        const breed = gen.genome.gatherAffinity > 0.5 ? 'G' :
                      gen.genome.huntAffinity > 0.5 ? 'H' :
                      gen.genome.buildAffinity > 0.5 ? 'B' : 'O';
        breedDiversity.add(breed);
      }

      const biochem = BiochemStore.get(memberId);
      if (biochem) avgEnergy += biochem.chemicals[ChemId.Energy];

      const z = ZealotryStore.get(memberId);
      if (z) avgZealotry += z.zealotry;
    }

    if (memberCount === 0) {
      v.fill(0);
      return;
    }

    avgAggression /= memberCount;
    avgCreativity /= memberCount;
    avgSociability /= memberCount;
    avgEnergy /= memberCount;
    avgZealotry /= memberCount;

    // Count buildings
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);
    let monumentCount = 0, buildingCount = 0, granaryStorage = 0;
    let uniqueTools = 0;
    for (const bid of buildings) {
      const b = BuildingStore.get(bid)!;
      if (b.factionId !== faction.id) continue;
      buildingCount++;
      if (b.type === BuildingType.Monument) monumentCount++;
      if (b.type === BuildingType.Granary) granaryStorage += b.storage;
      if (b.type === BuildingType.Workshop) uniqueTools++;
    }

    // Politics data
    const nation = this.politicsSystem?.getNation(faction.id);
    let terrCount = 0;
    if (this.territory) terrCount = this.territory.getTerritory(faction.id);
    const allyCount = nation?.allies.size ?? 0;
    const warWins = avgAggression * memberCount * 0.5; // approximation

    // Compute Sephiroth
    // 0: Keter (Transcendence) — monuments + zealotry
    v[0] = clamp(monumentCount * 1.5 + avgZealotry * 5, 0, 10);

    // 1: Chokhmah (Knowledge) — unique tools + workshops
    v[1] = clamp(uniqueTools * 2 + avgCreativity * 5, 0, 10);

    // 2: Binah (Organization) — buildings per member
    v[2] = clamp((buildingCount / Math.max(1, memberCount)) * 5, 0, 10);

    // 3: Chesed (Compassion) — alliances + sociability
    v[3] = clamp(allyCount * 2 + avgSociability * 5, 0, 10);

    // 4: Gevurah (Military) — wars + aggression
    v[4] = clamp(warWins * 0.5 + avgAggression * 6, 0, 10);

    // 5: Tiferet (Culture) — breed diversity + creativity
    v[5] = clamp(breedDiversity.size * 2 + avgCreativity * 4, 0, 10);

    // 6: Netzach (Ambition) — territory
    v[6] = clamp(terrCount * 0.2, 0, 10);

    // 7: Hod (Prosperity) — granary + energy
    v[7] = clamp(granaryStorage * 0.5 + avgEnergy * 5, 0, 10);

    // 8: Yesod (Stability) — population + survival
    v[8] = clamp(memberCount * 0.5, 0, 10);

    // 9: Malkuth (Sovereignty) — territory + government level
    const govLevel = nation ? nation.government : 0;
    v[9] = clamp(terrCount * 0.1 + govLevel * 1.5, 0, 10);
  }

  getMetrics(factionId: number): Float32Array | null {
    return this.metrics.get(factionId)?.values ?? null;
  }
}
