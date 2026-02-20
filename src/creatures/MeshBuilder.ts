import * as THREE from 'three';
import {
  type CreatureGenome,
  EarType,
  TailType,
  SnoutType,
  BodyShape,
} from '../genome/Genome';

// Build a procedural creature mesh from genome morphology traits.
// Uses Three.js Group with primitive geometries — no marching cubes yet.

export function buildCreatureMesh(genome: CreatureGenome): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS, genome.colorL);
  const bellyColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS * 0.7, genome.bellyColorL);
  const darkColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS * 0.5, genome.colorL * 0.5);
  const patternColor = new THREE.Color().setHSL(genome.patternH / 360, genome.colorS * 0.8, genome.colorL * 0.8);
  const eyeWhite = new THREE.Color(0xfafafa);
  const eyePupil = new THREE.Color(0x111111);
  const noseColor = new THREE.Color().setHSL(genome.colorH / 360, genome.colorS * 0.3, genome.colorL * 0.35);

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.6 });
  const patternMat = new THREE.MeshStandardMaterial({ color: patternColor, roughness: 0.7 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: eyeWhite, roughness: 0.3 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: eyePupil, roughness: 0.2 });
  const noseMat = new THREE.MeshStandardMaterial({ color: noseColor, roughness: 0.5 });

  const scale = genome.bodyScale;

  // ── Body ────────────────────────────────────────
  const bodyW = 0.35 * genome.bodyWidth;
  const bodyH = 0.3;
  const bodyL = 0.5 * genome.bodyLength;

  let bodyGeo: THREE.BufferGeometry;
  switch (genome.bodyShape) {
    case BodyShape.Round:
      bodyGeo = new THREE.SphereGeometry(bodyW, 12, 10);
      bodyGeo.scale(1, bodyH / bodyW, bodyL / bodyW);
      break;
    case BodyShape.Long:
      bodyGeo = new THREE.CapsuleGeometry(bodyH, bodyL * 1.4, 8, 12);
      bodyGeo.rotateZ(Math.PI / 2);
      bodyGeo.rotateY(Math.PI / 2);
      break;
    case BodyShape.Squat:
    default:
      bodyGeo = new THREE.SphereGeometry(bodyW * 1.1, 12, 10);
      bodyGeo.scale(1, 0.7, bodyL / bodyW * 0.8);
      break;
  }

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  group.add(body);

  // Belly (slightly flattened sphere on bottom)
  const bellyGeo = new THREE.SphereGeometry(bodyW * 0.8, 10, 8);
  bellyGeo.scale(0.9, 0.5, bodyL / bodyW * 0.7);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.y = -bodyH * 0.3;
  group.add(belly);

  // Spots or stripes
  if (genome.hasSpots) {
    const spotCount = 3 + Math.floor(genome.bodyScale * 4);
    for (let i = 0; i < spotCount; i++) {
      const spotGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 6, 6);
      const spot = new THREE.Mesh(spotGeo, patternMat);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.6 + 0.2;
      spot.position.set(
        Math.sin(phi) * Math.cos(theta) * bodyW * 1.02,
        Math.cos(phi) * bodyH * 0.8,
        Math.sin(phi) * Math.sin(theta) * bodyL * 1.02,
      );
      group.add(spot);
    }
  }
  if (genome.hasStripes) {
    const stripeCount = 2 + Math.floor(genome.bodyLength * 3);
    for (let i = 0; i < stripeCount; i++) {
      const stripeGeo = new THREE.TorusGeometry(bodyW * 0.95, 0.02, 6, 16);
      const stripe = new THREE.Mesh(stripeGeo, patternMat);
      stripe.position.z = (i / stripeCount - 0.5) * bodyL * 1.5;
      stripe.rotation.y = Math.PI / 2;
      group.add(stripe);
    }
  }

  // ── Head ────────────────────────────────────────
  const headR = 0.2 * genome.headSize;
  const headGeo = new THREE.SphereGeometry(headR, 10, 8);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, bodyH * 0.5, bodyL + headR * 0.5);
  head.castShadow = true;
  group.add(head);

  // ── Snout ───────────────────────────────────────
  const snoutL = genome.snoutLength * 0.3;
  const snoutW = genome.snoutWidth * headR;
  let snoutGeo: THREE.BufferGeometry;

  switch (genome.snoutType) {
    case SnoutType.Long:
      snoutGeo = new THREE.CylinderGeometry(snoutW * 0.3, snoutW * 0.6, snoutL, 8);
      snoutGeo.rotateX(-Math.PI / 2);
      break;
    case SnoutType.Flat:
      snoutGeo = new THREE.BoxGeometry(snoutW, snoutW * 0.4, snoutL * 0.5);
      break;
    case SnoutType.Beak:
      snoutGeo = new THREE.ConeGeometry(snoutW * 0.4, snoutL * 1.3, 6);
      snoutGeo.rotateX(-Math.PI / 2);
      break;
    case SnoutType.Short:
    default:
      snoutGeo = new THREE.SphereGeometry(snoutW * 0.5, 8, 6);
      snoutGeo.scale(1, 0.7, 1.3);
      break;
  }

  const snout = new THREE.Mesh(snoutGeo, bodyMat);
  snout.position.set(0, bodyH * 0.35, bodyL + headR + snoutL * 0.3);
  snout.castShadow = true;
  group.add(snout);

  // Nose tip
  const noseGeo = new THREE.SphereGeometry(snoutW * 0.2, 6, 6);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, bodyH * 0.35, bodyL + headR + snoutL * 0.6);
  group.add(nose);

  // ── Eyes ─────────────────────────────────────────
  const eyeR = genome.eyeSize * 0.12;
  const eyeSpread = genome.eyeSpacing * headR * 0.8;

  for (const side of [-1, 1]) {
    // White
    const whiteGeo = new THREE.SphereGeometry(eyeR, 8, 8);
    const eye = new THREE.Mesh(whiteGeo, eyeWhiteMat);
    eye.position.set(side * eyeSpread, bodyH * 0.65, bodyL + headR * 0.7);
    group.add(eye);

    // Pupil
    const pupilGeo = new THREE.SphereGeometry(eyeR * 0.55, 6, 6);
    const pupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupil.position.set(side * eyeSpread, bodyH * 0.65, bodyL + headR * 0.7 + eyeR * 0.5);
    group.add(pupil);
  }

  // ── Ears ─────────────────────────────────────────
  const earS = genome.earSize * 0.2;

  for (const side of [-1, 1]) {
    let earGeo: THREE.BufferGeometry;
    const earPos = new THREE.Vector3(
      side * headR * 0.7,
      bodyH * 0.5 + headR * 0.8,
      bodyL + headR * 0.3,
    );

    switch (genome.earType) {
      case EarType.Pointy: {
        earGeo = new THREE.ConeGeometry(earS * 0.4, earS * 1.5, 6);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.copy(earPos);
        ear.rotation.z = side * (1 - genome.earAngle) * 0.5;
        ear.castShadow = true;
        group.add(ear);

        // Inner ear (darker)
        const innerGeo = new THREE.ConeGeometry(earS * 0.25, earS * 1.2, 6);
        const inner = new THREE.Mesh(innerGeo, bellyMat);
        inner.position.copy(earPos);
        inner.position.x += side * 0.01;
        inner.rotation.z = side * (1 - genome.earAngle) * 0.5;
        group.add(inner);
        break;
      }
      case EarType.Floppy: {
        earGeo = new THREE.SphereGeometry(earS * 0.5, 8, 6);
        earGeo.scale(0.4, 1.2, 0.8);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.copy(earPos);
        ear.position.y -= earS * 0.3;
        ear.rotation.z = side * 1.2; // hang down
        ear.castShadow = true;
        group.add(ear);
        break;
      }
      case EarType.Round: {
        earGeo = new THREE.SphereGeometry(earS * 0.5, 8, 8);
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.copy(earPos);
        ear.castShadow = true;
        group.add(ear);

        const innerGeo = new THREE.SphereGeometry(earS * 0.35, 6, 6);
        const inner = new THREE.Mesh(innerGeo, bellyMat);
        inner.position.copy(earPos);
        inner.position.x += side * 0.01;
        group.add(inner);
        break;
      }
      case EarType.Bat: {
        // Triangular, wide
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(-earS * 0.5, earS * 1.2);
        shape.lineTo(earS * 0.5, earS * 1.2);
        shape.closePath();
        earGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
        const ear = new THREE.Mesh(earGeo, bodyMat);
        ear.position.copy(earPos);
        ear.rotation.z = side * (1 - genome.earAngle) * 0.3;
        ear.rotation.y = side * 0.3;
        ear.castShadow = true;
        group.add(ear);
        break;
      }
    }
  }

  // ── Tail ─────────────────────────────────────────
  const tailL = genome.tailLength * 0.5;
  const tailW = genome.tailThickness * 0.15;

  switch (genome.tailType) {
    case TailType.Thin: {
      const tailGeo = new THREE.CylinderGeometry(tailW * 0.3, tailW, tailL, 6);
      tailGeo.rotateX(Math.PI / 2);
      const tail = new THREE.Mesh(tailGeo, bodyMat);
      tail.position.set(0, bodyH * 0.3, -bodyL + tailL * -0.4);
      tail.rotation.x = genome.tailCurl * 0.5;
      tail.castShadow = true;
      group.add(tail);
      break;
    }
    case TailType.Bushy: {
      // Several overlapping spheres
      const segments = 4;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const r = tailW * (1.5 - t * 0.5);
        const segGeo = new THREE.SphereGeometry(r, 6, 6);
        const seg = new THREE.Mesh(segGeo, i === segments - 1 ? patternMat : bodyMat);
        const curl = genome.tailCurl * Math.PI * 0.5;
        seg.position.set(
          0,
          bodyH * 0.3 + Math.sin(curl * t) * tailL * 0.3,
          -bodyL - tailL * t * 0.7,
        );
        seg.castShadow = true;
        group.add(seg);
      }
      break;
    }
    case TailType.Curly: {
      const segments = 8;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const r = tailW * (1 - t * 0.3);
        const segGeo = new THREE.SphereGeometry(r, 5, 5);
        const seg = new THREE.Mesh(segGeo, bodyMat);
        const angle = genome.tailCurl * Math.PI * t * 2;
        seg.position.set(
          0,
          bodyH * 0.3 + Math.sin(angle) * tailL * 0.25,
          -bodyL - Math.cos(angle) * tailL * 0.15 - tailL * t * 0.5,
        );
        seg.castShadow = true;
        group.add(seg);
      }
      break;
    }
    case TailType.Stub: {
      const stubGeo = new THREE.SphereGeometry(tailW * 1.5, 6, 6);
      stubGeo.scale(1, 0.8, 1.2);
      const stub = new THREE.Mesh(stubGeo, bodyMat);
      stub.position.set(0, bodyH * 0.2, -bodyL - 0.05);
      stub.castShadow = true;
      group.add(stub);
      break;
    }
  }

  // ── Legs ─────────────────────────────────────────
  const legL = genome.legLength * 0.35;
  const legW = genome.legThickness * 0.12;
  const legPositions = getLegPositions(genome.legCount, bodyW, bodyL);

  for (const pos of legPositions) {
    // Upper leg
    const upperGeo = new THREE.CylinderGeometry(legW, legW * 1.1, legL, 6);
    const upper = new THREE.Mesh(upperGeo, bodyMat);
    upper.position.set(pos.x, -bodyH * 0.2 - legL * 0.5, pos.z);
    upper.castShadow = true;
    group.add(upper);

    // Foot (small sphere)
    const footGeo = new THREE.SphereGeometry(legW * 1.3, 6, 4);
    footGeo.scale(1.2, 0.5, 1.3);
    const foot = new THREE.Mesh(footGeo, darkMat);
    foot.position.set(pos.x, -bodyH * 0.2 - legL, pos.z + 0.02);
    group.add(foot);
  }

  // Scale everything
  group.scale.setScalar(scale);

  // Center vertically so feet touch ground
  const totalHeight = (bodyH + legL) * scale;
  group.position.y = totalHeight;

  return group;
}

function getLegPositions(legCount: number, bodyW: number, bodyL: number): { x: number; z: number }[] {
  const positions: { x: number; z: number }[] = [];
  const w = bodyW * 0.9;

  switch (legCount) {
    case 2:
      positions.push({ x: -w * 0.5, z: 0 });
      positions.push({ x: w * 0.5, z: 0 });
      break;
    case 4:
      positions.push({ x: -w * 0.7, z: bodyL * 0.5 });
      positions.push({ x: w * 0.7, z: bodyL * 0.5 });
      positions.push({ x: -w * 0.7, z: -bodyL * 0.5 });
      positions.push({ x: w * 0.7, z: -bodyL * 0.5 });
      break;
    case 6:
      positions.push({ x: -w * 0.7, z: bodyL * 0.6 });
      positions.push({ x: w * 0.7, z: bodyL * 0.6 });
      positions.push({ x: -w * 0.8, z: 0 });
      positions.push({ x: w * 0.8, z: 0 });
      positions.push({ x: -w * 0.7, z: -bodyL * 0.6 });
      positions.push({ x: w * 0.7, z: -bodyL * 0.6 });
      break;
    default:
      // Fallback to 4
      positions.push({ x: -w * 0.7, z: bodyL * 0.5 });
      positions.push({ x: w * 0.7, z: bodyL * 0.5 });
      positions.push({ x: -w * 0.7, z: -bodyL * 0.5 });
      positions.push({ x: w * 0.7, z: -bodyL * 0.5 });
  }
  return positions;
}
