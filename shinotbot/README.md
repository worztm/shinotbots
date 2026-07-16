# Shinotbot

Telegram bot for GitHub notifications. Runs on Cloudflare Workers.

## What It Does

The bot monitors your GitHub account and sends you updates about stars, forks, followers, and new repos straight to your Telegram chat. It polls the GitHub API every minute and notifies you of any changes.

## Features

- ⭐ New stars on your repos
- 🍴 New forks of your repos  
- 👤 New followers
- 🎉 New repositories

## Setup

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Telegram bot token](https://t.me/BotFather) from @BotFather
- [GitHub Personal Access Token](https://github.com/settings/tokens) with `read:user` and `public_repo` scopes

### Quick Setup

```bash
# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Run the setup script (creates KV, sets secrets, deploys)
npm run setup
```

### Manual Setup

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv namespace create "DB"
# Update wrangler.toml with the returned ID

# Set your Telegram bot token
wrangler secret put TELEGRAM_BOT_TOKEN

# Deploy
npm run deploy

# Set up webhook (replace YOUR_WORKER_URL)
curl -X POST "https://YOUR_WORKER_URL/setup" \
  -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://YOUR_WORKER_URL"}'
```

## Usage

1. Open Telegram and find your bot
2. Send `/start` to see the welcome message
3. Send `/connect` and paste your GitHub Personal Access Token
4. The bot will verify your token and start monitoring

### Commands

- `/start` - Welcome message
- `/connect` - Link your GitHub account
- `/status` - Check connection status
- `/disconnect` - Remove GitHub connection
- `/help` - List commands

## Development

```bash
# Run locally with hot reload
npm run dev

# View live logs
npm run tail

# Deploy updates
npm run deploy
```

## Architecture

- **Runtime**: Cloudflare Workers (V8 isolates)
- **Storage**: Cloudflare KV for user data and snapshots
- **Triggers**: Cron job every 60 seconds for polling
- **Webhook**: Telegram Bot API webhook (no polling)

## Project Structure

```
shinotbot/
├── src/
│   └── worker.js       # Main worker code
├── scripts/
│   └── setup.js        # One-click setup script
├── wrangler.toml       # Cloudflare configuration
├── package.json
└── README.md
```

## License

MIT
