import { ComponentStorage } from '../ecs/Component';
import { CHEMICAL_COUNT } from '../biochemistry/ChemicalRegistry';

export interface BiochemData {
  chemicals: Float32Array; // indexed by ChemId
}

export function createBiochem(): BiochemData {
  const chemicals = new Float32Array(CHEMICAL_COUNT);
  // Starting values — comfortable runway to find food
  chemicals[1] = 0.9;  // Energy
  chemicals[3] = 0.8;  // Glucose
  chemicals[4] = 0.6;  // ATP
  chemicals[8] = 1.0;  // LifeForce
  return { chemicals };
}

export const BiochemStore = new ComponentStorage<BiochemData>();
