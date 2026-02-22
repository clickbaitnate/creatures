import * as THREE from 'three';

// HTML overlay speech bubbles and faction labels projected from 3D.

interface Bubble {
  entityId: number;
  element: HTMLDivElement;
  timer: number;
  lastX: number;
  lastY: number;
}

interface Label {
  entityId: number;
  element: HTMLDivElement;
  lastX: number;
  lastY: number;
}

interface SettlementLabel {
  factionId: number;
  element: HTMLDivElement;
  worldPos: THREE.Vector3;
}

export class SpeechBubbleManager {
  private container: HTMLDivElement;
  private bubbles: Bubble[] = [];
  private labels = new Map<number, Label>();
  private settlementLabels = new Map<number, SettlementLabel>();
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;

  constructor(camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
    this.camera = camera;
    this.renderer = renderer;

    this.container = document.createElement('div');
    this.container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:10;';
    document.body.appendChild(this.container);
  }

  showSpeech(entityId: number, text: string, worldPos: THREE.Vector3): void {
    // Remove existing bubble for this entity
    this.removeBubble(entityId);

    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; padding:4px 10px; border-radius:14px;
      background:rgba(255,255,255,0.95); font-size:18px;
      box-shadow:0 2px 10px rgba(0,0,0,0.25); transform:translate(-50%,-100%);
      animation: bubblePop 0.2s ease-out;
      white-space:nowrap; will-change:left,top;
      transition: left 0.08s linear, top 0.08s linear;
    `;
    el.textContent = text;
    this.container.appendChild(el);

    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    const screen = this.worldToScreen(worldPos, width, height, 1.4);
    const x = screen?.x ?? 0;
    const y = screen?.y ?? 0;
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    this.bubbles.push({ entityId, element: el, timer: 70, lastX: x, lastY: y });
  }

  setLabel(entityId: number, emoji: string, name: string, worldPos: THREE.Vector3): void {
    let label = this.labels.get(entityId);
    if (!label) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute; font-size:11px; color:#fff;
        text-shadow:0 1px 3px rgba(0,0,0,0.8); transform:translate(-50%,0);
        white-space:nowrap; pointer-events:none; text-align:center;
        line-height:1.2; will-change:left,top;
        transition: left 0.08s linear, top 0.08s linear;
      `;
      this.container.appendChild(el);
      label = { entityId, element: el, lastX: 0, lastY: 0 };
      this.labels.set(entityId, label);
    }
    label.element.innerHTML = `${emoji}<br><span style="font-size:9px;opacity:0.8">${name}</span>`;
  }

  removeLabel(entityId: number): void {
    const label = this.labels.get(entityId);
    if (label) {
      label.element.remove();
      this.labels.delete(entityId);
    }
  }

  setSettlementLabel(factionId: number, name: string, tier: string, emoji: string, worldPos: THREE.Vector3): void {
    let sl = this.settlementLabels.get(factionId);
    if (!sl) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute; font-size:10px; color:#fff;
        text-shadow:0 1px 4px rgba(0,0,0,0.9); transform:translate(-50%,0);
        white-space:nowrap; pointer-events:none; text-align:center;
        line-height:1.3; will-change:left,top;
        transition: left 0.08s linear, top 0.08s linear;
      `;
      this.container.appendChild(el);
      sl = { factionId, element: el, worldPos: worldPos.clone() };
      this.settlementLabels.set(factionId, sl);
    }
    sl.worldPos.copy(worldPos);
    sl.element.innerHTML = `<span style="font-size:8px;text-transform:uppercase;letter-spacing:1px;opacity:0.7">${tier}</span><br><span style="font-weight:bold">${emoji} ${name}</span>`;
  }

  removeSettlementLabel(factionId: number): void {
    const sl = this.settlementLabels.get(factionId);
    if (sl) {
      sl.element.remove();
      this.settlementLabels.delete(factionId);
    }
  }

  private removeBubble(entityId: number): void {
    const idx = this.bubbles.findIndex(b => b.entityId === entityId);
    if (idx >= 0) {
      this.bubbles[idx].element.remove();
      this.bubbles.splice(idx, 1);
    }
  }

  update(positions: Map<number, THREE.Vector3>): void {
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;

    // Update speech bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      bubble.timer--;

      if (bubble.timer <= 0) {
        bubble.element.remove();
        this.bubbles.splice(i, 1);
        continue;
      }

      const pos = positions.get(bubble.entityId);
      if (pos) {
        const screen = this.worldToScreen(pos, width, height, 1.4);
        if (screen) {
          // CSS transition handles the smooth interpolation
          bubble.element.style.left = screen.x + 'px';
          bubble.element.style.top = screen.y + 'px';
          bubble.element.style.display = '';
          bubble.lastX = screen.x;
          bubble.lastY = screen.y;
        } else {
          bubble.element.style.display = 'none';
        }
      }

      // Fade out in last 20 frames
      if (bubble.timer < 20) {
        bubble.element.style.opacity = String(bubble.timer / 20);
      }
    }

    // Update labels
    for (const [eid, label] of this.labels) {
      const pos = positions.get(eid);
      if (pos) {
        const screen = this.worldToScreen(pos, width, height, 0.8);
        if (screen) {
          label.element.style.left = screen.x + 'px';
          label.element.style.top = screen.y + 'px';
          label.element.style.display = '';
          label.lastX = screen.x;
          label.lastY = screen.y;
        } else {
          label.element.style.display = 'none';
        }
      }
    }

    // Update settlement labels
    for (const [, sl] of this.settlementLabels) {
      const screen = this.worldToScreen(sl.worldPos, width, height, 4.0);
      if (screen) {
        sl.element.style.left = screen.x + 'px';
        sl.element.style.top = screen.y + 'px';
        sl.element.style.display = '';
      } else {
        sl.element.style.display = 'none';
      }
    }
  }

  private worldToScreen(
    worldPos: THREE.Vector3, w: number, h: number, yOffset: number
  ): { x: number; y: number } | null {
    const pos = worldPos.clone();
    pos.y += yOffset;
    pos.project(this.camera);

    if (pos.z > 1) return null; // behind camera

    return {
      x: (pos.x * 0.5 + 0.5) * w,
      y: (-pos.y * 0.5 + 0.5) * h,
    };
  }

  cleanup(): void {
    this.container.remove();
  }
}
