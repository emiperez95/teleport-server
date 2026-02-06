#!/bin/bash
# Container entrypoint script
# Starts SSH daemon and Teleport API server

set -e

echo "=== Claude Teleport Server Starting ==="

# Ensure correct ownership of data directories
chown -R claude:claude /claude-data /projects 2>/dev/null || true

# Start SSH daemon
echo "Starting SSH daemon..."
/usr/sbin/sshd

# Initialize tmux server
echo "Starting tmux server..."
su - claude -c "tmux start-server" 2>/dev/null || true

# Verify Claude Code is installed
if ! command -v claude &> /dev/null; then
    echo "ERROR: Claude Code CLI not found"
    exit 1
fi
echo "Claude Code version: $(claude --version 2>/dev/null || echo 'unknown')"

# Start Teleport API server
echo "Starting Teleport API server on port ${TELEPORT_PORT:-8080}..."
exec node /app/dist/index.js
