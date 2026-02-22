// Dialectic system: imperial/colonial vs revolutionary dialectic
// Tracks oppression, revolutionary class formation, thesis/antithesis/synthesis

import type { World } from '../ecs/World';
import { SocialStore } from '../components/Social';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { MotorStore } from '../components/Motor';
import { ZealotryStore, CultStance } from '../components/Zealotry';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import type { FactionManager, Faction } from './FactionSystem';
import type { PoliticsSystem, NationData, GovernmentType } from './PoliticsSystem';
import type { TerritorySystem } from './TerritorySystem';
import { clamp } from '../utils/Math';

const DIALECTIC_INTERVAL = 300;
const OPPRESSION_THRESHOLD = 0.4;
const CONSECUTIVE_CHECKS_FOR_REVOLT = 3;
const REVOLT_SUCCESS_THRESHOLD = 0.4;

export interface DialecticState {
  thesis: number;       // 0-1 imperial/colonial expansion pressure
  antithesis: number;   // 0-1 revolutionary resistance pressure
  synthesis: number;    // 0-1 reformed governance stability
  oppressionRatio: number;
  revolutionaryCount: number;
  consecutiveOppression: number;
  lastRevoltTick: number;
  revoltCount: number;
  imperialExpansion: number;   // territory gained by force
  colonialSubjects: number;   // vassal population count
}

export interface GlobalDialectic {
  imperialIndex: number;
  revolutionaryIndex: number;
  stabilityIndex: number;
  conflictWaveAmplitude: number;
}

function createDialecticState(): DialecticState {
  return {
    thesis: 0,
    antithesis: 0,
    synthesis: 0,
    oppressionRatio: 0,
    revolutionaryCount: 0,
    consecutiveOppression: 0,
    lastRevoltTick: -10000,
    revoltCount: 0,
    imperialExpansion: 0,
    colonialSubjects: 0,
  };
}

export class DialecticSystem {
  states = new Map<number, DialecticState>();
  global: GlobalDialectic = {
    imperialIndex: 0,
    revolutionaryIndex: 0,
    stabilityIndex: 0,
    conflictWaveAmplitude: 0,
  };

  factionManager: FactionManager | null = null;
  politicsSystem: PoliticsSystem | null = null;
  territory: TerritorySystem | null = null;

  // Callbacks
  onRevolutionStart: ((factionId: number, revolutionaries: number[]) => void) | null = null;
  onRevolutionEnd: ((factionId: number, success: boolean, newGov: number) => void) | null = null;

  private tickCounter = 0;
  private currentTick = 0;

  tick(world: World, currentTick: number): void {
    this.currentTick = currentTick;
    this.tickCounter++;
    if (this.tickCounter < DIALECTIC_INTERVAL) return;
    this.tickCounter = 0;

    if (!this.factionManager || !this.politicsSystem) return;

    for (const faction of this.factionManager.activeFactions) {
      if (!this.states.has(faction.id)) {
        this.states.set(faction.id, createDialecticState());
      }
      this.updateFactionDialectic(faction, world);
    }

    this.computeGlobal();
  }

  private updateFactionDialectic(faction: Faction, world: World): void {
    const state = this.states.get(faction.id)!;
    const nation = this.politicsSystem!.getNation(faction.id);
    if (!nation) return;

    // Count oppressed members
    let oppressedCount = 0;
    let aliveCount = 0;
    const oppressed: number[] = [];

    for (const memberId of faction.memberIds) {
      const lc = LifecycleStore.get(memberId);
      if (lc && lc.stage === LifeStage.Dead) continue;
      aliveCount++;

      if (this.isOppressed(memberId, faction.id, nation)) {
        oppressedCount++;
        oppressed.push(memberId);
      }
    }

    state.oppressionRatio = aliveCount > 0 ? oppressedCount / aliveCount : 0;
    state.revolutionaryCount = oppressedCount;

    // Track consecutive oppression checks
    if (state.oppressionRatio > OPPRESSION_THRESHOLD) {
      state.consecutiveOppression++;
    } else {
      state.consecutiveOppression = Math.max(0, state.consecutiveOppression - 1);
    }

    // Compute vassal population (colonial subjects)
    state.colonialSubjects = 0;
    for (const vassalId of nation.vassals) {
      const vassal = this.factionManager!.activeFactions.find(f => f.id === vassalId);
      if (vassal) state.colonialSubjects += vassal.memberIds.size;
    }

    // Imperial expansion pressure (thesis)
    const gerryScore = this.territory?.getGerrymanderScore(faction.id) ?? 0;
    const terrSize = this.territory?.getTerritory(faction.id) ?? 0;
    const vassalCount = nation.vassals.size;
    state.imperialExpansion = gerryScore;
    state.thesis = clamp(
      gerryScore * 0.3 +
      vassalCount * 0.15 +
      (nation.warTargets.size > 0 ? 0.2 : 0) +
      Math.min(1, terrSize / 200) * 0.2,
      0, 1
    );

    // Revolutionary resistance (antithesis)
    state.antithesis = clamp(
      state.oppressionRatio * 0.5 +
      (state.consecutiveOppression >= 2 ? 0.2 : 0) +
      (nation.warExhaustion > 0.5 ? nation.warExhaustion * 0.3 : 0),
      0, 1
    );

    // Synthesis (reformed governance stability)
    const govReformed = nation.government === 2 || nation.government === 4; // Democracy or Commune
    state.synthesis = clamp(
      (govReformed ? 0.3 : 0) +
      (1 - state.oppressionRatio) * 0.3 +
      (nation.allies.size * 0.1) +
      (state.revoltCount > 0 ? 0.1 : 0), // past revolts contribute to synthesis
      0, 1
    );

    // ── Revolution trigger ──
    if (
      state.consecutiveOppression >= CONSECUTIVE_CHECKS_FOR_REVOLT &&
      this.currentTick - state.lastRevoltTick > 2000 && // cooldown
      oppressed.length >= 2
    ) {
      this.triggerRevolution(faction, nation, oppressed, state, world);
    }
  }

  private isOppressed(entityId: number, factionId: number, nation: NationData): boolean {
    // Vassal faction member
    if (nation.overlord !== -1) return true;

    // Displaced by gerrymandering
    if (this.territory?.displacedCreatures.has(entityId)) return true;

    // Rebellion stance zealots
    const z = ZealotryStore.get(entityId);
    if (z && z.stance === CultStance.Rebellion) return true;

    // War-weary pacifist
    const gen = GenomeStore.get(entityId);
    if (nation.warExhaustion > 0.6 && gen && gen.genome.aggression < 0.4) return true;

    // Autocracy/Horde with low loyalty
    if ((nation.government === 1 || nation.government === 5) && gen && gen.genome.loyalty < 0.3) {
      return true;
    }

    return false;
  }

  private triggerRevolution(
    faction: Faction,
    nation: NationData,
    oppressed: number[],
    state: DialecticState,
    world: World,
  ): void {
    state.lastRevoltTick = this.currentTick;
    state.revoltCount++;

    // Mark revolutionaries
    for (const id of oppressed) {
      const motor = MotorStore.get(id);
      if (motor) motor.wantRevolt = true;

      // Diary entry
      const diary = DiaryStore.get(id);
      if (diary) {
        addDiaryEntry(diary, this.currentTick, DiaryEventType.RevoltJoined, {
          factionName: faction.name,
        });
      }
    }

    this.onRevolutionStart?.(faction.id, oppressed);

    // Determine outcome
    const aliveCount = Array.from(faction.memberIds).filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage !== LifeStage.Dead;
    }).length;

    const revolutionRatio = oppressed.length / Math.max(1, aliveCount);

    if (revolutionRatio >= REVOLT_SUCCESS_THRESHOLD) {
      // Successful revolution → government change
      const newGov = this.getReformedGovernment(nation.government as number);
      nation.government = newGov as any;
      nation.warExhaustion = Math.max(0, nation.warExhaustion - 0.3);

      // Remove overlord if vassal
      if (nation.overlord !== -1) {
        const overlordNation = this.politicsSystem!.getNation(nation.overlord);
        if (overlordNation) overlordNation.vassals.delete(faction.id);
        nation.overlord = -1;
      }

      // Notify revolutionaries
      for (const id of oppressed) {
        const motor = MotorStore.get(id);
        if (motor) motor.wantRevolt = false;

        const diary = DiaryStore.get(id);
        if (diary) {
          const govNames = ['Tribal', 'Autocracy', 'Democracy', 'Theocracy', 'Commune', 'Horde'];
          addDiaryEntry(diary, this.currentTick, DiaryEventType.RevoltWon, {
            factionName: faction.name,
            detail: `Now a ${govNames[newGov]}`,
          });
        }
      }

      this.onRevolutionEnd?.(faction.id, true, newGov);
    } else {
      // Failed revolution: leaders exiled
      const sorted = oppressed.slice().sort((a, b) => {
        const ga = GenomeStore.get(a)?.genome.aggression ?? 0;
        const gb = GenomeStore.get(b)?.genome.aggression ?? 0;
        return gb - ga;
      });

      // Exile top 1-2 most aggressive revolutionaries
      const exileCount = Math.min(2, sorted.length);
      for (let i = 0; i < exileCount; i++) {
        const id = sorted[i];
        // Find a neighboring faction to defect to
        if (this.factionManager) {
          const neighbors = this.factionManager.activeFactions.filter(f =>
            f.id !== faction.id && f.memberIds.size > 0
          );
          if (neighbors.length > 0) {
            const target = neighbors[Math.floor(Math.random() * neighbors.length)];
            const social = SocialStore.get(id);
            if (social) {
              faction.memberIds.delete(id);
              target.memberIds.add(id);
              social.factionId = target.id;
            }
          }
        }
      }

      // Clear revolt flags
      for (const id of oppressed) {
        const motor = MotorStore.get(id);
        if (motor) motor.wantRevolt = false;
      }

      this.onRevolutionEnd?.(faction.id, false, nation.government as number);
    }
  }

  private getReformedGovernment(current: number): number {
    // Autocracy → Democracy, Horde → Commune, Theocracy → Tribal
    switch (current) {
      case 1: return 2; // Autocracy → Democracy
      case 5: return 4; // Horde → Commune
      case 3: return 0; // Theocracy → Tribal
      default: return 2; // Default to Democracy
    }
  }

  private computeGlobal(): void {
    let totalThesis = 0, totalAntithesis = 0, totalSynthesis = 0;
    let count = 0;

    for (const state of this.states.values()) {
      totalThesis += state.thesis;
      totalAntithesis += state.antithesis;
      totalSynthesis += state.synthesis;
      count++;
    }

    if (count > 0) {
      this.global.imperialIndex = totalThesis / count;
      this.global.revolutionaryIndex = totalAntithesis / count;
      this.global.stabilityIndex = totalSynthesis / count;
      this.global.conflictWaveAmplitude =
        Math.abs(this.global.imperialIndex - this.global.revolutionaryIndex);
    }
  }

  getState(factionId: number): DialecticState | undefined {
    return this.states.get(factionId);
  }
}
