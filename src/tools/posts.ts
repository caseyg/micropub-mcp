/**
 * Post creation and management tools
 *
 * Provides tools for:
 * - Creating notes, articles, and bookmarks
 * - Updating existing posts
 * - Deleting and undeleting posts
 */

import { z } from "zod";
import type { MicropubMcpAgent } from "../agent.js";
import { MicropubClient } from "../lib/micropub-client.js";

/**
 * Register post management tools on the MCP agent
 */
export function registerPostTools(agent: MicropubMcpAgent): void {
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

  // Tool: Create a note (short post)
  agent.server.tool(
    "micropub_create_note",
    "Create a short note/status post (like a tweet). Returns the URL of the created post.",
    {
      content: z.string().describe("The note text content"),
      category: z.array(z.string()).optional().describe("Tags/categories for the post"),
      in_reply_to: z.string().optional().describe("URL this note is replying to"),
      syndicate_to: z
        .array(z.string())
        .optional()
        .describe("Syndication targets (use micropub_query_config to see available targets)"),
    },
    async ({ content, category, in_reply_to, syndicate_to }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = { content };
        if (category?.length) properties.category = category;
        if (in_reply_to) properties["in-reply-to"] = in_reply_to;
        if (syndicate_to?.length) properties["mp-syndicate-to"] = syndicate_to;

        const result = await client.createEntry(properties);

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Note created successfully!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create note: ${result.error}` }],
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

  // Tool: Create an article (long-form post with title)
  agent.server.tool(
    "micropub_create_article",
    "Create a long-form article with a title. Returns the URL of the created post.",
    {
      name: z.string().describe("Article title"),
      content: z.string().describe("Article body (can include HTML or Markdown depending on server)"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
      summary: z.string().optional().describe("Short summary/excerpt"),
      slug: z.string().optional().describe("URL slug suggestion"),
      post_status: z
        .enum(["published", "draft"])
        .default("published")
        .describe("Publish immediately or save as draft"),
    },
    async ({ name, content, category, summary, slug, post_status }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = { name, content };
        if (category?.length) properties.category = category;
        if (summary) properties.summary = summary;
        if (slug) properties["mp-slug"] = slug;
        if (post_status === "draft") properties["post-status"] = "draft";

        const result = await client.createEntry(properties);

        if (result.success) {
          const status = post_status === "draft" ? " (draft)" : "";
          return {
            content: [
              {
                type: "text",
                text: `Article created${status}!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create article: ${result.error}` }],
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

  // Tool: Create a bookmark
  agent.server.tool(
    "micropub_create_bookmark",
    "Create a bookmark post saving a URL with optional notes.",
    {
      bookmark_of: z.string().describe("URL being bookmarked"),
      name: z.string().optional().describe("Title/name for the bookmark"),
      content: z.string().optional().describe("Your notes about this bookmark"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
    },
    async ({ bookmark_of, name, content, category }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = { "bookmark-of": bookmark_of };
        if (name) properties.name = name;
        if (content) properties.content = content;
        if (category?.length) properties.category = category;

        const result = await client.createEntry(properties);

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Bookmark created!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create bookmark: ${result.error}` }],
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

  // Tool: Create a like
  agent.server.tool(
    "micropub_create_like",
    "Create a like/favorite post for a URL.",
    {
      like_of: z.string().describe("URL being liked"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
    },
    async ({ like_of, category }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = { "like-of": like_of };
        if (category?.length) properties.category = category;

        const result = await client.createEntry(properties);

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Like created!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create like: ${result.error}` }],
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

  // Tool: Create a repost
  agent.server.tool(
    "micropub_create_repost",
    "Create a repost/share of another post.",
    {
      repost_of: z.string().describe("URL being reposted"),
      content: z.string().optional().describe("Optional commentary"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
    },
    async ({ repost_of, content, category }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = { "repost-of": repost_of };
        if (content) properties.content = content;
        if (category?.length) properties.category = category;

        const result = await client.createEntry(properties);

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Repost created!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create repost: ${result.error}` }],
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

  // Tool: Create an RSVP
  agent.server.tool(
    "micropub_create_rsvp",
    "Create an RSVP response to an event.",
    {
      in_reply_to: z.string().describe("URL of the event"),
      rsvp: z.enum(["yes", "no", "maybe", "interested"]).describe("RSVP response"),
      content: z.string().optional().describe("Optional message with RSVP"),
    },
    async ({ in_reply_to, rsvp, content }) => {
      try {
        const client = getClient();

        const properties: Record<string, unknown> = {
          "in-reply-to": in_reply_to,
          rsvp,
        };
        if (content) properties.content = content;

        const result = await client.createEntry(properties);

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `RSVP created!\n\nURL: ${result.location || "Not returned by server"}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create RSVP: ${result.error}` }],
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

  // Tool: Update a post
  agent.server.tool(
    "micropub_update_post",
    "Update an existing post. Can replace, add, or remove properties.",
    {
      url: z.string().describe("URL of the post to update"),
      replace: z.record(z.unknown()).optional().describe("Properties to replace completely"),
      add: z.record(z.unknown()).optional().describe("Values to add to existing properties"),
      remove: z
        .union([z.array(z.string()), z.record(z.unknown())])
        .optional()
        .describe("Properties to remove (array) or specific values to remove (object)"),
    },
    async ({ url, replace, add, remove }) => {
      try {
        const client = getClient();

        const result = await client.updateEntry(url, {
          replace: replace as Record<string, unknown> | undefined,
          add: add as Record<string, unknown> | undefined,
          delete: remove as string[] | Record<string, unknown> | undefined,
        });

        if (result.success) {
          return {
            content: [{ type: "text", text: `Post updated successfully!` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to update: ${result.error}` }],
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

  // Tool: Delete a post
  agent.server.tool(
    "micropub_delete_post",
    "Delete a post. Some servers support soft-delete (can be undone with undelete).",
    {
      url: z.string().describe("URL of the post to delete"),
    },
    async ({ url }) => {
      try {
        const client = getClient();
        const result = await client.deleteEntry(url);

        if (result.success) {
          return {
            content: [{ type: "text", text: `Post deleted: ${url}` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to delete: ${result.error}` }],
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

  // Tool: Undelete a post
  agent.server.tool(
    "micropub_undelete_post",
    "Restore a previously deleted post (if server supports soft-delete).",
    {
      url: z.string().describe("URL of the post to restore"),
    },
    async ({ url }) => {
      try {
        const client = getClient();
        const result = await client.undeleteEntry(url);

        if (result.success) {
          return {
            content: [{ type: "text", text: `Post restored: ${url}` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to restore: ${result.error}` }],
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
