// Game constants - centralized configuration

// ── Brain Neuron Indices ────────────────────────────────────────
// 60-neuron layout: Drive(0-3), Sense(4-23), Concept(24-39), Planning(40-47), Decision(48-59)

export const NEURON_INDICES = {
  // Drive inputs (0-3)
  DRIVE_HUNGER: 0,
  DRIVE_TIREDNESS: 1,
  DRIVE_PAIN: 2,
  DRIVE_ENERGY: 3,

  // Sense inputs (4-23)
  SENSE_FOOD_LEFT: 4,
  SENSE_FOOD_RIGHT: 5,
  SENSE_FOOD_NEAR: 6,
  SENSE_FOOD_FAR: 7,
  SENSE_CREATURE_LEFT: 8,
  SENSE_CREATURE_RIGHT: 9,
  SENSE_CREATURE_NEAR: 10,
  SENSE_CREATURE_FAR: 11,
  SENSE_RESOURCE_LEFT: 12,
  SENSE_RESOURCE_RIGHT: 13,
  SENSE_RESOURCE_NEAR: 14,
  SENSE_PREY_NEAR: 15,
  SENSE_BUILDING_NEAR: 16,
  SENSE_THREAT_LEVEL: 17,
  SENSE_CURRENT_RESOURCE: 18,
  SENSE_CROWD_DENSITY: 19,
  SENSE_SEASON_WARMTH: 20,
  SENSE_ALTITUDE: 21,
  SENSE_TERRAIN_SLOPE: 22,
  SENSE_TIME_OF_DAY: 23,

  // Planning inputs (40-47)
  PLAN_GOAL_FOOD: 40,
  PLAN_GOAL_SHELTER: 41,
  PLAN_GOAL_WEAPON: 42,
  PLAN_GOAL_SOCIAL: 43,
  PLAN_GOAL_EXPLORE: 44,
  PLAN_GOAL_DEFEND: 45,
  PLAN_GOAL_TRADE: 46,
  PLAN_GOAL_BUILD: 47,

  // Decision outputs (48-59)
  DECISION_MOVE_FORWARD: 48,
  DECISION_TURN_LEFT: 49,
  DECISION_TURN_RIGHT: 50,
  DECISION_SPEED_MOD: 51,
  DECISION_EAT: 52,
  DECISION_GATHER: 53,
  DECISION_HUNT: 54,
  DECISION_BUILD: 55,
  DECISION_CRAFT: 56,
  DECISION_DEPOSIT: 57,
  DECISION_TRADE: 58,
  DECISION_PATROL: 59,
} as const;

// ── Timers & Intervals ──────────────────────────────────────────

export const TIMERS = {
  DIPLOMACY_UPDATE_INTERVAL: 100,
  STUCK_THRESHOLD: 60,
  REPRODUCTION_COOLDOWN: 150,
  COURTSHIP_TICKS: 15,
  MATING_DURATION: 40,
  EGG_HATCH_TIME: 150,
  DAY_TICKS: 200,
  POLITICS_INTERVAL: 200,
  DIALECTIC_INTERVAL: 300,
  CA_INTERVAL: 30, // ResourceGrid cellular automata
} as const;

// ── Thresholds & Limits ──────────────────────────────────────────

export const THRESHOLDS = {
  STUCK_DISTANCE_SQ: 0.25, // 0.5 units squared
  MATE_RANGE_SQ: 3.0 * 3.0,
  MAX_POPULATION: 60,
  MAX_MONSTERS: 20,
  HUNGER_THRESHOLD: 0.4,
  ENERGY_THRESHOLD: 0.3,
  FEAR_THRESHOLD: 0.6,
  ANXIETY_THRESHOLD: 0.3,
  TIREDNESS_THRESHOLD: 0.6,
  OPPRESSION_THRESHOLD: 0.4,
  REVOLT_SUCCESS_THRESHOLD: 0.4,
} as const;

// ── Movement & Physics ──────────────────────────────────────────

export const MOVEMENT = {
  WORLD_HALF: 50,
  VOXEL_WORLD_HALF: 50,
  STUCK_BURST_FORWARD: 1.5,
  MIN_MOVE_SPEED: 0.05,
  WATER_MOVE_PENALTY: 0.5,
  UPHILL_COST_MULTIPLIER: 0.6,
  DOWNHILL_BOOST_MULTIPLIER: 0.15,
  MAX_DOWNHILL_SPEED: 1.3,
  MIN_UPHILL_SPEED: 0.2,
} as const;

// ── Combat & Damage ──────────────────────────────────────────────

export const COMBAT = {
  RAID_RANGE_SQ: 5 * 5,
  STEAL_CHANCE: 0.6,
  COMBAT_CHANCE: 0.2,
  MUSTER_DURATION: 100,
  RAID_DURATION: 150,
  RETREAT_DURATION: 100,
  MONSTER_DAMAGE_RANGE_SQ: 6, // ~2.5 units
  BASE_MONSTER_DAMAGE: 0.015,
} as const;

// ── Season Warmth Values ─────────────────────────────────────────

export const SEASON_WARMTH = {
  SPRING: 0.7,
  SUMMER: 1.0,
  AUTUMN: 0.4,
  WINTER: 0.1,
  DEFAULT: 0.5,
} as const;

// ── Altitude & Terrain ───────────────────────────────────────────

export const TERRAIN = {
  MAX_ALTITUDE: 20,
  SLOPE_CHECK_DISTANCE: 1.0,
  SLOPE_MIN: -1,
  SLOPE_MAX: 1,
} as const;

// ── Goal System ──────────────────────────────────────────────────

export const GOALS = {
  DEFAULT_GOAL_DURATION: 50,
  CURIOUS_GOAL_DURATION: 70,
} as const;

// ── Statistics ──────────────────────────────────────────────────

export const STATS = {
  LOG_INTERVAL: 5000,
  LOG_WINDOW: 100,
} as const;
