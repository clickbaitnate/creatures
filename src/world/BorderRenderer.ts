import * as THREE from 'three';
import { TerritorySystem } from './TerritorySystem';
import { GRID_SIZE, CELL_SIZE } from './ResourceGrid';
import type { FactionManager } from './FactionSystem';

const UPDATE_INTERVAL = 100;

export class BorderRenderer {
  private linesMesh: THREE.LineSegments | null = null;
  private scene: THREE.Scene;
  private tickCounter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(territory: TerritorySystem, factionManager: FactionManager): void {
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL && this.linesMesh) return;
    this.tickCounter = 0;

    // Remove old mesh
    if (this.linesMesh) {
      this.scene.remove(this.linesMesh);
      this.linesMesh.geometry.dispose();
      (this.linesMesh.material as THREE.Material).dispose();
    }

    const positions: number[] = [];
    const colors: number[] = [];

    // Scan for boundary edges
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gz * GRID_SIZE + gx;
        const owner = territory.owner[idx];
        if (owner < 0) continue;

        const faction = factionManager.factions.find(f => f.id === owner);
        if (!faction) continue;

        // Convert faction hue to RGB
        const color = new THREE.Color().setHSL(faction.color / 360, 0.8, 0.5);
        const contested = territory.contested[idx];

        const wx = (gx - GRID_SIZE / 2) * CELL_SIZE;
        const wz = (gz - GRID_SIZE / 2) * CELL_SIZE;
        const y = 0.3; // slightly above ground

        // Check each edge for boundary
        // Right edge
        if (gx < GRID_SIZE - 1) {
          const neighbor = territory.owner[idx + 1];
          if (neighbor !== owner) {
            const ex = wx + CELL_SIZE;
            positions.push(ex, y, wz, ex, y, wz + CELL_SIZE);
            const bright = contested ? 1.0 : 0.8;
            colors.push(color.r * bright, color.g * bright, color.b * bright);
            colors.push(color.r * bright, color.g * bright, color.b * bright);
          }
        }

        // Bottom edge
        if (gz < GRID_SIZE - 1) {
          const neighbor = territory.owner[idx + GRID_SIZE];
          if (neighbor !== owner) {
            const ez = wz + CELL_SIZE;
            positions.push(wx, y, ez, wx + CELL_SIZE, y, ez);
            const bright = contested ? 1.0 : 0.8;
            colors.push(color.r * bright, color.g * bright, color.b * bright);
            colors.push(color.r * bright, color.g * bright, color.b * bright);
          }
        }

        // Left edge (world boundary)
        if (gx === 0 && owner >= 0) {
          positions.push(wx, y, wz, wx, y, wz + CELL_SIZE);
          colors.push(color.r * 0.6, color.g * 0.6, color.b * 0.6);
          colors.push(color.r * 0.6, color.g * 0.6, color.b * 0.6);
        }

        // Top edge (world boundary)
        if (gz === 0 && owner >= 0) {
          positions.push(wx, y, wz, wx + CELL_SIZE, y, wz);
          colors.push(color.r * 0.6, color.g * 0.6, color.b * 0.6);
          colors.push(color.r * 0.6, color.g * 0.6, color.b * 0.6);
        }
      }
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: 0.7,
    });

    this.linesMesh = new THREE.LineSegments(geometry, material);
    this.scene.add(this.linesMesh);
  }

  dispose(): void {
    if (this.linesMesh) {
      this.scene.remove(this.linesMesh);
      this.linesMesh.geometry.dispose();
      (this.linesMesh.material as THREE.Material).dispose();
    }
  }
}
