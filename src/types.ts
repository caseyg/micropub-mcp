/**
 * Type definitions for Micropub MCP Server
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  /** Durable Object namespace for MCP agent sessions */
  MICROPUB_MCP: DurableObjectNamespace;
  /** KV namespace for OAuth token storage */
  OAUTH_KV: KVNamespace;
  /** OAuth provider helpers injected by OAuthProvider wrapper */
  OAUTH_PROVIDER: OAuthHelpers;
}

/**
 * Auth context props stored with OAuth grants (encrypted)
 * These are passed to every authenticated MCP request but never exposed to clients
 */
export interface AuthProps extends Record<string, unknown> {
  /** User's website URL (me parameter) */
  me: string;
  /** Discovered Micropub endpoint */
  micropubEndpoint: string;
  /** Media endpoint (if available) */
  mediaEndpoint?: string;
  /** IndieAuth access token (encrypted, never sent to MCP client) */
  indieAuthToken: string;
  /** Token type */
  tokenType: string;
  /** Granted scopes */
  scope: string;
  /** Refresh token (if available) */
  refreshToken?: string;
  /** Token expiration timestamp */
  tokenExpiresAt?: number;
  /** Token endpoint for refresh */
  tokenEndpoint?: string;
}

/**
 * Pending authorization state stored in KV during OAuth flow
 */
export interface PendingAuth {
  /** User's website URL */
  me: string;
  /** Discovered Micropub endpoint */
  micropubEndpoint: string;
  /** Media endpoint */
  mediaEndpoint?: string;
  /** Authorization endpoint */
  authorizationEndpoint: string;
  /** Token endpoint */
  tokenEndpoint: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** Original MCP client redirect URI */
  clientRedirectUri: string;
  /** Requested scopes */
  requestedScope: string;
  /** Timestamp when this was created */
  createdAt: number;
}

/**
 * Result of endpoint discovery
 */
export interface DiscoveryResult {
  /** Canonical user URL */
  me: string;
  /** Micropub endpoint URL */
  micropubEndpoint?: string;
  /** Media endpoint URL */
  mediaEndpoint?: string;
  /** IndieAuth authorization endpoint */
  authorizationEndpoint?: string;
  /** IndieAuth token endpoint */
  tokenEndpoint?: string;
}

/**
 * IndieAuth token response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  me: string;
  expires_in?: number;
  refresh_token?: string;
}

/**
 * Micropub server configuration response
 */
export interface MicropubConfig {
  "media-endpoint"?: string;
  "syndicate-to"?: SyndicationTarget[];
  "post-types"?: PostType[];
  q?: string[];
}

/**
 * Syndication target for cross-posting
 */
export interface SyndicationTarget {
  uid: string;
  name: string;
  service?: {
    name: string;
    url: string;
    photo?: string;
  };
  user?: {
    name: string;
    url: string;
    photo?: string;
  };
}

/**
 * Supported post type
 */
export interface PostType {
  type: string;
  name: string;
}

/**
 * Micropub create request (JSON format)
 */
export interface MicropubCreateRequest {
  type: string[];
  properties: Record<string, unknown[]>;
}

/**
 * Micropub update request
 */
export interface MicropubUpdateRequest {
  action: "update";
  url: string;
  replace?: Record<string, unknown[]>;
  add?: Record<string, unknown[]>;
  delete?: string[] | Record<string, unknown[]>;
}

/**
 * Micropub delete/undelete request
 */
export interface MicropubDeleteRequest {
  action: "delete" | "undelete";
  url: string;
}

/**
 * Result of a Micropub operation
 */
export interface MicropubResult {
  success: boolean;
  location?: string;
  error?: string;
}

/**
 * Photo property with alt text
 */
export interface PhotoWithAlt {
  value: string;
  alt: string;
}

/**
 * Consolidated post types supported by micropub_post tool
 */
export type MicropubPostType =
  | "note"
  | "article"
  | "bookmark"
  | "like"
  | "repost"
  | "reply"
  | "rsvp"
  | "photo"
  | "video"
  | "checkin";

/**
 * Query types supported by micropub_query tool
 */
export type MicropubQueryType =
  | "config"
  | "source"
  | "syndicate-to"
  | "category"
  | "contact";

/**
 * Response format for tool outputs
 */
export type ResponseFormat = "concise" | "detailed";

/**
 * RSVP values
 */
export type RsvpValue = "yes" | "no" | "maybe" | "interested";
