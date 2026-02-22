// Season cycle: 4000-tick period affecting growth, spread, and energy drain

export const enum Season {
  Spring = 0,
  Summer = 1,
  Autumn = 2,
  Winter = 3,
}

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_LENGTH = 1000; // ticks per season
const CYCLE_LENGTH = SEASON_LENGTH * 4; // 4000 ticks

export interface SeasonState {
  tick: number;
  season: Season;
  growthMult: number;
  spreadMult: number;
  drainMult: number;
}

const SEASON_PARAMS: Record<Season, { growth: number; spread: number; drain: number }> = {
  [Season.Spring]: { growth: 1.5, spread: 1.0, drain: 1.0 },
  [Season.Summer]: { growth: 1.0, spread: 1.5, drain: 1.0 },
  [Season.Autumn]: { growth: 0.5, spread: 0.5, drain: 1.0 },
  [Season.Winter]: { growth: 0.2, spread: 0.1, drain: 1.3 },
};

export function createSeasonState(): SeasonState {
  return {
    tick: 0,
    season: Season.Spring,
    growthMult: SEASON_PARAMS[Season.Spring].growth,
    spreadMult: SEASON_PARAMS[Season.Spring].spread,
    drainMult: SEASON_PARAMS[Season.Spring].drain,
  };
}

export function updateSeason(state: SeasonState): void {
  state.tick++;
  const cyclePos = state.tick % CYCLE_LENGTH;
  const season = Math.floor(cyclePos / SEASON_LENGTH) as Season;

  if (season !== state.season) {
    state.season = season;
    const params = SEASON_PARAMS[season];
    state.growthMult = params.growth;
    state.spreadMult = params.spread;
    state.drainMult = params.drain;
  }
}
