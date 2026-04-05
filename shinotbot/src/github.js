const fetch = require('node-fetch');
const config = require('./config');

const GITHUB_API = 'https://api.github.com';
const OAUTH_ENDPOINT = 'https://github.com/login/oauth/access_token';

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: config.OAUTH_CALLBACK_URL,
    scope: 'read:user public_repo',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function exchangeCodeForToken(code, state) {
  const res = await fetch(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      state,
      redirect_uri: config.OAUTH_CALLBACK_URL,
    }),
  });
  if (!res.ok) throw new Error(`GitHub OAuth exchange failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  return data.access_token;
}

async function getAuthenticatedUser(token) {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub API /user failed: ${res.status}`);
  return res.json();
}

async function getUserRepos(token) {
  const repos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?sort=updated&per_page=100&page=${page}`,
      {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      },
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

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getUserRepos,
  getCurrentState,
};
