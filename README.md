# Shinotbot

A Telegram bot for GitHub notifications — monitors stars, forks, followers, and new repos, then sends updates to your Telegram chat.

Built as a **Cloudflare Worker** in **TypeScript**, using KV for storage and cron triggers for polling.

## Architecture

```
src/
├── worker.ts         # Entry point — fetch handler + cron handler
├── types.ts          # TypeScript types (Env, Telegram, GitHub, etc.)
├── telegram.ts       # Telegram Bot API helpers (sendMessage, tg, escapeMarkdown)
├── github.ts         # GitHub API helpers (getAuthenticatedUser, getUserRepos)
├── store.ts          # KV storage helpers (users, snapshots, scheduled messages)
├── notifications.ts  # Change detection & notification formatting
├── handlers.ts       # Bot command handlers (/start, /connect, /status, etc.)
├── router.ts         # Message router — dispatches to correct handler
└── poller.ts         # Polling logic — checks all users for GitHub changes
```

## How It Works

1. User sends `/connect` and provides a GitHub Personal Access Token
2. The bot verifies the token, stores it (encrypted at rest in KV), and creates a baseline snapshot of the user's repos
3. A **cron trigger** runs every 5 minutes (`*/5 * * * *`):
   - Fetches current GitHub state (followers, stars, forks) for each user
   - Compares against the stored snapshot
   - Sends a Telegram notification for any detected changes
   - Updates the snapshot for the next comparison
4. Webhook-based message handling responds instantly to user commands

## What Gets Notified

- ⭐ New stars on your repos
- 🍴 New forks of your repos
- 👤 New followers
- 🎉 New repositories you create

## Setup

### Prerequisites

- Node.js 18+
- A Telegram bot token from [BotFather](https://t.me/botfather)
- A Cloudflare account
- A GitHub Personal Access Token (`read:user` + `public_repo` scopes)

### Installation

```bash
npm install
```

### Configuration

Set up the required secret:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

### Deploy

```bash
npm run deploy
```

### Set up Telegram webhook

```bash
curl -X POST https://YOUR_WORKER.workers.dev/setup \
  -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://YOUR_WORKER.workers.dev"}'
```

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Introductory message |
| `/connect` | Link your GitHub account with a PAT |
| `/status` | Check your connection status |
| `/disconnect` | Remove your GitHub account |
| `/help` | Show available commands |

## Development

```bash
npm run dev          # Local dev server
npm run typecheck    # TypeScript type checking
npm run tail         # View production logs
npm run deploy       # Deploy to Cloudflare
```

## Tech Stack

- **Runtime:** Cloudflare Workers (edge)
- **Language:** TypeScript
- **Storage:** Cloudflare KV
- **Scheduling:** Cron Triggers (every 5 minutes)
- **Bot API:** Telegram Bot API (webhook mode)
- **Data Source:** GitHub REST API v3

## License

MIT
