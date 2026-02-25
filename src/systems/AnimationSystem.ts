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
// Enhanced with kinematic data for realistic motion.

interface AnimState {
  walkPhase: number;     // oscillator for walk cycle
  gatherPhase: number;   // oscillator for gathering chop
  buildPhase: number;    // oscillator for building place
  eatPhase: number;      // oscillator for eating
  fightPhase: number;    // oscillator for fighting slash
  matePhase: number;     // oscillator for mating dance
  cookPhase: number;     // oscillator for cooking
  sleepPhase: number;    // oscillator for sleeping
  raidPhase: number;     // oscillator for raiding
  lastTool: number;      // last equipped tool type for change detection
  lastShield: boolean;   // last shield state for change detection
  toolMesh: THREE.Group | null;  // reference to tool mesh for position updates
  shieldMesh: THREE.Group | null; // reference to shield mesh
}

const animStates = new Map<number, AnimState>();

function getState(id: number): AnimState {
  let s = animStates.get(id);
  if (!s) {
    s = {
      walkPhase: 0, gatherPhase: 0, buildPhase: 0, eatPhase: 0, fightPhase: 0,
      matePhase: 0, cookPhase: 0, sleepPhase: 0, raidPhase: 0,
      lastTool: -1, lastShield: false, toolMesh: null, shieldMesh: null,
    };
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

      // Auto-equip tools based on activity — always show best available tool/weapon
      if (inv) {
        if (activity === Activity.Gathering && inv.equippedTool === ItemType.None) {
          // Prefer axe for wood, pick for stone/ore
          if (countItem(inv, ItemType.MetalAxe) > 0) inv.equippedTool = ItemType.MetalAxe;
          else if (countItem(inv, ItemType.StoneAxe) > 0) inv.equippedTool = ItemType.StoneAxe;
          else if (countItem(inv, ItemType.MetalPick) > 0) inv.equippedTool = ItemType.MetalPick;
          else if (countItem(inv, ItemType.StonePick) > 0) inv.equippedTool = ItemType.StonePick;
        } else if (activity === Activity.Building && inv.equippedTool === ItemType.None) {
          if (countItem(inv, ItemType.MetalAxe) > 0) inv.equippedTool = ItemType.MetalAxe;
          else if (countItem(inv, ItemType.StoneAxe) > 0) inv.equippedTool = ItemType.StoneAxe;
        } else if ((activity === Activity.Fighting || activity === Activity.Raiding) && inv.equippedTool === ItemType.None) {
          if (countItem(inv, ItemType.IronSword) > 0) inv.equippedTool = ItemType.IronSword;
          else if (countItem(inv, ItemType.StoneSword) > 0) inv.equippedTool = ItemType.StoneSword;
          else if (countItem(inv, ItemType.WoodSword) > 0) inv.equippedTool = ItemType.WoodSword;
          else if (countItem(inv, ItemType.MetalAxe) > 0) inv.equippedTool = ItemType.MetalAxe;
          else if (countItem(inv, ItemType.StoneAxe) > 0) inv.equippedTool = ItemType.StoneAxe;
        } else if (inv.equippedTool === ItemType.None) {
          // Always show best weapon/tool when idle, walking, etc.
          if (countItem(inv, ItemType.IronSword) > 0) inv.equippedTool = ItemType.IronSword;
          else if (countItem(inv, ItemType.StoneSword) > 0) inv.equippedTool = ItemType.StoneSword;
          else if (countItem(inv, ItemType.WoodSword) > 0) inv.equippedTool = ItemType.WoodSword;
          else if (countItem(inv, ItemType.MetalAxe) > 0) inv.equippedTool = ItemType.MetalAxe;
          else if (countItem(inv, ItemType.StoneAxe) > 0) inv.equippedTool = ItemType.StoneAxe;
          else if (countItem(inv, ItemType.MetalPick) > 0) inv.equippedTool = ItemType.MetalPick;
          else if (countItem(inv, ItemType.StonePick) > 0) inv.equippedTool = ItemType.StonePick;
          else if (countItem(inv, ItemType.Torch) > 0) inv.equippedTool = ItemType.Torch;
        }
        // If equipped tool is no longer in inventory, unequip
        if (inv.equippedTool !== ItemType.None && countItem(inv, inv.equippedTool as ItemType) <= 0) {
          inv.equippedTool = ItemType.None;
        }
      }

      // Reset rotations toward zero (lerp back to default) - smoother reset
      const resetSpeed = 0.12;
      if (legL) legL.rotation.x *= (1 - resetSpeed);
      if (legR) legR.rotation.x *= (1 - resetSpeed);
      if (armL) {
        armL.rotation.x *= (1 - resetSpeed);
        armL.rotation.z *= (1 - resetSpeed);
        armL.rotation.y *= (1 - resetSpeed);
      }
      if (armR) {
        armR.rotation.x *= (1 - resetSpeed);
        armR.rotation.z *= (1 - resetSpeed);
        armR.rotation.y *= (1 - resetSpeed);
      }
      if (torso) {
        torso.rotation.x *= (1 - resetSpeed);
        torso.rotation.z *= (1 - resetSpeed);
      }
      if (head) head.rotation.y *= (1 - resetSpeed * 0.5); // Head resets slower

      switch (activity) {
        case Activity.Walking: {
          // Enhanced walk cycle with better kinematic data
          // Based on human gait: 60% stance, 40% swing phase
          const speed = motor ? motor.forward * 10 : 5;
          state.walkPhase += dt * speed;
          
          // Leg swing: asymmetric curve for more natural gait
          const phase = state.walkPhase % (Math.PI * 2);
          const legSwing = Math.sin(phase) * 0.4; // Increased amplitude
          const legLift = Math.max(0, Math.sin(phase)) * 0.15; // Lift during swing
          
          if (legL) {
            legL.rotation.x = legSwing + legLift;
            legL.rotation.z = Math.sin(phase * 0.5) * 0.1; // Slight outward swing
          }
          if (legR) {
            legR.rotation.x = -legSwing + legLift;
            legR.rotation.z = -Math.sin(phase * 0.5) * 0.1;
          }
          
          // Arm swing: opposite phase, slightly delayed for natural counterbalance
          const armPhase = phase + Math.PI * 0.1; // Slight delay
          const armSwing = Math.sin(armPhase) * 0.5;
          if (armL) {
            armL.rotation.x = -armSwing * 0.6;
            armL.rotation.z = Math.sin(armPhase * 0.5) * 0.15;
          }
          if (armR) {
            armR.rotation.x = armSwing * 0.6;
            armR.rotation.z = -Math.sin(armPhase * 0.5) * 0.15;
          }

          // Body bob: vertical movement + slight rotation
          if (torso) {
            torso.rotation.x = Math.sin(state.walkPhase * 2) * 0.05;
            torso.rotation.z = Math.sin(state.walkPhase * 0.5) * 0.02; // Slight lean
          }
          
          // Head bobs slightly
          if (head) head.rotation.x = Math.sin(state.walkPhase * 2) * 0.03;
          break;
        }

        case Activity.Gathering: {
          // Enhanced gathering: overhead chop with tool visible
          state.gatherPhase += dt * 5; // Slightly faster
          const chopCycle = state.gatherPhase % (Math.PI * 2);
          
          // Kinematic: slow windup (0-0.6π), fast strike (0.6π-1.2π), recovery (1.2π-2π)
          let armAngle: number;
          let armZ: number;
          if (chopCycle < Math.PI * 0.6) {
            // Windup: raise overhead
            const t = chopCycle / (Math.PI * 0.6);
            armAngle = -0.3 + (-1.4) * t; // Raise to -1.7
            armZ = -0.2 - 0.3 * t; // Pull back
          } else if (chopCycle < Math.PI * 1.2) {
            // Strike: fast downstroke
            const t = (chopCycle - Math.PI * 0.6) / (Math.PI * 0.6);
            const easeOut = 1 - (1 - t) * (1 - t); // Ease out curve
            armAngle = -1.7 + 1.9 * easeOut; // Down to 0.2
            armZ = -0.5 + 0.4 * easeOut; // Forward swing
          } else {
            // Recovery: return to ready
            const t = (chopCycle - Math.PI * 1.2) / (Math.PI * 0.8);
            armAngle = 0.2 - 0.5 * t; // Back to -0.3
            armZ = -0.1 - 0.1 * t; // Back to -0.2
          }

          if (armR) {
            armR.rotation.x = armAngle;
            armR.rotation.z = armZ;
            armR.rotation.y = Math.sin(chopCycle) * 0.1; // Slight twist
          }
          if (armL) {
            // Support arm: holds material or stabilizes
            armL.rotation.x = -0.4 - Math.sin(chopCycle * 0.5) * 0.1;
            armL.rotation.z = 0.25;
          }

          // Body leans into chop with weight transfer
          if (torso) {
            const lean = chopCycle > Math.PI * 0.6 && chopCycle < Math.PI * 1.2 ? 0.25 : 0.08;
            torso.rotation.x = lean;
            torso.rotation.z = Math.sin(chopCycle) * 0.05; // Slight twist
          }

          // Planted stance: weight on front leg during strike
          if (legL) legL.rotation.x = 0.2;
          if (legR) legR.rotation.x = -0.1;
          
          // Head follows tool
          if (head) head.rotation.x = Math.sin(chopCycle * 0.5) * 0.1;
          break;
        }

        case Activity.Building: {
          // Enhanced building: reach forward to place, pull back, reach again
          state.buildPhase += dt * 4;
          const phase = state.buildPhase % (Math.PI * 2);
          
          // Three phases: reach (0-π/2), place (π/2-π), return (π-2π)
          let armX: number, armZ: number;
          if (phase < Math.PI / 2) {
            // Reach forward
            const t = phase / (Math.PI / 2);
            armX = -0.4 + (-0.8) * t; // Extend forward
            armZ = -0.1 - 0.2 * t; // Forward
          } else if (phase < Math.PI) {
            // Place block (hold position)
            armX = -1.2;
            armZ = -0.3;
          } else {
            // Return
            const t = (phase - Math.PI) / Math.PI;
            armX = -1.2 + 0.9 * t; // Pull back
            armZ = -0.3 + 0.2 * t; // Back
          }

          if (armR) {
            armR.rotation.x = armX;
            armR.rotation.z = armZ;
            armR.rotation.y = Math.sin(phase) * 0.05; // Slight rotation
          }
          if (armL) {
            // Support arm — holds material, moves in sync
            armL.rotation.x = -0.5 - Math.sin(phase * 0.5) * 0.2;
            armL.rotation.z = 0.25;
          }

          // Lean forward when placing, slight crouch
          if (torso) {
            torso.rotation.x = phase < Math.PI ? 0.2 : 0.08;
            torso.rotation.z = Math.sin(phase * 0.5) * 0.03;
          }

          // Stable wide stance
          if (legL) legL.rotation.x = 0.15;
          if (legR) legR.rotation.x = -0.08;
          
          // Head looks at work
          if (head) head.rotation.x = 0.1 + Math.sin(phase * 0.5) * 0.05;
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
          // Enhanced fighting: dynamic sword slashes, shield blocks, hit recoil
          state.fightPhase += dt * 8; // Faster cadence
          const fightCycle = state.fightPhase % (Math.PI * 2);
          const isAttacking = fightCycle < Math.PI * 1.3;

          // Hit recoil: health < 1 causes flinch when recently hurt
          const hp = social.health;
          const recoilIntensity = hp < 0.95 ? (1 - hp) * 0.15 : 0;
          const recoilShake = Math.sin(time * 25 + id) * recoilIntensity;

          if (isAttacking) {
            // Sword slash: multiple attack patterns with lunge
            const slashT = fightCycle / (Math.PI * 1.3);
            const attackType = Math.floor(state.fightPhase / (Math.PI * 2)) % 4;
            
            let armX: number, armZ: number;
            if (attackType === 0) {
              // Horizontal slash: right to left
              armX = -0.7 - slashT * 0.6;
              armZ = 0.7 - slashT * 2.0; // Wide sweep
            } else if (attackType === 1) {
              // Overhead chop
              armX = -1.5 + slashT * 1.2;
              armZ = -0.2 - slashT * 0.4;
            } else if (attackType === 2) {
              // Diagonal slash: high right to low left
              armX = -1.1 + slashT * 0.7;
              armZ = 0.5 - slashT * 1.4;
            } else {
              // Thrust: stab forward
              armX = -0.5 - slashT * 0.4;
              armZ = -0.3 - slashT * 0.6;
            }
            
            if (armR) {
              armR.rotation.x = armX;
              armR.rotation.z = armZ;
              armR.rotation.y = Math.sin(fightCycle * 2) * 0.25; // Wrist twist
            }
            if (armL) {
              // Shield follows attack rhythm
              armL.rotation.x = -0.3 - slashT * 0.3;
              armL.rotation.z = 0.15;
            }
            if (torso) {
              // Lunge forward during strike peak
              const lungePeak = Math.sin(slashT * Math.PI);
              torso.rotation.x = -0.15 - lungePeak * 0.12;
              torso.rotation.z = Math.sin(slashT * Math.PI) * 0.12 + recoilShake;
            }
          } else {
            // Defend: shield up, sword ready
            const defendT = (fightCycle - Math.PI * 1.3) / (Math.PI * 0.7);
            if (armR) {
              armR.rotation.x = -0.6 + recoilShake;
              armR.rotation.z = -0.4 + defendT * 0.1;
              armR.rotation.y = 0.1;
            }
            if (armL) {
              // Shield raised high
              armL.rotation.x = -1.2 + defendT * 0.2;
              armL.rotation.z = 0.5;
              armL.rotation.y = -0.1;
            }
            if (torso) {
              torso.rotation.x = 0.1 + recoilShake;
              torso.rotation.z = -0.05 + recoilShake * 0.5;
            }
          }

          // Wide fighting stance with weight shifts
          const stanceShift = Math.sin(fightCycle * 0.5) * 0.08;
          if (legL) {
            legL.rotation.x = 0.3 + stanceShift;
            legL.rotation.z = 0.12;
          }
          if (legR) {
            legR.rotation.x = -0.35 - stanceShift;
            legR.rotation.z = -0.12;
          }
          
          // Head tracks opponent (slight bob)
          if (head) {
            head.rotation.x = isAttacking ? -0.12 : 0.05 + recoilShake;
            head.rotation.y = Math.sin(fightCycle * 0.3) * 0.06;
          }
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

        case Activity.Cooking: {
          // Cooking: stirring motion with tool
          state.cookPhase += dt * 5;
          const stirCycle = state.cookPhase % (Math.PI * 2);
          
          // Circular stirring motion
          if (armR) {
            armR.rotation.x = -0.6 + Math.sin(stirCycle) * 0.2;
            armR.rotation.z = -0.2 + Math.cos(stirCycle) * 0.3;
            armR.rotation.y = Math.sin(stirCycle * 2) * 0.15; // Wrist rotation
          }
          if (armL) {
            // Support arm: holds pot/stick
            armL.rotation.x = -0.5;
            armL.rotation.z = 0.3;
          }
          
          // Lean over cooking
          if (torso) torso.rotation.x = 0.15;
          if (head) head.rotation.x = 0.2; // Look down
          break;
        }

        case Activity.Sleeping: {
          // Sleeping: lying down pose
          state.sleepPhase += dt * 0.5; // Slow breathing
          
          // Arms relaxed
          if (armL) {
            armL.rotation.x = -0.2;
            armL.rotation.z = 0.4;
          }
          if (armR) {
            armR.rotation.x = -0.2;
            armR.rotation.z = -0.4;
          }
          
          // Body horizontal (torso rotated)
          if (torso) {
            torso.rotation.x = 1.4; // ~80 degrees (lying down)
            torso.rotation.z = Math.sin(state.sleepPhase) * 0.05; // Breathing
          }
          
          // Legs bent
          if (legL) legL.rotation.x = 0.6;
          if (legR) legR.rotation.x = 0.6;
          
          // Head on side
          if (head) {
            head.rotation.x = 0.3;
            head.rotation.y = Math.sin(state.sleepPhase * 0.3) * 0.1;
          }
          break;
        }

        case Activity.Raiding: {
          // Raiding: aggressive march with weapon ready
          state.raidPhase += dt * 6;
          const marchCycle = state.raidPhase % (Math.PI * 2);
          
          // Aggressive walk with weapon raised
          const legSwing = Math.sin(marchCycle) * 0.35;
          if (legL) legL.rotation.x = legSwing;
          if (legR) legR.rotation.x = -legSwing;
          
          // Weapon arm raised and ready
          if (armR) {
            armR.rotation.x = -0.8 + Math.sin(marchCycle * 0.5) * 0.1;
            armR.rotation.z = -0.3;
          }
          // Shield arm forward
          if (armL) {
            armL.rotation.x = -0.5;
            armL.rotation.z = 0.3;
          }
          
          // Aggressive posture
          if (torso) {
            torso.rotation.x = 0.1;
            torso.rotation.z = Math.sin(marchCycle * 0.5) * 0.05;
          }
          if (head) head.rotation.x = -0.1; // Look forward aggressively
          break;
        }

        case Activity.Talking: {
          // Enhanced talking: expressive gestures
          const talkPhase = time * 4 + id * 0.7;
          if (armR) {
            armR.rotation.x = -0.4 + Math.sin(talkPhase) * 0.25;
            armR.rotation.z = -0.3 + Math.sin(talkPhase * 0.7) * 0.2;
            armR.rotation.y = Math.sin(talkPhase * 0.5) * 0.1;
          }
          if (armL) {
            // Left arm also gestures
            armL.rotation.x = -0.3 + Math.sin(talkPhase * 1.3) * 0.15;
            armL.rotation.z = 0.2 + Math.sin(talkPhase * 0.9) * 0.1;
          }
          // Head nods
          if (head) head.rotation.x = Math.sin(talkPhase * 0.8) * 0.05;
          break;
        }

        case Activity.Idle:
        default: {
          // Enhanced idle: breathing, slight fidgets, weight shifts
          const idlePhase = time * 0.8 + id * 1.3;
          
          // Breathing: chest rises and falls
          if (torso) {
            torso.rotation.x = Math.sin(idlePhase) * 0.02;
            torso.rotation.z = Math.sin(idlePhase * 0.3) * 0.01; // Slight sway
          }
          
          // Occasional head turn and look around
          if (head) {
            head.rotation.y = Math.sin(idlePhase * 0.3 + id) * 0.08;
            head.rotation.x = Math.sin(idlePhase * 0.5) * 0.02;
          }
          
          // Subtle weight shift between legs
          const weightShift = Math.sin(idlePhase * 0.2) * 0.05;
          if (legL) legL.rotation.x = weightShift;
          if (legR) legR.rotation.x = -weightShift;
          
          // Arms slightly move
          if (armR) armR.rotation.x = -0.2 + Math.sin(idlePhase * 0.4) * 0.05;
          if (armL) armL.rotation.x = -0.2 + Math.sin(idlePhase * 0.4 + Math.PI) * 0.05;
          break;
        }
      }

      // Update equipped tool visual and make it follow hand
      if (inv) {
        const currentTool = inv.equippedTool;
        if (currentTool !== state.lastTool) {
          state.lastTool = currentTool;
          attachToolMesh(object, currentTool as ItemType);
          // Cache tool mesh reference
          state.toolMesh = object.getObjectByName('equippedTool') as THREE.Group | null;
        }
        
        // Shield coexists with weapon
        const hasShield = countItem(inv, ItemType.Shield) > 0;
        if (hasShield !== state.lastShield) {
          state.lastShield = hasShield;
          attachShieldMesh(object, hasShield);
          // Cache shield mesh reference
          state.shieldMesh = object.getObjectByName('equippedShield') as THREE.Group | null;
        }
        
        // Make tool follow hand movement during animations
        // Tools are children of the group, so update their local position to match hand
        if (state.toolMesh && handR) {
          // Update tool position to follow hand (both are in group local space)
          state.toolMesh.position.copy(handR.position);
          state.toolMesh.position.y += 0.06; // Slight offset above hand
          
          // Rotate tool to match arm orientation if arm exists
          if (armR) {
            state.toolMesh.rotation.copy(armR.rotation);
            state.toolMesh.rotation.x -= 0.3; // Tool grip angle
          }
        }
        
        // Make shield follow left hand
        if (state.shieldMesh && handL) {
          state.shieldMesh.position.copy(handL.position);
          state.shieldMesh.position.y += 0.06;
          state.shieldMesh.position.x -= 0.04; // Offset to front of hand
          
          // Shield rotation matches arm
          if (armL) {
            state.shieldMesh.rotation.copy(armL.rotation);
            state.shieldMesh.rotation.x -= 0.2; // Shield angle
          }
        }
      }
    }
  }

  // Clean up dead entity animation states
  removeEntity(id: number): void {
    animStates.delete(id);
  }
}
