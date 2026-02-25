// Combat visual effects: slash trails, hit sparks, block flashes.
// Pool-based particle system for combat feedback.

import * as THREE from 'three';

const SPARK_POOL = 80;
const SLASH_POOL = 24;
const SPARK_SIZE = 0.025;
const SLASH_SIZE = 0.015;
const SPARK_LIFETIME = 0.35;
const SLASH_LIFETIME = 0.18;
const GRAVITY = -6;

interface Spark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface SlashTrail {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
  startScale: number;
}

export class CombatVFX {
  private sparks: Spark[] = [];
  private slashes: SlashTrail[] = [];
  private sparkGeo: THREE.BoxGeometry;
  private slashGeo: THREE.PlaneGeometry;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkGeo = new THREE.BoxGeometry(SPARK_SIZE, SPARK_SIZE, SPARK_SIZE);
    this.slashGeo = new THREE.PlaneGeometry(SLASH_SIZE * 8, SLASH_SIZE * 2);

    // Spark pool (yellow/orange/white particles)
    for (let i = 0; i < SPARK_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 999;
      scene.add(mesh);
      this.sparks.push({
        mesh, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: SPARK_LIFETIME, active: false,
      });
    }

    // Slash trail pool (flat quads that stretch along swing arc)
    for (let i = 0; i < SLASH_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.slashGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 998;
      scene.add(mesh);
      this.slashes.push({
        mesh, life: 0, maxLife: SLASH_LIFETIME,
        active: false, startScale: 1,
      });
    }
  }

  /** Spawn hit sparks when an attack lands */
  spawnHitSparks(x: number, y: number, z: number, color: number = 0xffaa22): void {
    const count = 6 + Math.floor(Math.random() * 4);
    let spawned = 0;
    for (const s of this.sparks) {
      if (spawned >= count) break;
      if (s.active) continue;

      s.active = true;
      s.life = SPARK_LIFETIME * (0.7 + Math.random() * 0.3);
      s.maxLife = s.life;
      s.mesh.visible = true;
      s.mesh.position.set(
        x + (Math.random() - 0.5) * 0.15,
        y + 0.4 + (Math.random() - 0.5) * 0.1,
        z + (Math.random() - 0.5) * 0.15,
      );

      const speed = 2 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      const upAngle = Math.random() * 0.6 + 0.3;
      s.vx = Math.cos(angle) * speed * Math.cos(upAngle);
      s.vy = speed * Math.sin(upAngle);
      s.vz = Math.sin(angle) * speed * Math.cos(upAngle);

      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      s.mesh.scale.setScalar(1);
      spawned++;
    }
  }

  /** Spawn block/parry sparks (metallic white-blue) */
  spawnBlockSparks(x: number, y: number, z: number): void {
    this.spawnHitSparks(x, y, z, 0xaaddff);
  }

  /** Spawn a slash trail arc at attacker's weapon position */
  spawnSlashTrail(
    x: number, y: number, z: number,
    rotation: number, color: number = 0xffffff,
  ): void {
    for (const sl of this.slashes) {
      if (sl.active) continue;

      sl.active = true;
      sl.life = SLASH_LIFETIME;
      sl.maxLife = SLASH_LIFETIME;
      sl.startScale = 0.8 + Math.random() * 0.4;
      sl.mesh.visible = true;
      sl.mesh.position.set(
        x + Math.sin(rotation) * 0.3,
        y + 0.5 + (Math.random() - 0.5) * 0.2,
        z + Math.cos(rotation) * 0.3,
      );
      sl.mesh.rotation.set(
        (Math.random() - 0.5) * 0.5,
        rotation + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.8,
      );
      (sl.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (sl.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
      sl.mesh.scale.set(sl.startScale, sl.startScale, 1);
      break;
    }
  }

  /** Update all active particles — call each frame */
  update(dt: number): void {
    // Sparks
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy += GRAVITY * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;

      const t = s.life / s.maxLife;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      s.mesh.scale.setScalar(0.5 + t * 0.5);
      s.mesh.rotation.x += dt * 12;
      s.mesh.rotation.z += dt * 10;
    }

    // Slash trails
    for (const sl of this.slashes) {
      if (!sl.active) continue;
      sl.life -= dt;
      if (sl.life <= 0) {
        sl.active = false;
        sl.mesh.visible = false;
        continue;
      }
      const t = sl.life / sl.maxLife;
      (sl.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.7;
      // Stretch outward as it fades
      const scaleX = sl.startScale * (1 + (1 - t) * 0.5);
      const scaleY = sl.startScale * t;
      sl.mesh.scale.set(scaleX, scaleY, 1);
    }
  }

  dispose(): void {
    for (const s of this.sparks) {
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.parent?.remove(s.mesh);
    }
    for (const sl of this.slashes) {
      sl.mesh.geometry.dispose();
      (sl.mesh.material as THREE.Material).dispose();
      sl.mesh.parent?.remove(sl.mesh);
    }
    this.sparks.length = 0;
    this.slashes.length = 0;
  }
}
