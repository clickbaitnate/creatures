import { clamp, sigmoid, tanhFn, relu } from '../utils/Math';

// Expanded brain: 64 neurons across 5 lobes
// Drive(4) | Sense(16) | Concept(16) | Planning(8) | Decision(12) [was 8]

export const NEURON_COUNT = 56;

export const enum LobeId {
  Drive    = 0,
  Sense    = 1,
  Concept  = 2,
  Planning = 3,
  Decision = 4,
}

export interface LobeInfo {
  id: LobeId;
  name: string;
  offset: number;
  size: number;
  activation: (x: number) => number;
  tauMin: number;
  tauMax: number;
}

export const LOBES: LobeInfo[] = [
  { id: LobeId.Drive,    name: 'Drive',    offset: 0,  size: 4,  activation: tanhFn,  tauMin: 5, tauMax: 10 },
  { id: LobeId.Sense,    name: 'Sense',    offset: 4,  size: 16, activation: sigmoid, tauMin: 1, tauMax: 2 },
  { id: LobeId.Concept,  name: 'Concept',  offset: 20, size: 16, activation: sigmoid, tauMin: 3, tauMax: 6 },
  { id: LobeId.Planning, name: 'Planning', offset: 36, size: 8,  activation: sigmoid, tauMin: 4, tauMax: 8 },
  { id: LobeId.Decision, name: 'Decision', offset: 44, size: 12, activation: relu,    tauMin: 1, tauMax: 2 },
];

export function lobeOf(neuronIndex: number): LobeInfo {
  for (let i = LOBES.length - 1; i >= 0; i--) {
    if (neuronIndex >= LOBES[i].offset) return LOBES[i];
  }
  return LOBES[0];
}

export interface BrainState {
  states: Float32Array;   // y_i internal state
  outputs: Float32Array;  // sigma(y_i + bias_i) cached
  biases: Float32Array;   // per-neuron bias
  taus: Float32Array;     // per-neuron time constant
  inputs: Float32Array;   // external inputs (zeroed each tick)
  // Sparse connections stored as parallel arrays
  connFrom: Uint8Array;   // source neuron indices
  connTo: Uint8Array;     // target neuron indices
  connWeights: Float32Array; // w_ij
  connCount: number;
}

export function createBrain(
  biases: Float32Array,
  taus: Float32Array,
  connFrom: Uint8Array,
  connTo: Uint8Array,
  connWeights: Float32Array,
): BrainState {
  return {
    states: new Float32Array(NEURON_COUNT),
    outputs: new Float32Array(NEURON_COUNT),
    biases,
    taus,
    inputs: new Float32Array(NEURON_COUNT),
    connFrom,
    connTo,
    connWeights,
    connCount: connFrom.length,
  };
}

export function brainTick(brain: BrainState, dt: number): void {
  const { states, outputs, biases, taus, inputs, connFrom, connTo, connWeights, connCount } = brain;

  // 1. Compute activated outputs from current state
  for (let i = 0; i < NEURON_COUNT; i++) {
    const lobe = lobeOf(i);
    outputs[i] = lobe.activation(states[i] + biases[i]);
  }

  // 2. Accumulate weighted inputs per target neuron
  const inputSum = new Float32Array(NEURON_COUNT);
  for (let c = 0; c < connCount; c++) {
    inputSum[connTo[c]] += connWeights[c] * outputs[connFrom[c]];
  }

  // 3. Forward Euler integration
  for (let i = 0; i < NEURON_COUNT; i++) {
    const dy = -states[i] + inputSum[i] + inputs[i];
    states[i] += (dt / taus[i]) * dy;
    states[i] = clamp(states[i], -5.0, 5.0);
  }

  // 4. Recompute outputs with updated state
  for (let i = 0; i < NEURON_COUNT; i++) {
    const lobe = lobeOf(i);
    let out = lobe.activation(states[i] + biases[i]);
    // Clamp ReLU outputs
    if (lobe.activation === relu) {
      out = clamp(out, 0, 2.0);
    }
    outputs[i] = out;
  }

  // 5. Clear external inputs
  inputs.fill(0);
}

// Simple Hebbian + reward-modulated learning for Phase 1
export function applyLearning(brain: BrainState, reward: number, punishment: number): void {
  const { outputs, connFrom, connTo, connWeights, connCount } = brain;
  const lr = 0.005;

  for (let c = 0; c < connCount; c++) {
    const pre = outputs[connFrom[c]];
    const post = outputs[connTo[c]];
    const target = connTo[c];

    // Concept, Planning and Decision connections: reward-modulated
    if (target >= 20) {
      const mod = reward - punishment;
      connWeights[c] += lr * pre * post * mod;
    } else {
      // Sense→Concept: basic Hebbian
      connWeights[c] += lr * 0.5 * pre * post;
    }

    // Atrophy
    const activity = Math.abs(pre * post);
    connWeights[c] -= 0.0002 * (1 - activity) * connWeights[c];

    // Clamp
    connWeights[c] = clamp(connWeights[c], -1.0, 1.0);
  }
}
