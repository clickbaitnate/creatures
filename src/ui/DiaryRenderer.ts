// DiaryRenderer: converts diary entries to chronological prose sentences.

import { type DiaryData, type DiaryEntry, DiaryEventType } from '../components/Diary';
import { ITEM_NAMES, type ItemType } from '../components/Inventory';

/** CSS class for color-coding diary entries */
export type DiaryColor = 'trade' | 'combat' | 'social' | 'life';

export interface RenderedDiaryEntry {
  text: string;
  color: DiaryColor;
  tick: number;
}

function itemName(id: number): string {
  if (id < 0) return '';
  return ITEM_NAMES[id as ItemType] ?? 'item';
}

function dayFromTick(tick: number): number {
  // Day/night cycle is 6000 ticks per day
  return Math.floor(tick / 6000) + 1;
}

function entryToSentence(e: DiaryEntry): { text: string; color: DiaryColor } {
  const day = `Day ${dayFromTick(e.tick)}`;
  const other = e.otherName || 'someone';

  switch (e.type) {
    case DiaryEventType.Born:
      return { text: `${day} Born into the world.${e.factionName ? ' Joined ' + e.factionName + '.' : ''}`, color: 'life' };

    case DiaryEventType.FactionJoin:
      return { text: `${day} Joined ${e.factionName}.`, color: 'social' };

    case DiaryEventType.FactionLeave:
      return { text: `${day} Left ${e.factionName}.`, color: 'social' };

    case DiaryEventType.FactionFounded:
      return { text: `${day} Co-founded ${e.factionName}.`, color: 'social' };

    case DiaryEventType.Trade: {
      const gave = e.itemGiven >= 0 ? itemName(e.itemGiven) : '';
      const got = e.itemReceived >= 0 ? itemName(e.itemReceived) : '';
      if (gave && got) {
        return { text: `${day} Traded ${gave} for ${got} with ${other}.`, color: 'trade' };
      } else if (gave) {
        return { text: `${day} Gave ${gave} to ${other}.`, color: 'trade' };
      } else if (got) {
        return { text: `${day} Received ${got} from ${other}.`, color: 'trade' };
      }
      return { text: `${day} Bartered with ${other}.`, color: 'trade' };
    }

    case DiaryEventType.CombatWin:
      return { text: `${day} Won a fight against ${other}.`, color: 'combat' };

    case DiaryEventType.CombatLoss:
      return { text: `${day} Lost a fight to ${other}.`, color: 'combat' };

    case DiaryEventType.MonsterKill:
      return { text: `${day} Slew a ${e.detail || 'monster'}!`, color: 'combat' };

    case DiaryEventType.Mated:
      return { text: `${day} Mated with ${other}.`, color: 'life' };

    case DiaryEventType.ChildBorn:
      return { text: `${day} Offspring born with ${other}.`, color: 'life' };

    case DiaryEventType.HuntSuccess:
      return { text: `${day} Caught ${e.detail || 'prey'}.${e.otherName ? ' Shared with pack.' : ''}`, color: 'combat' };

    case DiaryEventType.BuildComplete:
      return { text: `${day} Built a ${e.detail || 'structure'}.`, color: 'life' };

    case DiaryEventType.GatherMilestone:
      return { text: `${day} Gathered ${e.detail || 'resources'} (milestone).`, color: 'trade' };

    case DiaryEventType.FoodShared:
      return { text: `${day} Shared food with ${other}.`, color: 'social' };

    case DiaryEventType.FoodReceived:
      return { text: `${day} Received food from ${other}.`, color: 'social' };

    case DiaryEventType.DominanceWin:
      return { text: `${day} Won a dominance challenge against ${other}.`, color: 'combat' };

    case DiaryEventType.DominanceLoss:
      return { text: `${day} Lost a dominance challenge to ${other}.`, color: 'combat' };

    case DiaryEventType.BondFormed:
      return { text: `${day} Formed a bond with ${other}.`, color: 'social' };

    case DiaryEventType.DivineIntervention:
      return { text: `${day} A divine hand lifted them${e.detail ? ' from ' + e.detail : ''}.`, color: 'life' };

    case DiaryEventType.WitnessedDivine:
      return { text: `${day} Witnessed a divine intervention${e.otherName ? ' upon ' + e.otherName : ''}.`, color: 'social' };

    case DiaryEventType.Raided:
      return { text: `${day} Raided ${e.factionName || 'an enemy settlement'}${e.detail ? ' — looted ' + e.detail : ''}.`, color: 'combat' };

    case DiaryEventType.WasRaided:
      return { text: `${day} Settlement was raided by ${e.factionName || 'enemies'}${e.detail ? ' — lost ' + e.detail : ''}.`, color: 'combat' };

    case DiaryEventType.RevoltJoined:
      return { text: `${day} Joined a revolution against ${e.factionName || 'the rulers'}.`, color: 'combat' };

    case DiaryEventType.RevoltWon:
      return { text: `${day} The revolution succeeded! ${e.detail || 'Government changed'}.`, color: 'social' };

    default:
      return { text: `${day} Something happened.`, color: 'life' };
  }
}

/** Render diary entries in chronological order (newest first).
 *  Handles ring buffer ordering via nextSlot. */
export function renderDiary(diary: DiaryData): RenderedDiaryEntry[] {
  const result: RenderedDiaryEntry[] = [];
  const len = diary.entries.length;
  if (len === 0) return result;

  // Reconstruct chronological order from ring buffer
  // If buffer not full: entries 0..len-1 are in order
  // If buffer full: entries from nextSlot..end, then 0..nextSlot-1
  const ordered: DiaryEntry[] = [];
  if (len < 100) {
    // Not full yet — entries are in insertion order
    for (let i = 0; i < len; i++) ordered.push(diary.entries[i]);
  } else {
    // Full ring buffer — read from nextSlot (oldest) forward
    for (let i = 0; i < len; i++) {
      ordered.push(diary.entries[(diary.nextSlot + i) % len]);
    }
  }

  // Reverse for newest-first
  for (let i = ordered.length - 1; i >= 0; i--) {
    const entry = ordered[i];
    const { text, color } = entryToSentence(entry);
    result.push({ text, color, tick: entry.tick });
  }

  return result;
}
