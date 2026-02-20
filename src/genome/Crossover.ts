import { randFloat, randInt } from '../utils/Math';
import type { CreatureGenome } from './Genome';

// Phase 1: Simple crossover — pick each field from one parent or the other

export function crossover(parentA: CreatureGenome, parentB: CreatureGenome): CreatureGenome {
  const pick = () => Math.random() < 0.5;

  // Brain parameters: per-neuron, pick from either parent
  const brainBiases = parentA.brainBiases.map((a, i) =>
    pick() ? a : parentB.brainBiases[i]
  );
  const brainTaus = parentA.brainTaus.map((a, i) =>
    pick() ? a : parentB.brainTaus[i]
  );

  // Connections: take union from both parents, with random weight selection
  const connMap = new Map<string, { from: number; to: number; weight: number }>();
  for (const c of parentA.connections) {
    connMap.set(`${c.from}-${c.to}`, { ...c });
  }
  for (const c of parentB.connections) {
    const key = `${c.from}-${c.to}`;
    if (connMap.has(key)) {
      // Both parents have this connection — pick one weight
      if (pick()) {
        connMap.set(key, { ...c });
      }
    } else if (pick()) {
      // Only parent B has it — 50% chance to inherit
      connMap.set(key, { ...c });
    }
  }
  // Some connections from A might be dropped
  const connections = Array.from(connMap.values()).filter(() => Math.random() < 0.9);

  return {
    brainBiases,
    brainTaus,
    connections,
    stomachRate: pick() ? parentA.stomachRate : parentB.stomachRate,
    muscleRate: pick() ? parentA.muscleRate : parentB.muscleRate,
    brainOrganRate: pick() ? parentA.brainOrganRate : parentB.brainOrganRate,
    // Blend colors
    colorH: pick() ? parentA.colorH : parentB.colorH,
    colorS: (parentA.colorS + parentB.colorS) / 2,
    colorL: (parentA.colorL + parentB.colorL) / 2,
    bodyScale: (parentA.bodyScale + parentB.bodyScale) / 2,
    maxAge: pick() ? parentA.maxAge : parentB.maxAge,
    fertilityThreshold: pick() ? parentA.fertilityThreshold : parentB.fertilityThreshold,
    speed: (parentA.speed + parentB.speed) / 2 + randFloat(-0.2, 0.2),
    turnRate: (parentA.turnRate + parentB.turnRate) / 2 + randFloat(-0.1, 0.1),
  };
}
