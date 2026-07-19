/**
 * Shinotbot - Bot Command Handlers
 */

import type { UserData } from './types';
import { sendMessage, editMessage, escapeMarkdown } from './telegram';
import { getAuthenticatedUser, getUserRepos } from './github';
import { getUser, putUser, deleteUser, upsertSnapshot } from './store';

/**
 * Handle /start command
 */
export async function handleStart(token: string, chatId: string): Promise<void> {
  await sendMessage(
    token,
    chatId,
    `👋 Welcome to *Shinotbot*!\n\n` +
      `I'll notify you about GitHub activity:\n` +
      `⭐ New stars on your repos\n` +
      `🍴 New forks of your repos\n` +
      `👤 New followers\n\n` +
      `Use /connect to link your GitHub account.`
  );
}

/**
 * Handle /connect command
 */
export async function handleConnect(
  token: string,
  chatId: string,
  kv: KVNamespace
): Promise<void> {
  const user = await getUser(kv, chatId);
  
  if (user) {
    await sendMessage(
      token,
      chatId,
      `You are already connected as \`@${escapeMarkdown(user.github_login)}\`. Use /disconnect first to change accounts.`
    );
    return;
  }

  await sendMessage(
    token,
    chatId,
    `🔗 *Connect Your GitHub Account*\n\n` +
      `Send me your GitHub Personal Access Token (PAT) to get started.\n\n` +
      `_How to create one:_\n` +
      `1. Go to https://github.com/settings/tokens\n` +
      `2. Click "Generate new token (classic)"\n` +
      `3. Select scopes: \`read:user\` and \`public_repo\`\n` +
      `4. Copy and paste the token here\n\n` +
      `Your token will be stored securely and used only to check your account.`
  );
}

/**
 * Handle /status command
 */
export async function handleStatus(
  token: string,
  chatId: string,
  kv: KVNamespace
): Promise<void> {
  const user = await getUser(kv, chatId);
  
  if (!user) {
    await sendMessage(
      token,
      chatId,
      `❌ No GitHub account connected. Use /connect to link your account.`
    );
    return;
  }

  const date = new Date(user.created_at);
  const formatted = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await sendMessage(
    token,
    chatId,
    `✅ Connected as \`@${escapeMarkdown(user.github_login)}\` since ${formatted}`
  );
}

/**
 * Handle /disconnect command
 */
export async function handleDisconnect(
  token: string,
  chatId: string,
  kv: KVNamespace
): Promise<void> {
  const user = await getUser(kv, chatId);
  
  if (!user) {
    await sendMessage(token, chatId, `❌ No GitHub account is connected.`);
    return;
  }

  await deleteUser(kv, chatId);
  await sendMessage(
    token,
    chatId,
    `✅ Disconnected from \`@${escapeMarkdown(user.github_login)}\`. You will no longer receive GitHub notifications.`
  );
}

/**
 * Handle /help command
 */
export async function handleHelp(token: string, chatId: string): Promise<void> {
  await sendMessage(
    token,
    chatId,
    `*Available Commands*\n\n` +
      `/start - Start the bot\n` +
      `/connect - Link your GitHub account\n` +
      `/status - Check connection status\n` +
      `/disconnect - Remove GitHub connection\n` +
      `/help - Show this message\n\n` +
      `Just send me your PAT after /connect and I'll handle the rest!`
  );
}

/**
 * Handle PAT submission (non-command message)
 */
export async function handlePatSubmission(
  token: string,
  chatId: string,
  text: string,
  kv: KVNamespace
): Promise<void> {
  const user = await getUser(kv, chatId);
  
  if (user) {
    await sendMessage(
      token,
      chatId,
      `You are already connected as \`@${escapeMarkdown(user.github_login)}\`. Use /disconnect first to change accounts.`
    );
    return;
  }

  const trimmed = text.trim();

  // Log for debugging
  console.log(`Received message from chat ${chatId}`);
  console.log(`  Length: ${trimmed.length}`);
  console.log(`  First 10 chars: [${trimmed.substring(0, 10)}]`);
  console.log(`  Contains spaces: ${trimmed.includes(' ')}`);
  console.log(`  Char codes: ${Array.from(trimmed.substring(0, 20))
    .map((c) => c.charCodeAt(0))
    .join(',')}`);

  // Validate token format
  if (
    !trimmed.startsWith('ghp_') &&
    !trimmed.startsWith('github_pat_') &&
    !trimmed.startsWith('gho_')
  ) {
    await sendMessage(
      token,
      chatId,
      `⚠️ That doesn't look like a valid GitHub PAT.\n\nExpected format:\n\`ghp_...\` or \`github_pat_...\`\n\nPlease try again.`
    );
    return;
  }

  const chatMessage = await sendMessage(
    token,
    chatId,
    `⏳ Verifying your token...`
  );

  try {
    console.log(`Verifying token for chat ${chatId}`);
    const githubUser = await getAuthenticatedUser(trimmed);
    console.log(`Token verified! GitHub user: ${githubUser.login}`);

    // Save user
    const userData: UserData = {
      chat_id: chatId,
      github_token: trimmed,
      github_login: githubUser.login,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await putUser(kv, chatId, userData);

    // Store global snapshot (followers)
    await upsertSnapshot(kv, chatId, '__global__', 0, 0, githubUser.followers);

    // Fetch and store repo snapshots
    let repoCount = 0;
    try {
      const repos = await getUserRepos(trimmed);
      repoCount = repos.length;
      
      for (const repo of repos) {
        await upsertSnapshot(kv, chatId, repo.full_name, repo.stars, repo.forks, 0);
      }
    } catch (repoErr) {
      console.warn(`Could not fetch repos (non-fatal): ${(repoErr as Error).message}`);
    }

    const repoMsg =
      repoCount > 0
        ? `Monitoring ${repoCount} repositories.`
        : 'Repos will be checked on next poll.';

    await editMessage(
      token,
      chatId,
      chatMessage.result!.message_id,
      `✅ *Connected!*\n\nMonitoring your account as \`@${escapeMarkdown(githubUser.login)}\` (${githubUser.followers} followers).\n${repoMsg}\nYou'll receive notifications for new stars, forks, and followers.`
    );
  } catch (err) {
    console.error(`GitHub auth failed for chat ${chatId}:`, (err as Error).message);
    
    await editMessage(
      token,
      chatId,
      chatMessage.result!.message_id,
      `❌ *Token verification failed*\n\nError: ${(err as Error).message}\n\nPlease check that:\n1. Token is valid and not expired\n2. Token has \`read:user\` scope\n3. You copied the full token`
    );
  }
}
