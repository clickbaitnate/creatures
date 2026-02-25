// Bloomberg-style market terminal — toggled with M key
// Full-screen Canvas2D overlay: tickers, GDP, trade feed, wars, dialectic, sephiroth, charts

import { ItemType, ITEM_NAMES, countItem } from '../components/Inventory';
import { InventoryStore } from '../components/Inventory';
import { SocialStore } from '../components/Social';
import { LifecycleStore, LifeStage } from '../components/Lifecycle';
import { GenomeStore } from '../components/Genome';
import type { World } from '../ecs/World';
import type { FactionManager, Faction } from '../world/FactionSystem';
import type { PoliticsSystem } from '../world/PoliticsSystem';
import type { SephirothSystem } from '../world/Sephiroth';
import type { DialecticSystem, DialecticState, GlobalDialectic } from '../world/DialecticSystem';
import type { RaidSystem, Raid } from '../systems/RaidSystem';

const UPDATE_INTERVAL = 20;
const HISTORY_LENGTH = 60; // price snapshots
const TRADE_WINDOW = 500;
const TICKER_SCROLL_SPEED = 0.5;

// ── Item data ──────────────────────────────────────────────────
const ITEM_EMOJI: Partial<Record<ItemType, string>> = {
  [ItemType.RawBerry]: '\u{1F4AB}', [ItemType.RawGrass]: '\u{1F33F}', [ItemType.RawRoot]: '\u{1F344}',
  [ItemType.RawWood]: '\u{1FAB5}', [ItemType.RawStone]: '\u{1FAA8}', [ItemType.RawOre]: '\u26CF\uFE0F',
  [ItemType.RawMeat]: '\u{1F969}', [ItemType.Plank]: '\u{1FAB5}', [ItemType.CutStone]: '\u{1F9F1}',
  [ItemType.MetalIngot]: '\u{1F529}', [ItemType.Coal]: '\u2B1B', [ItemType.RawIron]: '\u2699\uFE0F',
  [ItemType.RawGold]: '\u{1F947}', [ItemType.IronIngot]: '\u{1F527}', [ItemType.GoldIngot]: '\u{1F4B0}',
  [ItemType.FoodBundle]: '\u{1F371}', [ItemType.Torch]: '\u{1F525}', [ItemType.Boat]: '\u26F5',
  [ItemType.IronSword]: '\u2694\uFE0F', [ItemType.IronArmor]: '\u{1F6E1}\uFE0F',
  [ItemType.CookedMeat]: '\u{1F356}', [ItemType.CookedBerry]: '\u{1F347}',
  [ItemType.CookedFish]: '\u{1F41F}', [ItemType.LargeMeat]: '\u{1F9B4}',
  [ItemType.StoneAxe]: '\u{1FA93}', [ItemType.StonePick]: '\u26CF\uFE0F',
  [ItemType.MetalAxe]: '\u{1FA93}', [ItemType.MetalPick]: '\u26CF\uFE0F',
  [ItemType.WoodSword]: '\u{1F5E1}\uFE0F', [ItemType.StoneSword]: '\u{1F5E1}\uFE0F',
  [ItemType.Shield]: '\u{1F6E1}\uFE0F',
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
  ItemType.StoneAxe, ItemType.StonePick, ItemType.WoodSword, ItemType.Shield,
];

// ── Interfaces ─────────────────────────────────────────────────
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
  prevPrice: number;
  trend: number;
  history: number[];
  high: number;
  low: number;
  volume: number; // trades this window
}

interface EventEntry {
  tick: number;
  text: string;
  color: string;
  type: 'trade' | 'war' | 'peace' | 'raid' | 'revolution' | 'alliance' | 'info';
}

// ── Colors ─────────────────────────────────────────────────────
const C = {
  bg: '#0a0a12',
  panelBg: '#0d0d1a',
  panelBorder: '#1a1a33',
  headerBg: '#111128',
  headerText: '#ff8800',
  text: '#cccccc',
  textDim: '#666688',
  textBright: '#eeeeff',
  green: '#00cc66',
  red: '#cc3333',
  yellow: '#ccaa00',
  orange: '#ff8800',
  blue: '#3388ff',
  purple: '#aa44ff',
  cyan: '#00cccc',
  gold: '#ffd700',
  gridLine: '#151530',
  tickerBg: '#060610',
  scrollBg: '#0a0a18',
};

// ── Main class ─────────────────────────────────────────────────
export class MarketPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  visible = false;
  private tickCounter = 0;
  private animFrame = 0;

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
  private gdpHistory = new Map<number, number[]>();

  // Event feed
  private events: EventEntry[] = [];
  private tickerScrollOffset = 0;

  // Population history (for sparklines)
  private popHistory = new Map<number, number[]>();

  private currentTick = 0;
  private totalVolume = 0;
  private prevTotalVolume = 0;
  private marketIndex = 100; // composite index
  private marketIndexHistory: number[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position:fixed; inset:0; width:100vw; height:100vh;
      display:none; pointer-events:auto; z-index:200;
      cursor:default;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Initialize tickers
    for (const item of TRACKED_ITEMS) {
      this.tickers.set(item, {
        itemType: item, recentTrades: 0, supply: 0, demand: 0,
        priceIndex: BASE_VALUES[item] ?? 1, prevPrice: BASE_VALUES[item] ?? 1,
        trend: 0, history: [], high: BASE_VALUES[item] ?? 1,
        low: BASE_VALUES[item] ?? 1, volume: 0,
      });
    }

    window.addEventListener('keydown', (e) => {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        this.visible = !this.visible;
        this.canvas.style.display = this.visible ? 'block' : 'none';
        if (this.visible) this.resize();
      }
    });

    window.addEventListener('resize', () => { if (this.visible) this.resize(); });
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Record a trade from MarketSystem */
  recordTrade(tick: number, buyerFaction: number, sellerFaction: number, itemGiven: ItemType, itemReceived: ItemType): void {
    this.tradeRecords.push({ tick, buyerFaction, sellerFaction, itemGiven, itemReceived });
    if (this.tradeRecords.length > 10000) this.tradeRecords = this.tradeRecords.slice(-5000);
    this.totalVolume++;

    // Event feed
    const buyName = this.factionManager?.activeFactions.find(f => f.id === buyerFaction)?.name ?? '?';
    const sellName = this.factionManager?.activeFactions.find(f => f.id === sellerFaction)?.name ?? '?';
    const gName = ITEM_NAMES[itemGiven] ?? '?';
    const rName = ITEM_NAMES[itemReceived] ?? '?';
    this.pushEvent(tick, `${buyName} traded ${gName} for ${rName} with ${sellName}`, C.cyan, 'trade');
  }

  /** Push an event to the feed */
  pushEvent(tick: number, text: string, color: string, type: EventEntry['type']): void {
    this.events.push({ tick, text, color, type });
    if (this.events.length > 200) this.events = this.events.slice(-100);
  }

  tick(world: World, currentTick: number): void {
    this.currentTick = currentTick;
    this.tickCounter++;
    if (this.tickCounter < UPDATE_INTERVAL) return;
    this.tickCounter = 0;

    this.updateTickers(world);
    this.updateGDP(world);
    this.updatePopHistory();
    this.updateMarketIndex();

    if (this.visible) {
      this.animFrame++;
      this.draw();
    }
  }

  private updateTickers(world: World): void {
    const creatures = world.query(InventoryStore.bit | SocialStore.bit);

    for (const [, ticker] of this.tickers) {
      let supply = 0;
      for (const id of creatures) {
        const lc = LifecycleStore.get(id);
        if (lc && lc.stage === LifeStage.Dead) continue;
        const inv = InventoryStore.get(id);
        if (inv) supply += countItem(inv, ticker.itemType);
      }
      ticker.supply = supply;

      const cutoff = this.currentTick - TRADE_WINDOW;
      let recentTrades = 0;
      for (const trade of this.tradeRecords) {
        if (trade.tick < cutoff) continue;
        if (trade.itemGiven === ticker.itemType || trade.itemReceived === ticker.itemType) recentTrades++;
      }
      ticker.recentTrades = recentTrades;
      ticker.volume = recentTrades;

      ticker.demand = Math.max(1, recentTrades * 2 - supply * 0.1);

      const baseVal = BASE_VALUES[ticker.itemType] ?? 1;
      const newPrice = baseVal * (1 + (ticker.demand - supply) / Math.max(supply, 1));
      const clampedPrice = Math.max(0.1, Math.min(baseVal * 8, newPrice));

      ticker.prevPrice = ticker.priceIndex;
      if (clampedPrice > ticker.priceIndex * 1.02) ticker.trend = 1;
      else if (clampedPrice < ticker.priceIndex * 0.98) ticker.trend = -1;
      else ticker.trend = 0;

      ticker.priceIndex = clampedPrice;
      ticker.history.push(clampedPrice);
      if (ticker.history.length > HISTORY_LENGTH) ticker.history.shift();

      ticker.high = Math.max(ticker.high * 0.999, clampedPrice);
      ticker.low = Math.min(ticker.low * 1.001, clampedPrice);
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
        value += countItem(inv, Number(item) as ItemType) * (baseVal as number);
      }
      this.factionGDP.set(social.factionId, (this.factionGDP.get(social.factionId) ?? 0) + value);
    }

    // GDP history
    for (const f of this.factionManager.activeFactions) {
      const gdp = this.factionGDP.get(f.id) ?? 0;
      if (!this.gdpHistory.has(f.id)) this.gdpHistory.set(f.id, []);
      const h = this.gdpHistory.get(f.id)!;
      h.push(gdp);
      if (h.length > HISTORY_LENGTH) h.shift();
    }

    const cutoff = this.currentTick - TRADE_WINDOW;
    for (const trade of this.tradeRecords) {
      if (trade.tick < cutoff) continue;
      const gv = BASE_VALUES[trade.itemGiven] ?? 1;
      const rv = BASE_VALUES[trade.itemReceived] ?? 1;
      this.factionTradeBalance.set(trade.buyerFaction,
        (this.factionTradeBalance.get(trade.buyerFaction) ?? 0) + rv - gv);
      this.factionTradeBalance.set(trade.sellerFaction,
        (this.factionTradeBalance.get(trade.sellerFaction) ?? 0) + gv - rv);
    }
  }

  private updatePopHistory(): void {
    if (!this.factionManager) return;
    for (const f of this.factionManager.activeFactions) {
      if (!this.popHistory.has(f.id)) this.popHistory.set(f.id, []);
      const h = this.popHistory.get(f.id)!;
      h.push(f.memberIds.size);
      if (h.length > HISTORY_LENGTH) h.shift();
    }
  }

  private updateMarketIndex(): void {
    let totalValue = 0;
    let count = 0;
    for (const [, ticker] of this.tickers) {
      totalValue += ticker.priceIndex / (BASE_VALUES[ticker.itemType] ?? 1);
      count++;
    }
    this.marketIndex = count > 0 ? (totalValue / count) * 100 : 100;
    this.marketIndexHistory.push(this.marketIndex);
    if (this.marketIndexHistory.length > HISTORY_LENGTH) this.marketIndexHistory.shift();
  }

  // ── Rendering ──────────────────────────────────────────────────

  private draw(): void {
    const ctx = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Full background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Top ticker bar (scrolling) ──
    this.drawTickerBar(ctx, 0, 0, W, 28);

    // ── Header ──
    this.drawHeader(ctx, 0, 28, W, 24);

    const contentY = 54;
    const contentH = H - contentY - 2;

    // Layout: 3 columns
    const col1W = Math.floor(W * 0.32);  // Commodities
    const col2W = Math.floor(W * 0.36);  // Charts + GDP
    const col3W = W - col1W - col2W;     // Conflicts + Dialectic + Feed

    // ── Column 1: Commodities table ──
    this.drawCommodities(ctx, 0, contentY, col1W, contentH);

    // ── Column 2: Charts ──
    const chartH1 = Math.floor(contentH * 0.45);
    const chartH2 = Math.floor(contentH * 0.30);
    const chartH3 = contentH - chartH1 - chartH2;
    this.drawMarketIndexChart(ctx, col1W, contentY, col2W, chartH1);
    this.drawGDPPanel(ctx, col1W, contentY + chartH1, col2W, chartH2);
    this.drawSephirothMini(ctx, col1W, contentY + chartH1 + chartH2, col2W, chartH3);

    // ── Column 3: Wars + Dialectic + Event Feed ──
    const rightX = col1W + col2W;
    const sec1H = Math.floor(contentH * 0.30);
    const sec2H = Math.floor(contentH * 0.30);
    const sec3H = contentH - sec1H - sec2H;
    this.drawConflicts(ctx, rightX, contentY, col3W, sec1H);
    this.drawDialectic(ctx, rightX, contentY + sec1H, col3W, sec2H);
    this.drawEventFeed(ctx, rightX, contentY + sec1H + sec2H, col3W, sec3H);
  }

  // ── Scrolling ticker bar ──────────────────────────────────────

  private drawTickerBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = C.tickerBg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(x, y + h - 1, w, 1);

    this.tickerScrollOffset += TICKER_SCROLL_SPEED;
    let tx = -this.tickerScrollOffset;
    ctx.font = '11px monospace';

    for (const [, ticker] of this.tickers) {
      const emoji = ITEM_EMOJI[ticker.itemType] ?? '';
      const name = (ITEM_NAMES[ticker.itemType] ?? '???').substring(0, 6).toUpperCase();
      const price = ticker.priceIndex.toFixed(1);
      const change = ((ticker.priceIndex - ticker.prevPrice) / Math.max(ticker.prevPrice, 0.01) * 100);
      const changeStr = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
      const col = ticker.trend > 0 ? C.green : ticker.trend < 0 ? C.red : C.textDim;

      const segment = `  ${emoji} ${name} ${price} ${changeStr}  `;
      const segW = ctx.measureText(segment).width;

      if (tx + segW > 0 && tx < w) {
        ctx.fillStyle = C.text;
        ctx.fillText(`  ${emoji} ${name} `, x + tx, y + 18);
        const nameW = ctx.measureText(`  ${emoji} ${name} `).width;
        ctx.fillStyle = col;
        ctx.fillText(`${price} ${changeStr}`, x + tx + nameW, y + 18);
      }
      tx += segW + 16;
    }

    if (this.tickerScrollOffset > tx + w) this.tickerScrollOffset = 0;
  }

  // ── Header ────────────────────────────────────────────────────

  private drawHeader(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = C.headerBg;
    ctx.fillRect(x, y, w, h);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = C.orange;
    ctx.textAlign = 'left';
    ctx.fillText('SERES MARKET TERMINAL', x + 8, y + 16);

    // Market index
    const idxChange = this.marketIndexHistory.length > 1
      ? this.marketIndex - this.marketIndexHistory[this.marketIndexHistory.length - 2]
      : 0;
    const idxCol = idxChange >= 0 ? C.green : C.red;
    ctx.font = '11px monospace';
    ctx.fillStyle = C.text;
    ctx.fillText(`SERES INDEX: `, x + 240, y + 16);
    ctx.fillStyle = idxCol;
    ctx.fillText(`${this.marketIndex.toFixed(1)} (${idxChange >= 0 ? '+' : ''}${idxChange.toFixed(1)})`, x + 355, y + 16);

    // Volume
    ctx.fillStyle = C.textDim;
    ctx.fillText(`VOL: ${this.totalVolume}`, x + 500, y + 16);

    // Tick
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`TICK ${this.currentTick}`, x + w - 8, y + 16);
    ctx.textAlign = 'left';

    // Factions
    const fc = this.factionManager?.activeFactions.length ?? 0;
    ctx.fillStyle = C.textDim;
    ctx.fillText(`FACTIONS: ${fc}`, x + 600, y + 16);

    // Bottom border
    ctx.fillStyle = C.orange;
    ctx.fillRect(x, y + h - 1, w, 1);
  }

  // ── Commodity table ───────────────────────────────────────────

  private drawCommodities(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'COMMODITIES');

    // Column headers
    const hy = y + 28;
    ctx.font = '9px monospace';
    ctx.fillStyle = C.textDim;
    ctx.fillText('ITEM', x + 6, hy);
    ctx.fillText('PRICE', x + 100, hy);
    ctx.fillText('CHG', x + 148, hy);
    ctx.fillText('SUP', x + 192, hy);
    ctx.fillText('VOL', x + 224, hy);
    ctx.fillText('HI', x + 254, hy);
    ctx.fillText('LO', x + 284, hy);
    // Sparkline header
    ctx.fillText('CHART', x + w - 70, hy);

    // Separator
    ctx.fillStyle = C.panelBorder;
    ctx.fillRect(x + 4, hy + 4, w - 8, 1);

    let row = 0;
    const rowH = 16;
    const maxRows = Math.floor((h - 38) / rowH);

    for (const [, ticker] of this.tickers) {
      if (row >= maxRows) break;
      const ry = y + 36 + row * rowH;

      // Alternate row bg
      if (row % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x + 2, ry - 10, w - 4, rowH);
      }

      const emoji = ITEM_EMOJI[ticker.itemType] ?? '';
      const name = (ITEM_NAMES[ticker.itemType] ?? '???').substring(0, 8);
      const price = ticker.priceIndex.toFixed(1);
      const change = ticker.priceIndex - ticker.prevPrice;
      const changePct = (change / Math.max(ticker.prevPrice, 0.01)) * 100;
      const col = ticker.trend > 0 ? C.green : ticker.trend < 0 ? C.red : C.text;

      ctx.font = '10px monospace';
      ctx.fillStyle = C.text;
      ctx.fillText(`${emoji}${name}`, x + 6, ry);

      ctx.fillStyle = col;
      ctx.fillText(price.padStart(5), x + 100, ry);

      const changeStr = (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%';
      ctx.fillStyle = col;
      ctx.font = '9px monospace';
      ctx.fillText(changeStr, x + 144, ry);

      ctx.fillStyle = C.textDim;
      ctx.fillText(String(ticker.supply).padStart(4), x + 190, ry);
      ctx.fillText(String(ticker.volume).padStart(4), x + 222, ry);
      ctx.fillStyle = C.green;
      ctx.fillText(ticker.high.toFixed(1), x + 250, ry);
      ctx.fillStyle = C.red;
      ctx.fillText(ticker.low.toFixed(1), x + 280, ry);

      // Sparkline
      this.drawSparkline(ctx, x + w - 76, ry - 8, 68, 12, ticker.history, col);

      row++;
    }
  }

  // ── Market Index Chart ────────────────────────────────────────

  private drawMarketIndexChart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'SERES COMPOSITE INDEX');

    const chartX = x + 40;
    const chartY = y + 26;
    const chartW = w - 52;
    const chartH = h - 36;

    if (chartH < 20 || chartW < 20) return;

    // Grid
    ctx.strokeStyle = C.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = chartY + (i / 4) * chartH;
      ctx.beginPath(); ctx.moveTo(chartX, gy); ctx.lineTo(chartX + chartW, gy); ctx.stroke();
    }

    const history = this.marketIndexHistory;
    if (history.length < 2) return;

    const min = Math.min(...history) * 0.95;
    const max = Math.max(...history) * 1.05;
    const range = max - min || 1;

    // Y-axis labels
    ctx.fillStyle = C.textDim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = max - (i / 4) * range;
      ctx.fillText(val.toFixed(0), chartX - 4, chartY + (i / 4) * chartH + 3);
    }
    ctx.textAlign = 'left';

    // Fill area under curve
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const px = chartX + (i / (history.length - 1)) * chartW;
      const py = chartY + (1 - (history[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.lineTo(chartX, chartY + chartH);
    ctx.closePath();

    const lastVal = history[history.length - 1];
    const prevVal = history.length > 1 ? history[history.length - 2] : lastVal;
    const isUp = lastVal >= prevVal;
    const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
    grad.addColorStop(0, isUp ? 'rgba(0,204,102,0.25)' : 'rgba(204,51,51,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.strokeStyle = isUp ? C.green : C.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const px = chartX + (i / (history.length - 1)) * chartW;
      const py = chartY + (1 - (history[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    // Current value label
    const lastPx = chartX + chartW;
    const lastPy = chartY + (1 - (lastVal - min) / range) * chartH;
    ctx.fillStyle = isUp ? C.green : C.red;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(lastVal.toFixed(1), lastPx - 40, lastPy - 6);

    // Dot
    ctx.beginPath();
    ctx.arc(lastPx, lastPy, 3, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? C.green : C.red;
    ctx.fill();
  }

  // ── GDP Panel ─────────────────────────────────────────────────

  private drawGDPPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'FACTION GDP & TRADE BALANCE');

    if (!this.factionManager) return;

    const factions = this.factionManager.activeFactions
      .map(f => ({
        f, gdp: this.factionGDP.get(f.id) ?? 0,
        bal: this.factionTradeBalance.get(f.id) ?? 0,
        pop: f.memberIds.size,
        tier: (f as any).settlementTier ?? '',
      }))
      .sort((a, b) => b.gdp - a.gdp);

    const maxGDP = Math.max(1, ...factions.map(f => f.gdp));
    const rowH = 18;
    const maxRows = Math.floor((h - 30) / rowH);
    const barX = x + 160;
    const barW = w - 230;

    for (let i = 0; i < Math.min(factions.length, maxRows); i++) {
      const { f, gdp, bal, pop, tier } = factions[i];
      const ry = y + 30 + i * rowH;

      // Faction info
      ctx.font = '10px monospace';
      ctx.fillStyle = C.text;
      const fName = `${f.emoji} ${f.name.substring(0, 10)}`;
      ctx.fillText(fName, x + 6, ry);

      // Pop + tier
      ctx.fillStyle = C.textDim;
      ctx.font = '8px monospace';
      ctx.fillText(`${pop}p ${tier}`, x + 110, ry);

      // GDP bar
      const barLen = Math.max(1, (gdp / maxGDP) * barW);
      const fColor = `hsl(${f.color}, 60%, 35%)`;
      const fColorBright = `hsl(${f.color}, 70%, 50%)`;
      ctx.fillStyle = fColor;
      ctx.fillRect(barX, ry - 10, barLen, 13);
      ctx.fillStyle = fColorBright;
      ctx.fillRect(barX, ry - 10, barLen, 2); // highlight top edge

      // GDP value
      ctx.font = '9px monospace';
      ctx.fillStyle = C.textBright;
      ctx.fillText(gdp.toFixed(0), barX + barLen + 4, ry);

      // Trade balance
      const balStr = bal > 0 ? `+${bal.toFixed(0)}` : bal.toFixed(0);
      ctx.fillStyle = bal > 0 ? C.green : bal < 0 ? C.red : C.textDim;
      ctx.fillText(balStr, x + w - 50, ry);

      // GDP sparkline
      const gh = this.gdpHistory.get(f.id);
      if (gh && gh.length > 2) {
        this.drawSparkline(ctx, x + w - 110, ry - 8, 50, 10, gh, fColorBright);
      }
    }
  }

  // ── Sephiroth mini display ────────────────────────────────────

  private drawSephirothMini(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'JACHIN / BOAZ PILLARS');

    const pillars = this.sephirothSystem?.pillars;
    if (!pillars) {
      ctx.fillStyle = C.textDim;
      ctx.font = '10px monospace';
      ctx.fillText('Awaiting pillar data...', x + 10, y + 40);
      return;
    }

    // Balance meter
    const meterX = x + 60;
    const meterY = y + 24;
    const meterW = w - 120;
    const meterH = 14;

    // Gradient background
    const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
    grad.addColorStop(0, 'rgba(128,0,255,0.4)');
    grad.addColorStop(0.5, 'rgba(50,50,80,0.2)');
    grad.addColorStop(1, 'rgba(255,215,0,0.4)');
    ctx.fillStyle = '#0a0a15';
    ctx.fillRect(meterX, meterY, meterW, meterH);
    ctx.fillStyle = grad;
    ctx.fillRect(meterX, meterY, meterW, meterH);

    // Pointer
    const balPos = (pillars.balance + 1) / 2;
    const ptrX = meterX + balPos * meterW;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ptrX - 1, meterY - 2, 3, meterH + 4);

    ctx.font = '8px monospace';
    ctx.fillStyle = C.purple;
    ctx.fillText('BOAZ', x + 8, meterY + 10);
    ctx.fillStyle = C.gold;
    ctx.textAlign = 'right';
    ctx.fillText('JACHIN', x + w - 8, meterY + 10);
    ctx.textAlign = 'left';

    // Amplitudes
    ctx.font = '9px monospace';
    ctx.fillStyle = C.purple;
    ctx.fillText(`Amp: ${pillars.boaz.amplitude.toFixed(3)}`, x + 8, meterY + 28);
    ctx.fillStyle = C.gold;
    ctx.textAlign = 'right';
    ctx.fillText(`Amp: ${pillars.jachin.amplitude.toFixed(3)}`, x + w - 8, meterY + 28);
    ctx.textAlign = 'left';

    // Waveform
    const waveY = meterY + 34;
    const waveH = h - (waveY - y) - 6;
    const waveW = w - 16;

    if (waveH < 10) return;

    ctx.fillStyle = '#060610';
    ctx.fillRect(x + 8, waveY, waveW, waveH);

    // Center line
    ctx.strokeStyle = C.gridLine;
    ctx.beginPath();
    ctx.moveTo(x + 8, waveY + waveH / 2);
    ctx.lineTo(x + 8 + waveW, waveY + waveH / 2);
    ctx.stroke();

    const history = pillars.pulseHistory;
    if (history.length < 2) return;
    const len = history.length;
    const step = waveW / (len - 1);

    // Jachin wave (gold)
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = x + 8 + i * step;
      const py = waveY + waveH / 2 - history[i].jachin * (waveH / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Boaz wave (purple)
    ctx.strokeStyle = C.purple;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const px = x + 8 + i * step;
      const py = waveY + waveH / 2 - history[i].boaz * (waveH / 2) * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    // Event markers (subtle vertical lines)
    for (let i = 0; i < len; i++) {
      if (history[i].event) {
        const px = x + 8 + i * step;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px, waveY, 1, waveH);
      }
    }
  }

  // ── Conflicts ─────────────────────────────────────────────────

  private drawConflicts(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'CONFLICTS & DIPLOMACY');

    if (!this.factionManager || !this.politicsSystem) return;

    let row = 0;
    const rowH = 16;
    const maxRows = Math.floor((h - 28) / rowH);
    const factions = this.factionManager.activeFactions;
    const shown = new Set<string>();

    // Wars
    for (const fA of factions) {
      const ndA = this.politicsSystem.getNation(fA.id);
      if (!ndA) continue;
      for (const targetId of ndA.warTargets) {
        const key = Math.min(fA.id, targetId) + ':' + Math.max(fA.id, targetId);
        if (shown.has(key)) continue;
        shown.add(key);
        if (row >= maxRows) break;

        const fB = factions.find(f => f.id === targetId);
        if (!fB) continue;
        const ndB = this.politicsSystem.getNation(targetId);
        const ry = y + 28 + row * rowH;

        ctx.font = '10px monospace';
        ctx.fillStyle = C.red;
        ctx.fillText('\u2694\uFE0F', x + 6, ry);
        ctx.fillStyle = '#ff8888';
        ctx.fillText(`${fA.emoji}${fA.name.substring(0, 7)} vs ${fB.emoji}${fB.name.substring(0, 7)}`, x + 24, ry);

        // Exhaustion bars
        const bx = x + w - 90;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(bx, ry - 8, 36, 6);
        ctx.fillStyle = C.orange;
        ctx.fillRect(bx, ry - 8, ndA.warExhaustion * 36, 6);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(bx + 42, ry - 8, 36, 6);
        ctx.fillStyle = C.orange;
        ctx.fillRect(bx + 42, ry - 8, (ndB?.warExhaustion ?? 0) * 36, 6);

        row++;
      }

      // Alliances
      for (const allyId of ndA.allies) {
        const key = 'a' + Math.min(fA.id, allyId) + ':' + Math.max(fA.id, allyId);
        if (shown.has(key)) continue;
        shown.add(key);
        if (row >= maxRows) break;

        const fB = factions.find(f => f.id === allyId);
        if (!fB) continue;
        const ry = y + 28 + row * rowH;

        ctx.fillStyle = C.green;
        ctx.font = '10px monospace';
        ctx.fillText('\u{1F91D}', x + 6, ry);
        ctx.fillStyle = '#88ffaa';
        ctx.fillText(`${fA.emoji}${fA.name.substring(0, 7)} + ${fB.emoji}${fB.name.substring(0, 7)}`, x + 24, ry);
        row++;
      }

      // Vassals
      for (const vassalId of ndA.vassals) {
        const key = 'v' + fA.id + ':' + vassalId;
        if (shown.has(key)) continue;
        shown.add(key);
        if (row >= maxRows) break;

        const fB = factions.find(f => f.id === vassalId);
        if (!fB) continue;
        const ry = y + 28 + row * rowH;

        ctx.fillStyle = C.yellow;
        ctx.font = '10px monospace';
        ctx.fillText('\u{1F451}', x + 6, ry);
        ctx.fillStyle = '#ccaa44';
        ctx.fillText(`${fA.emoji}${fA.name.substring(0, 7)} > ${fB.emoji}${fB.name.substring(0, 7)}`, x + 24, ry);
        row++;
      }
    }

    // Active raids
    if (this.raidSystem) {
      for (const raid of this.raidSystem.activeRaids) {
        if (row >= maxRows) break;
        const ry = y + 28 + row * rowH;
        const attF = factions.find(f => f.id === raid.attackerFaction);
        const defF = factions.find(f => f.id === raid.defenderFaction);
        const phases = ['MUSTER', 'MARCH', 'RAID!', 'RETREAT'];

        ctx.font = '10px monospace';
        ctx.fillStyle = C.orange;
        ctx.fillText('\u{1F3F4}', x + 6, ry);
        ctx.fillStyle = '#ffaa44';
        ctx.fillText(`${attF?.emoji ?? '?'}\u2192${defF?.emoji ?? '?'} [${phases[raid.phase]}] ${raid.raiders.length}r`, x + 24, ry);
        row++;
      }
    }

    if (row === 0) {
      ctx.fillStyle = C.textDim;
      ctx.font = '10px monospace';
      ctx.fillText('No active conflicts', x + 8, y + 40);
    }
  }

  // ── Dialectic ─────────────────────────────────────────────────

  private drawDialectic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'DIALECTIC SYSTEM');

    const global = this.dialecticSystem?.global;
    if (!global) {
      ctx.fillStyle = C.textDim;
      ctx.font = '10px monospace';
      ctx.fillText('Awaiting dialectic data...', x + 8, y + 36);
      return;
    }

    // Global stacked bar
    const barY = y + 26;
    const barW = w - 16;
    const total = global.imperialIndex + global.revolutionaryIndex + global.stabilityIndex || 1;
    const impW = (global.imperialIndex / total) * barW;
    const revW = (global.revolutionaryIndex / total) * barW;
    const stabW = (global.stabilityIndex / total) * barW;

    ctx.fillStyle = '#882222';
    ctx.fillRect(x + 8, barY, impW, 12);
    ctx.fillStyle = '#cc6600';
    ctx.fillRect(x + 8 + impW, barY, revW, 12);
    ctx.fillStyle = '#226622';
    ctx.fillRect(x + 8 + impW + revW, barY, stabW, 12);

    // Labels on bar
    ctx.font = '8px monospace';
    ctx.fillStyle = '#ffaaaa';
    if (impW > 30) ctx.fillText('IMP', x + 10, barY + 10);
    ctx.fillStyle = '#ffcc88';
    if (revW > 30) ctx.fillText('REV', x + 10 + impW, barY + 10);
    ctx.fillStyle = '#aaffaa';
    if (stabW > 30) ctx.fillText('STB', x + 10 + impW + revW, barY + 10);

    // Values
    ctx.fillStyle = C.textDim;
    ctx.font = '8px monospace';
    ctx.fillText(
      `Thesis:${global.imperialIndex.toFixed(2)}  Antithesis:${global.revolutionaryIndex.toFixed(2)}  Synthesis:${global.stabilityIndex.toFixed(2)}  Wave:${global.conflictWaveAmplitude.toFixed(2)}`,
      x + 8, barY + 24,
    );

    // Per-faction dialectic
    if (this.factionManager) {
      let row = 0;
      const rowY = barY + 32;
      const rowH = 14;
      const maxRows = Math.floor((h - (rowY - y) - 4) / rowH);

      for (const faction of this.factionManager.activeFactions) {
        if (row >= maxRows) break;
        const ds = this.dialecticSystem?.getState(faction.id);
        if (!ds) continue;
        const ry = rowY + row * rowH;

        ctx.font = '9px monospace';
        ctx.fillStyle = C.text;
        ctx.fillText(`${faction.emoji}`, x + 8, ry);

        // Mini thesis/antithesis/synthesis bars
        const bx = x + 24;
        const bw = 60;
        ctx.fillStyle = '#441111';
        ctx.fillRect(bx, ry - 8, bw * ds.thesis, 4);
        ctx.fillStyle = '#cc3300';
        ctx.fillRect(bx, ry - 8, bw * ds.thesis, 4);
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(bx, ry - 3, bw * ds.antithesis, 4);
        ctx.fillStyle = '#228822';
        ctx.fillRect(bx, ry + 2, bw * ds.synthesis, 4);

        // Oppression ratio
        ctx.fillStyle = ds.oppressionRatio > 0.4 ? C.red : C.textDim;
        ctx.fillText(`opp:${(ds.oppressionRatio * 100).toFixed(0)}%`, x + 90, ry);

        // Revolution indicator
        if (ds.consecutiveOppression >= 2) {
          ctx.fillStyle = C.red;
          ctx.font = 'bold 9px monospace';
          ctx.fillText('\u{1F525}REV', x + w - 44, ry);
        } else if (ds.revolutionaryCount > 0) {
          ctx.fillStyle = C.orange;
          ctx.font = '9px monospace';
          ctx.fillText(`${ds.revolutionaryCount}rev`, x + w - 44, ry);
        }

        row++;
      }
    }
  }

  // ── Event Feed ────────────────────────────────────────────────

  private drawEventFeed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.panelBg(ctx, x, y, w, h);
    this.panelTitle(ctx, x, y, 'EVENT FEED');

    const lineH = 13;
    const maxLines = Math.floor((h - 26) / lineH);
    const startIdx = Math.max(0, this.events.length - maxLines);

    ctx.font = '9px monospace';
    for (let i = startIdx; i < this.events.length; i++) {
      const ev = this.events[i];
      const lineY = y + 26 + (i - startIdx) * lineH;

      // Timestamp
      ctx.fillStyle = C.textDim;
      ctx.fillText(`${ev.tick}`, x + 6, lineY);

      // Type indicator
      const typeColors: Record<string, string> = {
        trade: C.cyan, war: C.red, peace: C.green,
        raid: C.orange, revolution: C.purple, alliance: C.blue, info: C.textDim,
      };
      ctx.fillStyle = typeColors[ev.type] ?? C.textDim;
      ctx.fillRect(x + 46, lineY - 8, 2, 10);

      // Text
      ctx.fillStyle = ev.color;
      const maxTextW = w - 58;
      const text = ev.text.length > 60 ? ev.text.substring(0, 57) + '...' : ev.text;
      ctx.fillText(text, x + 54, lineY);
    }

    // Blinking cursor at bottom
    if (this.animFrame % 40 < 20) {
      const cursorY = y + 26 + Math.min(this.events.length - startIdx, maxLines) * lineH;
      ctx.fillStyle = C.green;
      ctx.fillRect(x + 6, cursorY - 6, 6, 10);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private panelBg(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private panelTitle(ctx: CanvasRenderingContext2D, x: number, y: number, title: string): void {
    const ctx2 = this.ctx;
    ctx2.fillStyle = C.headerBg;
    ctx2.fillRect(x + 1, y + 1, 200, 16);
    ctx2.fillStyle = C.orange;
    ctx2.font = 'bold 10px monospace';
    ctx2.textAlign = 'left';
    ctx2.fillText(title, x + 6, y + 12);
  }

  private drawSparkline(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    data: number[], color: string,
  ): void {
    if (data.length < 2) return;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const px = x + (i / (data.length - 1)) * w;
      const py = y + h - ((data[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
