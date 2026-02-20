import { clamp, randFloat, randInt } from '../utils/Math';
import { LOBES } from '../brain/CTRNN';
import {
  type CreatureGenome,
  EAR_TYPE_COUNT,
  TAIL_TYPE_COUNT,
  SNOUT_TYPE_COUNT,
  BODY_SHAPE_COUNT,
  type EarType,
  type TailType,
  type SnoutType,
  type BodyShape,
} from './Genome';

const POINT_RATE = 0.05;
const CONN_ADD_RATE = 0.03;
const CONN_DEL_RATE = 0.02;
const TYPE_FLIP_RATE = 0.02; // chance to change a discrete type

export function mutate(genome: CreatureGenome): void {
  // Brain biases
  for (let i = 0; i < genome.brainBiases.length; i++) {
    if (Math.random() < POINT_RATE) {
      genome.brainBiases[i] = clamp(genome.brainBiases[i] + randFloat(-0.2, 0.2), -1, 1);
    }
  }

  // Brain taus
  for (let i = 0; i < genome.brainTaus.length; i++) {
    if (Math.random() < POINT_RATE) {
      const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
      genome.brainTaus[i] = clamp(genome.brainTaus[i] + randFloat(-0.5, 0.5), lobe.tauMin, lobe.tauMax);
    }
  }

  // Connection weights
  for (const conn of genome.connections) {
    if (Math.random() < POINT_RATE) {
      conn.weight = clamp(conn.weight + randFloat(-0.15, 0.15), -1, 1);
    }
  }

  if (Math.random() < CONN_ADD_RATE) {
    const from = randInt(0, 23);
    const to = randInt(12, 31);
    genome.connections.push({ from, to, weight: randFloat(-0.2, 0.2) });
  }

  if (genome.connections.length > 10 && Math.random() < CONN_DEL_RATE) {
    genome.connections.splice(randInt(0, genome.connections.length - 1), 1);
  }

  // Biochemistry
  if (Math.random() < POINT_RATE) genome.stomachRate = clamp(genome.stomachRate + randFloat(-0.05, 0.05), 0.2, 1.0);
  if (Math.random() < POINT_RATE) genome.muscleRate = clamp(genome.muscleRate + randFloat(-0.01, 0.01), 0.01, 0.08);
  if (Math.random() < POINT_RATE) genome.brainOrganRate = clamp(genome.brainOrganRate + randFloat(-0.03, 0.03), 0.05, 0.5);

  // Body morphology (continuous)
  if (Math.random() < POINT_RATE) genome.bodyScale = clamp(genome.bodyScale + randFloat(-0.08, 0.08), 0.4, 1.6);
  if (Math.random() < POINT_RATE) genome.bodyWidth = clamp(genome.bodyWidth + randFloat(-0.08, 0.08), 0.5, 1.5);
  if (Math.random() < POINT_RATE) genome.bodyLength = clamp(genome.bodyLength + randFloat(-0.08, 0.08), 0.5, 1.5);
  if (Math.random() < POINT_RATE) genome.headSize = clamp(genome.headSize + randFloat(-0.06, 0.06), 0.3, 1.2);
  if (Math.random() < POINT_RATE) genome.snoutLength = clamp(genome.snoutLength + randFloat(-0.06, 0.06), 0.1, 0.8);
  if (Math.random() < POINT_RATE) genome.snoutWidth = clamp(genome.snoutWidth + randFloat(-0.05, 0.05), 0.2, 0.8);
  if (Math.random() < POINT_RATE) genome.earSize = clamp(genome.earSize + randFloat(-0.06, 0.06), 0.15, 1.0);
  if (Math.random() < POINT_RATE) genome.earAngle = clamp(genome.earAngle + randFloat(-0.08, 0.08), 0.1, 1.0);
  if (Math.random() < POINT_RATE) genome.tailLength = clamp(genome.tailLength + randFloat(-0.08, 0.08), 0.1, 1.5);
  if (Math.random() < POINT_RATE) genome.tailThickness = clamp(genome.tailThickness + randFloat(-0.04, 0.04), 0.08, 0.5);
  if (Math.random() < POINT_RATE) genome.tailCurl = clamp(genome.tailCurl + randFloat(-0.1, 0.1), 0, 1.0);
  if (Math.random() < POINT_RATE) genome.legLength = clamp(genome.legLength + randFloat(-0.06, 0.06), 0.3, 1.2);
  if (Math.random() < POINT_RATE) genome.legThickness = clamp(genome.legThickness + randFloat(-0.03, 0.03), 0.08, 0.4);
  if (Math.random() < POINT_RATE) genome.eyeSize = clamp(genome.eyeSize + randFloat(-0.04, 0.04), 0.1, 0.5);
  if (Math.random() < POINT_RATE) genome.eyeSpacing = clamp(genome.eyeSpacing + randFloat(-0.05, 0.05), 0.3, 0.9);

  // Discrete morphology types (rare flips)
  if (Math.random() < TYPE_FLIP_RATE) genome.bodyShape = randInt(0, BODY_SHAPE_COUNT - 1) as BodyShape;
  if (Math.random() < TYPE_FLIP_RATE) genome.earType = randInt(0, EAR_TYPE_COUNT - 1) as EarType;
  if (Math.random() < TYPE_FLIP_RATE) genome.tailType = randInt(0, TAIL_TYPE_COUNT - 1) as TailType;
  if (Math.random() < TYPE_FLIP_RATE) genome.snoutType = randInt(0, SNOUT_TYPE_COUNT - 1) as SnoutType;
  if (Math.random() < TYPE_FLIP_RATE) {
    genome.legCount = [2, 4, 4, 4, 6][randInt(0, 4)];
  }

  // Colors
  if (Math.random() < POINT_RATE) genome.colorH = (genome.colorH + randFloat(-15, 15) + 360) % 360;
  if (Math.random() < POINT_RATE) genome.colorS = clamp(genome.colorS + randFloat(-0.08, 0.08), 0.2, 1.0);
  if (Math.random() < POINT_RATE) genome.colorL = clamp(genome.colorL + randFloat(-0.08, 0.08), 0.25, 0.8);
  if (Math.random() < POINT_RATE) genome.bellyColorL = clamp(genome.bellyColorL + randFloat(-0.08, 0.08), 0.5, 0.95);
  if (Math.random() < POINT_RATE) genome.patternH = (genome.patternH + randFloat(-20, 20) + 360) % 360;
  if (Math.random() < 0.02) genome.hasSpots = !genome.hasSpots;
  if (Math.random() < 0.02) genome.hasStripes = !genome.hasStripes;

  // Lifecycle
  if (Math.random() < POINT_RATE) genome.maxAge = clamp(genome.maxAge + randInt(-200, 200), 3000, 15000);
  if (Math.random() < POINT_RATE) genome.fertilityThreshold = clamp(genome.fertilityThreshold + randFloat(-0.05, 0.05), 0.3, 0.8);
  if (Math.random() < POINT_RATE) genome.speed = clamp(genome.speed + randFloat(-0.15, 0.15), 0.8, 5.0);
  if (Math.random() < POINT_RATE) genome.turnRate = clamp(genome.turnRate + randFloat(-0.15, 0.15), 0.8, 4.0);

  // Diet
  if (Math.random() < POINT_RATE) genome.dietBerry = clamp(genome.dietBerry + randFloat(-0.08, 0.08), 0.05, 0.9);
  if (Math.random() < POINT_RATE) genome.dietGrass = clamp(genome.dietGrass + randFloat(-0.08, 0.08), 0.05, 0.9);
  if (Math.random() < POINT_RATE) genome.dietRoot = clamp(genome.dietRoot + randFloat(-0.08, 0.08), 0.05, 0.9);

  // Renormalize diet
  const dietSum = genome.dietBerry + genome.dietGrass + genome.dietRoot;
  if (dietSum > 0) {
    genome.dietBerry /= dietSum;
    genome.dietGrass /= dietSum;
    genome.dietRoot /= dietSum;
  }
}
