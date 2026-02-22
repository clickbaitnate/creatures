// DivineResponseSystem: event-driven response calculation for god-hand drops.
// Not a per-tick system — called on drop events.

import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import type { CreatureGenome } from '../genome/Genome';
import { ZealotryStore, CultStance, type ZealotryData } from '../components/Zealotry';
import { SocialStore } from '../components/Social';
import { TransformStore } from '../components/Transform';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';
import type { FactionManager } from '../world/FactionSystem';

// Biome names for diary prose
const BIOME_NAMES: Record<number, string> = {
  0: 'the Plains',
  1: 'the Forest',
  2: 'the Scrubland',
  3: 'the Highlands',
  4: 'the Wetland',
};

/** Calculate biome affinity from genome traits (0-1) */
function biomeAffinity(genome: CreatureGenome, biomeIndex: number): number {
  switch (biomeIndex) {
    case 0: // Plains
      return genome.sociability * 0.3 + genome.gatherAffinity * 0.3 + genome.buildAffinity * 0.2 + 0.2;
    case 1: // Forest
      return genome.gatherAffinity * 0.3 + genome.curiosity * 0.3 + genome.creativity * 0.2 + 0.2;
    case 2: // Scrubland / Desert
      return genome.aggression * 0.3 + (1 - genome.sociability) * 0.3 + genome.huntAffinity * 0.4;
    case 3: // Highland / Rocky / Tundra
      return genome.buildAffinity * 0.3 + genome.loyalty * 0.3 + genome.hoardAffinity * 0.2 + 0.2;
    case 4: // Wetland / Swamp
      return genome.curiosity * 0.3 + genome.gatherAffinity * 0.3 + genome.sociability * 0.2 + 0.2;
    default:
      return 0.5;
  }
}

export interface DivineResponseResult {
  stance: CultStance;
  terror: number;
  awe: number;
  devotion: number;
  rebellion: number;
}

/** Calculate response of a creature to being lifted and dropped */
export function calculateDivineResponse(
  entityId: number,
  originBiome: number,
  dropBiome: number,
  distance: number,
  tick: number,
): DivineResponseResult {
  const genomeData = GenomeStore.get(entityId);
  const zealotry = ZealotryStore.get(entityId);
  if (!genomeData || !zealotry) {
    return { stance: CultStance.None, terror: 0, awe: 0, devotion: 0, rebellion: 0 };
  }

  const genome = genomeData.genome;

  // Base shock from distance
  const shockBase = clamp(distance / 30, 0.1, 1.0);

  // Familiarity dampens repeat picks
  const familiarity = clamp(1 - zealotry.timesLifted * 0.15, 0.3, 1.0);

  // Prior faith
  const priorFaith = zealotry.zealotry;

  // Biome match
  const affinity = biomeAffinity(genome, dropBiome);
  const biomeMismatch = 1 - affinity;

  // Personality proneness
  const fearProne = (1 - genome.aggression) * 0.5 + genome.loyalty * 0.3 + 0.2;
  const aweProne = genome.curiosity * 0.4 + genome.creativity * 0.3 + 0.3;
  const devotionProne = genome.loyalty * 0.4 + genome.sociability * 0.3 + 0.3;
  const rebellProne = genome.aggression * 0.4 + (1 - genome.loyalty) * 0.3 + 0.3;

  // Calculate components
  let terror = shockBase * fearProne * familiarity + biomeMismatch * 0.3;
  let awe = shockBase * aweProne * familiarity + affinity * 0.2;
  let devotion = priorFaith * devotionProne + affinity * 0.3;
  let rebellion = shockBase * rebellProne + biomeMismatch * 0.4 - priorFaith * 0.3;

  // Clamp all to 0-1
  terror = clamp(terror, 0, 1);
  awe = clamp(awe, 0, 1);
  devotion = clamp(devotion, 0, 1);
  rebellion = clamp(rebellion, 0, 1);

  // Determine stance = argmax
  let stance = CultStance.None;
  let maxVal = 0;
  if (terror > maxVal) { maxVal = terror; stance = CultStance.Terror; }
  if (awe > maxVal) { maxVal = awe; stance = CultStance.Awe; }
  if (devotion > maxVal) { maxVal = devotion; stance = CultStance.Devotion; }
  if (rebellion > maxVal) { maxVal = rebellion; stance = CultStance.Rebellion; }

  // Apply biochemical effects
  const biochem = BiochemStore.get(entityId);
  if (biochem) {
    switch (stance) {
      case CultStance.Terror:
        biochem.chemicals[ChemId.Pain] = clamp(biochem.chemicals[ChemId.Pain] + 0.4, 0, 1);
        biochem.chemicals[ChemId.Anxiety] = clamp(biochem.chemicals[ChemId.Anxiety] + 0.5, 0, 1);
        biochem.chemicals[ChemId.Punishment] = clamp(biochem.chemicals[ChemId.Punishment] + 0.2, 0, 1);
        break;
      case CultStance.Awe:
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.3, 0, 1);
        biochem.chemicals[ChemId.Anxiety] = clamp(biochem.chemicals[ChemId.Anxiety] + 0.2, 0, 1);
        break;
      case CultStance.Devotion:
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.5, 0, 1);
        biochem.chemicals[ChemId.Anxiety] = clamp(biochem.chemicals[ChemId.Anxiety] - 0.3, 0, 1);
        biochem.chemicals[ChemId.Energy] = clamp(biochem.chemicals[ChemId.Energy] + 0.1, 0, 1);
        break;
      case CultStance.Rebellion:
        biochem.chemicals[ChemId.Pain] = clamp(biochem.chemicals[ChemId.Pain] + 0.3, 0, 1);
        biochem.chemicals[ChemId.Punishment] = clamp(biochem.chemicals[ChemId.Punishment] + 0.4, 0, 1);
        biochem.chemicals[ChemId.Energy] = clamp(biochem.chemicals[ChemId.Energy] + 0.2, 0, 1);
        break;
    }
  }

  // Update zealotry data
  zealotry.timesLifted++;
  zealotry.lastLiftTick = tick;
  zealotry.lastDropBiome = dropBiome;
  zealotry.displacementStress = clamp(shockBase * 0.5 + biomeMismatch * 0.3, 0, 1);
  zealotry.terror = terror;
  zealotry.awe = awe;
  zealotry.devotion = devotion;
  zealotry.rebellion = rebellion;
  zealotry.stance = stance;

  // Adjust zealotry level based on stance
  if (stance === CultStance.Devotion) {
    zealotry.zealotry = clamp(zealotry.zealotry + 0.15, 0, 1);
    zealotry.divineFavor = clamp(zealotry.divineFavor + 0.2, -1, 1);
  } else if (stance === CultStance.Awe) {
    zealotry.zealotry = clamp(zealotry.zealotry + 0.1, 0, 1);
    zealotry.divineFavor = clamp(zealotry.divineFavor + 0.1, -1, 1);
  } else if (stance === CultStance.Terror) {
    zealotry.zealotry = clamp(zealotry.zealotry + 0.05, 0, 1);
    zealotry.divineFavor = clamp(zealotry.divineFavor - 0.1, -1, 1);
  } else if (stance === CultStance.Rebellion) {
    zealotry.zealotry = clamp(zealotry.zealotry - 0.1, 0, 1);
    zealotry.divineFavor = clamp(zealotry.divineFavor - 0.3, -1, 1);
  }
  zealotry.deity = 0; // player god

  // Diary entry for the lifted creature
  const diary = DiaryStore.get(entityId);
  if (diary) {
    const originName = BIOME_NAMES[originBiome] ?? 'unknown lands';
    const dropName = BIOME_NAMES[dropBiome] ?? 'unknown lands';
    addDiaryEntry(diary, tick, DiaryEventType.DivineIntervention, {
      detail: `${originName} to ${dropName}`,
    });
  }

  return { stance, terror, awe, devotion, rebellion };
}

/** Propagate witness effects to nearby creatures */
export function propagateWitnessEffect(
  droppedEntityId: number,
  dropX: number,
  dropZ: number,
  tick: number,
  allCreatureIds: number[],
  speechCallback?: (entityId: number, emoji: string, x: number, y: number, z: number) => void,
): number {
  let witnessCount = 0;
  const WITNESS_RANGE_SQ = 10 * 10;

  for (const id of allCreatureIds) {
    if (id === droppedEntityId) continue;
    const lc = LifecycleStore.get(id);
    if (!lc || lc.stage !== LifeStage.Alive) continue;
    const t = TransformStore.get(id);
    if (!t) continue;

    const dx = t.x - dropX;
    const dz = t.z - dropZ;
    if (dx * dx + dz * dz > WITNESS_RANGE_SQ) continue;

    // Apply witness effect
    const z = ZealotryStore.get(id);
    if (z) {
      z.zealotry = clamp(z.zealotry + 0.05, 0, 1);
      z.deity = 0;

      // Personality-based reaction
      const gen = GenomeStore.get(id);
      if (gen) {
        if (gen.genome.curiosity > gen.genome.aggression) {
          z.awe = clamp(z.awe + 0.1, 0, 1);
        } else {
          z.terror = clamp(z.terror + 0.1, 0, 1);
        }
      }
    }

    // Witness diary
    const wd = DiaryStore.get(id);
    const social = SocialStore.get(droppedEntityId);
    if (wd) {
      addDiaryEntry(wd, tick, DiaryEventType.WitnessedDivine, {
        otherName: social?.name ?? 'a creature',
      });
    }

    // Speech bubble
    if (speechCallback) {
      const emoji = Math.random() < 0.5 ? '😲' : '😨';
      speechCallback(id, emoji, t.x, t.y, t.z);
    }

    witnessCount++;
  }

  return witnessCount;
}
