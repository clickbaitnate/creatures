import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SocialStore, Activity } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BuildingStore, BuildingType } from '../components/Building';
import { InventoryStore, addItem, removeItem, countItem, ItemType, isFood } from '../components/Inventory';
import { BiochemStore } from '../components/Biochemistry';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';
import type { FactionManager } from '../world/FactionSystem';

const TRADE_RANGE_SQ = 8 * 8;
const TRADE_COOLDOWN = 100;

interface MarketPrice {
  item: ItemType;
  price: number;
}

export interface FactionMarket {
  factionId: number;
  prices: Map<ItemType, number>;
  tradeVolume: number;
}

export class MarketSystem extends System {
  readonly query = SocialStore.bit | TransformStore.bit | InventoryStore.bit;
  readonly priority = 44;

  factionManager: FactionManager | null = null;
  markets = new Map<number, FactionMarket>();
  private tradeTimers = new Map<number, number>();

  update(world: World, _dt: number): void {
    if (!this.factionManager) return;

    const creatures = world.query(this.query);
    const buildings = world.query(BuildingStore.bit | TransformStore.bit);

    // Update market prices per faction with granary
    this.updatePrices(world, buildings);

    // Trade interactions
    for (const id of creatures) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      let timer = this.tradeTimers.get(id) ?? 0;
      if (timer > 0) {
        this.tradeTimers.set(id, timer - 1);
        continue;
      }

      const social = SocialStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const inv = InventoryStore.get(id)!;

      // Find nearby creatures from different friendly factions
      for (const otherId of creatures) {
        if (otherId === id) continue;
        const otherLifecycle = LifecycleStore.get(otherId);
        if (otherLifecycle && otherLifecycle.stage === LifeStage.Dead) continue;

        const otherSocial = SocialStore.get(otherId)!;
        if (otherSocial.factionId === social.factionId) continue;

        const relation = this.factionManager.getRelation(social.factionId, otherSocial.factionId);
        if (relation < 0.1) continue; // need friendly relations

        const otherTransform = TransformStore.get(otherId)!;
        if (distSq(transform.x, transform.z, otherTransform.x, otherTransform.z) > TRADE_RANGE_SQ) continue;

        const otherInv = InventoryStore.get(otherId);
        if (!otherInv) continue;

        // Auto-trade: each trades surplus for what they lack
        if (this.executeTrade(id, otherId, inv, otherInv)) {
          social.activity = Activity.Talking;
          social.speechEmoji = '🤝';
          social.speechTimer = 30;
          otherSocial.speechEmoji = '📦';
          otherSocial.speechTimer = 30;

          // Reward both traders
          const biochem = BiochemStore.get(id);
          if (biochem) biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.1, 0, 1);
          const otherBiochem = BiochemStore.get(otherId);
          if (otherBiochem) otherBiochem.chemicals[ChemId.Reward] = clamp(otherBiochem.chemicals[ChemId.Reward] + 0.1, 0, 1);

          // Improve relations
          this.factionManager.setRelation(social.factionId, otherSocial.factionId,
            clamp(relation + 0.05, -1, 1));

          // Track volume
          const market = this.markets.get(social.factionId);
          if (market) market.tradeVolume++;

          this.tradeTimers.set(id, TRADE_COOLDOWN);
          break; // one trade per tick
        }
      }
    }
  }

  private executeTrade(idA: number, idB: number, invA: any, invB: any): boolean {
    // Find something A has in surplus and B lacks
    const TRADEABLE = [ItemType.RawBerry, ItemType.RawGrass, ItemType.RawRoot, ItemType.RawWood, ItemType.RawStone, ItemType.RawMeat];

    let bestSellItem: ItemType | null = null;
    let bestBuyItem: ItemType | null = null;
    let bestSellCount = 0;

    for (const item of TRADEABLE) {
      const countA = countItem(invA, item);
      const countB = countItem(invB, item);
      if (countA >= 3 && countA > bestSellCount) {
        bestSellItem = item;
        bestSellCount = countA;
      }
      if (countB >= 3 && countItem(invA, item) < 2) {
        bestBuyItem = item;
      }
    }

    if (bestSellItem !== null && bestBuyItem !== null && bestSellItem !== bestBuyItem) {
      removeItem(invA, bestSellItem, 2);
      addItem(invB, bestSellItem, 2);
      removeItem(invB, bestBuyItem!, 2);
      addItem(invA, bestBuyItem!, 2);
      return true;
    }

    return false;
  }

  private updatePrices(world: World, buildings: number[]): void {
    if (!this.factionManager) return;

    for (const faction of this.factionManager.activeFactions) {
      // Check if faction has a granary (market)
      let hasGranary = false;
      for (const bid of buildings) {
        const b = BuildingStore.get(bid)!;
        if (b.factionId === faction.id && b.type === BuildingType.Granary) {
          hasGranary = true;
          break;
        }
      }
      if (!hasGranary) continue;

      if (!this.markets.has(faction.id)) {
        this.markets.set(faction.id, {
          factionId: faction.id,
          prices: new Map(),
          tradeVolume: 0,
        });
      }

      const market = this.markets.get(faction.id)!;
      const BASE_COST = 1.0;

      // Count faction supply of each item
      const supply = new Map<ItemType, number>();
      for (const memberId of faction.memberIds) {
        const inv = InventoryStore.get(memberId);
        if (!inv) continue;
        for (const slot of inv.slots) {
          if (slot.item !== -1 && slot.count > 0) {
            supply.set(slot.item as ItemType, (supply.get(slot.item as ItemType) ?? 0) + slot.count);
          }
        }
      }

      // Compute prices
      const ITEMS = [ItemType.RawBerry, ItemType.RawGrass, ItemType.RawRoot, ItemType.RawWood, ItemType.RawStone, ItemType.RawOre, ItemType.RawMeat];
      for (const item of ITEMS) {
        const s = supply.get(item) ?? 0;
        market.prices.set(item, BASE_COST / (1 + s * 0.1));
      }
    }
  }
}
