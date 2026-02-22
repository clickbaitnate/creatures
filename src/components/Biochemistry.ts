import { ComponentStorage } from '../ecs/Component';
import { CHEMICAL_COUNT } from '../biochemistry/ChemicalRegistry';

export interface BiochemData {
  chemicals: Float32Array; // indexed by ChemId
}

export function createBiochem(): BiochemData {
  const chemicals = new Float32Array(CHEMICAL_COUNT);
  // Generous starting values so creatures don't die immediately
  chemicals[1] = 1.0;  // Energy
  chemicals[3] = 1.0;  // Glucose
  chemicals[4] = 0.7;  // ATP
  chemicals[8] = 1.0;  // LifeForce
  return { chemicals };
}

export const BiochemStore = new ComponentStorage<BiochemData>();
