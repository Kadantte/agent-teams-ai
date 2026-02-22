/**
 * WindowsTitleBar - Conventional title bar for Windows when the native frame is hidden.
 *
 * Renders a draggable top strip with window controls (minimize, maximize/restore, close)
 * on the right, matching Windows conventions. Only shown in Electron on Windows (win32).
 */

import { useEffect, useState } from 'react';

import { isElectronMode } from '@renderer/api';
import { AppLogo } from '@renderer/components/common/AppLogo';
import { Minus, Square, X } from 'lucide-react';

const TITLE_BAR_HEIGHT = 32;

function isWindowsDesktop(): boolean {
  if (!isElectronMode()) return false;
  return window.navigator.userAgent.includes('Windows');
}

export const WindowsTitleBar = (): React.JSX.Element | null => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isWin = isWindowsDesktop();
  const api = typeof window !== 'undefined' ? window.electronAPI?.windowControls : null;

  useEffect(() => {
    if (api) void api.isMaximized().then(setIsMaximized);
  }, [api]);

  if (!isWin || !api) return null;

  const { minimize, maximize, close, isMaximized: getIsMaximized } = api;

  const handleMaximize = async (): Promise<void> => {
    await maximize();
    const maximized = await getIsMaximized();
    setIsMaximized(maximized);
  };

  const buttonBase =
    'flex h-full w-12 items-center justify-center transition-colors border-0 outline-none';
  const buttonHover = 'hover:bg-white/10';

  const titleBarStyle = {
    height: `${TITLE_BAR_HEIGHT}px`,
    backgroundColor: 'var(--color-surface-sidebar)',
    borderBottom: '1px solid var(--color-border)',
    WebkitAppRegion: 'drag',
  } as React.CSSProperties;

  return (
    <div className="flex shrink-0 select-none items-stretch" style={titleBarStyle}>
      {/* Draggable area — app title optional */}
      <div className="flex flex-1 items-center gap-2 pl-3" style={{ minWidth: 0 }}>
        <AppLogo size={18} className="shrink-0" />
        <span
          className="truncate text-sm font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Claude Agent Teams UI
        </span>
      </div>

      {/* Window controls — no-drag so they receive clicks */}
      <div className="flex shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          className={`${buttonBase} ${buttonHover}`}
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => void minimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus className="size-4" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className={`${buttonBase} ${buttonHover}`}
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => void handleMaximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square className="size-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className={`${buttonBase} hover:bg-red-500/90 hover:text-white`}
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => void close()}
          title="Close"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};
