// Zodiac cycle: 12 signs synchronized with seasons.
// 3 signs per season, full cycle = 1 year (4000 ticks, matching Seasons.ts).
// Each sign applies global multipliers to relevant systems.

export const enum ZodiacSign {
  // Spring signs
  Aries = 0,       // early spring
  Taurus = 1,      // mid spring
  Gemini = 2,      // late spring
  // Summer signs
  Cancer = 3,      // early summer
  Leo = 4,         // mid summer
  Virgo = 5,       // late summer
  // Autumn signs
  Libra = 6,       // early autumn
  Scorpio = 7,     // mid autumn
  Sagittarius = 8, // late autumn
  // Winter signs
  Capricorn = 9,   // early winter
  Aquarius = 10,   // mid winter
  Pisces = 11,     // late winter
}

export const ZODIAC_NAMES = [
  '♈ Aries', '♉ Taurus', '♊ Gemini', '♋ Cancer',
  '♌ Leo', '♍ Virgo', '♎ Libra', '♏ Scorpio',
  '♐ Sagittarius', '♑ Capricorn', '♒ Aquarius', '♓ Pisces',
];

// Sync with Seasons.ts: CYCLE_LENGTH = 4000, so each sign = 4000/12 ≈ 333 ticks
const YEAR_LENGTH = 4000; // must match SEASON_LENGTH * 4 in Seasons.ts
export const SIGN_DURATION = Math.floor(YEAR_LENGTH / 12); // 333 ticks per sign
export const FULL_CYCLE = YEAR_LENGTH;

export interface ZodiacEffects {
  aggressionMod: number;
  gatherRateMod: number;
  socialRangeMod: number;
  reproductionMod: number;
  zealotryGainMod: number;
  craftSpeedMod: number;
  diplomacyMod: number;
  huntSuccessMod: number;
  moveSpeedMod: number;
  buildDurabilityMod: number;
  mutationRateMod: number;
  compassionMod: number;
}

const DEFAULT_EFFECTS: ZodiacEffects = {
  aggressionMod: 1, gatherRateMod: 1, socialRangeMod: 1,
  reproductionMod: 1, zealotryGainMod: 1, craftSpeedMod: 1,
  diplomacyMod: 1, huntSuccessMod: 1, moveSpeedMod: 1,
  buildDurabilityMod: 1, mutationRateMod: 1, compassionMod: 1,
};

const SIGN_EFFECTS: Record<ZodiacSign, Partial<ZodiacEffects>> = {
  [ZodiacSign.Aries]:       { aggressionMod: 1.2, moveSpeedMod: 1.1 },
  [ZodiacSign.Taurus]:      { gatherRateMod: 1.2 },
  [ZodiacSign.Gemini]:      { socialRangeMod: 1.3, diplomacyMod: 1.2 },
  [ZodiacSign.Cancer]:      { reproductionMod: 1.2 },
  [ZodiacSign.Leo]:         { zealotryGainMod: 1.3 },
  [ZodiacSign.Virgo]:       { craftSpeedMod: 1.2, buildDurabilityMod: 1.1 },
  [ZodiacSign.Libra]:       { diplomacyMod: 1.3, aggressionMod: 0.8 },
  [ZodiacSign.Scorpio]:     { huntSuccessMod: 1.2 },
  [ZodiacSign.Sagittarius]: { moveSpeedMod: 1.2 },
  [ZodiacSign.Capricorn]:   { buildDurabilityMod: 1.2 },
  [ZodiacSign.Aquarius]:    { mutationRateMod: 1.3 },
  [ZodiacSign.Pisces]:      { compassionMod: 1.2, zealotryGainMod: 1.1 },
};

export class ZodiacCycle {
  tick: number = 0;

  get currentSign(): ZodiacSign {
    return Math.floor((this.tick % FULL_CYCLE) / SIGN_DURATION) as ZodiacSign;
  }

  get currentSignName(): string {
    return ZODIAC_NAMES[this.currentSign];
  }

  get effects(): ZodiacEffects {
    const sign = this.currentSign;
    const signEffects = SIGN_EFFECTS[sign] ?? {};
    return { ...DEFAULT_EFFECTS, ...signEffects };
  }

  get progress(): number {
    return (this.tick % SIGN_DURATION) / SIGN_DURATION;
  }

  advance(): void {
    this.tick++;
  }
}
