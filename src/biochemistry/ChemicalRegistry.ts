// Phase 1: 10 chemicals
// Each chemical has an ID, name, and half-life (decay per tick, 0 = stable)

export const enum ChemId {
  Hunger    = 0,
  Energy    = 1,
  Pain      = 2,
  Glucose   = 3,
  ATP       = 4,
  Reward    = 5,
  Punishment= 6,
  Age       = 7,
  LifeForce = 8,
  Tiredness = 9,
}

export const CHEMICAL_COUNT = 10;

export interface ChemicalDef {
  id: number;
  name: string;
  halfLife: number; // decay multiplier per tick (1.0 = no decay, 0.9 = 10% decay)
  min: number;
  max: number;
}

export const CHEMICALS: ChemicalDef[] = [
  { id: ChemId.Hunger,     name: 'Hunger',     halfLife: 1.0,   min: 0, max: 1 },
  { id: ChemId.Energy,     name: 'Energy',     halfLife: 1.0,   min: 0, max: 1 },
  { id: ChemId.Pain,       name: 'Pain',       halfLife: 0.95,  min: 0, max: 1 },
  { id: ChemId.Glucose,    name: 'Glucose',    halfLife: 0.99,  min: 0, max: 1 },
  { id: ChemId.ATP,        name: 'ATP',        halfLife: 0.98,  min: 0, max: 1 },
  { id: ChemId.Reward,     name: 'Reward',     halfLife: 0.90,  min: 0, max: 1 },
  { id: ChemId.Punishment, name: 'Punishment', halfLife: 0.90,  min: 0, max: 1 },
  { id: ChemId.Age,        name: 'Age',        halfLife: 1.0,   min: 0, max: 1 },
  { id: ChemId.LifeForce,  name: 'LifeForce',  halfLife: 1.0,   min: 0, max: 1 },
  { id: ChemId.Tiredness,  name: 'Tiredness',  halfLife: 0.99,  min: 0, max: 1 },
];
