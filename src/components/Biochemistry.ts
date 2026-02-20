import { ComponentStorage } from '../ecs/Component';
import { CHEMICAL_COUNT } from '../biochemistry/ChemicalRegistry';

export interface BiochemData {
  chemicals: Float32Array; // indexed by ChemId
}

export function createBiochem(): BiochemData {
  const chemicals = new Float32Array(CHEMICAL_COUNT);
  // Starting values
  chemicals[1] = 0.8;  // Energy
  chemicals[3] = 0.5;  // Glucose
  chemicals[4] = 0.5;  // ATP
  chemicals[8] = 1.0;  // LifeForce
  return { chemicals };
}

export const BiochemStore = new ComponentStorage<BiochemData>();
