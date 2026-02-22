// Diary component: per-creature event log stored as a ring buffer.

import { ComponentStorage } from '../ecs/Component';

export enum DiaryEventType {
  Born,
  FactionJoin,
  FactionLeave,
  FactionFounded,
  Trade,
  CombatWin,
  CombatLoss,
  MonsterKill,
  Mated,
  ChildBorn,
  HuntSuccess,
  BuildComplete,
  GatherMilestone,
  FoodShared,
  FoodReceived,
  DominanceWin,
  DominanceLoss,
  BondFormed,
  DivineIntervention,
  WitnessedDivine,
  Raided,
  WasRaided,
  RevoltJoined,
  RevoltWon,
}

export interface DiaryEntry {
  tick: number;
  type: DiaryEventType;
  otherId: number;       // -1 if not applicable
  otherName: string;     // cached name string
  itemGiven: number;     // ItemType or -1
  itemReceived: number;  // ItemType or -1
  factionName: string;   // faction name if relevant
  detail: string;        // extra detail string
}

const MAX_ENTRIES = 100;

export interface DiaryData {
  entries: DiaryEntry[];
  nextSlot: number;
  totalEvents: number;
  killCount: number;
  tradeCount: number;
  offspringCount: number;
  gatherCount: number;
}

export const DiaryStore = new ComponentStorage<DiaryData>();

export function createDiary(): DiaryData {
  return {
    entries: [],
    nextSlot: 0,
    totalEvents: 0,
    killCount: 0,
    tradeCount: 0,
    offspringCount: 0,
    gatherCount: 0,
  };
}

function emptyEntry(): DiaryEntry {
  return {
    tick: 0,
    type: DiaryEventType.Born,
    otherId: -1,
    otherName: '',
    itemGiven: -1,
    itemReceived: -1,
    factionName: '',
    detail: '',
  };
}

export function addDiaryEntry(
  diary: DiaryData,
  tick: number,
  type: DiaryEventType,
  opts: Partial<Omit<DiaryEntry, 'tick' | 'type'>> = {},
): void {
  const entry: DiaryEntry = {
    ...emptyEntry(),
    ...opts,
    tick,
    type,
  };

  if (diary.entries.length < MAX_ENTRIES) {
    diary.entries.push(entry);
  } else {
    diary.entries[diary.nextSlot] = entry;
  }
  diary.nextSlot = (diary.nextSlot + 1) % MAX_ENTRIES;
  diary.totalEvents++;

  // Update lifetime counters
  switch (type) {
    case DiaryEventType.MonsterKill:
    case DiaryEventType.CombatWin:
      diary.killCount++;
      break;
    case DiaryEventType.Trade:
      diary.tradeCount++;
      break;
    case DiaryEventType.Mated:
    case DiaryEventType.ChildBorn:
      diary.offspringCount++;
      break;
    case DiaryEventType.GatherMilestone:
    case DiaryEventType.HuntSuccess:
      diary.gatherCount++;
      break;
  }
}
