import { ComponentStorage } from '../ecs/Component';

export const enum GoalType {
  None = 0,
  FindFood = 1,
  BuildShelter = 2,
  CraftTool = 3,
  FindMate = 4,
  Explore = 5,
  Defend = 6,
  Trade = 7,
  Farm = 8,
  Migrate = 9,
  Settle = 10,
}

export interface GoalData {
  activeGoal: GoalType;
  goalTargetX: number;
  goalTargetZ: number;
  goalProgress: number; // 0-1
  goalTicks: number;    // how long this goal has been active
}

export function createGoal(): GoalData {
  return {
    activeGoal: GoalType.Explore,
    goalTargetX: 0,
    goalTargetZ: 0,
    goalProgress: 0,
    goalTicks: 0,
  };
}

export const GoalStore = new ComponentStorage<GoalData>();
