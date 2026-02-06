# Claude Teleport Server

Docker server for receiving and managing Claude Code sessions remotely via HTTP API.

## Architecture

```
                      ┌─────────────────────────────────────────┐
                      │  Docker Container                       │
                      │                                         │
  POST /teleport ──►  │  Express Server (:8080)                │
  GET /sessions       │       │                                 │
                      │       ▼                                 │
                      │  SessionManager                         │
                      │       │                                 │
                      │       ├── GitService (clone/pull/push) │
                      │       │                                 │
                      │       └── AgentApiService               │
                      │              │                          │
                      │              ▼                          │
                      │         tmux sessions                   │
                      │         └── claude --api (:3284+)       │
                      │                                         │
                      └─────────────────────────────────────────┘
```

## Key Files

```
src/
├── index.ts                    # Express server entry point
├── logger.ts                   # Winston logger config
├── types/index.ts              # TypeScript interfaces
├── routes/
│   ├── teleport.ts             # POST /teleport endpoint
│   ├── sessions.ts             # GET/DELETE /sessions endpoints
│   └── health.ts               # Health check endpoints
└── services/
    ├── session-manager.ts      # Orchestrates session lifecycle
    ├── git-service.ts          # Git clone/pull/push operations
    └── agentapi-service.ts     # tmux + Claude API management

scripts/
├── start.sh                    # Container entrypoint
├── setup-ssh.sh                # SSH key setup helper
└── install-mcps.sh             # Pre-install common MCPs
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /teleport | Create session from repo URL + config |
| GET | /sessions | List all active sessions |
| GET | /sessions/:id | Get session details |
| DELETE | /sessions/:id | Kill a session |
| POST | /sessions/:id/push | Commit and push changes |
| GET | /health | Health check with session stats |

## Session Lifecycle

1. **POST /teleport** receives `repo_url`, `branch`, `claude_config`, `env_vars`
2. **GitService** clones or pulls the repository
3. **SessionManager** applies Claude config (MCP, settings, permissions)
4. **AgentApiService** creates tmux session, starts `claude --api`
5. **AgentAPI** (port 3284+) available for message/event streaming
6. **DELETE /sessions/:id** kills tmux session, releases port

## Port Allocation

- **8080**: Teleport API (Express server)
- **2222**: SSH (mapped from container port 22)
- **3284-3300**: AgentAPI ports (one per session)

## Config Application

Claude config from `/teleport` request is written to `.claude/` in the work directory:
- `mcp.json` - MCP server configuration
- `settings.json` - Claude settings and permissions

## Environment Variables

```bash
ANTHROPIC_API_KEY     # Required: Anthropic API key
TELEPORT_PORT=8080    # API server port
AGENTAPI_BASE_PORT=3284
MAX_SESSIONS=16       # Concurrent session limit
SESSION_TIMEOUT_HOURS=24
LOG_LEVEL=info        # debug, info, warn, error
DATA_DIR=/claude-data
PROJECTS_DIR=/projects
```

## Development Commands

```bash
npm run dev       # Watch mode with tsx
npm run build     # Compile TypeScript
npm run lint      # ESLint
npm run typecheck # Type check without emit

# Docker
docker compose build
docker compose up -d
docker compose logs -f
```

## Testing API

```bash
# Create session
curl -X POST localhost:8080/teleport \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/user/repo.git"}'

# List sessions
curl localhost:8080/sessions

# Kill session
curl -X DELETE localhost:8080/sessions/<id>

# Health check
curl localhost:8080/health
```

## Volumes

- **/claude-data**: Persistent config (~/.claude, ~/.config/gh, ~/.ssh)
- **/projects**: Git repositories

## Request/Response Schemas

### POST /teleport Request
```typescript
{
  repo_url: string;           // Git clone URL (required)
  branch?: string;            // Branch to checkout (default: main)
  claude_config?: {
    mcp?: { mcpServers: Record<string, McpServerConfig> };
    settings?: Record<string, unknown>;
    permissions?: { allow?: string[]; deny?: string[] };
  };
  env_vars?: Record<string, string>;
  initial_prompt?: string;    // First message to send to Claude
}
```

### POST /teleport Response
```typescript
{
  session_id: string;
  agent_port: number;         // AgentAPI port (3284+)
  status: 'starting' | 'running' | 'stable' | 'error' | 'stopped';
  work_dir: string;           // Path to cloned repo
}
```

## Roadmap

### Phase 1: Core Container (MVP) ← CURRENT
- [x] Dockerfile with all dependencies
- [x] Express API (teleport, sessions, health)
- [x] Session management (tmux + port allocation)
- [x] Git clone/pull/push
- [x] SSH access for CLI auth
- [ ] Test Docker build and run
- [ ] Verify Claude API mode works

### Phase 2: Enhanced Features
- [ ] Conversation history preservation
- [ ] MCP configuration per-session
- [ ] Git push on session end
- [ ] Web UI for session management

### Phase 3: Client CLI
- [ ] `claude-teleport send` - send current session to server
- [ ] `claude-teleport attach` - connect to remote session
- [ ] `claude-teleport pull` - pull session back to local

## Current Status

**Phase 1 MVP built, not yet tested.** Next step: `npm install && npm run build && docker compose build`

## Known Limitations

- No authentication (relies on network security/VPN)
- Claude `--api` mode is placeholder (needs actual AgentAPI binary or different approach)
- Single container, multiple sessions via tmux (not k8s pods)

## Open Questions

1. **Claude API mode**: Does `claude --api` exist? May need to use headless mode or different approach
2. **Max sessions**: 16 default - resource limits per session TBD
3. **Session timeout**: Auto-kill after 24h idle - configurable via env var
