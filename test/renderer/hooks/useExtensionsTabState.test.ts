import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExtensionsTabState } from '../../../src/renderer/hooks/useExtensionsTabState';

type ExtensionsTabState = ReturnType<typeof useExtensionsTabState>;

let capturedState: ExtensionsTabState | null = null;

vi.mock('@renderer/api', () => ({
  api: {
    mcpRegistry: null,
  },
}));

function Harness(): null {
  capturedState = useExtensionsTabState();
  return null;
}

describe('useExtensionsTabState', () => {
  afterEach(() => {
    capturedState = null;
    document.body.innerHTML = '';
  });

  it('clears selected plugin when leaving the plugins sub-tab', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      capturedState?.setSelectedPluginId('context7@claude-plugins-official');
      await Promise.resolve();
    });
    expect(capturedState?.selectedPluginId).toBe('context7@claude-plugins-official');

    await act(async () => {
      capturedState?.setActiveSubTab('mcp-servers');
      await Promise.resolve();
    });
    expect(capturedState?.selectedPluginId).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('clears selected MCP server when leaving the MCP sub-tab', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      capturedState?.setActiveSubTab('mcp-servers');
      await Promise.resolve();
    });
    await act(async () => {
      capturedState?.setSelectedMcpServerId('server-1');
      await Promise.resolve();
    });
    expect(capturedState?.selectedMcpServerId).toBe('server-1');

    await act(async () => {
      capturedState?.setActiveSubTab('skills');
      await Promise.resolve();
    });
    expect(capturedState?.selectedMcpServerId).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('clears selected skill when leaving the skills sub-tab', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      capturedState?.setActiveSubTab('skills');
      await Promise.resolve();
    });
    await act(async () => {
      capturedState?.setSelectedSkillId('skill-1');
      await Promise.resolve();
    });
    expect(capturedState?.selectedSkillId).toBe('skill-1');

    await act(async () => {
      capturedState?.setActiveSubTab('api-keys');
      await Promise.resolve();
    });
    expect(capturedState?.selectedSkillId).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
