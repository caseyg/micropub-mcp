/**
 * IndieAuth authentication flow implementation
 *
 * Implements the IndieAuth protocol (https://indieauth.spec.indieweb.org/)
 * with PKCE support for secure authorization code exchange
 */

import type { TokenResponse } from "../types.js";

/**
 * Options for building an authorization URL
 */
export interface AuthorizationUrlOptions {
  /** OAuth client ID (typically the server URL) */
  clientId: string;
  /** Redirect URI for the callback */
  redirectUri: string;
  /** User's website URL */
  me: string;
  /** Space-separated OAuth scopes */
  scope: string;
  /** CSRF state parameter */
  state: string;
  /** PKCE code challenge (S256 hashed) */
  codeChallenge: string;
}

/**
 * Build an IndieAuth authorization URL
 *
 * @param authorizationEndpoint - The authorization endpoint URL
 * @param options - Authorization parameters
 * @returns The complete authorization URL to redirect the user to
 */
export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  options: AuthorizationUrlOptions
): string {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("me", options.me);
  url.searchParams.set("scope", options.scope);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Options for exchanging an authorization code for a token
 */
export interface TokenExchangeOptions {
  /** The authorization code from the callback */
  code: string;
  /** OAuth client ID */
  clientId: string;
  /** Redirect URI (must match the one used in authorization) */
  redirectUri: string;
  /** PKCE code verifier */
  codeVerifier: string;
}

/**
 * Exchange an authorization code for an access token
 *
 * @param tokenEndpoint - The token endpoint URL
 * @param options - Token exchange parameters
 * @returns The token response containing access_token, scope, etc.
 * @throws Error if the token exchange fails
 */
export async function exchangeCodeForToken(
  tokenEndpoint: string,
  options: TokenExchangeOptions
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    let errorMessage = `Token exchange failed: HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string; error_description?: string };
      if (errorBody.error_description) {
        errorMessage = `Token exchange failed: ${errorBody.error_description}`;
      } else if (errorBody.error) {
        errorMessage = `Token exchange failed: ${errorBody.error}`;
      }
    } catch {
      // JSON parsing failed, use text
      try {
        const text = await response.text();
        if (text) {
          errorMessage = `Token exchange failed: ${text}`;
        }
      } catch {
        // Ignore text parsing errors
      }
    }
    throw new Error(errorMessage);
  }

  const tokenResponse = (await response.json()) as TokenResponse;

  // Validate required fields
  if (!tokenResponse.access_token) {
    throw new Error("Token response missing access_token");
  }
  if (!tokenResponse.me) {
    throw new Error("Token response missing me URL");
  }

  return tokenResponse;
}

/**
 * Refresh an access token using a refresh token
 *
 * @param tokenEndpoint - The token endpoint URL
 * @param options - Refresh parameters
 * @returns The new token response
 * @throws Error if the refresh fails
 */
export async function refreshAccessToken(
  tokenEndpoint: string,
  options: {
    refreshToken: string;
    clientId: string;
  }
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    let errorMessage = `Token refresh failed: HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string; error_description?: string };
      if (errorBody.error_description) {
        errorMessage = `Token refresh failed: ${errorBody.error_description}`;
      } else if (errorBody.error) {
        errorMessage = `Token refresh failed: ${errorBody.error}`;
      }
    } catch {
      // Ignore parsing errors
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as TokenResponse;
}
