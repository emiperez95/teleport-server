# Claude Teleport Server
# A Docker container for receiving and managing Claude Code sessions remotely

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    tmux \
    openssh-server \
    jq \
    unzip \
    ca-certificates \
    gnupg \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Install jira-cli
RUN curl -Lo /usr/local/bin/jira https://github.com/ankitpokhrel/jira-cli/releases/latest/download/jira_linux_amd64 \
    && chmod +x /usr/local/bin/jira

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Download and install AgentAPI
# Note: Update URL to official AgentAPI release when available
ARG AGENTAPI_VERSION=latest
RUN mkdir -p /opt/agentapi \
    && echo "AgentAPI will be installed via npm or direct download" \
    # For now, we'll use claude's built-in agent API via --api flag
    && echo "Using Claude Code's built-in API mode"

# Create non-root user for running sessions
RUN useradd -m -s /bin/bash claude \
    && echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Configure SSH
RUN mkdir /var/run/sshd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && echo "AllowUsers claude" >> /etc/ssh/sshd_config

# Create directories
RUN mkdir -p /claude-data /projects \
    && chown -R claude:claude /claude-data /projects

# Set up persistent config directories
RUN mkdir -p /claude-data/.claude /claude-data/.config /claude-data/.ssh \
    && chown -R claude:claude /claude-data

# Switch to claude user for npm setup
USER claude
WORKDIR /home/claude

# Link config directories to persistent volume
RUN ln -sf /claude-data/.claude /home/claude/.claude \
    && ln -sf /claude-data/.config /home/claude/.config \
    && ln -sf /claude-data/.ssh /home/claude/.ssh

# Copy application files
USER root
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY dist/ ./dist/
COPY scripts/ ./scripts/

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Environment variables
ENV NODE_ENV=production
ENV TELEPORT_PORT=8080
ENV AGENTAPI_BASE_PORT=3284
ENV PROJECTS_DIR=/projects
ENV DATA_DIR=/claude-data

# Expose ports
# 8080: Teleport API
# 22: SSH
# 3284-3300: AgentAPI ports for sessions
EXPOSE 8080 22 3284-3300

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entrypoint
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
