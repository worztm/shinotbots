const config = require('./config');
const store = require('./store');
const { createBot } = require('./bot');
const { startPolling, stopPolling } = require('./poller');

async function main() {
  console.log('Starting Shinotbot...');

  // Initialize database
  const db = await store.init(config.DB_PATH);

  // Start Telegram bot
  const bot = createBot(config);
  console.log('Telegram bot started');

  // Start poller
  const poller = startPolling(store, bot, config);
  console.log(`Polling every ${config.POLL_INTERVAL_MS}ms`);

  // Graceful shutdown
  async function shutdown() {
    console.log('Shutting down...');
    stopPolling();
    bot.stopPolling();
    db.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
