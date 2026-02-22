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
}

export function createMotor(): MotorData {
  return { forward: 0, turnLeft: 0, turnRight: 0, wantEat: false, wantMate: false, wantGather: false, wantHunt: false, wantBuild: false, wantFightMonster: false };
}

export const MotorStore = new ComponentStorage<MotorData>();
