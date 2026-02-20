import { ComponentStorage } from '../ecs/Component';

export interface TransformData {
  x: number;
  y: number;
  z: number;
  rotation: number; // radians around Y axis
}

export const TransformStore = new ComponentStorage<TransformData>();
