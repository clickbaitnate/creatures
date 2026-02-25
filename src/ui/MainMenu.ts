// Main menu — shown on launch, supports New World (seed) and Load World (drag-drop)

import { loadAllRuns, exportRunsCSV, clearAllRuns, type RunRecord } from '../stats/SimStats';
import { CelestialGlobe } from './CelestialGlobe';

export class MainMenu {
  private root: HTMLDivElement;
  private seedInput: HTMLInputElement | null = null;
  private globe: CelestialGlobe | null = null;

  onNewWorld: ((seed: number) => void) | null = null;
  onLoadWorld: ((file: File) => void) | null = null;
  onPvPArena: (() => void) | null = null;
  trackingEnabled = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.innerHTML = this.buildHTML();
    this.injectCSS();
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
    this.bindEvents();
  }

  show(): void {
    this.root.style.display = 'flex';
    // Start celestial globe
    if (!this.globe) {
      this.globe = new CelestialGlobe();
      const backdrop = this.root.querySelector('.menu-backdrop') as HTMLElement;
      if (backdrop) this.globe.mount(backdrop);
    }
    // Generate a fresh random seed
    this.seedInput = this.root.querySelector('#menu-seed') as HTMLInputElement;
    if (this.seedInput) {
      this.seedInput.value = String(Math.floor(Math.random() * 999999));
    }
    // Restore toggle state
    const toggle = this.root.querySelector('#menu-tracking-toggle') as HTMLInputElement;
    if (toggle) toggle.checked = this.trackingEnabled;
    this.updateRunSummary();
  }

  private async updateRunSummary(): Promise<void> {
    const el = this.root.querySelector('#menu-run-summary') as HTMLDivElement;
    if (!el) return;
    const runs = await loadAllRuns();
    if (runs.length === 0) {
      el.innerHTML = '<span class="run-empty">No runs recorded yet</span>';
      return;
    }
    // Aggregate stats across all runs
    const totals = runs.reduce((acc, r) => ({
      runs: acc.runs + 1,
      ticks: acc.ticks + r.ticks,
      deaths: acc.deaths + r.deaths,
      starve: acc.starve + r.deathsByStarvation,
      age: acc.age + r.deathsByAge,
      combat: acc.combat + r.deathsByCombat,
      lifespan: acc.lifespan + r.avgLifespan * r.deaths,
      eaten: acc.eaten + r.totalFoodEaten,
      gathered: acc.gathered + r.totalFoodGathered,
      crafts: acc.crafts + r.totalCrafts,
      trades: acc.trades + r.totalTrades,
      peakPop: Math.max(acc.peakPop, r.peakPopulation),
    }), { runs: 0, ticks: 0, deaths: 0, starve: 0, age: 0, combat: 0, lifespan: 0, eaten: 0, gathered: 0, crafts: 0, trades: 0, peakPop: 0 });

    const avgLife = totals.deaths > 0 ? Math.round(totals.lifespan / totals.deaths) : 0;
    const starveP = totals.deaths > 0 ? Math.round(totals.starve / totals.deaths * 100) : 0;
    el.innerHTML = `
      <div class="run-stat-grid">
        <span class="rs-label">Runs</span><span class="rs-value">${totals.runs}</span>
        <span class="rs-label">Deaths</span><span class="rs-value">${totals.deaths}</span>
        <span class="rs-label">Starve%</span><span class="rs-value ${starveP > 50 ? 'rs-bad' : 'rs-ok'}">${starveP}%</span>
        <span class="rs-label">Avg life</span><span class="rs-value">${avgLife}t</span>
        <span class="rs-label">Peak pop</span><span class="rs-value">${totals.peakPop}</span>
        <span class="rs-label">Eaten</span><span class="rs-value">${totals.eaten}</span>
        <span class="rs-label">Gathered</span><span class="rs-value">${totals.gathered}</span>
        <span class="rs-label">Crafts</span><span class="rs-value">${totals.crafts}</span>
      </div>
    `;
  }

  hide(): void {
    this.root.style.display = 'none';
    if (this.globe) {
      this.globe.dispose();
      this.globe = null;
    }
  }

  private buildHTML(): string {
    return `
      <div class="menu-backdrop"></div>
      <div class="menu-container">
        <div class="menu-header">
          <h1 class="menu-title">Seres</h1>
          <p class="menu-subtitle">Emergent Life Simulator</p>
        </div>

        <div class="menu-section">
          <h2 class="menu-section-title">NEW WORLD</h2>
          <div class="seed-row">
            <label for="menu-seed">Seed</label>
            <input type="text" id="menu-seed" value="42" spellcheck="false" autocomplete="off" />
            <button id="menu-random-seed" title="Random seed">&#x1f3b2;</button>
          </div>
          <button id="menu-start" class="menu-btn primary">Generate World</button>
        </div>

        <div class="menu-section" style="margin-top:8px">
          <button id="menu-pvp" class="menu-btn arena">⚔️ PvP Arena</button>
        </div>

        <div class="menu-divider">
          <span>OR</span>
        </div>

        <div class="menu-section">
          <h2 class="menu-section-title">LOAD WORLD</h2>
          <div id="menu-drop-zone" class="drop-zone">
            <div class="drop-icon">&#x1F4C2;</div>
            <p>Drag & drop a <strong>.seres</strong> save file here</p>
            <p class="drop-hint">or click to browse</p>
            <input type="file" id="menu-file-input" accept=".seres,.creatures" style="display:none" />
          </div>
        </div>

        <div class="menu-section tracking-section">
          <div class="tracking-row">
            <label class="toggle-label">
              <input type="checkbox" id="menu-tracking-toggle" />
              <span class="toggle-slider"></span>
              <span class="toggle-text">Record run data</span>
            </label>
            <button id="menu-export-data" class="menu-btn-small" title="Export all runs as CSV">Export CSV</button>
            <button id="menu-clear-data" class="menu-btn-small danger" title="Delete all run data">Clear</button>
          </div>
          <div id="menu-run-summary" class="run-summary"></div>
        </div>

        <div class="menu-footer">
          <span class="menu-version">v0.1</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // New World button
    const startBtn = this.root.querySelector('#menu-start') as HTMLButtonElement;
    startBtn?.addEventListener('click', () => {
      const seedStr = (this.root.querySelector('#menu-seed') as HTMLInputElement)?.value || '42';
      const seed = this.parseSeed(seedStr);
      this.onNewWorld?.(seed);
    });

    // PvP Arena button
    const pvpBtn = this.root.querySelector('#menu-pvp') as HTMLButtonElement;
    pvpBtn?.addEventListener('click', () => {
      this.onPvPArena?.();
    });

    // Random seed button
    const randomBtn = this.root.querySelector('#menu-random-seed') as HTMLButtonElement;
    randomBtn?.addEventListener('click', () => {
      const input = this.root.querySelector('#menu-seed') as HTMLInputElement;
      if (input) input.value = String(Math.floor(Math.random() * 999999));
    });

    // Enter key on seed input
    const seedInput = this.root.querySelector('#menu-seed') as HTMLInputElement;
    seedInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startBtn?.click();
    });

    // Drop zone
    const dropZone = this.root.querySelector('#menu-drop-zone') as HTMLDivElement;
    const fileInput = this.root.querySelector('#menu-file-input') as HTMLInputElement;

    dropZone?.addEventListener('click', () => fileInput?.click());
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file) this.onLoadWorld?.(file);
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.onLoadWorld?.(file);
    });

    // Global drag-drop (also works when game is running)
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      // Only handle if menu is hidden (in-game drop)
      if (this.root.style.display !== 'none') return;
      const file = e.dataTransfer?.files[0];
      if (file && (file.name.endsWith('.seres') || file.name.endsWith('.creatures'))) {
        this.onLoadWorld?.(file);
      }
    });

    // Tracking toggle
    const trackToggle = this.root.querySelector('#menu-tracking-toggle') as HTMLInputElement;
    trackToggle?.addEventListener('change', () => {
      this.trackingEnabled = trackToggle.checked;
    });

    // Export CSV
    const exportBtn = this.root.querySelector('#menu-export-data') as HTMLButtonElement;
    exportBtn?.addEventListener('click', async () => {
      const csv = await exportRunsCSV();
      if (!csv) { alert('No run data yet.'); return; }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seres-runs-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Clear data
    const clearBtn = this.root.querySelector('#menu-clear-data') as HTMLButtonElement;
    clearBtn?.addEventListener('click', async () => {
      if (confirm('Delete all saved run data?')) {
        await clearAllRuns();
        this.updateRunSummary();
      }
    });
  }

  private parseSeed(str: string): number {
    // If it's a number, use it directly
    const num = parseInt(str, 10);
    if (!isNaN(num)) return Math.abs(num) % 2147483647 || 1;
    // Otherwise hash the string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  private injectCSS(): void {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap');

      @font-face {
        font-family: 'Genty';
        src: url('/fonts/GentyDemo-Regular.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }

      #main-menu {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
      }

      #main-menu .menu-backdrop {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #0a0a15 70%, #000 100%);
      }

      /* Animated subtle stars */
      #main-menu .menu-backdrop::before {
        content: ''; position: absolute; inset: 0;
        background-image:
          radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%),
          radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3) 0%, transparent 100%),
          radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.3) 0%, transparent 100%),
          radial-gradient(1px 1px at 90% 40%, rgba(255,255,255,0.4) 0%, transparent 100%),
          radial-gradient(1.5px 1.5px at 15% 75%, rgba(100,200,255,0.6) 0%, transparent 100%),
          radial-gradient(1.5px 1.5px at 85% 25%, rgba(255,180,100,0.5) 0%, transparent 100%);
        animation: twinkle 8s ease-in-out infinite alternate;
      }
      @keyframes twinkle { 0% { opacity: 0.6; } 100% { opacity: 1; } }

      #main-menu .menu-container {
        position: relative; z-index: 1;
        width: 420px; max-width: 95vw;
        background: rgba(10,10,25,0.75);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(100,140,255,0.2);
        border-radius: 16px;
        padding: 40px 36px;
        box-shadow: 0 0 80px rgba(60,100,255,0.15), 0 20px 60px rgba(0,0,0,0.5);
      }

      #main-menu .menu-header { text-align: center; margin-bottom: 32px; }

      #main-menu .menu-title {
        font-family: 'Genty', 'Inter', sans-serif;
        font-size: 72px; font-weight: normal; letter-spacing: -2px;
        background: linear-gradient(90deg,
          #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff, #ff00ff, #ff0000
        );
        background-size: 300% 100%;
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text; margin: 0;
        text-shadow: none;
        filter: drop-shadow(0 0 40px rgba(180,100,255,0.6))
                drop-shadow(0 0 80px rgba(100,180,255,0.3))
                drop-shadow(0 0 120px rgba(255,100,200,0.2));
        animation: rainbow-shift 4s linear infinite, title-glow 3s ease-in-out infinite alternate;
      }
      @keyframes rainbow-shift {
        0% { background-position: 0% 50%; }
        100% { background-position: 300% 50%; }
      }
      @keyframes title-glow {
        0% { filter: drop-shadow(0 0 40px rgba(180,100,255,0.6)) drop-shadow(0 0 80px rgba(100,180,255,0.3)) drop-shadow(0 0 120px rgba(255,100,200,0.2)); }
        100% { filter: drop-shadow(0 0 60px rgba(255,150,100,0.7)) drop-shadow(0 0 100px rgba(150,255,180,0.4)) drop-shadow(0 0 150px rgba(100,150,255,0.3)); }
      }

      #main-menu .menu-subtitle {
        color: rgba(180,200,255,0.5); font-size: 13px;
        letter-spacing: 3px; text-transform: uppercase;
        margin-top: 8px;
      }

      #main-menu .menu-section { margin-bottom: 20px; }
      #main-menu .menu-section-title {
        font-size: 11px; font-weight: 600; letter-spacing: 2px;
        color: rgba(150,180,255,0.6); text-transform: uppercase;
        margin: 0 0 12px 0;
      }

      #main-menu .seed-row {
        display: flex; gap: 8px; align-items: center; margin-bottom: 14px;
      }
      #main-menu .seed-row label {
        font-size: 13px; color: rgba(200,210,255,0.7); min-width: 36px;
      }
      #main-menu .seed-row input {
        flex: 1; padding: 8px 12px;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(100,140,255,0.2);
        border-radius: 8px; color: #e0e8ff; font-size: 14px;
        font-family: 'JetBrains Mono', monospace;
        outline: none; transition: border-color 0.2s;
      }
      #main-menu .seed-row input:focus {
        border-color: rgba(100,160,255,0.5);
      }
      #main-menu .seed-row button {
        width: 36px; height: 36px;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(100,140,255,0.2);
        border-radius: 8px; cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
      }
      #main-menu .seed-row button:hover {
        background: rgba(100,140,255,0.15);
      }

      #main-menu .menu-btn {
        width: 100%; padding: 12px; border: none; border-radius: 10px;
        font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
        letter-spacing: 1px; cursor: pointer; transition: all 0.2s;
      }
      #main-menu .menu-btn.primary {
        background: linear-gradient(135deg, #4a7cf7 0%, #7c5bf0 100%);
        color: white;
        box-shadow: 0 4px 20px rgba(90,120,255,0.3);
      }
      #main-menu .menu-btn.primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 30px rgba(90,120,255,0.5);
      }
      #main-menu .menu-btn.primary:active { transform: translateY(0); }

      #main-menu .menu-btn.arena {
        background: linear-gradient(135deg, #c0392b 0%, #e74c3c 50%, #f39c12 100%);
        color: white;
        box-shadow: 0 4px 20px rgba(231,76,60,0.3);
        letter-spacing: 2px;
      }
      #main-menu .menu-btn.arena:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 30px rgba(231,76,60,0.5);
      }
      #main-menu .menu-btn.arena:active { transform: translateY(0); }

      #main-menu .menu-divider {
        display: flex; align-items: center; gap: 16px;
        margin: 24px 0; color: rgba(150,170,255,0.3); font-size: 12px;
        letter-spacing: 2px;
      }
      #main-menu .menu-divider::before,
      #main-menu .menu-divider::after {
        content: ''; flex: 1; height: 1px;
        background: rgba(100,140,255,0.15);
      }

      #main-menu .drop-zone {
        border: 2px dashed rgba(100,140,255,0.25);
        border-radius: 12px; padding: 28px 20px;
        text-align: center; cursor: pointer;
        transition: all 0.2s;
        background: rgba(255,255,255,0.02);
      }
      #main-menu .drop-zone:hover,
      #main-menu .drop-zone.drag-over {
        border-color: rgba(100,160,255,0.5);
        background: rgba(100,140,255,0.06);
      }
      #main-menu .drop-zone .drop-icon {
        font-size: 32px; margin-bottom: 8px; opacity: 0.7;
      }
      #main-menu .drop-zone p {
        margin: 4px 0; color: rgba(180,200,255,0.6); font-size: 13px;
      }
      #main-menu .drop-zone strong { color: rgba(180,200,255,0.9); }
      #main-menu .drop-zone .drop-hint {
        font-size: 11px; color: rgba(150,170,255,0.4);
      }

      /* Tracking section */
      #main-menu .tracking-section {
        border-top: 1px solid rgba(100,140,255,0.1);
        padding-top: 16px; margin-top: 8px;
      }
      #main-menu .tracking-row {
        display: flex; align-items: center; gap: 8px;
      }
      #main-menu .toggle-label {
        display: flex; align-items: center; gap: 8px;
        cursor: pointer; flex: 1;
      }
      #main-menu .toggle-label input { display: none; }
      #main-menu .toggle-slider {
        width: 32px; height: 18px; border-radius: 9px;
        background: rgba(255,255,255,0.1); position: relative;
        transition: background 0.2s; flex-shrink: 0;
      }
      #main-menu .toggle-slider::after {
        content: ''; position: absolute; top: 2px; left: 2px;
        width: 14px; height: 14px; border-radius: 50%;
        background: rgba(200,210,255,0.5); transition: all 0.2s;
      }
      #main-menu .toggle-label input:checked + .toggle-slider {
        background: rgba(80,130,255,0.5);
      }
      #main-menu .toggle-label input:checked + .toggle-slider::after {
        left: 16px; background: #6ec6ff;
      }
      #main-menu .toggle-text {
        font-size: 12px; color: rgba(180,200,255,0.6);
      }
      #main-menu .menu-btn-small {
        padding: 5px 10px; border: 1px solid rgba(100,140,255,0.2);
        border-radius: 6px; background: rgba(255,255,255,0.04);
        color: rgba(180,200,255,0.6); font-size: 11px; cursor: pointer;
        font-family: 'Inter', sans-serif; transition: all 0.2s;
      }
      #main-menu .menu-btn-small:hover {
        background: rgba(100,140,255,0.12); color: #c0d0ff;
      }
      #main-menu .menu-btn-small.danger:hover {
        background: rgba(255,80,80,0.15); border-color: rgba(255,80,80,0.3);
        color: #ff9090;
      }
      #main-menu .run-summary { margin-top: 10px; }
      #main-menu .run-empty {
        font-size: 11px; color: rgba(150,170,255,0.3); font-style: italic;
      }
      #main-menu .run-stat-grid {
        display: grid; grid-template-columns: auto 1fr auto 1fr;
        gap: 3px 10px; font-size: 11px;
      }
      #main-menu .rs-label { color: rgba(150,170,255,0.4); }
      #main-menu .rs-value { color: rgba(200,215,255,0.7); font-family: 'JetBrains Mono', monospace; }
      #main-menu .rs-bad { color: #ff7070; }
      #main-menu .rs-ok { color: #70ff90; }

      #main-menu .menu-footer {
        text-align: center; margin-top: 24px;
      }
      #main-menu .menu-version {
        font-size: 11px; color: rgba(150,170,255,0.25);
        letter-spacing: 1px;
      }
    `;
    document.head.appendChild(style);
  }
}
