// SimStats: per-session stats tracker + persistent RunLog via IndexedDB

export const enum DeathCause {
  Starvation = 0,
  OldAge = 1,
  Combat = 2,
}

export interface PopSnapshot {
  tick: number;
  alive: number;
  avgHunger: number;
  avgEnergy: number;
  avgGlucose: number;
}

export class SimStats {
  // Lifetime counters
  births = 0;
  deaths = 0;
  deathsByStarvation = 0;
  deathsByAge = 0;
  deathsByCombat = 0;
  totalFoodEaten = 0;
  totalFoodGathered = 0;
  totalLifespan = 0;
  totalCrafts = 0;
  totalTrades = 0;
  totalGodActions = 0;
  totalPickups = 0;
  totalDrops = 0;
  totalPowerSpent = 0;
  totalPowerGenerated = 0;
  totalRaids = 0;
  totalRaidSuccess = 0;
  totalRaidFailed = 0;
  totalRevolutions = 0;
  totalRevolutionSuccess = 0;
  totalWars = 0;
  totalPeaceTreaties = 0;
  totalAbsorptions = 0;
  totalTradeVolume = 0;
  peakGDP = 0;
  totalTerritoryChanges = 0;

  // Current tick (set externally)
  tick = 0;

  // Session metadata (set by caller)
  seed = 0;
  startedAt = Date.now();

  // Population snapshots (every N ticks)
  snapshots: PopSnapshot[] = [];
  private snapshotInterval = 500;
  private lastSnapshot = 0;

  // Per-session peak/trough
  peakPopulation = 0;
  troughPopulation = Infinity;

  recordBirth(): void { this.births++; }

  recordDeath(cause: DeathCause, ageAtDeath: number): void {
    this.deaths++;
    this.totalLifespan += ageAtDeath;
    switch (cause) {
      case DeathCause.Starvation: this.deathsByStarvation++; break;
      case DeathCause.OldAge: this.deathsByAge++; break;
      case DeathCause.Combat: this.deathsByCombat++; break;
    }
  }

  recordEat(): void { this.totalFoodEaten++; }
  recordGather(): void { this.totalFoodGathered++; }
  recordCraft(): void { this.totalCrafts++; }
  recordTrade(): void { this.totalTrades++; }
  recordGodAction(powerCost: number): void {
    this.totalGodActions++;
    this.totalPickups++;
    this.totalDrops++;
    this.totalPowerSpent += powerCost;
  }
  recordRaid(success: boolean): void {
    this.totalRaids++;
    if (success) this.totalRaidSuccess++;
    else this.totalRaidFailed++;
  }
  recordRevolution(success: boolean): void {
    this.totalRevolutions++;
    if (success) this.totalRevolutionSuccess++;
  }
  recordWarDeclared(): void { this.totalWars++; }
  recordPeaceTreaty(): void { this.totalPeaceTreaties++; }
  recordAbsorption(): void { this.totalAbsorptions++; }
  recordTradeVolume(value: number): void { this.totalTradeVolume += value; }

  tickUpdate(alive: number, avgHunger: number, avgEnergy: number, avgGlucose: number): void {
    if (alive > this.peakPopulation) this.peakPopulation = alive;
    if (alive < this.troughPopulation) this.troughPopulation = alive;

    if (this.tick - this.lastSnapshot >= this.snapshotInterval) {
      this.snapshots.push({ tick: this.tick, alive, avgHunger, avgEnergy, avgGlucose });
      if (this.snapshots.length > 400) this.snapshots.shift();
      this.lastSnapshot = this.tick;
    }
  }

  get avgLifespan(): number {
    return this.deaths > 0 ? Math.round(this.totalLifespan / this.deaths) : 0;
  }

  get starvationRate(): number {
    return this.deaths > 0 ? this.deathsByStarvation / this.deaths : 0;
  }

  summary(): string {
    return [
      `--- SimStats (tick ${this.tick}) ---`,
      `Pop: peak=${this.peakPopulation} trough=${this.troughPopulation === Infinity ? 0 : this.troughPopulation}`,
      `Births: ${this.births}  Deaths: ${this.deaths}`,
      `  Starvation: ${this.deathsByStarvation} (${(this.starvationRate * 100).toFixed(0)}%)`,
      `  Old age: ${this.deathsByAge}  Combat: ${this.deathsByCombat}`,
      `Avg lifespan: ${this.avgLifespan} ticks`,
      `Food: eaten=${this.totalFoodEaten} gathered=${this.totalFoodGathered}`,
      `Crafts: ${this.totalCrafts}  Trades: ${this.totalTrades}`,
      `God Actions: ${this.totalGodActions}  Power spent: ${this.totalPowerSpent.toFixed(0)}`,
      `Raids: ${this.totalRaids} (${this.totalRaidSuccess} won, ${this.totalRaidFailed} lost)`,
      `Revolutions: ${this.totalRevolutions} (${this.totalRevolutionSuccess} succeeded)`,
      `Wars: ${this.totalWars}  Peace: ${this.totalPeaceTreaties}  Absorptions: ${this.totalAbsorptions}`,
    ].join('\n');
  }

  /** Serialize to a storable run record */
  toRunRecord(): RunRecord {
    return {
      id: `${this.seed}-${this.startedAt}`,
      seed: this.seed,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      ticks: this.tick,
      births: this.births,
      deaths: this.deaths,
      deathsByStarvation: this.deathsByStarvation,
      deathsByAge: this.deathsByAge,
      deathsByCombat: this.deathsByCombat,
      avgLifespan: this.avgLifespan,
      starvationRate: Math.round(this.starvationRate * 100),
      peakPopulation: this.peakPopulation,
      troughPopulation: this.troughPopulation === Infinity ? 0 : this.troughPopulation,
      totalFoodEaten: this.totalFoodEaten,
      totalFoodGathered: this.totalFoodGathered,
      totalCrafts: this.totalCrafts,
      totalTrades: this.totalTrades,
      totalGodActions: this.totalGodActions,
      totalPowerSpent: this.totalPowerSpent,
      totalRaids: this.totalRaids,
      totalRaidSuccess: this.totalRaidSuccess,
      totalRevolutions: this.totalRevolutions,
      totalRevolutionSuccess: this.totalRevolutionSuccess,
      totalWars: this.totalWars,
      totalPeaceTreaties: this.totalPeaceTreaties,
      totalAbsorptions: this.totalAbsorptions,
      totalTradeVolume: this.totalTradeVolume,
      snapshots: this.snapshots,
    };
  }
}

// ─── Run Record (what gets persisted) ────────────────────────

export interface RunRecord {
  id: string;
  seed: number;
  startedAt: number;
  endedAt: number;
  ticks: number;
  births: number;
  deaths: number;
  deathsByStarvation: number;
  deathsByAge: number;
  deathsByCombat: number;
  avgLifespan: number;
  starvationRate: number; // 0-100
  peakPopulation: number;
  troughPopulation: number;
  totalFoodEaten: number;
  totalFoodGathered: number;
  totalCrafts: number;
  totalTrades: number;
  totalGodActions: number;
  totalPowerSpent: number;
  totalRaids: number;
  totalRaidSuccess: number;
  totalRevolutions: number;
  totalRevolutionSuccess: number;
  totalWars: number;
  totalPeaceTreaties: number;
  totalAbsorptions: number;
  totalTradeVolume: number;
  snapshots: PopSnapshot[];
}

// ─── IndexedDB persistence ───────────────────────────────────

const DB_NAME = 'creatures-stats';
const DB_VERSION = 1;
const STORE_NAME = 'runs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a run record to IndexedDB */
export async function saveRunRecord(record: RunRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log(`[SimStats] Run saved: ${record.id} (${record.ticks} ticks, ${record.deaths} deaths)`);
  } catch (e) {
    console.warn('[SimStats] Failed to save run:', e);
  }
}

/** Load all run records from IndexedDB */
export async function loadAllRuns(): Promise<RunRecord[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.warn('[SimStats] Failed to load runs:', e);
    return [];
  }
}

/** Export all runs as a JSON string (for downloading) */
export async function exportRunsJSON(): Promise<string> {
  const runs = await loadAllRuns();
  return JSON.stringify(runs, null, 2);
}

/** Export all runs as CSV */
export async function exportRunsCSV(): Promise<string> {
  const runs = await loadAllRuns();
  if (runs.length === 0) return '';
  const headers = [
    'id', 'seed', 'startedAt', 'endedAt', 'ticks',
    'births', 'deaths', 'deathsByStarvation', 'deathsByAge', 'deathsByCombat',
    'avgLifespan', 'starvationRate', 'peakPopulation', 'troughPopulation',
    'totalFoodEaten', 'totalFoodGathered', 'totalCrafts', 'totalTrades',
    'totalGodActions', 'totalPowerSpent',
    'totalRaids', 'totalRaidSuccess', 'totalRevolutions', 'totalRevolutionSuccess',
    'totalWars', 'totalPeaceTreaties', 'totalAbsorptions', 'totalTradeVolume',
  ];
  const rows = runs.map(r => headers.map(h => (r as any)[h] ?? '').join(','));
  return [headers.join(','), ...rows].join('\n');
}

/** Clear all stored runs */
export async function clearAllRuns(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[SimStats] All runs cleared');
  } catch (e) {
    console.warn('[SimStats] Failed to clear runs:', e);
  }
}

// ─── Global singleton ────────────────────────────────────────

export let simStats = new SimStats();

export function resetSimStats(): void {
  simStats = new SimStats();
}

/** Finalize current session and persist to IndexedDB. Call before cleanup. */
export async function finalizeAndSaveRun(): Promise<void> {
  if (simStats.tick < 100) return; // don't save trivially short runs
  const record = simStats.toRunRecord();
  await saveRunRecord(record);
}
