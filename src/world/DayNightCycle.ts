// Day/Night cycle: timeOfDay 0-1, light level, sun angle.

export const DAY_DURATION = 6000; // ticks per full day (~5 min at 20 tps)

export interface DayNightState {
  timeOfDay: number;  // 0-1, 0.5 = noon, 0/1 = midnight
  dayCount: number;
  isNight: boolean;
  lightLevel: number; // 0-1, 1.0 at noon, 0.15 at midnight
  sunAngle: number;   // radians for sun orbit
}

export function createDayNight(): DayNightState {
  return {
    timeOfDay: 0.35, // start at morning
    dayCount: 1,
    isNight: false,
    lightLevel: 1.0,
    sunAngle: 0,
  };
}

export function updateDayNight(state: DayNightState): void {
  state.timeOfDay += 1 / DAY_DURATION;
  if (state.timeOfDay >= 1.0) {
    state.timeOfDay -= 1.0;
    state.dayCount++;
  }

  // Night: timeOfDay < 0.2 or > 0.8
  state.isNight = state.timeOfDay < 0.2 || state.timeOfDay > 0.8;

  // Sun angle: full circle over the day
  state.sunAngle = state.timeOfDay * Math.PI * 2;

  // Light level: smooth interpolation using sine
  // Maps timeOfDay 0.5 (noon) to 1.0, 0/1 (midnight) to 0.15
  const sinVal = Math.sin(state.timeOfDay * Math.PI); // 0 at edges, 1 at 0.5
  state.lightLevel = 0.15 + sinVal * 0.85;
}
