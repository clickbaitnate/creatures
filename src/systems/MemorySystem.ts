import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { MemoryStore, MemoryType, addMemory } from '../components/Memory';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { BiochemStore } from '../components/Biochemistry';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ChemId } from '../biochemistry/ChemicalRegistry';

const MEMORY_DECAY = 0.998; // per tick, memories fade

export class MemorySystem extends System {
  readonly query = MemoryStore.bit | TransformStore.bit;
  readonly priority = 11; // Before ExpressionSystem (12) and brain systems

  private tickCount = 0;

  update(world: World, _dt: number): void {
    this.tickCount++;
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const memory = MemoryStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const senses = SensesStore.get(id);
      const biochem = BiochemStore.get(id);
      const social = SocialStore.get(id);

      // Decay all memories
      for (const entry of memory.entries) {
        if (entry.type !== MemoryType.None) {
          entry.strength *= MEMORY_DECAY;
          if (entry.strength < 0.05) {
            entry.type = MemoryType.None;
            entry.strength = 0;
          }
        }
      }

      // Form new memories from current experience

      // Found food → FoodLocation
      if (senses && senses.resourceVisible && senses.nearestResourceDist < 0.3) {
        addMemory(memory, MemoryType.FoodLocation, transform.x, transform.z, -1, this.tickCount);
      }

      // Got attacked → DangerLocation + HostileIndividual
      if (biochem && biochem.chemicals[ChemId.Pain] > 0.3) {
        addMemory(memory, MemoryType.DangerLocation, transform.x, transform.z, -1, this.tickCount);

        // If there's a visible threat, remember the attacker
        if (senses && senses.threatVisible && senses.nearestCreatureId >= 0) {
          addMemory(memory, MemoryType.HostileIndividual, transform.x, transform.z, senses.nearestCreatureId, this.tickCount);
        }
      }

      // Friendly interaction → FriendlyIndividual
      if (social && social.speechTimer > 40 && senses && senses.creatureVisible && senses.nearestCreatureId >= 0) {
        const otherSocial = SocialStore.get(senses.nearestCreatureId);
        if (otherSocial && otherSocial.factionId === social.factionId) {
          addMemory(memory, MemoryType.FriendlyIndividual, transform.x, transform.z, senses.nearestCreatureId, this.tickCount);
        }
      }

      // Near own building → HomeLocation (shelters)
      if (senses && senses.buildingVisible && senses.nearestBuildingDist < 0.2) {
        if (social && senses.nearestBuildingFaction === social.factionId) {
          addMemory(memory, MemoryType.HomeLocation, transform.x, transform.z, -1, this.tickCount);
        }
      }
    }
  }
}
