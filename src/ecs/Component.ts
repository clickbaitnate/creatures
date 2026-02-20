// Component registry — each component type gets a unique bit for fast archetype queries

let nextComponentBit = 1;

export function registerComponent(): number {
  const bit = nextComponentBit;
  nextComponentBit <<= 1;
  return bit;
}

// SoA (Struct-of-Arrays) storage: each component type stores data in a Map<entityId, T>
export class ComponentStorage<T> {
  readonly bit: number;
  private data = new Map<number, T>();

  constructor() {
    this.bit = registerComponent();
  }

  set(entityId: number, value: T): void {
    this.data.set(entityId, value);
  }

  get(entityId: number): T | undefined {
    return this.data.get(entityId);
  }

  has(entityId: number): boolean {
    return this.data.has(entityId);
  }

  delete(entityId: number): void {
    this.data.delete(entityId);
  }

  values(): IterableIterator<T> {
    return this.data.values();
  }

  entries(): IterableIterator<[number, T]> {
    return this.data.entries();
  }

  get size(): number {
    return this.data.size;
  }
}
