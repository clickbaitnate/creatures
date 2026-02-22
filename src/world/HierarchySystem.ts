import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ShaderStateStore } from '../components/ShaderState';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';
import type { FactionManager } from './FactionSystem';

const RECOMPUTE_INTERVAL = 200;

export interface RankEntry {
  entityId: number;
  dominanceScore: number;
}

export class HierarchySystem extends System {
  readonly query = GenomeStore.bit | BiochemStore.bit | SocialStore.bit | LifecycleStore.bit;
  readonly priority = 40;

  factionManager: FactionManager | null = null;

  // faction ID → sorted rank list (index 0 = alpha)
  ranks = new Map<number, RankEntry[]>();
  // entity ID → normalized rank (0.0 lowest → 1.0 alpha)
  entityRanks = new Map<number, number>();

  private tickCounter = 0;
  // Fight wins tracked across challenges
  private fightWins = new Map<number, number>();

  update(world: World, _dt: number): void {
    this.tickCounter++;
    if (this.tickCounter < RECOMPUTE_INTERVAL) return;
    this.tickCounter = 0;

    if (!this.factionManager) return;

    const entities = world.query(this.query);

    // Group by faction
    const byFaction = new Map<number, number[]>();
    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;

      const social = SocialStore.get(id)!;
      let list = byFaction.get(social.factionId);
      if (!list) {
        list = [];
        byFaction.set(social.factionId, list);
      }
      list.push(id);
    }

    // Compute dominance for each faction
    for (const [factionId, members] of byFaction) {
      const ranked: RankEntry[] = [];

      for (const id of members) {
        const { genome } = GenomeStore.get(id)!;
        const { chemicals } = BiochemStore.get(id)!;
        const social = SocialStore.get(id)!;
        const lifecycle = LifecycleStore.get(id)!;

        const wins = this.fightWins.get(id) ?? 0;
        const ageFactor = clamp(lifecycle.age / (lifecycle.maxAge * 0.5), 0, 1); // peaks mid-life

        const score =
          genome.aggression * 0.25 +
          genome.bodyScale * 0.15 +
          social.health * 0.2 +
          chemicals[ChemId.Energy] * 0.1 +
          Math.min(wins * 0.05, 0.2) +
          ageFactor * 0.1;

        ranked.push({ entityId: id, dominanceScore: score });
      }

      ranked.sort((a, b) => b.dominanceScore - a.dominanceScore);
      this.ranks.set(factionId, ranked);

      // Assign normalized rank
      for (let i = 0; i < ranked.length; i++) {
        const normalizedRank = ranked.length > 1
          ? 1 - i / (ranked.length - 1)
          : 1;
        this.entityRanks.set(ranked[i].entityId, normalizedRank);

        // Update shader uniform
        const shaderState = ShaderStateStore.get(ranked[i].entityId);
        if (shaderState) {
          shaderState.uniforms.u_rank.value = normalizedRank;
        }
      }
    }
  }

  /** Record a fight win */
  recordWin(entityId: number): void {
    this.fightWins.set(entityId, (this.fightWins.get(entityId) ?? 0) + 1);
  }

  /** Get normalized rank (0-1, 1 = alpha) */
  getRank(entityId: number): number {
    return this.entityRanks.get(entityId) ?? 0;
  }

  /** Check if entity is alpha of their faction */
  isAlpha(entityId: number): boolean {
    return this.getRank(entityId) >= 0.99;
  }
}
