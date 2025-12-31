# Micropub MCP Server

A remote MCP (Model Context Protocol) server running on Cloudflare Workers that enables AI clients to publish content to any IndieWeb site via the [Micropub protocol](https://micropub.spec.indieweb.org/).

## Features

- **IndieAuth Authentication**: Secure OAuth 2.0 authentication with PKCE support
- **Full Micropub Support**: Create, update, delete posts, and upload media
- **Multiple Post Types**: Notes, articles, bookmarks, likes, reposts, replies, RSVPs
- **Query Capabilities**: Get post source, list categories, query syndication targets
- **Cloudflare Workers**: Serverless deployment with Durable Objects for session state
- **MCP Compatible**: Works with Claude Desktop, Cursor, and any MCP-compatible AI client

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

# Run locally
npm run dev
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

After deployment, update the `CLIENT_ID` and `REDIRECT_URI` environment variables to match your deployed URL:

```bash
# Set via wrangler secrets (recommended for production)
wrangler secret put CLIENT_ID
# Enter: https://your-worker.workers.dev/

wrangler secret put REDIRECT_URI
# Enter: https://your-worker.workers.dev/callback
```

Or configure in `wrangler.toml`:

```toml
[vars]
CLIENT_ID = "https://micropub-mcp.your-subdomain.workers.dev/"
REDIRECT_URI = "https://micropub-mcp.your-subdomain.workers.dev/callback"
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

1. **Discover endpoints**: Ask the AI to discover your site's Micropub endpoints:
   ```
   "Discover Micropub endpoints for example.com"
   ```

2. **Start authentication**: The AI will provide an authorization URL:
   ```
   "Authenticate with example.com"
   ```

3. **Complete in browser**: Visit the URL, authorize access, and copy the code/state

4. **Finish authentication**: Provide the code and state to complete:
   ```
   "Complete authentication with code: XXX and state: YYY"
   ```

### Creating Posts

Once authenticated, you can create various post types:

```
"Post a note saying 'Hello from my AI assistant!'"

"Create an article titled 'My Thoughts on AI' with the content..."

"Bookmark this interesting article: https://example.com/article"

"Reply to https://example.com/post saying..."
```

## Available Tools

### Authentication

| Tool | Description |
|------|-------------|
| `micropub_discover` | Discover Micropub/IndieAuth endpoints for a website |
| `micropub_auth_start` | Start OAuth flow, returns authorization URL |
| `micropub_auth_complete` | Exchange authorization code for access token |
| `micropub_auth_status` | Check current authentication status |
| `micropub_logout` | Clear session and disconnect |

### Post Creation

| Tool | Description |
|------|-------------|
| `micropub_create_note` | Create a short note (like a tweet) |
| `micropub_create_article` | Create a long-form article with title |
| `micropub_create_bookmark` | Save a URL as a bookmark |
| `micropub_create_like` | Create a like/favorite |
| `micropub_create_repost` | Repost/share another post |
| `micropub_create_rsvp` | RSVP to an event |
| `micropub_create_photo` | Create a photo post |
| `micropub_create_video` | Create a video post |

### Post Management

| Tool | Description |
|------|-------------|
| `micropub_update_post` | Update an existing post |
| `micropub_delete_post` | Delete a post |
| `micropub_undelete_post` | Restore a deleted post |

### Queries

| Tool | Description |
|------|-------------|
| `micropub_query_config` | Get endpoint configuration |
| `micropub_get_source` | Get source/properties of a post |
| `micropub_list_posts` | List recent posts |
| `micropub_get_categories` | Get available categories/tags |
| `micropub_get_syndication_targets` | Get cross-posting targets |

### Media

| Tool | Description |
|------|-------------|
| `micropub_upload_media` | Upload a file to the media endpoint |

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
│   ├── index.ts           # Worker entry point
│   ├── agent.ts           # MCP Agent class (Durable Object)
│   ├── types.ts           # TypeScript interfaces
│   ├── lib/
│   │   ├── pkce.ts        # PKCE utilities
│   │   ├── discovery.ts   # Endpoint discovery
│   │   ├── indieauth.ts   # IndieAuth flow
│   │   └── micropub-client.ts  # Micropub API client
│   └── tools/
│       ├── index.ts       # Tool registration hub
│       ├── auth.ts        # Authentication tools
│       ├── posts.ts       # Post creation tools
│       ├── query.ts       # Query tools
│       └── media.ts       # Media upload tools
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
| `/sse` | Legacy SSE transport |
| `/callback` | OAuth callback for IndieAuth |

## Security

- **PKCE Required**: All OAuth flows use PKCE (S256) for security
- **State Validation**: CSRF protection via state parameter verification
- **Token Storage**: Tokens stored in Durable Object storage (encrypted at rest)
- **Scope Control**: Request only the scopes needed for your use case

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
