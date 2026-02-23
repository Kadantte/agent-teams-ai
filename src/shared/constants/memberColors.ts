/**
 * Default color palette for team members.
 * Used during team creation and for preview in the UI.
 * Colors cycle by index: member[i] gets MEMBER_COLOR_PALETTE[i % length].
 */
export const MEMBER_COLOR_PALETTE = ['blue', 'green', 'yellow', 'cyan', 'magenta', 'red'] as const;

export function getMemberColor(index: number): string {
  return MEMBER_COLOR_PALETTE[index % MEMBER_COLOR_PALETTE.length];
}

/** Derive a stable fallback color from a member name (position-independent). */
export function getMemberColorByName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return MEMBER_COLOR_PALETTE[Math.abs(hash) % MEMBER_COLOR_PALETTE.length];
}
