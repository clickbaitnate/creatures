// Game UI: sleek dark glass panels with creature navigation, stats, and faction info.
// Replaces the old monospace HUD overlay.

import type { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { BiochemStore } from '../components/Biochemistry';
import { GenomeStore } from '../components/Genome';
import { SocialStore, Activity } from '../components/Social';
import { ExpressionStore } from '../components/Expression';
import { InventoryStore, ITEM_NAMES, ItemType } from '../components/Inventory';
import { VocabularyStore } from '../components/Vocabulary';
import { MemoryStore, MEMORY_SLOTS } from '../components/Memory';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { getBreedLabel } from '../genome/Genome';
import type { FactionManager, Faction } from '../world/FactionSystem';
import type { PoliticsSystem } from '../world/PoliticsSystem';
import { GOVERNMENT_NAMES } from '../world/PoliticsSystem';
import type { HierarchySystem } from '../world/HierarchySystem';
import type { DayNightState } from '../world/DayNightCycle';
import type { SeasonState } from '../world/Seasons';
import { SEASON_NAMES } from '../world/Seasons';

// ── CSS Injection ─────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

#game-ui {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #e0e0e0;
  font-size: 12px;
  z-index: 100;
  user-select: none;
}

#game-ui * {
  box-sizing: border-box;
}

/* ── Shared panel style ── */
.gui-panel {
  background: linear-gradient(135deg, rgba(12, 14, 20, 0.88), rgba(18, 22, 32, 0.82));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(80, 120, 160, 0.2);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  pointer-events: auto;
}

/* ── Top Bar ── */
#gui-topbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 6px;
  border-radius: 12px;
}

.topbar-cell {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.topbar-cell .icon {
  font-size: 14px;
}

.topbar-cell .label {
  color: rgba(255, 255, 255, 0.45);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.topbar-cell .value {
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
}

.topbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(80, 140, 200, 0.2);
  margin: 0 4px;
}

/* ── Left Panel: Factions ── */
#gui-factions {
  position: absolute;
  top: 70px;
  left: 12px;
  width: 220px;
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  padding: 12px;
}

#gui-factions::-webkit-scrollbar {
  width: 4px;
}
#gui-factions::-webkit-scrollbar-thumb {
  background: rgba(100, 160, 220, 0.3);
  border-radius: 2px;
}

.faction-header {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: rgba(120, 180, 255, 0.6);
  margin-bottom: 8px;
  font-weight: 600;
}

.faction-card {
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border-left: 3px solid transparent;
  transition: background 0.15s, border-color 0.15s;
  cursor: pointer;
}

.faction-card:hover {
  background: rgba(255, 255, 255, 0.06);
}

.faction-name {
  font-weight: 600;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.faction-detail {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
  font-family: 'JetBrains Mono', monospace;
}

.faction-relations {
  display: flex;
  gap: 3px;
  margin-top: 3px;
  flex-wrap: wrap;
}

.faction-rel {
  font-size: 10px;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
}

/* ── Right Panel: Selected Creature ── */
#gui-creature {
  position: absolute;
  top: 70px;
  right: 12px;
  width: 260px;
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  padding: 14px;
}

#gui-creature::-webkit-scrollbar {
  width: 4px;
}
#gui-creature::-webkit-scrollbar-thumb {
  background: rgba(100, 160, 220, 0.3);
  border-radius: 2px;
}

.creature-empty {
  text-align: center;
  padding: 20px 10px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
}

.creature-empty .hint {
  margin-top: 8px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.2);
  line-height: 1.6;
}

.creature-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.creature-subtitle {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 10px;
}

.stat-section {
  margin-bottom: 10px;
}

.stat-section-title {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(120, 180, 255, 0.5);
  margin-bottom: 5px;
  font-weight: 600;
}

.stat-bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 3px;
  gap: 6px;
}

.stat-bar-label {
  width: 52px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.stat-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  position: relative;
}

.stat-bar-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent);
  border-radius: 3px 3px 0 0;
}

.stat-bar-value {
  width: 30px;
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  font-size: 10px;
}

.stat-grid-item {
  display: flex;
  justify-content: space-between;
}

.stat-grid-label {
  color: rgba(255, 255, 255, 0.4);
}

.stat-grid-value {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.creature-inventory {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.5;
}

.mood-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}

.vocab-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.vocab-emoji {
  font-size: 14px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
}

.vocab-new {
  animation: vocabPop 0.4s ease;
  background: rgba(80, 160, 255, 0.15);
}

@keyframes vocabPop {
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.weapon-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(239, 68, 68, 0.15);
  color: rgba(255, 180, 180, 0.9);
}

/* ── Bottom Strip: Creature Nav ── */
#gui-creature-nav {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  max-width: calc(100vw - 24px);
  overflow-x: auto;
}

#gui-creature-nav::-webkit-scrollbar {
  height: 3px;
}
#gui-creature-nav::-webkit-scrollbar-thumb {
  background: rgba(100, 160, 220, 0.3);
  border-radius: 2px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(80, 140, 220, 0.15);
  border: 1px solid rgba(80, 140, 220, 0.2);
  color: rgba(120, 180, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  pointer-events: auto;
}

.nav-btn:hover {
  background: rgba(80, 140, 220, 0.3);
  color: #fff;
}

.creature-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  pointer-events: auto;
  font-size: 10px;
}

.creature-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(120, 180, 255, 0.2);
}

.creature-chip.selected {
  background: rgba(80, 140, 220, 0.2);
  border-color: rgba(80, 160, 255, 0.5);
  color: #fff;
  box-shadow: 0 0 8px rgba(80, 160, 255, 0.15);
}

.chip-emoji {
  font-size: 12px;
}

.chip-name {
  font-weight: 500;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-hp {
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.chip-hp-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

/* ── Hotkey hints ── */
.hotkey {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.4);
  vertical-align: middle;
}

/* ── Animations ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.gui-panel {
  animation: fadeIn 0.3s ease;
}
`;

// ── Color helpers ─────────────────────────────────────────────

const BAR_COLORS: Record<string, string> = {
  energy:  'linear-gradient(90deg, #f59e0b, #fbbf24)',
  glucose: 'linear-gradient(90deg, #10b981, #34d399)',
  hunger:  'linear-gradient(90deg, #ef4444, #f87171)',
  life:    'linear-gradient(90deg, #8b5cf6, #a78bfa)',
  health:  'linear-gradient(90deg, #22c55e, #4ade80)',
  anxiety: 'linear-gradient(90deg, #f43f5e, #fb7185)',
};

function hpColor(hp: number): string {
  if (hp > 0.6) return '#22c55e';
  if (hp > 0.3) return '#f59e0b';
  return '#ef4444';
}

function moodColor(mood: number): string {
  if (mood > 0.3) return 'rgba(34, 197, 94, 0.2)';
  if (mood < -0.3) return 'rgba(239, 68, 68, 0.2)';
  return 'rgba(255, 255, 255, 0.06)';
}

function moodIcon(mood: number): string {
  if (mood > 0.3) return '😊';
  if (mood < -0.3) return '😟';
  return '😐';
}

const ACTIVITY_LABELS: Record<number, string> = {
  0: 'Idle', 1: 'Walking', 2: 'Eating', 3: 'Talking',
  4: 'Fighting', 5: 'Mating', 6: 'Building', 7: 'Gathering',
};

// ── GameUI Class ──────────────────────────────────────────────

export interface GameUIConfig {
  world: World;
  factionManager: FactionManager;
  politicsSystem: PoliticsSystem;
  hierarchySystem: HierarchySystem;
  dayNight: DayNightState;
  seasonState: SeasonState;
  generation: () => number;
  selectedId: () => number;
  onSelectCreature: (id: number) => void;
  onCycleCreature: (dir: number) => void;
}

export class GameUI {
  private root: HTMLDivElement;
  private topbar: HTMLDivElement;
  private factionPanel: HTMLDivElement;
  private creaturePanel: HTMLDivElement;
  private navStrip: HTMLDivElement;
  private cfg: GameUIConfig;

  // Cached elements for efficient updates
  private topCells: Record<string, HTMLSpanElement> = {};
  private factionContainer: HTMLDivElement;
  private creatureContainer: HTMLDivElement;
  private navContainer: HTMLDivElement;

  // Creature nav state
  private navCreatureIds: number[] = [];

  constructor(cfg: GameUIConfig) {
    this.cfg = cfg;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Root
    this.root = document.createElement('div');
    this.root.id = 'game-ui';
    document.body.appendChild(this.root);

    // Top bar
    this.topbar = document.createElement('div');
    this.topbar.id = 'gui-topbar';
    this.topbar.className = 'gui-panel';
    this.root.appendChild(this.topbar);
    this.buildTopbar();

    // Faction panel
    this.factionPanel = document.createElement('div');
    this.factionPanel.id = 'gui-factions';
    this.factionPanel.className = 'gui-panel';
    this.root.appendChild(this.factionPanel);
    this.factionContainer = document.createElement('div');
    const fHeader = document.createElement('div');
    fHeader.className = 'faction-header';
    fHeader.textContent = 'Factions';
    this.factionPanel.appendChild(fHeader);
    this.factionPanel.appendChild(this.factionContainer);

    // Creature panel
    this.creaturePanel = document.createElement('div');
    this.creaturePanel.id = 'gui-creature';
    this.creaturePanel.className = 'gui-panel';
    this.root.appendChild(this.creaturePanel);
    this.creatureContainer = document.createElement('div');
    this.creaturePanel.appendChild(this.creatureContainer);

    // Bottom nav strip
    this.navStrip = document.createElement('div');
    this.navStrip.id = 'gui-creature-nav';
    this.navStrip.className = 'gui-panel';
    this.root.appendChild(this.navStrip);
    this.navContainer = document.createElement('div');
    this.navContainer.style.display = 'contents';
    this.navStrip.appendChild(this.navContainer);
  }

  private buildTopbar(): void {
    const cells = [
      { key: 'daynight', icon: '☀️', label: 'CYCLE' },
      null, // divider
      { key: 'season', icon: '🌿', label: 'SEASON' },
      null,
      { key: 'pop', icon: '👥', label: 'POP' },
      null,
      { key: 'gen', icon: '🧬', label: 'GEN' },
    ];

    for (const cell of cells) {
      if (cell === null) {
        const div = document.createElement('div');
        div.className = 'topbar-divider';
        this.topbar.appendChild(div);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'topbar-cell';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = cell.icon;
      const valSpan = document.createElement('span');
      valSpan.className = 'value';
      valSpan.textContent = '—';
      el.appendChild(iconSpan);
      el.appendChild(valSpan);
      this.topbar.appendChild(el);
      this.topCells[cell.key] = valSpan;
      // Store icon ref for daynight updates
      if (cell.key === 'daynight') {
        (this.topCells as any)['daynight_icon'] = iconSpan;
      }
    }
  }

  update(): void {
    this.updateTopbar();
    this.updateFactions();
    this.updateCreaturePanel();
    this.updateNavStrip();
  }

  private updateTopbar(): void {
    const dn = this.cfg.dayNight;
    const ss = this.cfg.seasonState;

    // Day/night
    const dayIcon = dn.isNight ? '🌙' : '☀️';
    const phase = dn.isNight ? 'Night' : dn.timeOfDay < 0.4 ? 'Morning' : dn.timeOfDay < 0.6 ? 'Noon' : 'Evening';
    ((this.topCells as any)['daynight_icon'] as HTMLSpanElement).textContent = dayIcon;
    this.topCells['daynight'].textContent = `Day ${dn.dayCount} · ${phase}`;

    // Season
    this.topCells['season'].textContent = SEASON_NAMES[ss.season];

    // Population
    const alive = this.getAliveIds();
    this.topCells['pop'].textContent = `${alive.length}`;

    // Generation
    this.topCells['gen'].textContent = `${this.cfg.generation()}`;
  }

  private updateFactions(): void {
    const factions = this.cfg.factionManager.activeFactions;
    const html: string[] = [];

    for (const f of factions) {
      const nation = this.cfg.politicsSystem.getNation(f.id);
      const govName = nation ? GOVERNMENT_NAMES[nation.government] : '';
      const terrCount = nation ? nation.territory : 0;
      const borderColor = `hsl(${f.color}, 60%, 45%)`;

      let relHtml = '';
      for (const f2 of factions) {
        if (f.id === f2.id) continue;
        const rel = f.relations.get(f2.id) ?? 0;
        const atWar = nation?.warTargets.has(f2.id);
        const allied = nation?.allies.has(f2.id);
        if (atWar) {
          relHtml += `<span class="faction-rel">⚔️${f2.emoji}</span>`;
        } else if (allied) {
          relHtml += `<span class="faction-rel">🤝${f2.emoji}</span>`;
        } else if (Math.abs(rel) > 0.2) {
          const icon = rel > 0.3 ? '🤝' : rel < -0.3 ? '😡' : '😐';
          relHtml += `<span class="faction-rel">${icon}${f2.emoji}</span>`;
        }
      }

      html.push(`
        <div class="faction-card" style="border-left-color:${borderColor}">
          <div class="faction-name">${f.emoji} ${f.name} <span style="color:rgba(255,255,255,0.3);font-size:10px">(${f.memberIds.size})</span></div>
          <div class="faction-detail">${govName}${terrCount > 0 ? ' T:' + terrCount : ''}${f.philosophy ? ' · ' + f.philosophy : ''}${f.doctrine?.length ? ' ' + f.doctrine.join('') : ''}</div>
          ${relHtml ? '<div class="faction-relations">' + relHtml + '</div>' : ''}
        </div>
      `);
    }

    this.factionContainer.innerHTML = html.join('');
  }

  private updateCreaturePanel(): void {
    const selId = this.cfg.selectedId();
    if (selId < 0 || !this.cfg.world.has(selId)) {
      this.creatureContainer.innerHTML = `
        <div class="creature-empty">
          <div style="font-size:28px;margin-bottom:8px;opacity:0.3">👆</div>
          Click a creature to inspect
          <div class="hint">
            <span class="hotkey">[</span> <span class="hotkey">]</span> Cycle creatures<br>
            <span class="hotkey">F</span> Follow selected<br>
            <span class="hotkey">P</span> Possess<br>
            <span class="hotkey">Esc</span> Deselect<br>
            <span class="hotkey">Tab</span> Charts &nbsp; <span class="hotkey">D</span> Dashboard
          </div>
        </div>
      `;
      return;
    }

    const lc = LifecycleStore.get(selId);
    const bio = BiochemStore.get(selId);
    const gen = GenomeStore.get(selId);
    const social = SocialStore.get(selId);
    const expr = ExpressionStore.get(selId);
    const inv = InventoryStore.get(selId);
    const mem = MemoryStore.get(selId);
    if (!lc || !bio || !gen || !social) {
      this.creatureContainer.innerHTML = '<div class="creature-empty">No data</div>';
      return;
    }

    const c = bio.chemicals;
    const g = gen.genome;
    const faction = this.cfg.factionManager.getFaction(selId);
    const rank = this.cfg.hierarchySystem.getRank(selId);
    const sexIcon = g.sex === 0 ? '♂' : '♀';
    const stageIcon = lc.stage === LifeStage.Alive ? '❤️' : '💀';
    const factionBit = faction ? `${faction.emoji} ${faction.name}` : 'Wanderer';
    const breedLabel = getBreedLabel(g);

    // Mood badge
    let moodHtml = '';
    if (expr) {
      const mi = moodIcon(expr.mood);
      const mc = moodColor(expr.mood);
      moodHtml = `<span class="mood-badge" style="background:${mc}">${mi} ${expr.dominant} ${expr.mood >= 0 ? '+' : ''}${expr.mood.toFixed(2)}</span>`;
    }

    // Activity
    const actLabel = ACTIVITY_LABELS[social.activity] ?? 'Unknown';

    // Inventory + weapon
    let invHtml = '';
    let weaponHtml = '';
    if (inv) {
      const items = inv.slots.filter(s => s.item !== -1 && s.count > 0)
        .map(s => `${ITEM_NAMES[s.item as ItemType] ?? '?'} x${s.count}`).join(', ');
      invHtml = `<div class="creature-inventory">${items || 'Empty'}</div>`;
      if (inv.equippedTool > 0) {
        const toolName = ITEM_NAMES[inv.equippedTool as ItemType] ?? 'Tool';
        weaponHtml = `<span class="weapon-badge">⚔️ ${toolName}</span>`;
      }
    }

    // Vocabulary
    let vocabHtml = '';
    const vocab = VocabularyStore.get(selId);
    if (vocab) {
      const emojis = Array.from(vocab.known);
      const recentSet = new Set(vocab.recent.slice(-5));
      const emojiCells = emojis.map(e => {
        const isNew = recentSet.has(e);
        return `<span class="vocab-emoji${isNew ? ' vocab-new' : ''}">${e}</span>`;
      }).join('');
      vocabHtml = `
        <div class="stat-section">
          <div class="stat-section-title">Vocabulary (${emojis.length})</div>
          <div class="vocab-grid">${emojiCells}</div>
          ${vocab.recent.length > 0 ? `<div style="font-size:9px;color:rgba(120,180,255,0.5);margin-top:3px">Recent: ${vocab.recent.slice(-5).join(' ')}</div>` : ''}
        </div>
      `;
    }

    // Memories
    let memHtml = '';
    if (mem) {
      const active = mem.entries.filter(e => e.type !== 0);
      const MTYPE = ['', '🍎Food', '⚠️Danger', '😡Hostile', '😊Friend', '🏠Home', '⛏️Rsrc', '🏗️Shelter'];
      const memItems = active.slice(0, 4).map(m => `${MTYPE[m.type]} ${(m.strength * 100).toFixed(0)}%`).join(' · ');
      memHtml = `<div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:4px">Memories: ${active.length}/${MEMORY_SLOTS} ${memItems ? '— ' + memItems : ''}</div>`;
    }

    // Anxiety bar (only show if anxiety > 0.05)
    let anxietyHtml = '';
    if (expr && expr.anxiety > 0.05) {
      anxietyHtml = this.barHTML('Anxiety', expr.anxiety, BAR_COLORS.anxiety);
    }

    this.creatureContainer.innerHTML = `
      <div class="creature-name">${sexIcon} ${social.name} ${stageIcon}</div>
      <div class="creature-subtitle">${factionBit} · ${breedLabel} · Age ${lc.age} · Rank ${(rank * 100).toFixed(0)}%${social.language > 0 ? ' · Lang:' + social.language : ''}</div>
      ${moodHtml}

      <div class="stat-section" style="margin-top:8px">
        <div class="stat-section-title">Vitals</div>
        ${this.barHTML('Health', social.health, BAR_COLORS.health)}
        ${this.barHTML('Energy', c[ChemId.Energy], BAR_COLORS.energy)}
        ${this.barHTML('Glucose', c[ChemId.Glucose], BAR_COLORS.glucose)}
        ${this.barHTML('Hunger', c[ChemId.Hunger], BAR_COLORS.hunger)}
        ${this.barHTML('Life', c[ChemId.LifeForce], BAR_COLORS.life)}
        ${anxietyHtml}
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Traits</div>
        <div class="stat-grid">
          ${this.gridItem('Aggro', g.aggression)}
          ${this.gridItem('Social', g.sociability)}
          ${this.gridItem('Curious', g.curiosity)}
          ${this.gridItem('Creative', g.creativity)}
          ${this.gridItem('Loyal', g.loyalty)}
          ${this.gridItem('Speed', g.speed, true)}
          ${this.gridItem('Gather', g.gatherAffinity)}
          ${this.gridItem('Hunt', g.huntAffinity)}
          ${this.gridItem('Build', g.buildAffinity)}
          ${this.gridItem('Hoard', g.hoardAffinity)}
        </div>
      </div>

      <div class="stat-section">
        <div class="stat-section-title">Activity · ${actLabel} ${weaponHtml}</div>
        ${invHtml}
        ${memHtml}
      </div>

      ${vocabHtml}
    `;
  }

  private barHTML(label: string, value: number, gradient: string): string {
    const pct = Math.max(0, Math.min(100, value * 100));
    return `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${label}</span>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${pct.toFixed(1)}%;background:${gradient}"></div>
        </div>
        <span class="stat-bar-value">${pct.toFixed(0)}%</span>
      </div>
    `;
  }

  private gridItem(label: string, value: number, raw = false): string {
    const display = raw ? value.toFixed(1) : `${(value * 100).toFixed(0)}%`;
    return `
      <div class="stat-grid-item">
        <span class="stat-grid-label">${label}</span>
        <span class="stat-grid-value">${display}</span>
      </div>
    `;
  }

  private updateNavStrip(): void {
    const alive = this.getAliveIds();
    const selId = this.cfg.selectedId();

    // Only rebuild if creature list changed
    if (!this.navListChanged(alive)) {
      // Just update selection highlight and HP bars
      const chips = this.navStrip.querySelectorAll('.creature-chip') as NodeListOf<HTMLElement>;
      chips.forEach((chip, i) => {
        const id = this.navCreatureIds[i];
        if (id === undefined) return;
        chip.classList.toggle('selected', id === selId);
        const social = SocialStore.get(id);
        const hpFill = chip.querySelector('.chip-hp-fill') as HTMLElement;
        if (hpFill && social) {
          hpFill.style.width = `${social.health * 100}%`;
          hpFill.style.background = hpColor(social.health);
        }
      });
      return;
    }

    this.navCreatureIds = [...alive];
    const frag = document.createDocumentFragment();

    // Prev button
    const prevBtn = document.createElement('div');
    prevBtn.className = 'nav-btn';
    prevBtn.textContent = '◀';
    prevBtn.addEventListener('click', () => this.cfg.onCycleCreature(-1));
    frag.appendChild(prevBtn);

    // Creature chips (limit to ~30 visible)
    const maxChips = Math.min(alive.length, 30);
    for (let i = 0; i < maxChips; i++) {
      const id = alive[i];
      const social = SocialStore.get(id);
      const faction = this.cfg.factionManager.getFaction(id);
      if (!social) continue;

      const chip = document.createElement('div');
      chip.className = 'creature-chip' + (id === selId ? ' selected' : '');
      chip.innerHTML = `
        <span class="chip-emoji">${faction?.emoji ?? '❓'}</span>
        <span class="chip-name">${social.name}</span>
        <div class="chip-hp"><div class="chip-hp-fill" style="width:${social.health * 100}%;background:${hpColor(social.health)}"></div></div>
      `;
      chip.addEventListener('click', () => this.cfg.onSelectCreature(id));
      frag.appendChild(chip);
    }

    if (alive.length > maxChips) {
      const more = document.createElement('div');
      more.className = 'creature-chip';
      more.style.color = 'rgba(255,255,255,0.3)';
      more.textContent = `+${alive.length - maxChips} more`;
      frag.appendChild(more);
    }

    // Next button
    const nextBtn = document.createElement('div');
    nextBtn.className = 'nav-btn';
    nextBtn.textContent = '▶';
    nextBtn.addEventListener('click', () => this.cfg.onCycleCreature(1));
    frag.appendChild(nextBtn);

    this.navStrip.innerHTML = '';
    this.navStrip.appendChild(frag);
  }

  private navListChanged(alive: number[]): boolean {
    if (alive.length !== this.navCreatureIds.length) return true;
    for (let i = 0; i < alive.length; i++) {
      if (alive[i] !== this.navCreatureIds[i]) return true;
    }
    return false;
  }

  private getAliveIds(): number[] {
    return this.cfg.world.query(LifecycleStore.bit | TransformStore.bit)
      .filter(id => {
        const lc = LifecycleStore.get(id);
        return lc && lc.stage === LifeStage.Alive;
      });
  }

  dispose(): void {
    this.root.remove();
  }
}
