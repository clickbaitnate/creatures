// Save file format — version 1
// All typed arrays serialized as regular number arrays
// Chunk block data serialized as base64 strings

export const SAVE_VERSION = 5;

export interface SaveData {
  version: number;
  seed: number;
  timestamp: number;
  worldName: string;

  // Simulation counters
  generation: number;
  nextEntityId: number;
  nextNameSeed: number;

  // Time state
  seasonTick: number;
  dayNight: { timeOfDay: number; dayCount: number };
  zodiacTick: number;

  // Voxel world — each chunk as base64-encoded Uint8Array
  chunks: string[];

  // Camera
  camera: { x: number; z: number; zoom: number; angle: number };

  // Entities (creatures, buildings, eggs)
  entities: SerializedEntity[];

  // Factions
  factions: SerializedFaction[];
  entityFaction: [number, number][];
  socialBonds: { a: number; b: number; strength: number; interactions: number }[];

  // Territory
  territory: { owner: number[]; contested: number[] };

  // Politics
  politics: SerializedPolitics;

  // Critters
  critters: SerializedCritters;

  // Monsters
  monsters: SerializedMonsters;

  // Market
  market: { totalTrades: number };

  // Sephiroth
  sephiroth: [number, { values: number[]; lastUpdate: number }][];

  // v5: Raids, dialectic, pillars, market ledger
  raids?: SerializedRaid[];
  dialecticStates?: [number, any][];
  pillarStates?: { jachin: any; boaz: any; balance: number; pulseHistory: any[] };
  marketLedger?: { trades: any[]; totalTrades: number };
}

export interface SerializedRaid {
  id: number;
  attackerFaction: number;
  defenderFaction: number;
  raiders: number[];
  targetX: number;
  targetZ: number;
  homeX: number;
  homeZ: number;
  phase: number;
  phaseTick: number;
  loot: [number, number][];
  casualties: number;
  resolved: boolean;
}

export interface SerializedEntity {
  id: number;
  mask: number; // component bitmask (for reference, components keyed below)

  // Core components (always present for creatures)
  transform?: { x: number; y: number; z: number; rotation: number };
  brain?: SerializedBrain;
  genome?: any; // CreatureGenome is already a plain object (with arrays)
  biochem?: number[]; // 11 chemical levels
  motor?: any;
  senses?: any;
  lifecycle?: any;
  social?: any;
  inventory?: any;
  mating?: any;
  expression?: any;
  goal?: any;
  zealotry?: any;
  memory?: any;
  vocabulary?: { known: string[]; recent: string[] };
  combat?: {
    weightsIH: number[];
    biasH: number[];
    weightsHO: number[];
    biasO: number[];
  };
  diary?: SerializedDiary;

  // Optional components
  egg?: any;
  building?: any;
}

export interface SerializedDiary {
  entries: any[];
  nextSlot: number;
  totalEvents: number;
  killCount: number;
  tradeCount: number;
  offspringCount: number;
  gatherCount: number;
}

export interface SerializedBrain {
  states: number[];
  outputs: number[];
  biases: number[];
  taus: number[];
  connFrom: number[];
  connTo: number[];
  connWeights: number[];
  connCount: number;
}

export interface SerializedFaction {
  id: number;
  name: string;
  emoji: string;
  memberIds: number[];
  color: number;
  relations: [number, number][];
  avgMonogamy: number;
  breedingNorm: string;
  doctrine: string[];
  philosophy: string;
  foundedTick: number;
  settlementX?: number;
  settlementZ?: number;
  settlementTier?: string;
  buildingCount?: number;
}

export interface SerializedPolitics {
  tickCounter: number;
  globalTick: number;
  nations: [number, SerializedNation][];
}

export interface SerializedNation {
  territory: number;
  capital: [number, number] | null;
  government: number;
  laws: { granaryTaxRate: number; militaryDraft: boolean; buildBonus: number; tradeBonus: boolean };
  warTargets: number[];
  allies: number[];
  vassals: number[];
  overlord: number;
  warStartTick: [number, number][];
  warExhaustion: number;
  embassies: number[];
}

export interface SerializedCritters {
  count: number;
  x: number[];
  z: number[];
  type: number[];
  alive: number[];
  heading: number[];
  breedTimer: number;
}

export interface SerializedMonsters {
  count: number;
  type: number[];
  x: number[];
  z: number[];
  y: number[];
  vx: number[];
  vz: number[];
  health: number[];
  maxHealth: number[];
  targetCreature: number[];
  alive: number[];
  attackCooldown: number[];
  deathCounter: number;
  spawnTimer: number;
}
