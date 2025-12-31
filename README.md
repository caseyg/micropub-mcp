# Micropub MCP Server

A remote MCP (Model Context Protocol) server running on Cloudflare Workers that enables AI clients to publish content to any IndieWeb site via the [Micropub protocol](https://micropub.spec.indieweb.org/).

## Features

- **OAuth 2.1 Provider**: Acts as OAuth provider to MCP clients with automatic IndieAuth delegation
- **Full Micropub Support**: Create, update, delete posts, and upload media
- **Multiple Post Types**: Notes, articles, bookmarks, likes, reposts, replies, RSVPs, photos, videos, checkins
- **Query Capabilities**: Get post source, list categories, query syndication targets
- **Cloudflare Workers**: Serverless deployment with Durable Objects for session state
- **MCP Compatible**: Works with Claude Desktop, Cursor, and any MCP-compatible AI client

## Architecture

This server implements a dual OAuth role:
- **OAuth Provider** to MCP clients (using `@cloudflare/workers-oauth-provider`)
- **OAuth Client** to IndieAuth servers (delegating authentication to your website)

When an MCP client connects, it triggers the OAuth flow which redirects users to enter their website URL. The server then discovers and delegates to their IndieAuth provider, storing the resulting token securely encrypted.

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- A website with Micropub endpoint (WordPress with Micropub plugin, Known, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/micropub-mcp.git
cd micropub-mcp

# Install dependencies
npm install

# Create KV namespace for OAuth storage
wrangler kv namespace create OAUTH_KV
# Copy the ID into wrangler.toml

# Run locally
npm run dev
```

### Deployment

```bash
# Create production KV namespace
wrangler kv namespace create OAUTH_KV

# Update wrangler.toml with the namespace ID

# Deploy to Cloudflare Workers
npm run deploy
```

## Usage

### Connecting with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "micropub": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://micropub-mcp.your-subdomain.workers.dev/mcp"
      ]
    }
  }
}
```

### Authentication Flow

1. **Connect**: When you first use a Micropub tool, you'll be prompted to authenticate
2. **Enter your website**: A browser window opens where you enter your website URL
3. **Authorize**: You're redirected to your site's IndieAuth provider to authorize
4. **Done**: The connection is established and you can start publishing

### Creating Posts

Once authenticated, you can create various post types:

```
"Post a note saying 'Hello from my AI assistant!'"

"Create an article titled 'My Thoughts on AI' with the content..."

"Bookmark this interesting article: https://example.com/article"

"Reply to https://example.com/post saying..."

"Like this post: https://example.com/great-article"
```

## Available Tools

The server provides four consolidated tools following Anthropic's guidance on tool design:

### micropub_post

Create any type of post with a single tool. Supports:
- **note**: Short status update
- **article**: Long-form content with title
- **bookmark**: Save a URL
- **like**: Favorite/like another post
- **repost**: Share/repost content
- **reply**: Reply to another post
- **rsvp**: RSVP to an event (yes/no/maybe/interested)
- **photo**: Photo post with caption
- **video**: Video post
- **checkin**: Location checkin

### micropub_query

Query your Micropub endpoint for:
- **config**: Endpoint configuration and capabilities
- **source**: Get source/properties of a specific post
- **syndicate-to**: Available cross-posting targets
- **category**: Available categories/tags
- **contact**: Stored contacts (for person-tags)

### micropub_media

Upload media files to your media endpoint:
- Supports images, videos, audio
- Optional alt text for accessibility
- Returns URL for use in posts

### micropub_manage

Manage existing posts:
- **update**: Modify post properties (replace, add, or delete)
- **delete**: Remove a post
- **undelete**: Restore a deleted post

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

### Project Structure

```
micropub-mcp/
├── src/
│   ├── index.ts           # Worker entry point with OAuthProvider
│   ├── agent.ts           # MCP Agent class (Durable Object)
│   ├── auth-handler.ts    # IndieAuth delegation handler
│   ├── mcp-handler.ts     # MCP server info
│   ├── types.ts           # TypeScript interfaces
│   ├── lib/
│   │   ├── pkce.ts        # PKCE utilities
│   │   ├── discovery.ts   # Endpoint discovery
│   │   ├── indieauth.ts   # IndieAuth flow
│   │   └── micropub-client.ts  # Micropub API client
│   └── tools/
│       ├── index.ts           # Tool registration hub
│       ├── micropub-post.ts   # Consolidated post creation
│       ├── micropub-query.ts  # Consolidated queries
│       ├── micropub-media.ts  # Media upload
│       └── micropub-manage.ts # Post management
├── test/                  # Test files
├── wrangler.toml          # Cloudflare configuration
├── package.json
└── tsconfig.json
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Server info and discovery |
| `/mcp` | MCP Streamable HTTP transport |
| `/sse` | SSE transport |
| `/authorize` | OAuth authorization (shows login page) |
| `/token` | OAuth token endpoint |
| `/register` | Dynamic client registration |
| `/indieauth-callback` | IndieAuth callback |
| `/.well-known/oauth-authorization-server` | OAuth metadata |

## Security

- **OAuth 2.1 with PKCE**: All OAuth flows use PKCE (S256) for security
- **State Validation**: CSRF protection via state parameter verification
- **Encrypted Props**: Auth tokens stored encrypted by workers-oauth-provider
- **Scope Control**: Request only the scopes needed for your use case
- **Token Refresh**: Automatic token refresh when supported

## IndieWeb Compatibility

This server works with any website that implements:

- [Micropub](https://micropub.spec.indieweb.org/) - W3C Recommendation for posting
- [IndieAuth](https://indieauth.spec.indieweb.org/) - OAuth 2.0 extension for the IndieWeb

Compatible platforms include:
- WordPress (with Micropub and IndieAuth plugins)
- Known
- Micro.blog
- And many others

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related

- [Micropub Specification](https://micropub.spec.indieweb.org/)
- [IndieAuth Specification](https://indieauth.spec.indieweb.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
