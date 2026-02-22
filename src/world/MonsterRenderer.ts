// Blocky voxel-style monster renderer. Each monster is a THREE.Group of BoxGeometry parts.

import * as THREE from 'three';
import { MonsterManager, MAX_MONSTERS, MonsterType } from './MonsterManager';

function box(w: number, h: number, d: number, color: number, emissive = 0x000000, emissiveI = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: emissiveI,
    roughness: 0.8, flatShading: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function buildSkeleton(): THREE.Group {
  const g = new THREE.Group();
  const bone = 0xd4c9a8;
  const dark = 0x222222;

  // Skull
  const skull = box(0.28, 0.28, 0.28, bone);
  skull.position.y = 1.55;
  g.add(skull);

  // Eye sockets (red glow)
  for (const side of [-1, 1]) {
    const eye = box(0.06, 0.05, 0.02, 0xff0000, 0xff2200, 1.5);
    eye.position.set(side * 0.07, 1.58, 0.14);
    g.add(eye);
  }

  // Jaw
  const jaw = box(0.2, 0.06, 0.12, bone);
  jaw.position.set(0, 1.38, 0.04);
  g.add(jaw);

  // Spine/ribcage
  const spine = box(0.08, 0.45, 0.08, bone);
  spine.position.y = 1.05;
  g.add(spine);
  // Ribs
  for (let r = 0; r < 3; r++) {
    const rib = box(0.28, 0.03, 0.15, bone);
    rib.position.set(0, 1.2 - r * 0.1, 0);
    g.add(rib);
  }

  // Arms
  for (const side of [-1, 1]) {
    const upper = box(0.07, 0.3, 0.07, bone);
    upper.position.set(side * 0.2, 1.15, 0);
    g.add(upper);
    const lower = box(0.06, 0.25, 0.06, bone);
    lower.position.set(side * 0.22, 0.85, 0.05);
    lower.rotation.x = -0.3;
    g.add(lower);
  }

  // Legs
  for (const side of [-1, 1]) {
    const leg = box(0.08, 0.4, 0.08, bone);
    leg.position.set(side * 0.1, 0.45, 0);
    g.add(leg);
    const foot = box(0.1, 0.04, 0.14, bone);
    foot.position.set(side * 0.1, 0.22, 0.03);
    g.add(foot);
  }

  // Bone sword in right hand
  const sword = box(0.04, 0.5, 0.04, dark);
  sword.position.set(0.25, 0.95, 0.1);
  sword.rotation.x = -0.5;
  g.add(sword);

  return g;
}

function buildDemon(): THREE.Group {
  const g = new THREE.Group();
  const body = 0x661111;
  const dark = 0x330808;
  const horn = 0x222222;

  // Head
  const head = box(0.35, 0.32, 0.32, body);
  head.position.y = 1.65;
  g.add(head);

  // Horns
  for (const side of [-1, 1]) {
    const h = box(0.06, 0.22, 0.06, horn);
    h.position.set(side * 0.15, 1.85, -0.05);
    h.rotation.z = side * -0.3;
    g.add(h);
  }

  // Eyes (orange glow)
  for (const side of [-1, 1]) {
    const eye = box(0.08, 0.04, 0.02, 0xff6600, 0xff4400, 2.0);
    eye.position.set(side * 0.09, 1.68, 0.17);
    g.add(eye);
  }

  // Mouth
  const mouth = box(0.15, 0.04, 0.02, 0xff2200, 0xff0000, 0.8);
  mouth.position.set(0, 1.54, 0.17);
  g.add(mouth);

  // Torso (stocky)
  const torso = box(0.5, 0.55, 0.4, dark);
  torso.position.y = 1.05;
  g.add(torso);

  // Arms (thick)
  for (const side of [-1, 1]) {
    const arm = box(0.18, 0.5, 0.18, body);
    arm.position.set(side * 0.35, 1.05, 0);
    g.add(arm);
    const fist = box(0.16, 0.14, 0.16, dark);
    fist.position.set(side * 0.36, 0.7, 0);
    g.add(fist);
  }

  // Legs (stocky)
  for (const side of [-1, 1]) {
    const leg = box(0.18, 0.45, 0.18, dark);
    leg.position.set(side * 0.15, 0.45, 0);
    g.add(leg);
    const foot = box(0.2, 0.06, 0.25, 0x111111);
    foot.position.set(side * 0.15, 0.18, 0.04);
    g.add(foot);
  }

  // Tail
  const tail = box(0.06, 0.06, 0.4, dark);
  tail.position.set(0, 0.8, -0.35);
  tail.rotation.x = 0.3;
  g.add(tail);

  g.scale.setScalar(1.1);
  return g;
}

function buildSpider(): THREE.Group {
  const g = new THREE.Group();
  const bodyC = 0x1a1a1a;
  const legC = 0x222222;

  // Abdomen (rear)
  const abdomen = box(0.35, 0.22, 0.4, bodyC);
  abdomen.position.set(0, 0.35, -0.2);
  g.add(abdomen);

  // Cephalothorax (front)
  const ceph = box(0.28, 0.2, 0.28, 0x2a2a2a);
  ceph.position.set(0, 0.38, 0.18);
  g.add(ceph);

  // Eyes (cluster of red dots)
  for (let i = 0; i < 4; i++) {
    const eye = box(0.04, 0.04, 0.02, 0xff0000, 0xff0000, 2.0);
    eye.position.set(
      (i % 2 === 0 ? -0.06 : 0.06),
      0.42 + (i < 2 ? 0.03 : -0.02),
      0.33,
    );
    g.add(eye);
  }

  // Mandibles
  for (const side of [-1, 1]) {
    const fang = box(0.03, 0.08, 0.03, 0xccccaa);
    fang.position.set(side * 0.06, 0.28, 0.35);
    fang.rotation.x = 0.3;
    g.add(fang);
  }

  // 8 Legs (4 per side)
  const legAngles = [-0.6, -0.2, 0.2, 0.6];
  for (const side of [-1, 1]) {
    for (let li = 0; li < 4; li++) {
      const za = legAngles[li];
      // Upper segment
      const upper = box(0.04, 0.04, 0.35, legC);
      upper.position.set(side * 0.2, 0.35, za * 0.5);
      upper.rotation.z = side * -0.8;
      upper.rotation.y = za;
      g.add(upper);
      // Lower segment
      const lower = box(0.03, 0.03, 0.3, legC);
      lower.position.set(side * 0.45, 0.12, za * 0.6);
      lower.rotation.z = side * -1.2;
      lower.rotation.y = za * 0.5;
      g.add(lower);
    }
  }

  return g;
}

function buildZombie(): THREE.Group {
  const g = new THREE.Group();
  const skin = 0x556644;
  const cloth = 0x443333;
  const dark = 0x333322;

  // Head (slightly tilted)
  const head = box(0.28, 0.28, 0.26, skin);
  head.position.set(0.02, 1.42, 0);
  head.rotation.z = 0.15;
  g.add(head);

  // Eyes (dim yellow)
  for (const side of [-1, 1]) {
    const eye = box(0.06, 0.04, 0.02, 0xaaaa22, 0x888800, 0.8);
    eye.position.set(side * 0.07 + 0.02, 1.45, 0.13);
    g.add(eye);
  }

  // Mouth (dark gash)
  const mouth = box(0.12, 0.03, 0.02, 0x331111);
  mouth.position.set(0.02, 1.33, 0.13);
  mouth.rotation.z = 0.1;
  g.add(mouth);

  // Torso (tattered)
  const torso = box(0.35, 0.45, 0.25, cloth);
  torso.position.y = 0.95;
  torso.rotation.z = 0.05;
  g.add(torso);

  // Arms — one extended forward
  const armR = box(0.1, 0.38, 0.1, skin);
  armR.position.set(0.25, 0.95, 0.15);
  armR.rotation.x = -1.0; // reaching forward
  g.add(armR);
  const armL = box(0.1, 0.38, 0.1, skin);
  armL.position.set(-0.25, 0.9, 0);
  armL.rotation.x = -0.2;
  g.add(armL);

  // Hands
  const handR = box(0.09, 0.07, 0.09, dark);
  handR.position.set(0.25, 0.7, 0.35);
  g.add(handR);
  const handL = box(0.09, 0.07, 0.09, dark);
  handL.position.set(-0.25, 0.68, 0.05);
  g.add(handL);

  // Legs (shambling)
  const legR = box(0.12, 0.42, 0.12, cloth);
  legR.position.set(0.1, 0.4, 0);
  legR.rotation.x = -0.1;
  g.add(legR);
  const legL = box(0.12, 0.42, 0.12, cloth);
  legL.position.set(-0.1, 0.38, 0.05);
  legL.rotation.x = 0.15;
  g.add(legL);

  // Feet
  for (const side of [-1, 1]) {
    const foot = box(0.14, 0.05, 0.18, dark);
    foot.position.set(side * 0.1, 0.15, 0.03);
    g.add(foot);
  }

  return g;
}

const BUILDERS: Record<number, () => THREE.Group> = {
  [MonsterType.Skeleton]: buildSkeleton,
  [MonsterType.Demon]: buildDemon,
  [MonsterType.GiantSpider]: buildSpider,
  [MonsterType.Zombie]: buildZombie,
};

export class MonsterRenderer {
  private scene: THREE.Scene;
  private groups: (THREE.Group | null)[] = new Array(MAX_MONSTERS).fill(null);
  private groupType: number[] = new Array(MAX_MONSTERS).fill(0);
  private lastDeathCounter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(monsters: MonsterManager): void {
    const time = Date.now() * 0.001;

    for (let i = 0; i < MAX_MONSTERS; i++) {
      if (monsters.alive[i]) {
        const mType = monsters.type[i];

        // Create or replace group if type changed
        if (!this.groups[i] || this.groupType[i] !== mType) {
          if (this.groups[i]) this.scene.remove(this.groups[i]!);
          const builder = BUILDERS[mType];
          if (builder) {
            this.groups[i] = builder();
            this.scene.add(this.groups[i]!);
            this.groupType[i] = mType;
          }
        }

        const g = this.groups[i];
        if (!g) continue;

        g.visible = true;
        g.position.set(monsters.x[i], monsters.y[i], monsters.z[i]);

        // Face movement direction
        if (Math.abs(monsters.vx[i]) > 0.001 || Math.abs(monsters.vz[i]) > 0.001) {
          g.rotation.y = Math.atan2(monsters.vx[i], monsters.vz[i]);
        }

        // Idle animation per type
        switch (mType) {
          case MonsterType.Skeleton: {
            // Slight bob + jaw clatter
            g.position.y += Math.sin(time * 3 + i * 2) * 0.03;
            break;
          }
          case MonsterType.Demon: {
            // Slow menacing sway
            g.rotation.z = Math.sin(time * 1.5 + i) * 0.05;
            g.position.y += Math.abs(Math.sin(time * 2 + i)) * 0.02;
            break;
          }
          case MonsterType.GiantSpider: {
            // Low scuttle bob
            g.position.y += Math.sin(time * 6 + i * 3) * 0.015;
            break;
          }
          case MonsterType.Zombie: {
            // Shambling lurch
            g.rotation.z = Math.sin(time * 1.2 + i) * 0.08;
            g.position.y += Math.abs(Math.sin(time * 1.5 + i)) * 0.01;
            break;
          }
        }

        // Damage flash: red tint when health < max
        const hpRatio = monsters.health[i] / (monsters.maxHealth[i] || 1);
        if (hpRatio < 0.8) {
          const flash = Math.sin(time * 10) > 0 ? 0.3 : 0;
          g.traverse(child => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat.emissiveIntensity !== undefined) {
                mat.emissiveIntensity = (mat.userData.baseEmissive ?? mat.emissiveIntensity) + flash;
                mat.userData.baseEmissive = mat.userData.baseEmissive ?? mat.emissiveIntensity;
              }
            }
          });
        }
      } else {
        // Dead or despawned — hide
        if (this.groups[i]) {
          this.groups[i]!.visible = false;
        }
      }
    }

    // Clean up groups for dead monsters
    if (monsters.deathCounter !== this.lastDeathCounter) {
      this.lastDeathCounter = monsters.deathCounter;
      for (let i = 0; i < MAX_MONSTERS; i++) {
        if (!monsters.alive[i] && this.groups[i]) {
          this.scene.remove(this.groups[i]!);
          this.groups[i] = null;
          this.groupType[i] = 0;
        }
      }
    }
  }

  dispose(): void {
    for (let i = 0; i < MAX_MONSTERS; i++) {
      if (this.groups[i]) {
        this.scene.remove(this.groups[i]!);
        this.groups[i]!.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        this.groups[i] = null;
      }
    }
  }
}
