import * as THREE from 'three';
import { type CreatureGenome, EarType, BodyBuild } from '../genome/Genome';
import { ItemType } from '../components/Inventory';
import {
  createCreatureUniforms,
  applyCreatureShader,
  PART_BODY, PART_BELLY, PART_ACCENT, PART_EYE, PART_PUPIL, PART_MOUTH,
  type CreatureShaderUniforms,
} from './CreatureShader';

// Voxel chibi creature mesh builder.
// All parts use BoxGeometry for a blocky Minecraft-like look.
// 2-3 blocks tall, big chibi head, stubby limbs.
// Part names IDENTICAL to previous version so AnimationSystem/ExpressionSystem keep working.

const BLOCK = 0.5; // world units per "block"

export interface MeshBuildResult {
  group: THREE.Group;
  uniforms: CreatureShaderUniforms;
}

/** Tool color mapping for equipped tool visual */
const TOOL_COLORS: Partial<Record<ItemType, number>> = {
  [ItemType.StoneAxe]: 0x808080,
  [ItemType.StonePick]: 0x808080,
  [ItemType.MetalAxe]: 0xC0C0C0,
  [ItemType.MetalPick]: 0xC0C0C0,
  [ItemType.WoodSword]: 0x8B5A2B,
  [ItemType.StoneSword]: 0x696969,
  [ItemType.IronSword]: 0xD0D0D0,
  [ItemType.Shield]: 0x8B4513,
  [ItemType.Torch]: 0xFFCC33,
};

export function buildCreatureMesh(genome: CreatureGenome): MeshBuildResult {
  const group = new THREE.Group();
  const uniforms = createCreatureUniforms(genome);

  const sex = (genome as any).sex ?? 0;
  const dimorphism = (genome as any).dimorphism ?? 0;
  const displayIntensity = (genome as any).displayIntensity ?? 0.5;
  uniforms.u_sex.value = sex;

  const bodyColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS, genome.colorL);
  const bellyColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS * 0.6, genome.bellyColorL);
  const accentColor = new THREE.Color().setHSL(genome.accentH / 360, genome.colorS * 0.8, genome.colorL * 0.9);
  const eyeWhite = new THREE.Color(0xfafafa);
  const eyePupil = new THREE.Color(0x111111);
  const mouthColor = new THREE.Color().setHSL(0, 0.5, 0.35);

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.8, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.7, flatShading: true });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: eyeWhite, roughness: 0.3 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: eyePupil, roughness: 0.2 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: mouthColor, roughness: 0.5 });

  applyCreatureShader(bodyMat, uniforms, PART_BODY);
  applyCreatureShader(bellyMat, uniforms, PART_BELLY);
  applyCreatureShader(accentMat, uniforms, PART_ACCENT);
  applyCreatureShader(eyeWhiteMat, uniforms, PART_EYE);
  applyCreatureShader(eyePupilMat, uniforms, PART_PUPIL);
  applyCreatureShader(mouthMat, uniforms, PART_MOUTH);

  let scale = genome.bodyScale;
  if (sex === 0) scale *= 1 + dimorphism * 0.25;

  // Build-dependent body width
  const bodyW = genome.bodyBuild === BodyBuild.Stocky ? 0.45
              : genome.bodyBuild === BodyBuild.Slim ? 0.35
              : 0.40;

  // ── Head (big chibi head) ────────────────────────────
  const headSize = 0.45 * genome.headSize;
  const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.name = 'head';
  head.position.y = 1.12;
  head.castShadow = true;
  group.add(head);

  const headY = head.position.y;

  // ── Eyes (flat boxes on front face) ───────────────────
  let eyeW = 0.07;
  let eyeH = 0.05;
  if (sex === 1) { eyeW *= 1 + dimorphism * 0.2; eyeH *= 1 + dimorphism * 0.2; }

  const eyeSpread = genome.eyeSpacing * headSize * 0.35;

  for (const side of [-1, 1]) {
    const eyeGeo = new THREE.BoxGeometry(eyeW, eyeH, 0.01);
    const eye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eye.name = side < 0 ? 'eyeL' : 'eyeR';
    eye.position.set(side * eyeSpread, headY + headSize * 0.08, headSize * 0.5 + 0.006);
    group.add(eye);

    const pupilGeo = new THREE.BoxGeometry(eyeW * 0.5, eyeH * 0.5, 0.01);
    const pupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupil.name = side < 0 ? 'pupilL' : 'pupilR';
    pupil.position.set(side * eyeSpread, headY + headSize * 0.08, headSize * 0.5 + 0.012);
    group.add(pupil);
  }

  // ── Mouth (small flat box) ───────────────────────────
  const mouthGeo = new THREE.BoxGeometry(0.1, 0.02, 0.01);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.name = 'mouth';
  mouth.position.set(0, headY - headSize * 0.2, headSize * 0.5 + 0.006);
  group.add(mouth);

  // ── Ears (box-based) ─────────────────────────────────
  const earS = genome.earSize;
  for (const side of [-1, 1]) {
    const earX = side * (headSize * 0.5 + 0.01);
    const earY = headY + headSize * 0.15;

    switch (genome.earType) {
      case EarType.Pointy: {
        // Thin tall box
        const earGeo = new THREE.BoxGeometry(0.03, earS * 0.18, 0.03);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX, earY + earS * 0.09, 0);
        ear.rotation.z = side * -0.2;
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Floppy: {
        // Wide flat box hanging down
        const earGeo = new THREE.BoxGeometry(0.06, earS * 0.12, 0.03);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX * 1.1, earY - earS * 0.04, 0);
        ear.rotation.z = side * 0.4;
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Round: {
        // Small cube
        const earGeo = new THREE.BoxGeometry(earS * 0.08, earS * 0.08, earS * 0.06);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX * 1.05, earY + earS * 0.02, 0);
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Antennae: {
        // Stick (thin tall box) with tip
        const stalkGeo = new THREE.BoxGeometry(0.02, earS * 0.2, 0.02);
        const stalk = new THREE.Mesh(stalkGeo, bodyMat);
        stalk.name = side < 0 ? 'earL' : 'earR';
        stalk.position.set(earX * 0.6, earY + earS * 0.1, 0);
        stalk.rotation.z = side * -0.3;
        group.add(stalk);
        // Tip
        const tipGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const tip = new THREE.Mesh(tipGeo, accentMat);
        tip.position.set(earX * 0.6 + side * earS * 0.06, earY + earS * 0.2, 0);
        group.add(tip);
        break;
      }
    }
  }

  // ── Crest / Horn for high-display males ───────────
  if (sex === 0 && displayIntensity > 0.6) {
    const crestSize = displayIntensity * dimorphism * 0.1;
    if (crestSize > 0.02) {
      const crestGeo = new THREE.BoxGeometry(crestSize, crestSize * 2, crestSize);
      const crest = new THREE.Mesh(crestGeo, accentMat);
      crest.name = 'crest';
      crest.position.set(0, headY + headSize * 0.5, 0);
      crest.castShadow = true;
      group.add(crest);
    }
  }

  // ── Body (box torso) ─────────────────────────────────
  const torsoGeo = new THREE.BoxGeometry(bodyW, 0.4, 0.3);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.name = 'torso';
  torso.position.y = 0.65;
  torso.castShadow = true;
  group.add(torso);

  // Belly (slight protrusion on front)
  const bellyGeo = new THREE.BoxGeometry(bodyW * 0.7, 0.3, 0.08);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.name = 'belly';
  belly.position.set(0, 0.63, 0.19);
  group.add(belly);

  // ── Arms (boxes at body sides) ───────────────────────
  for (const side of [-1, 1]) {
    const shoulderX = side * (bodyW * 0.5 + 0.06);

    const armGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
    const arm = new THREE.Mesh(armGeo, bodyMat);
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(shoulderX, 0.6, 0);
    arm.castShadow = true;
    group.add(arm);

    const handGeo = new THREE.BoxGeometry(0.1, 0.07, 0.1);
    const hand = new THREE.Mesh(handGeo, accentMat);
    hand.name = side < 0 ? 'handL' : 'handR';
    hand.position.set(shoulderX, 0.4, 0);
    group.add(hand);
  }

  // ── Legs (boxes below body) ──────────────────────────
  for (const side of [-1, 1]) {
    const hipX = side * (bodyW * 0.25);

    const legGeo = new THREE.BoxGeometry(0.14, 0.25, 0.14);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(hipX, 0.3, 0);
    leg.castShadow = true;
    group.add(leg);

    const footGeo = new THREE.BoxGeometry(0.16, 0.05, 0.2);
    const foot = new THREE.Mesh(footGeo, accentMat);
    foot.name = side < 0 ? 'footL' : 'footR';
    foot.position.set(hipX, 0.15, 0.03);
    group.add(foot);
  }

  // Scale and position
  group.scale.setScalar(scale);

  // Ground offset so feet touch y=0
  const lowestPoint = 0.125 * scale; // bottom of feet at 0.15 - 0.025
  group.position.y = -lowestPoint;

  return { group, uniforms };
}

/** Attach a small colored box to the right hand representing equipped tool/weapon */
export function attachToolMesh(group: THREE.Group, toolType: ItemType): void {
  // Remove existing tool mesh
  const existing = group.getObjectByName('equippedTool');
  if (existing) group.remove(existing);

  if (toolType === ItemType.None) return;

  const color = TOOL_COLORS[toolType] ?? 0x888888;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });

  // Find handR position
  const handR = group.getObjectByName('handR');
  if (!handR) return;

  const toolGeo = new THREE.BoxGeometry(0.04, 0.15, 0.04);
  const toolMesh = new THREE.Mesh(toolGeo, mat);
  toolMesh.name = 'equippedTool';
  toolMesh.position.copy(handR.position);
  toolMesh.position.y += 0.06;
  group.add(toolMesh);
}
