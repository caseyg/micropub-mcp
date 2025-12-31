/**
 * Consolidated micropub_media tool
 *
 * A single tool for uploading media files to the Micropub media endpoint.
 * Follows Anthropic's recommendation to consolidate functionality around user intent.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthProps, ResponseFormat } from "../types.js";

/**
 * Schema for the micropub_media tool
 */
const micropubMediaSchema = {
  source_url: z
    .string()
    .describe("URL of the file to upload. The file will be fetched and uploaded to the media endpoint."),
  alt_text: z
    .string()
    .optional()
    .describe("Alt text for the media (accessibility description)."),
  filename: z
    .string()
    .optional()
    .describe("Override filename for the upload. Auto-detected from URL if not provided."),
  response_format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe("Output format: 'concise' for just the URL, 'detailed' for full response."),
};

/**
 * Extract filename from a URL
 */
function extractFilename(url: string): string {
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
  return "upload";
}

/**
 * Format the upload response
 */
function formatResponse(location: string, format: ResponseFormat): string {
  if (format === "concise") {
    return location;
  }

  return [
    "Media uploaded successfully",
    "",
    `URL: ${location}`,
    "",
    "Use this URL in the photo, video, or audio property when creating posts.",
  ].join("\n");
}

/**
 * Register the consolidated micropub_media tool
 */
export function registerMicropubMediaTool(
  server: McpServer,
  getAuthProps: () => AuthProps | null
): void {
  server.tool(
    "micropub_media",
    "Upload a media file (image, video, audio) to the Micropub media endpoint. " +
      "Returns a URL that can be used in posts. Requires a media endpoint to be available.",
    micropubMediaSchema,
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

      if (!auth.mediaEndpoint) {
        return {
          content: [
            {
              type: "text",
              text:
                "No media endpoint available. This site may not support media uploads. " +
                "You can include external photo/video URLs directly in posts instead.",
            },
          ],
          isError: true,
        };
      }

      try {
        // Fetch the file from the source URL
        const fileResponse = await fetch(params.source_url);
        if (!fileResponse.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fetch file from ${params.source_url}: ${fileResponse.status} ${fileResponse.statusText}`,
              },
            ],
            isError: true,
          };
        }

        const blob = await fileResponse.blob();
        const filename = params.filename || extractFilename(params.source_url);

        // Create multipart form data
        const formData = new FormData();
        formData.append("file", blob, filename);

        // Upload to media endpoint
        const uploadResponse = await fetch(auth.mediaEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.indieAuthToken}`,
          },
          body: formData,
        });

        if (uploadResponse.status === 201) {
          const location = uploadResponse.headers.get("Location");
          if (!location) {
            return {
              content: [
                {
                  type: "text",
                  text: "Upload succeeded but no URL was returned by the server.",
                },
              ],
              isError: true,
            };
          }

          const response = formatResponse(location, params.response_format);
          return { content: [{ type: "text", text: response }] };
        }

        // Handle error response
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
          content: [{ type: "text", text: `Error uploading media: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
