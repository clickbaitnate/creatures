import { randFloat, randInt, clamp } from '../utils/Math';
import { NEURON_COUNT, LOBES, type BrainState, createBrain } from '../brain/CTRNN';

// Phase 1: Simplified haploid genome with morphology traits

export const enum EarType { Pointy = 0, Floppy = 1, Round = 2, Bat = 3 }
export const enum TailType { Thin = 0, Bushy = 1, Curly = 2, Stub = 3 }
export const enum SnoutType { Short = 0, Long = 1, Flat = 2, Beak = 3 }
export const enum BodyShape { Round = 0, Long = 1, Squat = 2 }

export const EAR_TYPE_COUNT = 4;
export const TAIL_TYPE_COUNT = 4;
export const SNOUT_TYPE_COUNT = 4;
export const BODY_SHAPE_COUNT = 3;

export interface CreatureGenome {
  // Brain
  brainBiases: number[];
  brainTaus: number[];
  connections: { from: number; to: number; weight: number }[];

  // Biochemistry
  stomachRate: number;
  muscleRate: number;
  brainOrganRate: number;

  // Morphology — body
  bodyScale: number;        // 0.5-1.5
  bodyShape: BodyShape;     // round, long, squat
  bodyWidth: number;        // 0.6-1.4 relative
  bodyLength: number;       // 0.6-1.4 relative

  // Morphology — head
  headSize: number;         // 0.4-1.2 relative to body
  snoutType: SnoutType;
  snoutLength: number;      // 0.1-0.8
  snoutWidth: number;       // 0.3-0.8

  // Morphology — ears
  earType: EarType;
  earSize: number;          // 0.2-1.0
  earAngle: number;         // 0-1 (0=flat against head, 1=sticking straight out)

  // Morphology — tail
  tailType: TailType;
  tailLength: number;       // 0.1-1.5
  tailThickness: number;    // 0.1-0.5
  tailCurl: number;         // 0-1 (0=straight, 1=fully curled)

  // Morphology — legs
  legCount: number;         // 2, 4, or 6
  legLength: number;        // 0.3-1.2
  legThickness: number;     // 0.1-0.4

  // Morphology — eyes
  eyeSize: number;          // 0.1-0.5
  eyeSpacing: number;       // 0.3-0.9

  // Colors
  colorH: number;           // hue 0-360
  colorS: number;           // saturation 0-1
  colorL: number;           // lightness 0-1
  bellyColorL: number;      // belly lightness offset (usually lighter)
  patternH: number;         // secondary pattern hue
  hasSpots: boolean;
  hasStripes: boolean;

  // Lifecycle
  maxAge: number;
  fertilityThreshold: number;
  speed: number;
  turnRate: number;

  // Niche — dietary efficiency per food type (0-1)
  dietBerry: number;
  dietGrass: number;
  dietRoot: number;
}

export function createDefaultGenome(): CreatureGenome {
  const brainBiases: number[] = [];
  const brainTaus: number[] = [];

  for (let i = 0; i < NEURON_COUNT; i++) {
    const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
    brainBiases.push(randFloat(-0.3, 0.3));
    brainTaus.push(randFloat(lobe.tauMin, lobe.tauMax));
  }

  const connections: { from: number; to: number; weight: number }[] = [];

  // Drive(0-3) → Concept(12-23)
  for (let d = 0; d < 4; d++) {
    for (let c = 12; c < 24; c++) {
      if (Math.random() < 0.5) {
        connections.push({ from: d, to: c, weight: randFloat(-0.3, 0.3) });
      }
    }
  }
  // Sense(4-11) → Concept(12-23)
  for (let s = 4; s < 12; s++) {
    for (let c = 12; c < 24; c++) {
      if (Math.random() < 0.4) {
        connections.push({ from: s, to: c, weight: randFloat(-0.2, 0.3) });
      }
    }
  }
  // Concept(12-23) → Decision(24-31)
  for (let c = 12; c < 24; c++) {
    for (let d = 24; d < 32; d++) {
      if (Math.random() < 0.4) {
        connections.push({ from: c, to: d, weight: randFloat(-0.3, 0.3) });
      }
    }
  }
  // Concept → Concept recurrent (sparse)
  for (let i = 12; i < 24; i++) {
    for (let j = 12; j < 24; j++) {
      if (i !== j && Math.random() < 0.15) {
        connections.push({ from: i, to: j, weight: randFloat(-0.1, 0.1) });
      }
    }
  }

  // Randomize dietary specialization — creatures lean toward one food type
  const dietRaw = [Math.random(), Math.random(), Math.random()];
  const dietSum = dietRaw[0] + dietRaw[1] + dietRaw[2];

  return {
    brainBiases,
    brainTaus,
    connections,
    stomachRate: randFloat(0.4, 0.8),
    muscleRate: randFloat(0.02, 0.05),
    brainOrganRate: randFloat(0.1, 0.3),

    bodyScale: randFloat(0.6, 1.3),
    bodyShape: randInt(0, BODY_SHAPE_COUNT - 1) as BodyShape,
    bodyWidth: randFloat(0.7, 1.3),
    bodyLength: randFloat(0.7, 1.3),

    headSize: randFloat(0.5, 1.0),
    snoutType: randInt(0, SNOUT_TYPE_COUNT - 1) as SnoutType,
    snoutLength: randFloat(0.15, 0.7),
    snoutWidth: randFloat(0.3, 0.7),

    earType: randInt(0, EAR_TYPE_COUNT - 1) as EarType,
    earSize: randFloat(0.25, 0.9),
    earAngle: randFloat(0.2, 0.9),

    tailType: randInt(0, TAIL_TYPE_COUNT - 1) as TailType,
    tailLength: randFloat(0.2, 1.3),
    tailThickness: randFloat(0.1, 0.4),
    tailCurl: randFloat(0, 0.9),

    legCount: [2, 4, 4, 4, 6][randInt(0, 4)], // mostly quadrupeds
    legLength: randFloat(0.4, 1.0),
    legThickness: randFloat(0.12, 0.3),

    eyeSize: randFloat(0.15, 0.4),
    eyeSpacing: randFloat(0.4, 0.8),

    colorH: randFloat(0, 360),
    colorS: randFloat(0.3, 0.85),
    colorL: randFloat(0.35, 0.7),
    bellyColorL: randFloat(0.6, 0.9),
    patternH: randFloat(0, 360),
    hasSpots: Math.random() < 0.3,
    hasStripes: Math.random() < 0.2,

    maxAge: randInt(5000, 10000),
    fertilityThreshold: randFloat(0.45, 0.65),
    speed: randFloat(1.5, 3.5),
    turnRate: randFloat(1.5, 3.0),

    dietBerry: dietRaw[0] / dietSum,
    dietGrass: dietRaw[1] / dietSum,
    dietRoot: dietRaw[2] / dietSum,
  };
}

export function genomeToBrain(genome: CreatureGenome): BrainState {
  const biases = new Float32Array(genome.brainBiases);
  const taus = new Float32Array(genome.brainTaus);

  const n = genome.connections.length;
  const connFrom = new Uint8Array(n);
  const connTo = new Uint8Array(n);
  const connWeights = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    connFrom[i] = genome.connections[i].from;
    connTo[i] = genome.connections[i].to;
    connWeights[i] = genome.connections[i].weight;
  }

  return createBrain(biases, taus, connFrom, connTo, connWeights);
}
