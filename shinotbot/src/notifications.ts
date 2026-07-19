/**
 * Shinotbot - Change Detection and Notification Formatting
 */

import type { GitHubState, Snapshot } from './types';
import { sendPlainMessage } from './telegram';

/**
 * Compute deltas between current state and previous snapshots
 */
export function computeDeltas(
  current: GitHubState,
  previousSnapshots: Snapshot[]
): string[] {
  const notifications: string[] = [];
  
  // Build a map of previous snapshots by repo_name
  const prevMap = new Map<string, Snapshot>();
  for (const snap of previousSnapshots) {
    prevMap.set(snap.repo_name, snap);
  }

  // Need at least one previous snapshot to compute deltas
  if (previousSnapshots.length === 0) {
    return notifications;
  }

  // Check follower changes
  const globalPrev = prevMap.get('__global__');
  if (globalPrev && globalPrev.followers !== undefined) {
    const delta = current.user.followers - globalPrev.followers;
    if (delta !== 0) {
      const arrow = delta > 0 ? '⬆️' : '⬇️';
      const sign = delta > 0 ? '+' : '';
      notifications.push(
        `${arrow} Followers: ${globalPrev.followers} -> ${current.user.followers} (${sign}${delta})`
      );
    }
  }

  // Check per-repo star and fork changes
  for (const repo of current.repos) {
    const prev = prevMap.get(repo.full_name);
    
    // New repo we haven't seen before
    if (!prev) {
      notifications.push(
        `🎉 New repository: ${repo.full_name} (⭐ ${repo.stars} stars, 🍴 ${repo.forks} forks)`
      );
      continue;
    }

    // Star changes
    const starDelta = repo.stars - prev.stars;
    if (starDelta > 0) {
      notifications.push(
        `⭐ ${repo.full_name}: ${prev.stars} -> ${repo.stars} (+${starDelta} stars)`
      );
    } else if (starDelta < 0) {
      notifications.push(
        `⭐ ${repo.full_name}: ${prev.stars} -> ${repo.stars} (${starDelta} stars)`
      );
    }

    // Fork changes
    const forkDelta = repo.forks - prev.forks;
    if (forkDelta > 0) {
      notifications.push(
        `🍴 ${repo.full_name}: ${prev.forks} -> ${repo.forks} (+${forkDelta} forks)`
      );
    } else if (forkDelta < 0) {
      notifications.push(
        `🍴 ${repo.full_name}: ${prev.forks} -> ${repo.forks} (${forkDelta} forks)`
      );
    }
  }

  return notifications;
}

/**
 * Send a batch of notifications to a user
 */
export async function sendNotifications(
  token: string,
  chatId: string,
  notifications: string[]
): Promise<void> {
  if (notifications.length === 0) return;

  const header = '📢 GitHub Activity Update\n';
  const body = notifications.map((n) => `• ${n}`).join('\n');
  
  await sendPlainMessage(token, chatId, `${header}\n${body}`);
}
