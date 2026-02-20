import { randFloat, randInt } from '../utils/Math';
import type { CreatureGenome } from './Genome';

export function crossover(parentA: CreatureGenome, parentB: CreatureGenome): CreatureGenome {
  const pick = () => Math.random() < 0.5;
  const blend = (a: number, b: number) => (a + b) / 2 + randFloat(-0.05, 0.05);

  // Brain: per-neuron, pick from either parent
  const brainBiases = parentA.brainBiases.map((a, i) =>
    pick() ? a : parentB.brainBiases[i]
  );
  const brainTaus = parentA.brainTaus.map((a, i) =>
    pick() ? a : parentB.brainTaus[i]
  );

  // Connections: merge with random selection
  const connMap = new Map<string, { from: number; to: number; weight: number }>();
  for (const c of parentA.connections) {
    connMap.set(`${c.from}-${c.to}`, { ...c });
  }
  for (const c of parentB.connections) {
    const key = `${c.from}-${c.to}`;
    if (connMap.has(key)) {
      if (pick()) connMap.set(key, { ...c });
    } else if (pick()) {
      connMap.set(key, { ...c });
    }
  }
  const connections = Array.from(connMap.values()).filter(() => Math.random() < 0.92);

  return {
    brainBiases,
    brainTaus,
    connections,
    stomachRate: pick() ? parentA.stomachRate : parentB.stomachRate,
    muscleRate: pick() ? parentA.muscleRate : parentB.muscleRate,
    brainOrganRate: pick() ? parentA.brainOrganRate : parentB.brainOrganRate,

    // Body morphology: blend continuous values, pick discrete types
    bodyScale: blend(parentA.bodyScale, parentB.bodyScale),
    bodyShape: pick() ? parentA.bodyShape : parentB.bodyShape,
    bodyWidth: blend(parentA.bodyWidth, parentB.bodyWidth),
    bodyLength: blend(parentA.bodyLength, parentB.bodyLength),

    headSize: blend(parentA.headSize, parentB.headSize),
    snoutType: pick() ? parentA.snoutType : parentB.snoutType,
    snoutLength: blend(parentA.snoutLength, parentB.snoutLength),
    snoutWidth: blend(parentA.snoutWidth, parentB.snoutWidth),

    earType: pick() ? parentA.earType : parentB.earType,
    earSize: blend(parentA.earSize, parentB.earSize),
    earAngle: blend(parentA.earAngle, parentB.earAngle),

    tailType: pick() ? parentA.tailType : parentB.tailType,
    tailLength: blend(parentA.tailLength, parentB.tailLength),
    tailThickness: blend(parentA.tailThickness, parentB.tailThickness),
    tailCurl: blend(parentA.tailCurl, parentB.tailCurl),

    legCount: pick() ? parentA.legCount : parentB.legCount,
    legLength: blend(parentA.legLength, parentB.legLength),
    legThickness: blend(parentA.legThickness, parentB.legThickness),

    eyeSize: blend(parentA.eyeSize, parentB.eyeSize),
    eyeSpacing: blend(parentA.eyeSpacing, parentB.eyeSpacing),

    // Colors: blend
    colorH: pick() ? parentA.colorH : parentB.colorH,
    colorS: blend(parentA.colorS, parentB.colorS),
    colorL: blend(parentA.colorL, parentB.colorL),
    bellyColorL: blend(parentA.bellyColorL, parentB.bellyColorL),
    patternH: pick() ? parentA.patternH : parentB.patternH,
    hasSpots: pick() ? parentA.hasSpots : parentB.hasSpots,
    hasStripes: pick() ? parentA.hasStripes : parentB.hasStripes,

    maxAge: pick() ? parentA.maxAge : parentB.maxAge,
    fertilityThreshold: blend(parentA.fertilityThreshold, parentB.fertilityThreshold),
    speed: blend(parentA.speed, parentB.speed),
    turnRate: blend(parentA.turnRate, parentB.turnRate),

    dietBerry: blend(parentA.dietBerry, parentB.dietBerry),
    dietGrass: blend(parentA.dietGrass, parentB.dietGrass),
    dietRoot: blend(parentA.dietRoot, parentB.dietRoot),
  };
}
