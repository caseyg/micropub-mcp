/**
 * Authentication tools for IndieAuth
 *
 * Provides tools for:
 * - Discovering Micropub/IndieAuth endpoints
 * - Starting and completing OAuth flows
 * - Checking authentication status
 */

import { z } from "zod";
import type { MicropubMcpAgent } from "../agent.js";
import { discoverEndpoints } from "../lib/discovery.js";
import { buildAuthorizationUrl, exchangeCodeForToken } from "../lib/indieauth.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "../lib/pkce.js";
import type { MicropubConfig } from "../types.js";

/**
 * Register authentication tools on the MCP agent
 */
export function registerAuthTools(agent: MicropubMcpAgent): void {
  // Tool: Discover endpoints for a website
  agent.server.tool(
    "micropub_discover",
    "Discover Micropub and IndieAuth endpoints for a website. Run this first to see if a site supports Micropub.",
    {
      url: z.string().describe("Website URL (e.g., https://example.com)"),
    },
    async ({ url }) => {
      try {
        const endpoints = await discoverEndpoints(url);

        // Store discovered endpoints in session state
        agent.setState({
          ...agent.state,
          me: endpoints.me,
          micropubEndpoint: endpoints.micropubEndpoint,
          authorizationEndpoint: endpoints.authorizationEndpoint,
          tokenEndpoint: endpoints.tokenEndpoint,
        });

        const lines = [
          `Discovered endpoints for ${endpoints.me}:`,
          "",
          `Micropub: ${endpoints.micropubEndpoint || "Not found"}`,
          `Authorization: ${endpoints.authorizationEndpoint || "Not found"}`,
          `Token: ${endpoints.tokenEndpoint || "Not found"}`,
        ];

        if (!endpoints.micropubEndpoint) {
          lines.push("", "This site does not appear to support Micropub.");
        } else if (!endpoints.authorizationEndpoint) {
          lines.push(
            "",
            "IndieAuth endpoints not found. Site may use different authentication."
          );
        } else {
          lines.push("", "Site supports Micropub. Run micropub_auth_start to authenticate.");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Discovery failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Start authentication flow
  agent.server.tool(
    "micropub_auth_start",
    "Start IndieAuth authentication. Returns a URL for the user to visit and authorize access.",
    {
      me: z
        .string()
        .optional()
        .describe("Website URL (uses previously discovered URL if not provided)"),
      scope: z
        .string()
        .default("create update delete media")
        .describe("Space-separated OAuth scopes to request"),
    },
    async ({ me, scope }) => {
      try {
        // Use provided URL or previously discovered
        const websiteUrl = me || agent.state.me;
        if (!websiteUrl) {
          return {
            content: [
              {
                type: "text",
                text: "No website URL provided. Run micropub_discover first or provide a 'me' URL.",
              },
            ],
            isError: true,
          };
        }

        // Discover endpoints if not already done or URL changed
        if (!agent.state.authorizationEndpoint || websiteUrl !== agent.state.me) {
          const endpoints = await discoverEndpoints(websiteUrl);
          agent.setState({ ...agent.state, ...endpoints });
        }

        if (!agent.state.authorizationEndpoint) {
          return {
            content: [
              {
                type: "text",
                text: "No authorization endpoint found. This site may not support IndieAuth.",
              },
            ],
            isError: true,
          };
        }

        // Generate PKCE values
        const state = generateState();
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Build OAuth URLs
        const clientId = agent.getClientId();
        const redirectUri = agent.getRedirectUri();

        const authUrl = buildAuthorizationUrl(agent.state.authorizationEndpoint, {
          clientId,
          redirectUri,
          me: agent.state.me!,
          scope,
          state,
          codeChallenge,
        });

        // Store auth flow state
        agent.setState({
          ...agent.state,
          authState: state,
          codeVerifier,
        });

        return {
          content: [
            {
              type: "text",
              text: [
                "Authorization Required",
                "",
                "Please visit this URL to authorize:",
                authUrl,
                "",
                "After authorizing, you'll be redirected to a page with a code.",
                "Run micropub_auth_complete with the code and state shown on that page.",
                "",
                `State for verification: ${state}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Auth start failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Complete authentication
  agent.server.tool(
    "micropub_auth_complete",
    "Complete authentication after user authorizes. Exchange the authorization code for an access token.",
    {
      code: z.string().describe("Authorization code from the callback"),
      state: z.string().describe("State parameter from the callback"),
    },
    async ({ code, state }) => {
      try {
        // Verify state matches to prevent CSRF
        if (state !== agent.state.authState) {
          return {
            content: [
              {
                type: "text",
                text: "State mismatch - possible CSRF attack. Please restart authentication with micropub_auth_start.",
              },
            ],
            isError: true,
          };
        }

        if (!agent.state.tokenEndpoint || !agent.state.codeVerifier) {
          return {
            content: [
              {
                type: "text",
                text: "Missing auth flow state. Please restart with micropub_auth_start.",
              },
            ],
            isError: true,
          };
        }

        const clientId = agent.getClientId();
        const redirectUri = agent.getRedirectUri();

        // Exchange code for token
        const token = await exchangeCodeForToken(agent.state.tokenEndpoint, {
          code,
          clientId,
          redirectUri,
          codeVerifier: agent.state.codeVerifier,
        });

        // Query for media endpoint
        let mediaEndpoint: string | undefined;
        if (agent.state.micropubEndpoint) {
          try {
            const configUrl = new URL(agent.state.micropubEndpoint);
            configUrl.searchParams.set("q", "config");
            const configResponse = await fetch(configUrl.toString(), {
              headers: {
                Authorization: `Bearer ${token.access_token}`,
                Accept: "application/json",
              },
            });
            if (configResponse.ok) {
              const config = (await configResponse.json()) as MicropubConfig;
              mediaEndpoint = config["media-endpoint"];
            }
          } catch {
            // Media endpoint is optional, continue without it
          }
        }

        // Store token and clear temporary auth flow state
        agent.setState({
          ...agent.state,
          accessToken: token.access_token,
          tokenType: token.token_type,
          scope: token.scope,
          me: token.me,
          refreshToken: token.refresh_token,
          tokenExpiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
          mediaEndpoint,
          // Clear temporary auth state
          authState: undefined,
          codeVerifier: undefined,
        });

        const lines = [
          "Authentication successful!",
          "",
          `Connected to: ${token.me}`,
          `Scopes: ${token.scope}`,
          `Micropub endpoint: ${agent.state.micropubEndpoint}`,
        ];

        if (mediaEndpoint) {
          lines.push(`Media endpoint: ${mediaEndpoint}`);
        } else {
          lines.push("Media endpoint: Not available");
        }

        lines.push("", "You can now use micropub_create_note, micropub_create_article, etc.");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Token exchange failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Check authentication status
  agent.server.tool(
    "micropub_auth_status",
    "Check current authentication status and connected site info.",
    {},
    async () => {
      if (!agent.isAuthenticated()) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Run micropub_discover followed by micropub_auth_start to connect.",
            },
          ],
        };
      }

      const lines = ["Authenticated", "", `Site: ${agent.state.me}`, `Scopes: ${agent.state.scope}`];

      if (agent.state.micropubEndpoint) {
        lines.push(`Micropub: ${agent.state.micropubEndpoint}`);
      }

      if (agent.state.mediaEndpoint) {
        lines.push(`Media: ${agent.state.mediaEndpoint}`);
      }

      if (agent.state.tokenExpiresAt) {
        const remaining = agent.state.tokenExpiresAt - Date.now();
        if (remaining > 0) {
          const minutes = Math.round(remaining / 60000);
          lines.push(`Token expires in: ${minutes} minutes`);
        } else {
          lines.push("Token expired. Run micropub_auth_start to re-authenticate.");
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // Tool: Logout / clear session
  agent.server.tool(
    "micropub_logout",
    "Clear authentication and disconnect from the current site.",
    {},
    async () => {
      if (!agent.isAuthenticated()) {
        return {
          content: [{ type: "text", text: "Not currently authenticated." }],
        };
      }

      const previousSite = agent.state.me;

      // Clear all session state
      agent.setState({});

      return {
        content: [
          {
            type: "text",
            text: `Logged out from ${previousSite}. Session cleared.`,
          },
        ],
      };
    }
  );
}
