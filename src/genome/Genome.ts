import { randFloat, randInt } from '../utils/Math';
import { NEURON_COUNT, LOBES, type BrainState, createBrain } from '../brain/CTRNN';

// Phase 1: Simplified haploid genome — ~30 gene-like parameters
// Full diploid binary genome comes in Phase 8

export interface CreatureGenome {
  // Brain: per-neuron biases and time constants
  brainBiases: number[];      // NEURON_COUNT values, [-1, 1]
  brainTaus: number[];        // NEURON_COUNT values, within lobe range

  // Brain connections: sparse list of (from, to, weight)
  connections: { from: number; to: number; weight: number }[];

  // Biochemistry: organ reaction rates
  stomachRate: number;        // glucose conversion rate
  muscleRate: number;         // ATP consumption rate
  brainOrganRate: number;     // reward/punishment production rate

  // Morphology (Phase 1: just color)
  colorH: number;             // hue 0-360
  colorS: number;             // saturation 0-1
  colorL: number;             // lightness 0-1
  bodyScale: number;          // 0.5-1.5

  // Lifecycle
  maxAge: number;             // ticks until old age death
  fertilityThreshold: number; // energy level needed to reproduce
  speed: number;              // base movement speed
  turnRate: number;           // base turn rate
}

export function createDefaultGenome(): CreatureGenome {
  const brainBiases: number[] = [];
  const brainTaus: number[] = [];

  for (let i = 0; i < NEURON_COUNT; i++) {
    const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
    brainBiases.push(randFloat(-0.3, 0.3));
    brainTaus.push(randFloat(lobe.tauMin, lobe.tauMax));
  }

  // Default connection pattern:
  // Drive → Concept (drives influence thinking)
  // Sense → Concept (senses feed concepts)
  // Concept → Decision (concepts drive decisions)
  // Concept → Concept (recurrent, sparse)
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

  return {
    brainBiases,
    brainTaus,
    connections,
    stomachRate: randFloat(0.3, 0.7),
    muscleRate: randFloat(0.02, 0.06),
    brainOrganRate: randFloat(0.1, 0.3),
    colorH: randFloat(0, 360),
    colorS: randFloat(0.4, 0.9),
    colorL: randFloat(0.4, 0.7),
    bodyScale: randFloat(0.7, 1.2),
    maxAge: randInt(4000, 8000),
    fertilityThreshold: randFloat(0.6, 0.85),
    speed: randFloat(1.5, 3.5),
    turnRate: randFloat(1.5, 3.0),
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
