import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { BiochemStore } from '../components/Biochemistry';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ShaderStateStore } from '../components/ShaderState';
import { ChemId } from '../biochemistry/ChemicalRegistry';

export class ShaderSystem extends System {
  readonly query = ShaderStateStore.bit | BiochemStore.bit | LifecycleStore.bit;
  readonly priority = 95;

  update(world: World, _dt: number): void {
    const time = performance.now() * 0.001;
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;

      const { chemicals } = BiochemStore.get(id)!;
      const { uniforms } = ShaderStateStore.get(id)!;

      uniforms.u_time.value = time;
      uniforms.u_energy.value = chemicals[ChemId.Energy];
      uniforms.u_hunger.value = chemicals[ChemId.Hunger];
      uniforms.u_pain.value = chemicals[ChemId.Pain];
      uniforms.u_reward.value = chemicals[ChemId.Reward];
      uniforms.u_lifeForce.value = chemicals[ChemId.LifeForce];
      uniforms.u_tiredness.value = chemicals[ChemId.Tiredness];
      uniforms.u_age.value = chemicals[ChemId.Age];
    }
  }
}
