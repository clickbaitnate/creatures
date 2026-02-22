import * as THREE from 'three';
import { type CreatureGenome, EarType, BodyBuild } from '../genome/Genome';
import {
  createCreatureUniforms,
  applyCreatureShader,
  PART_BODY, PART_BELLY, PART_ACCENT, PART_EYE, PART_PUPIL, PART_MOUTH,
  type CreatureShaderUniforms,
} from './CreatureShader';

// Humanoid creature mesh builder.
// N64-style low-poly bipedal figures with genome-driven proportions,
// flat shading, breed-specific shaders, and sexual dimorphism.

export interface MeshBuildResult {
  group: THREE.Group;
  uniforms: CreatureShaderUniforms;
}

export function buildCreatureMesh(genome: CreatureGenome): MeshBuildResult {
  const group = new THREE.Group();
  const uniforms = createCreatureUniforms(genome);

  // Sex-related dimorphism (defaults if sex fields not present)
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

  // Flat shading on body parts for N64 feel
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.8, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.7, flatShading: true });
  // Eyes, pupils, mouth keep smooth shading for readability
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: eyeWhite, roughness: 0.3 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: eyePupil, roughness: 0.2 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: mouthColor, roughness: 0.5 });

  // Apply creature shaders to all materials
  applyCreatureShader(bodyMat, uniforms, PART_BODY);
  applyCreatureShader(bellyMat, uniforms, PART_BELLY);
  applyCreatureShader(accentMat, uniforms, PART_ACCENT);
  applyCreatureShader(eyeWhiteMat, uniforms, PART_EYE);
  applyCreatureShader(eyePupilMat, uniforms, PART_PUPIL);
  applyCreatureShader(mouthMat, uniforms, PART_MOUTH);

  let scale = genome.bodyScale;
  // Dimorphism: males bigger, females rounder eyes
  if (sex === 0) {
    scale *= 1 + dimorphism * 0.25;
  }

  // Build widths
  const torsoW = genome.bodyBuild === BodyBuild.Stocky ? 0.28
               : genome.bodyBuild === BodyBuild.Slim ? 0.18
               : 0.22;
  const torsoH = 0.35;
  const torsoD = torsoW * 0.8;

  // ── Torso ───────────────────────────────────────
  const torsoGeo = new THREE.CapsuleGeometry(torsoW, torsoH, 4, 5);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.name = 'torso';
  torso.position.y = 0.55;
  torso.castShadow = true;
  group.add(torso);

  // Belly patch
  const bellyGeo = new THREE.SphereGeometry(torsoW * 0.7, 5, 4);
  bellyGeo.scale(0.8, 0.9, 0.5);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.name = 'belly';
  belly.position.set(0, 0.5, torsoD * 0.5);
  group.add(belly);

  // ── Head ────────────────────────────────────────
  const headR = 0.18 * genome.headSize;
  const headGeo = new THREE.SphereGeometry(headR, 6, 5);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.name = 'head';
  head.position.y = 0.55 + torsoH * 0.5 + headR + 0.02;
  head.castShadow = true;
  group.add(head);

  const headY = head.position.y;

  // ── Eyes ─────────────────────────────────────────
  let eyeR = genome.eyeSize * 0.08;
  // Females with high dimorphism get larger eyes
  if (sex === 1) eyeR *= 1 + dimorphism * 0.3;

  const eyeSpread = genome.eyeSpacing * headR * 0.65;

  for (const side of [-1, 1]) {
    const whiteGeo = new THREE.SphereGeometry(eyeR, 8, 6);
    const eye = new THREE.Mesh(whiteGeo, eyeWhiteMat);
    eye.name = side < 0 ? 'eyeL' : 'eyeR';
    eye.position.set(side * eyeSpread, headY + headR * 0.15, headR * 0.85);
    group.add(eye);

    const pupilGeo = new THREE.SphereGeometry(eyeR * 0.5, 6, 6);
    const pupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupil.name = side < 0 ? 'pupilL' : 'pupilR';
    pupil.position.set(side * eyeSpread, headY + headR * 0.15, headR * 0.85 + eyeR * 0.55);
    group.add(pupil);
  }

  // ── Mouth ───────────────────────────────────────
  const mouthGeo = new THREE.BoxGeometry(headR * 0.5, 0.015, 0.02);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.name = 'mouth';
  mouth.position.set(0, headY - headR * 0.35, headR * 0.9);
  group.add(mouth);

  // ── Ears ─────────────────────────────────────────
  const earS = genome.earSize;

  for (const side of [-1, 1]) {
    const earX = side * (headR * 0.9);
    const earY = headY + headR * 0.2;

    switch (genome.earType) {
      case EarType.Pointy: {
        const earGeo = new THREE.ConeGeometry(earS * 0.06, earS * 0.2, 4);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX, earY + earS * 0.1, 0);
        ear.rotation.z = side * -0.3;
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Floppy: {
        const earGeo = new THREE.SphereGeometry(earS * 0.07, 4, 4);
        earGeo.scale(0.5, 1.3, 0.7);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX * 1.15, earY - earS * 0.05, 0);
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Round: {
        const earGeo = new THREE.SphereGeometry(earS * 0.08, 5, 4);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.name = side < 0 ? 'earL' : 'earR';
        ear.position.set(earX * 1.1, earY + earS * 0.04, 0);
        ear.castShadow = true;
        group.add(ear);
        const innerGeo = new THREE.SphereGeometry(earS * 0.05, 4, 4);
        const inner = new THREE.Mesh(innerGeo, accentMat);
        inner.position.set(earX * 1.1, earY + earS * 0.04, 0.01);
        group.add(inner);
        break;
      }
      case EarType.Antennae: {
        const stalkGeo = new THREE.CylinderGeometry(0.01, 0.01, earS * 0.2, 3);
        const stalk = new THREE.Mesh(stalkGeo, bodyMat);
        stalk.name = side < 0 ? 'earL' : 'earR';
        stalk.position.set(earX * 0.5, earY + earS * 0.12, 0);
        stalk.rotation.z = side * -0.4;
        group.add(stalk);
        const tipGeo = new THREE.SphereGeometry(earS * 0.04, 4, 4);
        const tip = new THREE.Mesh(tipGeo, accentMat);
        tip.position.set(earX * 0.5 + side * earS * 0.08, earY + earS * 0.22, 0);
        group.add(tip);
        break;
      }
    }
  }

  // ── Crest / Horn for high-display males ───────────
  if (sex === 0 && displayIntensity > 0.6) {
    const crestSize = displayIntensity * dimorphism * 0.12;
    if (crestSize > 0.02) {
      const crestGeo = new THREE.ConeGeometry(crestSize, crestSize * 2.5, 4);
      const crest = new THREE.Mesh(crestGeo, accentMat);
      crest.name = 'crest';
      crest.position.set(0, headY + headR * 0.8, 0);
      crest.castShadow = true;
      group.add(crest);
    }
  }

  // ── Arms ────────────────────────────────────────
  const armL = genome.armLength * 0.25;
  const armW = 0.04;

  for (const side of [-1, 1]) {
    const shoulderX = side * (torsoW + 0.02);
    const shoulderY = 0.55 + torsoH * 0.3;

    const upperGeo = new THREE.CapsuleGeometry(armW, armL * 0.5, 3, 4);
    const upper = new THREE.Mesh(upperGeo, bodyMat);
    upper.name = side < 0 ? 'armL' : 'armR';
    upper.position.set(shoulderX, shoulderY - armL * 0.15, 0);
    upper.rotation.z = side * 0.15;
    upper.castShadow = true;
    group.add(upper);

    const handGeo = new THREE.SphereGeometry(armW * 1.4, 4, 4);
    const hand = new THREE.Mesh(handGeo, accentMat);
    hand.name = side < 0 ? 'handL' : 'handR';
    hand.position.set(shoulderX + side * 0.02, shoulderY - armL * 0.55, 0);
    group.add(hand);
  }

  // ── Legs ────────────────────────────────────────
  const legLen = genome.legLength * 0.25;
  const legW = 0.05;

  for (const side of [-1, 1]) {
    const hipX = side * (torsoW * 0.45);
    const hipY = 0.55 - torsoH * 0.5;

    const legGeo = new THREE.CapsuleGeometry(legW, legLen, 3, 4);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(hipX, hipY - legLen * 0.4, 0);
    leg.castShadow = true;
    group.add(leg);

    const footGeo = new THREE.SphereGeometry(legW * 1.5, 4, 3);
    footGeo.scale(1.2, 0.5, 1.5);
    const foot = new THREE.Mesh(footGeo, accentMat);
    foot.name = side < 0 ? 'footL' : 'footR';
    foot.position.set(hipX, hipY - legLen * 0.85, 0.03);
    group.add(foot);
  }

  // Scale and position
  group.scale.setScalar(scale);

  // Calculate ground offset so feet touch y=0
  const lowestPoint = (0.55 - torsoH * 0.5 - genome.legLength * 0.25 * 0.85) * scale;
  group.position.y = -lowestPoint;

  return { group, uniforms };
}
