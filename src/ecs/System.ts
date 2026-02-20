import type { World } from './World';

export abstract class System {
  /** Bitmask of required components — override in subclass */
  abstract readonly query: number;

  /** Lower priority runs first */
  abstract readonly priority: number;

  /** Called every tick with delta time (seconds) */
  abstract update(world: World, dt: number): void;
}
