import * as THREE from 'three';
import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { GenomeStore } from '../components/Genome';
import { BiochemStore } from '../components/Biochemistry';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { RenderableStore } from '../components/Renderable';
import { ShaderStateStore } from '../components/ShaderState';
import { ExpressionStore, type ExpressionData, type ExpressionMeshRefs } from '../components/Expression';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { clamp, lerp } from '../utils/Math';

const LERP_SPEED = 0.05;

function findMesh(group: THREE.Group, name: string): THREE.Mesh | null {
  for (const child of group.children) {
    if (child.name === name && child instanceof THREE.Mesh) return child;
  }
  return null;
}

function initMeshRefs(group: THREE.Group): ExpressionMeshRefs | null {
  const head = findMesh(group, 'head');
  const eyeL = findMesh(group, 'eyeL');
  const eyeR = findMesh(group, 'eyeR');
  const pupilL = findMesh(group, 'pupilL');
  const pupilR = findMesh(group, 'pupilR');
  const mouth = findMesh(group, 'mouth');
  const torso = findMesh(group, 'torso');

  if (!head || !eyeL || !eyeR || !pupilL || !pupilR || !mouth || !torso) return null;

  return {
    head, eyeL, eyeR, pupilL, pupilR, mouth, torso, group,
    origEyeLScaleY: eyeL.scale.y,
    origEyeRScaleY: eyeR.scale.y,
    origPupilLScale: pupilL.scale.x,
    origPupilRScale: pupilR.scale.x,
    origMouthScaleX: mouth.scale.x,
    origMouthScaleY: mouth.scale.y,
    origHeadY: head.position.y,
    origHeadRotZ: head.rotation.z,
  };
}

export class ExpressionSystem extends System {
  readonly query = ExpressionStore.bit | BiochemStore.bit | GenomeStore.bit | RenderableStore.bit | LifecycleStore.bit;
  readonly priority = 92;

  update(world: World, _dt: number): void {
    const entities = world.query(this.query);

    for (const id of entities) {
      const lifecycle = LifecycleStore.get(id)!;
      if (lifecycle.stage === LifeStage.Dead) continue;

      const expr = ExpressionStore.get(id)!;
      const { chemicals } = BiochemStore.get(id)!;
      const { genome } = GenomeStore.get(id)!;
      const social = SocialStore.get(id);
      const renderable = RenderableStore.get(id)!;

      // Derive emotions from biochemistry
      const health = social?.health ?? 1;
      const targetHappiness = clamp(chemicals[ChemId.Reward] * 2 - chemicals[ChemId.Pain] - chemicals[ChemId.Punishment], 0, 1);
      const targetFear = clamp(chemicals[ChemId.Punishment] * 1.5 + (1 - health) - chemicals[ChemId.Reward], 0, 1);
      const targetAnger = clamp(genome.aggression * chemicals[ChemId.Pain] + genome.aggression * chemicals[ChemId.Hunger] * 0.5, 0, 1);
      const targetCuriosity = clamp(genome.curiosity * (1 - chemicals[ChemId.Hunger]) * (1 - chemicals[ChemId.Tiredness]), 0, 1);
      const targetTiredness = chemicals[ChemId.Tiredness];
      const targetPain = chemicals[ChemId.Pain];

      // Smooth transitions
      expr.happiness = lerp(expr.happiness, targetHappiness, LERP_SPEED);
      expr.fear = lerp(expr.fear, targetFear, LERP_SPEED);
      expr.anger = lerp(expr.anger, targetAnger, LERP_SPEED);
      expr.curiosity = lerp(expr.curiosity, targetCuriosity, LERP_SPEED);
      expr.tiredness = lerp(expr.tiredness, targetTiredness, LERP_SPEED);
      expr.pain = lerp(expr.pain, targetPain, LERP_SPEED);

      // Update shader emotion uniform
      const shaderState = ShaderStateStore.get(id);
      if (shaderState) {
        shaderState.uniforms.u_emotion.value.set(
          expr.happiness, expr.fear, expr.anger, expr.curiosity,
        );
      }

      // Init mesh refs if needed
      const group = renderable.object as THREE.Group;
      if (!expr.meshRefs) {
        expr.meshRefs = initMeshRefs(group);
        if (!expr.meshRefs) continue;
      }

      const m = expr.meshRefs;
      applyExpressions(expr, m);
    }
  }
}

function applyExpressions(expr: ExpressionData, m: ExpressionMeshRefs): void {
  // Find dominant emotion
  const emotions = [
    { name: 'happy', val: expr.happiness },
    { name: 'fear', val: expr.fear },
    { name: 'anger', val: expr.anger },
    { name: 'curious', val: expr.curiosity },
    { name: 'tired', val: expr.tiredness },
    { name: 'pain', val: expr.pain },
  ];
  emotions.sort((a, b) => b.val - a.val);
  const dominant = emotions[0];
  const intensity = dominant.val;

  // Reset toward defaults
  const resetLerp = 0.05;
  m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY, resetLerp);
  m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY, resetLerp);
  m.pupilL.scale.setScalar(lerp(m.pupilL.scale.x, m.origPupilLScale, resetLerp));
  m.pupilR.scale.setScalar(lerp(m.pupilR.scale.x, m.origPupilRScale, resetLerp));
  m.mouth.scale.x = lerp(m.mouth.scale.x, m.origMouthScaleX, resetLerp);
  m.mouth.scale.y = lerp(m.mouth.scale.y, m.origMouthScaleY, resetLerp);
  m.head.rotation.z = lerp(m.head.rotation.z, m.origHeadRotZ, resetLerp);
  m.head.position.y = lerp(m.head.position.y, m.origHeadY, resetLerp);

  if (intensity < 0.05) return;

  switch (dominant.name) {
    case 'happy': {
      // Squint eyes, wider mouth
      const t = intensity;
      m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY * 0.85, t);
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 0.85, t);
      m.mouth.scale.x = lerp(m.mouth.scale.x, m.origMouthScaleX * 1.2, t);
      break;
    }
    case 'fear': {
      // Wide eyes, shrink pupils, mouth tall O, duck head, crouch
      const t = intensity;
      m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY * 1.3, t);
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 1.3, t);
      m.pupilL.scale.setScalar(lerp(m.pupilL.scale.x, m.origPupilLScale * 0.7, t));
      m.pupilR.scale.setScalar(lerp(m.pupilR.scale.x, m.origPupilRScale * 0.7, t));
      m.mouth.scale.y = lerp(m.mouth.scale.y, m.origMouthScaleY * 2.0, t);
      m.head.position.y = lerp(m.head.position.y, m.origHeadY - 0.02 * t, t);
      break;
    }
    case 'anger': {
      // Narrow eyes, dilate pupils, wide mouth, head thrust, puff up
      const t = intensity;
      m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY * 0.7, t);
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 0.7, t);
      m.pupilL.scale.setScalar(lerp(m.pupilL.scale.x, m.origPupilLScale * 1.2, t));
      m.pupilR.scale.setScalar(lerp(m.pupilR.scale.x, m.origPupilRScale * 1.2, t));
      m.mouth.scale.x = lerp(m.mouth.scale.x, m.origMouthScaleX * 1.1, t);
      break;
    }
    case 'curious': {
      // One eye wider, head tilt
      const t = intensity;
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 1.15, t);
      m.head.rotation.z = lerp(m.head.rotation.z, 0.15 * t, t);
      break;
    }
    case 'tired': {
      // Droopy eyes, head droop
      const t = intensity;
      m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY * 0.5, t);
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 0.5, t);
      m.head.rotation.x = lerp(m.head.rotation.x, 0.1 * t, t);
      break;
    }
    case 'pain': {
      // Eyes squeeze shut, asymmetric mouth
      const t = intensity;
      m.eyeL.scale.y = lerp(m.eyeL.scale.y, m.origEyeLScaleY * 0.3, t);
      m.eyeR.scale.y = lerp(m.eyeR.scale.y, m.origEyeRScaleY * 0.3, t);
      m.mouth.rotation.z = lerp(m.mouth.rotation.z, 0.1 * t, t);
      break;
    }
  }
}
