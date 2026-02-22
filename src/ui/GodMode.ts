import * as THREE from 'three';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { MotorStore } from '../components/Motor';
import { SocialStore, Activity } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { ZealotryStore } from '../components/Zealotry';
import { GoalStore, GoalType } from '../components/Goal';
import { clamp, distSq } from '../utils/Math';

// Action emojis for religious witness
const ACTION_EMOJIS: Record<string, string> = {
  eat: '🍎',
  gather: '⛏️',
  build: '🏗️',
  hunt: '🎯',
  fight: '⚔️',
  mate: '💕',
};

const SIGHT_RADIUS = 15;
const SIGHT_RADIUS_SQ = SIGHT_RADIUS * SIGHT_RADIUS;
const ZEALOTRY_GAIN = 0.01;

export class GodMode {
  possessedId: number = -1;
  active: boolean = false;
  private keys: Set<string> = new Set();
  private lastAction: string = '';

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.handleCommand(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  possess(entityId: number, world: World): void {
    this.possessedId = entityId;
    this.active = true;
  }

  release(): void {
    this.possessedId = -1;
    this.active = false;
  }

  private handleCommand(key: string): void {
    // Action keys while possessing
    if (!this.active || this.possessedId < 0) return;
    switch (key) {
      case '1': this.lastAction = 'eat'; break;
      case '2': this.lastAction = 'gather'; break;
      case '3': this.lastAction = 'build'; break;
      case '4': this.lastAction = 'hunt'; break;
    }
  }

  update(world: World, camera: THREE.PerspectiveCamera): void {
    if (!this.active || this.possessedId < 0) return;

    const lifecycle = LifecycleStore.get(this.possessedId);
    if (!lifecycle || lifecycle.stage === LifeStage.Dead) {
      this.release();
      return;
    }

    const transform = TransformStore.get(this.possessedId);
    const motor = MotorStore.get(this.possessedId);
    if (!transform || !motor) return;

    // Override motor from WASD
    motor.forward = 0;
    motor.turnLeft = 0;
    motor.turnRight = 0;

    if (this.keys.has('w')) motor.forward = 1.5;
    if (this.keys.has('s')) motor.forward = -0.5;
    if (this.keys.has('a')) motor.turnLeft = 1.5;
    if (this.keys.has('d')) motor.turnRight = 1.5;

    // Action keys
    motor.wantEat = this.keys.has('1');
    motor.wantGather = this.keys.has('2');
    motor.wantBuild = this.keys.has('3');
    motor.wantHunt = this.keys.has('4');

    // God commands
    const social = SocialStore.get(this.possessedId);
    if (social) {
      // G: Gather here command to faction
      if (this.keys.has('g')) {
        this.issueGoalToNearbyFaction(world, GoalType.FindFood, transform.x, transform.z, social.factionId);
      }
      // B: Build here
      if (this.keys.has('b')) {
        this.issueGoalToNearbyFaction(world, GoalType.BuildShelter, transform.x, transform.z, social.factionId);
      }
      // F: Follow me
      if (this.keys.has('f')) {
        this.issueGoalToNearbyFaction(world, GoalType.Explore, transform.x, transform.z, social.factionId);
      }
    }

    // Zealotry: creatures in line-of-sight gain faith
    this.spreadZealotry(world, transform.x, transform.z, transform.rotation);
  }

  private spreadZealotry(world: World, godX: number, godZ: number, godRot: number): void {
    const creatures = world.query(TransformStore.bit | ZealotryStore.bit);

    for (const cid of creatures) {
      if (cid === this.possessedId) continue;
      const ct = TransformStore.get(cid)!;
      const dsq = distSq(godX, godZ, ct.x, ct.z);
      if (dsq > SIGHT_RADIUS_SQ) continue;

      // Check if within 90° of god creature facing direction
      const dx = ct.x - godX;
      const dz = ct.z - godZ;
      const angleToCreature = Math.atan2(dx, dz);
      let relAngle = angleToCreature - godRot;
      while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
      while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
      if (Math.abs(relAngle) > Math.PI / 2) continue;

      // Gain zealotry
      const zealotry = ZealotryStore.get(cid)!;
      zealotry.deity = 0; // player god
      zealotry.zealotry = clamp(zealotry.zealotry + ZEALOTRY_GAIN, 0, 1);

      // Record witnessed action
      if (this.lastAction && ACTION_EMOJIS[this.lastAction]) {
        const emoji = ACTION_EMOJIS[this.lastAction];
        if (!zealotry.witnessed.includes(emoji)) {
          if (zealotry.witnessed.length >= 5) zealotry.witnessed.shift();
          zealotry.witnessed.push(emoji);
        }
      }
    }
    this.lastAction = '';
  }

  private issueGoalToNearbyFaction(world: World, goalType: GoalType, x: number, z: number, factionId: number): void {
    const creatures = world.query(GoalStore.bit | SocialStore.bit | TransformStore.bit);
    for (const cid of creatures) {
      if (cid === this.possessedId) continue;
      const social = SocialStore.get(cid)!;
      if (social.factionId !== factionId) continue;
      const ct = TransformStore.get(cid)!;
      if (distSq(x, z, ct.x, ct.z) > SIGHT_RADIUS_SQ) continue;

      const goal = GoalStore.get(cid);
      if (goal) {
        goal.activeGoal = goalType;
        goal.goalTargetX = x;
        goal.goalTargetZ = z;
        goal.goalProgress = 0;
        goal.goalTicks = 0;
      }
    }
  }
}
