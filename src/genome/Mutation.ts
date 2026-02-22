import { clamp, randFloat, randInt } from '../utils/Math';
import { LOBES } from '../brain/CTRNN';
import {
  type CreatureGenome,
  EAR_TYPE_COUNT,
  BODY_BUILD_COUNT,
  type EarType,
  type BodyBuild,
} from './Genome';

const POINT_RATE = 0.05;
const CONN_ADD_RATE = 0.03;
const CONN_DEL_RATE = 0.02;
const TYPE_FLIP_RATE = 0.02;

export function mutate(genome: CreatureGenome): void {
  // Brain
  for (let i = 0; i < genome.brainBiases.length; i++)
    if (Math.random() < POINT_RATE)
      genome.brainBiases[i] = clamp(genome.brainBiases[i] + randFloat(-0.2, 0.2), -1, 1);

  for (let i = 0; i < genome.brainTaus.length; i++)
    if (Math.random() < POINT_RATE) {
      const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
      genome.brainTaus[i] = clamp(genome.brainTaus[i] + randFloat(-0.5, 0.5), lobe.tauMin, lobe.tauMax);
    }

  for (const conn of genome.connections)
    if (Math.random() < POINT_RATE)
      conn.weight = clamp(conn.weight + randFloat(-0.15, 0.15), -1, 1);

  // 56-neuron: source 0-43, target 20-55
  if (Math.random() < CONN_ADD_RATE)
    genome.connections.push({ from: randInt(0, 43), to: randInt(20, 55), weight: randFloat(-0.2, 0.2) });
  if (genome.connections.length > 10 && Math.random() < CONN_DEL_RATE)
    genome.connections.splice(randInt(0, genome.connections.length - 1), 1);

  // Biochemistry
  if (Math.random() < POINT_RATE) genome.stomachRate = clamp(genome.stomachRate + randFloat(-0.05, 0.05), 0.2, 1.0);
  if (Math.random() < POINT_RATE) genome.muscleRate = clamp(genome.muscleRate + randFloat(-0.01, 0.01), 0.01, 0.08);

  // Morphology
  if (Math.random() < POINT_RATE) genome.bodyScale = clamp(genome.bodyScale + randFloat(-0.06, 0.06), 0.4, 1.5);
  if (Math.random() < TYPE_FLIP_RATE) genome.bodyBuild = randInt(0, BODY_BUILD_COUNT - 1) as BodyBuild;
  if (Math.random() < POINT_RATE) genome.headSize = clamp(genome.headSize + randFloat(-0.05, 0.05), 0.4, 1.2);
  if (Math.random() < TYPE_FLIP_RATE) genome.earType = randInt(0, EAR_TYPE_COUNT - 1) as EarType;
  if (Math.random() < POINT_RATE) genome.earSize = clamp(genome.earSize + randFloat(-0.05, 0.05), 0.15, 1.0);
  if (Math.random() < POINT_RATE) genome.armLength = clamp(genome.armLength + randFloat(-0.05, 0.05), 0.4, 1.3);
  if (Math.random() < POINT_RATE) genome.legLength = clamp(genome.legLength + randFloat(-0.05, 0.05), 0.4, 1.3);
  if (Math.random() < POINT_RATE) genome.eyeSize = clamp(genome.eyeSize + randFloat(-0.04, 0.04), 0.1, 0.5);

  // Colors
  if (Math.random() < POINT_RATE) genome.colorH = (genome.colorH + randFloat(-12, 12) + 360) % 360;
  if (Math.random() < POINT_RATE) genome.colorS = clamp(genome.colorS + randFloat(-0.06, 0.06), 0.2, 1.0);
  if (Math.random() < POINT_RATE) genome.colorL = clamp(genome.colorL + randFloat(-0.06, 0.06), 0.25, 0.8);
  if (Math.random() < POINT_RATE) genome.accentH = (genome.accentH + randFloat(-15, 15) + 360) % 360;

  // Personality
  if (Math.random() < POINT_RATE) genome.aggression = clamp(genome.aggression + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.sociability = clamp(genome.sociability + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.curiosity = clamp(genome.curiosity + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.loyalty = clamp(genome.loyalty + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.creativity = clamp(genome.creativity + randFloat(-0.06, 0.06), 0, 1);

  // Affinities
  if (Math.random() < POINT_RATE) genome.gatherAffinity = clamp(genome.gatherAffinity + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.huntAffinity = clamp(genome.huntAffinity + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.buildAffinity = clamp(genome.buildAffinity + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.hoardAffinity = clamp(genome.hoardAffinity + randFloat(-0.06, 0.06), 0, 1);

  // Lifecycle
  if (Math.random() < POINT_RATE) genome.maxAge = clamp(genome.maxAge + randInt(-200, 200), 3000, 15000);
  if (Math.random() < POINT_RATE) genome.speed = clamp(genome.speed + randFloat(-0.15, 0.15), 0.8, 5.0);
  if (Math.random() < POINT_RATE) genome.turnRate = clamp(genome.turnRate + randFloat(-0.15, 0.15), 0.8, 4.0);

  // Diet
  if (Math.random() < POINT_RATE) genome.dietBerry = clamp(genome.dietBerry + randFloat(-0.06, 0.06), 0.05, 0.9);
  if (Math.random() < POINT_RATE) genome.dietGrass = clamp(genome.dietGrass + randFloat(-0.06, 0.06), 0.05, 0.9);
  if (Math.random() < POINT_RATE) genome.dietRoot = clamp(genome.dietRoot + randFloat(-0.06, 0.06), 0.05, 0.9);
  const dietSum = genome.dietBerry + genome.dietGrass + genome.dietRoot;
  if (dietSum > 0) {
    genome.dietBerry /= dietSum;
    genome.dietGrass /= dietSum;
    genome.dietRoot /= dietSum;
  }

  // Sex & breeding (sex itself doesn't mutate — determined at crossover)
  if (Math.random() < POINT_RATE) genome.dimorphism = clamp(genome.dimorphism + randFloat(-0.04, 0.04), 0, 0.5);
  if (Math.random() < POINT_RATE) genome.displayIntensity = clamp(genome.displayIntensity + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.monogamy = clamp(genome.monogamy + randFloat(-0.06, 0.06), 0, 1);
  if (Math.random() < POINT_RATE) genome.mateSelectiveness = clamp(genome.mateSelectiveness + randFloat(-0.06, 0.06), 0, 1);

  // Rare dramatic mutations (0.1% chance per birth)
  if (Math.random() < 0.001) {
    const mutation = Math.floor(Math.random() * 5);
    switch (mutation) {
      case 0: // Giant
        genome.bodyScale = clamp(genome.bodyScale * 1.5, 0.4, 2.0);
        break;
      case 1: // Miniature
        genome.bodyScale = clamp(genome.bodyScale * 0.6, 0.3, 1.5);
        genome.speed = clamp(genome.speed * 1.3, 0.8, 5.0);
        break;
      case 2: // Genius (high creativity + build)
        genome.creativity = clamp(genome.creativity + 0.3, 0, 1);
        genome.buildAffinity = clamp(genome.buildAffinity + 0.3, 0, 1);
        break;
      case 3: // Feral (high aggression + hunt)
        genome.aggression = clamp(genome.aggression + 0.3, 0, 1);
        genome.huntAffinity = clamp(genome.huntAffinity + 0.3, 0, 1);
        genome.speed = clamp(genome.speed + 0.5, 0.8, 5.0);
        break;
      case 4: // Hermit (high hoard, low social)
        genome.hoardAffinity = clamp(genome.hoardAffinity + 0.4, 0, 1);
        genome.sociability = clamp(genome.sociability - 0.3, 0, 1);
        break;
    }
  }

  // Species marker — slow drift drives speciation
  for (let i = 0; i < genome.speciesMarker.length; i++)
    if (Math.random() < 0.08)
      genome.speciesMarker[i] = clamp(genome.speciesMarker[i] + randFloat(-0.03, 0.03), 0, 1);
}
