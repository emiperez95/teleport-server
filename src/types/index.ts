export interface TeleportRequest {
  repo_url: string;
  branch?: string;
  claude_config?: ClaudeConfig;
  env_vars?: Record<string, string>;
  conversation?: ConversationState;
  initial_prompt?: string;
  session_data?: string;       // base64-encoded JSONL session file
  resume_session_id?: string;  // Claude session ID to resume
  diff_patch?: string;         // base64-encoded git diff (uncommitted changes)
  claude_md?: string;          // base64-encoded CLAUDE.md content
}

export interface ClaudeConfig {
  mcp?: McpConfig;
  settings?: Record<string, unknown>;
  permissions?: PermissionsConfig;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface PermissionsConfig {
  allow?: string[];
  deny?: string[];
}

export interface ConversationState {
  messages?: ConversationMessage[];
  session_id?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Session {
  id: string;
  project: string;
  repo_url: string;
  branch: string;
  status: SessionStatus;
  tmux_session: string;
  created_at: Date;
  last_activity?: Date;
  work_dir: string;
}

export type SessionStatus = 'starting' | 'running' | 'stable' | 'error' | 'stopped';

export interface SessionListItem {
  id: string;
  project: string;
  status: SessionStatus;
  tmux_session: string;
  created_at: string;
  last_activity?: string;
}

export interface TeleportResponse {
  session_id: string;
  tmux_session: string;
  status: SessionStatus;
  work_dir: string;
}

export interface SessionDetails extends SessionListItem {
  repo_url: string;
  branch: string;
  work_dir: string;
}
