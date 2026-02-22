import { randFloat, randInt, clamp } from '../utils/Math';
import { NEURON_COUNT, LOBES, type BrainState, createBrain } from '../brain/CTRNN';
import { COMBAT_WEIGHTS_IH, COMBAT_BIAS_H, COMBAT_WEIGHTS_HO, COMBAT_BIAS_O } from '../brain/CombatNet';

export const enum EarType { Pointy = 0, Floppy = 1, Round = 2, Antennae = 3 }
export const enum BodyBuild { Slim = 0, Average = 1, Stocky = 2 }
export const enum Sex { Male = 0, Female = 1 }

export const EAR_TYPE_COUNT = 4;
export const BODY_BUILD_COUNT = 3;

export interface CreatureGenome {
  // Brain
  brainBiases: number[];
  brainTaus: number[];
  connections: { from: number; to: number; weight: number }[];

  // Biochemistry
  stomachRate: number;
  muscleRate: number;
  brainOrganRate: number;

  // Humanoid morphology
  bodyScale: number;        // 0.5-1.4 overall height
  bodyBuild: BodyBuild;
  headSize: number;         // 0.5-1.2 relative
  earType: EarType;
  earSize: number;          // 0.2-0.9
  armLength: number;        // 0.5-1.2
  legLength: number;        // 0.5-1.2

  // Eyes
  eyeSize: number;          // 0.15-0.5
  eyeSpacing: number;       // 0.3-0.8

  // Colors
  colorH: number;
  colorS: number;
  colorL: number;
  bellyColorL: number;
  accentH: number;          // accent color for ears, hands, markings

  // Personality (0-1 scales)
  aggression: number;       // tendency toward violence
  sociability: number;      // tendency to seek others
  curiosity: number;        // tendency to explore
  loyalty: number;          // tendency to stick with faction
  creativity: number;       // tendency to build

  // Behavioral affinities (0-1 scales)
  gatherAffinity: number;   // bias toward gathering
  huntAffinity: number;     // bias toward hunting
  buildAffinity: number;    // bias toward building
  hoardAffinity: number;    // bias toward storing resources

  // Lifecycle
  maxAge: number;
  fertilityThreshold: number;
  speed: number;
  turnRate: number;

  // Diet
  dietBerry: number;
  dietGrass: number;
  dietRoot: number;

  // Sex & breeding
  sex: Sex;                    // Male=0, Female=1
  dimorphism: number;          // 0-0.5 — how much sex affects size/proportions
  displayIntensity: number;    // 0-1 — sexual display effort
  monogamy: number;            // 0=promiscuous, 1=strictly pair-bonded
  mateSelectiveness: number;   // 0=mates with anyone, 1=extremely picky

  // Building evolution
  buildingMutationRate: number;   // 0-0.3 — how much buildings deviate from template
  buildingMaterialPref: number;   // 0=wood-heavy, 1=stone-heavy

  // Species marker — used for genetic distance
  speciesMarker: number[];  // 8 float values that drift via mutation

  // Combat neural net weights
  combatWeightsIH: number[];
  combatBiasH: number[];
  combatWeightsHO: number[];
  combatBiasO: number[];

  // Astrology
  birthSign: number;  // ZodiacSign index (0-11), assigned at birth
}

export function createDefaultGenome(): CreatureGenome {
  const brainBiases: number[] = [];
  const brainTaus: number[] = [];

  for (let i = 0; i < NEURON_COUNT; i++) {
    const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
    brainBiases.push(randFloat(-0.3, 0.3));
    brainTaus.push(randFloat(lobe.tauMin, lobe.tauMax));
  }

  // 60-neuron architecture: Drive(0-3), Sense(4-23), Concept(24-39), Planning(40-47), Decision(48-59)
  const connections: { from: number; to: number; weight: number }[] = [];
  // Drive → Concept
  for (let d = 0; d < 4; d++)
    for (let c = 24; c < 40; c++)
      if (Math.random() < 0.5)
        connections.push({ from: d, to: c, weight: randFloat(-0.3, 0.3) });
  // Sense → Concept
  for (let s = 4; s < 24; s++)
    for (let c = 24; c < 40; c++)
      if (Math.random() < 0.35)
        connections.push({ from: s, to: c, weight: randFloat(-0.2, 0.3) });
  // Concept → Planning
  for (let c = 24; c < 40; c++)
    for (let p = 40; p < 48; p++)
      if (Math.random() < 0.3)
        connections.push({ from: c, to: p, weight: randFloat(-0.3, 0.3) });
  // Drive → Planning
  for (let d = 0; d < 4; d++)
    for (let p = 40; p < 48; p++)
      if (Math.random() < 0.4)
        connections.push({ from: d, to: p, weight: randFloat(-0.3, 0.3) });
  // Planning → Decision
  for (let p = 40; p < 48; p++)
    for (let d = 48; d < 60; d++)
      if (Math.random() < 0.35)
        connections.push({ from: p, to: d, weight: randFloat(-0.3, 0.3) });
  // Concept → Decision (direct path too)
  for (let c = 24; c < 40; c++)
    for (let d = 48; d < 60; d++)
      if (Math.random() < 0.2)
        connections.push({ from: c, to: d, weight: randFloat(-0.3, 0.3) });
  // Concept recurrent
  for (let i = 24; i < 40; i++)
    for (let j = 24; j < 40; j++)
      if (i !== j && Math.random() < 0.12)
        connections.push({ from: i, to: j, weight: randFloat(-0.1, 0.1) });
  // Planning recurrent
  for (let i = 40; i < 48; i++)
    for (let j = 40; j < 48; j++)
      if (i !== j && Math.random() < 0.15)
        connections.push({ from: i, to: j, weight: randFloat(-0.1, 0.1) });

  const dietRaw = [Math.random(), Math.random(), Math.random()];
  const dietSum = dietRaw[0] + dietRaw[1] + dietRaw[2];

  return {
    brainBiases, brainTaus, connections,
    stomachRate: randFloat(0.4, 0.8),
    muscleRate: randFloat(0.02, 0.05),
    brainOrganRate: randFloat(0.1, 0.3),

    bodyScale: randFloat(0.6, 1.3),
    bodyBuild: randInt(0, BODY_BUILD_COUNT - 1) as BodyBuild,
    headSize: randFloat(0.6, 1.0),
    earType: randInt(0, EAR_TYPE_COUNT - 1) as EarType,
    earSize: randFloat(0.3, 0.8),
    armLength: randFloat(0.6, 1.1),
    legLength: randFloat(0.6, 1.1),
    eyeSize: randFloat(0.2, 0.45),
    eyeSpacing: randFloat(0.35, 0.75),

    colorH: randFloat(0, 360),
    colorS: randFloat(0.3, 0.85),
    colorL: randFloat(0.35, 0.7),
    bellyColorL: randFloat(0.6, 0.9),
    accentH: randFloat(0, 360),

    aggression: randFloat(0.1, 0.7),
    sociability: randFloat(0.2, 0.9),
    curiosity: randFloat(0.2, 0.8),
    loyalty: randFloat(0.3, 0.9),
    creativity: randFloat(0.1, 0.7),

    gatherAffinity: randFloat(0.2, 0.8),
    huntAffinity: randFloat(0.1, 0.6),
    buildAffinity: randFloat(0.1, 0.6),
    hoardAffinity: randFloat(0.1, 0.5),

    maxAge: randInt(5000, 10000),
    fertilityThreshold: randFloat(0.45, 0.65),
    speed: randFloat(1.5, 3.5),
    turnRate: randFloat(1.5, 3.0),

    dietBerry: dietRaw[0] / dietSum,
    dietGrass: dietRaw[1] / dietSum,
    dietRoot: dietRaw[2] / dietSum,

    sex: (Math.random() < 0.5 ? 0 : 1) as Sex,
    dimorphism: randFloat(0, 0.5),
    displayIntensity: randFloat(0.1, 0.9),
    monogamy: randFloat(0, 1),
    mateSelectiveness: randFloat(0.1, 0.8),

    buildingMutationRate: randFloat(0, 0.3),
    buildingMaterialPref: randFloat(0, 1),

    speciesMarker: Array.from({ length: 8 }, () => randFloat(0, 1)),

    combatWeightsIH: Array.from({ length: COMBAT_WEIGHTS_IH }, () => randFloat(-0.3, 0.3)),
    combatBiasH: Array.from({ length: COMBAT_BIAS_H }, () => randFloat(-0.1, 0.1)),
    combatWeightsHO: Array.from({ length: COMBAT_WEIGHTS_HO }, () => randFloat(-0.3, 0.3)),
    combatBiasO: Array.from({ length: COMBAT_BIAS_O }, () => randFloat(-0.1, 0.1)),

    birthSign: 0, // set at birth by Zodiac system
  };
}

/** Classify creature into breed archetype based on dominant trait combo */
export function getBreedLabel(g: CreatureGenome): string {
  const scores = [
    { label: 'Gatherer', score: g.creativity * 0.5 + g.gatherAffinity * 0.5 },
    { label: 'Hunter', score: g.aggression * 0.4 + g.huntAffinity * 0.4 + g.speed / 5 * 0.2 },
    { label: 'Builder', score: g.creativity * 0.3 + g.buildAffinity * 0.4 + g.loyalty * 0.3 },
    { label: 'Trader', score: g.sociability * 0.4 + g.hoardAffinity * 0.4 + (1 - g.aggression) * 0.2 },
    { label: 'Warrior', score: g.aggression * 0.5 + g.bodyScale / 1.5 * 0.3 + g.huntAffinity * 0.2 },
  ];
  scores.sort((a, b) => b.score - a.score);
  return scores[0].label;
}

export function geneticDistance(a: CreatureGenome, b: CreatureGenome): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const d = a.speciesMarker[i] - b.speciesMarker[i];
    sum += d * d;
  }
  return Math.sqrt(sum / 8);
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
