#!/bin/bash
# Setup SSH keys for the claude user
# Run this after first container start to configure SSH access

set -e

SSH_DIR="/claude-data/.ssh"
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# Generate host keys if they don't exist
if [ ! -f "$SSH_DIR/authorized_keys" ]; then
    touch "$SSH_DIR/authorized_keys"
    chmod 600 "$SSH_DIR/authorized_keys"
    echo "Created authorized_keys file. Add your public key:"
    echo "  docker exec -it claude-teleport-server bash -c 'echo \"YOUR_PUBLIC_KEY\" >> /claude-data/.ssh/authorized_keys'"
fi

# Set password for claude user (for initial setup)
# In production, disable password auth and use keys only
if [ -n "$CLAUDE_PASSWORD" ]; then
    echo "claude:$CLAUDE_PASSWORD" | chpasswd
    echo "Password set for claude user"
else
    # Generate random password and display it
    RANDOM_PASS=$(openssl rand -base64 12)
    echo "claude:$RANDOM_PASS" | chpasswd
    echo "=== SSH Access ==="
    echo "User: claude"
    echo "Password: $RANDOM_PASS"
    echo "Port: 2222 (or as configured)"
    echo ""
    echo "For key-based auth, add your public key to /claude-data/.ssh/authorized_keys"
fi

chown -R claude:claude "$SSH_DIR"
