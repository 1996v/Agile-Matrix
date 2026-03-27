/**
 * 数据服务抽象基类
 * 定义单机模式和多人协作模式的统一接口
 */
export class DataService {
  async loadProject() { throw new Error('Not implemented'); }
  async saveProject(data) { throw new Error('Not implemented'); }
  async lockTask(taskId, userId) {}
  async unlockTask(taskId, userId) {}
  onLockChange(callback) {}
  onDataChange(callback) {}
  dispose() {}
}
