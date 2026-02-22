import * as THREE from 'three';
import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { MotorStore } from '../components/Motor';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { SocialStore, Activity } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { MatingStore } from '../components/Mating';
import { Sex } from '../genome/Genome';
import { EggStore } from '../components/Egg';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { distSq, clamp } from '../utils/Math';
import { crossover } from '../genome/Crossover';
import { mutate } from '../genome/Mutation';
import { terrainY } from '../world/Environment';
import { VocabularyStore, learn } from '../components/Vocabulary';

const MATE_RANGE_SQ = 3.0 * 3.0;
const REPRODUCTION_COOLDOWN = 150;
const COURTSHIP_TICKS = 15;
const MATING_DURATION = 40;
const EGG_HATCH_TIME = 150;
const MAX_POPULATION = 60;
const BOND_DECAY_RATE = 0.0005;

export type SpawnCallback = (genome: import('../genome/Genome').CreatureGenome, x: number, z: number) => void;
export type SceneRef = THREE.Scene;

const eggGeo = new THREE.SphereGeometry(0.12, 8, 8);

export class ReproductionSystem extends System {
  readonly query = MotorStore.bit | GenomeStore.bit | BiochemStore.bit | LifecycleStore.bit | TransformStore.bit;
  readonly priority = 60;

  onSpawn: SpawnCallback | null = null;
  scene: SceneRef | null = null;

  private hearts: { mesh: THREE.Mesh; timer: number }[] = [];
  private heartGeo = new THREE.ShapeGeometry(this.makeHeartShape());

  private makeHeartShape(): THREE.Shape {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.05);
    shape.bezierCurveTo(0, 0.08, -0.04, 0.12, -0.08, 0.12);
    shape.bezierCurveTo(-0.14, 0.12, -0.14, 0.07, -0.14, 0.07);
    shape.bezierCurveTo(-0.14, 0.02, -0.08, -0.04, 0, -0.08);
    shape.bezierCurveTo(0.08, -0.04, 0.14, 0.02, 0.14, 0.07);
    shape.bezierCurveTo(0.14, 0.07, 0.14, 0.12, 0.08, 0.12);
    shape.bezierCurveTo(0.04, 0.12, 0, 0.08, 0, 0.05);
    return shape;
  }

  update(world: World, _dt: number): void {
    // Update hearts
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.timer--;
      h.mesh.position.y += 0.01;
      (h.mesh.material as THREE.MeshBasicMaterial).opacity = h.timer / 40;
      if (h.timer <= 0) {
        if (h.mesh.parent) h.mesh.parent.remove(h.mesh);
        this.hearts.splice(i, 1);
      }
    }

    // Hatch eggs
    const eggs = world.query(EggStore.bit | TransformStore.bit);
    for (const eid of eggs) {
      const egg = EggStore.get(eid)!;
      egg.hatchTimer--;
      if (egg.hatchTimer <= 0) {
        const et = TransformStore.get(eid)!;
        const renderable = RenderableStore.get(eid);
        if (renderable?.object.parent) renderable.object.parent.remove(renderable.object);
        world.destroy(eid);
        if (this.onSpawn) this.onSpawn(egg.genome, et.x, et.z);
      }
    }

    if (!this.onSpawn) return;

    const entities = world.query(this.query);
    const aliveCount = entities.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage === LifeStage.Alive;
    }).length;
    if (aliveCount >= MAX_POPULATION) return;

    // Update pair bond decay and courtship progress
    for (const id of entities) {
      const mating = MatingStore.get(id);
      if (!mating) continue;

      // Bond decay
      if (mating.bondedPartner >= 0) {
        mating.bondStrength = Math.max(0, mating.bondStrength - BOND_DECAY_RATE);
        if (mating.bondStrength <= 0) {
          mating.bondedPartner = -1;
        }
      }
    }

    const alreadyMated = new Set<number>();

    for (const id of entities) {
      if (alreadyMated.has(id)) continue;

      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;
      if (lifecycle.reproductionCooldown > 0) continue;
      if (lifecycle.age < 60) continue;

      const { chemicals } = BiochemStore.get(id)!;
      const { genome: genomeA } = GenomeStore.get(id)!;
      const social = SocialStore.get(id);
      const matingA = MatingStore.get(id);

      const motor = MotorStore.get(id)!;
      const willingToMate = motor.wantMate || chemicals[ChemId.Energy] > genomeA.fertilityThreshold;
      if (!willingToMate) continue;
      if (chemicals[ChemId.Energy] < 0.25) continue;

      // Monogamy check — if bonded with living partner, skip
      if (matingA && matingA.bondedPartner >= 0 && genomeA.monogamy > 0.7) {
        if (world.has(matingA.bondedPartner)) continue;
        // Partner is dead, clear bond
        matingA.bondedPartner = -1;
        matingA.bondStrength = 0;
      }

      const transformA = TransformStore.get(id)!;

      for (const otherId of entities) {
        if (otherId === id || alreadyMated.has(otherId)) continue;

        const otherLifecycle = LifecycleStore.get(otherId)!;
        if (otherLifecycle.stage === LifeStage.Dead) continue;
        if (otherLifecycle.reproductionCooldown > 0) continue;
        if (otherLifecycle.age < 60) continue;

        const otherBiochem = BiochemStore.get(otherId)!;
        if (otherBiochem.chemicals[ChemId.Energy] < 0.25) continue;

        const transformB = TransformStore.get(otherId)!;
        if (distSq(transformA.x, transformA.z, transformB.x, transformB.z) > MATE_RANGE_SQ) continue;

        const genomeB = GenomeStore.get(otherId)!.genome;
        const matingB = MatingStore.get(otherId);

        // Sex check — require male + female
        if (matingA && matingB) {
          if (matingA.sex === matingB.sex) continue;

          // Identify male and female
          const maleId = matingA.sex === Sex.Male ? id : otherId;
          const femaleId = matingA.sex === Sex.Female ? id : otherId;
          const maleGenome = maleId === id ? genomeA : genomeB;
          const femaleGenome = femaleId === id ? genomeA : genomeB;
          const maleMating = maleId === id ? matingA : matingB;
          const femaleMating = femaleId === id ? matingA : matingB;
          const maleSocial = maleId === id ? social : SocialStore.get(otherId);
          const femaleSocial = femaleId === id ? social : SocialStore.get(otherId);
          const maleBiochem = maleId === id ? { chemicals } : otherBiochem;
          const femaleBiochem = femaleId === id ? { chemicals } : otherBiochem;

          // Monogamy check for other partner
          if (femaleMating.bondedPartner >= 0 && femaleGenome.monogamy > 0.7 && world.has(femaleMating.bondedPartner)) continue;

          // Courtship phase — male displays
          if (maleMating.courtshipTarget !== femaleId) {
            // Start courtship
            maleMating.courtshipTarget = femaleId;
            maleMating.courtshipProgress = 0;
            if (maleSocial) {
              const mVocab = VocabularyStore.get(maleId);
              if (mVocab) { learn(mVocab, '💘'); maleSocial.speechEmoji = '💘'; maleSocial.speechTimer = 30; }
            }
            continue; // don't mate yet
          }

          // Advance courtship
          maleMating.courtshipProgress += 1 / COURTSHIP_TICKS;

          if (maleMating.courtshipProgress < 1.0) {
            // Still courting — show display
            if (maleSocial && maleMating.courtshipProgress > 0.5) {
              const mVocab2 = VocabularyStore.get(maleId);
              if (mVocab2) { learn(mVocab2, '💃'); maleSocial.speechEmoji = '💃'; maleSocial.speechTimer = 10; }
            }
            continue;
          }

          // Courtship complete — female evaluates
          const maleHealth = SocialStore.get(maleId)?.health ?? 1;
          const maleEnergy = maleBiochem.chemicals[ChemId.Energy];
          const colorMatch = 1.0 - Math.abs(maleGenome.colorH - femaleGenome.colorH) / 360;
          const rank = 0; // Wired in Sprint 3
          const attractiveness = maleGenome.displayIntensity * 0.3 + maleHealth * 0.2 +
                                 maleEnergy * 0.2 + rank * 0.2 + colorMatch * 0.1;
          maleMating.attractiveness = attractiveness;

          const threshold = (1 - femaleGenome.mateSelectiveness) * 0.8;
          if (attractiveness < threshold) {
            // Rejected
            maleMating.courtshipTarget = -1;
            maleMating.courtshipProgress = 0;
            if (femaleSocial) {
              const fVocab = VocabularyStore.get(femaleId);
              if (fVocab) { learn(fVocab, '🙅'); femaleSocial.speechEmoji = '🙅'; femaleSocial.speechTimer = 25; }
            }
            continue;
          }

          // Success — mate!
          maleMating.courtshipTarget = -1;
          maleMating.courtshipProgress = 0;

          const childGenome = crossover(genomeA, genomeB);
          mutate(childGenome);

          const eggX = (transformA.x + transformB.x) / 2;
          const eggZ = (transformA.z + transformB.z) / 2;
          this.layEgg(world, childGenome, eggX, eggZ, social?.factionId ?? 0);

          // Pair bonding — if both have high monogamy
          if (maleGenome.monogamy > 0.5 && femaleGenome.monogamy > 0.5) {
            const bondStr = (maleGenome.monogamy + femaleGenome.monogamy) / 2;
            maleMating.bondedPartner = femaleId;
            maleMating.bondStrength = bondStr;
            femaleMating.bondedPartner = maleId;
            femaleMating.bondStrength = bondStr;
          }

          // Mating visuals
          if (maleSocial) {
            const mVocab3 = VocabularyStore.get(maleId);
            if (mVocab3) { learn(mVocab3, '💋'); maleSocial.speechEmoji = '💋'; }
            maleSocial.speechTimer = MATING_DURATION;
            maleSocial.activity = Activity.Mating;
            maleSocial.matingTimer = MATING_DURATION;
          }
          if (femaleSocial) {
            const fVocab2 = VocabularyStore.get(femaleId);
            if (fVocab2) { learn(fVocab2, '💕'); femaleSocial.speechEmoji = '💕'; }
            femaleSocial.speechTimer = MATING_DURATION;
            femaleSocial.activity = Activity.Mating;
            femaleSocial.matingTimer = MATING_DURATION;
          }

          this.spawnHeart(eggX, 1.2, eggZ);

          // Energy cost and reward
          chemicals[ChemId.Energy] -= 0.15;
          otherBiochem.chemicals[ChemId.Energy] -= 0.15;
          chemicals[ChemId.Reward] += 0.4;
          otherBiochem.chemicals[ChemId.Reward] += 0.4;

          lifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;
          otherLifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;

          alreadyMated.add(id);
          alreadyMated.add(otherId);
          break;
        } else {
          // Fallback for entities without MatingStore (shouldn't happen but be safe)
          const childGenome = crossover(genomeA, genomeB);
          mutate(childGenome);

          const eggX = (transformA.x + transformB.x) / 2;
          const eggZ = (transformA.z + transformB.z) / 2;
          this.layEgg(world, childGenome, eggX, eggZ, social?.factionId ?? 0);

          if (social) {
            const sVocab = VocabularyStore.get(id);
            if (sVocab) { learn(sVocab, '💋'); social.speechEmoji = '💋'; }
            social.speechTimer = MATING_DURATION;
            social.activity = Activity.Mating;
            social.matingTimer = MATING_DURATION;
          }
          const otherSocial = SocialStore.get(otherId);
          if (otherSocial) {
            const oVocab = VocabularyStore.get(otherId);
            if (oVocab) { learn(oVocab, '💕'); otherSocial.speechEmoji = '💕'; }
            otherSocial.speechTimer = MATING_DURATION;
            otherSocial.activity = Activity.Mating;
            otherSocial.matingTimer = MATING_DURATION;
          }

          this.spawnHeart(eggX, 1.2, eggZ);

          chemicals[ChemId.Energy] -= 0.15;
          otherBiochem.chemicals[ChemId.Energy] -= 0.15;
          chemicals[ChemId.Reward] += 0.4;
          otherBiochem.chemicals[ChemId.Reward] += 0.4;

          lifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;
          otherLifecycle.reproductionCooldown = REPRODUCTION_COOLDOWN;

          alreadyMated.add(id);
          alreadyMated.add(otherId);
          break;
        }
      }
    }
  }

  private layEgg(world: World, genome: import('../genome/Genome').CreatureGenome, x: number, z: number, factionId: number): void {
    const id = world.spawn();

    const groundY = terrainY(x, z);
    const color = new THREE.Color().setHSL(genome.colorH / 360, 0.4, 0.85);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(eggGeo, mat);
    mesh.position.set(x, groundY + 0.12, z);
    mesh.scale.set(1, 1.2, 1);
    mesh.castShadow = true;
    if (this.scene) this.scene.add(mesh);

    world.addComponent(id, TransformStore, { x, y: groundY + 0.12, z, rotation: 0 });
    world.addComponent(id, RenderableStore, { object: mesh });
    world.addComponent(id, EggStore, { genome, hatchTimer: EGG_HATCH_TIME, parentFaction: factionId });
  }

  private spawnHeart(x: number, y: number, z: number): void {
    if (!this.scene) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.heartGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(2);
    this.scene.add(mesh);
    this.hearts.push({ mesh, timer: 40 });
  }
}
