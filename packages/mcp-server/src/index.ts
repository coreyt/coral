#!/usr/bin/env node
/**
 * Coral MCP Server
 *
 * Provides tools for diagram generation, validation, and conversion
 * via the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { generateTool, handleGenerate } from "./tools/generate.js";
import { validateTool, handleValidate } from "./tools/validate.js";
import { convertTool, handleConvert } from "./tools/convert.js";
import { explainTool, handleExplain } from "./tools/explain.js";
import { layoutTool, handleLayout } from "./tools/layout.js";
import { renderTool, handleRender } from "./tools/render.js";
import { fromCodebaseTool, handleFromCodebase } from "./tools/fromCodebase.js";

const server = new Server(
  {
    name: "coral-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      generateTool,
      validateTool,
      convertTool,
      layoutTool,
      renderTool,
      explainTool,
      fromCodebaseTool,
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "coral_generate":
        return await handleGenerate(args);

      case "coral_validate":
        return await handleValidate(args);

      case "coral_convert":
        return await handleConvert(args);

      case "coral_explain":
        return await handleExplain(args);

      case "coral_layout":
        return await handleLayout(args);

      case "coral_render":
        return await handleRender(args);

      case "coral_from_codebase":
        return await handleFromCodebase(args);

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Coral MCP Server running on stdio");
}

main().catch(console.error);
