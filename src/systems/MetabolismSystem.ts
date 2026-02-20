import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';

export class MetabolismSystem extends System {
  readonly query = BiochemStore.bit | LifecycleStore.bit;
  readonly priority = 40;

  // Track entities to destroy after iteration
  private toDestroy: number[] = [];

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);
    this.toDestroy.length = 0;

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;

      const { chemicals } = BiochemStore.get(id)!;

      lifecycle.age++;

      // Death checks
      if (chemicals[ChemId.LifeForce] <= 0 || lifecycle.age >= lifecycle.maxAge) {
        lifecycle.stage = LifeStage.Dead;
        this.toDestroy.push(id);
        continue;
      }

      // Reproduction cooldown
      if (lifecycle.reproductionCooldown > 0) {
        lifecycle.reproductionCooldown--;
      }
    }

    // Deferred entity destruction (remove dead creatures after delay)
    // For now, mark as dead — RenderSystem will handle visual removal
  }
}
