/**
 * MCP Handler for Micropub operations
 *
 * This handler provides the MCP tools to authenticated clients.
 * Auth context is passed via the OAuthProvider's props mechanism.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerMicropubPostTool,
  registerMicropubQueryTool,
  registerMicropubMediaTool,
  registerMicropubManageTool,
} from "./tools/index.js";
import type { AuthProps } from "./types.js";

/**
 * Create an MCP server with all Micropub tools registered
 *
 * @param getAuthProps - Function to retrieve auth props from the current request context
 */
export function createMcpServer(getAuthProps: () => AuthProps | null): McpServer {
  const server = new McpServer({
    name: "Micropub MCP Server",
    version: "1.0.0",
  });

  // Register consolidated tools
  registerMicropubPostTool(server, getAuthProps);
  registerMicropubQueryTool(server, getAuthProps);
  registerMicropubMediaTool(server, getAuthProps);
  registerMicropubManageTool(server, getAuthProps);

  return server;
}

/**
 * Server info for discovery endpoint
 */
export const serverInfo = {
  name: "Micropub MCP Server",
  version: "1.0.0",
  description:
    "A remote MCP server that enables AI clients to publish content to any IndieWeb site via the Micropub protocol.",
  protocols: {
    micropub: "https://micropub.spec.indieweb.org/",
    indieauth: "https://indieauth.spec.indieweb.org/",
    mcp: "https://modelcontextprotocol.io/",
  },
  tools: [
    {
      name: "micropub_post",
      description: "Create any type of Micropub post (note, article, bookmark, like, etc.)",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    {
      name: "micropub_query",
      description: "Query Micropub endpoint for config, post source, categories, etc.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    {
      name: "micropub_media",
      description: "Upload media files to the Micropub media endpoint",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    {
      name: "micropub_manage",
      description: "Update, delete, or restore existing posts",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
  ],
};
