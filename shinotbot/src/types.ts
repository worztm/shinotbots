/**
 * Shinotbot - Type Definitions
 */

// Cloudflare Worker Environment Bindings
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  DB: KVNamespace;
}

// Telegram API Types
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// GitHub API Types
export interface GitHubUser {
  login: string;
  id: number;
  followers: number;
  following: number;
  public_repos: number;
  [key: string]: unknown;
}

export interface GitHubRepo {
  full_name: string;
  stargazers_count: number;
  forks_count: number;
  [key: string]: unknown;
}

// Internal Data Types
export interface UserData {
  chat_id: string;
  github_token: string;
  github_login: string;
  created_at: string;
  updated_at: string;
}

export interface Snapshot {
  chat_id: string;
  repo_name: string;
  stars: number;
  forks: number;
  followers: number;
  snapshot_at: string;
}

export interface GitHubState {
  user: GitHubUser;
  repos: Array<{
    full_name: string;
    stars: number;
    forks: number;
  }>;
}

export interface ScheduledMessage {
  id: string;
  message: string;
  sendAt: string;
  sent: boolean;
  sentAt?: string;
  created: string;
}
