import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SocialStore, Activity } from '../components/Social';
import { GenomeStore } from '../components/Genome';
import { ZealotryStore } from '../components/Zealotry';
import { GoalStore, GoalType } from '../components/Goal';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BiochemStore } from '../components/Biochemistry';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';
import type { FactionManager, Faction } from '../world/FactionSystem';
import { CultStance } from '../components/Zealotry';
import { type DivinePowerState, addPower, updatePowerCap } from '../god/DivinePower';
import type { ResourceGrid, Biome } from '../world/ResourceGrid';
import {
  PHILOSOPHIES, matchPhilosophy, pick, pickN,
  EMOTIONS, ACTIVITIES, SYMBOLS, SOCIAL_SPEECH,
  type PhilosophyArchetype,
} from '../world/EmojiVocabulary';
import { VocabularyStore, learn, learnAndPick } from '../components/Vocabulary';

const TALK_RANGE_SQ = 4 * 4;
const PHILOSOPHY_UPDATE_INTERVAL = 500; // re-evaluate faction philosophy periodically
const SCHISM_CHECK_INTERVAL = 1000;

// Track which activity types each creature does most
interface BehaviorProfile {
  gatherCount: number;
  huntCount: number;
  buildCount: number;
  craftCount: number;
  fightCount: number;
  tradeCount: number;
  farmCount: number;
  worshipCount: number;
}

// Extended faction data for religion (stored on the faction object via dynamic fields)
const factionPhilosophies = new Map<number, PhilosophyArchetype>();
const memberBehavior = new Map<number, BehaviorProfile>();

function getBehavior(entityId: number): BehaviorProfile {
  let b = memberBehavior.get(entityId);
  if (!b) {
    b = { gatherCount: 0, huntCount: 0, buildCount: 0, craftCount: 0, fightCount: 0, tradeCount: 0, farmCount: 0, worshipCount: 0 };
    memberBehavior.set(entityId, b);
  }
  return b;
}

const BIOME_NAMES = ['Meadow', 'Forest', 'Scrubland', 'Rocky', 'Wetland'];

export class ReligionSystem extends System {
  readonly query = ZealotryStore.bit | SocialStore.bit | TransformStore.bit;
  readonly priority = 38;

  factionManager: FactionManager | null = null;
  grid: ResourceGrid | null = null;
  divinePower: DivinePowerState | null = null;
  private philTimer = 0;
  private schismTimer = 0;
  private tickCount = 0;
  private cultCountTimer = 0;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    this.tickCount++;

    // Track creature activities for behavior profiling
    this.trackBehavior(entities);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) {
        memberBehavior.delete(id);
        continue;
      }

      const zealotry = ZealotryStore.get(id)!;
      const social = SocialStore.get(id)!;
      const transform = TransformStore.get(id)!;

      // Zealotry decay when god not present
      if (zealotry.zealotry > 0) {
        zealotry.zealotry = clamp(zealotry.zealotry - zealotry.faithDecay, 0, 1);
      }

      // Stance-based decay: gradient values slowly drift toward 0
      zealotry.terror = clamp(zealotry.terror - 0.0005, 0, 1);
      zealotry.awe = clamp(zealotry.awe - 0.0005, 0, 1);
      zealotry.devotion = clamp(zealotry.devotion - 0.0003, 0, 1); // devotion decays slower
      zealotry.rebellion = clamp(zealotry.rebellion - 0.0008, 0, 1); // rebellion fades faster
      zealotry.displacementStress = clamp(zealotry.displacementStress - 0.001, 0, 1);

      // Divine power generation based on stance
      if (this.divinePower && zealotry.deity === 0 && zealotry.zealotry > 0) {
        switch (zealotry.stance) {
          case CultStance.Devotion:
            addPower(this.divinePower, 0.002 * zealotry.zealotry);
            break;
          case CultStance.Awe:
            addPower(this.divinePower, 0.001 * zealotry.zealotry);
            break;
          case CultStance.Terror:
            addPower(this.divinePower, 0.0005 * zealotry.zealotry);
            break;
          case CultStance.Rebellion:
            this.divinePower.power = Math.max(0, this.divinePower.power - 0.001 * (1 - zealotry.zealotry));
            break;
        }
      }

      // High zealotry: morale boost
      if (zealotry.zealotry > 0.5) {
        const biochem = BiochemStore.get(id);
        if (biochem) {
          biochem.chemicals[ChemId.Reward] = clamp(
            biochem.chemicals[ChemId.Reward] + 0.0003 * zealotry.zealotry, 0, 1);
        }
      }

      // Proselytizing: zealous creatures spread faith to same-faction nearby
      if (zealotry.zealotry > 0.3 && Math.random() < 0.01) {
        for (const otherId of entities) {
          if (otherId === id) continue;
          const otherSocial = SocialStore.get(otherId);
          if (!otherSocial || otherSocial.factionId !== social.factionId) continue;
          const otherTransform = TransformStore.get(otherId)!;
          if (distSq(transform.x, transform.z, otherTransform.x, otherTransform.z) > TALK_RANGE_SQ) continue;

          const otherZ = ZealotryStore.get(otherId);
          if (otherZ && otherZ.zealotry < zealotry.zealotry) {
            otherZ.zealotry = clamp(otherZ.zealotry + 0.02, 0, 1);
            otherZ.deity = zealotry.deity;
            // Share witnessed actions
            for (const w of zealotry.witnessed) {
              if (!otherZ.witnessed.includes(w)) {
                if (otherZ.witnessed.length >= 5) otherZ.witnessed.shift();
                otherZ.witnessed.push(w);
              }
            }

            // Proselytizing speech (learn through religious practice)
            const rVocab = VocabularyStore.get(id);
            if (rVocab) {
              social.speechEmoji = learnAndPick(rVocab, ACTIVITIES.worship);
              social.speechTimer = 40;
            }

            // Record bond for clan formation
            this.factionManager?.recordInteraction(id, otherId, true);
            break; // one conversion attempt per tick
          }
        }
      }

      // Spontaneous zealotry from living in a faction with a philosophy
      if (this.factionManager && zealotry.zealotry < 0.3 && Math.random() < 0.002) {
        const faction = this.factionManager.getFaction(id);
        if (faction && faction.philosophy) {
          zealotry.zealotry = clamp(zealotry.zealotry + 0.005, 0, 1);
        }
      }

      // Heresy: creature's behavior conflicts with faction philosophy
      if (this.factionManager && zealotry.zealotry > 0.2) {
        const faction = this.factionManager.getFaction(id);
        if (faction && faction.doctrine && faction.doctrine.length > 0) {
          const phil = factionPhilosophies.get(faction.id);
          if (phil) {
            const behavior = getBehavior(id);
            const total = behavior.gatherCount + behavior.huntCount + behavior.buildCount +
                         behavior.craftCount + behavior.fightCount + behavior.tradeCount + behavior.farmCount;
            if (total > 20) {
              const dominantAct = this.dominantActivity(behavior);
              const philAct = this.philosophyActivity(phil);
              if (dominantAct !== philAct && Math.random() < 0.005) {
                // Internal conflict — small pain
                const biochem = BiochemStore.get(id);
                if (biochem) {
                  biochem.chemicals[ChemId.Pain] = clamp(
                    biochem.chemicals[ChemId.Pain] + 0.001, 0, 1);
                }
              }
            }
          }
        }
      }
    }

    // Update faction philosophies periodically
    this.philTimer++;
    if (this.philTimer >= PHILOSOPHY_UPDATE_INTERVAL && this.factionManager) {
      this.philTimer = 0;
      this.updateFactionPhilosophies(entities);
    }

    // Check for schisms periodically
    this.schismTimer++;
    if (this.schismTimer >= SCHISM_CHECK_INTERVAL && this.factionManager) {
      this.schismTimer = 0;
      this.checkSchisms(entities);
    }

    // Update cult stance counts every 500 ticks
    this.cultCountTimer++;
    if (this.cultCountTimer >= 500 && this.divinePower) {
      this.cultCountTimer = 0;
      let followers = 0, devotees = 0, terrorC = 0, aweC = 0, rebels = 0;
      for (const id of entities) {
        const z = ZealotryStore.get(id);
        if (!z || z.deity !== 0) continue;
        if (z.zealotry > 0.1) followers++;
        switch (z.stance) {
          case CultStance.Devotion: devotees++; break;
          case CultStance.Terror: terrorC++; break;
          case CultStance.Awe: aweC++; break;
          case CultStance.Rebellion: rebels++; break;
        }
      }
      this.divinePower.followerCount = followers;
      this.divinePower.devoteeCount = devotees;
      this.divinePower.terrorCount = terrorC;
      this.divinePower.aweCount = aweC;
      this.divinePower.rebelCount = rebels;
      updatePowerCap(this.divinePower);
    }
  }

  /** Track what activities creatures are doing to build behavior profiles */
  private trackBehavior(entities: number[]): void {
    for (const id of entities) {
      const social = SocialStore.get(id);
      if (!social) continue;
      const goal = GoalStore.get(id);
      const behavior = getBehavior(id);

      // Track from current activity
      switch (social.activity) {
        case Activity.Gathering: behavior.gatherCount++; break;
        case Activity.Fighting:  behavior.fightCount++; break;
        case Activity.Building:  behavior.buildCount++; break;
      }

      // Track from active goal
      if (goal) {
        const g = goal.activeGoal as number;
        if (g === GoalType.FindFood as number) behavior.gatherCount += 0.5;
        else if (g === GoalType.BuildShelter as number) behavior.buildCount += 0.5;
        else if (g === GoalType.CraftTool as number) behavior.craftCount += 0.5;
        else if (g === GoalType.Trade as number) behavior.tradeCount += 0.5;
        else if (g === GoalType.Farm as number) behavior.farmCount += 0.5;
        else if (g === GoalType.Defend as number) behavior.fightCount += 0.5;
      }
    }
  }

  /** Update philosophy for each faction based on member behavior patterns */
  private updateFactionPhilosophies(entities: number[]): void {
    if (!this.factionManager) return;

    for (const faction of this.factionManager.activeFactions) {
      if (faction.name === 'Wanderers') continue; // no philosophy for clanless
      if (faction.memberIds.size < 2) continue;

      // Aggregate member traits and behavior
      let aggSum = 0, socSum = 0, curSum = 0, creSum = 0;
      let gthSum = 0, hntSum = 0, bldSum = 0, hrdSum = 0;
      let count = 0;
      const biomeCounts = new Map<number, number>();

      for (const memberId of faction.memberIds) {
        const gen = GenomeStore.get(memberId);
        if (!gen) continue;
        const g = gen.genome;
        aggSum += g.aggression;
        socSum += g.sociability;
        curSum += g.curiosity;
        creSum += g.creativity;
        gthSum += g.gatherAffinity;
        hntSum += g.huntAffinity;
        bldSum += g.buildAffinity;
        hrdSum += g.hoardAffinity;
        count++;

        // Determine biome from position
        if (this.grid) {
          const transform = TransformStore.get(memberId);
          if (transform) {
            const biome = this.grid.getBiomeAt(transform.x, transform.z);
            biomeCounts.set(biome, (biomeCounts.get(biome) ?? 0) + 1);
          }
        }
      }

      if (count === 0) continue;

      // Find dominant biome
      let dominantBiome = 'Meadow';
      let maxBiomeCount = 0;
      for (const [biome, cnt] of biomeCounts) {
        if (cnt > maxBiomeCount) {
          maxBiomeCount = cnt;
          dominantBiome = BIOME_NAMES[biome] ?? 'Meadow';
        }
      }

      const profile = {
        avgAggression: aggSum / count,
        avgSociability: socSum / count,
        avgCuriosity: curSum / count,
        avgCreativity: creSum / count,
        avgGatherAffinity: gthSum / count,
        avgHuntAffinity: hntSum / count,
        avgBuildAffinity: bldSum / count,
        avgHoardAffinity: hrdSum / count,
        dominantBiome,
      };

      const phil = matchPhilosophy(profile);
      factionPhilosophies.set(faction.id, phil);

      // Update faction fields
      faction.philosophy = phil.name;
      faction.doctrine = phil.symbols.slice(0, 3);
    }
  }

  /** Check if any faction should undergo a schism (split) */
  private checkSchisms(entities: number[]): void {
    if (!this.factionManager) return;

    for (const faction of this.factionManager.activeFactions) {
      if (faction.name === 'Wanderers') continue;
      if (faction.memberIds.size < 6) continue; // need enough members to split

      const phil = factionPhilosophies.get(faction.id);
      if (!phil) continue;

      // Count members whose behavior diverges from faction philosophy
      const philAct = this.philosophyActivity(phil);
      let dissidents = 0;
      const dissidentIds: number[] = [];

      for (const memberId of faction.memberIds) {
        const behavior = getBehavior(memberId);
        const total = behavior.gatherCount + behavior.huntCount + behavior.buildCount +
                     behavior.craftCount + behavior.fightCount + behavior.tradeCount + behavior.farmCount;
        if (total < 30) continue; // not enough data

        const dominantAct = this.dominantActivity(behavior);
        if (dominantAct !== philAct) {
          dissidents++;
          dissidentIds.push(memberId);
        }
      }

      // Schism if >40% of members are dissidents
      const threshold = Math.floor(faction.memberIds.size * 0.4);
      if (dissidents >= threshold && dissidentIds.length >= 3) {
        // Only schism 20% of the time to prevent constant splitting
        if (Math.random() > 0.2) continue;

        // Dissidents leave and form new faction
        const newFaction = (this.factionManager as any).formClan(dissidentIds, this.tickCount);
        if (newFaction) {
          // Update social components
          for (const mid of dissidentIds) {
            const social = SocialStore.get(mid);
            if (social) {
              social.factionId = newFaction.id;
              const dVocab = VocabularyStore.get(mid);
              if (dVocab) {
                social.speechEmoji = learnAndPick(dVocab, SYMBOLS.freedom);
                social.speechTimer = 60;
              }
            }
          }

          // New faction starts with slight antagonism to parent
          this.factionManager.setRelation(faction.id, newFaction.id, -0.2);
        }
      }
    }
  }

  private dominantActivity(b: BehaviorProfile): string {
    const acts: [string, number][] = [
      ['gather', b.gatherCount],
      ['hunt', b.huntCount],
      ['build', b.buildCount],
      ['craft', b.craftCount],
      ['fight', b.fightCount],
      ['trade', b.tradeCount],
      ['farm', b.farmCount],
    ];
    acts.sort((a, b) => b[1] - a[1]);
    return acts[0][0];
  }

  private philosophyActivity(phil: PhilosophyArchetype): string {
    // Map philosophy to dominant activity
    const bias = phil.traitBias;
    if ((bias.gatherAffinity ?? 0) >= 0.2) return 'gather';
    if ((bias.huntAffinity ?? 0) >= 0.15) return 'hunt';
    if ((bias.buildAffinity ?? 0) >= 0.15) return 'build';
    if ((bias.aggression ?? 0) >= 0.2) return 'fight';
    if ((bias.hoardAffinity ?? 0) >= 0.15) return 'trade';
    if ((bias.sociability ?? 0) >= 0.2) return 'trade';
    return 'gather'; // default
  }

  /** Clean up behavior data for dead entities */
  cleanup(entityId: number): void {
    memberBehavior.delete(entityId);
  }
}
