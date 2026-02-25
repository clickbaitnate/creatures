// ECS Component: per-creature natal chart and cached astrological influence
import { ComponentStorage } from '../ecs/Component';
import type {
  NatalChart, AstrologicalInfluence,
} from '../world/Astrology';
import { createDefaultInfluence } from '../world/Astrology';

export interface NatalChartData {
  chart:     NatalChart;
  influence: AstrologicalInfluence;  // recomputed periodically by AstrologySystem
  lastInfluenceTick: number;         // tick when influence was last recomputed
}

export function createNatalChartData(chart: NatalChart): NatalChartData {
  return {
    chart,
    influence: createDefaultInfluence(),
    lastInfluenceTick: 0,
  };
}

export const NatalChartStore = new ComponentStorage<NatalChartData>();
