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

// Shared materials for tools (reused across all creatures)
const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.8, flatShading: true });
const STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.6, flatShading: true });
const METAL_MAT = new THREE.MeshStandardMaterial({ color: 0xC0C0C0, roughness: 0.4, flatShading: true });
const WOOD_BLADE_MAT = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.7, flatShading: true });
const IRON_MAT = new THREE.MeshStandardMaterial({ color: 0xD0D0D0, roughness: 0.35, flatShading: true });
const SHIELD_MAT = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6, flatShading: true });
const FLAME_MAT = new THREE.MeshStandardMaterial({ color: 0xFF8800, emissive: 0xFF6600, emissiveIntensity: 1.5, roughness: 0.9, flatShading: true });

function buildToolMesh(toolType: ItemType): THREE.Group {
  const tool = new THREE.Group();

  switch (toolType) {
    case ItemType.StoneAxe:
    case ItemType.MetalAxe: {
      const bladeMat = toolType === ItemType.MetalAxe ? METAL_MAT : STONE_MAT;
      // Handle
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), HANDLE_MAT);
      handle.position.y = 0;
      tool.add(handle);
      // Blade offset to side at top
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), bladeMat);
      blade.position.set(0.05, 0.09, 0);
      tool.add(blade);
      tool.rotation.x = -0.3;
      break;
    }
    case ItemType.StonePick:
    case ItemType.MetalPick: {
      const headMat = toolType === ItemType.MetalPick ? METAL_MAT : STONE_MAT;
      // Handle
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), HANDLE_MAT);
      tool.add(handle);
      // Horizontal head (T-shape)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), headMat);
      head.position.y = 0.1;
      tool.add(head);
      // Left point
      const ptL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.02), headMat);
      ptL.position.set(-0.06, 0.08, 0);
      ptL.rotation.z = 0.4;
      tool.add(ptL);
      // Right point
      const ptR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.02), headMat);
      ptR.position.set(0.06, 0.08, 0);
      ptR.rotation.z = -0.4;
      tool.add(ptR);
      tool.rotation.x = -0.3;
      break;
    }
    case ItemType.WoodSword: {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), HANDLE_MAT);
      handle.position.y = -0.03;
      tool.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), HANDLE_MAT);
      guard.position.y = 0.01;
      tool.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), WOOD_BLADE_MAT);
      blade.position.y = 0.12;
      tool.add(blade);
      break;
    }
    case ItemType.StoneSword: {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), HANDLE_MAT);
      handle.position.y = -0.03;
      tool.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), STONE_MAT);
      guard.position.y = 0.01;
      tool.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), STONE_MAT);
      blade.position.y = 0.12;
      tool.add(blade);
      break;
    }
    case ItemType.IronSword: {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), HANDLE_MAT);
      handle.position.y = -0.03;
      tool.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), IRON_MAT);
      guard.position.y = 0.01;
      tool.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), IRON_MAT);
      blade.position.y = 0.13;
      tool.add(blade);
      break;
    }
    case ItemType.Torch: {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.18, 0.025), HANDLE_MAT);
      tool.add(stick);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), FLAME_MAT);
      flame.position.y = 0.12;
      tool.add(flame);
      const light = new THREE.PointLight(0xFFAA33, 0.3, 3);
      light.position.y = 0.14;
      tool.add(light);
      break;
    }
    case ItemType.Shield: {
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.02), SHIELD_MAT);
      tool.add(face);
      // Metal rim accent
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.025), METAL_MAT);
      rim.position.z = 0.005;
      tool.add(rim);
      tool.rotation.x = -0.2;
      break;
    }
    default: {
      // Fallback: simple colored box
      const color = TOOL_COLORS[toolType] ?? 0x888888;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.04), mat);
      tool.add(mesh);
      break;
    }
  }

  return tool;
}

/** Attach tool mesh to creature's hand. Shield goes on left hand, weapons on right. */
export function attachToolMesh(group: THREE.Group, toolType: ItemType): void {
  // Remove existing tool mesh (but not shield)
  const existing = group.getObjectByName('equippedTool');
  if (existing) group.remove(existing);

  if (toolType === ItemType.None) return;

  // Shield goes on left hand
  if (toolType === ItemType.Shield) {
    // Remove old shield if any
    const oldShield = group.getObjectByName('equippedShield');
    if (oldShield) group.remove(oldShield);

    const handL = group.getObjectByName('handL');
    if (!handL) return;
    const shieldGroup = buildToolMesh(ItemType.Shield);
    shieldGroup.name = 'equippedShield';
    shieldGroup.position.copy(handL.position);
    shieldGroup.position.y += 0.06;
    shieldGroup.position.x -= 0.04;
    group.add(shieldGroup);
    return;
  }

  const handR = group.getObjectByName('handR');
  if (!handR) return;

  const toolGroup = buildToolMesh(toolType);
  toolGroup.name = 'equippedTool';
  toolGroup.position.copy(handR.position);
  toolGroup.position.y += 0.06;
  group.add(toolGroup);
}

/** Attach or remove shield independently of main weapon */
export function attachShieldMesh(group: THREE.Group, hasShield: boolean): void {
  const oldShield = group.getObjectByName('equippedShield');
  if (oldShield) group.remove(oldShield);

  if (!hasShield) return;

  const handL = group.getObjectByName('handL');
  if (!handL) return;

  const shieldGroup = buildToolMesh(ItemType.Shield);
  shieldGroup.name = 'equippedShield';
  shieldGroup.position.copy(handL.position);
  shieldGroup.position.y += 0.06;
  shieldGroup.position.x -= 0.04;
  group.add(shieldGroup);
}
