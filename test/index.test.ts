/**
 * Tests for Worker helper functions
 *
 * Note: Full integration tests with Durable Objects require
 * the complete Cloudflare Workers test environment.
 * These tests focus on the callback and discovery handler logic.
 */

import { describe, it, expect } from "vitest";

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

/**
 * Handle the OAuth callback after IndieAuth authorization
 * (extracted logic for testing)
 */
function handleOAuthCallback(searchParams: URLSearchParams): {
  status: number;
  body: string;
  isError: boolean;
} {
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return {
      status: 400,
      body: `Authorization Failed: ${escapeHtml(error)}${
        errorDescription ? ` - ${escapeHtml(errorDescription)}` : ""
      }`,
      isError: true,
    };
  }

  if (!code || !state) {
    return {
      status: 400,
      body: "Missing Parameters: code or state not provided",
      isError: true,
    };
  }

  return {
    status: 200,
    body: `Authorization Successful. Code: ${escapeHtml(code)}, State: ${escapeHtml(state)}`,
    isError: false,
  };
}

/**
 * Build discovery response
 * (extracted logic for testing)
 */
function buildDiscoveryResponse(baseUrl: string): object {
  return {
    name: "Micropub MCP Server",
    version: "1.0.0",
    description:
      "A remote MCP server that enables AI clients to publish content to any IndieWeb site via the Micropub protocol.",
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      sse: `${baseUrl}/sse`,
      callback: `${baseUrl}/callback`,
    },
  };
}

describe("escapeHtml", () => {
  it("should escape & character", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("should escape < and > characters", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("should escape quote characters", () => {
    expect(escapeHtml('"hello\' world')).toBe("&quot;hello&#39; world");
  });

  it("should escape all special characters together", () => {
    expect(escapeHtml('<a href="x">foo & bar</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;foo &amp; bar&lt;/a&gt;"
    );
  });

  it("should not modify safe strings", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});

describe("handleOAuthCallback", () => {
  it("should return success with code and state", () => {
    const params = new URLSearchParams({ code: "auth123", state: "state456" });
    const result = handleOAuthCallback(params);

    expect(result.status).toBe(200);
    expect(result.isError).toBe(false);
    expect(result.body).toContain("auth123");
    expect(result.body).toContain("state456");
  });

  it("should return error when error parameter present", () => {
    const params = new URLSearchParams({
      error: "access_denied",
      error_description: "User denied access",
    });
    const result = handleOAuthCallback(params);

    expect(result.status).toBe(400);
    expect(result.isError).toBe(true);
    expect(result.body).toContain("access_denied");
    expect(result.body).toContain("User denied access");
  });

  it("should return error when code is missing", () => {
    const params = new URLSearchParams({ state: "state456" });
    const result = handleOAuthCallback(params);

    expect(result.status).toBe(400);
    expect(result.isError).toBe(true);
    expect(result.body).toContain("Missing Parameters");
  });

  it("should return error when state is missing", () => {
    const params = new URLSearchParams({ code: "auth123" });
    const result = handleOAuthCallback(params);

    expect(result.status).toBe(400);
    expect(result.isError).toBe(true);
    expect(result.body).toContain("Missing Parameters");
  });

  it("should escape HTML in code and state", () => {
    const params = new URLSearchParams({
      code: "<script>alert(1)</script>",
      state: "<b>test</b>",
    });
    const result = handleOAuthCallback(params);

    expect(result.body).not.toContain("<script>");
    expect(result.body).toContain("&lt;script&gt;");
    expect(result.body).toContain("&lt;b&gt;");
  });

  it("should escape HTML in error messages", () => {
    const params = new URLSearchParams({
      error: "<script>alert(1)</script>",
      error_description: "<b>Bad</b>",
    });
    const result = handleOAuthCallback(params);

    expect(result.body).not.toContain("<script>");
    expect(result.body).toContain("&lt;script&gt;");
    expect(result.body).toContain("&lt;b&gt;");
  });
});

describe("buildDiscoveryResponse", () => {
  it("should return server info with correct name and version", () => {
    const response = buildDiscoveryResponse("https://example.com");

    expect(response).toHaveProperty("name", "Micropub MCP Server");
    expect(response).toHaveProperty("version", "1.0.0");
  });

  it("should include all endpoint URLs", () => {
    const response = buildDiscoveryResponse("https://example.com") as {
      endpoints: Record<string, string>;
    };

    expect(response.endpoints.mcp).toBe("https://example.com/mcp");
    expect(response.endpoints.sse).toBe("https://example.com/sse");
    expect(response.endpoints.callback).toBe("https://example.com/callback");
  });

  it("should handle base URLs without trailing slash", () => {
    const response = buildDiscoveryResponse("https://api.example.com") as {
      endpoints: Record<string, string>;
    };

    expect(response.endpoints.mcp).toBe("https://api.example.com/mcp");
  });
});
