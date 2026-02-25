// ═══════════════════════════════════════════════════════════════════════
// AstrologySystem — Computes transit aspects and astrological influence
// for each creature. Updates every INFLUENCE_INTERVAL ticks per creature
// (staggered so not all creatures update the same tick).
// ═══════════════════════════════════════════════════════════════════════

import type { World } from '../ecs/World';
import { NatalChartStore } from '../components/NatalChart';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import {
  computeSkyState,
  computeInfluence,
  PLANET_COUNT,
  type PlanetPosition,
} from '../world/Astrology';

const INFLUENCE_INTERVAL = 50; // recalc influence every 50 ticks per creature

export class AstrologySystem {
  private currentTick = 0;
  skyPositions: PlanetPosition[] = []; // current sky, updated every tick

  tick(world: World): void {
    this.currentTick++;

    // Update sky state every tick (cheap: 7 trig calls)
    this.skyPositions = computeSkyState(this.currentTick);

    // Staggered creature updates — only update creatures whose (id + tick) mod interval = 0
    const entities = world.query(NatalChartStore.bit);
    for (const id of entities) {
      // Skip dead creatures
      const lc = LifecycleStore.get(id);
      if (lc && lc.stage === LifeStage.Dead) continue;

      const nd = NatalChartStore.get(id);
      if (!nd) continue;

      // Stagger: each creature updates on a different tick within the interval
      if ((this.currentTick - nd.lastInfluenceTick) < INFLUENCE_INTERVAL) continue;

      // Compute fresh influence
      nd.influence = computeInfluence(nd.chart, this.currentTick);
      nd.lastInfluenceTick = this.currentTick;
    }
  }

  /** Set the world tick (for loading saved games) */
  setTick(tick: number): void {
    this.currentTick = tick;
    this.skyPositions = computeSkyState(tick);
  }
}
