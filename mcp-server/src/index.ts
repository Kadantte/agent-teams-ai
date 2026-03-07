#!/usr/bin/env node
import { FastMCP } from 'fastmcp';

import { registerTools } from './tools';

export function createServer() {
  const server = new FastMCP({
    name: 'agent-teams-mcp',
    version: '1.0.0',
  });

  registerTools(server);

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.start({
    transportType: 'stdio',
  });
}
