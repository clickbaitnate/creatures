// Divine particles for God Hand: golden sparkles trailing upward from held creature,
// burst of colored particles on drop. Pool-based like MiningParticles.

import * as THREE from 'three';

const POOL_SIZE = 30;
const PARTICLE_SIZE = 0.04;
const LIFETIME = 0.8;

interface DivineParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  active: boolean;
}

export class GodHandVisuals {
  private particles: DivineParticle[] = [];
  private geo: THREE.BoxGeometry;
  private trailTimer = 0;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 998;
      scene.add(mesh);
      this.particles.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        active: false,
      });
    }
  }

  /** Spawn trailing sparkles while carrying — call each frame */
  updateTrail(x: number, y: number, z: number, dt: number): void {
    this.trailTimer += dt;
    if (this.trailTimer >= 0.05) { // every 50ms
      this.trailTimer = 0;
      this.spawnOne(x, y, z, 0xffd700, 0.5, 2.0);
      this.spawnOne(x, y, z, 0xffffff, 0.3, 1.5);
    }
    this.tick(dt);
  }

  /** Burst particles on drop */
  spawnDropBurst(x: number, y: number, z: number, color: number): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      this.spawnOne(x, y, z, color, 1.5, 3.0 + Math.random() * 2);
    }
  }

  /** Update all active particles */
  tick(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      // Fade
      const t = p.life / LIFETIME;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      // Gentle shrink
      const s = PARTICLE_SIZE * (0.5 + t * 0.5);
      p.mesh.scale.setScalar(s / PARTICLE_SIZE);
      // Tumble
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.z += dt * 4;
    }
  }

  private spawnOne(x: number, y: number, z: number, color: number, spread: number, upSpeed: number): void {
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.life = LIFETIME;
      p.mesh.visible = true;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * spread * 0.3,
        y + Math.random() * 0.5,
        z + (Math.random() - 0.5) * spread * 0.3,
      );
      const angle = Math.random() * Math.PI * 2;
      p.vx = Math.cos(angle) * spread * 0.5;
      p.vy = upSpeed;
      p.vz = Math.sin(angle) * spread * 0.5;
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      p.mesh.scale.setScalar(1);
      return;
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      p.mesh.parent?.remove(p.mesh);
    }
    this.particles.length = 0;
  }
}
