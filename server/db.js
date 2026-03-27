const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'agile-matrix.db');
const db = new Database(DB_PATH);

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '默认项目',
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locks (
    task_id TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '匿名用户',
    locked_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
`);

// --- 项目 CRUD ---
const getAllProjects = db.prepare('SELECT id, name FROM projects ORDER BY id');
const getProject = db.prepare('SELECT * FROM projects WHERE id = ?');
const createProject = db.prepare('INSERT INTO projects (name, data) VALUES (?, ?)');
const saveProject = db.prepare('UPDATE projects SET data = ?, name = ? WHERE id = ?');

// --- 锁操作 ---
const getLocksByProject = db.prepare('SELECT * FROM locks WHERE project_id = ?');
const lockTask = db.prepare(`
  INSERT OR REPLACE INTO locks (task_id, project_id, user_id, user_name, locked_at) VALUES (?, ?, ?, ?, ?)
`);
const unlockTask = db.prepare('DELETE FROM locks WHERE task_id = ? AND project_id = ? AND user_id = ?');
const unlockAllByUser = db.prepare('DELETE FROM locks WHERE user_id = ?');
const getExpiredLocks = db.prepare('SELECT task_id, project_id FROM locks WHERE locked_at < ?');
const deleteExpiredLocks = db.prepare('DELETE FROM locks WHERE locked_at < ?');

// --- 历史记录 ---
const saveHistory = db.prepare(`
  INSERT INTO task_history (task_id, user_id, content, saved_at) VALUES (?, ?, ?, ?)
`);

module.exports = {
  getAllProjects: () => getAllProjects.all(),
  getProject: (id) => {
    const row = getProject.get(id);
    if (!row) return null;
    return { ...row, data: JSON.parse(row.data) };
  },
  createProject: (name, data) => {
    const result = createProject.run(name, JSON.stringify(data));
    return result.lastInsertRowid;
  },
  saveProject: (id, name, data) => {
    saveProject.run(JSON.stringify(data), name, id);
  },
  getLocksByProject: (projectId) => getLocksByProject.all(projectId),
  lockTask: (taskId, projectId, userId, userName) => {
    lockTask.run(taskId, projectId, userId, userName || '匿名用户', Date.now());
  },
  unlockTask: (taskId, projectId, userId) => {
    unlockTask.run(taskId, projectId, userId);
  },
  unlockAllByUser: (userId) => {
    unlockAllByUser.run(userId);
  },
  cleanExpiredLocks: (ttlMs = 5 * 60 * 1000) => {
    const expiredBefore = Date.now() - ttlMs;
    const expired = getExpiredLocks.all(expiredBefore);
    deleteExpiredLocks.run(expiredBefore);
    return expired.map(r => ({ taskId: r.task_id, projectId: r.project_id }));
  },
  saveHistory: (taskId, userId, content) => {
    saveHistory.run(taskId, userId, JSON.stringify(content), Date.now());
  },
};
