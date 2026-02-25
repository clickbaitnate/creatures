import { geneticDistance, type CreatureGenome } from '../genome/Genome';
import { speciesName } from './NameGenerator';
import { DiaryStore, addDiaryEntry, DiaryEventType } from '../components/Diary';

// Faction/species tracking.
// Creatures START without factions and form them organically through socialization.

const FACTION_EMOJIS = [
  '⚔️', '🛡️', '🔥', '💎', '🌙', '☀️', '🌿', '💀',
  '👑', '🦴', '⭐', '🍄', '🌊', '🪨', '🏔️', '❄️',
  '🐺', '🦅', '🐉', '🦊', '🦁', '🐻', '🦉', '🐍',
];

export interface Faction {
  id: number;
  name: string;
  emoji: string;
  memberIds: Set<number>;
  color: number; // hue for visual markers
  // Diplomacy: faction ID → relationship score (-1 = war, 0 = neutral, 1 = ally)
  relations: Map<number, number>;
  // Breeding culture (emergent from member genes)
  avgMonogamy: number;     // rolling average of member monogamy scores
  breedingNorm: string;    // 'conservative' | 'moderate' | 'scandalous'
  // Religion/philosophy
  doctrine: string[];      // symbolic emojis representing faction beliefs
  philosophy: string;      // emergent philosophy label
  foundedTick: number;     // when the faction was formed
  // Settlement data
  settlementX: number;
  settlementZ: number;
  settlementTier: string;  // '' | 'Camp' | 'Hamlet' | 'Village' | 'Town'
  buildingCount: number;
}

/** Compute settlement tier from building count and member count */
export function getSettlementTier(buildingCount: number, memberCount: number): string {
  if (buildingCount >= 8 && memberCount >= 8) return 'Town';
  if (buildingCount >= 4 && memberCount >= 4) return 'Village';
  if (buildingCount >= 2) return 'Hamlet';
  if (buildingCount >= 1) return 'Camp';
  return '';
}

// Social bond between two creatures (for organic clan formation)
export interface SocialBond {
  entityA: number;
  entityB: number;
  strength: number; // 0-1
  interactions: number;
}

export class FactionManager {
  factions: Faction[] = [];
  private nextId = 0;
  // Entity → faction ID (may be -1 for clanless)
  entityFaction = new Map<number, number>();
  // Entity → representative genome (for distance comparison)
  private entityGenomes = new Map<number, CreatureGenome>();
  // Social bonds between creatures
  socialBonds = new Map<string, SocialBond>(); // key: "min-max" entity IDs

  private static SPECIES_THRESHOLD = 0.35; // genetic distance threshold
  private static BOND_THRESHOLD = 5; // interactions needed to consider forming clan
  private static MIN_CLAN_SIZE = 2; // minimum creatures to form a clan

  /** Assign a creature to existing faction or leave clanless. Called at spawn. */
  assignFaction(entityId: number, genome: CreatureGenome): Faction {
    this.entityGenomes.set(entityId, genome);

    // If there's a parent's faction and they're genetically close, inherit it
    let bestFaction: Faction | null = null;
    let bestDist = Infinity;

    for (const faction of this.factions) {
      for (const memberId of faction.memberIds) {
        const memberGenome = this.entityGenomes.get(memberId);
        if (memberGenome) {
          const dist = geneticDistance(genome, memberGenome);
          if (dist < bestDist) {
            bestDist = dist;
            bestFaction = faction;
          }
          break;
        }
      }
    }

    // Only auto-assign if genetically VERY close (offspring inheriting)
    if (bestFaction && bestDist < FactionManager.SPECIES_THRESHOLD * 0.5) {
      bestFaction.memberIds.add(entityId);
      this.entityFaction.set(entityId, bestFaction.id);
      // Diary: faction join
      if (bestFaction.name !== 'Wanderers') {
        const diary = DiaryStore.get(entityId);
        if (diary) addDiaryEntry(diary, 0, DiaryEventType.FactionJoin, { factionName: bestFaction.name });
      }
      return bestFaction;
    }

    // Otherwise, start clanless — will form clan through socialization
    const tempFaction = this.getClanless();
    tempFaction.memberIds.add(entityId);
    this.entityFaction.set(entityId, tempFaction.id);
    return tempFaction;
  }

  /** Get or create the "clanless" pseudo-faction */
  private getClanless(): Faction {
    let clanless = this.factions.find(f => f.name === 'Wanderers');
    if (!clanless) {
      clanless = {
        id: this.nextId++,
        name: 'Wanderers',
        emoji: '🌍',
        memberIds: new Set(),
        color: 0,
        relations: new Map(),
        avgMonogamy: 0.5,
        breedingNorm: 'moderate',
        doctrine: [],
        philosophy: '',
        foundedTick: 0,
        settlementX: 0,
        settlementZ: 0,
        settlementTier: '',
        buildingCount: 0,
      };
      for (const existing of this.factions) {
        clanless.relations.set(existing.id, 0);
        existing.relations.set(clanless.id, 0);
      }
      this.factions.push(clanless);
    }
    return clanless;
  }

  /** Get or create the Islander faction (maritime evangelists) */
  getOrCreateIslanderFaction(): Faction {
    let islanders = this.factions.find(f => f.name === 'Islanders');
    if (!islanders) {
      islanders = {
        id: this.nextId++,
        name: 'Islanders',
        emoji: '⛵',
        memberIds: new Set(),
        color: 200, // Blue hue
        relations: new Map(),
        avgMonogamy: 0.4,
        breedingNorm: 'scandalous', // More open to spreading knowledge
        doctrine: ['⛵', '💧', '🌊'], // Maritime symbols
        philosophy: 'Maritime Evangelism',
        foundedTick: 0,
        settlementX: 0,
        settlementZ: 0,
        settlementTier: '',
        buildingCount: 0,
      };
      // Initialize relations with all existing factions
      for (const existing of this.factions) {
        islanders.relations.set(existing.id, 0);
        existing.relations.set(islanders.id, 0);
      }
      this.factions.push(islanders);
    }
    return islanders;
  }

  /** Record a social interaction between two creatures (builds bonds) */
  recordInteraction(entityA: number, entityB: number, positive: boolean): void {
    const key = entityA < entityB ? `${entityA}-${entityB}` : `${entityB}-${entityA}`;
    let bond = this.socialBonds.get(key);
    if (!bond) {
      bond = { entityA: Math.min(entityA, entityB), entityB: Math.max(entityA, entityB), strength: 0, interactions: 0 };
      this.socialBonds.set(key, bond);
    }
    bond.interactions++;
    bond.strength = Math.min(1, bond.strength + (positive ? 0.05 : -0.03));
  }

  /** Try to form a new clan from strongly bonded clanless creatures */
  tryFormClan(tick: number): Faction | null {
    const clanless = this.factions.find(f => f.name === 'Wanderers');
    if (!clanless || clanless.memberIds.size < FactionManager.MIN_CLAN_SIZE) return null;

    // Find clusters of bonded clanless creatures
    const clanlessIds = Array.from(clanless.memberIds);
    for (const entityA of clanlessIds) {
      const friends: number[] = [entityA];

      for (const entityB of clanlessIds) {
        if (entityA === entityB) continue;
        const key = entityA < entityB ? `${entityA}-${entityB}` : `${entityB}-${entityA}`;
        const bond = this.socialBonds.get(key);
        if (bond && bond.interactions >= FactionManager.BOND_THRESHOLD && bond.strength > 0.2) {
          friends.push(entityB);
        }
      }

      if (friends.length >= FactionManager.MIN_CLAN_SIZE) {
        // Form new clan!
        return this.formClan(friends, tick);
      }
    }
    return null;
  }

  formClan(memberIds: number[], tick: number): Faction {
    const id = this.nextId++;
    // Derive faction traits from founding members
    let avgH = 0;
    let count = 0;
    for (const mid of memberIds) {
      const g = this.entityGenomes.get(mid);
      if (g) { avgH += g.colorH; count++; }
    }

    const seed = memberIds.reduce((a, b) => a + b * 137, 0);
    const faction: Faction = {
      id,
      name: speciesName(seed),
      emoji: FACTION_EMOJIS[id % FACTION_EMOJIS.length],
      memberIds: new Set(),
      color: count > 0 ? avgH / count : Math.random() * 360,
      relations: new Map(),
      avgMonogamy: 0.5,
      breedingNorm: 'moderate',
      doctrine: [],
      philosophy: '',
      foundedTick: tick,
      settlementX: 0,
      settlementZ: 0,
      settlementTier: '',
      buildingCount: 0,
    };

    // Initialize relations
    for (const existing of this.factions) {
      faction.relations.set(existing.id, 0);
      existing.relations.set(id, 0);
    }
    this.factions.push(faction);

    // Move members from clanless to new faction
    const clanless = this.factions.find(f => f.name === 'Wanderers');
    for (const mid of memberIds) {
      if (clanless) clanless.memberIds.delete(mid);
      faction.memberIds.add(mid);
      this.entityFaction.set(mid, id);
      // Diary: faction founded
      const diary = DiaryStore.get(mid);
      if (diary) addDiaryEntry(diary, 0, DiaryEventType.FactionFounded, { factionName: faction.name });
    }

    return faction;
  }

  removeMember(entityId: number): void {
    const factionId = this.entityFaction.get(entityId);
    if (factionId !== undefined) {
      const faction = this.factions.find(f => f.id === factionId);
      if (faction) faction.memberIds.delete(entityId);
    }
    this.entityFaction.delete(entityId);
    this.entityGenomes.delete(entityId);
  }

  /** Check if a creature should defect from their current faction.
   *  Returns the target faction ID if they should switch, or -1 to become wanderer, or null to stay. */
  tryDefect(entityId: number, dissatisfaction: number): number | null {
    const currentFactionId = this.entityFaction.get(entityId);
    if (currentFactionId === undefined) return null;
    const currentFaction = this.factions.find(f => f.id === currentFactionId);
    if (!currentFaction || currentFaction.name === 'Wanderers') return null;

    // Don't defect from tiny factions (would kill the faction) unless very unhappy
    if (currentFaction.memberIds.size <= 2 && dissatisfaction < 0.8) return null;

    // Calculate bond strength with current faction vs other factions
    let factionBondStrength = 0;
    let factionBondCount = 0;
    const bestAlternative = { factionId: -1, bondStrength: 0 };

    for (const [_key, bond] of this.socialBonds) {
      const isMe = bond.entityA === entityId || bond.entityB === entityId;
      if (!isMe) continue;
      const otherId = bond.entityA === entityId ? bond.entityB : bond.entityA;
      const otherFactionId = this.entityFaction.get(otherId);
      if (otherFactionId === undefined) continue;

      if (otherFactionId === currentFactionId) {
        factionBondStrength += bond.strength;
        factionBondCount++;
      } else {
        // Check if we have stronger bonds with another faction
        const otherFaction = this.factions.find(f => f.id === otherFactionId);
        if (otherFaction && otherFaction.name !== 'Wanderers' && bond.strength > bestAlternative.bondStrength) {
          bestAlternative.factionId = otherFactionId;
          bestAlternative.bondStrength = bond.strength;
        }
      }
    }

    const avgFactionBond = factionBondCount > 0 ? factionBondStrength / factionBondCount : 0;

    // Defect conditions: high dissatisfaction + weak faction bonds + strong external bonds
    const defectScore = dissatisfaction * 0.4 + (1 - avgFactionBond) * 0.3 + bestAlternative.bondStrength * 0.3;
    if (defectScore > 0.6) {
      // Check diplomatic relations — won't join an enemy faction
      if (bestAlternative.factionId >= 0) {
        const relation = this.getRelation(currentFactionId, bestAlternative.factionId);
        if (relation > -0.3) {
          return bestAlternative.factionId; // Join the other faction
        }
      }
      return -1; // Become a wanderer
    }

    return null; // Stay put
  }

  /** Move a creature from their current faction to a target faction (or wanderers if targetId=-1). */
  switchFaction(entityId: number, targetFactionId: number, tick: number): Faction | null {
    const currentFactionId = this.entityFaction.get(entityId);
    if (currentFactionId !== undefined) {
      const currentFaction = this.factions.find(f => f.id === currentFactionId);
      if (currentFaction) currentFaction.memberIds.delete(entityId);
    }

    let target: Faction | undefined;
    if (targetFactionId < 0) {
      target = this.getClanless();
    } else {
      target = this.factions.find(f => f.id === targetFactionId);
    }

    if (!target) return null;
    target.memberIds.add(entityId);
    this.entityFaction.set(entityId, target.id);

    // Diary entry
    const diary = DiaryStore.get(entityId);
    if (diary && target.name !== 'Wanderers') {
      addDiaryEntry(diary, tick, DiaryEventType.FactionJoin, { factionName: target.name });
    }

    return target;
  }

  /** Try to recruit a wanderer into a faction they have bonds with */
  tryRecruitWanderer(entityId: number): number | null {
    const currentFactionId = this.entityFaction.get(entityId);
    if (currentFactionId === undefined) return null;
    const currentFaction = this.factions.find(f => f.id === currentFactionId);
    if (!currentFaction || currentFaction.name !== 'Wanderers') return null;

    // Find the faction we have the strongest bonds with
    const factionScores = new Map<number, { totalBond: number; count: number }>();
    for (const [_key, bond] of this.socialBonds) {
      const isMe = bond.entityA === entityId || bond.entityB === entityId;
      if (!isMe || bond.strength < 0.15 || bond.interactions < 3) continue;
      const otherId = bond.entityA === entityId ? bond.entityB : bond.entityA;
      const otherFactionId = this.entityFaction.get(otherId);
      if (otherFactionId === undefined) continue;
      const otherFaction = this.factions.find(f => f.id === otherFactionId);
      if (!otherFaction || otherFaction.name === 'Wanderers') continue;

      const score = factionScores.get(otherFactionId) ?? { totalBond: 0, count: 0 };
      score.totalBond += bond.strength;
      score.count++;
      factionScores.set(otherFactionId, score);
    }

    let bestFactionId = -1;
    let bestScore = 0;
    for (const [fid, score] of factionScores) {
      // Need at least 2 bonds or 1 strong bond to join
      const effective = score.totalBond * Math.min(score.count, 3);
      if (effective > bestScore && (score.count >= 2 || score.totalBond > 0.4)) {
        bestScore = effective;
        bestFactionId = fid;
      }
    }

    return bestFactionId >= 0 ? bestFactionId : null;
  }

  getFaction(entityId: number): Faction | undefined {
    const fid = this.entityFaction.get(entityId);
    if (fid === undefined) return undefined;
    return this.factions.find(f => f.id === fid);
  }

  getRelation(factionA: number, factionB: number): number {
    if (factionA === factionB) return 1;
    const fa = this.factions.find(f => f.id === factionA);
    return fa?.relations.get(factionB) ?? 0;
  }

  setRelation(factionA: number, factionB: number, value: number): void {
    const fa = this.factions.find(f => f.id === factionA);
    const fb = this.factions.find(f => f.id === factionB);
    if (fa) fa.relations.set(factionB, value);
    if (fb) fb.relations.set(factionA, value);
  }

  /** Update breeding culture for all factions from member genomes */
  updateBreedingCulture(): void {
    for (const faction of this.factions) {
      if (faction.memberIds.size === 0) continue;
      let sumMono = 0;
      let count = 0;
      for (const memberId of faction.memberIds) {
        const genome = this.entityGenomes.get(memberId);
        if (genome && (genome as any).monogamy !== undefined) {
          sumMono += (genome as any).monogamy;
          count++;
        }
      }
      if (count > 0) {
        faction.avgMonogamy = sumMono / count;
        faction.breedingNorm = faction.avgMonogamy > 0.6 ? 'conservative'
                             : faction.avgMonogamy < 0.4 ? 'scandalous'
                             : 'moderate';
      }
    }
  }

  /** Periodic diplomacy tick — factions drift toward war or peace based on interactions */
  updateDiplomacy(): void {
    for (const fa of this.factions) {
      if (fa.memberIds.size === 0) continue;
      for (const fb of this.factions) {
        if (fa.id >= fb.id || fb.memberIds.size === 0) continue;
        let rel = fa.relations.get(fb.id) ?? 0;
        // Slow drift toward neutral
        rel *= 0.998;
        fa.relations.set(fb.id, rel);
        fb.relations.set(fa.id, rel);
      }
    }
  }

  get activeFactions(): Faction[] {
    return this.factions.filter(f => f.memberIds.size > 0);
  }
}
