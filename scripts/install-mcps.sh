#!/bin/bash
# Pre-install common MCP servers
# These will be available to all sessions; enable per-session via config

set -e

echo "Installing common MCP servers..."

# Install as the claude user
su - claude << 'EOF'
# Filesystem MCP
npm install -g @anthropic-ai/mcp-server-filesystem 2>/dev/null || echo "Filesystem MCP not available"

# Git MCP
npm install -g @anthropic-ai/mcp-server-git 2>/dev/null || echo "Git MCP not available"

# Fetch MCP (for web requests)
npm install -g @anthropic-ai/mcp-server-fetch 2>/dev/null || echo "Fetch MCP not available"

# Sequential thinking MCP
npm install -g @anthropic-ai/mcp-server-sequential-thinking 2>/dev/null || echo "Sequential thinking MCP not available"

# Memory MCP
npm install -g @anthropic-ai/mcp-server-memory 2>/dev/null || echo "Memory MCP not available"

echo "MCP installation complete"
EOF
