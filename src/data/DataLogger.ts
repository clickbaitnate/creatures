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

export class DataLogger {
  tickRecords: TickRecord[] = [];
  epochRecords: EpochRecord[] = [];
  deathRecords: DeathRecord[] = [];
  events: EventRecord[] = [];

  private tickCounter = 0;
  private epochCounter = 0;
  private birthCount = 0;
  private deathCount = 0;

  recordBirth(): void { this.birthCount++; }
  recordDeath(record: DeathRecord): void {
    this.deathCount++;
    this.deathRecords.push(record);
    // Keep manageable size
    if (this.deathRecords.length > 5000) this.deathRecords.shift();
  }

  recordEvent(tick: number, type: string, data: Record<string, any>): void {
    this.events.push({ tick, type, data });
    if (this.events.length > 10000) this.events.shift();
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
      },
      timeseries: this.tickRecords,
      epochs: this.epochRecords,
      deaths: this.deathRecords,
      events: this.events,
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
