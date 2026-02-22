import * as THREE from 'three';
import { ComponentStorage } from '../ecs/Component';

export interface ExpressionData {
  // Emotion values (0-1)
  happiness: number;
  fear: number;
  anger: number;
  curiosity: number;
  tiredness: number;
  pain: number;
  anxiety: number;

  // Computed mood: -1 (miserable) to +1 (elated)
  mood: number;
  // Dominant emotion name for behavior lookups
  dominant: string;

  // Cached mesh refs (populated on first access)
  meshRefs: ExpressionMeshRefs | null;
}

export interface ExpressionMeshRefs {
  head: THREE.Mesh;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  pupilL: THREE.Mesh;
  pupilR: THREE.Mesh;
  mouth: THREE.Mesh;
  torso: THREE.Mesh;
  group: THREE.Group;
  // Store original positions/scales for lerping
  origEyeLScaleY: number;
  origEyeRScaleY: number;
  origPupilLScale: number;
  origPupilRScale: number;
  origMouthScaleX: number;
  origMouthScaleY: number;
  origHeadY: number;
  origHeadRotZ: number;
}

export function createExpression(): ExpressionData {
  return {
    happiness: 0,
    fear: 0,
    anger: 0,
    curiosity: 0,
    tiredness: 0,
    pain: 0,
    anxiety: 0,
    mood: 0,
    dominant: 'neutral',
    meshRefs: null,
  };
}

export const ExpressionStore = new ComponentStorage<ExpressionData>();
