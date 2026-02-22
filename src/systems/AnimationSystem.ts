import * as THREE from 'three';
import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { RenderableStore } from '../components/Renderable';
import { SocialStore, Activity } from '../components/Social';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, ItemType } from '../components/Inventory';
import { attachToolMesh } from '../creatures/MeshBuilder';

// Procedural creature animations driven by Activity state.
// Finds named children in the creature group and applies per-frame transforms.

interface AnimState {
  walkPhase: number;     // oscillator for walk cycle
  gatherPhase: number;   // oscillator for gathering bend
  buildPhase: number;    // oscillator for hammer motion
  eatPhase: number;      // oscillator for eating
  fightPhase: number;    // oscillator for fighting lunge
  matePhase: number;     // oscillator for mating dance
  lastTool: number;      // last equipped tool type for change detection
}

const animStates = new Map<number, AnimState>();

function getState(id: number): AnimState {
  let s = animStates.get(id);
  if (!s) {
    s = { walkPhase: 0, gatherPhase: 0, buildPhase: 0, eatPhase: 0, fightPhase: 0, matePhase: 0, lastTool: -1 };
    animStates.set(id, s);
  }
  return s;
}

function findChild(group: THREE.Group, name: string): THREE.Object3D | null {
  for (const child of group.children) {
    if (child.name === name) return child;
  }
  return null;
}

export class AnimationSystem extends System {
  readonly query = RenderableStore.bit | SocialStore.bit;
  readonly priority = 96; // after Expression (92), before Render (100)

  update(world: World, dt: number): void {
    const entities = world.query(this.query);
    const time = performance.now() * 0.001;

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id);
      if (lifecycle && lifecycle.stage === LifeStage.Dead) continue;

      const { object } = RenderableStore.get(id)!;
      if (!(object instanceof THREE.Group)) continue;

      const social = SocialStore.get(id)!;
      const motor = MotorStore.get(id);
      const inv = InventoryStore.get(id);
      const state = getState(id);

      const activity = social.activity;

      // Find body parts
      const legL = findChild(object, 'legL');
      const legR = findChild(object, 'legR');
      const armL = findChild(object, 'armL');
      const armR = findChild(object, 'armR');
      const head = findChild(object, 'head');
      const torso = findChild(object, 'torso');
      const handL = findChild(object, 'handL');
      const handR = findChild(object, 'handR');

      // Reset rotations toward zero (lerp back to default)
      const resetSpeed = 0.15;
      if (legL) legL.rotation.x *= (1 - resetSpeed);
      if (legR) legR.rotation.x *= (1 - resetSpeed);
      if (armL) { armL.rotation.x *= (1 - resetSpeed); armL.rotation.z *= (1 - resetSpeed); }
      if (armR) { armR.rotation.x *= (1 - resetSpeed); armR.rotation.z *= (1 - resetSpeed); }
      if (torso) torso.rotation.x *= (1 - resetSpeed);

      switch (activity) {
        case Activity.Walking: {
          // Walk cycle — swing legs and arms opposite (reduced for blocky limbs)
          const speed = motor ? motor.forward * 8 : 4;
          state.walkPhase += dt * speed;
          const swing = Math.sin(state.walkPhase) * 0.3;

          if (legL) legL.rotation.x = swing;
          if (legR) legR.rotation.x = -swing;
          if (armL) armL.rotation.x = -swing * 0.45;
          if (armR) armR.rotation.x = swing * 0.45;

          // Subtle body bob
          if (torso) torso.rotation.x = Math.sin(state.walkPhase * 2) * 0.03;
          break;
        }

        case Activity.Gathering: {
          // Bend down and reach — cyclical scoop motion
          state.gatherPhase += dt * 3;
          const bendAmt = 0.3 + Math.sin(state.gatherPhase) * 0.15;
          const reachAmt = Math.sin(state.gatherPhase * 0.5) * 0.5;

          if (torso) torso.rotation.x = bendAmt;
          if (armR) { armR.rotation.x = -0.8 + reachAmt; armR.rotation.z = -0.2; }
          if (armL) { armL.rotation.x = -0.4; armL.rotation.z = 0.2; }

          // Slight leg bend
          if (legL) legL.rotation.x = 0.15;
          if (legR) legR.rotation.x = 0.15;

          // Gathering progress visual — gather bar on the creature
          if (inv && inv.gatherProgress > 0) {
            const prog = inv.gatherProgress;
            // Pulse the reach with progress
            if (armR) armR.rotation.x = -0.8 + Math.sin(state.gatherPhase * 2) * 0.3 * prog;
          }
          break;
        }

        case Activity.Building: {
          // Hammer motion — arm raises and falls
          state.buildPhase += dt * 5;
          const hammerSwing = Math.sin(state.buildPhase);
          const isDownStroke = hammerSwing < 0;

          if (armR) {
            armR.rotation.x = -1.2 + hammerSwing * 0.8;
            armR.rotation.z = -0.3;
          }
          if (armL) {
            armL.rotation.x = -0.3;
            armL.rotation.z = 0.3;
          }

          // Body follows hammer
          if (torso) torso.rotation.x = isDownStroke ? 0.15 : 0.05;

          // Feet planted
          if (legL) legL.rotation.x = 0.1;
          if (legR) legR.rotation.x = -0.05;
          break;
        }

        case Activity.Eating: {
          // Head bob down — chewing motion (additive to expression)
          state.eatPhase += dt * 6;
          const chew = Math.sin(state.eatPhase) * 0.08;

          if (head) head.rotation.x += 0.15 + chew;
          if (torso) torso.rotation.x = 0.1;

          // Hands to mouth
          if (armL) { armL.rotation.x = -0.7; armL.rotation.z = 0.4; }
          if (armR) { armR.rotation.x = -0.7; armR.rotation.z = -0.4; }
          break;
        }

        case Activity.Fighting: {
          // Lunge and punch
          state.fightPhase += dt * 8;
          const punch = Math.sin(state.fightPhase);
          const isPunching = punch > 0.3;

          if (torso) torso.rotation.x = isPunching ? -0.15 : 0.1;

          if (armR) {
            armR.rotation.x = isPunching ? -1.2 : -0.3;
            armR.rotation.z = isPunching ? 0.2 : -0.1;
          }
          if (armL) {
            armL.rotation.x = -0.5;
            armL.rotation.z = 0.3;
          }

          // Aggressive stance
          if (legL) legL.rotation.x = 0.2;
          if (legR) legR.rotation.x = -0.3;
          break;
        }

        case Activity.Mating: {
          // Dance — sway side to side, arms out
          state.matePhase += dt * 4;
          const sway = Math.sin(state.matePhase) * 0.2;

          if (torso) torso.rotation.z = sway;

          if (armL) { armL.rotation.x = -0.3; armL.rotation.z = 0.6 + Math.sin(state.matePhase * 1.5) * 0.3; }
          if (armR) { armR.rotation.x = -0.3; armR.rotation.z = -0.6 - Math.sin(state.matePhase * 1.5) * 0.3; }

          // Happy feet
          if (legL) legL.rotation.x = Math.sin(state.matePhase * 2) * 0.15;
          if (legR) legR.rotation.x = -Math.sin(state.matePhase * 2) * 0.15;
          break;
        }

        case Activity.Talking: {
          // Gentle gestures — small arm waves
          const talkPhase = time * 3 + id * 0.7;
          if (armR) {
            armR.rotation.x = -0.4 + Math.sin(talkPhase) * 0.2;
            armR.rotation.z = -0.3 + Math.sin(talkPhase * 0.7) * 0.15;
          }
          break;
        }

        case Activity.Idle:
        default: {
          // Subtle idle animation — breathing, slight fidgets
          const idlePhase = time * 0.8 + id * 1.3;
          if (torso) torso.rotation.x = Math.sin(idlePhase) * 0.015;

          // Occasional head turn (additive to expression)
          if (head) {
            head.rotation.y += Math.sin(idlePhase * 0.3 + id) * 0.05;
          }
          break;
        }
      }

      // Update equipped tool visual
      if (inv) {
        const currentTool = inv.equippedTool;
        if (currentTool !== state.lastTool) {
          state.lastTool = currentTool;
          attachToolMesh(object, currentTool as ItemType);
        }
      }
    }
  }

  // Clean up dead entity animation states
  removeEntity(id: number): void {
    animStates.delete(id);
  }
}
