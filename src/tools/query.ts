/**
 * Query tools for Micropub endpoints
 *
 * Provides tools for:
 * - Querying endpoint configuration
 * - Getting post source data
 * - Listing posts
 * - Getting categories/tags
 */

import { z } from "zod";
import type { MicropubMcpAgent } from "../agent.js";
import { MicropubClient } from "../lib/micropub-client.js";
import type { MicropubConfig, SyndicationTarget, PostType } from "../types.js";

/**
 * Register query tools on the MCP agent
 */
export function registerQueryTools(agent: MicropubMcpAgent): void {
  /**
   * Get an authenticated Micropub client
   * @throws Error if not authenticated
   */
  function getClient(): MicropubClient {
    if (!agent.isAuthenticated()) {
      throw new Error("Not authenticated. Run micropub_auth_start first.");
    }
    return new MicropubClient(agent.state.micropubEndpoint!, agent.state.accessToken!);
  }

  // Tool: Query configuration
  agent.server.tool(
    "micropub_query_config",
    "Get Micropub endpoint configuration (media endpoint, syndication targets, supported features).",
    {},
    async () => {
      try {
        const client = getClient();
        const config = await client.getConfig();

        const lines = ["Micropub Configuration:", ""];

        if (config["media-endpoint"]) {
          lines.push(`Media Endpoint: ${config["media-endpoint"]}`);
        } else {
          lines.push("Media Endpoint: Not available");
        }

        if (config["syndicate-to"]?.length) {
          lines.push("", "Syndication Targets:");
          for (const target of config["syndicate-to"] as SyndicationTarget[]) {
            const name = target.name || target.uid;
            lines.push(`  - ${name} (${target.uid})`);
          }
        }

        if (config["post-types"]?.length) {
          lines.push("", "Supported Post Types:");
          for (const postType of config["post-types"] as PostType[]) {
            lines.push(`  - ${postType.name}: ${postType.type}`);
          }
        }

        if (config.q?.length) {
          lines.push("", "Supported Queries:");
          lines.push(`  ${config.q.join(", ")}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Query failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Get source of a post
  agent.server.tool(
    "micropub_get_source",
    "Get the source/properties of an existing post for viewing or editing.",
    {
      url: z.string().describe("URL of the post to get"),
      properties: z
        .array(z.string())
        .optional()
        .describe("Specific properties to fetch (omit for all)"),
    },
    async ({ url, properties }) => {
      try {
        const client = getClient();
        const source = await client.getSource(url, properties);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(source, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Query failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: List recent posts
  agent.server.tool(
    "micropub_list_posts",
    "List recent posts from your site (if supported by the endpoint).",
    {
      limit: z.number().default(10).describe("Maximum posts to return"),
      offset: z.number().default(0).describe("Offset for pagination"),
    },
    async ({ limit, offset }) => {
      try {
        const client = getClient();

        interface SourceListResponse {
          items?: Array<{
            url?: string;
            properties?: Record<string, unknown[]>;
          }>;
        }

        const result = await client.query<SourceListResponse>("source", {
          limit: String(limit),
          offset: String(offset),
        });

        if (!result.items?.length) {
          return {
            content: [
              {
                type: "text",
                text: "No posts found or endpoint doesn't support listing.",
              },
            ],
          };
        }

        const lines = ["Recent Posts:", ""];
        for (const item of result.items) {
          const props = item.properties || {};
          const name = props.name?.[0];
          const content = props.content?.[0];
          const title =
            typeof name === "string"
              ? name
              : typeof content === "string"
                ? content.slice(0, 50) + (content.length > 50 ? "..." : "")
                : "Untitled";
          const url = item.url || (props.url?.[0] as string | undefined);
          lines.push(`- ${title}`);
          if (url) lines.push(`  ${url}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `List posts failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Get categories/tags
  agent.server.tool(
    "micropub_get_categories",
    "Get list of categories/tags used on the site.",
    {
      filter: z.string().optional().describe("Filter categories by prefix"),
    },
    async ({ filter }) => {
      try {
        const client = getClient();
        const params = filter ? { filter } : undefined;

        interface CategoryResponse {
          categories?: string[];
        }

        const result = await client.query<CategoryResponse>("category", params);
        const categories = result.categories || [];

        if (!categories.length) {
          return {
            content: [
              {
                type: "text",
                text: "No categories found or endpoint doesn't support this query.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Categories:\n${categories.map((c: string) => `  - ${c}`).join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Query failed: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Get syndication targets
  agent.server.tool(
    "micropub_get_syndication_targets",
    "Get available syndication targets for cross-posting.",
    {},
    async () => {
      try {
        const client = getClient();

        interface SyndicateToResponse {
          "syndicate-to"?: SyndicationTarget[];
        }

        const result = await client.query<SyndicateToResponse>("syndicate-to");
        const targets = result["syndicate-to"] || [];

        if (!targets.length) {
          return {
            content: [
              {
                type: "text",
                text: "No syndication targets available.",
              },
            ],
          };
        }

        const lines = ["Syndication Targets:", ""];
        for (const target of targets) {
          lines.push(`- ${target.name || target.uid}`);
          lines.push(`  UID: ${target.uid}`);
          if (target.service) {
            lines.push(`  Service: ${target.service.name}`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Query failed: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
