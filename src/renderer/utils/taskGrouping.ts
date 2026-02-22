import { differenceInDays, isToday, isYesterday } from 'date-fns';

import { DATE_CATEGORY_ORDER } from '../types/tabs';

import type { DateCategory } from '../types/tabs';
import type { GlobalTask } from '@shared/types';

export type DateGroupedTasks = Record<DateCategory, GlobalTask[]>;

function getDateCategory(dateStr: string | undefined): DateCategory {
  if (!dateStr) return 'Older';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Older';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (differenceInDays(new Date(), d) <= 7) return 'Previous 7 Days';
  return 'Older';
}

export function groupTasksByDate(tasks: GlobalTask[]): DateGroupedTasks {
  const groups: DateGroupedTasks = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };

  for (const task of tasks) {
    const cat = getDateCategory(task.createdAt);
    groups[cat].push(task);
  }

  for (const cat of DATE_CATEGORY_ORDER) {
    groups[cat].sort((a, b) => {
      const cmp = a.teamName.localeCompare(b.teamName);
      if (cmp !== 0) return cmp;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  return groups;
}

export function getNonEmptyTaskCategories(groups: DateGroupedTasks): DateCategory[] {
  return DATE_CATEGORY_ORDER.filter((cat) => groups[cat].length > 0);
}
