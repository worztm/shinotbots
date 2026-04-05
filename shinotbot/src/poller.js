const github = require('./github');
const notification = require('./notification');

let intervalId = null;
let _store = null;
let _bot = null;
let _config = null;

async function processInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

async function pollUser(user) {
  const s = _store;
  const bot = _bot;

  try {
    // Read previous snapshots BEFORE fetching new state
    const prevSnapshots = s.getSnapshots(user.chat_id);

    const current = await github.getCurrentState(user.github_token);

    // Compute and send deltas using previous snapshots
    const deltas = notification.computeDeltas(current, prevSnapshots);
    await notification.sendNotifications(bot, user.chat_id, deltas);

    // Save current state as new snapshots
    s.upsertSnapshot(user.chat_id, '__global__', 0, 0, current.user.followers);
    for (const repo of current.repos) {
      s.upsertSnapshot(user.chat_id, repo.full_name, repo.stars, repo.forks, 0);
    }
  } catch (err) {
    console.error(`Poll error for ${user.github_login} (${user.chat_id}):`, err.message);

    if (err.message.includes('401')) {
      try {
        bot.sendMessage(user.chat_id, `\u26A0\uFE0F Your GitHub token is no longer valid. Use /connect to re-authorize.`);
        s.deleteUser(user.chat_id);
      } catch {}
    }
  }
}

function startPolling(store, bot, config) {
  _store = store;
  _bot = bot;
  _config = config;

  // Store baseline snapshots on first run (no notifications)
  setTimeout(async () => {
    const users = store.listAllUsers();
    if (users.length > 0) {
      console.log(`Initial baseline collection for ${users.length} user(s)`);
      for (const user of users) {
        try {
          const current = await github.getCurrentState(user.github_token);
          store.upsertSnapshot(user.chat_id, '__global__', 0, 0, current.user.followers);
          for (const repo of current.repos) {
            store.upsertSnapshot(user.chat_id, repo.full_name, repo.stars, repo.forks, 0);
          }
        } catch (err) {
          console.error(`Initial baseline error for ${user.github_login}:`, err.message);
        }
      }
    }
  }, 2000);

  // Start recurring polling
  intervalId = setInterval(async () => {
    const users = store.listAllUsers();
    if (users.length === 0) return;
    console.log(`Polling ${users.length} user(s)...`);
    await processInBatches(users, 5, pollUser);
  }, config.POLL_INTERVAL_MS + 2000);

  return { intervalId };
}

function stopPolling() {
  if (intervalId) clearInterval(intervalId);
}

module.exports = { startPolling, stopPolling };
