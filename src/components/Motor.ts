import { ComponentStorage } from '../ecs/Component';

export interface MotorData {
  forward: number;    // 0-2 speed
  turnLeft: number;   // 0-2 intensity
  turnRight: number;  // 0-2 intensity
  wantEat: boolean;
  wantMate: boolean;
  wantGather: boolean;
  wantHunt: boolean;
  wantBuild: boolean;
  wantFightMonster: boolean;
  wantCook: boolean;
  cookWaitTimer: number;  // ticks spent trying to reach a campfire
  wantRevolt: boolean;
  // Raid movement target
  raidTargetX: number;
  raidTargetZ: number;
  // Stuck detection
  stuckTimer: number;
  lastX: number;
  lastZ: number;
  // Sleep state
  sleepTimer: number;     // ticks remaining asleep (0 = awake)
  wantSleep: boolean;
  // God Hand
  godHeld: boolean;       // true while being carried by god hand
}

export function createMotor(): MotorData {
  return { forward: 0, turnLeft: 0, turnRight: 0, wantEat: false, wantMate: false, wantGather: false, wantHunt: false, wantBuild: false, wantFightMonster: false, wantCook: false, cookWaitTimer: 0, wantRevolt: false, raidTargetX: 0, raidTargetZ: 0, stuckTimer: 0, lastX: 0, lastZ: 0, sleepTimer: 0, wantSleep: false, godHeld: false };
}

export const MotorStore = new ComponentStorage<MotorData>();
