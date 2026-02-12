/**
 * UpdateDialog - Modal dialog shown when a new version is available.
 *
 * Prompts the user to download the update or dismiss it.
 */

import { useStore } from '@renderer/store';
import { X } from 'lucide-react';

export const UpdateDialog = (): React.JSX.Element | null => {
  const showUpdateDialog = useStore((s) => s.showUpdateDialog);
  const availableVersion = useStore((s) => s.availableVersion);
  const releaseNotes = useStore((s) => s.releaseNotes);
  const downloadUpdate = useStore((s) => s.downloadUpdate);
  const dismissUpdateDialog = useStore((s) => s.dismissUpdateDialog);

  if (!showUpdateDialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={dismissUpdateDialog}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        className="relative mx-4 w-full max-w-sm rounded-md border p-4 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        style={{
          backgroundColor: 'var(--color-surface-overlay)',
          borderColor: 'var(--color-border-emphasis)',
        }}
      >
        {/* Close button */}
        <button
          onClick={dismissUpdateDialog}
          className="absolute right-3 top-3 rounded p-1 transition-colors hover:bg-white/10"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="size-4" />
        </button>

        <div className="mb-3 pr-8">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            Update Available
          </h2>
          {availableVersion && (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              v{availableVersion}
            </div>
          )}
        </div>

        {/* Release notes */}
        {releaseNotes && (
          <div
            className="mb-4 max-h-32 overflow-y-auto rounded border p-2 text-xs"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {releaseNotes}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={dismissUpdateDialog}
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/5"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Later
          </button>
          <button
            onClick={downloadUpdate}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
