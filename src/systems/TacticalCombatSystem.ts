// TacticalCombatSystem: orchestrates tactical combat using per-creature CombatNet.
// Priority 56: after Sensory (10), before Gathering (57).
// Detects combat state, populates net inputs, applies outputs to motor/behavior.

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { SensesStore } from '../components/Senses';
import { SocialStore, Activity } from '../components/Social';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { InventoryStore, getBestWeapon, getArmorReduction, countItem, ItemType } from '../components/Inventory';
import { CombatStore, type CombatData } from '../components/Combat';
import { combatNetForward, combatNetLearn, CombatOutput, COMBAT_INPUT_COUNT } from '../brain/CombatNet';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp } from '../utils/Math';
import type { MonsterManager } from '../world/MonsterManager';
import type { DayNightState } from '../world/DayNightCycle';
import type { FactionManager } from '../world/FactionSystem';

const COMBAT_ENTER_THREAT = 0.3;
const COMBAT_EXIT_TICKS = 30;
const ALLY_NEAR_RANGE = 8;
const ALLY_FAR_RANGE = 20;
const ENEMY_NEAR_RANGE = 8;
const ENEMY_FAR_RANGE = 20;

export class TacticalCombatSystem extends System {
  readonly query = CombatStore.bit | SensesStore.bit | TransformStore.bit;
  readonly priority = 56;

  monsterManager: MonsterManager | null = null;
  dayNight: DayNightState | null = null;
  factionManager: FactionManager | null = null;

  private inputBuffer = new Float32Array(COMBAT_INPUT_COUNT);

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    // Pre-gather creature positions and factions for spatial queries
    const aliveCreatures: number[] = [];
    const positions: { x: number; z: number; factionId: number; health: number; id: number }[] = [];

    for (const id of entities) {
      const lc = LifecycleStore.get(id);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const t = TransformStore.get(id)!;
      const s = SocialStore.get(id);
      aliveCreatures.push(id);
      positions.push({
        x: t.x, z: t.z,
        factionId: s?.factionId ?? -1,
        health: s?.health ?? 1,
        id,
      });
    }

    for (let ci = 0; ci < aliveCreatures.length; ci++) {
      const id = aliveCreatures[ci];
      const combat = CombatStore.get(id)!;
      const senses = SensesStore.get(id)!;
      const transform = TransformStore.get(id)!;
      const social = SocialStore.get(id);
      const biochem = BiochemStore.get(id);
      const motor = MotorStore.get(id);
      const inv = InventoryStore.get(id);

      if (!social || !biochem || !motor) continue;

      // Decay recent damage
      combat.recentDamage *= 0.95;

      // Detect combat entry
      const hasHostileNearby = senses.threatLevel > COMBAT_ENTER_THREAT;
      const hasEnemyCreature = this.hasHostileCreatureNearby(
        id, social.factionId, transform.x, transform.z, positions,
      );

      if (hasHostileNearby || hasEnemyCreature) {
        if (!combat.inCombat) {
          // Enter combat
          combat.inCombat = true;
          combat.combatTicks = 0;
          combat.startHealth = social.health;
          combat.combatReward = 0;
        }
        combat.noCombatTicks = 0;
      } else if (combat.inCombat) {
        combat.noCombatTicks++;
        if (combat.noCombatTicks >= COMBAT_EXIT_TICKS) {
          // Exit combat — learn from encounter
          this.endCombat(combat, social);
          continue;
        }
      }

      if (!combat.inCombat) continue;

      combat.combatTicks++;

      // Populate 16 inputs
      const inputs = this.inputBuffer;
      this.populateInputs(
        inputs, id, social, transform, senses, biochem, inv, combat, positions,
      );

      // Forward pass
      combatNetForward(combat.net, inputs);
      const out = combat.net.outputs;

      // Apply outputs to motor/behavior
      this.applyOutputs(out, id, social, transform, motor, combat, inv, positions);
    }
  }

  private hasHostileCreatureNearby(
    id: number, myFaction: number, x: number, z: number,
    positions: { x: number; z: number; factionId: number; id: number }[],
  ): boolean {
    for (const p of positions) {
      if (p.id === id || p.factionId === myFaction) continue;
      if (!this.factionManager) continue;
      const relation = this.factionManager.getRelation(myFaction, p.factionId);
      if (relation >= -0.3) continue; // not hostile

      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < 100) return true; // within 10 units
    }
    return false;
  }

  private populateInputs(
    inputs: Float32Array,
    id: number,
    social: { factionId: number; health: number },
    transform: { x: number; z: number; rotation: number },
    senses: any,
    biochem: { chemicals: Float32Array },
    inv: any,
    combat: CombatData,
    positions: { x: number; z: number; factionId: number; health: number; id: number }[],
  ): void {
    let allyNear = 0, allyFar = 0, enemyNear = 0, enemyFar = 0;
    let allyHealthSum = 0, allyHealthCount = 0;
    let nearestEnemyDist = 999, nearestAllyDist = 999;

    for (const p of positions) {
      if (p.id === id) continue;
      const dx = p.x - transform.x;
      const dz = p.z - transform.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (p.factionId === social.factionId) {
        // Ally
        if (dist < ALLY_NEAR_RANGE) { allyNear++; allyHealthSum += p.health; allyHealthCount++; }
        else if (dist < ALLY_FAR_RANGE) allyFar++;
        if (dist < nearestAllyDist) nearestAllyDist = dist;
      } else {
        // Check if hostile
        const relation = this.factionManager?.getRelation(social.factionId, p.factionId) ?? 0;
        if (relation < -0.3) {
          if (dist < ENEMY_NEAR_RANGE) enemyNear++;
          else if (dist < ENEMY_FAR_RANGE) enemyFar++;
          if (dist < nearestEnemyDist) nearestEnemyDist = dist;
        }
      }
    }

    // Count nearby monsters as enemies too
    let monsterCount = 0;
    if (this.monsterManager) {
      const mm = this.monsterManager as any;
      for (let mi = 0; mi < mm.count; mi++) {
        if (!mm.alive[mi]) continue;
        const dx = mm.x[mi] - transform.x;
        const dz = mm.z[mi] - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < ENEMY_NEAR_RANGE) { enemyNear++; monsterCount++; }
        else if (dist < ENEMY_FAR_RANGE) enemyFar++;
        if (dist < nearestEnemyDist) nearestEnemyDist = dist;
      }
    }

    // Terrain defense: count nearby walls/buildings
    let terrainDefense = 0;
    if (senses.buildingVisible && senses.nearestBuildingDist < 0.3) terrainDefense += 1;
    if (senses.nearbyFactionCount > 0) terrainDefense += 0.5;

    inputs[0] = clamp(allyNear / 5, 0, 1);
    inputs[1] = clamp(allyFar / 10, 0, 1);
    inputs[2] = clamp(enemyNear / 5, 0, 1);
    inputs[3] = clamp(enemyFar / 10, 0, 1);
    inputs[4] = social.health;
    inputs[5] = inv ? clamp(getBestWeapon(inv).damage / 2.5, 0, 1) : 0;
    inputs[6] = inv ? getArmorReduction(inv) : 0;
    inputs[7] = allyHealthCount > 0 ? allyHealthSum / allyHealthCount : 0;
    inputs[8] = 1 - clamp(nearestEnemyDist / 20, 0, 1);
    inputs[9] = 1 - clamp(nearestAllyDist / 20, 0, 1);
    inputs[10] = senses.threatLevel;
    inputs[11] = biochem.chemicals[ChemId.Energy];
    inputs[12] = clamp(terrainDefense / 3, 0, 1);
    inputs[13] = this.dayNight ? Math.sin(this.dayNight.timeOfDay * Math.PI * 2) * 0.5 + 0.5 : 0.5;
    inputs[14] = clamp(combat.recentDamage, 0, 1);
    inputs[15] = clamp(monsterCount / 5, 0, 1);
  }

  private applyOutputs(
    out: Float32Array,
    id: number,
    social: { factionId: number; health: number; attackTarget: number; activity: Activity },
    transform: { x: number; z: number; rotation: number },
    motor: { forward: number; turnLeft: number; turnRight: number; wantFightMonster: boolean },
    combat: CombatData,
    inv: any,
    positions: { x: number; z: number; factionId: number; health: number; id: number }[],
  ): void {
    const formation = out[CombatOutput.Formation];
    const targetPriority = out[CombatOutput.TargetPriority];
    const retreatThreshold = out[CombatOutput.RetreatThreshold];
    const aggression = out[CombatOutput.Aggression];
    const assistAlly = out[CombatOutput.AssistAlly];
    const flank = out[CombatOutput.Flank];
    const holdPosition = out[CombatOutput.HoldPosition];
    const callForHelp = out[CombatOutput.CallForHelp];

    combat.callingForHelp = callForHelp > 0.5;

    // Retreat check
    if (social.health < retreatThreshold) {
      // Flee toward nearest shelter or away from enemies
      motor.forward = 1.5;
      motor.wantFightMonster = false;
      social.activity = Activity.Walking;
      // Turn away from nearest enemy
      let nearestEX = 0, nearestEZ = 0, nearestDist = 999;
      for (const p of positions) {
        if (p.id === id || p.factionId === social.factionId) continue;
        const dx = p.x - transform.x;
        const dz = p.z - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) { nearestDist = dist; nearestEX = dx; nearestEZ = dz; }
      }
      if (nearestDist < 999) {
        // Run opposite direction
        const fleeAngle = Math.atan2(-nearestEX, -nearestEZ);
        let relAngle = fleeAngle - transform.rotation;
        while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
        while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
        if (relAngle < -0.1) motor.turnLeft += 0.8;
        else if (relAngle > 0.1) motor.turnRight += 0.8;
      }
      return;
    }

    // Target selection
    let targetId = -1;
    let targetX = 0, targetZ = 0;

    if (assistAlly > 0.5) {
      // Find wounded ally and target their enemy
      for (const p of positions) {
        if (p.id === id || p.factionId !== social.factionId) continue;
        const dx = p.x - transform.x;
        const dz = p.z - transform.z;
        if (dx * dx + dz * dz > 100) continue; // within 10u
        if (p.health < 0.3) {
          // Find enemy near this ally
          const allyCombat = CombatStore.get(p.id);
          if (allyCombat?.callingForHelp) {
            // Target nearest enemy to the ally
            let bestDist = 999;
            for (const e of positions) {
              if (e.factionId === social.factionId) continue;
              const edx = e.x - p.x;
              const edz = e.z - p.z;
              const eDist = Math.sqrt(edx * edx + edz * edz);
              if (eDist < bestDist) {
                bestDist = eDist;
                targetId = e.id;
                targetX = e.x;
                targetZ = e.z;
              }
            }
            break;
          }
        }
      }
    }

    // If no assist target, pick based on priority
    if (targetId < 0) {
      let bestScore = -999;
      for (const p of positions) {
        if (p.id === id || p.factionId === social.factionId) continue;
        const relation = this.factionManager?.getRelation(social.factionId, p.factionId) ?? 0;
        if (relation >= -0.3) continue;

        const dx = p.x - transform.x;
        const dz = p.z - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 20) continue;

        let score: number;
        if (targetPriority < 0.33) {
          score = -dist; // nearest
        } else if (targetPriority < 0.66) {
          score = -p.health; // weakest
        } else {
          score = p.health; // strongest (brave/territorial)
        }

        if (score > bestScore) {
          bestScore = score;
          targetId = p.id;
          targetX = p.x;
          targetZ = p.z;
        }
      }
    }

    // Movement toward target
    if (targetId >= 0) {
      social.attackTarget = targetId;
      social.activity = Activity.Fighting;
      motor.wantFightMonster = true; // enables monster fight too

      let dx = targetX - transform.x;
      let dz = targetZ - transform.z;

      // Flanking: offset movement angle
      if (flank > 0.3) {
        const offsetAngle = flank > 0.5 ? Math.PI / 4 : -Math.PI / 4;
        const cos = Math.cos(offsetAngle);
        const sin = Math.sin(offsetAngle);
        const ndx = dx * cos - dz * sin;
        const ndz = dx * sin + dz * cos;
        dx = ndx;
        dz = ndz;
      }

      const targetAngle = Math.atan2(dx, dz);
      let relAngle = targetAngle - transform.rotation;
      while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
      while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

      if (relAngle < -0.1) motor.turnLeft += 0.6;
      else if (relAngle > 0.1) motor.turnRight += 0.6;

      // Hold position reduces forward speed
      if (holdPosition > 0.5) {
        motor.forward = Math.max(motor.forward, 0.2);
      } else {
        motor.forward = Math.max(motor.forward, 0.5 + aggression * 1.0);
      }
    }

    // Formation: move toward/away from ally centroid
    if (formation > 0.6) {
      // Tight: cluster toward allies
      let cx = 0, cz = 0, count = 0;
      for (const p of positions) {
        if (p.id === id || p.factionId !== social.factionId) continue;
        const dx = p.x - transform.x;
        const dz = p.z - transform.z;
        if (dx * dx + dz * dz < 100) {
          cx += p.x;
          cz += p.z;
          count++;
        }
      }
      if (count > 0) {
        cx /= count;
        cz /= count;
        const dx = cx - transform.x;
        const dz = cz - transform.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2) {
          const angle = Math.atan2(dx, dz);
          let relAngle = angle - transform.rotation;
          while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
          while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
          if (relAngle < -0.1) motor.turnLeft += 0.2;
          else if (relAngle > 0.1) motor.turnRight += 0.2;
          motor.forward = Math.max(motor.forward, 0.3);
        }
      }
    }
  }

  private endCombat(combat: CombatData, social: { health: number }): void {
    // Compute reward
    let reward = 0;
    if (social.health <= 0) {
      reward = -1; // died
    } else {
      reward += 0.5; // survived
      const damageTaken = combat.startHealth - social.health;
      if (damageTaken > 0.3) reward -= 0.5; // took heavy damage
      if (social.health > 0.7) reward += 0.3; // healthy survival
    }
    reward += combat.combatReward;

    // Learn
    combatNetLearn(combat.net, clamp(reward, -1, 1));

    // Reset combat state
    combat.inCombat = false;
    combat.combatTicks = 0;
    combat.noCombatTicks = 0;
    combat.combatReward = 0;
    combat.callingForHelp = false;
  }
}
