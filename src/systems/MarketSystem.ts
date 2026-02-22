// Proximity Barter: creatures trade directly with nearby creatures.
// Trader caste (high sociability + hoardAffinity) develops trade routes between settlements.

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SocialStore, Activity } from '../components/Social';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, addItem, removeItem, countItem, hasSpace, ItemType, isFood, totalItems } from '../components/Inventory';
import { BiochemStore } from '../components/Biochemistry';
import { MotorStore } from '../components/Motor';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';
import { VocabularyStore, learn } from '../components/Vocabulary';
import type { FactionManager } from '../world/FactionSystem';

const BARTER_RANGE_SQ = 3.5 * 3.5; // must be in earshot (~3.5 units)
const BARTER_COOLDOWN = 100;
const TRADER_RANGE_SQ = 6 * 6; // traders barter from slightly farther
const TRADER_SEEK_RANGE_SQ = 40 * 40; // traders scan for trade partners far away
const TRADER_THRESHOLD = 0.65; // sociability + hoardAffinity threshold for trader caste

// Items creatures are willing to trade away (surplus > 2)
const TRADEABLE_ITEMS: ItemType[] = [
  ItemType.RawBerry, ItemType.RawGrass, ItemType.RawRoot,
  ItemType.RawWood, ItemType.RawStone, ItemType.RawOre, ItemType.RawMeat,
  ItemType.Plank, ItemType.CutStone, ItemType.MetalIngot,
  ItemType.StoneAxe, ItemType.StonePick, ItemType.MetalAxe, ItemType.MetalPick,
  ItemType.FoodBundle, ItemType.Torch, ItemType.Boat,
  ItemType.Coal, ItemType.RawIron, ItemType.RawGold,
  ItemType.IronIngot, ItemType.GoldIngot, ItemType.IronSword, ItemType.IronArmor,
  ItemType.WoodSword, ItemType.StoneSword, ItemType.Shield,
];

/** Determine if a genome makes a creature a trader caste */
function isTrader(genome: { sociability: number; hoardAffinity: number }): boolean {
  return (genome.sociability + genome.hoardAffinity) / 2 > TRADER_THRESHOLD;
}

export class MarketSystem extends System {
  readonly query = SocialStore.bit | TransformStore.bit | InventoryStore.bit;
  readonly priority = 44;

  factionManager: FactionManager | null = null;
  totalTrades = 0;

  private barterTimers = new Map<number, number>();

  // Trader route memory: traders remember profitable trade partners
  private traderTargets = new Map<number, number>(); // trader -> target creature

  update(world: World, _dt: number): void {
    const creatures = world.query(this.query);

    for (const id of creatures) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      let timer = this.barterTimers.get(id) ?? 0;
      if (timer > 0) {
        this.barterTimers.set(id, timer - 1);
        continue;
      }

      const transform = TransformStore.get(id)!;
      const social = SocialStore.get(id)!;
      const inv = InventoryStore.get(id)!;
      const genome = GenomeStore.get(id)?.genome;
      if (!genome) continue;

      const amTrader = isTrader(genome);
      const tradeRangeSq = amTrader ? TRADER_RANGE_SQ : BARTER_RANGE_SQ;

      // Find nearest creature to trade with
      let bestPartnerId = -1;
      let bestDsq = Infinity;

      for (const otherId of creatures) {
        if (otherId === id) continue;
        const otherLC = LifecycleStore.get(otherId);
        if (otherLC && otherLC.stage === LifeStage.Dead) continue;

        const otherT = TransformStore.get(otherId)!;
        const dsq = distSq(transform.x, transform.z, otherT.x, otherT.z);
        if (dsq < tradeRangeSq && dsq < bestDsq) {
          bestDsq = dsq;
          bestPartnerId = otherId;
        }
      }

      if (bestPartnerId < 0) {
        // Trader caste: if no one nearby, walk toward distant creatures to trade
        if (amTrader) {
          this.traderSeekPartner(id, transform, creatures, world);
        }
        continue;
      }

      const otherInv = InventoryStore.get(bestPartnerId);
      const otherSocial = SocialStore.get(bestPartnerId);
      if (!otherInv || !otherSocial) continue;

      // Check faction relation — enemies don't trade (unless trader)
      const myFaction = social.factionId;
      const theirFaction = otherSocial.factionId;
      const relation = this.factionManager?.getRelation(myFaction, theirFaction) ?? 0;
      if (relation < -0.3 && !amTrader) continue;

      // Find complementary trade: I have surplus of X, they lack X, and vice versa
      const traded = this.attemptBarter(id, bestPartnerId, inv, otherInv);

      if (traded) {
        this.totalTrades++;

        // Both get reward
        const biochemA = BiochemStore.get(id);
        const biochemB = BiochemStore.get(bestPartnerId);
        if (biochemA) biochemA.chemicals[ChemId.Reward] = clamp(biochemA.chemicals[ChemId.Reward] + 0.08, 0, 1);
        if (biochemB) biochemB.chemicals[ChemId.Reward] = clamp(biochemB.chemicals[ChemId.Reward] + 0.08, 0, 1);

        // Speech (vocab-gated)
        const vocabA = VocabularyStore.get(id);
        if (vocabA) {
          learn(vocabA, '🤝');
          social.speechEmoji = '🤝';
          social.speechTimer = 30;
        }
        social.activity = Activity.Talking;

        const vocabB = VocabularyStore.get(bestPartnerId);
        if (vocabB) {
          learn(vocabB, '🤝');
          otherSocial.speechEmoji = '🤝';
          otherSocial.speechTimer = 30;
        }
        otherSocial.activity = Activity.Talking;

        // Improve relations
        if (this.factionManager && myFaction !== theirFaction) {
          this.factionManager.setRelation(myFaction, theirFaction,
            clamp(relation + 0.03, -1, 1));
        }
        this.factionManager?.recordInteraction(id, bestPartnerId, true);

        this.barterTimers.set(id, BARTER_COOLDOWN);
        this.barterTimers.set(bestPartnerId, BARTER_COOLDOWN);

        // Trader remembers this as a good route
        if (amTrader) {
          this.traderTargets.delete(id); // reached target, reset
        }
      }
    }
  }

  /** Attempt a complementary barter between two creatures.
   *  Returns true if a trade occurred. */
  private attemptBarter(
    idA: number, idB: number,
    invA: import('../components/Inventory').InventoryData,
    invB: import('../components/Inventory').InventoryData,
  ): boolean {
    // Find something A has surplus (3+) that B lacks (0)
    let giveA: ItemType | null = null;
    let giveB: ItemType | null = null;

    for (const item of TRADEABLE_ITEMS) {
      const countA = countItem(invA, item);
      const countB = countItem(invB, item);

      if (countA >= 3 && countB === 0 && giveA === null) {
        giveA = item; // A gives this to B
      }
      if (countB >= 3 && countA === 0 && giveB === null) {
        giveB = item; // B gives this to A
      }
    }

    // Need-based trading: prioritize food for hungry creatures
    if (!giveA && !giveB) {
      const biochemA = BiochemStore.get(idA);
      const biochemB = BiochemStore.get(idB);

      // A is hungry and B has food surplus
      if (biochemA && biochemA.chemicals[ChemId.Hunger] > 0.4) {
        for (const item of TRADEABLE_ITEMS) {
          if (isFood(item) && countItem(invB, item) >= 2 && countItem(invA, item) === 0) {
            giveB = item;
            // A gives something back
            for (const payItem of TRADEABLE_ITEMS) {
              if (!isFood(payItem) && countItem(invA, payItem) >= 2) {
                giveA = payItem;
                break;
              }
            }
            break;
          }
        }
      }
      // B is hungry and A has food surplus
      if (!giveB && biochemB && biochemB.chemicals[ChemId.Hunger] > 0.4) {
        for (const item of TRADEABLE_ITEMS) {
          if (isFood(item) && countItem(invA, item) >= 2 && countItem(invB, item) === 0) {
            giveA = item;
            // B gives something back
            for (const payItem of TRADEABLE_ITEMS) {
              if (!isFood(payItem) && countItem(invB, payItem) >= 2) {
                giveB = payItem;
                break;
              }
            }
            break;
          }
        }
      }
    }

    // Must have at least one side giving something
    if (!giveA && !giveB) return false;

    // Execute trade
    if (giveA !== null && hasSpace(invB)) {
      removeItem(invA, giveA, 1);
      addItem(invB, giveA, 1);
    }
    if (giveB !== null && hasSpace(invA)) {
      removeItem(invB, giveB, 1);
      addItem(invA, giveB, 1);
    }

    return true;
  }

  /** Trader caste: walk toward distant creatures to establish trade routes */
  private traderSeekPartner(
    id: number,
    transform: { x: number; z: number },
    creatures: number[],
    world: World,
  ): void {
    const motor = MotorStore.get(id);
    if (!motor) return;

    // Check if we have a target already
    let targetId = this.traderTargets.get(id) ?? -1;
    if (targetId >= 0 && world.has(targetId)) {
      const targetLC = LifecycleStore.get(targetId);
      if (targetLC && targetLC.stage !== LifeStage.Dead) {
        // Walk toward target
        const targetT = TransformStore.get(targetId)!;
        const dx = targetT.x - transform.x;
        const dz = targetT.z - transform.z;
        const dsq = dx * dx + dz * dz;

        if (dsq < TRADER_RANGE_SQ) {
          // Arrived — will trade on next tick
          this.traderTargets.delete(id);
          return;
        }

        // Navigate toward target
        (transform as any).rotation = Math.atan2(dx, dz);
        motor.forward = 1.0;
        return;
      }
    }

    // Find a new trade target — creature from different faction with complementary inventory
    const social = SocialStore.get(id)!;
    const inv = InventoryStore.get(id)!;
    let bestTarget = -1;
    let bestScore = -Infinity;

    for (const otherId of creatures) {
      if (otherId === id) continue;
      const otherLC = LifecycleStore.get(otherId);
      if (otherLC && otherLC.stage === LifeStage.Dead) continue;

      const otherT = TransformStore.get(otherId)!;
      const dsq = distSq(transform.x, transform.z, otherT.x, otherT.z);
      if (dsq > TRADER_SEEK_RANGE_SQ || dsq < TRADER_RANGE_SQ) continue;

      const otherSocial = SocialStore.get(otherId);
      const otherInv = InventoryStore.get(otherId);
      if (!otherSocial || !otherInv) continue;

      // Score: prefer different factions, complementary inventories
      let score = 0;
      if (otherSocial.factionId !== social.factionId) score += 2;

      // Count complementary items
      for (const item of TRADEABLE_ITEMS) {
        const myCount = countItem(inv, item);
        const theirCount = countItem(otherInv, item);
        if (myCount >= 3 && theirCount === 0) score += 1;
        if (theirCount >= 3 && myCount === 0) score += 1;
      }

      // Closer is better (within seek range)
      score -= Math.sqrt(dsq) * 0.02;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = otherId;
      }
    }

    if (bestTarget >= 0 && bestScore > 1) {
      this.traderTargets.set(id, bestTarget);
    }
  }
}
