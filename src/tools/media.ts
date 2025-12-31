/**
 * Media upload tools
 *
 * Provides tools for:
 * - Uploading media files to the media endpoint
 * - Creating photo posts with automatic upload
 */

import { z } from "zod";
import type { MicropubMcpAgent } from "../agent.js";
import type { PhotoWithAlt } from "../types.js";

/**
 * Register media tools on the MCP agent
 */
export function registerMediaTools(agent: MicropubMcpAgent): void {
  // Tool: Upload media
  agent.server.tool(
    "micropub_upload_media",
    "Upload an image or file to the media endpoint. Returns a URL to use in posts.",
    {
      source_url: z.string().describe("URL of the file to upload"),
      filename: z.string().optional().describe("Filename to use (auto-detected if not provided)"),
    },
    async ({ source_url, filename }) => {
      try {
        if (!agent.isAuthenticated()) {
          return {
            content: [{ type: "text", text: "Not authenticated. Run micropub_auth_start first." }],
            isError: true,
          };
        }

        if (!agent.state.mediaEndpoint) {
          return {
            content: [
              {
                type: "text",
                text: "No media endpoint available. This site may not support media uploads, or you can include the photo URL directly in the post.",
              },
            ],
            isError: true,
          };
        }

        // Fetch the file
        const fileResponse = await fetch(source_url);
        if (!fileResponse.ok) {
          return {
            content: [
              { type: "text", text: `Failed to fetch file from ${source_url}: ${fileResponse.status}` },
            ],
            isError: true,
          };
        }

        const blob = await fileResponse.blob();

        // Determine filename
        const finalFilename = filename || extractFilename(source_url) || "upload";

        // Create multipart form data
        const formData = new FormData();
        formData.append("file", blob, finalFilename);

        // Upload to media endpoint
        const uploadResponse = await fetch(agent.state.mediaEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${agent.state.accessToken}`,
          },
          body: formData,
        });

        if (uploadResponse.status === 201) {
          const location = uploadResponse.headers.get("Location");
          return {
            content: [
              {
                type: "text",
                text: `Media uploaded!\n\nURL: ${location}\n\nUse this URL in the 'photo', 'video', or 'audio' property when creating posts.`,
              },
            ],
          };
        }

        let error = `HTTP ${uploadResponse.status}`;
        try {
          const errorBody = (await uploadResponse.json()) as {
            error?: string;
            error_description?: string;
          };
          error = errorBody.error_description || errorBody.error || error;
        } catch {
          try {
            const text = await uploadResponse.text();
            if (text) error = text;
          } catch {
            // Ignore
          }
        }

        return {
          content: [{ type: "text", text: `Upload failed: ${error}` }],
          isError: true,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Create photo post
  agent.server.tool(
    "micropub_create_photo",
    "Create a photo post with an image. Can upload from URL or use existing media URL.",
    {
      photo: z
        .string()
        .describe("Photo URL (will be uploaded if media endpoint available, or used directly)"),
      alt: z.string().optional().describe("Alt text for accessibility"),
      content: z.string().optional().describe("Caption/description"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
    },
    async ({ photo, alt, content, category }) => {
      try {
        if (!agent.isAuthenticated()) {
          return {
            content: [{ type: "text", text: "Not authenticated. Run micropub_auth_start first." }],
            isError: true,
          };
        }

        let photoUrl = photo;

        // Try to upload if we have a media endpoint and it's an external URL
        if (agent.state.mediaEndpoint && agent.state.me && !photo.includes(agent.state.me)) {
          try {
            const fileResponse = await fetch(photo);
            if (fileResponse.ok) {
              const blob = await fileResponse.blob();
              const filename = extractFilename(photo) || "photo.jpg";

              const formData = new FormData();
              formData.append("file", blob, filename);

              const uploadResponse = await fetch(agent.state.mediaEndpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${agent.state.accessToken}`,
                },
                body: formData,
              });

              if (uploadResponse.status === 201) {
                const location = uploadResponse.headers.get("Location");
                if (location) {
                  photoUrl = location;
                }
              }
            }
          } catch {
            // Fall back to using original URL
          }
        }

        // Create the post
        const properties: Record<string, unknown> = {};

        // Photo can be a simple URL or an object with alt text
        if (alt) {
          properties.photo = [{ value: photoUrl, alt } as PhotoWithAlt];
        } else {
          properties.photo = [photoUrl];
        }

        if (content) properties.content = [content];
        if (category?.length) properties.category = category;

        const response = await fetch(agent.state.micropubEndpoint!, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${agent.state.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: ["h-entry"],
            properties,
          }),
        });

        if (response.status === 201 || response.status === 202) {
          const location = response.headers.get("Location");
          return {
            content: [
              {
                type: "text",
                text: `Photo post created!\n\nURL: ${location || "Not returned by server"}`,
              },
            ],
          };
        }

        let error = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string; error_description?: string };
          error = body.error_description || body.error || error;
        } catch {
          // Ignore
        }

        return {
          content: [{ type: "text", text: `Failed to create photo post: ${error}` }],
          isError: true,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: Create video post
  agent.server.tool(
    "micropub_create_video",
    "Create a video post.",
    {
      video: z.string().describe("Video URL"),
      content: z.string().optional().describe("Caption/description"),
      category: z.array(z.string()).optional().describe("Tags/categories"),
    },
    async ({ video, content, category }) => {
      try {
        if (!agent.isAuthenticated()) {
          return {
            content: [{ type: "text", text: "Not authenticated. Run micropub_auth_start first." }],
            isError: true,
          };
        }

        const properties: Record<string, unknown> = {
          video: [video],
        };

        if (content) properties.content = [content];
        if (category?.length) properties.category = category;

        const response = await fetch(agent.state.micropubEndpoint!, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${agent.state.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: ["h-entry"],
            properties,
          }),
        });

        if (response.status === 201 || response.status === 202) {
          const location = response.headers.get("Location");
          return {
            content: [
              {
                type: "text",
                text: `Video post created!\n\nURL: ${location || "Not returned by server"}`,
              },
            ],
          };
        }

        let error = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string; error_description?: string };
          error = body.error_description || body.error || error;
        } catch {
          // Ignore
        }

        return {
          content: [{ type: "text", text: `Failed to create video post: ${error}` }],
          isError: true,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Extract filename from a URL
 */
function extractFilename(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastSegment = pathname.split("/").pop();
    if (lastSegment && lastSegment.includes(".")) {
      return lastSegment;
    }
  } catch {
    // Invalid URL
  }
  return undefined;
}
