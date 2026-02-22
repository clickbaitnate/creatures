// Zodiac cycle: 12 signs, each ~800 ticks. Full cycle = 9600 ticks.
// Each sign applies global multipliers to relevant systems.

export const enum ZodiacSign {
  Aries = 0,
  Taurus = 1,
  Gemini = 2,
  Cancer = 3,
  Leo = 4,
  Virgo = 5,
  Libra = 6,
  Scorpio = 7,
  Sagittarius = 8,
  Capricorn = 9,
  Aquarius = 10,
  Pisces = 11,
}

export const ZODIAC_NAMES = [
  '♈ Aries', '♉ Taurus', '♊ Gemini', '♋ Cancer',
  '♌ Leo', '♍ Virgo', '♎ Libra', '♏ Scorpio',
  '♐ Sagittarius', '♑ Capricorn', '♒ Aquarius', '♓ Pisces',
];

export const SIGN_DURATION = 800; // ticks per sign
export const FULL_CYCLE = SIGN_DURATION * 12; // 9600 ticks

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
