/** Pure registration factory, shared by the stdio entry and protocol tests. */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { generateTool, handleGenerate } from './tools/generate.js';
import { validateTool, handleValidate } from './tools/validate.js';
import { conformanceTool, handleConformanceCheck } from './tools/conformance.js';
import { convertTool, handleConvert } from './tools/convert.js';
import { explainTool, handleExplain } from './tools/explain.js';
import { layoutTool, handleLayout } from './tools/layout.js';
import { renderTool, handleRender } from './tools/render.js';

export function createCoralMcpServer(): Server {
  const server = new Server({ name: 'coral-mcp-server', version: '0.2.12' },
    { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [generateTool, validateTool, conformanceTool, convertTool, layoutTool, renderTool, explainTool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'coral_generate': return await handleGenerate(args);
        case 'coral_validate': return await handleValidate(args);
        case 'coral_check_conformance': return await handleConformanceCheck(args);
        case 'coral_convert': return await handleConvert(args);
        case 'coral_explain': return await handleExplain(args);
        case 'coral_layout': return await handleLayout(args);
        case 'coral_render': return await handleRender(args);
        default: return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}
