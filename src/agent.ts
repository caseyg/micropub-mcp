/**
 * MCP Agent class for Micropub operations
 *
 * This Durable Object maintains per-session authentication state
 * and provides Micropub tools to MCP clients
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerPostTools } from "./tools/posts.js";
import { registerQueryTools } from "./tools/query.js";
import { registerMediaTools } from "./tools/media.js";
import type { Env, SessionState } from "./types.js";

/**
 * MCP Agent for Micropub operations
 *
 * Each instance is a Durable Object that maintains:
 * - OAuth tokens and session state
 * - Discovered Micropub endpoints
 * - Per-session authentication context
 */
export class MicropubMcpAgent extends McpAgent<Env, SessionState, Record<string, never>> {
  server = new McpServer({
    name: "Micropub MCP Server",
    version: "1.0.0",
  });

  initialState: SessionState = {};

  /**
   * Initialize the agent and register all tools
   */
  async init(): Promise<void> {
    registerAuthTools(this);
    registerPostTools(this);
    registerQueryTools(this);
    registerMediaTools(this);
  }

  /**
   * Check if the session is authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.state.accessToken && this.state.micropubEndpoint);
  }

  /**
   * Get the authorization header for API requests
   *
   * @throws Error if not authenticated
   */
  getAuthHeaders(): HeadersInit {
    if (!this.state.accessToken) {
      throw new Error("Not authenticated");
    }
    return {
      Authorization: `Bearer ${this.state.accessToken}`,
    };
  }

  /**
   * Get the OAuth client ID for this server
   *
   * Uses environment variable if set, otherwise constructs from request URL
   */
  getClientId(requestUrl?: string): string {
    if (this.env.CLIENT_ID) {
      return this.env.CLIENT_ID;
    }
    if (requestUrl) {
      const url = new URL(requestUrl);
      return `${url.protocol}//${url.host}/`;
    }
    // Fallback - this should be configured in production
    return "https://micropub-mcp.workers.dev/";
  }

  /**
   * Get the OAuth redirect URI for this server
   *
   * Uses environment variable if set, otherwise constructs from request URL
   */
  getRedirectUri(requestUrl?: string): string {
    if (this.env.REDIRECT_URI) {
      return this.env.REDIRECT_URI;
    }
    if (requestUrl) {
      const url = new URL(requestUrl);
      return `${url.protocol}//${url.host}/callback`;
    }
    // Fallback - this should be configured in production
    return "https://micropub-mcp.workers.dev/callback";
  }
}
