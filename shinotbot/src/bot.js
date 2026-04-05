const TelegramBot = require('node-telegram-bot-api');
const github = require('./github');
const store = require('./store');

function createBot(config) {
  const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.setMyCommands([
    { command: 'start', description: 'Start the bot and see available options' },
    { command: 'connect', description: 'Connect your GitHub account with a PAT' },
    { command: 'status', description: 'Check your connected GitHub account' },
    { command: 'disconnect', description: 'Disconnect your GitHub account' },
    { command: 'help', description: 'Show help text' },
  ]);

  // /start
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `\uD83D\uDC4B Welcome to *Shinotbot*!\n\n` +
      `I'll notify you about GitHub activity:\n` +
      `\u2B50 New stars on your repos\n` +
      `\uD83C\uDF74 New forks of your repos\n` +
      `\uD83D\uDC64 New followers\n\n` +
      `Use /connect to link your GitHub account.`,
      { parse_mode: 'Markdown' },
    );
  });

  // /connect
  bot.onText(/\/connect/, (msg) => {
    const chatId = String(msg.chat.id);
    const user = store.getUser(chatId);
    if (user) {
      bot.sendMessage(msg.chat.id,
        `You are already connected as \`@${user.github_login}\`. Use /disconnect first to change accounts.`,
        { parse_mode: 'Markdown' });
      return;
    }

    bot.sendMessage(msg.chat.id,
      `\uD83D\uDD17 *Connect Your GitHub Account*\n\n` +
      `Send me your GitHub Personal Access Token (PAT) to get started.\n\n` +
      `_How to create one:_\n` +
      `1. Go to https://github.com/settings/tokens\n` +
      `2. Click "Generate new token (classic)"\n` +
      `3. Select scopes: \`read:user\` and \`public_repo\`\n` +
      `4. Copy and paste the token here\n\n` +
      `Your token will be stored securely and used only to check your account.`,
      { parse_mode: 'Markdown' },
    );
  });

  // /status
  bot.onText(/\/status/, (msg) => {
    const chatId = String(msg.chat.id);
    const user = store.getUser(chatId);
    if (!user) {
      bot.sendMessage(msg.chat.id,
        `\u274C No GitHub account connected. Use /connect to link your account.`,
        { parse_mode: 'Markdown' });
      return;
    }
    bot.sendMessage(msg.chat.id,
      `\u2705 Connected as \`@${user.github_login}\` since ${user.created_at}`,
      { parse_mode: 'Markdown' });
  });

  // /disconnect
  bot.onText(/\/disconnect/, (msg) => {
    const chatId = String(msg.chat.id);
    const user = store.getUser(chatId);
    if (!user) {
      bot.sendMessage(msg.chat.id, `\u274C No GitHub account is connected.`);
      return;
    }
    store.deleteUser(chatId);
    bot.sendMessage(msg.chat.id,
      `\u2705 Disconnected from \`@${user.github_login}\`. You will no longer receive GitHub notifications.`,
      { parse_mode: 'Markdown' });
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `*Available Commands*\n\n` +
      `/start - Start the bot\n` +
      `/connect - Link your GitHub account\n` +
      `/status - Check connection status\n` +
      `/disconnect - Remove GitHub connection\n` +
      `/help - Show this message\n\n` +
      `Just send me your PAT after /connect and I'll handle the rest!`,
      { parse_mode: 'Markdown' },
    );
  });

  // Handle PAT submission - any message that isn't a command
  bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
      const chatId = String(msg.chat.id);
      const user = store.getUser(chatId);
      if (user) {
        bot.sendMessage(msg.chat.id,
          `You are already connected as \`@${user.github_login}\`. Use /disconnect first to change accounts.`,
          { parse_mode: 'Markdown' });
        return;
      }

      const token = msg.text.trim();
      if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && token.split('').length < 10) {
        bot.sendMessage(msg.chat.id,
          `\u26A0\uFE0F That doesn't look like a valid GitHub PAT. It should start with \`ghp_\` or \`github_pat_\`. Try again.`,
          { parse_mode: 'Markdown' });
        return;
      }

      try {
        const chatMessage = await bot.sendMessage(msg.chat.id, `\u23F3 Verifying your token...`);
        const githubUser = await github.getAuthenticatedUser(token);

        store.upsertUser(chatId, token, githubUser.login);

        bot.editMessageText(
          `\u2705 *Connected!*\n\nMonitoring your account as \`@${githubUser.login}\`. You'll receive notifications for new stars, forks, and followers.`,
          { chat_id: chatId, message_id: chatMessage.message_id, parse_mode: 'Markdown' },
        );
      } catch (err) {
        try {
          bot.editMessageText(
            `\u274C Invalid or expired token. Make sure you have the correct token with \`read:user\` and \`public_repo\` scopes.`,
            { chat_id: chatId, message_id: chatMessage.message_id, parse_mode: 'Markdown' },
          );
        } catch {
          bot.sendMessage(msg.chat.id,
            `\u274C Invalid or expired token. Make sure you have the correct token with \`read:user\` and \`public_repo\` scopes.`,
            { parse_mode: 'Markdown' });
        }
      }
    }
  });

  return bot;
}

module.exports = { createBot };
