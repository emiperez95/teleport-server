export interface TeleportRequest {
  repo_url: string;
  branch?: string;
  claude_config?: ClaudeConfig;
  env_vars?: Record<string, string>;
  conversation?: ConversationState;
  initial_prompt?: string;
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
  port: number;
  tmux_session: string;
  created_at: Date;
  last_activity?: Date;
  pid?: number;
  work_dir: string;
}

export type SessionStatus = 'starting' | 'running' | 'stable' | 'error' | 'stopped';

export interface SessionListItem {
  id: string;
  project: string;
  status: SessionStatus;
  port: number;
  created_at: string;
  last_activity?: string;
}

export interface TeleportResponse {
  session_id: string;
  agent_port: number;
  status: SessionStatus;
  work_dir: string;
}

export interface SessionDetails extends SessionListItem {
  repo_url: string;
  branch: string;
  work_dir: string;
  tmux_session: string;
}
