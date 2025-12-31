/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  /** Durable Object namespace for MCP agent sessions */
  MICROPUB_MCP: DurableObjectNamespace;
  /** Optional: OAuth client ID for this server (can be overridden at runtime) */
  CLIENT_ID?: string;
  /** Optional: OAuth redirect URI (can be overridden at runtime) */
  REDIRECT_URI?: string;
}

/**
 * Session state stored in the Durable Object
 */
export interface SessionState {
  // User identity
  /** User's website URL (canonical form) */
  me?: string;

  // Discovered endpoints
  /** Micropub endpoint URL */
  micropubEndpoint?: string;
  /** Media endpoint URL (if available) */
  mediaEndpoint?: string;
  /** IndieAuth authorization endpoint */
  authorizationEndpoint?: string;
  /** IndieAuth token endpoint */
  tokenEndpoint?: string;

  // OAuth tokens
  /** OAuth access token */
  accessToken?: string;
  /** Token type (usually "Bearer") */
  tokenType?: string;
  /** Granted OAuth scopes */
  scope?: string;
  /** Refresh token (if provided) */
  refreshToken?: string;
  /** Token expiration timestamp (milliseconds since epoch) */
  tokenExpiresAt?: number;

  // Auth flow state (temporary, cleared after completion)
  /** CSRF state parameter */
  authState?: string;
  /** PKCE code verifier */
  codeVerifier?: string;
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
