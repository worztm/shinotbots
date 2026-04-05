Shinotbot

Shinotbot is a Telegram bot for GitHub notifications. It watches your GitHub account and sends you updates about stars, forks, followers, and new repos straight to your Telegram chat.

What It Does

The bot polls the GitHub API every minute by default and compares the latest data to what it saw last time. If anything changed, it sends you a message with the details. No push tokens or webhooks needed.

Setup

npm install

Create a .env file:

TELEGRAM_BOT_TOKEN=your_bot_token_here
POLL_INTERVAL_MS=60000
DB_PATH=./data/shinotbot.db

TELEGRAM_BOT_TOKEN comes from BotFather, the rest are optional with sensible defaults.

Running It

npm start

Or npm run dev if you want auto-reload during development.

Usage

Start a chat with your bot and use /start to get going. Then /connect and paste your GitHub Personal Access Token. The bot will verify it and start monitoring.

To get a PAT from GitHub, go to Settings > Developer settings > Personal access tokens, generate a classic token with read:user and public_repo scopes, then send it to the bot.

Commands

/start - intro and welcome message
/connect - link your github account
/status - see who you're currently connected as
/disconnect - remove the linked account
/help - list commands

Each Telegram user can connect their own GitHub account independently.

How Data Works

Data lives in a plain JSON file on disk. On the first poll cycle the bot builds a baseline of your current stats. After that, every subsequent check computes the difference and notifies you of any changes. If the token stops working, it lets you know and disconnects you automatically.

Project Layout

src/index.js - entry point
src/config.js - environment variables
src/bot.js - telegram bot commands
src/github.js - github API calls
src/poller.js - polling logic
src/notification.js - change detection and message formatting
src/store.js - json file persistence

Dependencies

Node 18+, node-telegram-bot-api, node-fetch, dotenv. No database server.

License

MIT
