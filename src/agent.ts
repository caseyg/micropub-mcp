/**
 * MCP Agent class for Micropub operations
 *
 * This Durable Object maintains per-session state for MCP clients.
 * Authentication is handled by the OAuth provider, which passes
 * auth props to each request.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerMicropubPostTool,
  registerMicropubQueryTool,
  registerMicropubMediaTool,
  registerMicropubManageTool,
} from "./tools/index.js";
import type { Env, AuthProps } from "./types.js";

/**
 * Session state stored in the Durable Object
 * Now minimal since auth is handled by OAuth provider
 */
export interface SessionState {
  /** Optional client-specific preferences */
  preferences?: {
    defaultResponseFormat?: "concise" | "detailed";
  };
}

/**
 * MCP Agent for Micropub operations
 *
 * Each instance is a Durable Object that:
 * - Receives auth props from OAuth provider on each request
 * - Provides Micropub tools to MCP clients
 * - Maintains optional session preferences
 */
export class MicropubMcpAgent extends McpAgent<Env, SessionState, AuthProps> {
  server = new McpServer({
    name: "Micropub MCP Server",
    version: "1.0.0",
  });

  initialState: SessionState = {};

  /**
   * Initialize the agent and register all tools
   */
  async init(): Promise<void> {
    // Getter for auth props - this.props is passed by OAuth provider
    const getAuthProps = (): AuthProps | null => this.props || null;

    // Register consolidated tools following Anthropic's guidance
    registerMicropubPostTool(this.server, getAuthProps);
    registerMicropubQueryTool(this.server, getAuthProps);
    registerMicropubMediaTool(this.server, getAuthProps);
    registerMicropubManageTool(this.server, getAuthProps);
  }

  /**
   * Check if the session has valid auth props
   */
  isAuthenticated(): boolean {
    return !!(this.props?.indieAuthToken && this.props?.micropubEndpoint);
  }

  /**
   * Get the authenticated user's website URL
   */
  getMe(): string | undefined {
    return this.props?.me;
  }
}
