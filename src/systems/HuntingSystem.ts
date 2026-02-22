import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, addItem, hasSpace, ItemType } from '../components/Inventory';
import { SensesStore } from '../components/Senses';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { SocialStore, Activity } from '../components/Social';
import { CritterManager } from '../world/PreyCritters';
import { distSq, clamp } from '../utils/Math';
import { VocabularyStore, learn } from '../components/Vocabulary';

const CATCH_RADIUS_SQ = 1.5 * 1.5;
const HUNT_ENERGY_COST = 0.001;

export class HuntingSystem extends System {
  readonly query = MotorStore.bit | TransformStore.bit | SensesStore.bit;
  readonly priority = 58;

  critterManager: CritterManager | null = null;

  update(world: World, _dt: number): void {
    if (!this.critterManager) return;
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      if (!motor.wantHunt) continue;

      const senses = SensesStore.get(id)!;
      if (!senses.preyVisible || senses.nearestPreyIndex < 0) continue;

      const inv = InventoryStore.get(id);
      if (!inv || !hasSpace(inv)) continue;

      const transform = TransformStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const genome = GenomeStore.get(id)?.genome;
      if (!biochem || !genome) continue;

      // Energy cost for active hunting
      biochem.chemicals[ChemId.Energy] = Math.max(0, biochem.chemicals[ChemId.Energy] - HUNT_ENERGY_COST);

      const preyIdx = senses.nearestPreyIndex;
      if (preyIdx < 0 || preyIdx >= this.critterManager.count) continue;
      if (!this.critterManager.alive[preyIdx]) continue;

      const px = this.critterManager.x[preyIdx];
      const pz = this.critterManager.z[preyIdx];
      const dsq = distSq(transform.x, transform.z, px, pz);

      if (dsq > CATCH_RADIUS_SQ) continue;

      // Catch attempt: compare speed
      const critterType = this.critterManager.type[preyIdx];
      const def = this.critterManager.getDef(critterType);
      const creatureSpeed = genome.speed * (0.5 + genome.bodyScale * 0.5);
      const catchChance = clamp((creatureSpeed - def.speed * 0.5) / 3.0, 0.1, 0.9);

      if (Math.random() < catchChance) {
        // Successful catch
        this.critterManager.kill(preyIdx);
        addItem(inv, ItemType.RawMeat);
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.3, 0, 1);

        // Speech: announce the kill (learn hunting emojis)
        const social = SocialStore.get(id);
        if (social) {
          const hVocab = VocabularyStore.get(id);
          if (hVocab) {
            learn(hVocab, '🎯');
            learn(hVocab, '🥩');
            social.speechEmoji = '🎯';
            social.speechTimer = 35;
          }
          social.activity = Activity.Idle; // briefly celebrates
        }
      } else {
        // Still hunting
        const social = SocialStore.get(id);
        if (social) social.activity = Activity.Walking; // chasing
      }
    }
  }
}
