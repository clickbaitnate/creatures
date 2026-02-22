// Comprehensive emoji vocabulary for creature expression
// Organized by emotional state, need, activity, nature, and philosophy

// ── Core Emotions ──────────────────────────────────────────

export const EMOTIONS = {
  // Joy spectrum
  joy:       ['😊', '😄', '🥰', '😁', '🤗', '😆', '☺️', '🥳', '🤩', '😌'],
  bliss:     ['✨', '💫', '🌟', '⭐', '🎉', '🎊', '💖', '🌈', '🦋', '🕊️'],
  pride:     ['😤', '💪', '👑', '🏆', '🎖️', '⚜️', '🦁', '🐯', '🦅', '💎'],

  // Sadness spectrum
  sad:       ['😢', '😥', '😞', '😔', '🥺', '😿', '💧', '🌧️', '🍂', '🥀'],
  grief:     ['😭', '💔', '🖤', '🌑', '🕯️', '⚰️', '🪦', '😩', '🫠', '🌫️'],
  lonely:    ['🥲', '😶', '🫥', '👤', '🌒', '🦇', '🌿', '🫂', '🐚', '🌊'],

  // Anger spectrum
  anger:     ['😡', '💢', '🔥', '👊', '⚡', '🗡️', '😠', '💥', '🌋', '☄️'],
  rage:      ['🤬', '💀', '☠️', '🩸', '⚔️', '🏴', '😈', '👹', '🐲', '🌪️'],
  annoy:     ['😒', '🙄', '😑', '😤', '💨', '🪳', '🐝', '🌵', '😾', '🦔'],

  // Fear spectrum
  fear:      ['😨', '😱', '😰', '🫣', '👻', '💨', '🏃', '🐀', '🌑', '🕷️'],
  dread:     ['😵', '🫠', '💀', '🕳️', '🌑', '🦴', '🪦', '👁️', '🫥', '🌫️'],
  nervous:   ['😬', '😅', '🫤', '😯', '🥶', '🤢', '🫨', '💦', '🌊', '🐛'],

  // Curiosity spectrum
  curious:   ['🤔', '🧐', '👀', '❓', '🔍', '🔮', '🌀', '🗺️', '🧭', '🔭'],
  wonder:    ['😲', '🤯', '🫢', '✨', '🌌', '🪐', '🌠', '🧬', '⚗️', '📖'],
  explore:   ['🗺️', '⛵', '🧗', '🏕️', '🌄', '🏔️', '🌅', '🧭', '🛤️', '🪂'],

  // Love/affection spectrum
  love:      ['💕', '💗', '💘', '💝', '🥰', '😍', '💞', '💓', '❤️‍🔥', '🫀'],
  tender:    ['🤲', '🫂', '🌸', '🌺', '🐣', '🐰', '🕊️', '🌷', '🌹', '💐'],
  desire:    ['🔥', '❤️‍🔥', '😏', '👅', '🍑', '🌹', '💋', '🫦', '💃', '🕺'],

  // Contentment spectrum
  calm:      ['😌', '🧘', '🍃', '🌊', '☁️', '🫧', '🪷', '🌿', '🐢', '🦥'],
  grateful:  ['🙏', '🤲', '🌻', '☀️', '🌅', '🫶', '💝', '🙌', '🌼', '🌾'],
  cozy:      ['🏠', '🛖', '🔥', '🛏️', '🫖', '🍵', '🧣', '🐈', '🌙', '⛺'],

  // Tiredness
  tired:     ['😴', '💤', '🥱', '😩', '🛏️', '🌙', '🌜', '😪', '🦉', '🌑'],

  // Pain/suffering
  pain:      ['🤕', '😖', '😣', '🩹', '🩸', '💢', '😵‍💫', '🤒', '🦷', '🏥'],

  // Disgust
  disgust:   ['🤢', '🤮', '😫', '🦨', '🪳', '🐛', '🤧', '😷', '🫤', '💩'],
} as const;

// ── Needs & Drives ─────────────────────────────────────────

export const NEEDS = {
  hunger:     ['🍎', '🍖', '🥬', '😋', '🤤', '🍽️', '🥩', '🌽', '🍞', '🫘', '🍄', '🥜', '🐟', '🥕', '🍇'],
  thirst:     ['💧', '🫗', '🥤', '🚰', '🏊', '💦', '🧊', '🌊', '🫧', '🍶'],
  shelter:    ['🏠', '🛖', '⛺', '🏰', '🏗️', '🧱', '🪵', '🛡️', '🏚️', '🪨'],
  warmth:     ['🔥', '☀️', '🌡️', '🧣', '🫖', '🧥', '♨️', '🌤️', '🫠', '🕯️'],
  cold:       ['❄️', '🥶', '🧊', '⛄', '🌨️', '🏔️', '🐧', '🫠', '💨', '🌬️'],
  safety:     ['🛡️', '🏰', '🔒', '👁️', '🏠', '🦺', '🐾', '🌳', '🪨', '🗼'],
  social:     ['👥', '🤝', '💬', '🫂', '👋', '🗣️', '🏘️', '🎪', '🤗', '👪'],
  territory:  ['🏴', '⚐', '🗺️', '🪧', '🏔️', '🌳', '🪨', '⛳', '🔱', '🛕'],
  reproduce:  ['💕', '🥚', '🐣', '🌱', '🪺', '💗', '🧬', '🌺', '🦋', '✨'],
  knowledge:  ['📖', '🔍', '🧠', '💡', '🎓', '📜', '🗝️', '⚙️', '🔬', '📚'],
} as const;

// ── Activities ─────────────────────────────────────────────

export const ACTIVITIES = {
  gather:     ['⛏️', '🌾', '🧺', '🪣', '🍇', '🫐', '🪵', '🌿', '🍄', '🪻'],
  hunt:       ['🎯', '🏹', '🗡️', '🐾', '👣', '🦴', '🥊', '🪤', '🐺', '🦅'],
  build:      ['🔨', '🏗️', '🧱', '⚒️', '🪚', '📐', '🏠', '🪵', '🏰', '🛠️'],
  craft:      ['⚙️', '🔧', '🪡', '🧶', '⚗️', '🪣', '🪓', '🛠️', '🏺', '🎨'],
  trade:      ['📦', '🤝', '💰', '🔄', '🎁', '⚖️', '🪙', '📊', '🏪', '🧾'],
  farm:       ['🌱', '🌾', '🚜', '💧', '🌻', '🍅', '🌽', '🪴', '🐝', '🦗'],
  patrol:     ['👁️', '🗼', '🔭', '🛡️', '⚔️', '🏴', '🐕', '🦅', '🔦', '🎺'],
  worship:    ['🙏', '🕯️', '🛕', '📿', '🔔', '⛩️', '🪬', '✝️', '☪️', '🕉️'],
  mourn:      ['😭', '🕯️', '🌹', '🖤', '🪦', '💐', '🕊️', '🌑', '🎭', '🫠'],
  celebrate:  ['🎉', '🎊', '🥳', '🎶', '🍻', '💃', '🕺', '🪘', '🎆', '🎵'],
  teach:      ['📖', '💡', '🧑‍🏫', '📝', '🗣️', '🧠', '🔍', '🎓', '📜', '✍️'],
  heal:       ['💊', '🩹', '🌿', '🍵', '🩺', '🫖', '💆', '🌸', '🧪', '❤️‍🩹'],
} as const;

// ── Nature & Environment Symbols ───────────────────────────

export const NATURE = {
  sun:       ['☀️', '🌅', '🌄', '🌞', '🌻', '🔆', '✨', '💛', '🌤️', '🏜️'],
  moon:      ['🌙', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌘', '🌛', '🌜'],
  stars:     ['⭐', '🌟', '💫', '✨', '🌌', '🪐', '🌠', '☄️', '🔭', '🌃'],
  earth:     ['🌍', '🪨', '🏔️', '⛰️', '🗻', '🌋', '🏖️', '🏝️', '🌎', '🏞️'],
  water:     ['🌊', '💧', '🫧', '🏊', '🐟', '🐳', '🌧️', '🏞️', '🧊', '🌀'],
  fire:      ['🔥', '🕯️', '🌋', '☄️', '💥', '🎆', '♨️', '🧨', '💫', '⚡'],
  wind:      ['🌬️', '💨', '🍃', '🌪️', '🌊', '🪂', '🎐', '🌾', '🕊️', '☁️'],
  forest:    ['🌲', '🌳', '🌿', '🍀', '🍂', '🍄', '🦌', '🐿️', '🪵', '🌴'],
  mountain:  ['🏔️', '⛰️', '🗻', '🪨', '🦅', '🐐', '🏕️', '⛷️', '🗿', '🧗'],
  meadow:    ['🌻', '🌼', '🌺', '🌷', '🌹', '🌸', '🐝', '🦋', '🌾', '🐛'],
  cave:      ['🕳️', '🦇', '🪨', '💎', '⛏️', '🐻', '🌑', '🔦', '🪙', '🕷️'],
  sky:       ['☁️', '🌤️', '🌈', '🌥️', '🌦️', '⛅', '🌩️', '🌨️', '🌫️', '🌪️'],
  seasons: {
    spring:  ['🌸', '🌱', '🐣', '🌷', '🦋', '🐝', '🌿', '🌼', '🐰', '🪻'],
    summer:  ['☀️', '🌻', '🍉', '🏖️', '🔥', '🌴', '🦎', '🌽', '🍅', '🌞'],
    autumn:  ['🍂', '🍁', '🎃', '🌰', '🍄', '🦊', '🍇', '🌾', '🪵', '🦉'],
    winter:  ['❄️', '⛄', '🌨️', '🏔️', '🐧', '🫖', '🧣', '🕯️', '🌑', '🐺'],
  },
} as const;

// ── Symbolic Principles (for philosophies/cults) ───────────

export const SYMBOLS = {
  // Abstract concepts
  order:     ['⚖️', '📐', '🔷', '🏛️', '📜', '⚙️', '🔗', '🧭', '📏', '🪬'],
  chaos:     ['🌀', '🌪️', '🎲', '💥', '🃏', '🔀', '🎭', '♾️', '🌊', '🫧'],
  creation:  ['🌱', '✨', '🎨', '🔨', '🧬', '🌅', '🪷', '🔮', '🎭', '📖'],
  death:     ['💀', '☠️', '🦴', '🪦', '⚰️', '🌑', '🕯️', '🖤', '🥀', '🕷️'],
  rebirth:   ['🔄', '🌱', '🐣', '🦋', '🌅', '♻️', '🔁', '🌸', '🥚', '✨'],
  wisdom:    ['🦉', '📖', '🧠', '💡', '🔍', '🎓', '📿', '🗝️', '🌳', '👁️'],
  strength:  ['💪', '⚔️', '🛡️', '🦁', '🏋️', '🐻', '🗡️', '🏰', '⚡', '🌋'],
  harmony:   ['☯️', '🕊️', '🌈', '🎵', '🌺', '🧘', '🤝', '⚖️', '🌿', '🫧'],
  mystery:   ['🔮', '👁️', '🌌', '🗝️', '🎭', '🃏', '🪬', '📿', '🌀', '🕳️'],
  abundance: ['🌾', '🍇', '💰', '🌻', '🏺', '🪙', '🍯', '🐝', '🌽', '🎁'],
  sacrifice: ['🔥', '🗡️', '💧', '🩸', '🕯️', '⛩️', '📿', '🌑', '🪦', '🙏'],
  freedom:   ['🕊️', '🦅', '🌬️', '🏃', '🗽', '💨', '⛵', '🌊', '🪂', '🐎'],

  // Totemic animals
  totems:    ['🐺', '🦅', '🐻', '🦊', '🦁', '🐍', '🦉', '🐲', '🦌', '🐬',
              '🐧', '🦈', '🐝', '🦋', '🐢', '🐾', '🦎', '🐘', '🐃', '🦏'],

  // Celestial
  celestial: ['☀️', '🌙', '⭐', '🌌', '🪐', '☄️', '🌠', '🔭', '🌍', '💫'],

  // Elements
  elements:  ['🔥', '💧', '🌍', '💨', '⚡', '❄️', '🌊', '🌋', '🌪️', '🪨'],
} as const;

// ── Greeting/Farewell ──────────────────────────────────────

export const SOCIAL_SPEECH = {
  greet:     ['👋', '😊', '🙂', '✌️', '🤝', '🫡', '🖖', '🤙', '🤗', '💁'],
  farewell:  ['👋', '🙏', '✌️', '🫶', '😊', '💜', '🌅', '🕊️', '👁️', '🫂'],
  agree:     ['👍', '✅', '🤝', '💯', '🙌', '👏', '⭐', '🎯', '😊', '🫡'],
  disagree:  ['👎', '❌', '🙅', '😤', '🫤', '🤨', '💢', '🙄', '😑', '👀'],
  warning:   ['⚠️', '🚨', '👁️', '❗', '🐺', '🌩️', '💀', '🏃', '🔔', '📢'],
  boast:     ['💪', '👑', '🏆', '😤', '🦁', '⚡', '🔥', '💎', '🐉', '🌟'],
  plead:     ['🥺', '🙏', '😢', '🤲', '💧', '🫣', '😿', '🕊️', '🌸', '🧎'],
  joke:      ['😂', '🤣', '😜', '🤪', '😝', '🃏', '🎭', '🐵', '🎪', '😹'],
  gossip:    ['🤫', '👀', '🫣', '💬', '🗣️', '👂', '🤭', '😏', '🫢', '📢'],
  story:     ['📖', '🗣️', '📜', '🌌', '🧙', '🐉', '⚔️', '👑', '🗺️', '✨'],
} as const;

// ── Philosophy Archetypes ──────────────────────────────────

export interface PhilosophyArchetype {
  name: string;
  symbols: string[];       // 3-5 core symbolic emojis
  description: string;     // one-line description
  traitBias: Partial<Record<string, number>>; // trait affinities
}

export const PHILOSOPHIES: PhilosophyArchetype[] = [
  // Nature-oriented
  { name: 'Naturism', symbols: ['🌿', '🌳', '🦌', '🍄', '🌙'], description: 'reverence for the living world', traitBias: { gatherAffinity: 0.2, curiosity: 0.1 } },
  { name: 'Solarian', symbols: ['☀️', '🔥', '🌻', '⚡', '💛'], description: 'worship of sun and flame', traitBias: { aggression: 0.1, creativity: 0.1 } },
  { name: 'Lunar Cult', symbols: ['🌙', '🌑', '🦉', '✨', '🌊'], description: 'mysteries of the moon and tides', traitBias: { sociability: 0.1, curiosity: 0.15 } },
  { name: 'Stonekeepers', symbols: ['🪨', '⛰️', '💎', '⚒️', '🏔️'], description: 'strength of earth and stone', traitBias: { buildAffinity: 0.2, loyalty: 0.1 } },
  { name: 'Deepwater', symbols: ['🌊', '🐟', '🫧', '🐳', '🌀'], description: 'wisdom of the deep currents', traitBias: { curiosity: 0.15, sociability: 0.1 } },

  // Behavioral
  { name: 'Martial Path', symbols: ['⚔️', '🛡️', '🦁', '💪', '🏰'], description: 'honor through combat', traitBias: { aggression: 0.2, huntAffinity: 0.15 } },
  { name: 'Way of Craft', symbols: ['⚙️', '🔨', '🎨', '🧬', '📐'], description: 'mastery through creation', traitBias: { buildAffinity: 0.2, creativity: 0.15 } },
  { name: 'Harvest Rite', symbols: ['🌾', '🍇', '🐝', '🌻', '🏺'], description: 'bounty of the earth feeds all', traitBias: { gatherAffinity: 0.2, sociability: 0.1 } },
  { name: 'Blood Pact', symbols: ['🩸', '💀', '🗡️', '🔥', '🐺'], description: 'power through sacrifice', traitBias: { aggression: 0.2, loyalty: 0.15 } },
  { name: 'Trade Guild', symbols: ['⚖️', '🪙', '🤝', '📦', '🏪'], description: 'prosperity through exchange', traitBias: { sociability: 0.2, hoardAffinity: 0.15 } },

  // Mystical
  { name: 'Star Cult', symbols: ['🌌', '⭐', '🪐', '🔭', '☄️'], description: 'truth written in the heavens', traitBias: { curiosity: 0.2, creativity: 0.1 } },
  { name: 'Ancestor Worship', symbols: ['🦴', '🕯️', '👻', '📜', '🪦'], description: 'honoring those who came before', traitBias: { loyalty: 0.2, sociability: 0.1 } },
  { name: 'Chaos Dancers', symbols: ['🌀', '🌪️', '🎲', '🃏', '🎭'], description: 'embrace the unpredictable', traitBias: { curiosity: 0.2, aggression: 0.1 } },
  { name: 'Harmony Seekers', symbols: ['☯️', '🕊️', '🌈', '🧘', '🌸'], description: 'balance in all things', traitBias: { sociability: 0.2, gatherAffinity: 0.1 } },
  { name: 'Flame Keepers', symbols: ['🔥', '🕯️', '🌋', '⚡', '🌅'], description: 'guardians of the eternal flame', traitBias: { buildAffinity: 0.15, loyalty: 0.15 } },
  { name: 'Bone Oracle', symbols: ['🦴', '💀', '🔮', '👁️', '🌑'], description: 'divination from death', traitBias: { curiosity: 0.15, huntAffinity: 0.1 } },
  { name: 'Fungal Mind', symbols: ['🍄', '🌿', '🧬', '🫧', '🌀'], description: 'the network beneath connects all', traitBias: { sociability: 0.15, gatherAffinity: 0.15 } },
  { name: 'Iron Will', symbols: ['⚒️', '🏗️', '⚙️', '🔗', '🛡️'], description: 'forge your own destiny', traitBias: { buildAffinity: 0.15, aggression: 0.1 } },
  { name: 'Wanderers', symbols: ['🗺️', '🧭', '⛵', '🌅', '🐎'], description: 'the journey is the destination', traitBias: { curiosity: 0.2, gatherAffinity: 0.1 } },
  { name: 'Dream Weavers', symbols: ['💤', '🌙', '🔮', '🦋', '🌌'], description: 'reality is but a dream', traitBias: { creativity: 0.2, curiosity: 0.15 } },
];

// ── Utility Functions ──────────────────────────────────────

export function pick(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickN(arr: readonly string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Pick an emotion emoji based on creature's emotional state */
export function emotionEmoji(
  happiness: number, fear: number, anger: number,
  curiosity: number, tiredness: number, pain: number,
  hunger: number
): string {
  // Find dominant state
  const states: [string, number][] = [
    ['joy', happiness],
    ['fear', fear],
    ['anger', anger],
    ['curious', curiosity],
    ['tired', tiredness],
    ['pain', pain],
    ['hunger', hunger],
  ];
  states.sort((a, b) => b[1] - a[1]);
  const [dominant, intensity] = states[0];

  if (intensity < 0.1) return pick(EMOTIONS.calm);

  switch (dominant) {
    case 'joy':     return intensity > 0.7 ? pick(EMOTIONS.bliss) : pick(EMOTIONS.joy);
    case 'fear':    return intensity > 0.7 ? pick(EMOTIONS.dread) : pick(EMOTIONS.fear);
    case 'anger':   return intensity > 0.7 ? pick(EMOTIONS.rage) : pick(EMOTIONS.anger);
    case 'curious': return intensity > 0.7 ? pick(EMOTIONS.wonder) : pick(EMOTIONS.curious);
    case 'tired':   return pick(EMOTIONS.tired);
    case 'pain':    return pick(EMOTIONS.pain);
    case 'hunger':  return pick(NEEDS.hunger);
    default:        return pick(EMOTIONS.calm);
  }
}

/** Pick a contextual speech emoji based on social situation */
export function socialSpeechEmoji(
  context: 'greet' | 'farewell' | 'agree' | 'disagree' | 'warning' | 'boast' | 'plead' | 'joke' | 'gossip' | 'story'
): string {
  return pick(SOCIAL_SPEECH[context]);
}

/** Match a philosophy archetype to a faction based on collective vocabulary knowledge.
 *  Philosophies are scored by how many of their symbols the faction collectively knows.
 *  Strong random factor and diversity penalty ensure variety. */
export function matchPhilosophy(profile: {
  avgAggression: number;
  avgSociability: number;
  avgCuriosity: number;
  avgCreativity: number;
  avgGatherAffinity: number;
  avgHuntAffinity: number;
  avgBuildAffinity: number;
  avgHoardAffinity: number;
  dominantBiome: string;
}, collectiveVocabulary?: Set<string>, usedPhilosophies?: Set<string>): PhilosophyArchetype {
  let bestMatch = PHILOSOPHIES[0];
  let bestScore = -Infinity;

  for (const phil of PHILOSOPHIES) {
    let score = 0;

    // Vocabulary-based scoring: how many of the philosophy's symbols does the faction know?
    if (collectiveVocabulary) {
      let symbolsKnown = 0;
      for (const sym of phil.symbols) {
        if (collectiveVocabulary.has(sym)) symbolsKnown++;
      }
      score += symbolsKnown * 1.5; // 1.5 per known symbol
    }

    // Trait bias scoring (legacy, weaker influence)
    for (const [trait, bias] of Object.entries(phil.traitBias)) {
      const key = `avg${trait.charAt(0).toUpperCase()}${trait.slice(1)}` as keyof typeof profile;
      const val = profile[key];
      if (typeof val === 'number') {
        score += val * (bias as number) * 5;
      }
    }

    // Diversity penalty: already-used philosophies score lower
    if (usedPhilosophies && usedPhilosophies.has(phil.name)) {
      score -= 3.0;
    }

    // Strong random factor for emergent diversity
    score += Math.random() * 2.0;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = phil;
    }
  }

  return bestMatch;
}
