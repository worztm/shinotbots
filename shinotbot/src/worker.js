/**
 * Shinotbot - Cloudflare Worker
 * Telegram bot for GitHub notifications (stars, forks, followers)
 * Runs as a webhook-based bot with cron polling
 */

const GITHUB_API = 'https://api.github.com';

// ============ Telegram API Helpers ============

async function tg(token, method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API ${method} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function sendMessage(token, chatId, text, extra = {}) {
  return tg(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

async function editMessage(token, chatId, messageId, text, extra = {}) {
  return tg(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

// ============ GitHub API ============

async function getAuthenticatedUser(token) {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'shinotbot-cloudflare-worker',
    },
  });
  
  const text = await res.text();
  
  // Try to parse as JSON
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // Not JSON - likely an error page
    throw new Error(`GitHub returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
  }
  
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${data.message || 'Unknown error'}`);
  }
  return data;
}

async function getUserRepos(token) {
  const repos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?sort=updated&per_page=100&page=${page}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
    );
    if (!res.ok) throw new Error(`GitHub API /user/repos failed: ${res.status}`);
    const data = await res.json();
    repos.push(
      ...data.map((r) => ({
        full_name: r.full_name,
        stars: r.stargazers_count,
        forks: r.forks_count,
      })),
    );
    if (data.length < 100) hasMore = false;
    page++;
  }

  return repos;
}

async function getCurrentState(token) {
  const [user, repos] = await Promise.all([
    getAuthenticatedUser(token),
    getUserRepos(token),
  ]);
  return { user, repos };
}

// ============ KV Storage Helpers ============

async function getUser(kv, chatId) {
  return kv.get(`user:${chatId}`, 'json');
}

async function putUser(kv, chatId, data) {
  await kv.put(`user:${chatId}`, JSON.stringify(data));
}

async function deleteUser(kv, chatId) {
  await kv.delete(`user:${chatId}`);
  // Delete snapshots too
  const list = await kv.list({ prefix: `snap:${chatId}:` });
  for (const key of list.keys) {
    await kv.delete(key.name);
  }
}

async function listAllUsers(kv) {
  const list = await kv.list({ prefix: 'user:' });
  const users = [];
  for (const key of list.keys) {
    const user = await kv.get(key.name, 'json');
    if (user) users.push(user);
  }
  return users;
}

async function getSnapshots(kv, chatId) {
  const list = await kv.list({ prefix: `snap:${chatId}:` });
  const snapshots = [];
  for (const key of list.keys) {
    const snap = await kv.get(key.name, 'json');
    if (snap) snapshots.push(snap);
  }
  return snapshots;
}

async function upsertSnapshot(kv, chatId, repoName, stars, forks, followers) {
  await kv.put(`snap:${chatId}:${repoName}`, JSON.stringify({
    chat_id: chatId,
    repo_name: repoName,
    stars,
    forks,
    followers,
    snapshot_at: new Date().toISOString(),
  }));
}

// ============ Notification Logic ============

function computeDeltas(current, previousSnapshots) {
  const notifications = [];
  const prevMap = new Map();

  for (const snap of previousSnapshots) {
    prevMap.set(snap.repo_name, snap);
  }

  const hasBaseline = previousSnapshots.length > 0;
  if (!hasBaseline) return notifications;

  // Followers delta
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

  // New repos
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

async function sendNotifications(token, chatId, notifications) {
  if (notifications.length === 0) return;

  const header = '\uD83D\uDCE2 *GitHub Activity Update*\n';
  const body = notifications.map((n) => `\u2022 ${n}`).join('\n');
  await sendMessage(token, chatId, `${header}\n${body}`);
}

// ============ Bot Command Handlers ============

async function handleStart(token, chatId) {
  await sendMessage(token, chatId,
    `\uD83D\uDC4B Welcome to *Shinotbot*!\n\n` +
    `I'll notify you about GitHub activity:\n` +
    `\u2B50 New stars on your repos\n` +
    `\uD83C\uDF74 New forks of your repos\n` +
    `\uD83D\uDC64 New followers\n\n` +
    `Use /connect to link your GitHub account.`,
  );
}

async function handleConnect(token, chatId, kv) {
  const user = await getUser(kv, chatId);
  if (user) {
    await sendMessage(token, chatId,
      `You are already connected as \`@${user.github_login}\`. Use /disconnect first to change accounts.`,
    );
    return;
  }

  await sendMessage(token, chatId,
    `\uD83D\uDD17 *Connect Your GitHub Account*\n\n` +
    `Send me your GitHub Personal Access Token (PAT) to get started.\n\n` +
    `_How to create one:_\n` +
    `1. Go to https://github.com/settings/tokens\n` +
    `2. Click "Generate new token (classic)"\n` +
    `3. Select scopes: \`read:user\` and \`public_repo\`\n` +
    `4. Copy and paste the token here\n\n` +
    `Your token will be stored securely and used only to check your account.`,
  );
}

async function handleStatus(token, chatId, kv) {
  const user = await getUser(kv, chatId);
  if (!user) {
    await sendMessage(token, chatId, `\u274C No GitHub account connected. Use /connect to link your account.`);
    return;
  }
  const date = new Date(user.created_at);
  const formatted = date.toLocaleDateString('en-US', { 
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit' 
  });
  await sendMessage(token, chatId,
    `\u2705 Connected as \`@${user.github_login}\` since ${formatted}`,
  );
}

async function handleDisconnect(token, chatId, kv) {
  const user = await getUser(kv, chatId);
  if (!user) {
    await sendMessage(token, chatId, `\u274C No GitHub account is connected.`);
    return;
  }
  await deleteUser(kv, chatId);
  await sendMessage(token, chatId,
    `\u2705 Disconnected from \`@${user.github_login}\`. You will no longer receive GitHub notifications.`,
  );
}

async function handleHelp(token, chatId) {
  await sendMessage(token, chatId,
    `*Available Commands*\n\n` +
    `/start - Start the bot\n` +
    `/connect - Link your GitHub account\n` +
    `/status - Check connection status\n` +
    `/disconnect - Remove GitHub connection\n` +
    `/help - Show this message\n\n` +
    `Just send me your PAT after /connect and I'll handle the rest!`,
  );
}

async function handlePatSubmission(token, chatId, text, kv) {
  const user = await getUser(kv, chatId);
  if (user) {
    await sendMessage(token, chatId,
      `You are already connected as \`@${user.github_login}\`. Use /disconnect first to change accounts.`,
    );
    return;
  }

  const trimmed = text.trim();
  
  // Log for debugging
  console.log(`Received message from chat ${chatId}:`);
  console.log(`  Length: ${trimmed.length}`);
  console.log(`  First 10 chars: [${trimmed.substring(0, 10)}]`);
  console.log(`  Last 5 chars: [${trimmed.substring(trimmed.length - 5)}]`);
  console.log(`  Contains spaces: ${trimmed.includes(' ')}`);
  console.log(`  Contains newlines: ${trimmed.includes('\n')}`);
  console.log(`  Char codes of first 20: ${Array.from(trimmed.substring(0, 20)).map(c => c.charCodeAt(0)).join(',')}`);

  // Validate token format
  if (!trimmed.startsWith('ghp_') && !trimmed.startsWith('github_pat_') && !trimmed.startsWith('gho_')) {
    await sendMessage(token, chatId,
      `\u26A0\uFE0F That doesn't look like a valid GitHub PAT.\n\nExpected format:\n\`ghp_...\` or \`github_pat_...\`\n\nPlease try again.`,
    );
    return;
  }

  const chatMessage = await sendMessage(token, chatId, `\u23F3 Verifying your token...`);

  try {
    console.log(`Verifying token for chat ${chatId}, token starts with: ${trimmed.substring(0, 7)}...`);
    const githubUser = await getAuthenticatedUser(trimmed);
    console.log(`Token verified! GitHub user: ${githubUser.login}`);

    // Save user first
    await putUser(kv, chatId, {
      chat_id: chatId,
      github_token: trimmed,
      github_login: githubUser.login,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Store global snapshot
    await upsertSnapshot(kv, chatId, '__global__', 0, 0, githubUser.followers);

    // Try to fetch repos (might fail due to rate limiting)
    let repoCount = 0;
    try {
      const repos = await getUserRepos(trimmed);
      repoCount = repos.length;
      for (const repo of repos) {
        await upsertSnapshot(kv, chatId, repo.full_name, repo.stars, repo.forks, 0);
      }
    } catch (repoErr) {
      console.warn(`Could not fetch repos (non-fatal): ${repoErr.message}`);
      // Continue anyway - token is valid, we just can't fetch repos yet
    }

    const repoMsg = repoCount > 0 ? `Monitoring ${repoCount} repositories.` : 'Repos will be checked on next poll.';
    await editMessage(token, chatId, chatMessage.result.message_id,
      `\u2705 *Connected!*\n\nMonitoring your account as \`@${githubUser.login}\` (${githubUser.followers} followers).\n${repoMsg}\nYou'll receive notifications for new stars, forks, and followers.`,
    );
  } catch (err) {
    console.error(`GitHub auth failed for chat ${chatId}:`, err.message);
    await editMessage(token, chatId, chatMessage.result.message_id,
      `\u274C *Token verification failed*\n\nError: ${err.message}\n\nPlease check that:\n1. Token is valid and not expired\n2. Token has \`read:user\` scope\n3. You copied the full token`,
    );
  }
}

// ============ Polling Logic ============

async function pollAllUsers(token, kv) {
  const users = await listAllUsers(kv);
  if (users.length === 0) return;

  console.log(`Polling ${users.length} user(s)...`);

  for (const user of users) {
    try {
      const prevSnapshots = await getSnapshots(kv, user.chat_id);
      const current = await getCurrentState(user.github_token);
      const deltas = computeDeltas(current, prevSnapshots);
      await sendNotifications(token, user.chat_id, deltas);

      // Save new snapshots
      await upsertSnapshot(kv, user.chat_id, '__global__', 0, 0, current.user.followers);
      for (const repo of current.repos) {
        await upsertSnapshot(kv, user.chat_id, repo.full_name, repo.stars, repo.forks, 0);
      }
    } catch (err) {
      console.error(`Poll error for ${user.github_login}:`, err.message);
      // Only delete user on 401 (unauthorized) - 403 might be rate limiting
      if (err.message.includes('401')) {
        try {
          await sendMessage(token, user.chat_id,
            `\u26A0\uFE0F Your GitHub token is no longer valid. Use /connect to re-authorize.`,
          );
          await deleteUser(kv, user.chat_id);
        } catch {}
      }
    }
  }
}

// ============ Message Router ============

async function handleMessage(token, message, kv) {
  const chatId = String(message.chat.id);
  const text = message.text || '';

  if (text === '/start' || text === '/start@shinotbot') {
    await handleStart(token, chatId);
  } else if (text === '/connect' || text === '/connect@shinotbot') {
    await handleConnect(token, chatId, kv);
  } else if (text === '/status' || text === '/status@shinotbot') {
    await handleStatus(token, chatId, kv);
  } else if (text === '/disconnect' || text === '/disconnect@shinotbot') {
    await handleDisconnect(token, chatId, kv);
  } else if (text === '/help' || text === '/help@shinotbot') {
    await handleHelp(token, chatId);
  } else if (text && !text.startsWith('/')) {
    await handlePatSubmission(token, chatId, text, kv);
  }
}

// ============ Main Worker ============

export default {
  // Handle HTTP requests (Telegram webhook + health check)
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/') {
      return new Response('Shinotbot is running!', { status: 200 });
    }

    // Telegram webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.message) {
          await handleMessage(env.TELEGRAM_BOT_TOKEN, update.message, env.DB);
        }
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('Webhook error:', err);
        return new Response('Error', { status: 500 });
      }
    }

    // Setup endpoint - sets webhook + registers commands
    if (url.pathname === '/setup' && request.method === 'POST') {
      try {
        const body = await request.json();
        const webhookUrl = body.webhook_url;

        // Set webhook
        const webhookResult = await tg(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
          url: `${webhookUrl}/webhook`,
          allowed_updates: ['message'],
        });

        // Register commands
        await tg(env.TELEGRAM_BOT_TOKEN, 'setMyCommands', {
          commands: [
            { command: 'start', description: 'Start the bot and see available options' },
            { command: 'connect', description: 'Connect your GitHub account with a PAT' },
            { command: 'status', description: 'Check your connected GitHub account' },
            { command: 'disconnect', description: 'Disconnect your GitHub account' },
            { command: 'help', description: 'Show help text' },
          ],
        });

        return Response.json({
          success: true,
          webhook: webhookResult,
          message: 'Bot configured successfully!',
        });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // Debug endpoint - test GitHub token
    if (url.pathname === '/test-token') {
      const testToken = url.searchParams.get('token');
      if (!testToken) {
        return Response.json({ error: 'Add ?token=YOUR_TOKEN to URL' });
      }
      try {
        // Raw test to see exact response
        const res = await fetch(`${GITHUB_API}/user`, {
          headers: {
            Authorization: `token ${testToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'shinotbot-cloudflare-worker',
          },
        });
        const rawText = await res.text();
        let json;
        try { json = JSON.parse(rawText); } catch (e) { json = null; }
        return Response.json({
          status: res.status,
          isJson: !!json,
          data: json || rawText.substring(0, 200),
        });
      } catch (err) {
        return Response.json({ error: err.message });
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  // Cron trigger - polls GitHub for changes
  async scheduled(event, env, ctx) {
    await pollAllUsers(env.TELEGRAM_BOT_TOKEN, env.DB);
  },
};
