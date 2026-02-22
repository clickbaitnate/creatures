import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { FoodStore } from './SensorySystem';

export class RenderSystem extends System {
  readonly query = TransformStore.bit | RenderableStore.bit;
  readonly priority = 100;

  private deadTimers = new Map<number, number>();
  private baseScales = new Map<number, number>();

  update(world: World, dt: number): void {
    const entities = world.query(this.query);
    const time = performance.now() * 0.001;

    for (const id of entities) {
      const transform = TransformStore.get(id)!;
      const { object } = RenderableStore.get(id)!;
      const lifecycle = LifecycleStore.get(id);

      // Cache the mesh's baked-in foot offset (set once by MeshBuilder)
      if (object.userData.meshYOffset === undefined) {
        object.userData.meshYOffset = object.position.y || 0;
      }
      const meshYOffset = object.userData.meshYOffset as number;

      object.position.x = transform.x;
      object.position.z = transform.z;
      object.rotation.y = transform.rotation;

      // Food items are simple, no lifecycle
      if (FoodStore.has(id)) {
        object.position.y = transform.y;
        continue;
      }

      // Place creature on terrain + mesh offset + subtle bobbing
      if (lifecycle && lifecycle.stage === LifeStage.Alive) {
        object.position.y = transform.y + meshYOffset + Math.sin(time * 3 + id * 1.7) * 0.03;
      } else {
        object.position.y = transform.y + meshYOffset;
      }
    }

    // Dead creature cleanup
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (!lifecycle || lifecycle.stage !== LifeStage.Dead) continue;

      let timer = this.deadTimers.get(id) ?? 0;
      timer++;
      this.deadTimers.set(id, timer);

      const renderable = RenderableStore.get(id)!;

      // Save base scale on first dead frame
      if (!this.baseScales.has(id)) {
        this.baseScales.set(id, renderable.object.scale.x);
      }
      const baseScale = this.baseScales.get(id)!;

      // Topple over and shrink
      const progress = Math.min(timer / 80, 1);
      renderable.object.rotation.z = progress * Math.PI / 2;
      renderable.object.scale.setScalar(baseScale * (1 - progress * 0.8));

      if (timer >= 80) {
        const parent = renderable.object.parent;
        if (parent) parent.remove(renderable.object);
        world.destroy(id);
        this.deadTimers.delete(id);
        this.baseScales.delete(id);
      }
    }
  }
}
