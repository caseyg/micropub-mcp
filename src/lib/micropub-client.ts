/**
 * Micropub API client
 *
 * Implements the Micropub protocol (https://micropub.spec.indieweb.org/)
 * for creating, updating, and deleting posts
 */

import type {
  MicropubCreateRequest,
  MicropubUpdateRequest,
  MicropubDeleteRequest,
  MicropubResult,
  MicropubConfig,
} from "../types.js";

/**
 * Client for interacting with a Micropub endpoint
 */
export class MicropubClient {
  /**
   * Create a new Micropub client
   *
   * @param endpoint - The Micropub endpoint URL
   * @param accessToken - OAuth access token for authentication
   */
  constructor(
    private endpoint: string,
    private accessToken: string
  ) {}

  /**
   * Send a request to the Micropub endpoint
   */
  private async request(
    body: MicropubCreateRequest | MicropubUpdateRequest | MicropubDeleteRequest
  ): Promise<MicropubResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    // Success responses
    if (response.status === 201 || response.status === 202) {
      return {
        success: true,
        location: response.headers.get("Location") || undefined,
      };
    }

    if (response.status === 200 || response.status === 204) {
      return { success: true };
    }

    // Error handling
    let error = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as {
        error?: string;
        error_description?: string;
      };
      error = errorBody.error_description || errorBody.error || error;
    } catch {
      // JSON parsing failed, try text
      try {
        const text = await response.text();
        if (text) {
          error = text;
        }
      } catch {
        // Ignore
      }
    }

    return { success: false, error };
  }

  /**
   * Create a new entry
   *
   * @param properties - Entry properties (values will be normalized to arrays)
   * @returns Result with success status and location of created entry
   */
  async createEntry(properties: Record<string, unknown>): Promise<MicropubResult> {
    // Normalize all values to arrays (Micropub requirement)
    const normalizedProperties: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(properties)) {
      normalizedProperties[key] = Array.isArray(value) ? value : [value];
    }

    return this.request({
      type: ["h-entry"],
      properties: normalizedProperties,
    });
  }

  /**
   * Update an existing entry
   *
   * @param url - URL of the post to update
   * @param options - Update operations (replace, add, delete)
   * @returns Result with success status
   */
  async updateEntry(
    url: string,
    options: {
      replace?: Record<string, unknown>;
      add?: Record<string, unknown>;
      delete?: string[] | Record<string, unknown>;
    }
  ): Promise<MicropubResult> {
    const body: MicropubUpdateRequest = {
      action: "update",
      url,
    };

    if (options.replace) {
      body.replace = {};
      for (const [key, value] of Object.entries(options.replace)) {
        body.replace[key] = Array.isArray(value) ? (value as unknown[]) : [value];
      }
    }

    if (options.add) {
      body.add = {};
      for (const [key, value] of Object.entries(options.add)) {
        body.add[key] = Array.isArray(value) ? (value as unknown[]) : [value];
      }
    }

    if (options.delete) {
      if (Array.isArray(options.delete)) {
        body.delete = options.delete;
      } else {
        body.delete = {};
        for (const [key, value] of Object.entries(options.delete)) {
          (body.delete as Record<string, unknown[]>)[key] = Array.isArray(value)
            ? (value as unknown[])
            : [value];
        }
      }
    }

    return this.request(body);
  }

  /**
   * Delete an entry
   *
   * @param url - URL of the post to delete
   * @returns Result with success status
   */
  async deleteEntry(url: string): Promise<MicropubResult> {
    return this.request({ action: "delete", url });
  }

  /**
   * Undelete a previously deleted entry
   *
   * @param url - URL of the post to restore
   * @returns Result with success status
   */
  async undeleteEntry(url: string): Promise<MicropubResult> {
    return this.request({ action: "undelete", url });
  }

  /**
   * Query the Micropub endpoint
   *
   * @param queryType - Type of query (config, source, syndicate-to, category, etc.)
   * @param params - Additional query parameters
   * @returns Query response data
   */
  async query<T = unknown>(queryType: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", queryType);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      let error = `Query failed: HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as {
          error?: string;
          error_description?: string;
        };
        error = errorBody.error_description || errorBody.error || error;
      } catch {
        // Ignore parsing errors
      }
      throw new Error(error);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get Micropub endpoint configuration
   *
   * @returns Configuration including media endpoint, syndication targets, etc.
   */
  async getConfig(): Promise<MicropubConfig> {
    return this.query<MicropubConfig>("config");
  }

  /**
   * Get source/properties of an existing post
   *
   * @param url - URL of the post
   * @param properties - Optional array of specific properties to fetch
   * @returns Post data in microformats2 JSON format
   */
  async getSource(
    url: string,
    properties?: string[]
  ): Promise<{ type?: string[]; properties?: Record<string, unknown[]> }> {
    const params: Record<string, string> = { url };
    if (properties?.length) {
      // Some servers use properties[], others use properties
      params["properties[]"] = properties.join(",");
    }
    return this.query("source", params);
  }
}
