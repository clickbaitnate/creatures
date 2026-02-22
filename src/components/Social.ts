import { ComponentStorage } from '../ecs/Component';

export const enum Activity {
  Idle = 0,
  Walking = 1,
  Eating = 2,
  Talking = 3,
  Fighting = 4,
  Mating = 5,
  Building = 6,
  Gathering = 7,
}

export interface SocialData {
  name: string;
  factionId: number;
  activity: Activity;
  // Speech bubble
  speechEmoji: string;
  speechTimer: number;   // ticks remaining to show bubble
  // Combat
  attackTarget: number;  // entity ID or -1
  attackCooldown: number;
  health: number;        // 0-1
  // Mating
  mateTarget: number;
  matingTimer: number;   // ticks of mating animation
  // Resources carried
  resources: number;     // 0-10, for building
  // Babel language tag (0 = universal, 1-4 = confused)
  language: number;
}

export function createSocial(name: string, factionId: number): SocialData {
  return {
    name,
    factionId,
    activity: Activity.Idle,
    speechEmoji: '',
    speechTimer: 0,
    attackTarget: -1,
    attackCooldown: 0,
    health: 1.0,
    mateTarget: -1,
    matingTimer: 0,
    resources: 0,
    language: 0,
  };
}

export const SocialStore = new ComponentStorage<SocialData>();
