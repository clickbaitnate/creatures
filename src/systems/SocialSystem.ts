import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SocialStore, Activity } from '../components/Social';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { SensesStore } from '../components/Senses';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ExpressionStore } from '../components/Expression';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { InventoryStore, getBestWeapon, getArmorReduction } from '../components/Inventory';
import { distSq, clamp } from '../utils/Math';
import type { FactionManager } from '../world/FactionSystem';
import type { HierarchySystem } from '../world/HierarchySystem';
import type { PoliticsSystem } from '../world/PoliticsSystem';
import {
  EMOTIONS, NEEDS, ACTIVITIES, SOCIAL_SPEECH, SYMBOLS,
  emotionEmoji, pick,
} from '../world/EmojiVocabulary';
import { MemoryStore, MemoryType } from '../components/Memory';
import { VocabularyStore, learn, pickKnown, learnAndPick } from '../components/Vocabulary';
import type { SeasonState } from '../world/Seasons';
import { Season } from '../world/Seasons';

const TALK_RANGE_SQ = 4 * 4;
const FIGHT_RANGE_SQ = 2.5 * 2.5;
const TALK_COOLDOWN = 40;
const FIGHT_COOLDOWN = 20;
const CHALLENGE_RANGE_SQ = 3 * 3;
const CHALLENGE_COOLDOWN = 100;
const CLAN_CHECK_INTERVAL = 200; // try forming clans every 200 ticks

export class SocialSystem extends System {
  readonly query = SocialStore.bit | TransformStore.bit | GenomeStore.bit;
  readonly priority = 45;

  factionManager: FactionManager | null = null;
  hierarchySystem: HierarchySystem | null = null;
  politicsSystem: PoliticsSystem | null = null;
  seasonState: SeasonState | null = null;
  private talkTimers = new Map<number, number>();
  private challengeTimers = new Map<number, number>();
  private clanCheckTimer = 0;
  private tickCount = 0;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    this.tickCount++;

    // Periodically try to form clans from bonded clanless creatures
    this.clanCheckTimer++;
    if (this.clanCheckTimer >= CLAN_CHECK_INTERVAL && this.factionManager) {
      this.clanCheckTimer = 0;
      const newClan = this.factionManager.tryFormClan(this.tickCount);
      if (newClan) {
        // Update social components for new clan members
        for (const memberId of newClan.memberIds) {
          const social = SocialStore.get(memberId);
          if (social) {
            social.factionId = newClan.id;
            const vocab = VocabularyStore.get(memberId);
            if (vocab) {
              social.speechEmoji = learnAndPick(vocab, EMOTIONS.pride);
              social.speechTimer = 60;
            }
          }
        }
      }
    }

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const senses = SensesStore.get(id);
      const expr = ExpressionStore.get(id);
      const vocab = VocabularyStore.get(id);

      // Decrement timers
      if (social.speechTimer > 0) social.speechTimer--;
      if (social.attackCooldown > 0) social.attackCooldown--;
      if (social.matingTimer > 0) {
        social.matingTimer--;
        if (social.matingTimer <= 0) {
          social.activity = Activity.Idle;
          social.mateTarget = -1;
        }
      }

      let talkTimer = this.talkTimers.get(id) ?? 0;
      if (talkTimer > 0) {
        this.talkTimers.set(id, talkTimer - 1);
        continue;
      }

      if (!senses || !senses.creatureVisible || senses.nearestCreatureId < 0) continue;

      const otherId = senses.nearestCreatureId;
      if (!world.has(otherId)) continue;

      const otherSocial = SocialStore.get(otherId);
      if (!otherSocial) continue;

      const otherTransform = TransformStore.get(otherId)!;
      const dsq = distSq(transform.x, transform.z, otherTransform.x, otherTransform.z);

      // Determine interaction based on faction relationship
      const myFaction = social.factionId;
      const theirFaction = otherSocial.factionId;
      const relation = this.factionManager?.getRelation(myFaction, theirFaction) ?? 0;

      // Emotional contagion: nearby creatures' moods blend slightly
      if (dsq < TALK_RANGE_SQ) {
        const otherExpr = ExpressionStore.get(otherId);
        if (expr && otherExpr) {
          const blend = 0.02; // subtle mood transfer
          expr.fear = clamp(expr.fear + (otherExpr.fear - expr.fear) * blend, 0, 1);
          expr.happiness = clamp(expr.happiness + (otherExpr.happiness - expr.happiness) * blend, 0, 1);
          expr.anger = clamp(expr.anger + (otherExpr.anger - expr.anger) * blend, 0, 1);
        }
      }

      // Close enough to talk?
      if (dsq < TALK_RANGE_SQ) {
        // Same faction: friendly interactions
        if (myFaction === theirFaction) {
          if (Math.random() < genome.sociability * 0.1) {
            // Choose emoji based on emotional state — vocab-gated
            const speech = vocab ? this.contextualSpeech(vocab, 'friendly', expr, biochem) : null;
            if (speech) {
              social.speechEmoji = speech;
              social.speechTimer = 50;
            }
            social.activity = Activity.Talking;
            this.talkTimers.set(id, TALK_COOLDOWN);

            // Vocabulary sharing: each creature learns 1-2 random emojis from the other
            const myVocab = VocabularyStore.get(id);
            const theirVocab = VocabularyStore.get(otherId);
            if (myVocab && theirVocab) {
              const theirKnown = Array.from(theirVocab.known);
              const myKnown = Array.from(myVocab.known);
              // I learn from them
              for (let vi = 0; vi < 2 && theirKnown.length > 0; vi++) {
                const pick = theirKnown[Math.floor(Math.random() * theirKnown.length)];
                learn(myVocab, pick);
              }
              // They learn from me
              for (let vi = 0; vi < 2 && myKnown.length > 0; vi++) {
                const pick = myKnown[Math.floor(Math.random() * myKnown.length)];
                learn(theirVocab, pick);
              }
            }

            // Record positive bond
            this.factionManager?.recordInteraction(id, otherId, true);
          }
        }
        // Allied faction
        else if (relation > 0.3) {
          if (Math.random() < genome.sociability * 0.05) {
            const speech = vocab
              ? (Math.random() < 0.5 ? pickKnown(vocab, ACTIVITIES.trade) : pickKnown(vocab, SOCIAL_SPEECH.greet))
              : null;
            if (speech) {
              social.speechEmoji = speech;
              social.speechTimer = 50;
            }
            social.activity = Activity.Talking;
            this.talkTimers.set(id, TALK_COOLDOWN);
            // Strengthen alliance
            if (this.factionManager) {
              this.factionManager.setRelation(myFaction, theirFaction,
                clamp(relation + 0.01, -1, 1));
            }
            // Record positive bond
            this.factionManager?.recordInteraction(id, otherId, true);
          }
        }
        // Enemy faction
        else if (relation < -0.3) {
          const atWar = this.politicsSystem?.isAtWar(myFaction, theirFaction) ?? false;
          if (dsq < FIGHT_RANGE_SQ && social.attackCooldown <= 0) {
            // Fight! Higher aggression during war. Anxiety boosts fight chance.
            const anxietyBoost = expr ? expr.anxiety * 0.1 : 0;
            const fightChance = (atWar ? genome.aggression * 0.3 : genome.aggression * 0.15) + anxietyBoost;
            if (Math.random() < fightChance) {
              if (vocab) {
                social.speechEmoji = learnAndPick(vocab, EMOTIONS.rage);
                social.speechTimer = 35;
              }
              social.activity = Activity.Fighting;
              social.attackTarget = otherId;
              social.attackCooldown = FIGHT_COOLDOWN;

              // Deal damage — apply weapon multiplier and armor reduction
              const inv = InventoryStore.get(id);
              const otherInv = InventoryStore.get(otherId);
              let weaponMult = 1.0;
              let armorReduce = 0;
              if (inv) {
                const best = getBestWeapon(inv);
                weaponMult = best.damage;
              }
              if (otherInv) {
                armorReduce = getArmorReduction(otherInv);
              }
              const rawDmg = 0.08 * genome.aggression * weaponMult;
              const finalDmg = rawDmg * (1 - armorReduce);
              otherSocial.health = clamp(otherSocial.health - finalDmg, 0, 1);
              if (biochem) biochem.chemicals[ChemId.Pain] = clamp(biochem.chemicals[ChemId.Pain] + 0.1, 0, 1);

              // Vocabulary: fighting teaches combat emojis
              const myVocab2 = VocabularyStore.get(id);
              if (myVocab2) learn(myVocab2, '⚔️');
              const theirVocab2 = VocabularyStore.get(otherId);
              if (theirVocab2 && armorReduce > 0) learn(theirVocab2, '🛡️');

              // Other retaliates with speech
              const otherVocab = VocabularyStore.get(otherId);
              if (otherVocab) {
                otherSocial.speechEmoji = learnAndPick(otherVocab, EMOTIONS.anger);
                otherSocial.speechTimer = 30;
              }

              // Worsen relations
              if (this.factionManager) {
                this.factionManager.setRelation(myFaction, theirFaction,
                  clamp(relation - 0.05, -1, 1));
              }

              // Record negative bond
              this.factionManager?.recordInteraction(id, otherId, false);
            }
          } else {
            // Threaten from distance
            if (Math.random() < genome.aggression * 0.05) {
              if (vocab) {
                const warn = pickKnown(vocab, SOCIAL_SPEECH.warning);
                if (warn) {
                  social.speechEmoji = warn;
                  social.speechTimer = 40;
                }
              }
              this.talkTimers.set(id, TALK_COOLDOWN);

              // Record negative bond
              this.factionManager?.recordInteraction(id, otherId, false);
            }
          }
        }
        // Neutral — might establish diplomacy
        else {
          if (Math.random() < 0.02) {
            const willBecome = genome.aggression > 0.5 && Math.random() < genome.aggression * 0.3
              ? -0.1  // slight hostility
              : 0.1;  // slight friendship
            if (this.factionManager) {
              this.factionManager.setRelation(myFaction, theirFaction,
                clamp(relation + willBecome, -1, 1));
            }
            if (vocab) {
              const speech = willBecome > 0 ? pickKnown(vocab, SOCIAL_SPEECH.greet) : pickKnown(vocab, EMOTIONS.nervous);
              if (speech) {
                social.speechEmoji = speech;
                social.speechTimer = 45;
              }
            }
            this.talkTimers.set(id, TALK_COOLDOWN * 2);

            // Record bond based on outcome
            this.factionManager?.recordInteraction(id, otherId, willBecome > 0);
          }
        }
      }

      // Dominance challenges (same faction, close enough, similar rank)
      if (dsq < CHALLENGE_RANGE_SQ && myFaction === theirFaction && this.hierarchySystem) {
        let challengeTimer = this.challengeTimers.get(id) ?? 0;
        if (challengeTimer > 0) {
          this.challengeTimers.set(id, challengeTimer - 1);
        } else {
          const myRank = this.hierarchySystem.getRank(id);
          const theirRank = this.hierarchySystem.getRank(otherId);
          const rankDiff = Math.abs(myRank - theirRank);

          // Challenge if ranks are close and both aggressive enough
          if (rankDiff < 0.3 && genome.aggression > 0.3 && Math.random() < genome.aggression * 0.02) {
            // Non-lethal challenge
            const myStr = genome.aggression * 0.4 + genome.bodyScale * 0.3 + (biochem?.chemicals[ChemId.Energy] ?? 0.5) * 0.3;
            const otherGenome = GenomeStore.get(otherId)!.genome;
            const otherBiochem2 = BiochemStore.get(otherId);
            const theirStr = otherGenome.aggression * 0.4 + otherGenome.bodyScale * 0.3 + (otherBiochem2?.chemicals[ChemId.Energy] ?? 0.5) * 0.3;

            if (vocab) {
              social.speechEmoji = learnAndPick(vocab, SOCIAL_SPEECH.boast);
              social.speechTimer = 30;
            }
            const otherVocab3 = VocabularyStore.get(otherId);
            if (otherVocab3) {
              otherSocial.speechEmoji = myStr > theirStr
                ? learnAndPick(otherVocab3, EMOTIONS.fear)
                : learnAndPick(otherVocab3, SOCIAL_SPEECH.boast);
              otherSocial.speechTimer = 30;
            }

            if (myStr > theirStr) {
              this.hierarchySystem.recordWin(id);
            } else {
              this.hierarchySystem.recordWin(otherId);
            }

            this.challengeTimers.set(id, CHALLENGE_COOLDOWN);
            this.challengeTimers.set(otherId, CHALLENGE_COOLDOWN);

            // Challenges still build bonds (shared experience)
            this.factionManager?.recordInteraction(id, otherId, true);
          }

          // Social deference — lower rank shows submission to higher rank
          if (myRank < theirRank - 0.2 && Math.random() < 0.01) {
            if (vocab) {
              const plead = pickKnown(vocab, SOCIAL_SPEECH.plead);
              if (plead) {
                social.speechEmoji = plead;
                social.speechTimer = 20;
              }
            }
            this.talkTimers.set(id, TALK_COOLDOWN);
          }
        }
      }

      // Emotional expression when alone or near others — vocab-gated contextual emojis
      if (biochem && vocab) {
        // Hunger makes creatures express food needs (learn through experience)
        if (biochem.chemicals[ChemId.Hunger] > 0.6 && Math.random() < 0.02) {
          social.speechEmoji = learnAndPick(vocab, NEEDS.hunger);
          social.speechTimer = 40;
          this.talkTimers.set(id, TALK_COOLDOWN);
        }
        // Pain expression
        else if (biochem.chemicals[ChemId.Pain] > 0.5 && Math.random() < 0.015) {
          social.speechEmoji = learnAndPick(vocab, EMOTIONS.pain);
          social.speechTimer = 35;
          this.talkTimers.set(id, TALK_COOLDOWN);
        }
        // Tiredness
        else if (biochem.chemicals[ChemId.Tiredness] > 0.7 && Math.random() < 0.01) {
          social.speechEmoji = learnAndPick(vocab, EMOTIONS.tired);
          social.speechTimer = 30;
          this.talkTimers.set(id, TALK_COOLDOWN);
        }
        // Contentment when well-fed and healthy
        else if (biochem.chemicals[ChemId.Energy] > 0.7 && biochem.chemicals[ChemId.Hunger] < 0.2 && Math.random() < 0.005) {
          social.speechEmoji = learnAndPick(vocab, EMOTIONS.bliss);
          social.speechTimer = 40;
          this.talkTimers.set(id, TALK_COOLDOWN);
        }
        // Anxiety expression
        else if (expr && expr.anxiety > 0.4 && Math.random() < 0.015) {
          // 😡 and 😰 are either innate or learned through experience
          social.speechEmoji = expr.anxiety > 0.7 ? '😡' : '😨';
          social.speechTimer = 35;
          this.talkTimers.set(id, TALK_COOLDOWN);
        }
        // Curiosity when exploring
        else if (genome.curiosity > 0.5 && social.activity === Activity.Walking && Math.random() < 0.005) {
          social.speechEmoji = learnAndPick(vocab, EMOTIONS.curious);
          social.speechTimer = 30;
          this.talkTimers.set(id, TALK_COOLDOWN * 2);
        }
      }

      // Seasonal speech: creatures comment on weather (learn through experience)
      if (this.seasonState && vocab && Math.random() < 0.003) {
        const season = this.seasonState.season;
        if (season === Season.Winter) {
          social.speechEmoji = learnAndPick(vocab, NEEDS.cold);
          social.speechTimer = 30;
          this.talkTimers.set(id, TALK_COOLDOWN * 2);
        } else if (season === Season.Summer) {
          social.speechEmoji = learnAndPick(vocab, NEEDS.warmth);
          social.speechTimer = 25;
          this.talkTimers.set(id, TALK_COOLDOWN * 3);
        }
      }

      // Memory-based hostile warnings: warn friends about remembered hostiles
      const memory = MemoryStore.get(id);
      if (memory && vocab && senses?.creatureVisible && senses.nearestCreatureId >= 0) {
        for (const mem of memory.entries) {
          if (mem.type === MemoryType.HostileIndividual && mem.entityId === senses.nearestCreatureId && mem.strength > 0.3) {
            if (Math.random() < 0.02) {
              const warn = pickKnown(vocab, SOCIAL_SPEECH.warning);
              if (warn) {
                social.speechEmoji = warn;
                social.speechTimer = 35;
                this.talkTimers.set(id, TALK_COOLDOWN);
              }
            }
            break;
          }
        }
        // Remembered friends boost happiness in context speech
        for (const mem of memory.entries) {
          if (mem.type === MemoryType.FriendlyIndividual && mem.entityId === senses.nearestCreatureId && mem.strength > 0.3) {
            if (Math.random() < 0.01) {
              const joy = pickKnown(vocab, EMOTIONS.joy);
              if (joy) {
                social.speechEmoji = joy;
                social.speechTimer = 30;
                this.talkTimers.set(id, TALK_COOLDOWN);
              }
            }
            break;
          }
        }
      }

      // Activity-based expression (vocab-gated)
      if (vocab) {
        if (social.activity === Activity.Gathering && Math.random() < 0.008) {
          const g = pickKnown(vocab, ACTIVITIES.gather);
          if (g) { social.speechEmoji = g; social.speechTimer = 30; }
        } else if (social.activity === Activity.Building && Math.random() < 0.008) {
          const b = pickKnown(vocab, ACTIVITIES.build);
          if (b) { social.speechEmoji = b; social.speechTimer = 30; }
        }
      }

      // Health-based death from combat
      if (social.health <= 0) {
        if (lifecycle) lifecycle.stage = LifeStage.Dead;
      }
    }
  }

  /** Choose context-appropriate emoji based on emotional state — vocab-gated */
  private contextualSpeech(
    vocab: import('../components/Vocabulary').VocabularyData,
    context: 'friendly' | 'hostile' | 'neutral',
    expr: { happiness: number; fear: number; anger: number; curiosity: number; tiredness: number; pain: number } | undefined,
    biochem: { chemicals: Float32Array } | undefined,
  ): string | null {
    if (!expr || !biochem) {
      return context === 'friendly'
        ? pickKnown(vocab, SOCIAL_SPEECH.greet)
        : pickKnown(vocab, EMOTIONS.anger);
    }

    const hunger = biochem.chemicals[ChemId.Hunger];

    if (context === 'friendly') {
      // Dominant emotion drives speech
      if (expr.happiness > 0.5) {
        const r = Math.random();
        if (r < 0.3) return pickKnown(vocab, EMOTIONS.joy);
        if (r < 0.5) return pickKnown(vocab, SOCIAL_SPEECH.joke);
        if (r < 0.7) return pickKnown(vocab, SOCIAL_SPEECH.gossip);
        return pickKnown(vocab, SOCIAL_SPEECH.greet);
      }
      if (hunger > 0.5) return pickKnown(vocab, NEEDS.hunger);
      if (expr.fear > 0.3) return pickKnown(vocab, SOCIAL_SPEECH.warning);
      if (expr.curiosity > 0.4) {
        return Math.random() < 0.5
          ? pickKnown(vocab, SOCIAL_SPEECH.story)
          : pickKnown(vocab, EMOTIONS.curious);
      }
      if (expr.tiredness > 0.5) return pickKnown(vocab, EMOTIONS.tired);
      return pickKnown(vocab, SOCIAL_SPEECH.greet);
    }

    // Hostile/neutral: pick from known emotion emojis
    const pools = [EMOTIONS.joy, EMOTIONS.fear, EMOTIONS.anger, EMOTIONS.curious, EMOTIONS.tired, EMOTIONS.pain];
    const vals = [expr.happiness, expr.fear, expr.anger, expr.curiosity, expr.tiredness, expr.pain];
    let bestIdx = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] > vals[bestIdx]) bestIdx = i;
    }
    return pickKnown(vocab, pools[bestIdx]);
  }
}
