/**
 * Micropub MCP Server - Cloudflare Worker Entry Point
 *
 * A remote MCP server that enables AI clients to publish content
 * to any IndieWeb site via the Micropub protocol.
 *
 * Architecture:
 * - Acts as OAuth provider to MCP clients
 * - Acts as OAuth client to IndieAuth servers
 * - Uses workers-oauth-provider for OAuth 2.1 compliance
 */

import {
  OAuthProvider,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerMicropubPostTool,
  registerMicropubQueryTool,
  registerMicropubMediaTool,
  registerMicropubManageTool,
} from "./tools/index.js";
import { handleAuthorize, handleCallback } from "./auth-handler.js";
import { serverInfo } from "./mcp-handler.js";
import type { Env, AuthProps } from "./types.js";

// Re-export the agent for Durable Objects
export { MicropubMcpAgent } from "./agent.js";

/**
 * MCP Agent with auth context
 */
class AuthenticatedMcpAgent extends McpAgent<Env, object, AuthProps> {
  server = new McpServer({
    name: "Micropub MCP Server",
    version: "1.0.0",
  });

  initialState = {};

  async init(): Promise<void> {
    // Getter for auth props - this.props is set by the OAuth provider
    const getAuthProps = (): AuthProps | null => this.props || null;

    // Register consolidated tools
    registerMicropubPostTool(this.server, getAuthProps);
    registerMicropubQueryTool(this.server, getAuthProps);
    registerMicropubMediaTool(this.server, getAuthProps);
    registerMicropubManageTool(this.server, getAuthProps);
  }
}

/**
 * Default handler for non-API requests
 * Handles authorization flow and discovery
 */
const defaultHandler = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle auth flow requests
    if (url.pathname === "/authorize") {
      return handleAuthorize(request, env);
    }

    if (url.pathname === "/indieauth-callback") {
      return handleCallback(request, env);
    }

    // Discovery endpoint
    if (url.pathname === "/" || url.pathname === "") {
      return handleDiscovery(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

/**
 * Handle the discovery endpoint
 */
function handleDiscovery(request: Request): Response {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const info = {
    ...serverInfo,
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      sse: `${baseUrl}/sse`,
      authorize: `${baseUrl}/authorize`,
    },
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * OAuth Provider configuration
 *
 * Wraps the worker to add OAuth 2.1 authorization.
 * MCP clients connect to /mcp and receive 401 if not authenticated,
 * which triggers the OAuth flow.
 */
const oauthOptions: OAuthProviderOptions = {
  // MCP API routes
  apiRoute: ["/mcp", "/sse"],

  // API handler - the MCP agent
  // Type assertion needed due to workers-types vs native Request mismatch
  apiHandler: AuthenticatedMcpAgent.mount("/mcp") as unknown as OAuthProviderOptions["apiHandler"],

  // Default handler for auth flow and discovery
  // Type assertion needed due to workers-types vs native Request mismatch
  defaultHandler: defaultHandler as unknown as OAuthProviderOptions["defaultHandler"],

  // OAuth endpoints
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",

  // Supported scopes
  scopesSupported: ["create", "update", "delete", "media"],

  // Token TTL - 1 hour default
  accessTokenTTL: 3600,
};

export default new OAuthProvider(oauthOptions);
