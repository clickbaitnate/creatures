// Canvas2D overlay panel for simulation charts
// Toggled with Tab key

import type { FactionManager, Faction } from '../world/FactionSystem';
import type { SephirothSystem } from '../world/Sephiroth';
import { SEPHIRAH_NAMES } from '../world/Sephiroth';
import type { ZodiacCycle } from '../world/Zodiac';
import { ZODIAC_NAMES, SIGN_DURATION, FULL_CYCLE } from '../world/Zodiac';

const WIDTH = 600;
const HEIGHT = 500;
const HISTORY_SIZE = 500; // ticks of history
const UPDATE_INTERVAL = 1; // tick() is already called from diplomacy timer

interface FactionHistory {
  population: number[];
  territory: number[];
}

export class ChartPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  visible: boolean = false;
  private history = new Map<number, FactionHistory>();
  private tickCounter = 0;

  factionManager: FactionManager | null = null;
  sephiroth: SephirothSystem | null = null;
  zodiac: ZodiacCycle | null = null;

  private selectedFactionId: number = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.style.cssText = `
      position:fixed; top:10px; right:10px; background:rgba(0,0,0,0.85);
      border-radius:8px; border:1px solid #444; display:none;
      pointer-events:auto; cursor:default;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Click to select faction
    this.canvas.addEventListener('click', (e) => {
      if (!this.factionManager) return;
      const factions = this.factionManager.activeFactions;
      const idx = Math.floor(e.offsetY / 20);
      if (idx < factions.length) {
        this.selectedFactionId = factions[idx].id;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.visible = !this.visible;
        this.canvas.style.display = this.visible ? 'block' : 'none';
        if (this.visible) this.draw();
      }
    });
  }

  tick(): void {
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL) return;
    this.tickCounter = 0;
    this.recordHistory();
    if (this.visible) this.draw();
  }

  private recordHistory(): void {
    if (!this.factionManager) return;
    for (const faction of this.factionManager.activeFactions) {
      if (!this.history.has(faction.id)) {
        this.history.set(faction.id, { population: [], territory: [] });
      }
      const h = this.history.get(faction.id)!;
      h.population.push(faction.memberIds.size);
      if (h.population.length > HISTORY_SIZE) h.population.shift();
      // Territory count would need territory system reference
      h.territory.push(faction.memberIds.size); // placeholder
      if (h.territory.length > HISTORY_SIZE) h.territory.shift();
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('Simulation Charts', 10, 20);

    // Population chart
    this.drawPopulationChart(40, 30, WIDTH - 60, 150);

    // Zodiac timeline
    this.drawZodiacTimeline(40, 200, WIDTH - 60, 30);

    // Sephiroth radar (if faction selected)
    this.drawSephirothRadar(WIDTH / 2, 370, 100);

    // Legend
    this.drawLegend(10, 250, 180, 200);
  }

  private drawPopulationChart(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('Population', x, y - 3);

    if (!this.factionManager) return;

    const maxPop = 50; // auto-scale
    let actualMax = 1;
    for (const [fid, hist] of this.history) {
      for (const p of hist.population) {
        if (p > actualMax) actualMax = p;
      }
    }
    const scale = h / Math.max(actualMax, 1);

    const factions = this.factionManager.activeFactions;
    for (const faction of factions) {
      const hist = this.history.get(faction.id);
      if (!hist || hist.population.length < 2) continue;

      const color = `hsl(${faction.color}, 70%, 50%)`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < hist.population.length; i++) {
        const px = x + (i / HISTORY_SIZE) * w;
        const py = y + h - hist.population[i] * scale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  private drawZodiacTimeline(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    if (!this.zodiac) return;

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('Zodiac Cycle', x, y - 3);

    // Draw 12 segments
    const segWidth = w / 12;
    for (let i = 0; i < 12; i++) {
      const isCurrent = i === this.zodiac.currentSign;
      ctx.fillStyle = isCurrent ? 'rgba(255,215,0,0.4)' : 'rgba(50,50,80,0.6)';
      ctx.fillRect(x + i * segWidth, y, segWidth - 1, h);

      ctx.fillStyle = isCurrent ? '#FFD700' : '#888';
      ctx.font = '8px monospace';
      ctx.fillText(ZODIAC_NAMES[i].substring(0, 3), x + i * segWidth + 2, y + h - 5);
    }

    // Progress bar in current segment
    const currentX = x + this.zodiac.currentSign * segWidth;
    ctx.fillStyle = 'rgba(255,215,0,0.6)';
    ctx.fillRect(currentX, y, segWidth * this.zodiac.progress, 3);
  }

  private drawSephirothRadar(cx: number, cy: number, radius: number): void {
    const ctx = this.ctx;
    if (!this.sephiroth || this.selectedFactionId < 0) {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText('Click faction in legend for Sephiroth radar', cx - 130, cy);
      return;
    }

    const values = this.sephiroth.getMetrics(this.selectedFactionId);
    if (!values) return;

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('Sephiroth', cx - 25, cy - radius - 10);

    // Draw radar
    const n = 10;
    const angleStep = (Math.PI * 2) / n;

    // Background circles
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.strokeStyle = 'rgba(100,100,100,0.3)';
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius * r;
        const py = cy + Math.sin(angle) * radius * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Data polygon
    ctx.fillStyle = 'rgba(100,200,255,0.2)';
    ctx.strokeStyle = 'rgba(100,200,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = idx * angleStep - Math.PI / 2;
      const val = values[idx] / 10;
      const px = cx + Math.cos(angle) * radius * val;
      const py = cy + Math.sin(angle) * radius * val;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;

    // Labels
    ctx.fillStyle = '#aaa';
    ctx.font = '8px monospace';
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const lx = cx + Math.cos(angle) * (radius + 15);
      const ly = cy + Math.sin(angle) * (radius + 15);
      ctx.fillText(SEPHIRAH_NAMES[i].substring(0, 4), lx - 12, ly + 3);
    }
  }

  private drawLegend(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    if (!this.factionManager) return;

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('Factions (click to select)', x, y - 3);

    const factions = this.factionManager.activeFactions;
    for (let i = 0; i < factions.length && i < 10; i++) {
      const f = factions[i];
      const fy = y + 5 + i * 18;
      const isSelected = f.id === this.selectedFactionId;

      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.15)' : 'transparent';
      ctx.fillRect(x, fy - 10, w, 16);

      ctx.fillStyle = `hsl(${f.color}, 70%, 50%)`;
      ctx.fillRect(x + 2, fy - 5, 8, 8);

      ctx.fillStyle = isSelected ? '#fff' : '#bbb';
      ctx.fillText(`${f.emoji} ${f.name} (${f.memberIds.size})`, x + 14, fy + 2);
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
