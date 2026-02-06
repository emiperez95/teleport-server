# Claude Teleport Server

A Docker server for receiving and managing Claude Code sessions remotely. Send code, config, and MCPs from any machine and control sessions via HTTP API.

## Quick Start

```bash
# Build
docker compose build

# Run (provide your API key)
ANTHROPIC_API_KEY=sk-... docker compose up -d

# Check status
curl http://localhost:8080/health
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  claude-teleport-server (Docker Container)                      │
│                                                                 │
│  Teleport API (:8080)        AgentAPI (:3284+ per session)     │
│  └─ /teleport (POST)         └─ /message, /events, /status     │
│  └─ /sessions (GET/DELETE)                                     │
│                                                                 │
│  Claude Code + MCPs + CLIs (gh, jira, aws)                     │
│  Running in tmux sessions                                       │
│                                                                 │
│  SSH (:2222) - for manual CLI auth (gh auth, etc.)             │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### POST /teleport

Send a new Claude session to the server.

```bash
curl -X POST http://localhost:8080/teleport \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "branch": "main",
    "claude_config": {
      "mcp": {
        "mcpServers": {
          "filesystem": {
            "command": "npx",
            "args": ["@anthropic-ai/mcp-server-filesystem", "/projects"]
          }
        }
      }
    },
    "env_vars": {
      "MY_VAR": "value"
    }
  }'
```

Response:
```json
{
  "session_id": "abc-123",
  "agent_port": 3284,
  "status": "running",
  "work_dir": "/projects/user-repo"
}
```

### GET /sessions

List all active sessions.

```bash
curl http://localhost:8080/sessions
```

### GET /sessions/:id

Get details of a specific session.

```bash
curl http://localhost:8080/sessions/abc-123
```

### DELETE /sessions/:id

Kill a session.

```bash
curl -X DELETE http://localhost:8080/sessions/abc-123
```

### POST /sessions/:id/push

Commit and push changes from a session.

```bash
curl -X POST http://localhost:8080/sessions/abc-123/push \
  -H "Content-Type: application/json" \
  -d '{"message": "feat: implement feature X"}'
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:8080/health
```

## Interacting with Claude

Once a session is created, use the AgentAPI port to communicate:

```bash
# Send a message to Claude
curl -X POST http://localhost:3284/message \
  -H "Content-Type: application/json" \
  -d '{"message": "List the files in the project"}'

# Stream events (SSE)
curl http://localhost:3284/events

# Check status
curl http://localhost:3284/status
```

## SSH Access

For manual CLI setup (gh auth, jira config, etc.):

```bash
# Default password is randomly generated - check container logs
ssh claude@localhost -p 2222

# Inside container
gh auth login
jira init
```

For key-based auth, add your public key:
```bash
docker exec -it claude-teleport-server bash -c \
  'echo "YOUR_PUBLIC_KEY" >> /claude-data/.ssh/authorized_keys'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `TELEPORT_PORT` | 8080 | Teleport API port |
| `AGENTAPI_BASE_PORT` | 3284 | Starting port for AgentAPI |
| `MAX_SESSIONS` | 16 | Maximum concurrent sessions |
| `SESSION_TIMEOUT_HOURS` | 24 | Auto-kill idle sessions |
| `LOG_LEVEL` | info | Log level (debug, info, warn, error) |

## Volumes

| Volume | Path | Purpose |
|--------|------|---------|
| claude-data | /claude-data | Persistent config (~/.claude, ~/.config/gh) |
| projects | /projects | Git repositories |

## Development

```bash
# Install dependencies
npm install

# Run locally (outside Docker)
npm run dev

# Build TypeScript
npm run build

# Lint
npm run lint
```

## Included Tools

- **Claude Code CLI** - The main Claude Code agent
- **GitHub CLI** (gh) - GitHub operations
- **Jira CLI** - Jira ticket management
- **AWS CLI** - AWS operations
- **git** - Version control
- **tmux** - Session management

## Future Phases

- **Phase 2**: Conversation history preservation, MCP config per-session, web UI
- **Phase 3**: Client CLI (`claude-teleport send/attach/pull`)

## License

MIT
