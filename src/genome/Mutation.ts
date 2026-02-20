import { clamp, randFloat, randInt } from '../utils/Math';
import { LOBES } from '../brain/CTRNN';
import type { CreatureGenome } from './Genome';

const POINT_RATE = 0.05;   // 5% chance per value
const CONN_ADD_RATE = 0.03;
const CONN_DEL_RATE = 0.02;

export function mutate(genome: CreatureGenome): void {
  // Mutate brain biases
  for (let i = 0; i < genome.brainBiases.length; i++) {
    if (Math.random() < POINT_RATE) {
      genome.brainBiases[i] = clamp(genome.brainBiases[i] + randFloat(-0.2, 0.2), -1, 1);
    }
  }

  // Mutate brain taus
  for (let i = 0; i < genome.brainTaus.length; i++) {
    if (Math.random() < POINT_RATE) {
      const lobe = LOBES.find(l => i >= l.offset && i < l.offset + l.size)!;
      genome.brainTaus[i] = clamp(genome.brainTaus[i] + randFloat(-0.5, 0.5), lobe.tauMin, lobe.tauMax);
    }
  }

  // Mutate connection weights
  for (const conn of genome.connections) {
    if (Math.random() < POINT_RATE) {
      conn.weight = clamp(conn.weight + randFloat(-0.15, 0.15), -1, 1);
    }
  }

  // Possibly add a new connection
  if (Math.random() < CONN_ADD_RATE) {
    const from = randInt(0, 23);  // any non-decision neuron
    const to = randInt(12, 31);   // concept or decision
    genome.connections.push({ from, to, weight: randFloat(-0.2, 0.2) });
  }

  // Possibly remove a connection
  if (genome.connections.length > 10 && Math.random() < CONN_DEL_RATE) {
    const idx = randInt(0, genome.connections.length - 1);
    genome.connections.splice(idx, 1);
  }

  // Mutate scalar traits
  if (Math.random() < POINT_RATE) genome.stomachRate = clamp(genome.stomachRate + randFloat(-0.05, 0.05), 0.1, 1.0);
  if (Math.random() < POINT_RATE) genome.muscleRate = clamp(genome.muscleRate + randFloat(-0.01, 0.01), 0.01, 0.1);
  if (Math.random() < POINT_RATE) genome.brainOrganRate = clamp(genome.brainOrganRate + randFloat(-0.03, 0.03), 0.05, 0.5);
  if (Math.random() < POINT_RATE) genome.colorH = (genome.colorH + randFloat(-20, 20) + 360) % 360;
  if (Math.random() < POINT_RATE) genome.colorS = clamp(genome.colorS + randFloat(-0.1, 0.1), 0.2, 1.0);
  if (Math.random() < POINT_RATE) genome.colorL = clamp(genome.colorL + randFloat(-0.1, 0.1), 0.3, 0.8);
  if (Math.random() < POINT_RATE) genome.bodyScale = clamp(genome.bodyScale + randFloat(-0.05, 0.05), 0.5, 1.5);
  if (Math.random() < POINT_RATE) genome.maxAge = clamp(genome.maxAge + randInt(-200, 200), 2000, 12000);
  if (Math.random() < POINT_RATE) genome.speed = clamp(genome.speed + randFloat(-0.2, 0.2), 0.8, 5.0);
  if (Math.random() < POINT_RATE) genome.turnRate = clamp(genome.turnRate + randFloat(-0.2, 0.2), 0.8, 4.0);
}
