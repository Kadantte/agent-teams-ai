import { diffLines } from 'diff';

/**
 * Unified line counting utility using semantic diff.
 * Ensures consistent +/- line counts across all services
 * (MemberStatsComputer, ChangeExtractorService, FileContentResolver).
 *
 * Uses `diffLines()` from npm `diff` package — the same algorithm
 * already used correctly in ChangeExtractorService.countLines()
 * and FileContentResolver.getFileContent().
 */
export function countLineChanges(
  oldStr: string,
  newStr: string
): { added: number; removed: number } {
  if (!oldStr && !newStr) return { added: 0, removed: 0 };
  if (!oldStr) return { added: countDiffLines(newStr), removed: 0 };
  if (!newStr) return { added: 0, removed: countDiffLines(oldStr) };
  const changes = diffLines(oldStr, newStr);
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    if (c.added) added += c.count ?? 0;
    if (c.removed) removed += c.count ?? 0;
  }
  return { added, removed };
}

function countDiffLines(value: string): number {
  if (!value) return 0;
  let lines = 1;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      lines += 1;
    }
  }
  return value.endsWith('\n') ? lines - 1 : lines;
}
