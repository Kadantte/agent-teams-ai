export interface ToolSummaryData {
  total: number;
  byName: Record<string, number>;
}

export function buildToolSummary(content: Record<string, unknown>[]): string | undefined {
  const counts = new Map<string, number>();
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      block.type === 'tool_use' &&
      typeof block.name === 'string'
    ) {
      counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
    }
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return undefined;
  const parts = Array.from(counts.entries())
    .map(([name, count]) => (count === 1 ? name : `${count} ${name}`))
    .join(', ');
  return `${total} ${total === 1 ? 'tool' : 'tools'} (${parts})`;
}

export function parseToolSummary(summary: string | undefined): ToolSummaryData | null {
  if (!summary) return null;
  const match = summary.match(/^(\d+)\s+tools?\s+\(([^)]+)\)$/);
  if (!match) return null;
  const byName: Record<string, number> = {};
  for (const part of match[2].split(', ')) {
    const m = part.match(/^(\d+)\s+(.+)$/);
    if (m) {
      byName[m[2]] = parseInt(m[1], 10);
    } else {
      byName[part] = 1;
    }
  }
  return { total: parseInt(match[1], 10), byName };
}

export function formatToolSummary(data: ToolSummaryData): string {
  const parts = Object.entries(data.byName)
    .map(([name, count]) => (count === 1 ? name : `${count} ${name}`))
    .join(', ');
  return `${data.total} ${data.total === 1 ? 'tool' : 'tools'} (${parts})`;
}
