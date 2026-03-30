import { DataService } from './DataService.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const WS_URL = SERVER_URL.replace(/^http/, 'ws');

/**
 * 多人协作模式：通过 HTTP API + WebSocket 与后端通信
 */
export class CollaborativeDataService extends DataService {
  constructor(userId, userName) {
    super();
    this.userId = userId;
    this.userName = userName;
    this.projectId = null;
    this.projectName = null;
    this.ws = null;
    this.lockChangeCallback = null;
    this.dataChangeCallback = null;
    this.myLockedTasks = new Set();
    this.heartbeatTimer = null;
    this._connect();
  }

  _connect() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'join',
        userId: this.userId,
        userName: this.userName,
        projectId: this.projectId,
      }));
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this._handleMessage(msg);
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      setTimeout(() => this._connect(), 3000);
    };

    this.ws.onerror = (err) => console.error('WebSocket error:', err);
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'locks_snapshot':
        if (this.lockChangeCallback) {
          const lockMap = {};
          msg.locks.forEach(l => { lockMap[l.task_id] = { userId: l.user_id, userName: l.user_name }; });
          this.lockChangeCallback({ type: 'snapshot', locks: lockMap });
        }
        break;
      case 'locked':
        if (this.lockChangeCallback)
          this.lockChangeCallback({ type: 'locked', taskId: msg.taskId, userId: msg.userId, userName: msg.userName });
        break;
      case 'unlocked':
        if (this.lockChangeCallback)
          this.lockChangeCallback({ type: 'unlocked', taskId: msg.taskId });
        break;
      case 'task_updated':
        if (this.dataChangeCallback)
          this.dataChangeCallback({ type: 'task_updated', taskId: msg.taskId, content: msg.content, userId: msg.userId });
        break;
      case 'project_updated':
        if (this.dataChangeCallback)
          this.dataChangeCallback({ type: 'project_updated', data: msg.data });
        break;
    }
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat',
          userId: this.userId,
          userName: this.userName,
          lockedTasks: Array.from(this.myLockedTasks),
        }));
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async listProjects() {
    const res = await fetch(`${SERVER_URL}/api/projects`);
    if (!res.ok) throw new Error('获取项目列表失败');
    return res.json();
  }

  async createProject(name, data) {
    const res = await fetch(`${SERVER_URL}/api/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error('创建项目失败');
    const json = await res.json();
    return json.id;
  }

  async deleteProject(projectId) {
    const res = await fetch(`${SERVER_URL}/api/project/${projectId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除项目失败');
  }

  async loadProject(projectId) {
    const res = await fetch(`${SERVER_URL}/api/project/${projectId}`);
    if (!res.ok) throw new Error('加载项目失败');
    const json = await res.json();
    this.projectId = json.id;
    this.projectName = json.name;
    // 通知 WebSocket 切换项目
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'switch_project', projectId: this.projectId }));
    }
    return { data: json.data, locks: json.locks, fileName: json.name, id: json.id };
  }

  async saveProject(data, name) {
    const projectName = name || this.projectName || '未命名项目';
    if (!this.projectId) throw new Error('未选择项目');
    const res = await fetch(`${SERVER_URL}/api/project/${this.projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, name: projectName, userId: this.userId }),
    });
    if (!res.ok) throw new Error('保存项目失败');
    this.projectName = projectName;
  }

  async lockTask(taskId) {
    this.myLockedTasks.add(taskId);
    // 立即触发本地锁定状态更新
    if (this.lockChangeCallback) {
      this.lockChangeCallback({ type: 'locked', taskId, userId: this.userId, userName: this.userName });
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'lock', taskId, userId: this.userId, userName: this.userName }));
    }
  }

  async unlockTask(taskId) {
    this.myLockedTasks.delete(taskId);
    // 立即触发本地解锁状态更新
    if (this.lockChangeCallback) {
      this.lockChangeCallback({ type: 'unlocked', taskId });
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unlock', taskId, userId: this.userId }));
    }
  }

  onLockChange(callback) { this.lockChangeCallback = callback; }
  onDataChange(callback) { this.dataChangeCallback = callback; }

  dispose() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }
}
