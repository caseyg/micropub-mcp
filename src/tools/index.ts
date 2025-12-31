/**
 * Tool registration hub
 *
 * Exports consolidated tools following Anthropic's guidance:
 * - micropub_post: Create any type of post
 * - micropub_query: Query endpoint configuration and content
 * - micropub_media: Upload media files
 * - micropub_manage: Update, delete, undelete posts
 */

export { registerMicropubPostTool } from "./micropub-post.js";
export { registerMicropubQueryTool } from "./micropub-query.js";
export { registerMicropubMediaTool } from "./micropub-media.js";
export { registerMicropubManageTool } from "./micropub-manage.js";
