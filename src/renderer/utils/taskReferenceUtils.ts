import { getSuggestionInsertionText } from '@renderer/utils/mentionSuggestions';

import type { MentionSuggestion } from '@renderer/types/mention';

const TASK_REF_REGEX = /#([A-Za-z0-9-]+)\b/g;

function isAllowedTaskRefBoundary(char: string | undefined): boolean {
  if (!char) return true;
  return !/[A-Za-z0-9_]/.test(char);
}

function buildSuggestionsByRef(
  taskSuggestions: MentionSuggestion[]
): Map<string, MentionSuggestion[]> {
  const suggestionsByRef = new Map<string, MentionSuggestion[]>();

  for (const suggestion of taskSuggestions) {
    if (suggestion.type !== 'task') continue;
    const ref = getSuggestionInsertionText(suggestion).trim().toLowerCase();
    if (!ref) continue;

    const existing = suggestionsByRef.get(ref);
    if (existing) {
      existing.push(suggestion);
    } else {
      suggestionsByRef.set(ref, [suggestion]);
    }
  }

  return suggestionsByRef;
}

function resolveTaskSuggestion(candidates: MentionSuggestion[]): MentionSuggestion | null {
  if (candidates.length === 0) return null;

  const currentTeamCandidate = candidates.find((candidate) => candidate.isCurrentTeamTask);
  if (currentTeamCandidate) return currentTeamCandidate;

  if (candidates.length === 1) return candidates[0];

  return null;
}

export interface TaskReferenceMatch {
  start: number;
  end: number;
  raw: string;
  ref: string;
  suggestion: MentionSuggestion;
}

export function linkifyTaskIdsInMarkdown(text: string): string {
  return text.replace(TASK_REF_REGEX, (raw, ref: string, offset: number) => {
    const preceding = offset > 0 ? text[offset - 1] : undefined;
    return isAllowedTaskRefBoundary(preceding) ? `[${raw}](task://${ref})` : raw;
  });
}

export function findTaskReferenceMatches(
  text: string,
  taskSuggestions: MentionSuggestion[]
): TaskReferenceMatch[] {
  if (!text || taskSuggestions.length === 0) return [];

  const suggestionsByRef = buildSuggestionsByRef(taskSuggestions);

  if (suggestionsByRef.size === 0) return [];

  const matches: TaskReferenceMatch[] = [];
  for (const match of text.matchAll(TASK_REF_REGEX)) {
    const raw = match[0];
    const ref = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;

    const preceding = start > 0 ? text[start - 1] : undefined;
    if (!isAllowedTaskRefBoundary(preceding)) continue;

    const suggestion = resolveTaskSuggestion(suggestionsByRef.get(ref.toLowerCase()) ?? []);
    if (!suggestion) continue;

    matches.push({
      start,
      end: start + raw.length,
      raw,
      ref,
      suggestion,
    });
  }

  return matches;
}
