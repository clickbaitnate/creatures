// ═══════════════════════════════════════════════════════════════════════
// Astrology Engine — Full natal charts, planetary transits, and aspects
// ═══════════════════════════════════════════════════════════════════════
//
// Each creature gets a natal chart computed at birth from the sky state.
// The world has 7 celestial bodies orbiting at different periods.
// Aspects between planets (natal and transit) create dynamic modifiers.
// This lays the groundwork for a magick engine driven by astrological resonance.

import { clamp } from '../utils/Math';
import { ZodiacSign, ZODIAC_NAMES, FULL_CYCLE } from './Zodiac';

// ── Planets ────────────────────────────────────────────────────────────

export const enum Planet {
  Sun     = 0,
  Moon    = 1,
  Mercury = 2,
  Venus   = 3,
  Mars    = 4,
  Jupiter = 5,
  Saturn  = 6,
}

export const PLANET_COUNT = 7;

export const PLANET_NAMES = [
  '☉ Sun', '☽ Moon', '☿ Mercury', '♀ Venus',
  '♂ Mars', '♃ Jupiter', '♄ Saturn',
];

export const PLANET_SYMBOLS = ['☉', '☽', '☿', '♀', '♂', '♃', '♄'];

export const PLANET_COLORS = [
  '#FFD700', // Sun — gold
  '#C0C0E0', // Moon — silver
  '#80E0A0', // Mercury — green
  '#FF88CC', // Venus — pink
  '#FF4444', // Mars — red
  '#AA88FF', // Jupiter — purple
  '#888888', // Saturn — grey
];

// Orbital periods in ticks (1 year = 4000 ticks matching Seasons.ts)
export const ORBITAL_PERIODS: number[] = [
  4000,    // Sun:     1 year     (defines the zodiac)
  337,     // Moon:    ~1 month   (fast emotional cycle)
  960,     // Mercury: ~88 days   (communication shifts)
  2440,    // Venus:   ~225 days  (relationship tides)
  7520,    // Mars:    ~1.88 yr   (aggression waves)
  47520,   // Jupiter: ~11.88 yr  (growth epochs)
  117600,  // Saturn:  ~29.4 yr   (generational discipline)
];

// Starting offsets — each planet starts at a different position to avoid
// an unrealistic grand conjunction at tick 0
export const PLANET_OFFSETS: number[] = [
  0,     // Sun at 0°
  127,   // Moon ~136°
  42,    // Mercury ~15°
  283,   // Venus ~42°
  1920,  // Mars ~92°
  11200, // Jupiter ~85°
  38400, // Saturn ~117°
];

// ── Elements & Modalities ──────────────────────────────────────────────

export const enum Element {
  Fire  = 0,
  Earth = 1,
  Air   = 2,
  Water = 3,
}

export const ELEMENT_NAMES = ['🔥 Fire', '🌍 Earth', '💨 Air', '💧 Water'];

export const enum Modality {
  Cardinal = 0,
  Fixed    = 1,
  Mutable  = 2,
}

export const MODALITY_NAMES = ['Cardinal', 'Fixed', 'Mutable'];

// Sign → Element mapping: Aries=Fire, Taurus=Earth, Gemini=Air, Cancer=Water, ...
export const SIGN_ELEMENTS: Element[] = [
  Element.Fire, Element.Earth, Element.Air, Element.Water,   // Ari Tau Gem Can
  Element.Fire, Element.Earth, Element.Air, Element.Water,   // Leo Vir Lib Sco
  Element.Fire, Element.Earth, Element.Air, Element.Water,   // Sag Cap Aqu Pis
];

export const SIGN_MODALITIES: Modality[] = [
  Modality.Cardinal, Modality.Fixed, Modality.Mutable,       // Ari Tau Gem
  Modality.Cardinal, Modality.Fixed, Modality.Mutable,       // Can Leo Vir
  Modality.Cardinal, Modality.Fixed, Modality.Mutable,       // Lib Sco Sag
  Modality.Cardinal, Modality.Fixed, Modality.Mutable,       // Cap Aqu Pis
];

// ── Aspects ────────────────────────────────────────────────────────────

export const enum Aspect {
  Conjunction = 0,
  Sextile     = 1,
  Square      = 2,
  Trine       = 3,
  Opposition  = 4,
}

export const ASPECT_COUNT = 5;
export const ASPECT_ANGLES = [0, 60, 90, 120, 180];
export const ASPECT_ORBS   = [10, 6, 8, 8, 10]; // degree tolerance
export const ASPECT_NAMES  = ['☌ Conjunction', '⚹ Sextile', '□ Square', '△ Trine', '☍ Opposition'];
export const ASPECT_SYMBOLS = ['☌', '⚹', '□', '△', '☍'];
export const ASPECT_HARMONY = [0.3, 0.6, -0.6, 0.8, -0.4]; // + harmonious, - challenging

export const ASPECT_COLORS = [
  '#FFD700', // Conjunction — gold
  '#44AAFF', // Sextile — blue
  '#FF4444', // Square — red
  '#44FF88', // Trine — green
  '#FF44FF', // Opposition — magenta
];

// ── Houses ─────────────────────────────────────────────────────────────

export const HOUSE_COUNT = 12;
export const HOUSE_NAMES = [
  '1st · Self',         '2nd · Resources',   '3rd · Communication',
  '4th · Home',         '5th · Creativity',  '6th · Service',
  '7th · Partnerships', '8th · Transformation', '9th · Philosophy',
  '10th · Ambition',    '11th · Community',  '12th · Unconscious',
];

// Planetary rulership — which planet "rules" which sign (traditional)
export const SIGN_RULERS: Planet[] = [
  Planet.Mars,    // Aries
  Planet.Venus,   // Taurus
  Planet.Mercury, // Gemini
  Planet.Moon,    // Cancer
  Planet.Sun,     // Leo
  Planet.Mercury, // Virgo
  Planet.Venus,   // Libra
  Planet.Mars,    // Scorpio (trad)
  Planet.Jupiter, // Sagittarius
  Planet.Saturn,  // Capricorn
  Planet.Saturn,  // Aquarius (trad)
  Planet.Jupiter, // Pisces
];

// ── Planet Position ────────────────────────────────────────────────────

export interface PlanetPosition {
  sign:     number;  // ZodiacSign (0-11)
  degree:   number;  // 0-29.99 within sign
  absolute: number;  // 0-359.99 absolute ecliptic degree
}

// ── Natal Chart ────────────────────────────────────────────────────────

export interface NatalAspect {
  planet1:  number;   // Planet index
  planet2:  number;   // Planet index
  aspect:   number;   // Aspect enum
  orb:      number;   // how far from exact (degrees)
  harmony:  number;   // -1 to 1
}

export interface NatalChart {
  planets:      PlanetPosition[]; // 7 planet positions at birth
  rising:       number;           // Rising sign (0-11)
  risingDegree: number;           // 0-359.99 absolute
  houses:       number[];         // 12 house cusps (absolute degrees)
  natalAspects: NatalAspect[];    // pre-computed aspects between natal planets
  birthTick:    number;
  // Elemental & modal balance (pre-computed)
  elementBalance: number[];  // [fire, earth, air, water] 0-1
  modalBalance:   number[];  // [cardinal, fixed, mutable] 0-1
}

// ── Transit Aspect (computed every tick) ───────────────────────────────

export interface TransitAspect {
  transitPlanet: number;  // Planet index (current sky)
  natalPlanet:   number;  // Planet index (natal chart)
  aspect:        number;  // Aspect enum
  orb:           number;  // degrees from exact
  strength:      number;  // 0-1, tighter orb = stronger
  harmony:       number;  // -1 to 1
}

// ── Astrological Influence (per-creature computed effects) ─────────────

export interface AstrologicalInfluence {
  // Per-planet modifiers (derived from natal dignity + transits)
  vitalityMod:       number; // Sun
  emotionMod:        number; // Moon
  communicationMod:  number; // Mercury
  loveMod:           number; // Venus
  energyMod:         number; // Mars
  growthMod:         number; // Jupiter
  disciplineMod:     number; // Saturn

  overallHarmony: number;    // -1 to 1, sum of all active aspects
  elementBalance: number[];  // [fire, earth, air, water]
  activeTransits: TransitAspect[];
}

export function createDefaultInfluence(): AstrologicalInfluence {
  return {
    vitalityMod: 1, emotionMod: 1, communicationMod: 1, loveMod: 1,
    energyMod: 1, growthMod: 1, disciplineMod: 1,
    overallHarmony: 0,
    elementBalance: [0.25, 0.25, 0.25, 0.25],
    activeTransits: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Celestial Mechanics
// ═══════════════════════════════════════════════════════════════════════

/** Compute the absolute ecliptic degree (0-360) of a planet at a given tick */
export function getPlanetDegree(planet: number, tick: number): number {
  const period = ORBITAL_PERIODS[planet];
  const offset = PLANET_OFFSETS[planet];
  // Convert tick to degree position (0-360)
  const rawDeg = ((tick + offset) / period) * 360;
  return ((rawDeg % 360) + 360) % 360;
}

/** Convert absolute degree to a PlanetPosition */
export function degreeToPlanetPosition(absoluteDeg: number): PlanetPosition {
  const norm = ((absoluteDeg % 360) + 360) % 360;
  const sign = Math.floor(norm / 30) % 12;
  const degree = norm - sign * 30;
  return { sign, degree, absolute: norm };
}

/** Compute all 7 planet positions at a given tick */
export function computeSkyState(tick: number): PlanetPosition[] {
  const positions: PlanetPosition[] = [];
  for (let p = 0; p < PLANET_COUNT; p++) {
    const deg = getPlanetDegree(p, tick);
    positions.push(degreeToPlanetPosition(deg));
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════════════
// Aspect Computation
// ═══════════════════════════════════════════════════════════════════════

/** Compute the angular separation between two absolute degrees (0-180) */
export function angularSeparation(deg1: number, deg2: number): number {
  let diff = Math.abs(deg1 - deg2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/** Check if an angular separation matches any aspect, return aspect + orb or null */
export function findAspect(separation: number): { aspect: number; orb: number } | null {
  for (let a = 0; a < ASPECT_COUNT; a++) {
    const orb = Math.abs(separation - ASPECT_ANGLES[a]);
    if (orb <= ASPECT_ORBS[a]) {
      return { aspect: a, orb };
    }
  }
  return null;
}

/** Compute all aspects between a set of planet positions */
export function computeAspects(positions: PlanetPosition[]): NatalAspect[] {
  const aspects: NatalAspect[] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const sep = angularSeparation(positions[i].absolute, positions[j].absolute);
      const result = findAspect(sep);
      if (result) {
        const maxOrb = ASPECT_ORBS[result.aspect];
        const strength = 1 - (result.orb / maxOrb);
        aspects.push({
          planet1: i,
          planet2: j,
          aspect: result.aspect,
          orb: result.orb,
          harmony: ASPECT_HARMONY[result.aspect] * strength,
        });
      }
    }
  }
  return aspects;
}

/** Compute transit aspects: current sky vs natal chart */
export function computeTransitAspects(
  skyPositions: PlanetPosition[],
  natalPositions: PlanetPosition[],
): TransitAspect[] {
  const transits: TransitAspect[] = [];
  for (let t = 0; t < skyPositions.length; t++) {
    for (let n = 0; n < natalPositions.length; n++) {
      const sep = angularSeparation(skyPositions[t].absolute, natalPositions[n].absolute);
      const result = findAspect(sep);
      if (result) {
        const maxOrb = ASPECT_ORBS[result.aspect];
        const strength = 1 - (result.orb / maxOrb);
        transits.push({
          transitPlanet: t,
          natalPlanet: n,
          aspect: result.aspect,
          orb: result.orb,
          strength,
          harmony: ASPECT_HARMONY[result.aspect] * strength,
        });
      }
    }
  }
  return transits;
}

// ═══════════════════════════════════════════════════════════════════════
// Natal Chart Generation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate the rising sign from the day-night cycle position (0-1).
 * The rising sign rotates once per day — each hour changes it.
 */
export function computeRising(dayProgress: number): number {
  return ((dayProgress * 360) % 360);
}

/**
 * Calculate house cusps using the Equal House system:
 * each house is 30° starting from the Ascendant.
 */
export function computeHouses(risingDegree: number): number[] {
  const houses: number[] = [];
  for (let i = 0; i < HOUSE_COUNT; i++) {
    houses.push((risingDegree + i * 30) % 360);
  }
  return houses;
}

/** Compute elemental balance from planet sign placements, weighted by planet importance */
const PLANET_WEIGHTS = [3, 2.5, 1.5, 1.5, 1.5, 1, 1]; // Sun strongest, outer weakest

export function computeElementBalance(positions: PlanetPosition[]): number[] {
  const balance = [0, 0, 0, 0]; // fire, earth, air, water
  let totalWeight = 0;
  for (let p = 0; p < Math.min(positions.length, PLANET_COUNT); p++) {
    const weight = PLANET_WEIGHTS[p];
    const element = SIGN_ELEMENTS[positions[p].sign];
    balance[element] += weight;
    totalWeight += weight;
  }
  // Normalize to 0-1
  if (totalWeight > 0) {
    for (let i = 0; i < 4; i++) balance[i] /= totalWeight;
  }
  return balance;
}

/** Compute modal balance from planet sign placements */
export function computeModalBalance(positions: PlanetPosition[]): number[] {
  const balance = [0, 0, 0]; // cardinal, fixed, mutable
  let totalWeight = 0;
  for (let p = 0; p < Math.min(positions.length, PLANET_COUNT); p++) {
    const weight = PLANET_WEIGHTS[p];
    const modality = SIGN_MODALITIES[positions[p].sign];
    balance[modality] += weight;
    totalWeight += weight;
  }
  if (totalWeight > 0) {
    for (let i = 0; i < 3; i++) balance[i] /= totalWeight;
  }
  return balance;
}

/**
 * Generate a full natal chart for a creature at birth.
 * @param tick — world tick at birth
 * @param dayProgress — 0-1 position in the day/night cycle (for rising sign)
 */
export function generateNatalChart(tick: number, dayProgress: number): NatalChart {
  const planets = computeSkyState(tick);
  const risingDeg = computeRising(dayProgress);
  const risingSign = Math.floor(risingDeg / 30) % 12;
  const houses = computeHouses(risingDeg);
  const natalAspects = computeAspects(planets);
  const elementBalance = computeElementBalance(planets);
  const modalBalance = computeModalBalance(planets);

  return {
    planets,
    rising: risingSign,
    risingDegree: risingDeg,
    houses,
    natalAspects,
    birthTick: tick,
    elementBalance,
    modalBalance,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Influence Computation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute a planet's "dignity" — how strong it is in its natal sign.
 * Planets in their ruling sign get a boost; planets in detriment get a penalty.
 */
export function computeDignity(planet: number, sign: number): number {
  const ruler = SIGN_RULERS[sign];
  if (ruler === planet) return 1.3;       // Domicile — strong
  // Detriment: opposite sign's ruler
  const oppositeSign = (sign + 6) % 12;
  if (SIGN_RULERS[oppositeSign] === planet) return 0.7; // Detriment — weak
  // Exaltation simplified: Fire signs boost Mars, Earth signs boost Saturn, etc.
  const element = SIGN_ELEMENTS[sign];
  if (planet === Planet.Mars && element === Element.Fire) return 1.15;
  if (planet === Planet.Saturn && element === Element.Earth) return 1.15;
  if (planet === Planet.Mercury && element === Element.Air) return 1.15;
  if (planet === Planet.Moon && element === Element.Water) return 1.15;
  if (planet === Planet.Jupiter && element === Element.Fire) return 1.1;
  if (planet === Planet.Venus && element === Element.Water) return 1.1;
  if (planet === Planet.Sun && element === Element.Fire) return 1.1;
  return 1.0; // Peregrine — neutral
}

/**
 * Compute full astrological influence for a creature from natal chart + current sky.
 */
export function computeInfluence(
  chart: NatalChart,
  currentTick: number,
): AstrologicalInfluence {
  const sky = computeSkyState(currentTick);
  const transits = computeTransitAspects(sky, chart.planets);

  // Start with natal dignity
  const mods = [1, 1, 1, 1, 1, 1, 1]; // one per planet
  for (let p = 0; p < PLANET_COUNT; p++) {
    mods[p] = computeDignity(p, chart.planets[p].sign);
  }

  // Apply natal aspects as permanent modifiers
  let natalHarmony = 0;
  for (const asp of chart.natalAspects) {
    natalHarmony += asp.harmony;
    // Each natal aspect slightly modifies both planets involved
    const mod = asp.harmony * 0.05;
    mods[asp.planet1] += mod;
    mods[asp.planet2] += mod;
  }

  // Apply transit aspects as temporary modifiers
  let transitHarmony = 0;
  for (const t of transits) {
    transitHarmony += t.harmony;
    // Transit to natal planet modifies the natal planet's domain
    mods[t.natalPlanet] += t.harmony * 0.08 * t.strength;
  }

  // Clamp all mods to reasonable range
  for (let i = 0; i < PLANET_COUNT; i++) {
    mods[i] = clamp(mods[i], 0.5, 2.0);
  }

  const overallHarmony = clamp(
    (natalHarmony * 0.6 + transitHarmony * 0.4) / Math.max(1, chart.natalAspects.length + transits.length) * 2,
    -1, 1,
  );

  return {
    vitalityMod:      mods[Planet.Sun],
    emotionMod:       mods[Planet.Moon],
    communicationMod: mods[Planet.Mercury],
    loveMod:          mods[Planet.Venus],
    energyMod:        mods[Planet.Mars],
    growthMod:        mods[Planet.Jupiter],
    disciplineMod:    mods[Planet.Saturn],
    overallHarmony,
    elementBalance:   chart.elementBalance,
    activeTransits:   transits,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SVG Chart Rendering (for UI)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate an SVG string for a natal chart wheel with optional transit ring.
 * Returns a complete <svg> element as a string for embedding in HTML.
 */
export function renderNatalChartSVG(
  chart: NatalChart,
  currentTransits: TransitAspect[],
  skyPositions?: PlanetPosition[],
  size: number = 260,
): string {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const signR  = outerR - 18;     // inner edge of sign ring
  const houseR = signR - 10;      // house ring
  const planetR = houseR - 22;    // natal planet ring
  const transitR = outerR + 0;    // transit markers at edge
  const centerR = planetR - 18;   // inner area for aspect lines
  const aspectR = centerR;

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;">`;

  // Background
  svg += `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="rgba(10,10,30,0.85)" stroke="#334" stroke-width="1"/>`;

  // Sign ring segments (12)
  const signColors = ['#FF6B4A', '#8B7355', '#66CCAA', '#4488CC', '#FF8800', '#668844', '#CC88AA', '#992244', '#AA66CC', '#556644', '#4466AA', '#6688AA'];
  const signGlyphs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

  for (let i = 0; i < 12; i++) {
    // Rotate so 0° Aries is at the left (9 o'clock) and goes counter-clockwise (traditional)
    const startAngle = -(i * 30 + chart.risingDegree) * Math.PI / 180 + Math.PI;
    const endAngle   = -((i + 1) * 30 + chart.risingDegree) * Math.PI / 180 + Math.PI;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + signR * Math.cos(startAngle);
    const y2 = cy + signR * Math.sin(startAngle);
    const x3 = cx + signR * Math.cos(endAngle);
    const y3 = cy + signR * Math.sin(endAngle);
    const x4 = cx + outerR * Math.cos(endAngle);
    const y4 = cy + outerR * Math.sin(endAngle);

    // Arc path
    svg += `<path d="M${x1},${y1} A${outerR},${outerR} 0 0,0 ${x4},${y4} L${x3},${y3} A${signR},${signR} 0 0,1 ${x2},${y2} Z" fill="${signColors[i]}22" stroke="#445" stroke-width="0.5"/>`;

    // Sign glyph
    const midAngle = -(i * 30 + 15 + chart.risingDegree) * Math.PI / 180 + Math.PI;
    const glyphR = (outerR + signR) / 2;
    const gx = cx + glyphR * Math.cos(midAngle);
    const gy = cy + glyphR * Math.sin(midAngle);
    svg += `<text x="${gx}" y="${gy}" text-anchor="middle" dominant-baseline="central" fill="${signColors[i]}" font-size="9">${signGlyphs[i]}</text>`;
  }

  // House lines
  for (let h = 0; h < 12; h++) {
    const angle = -(chart.houses[h] + chart.risingDegree - chart.risingDegree) * Math.PI / 180 + Math.PI;
    // House cusps measured from rising
    const hAngle = -(chart.houses[h]) * Math.PI / 180 + Math.PI;
    const ix = cx + centerR * Math.cos(hAngle);
    const iy = cy + centerR * Math.sin(hAngle);
    const ox = cx + signR * Math.cos(hAngle);
    const oy = cy + signR * Math.sin(hAngle);
    const thick = (h % 3 === 0) ? '1' : '0.3';
    const color = (h === 0) ? '#FFD700' : (h === 9) ? '#FF8800' : '#445';
    svg += `<line x1="${ix}" y1="${iy}" x2="${ox}" y2="${oy}" stroke="${color}" stroke-width="${thick}" opacity="0.7"/>`;
  }

  // Inner circle
  svg += `<circle cx="${cx}" cy="${cy}" r="${centerR}" fill="none" stroke="#334" stroke-width="0.5"/>`;

  // House ring circle
  svg += `<circle cx="${cx}" cy="${cy}" r="${signR}" fill="none" stroke="#445" stroke-width="0.5"/>`;

  // ── Aspect lines between natal planets ──
  for (const asp of chart.natalAspects) {
    const a1 = -chart.planets[asp.planet1].absolute * Math.PI / 180 + Math.PI;
    const a2 = -chart.planets[asp.planet2].absolute * Math.PI / 180 + Math.PI;
    const r = aspectR - 5;
    const px1 = cx + r * Math.cos(a1);
    const py1 = cy + r * Math.sin(a1);
    const px2 = cx + r * Math.cos(a2);
    const py2 = cy + r * Math.sin(a2);
    const color = ASPECT_COLORS[asp.aspect] ?? '#888';
    const opacity = clamp(0.3 + Math.abs(asp.harmony) * 0.5, 0.2, 0.8);
    svg += `<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" stroke="${color}" stroke-width="0.8" opacity="${opacity}" stroke-dasharray="${asp.aspect === 2 ? '3,2' : asp.aspect === 1 ? '2,2' : 'none'}"/>`;
  }

  // ── Natal planets ──
  for (let p = 0; p < chart.planets.length; p++) {
    const angle = -chart.planets[p].absolute * Math.PI / 180 + Math.PI;
    const px = cx + planetR * Math.cos(angle);
    const py = cy + planetR * Math.sin(angle);
    svg += `<circle cx="${px}" cy="${py}" r="8" fill="${PLANET_COLORS[p]}33" stroke="${PLANET_COLORS[p]}" stroke-width="1"/>`;
    svg += `<text x="${px}" y="${py}" text-anchor="middle" dominant-baseline="central" fill="${PLANET_COLORS[p]}" font-size="8" font-weight="bold">${PLANET_SYMBOLS[p]}</text>`;
  }

  // ── Transit planets (outer ring, if sky provided) ──
  if (skyPositions) {
    for (let p = 0; p < skyPositions.length; p++) {
      const angle = -skyPositions[p].absolute * Math.PI / 180 + Math.PI;
      const tr = outerR + 0;
      const px = cx + tr * Math.cos(angle);
      const py = cy + tr * Math.sin(angle);
      // Small marker
      svg += `<circle cx="${px}" cy="${py}" r="4" fill="${PLANET_COLORS[p]}66" stroke="${PLANET_COLORS[p]}" stroke-width="0.5"/>`;
    }
  }

  // ── Active transit aspect lines ──
  for (const t of currentTransits) {
    if (t.strength < 0.3) continue; // only draw significant transits
    const a1 = -chart.planets[t.natalPlanet].absolute * Math.PI / 180 + Math.PI;
    const a2 = skyPositions ? -(skyPositions[t.transitPlanet].absolute * Math.PI / 180) + Math.PI : 0;
    const r1 = planetR;
    const r2 = outerR - 2;
    const px1 = cx + r1 * Math.cos(a1);
    const py1 = cy + r1 * Math.sin(a1);
    const px2 = cx + r2 * Math.cos(a2);
    const py2 = cy + r2 * Math.sin(a2);
    const color = ASPECT_COLORS[t.aspect] ?? '#888';
    svg += `<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" stroke="${color}" stroke-width="0.5" opacity="0.5" stroke-dasharray="2,3"/>`;
  }

  // ── ASC / MC markers ──
  const ascAngle = -chart.risingDegree * Math.PI / 180 + Math.PI;
  const ascX = cx + (signR + 2) * Math.cos(ascAngle);
  const ascY = cy + (signR + 2) * Math.sin(ascAngle);
  svg += `<text x="${ascX}" y="${ascY}" text-anchor="middle" dominant-baseline="central" fill="#FFD700" font-size="7" font-weight="bold">ASC</text>`;

  svg += '</svg>';
  return svg;
}
