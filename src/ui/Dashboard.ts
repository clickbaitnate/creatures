// Analytics dashboard panel — toggled with D key
// Shows: sim stats, genetic drift, neural activity, event log

import type { World } from '../ecs/World';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { GenomeStore } from '../components/Genome';
import { BrainStore } from '../components/Brain';
import { BiochemStore } from '../components/Biochemistry';
import { TransformStore } from '../components/Transform';
import { SocialStore } from '../components/Social';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { NEURON_COUNT } from '../brain/CTRNN';
import type { FactionManager } from '../world/FactionSystem';
import type { DataLogger } from '../data/DataLogger';

const WIDTH = 650;
const HEIGHT = 550;
const UPDATE_INTERVAL = 50;

export class Dashboard {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  visible: boolean = false;
  private tickCounter = 0;
  private startTime = performance.now();

  factionManager: FactionManager | null = null;
  dataLogger: DataLogger | null = null;
  selectedCreatureId: number = -1;
  simTick: number = 0;

  // Genetic drift tracking
  private traitHistory: { tick: number; traits: Record<string, number> }[] = [];

  // Event log
  private eventLog: string[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.style.cssText = `
      position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.9);
      border-radius:8px; border:1px solid #555; display:none;
      pointer-events:auto;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
        if (e.ctrlKey || e.metaKey) return; // don't intercept devtools
        this.visible = !this.visible;
        this.canvas.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  logEvent(text: string): void {
    this.eventLog.push(text);
    if (this.eventLog.length > 100) this.eventLog.shift();
  }

  tick(world: World, tick: number): void {
    this.simTick = tick;
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL) return;
    this.tickCounter = 0;

    this.recordTraitDrift(world);
    if (this.visible) this.draw(world);
  }

  private recordTraitDrift(world: World): void {
    const creatures = world.query(GenomeStore.bit | LifecycleStore.bit);
    let aggSum = 0, socSum = 0, crSum = 0, gthSum = 0, hntSum = 0;
    let count = 0;

    for (const id of creatures) {
      const lc = LifecycleStore.get(id);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const gen = GenomeStore.get(id);
      if (!gen) continue;
      aggSum += gen.genome.aggression;
      socSum += gen.genome.sociability;
      crSum += gen.genome.creativity;
      gthSum += gen.genome.gatherAffinity;
      hntSum += gen.genome.huntAffinity;
      count++;
    }

    if (count > 0) {
      this.traitHistory.push({
        tick: this.simTick,
        traits: {
          aggression: aggSum / count,
          sociability: socSum / count,
          creativity: crSum / count,
          gather: gthSum / count,
          hunt: hntSum / count,
        },
      });
      if (this.traitHistory.length > 200) this.traitHistory.shift();
    }
  }

  private draw(world: World): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('Dashboard [D to close] [E to export]', 10, 20);

    // Simulation stats
    const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(0);
    const creatures = world.query(LifecycleStore.bit | TransformStore.bit);
    const alive = creatures.filter(id => {
      const lc = LifecycleStore.get(id);
      return lc && lc.stage === LifeStage.Alive;
    });
    const factionCount = this.factionManager?.activeFactions.length ?? 0;

    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    let y = 40;
    ctx.fillText(`Tick: ${this.simTick}  Time: ${elapsed}s  Pop: ${alive.length}  Factions: ${factionCount}`, 10, y);

    // Genetic drift chart
    y += 20;
    ctx.fillStyle = '#888';
    ctx.fillText('Genetic Drift (trait averages over time)', 10, y);
    y += 5;
    this.drawTraitChart(10, y, WIDTH - 20, 120);

    // Neural activity heatmap for selected creature
    y += 135;
    ctx.fillStyle = '#888';
    ctx.fillText('Neural Activity (selected creature)', 10, y);
    y += 5;
    this.drawNeuralHeatmap(10, y, WIDTH - 20, 60, world);

    // Event log
    y += 75;
    ctx.fillStyle = '#888';
    ctx.fillText('Event Log', 10, y);
    y += 5;
    this.drawEventLog(10, y, WIDTH - 20, HEIGHT - y - 10);
  }

  private drawTraitChart(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    if (this.traitHistory.length < 2) return;

    const COLORS: Record<string, string> = {
      aggression: '#ff4444',
      sociability: '#44aaff',
      creativity: '#ffaa00',
      gather: '#44ff44',
      hunt: '#ff44ff',
    };

    for (const [trait, color] of Object.entries(COLORS)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < this.traitHistory.length; i++) {
        const px = x + (i / 200) * w;
        const val = this.traitHistory[i].traits[trait] ?? 0;
        const py = y + h - val * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // Legend
    let lx = x + 5;
    for (const [trait, color] of Object.entries(COLORS)) {
      ctx.fillStyle = color;
      ctx.font = '8px monospace';
      ctx.fillText(trait.substring(0, 4), lx, y + 10);
      lx += 50;
    }
  }

  private drawNeuralHeatmap(x: number, y: number, w: number, h: number, world: World): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    if (this.selectedCreatureId < 0) {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText('Select a creature to view neural activity', x + 10, y + h / 2);
      return;
    }

    const brainData = BrainStore.get(this.selectedCreatureId);
    if (!brainData) return;

    const cellW = w / NEURON_COUNT;
    const cellH = h;

    for (let i = 0; i < NEURON_COUNT; i++) {
      const val = brainData.brain.outputs[i];
      const intensity = Math.min(1, Math.abs(val));
      const hue = val >= 0 ? 120 : 0; // green for positive, red for negative
      ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${intensity})`;
      ctx.fillRect(x + i * cellW, y, cellW - 0.5, cellH);
    }

    // Labels
    ctx.fillStyle = '#888';
    ctx.font = '7px monospace';
    ctx.fillText('D', x, y + h + 8);
    ctx.fillText('S', x + 4 * cellW, y + h + 8);
    ctx.fillText('C', x + 20 * cellW, y + h + 8);
    ctx.fillText('P', x + 36 * cellW, y + h + 8);
    ctx.fillText('A', x + 44 * cellW, y + h + 8);
  }

  private drawEventLog(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#999';
    ctx.font = '9px monospace';
    const visibleLines = Math.floor(h / 12);
    const startIdx = Math.max(0, this.eventLog.length - visibleLines);

    for (let i = startIdx; i < this.eventLog.length; i++) {
      const ly = y + (i - startIdx + 1) * 12;
      ctx.fillText(this.eventLog[i].substring(0, 80), x + 3, ly);
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
