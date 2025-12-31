/**
 * micropub_manage tool for post management operations
 *
 * Handles update, delete, and undelete operations on existing posts.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MicropubClient } from "../lib/micropub-client.js";
import type { AuthProps, ResponseFormat } from "../types.js";

/**
 * Schema for the micropub_manage tool
 */
const micropubManageSchema = {
  action: z
    .enum(["update", "delete", "undelete"])
    .describe("Action to perform: 'update' (modify post), 'delete' (remove post), 'undelete' (restore deleted post)"),
  url: z.string().describe("URL of the post to manage"),
  replace: z
    .record(z.unknown())
    .optional()
    .describe("Properties to completely replace (for update action)"),
  add: z
    .record(z.unknown())
    .optional()
    .describe("Values to add to existing properties (for update action)"),
  remove: z
    .union([z.array(z.string()), z.record(z.unknown())])
    .optional()
    .describe("Properties to remove entirely (array) or specific values to remove (object) - for update action"),
  response_format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe("Output format: 'concise' for brief confirmation, 'detailed' for full response"),
};

/**
 * Register the micropub_manage tool
 */
export function registerMicropubManageTool(
  server: McpServer,
  getAuthProps: () => AuthProps | null
): void {
  server.tool(
    "micropub_manage",
    "Manage an existing Micropub post: update its properties, delete it, or restore a deleted post. " +
      "For updates, specify replace/add/remove operations. Not all servers support all operations.",
    micropubManageSchema,
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

      try {
        const client = new MicropubClient(auth.micropubEndpoint, auth.indieAuthToken);

        switch (params.action) {
          case "update": {
            if (!params.replace && !params.add && !params.remove) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Update action requires at least one of: replace, add, or remove",
                  },
                ],
                isError: true,
              };
            }

            const result = await client.updateEntry(params.url, {
              replace: params.replace as Record<string, unknown> | undefined,
              add: params.add as Record<string, unknown> | undefined,
              delete: params.remove as string[] | Record<string, unknown> | undefined,
            });

            if (result.success) {
              if (params.response_format === "concise") {
                return { content: [{ type: "text", text: `Updated: ${params.url}` }] };
              }
              return {
                content: [
                  {
                    type: "text",
                    text: `Post updated successfully\n\nURL: ${params.url}`,
                  },
                ],
              };
            } else {
              return {
                content: [{ type: "text", text: `Update failed: ${result.error}` }],
                isError: true,
              };
            }
          }

          case "delete": {
            const result = await client.deleteEntry(params.url);

            if (result.success) {
              if (params.response_format === "concise") {
                return { content: [{ type: "text", text: `Deleted: ${params.url}` }] };
              }
              return {
                content: [
                  {
                    type: "text",
                    text: `Post deleted successfully\n\nURL: ${params.url}\n\nNote: Some servers support undelete if needed.`,
                  },
                ],
              };
            } else {
              return {
                content: [{ type: "text", text: `Delete failed: ${result.error}` }],
                isError: true,
              };
            }
          }

          case "undelete": {
            const result = await client.undeleteEntry(params.url);

            if (result.success) {
              if (params.response_format === "concise") {
                return { content: [{ type: "text", text: `Restored: ${params.url}` }] };
              }
              return {
                content: [
                  {
                    type: "text",
                    text: `Post restored successfully\n\nURL: ${params.url}`,
                  },
                ],
              };
            } else {
              return {
                content: [{ type: "text", text: `Restore failed: ${result.error}` }],
                isError: true,
              };
            }
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${params.action}` }],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
