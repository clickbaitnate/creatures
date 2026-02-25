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
import { CritterManager, CRITTER_DEFS } from '../world/PreyCritters';
import { distSq, clamp } from '../utils/Math';
import { VocabularyStore, learn } from '../components/Vocabulary';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';
import type { FactionManager } from '../world/FactionSystem';

const CATCH_RADIUS_SQ = 1.5 * 1.5;
const HUNT_ENERGY_COST = 0.003;
const PACK_RANGE_SQ = 8 * 8;

export class HuntingSystem extends System {
  readonly query = MotorStore.bit | TransformStore.bit | SensesStore.bit;
  readonly priority = 58;

  critterManager: CritterManager | null = null;
  factionManager: FactionManager | null = null;

  update(world: World, _dt: number): void {
    if (!this.critterManager) return;
    const entities = world.query(this.query);

    // First pass: record who's hunting what prey
    const hunterPrey = new Map<number, number>(); // entityId -> preyIndex
    const hunterPositions = new Map<number, { x: number; z: number; faction: number }>();

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      if (!motor.wantHunt) continue;

      const senses = SensesStore.get(id)!;
      if (!senses.preyVisible || senses.nearestPreyIndex < 0) continue;

      const transform = TransformStore.get(id)!;
      const preyIdx = senses.nearestPreyIndex;
      if (preyIdx >= this.critterManager.count || !this.critterManager.alive[preyIdx]) continue;

      hunterPrey.set(id, preyIdx);
      const factionId = this.factionManager ? (this.factionManager as any).entityFaction?.get(id) ?? -1 : -1;
      hunterPositions.set(id, { x: transform.x, z: transform.z, faction: factionId });
    }

    // Second pass: resolve catches with pack mechanics
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const motor = MotorStore.get(id)!;
      if (!motor.wantHunt) continue;

      const preyIdx = hunterPrey.get(id);
      if (preyIdx === undefined) continue;

      const inv = InventoryStore.get(id);
      if (!inv || !hasSpace(inv)) continue;

      const transform = TransformStore.get(id)!;
      const biochem = BiochemStore.get(id);
      const genome = GenomeStore.get(id)?.genome;
      if (!biochem || !genome) continue;

      // Energy cost for active hunting
      biochem.chemicals[ChemId.Energy] = Math.max(0, biochem.chemicals[ChemId.Energy] - HUNT_ENERGY_COST);

      if (!this.critterManager.alive[preyIdx]) continue;

      const px = this.critterManager.x[preyIdx];
      const pz = this.critterManager.z[preyIdx];
      const dsq = distSq(transform.x, transform.z, px, pz);

      if (dsq > CATCH_RADIUS_SQ) continue;

      const critterType = this.critterManager.type[preyIdx];
      const def = CRITTER_DEFS[critterType];

      // Count pack size: same-faction creatures hunting same prey within range
      const myPos = hunterPositions.get(id)!;
      let packSize = 1;
      const packMembers: number[] = [id];

      for (const [otherId, otherPrey] of hunterPrey) {
        if (otherId === id) continue;
        if (otherPrey !== preyIdx) continue;
        const otherPos = hunterPositions.get(otherId);
        if (!otherPos) continue;
        // Same faction check
        if (myPos.faction >= 0 && otherPos.faction === myPos.faction) {
          const dToMe = distSq(myPos.x, myPos.z, otherPos.x, otherPos.z);
          if (dToMe < PACK_RANGE_SQ) {
            packSize++;
            packMembers.push(otherId);
          }
        }
      }

      // Catch chance
      let catchChance: number;
      const creatureSpeed = genome.speed * (0.5 + genome.bodyScale * 0.5);
      const speedFactor = clamp((creatureSpeed - def.speed * 0.5) / 3.0, 0.05, 0.9);

      if (!def.soloHuntable && packSize < def.packSize) {
        // Large prey with insufficient pack: very low chance
        catchChance = 0.02 * packSize;
      } else {
        // Normal or successful pack hunt
        const packBonus = Math.min(packSize / def.packSize, 2.0);
        catchChance = speedFactor * packBonus;
      }

      catchChance = clamp(catchChance, 0.01, 0.95);

      if (Math.random() < catchChance) {
        // Successful catch — killer gets all the loot
        this.critterManager.kill(preyIdx);

        // Drop count scales with prey size: small=1, medium=2, large=3
        const dropCount = def.size;
        addItem(inv, def.meatType, dropCount);
        biochem.chemicals[ChemId.Reward] = clamp(biochem.chemicals[ChemId.Reward] + 0.3, 0, 1);

        // Diary
        const CRITTER_NAMES = ['Rabbit','Bug','Fish','Deer','Boar','Turkey','Frog','Snake','Squirrel','Elk'];
        const preyName = CRITTER_NAMES[critterType] ?? 'prey';
        const huntDiary = DiaryStore.get(id);
        if (huntDiary) addDiaryEntry(huntDiary, 0, DiaryEventType.HuntSuccess, {
          detail: preyName,
          otherName: packMembers.length > 1 ? 'pack' : '',
        });

        // Speech: announce the kill
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
