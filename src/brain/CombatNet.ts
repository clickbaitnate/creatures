// Combat Neural Network: small MLP for tactical combat decisions.
// 16 inputs → 12 hidden (ReLU) → 8 outputs (sigmoid)
// Total params: 308 (192 IH weights + 12 H biases + 96 HO weights + 8 O biases)
// Learning: reward-modulated Hebbian after combat encounters.

import { clamp } from '../utils/Math';

export const COMBAT_INPUT_COUNT = 16;
export const COMBAT_HIDDEN_COUNT = 12;
export const COMBAT_OUTPUT_COUNT = 8;

// Total weight counts
export const COMBAT_WEIGHTS_IH = COMBAT_INPUT_COUNT * COMBAT_HIDDEN_COUNT;  // 192
export const COMBAT_BIAS_H = COMBAT_HIDDEN_COUNT;                            // 12
export const COMBAT_WEIGHTS_HO = COMBAT_HIDDEN_COUNT * COMBAT_OUTPUT_COUNT;  // 96
export const COMBAT_BIAS_O = COMBAT_OUTPUT_COUNT;                            // 8

export interface CombatNetState {
  weightsIH: Float32Array;  // 192
  biasH: Float32Array;      // 12
  weightsHO: Float32Array;  // 96
  biasO: Float32Array;      // 8
  // Activations (for Hebbian learning — need to remember pre/post)
  hidden: Float32Array;     // 12
  outputs: Float32Array;    // 8
  lastInputs: Float32Array; // 16
}

/** Output indices */
export const CombatOutput = {
  Formation: 0,        // 0=scatter, 0.5=loose, 1=tight-defensive
  TargetPriority: 1,   // 0=nearest, 0.5=weakest, 1=strongest
  RetreatThreshold: 2, // health below this → flee
  Aggression: 3,       // 0=defensive, 1=all-out attack
  AssistAlly: 4,       // 0=solo, 1=help allies
  Flank: 5,            // 0=direct, 1=circle around
  HoldPosition: 6,     // 0=mobile, 1=hold ground
  CallForHelp: 7,      // 0=quiet, 1=rally allies
} as const;

export function createCombatNet(
  weightsIH?: number[],
  biasH?: number[],
  weightsHO?: number[],
  biasO?: number[],
): CombatNetState {
  return {
    weightsIH: weightsIH ? new Float32Array(weightsIH) : randomWeights(COMBAT_WEIGHTS_IH, 0.3),
    biasH: biasH ? new Float32Array(biasH) : randomWeights(COMBAT_BIAS_H, 0.1),
    weightsHO: weightsHO ? new Float32Array(weightsHO) : randomWeights(COMBAT_WEIGHTS_HO, 0.3),
    biasO: biasO ? new Float32Array(biasO) : randomWeights(COMBAT_BIAS_O, 0.1),
    hidden: new Float32Array(COMBAT_HIDDEN_COUNT),
    outputs: new Float32Array(COMBAT_OUTPUT_COUNT),
    lastInputs: new Float32Array(COMBAT_INPUT_COUNT),
  };
}

function randomWeights(count: number, scale: number): Float32Array {
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = (Math.random() * 2 - 1) * scale;
  }
  return arr;
}

/** Forward pass: ~200 multiply-adds */
export function combatNetForward(net: CombatNetState, inputs: Float32Array): void {
  // Store inputs for learning
  net.lastInputs.set(inputs);

  // Hidden layer: ReLU(W_IH * inputs + b_H)
  for (let h = 0; h < COMBAT_HIDDEN_COUNT; h++) {
    let sum = net.biasH[h];
    const offset = h * COMBAT_INPUT_COUNT;
    for (let i = 0; i < COMBAT_INPUT_COUNT; i++) {
      sum += net.weightsIH[offset + i] * inputs[i];
    }
    net.hidden[h] = sum > 0 ? sum : 0; // ReLU
  }

  // Output layer: sigmoid(W_HO * hidden + b_O)
  for (let o = 0; o < COMBAT_OUTPUT_COUNT; o++) {
    let sum = net.biasO[o];
    const offset = o * COMBAT_HIDDEN_COUNT;
    for (let h = 0; h < COMBAT_HIDDEN_COUNT; h++) {
      sum += net.weightsHO[offset + h] * net.hidden[h];
    }
    net.outputs[o] = 1 / (1 + Math.exp(-sum)); // sigmoid
  }
}

/** Reward-modulated Hebbian learning after combat encounter */
export function combatNetLearn(net: CombatNetState, reward: number): void {
  const lr = 0.01;

  // IH weights: dW = lr * input * hidden * reward
  for (let h = 0; h < COMBAT_HIDDEN_COUNT; h++) {
    const offset = h * COMBAT_INPUT_COUNT;
    for (let i = 0; i < COMBAT_INPUT_COUNT; i++) {
      net.weightsIH[offset + i] += lr * net.lastInputs[i] * net.hidden[h] * reward;
      net.weightsIH[offset + i] = clamp(net.weightsIH[offset + i], -1, 1);
    }
    // H biases
    net.biasH[h] += lr * net.hidden[h] * reward * 0.5;
    net.biasH[h] = clamp(net.biasH[h], -1, 1);
  }

  // HO weights: dW = lr * hidden * output * reward
  for (let o = 0; o < COMBAT_OUTPUT_COUNT; o++) {
    const offset = o * COMBAT_HIDDEN_COUNT;
    for (let h = 0; h < COMBAT_HIDDEN_COUNT; h++) {
      net.weightsHO[offset + h] += lr * net.hidden[h] * net.outputs[o] * reward;
      net.weightsHO[offset + h] = clamp(net.weightsHO[offset + h], -1, 1);
    }
    // O biases
    net.biasO[o] += lr * net.outputs[o] * reward * 0.5;
    net.biasO[o] = clamp(net.biasO[o], -1, 1);
  }
}
