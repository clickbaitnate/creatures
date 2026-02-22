// Pooled particle system for block-break effects.
// Reusable tiny box meshes that spray outward with gravity and fade.

import * as THREE from 'three';

const POOL_SIZE = 50;
const PARTICLE_SIZE = 0.02;
const GRAVITY = -9.8;
const LIFETIME = 0.5;

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  active: boolean;
}

export class MiningParticles {
  private particles: Particle[] = [];
  private geo: THREE.BoxGeometry;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE);

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        flatShading: true,
        transparent: true,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        active: false,
      });
    }
  }

  /** Spawn 4-6 particles at world position with block color */
  spawnBreakParticles(x: number, y: number, z: number, color: number): void {
    const count = 4 + Math.floor(Math.random() * 3);
    let spawned = 0;

    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.active) continue;

      p.active = true;
      p.life = LIFETIME;
      p.mesh.visible = true;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.1,
        y + (Math.random() - 0.5) * 0.1,
        z + (Math.random() - 0.5) * 0.1,
      );

      // Random outward velocity
      const speed = 1.5 + Math.random() * 2;
      const angle = Math.random() * Math.PI * 2;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2 + Math.random() * 3;
      p.vz = Math.sin(angle) * speed;

      // Set color
      (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = 1;

      spawned++;
    }
  }

  /** Update all active particles — call from render loop */
  updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Physics
      p.vy += GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      // Fade opacity
      const t = p.life / LIFETIME;
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = t;

      // Random tumble
      p.mesh.rotation.x += dt * 10;
      p.mesh.rotation.z += dt * 8;
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
