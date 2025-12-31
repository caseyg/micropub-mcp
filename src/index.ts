/**
 * Micropub MCP Server - Cloudflare Worker Entry Point
 *
 * A remote MCP server that enables AI clients to publish content
 * to any IndieWeb site via the Micropub protocol.
 */

import { MicropubMcpAgent } from "./agent.js";
import type { Env } from "./types.js";

// Export the Durable Object class for Cloudflare
export { MicropubMcpAgent };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Streamable HTTP transport (recommended, current MCP standard)
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return MicropubMcpAgent.serve("/mcp").fetch(request, env, ctx);
    }

    // Legacy SSE transport for older clients
    if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
      return MicropubMcpAgent.serveSSE("/sse").fetch(request, env, ctx);
    }

    // OAuth callback endpoint for IndieAuth
    if (url.pathname === "/callback") {
      return handleOAuthCallback(request);
    }

    // Health check / discovery endpoint
    if (url.pathname === "/" || url.pathname === "") {
      return handleDiscovery(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

/**
 * Handle the OAuth callback after IndieAuth authorization
 *
 * Displays the authorization code for the user to copy back to the AI
 */
function handleOAuthCallback(request: Request): Response {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle error responses from authorization server
  if (error) {
    return new Response(
      `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Failed</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #d32f2f; }
    .error-box {
      background: #ffebee;
      border: 1px solid #ef9a9a;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Authorization Failed</h1>
  <div class="error-box">
    <p><strong>Error:</strong> ${escapeHtml(error)}</p>
    ${errorDescription ? `<p><strong>Description:</strong> ${escapeHtml(errorDescription)}</p>` : ""}
  </div>
  <p>Please close this window and try again with <code>micropub_auth_start</code>.</p>
</body>
</html>
    `.trim(),
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
        status: 400,
      }
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return new Response(
      `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Missing Parameters</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #d32f2f; }
  </style>
</head>
<body>
  <h1>Missing Parameters</h1>
  <p>The authorization response is missing required parameters (code or state).</p>
  <p>Please try the authorization process again.</p>
</body>
</html>
    `.trim(),
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
        status: 400,
      }
    );
  }

  // Display success page with code for user to copy
  return new Response(
    `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Complete</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: #2e7d32; }
    .success-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .code-box {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Consolas', 'Monaco', monospace;
      margin: 20px 0;
      word-break: break-all;
    }
    .code-label {
      font-weight: bold;
      color: #666;
      margin-bottom: 5px;
    }
    .code-value {
      font-size: 14px;
      user-select: all;
    }
    .instructions {
      background: #e3f2fd;
      border: 1px solid #90caf9;
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
    }
    code {
      background: #e8e8e8;
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="success-icon">&#10003;</div>
  <h1>Authorization Successful</h1>
  <p>Copy these values back to your AI assistant:</p>

  <div class="code-box">
    <div class="code-label">Code:</div>
    <div class="code-value">${escapeHtml(code)}</div>
  </div>

  <div class="code-box">
    <div class="code-label">State:</div>
    <div class="code-value">${escapeHtml(state)}</div>
  </div>

  <div class="instructions">
    <p><strong>Next step:</strong></p>
    <p>Tell your AI assistant to run <code>micropub_auth_complete</code> with the code and state values shown above.</p>
    <p>You can close this window after completing that step.</p>
  </div>
</body>
</html>
  `.trim(),
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/**
 * Handle the root discovery endpoint
 *
 * Returns server information and available endpoints
 */
function handleDiscovery(request: Request): Response {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const info = {
    name: "Micropub MCP Server",
    version: "1.0.0",
    description:
      "A remote MCP server that enables AI clients to publish content to any IndieWeb site via the Micropub protocol.",
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      sse: `${baseUrl}/sse`,
      callback: `${baseUrl}/callback`,
    },
    documentation: "https://github.com/your-username/micropub-mcp",
    protocols: {
      micropub: "https://micropub.spec.indieweb.org/",
      indieauth: "https://indieauth.spec.indieweb.org/",
      mcp: "https://modelcontextprotocol.io/",
    },
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Escape HTML special characters to prevent XSS
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
