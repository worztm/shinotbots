require('dotenv').config();

const required = ['TELEGRAM_BOT_TOKEN'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

module.exports = Object.freeze({
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS, 10) || 60000,
  DB_PATH: process.env.DB_PATH || './data/shinotbot.db',
});
