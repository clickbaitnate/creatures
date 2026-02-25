// God Hand: pick up and drop creatures via click-hold-drag.
// State machine: Idle → Holding → Carrying → (drop)

import * as THREE from 'three';
import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { MotorStore } from '../components/Motor';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import type { VoxelWorld } from '../voxel/VoxelWorld';

const HOLD_DELAY = 300;     // ms before click becomes grab
const DRAG_THRESHOLD = 5;   // px before click becomes grab
const LIFT_HEIGHT = 2.0;

const enum GodHandState { Idle, Holding, Carrying }

export interface DropResult {
  entityId: number;
  originX: number;
  originZ: number;
  dropX: number;
  dropZ: number;
  valid: boolean;
}

export class GodHand {
  // Public read state
  isCarrying = false;
  heldEntityId = -1;
  dragWorldPos = new THREE.Vector3();

  private state: GodHandState = GodHandState.Idle;
  private holdTimer = 0;
  private holdStartTime = 0;
  private holdStartMouse = { x: 0, y: 0 };
  private originPos = new THREE.Vector3();  // where creature was picked up

  // Drop preview circle
  private previewMesh: THREE.Mesh;
  private previewMat: THREE.MeshBasicMaterial;
  private previewVisible = false;

  // Tooltip
  private tooltip: HTMLDivElement;

  // Ground plane for raycast
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // External refs
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private voxelWorld: VoxelWorld | null = null;

  // Power gate callback
  canAfford: () => boolean = () => true;
  onPowerFail: () => void = () => {};

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Drop preview circle
    const geo = new THREE.CircleGeometry(1.5, 32);
    geo.rotateX(-Math.PI / 2);
    this.previewMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.previewMesh = new THREE.Mesh(geo, this.previewMat);
    this.previewMesh.visible = false;
    this.previewMesh.renderOrder = 999;
    scene.add(this.previewMesh);

    // Tooltip
    this.tooltip = document.createElement('div');
    Object.assign(this.tooltip.style, {
      position: 'fixed',
      pointerEvents: 'none',
      background: 'rgba(10,12,18,0.9)',
      color: '#e0e0e0',
      padding: '4px 8px',
      borderRadius: '6px',
      fontSize: '10px',
      fontFamily: "'Inter', sans-serif",
      zIndex: '200',
      display: 'none',
      border: '1px solid rgba(80,120,160,0.3)',
      backdropFilter: 'blur(8px)',
    });
    document.body.appendChild(this.tooltip);
  }

  setVoxelWorld(vw: VoxelWorld): void {
    this.voxelWorld = vw;
  }

  /** Call on left mousedown. Returns true if this event was captured (creature hit). 
   *  Note: This now only tracks for potential drag, doesn't block selection. */
  onMouseDown(e: MouseEvent, world: World): boolean {
    if (e.button !== 0) return false;
    if (this.state !== GodHandState.Idle) return false;

    // Raycast to find creature
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const meshes: THREE.Object3D[] = [];
    this.scene.traverse(obj => {
      if (obj.userData.entityId !== undefined) {
        if (obj instanceof THREE.Group) meshes.push(...obj.children);
        else meshes.push(obj);
      }
    });
    const intersects = this.raycaster.intersectObjects(meshes, true);
    if (intersects.length === 0) return false;

    let obj: THREE.Object3D | null = intersects[0].object;
    while (obj && obj.userData.entityId === undefined) obj = obj.parent;
    if (!obj) return false;

    const entityId = obj.userData.entityId as number;

    // Must be alive creature with Motor
    const lc = LifecycleStore.get(entityId);
    if (!lc || lc.stage !== LifeStage.Alive) return false;
    if (!MotorStore.get(entityId)) return false;

    // Start hold timer (for potential drag, but don't block selection)
    this.state = GodHandState.Holding;
    this.heldEntityId = entityId;
    this.holdStartTime = performance.now();
    this.holdStartMouse = { x: e.clientX, y: e.clientY };

    // Cache creature origin
    const t = TransformStore.get(entityId);
    if (t) this.originPos.set(t.x, t.y, t.z);

    return false; // Don't block selection - let normal click handling proceed
  }

  /** Call on mousemove. */
  onMouseMove(e: MouseEvent): void {
    if (this.state === GodHandState.Holding) {
      const dx = e.clientX - this.holdStartMouse.x;
      const dy = e.clientY - this.holdStartMouse.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        this.startCarrying();
      }
    }

    if (this.state === GodHandState.Carrying) {
      // Update ground plane intersection
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, target)) {
        this.dragWorldPos.copy(target);

        // Snap Y to terrain
        if (this.voxelWorld) {
          this.dragWorldPos.y = this.voxelWorld.getHeightWorld(target.x, target.z);
        }

        // Update preview circle
        this.previewMesh.position.set(this.dragWorldPos.x, this.dragWorldPos.y + 0.05, this.dragWorldPos.z);
        this.previewMesh.visible = true;

        // Color: green valid, red invalid
        const valid = this.isValidDrop(this.dragWorldPos.x, this.dragWorldPos.z);
        this.previewMat.color.setHex(valid ? 0x44ff44 : 0xff4444);
      }

      // Update tooltip
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = (e.clientX + 16) + 'px';
      this.tooltip.style.top = (e.clientY - 8) + 'px';
      this.updateTooltip();

      // Cursor
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  }

  /** Call on mouseup. Returns DropResult if a drop happened, null otherwise. */
  onMouseUp(e: MouseEvent): DropResult | null {
    if (e.button !== 0) return null;

    if (this.state === GodHandState.Holding) {
      // Released before carry threshold — treat as normal click
      this.cancelHold();
      return null;
    }

    if (this.state === GodHandState.Carrying) {
      const result = this.executeDrop();
      this.cleanup();
      return result;
    }

    return null;
  }

  /** Call in animate() to check hold timer elapsed. */
  update(): void {
    if (this.state === GodHandState.Holding) {
      if (performance.now() - this.holdStartTime >= HOLD_DELAY) {
        this.startCarrying();
      }
    }
  }

  /** Check if the God Hand is in any active state */
  get isActive(): boolean {
    return this.state !== GodHandState.Idle;
  }

  private startCarrying(): void {
    // Check power
    if (!this.canAfford()) {
      this.onPowerFail();
      this.cancelHold();
      return;
    }

    this.state = GodHandState.Carrying;
    this.isCarrying = true;

    // Set godHeld on motor
    const motor = MotorStore.get(this.heldEntityId);
    if (motor) motor.godHeld = true;

    // Initialize drag position to creature's current position
    const t = TransformStore.get(this.heldEntityId);
    if (t) this.dragWorldPos.set(t.x, t.y, t.z);

    this.renderer.domElement.style.cursor = 'grabbing';
  }

  private cancelHold(): void {
    this.state = GodHandState.Idle;
    this.heldEntityId = -1;
    this.isCarrying = false;
    this.renderer.domElement.style.cursor = '';
  }

  private executeDrop(): DropResult {
    const entityId = this.heldEntityId;
    const valid = this.isValidDrop(this.dragWorldPos.x, this.dragWorldPos.z);

    return {
      entityId,
      originX: this.originPos.x,
      originZ: this.originPos.z,
      dropX: valid ? this.dragWorldPos.x : this.originPos.x,
      dropZ: valid ? this.dragWorldPos.z : this.originPos.z,
      valid,
    };
  }

  private cleanup(): void {
    // Release motor
    const motor = MotorStore.get(this.heldEntityId);
    if (motor) motor.godHeld = false;

    this.state = GodHandState.Idle;
    this.heldEntityId = -1;
    this.isCarrying = false;
    this.previewMesh.visible = false;
    this.tooltip.style.display = 'none';
    this.renderer.domElement.style.cursor = '';
  }

  private isValidDrop(x: number, z: number): boolean {
    if (!this.voxelWorld) return true;
    if (this.voxelWorld.isWaterAt(x, z)) return false;
    const halfBound = 195; // voxel world half
    if (x < -halfBound || x > halfBound || z < -halfBound || z > halfBound) return false;
    return true;
  }

  private updateTooltip(): void {
    if (!this.voxelWorld) {
      this.tooltip.innerHTML = 'Drop here';
      return;
    }
    const biome = this.getBiomeName(this.dragWorldPos.x, this.dragWorldPos.z);
    const valid = this.isValidDrop(this.dragWorldPos.x, this.dragWorldPos.z);
    const dist = Math.sqrt(
      (this.dragWorldPos.x - this.originPos.x) ** 2 +
      (this.dragWorldPos.z - this.originPos.z) ** 2
    );
    const stanceHint = dist > 20 ? 'Major shift' : dist > 10 ? 'Moderate shift' : 'Minor shift';
    this.tooltip.innerHTML = valid
      ? `<span style="color:#aaa">${biome}</span> · ${stanceHint} · <span style="color:#ffd700">${dist.toFixed(0)}m</span>`
      : `<span style="color:#ff6666">Invalid drop</span>`;
  }

  private getBiomeName(x: number, z: number): string {
    // Use voxel world height as rough biome proxy
    if (!this.voxelWorld) return 'Unknown';
    const h = this.voxelWorld.getHeightWorld(x, z);
    if (h < 3) return 'Wetland';
    if (h < 6) return 'Plains';
    if (h < 10) return 'Forest';
    if (h < 15) return 'Highland';
    return 'Mountain';
  }

  /** Get biome index for the given world position */
  getBiomeIndex(x: number, z: number): number {
    if (!this.voxelWorld) return 0;
    const h = this.voxelWorld.getHeightWorld(x, z);
    if (h < 3) return 4;  // Wetland/Swamp
    if (h < 6) return 0;  // Plains/Meadow
    if (h < 10) return 1; // Forest
    if (h < 15) return 3; // Rocky/Highland
    return 3;             // Rocky/Mountain
  }

  dispose(): void {
    this.scene.remove(this.previewMesh);
    this.previewMesh.geometry.dispose();
    this.previewMat.dispose();
    this.tooltip.remove();
  }
}
