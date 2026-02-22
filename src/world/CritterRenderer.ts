// Blocky voxel-style critter renderer. Each critter is a THREE.Group of BoxGeometry parts,
// matching the monster renderer's visual style.

import * as THREE from 'three';
import { CritterManager, CritterType } from './PreyCritters';
import type { VoxelWorld } from '../voxel/VoxelWorld';

const MAX_CRITTERS = 150;

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function buildRabbit(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0xF0E0C8;
  const pink = 0xE8B8B0;

  // Body
  const body = box(0.12, 0.10, 0.16, fur);
  body.position.set(0, 0.10, 0);
  g.add(body);

  // Head
  const head = box(0.09, 0.08, 0.08, fur);
  head.position.set(0, 0.17, 0.09);
  g.add(head);

  // Ears
  for (const side of [-1, 1]) {
    const ear = box(0.02, 0.09, 0.02, pink);
    ear.position.set(side * 0.025, 0.26, 0.08);
    g.add(ear);
  }

  // Tail (white puff)
  const tail = box(0.04, 0.04, 0.04, 0xFFFFFF);
  tail.position.set(0, 0.12, -0.10);
  g.add(tail);

  // Legs
  for (const sx of [-1, 1]) {
    // Front
    const fl = box(0.025, 0.06, 0.025, fur);
    fl.position.set(sx * 0.04, 0.03, 0.06);
    g.add(fl);
    // Rear (bigger)
    const rl = box(0.03, 0.07, 0.04, fur);
    rl.position.set(sx * 0.04, 0.03, -0.05);
    g.add(rl);
  }

  // Eyes (small black dots)
  for (const side of [-1, 1]) {
    const eye = box(0.015, 0.015, 0.01, 0x111111);
    eye.position.set(side * 0.03, 0.19, 0.13);
    g.add(eye);
  }

  return g;
}

function buildBug(): THREE.Group {
  const g = new THREE.Group();
  const shell = 0x1A1208;

  // Body (tiny)
  const body = box(0.04, 0.02, 0.06, shell);
  body.position.set(0, 0.025, 0);
  g.add(body);

  // Head
  const head = box(0.025, 0.02, 0.025, 0x221A10);
  head.position.set(0, 0.03, 0.04);
  g.add(head);

  // Antennae
  for (const side of [-1, 1]) {
    const ant = box(0.005, 0.005, 0.03, 0x332211);
    ant.position.set(side * 0.01, 0.04, 0.055);
    ant.rotation.x = -0.4;
    g.add(ant);
  }

  // Tiny legs (3 per side)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = box(0.015, 0.005, 0.005, 0x332211);
      leg.position.set(side * 0.025, 0.01, 0.02 - i * 0.02);
      g.add(leg);
    }
  }

  return g;
}

function buildFish(): THREE.Group {
  const g = new THREE.Group();
  const body_c = 0x88AABB;
  const belly = 0xCCDDDD;
  const fin = 0x6688AA;

  // Body
  const body = box(0.05, 0.04, 0.16, body_c);
  body.position.set(0, 0, 0);
  g.add(body);

  // Belly (lighter underside)
  const bellyM = box(0.04, 0.015, 0.12, belly);
  bellyM.position.set(0, -0.015, 0);
  g.add(bellyM);

  // Tail fin (V-shape)
  const tailTop = box(0.01, 0.03, 0.04, fin);
  tailTop.position.set(0, 0.015, -0.10);
  tailTop.rotation.x = 0.3;
  g.add(tailTop);
  const tailBot = box(0.01, 0.03, 0.04, fin);
  tailBot.position.set(0, -0.015, -0.10);
  tailBot.rotation.x = -0.3;
  g.add(tailBot);

  // Dorsal fin
  const dorsal = box(0.008, 0.025, 0.05, fin);
  dorsal.position.set(0, 0.03, 0.02);
  g.add(dorsal);

  // Eye
  for (const side of [-1, 1]) {
    const eye = box(0.01, 0.012, 0.012, 0x111111);
    eye.position.set(side * 0.025, 0.01, 0.06);
    g.add(eye);
  }

  return g;
}

function buildDeer(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0xC4A040;
  const darkFur = 0x8A7030;
  const bone = 0x5C4033;

  // Body
  const body = box(0.14, 0.12, 0.28, fur);
  body.position.set(0, 0.42, 0);
  g.add(body);

  // Neck (angled up)
  const neck = box(0.06, 0.16, 0.06, fur);
  neck.position.set(0, 0.55, 0.14);
  neck.rotation.x = -0.3;
  g.add(neck);

  // Head
  const head = box(0.08, 0.06, 0.10, fur);
  head.position.set(0, 0.65, 0.18);
  g.add(head);

  // Snout
  const snout = box(0.04, 0.035, 0.05, darkFur);
  snout.position.set(0, 0.63, 0.24);
  g.add(snout);

  // Eyes
  for (const side of [-1, 1]) {
    const eye = box(0.015, 0.015, 0.01, 0x111111);
    eye.position.set(side * 0.035, 0.67, 0.23);
    g.add(eye);
  }

  // Antlers
  for (const side of [-1, 1]) {
    // Main beam
    const beam = box(0.015, 0.14, 0.015, bone);
    beam.position.set(side * 0.035, 0.75, 0.16);
    beam.rotation.z = side * -0.2;
    g.add(beam);
    // Tine
    const tine = box(0.06, 0.015, 0.015, bone);
    tine.position.set(side * 0.05, 0.82, 0.16);
    g.add(tine);
    // Second tine
    const tine2 = box(0.04, 0.015, 0.015, bone);
    tine2.position.set(side * 0.04, 0.76, 0.18);
    g.add(tine2);
  }

  // Legs (thin)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.03, 0.28, 0.03, darkFur);
      leg.position.set(sx * 0.05, 0.14, sz * 0.10);
      g.add(leg);
      // Hoof
      const hoof = box(0.035, 0.02, 0.04, 0x222222);
      hoof.position.set(sx * 0.05, 0.01, sz * 0.10);
      g.add(hoof);
    }
  }

  // Tail (white)
  const tail = box(0.03, 0.04, 0.05, 0xFFFFEE);
  tail.position.set(0, 0.42, -0.16);
  g.add(tail);

  return g;
}

function buildBoar(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0x4A3A2E;
  const light = 0x5A4A3E;
  const tusk = 0xEEEEDD;

  // Body (wide, low)
  const body = box(0.20, 0.14, 0.26, fur);
  body.position.set(0, 0.20, 0);
  g.add(body);

  // Head
  const head = box(0.14, 0.11, 0.12, light);
  head.position.set(0, 0.22, 0.16);
  g.add(head);

  // Snout
  const snout = box(0.06, 0.05, 0.06, 0x8A6A5A);
  snout.position.set(0, 0.19, 0.24);
  g.add(snout);

  // Tusks
  for (const side of [-1, 1]) {
    const t = box(0.015, 0.04, 0.015, tusk);
    t.position.set(side * 0.04, 0.2, 0.25);
    t.rotation.z = side * 0.3;
    g.add(t);
  }

  // Eyes (small, dark)
  for (const side of [-1, 1]) {
    const eye = box(0.015, 0.012, 0.01, 0x111111);
    eye.position.set(side * 0.05, 0.25, 0.21);
    g.add(eye);
  }

  // Mane/bristles (ridge along back)
  const mane = box(0.06, 0.04, 0.18, 0x2A1A0E);
  mane.position.set(0, 0.30, -0.02);
  g.add(mane);

  // Legs (short, thick)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.04, 0.12, 0.04, fur);
      leg.position.set(sx * 0.07, 0.06, sz * 0.08);
      g.add(leg);
    }
  }

  // Tail (short curly)
  const tail = box(0.02, 0.02, 0.04, fur);
  tail.position.set(0, 0.24, -0.15);
  tail.rotation.x = -0.5;
  g.add(tail);

  return g;
}

function buildTurkey(): THREE.Group {
  const g = new THREE.Group();
  const feather = 0x8B4513;
  const red = 0xCC3322;
  const dark = 0x654321;

  // Body (round)
  const body = box(0.12, 0.12, 0.14, feather);
  body.position.set(0, 0.18, 0);
  g.add(body);

  // Neck (thin, red)
  const neck = box(0.03, 0.10, 0.03, red);
  neck.position.set(0, 0.30, 0.06);
  g.add(neck);

  // Head (small)
  const head = box(0.04, 0.04, 0.04, red);
  head.position.set(0, 0.38, 0.06);
  g.add(head);

  // Wattle (hanging red bit)
  const wattle = box(0.015, 0.03, 0.01, 0xFF2200);
  wattle.position.set(0, 0.35, 0.09);
  g.add(wattle);

  // Beak
  const beak = box(0.02, 0.015, 0.03, 0xDDAA00);
  beak.position.set(0, 0.37, 0.09);
  g.add(beak);

  // Eyes
  for (const side of [-1, 1]) {
    const eye = box(0.01, 0.01, 0.008, 0x111111);
    eye.position.set(side * 0.02, 0.39, 0.08);
    g.add(eye);
  }

  // Tail fan (flat, spread)
  const tailFan = box(0.14, 0.16, 0.02, dark);
  tailFan.position.set(0, 0.26, -0.09);
  tailFan.rotation.x = 0.4;
  g.add(tailFan);

  // Legs (thin, yellow)
  for (const side of [-1, 1]) {
    const leg = box(0.02, 0.10, 0.02, 0xCCAA00);
    leg.position.set(side * 0.04, 0.06, 0.02);
    g.add(leg);
    // Feet
    const foot = box(0.03, 0.01, 0.04, 0xCCAA00);
    foot.position.set(side * 0.04, 0.01, 0.03);
    g.add(foot);
  }

  return g;
}

function buildFrog(): THREE.Group {
  const g = new THREE.Group();
  const green = 0x33BB22;
  const darkGreen = 0x228A11;
  const belly = 0x88DD66;

  // Body (flat, wide)
  const body = box(0.10, 0.04, 0.10, green);
  body.position.set(0, 0.04, 0);
  g.add(body);

  // Head (wider front)
  const head = box(0.09, 0.035, 0.06, green);
  head.position.set(0, 0.05, 0.06);
  g.add(head);

  // Belly
  const bellyM = box(0.08, 0.02, 0.08, belly);
  bellyM.position.set(0, 0.02, 0);
  g.add(bellyM);

  // Bulging eyes (prominent, golden)
  for (const side of [-1, 1]) {
    const eyeBase = box(0.03, 0.03, 0.03, green);
    eyeBase.position.set(side * 0.035, 0.08, 0.07);
    g.add(eyeBase);
    const pupil = box(0.015, 0.02, 0.015, 0xDDCC00);
    pupil.position.set(side * 0.035, 0.095, 0.08);
    g.add(pupil);
    const dot = box(0.008, 0.012, 0.005, 0x111111);
    dot.position.set(side * 0.035, 0.095, 0.088);
    g.add(dot);
  }

  // Rear legs (long, bent)
  for (const side of [-1, 1]) {
    const thigh = box(0.03, 0.02, 0.06, darkGreen);
    thigh.position.set(side * 0.06, 0.03, -0.04);
    thigh.rotation.y = side * 0.5;
    g.add(thigh);
    const calf = box(0.025, 0.02, 0.05, darkGreen);
    calf.position.set(side * 0.08, 0.02, -0.07);
    calf.rotation.y = side * -0.3;
    g.add(calf);
  }

  // Front legs (short)
  for (const side of [-1, 1]) {
    const fl = box(0.02, 0.02, 0.03, darkGreen);
    fl.position.set(side * 0.05, 0.02, 0.05);
    g.add(fl);
  }

  return g;
}

function buildSnake(): THREE.Group {
  const g = new THREE.Group();
  const olive = 0x556B2F;
  const darkOlive = 0x3A4A1F;
  const belly = 0x88AA55;

  // Head (slightly wider)
  const head = box(0.04, 0.025, 0.04, olive);
  head.position.set(0, 0.02, 0.14);
  g.add(head);

  // Eyes (red)
  for (const side of [-1, 1]) {
    const eye = box(0.008, 0.008, 0.005, 0xCC2200);
    eye.position.set(side * 0.015, 0.035, 0.155);
    g.add(eye);
  }

  // Tongue
  const tongue = box(0.005, 0.003, 0.03, 0xCC2222);
  tongue.position.set(0, 0.015, 0.17);
  g.add(tongue);

  // Body segments (alternating shade for pattern)
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const shade = i % 2 === 0 ? olive : darkOlive;
    const w = 0.035 - i * 0.002;
    const seg = box(w, 0.02, 0.05, shade);
    seg.position.set(0, 0.015, 0.10 - i * 0.05);
    g.add(seg);
  }

  // Belly stripe
  const bellyStripe = box(0.02, 0.005, 0.28, belly);
  bellyStripe.position.set(0, 0.005, -0.01);
  g.add(bellyStripe);

  // Tail (tapers)
  const tail = box(0.015, 0.012, 0.04, darkOlive);
  tail.position.set(0, 0.012, -0.22);
  g.add(tail);

  return g;
}

function buildSquirrel(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0xCC6622;
  const belly = 0xEECCAA;
  const dark = 0x994411;

  // Body
  const body = box(0.06, 0.05, 0.08, fur);
  body.position.set(0, 0.10, 0);
  g.add(body);

  // Belly
  const bellyM = box(0.04, 0.02, 0.06, belly);
  bellyM.position.set(0, 0.075, 0);
  g.add(bellyM);

  // Head
  const head = box(0.05, 0.04, 0.04, fur);
  head.position.set(0, 0.15, 0.04);
  g.add(head);

  // Ears (pointed)
  for (const side of [-1, 1]) {
    const ear = box(0.012, 0.02, 0.01, dark);
    ear.position.set(side * 0.02, 0.19, 0.04);
    g.add(ear);
  }

  // Eyes
  for (const side of [-1, 1]) {
    const eye = box(0.012, 0.012, 0.008, 0x111111);
    eye.position.set(side * 0.02, 0.16, 0.06);
    g.add(eye);
  }

  // Nose
  const nose = box(0.01, 0.008, 0.008, 0x222222);
  nose.position.set(0, 0.145, 0.06);
  g.add(nose);

  // Bushy tail (big, curved up)
  const tail1 = box(0.04, 0.04, 0.05, 0xDD8833);
  tail1.position.set(0, 0.14, -0.06);
  g.add(tail1);
  const tail2 = box(0.035, 0.05, 0.04, 0xDD8833);
  tail2.position.set(0, 0.18, -0.07);
  g.add(tail2);
  const tailTip = box(0.025, 0.03, 0.03, 0xEEAA55);
  tailTip.position.set(0, 0.22, -0.065);
  g.add(tailTip);

  // Legs
  for (const sx of [-1, 1]) {
    const fl = box(0.015, 0.05, 0.015, dark);
    fl.position.set(sx * 0.025, 0.05, 0.03);
    g.add(fl);
    const rl = box(0.018, 0.06, 0.02, dark);
    rl.position.set(sx * 0.025, 0.04, -0.02);
    g.add(rl);
  }

  return g;
}

function buildElk(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0x3A2010;
  const lightFur = 0x4A3020;
  const bone = 0x6A5040;

  // Body (massive)
  const body = box(0.20, 0.16, 0.36, fur);
  body.position.set(0, 0.52, 0);
  g.add(body);

  // Shoulder hump
  const hump = box(0.14, 0.08, 0.14, 0x2A1508);
  hump.position.set(0, 0.64, 0.06);
  g.add(hump);

  // Neck (thick, angled)
  const neck = box(0.10, 0.20, 0.10, fur);
  neck.position.set(0, 0.68, 0.18);
  neck.rotation.x = -0.25;
  g.add(neck);

  // Head
  const head = box(0.12, 0.09, 0.14, lightFur);
  head.position.set(0, 0.82, 0.24);
  g.add(head);

  // Snout
  const snout = box(0.06, 0.05, 0.06, 0x5A4030);
  snout.position.set(0, 0.79, 0.32);
  g.add(snout);

  // Nostrils
  const nose = box(0.04, 0.02, 0.02, 0x222222);
  nose.position.set(0, 0.78, 0.35);
  g.add(nose);

  // Eyes
  for (const side of [-1, 1]) {
    const eye = box(0.018, 0.015, 0.01, 0x111111);
    eye.position.set(side * 0.05, 0.84, 0.30);
    g.add(eye);
  }

  // Massive antlers (palmate — broad and flat like moose)
  for (const side of [-1, 1]) {
    // Main beam going up and out
    const beam = box(0.02, 0.20, 0.02, bone);
    beam.position.set(side * 0.06, 0.95, 0.22);
    beam.rotation.z = side * -0.25;
    g.add(beam);
    // Palm (broad flat piece)
    const palm = box(0.10, 0.12, 0.02, bone);
    palm.position.set(side * 0.10, 1.08, 0.22);
    palm.rotation.z = side * -0.15;
    g.add(palm);
    // Tines off palm
    for (let t = 0; t < 3; t++) {
      const tine = box(0.015, 0.06, 0.015, bone);
      tine.position.set(side * (0.06 + t * 0.025), 1.16, 0.22);
      tine.rotation.z = side * (-0.1 - t * 0.1);
      g.add(tine);
    }
  }

  // Legs (long, thick)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.04, 0.36, 0.04, fur);
      leg.position.set(sx * 0.07, 0.18, sz * 0.13);
      g.add(leg);
      const hoof = box(0.045, 0.02, 0.05, 0x1A1008);
      hoof.position.set(sx * 0.07, 0.01, sz * 0.13);
      g.add(hoof);
    }
  }

  // Beard/dewlap
  const beard = box(0.04, 0.06, 0.03, 0x2A1A0A);
  beard.position.set(0, 0.72, 0.26);
  g.add(beard);

  // Tail (short)
  const tail = box(0.03, 0.03, 0.04, fur);
  tail.position.set(0, 0.52, -0.20);
  g.add(tail);

  return g;
}

const BUILDERS: Record<number, () => THREE.Group> = {
  [CritterType.Rabbit]: buildRabbit,
  [CritterType.Bug]: buildBug,
  [CritterType.Fish]: buildFish,
  [CritterType.Deer]: buildDeer,
  [CritterType.Boar]: buildBoar,
  [CritterType.Turkey]: buildTurkey,
  [CritterType.Frog]: buildFrog,
  [CritterType.Snake]: buildSnake,
  [CritterType.Squirrel]: buildSquirrel,
  [CritterType.Elk]: buildElk,
};

export class CritterRenderer {
  private scene: THREE.Scene;
  private groups: (THREE.Group | null)[] = new Array(MAX_CRITTERS).fill(null);
  private groupType: number[] = new Array(MAX_CRITTERS).fill(-1);
  voxelWorld: VoxelWorld | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(manager: CritterManager): void {
    const time = Date.now() * 0.001;

    for (let i = 0; i < MAX_CRITTERS; i++) {
      if (i < manager.count && manager.alive[i]) {
        const cType = manager.type[i];

        // Create or replace group if type changed
        if (!this.groups[i] || this.groupType[i] !== cType) {
          if (this.groups[i]) {
            this.scene.remove(this.groups[i]!);
            this.disposeGroup(this.groups[i]!);
          }
          const builder = BUILDERS[cType];
          if (builder) {
            this.groups[i] = builder();
            this.scene.add(this.groups[i]!);
            this.groupType[i] = cType;
          }
        }

        const g = this.groups[i];
        if (!g) continue;

        g.visible = true;

        // Get terrain Y from voxel world
        let yBase = 0;
        if (this.voxelWorld) {
          yBase = this.voxelWorld.getHeightWorld(manager.x[i], manager.z[i]);
          // Fish render slightly below water surface
          if (cType === CritterType.Fish) {
            yBase -= 0.08;
          }
        }

        g.position.set(manager.x[i], yBase, manager.z[i]);

        // Face heading direction
        g.rotation.y = manager.heading[i];

        // Per-type idle animation
        switch (cType as CritterType) {
          case CritterType.Rabbit:
            // Hop bob
            g.position.y += Math.abs(Math.sin(time * 4 + i * 1.7)) * 0.02;
            break;
          case CritterType.Bug:
            // Quick scuttle
            g.position.y += Math.sin(time * 8 + i * 3) * 0.003;
            break;
          case CritterType.Fish:
            // Swim undulation
            g.position.y += Math.sin(time * 2 + i * 1.3) * 0.02;
            g.rotation.z = Math.sin(time * 3 + i) * 0.1;
            break;
          case CritterType.Deer:
            // Gentle sway
            g.position.y += Math.sin(time * 1.5 + i * 2) * 0.005;
            break;
          case CritterType.Boar:
            // Snuffling bob
            g.position.y += Math.abs(Math.sin(time * 2.5 + i)) * 0.008;
            break;
          case CritterType.Turkey:
            // Bobbing walk
            g.position.y += Math.abs(Math.sin(time * 3 + i * 2)) * 0.01;
            break;
          case CritterType.Frog:
            // Occasional hop
            g.position.y += Math.max(0, Math.sin(time * 1.5 + i * 4)) * 0.03;
            break;
          case CritterType.Snake:
            // Slither sway
            g.rotation.y += Math.sin(time * 2 + i) * 0.05;
            break;
          case CritterType.Squirrel:
            // Twitchy bob
            g.position.y += Math.abs(Math.sin(time * 5 + i * 2.5)) * 0.01;
            break;
          case CritterType.Elk:
            // Slow majestic sway
            g.position.y += Math.sin(time * 1.2 + i * 1.5) * 0.005;
            break;
        }
      } else {
        // Dead or beyond count — hide
        if (this.groups[i]) {
          this.groups[i]!.visible = false;
        }
      }
    }
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  dispose(): void {
    for (let i = 0; i < MAX_CRITTERS; i++) {
      if (this.groups[i]) {
        this.scene.remove(this.groups[i]!);
        this.disposeGroup(this.groups[i]!);
        this.groups[i] = null;
        this.groupType[i] = -1;
      }
    }
  }
}
