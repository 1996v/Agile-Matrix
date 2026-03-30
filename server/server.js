const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态文件（生产环境）
const path = require('path');
const distPath = path.join(__dirname, '../dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// --- REST API ---
app.get('/api/projects', (req, res) => {
  try {
    const projects = db.getAllProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/project/:id', (req, res) => {
  try {
    const project = db.getProject(parseInt(req.params.id));
    if (!project) return res.status(404).json({ error: '项目不存在' });
    const locks = db.getLocksByProject(parseInt(req.params.id));
    res.json({ ...project, locks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/project', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!data) return res.status(400).json({ error: '缺少 data 字段' });
    const id = db.createProject(name || '新项目', data);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/project/:id', (req, res) => {
  try {
    const { data, name } = req.body;
    if (!data) return res.status(400).json({ error: '缺少 data 字段' });
    const projectId = parseInt(req.params.id);
    db.saveProject(projectId, name || '未命名项目', data);
    broadcastToProject(projectId, { type: 'project_updated', projectId, data });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/project/:id', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    db.deleteProject(projectId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- WebSocket 连接管理 ---
// clients: userId -> { ws, projectId }
const clients = new Map();

wss.on('connection', (ws) => {
  let userId = null;
  let projectId = null;
  ws._projectId = null; // 挂在 ws 对象上，供广播函数使用

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join':
        userId = msg.userId;
        projectId = msg.projectId ? parseInt(msg.projectId) : null;
        ws._projectId = projectId;
        ws._userId = userId;
        clients.set(userId, { ws, projectId });
        // 发送当前项目的锁状态
        if (projectId) {
          ws.send(JSON.stringify({ type: 'locks_snapshot', locks: db.getLocksByProject(projectId) }));
        }
        break;

      case 'switch_project':
        projectId = msg.projectId ? parseInt(msg.projectId) : null;
        ws._projectId = projectId;
        if (clients.has(userId)) clients.get(userId).projectId = projectId;
        if (projectId) {
          ws.send(JSON.stringify({ type: 'locks_snapshot', locks: db.getLocksByProject(projectId) }));
        }
        break;

      case 'lock':
        if (projectId) {
          db.lockTask(msg.taskId, projectId, msg.userId, msg.userName);
          broadcastToProjectExcept(projectId, userId, { type: 'locked', taskId: msg.taskId, userId: msg.userId, userName: msg.userName });
        }
        break;

      case 'unlock':
        if (projectId) {
          db.unlockTask(msg.taskId, projectId, msg.userId);
          broadcastToProjectExcept(projectId, userId, { type: 'unlocked', taskId: msg.taskId, userId: msg.userId });
        }
        break;

      case 'heartbeat':
        if (msg.userId && msg.lockedTasks && projectId) {
          msg.lockedTasks.forEach(taskId => db.lockTask(taskId, projectId, msg.userId, msg.userName));
        }
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
        break;

      case 'save_task':
        db.saveHistory(msg.taskId, msg.userId, msg.content);
        if (msg.projectData && msg.projectId) {
          db.saveProject(parseInt(msg.projectId), msg.projectName || '未命名项目', msg.projectData);
        }
        if (projectId) {
          broadcastToProjectExcept(projectId, userId, { type: 'task_updated', taskId: msg.taskId, content: msg.content, userId: msg.userId });
        }
        break;
    }
  });

  ws.on('close', () => {
    if (userId) {
      const locks = db.getLocksByProject(projectId || 0).filter(l => l.user_id === userId);
      db.unlockAllByUser(userId);
      locks.forEach(l => broadcastToProject(projectId, { type: 'unlocked', taskId: l.task_id, userId }));
      clients.delete(userId);
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// --- 广播工具函数 ---
function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

function broadcastToProject(projectId, msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client._projectId === projectId && client.readyState === 1) client.send(data);
  });
}

function broadcastToProjectExcept(projectId, excludeUserId, msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client._projectId === projectId && client._userId !== excludeUserId && client.readyState === 1) client.send(data);
  });
}

// --- 定时清理过期锁（每分钟） ---
setInterval(() => {
  const expired = db.cleanExpiredLocks(5 * 60 * 1000);
  expired.forEach(({ taskId, projectId }) => {
    broadcastToProject(projectId, { type: 'unlocked', taskId, userId: null, reason: 'timeout' });
  });
}, 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Agile Matrix 协作服务器运行在 http://localhost:${PORT}`);
});
