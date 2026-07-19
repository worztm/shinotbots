/**
 * Shinotbot - GitHub API Helpers
 */

import type { GitHubUser, GitHubRepo, GitHubState } from './types';

const GITHUB_API = 'https://api.github.com';

const HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'shinotbot-cloudflare-worker',
};

/**
 * Get authenticated user info from GitHub
 */
export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `token ${token}`,
      ...HEADERS,
    },
  });

  const text = await res.text();
  let data: Record<string, unknown>;

  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`GitHub returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
  }

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${data.message || 'Unknown error'}`);
  }

  return data as unknown as GitHubUser;
}

/**
 * Get all repositories for the authenticated user (paginated)
 */
export async function getUserRepos(token: string): Promise<Array<{ full_name: string; stars: number; forks: number }>> {
  const repos: Array<{ full_name: string; stars: number; forks: number }> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `token ${token}`,
          ...HEADERS,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`GitHub API /user/repos failed: ${res.status}`);
    }

    const data = (await res.json()) as GitHubRepo[];
    
    repos.push(
      ...data.map((r) => ({
        full_name: r.full_name,
        stars: r.stargazers_count,
        forks: r.forks_count,
      }))
    );

    if (data.length < 100) {
      hasMore = false;
    }
    page++;
  }

  return repos;
}

/**
 * Get the complete current state (user + repos) from GitHub
 */
export async function getCurrentState(token: string): Promise<GitHubState> {
  const [user, repos] = await Promise.all([
    getAuthenticatedUser(token),
    getUserRepos(token),
  ]);
  return { user, repos };
}
