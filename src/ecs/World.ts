import { createEntityId } from './Entity';
import type { ComponentStorage } from './Component';
import type { System } from './System';

export class World {
  // Entity bitmasks: entityId → component bitmask
  private masks = new Map<number, number>();
  private systems: System[] = [];
  private systemsSorted = false;

  // All registered component storages (for cleanup on entity destroy)
  private storages: ComponentStorage<unknown>[] = [];

  /** Register a component storage so entities can be fully cleaned up */
  registerStorage(storage: ComponentStorage<unknown>): void {
    this.storages.push(storage);
  }

  /** Create a new entity, returns its ID */
  spawn(): number {
    const id = createEntityId();
    this.masks.set(id, 0);
    return id;
  }

  /** Destroy an entity and remove all its components */
  destroy(entityId: number): void {
    for (const storage of this.storages) {
      storage.delete(entityId);
    }
    this.masks.delete(entityId);
  }

  /** Add a component to an entity */
  addComponent<T>(entityId: number, storage: ComponentStorage<T>, value: T): void {
    storage.set(entityId, value);
    const mask = this.masks.get(entityId) ?? 0;
    this.masks.set(entityId, mask | storage.bit);
  }

  /** Remove a component from an entity */
  removeComponent<T>(entityId: number, storage: ComponentStorage<T>): void {
    storage.delete(entityId);
    const mask = this.masks.get(entityId) ?? 0;
    this.masks.set(entityId, mask & ~storage.bit);
  }

  /** Get all entity IDs matching a component bitmask */
  query(mask: number): number[] {
    const result: number[] = [];
    for (const [id, entityMask] of this.masks) {
      if ((entityMask & mask) === mask) {
        result.push(id);
      }
    }
    return result;
  }

  /** Get all living entity IDs */
  allEntities(): number[] {
    return Array.from(this.masks.keys());
  }

  /** Number of living entities */
  get entityCount(): number {
    return this.masks.size;
  }

  /** Check if an entity exists */
  has(entityId: number): boolean {
    return this.masks.has(entityId);
  }

  /** Register a system */
  addSystem(system: System): void {
    this.systems.push(system);
    this.systemsSorted = false;
  }

  /** Run all systems in priority order */
  update(dt: number): void {
    if (!this.systemsSorted) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.systemsSorted = true;
    }
    for (const system of this.systems) {
      system.update(this, dt);
    }
  }
}
