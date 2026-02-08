#!/bin/bash
# Interactive setup for the Claude Teleport container
# Configures: Claude auth, GitHub CLI, git config
# Data persists in /claude-data volume

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
skip() { echo -e "${YELLOW}⊘ $1${NC}"; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════╗"
echo "║    Claude Teleport Server Setup      ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Claude Auth ──
step "Claude Authentication"

if claude --version &>/dev/null; then
  echo "Claude CLI: $(claude --version 2>&1 | head -1)"
else
  echo "Claude CLI not found!"
  exit 1
fi

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "ANTHROPIC_API_KEY is set"
else
  echo "No ANTHROPIC_API_KEY found."
  echo ""
  echo "Options:"
  echo "  1) Enter API key now"
  echo "  2) Login interactively (claude login)"
  echo "  3) Skip"
  echo ""
  read -rp "Choice [1/2/3]: " choice
  case "$choice" in
    1)
      read -rp "API key: " api_key
      echo "export ANTHROPIC_API_KEY=\"${api_key}\"" > /claude-data/.env
      export ANTHROPIC_API_KEY="$api_key"
      ok "API key saved to /claude-data/.env (persists across rebuilds)"
      ;;
    2)
      claude login
      ;;
    3)
      skip "Skipping Claude auth"
      ;;
  esac
fi

# ── 2. GitHub CLI ──
step "GitHub Authentication"

if gh auth status &>/dev/null; then
  ok "Already authenticated with GitHub"
  gh auth status 2>&1 | grep "account" | head -1
else
  echo "GitHub CLI is not authenticated."
  echo ""
  echo "Options:"
  echo "  1) Login interactively (gh auth login)"
  echo "  2) Paste a token"
  echo "  3) Skip"
  echo ""
  read -rp "Choice [1/2/3]: " choice
  case "$choice" in
    1)
      gh auth login
      ;;
    2)
      read -rp "GitHub token: " gh_token
      echo "$gh_token" | gh auth login --with-token
      ok "GitHub token set"
      ;;
    3)
      skip "Skipping GitHub auth (only public repos will work)"
      ;;
  esac
fi

# ── 3. Git Config ──
step "Git Configuration"

current_name=$(git config --global user.name 2>/dev/null || true)
current_email=$(git config --global user.email 2>/dev/null || true)

if [ -n "$current_name" ] && [ -n "$current_email" ]; then
  ok "Git already configured: $current_name <$current_email>"
  read -rp "Reconfigure? [y/N]: " reconf
  if [ "$reconf" != "y" ] && [ "$reconf" != "Y" ]; then
    skip "Keeping existing git config"
  else
    current_name=""
  fi
fi

if [ -z "$current_name" ] || [ -z "$current_email" ]; then
  read -rp "Git name: " git_name
  read -rp "Git email: " git_email
  git config --global user.name "$git_name"
  git config --global user.email "$git_email"
  ok "Git configured: $git_name <$git_email>"
fi

# ── 4. SSH Keys ──
step "SSH Keys (for private repos)"

if [ -f ~/.ssh/id_ed25519 ] || [ -f ~/.ssh/id_rsa ]; then
  ok "SSH key exists"
  echo "Public key:"
  cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null
else
  echo "No SSH key found."
  echo ""
  echo "Options:"
  echo "  1) Generate a new key"
  echo "  2) Skip (use HTTPS for repos)"
  echo ""
  read -rp "Choice [1/2]: " choice
  case "$choice" in
    1)
      read -rp "Email for key: " key_email
      ssh-keygen -t ed25519 -C "$key_email" -f ~/.ssh/id_ed25519 -N ""
      ok "Key generated. Add this to GitHub:"
      echo ""
      cat ~/.ssh/id_ed25519.pub
      echo ""
      echo "Add at: https://github.com/settings/keys"
      ;;
    2)
      skip "Skipping SSH key setup"
      ;;
  esac
fi

# ── 5. Seed Claude settings (skip onboarding in interactive mode) ──
step "Claude Settings"

CLAUDE_DIR="/claude-data/.claude"
if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
  echo '{}' > "$CLAUDE_DIR/settings.json"
  chown claude:claude "$CLAUDE_DIR/settings.json"
  ok "Created settings.json"
else
  ok "settings.json already exists"
fi

if [ ! -f "$CLAUDE_DIR/settings.local.json" ]; then
  echo '{}' > "$CLAUDE_DIR/settings.local.json"
  chown claude:claude "$CLAUDE_DIR/settings.local.json"
  ok "Created settings.local.json"
else
  ok "settings.local.json already exists"
fi

# ── Done ──
step "Setup Complete"
echo "All configuration is stored in /claude-data (persistent volume)."
echo "You can re-run this setup anytime with: teleport setup"
echo ""
