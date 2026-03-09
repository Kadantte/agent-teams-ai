/**
 * Shared utility for converting @memberName mentions in plain text
 * to markdown links with mention:// protocol.
 *
 * Used by UserChatGroup, TeammateMessageItem, ActivityItem, TaskCommentsSection.
 * MarkdownViewer already handles rendering mention:// links as colored badges.
 */

/**
 * Convert `@memberName` in plain text to markdown links with mention:// protocol.
 * Encodes color in the URL so MarkdownViewer can render colored badges without extra context.
 * Greedy match: longer names are tried first to avoid partial matches.
 *
 * @param text - The plain text to process
 * @param memberColorMap - Map of member name → color key (e.g. "blue", "red")
 * @returns Text with @mentions replaced by markdown links
 */
export function linkifyMentionsInMarkdown(
  text: string,
  memberColorMap: Map<string, string>
): string {
  if (memberColorMap.size === 0) return text;

  // Sort by name length descending for greedy matching
  const names = [...memberColorMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // eslint-disable-next-line no-useless-escape -- escaped chars needed for regex character class
  const pattern = new RegExp(`(^|\\s)@(${escaped.join('|')})(?=[\\s,.:;!?)\\]}\-]|$)`, 'gi');

  return text.replace(pattern, (_match, prefix: string, name: string) => {
    // Find the canonical name (case-insensitive lookup)
    const canonical = names.find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
    const color = memberColorMap.get(canonical) ?? '';
    return `${prefix}[@${canonical}](mention://${encodeURIComponent(color)}/${encodeURIComponent(canonical)})`;
  });
}
