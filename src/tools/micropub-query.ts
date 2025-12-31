/**
 * Consolidated micropub_query tool
 *
 * A single tool for querying Micropub endpoints.
 * Follows Anthropic's recommendation to consolidate functionality around user intent.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MicropubClient } from "../lib/micropub-client.js";
import type {
  AuthProps,
  MicropubQueryType,
  ResponseFormat,
  MicropubConfig,
  SyndicationTarget,
} from "../types.js";

/**
 * Schema for the micropub_query tool
 */
const micropubQuerySchema = {
  query_type: z
    .enum(["config", "source", "syndicate-to", "category", "contact"])
    .describe(
      "Type of query: 'config' (endpoint capabilities), 'source' (get post data), " +
        "'syndicate-to' (cross-posting targets), 'category' (available tags), " +
        "'contact' (address book entries)"
    ),
  url: z
    .string()
    .optional()
    .describe("URL of the post to query. Required for 'source' query type."),
  properties: z
    .array(z.string())
    .optional()
    .describe("Specific properties to fetch when querying source (omit for all)."),
  filter: z
    .string()
    .optional()
    .describe("Filter string for category queries (prefix match)."),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum items to return for list queries."),
  offset: z
    .number()
    .optional()
    .default(0)
    .describe("Offset for pagination."),
  response_format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe("Output format: 'concise' for summary, 'detailed' for full data."),
};

/**
 * Format config response
 */
function formatConfigResponse(config: MicropubConfig, format: ResponseFormat): string {
  if (format === "concise") {
    const features: string[] = [];
    if (config["media-endpoint"]) features.push("media uploads");
    if (config["syndicate-to"]?.length) features.push(`${config["syndicate-to"].length} syndication targets`);
    if (config["post-types"]?.length) features.push(`${config["post-types"].length} post types`);
    return `Micropub config: ${features.length ? features.join(", ") : "basic support"}`;
  }

  const lines = ["Micropub Configuration", ""];

  if (config["media-endpoint"]) {
    lines.push(`Media Endpoint: ${config["media-endpoint"]}`);
  } else {
    lines.push("Media Endpoint: Not available");
  }

  if (config["syndicate-to"]?.length) {
    lines.push("", "Syndication Targets:");
    for (const target of config["syndicate-to"]) {
      lines.push(`  - ${target.name || target.uid} (${target.uid})`);
    }
  }

  if (config["post-types"]?.length) {
    lines.push("", "Supported Post Types:");
    for (const pt of config["post-types"]) {
      lines.push(`  - ${pt.name}: ${pt.type}`);
    }
  }

  if (config.q?.length) {
    lines.push("", `Supported Queries: ${config.q.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format source response
 */
function formatSourceResponse(
  source: { type?: string[]; properties?: Record<string, unknown[]> },
  format: ResponseFormat
): string {
  if (format === "concise") {
    const props = source.properties || {};
    const title = props.name?.[0] || props.content?.[0]?.toString().slice(0, 50) || "Untitled";
    return `Post source: ${title}`;
  }

  return JSON.stringify(source, null, 2);
}

/**
 * Format syndication targets response
 */
function formatSyndicateToResponse(targets: SyndicationTarget[], format: ResponseFormat): string {
  if (!targets.length) {
    return "No syndication targets available";
  }

  if (format === "concise") {
    return `Syndication targets: ${targets.map((t) => t.name || t.uid).join(", ")}`;
  }

  const lines = ["Syndication Targets", ""];
  for (const target of targets) {
    lines.push(`- ${target.name || target.uid}`);
    lines.push(`  UID: ${target.uid}`);
    if (target.service) {
      lines.push(`  Service: ${target.service.name} (${target.service.url})`);
    }
  }
  return lines.join("\n");
}

/**
 * Format categories response
 */
function formatCategoriesResponse(categories: string[], format: ResponseFormat): string {
  if (!categories.length) {
    return "No categories found";
  }

  if (format === "concise") {
    const preview = categories.slice(0, 10);
    const more = categories.length > 10 ? ` (+${categories.length - 10} more)` : "";
    return `Categories: ${preview.join(", ")}${more}`;
  }

  return `Categories (${categories.length}):\n${categories.map((c) => `  - ${c}`).join("\n")}`;
}

/**
 * Register the consolidated micropub_query tool
 */
export function registerMicropubQueryTool(
  server: McpServer,
  getAuthProps: () => AuthProps | null
): void {
  server.tool(
    "micropub_query",
    "Query the Micropub endpoint for configuration, post source, syndication targets, or categories. " +
      "Use this to discover endpoint capabilities or retrieve post data for editing.",
    micropubQuerySchema,
    async (params) => {
      const auth = getAuthProps();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Please complete the OAuth flow first.",
            },
          ],
          isError: true,
        };
      }

      // Validate required fields
      if (params.query_type === "source" && !params.url) {
        return {
          content: [{ type: "text", text: "Source query requires a URL parameter" }],
          isError: true,
        };
      }

      try {
        const client = new MicropubClient(auth.micropubEndpoint, auth.indieAuthToken);

        switch (params.query_type) {
          case "config": {
            const config = await client.getConfig();
            return {
              content: [
                {
                  type: "text",
                  text: formatConfigResponse(config, params.response_format),
                },
              ],
            };
          }

          case "source": {
            const queryParams: Record<string, string> = { url: params.url! };
            if (params.properties?.length) {
              queryParams["properties[]"] = params.properties.join(",");
            }
            const source = await client.query<{
              type?: string[];
              properties?: Record<string, unknown[]>;
            }>("source", queryParams);
            return {
              content: [
                {
                  type: "text",
                  text: formatSourceResponse(source, params.response_format),
                },
              ],
            };
          }

          case "syndicate-to": {
            const result = await client.query<{ "syndicate-to"?: SyndicationTarget[] }>(
              "syndicate-to"
            );
            return {
              content: [
                {
                  type: "text",
                  text: formatSyndicateToResponse(
                    result["syndicate-to"] || [],
                    params.response_format
                  ),
                },
              ],
            };
          }

          case "category": {
            const queryParams: Record<string, string> = {};
            if (params.filter) queryParams.filter = params.filter;
            const result = await client.query<{ categories?: string[] }>("category", queryParams);
            return {
              content: [
                {
                  type: "text",
                  text: formatCategoriesResponse(result.categories || [], params.response_format),
                },
              ],
            };
          }

          case "contact": {
            const queryParams: Record<string, string> = {
              limit: String(params.limit),
              offset: String(params.offset),
            };
            const result = await client.query("contact", queryParams);
            if (params.response_format === "concise") {
              const contacts = (result as { contacts?: unknown[] }).contacts || [];
              return {
                content: [{ type: "text", text: `Found ${contacts.length} contacts` }],
              };
            }
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown query type: ${params.query_type}` }],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Query failed: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
