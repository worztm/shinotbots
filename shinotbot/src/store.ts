/**
 * Shinotbot - KV Storage Helpers
 */

import type { UserData, Snapshot } from './types';

/**
 * Get a user by chat ID
 */
export async function getUser(kv: KVNamespace, chatId: string): Promise<UserData | null> {
  return kv.get<UserData>(`user:${chatId}`, 'json');
}

/**
 * Save or update a user
 */
export async function putUser(kv: KVNamespace, chatId: string, data: UserData): Promise<void> {
  await kv.put(`user:${chatId}`, JSON.stringify(data));
}

/**
 * Delete a user and all their snapshots
 */
export async function deleteUser(kv: KVNamespace, chatId: string): Promise<void> {
  await kv.delete(`user:${chatId}`);
  
  // Delete all snapshots for this user
  const list = await kv.list({ prefix: `snap:${chatId}:` });
  const deletions = list.keys.map((key) => kv.delete(key.name));
  await Promise.all(deletions);
}

/**
 * List all connected users
 */
export async function listAllUsers(kv: KVNamespace): Promise<UserData[]> {
  const list = await kv.list({ prefix: 'user:' });
  const users: UserData[] = [];
  
  for (const key of list.keys) {
    const user = await kv.get<UserData>(key.name, 'json');
    if (user) users.push(user);
  }
  
  return users;
}

/**
 * Get all snapshots for a user
 */
export async function getSnapshots(kv: KVNamespace, chatId: string): Promise<Snapshot[]> {
  const list = await kv.list({ prefix: `snap:${chatId}:` });
  const snapshots: Snapshot[] = [];
  
  for (const key of list.keys) {
    const snap = await kv.get<Snapshot>(key.name, 'json');
    if (snap) snapshots.push(snap);
  }
  
  return snapshots;
}

/**
 * Create or update a snapshot for a repo or global stats
 */
export async function upsertSnapshot(
  kv: KVNamespace,
  chatId: string,
  repoName: string,
  stars: number,
  forks: number,
  followers: number
): Promise<void> {
  const snapshot: Snapshot = {
    chat_id: chatId,
    repo_name: repoName,
    stars,
    forks,
    followers,
    snapshot_at: new Date().toISOString(),
  };
  
  await kv.put(`snap:${chatId}:${repoName}`, JSON.stringify(snapshot));
}
