/**
 * Tests for IndieAuth flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from "../src/lib/indieauth";

describe("IndieAuth", () => {
  describe("buildAuthorizationUrl", () => {
    it("should build a valid authorization URL", () => {
      const url = buildAuthorizationUrl("https://auth.example.com/authorize", {
        clientId: "https://myapp.example.com/",
        redirectUri: "https://myapp.example.com/callback",
        me: "https://user.example.com/",
        scope: "create update delete",
        state: "abc123",
        codeChallenge: "xyz789",
      });

      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe("https://auth.example.com/authorize");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("client_id")).toBe("https://myapp.example.com/");
      expect(parsed.searchParams.get("redirect_uri")).toBe("https://myapp.example.com/callback");
      expect(parsed.searchParams.get("me")).toBe("https://user.example.com/");
      expect(parsed.searchParams.get("scope")).toBe("create update delete");
      expect(parsed.searchParams.get("state")).toBe("abc123");
      expect(parsed.searchParams.get("code_challenge")).toBe("xyz789");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("should handle existing query parameters in endpoint", () => {
      const url = buildAuthorizationUrl("https://auth.example.com/authorize?existing=param", {
        clientId: "https://myapp.example.com/",
        redirectUri: "https://myapp.example.com/callback",
        me: "https://user.example.com/",
        scope: "create",
        state: "abc",
        codeChallenge: "xyz",
      });

      const parsed = new URL(url);
      expect(parsed.searchParams.get("existing")).toBe("param");
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });
  });

  describe("exchangeCodeForToken", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should exchange code for token successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "test-token",
            token_type: "Bearer",
            scope: "create update delete",
            me: "https://user.example.com/",
          }),
      });

      const result = await exchangeCodeForToken("https://auth.example.com/token", {
        code: "auth-code",
        clientId: "https://myapp.example.com/",
        redirectUri: "https://myapp.example.com/callback",
        codeVerifier: "verifier123",
      });

      expect(result.access_token).toBe("test-token");
      expect(result.token_type).toBe("Bearer");
      expect(result.scope).toBe("create update delete");
      expect(result.me).toBe("https://user.example.com/");

      // Verify request format
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://auth.example.com/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
    });

    it("should include optional fields if present", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "test-token",
            token_type: "Bearer",
            scope: "create",
            me: "https://user.example.com/",
            expires_in: 3600,
            refresh_token: "refresh-token",
          }),
      });

      const result = await exchangeCodeForToken("https://auth.example.com/token", {
        code: "auth-code",
        clientId: "https://myapp.example.com/",
        redirectUri: "https://myapp.example.com/callback",
        codeVerifier: "verifier123",
      });

      expect(result.expires_in).toBe(3600);
      expect(result.refresh_token).toBe("refresh-token");
    });

    it("should throw error on HTTP error response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_grant",
            error_description: "The authorization code has expired",
          }),
      });

      await expect(
        exchangeCodeForToken("https://auth.example.com/token", {
          code: "expired-code",
          clientId: "https://myapp.example.com/",
          redirectUri: "https://myapp.example.com/callback",
          codeVerifier: "verifier123",
        })
      ).rejects.toThrow("The authorization code has expired");
    });

    it("should throw error if access_token missing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            token_type: "Bearer",
            scope: "create",
            me: "https://user.example.com/",
          }),
      });

      await expect(
        exchangeCodeForToken("https://auth.example.com/token", {
          code: "auth-code",
          clientId: "https://myapp.example.com/",
          redirectUri: "https://myapp.example.com/callback",
          codeVerifier: "verifier123",
        })
      ).rejects.toThrow("missing access_token");
    });

    it("should throw error if me missing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "test-token",
            token_type: "Bearer",
            scope: "create",
          }),
      });

      await expect(
        exchangeCodeForToken("https://auth.example.com/token", {
          code: "auth-code",
          clientId: "https://myapp.example.com/",
          redirectUri: "https://myapp.example.com/callback",
          codeVerifier: "verifier123",
        })
      ).rejects.toThrow("missing me");
    });
  });

  describe("refreshAccessToken", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should refresh token successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-token",
            token_type: "Bearer",
            scope: "create update",
            me: "https://user.example.com/",
            expires_in: 7200,
            refresh_token: "new-refresh-token",
          }),
      });

      const result = await refreshAccessToken("https://auth.example.com/token", {
        refreshToken: "old-refresh-token",
        clientId: "https://myapp.example.com/",
      });

      expect(result.access_token).toBe("new-token");
      expect(result.refresh_token).toBe("new-refresh-token");

      // Verify request format
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://auth.example.com/token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("grant_type=refresh_token"),
        })
      );
    });

    it("should throw error on failed refresh", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_grant",
            error_description: "Refresh token expired",
          }),
      });

      await expect(
        refreshAccessToken("https://auth.example.com/token", {
          refreshToken: "expired-token",
          clientId: "https://myapp.example.com/",
        })
      ).rejects.toThrow("Refresh token expired");
    });
  });
});
