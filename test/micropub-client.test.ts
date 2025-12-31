/**
 * Tests for Micropub client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MicropubClient } from "../src/lib/micropub-client";

describe("MicropubClient", () => {
  const originalFetch = globalThis.fetch;
  let client: MicropubClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new MicropubClient("https://example.com/micropub", "test-token");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createEntry", () => {
    it("should create an entry and return location", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 201,
        headers: new Headers({
          Location: "https://example.com/posts/123",
        }),
      });

      const result = await client.createEntry({
        content: "Hello world!",
        category: ["test", "greeting"],
      });

      expect(result.success).toBe(true);
      expect(result.location).toBe("https://example.com/posts/123");

      // Verify request format
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.com/micropub",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
        })
      );

      // Verify body structure
      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.type).toEqual(["h-entry"]);
      expect(body.properties.content).toEqual(["Hello world!"]);
      expect(body.properties.category).toEqual(["test", "greeting"]);
    });

    it("should normalize non-array values to arrays", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 201,
        headers: new Headers({
          Location: "https://example.com/posts/123",
        }),
      });

      await client.createEntry({
        content: "Test",
        name: "Article Title",
      });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.properties.content).toEqual(["Test"]);
      expect(body.properties.name).toEqual(["Article Title"]);
    });

    it("should handle 202 Accepted response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 202,
        headers: new Headers({
          Location: "https://example.com/posts/pending/123",
        }),
      });

      const result = await client.createEntry({ content: "Test" });

      expect(result.success).toBe(true);
      expect(result.location).toBe("https://example.com/posts/pending/123");
    });

    it("should handle error responses", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_request",
            error_description: "Missing required field: content",
          }),
      });

      const result = await client.createEntry({});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing required field: content");
    });

    it("should handle error without description", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        json: () =>
          Promise.resolve({
            error: "unauthorized",
          }),
      });

      const result = await client.createEntry({ content: "Test" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("unauthorized");
    });
  });

  describe("updateEntry", () => {
    it("should update entry with replace operation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      const result = await client.updateEntry("https://example.com/posts/123", {
        replace: { content: "Updated content" },
      });

      expect(result.success).toBe(true);

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.action).toBe("update");
      expect(body.url).toBe("https://example.com/posts/123");
      expect(body.replace.content).toEqual(["Updated content"]);
    });

    it("should update entry with add operation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      await client.updateEntry("https://example.com/posts/123", {
        add: { category: ["new-tag"] },
      });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.add.category).toEqual(["new-tag"]);
    });

    it("should update entry with delete array operation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      await client.updateEntry("https://example.com/posts/123", {
        delete: ["category"],
      });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.delete).toEqual(["category"]);
    });

    it("should update entry with delete object operation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      await client.updateEntry("https://example.com/posts/123", {
        delete: { category: ["old-tag"] },
      });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.delete.category).toEqual(["old-tag"]);
    });

    it("should handle 204 No Content response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 204,
      });

      const result = await client.updateEntry("https://example.com/posts/123", {
        replace: { content: "Updated" },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("deleteEntry", () => {
    it("should delete entry successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      const result = await client.deleteEntry("https://example.com/posts/123");

      expect(result.success).toBe(true);

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.action).toBe("delete");
      expect(body.url).toBe("https://example.com/posts/123");
    });

    it("should handle delete failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 404,
        json: () =>
          Promise.resolve({
            error: "not_found",
            error_description: "Post not found",
          }),
      });

      const result = await client.deleteEntry("https://example.com/posts/999");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Post not found");
    });
  });

  describe("undeleteEntry", () => {
    it("should undelete entry successfully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
      });

      const result = await client.undeleteEntry("https://example.com/posts/123");

      expect(result.success).toBe(true);

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.action).toBe("undelete");
    });
  });

  describe("query", () => {
    it("should query config", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            "media-endpoint": "https://example.com/media",
            "syndicate-to": [{ uid: "twitter", name: "Twitter" }],
          }),
      });

      const result = await client.query<{
        "media-endpoint": string;
        "syndicate-to": Array<{ uid: string; name: string }>;
      }>("config");

      expect(result["media-endpoint"]).toBe("https://example.com/media");
      expect(result["syndicate-to"]).toHaveLength(1);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.com/micropub?q=config",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should query with additional parameters", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            type: ["h-entry"],
            properties: { content: ["Test"] },
          }),
      });

      await client.query("source", { url: "https://example.com/posts/123" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.com/micropub?q=source&url=https%3A%2F%2Fexample.com%2Fposts%2F123",
        expect.anything()
      );
    });

    it("should throw error on failed query", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_request",
            error_description: "Query not supported",
          }),
      });

      await expect(client.query("unsupported")).rejects.toThrow("Query not supported");
    });
  });

  describe("getConfig", () => {
    it("should get config", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            "media-endpoint": "https://example.com/media",
          }),
      });

      const config = await client.getConfig();

      expect(config["media-endpoint"]).toBe("https://example.com/media");
    });
  });

  describe("getSource", () => {
    it("should get source without properties filter", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            type: ["h-entry"],
            properties: {
              content: ["Test content"],
              category: ["tag1", "tag2"],
            },
          }),
      });

      const source = await client.getSource("https://example.com/posts/123");

      expect(source.properties?.content).toEqual(["Test content"]);
    });

    it("should get source with properties filter", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            properties: {
              content: ["Test content"],
            },
          }),
      });

      await client.getSource("https://example.com/posts/123", ["content"]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("properties%5B%5D=content"),
        expect.anything()
      );
    });
  });
});
