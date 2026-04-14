import type { RepositoryGroup } from '@renderer/types/data';

interface ResolveEffectiveSelectedRepositoryIdInput {
  repositoryGroups: readonly RepositoryGroup[];
  selectedRepositoryId: string | null;
  effectiveSelectedWorktreeId: string | null;
}

export function resolveEffectiveSelectedRepositoryId({
  repositoryGroups,
  selectedRepositoryId,
  effectiveSelectedWorktreeId,
}: ResolveEffectiveSelectedRepositoryIdInput): string | null {
  if (selectedRepositoryId) {
    return selectedRepositoryId;
  }

  if (!effectiveSelectedWorktreeId) {
    return null;
  }

  return (
    repositoryGroups.find((repo) =>
      repo.worktrees.some((worktree) => worktree.id === effectiveSelectedWorktreeId)
    )?.id ?? null
  );
}
