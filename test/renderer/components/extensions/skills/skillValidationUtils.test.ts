import { describe, expect, it } from 'vitest';

import { validateSkillFolderName } from '../../../../../src/renderer/components/extensions/skills/skillValidationUtils';

describe('skillValidationUtils', () => {
  it('accepts normal folder names', () => {
    expect(validateSkillFolderName('review-helper')).toBeNull();
  });

  it('rejects empty folder names', () => {
    expect(validateSkillFolderName('   ')).toBe('Choose a folder name for this skill.');
  });

  it('rejects invalid filesystem characters', () => {
    expect(validateSkillFolderName('bad/name')).toBe(
      'Pick a simpler folder name using letters, numbers, dots, dashes, or underscores.'
    );
  });

  it('rejects dot segments', () => {
    expect(validateSkillFolderName('..')).toBe(
      'Pick a simpler folder name using letters, numbers, dots, dashes, or underscores.'
    );
  });
});
