/**
 * Inline Code Chip types and pure functions.
 *
 * A chip is a visual badge representing a code selection from the editor,
 * displayed inline in textareas alongside @mentions.
 */

import { getCodeFenceLanguage } from '@renderer/utils/buildSelectionAction';

// =============================================================================
// Types
// =============================================================================

export interface InlineChip {
  id: string;
  /** Absolute file path */
  filePath: string;
  /** Basename (e.g. "auth.ts") */
  fileName: string;
  /** 1-based start line */
  fromLine: number;
  /** 1-based end line */
  toLine: number;
  /** Selected source code text */
  codeText: string;
  /** Language identifier (e.g. "typescript", "python") */
  language: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Unicode marker character used as chip prefix in textarea text */
export const CHIP_MARKER = '\u{1F4C4}'; // 📄

// =============================================================================
// Pure functions
// =============================================================================

/**
 * Display label for a chip: "auth.ts:10-15" or "auth.ts:42" for single-line.
 */
export function chipDisplayLabel(chip: InlineChip): string {
  if (chip.fromLine === chip.toLine) {
    return `${chip.fileName}:${chip.fromLine}`;
  }
  return `${chip.fileName}:${chip.fromLine}-${chip.toLine}`;
}

/**
 * Token string inserted into textarea text.
 * Must match EXACTLY in textarea and overlay for pixel-perfect alignment.
 */
export function chipToken(chip: InlineChip): string {
  return `${CHIP_MARKER}${chipDisplayLabel(chip)}`;
}

/**
 * Converts a chip to a markdown code fence block.
 */
export function chipToMarkdown(chip: InlineChip): string {
  const label = chipDisplayLabel(chip);
  const lang = chip.language || getCodeFenceLanguage(chip.fileName);
  return `**${chip.fileName}** (${chip.fromLine === chip.toLine ? `line ${chip.fromLine}` : `lines ${chip.fromLine}-${chip.toLine}`}):\n\`\`\`${lang}\n${chip.codeText}\n\`\`\``;
}

/**
 * Serializes text with chip tokens back to markdown code fences for sending.
 * Replaces each chip token in the text with its markdown representation.
 */
export function serializeChipsWithText(text: string, chips: InlineChip[]): string {
  if (chips.length === 0) return text;

  let result = text;
  for (const chip of chips) {
    const token = chipToken(chip);
    result = result.split(token).join(chipToMarkdown(chip));
  }
  return result;
}
