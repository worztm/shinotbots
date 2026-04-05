const fs = require('fs');
const path = require('path');

let data = { users: {}, snapshots: [] };
let dbPath;
let initialized = false;

function load(dbPath) {
  if (fs.existsSync(dbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {
      data = { users: {}, snapshots: [] };
    }
  }
}

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function init(p) {
  dbPath = p;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  load(dbPath);
  initialized = true;
}

// --- Users ---

function upsertUser(chatId, githubToken, githubLogin) {
  data.users[chatId] = {
    chat_id: chatId,
    github_token: githubToken,
    github_login: githubLogin,
    created_at: data.users[chatId]?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  save();
}

function getUser(chatId) {
  return data.users[chatId] || null;
}

function deleteUser(chatId) {
  delete data.users[chatId];
  data.snapshots = data.snapshots.filter((s) => s.chat_id !== chatId);
  save();
}

function listAllUsers() {
  return Object.values(data.users);
}

// --- Snapshots ---

function upsertSnapshot(chatId, repoName, stars, forks, followers) {
  const idx = data.snapshots.findIndex((s) => s.chat_id === chatId && s.repo_name === repoName);
  const entry = {
    chat_id: chatId,
    repo_name: repoName,
    stars,
    forks,
    followers,
    snapshot_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    data.snapshots[idx] = entry;
  } else {
    data.snapshots.push(entry);
  }
  save();
}

function getSnapshots(chatId) {
  return data.snapshots.filter((s) => s.chat_id === chatId);
}

module.exports = { init, upsertUser, getUser, deleteUser, listAllUsers, upsertSnapshot, getSnapshots };
