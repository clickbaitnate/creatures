import { ComponentStorage } from '../ecs/Component';
import type * as THREE from 'three';

export interface RenderableData {
  object: THREE.Object3D;
}

export const RenderableStore = new ComponentStorage<RenderableData>();
