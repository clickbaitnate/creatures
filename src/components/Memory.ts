import { ComponentStorage } from '../ecs/Component';

export const enum MemoryType {
  None = 0,
  FoodLocation = 1,
  DangerLocation = 2,
  HostileIndividual = 3,
  FriendlyIndividual = 4,
  HomeLocation = 5,
  ResourceLocation = 6,
  ShelterLocation = 7,
}

export interface MemoryEntry {
  type: MemoryType;
  x: number;
  z: number;
  entityId: number;  // -1 if location-only
  strength: number;  // 0-1, decays over time
  tick: number;       // when this memory was formed
}

export const MEMORY_SLOTS = 8;

export interface MemoryData {
  entries: MemoryEntry[];
  nextSlot: number; // ring buffer pointer
}

export function createMemory(): MemoryData {
  const entries: MemoryEntry[] = [];
  for (let i = 0; i < MEMORY_SLOTS; i++) {
    entries.push({ type: MemoryType.None, x: 0, z: 0, entityId: -1, strength: 0, tick: 0 });
  }
  return { entries, nextSlot: 0 };
}

/** Add a memory, overwriting the oldest/weakest slot */
export function addMemory(mem: MemoryData, type: MemoryType, x: number, z: number, entityId: number, tick: number): void {
  // Check if we already have a memory of this type at a similar location or same entity
  for (const entry of mem.entries) {
    if (entry.type === type) {
      if (entityId >= 0 && entry.entityId === entityId) {
        // Reinforce existing memory
        entry.strength = Math.min(1, entry.strength + 0.3);
        entry.x = x;
        entry.z = z;
        entry.tick = tick;
        return;
      }
      const dx = entry.x - x;
      const dz = entry.z - z;
      if (dx * dx + dz * dz < 25) { // within 5 units
        // Reinforce location memory
        entry.strength = Math.min(1, entry.strength + 0.2);
        entry.tick = tick;
        return;
      }
    }
  }

  // Find weakest slot to overwrite (prefer empty, then weakest)
  let weakIdx = 0;
  let weakStr = Infinity;
  for (let i = 0; i < MEMORY_SLOTS; i++) {
    if (mem.entries[i].type === MemoryType.None) {
      weakIdx = i;
      break;
    }
    if (mem.entries[i].strength < weakStr) {
      weakStr = mem.entries[i].strength;
      weakIdx = i;
    }
  }

  mem.entries[weakIdx] = { type, x, z, entityId, strength: 0.8, tick };
}

export const MemoryStore = new ComponentStorage<MemoryData>();
