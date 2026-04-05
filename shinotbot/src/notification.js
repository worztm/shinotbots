function computeDeltas(current, previousSnapshots) {
  const notifications = [];
  const prevMap = new Map();

  for (const snap of previousSnapshots) {
    prevMap.set(snap.repo_name, snap);
  }

  // Check if we have a baseline (any previous snapshots exist)
  const hasBaseline = previousSnapshots.length > 0;
  if (!hasBaseline) return notifications;

  // Followers delta (stored under __global__ key)
  const globalPrev = prevMap.get('__global__');
  if (globalPrev?.followers !== undefined) {
    const delta = current.user.followers - globalPrev.followers;
    if (delta !== 0) {
      notifications.push(
        `${delta > 0 ? '\u2B06\uFE0F' : '\u2B07\uFE0F'} Followers: ${globalPrev.followers} \u2192 ${current.user.followers} (${delta > 0 ? '+' : ''}${delta})`,
      );
    }
  }

  // Per-repo star/fork deltas
  for (const repo of current.repos) {
    const prev = prevMap.get(repo.full_name);
    if (!prev) continue;

    const starDelta = repo.stars - prev.stars;
    if (starDelta > 0) {
      notifications.push(
        `\u2B50 ${repo.full_name}: ${prev.stars} \u2192 ${repo.stars} (+${starDelta} stars)`,
      );
    } else if (starDelta < 0) {
      notifications.push(
        `\u2B50 ${repo.full_name}: ${prev.stars} \u2192 ${repo.stars} (${starDelta} stars)`,
      );
    }

    const forkDelta = repo.forks - prev.forks;
    if (forkDelta > 0) {
      notifications.push(
        `\uD83C\uDF74 ${repo.full_name}: ${prev.forks} \u2192 ${repo.forks} (+${forkDelta} forks)`,
      );
    } else if (forkDelta < 0) {
      notifications.push(
        `\uD83C\uDF74 ${repo.full_name}: ${prev.forks} \u2192 ${repo.forks} (${forkDelta} forks)`,
      );
    }
  }

  // New repos (in current but not in previous)
  if (hasBaseline) {
    const prevNames = new Set(prevMap.keys());
    for (const repo of current.repos) {
      if (!prevNames.has(repo.full_name)) {
        notifications.push(
          `\uD83C\uDF89 New repository: ${repo.full_name} (\u2B50 ${repo.stars} stars, \uD83C\uDF74 ${repo.forks} forks)`,
        );
      }
    }
  }

  return notifications;
}

async function sendNotifications(bot, chatId, notifications) {
  if (notifications.length === 0) return;

  const header = '\uD83D\uDCE2 *GitHub Activity Update*\n';
  const body = notifications.map((n) => `\u2022 ${n}`).join('\n');
  await bot.sendMessage(chatId, `${header}\n${body}`, { parse_mode: 'Markdown' });
}

module.exports = { computeDeltas, sendNotifications };
