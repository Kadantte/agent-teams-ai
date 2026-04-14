import { describe, expect, it } from 'vitest';

import { resolveEffectiveSelectedRepositoryId } from '../../../../src/renderer/components/sidebar/dateGroupedSessionsSelection';

describe('resolveEffectiveSelectedRepositoryId', () => {
  it('falls back to the repository that owns the active worktree when repository selection is empty', () => {
    const repositoryGroups = [
      {
        id: 'repo-headless',
        worktrees: [
          {
            id: 'worktree-headless',
            path: '/Users/belief/dev/projects/headless',
          },
        ],
      },
      {
        id: 'repo-other',
        worktrees: [
          {
            id: 'worktree-other',
            path: '/Users/belief/dev/projects/other',
          },
        ],
      },
    ] as const;

    expect(
      resolveEffectiveSelectedRepositoryId({
        repositoryGroups,
        selectedRepositoryId: null,
        effectiveSelectedWorktreeId: 'worktree-headless',
      })
    ).toBe('repo-headless');
  });

  it('keeps the explicit repository selection when it already exists', () => {
    const repositoryGroups = [
      {
        id: 'repo-headless',
        worktrees: [{ id: 'worktree-headless', path: '/Users/belief/dev/projects/headless' }],
      },
    ] as const;

    expect(
      resolveEffectiveSelectedRepositoryId({
        repositoryGroups,
        selectedRepositoryId: 'repo-headless',
        effectiveSelectedWorktreeId: 'worktree-headless',
      })
    ).toBe('repo-headless');
  });
});
