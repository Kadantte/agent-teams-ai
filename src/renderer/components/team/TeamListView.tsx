import { useEffect } from 'react';

import { isElectronMode } from '@renderer/api';
import { useStore } from '@renderer/store';
import { useShallow } from 'zustand/react/shallow';

import { TeamEmptyState } from './TeamEmptyState';

export const TeamListView = (): React.JSX.Element => {
  const electronMode = isElectronMode();
  const { teams, teamsLoading, teamsError, fetchTeams } = useStore(
    useShallow((s) => ({
      teams: s.teams,
      teamsLoading: s.teamsLoading,
      teamsError: s.teamsError,
      fetchTeams: s.fetchTeams,
    }))
  );

  useEffect(() => {
    if (!electronMode) {
      return;
    }
    void fetchTeams();
  }, [electronMode, fetchTeams]);

  if (!electronMode) {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Teams доступен только в Electron-режиме
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            В browser mode доступ к локальным папкам `~/.claude/teams` недоступен.
          </p>
        </div>
      </div>
    );
  }

  if (teamsLoading) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Загружаем команды...
      </div>
    );
  }

  if (teamsError) {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-red-400">Не удалось загрузить команды</p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{teamsError}</p>
          <button
            className="mt-4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
            onClick={() => {
              void fetchTeams();
            }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return <TeamEmptyState />;
  }

  return (
    <div className="size-full overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Teams</h2>
        <button
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
          onClick={() => {
            void fetchTeams();
          }}
        >
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <article
            key={team.name}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <h3 className="truncate text-sm font-semibold text-[var(--color-text)]">{team.name}</h3>
            <p className="mt-2 line-clamp-2 min-h-10 text-xs text-[var(--color-text-muted)]">
              {team.description || 'Без описания'}
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span>Участников: {team.memberCount}</span>
              <span>Задач: {team.taskCount}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
