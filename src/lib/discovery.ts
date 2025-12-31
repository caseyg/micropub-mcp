/**
 * Micropub and IndieAuth endpoint discovery
 *
 * Discovers endpoints via:
 * 1. Link HTTP headers
 * 2. HTML <link> elements
 * 3. IndieAuth metadata endpoint
 */

import type { DiscoveryResult } from "../types.js";

/**
 * Discover Micropub and IndieAuth endpoints for a website
 *
 * @param websiteUrl - The website URL to discover endpoints for
 * @returns Discovery result with all found endpoints
 * @throws Error if the website cannot be fetched
 */
export async function discoverEndpoints(websiteUrl: string): Promise<DiscoveryResult> {
  // Normalize URL
  let url = websiteUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  // Ensure trailing slash for canonical form
  if (!url.endsWith("/") && !url.includes("?") && !url.split("/").pop()?.includes(".")) {
    url += "/";
  }

  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  // Use final URL after redirects as canonical "me"
  const canonicalUrl = response.url;
  const result: DiscoveryResult = { me: canonicalUrl };

  // Check Link headers first (highest priority per spec)
  const linkHeader = response.headers.get("Link");
  let metadataUrl: string | undefined;

  if (linkHeader) {
    // Per IndieAuth spec, check for indieauth-metadata first (primary method)
    metadataUrl = extractLinkRel(linkHeader, "indieauth-metadata");
    // Also extract legacy endpoints from Link header (backwards compatibility)
    result.micropubEndpoint = extractLinkRel(linkHeader, "micropub");
    result.authorizationEndpoint = extractLinkRel(linkHeader, "authorization_endpoint");
    result.tokenEndpoint = extractLinkRel(linkHeader, "token_endpoint");
  }

  // Parse HTML for link elements
  const html = await response.text();

  // Check HTML for indieauth-metadata if not found in Link header
  if (!metadataUrl) {
    metadataUrl = extractHtmlLinkRel(html, "indieauth-metadata");
  }

  // Fallback to legacy HTML link elements for backwards compatibility
  if (!result.micropubEndpoint) {
    result.micropubEndpoint = extractHtmlLinkRel(html, "micropub");
  }
  if (!result.authorizationEndpoint) {
    result.authorizationEndpoint = extractHtmlLinkRel(html, "authorization_endpoint");
  }
  if (!result.tokenEndpoint) {
    result.tokenEndpoint = extractHtmlLinkRel(html, "token_endpoint");
  }

  // Fetch IndieAuth metadata endpoint (primary discovery method per spec)
  // This overrides any legacy endpoints found above
  if (metadataUrl) {
    try {
      const metadata = await fetchIndieAuthMetadata(resolveUrl(metadataUrl, canonicalUrl)!);
      if (metadata.authorization_endpoint) {
        result.authorizationEndpoint = metadata.authorization_endpoint;
      }
      if (metadata.token_endpoint) {
        result.tokenEndpoint = metadata.token_endpoint;
      }
    } catch {
      // Metadata fetch failed, continue with HTML-discovered endpoints
    }
  }

  // Resolve relative URLs to absolute
  result.micropubEndpoint = resolveUrl(result.micropubEndpoint, canonicalUrl);
  result.authorizationEndpoint = resolveUrl(result.authorizationEndpoint, canonicalUrl);
  result.tokenEndpoint = resolveUrl(result.tokenEndpoint, canonicalUrl);

  return result;
}

/**
 * Fetch IndieAuth metadata from a metadata endpoint
 */
async function fetchIndieAuthMetadata(
  url: string
): Promise<{ authorization_endpoint?: string; token_endpoint?: string }> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch IndieAuth metadata: ${response.status}`);
  }

  return response.json() as Promise<{ authorization_endpoint?: string; token_endpoint?: string }>;
}

/**
 * Extract a URL from a Link header by rel value
 *
 * @param header - The Link header value
 * @param rel - The rel value to look for
 * @returns The URL if found, undefined otherwise
 */
export function extractLinkRel(header: string, rel: string): string | undefined {
  // Parse Link header format: <url>; rel="value", <url2>; rel="value2"
  const links = header.split(",");

  for (const link of links) {
    const parts = link.trim().split(";");
    if (parts.length < 2) continue;

    // Extract URL from angle brackets
    const urlMatch = parts[0].match(/<([^>]+)>/);
    if (!urlMatch) continue;

    // Check rel parameter
    const relPart = parts.find((p) => p.trim().toLowerCase().startsWith("rel="));
    if (!relPart) continue;

    // rel can be quoted or unquoted, and may contain multiple space-separated values
    const relValue = relPart.replace(/^.*rel=["']?([^"']+)["']?.*$/i, "$1").toLowerCase();
    const relValues = relValue.split(/\s+/);

    if (relValues.includes(rel.toLowerCase())) {
      return urlMatch[1];
    }
  }

  return undefined;
}

/**
 * Extract a URL from an HTML <link> element by rel value
 *
 * @param html - The HTML content
 * @param rel - The rel value to look for
 * @returns The href value if found, undefined otherwise
 */
export function extractHtmlLinkRel(html: string, rel: string): string | undefined {
  // Match <link> elements with the specified rel
  // Handle both rel="..." href="..." and href="..." rel="..." orders
  const regex = new RegExp(
    `<link[^>]+(?:rel=["']${escapeRegex(rel)}["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+rel=["']${escapeRegex(rel)}["'])`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] || match?.[2];
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve a potentially relative URL against a base URL
 *
 * @param url - The URL to resolve (may be relative or absolute)
 * @param base - The base URL
 * @returns The resolved absolute URL, or undefined if url is undefined
 */
export function resolveUrl(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}
