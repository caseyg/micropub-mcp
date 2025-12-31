/**
 * Tests for endpoint discovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  discoverEndpoints,
  extractLinkRel,
  extractHtmlLinkRel,
  resolveUrl,
} from "../src/lib/discovery";

describe("discovery utilities", () => {
  describe("extractLinkRel", () => {
    it("should extract URL from simple Link header", () => {
      const header = '<https://example.com/micropub>; rel="micropub"';
      expect(extractLinkRel(header, "micropub")).toBe("https://example.com/micropub");
    });

    it("should extract URL with unquoted rel", () => {
      const header = "<https://example.com/micropub>; rel=micropub";
      expect(extractLinkRel(header, "micropub")).toBe("https://example.com/micropub");
    });

    it("should handle multiple Link values", () => {
      const header =
        '<https://example.com/micropub>; rel="micropub", <https://example.com/auth>; rel="authorization_endpoint"';
      expect(extractLinkRel(header, "micropub")).toBe("https://example.com/micropub");
      expect(extractLinkRel(header, "authorization_endpoint")).toBe("https://example.com/auth");
    });

    it("should handle rel with multiple values", () => {
      const header = '<https://example.com/hub>; rel="hub micropub"';
      expect(extractLinkRel(header, "micropub")).toBe("https://example.com/hub");
      expect(extractLinkRel(header, "hub")).toBe("https://example.com/hub");
    });

    it("should return undefined for missing rel", () => {
      const header = '<https://example.com/micropub>; rel="micropub"';
      expect(extractLinkRel(header, "token_endpoint")).toBeUndefined();
    });

    it("should be case-insensitive for rel values", () => {
      const header = '<https://example.com/micropub>; rel="MICROPUB"';
      expect(extractLinkRel(header, "micropub")).toBe("https://example.com/micropub");
    });
  });

  describe("extractHtmlLinkRel", () => {
    it("should extract href from link element", () => {
      const html = '<link rel="micropub" href="https://example.com/micropub">';
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
    });

    it("should handle href before rel", () => {
      const html = '<link href="https://example.com/micropub" rel="micropub">';
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
    });

    it("should handle single quotes", () => {
      const html = "<link rel='micropub' href='https://example.com/micropub'>";
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
    });

    it("should find link in full HTML document", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <link rel="micropub" href="https://example.com/micropub">
          <link rel="authorization_endpoint" href="https://example.com/auth">
        </head>
        <body></body>
        </html>
      `;
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
      expect(extractHtmlLinkRel(html, "authorization_endpoint")).toBe("https://example.com/auth");
    });

    it("should return undefined for missing rel", () => {
      const html = '<link rel="micropub" href="https://example.com/micropub">';
      expect(extractHtmlLinkRel(html, "token_endpoint")).toBeUndefined();
    });

    it("should handle relative URLs", () => {
      const html = '<link rel="micropub" href="/micropub">';
      expect(extractHtmlLinkRel(html, "micropub")).toBe("/micropub");
    });

    it("should handle multiple rel values (space-separated)", () => {
      const html = '<link rel="micropub webmention" href="https://example.com/micropub">';
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
      expect(extractHtmlLinkRel(html, "webmention")).toBe("https://example.com/micropub");
    });

    it("should be case-insensitive for rel values", () => {
      const html = '<link rel="MICROPUB" href="https://example.com/micropub">';
      expect(extractHtmlLinkRel(html, "micropub")).toBe("https://example.com/micropub");
    });
  });

  describe("resolveUrl", () => {
    it("should return undefined for undefined input", () => {
      expect(resolveUrl(undefined, "https://example.com/")).toBeUndefined();
    });

    it("should resolve relative URLs", () => {
      expect(resolveUrl("/micropub", "https://example.com/")).toBe(
        "https://example.com/micropub"
      );
    });

    it("should keep absolute URLs unchanged", () => {
      expect(resolveUrl("https://api.example.com/micropub", "https://example.com/")).toBe(
        "https://api.example.com/micropub"
      );
    });

    it("should handle protocol-relative URLs", () => {
      expect(resolveUrl("//api.example.com/micropub", "https://example.com/")).toBe(
        "https://api.example.com/micropub"
      );
    });
  });

  describe("discoverEndpoints", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should discover endpoints from Link headers", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
        headers: new Headers({
          Link: '<https://example.com/micropub>; rel="micropub", <https://example.com/auth>; rel="authorization_endpoint", <https://example.com/token>; rel="token_endpoint"',
        }),
        text: () => Promise.resolve("<html></html>"),
      });

      const result = await discoverEndpoints("https://example.com");

      expect(result.me).toBe("https://example.com/");
      expect(result.micropubEndpoint).toBe("https://example.com/micropub");
      expect(result.authorizationEndpoint).toBe("https://example.com/auth");
      expect(result.tokenEndpoint).toBe("https://example.com/token");
    });

    it("should discover endpoints from HTML link elements", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
        headers: new Headers(),
        text: () =>
          Promise.resolve(`
          <html>
          <head>
            <link rel="micropub" href="https://example.com/micropub">
            <link rel="authorization_endpoint" href="https://example.com/auth">
            <link rel="token_endpoint" href="https://example.com/token">
          </head>
          </html>
        `),
      });

      const result = await discoverEndpoints("https://example.com");

      expect(result.micropubEndpoint).toBe("https://example.com/micropub");
      expect(result.authorizationEndpoint).toBe("https://example.com/auth");
      expect(result.tokenEndpoint).toBe("https://example.com/token");
    });

    it("should resolve relative URLs", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
        headers: new Headers(),
        text: () =>
          Promise.resolve(`
          <html>
          <head>
            <link rel="micropub" href="/micropub">
          </head>
          </html>
        `),
      });

      const result = await discoverEndpoints("https://example.com");

      expect(result.micropubEndpoint).toBe("https://example.com/micropub");
    });

    it("should add https:// if protocol missing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
        headers: new Headers(),
        text: () => Promise.resolve("<html></html>"),
      });

      await discoverEndpoints("example.com");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://"),
        expect.anything()
      );
    });

    it("should throw error for failed fetch", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(discoverEndpoints("https://example.com")).rejects.toThrow(
        "Failed to fetch"
      );
    });

    it("should use final URL after redirects as me", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://www.example.com/",
        headers: new Headers(),
        text: () => Promise.resolve("<html></html>"),
      });

      const result = await discoverEndpoints("https://example.com");

      expect(result.me).toBe("https://www.example.com/");
    });
  });
});
