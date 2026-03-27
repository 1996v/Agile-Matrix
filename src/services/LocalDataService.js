import { DataService } from './DataService.js';

/**
 * 单机模式：使用浏览器 File System Access API 读写本地 JSON 文件
 */
export class LocalDataService extends DataService {
  constructor() {
    super();
    this.fileHandle = null;
    this.fileName = '未命名排期模板.json';
  }

  getFileName() {
    return this.fileName;
  }

  hasFileHandle() {
    return this.fileHandle !== null;
  }

  async newFile(emptyTemplate) {
    const handle = await window.showSaveFilePicker({
      types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
      suggestedName: '新建排期矩阵.json',
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(emptyTemplate, null, 2));
    await writable.close();
    this.fileHandle = handle;
    this.fileName = handle.name;
    return { data: emptyTemplate, fileName: handle.name };
  }

  async loadProject() {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    const content = await file.text();
    const parsed = JSON.parse(content);
    if (!parsed.months || !parsed.sprints || !parsed.swimlanes || !parsed.tasks) {
      throw new Error('文件格式不符合排期矩阵的数据结构');
    }
    this.fileHandle = handle;
    this.fileName = handle.name;
    return { data: parsed, fileName: handle.name };
  }

  async saveProject(data, suggestedName) {
    let handle = this.fileHandle;
    if (!handle) {
      handle = await window.showSaveFilePicker({
        types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
        suggestedName: suggestedName || this.fileName,
      });
      this.fileHandle = handle;
      this.fileName = handle.name;
    } else {
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') throw new Error('未获得写入权限');
      }
    }
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return { fileName: handle.name };
  }

  async autoSave(data) {
    if (!this.fileHandle) return false;
    if (await this.fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') return false;
    const writable = await this.fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  }

  // 单机模式无锁功能
  async lockTask() {}
  async unlockTask() {}
  onLockChange() {}
  onDataChange() {}
  dispose() {}
}
