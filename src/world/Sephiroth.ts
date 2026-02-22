// Sephiroth civilization metrics — 10 metrics per faction mapped to the Tree of Life
// Computed every 200 ticks from faction stats
// Jachin & Boaz pillars: oscillating waves driven by conflict events

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

// ── Jachin & Boaz Pillar State ──────────────────────────────

export interface PillarState {
  amplitude: number;    // 0-1 current wave strength
  frequency: number;    // oscillations per 1000 ticks
  phase: number;        // current phase (0-2PI)
  decay: number;        // per-tick decay rate
  lastConflictTick: number;
}

export interface PulseEvent {
  tick: number;
  jachin: number;
  boaz: number;
  event: string;
}

export interface JachinBoaz {
  jachin: PillarState;
  boaz: PillarState;
  balance: number;      // -1 (full Boaz/severity) to +1 (full Jachin/mercy)
  pulseHistory: PulseEvent[];
}

function createPillar(): PillarState {
  return {
    amplitude: 0,
    frequency: 2.0,
    phase: 0,
    decay: 0.002,
    lastConflictTick: 0,
  };
}

export function createJachinBoaz(): JachinBoaz {
  return {
    jachin: createPillar(),
    boaz: createPillar(),
    balance: 0,
    pulseHistory: [],
  };
}

const TWO_PI = Math.PI * 2;
const UPDATE_INTERVAL = 200;
const MAX_PULSE_HISTORY = 200;

export class SephirothSystem {
  metrics = new Map<number, SephirothMetrics>();
  pillars: JachinBoaz;

  factionManager: FactionManager | null = null;
  politicsSystem: PoliticsSystem | null = null;
  territory: TerritorySystem | null = null;
  private tickCounter = 0;
  private globalTick = 0;

  constructor() {
    this.pillars = createJachinBoaz();
  }

  tick(world: World): void {
    this.globalTick++;

    // Pulse tick: runs every tick for smooth oscillation
    this.tickPulse();

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

  /** Advance pillar oscillations (every tick) */
  private tickPulse(): void {
    const p = this.pillars;

    // Advance phase
    p.jachin.phase += p.jachin.frequency * (TWO_PI / 1000);
    if (p.jachin.phase > TWO_PI) p.jachin.phase -= TWO_PI;
    p.jachin.amplitude *= (1 - p.jachin.decay);
    if (p.jachin.amplitude < 0.001) p.jachin.amplitude = 0;

    p.boaz.phase += p.boaz.frequency * (TWO_PI / 1000);
    if (p.boaz.phase > TWO_PI) p.boaz.phase -= TWO_PI;
    p.boaz.amplitude *= (1 - p.boaz.decay);
    if (p.boaz.amplitude < 0.001) p.boaz.amplitude = 0;

    // Compute balance: -1 (severity) to +1 (mercy)
    const jWave = this.getWave('jachin');
    const bWave = this.getWave('boaz');
    const rawBalance = jWave - bWave;
    p.balance = clamp(rawBalance, -1, 1);

    // Store pulse history every 5 ticks
    if (this.globalTick % 5 === 0) {
      p.pulseHistory.push({
        tick: this.globalTick,
        jachin: jWave,
        boaz: bWave,
        event: '',
      });
      if (p.pulseHistory.length > MAX_PULSE_HISTORY) {
        p.pulseHistory.shift();
      }
    }
  }

  /** Pulse a pillar with an amplitude delta from a conflict event */
  pulsePillar(pillar: 'jachin' | 'boaz', amount: number, event: string): void {
    const p = pillar === 'jachin' ? this.pillars.jachin : this.pillars.boaz;
    p.amplitude = clamp(p.amplitude + amount, 0, 1);
    p.lastConflictTick = this.globalTick;

    // Record event in history
    if (this.pillars.pulseHistory.length > 0) {
      const last = this.pillars.pulseHistory[this.pillars.pulseHistory.length - 1];
      if (last.tick === this.globalTick || this.globalTick - last.tick < 3) {
        last.event = event;
      }
    }
    this.pillars.pulseHistory.push({
      tick: this.globalTick,
      jachin: this.getWave('jachin'),
      boaz: this.getWave('boaz'),
      event,
    });
    if (this.pillars.pulseHistory.length > MAX_PULSE_HISTORY) {
      this.pillars.pulseHistory.shift();
    }
  }

  /** Convenience: pulse both pillars from a conflict event */
  pulseConflict(jachinDelta: number, boazDelta: number, event: string): void {
    if (jachinDelta !== 0) this.pulsePillar('jachin', Math.abs(jachinDelta), event);
    if (boazDelta !== 0) this.pulsePillar('boaz', Math.abs(boazDelta), event);
    // Negative deltas reduce amplitude
    if (jachinDelta < 0) {
      this.pillars.jachin.amplitude = clamp(
        this.pillars.jachin.amplitude + jachinDelta, 0, 1
      );
    }
    if (boazDelta < 0) {
      this.pillars.boaz.amplitude = clamp(
        this.pillars.boaz.amplitude + boazDelta, 0, 1
      );
    }
  }

  /** Get current wave value for a pillar */
  getWave(pillar: 'jachin' | 'boaz'): number {
    const p = pillar === 'jachin' ? this.pillars.jachin : this.pillars.boaz;
    return p.amplitude * Math.sin(p.phase);
  }

  /** Get current balance: -1 (Boaz/severity) to +1 (Jachin/mercy) */
  getBalance(): number {
    return this.pillars.balance;
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
    const warWins = avgAggression * memberCount * 0.5;

    // ── Pillar modulation ──
    const jAmp = this.pillars.jachin.amplitude;
    const bAmp = this.pillars.boaz.amplitude;
    const jMod = jAmp > 0.3 ? jAmp * 0.5 : 0; // Jachin boosts mercy metrics
    const bMod = bAmp > 0.3 ? bAmp * 0.5 : 0; // Boaz boosts severity metrics

    // Compute Sephiroth
    // 0: Keter (Transcendence) — monuments + zealotry
    v[0] = clamp(monumentCount * 1.5 + avgZealotry * 5, 0, 10);

    // 1: Chokhmah (Knowledge) — unique tools + workshops
    v[1] = clamp(uniqueTools * 2 + avgCreativity * 5, 0, 10);

    // 2: Binah (Organization) — buildings per member
    v[2] = clamp((buildingCount / Math.max(1, memberCount)) * 5, 0, 10);

    // 3: Chesed (Compassion) — Jachin pillar boosts
    v[3] = clamp(allyCount * 2 + avgSociability * 5 + jMod * 3, 0, 10);

    // 4: Gevurah (Military) — Boaz pillar boosts
    v[4] = clamp(warWins * 0.5 + avgAggression * 6 + bMod * 3, 0, 10);

    // 5: Tiferet (Culture) — Boaz pillar influence
    v[5] = clamp(breedDiversity.size * 2 + avgCreativity * 4 + bMod * 2, 0, 10);

    // 6: Netzach (Ambition) — Jachin pillar boosts
    v[6] = clamp(terrCount * 0.2 + jMod * 2, 0, 10);

    // 7: Hod (Prosperity) — Jachin pillar boosts
    v[7] = clamp(granaryStorage * 0.5 + avgEnergy * 5 + jMod * 2, 0, 10);

    // 8: Yesod (Stability) — Boaz pillar influence
    v[8] = clamp(memberCount * 0.5 + bMod * 2, 0, 10);

    // 9: Malkuth (Sovereignty) — territory + government level
    const govLevel = nation ? nation.government : 0;
    v[9] = clamp(terrCount * 0.1 + govLevel * 1.5, 0, 10);
  }

  getMetrics(factionId: number): Float32Array | null {
    return this.metrics.get(factionId)?.values ?? null;
  }
}
