// Market Panel: Canvas2D overlay toggled with M key
// Shows: commodity tickers, faction GDP, peace/war, dialectic dashboard

import { ItemType, ITEM_NAMES, countItem } from '../components/Inventory';
import { InventoryStore } from '../components/Inventory';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import type { World } from '../ecs/World';
import type { FactionManager, Faction } from '../world/FactionSystem';
import type { PoliticsSystem, NationData } from '../world/PoliticsSystem';
import type { SephirothSystem, JachinBoaz } from '../world/Sephiroth';
import type { DialecticSystem, DialecticState, GlobalDialectic } from '../world/DialecticSystem';
import type { RaidSystem, Raid } from '../systems/RaidSystem';
import { GOVERNMENT_NAMES } from '../world/PoliticsSystem';

const WIDTH = 900;
const HEIGHT = 650;
const UPDATE_INTERVAL = 30;
const HISTORY_LENGTH = 20;
const TRADE_WINDOW = 500; // ticks

// Item emoji mapping
const ITEM_EMOJI: Partial<Record<ItemType, string>> = {
  [ItemType.RawBerry]: '🫐', [ItemType.RawGrass]: '🌿', [ItemType.RawRoot]: '🍄',
  [ItemType.RawWood]: '🪵', [ItemType.RawStone]: '🪨', [ItemType.RawOre]: '⛏️',
  [ItemType.RawMeat]: '🥩', [ItemType.Plank]: '🪵', [ItemType.CutStone]: '🧱',
  [ItemType.MetalIngot]: '🔩', [ItemType.Coal]: '�ite', [ItemType.RawIron]: '⚙️',
  [ItemType.RawGold]: '🥇', [ItemType.IronIngot]: '🔧', [ItemType.GoldIngot]: '💰',
  [ItemType.FoodBundle]: '🍱', [ItemType.Torch]: '🔥', [ItemType.Boat]: '⛵',
  [ItemType.IronSword]: '⚔️', [ItemType.IronArmor]: '🛡️', [ItemType.CookedMeat]: '🍖',
  [ItemType.CookedBerry]: '🍇', [ItemType.CookedFish]: '🐟', [ItemType.LargeMeat]: '🦴',
};

const BASE_VALUES: Partial<Record<ItemType, number>> = {
  [ItemType.RawBerry]: 1, [ItemType.RawGrass]: 1, [ItemType.RawRoot]: 1,
  [ItemType.RawWood]: 2, [ItemType.RawStone]: 3, [ItemType.RawOre]: 4,
  [ItemType.RawMeat]: 3, [ItemType.Plank]: 5, [ItemType.CutStone]: 6,
  [ItemType.MetalIngot]: 8, [ItemType.Coal]: 3, [ItemType.RawIron]: 5,
  [ItemType.RawGold]: 8, [ItemType.IronIngot]: 10, [ItemType.GoldIngot]: 15,
  [ItemType.FoodBundle]: 4, [ItemType.Torch]: 4, [ItemType.Boat]: 12,
  [ItemType.IronSword]: 15, [ItemType.IronArmor]: 20, [ItemType.CookedMeat]: 5,
  [ItemType.CookedBerry]: 3, [ItemType.CookedFish]: 5, [ItemType.LargeMeat]: 6,
  [ItemType.StoneAxe]: 6, [ItemType.StonePick]: 6, [ItemType.MetalAxe]: 12,
  [ItemType.MetalPick]: 12, [ItemType.WoodSword]: 4, [ItemType.StoneSword]: 8,
  [ItemType.Shield]: 10,
};

const TRACKED_ITEMS: ItemType[] = [
  ItemType.RawBerry, ItemType.RawWood, ItemType.RawStone, ItemType.RawOre,
  ItemType.RawMeat, ItemType.Coal, ItemType.RawIron, ItemType.RawGold,
  ItemType.Plank, ItemType.CutStone, ItemType.MetalIngot, ItemType.IronIngot,
  ItemType.GoldIngot, ItemType.FoodBundle, ItemType.CookedMeat, ItemType.CookedBerry,
  ItemType.Torch, ItemType.Boat, ItemType.IronSword, ItemType.IronArmor,
];

export interface TradeRecord {
  tick: number;
  buyerFaction: number;
  sellerFaction: number;
  itemGiven: ItemType;
  itemReceived: ItemType;
}

export interface CommodityTicker {
  itemType: ItemType;
  recentTrades: number;
  supply: number;
  demand: number;
  priceIndex: number;
  trend: number; // -1/0/1
  history: number[];
}

export class MarketPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  visible = false;
  private tickCounter = 0;

  // Data sources
  factionManager: FactionManager | null = null;
  politicsSystem: PoliticsSystem | null = null;
  sephirothSystem: SephirothSystem | null = null;
  dialecticSystem: DialecticSystem | null = null;
  raidSystem: RaidSystem | null = null;

  // Trade ledger
  tradeRecords: TradeRecord[] = [];
  private tickers = new Map<ItemType, CommodityTicker>();

  // Faction GDP cache
  private factionGDP = new Map<number, number>();
  private factionTradeBalance = new Map<number, number>();

  private currentTick = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:rgba(8,8,20,0.95); border-radius:12px;
      border:1px solid #444; display:none; pointer-events:auto; z-index:200;
      box-shadow: 0 0 40px rgba(0,0,0,0.8);
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Initialize tickers
    for (const item of TRACKED_ITEMS) {
      this.tickers.set(item, {
        itemType: item,
        recentTrades: 0,
        supply: 0,
        demand: 0,
        priceIndex: BASE_VALUES[item] ?? 1,
        trend: 0,
        history: [],
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (e.ctrlKey || e.metaKey) return;
        this.visible = !this.visible;
        this.canvas.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  /** Record a trade from MarketSystem */
  recordTrade(tick: number, buyerFaction: number, sellerFaction: number, itemGiven: ItemType, itemReceived: ItemType): void {
    this.tradeRecords.push({ tick, buyerFaction, sellerFaction, itemGiven, itemReceived });
    if (this.tradeRecords.length > 5000) this.tradeRecords.shift();
  }

  tick(world: World, currentTick: number): void {
    this.currentTick = currentTick;
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL) return;
    this.tickCounter = 0;

    this.updateTickers(world);
    this.updateGDP(world);

    if (this.visible) this.draw();
  }

  private updateTickers(world: World): void {
    const creatures = world.query(InventoryStore.bit | SocialStore.bit);

    for (const [, ticker] of this.tickers) {
      // Count supply (total in all inventories)
      let supply = 0;
      for (const id of creatures) {
        const lc = LifecycleStore.get(id);
        if (lc && lc.stage === LifeStage.Dead) continue;
        const inv = InventoryStore.get(id);
        if (inv) supply += countItem(inv, ticker.itemType);
      }
      ticker.supply = supply;

      // Count recent trades
      const cutoff = this.currentTick - TRADE_WINDOW;
      let recentTrades = 0;
      for (const trade of this.tradeRecords) {
        if (trade.tick < cutoff) continue;
        if (trade.itemGiven === ticker.itemType || trade.itemReceived === ticker.itemType) {
          recentTrades++;
        }
      }
      ticker.recentTrades = recentTrades;

      // Demand: rough estimate from creatures wanting to buy
      // (creatures with 0 of this item who have traded recently)
      ticker.demand = Math.max(1, recentTrades * 2 - supply * 0.1);

      // Price index based on scarcity
      const baseVal = BASE_VALUES[ticker.itemType] ?? 1;
      const newPrice = baseVal * (1 + (ticker.demand - supply) / Math.max(supply, 1));
      const clampedPrice = Math.max(0.1, Math.min(baseVal * 5, newPrice));

      // Trend
      const prevPrice = ticker.priceIndex;
      if (clampedPrice > prevPrice * 1.05) ticker.trend = 1;
      else if (clampedPrice < prevPrice * 0.95) ticker.trend = -1;
      else ticker.trend = 0;

      ticker.priceIndex = clampedPrice;
      ticker.history.push(clampedPrice);
      if (ticker.history.length > HISTORY_LENGTH) ticker.history.shift();
    }
  }

  private updateGDP(world: World): void {
    if (!this.factionManager) return;
    this.factionGDP.clear();
    this.factionTradeBalance.clear();

    const creatures = world.query(InventoryStore.bit | SocialStore.bit);
    for (const id of creatures) {
      const lc = LifecycleStore.get(id);
      if (lc && lc.stage === LifeStage.Dead) continue;
      const social = SocialStore.get(id);
      const inv = InventoryStore.get(id);
      if (!social || !inv) continue;

      let value = 0;
      for (const [item, baseVal] of Object.entries(BASE_VALUES)) {
        const count = countItem(inv, Number(item) as ItemType);
        value += count * (baseVal as number);
      }
      this.factionGDP.set(social.factionId, (this.factionGDP.get(social.factionId) ?? 0) + value);
    }

    // Trade balance from recent trades
    const cutoff = this.currentTick - TRADE_WINDOW;
    for (const trade of this.tradeRecords) {
      if (trade.tick < cutoff) continue;
      const givenVal = BASE_VALUES[trade.itemGiven] ?? 1;
      const recvVal = BASE_VALUES[trade.itemReceived] ?? 1;
      // Buyer gains value, seller exports
      this.factionTradeBalance.set(trade.buyerFaction,
        (this.factionTradeBalance.get(trade.buyerFaction) ?? 0) + recvVal - givenVal);
      this.factionTradeBalance.set(trade.sellerFaction,
        (this.factionTradeBalance.get(trade.sellerFaction) ?? 0) + givenVal - recvVal);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Title bar
    ctx.fillStyle = 'rgba(15,15,35,0.95)';
    ctx.fillRect(0, 0, WIDTH, 32);
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MARKET LEDGER  [M]', WIDTH / 2, 22);

    const halfW = WIDTH / 2;
    const halfH = (HEIGHT - 32) / 2;
    const top = 36;

    // ── Top-left: Commodity Tickers ──
    this.drawTickers(ctx, 8, top, halfW - 12, halfH - 4);

    // ── Top-right: Faction GDP ──
    this.drawGDP(ctx, halfW + 4, top, halfW - 12, halfH - 4);

    // ── Bottom-left: Peace/War ──
    this.drawConflicts(ctx, 8, top + halfH + 4, halfW - 12, halfH - 8);

    // ── Bottom-right: Dialectic Dashboard ──
    this.drawDialectic(ctx, halfW + 4, top + halfH + 4, halfW - 12, halfH - 8);
  }

  private drawTickers(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    // Panel background
    ctx.fillStyle = 'rgba(20,20,40,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#8af';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMMODITIES', x + 8, y + 14);

    // Header
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText('ITEM        TRADES  SUPPLY  PRICE   TREND', x + 8, y + 28);

    let row = 0;
    const maxRows = Math.floor((h - 36) / 14);
    for (const [, ticker] of this.tickers) {
      if (row >= maxRows) break;
      const ry = y + 40 + row * 14;

      const emoji = ITEM_EMOJI[ticker.itemType] ?? '📦';
      const name = (ITEM_NAMES[ticker.itemType] ?? 'Item').padEnd(8).substring(0, 8);
      const trades = String(ticker.recentTrades).padStart(4);
      const supply = String(ticker.supply).padStart(6);
      const price = ticker.priceIndex.toFixed(1).padStart(6);
      const trendChar = ticker.trend > 0 ? '▲' : ticker.trend < 0 ? '▼' : '─';

      ctx.fillStyle = ticker.trend > 0 ? '#4f4' : ticker.trend < 0 ? '#f44' : '#999';
      ctx.font = '10px monospace';
      ctx.fillText(`${emoji} ${name} ${trades}   ${supply}  ${price}    ${trendChar}`, x + 8, ry);

      // Mini sparkline
      if (ticker.history.length > 2) {
        const sparkX = x + w - 60;
        const sparkW = 50;
        const sparkH = 10;
        const min = Math.min(...ticker.history);
        const max = Math.max(...ticker.history);
        const range = max - min || 1;

        ctx.strokeStyle = ticker.trend > 0 ? '#4f4' : ticker.trend < 0 ? '#f44' : '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < ticker.history.length; i++) {
          const px = sparkX + (i / (ticker.history.length - 1)) * sparkW;
          const py = ry - 2 - ((ticker.history[i] - min) / range) * sparkH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      row++;
    }
  }

  private drawGDP(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(20,20,40,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#fa8';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FACTION GDP & TRADE', x + 8, y + 14);

    if (!this.factionManager) return;

    // Sort factions by GDP
    const factions = this.factionManager.activeFactions
      .map(f => ({
        faction: f,
        gdp: this.factionGDP.get(f.id) ?? 0,
        balance: this.factionTradeBalance.get(f.id) ?? 0,
        territory: 0,
      }))
      .sort((a, b) => b.gdp - a.gdp);

    const maxGDP = Math.max(1, ...factions.map(f => f.gdp));
    const barStartX = x + 140;
    const barWidth = w - 160;

    let row = 0;
    const maxRows = Math.floor((h - 30) / 22);
    for (const { faction, gdp, balance } of factions) {
      if (row >= maxRows) break;
      const ry = y + 32 + row * 22;

      // Faction name
      ctx.fillStyle = '#ccc';
      ctx.font = '10px monospace';
      ctx.fillText(`${faction.emoji} ${faction.name.substring(0, 10).padEnd(10)}`, x + 8, ry + 4);

      // GDP value
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${gdp.toFixed(0)}`, x + 105, ry + 4);

      // GDP bar
      const barLen = (gdp / maxGDP) * barWidth;
      ctx.fillStyle = `hsl(${faction.color}, 60%, 40%)`;
      ctx.fillRect(barStartX, ry - 6, barLen, 12);

      // Trade balance
      const balColor = balance > 0 ? '#4f4' : balance < 0 ? '#f44' : '#666';
      ctx.fillStyle = balColor;
      ctx.font = '9px monospace';
      ctx.fillText(balance > 0 ? `+${balance.toFixed(0)}` : balance.toFixed(0), barStartX + barLen + 4, ry + 4);

      row++;
    }
  }

  private drawConflicts(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(20,20,40,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f88';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PEACE / WAR', x + 8, y + 14);

    if (!this.factionManager || !this.politicsSystem) return;

    let row = 0;
    const maxRows = Math.floor((h - 24) / 18);
    const factions = this.factionManager.activeFactions;

    // List wars
    const shownPairs = new Set<string>();
    for (const fA of factions) {
      const ndA = this.politicsSystem.getNation(fA.id);
      if (!ndA) continue;

      for (const targetId of ndA.warTargets) {
        const key = Math.min(fA.id, targetId) + ':' + Math.max(fA.id, targetId);
        if (shownPairs.has(key)) continue;
        shownPairs.add(key);
        if (row >= maxRows) break;

        const fB = factions.find(f => f.id === targetId);
        if (!fB) continue;
        const ndB = this.politicsSystem.getNation(targetId);
        const ry = y + 28 + row * 18;

        // War indicator
        ctx.fillStyle = '#f44';
        ctx.font = '10px monospace';
        ctx.fillText('⚔️', x + 8, ry);
        ctx.fillStyle = '#faa';
        ctx.fillText(`${fA.emoji}${fA.name.substring(0, 8)} vs ${fB.emoji}${fB.name.substring(0, 8)}`, x + 26, ry);

        // War exhaustion bars
        const exA = ndA.warExhaustion;
        const exB = ndB?.warExhaustion ?? 0;
        const barX = x + w - 100;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, ry - 8, 40, 5);
        ctx.fillStyle = '#f84';
        ctx.fillRect(barX, ry - 8, exA * 40, 5);
        ctx.fillStyle = '#333';
        ctx.fillRect(barX + 45, ry - 8, 40, 5);
        ctx.fillStyle = '#f84';
        ctx.fillRect(barX + 45, ry - 8, exB * 40, 5);

        row++;
      }

      // Alliances
      for (const allyId of ndA.allies) {
        const key = 'a' + Math.min(fA.id, allyId) + ':' + Math.max(fA.id, allyId);
        if (shownPairs.has(key)) continue;
        shownPairs.add(key);
        if (row >= maxRows) break;

        const fB = factions.find(f => f.id === allyId);
        if (!fB) continue;
        const ry = y + 28 + row * 18;

        ctx.fillStyle = '#4f4';
        ctx.font = '10px monospace';
        ctx.fillText('🤝', x + 8, ry);
        ctx.fillStyle = '#afa';
        ctx.fillText(`${fA.emoji}${fA.name.substring(0, 8)} + ${fB.emoji}${fB.name.substring(0, 8)}`, x + 26, ry);
        row++;
      }
    }

    // Active raids
    if (this.raidSystem) {
      for (const raid of this.raidSystem.activeRaids) {
        if (row >= maxRows) break;
        const ry = y + 28 + row * 18;
        const attF = factions.find(f => f.id === raid.attackerFaction);
        const defF = factions.find(f => f.id === raid.defenderFaction);
        const phaseNames = ['Mustering', 'Marching', 'Raiding!', 'Retreating'];

        ctx.fillStyle = '#ff8';
        ctx.font = '10px monospace';
        ctx.fillText('🏴', x + 8, ry);
        ctx.fillStyle = '#ffa';
        ctx.fillText(
          `${attF?.emoji ?? '?'} → ${defF?.emoji ?? '?'} [${phaseNames[raid.phase]}] ${raid.raiders.length} raiders`,
          x + 26, ry,
        );
        row++;
      }
    }

    if (row === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '10px monospace';
      ctx.fillText('No active conflicts', x + 8, y + 30);
    }
  }

  private drawDialectic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(20,20,40,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#a8f';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DIALECTIC & PILLARS', x + 8, y + 14);

    // Global dialectic indices
    const global = this.dialecticSystem?.global;
    if (global) {
      const barY = y + 28;
      const barW = w - 20;

      // Stacked bar: imperial | revolutionary | stability
      const total = global.imperialIndex + global.revolutionaryIndex + global.stabilityIndex || 1;
      const impW = (global.imperialIndex / total) * barW;
      const revW = (global.revolutionaryIndex / total) * barW;
      const stabW = (global.stabilityIndex / total) * barW;

      ctx.fillStyle = '#c44'; // Imperial (thesis)
      ctx.fillRect(x + 10, barY, impW, 12);
      ctx.fillStyle = '#f84'; // Revolutionary (antithesis)
      ctx.fillRect(x + 10 + impW, barY, revW, 12);
      ctx.fillStyle = '#4a4'; // Stability (synthesis)
      ctx.fillRect(x + 10 + impW + revW, barY, stabW, 12);

      ctx.fillStyle = '#aaa';
      ctx.font = '8px monospace';
      ctx.fillText(`Imp:${global.imperialIndex.toFixed(2)}  Rev:${global.revolutionaryIndex.toFixed(2)}  Stab:${global.stabilityIndex.toFixed(2)}`, x + 10, barY + 24);
    }

    // Jachin / Boaz balance meter
    const pillars = this.sephirothSystem?.pillars;
    if (pillars) {
      const meterY = y + 66;
      const meterW = w - 40;
      const meterH = 16;
      const meterX = x + 20;

      // Background
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(meterX, meterY, meterW, meterH);

      // Balance indicator
      const balPos = (pillars.balance + 1) / 2; // 0-1
      const indX = meterX + balPos * meterW;

      // Left half = Boaz (purple), Right half = Jachin (gold)
      const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
      grad.addColorStop(0, 'rgba(128,0,255,0.5)');
      grad.addColorStop(0.5, 'rgba(50,50,50,0.3)');
      grad.addColorStop(1, 'rgba(255,215,0,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(meterX, meterY, meterW, meterH);

      // Balance pointer
      ctx.fillStyle = '#fff';
      ctx.fillRect(indX - 2, meterY - 2, 4, meterH + 4);

      // Labels
      ctx.fillStyle = '#a0f';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('BOAZ', meterX, meterY - 3);
      ctx.fillStyle = '#fd0';
      ctx.textAlign = 'right';
      ctx.fillText('JACHIN', meterX + meterW, meterY - 3);
      ctx.textAlign = 'left';

      // Pulse waveform
      const waveY = meterY + 26;
      const waveH = h - (waveY - y) - 10;
      const waveW = w - 20;

      if (pillars.pulseHistory.length > 2 && waveH > 20) {
        // Draw waveform background
        ctx.fillStyle = 'rgba(10,10,25,0.6)';
        ctx.fillRect(x + 10, waveY, waveW, waveH);

        // Center line
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 10, waveY + waveH / 2);
        ctx.lineTo(x + 10 + waveW, waveY + waveH / 2);
        ctx.stroke();

        const history = pillars.pulseHistory;
        const len = history.length;
        const step = waveW / Math.max(1, len - 1);

        // Jachin wave (gold)
        ctx.strokeStyle = '#fd0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const px = x + 10 + i * step;
          const val = history[i].jachin;
          const py = waveY + waveH / 2 - val * (waveH / 2) * 0.9;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Boaz wave (purple)
        ctx.strokeStyle = '#a0f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const px = x + 10 + i * step;
          const val = history[i].boaz;
          const py = waveY + waveH / 2 - val * (waveH / 2) * 0.9;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Event markers
        ctx.fillStyle = '#fff';
        ctx.font = '7px monospace';
        for (let i = 0; i < len; i++) {
          if (history[i].event) {
            const px = x + 10 + i * step;
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(px, waveY, 1, waveH);
          }
        }
      }
    }

    // Per-faction dialectic sparklines
    if (this.dialecticSystem && this.factionManager) {
      const sparkY = y + h - 40;
      let col = 0;
      for (const faction of this.factionManager.activeFactions) {
        const ds = this.dialecticSystem.getState(faction.id);
        if (!ds) continue;
        if (col >= 4) break;

        const sparkX = x + 10 + col * 105;
        ctx.fillStyle = '#888';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${faction.emoji} T:${ds.thesis.toFixed(1)} A:${ds.antithesis.toFixed(1)} S:${ds.synthesis.toFixed(1)}`, sparkX, sparkY + 10);

        // Active revolution indicator
        if (ds.consecutiveOppression >= 2) {
          ctx.fillStyle = '#f44';
          ctx.fillText('🔥REV', sparkX + 80, sparkY + 10);
        }

        col++;
      }
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
