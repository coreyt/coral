#!/usr/bin/env node
/** Coral MCP stdio entry point. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCoralMcpServer } from './server.js';

async function main() {
  const server = createCoralMcpServer();
  await server.connect(new StdioServerTransport());
  console.error('Coral MCP Server running on stdio');
}

main().catch(console.error);
