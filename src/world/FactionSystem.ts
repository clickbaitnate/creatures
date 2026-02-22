import { geneticDistance, type CreatureGenome } from '../genome/Genome';
import { speciesName } from './NameGenerator';

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
      };
      for (const existing of this.factions) {
        clanless.relations.set(existing.id, 0);
        existing.relations.set(clanless.id, 0);
      }
      this.factions.push(clanless);
    }
    return clanless;
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
