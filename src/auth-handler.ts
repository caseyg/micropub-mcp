/**
 * IndieAuth Handler for OAuth Provider
 *
 * Handles the IndieAuth flow:
 * 1. Shows login page for entering website URL
 * 2. Discovers IndieAuth endpoints
 * 3. Redirects to IndieAuth authorization
 * 4. Handles callback and exchanges code for token
 * 5. Completes authorization with OAuthProvider
 */

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { discoverEndpoints } from "./lib/discovery.js";
import { buildAuthorizationUrl, exchangeCodeForToken } from "./lib/indieauth.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./lib/pkce.js";
import type { Env, PendingAuth, AuthProps, MicropubConfig } from "./types.js";

/**
 * Serializable OAuth request data for storage in KV
 * We store primitives instead of the full AuthRequest to avoid URL serialization issues
 */
interface StoredOAuthRequest {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string[];
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

// Pending auth entries expire after 10 minutes
const PENDING_AUTH_TTL = 600;

/**
 * Handle the authorize endpoint - parse request and show login page
 */
export async function handleAuthorize(
  request: Request,
  env: Env
): Promise<Response> {
  // Parse the OAuth authorization request
  const oauthReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);

  // Show login page or process form submission
  if (request.method === "GET") {
    return renderLoginPage(oauthReq);
  } else if (request.method === "POST") {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    return handleLoginSubmit(request, env, oauthReq, baseUrl);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

/**
 * Handle the IndieAuth callback
 */
export async function handleCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return handleIndieAuthCallback(request, env, baseUrl);
}

/**
 * Render the login page where users enter their website URL
 */
function renderLoginPage(oauthReq: AuthRequest): Response {
  const scopeDisplay = oauthReq.scope?.join(" ") || "create update delete media";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with your website - Micropub MCP</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 500px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #1a1a2e; margin-bottom: 0.5em; }
    .subtitle { color: #666; margin-bottom: 2em; }
    form { display: flex; flex-direction: column; gap: 1em; }
    label { font-weight: 500; }
    input[type="url"] {
      padding: 12px;
      font-size: 16px;
      border: 2px solid #ddd;
      border-radius: 8px;
      width: 100%;
    }
    input[type="url"]:focus {
      border-color: #4a6cf7;
      outline: none;
    }
    button {
      padding: 12px 24px;
      font-size: 16px;
      background: #4a6cf7;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover { background: #3a5ce7; }
    .info {
      background: #f0f4ff;
      padding: 16px;
      border-radius: 8px;
      margin-top: 2em;
      font-size: 14px;
    }
    .info h3 { margin: 0 0 0.5em 0; font-size: 14px; }
    .scopes { font-family: monospace; color: #4a6cf7; }
  </style>
</head>
<body>
  <h1>Sign in with your website</h1>
  <p class="subtitle">Connect your IndieWeb site to enable AI-powered publishing</p>

  <form method="POST" action="/authorize?${buildOAuthQueryString(oauthReq)}">
    <label for="me">Your website URL</label>
    <input
      type="url"
      id="me"
      name="me"
      placeholder="https://example.com"
      required
      autocomplete="url"
    >
    <button type="submit">Continue with IndieAuth</button>
  </form>

  <div class="info">
    <h3>What happens next?</h3>
    <p>You'll be redirected to your site's IndieAuth provider to authorize access.</p>
    <p>Requested permissions: <span class="scopes">${scopeDisplay}</span></p>
  </div>
</body>
</html>
`.trim();

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Handle login form submission
 */
async function handleLoginSubmit(
  request: Request,
  env: Env,
  oauthReq: AuthRequest,
  baseUrl: string
): Promise<Response> {
  const formData = await request.formData();
  const me = formData.get("me");

  if (!me || typeof me !== "string") {
    return renderErrorPage("Please enter your website URL");
  }

  try {
    // Discover IndieAuth endpoints
    const endpoints = await discoverEndpoints(me);

    if (!endpoints.micropubEndpoint) {
      return renderErrorPage(
        "Your website doesn't appear to support Micropub. " +
          "Make sure you have a Micropub endpoint configured."
      );
    }

    if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
      return renderErrorPage(
        "Couldn't find IndieAuth endpoints on your website. " +
          "Make sure you have authorization_endpoint and token_endpoint configured."
      );
    }

    // Generate PKCE values
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Extract serializable data from OAuth request to avoid URL object serialization issues
    console.log("Received OAuth request - responseType:", oauthReq.responseType);
    console.log("Received OAuth request - clientId:", oauthReq.clientId);
    console.log("Received OAuth request - redirectUri:", oauthReq.redirectUri);
    console.log("Received OAuth request - state:", oauthReq.state);
    console.log("Received OAuth request - scope:", oauthReq.scope);

    const storedOAuthReq: StoredOAuthRequest = {
      responseType: oauthReq.responseType,
      clientId: oauthReq.clientId,
      redirectUri: oauthReq.redirectUri,
      state: oauthReq.state,
      scope: oauthReq.scope || [],
      codeChallenge: oauthReq.codeChallenge,
      codeChallengeMethod: oauthReq.codeChallengeMethod,
    };

    console.log("Stored OAuth request:", JSON.stringify(storedOAuthReq));

    // Store pending auth state in KV (includes original OAuth request info)
    const pendingAuth: PendingAuth & { storedOAuthReq: StoredOAuthRequest } = {
      me: endpoints.me,
      micropubEndpoint: endpoints.micropubEndpoint,
      mediaEndpoint: endpoints.mediaEndpoint,
      authorizationEndpoint: endpoints.authorizationEndpoint,
      tokenEndpoint: endpoints.tokenEndpoint,
      codeVerifier,
      clientRedirectUri: oauthReq.redirectUri,
      requestedScope: oauthReq.scope?.join(" ") || "create update delete media",
      createdAt: Date.now(),
      storedOAuthReq, // Store serializable OAuth request data for completing authorization
    };

    await env.OAUTH_KV.put(`pending:${state}`, JSON.stringify(pendingAuth), {
      expirationTtl: PENDING_AUTH_TTL,
    });

    // Build IndieAuth authorization URL
    const scope = oauthReq.scope?.join(" ") || "create update delete media";
    const authUrl = buildAuthorizationUrl(endpoints.authorizationEndpoint, {
      clientId: `${baseUrl}/`,
      redirectUri: `${baseUrl}/indieauth-callback`,
      me: endpoints.me,
      scope,
      state,
      codeChallenge,
    });

    // Redirect to IndieAuth
    return Response.redirect(authUrl, 302);
  } catch (error) {
    console.error("Login error:", error);
    return renderErrorPage(`Failed to connect to your website: ${error}`);
  }
}

/**
 * Handle IndieAuth callback
 */
async function handleIndieAuthCallback(
  request: Request,
  env: Env,
  baseUrl: string
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle error from IndieAuth
  if (error) {
    return renderErrorPage(errorDescription || error);
  }

  if (!code || !state) {
    return renderErrorPage("Missing authorization code or state");
  }

  // Retrieve pending auth state
  const pendingJson = await env.OAUTH_KV.get(`pending:${state}`);
  if (!pendingJson) {
    return renderErrorPage("Authorization session expired. Please try again.");
  }

  // Delete the pending auth entry
  await env.OAUTH_KV.delete(`pending:${state}`);

  const pending: PendingAuth & { storedOAuthReq: StoredOAuthRequest } = JSON.parse(pendingJson);

  try {
    // Exchange code for token
    const token = await exchangeCodeForToken(pending.tokenEndpoint, {
      code,
      clientId: `${baseUrl}/`,
      redirectUri: `${baseUrl}/indieauth-callback`,
      codeVerifier: pending.codeVerifier,
    });

    // Query for media endpoint from Micropub config
    let mediaEndpoint = pending.mediaEndpoint;
    if (!mediaEndpoint && pending.micropubEndpoint) {
      try {
        const configUrl = new URL(pending.micropubEndpoint);
        configUrl.searchParams.set("q", "config");
        const configResponse = await fetch(configUrl.toString(), {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
          },
        });
        if (configResponse.ok) {
          const config = (await configResponse.json()) as MicropubConfig;
          mediaEndpoint = config["media-endpoint"];
        }
      } catch {
        // Media endpoint is optional
      }
    }

    // Build auth props to store with the grant (these are encrypted by OAuthProvider)
    const authProps: AuthProps = {
      me: token.me,
      micropubEndpoint: pending.micropubEndpoint,
      mediaEndpoint,
      indieAuthToken: token.access_token,
      tokenType: token.token_type,
      scope: token.scope,
      refreshToken: token.refresh_token,
      tokenExpiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      tokenEndpoint: pending.tokenEndpoint,
    };

    // Complete the OAuth authorization using the provider helpers
    // Pass the stored OAuth request data (serializable primitives only)
    console.log("Completing authorization with storedOAuthReq:", JSON.stringify(pending.storedOAuthReq));
    console.log("storedOAuthReq.redirectUri:", pending.storedOAuthReq.redirectUri);
    console.log("storedOAuthReq.clientId:", pending.storedOAuthReq.clientId);
    console.log("storedOAuthReq.state:", pending.storedOAuthReq.state);

    // Validate that required URL fields are present and valid
    if (!pending.storedOAuthReq.redirectUri || !pending.storedOAuthReq.clientId) {
      console.error("Missing required OAuth fields in stored request");
      return renderErrorPage("Authorization session is invalid. Missing required OAuth parameters. Please try again.");
    }

    // Validate URLs before passing to completeAuthorization
    try {
      new URL(pending.storedOAuthReq.redirectUri);
      new URL(pending.storedOAuthReq.clientId);
    } catch (urlError) {
      console.error("Invalid URL in stored OAuth request:", urlError);
      console.error("redirectUri:", pending.storedOAuthReq.redirectUri);
      console.error("clientId:", pending.storedOAuthReq.clientId);
      return renderErrorPage(`Invalid OAuth configuration. redirectUri or clientId is not a valid URL. Please try again.`);
    }

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: pending.storedOAuthReq as unknown as AuthRequest,
      userId: token.me,
      metadata: {
        me: token.me,
        scope: token.scope,
        authorizedAt: Date.now(),
      },
      scope: token.scope.split(" "),
      props: authProps,
    });

    // Redirect to complete the OAuth flow
    return Response.redirect(redirectTo, 302);
  } catch (error) {
    console.error("Token exchange error:", error);
    return renderErrorPage(`Failed to complete authentication: ${error}`);
  }
}

/**
 * Render an error page
 */
function renderErrorPage(message: string): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Error - Micropub MCP</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 500px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #d32f2f; }
    .error-box {
      background: #ffebee;
      border: 1px solid #ef9a9a;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
    }
    a {
      color: #4a6cf7;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Authentication Error</h1>
  <div class="error-box">
    <p>${escapeHtml(message)}</p>
  </div>
  <p><a href="/authorize">Try again</a></p>
</body>
</html>
`.trim();

  return new Response(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Build query string from OAuth request parameters
 * Used to preserve OAuth params through the login form POST
 */
function buildOAuthQueryString(oauthReq: AuthRequest): string {
  const params = new URLSearchParams();
  params.set("response_type", oauthReq.responseType);
  params.set("client_id", oauthReq.clientId);
  params.set("redirect_uri", oauthReq.redirectUri);
  params.set("state", oauthReq.state);
  if (oauthReq.scope && oauthReq.scope.length > 0) {
    params.set("scope", oauthReq.scope.join(" "));
  }
  if (oauthReq.codeChallenge) {
    params.set("code_challenge", oauthReq.codeChallenge);
  }
  if (oauthReq.codeChallengeMethod) {
    params.set("code_challenge_method", oauthReq.codeChallengeMethod);
  }
  return params.toString();
}
