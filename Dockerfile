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

# Install AWS CLI v2 (architecture-aware)
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then \
         curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"; \
       else \
         curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"; \
       fi \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Install jira-cli (architecture-aware)
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then \
         curl -Lo /usr/local/bin/jira https://github.com/ankitpokhrel/jira-cli/releases/latest/download/jira_linux_arm64; \
       else \
         curl -Lo /usr/local/bin/jira https://github.com/ankitpokhrel/jira-cli/releases/latest/download/jira_linux_amd64; \
       fi \
    && chmod +x /usr/local/bin/jira

# Create non-root user for running sessions
RUN useradd -m -s /bin/bash claude \
    && echo "claude:claude" | chpasswd \
    && echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install Claude Code CLI via native installer as the claude user
USER claude
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root
RUN cp /home/claude/.local/bin/claude /usr/local/bin/claude

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
# rm -rf first because the Claude installer creates real dirs
RUN rm -rf /home/claude/.claude /home/claude/.config /home/claude/.ssh \
    && ln -s /claude-data/.claude /home/claude/.claude \
    && ln -s /claude-data/.config /home/claude/.config \
    && ln -s /claude-data/.ssh /home/claude/.ssh

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
ENV PROJECTS_DIR=/projects
ENV DATA_DIR=/claude-data

# Expose ports
# 8080: Teleport API
# 22: SSH
EXPOSE 8080 22

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entrypoint
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
