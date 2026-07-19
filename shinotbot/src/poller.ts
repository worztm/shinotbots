/**
 * Shinotbot - Polling Logic
 */

import { getCurrentState } from './github';
import { listAllUsers, getSnapshots, upsertSnapshot, deleteUser } from './store';
import { computeDeltas, sendNotifications } from './notifications';
import { sendMessage } from './telegram';

/**
 * Poll all connected users for GitHub changes
 */
export async function pollAllUsers(token: string, kv: KVNamespace): Promise<void> {
  const users = await listAllUsers(kv);

  if (users.length === 0) {
    console.log('No users to poll');
    return;
  }

  console.log(`Polling ${users.length} user(s)...`);

  for (const user of users) {
    try {
      // Get previous snapshots for comparison
      const prevSnapshots = await getSnapshots(kv, user.chat_id);

      // Get current state from GitHub
      const current = await getCurrentState(user.github_token);

      // Compute deltas
      const deltas = computeDeltas(current, prevSnapshots);

      // Send notifications if there are changes
      await sendNotifications(token, user.chat_id, deltas);

      // Save new snapshots for next comparison
      await upsertSnapshot(kv, user.chat_id, '__global__', 0, 0, current.user.followers);

      for (const repo of current.repos) {
        await upsertSnapshot(kv, user.chat_id, repo.full_name, repo.stars, repo.forks, 0);
      }

      console.log(`Poll successful for ${user.github_login}: ${deltas.length} changes`);
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`Poll error for ${user.github_login}:`, errorMsg);

      // If token is unauthorized (401), notify user and disconnect
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        try {
          await sendMessage(
            token,
            user.chat_id,
            `⚠️ Your GitHub token is no longer valid. Use /connect to re-authorize.`
          );
          await deleteUser(kv, user.chat_id);
        } catch (sendErr) {
          console.error(`Failed to notify user ${user.chat_id}:`, (sendErr as Error).message);
        }
      }
    }
  }
}

/**
 * Check and send scheduled broadcast messages
 */
export async function checkScheduledMessages(token: string, kv: KVNamespace): Promise<void> {
  const list = await kv.list({ prefix: 'schedule:' });
  const now = new Date();

  for (const key of list.keys) {
    const sched = await kv.get<{ id: string; message: string; sendAt: string; sent: boolean }>(
      key.name,
      'json'
    );

    if (!sched || sched.sent) continue;

    const sendAt = new Date(sched.sendAt);
    if (now >= sendAt) {
      console.log(`Sending scheduled message: ${sched.id}`);
      const users = await listAllUsers(kv);

      for (const user of users) {
        try {
          await sendMessage(token, user.chat_id, sched.message);
        } catch (err) {
          console.error(`Scheduled broadcast failed for ${user.chat_id}:`, (err as Error).message);
        }
      }

      // Mark as sent
      sched.sent = true;
      await kv.put(key.name, JSON.stringify(sched));
    }
  }
}
