// Data logger for ML analysis — records simulation state at various intervals

export interface TickRecord {
  tick: number;
  population: number;
  avgEnergy: number;
  avgHunger: number;
  births: number;
  deaths: number;
  zodiacSign: number;
}

export interface EpochRecord {
  tick: number;
  factions: { id: number; name: string; territory: number; members: number; government: string }[];
  tradeVolume: number;
  buildingCount: number;
  breedCounts: Record<string, number>;
}

export interface DeathRecord {
  tick: number;
  entityId: number;
  age: number;
  factionId: number;
  cause: string;
  offspringCount: number;
}

export interface EventRecord {
  tick: number;
  type: string;
  data: Record<string, any>;
}

export interface GodActionRecord {
  tick: number;
  entityId: number;
  originX: number;
  originZ: number;
  dropX: number;
  dropZ: number;
  originBiome: number;
  dropBiome: number;
  distance: number;
  preZealotry: number;
  postZealotry: number;
  stance: number;
  witnessCount: number;
  powerCost: number;
}

export interface MarketRecord {
  tick: number;
  buyerFaction: number;
  sellerFaction: number;
  itemGiven: number;
  itemReceived: number;
  priceIndex: number;
}

export interface ConflictRecord {
  tick: number;
  type: 'war_declared' | 'peace_treaty' | 'raid' | 'raid_failed' | 'revolution' | 'revolution_failed' | 'alliance' | 'vassalization' | 'absorption';
  factionA: number;
  factionB: number;
  casualties: number;
  territoryChange: number;
  lootValue: number;
}

export interface TerritoryRecord {
  tick: number;
  factionId: number;
  cells: number;
  gerrymanderScore: number;
  contestedCells: number;
}

export interface DialecticRecord {
  tick: number;
  factionId: number;
  thesis: number;
  antithesis: number;
  synthesis: number;
  oppressionRatio: number;
  jachinAmplitude: number;
  boazAmplitude: number;
}

export class DataLogger {
  tickRecords: TickRecord[] = [];
  epochRecords: EpochRecord[] = [];
  deathRecords: DeathRecord[] = [];
  events: EventRecord[] = [];
  godActions: GodActionRecord[] = [];
  marketRecords: MarketRecord[] = [];
  conflictRecords: ConflictRecord[] = [];
  territoryRecords: TerritoryRecord[] = [];
  dialecticRecords: DialecticRecord[] = [];

  private tickCounter = 0;
  private epochCounter = 0;
  private birthCount = 0;
  private deathCount = 0;

  recordBirth(): void { this.birthCount++; }
  recordDeath(record: DeathRecord): void {
    this.deathCount++;
    this.deathRecords.push(record);
    if (this.deathRecords.length > 5000) this.deathRecords.shift();
  }

  recordEvent(tick: number, type: string, data: Record<string, any>): void {
    this.events.push({ tick, type, data });
    if (this.events.length > 10000) this.events.shift();
  }

  recordGodAction(record: GodActionRecord): void {
    this.godActions.push(record);
    if (this.godActions.length > 5000) this.godActions.shift();
  }

  recordMarket(record: MarketRecord): void {
    this.marketRecords.push(record);
    if (this.marketRecords.length > 10000) this.marketRecords.shift();
  }

  recordConflict(record: ConflictRecord): void {
    this.conflictRecords.push(record);
    if (this.conflictRecords.length > 5000) this.conflictRecords.shift();
  }

  recordTerritory(record: TerritoryRecord): void {
    this.territoryRecords.push(record);
    if (this.territoryRecords.length > 5000) this.territoryRecords.shift();
  }

  recordDialectic(record: DialecticRecord): void {
    this.dialecticRecords.push(record);
    if (this.dialecticRecords.length > 5000) this.dialecticRecords.shift();
  }

  tickLog(tick: number, population: number, avgEnergy: number, avgHunger: number, zodiacSign: number): void {
    this.tickCounter++;
    if (this.tickCounter < 10) return; // log every 10 ticks
    this.tickCounter = 0;

    this.tickRecords.push({
      tick,
      population,
      avgEnergy,
      avgHunger,
      births: this.birthCount,
      deaths: this.deathCount,
      zodiacSign,
    });
    this.birthCount = 0;
    this.deathCount = 0;

    // Keep manageable size
    if (this.tickRecords.length > 50000) this.tickRecords.shift();
  }

  epochLog(record: EpochRecord): void {
    this.epochRecords.push(record);
    if (this.epochRecords.length > 5000) this.epochRecords.shift();
  }

  exportJSON(): string {
    return JSON.stringify({
      metadata: {
        exportDate: new Date().toISOString(),
        tickRecordCount: this.tickRecords.length,
        epochRecordCount: this.epochRecords.length,
        deathRecordCount: this.deathRecords.length,
        eventCount: this.events.length,
        marketRecordCount: this.marketRecords.length,
        conflictRecordCount: this.conflictRecords.length,
        territoryRecordCount: this.territoryRecords.length,
        dialecticRecordCount: this.dialecticRecords.length,
      },
      timeseries: this.tickRecords,
      epochs: this.epochRecords,
      deaths: this.deathRecords,
      events: this.events,
      market: this.marketRecords,
      conflicts: this.conflictRecords,
      territory: this.territoryRecords,
      dialectic: this.dialecticRecords,
    }, null, 2);
  }

  downloadJSON(): void {
    const json = this.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creatures-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
