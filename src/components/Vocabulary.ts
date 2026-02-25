import { ComponentStorage } from '../ecs/Component';
import { ItemType } from './Inventory';

export interface VocabularyData {
  known: Set<string>;
  recent: string[];
}

/** Emoji mappings from ItemType to display emoji */
export const ITEM_EMOJI: Partial<Record<ItemType, string>> = {
  [ItemType.RawBerry]: '🍎',
  [ItemType.RawGrass]: '🌿',
  [ItemType.RawRoot]: '🥕',
  [ItemType.RawWood]: '🪵',
  [ItemType.RawStone]: '🪨',
  [ItemType.RawOre]: '⛏️',
  [ItemType.RawMeat]: '🥩',
  [ItemType.Plank]: '🪵',
  [ItemType.CutStone]: '🧱',
  [ItemType.MetalIngot]: '⚙️',
  [ItemType.StoneAxe]: '🪓',
  [ItemType.StonePick]: '⛏️',
  [ItemType.MetalAxe]: '🪓',
  [ItemType.MetalPick]: '⛏️',
  [ItemType.FoodBundle]: '🍽️',
  [ItemType.Coal]: '⛏️',
  [ItemType.RawIron]: '⛏️',
  [ItemType.RawGold]: '⛏️',
  [ItemType.IronIngot]: '⚙️',
  [ItemType.GoldIngot]: '⚙️',
  [ItemType.Torch]: '🔥',
  [ItemType.IronSword]: '⚔️',
  [ItemType.IronArmor]: '🛡️',
  [ItemType.Boat]: '⛵',
  [ItemType.WoodSword]: '⚔️',
  [ItemType.StoneSword]: '⚔️',
  [ItemType.Shield]: '🛡️',
  [ItemType.Ship]: '🚢',
  [ItemType.RawFish]: '🐟',
  [ItemType.CookedMeat]: '🍖',
  [ItemType.CookedBerry]: '🍇',
  [ItemType.CookedFish]: '🍣',
  [ItemType.LargeMeat]: '🍗',
};

/** Create a new vocabulary starting with basic emotion, self, AND crafting emojis.
 *  All creatures know basic material and tool concepts innately so they can craft
 *  food bundles, crafting tables, and basic tools from day one. */
export function createVocabulary(): VocabularyData {
  return {
    known: new Set<string>([
      // Emotions & self
      '😊', '😢', '😡', '😨', '👤',
      // Basic materials (gathered from the world)
      '🍎', '🌿', '🪵', '🪨',
      // Crafting concepts (food, tools, weapons, shields)
      '🍽️', '⚔️', '🛡️', '⛏️',
      // Water, boat, fire — innate knowledge for boat crafting and cooking
      '💧', '⛵', '🔥',
    ]),
    recent: [],
  };
}

/** Check if a vocabulary knows a given emoji */
export function knows(vocab: VocabularyData, emoji: string): boolean {
  return vocab.known.has(emoji);
}

/** Pick a random emoji from pool that the creature knows. Returns null if none known. */
export function pickKnown(vocab: VocabularyData, pool: readonly string[]): string | null {
  const known: string[] = [];
  for (const emoji of pool) {
    if (vocab.known.has(emoji)) known.push(emoji);
  }
  if (known.length === 0) return null;
  return known[Math.floor(Math.random() * known.length)];
}

/** Learn one random emoji from pool, then return a known emoji from pool.
 *  Used for contextual learning: experiencing something teaches and enables speech. */
export function learnAndPick(vocab: VocabularyData, pool: readonly string[]): string {
  // First learn one random from pool if don't know any
  const known: string[] = [];
  for (const emoji of pool) {
    if (vocab.known.has(emoji)) known.push(emoji);
  }
  if (known.length === 0) {
    // Learn one random from pool
    const toLearn = pool[Math.floor(Math.random() * pool.length)];
    learn(vocab, toLearn);
    return toLearn;
  }
  return known[Math.floor(Math.random() * known.length)];
}

/** Learn a new emoji. Returns true if newly learned (not already known). */
export function learn(vocab: VocabularyData, emoji: string): boolean {
  if (vocab.known.has(emoji)) return false;
  vocab.known.add(emoji);
  vocab.recent.push(emoji);
  return true;
}

export const VocabularyStore = new ComponentStorage<VocabularyData>();
