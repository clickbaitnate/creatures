import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { TransformStore } from '../components/Transform';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { POND_CENTER, POND_RADIUS } from '../world/Environment';

const WATER_ENERGY_BONUS = 0.0003;

export class MetabolismSystem extends System {
  readonly query = BiochemStore.bit | LifecycleStore.bit;
  readonly priority = 35;

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

      // Water proximity bonus
      const transform = TransformStore.get(id);
      if (transform) {
        const dx = transform.x - POND_CENTER.x;
        const dz = transform.z - POND_CENTER.y;
        const distToPond = Math.sqrt(dx * dx + dz * dz);
        if (distToPond < POND_RADIUS * 2) {
          chemicals[ChemId.Energy] = Math.min(1, chemicals[ChemId.Energy] + WATER_ENERGY_BONUS);
        }
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
