import * as THREE from 'three';
import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { RenderableStore } from '../components/Renderable';
import { SocialStore, Activity } from '../components/Social';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, ItemType } from '../components/Inventory';
import { attachToolMesh, attachShieldMesh } from '../creatures/MeshBuilder';
import { countItem } from '../components/Inventory';

// Procedural creature animations driven by Activity state.
// Finds named children in the creature group and applies per-frame transforms.

interface AnimState {
  walkPhase: number;     // oscillator for walk cycle
  gatherPhase: number;   // oscillator for gathering chop
  buildPhase: number;    // oscillator for building place
  eatPhase: number;      // oscillator for eating
  fightPhase: number;    // oscillator for fighting slash
  matePhase: number;     // oscillator for mating dance
  lastTool: number;      // last equipped tool type for change detection
  lastShield: boolean;   // last shield state for change detection
}

const animStates = new Map<number, AnimState>();

function getState(id: number): AnimState {
  let s = animStates.get(id);
  if (!s) {
    s = { walkPhase: 0, gatherPhase: 0, buildPhase: 0, eatPhase: 0, fightPhase: 0, matePhase: 0, lastTool: -1, lastShield: false };
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
          // Overhead chop cycle: slow raise, sharp downstroke
          state.gatherPhase += dt * 4;
          const chopCycle = state.gatherPhase % (Math.PI * 2);
          // Raise slow (0 to PI), strike fast (PI to 2PI)
          let armAngle: number;
          if (chopCycle < Math.PI) {
            // Slow raise
            armAngle = -0.3 + (-1.2) * (chopCycle / Math.PI);
          } else {
            // Sharp downstroke
            const t = (chopCycle - Math.PI) / Math.PI;
            armAngle = -1.5 + 1.8 * (t * t); // accelerating down
          }

          if (armR) { armR.rotation.x = armAngle; armR.rotation.z = -0.15; }
          if (armL) { armL.rotation.x = -0.3; armL.rotation.z = 0.2; }

          // Body leans into chop
          if (torso) torso.rotation.x = chopCycle > Math.PI ? 0.2 : 0.05;

          // Planted stance
          if (legL) legL.rotation.x = 0.15;
          if (legR) legR.rotation.x = -0.05;
          break;
        }

        case Activity.Building: {
          // Arm extends forward to place block, pulls back
          state.buildPhase += dt * 3;
          const placeCycle = Math.sin(state.buildPhase);
          const extending = placeCycle > 0;

          if (armR) {
            // Extend arm forward to place, then pull back
            armR.rotation.x = extending ? -1.0 - placeCycle * 0.3 : -0.3 + placeCycle * 0.2;
            armR.rotation.z = -0.1;
          }
          if (armL) {
            // Support arm — holds material
            armL.rotation.x = extending ? -0.6 : -0.3;
            armL.rotation.z = 0.2;
          }

          // Lean forward when placing
          if (torso) torso.rotation.x = extending ? 0.15 : 0.05;

          // Stable stance
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
          // Sword slash across body + shield raise alternation
          state.fightPhase += dt * 6;
          const fightCycle = state.fightPhase % (Math.PI * 2);
          const isAttacking = fightCycle < Math.PI; // first half: attack, second: defend

          if (isAttacking) {
            // Sword slash: arm swings wide across body
            const slashT = fightCycle / Math.PI;
            if (armR) {
              armR.rotation.x = -0.8 - slashT * 0.4;
              armR.rotation.z = 0.8 - slashT * 1.6; // sweep from right to left
            }
            if (armL) {
              // Shield down during attack
              armL.rotation.x = -0.4;
              armL.rotation.z = 0.2;
            }
            if (torso) torso.rotation.x = -0.1;
          } else {
            // Defend: shield up, sword back
            const defendT = (fightCycle - Math.PI) / Math.PI;
            if (armR) {
              armR.rotation.x = -0.5;
              armR.rotation.z = -0.3 + defendT * 0.2;
            }
            if (armL) {
              // Shield raise
              armL.rotation.x = -1.0 + defendT * 0.3;
              armL.rotation.z = 0.4;
            }
            if (torso) torso.rotation.x = 0.05;
          }

          // Wide fighting stance
          if (legL) legL.rotation.x = 0.25;
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
        // Shield coexists with weapon
        const hasShield = countItem(inv, ItemType.Shield) > 0;
        if (hasShield !== state.lastShield) {
          state.lastShield = hasShield;
          attachShieldMesh(object, hasShield);
        }
      }
    }
  }

  // Clean up dead entity animation states
  removeEntity(id: number): void {
    animStates.delete(id);
  }
}
