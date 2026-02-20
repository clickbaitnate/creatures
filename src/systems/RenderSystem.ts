import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';

export class RenderSystem extends System {
  readonly query = TransformStore.bit | RenderableStore.bit;
  readonly priority = 100;

  private deadTimers = new Map<number, number>();

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const transform = TransformStore.get(id)!;
      const { object } = RenderableStore.get(id)!;

      object.position.set(transform.x, transform.y, transform.z);
      object.rotation.y = transform.rotation;
    }

    // Handle dead creature cleanup
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (!lifecycle || lifecycle.stage !== LifeStage.Dead) continue;

      let timer = this.deadTimers.get(id) ?? 0;
      timer++;
      this.deadTimers.set(id, timer);

      // Fade out and shrink
      const renderable = RenderableStore.get(id)!;
      const scale = Math.max(0, 1 - timer / 60);
      renderable.object.scale.setScalar(scale);

      // After fade, destroy
      if (timer >= 60) {
        const scene = renderable.object.parent;
        if (scene) scene.remove(renderable.object);
        world.destroy(id);
        this.deadTimers.delete(id);
      }
    }
  }
}
