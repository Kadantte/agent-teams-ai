export const TeamEmptyState = (): React.JSX.Element => {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-medium text-[var(--color-text)]">Команды не найдены</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Создайте команду в Claude Code, затем обновите список.
        </p>
      </div>
    </div>
  );
};
