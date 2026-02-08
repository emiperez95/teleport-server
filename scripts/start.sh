#!/bin/bash
# Container entrypoint script
# Starts SSH daemon and Teleport API server

set -e

echo "=== Claude Teleport Server Starting ==="

# Ensure correct ownership of data directories
chown -R claude:claude /claude-data /projects 2>/dev/null || true

# Source persistent env vars (API keys, etc.) from volume
if [ -f /claude-data/.env ]; then
  set -a
  . /claude-data/.env
  set +a
  # Also make available to claude user's shell
  cp /claude-data/.env /home/claude/.env
  echo '[ -f ~/.env ] && . ~/.env' >> /home/claude/.bashrc
  chown claude:claude /home/claude/.env
fi

# Mark all directories as safe for git (needed when volumes persist across runs)
git config --global --add safe.directory '*'

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

# Pre-seed Claude onboarding state to skip theme picker / login wizard
# Store on volume, symlink into home
if [ ! -f /claude-data/.claude.json ]; then
    echo '{"hasCompletedOnboarding":true,"theme":"dark"}' > /claude-data/.claude.json
    chown claude:claude /claude-data/.claude.json
    echo "Pre-seeded Claude onboarding config"
fi
ln -sf /claude-data/.claude.json /home/claude/.claude.json

# Start Teleport API server
echo "Starting Teleport API server on port ${TELEPORT_PORT:-8080}..."
exec node /app/dist/index.js
