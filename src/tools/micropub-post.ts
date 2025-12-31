/**
 * Consolidated micropub_post tool
 *
 * A single, intent-based tool for creating any type of Micropub post.
 * Follows Anthropic's recommendation to consolidate functionality around user intent.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MicropubClient } from "../lib/micropub-client.js";
import type {
  AuthProps,
  MicropubPostType,
  ResponseFormat,
  RsvpValue,
  PhotoWithAlt,
} from "../types.js";

/**
 * Schema for the micropub_post tool
 */
const micropubPostSchema = {
  post_type: z
    .enum(["note", "article", "bookmark", "like", "repost", "reply", "rsvp", "photo", "video", "checkin"])
    .describe(
      "Type of post to create: 'note' (short status), 'article' (long-form with title), " +
        "'bookmark' (save a URL), 'like' (favorite a URL), 'repost' (share a URL), " +
        "'reply' (respond to a URL), 'rsvp' (respond to an event), 'photo' (image post), " +
        "'video' (video post), 'checkin' (location check-in)"
    ),
  content: z
    .string()
    .optional()
    .describe("Text content of the post. Required for note, article, reply. Optional for others."),
  name: z
    .string()
    .optional()
    .describe("Title of the post. Required for article, optional for bookmark."),
  target_url: z
    .string()
    .optional()
    .describe(
      "URL being interacted with. Required for bookmark (bookmark-of), like (like-of), " +
        "repost (repost-of), reply (in-reply-to), rsvp (in-reply-to)."
    ),
  rsvp_value: z
    .enum(["yes", "no", "maybe", "interested"])
    .optional()
    .describe("RSVP response. Required when post_type is 'rsvp'."),
  photo_url: z
    .string()
    .optional()
    .describe("URL of photo to include. Required for photo post type."),
  photo_alt: z
    .string()
    .optional()
    .describe("Alt text for the photo (accessibility)."),
  video_url: z
    .string()
    .optional()
    .describe("URL of video to include. Required for video post type."),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
    })
    .optional()
    .describe("Location data for checkin posts."),
  categories: z
    .array(z.string())
    .optional()
    .describe("Tags/categories for the post."),
  summary: z
    .string()
    .optional()
    .describe("Short summary/excerpt (mainly for articles)."),
  slug: z
    .string()
    .optional()
    .describe("URL slug suggestion (mp-slug)."),
  draft: z
    .boolean()
    .default(false)
    .describe("Save as draft instead of publishing immediately."),
  syndicate_to: z
    .array(z.string())
    .optional()
    .describe("Syndication target UIDs for cross-posting."),
  response_format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe("Output format: 'concise' for brief confirmation, 'detailed' for full response."),
};

/**
 * Build post properties based on post type
 */
function buildProperties(
  postType: MicropubPostType,
  params: {
    content?: string;
    name?: string;
    target_url?: string;
    rsvp_value?: RsvpValue;
    photo_url?: string;
    photo_alt?: string;
    video_url?: string;
    location?: { latitude: number; longitude: number; name?: string };
    categories?: string[];
    summary?: string;
    slug?: string;
    draft?: boolean;
    syndicate_to?: string[];
  }
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  // Add content if provided
  if (params.content) {
    properties.content = params.content;
  }

  // Add title for articles
  if (params.name) {
    properties.name = params.name;
  }

  // Add target URL based on post type
  if (params.target_url) {
    switch (postType) {
      case "bookmark":
        properties["bookmark-of"] = params.target_url;
        break;
      case "like":
        properties["like-of"] = params.target_url;
        break;
      case "repost":
        properties["repost-of"] = params.target_url;
        break;
      case "reply":
      case "rsvp":
        properties["in-reply-to"] = params.target_url;
        break;
    }
  }

  // Add RSVP value
  if (postType === "rsvp" && params.rsvp_value) {
    properties.rsvp = params.rsvp_value;
  }

  // Add photo
  if (params.photo_url) {
    if (params.photo_alt) {
      properties.photo = [{ value: params.photo_url, alt: params.photo_alt } as PhotoWithAlt];
    } else {
      properties.photo = [params.photo_url];
    }
  }

  // Add video
  if (params.video_url) {
    properties.video = [params.video_url];
  }

  // Add location for checkin
  if (postType === "checkin" && params.location) {
    properties.checkin = [
      {
        type: ["h-card"],
        properties: {
          latitude: [params.location.latitude],
          longitude: [params.location.longitude],
          ...(params.location.name && { name: [params.location.name] }),
        },
      },
    ];
  }

  // Add categories
  if (params.categories?.length) {
    properties.category = params.categories;
  }

  // Add summary
  if (params.summary) {
    properties.summary = params.summary;
  }

  // Add slug
  if (params.slug) {
    properties["mp-slug"] = params.slug;
  }

  // Add draft status
  if (params.draft) {
    properties["post-status"] = "draft";
  }

  // Add syndication targets
  if (params.syndicate_to?.length) {
    properties["mp-syndicate-to"] = params.syndicate_to;
  }

  return properties;
}

/**
 * Validate required fields based on post type
 */
function validatePostType(
  postType: MicropubPostType,
  params: Record<string, unknown>
): string | null {
  switch (postType) {
    case "note":
      if (!params.content) return "Note requires content";
      break;
    case "article":
      if (!params.name) return "Article requires a title (name)";
      if (!params.content) return "Article requires content";
      break;
    case "bookmark":
      if (!params.target_url) return "Bookmark requires a target_url";
      break;
    case "like":
      if (!params.target_url) return "Like requires a target_url";
      break;
    case "repost":
      if (!params.target_url) return "Repost requires a target_url";
      break;
    case "reply":
      if (!params.target_url) return "Reply requires a target_url";
      if (!params.content) return "Reply requires content";
      break;
    case "rsvp":
      if (!params.target_url) return "RSVP requires a target_url (event URL)";
      if (!params.rsvp_value) return "RSVP requires an rsvp_value";
      break;
    case "photo":
      if (!params.photo_url) return "Photo post requires a photo_url";
      break;
    case "video":
      if (!params.video_url) return "Video post requires a video_url";
      break;
    case "checkin":
      if (!params.location) return "Checkin requires location data";
      break;
  }
  return null;
}

/**
 * Format the response based on response_format preference
 */
function formatResponse(
  postType: MicropubPostType,
  location: string | undefined,
  format: ResponseFormat,
  draft: boolean
): string {
  const typeLabel = postType.charAt(0).toUpperCase() + postType.slice(1);
  const status = draft ? " (draft)" : "";

  if (format === "concise") {
    if (location) {
      return `${typeLabel} created${status}: ${location}`;
    }
    return `${typeLabel} created${status}`;
  }

  // Detailed format
  const lines = [`${typeLabel} post created successfully${status}`];
  if (location) {
    lines.push("", `URL: ${location}`);
  }
  lines.push("", `Post type: ${postType}`);
  if (draft) {
    lines.push("Status: Draft (not yet published)");
  }
  return lines.join("\n");
}

/**
 * Register the consolidated micropub_post tool
 */
export function registerMicropubPostTool(
  server: McpServer,
  getAuthProps: () => AuthProps | null
): void {
  server.tool(
    "micropub_post",
    "Create a Micropub post of any type (note, article, bookmark, like, repost, reply, RSVP, photo, video, or checkin). " +
      "Use post_type to specify the kind of post. Each type has specific required fields.",
    micropubPostSchema,
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

      // Validate required fields for post type
      const validationError = validatePostType(params.post_type, params);
      if (validationError) {
        return {
          content: [{ type: "text", text: validationError }],
          isError: true,
        };
      }

      try {
        const client = new MicropubClient(auth.micropubEndpoint, auth.indieAuthToken);
        const properties = buildProperties(params.post_type, params);
        const result = await client.createEntry(properties);

        if (result.success) {
          const response = formatResponse(
            params.post_type,
            result.location,
            params.response_format,
            params.draft ?? false
          );
          return { content: [{ type: "text", text: response }] };
        } else {
          return {
            content: [{ type: "text", text: `Failed to create post: ${result.error}` }],
            isError: true,
          };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating post: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
