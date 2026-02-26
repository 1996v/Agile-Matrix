import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Plus, ChevronDown, ChevronRight, Undo, AlertCircle, Trash2, FilePlus, FolderOpen, Users, X, Filter, Camera } from 'lucide-react';

// --- 工具函数 ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const IS_MAC = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// 解决浮点数相加精度问题
const roundResource = (num) => Math.round(num * 10) / 10;

// --- 初始极简模板数据 ---
const emptyTemplate = {
  targetColumnWidth: 260,
  months: [
    { id: 'm1', name: '阶段 1', goal: '在此输入该阶段的核心目标\n1. 第一个拆解的关键事项\n2. 第二个拆解的关键事项' }
  ],
  sprints: [
    { id: 's1-1', monthId: 'm1', name: '迭代 1', width: 256 },
    { id: 's1-2', monthId: 'm1', name: '迭代 2', width: 256 }
  ],
  swimlanes: [
    { id: 'sw1', name: '业务线 A\n1. 底层能力建设\n2. 历史遗留问题清扫', collapsed: false },
    { id: 'sw2', name: '业务线 B\n1. 客户交付特性', collapsed: false }
  ],
  tasks: [
    { id: 't1', sprintId: 's1-1', swimlaneId: 'sw1', text: '规划阶段核心需求', order: 1, resources: { fe: '', be: '', qa: '', s: '0.5', j: '' } }
  ]
};

// --- 主应用组件 ---
export default function AgileMatrixApp() {
  const [data, setData] = useState(emptyTemplate);
  
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- 新增：自动保存相关状态 ---
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // 改造 lastSaveTime，使其同时记录时间和保存方式 { time: Date, method: 'manual' | 'auto' }
  const [lastSaveTime, setLastSaveTime] = useState(null);

  const [toastMessage, setToastMessage] = useState('');
  
  // 视图筛选状态 (更新了 s 和 j)
  const [filters, setFilters] = useState({ fe: true, be: true, qa: true, s: true, j: true });

  // 文件系统状态
  const [fileHandle, setFileHandle] = useState(null);
  const [fileName, setFileName] = useState('未命名排期模板.json');

  const [modalConfig, setModalConfig] = useState(null);
  const [columnWidths, setColumnWidths] = useState({});
  const [history, setHistory] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);

  // 导出图片与节点引用
  const matrixRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  // 复制粘贴与焦点追踪 Ref
  const hoveredTaskRef = useRef(null);
  const hoveredCellRef = useRef(null);
  const copiedTaskRef = useRef(null);

  // --- 状态更新与历史记录封装 ---
  const updateData = useCallback((action) => {
    setData(prev => {
      const nextData = typeof action === 'function' ? action(prev) : action;
      setHistory(h => [...h, prev].slice(-50)); 
      return nextData;
    });
    setIsDirty(true);
  }, []);

  const confirmModal = (message, onConfirm) => setModalConfig({ type: 'confirm', message, onConfirm });
  const alertModal = (message) => setModalConfig({ type: 'alert', message });

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  // --- 复制粘贴核心功能 ---
  const pasteTask = useCallback((sprintId, swimlaneId, template) => {
    updateData(prevData => {
      const targetCellTasks = prevData.tasks.filter(t => t.sprintId === sprintId && t.swimlaneId === swimlaneId);
      const newOrder = targetCellTasks.length > 0 ? Math.max(...targetCellTasks.map(t => t.order)) + 1 : 1;
      const newTask = { 
        ...template, 
        id: generateId(), 
        sprintId, 
        swimlaneId, 
        order: newOrder,
        resources: template.resources ? { ...template.resources } : { fe: '', be: '', qa: '', s: '', j: '' }
      };
      return { ...prevData, tasks: [...prevData.tasks, newTask] };
    });
    showToast('已粘贴事项');
  }, [updateData, showToast]);

  // --- 持久化与文件系统操作 ---
  const handleNew = async () => {
    try {
      const handle = await window.showSaveFilePicker({
        types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
        suggestedName: '新建排期矩阵.json',
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(emptyTemplate, null, 2));
      await writable.close();
      
      setFileHandle(handle);
      setFileName(handle.name);
      setData(emptyTemplate);
      setHistory([]);
      setIsDirty(false);
      setLastSaveTime({ time: new Date(), method: 'manual' });
      showToast('新建文件成功');
    } catch (err) {
      if (err.name !== 'AbortError') alertModal('新建文件失败。错误: ' + err.message);
    }
  };

  const handleOpen = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      const content = await file.text();
      const parsed = JSON.parse(content);
      
      if (parsed.months && parsed.sprints && parsed.swimlanes && parsed.tasks) {
        setFileHandle(handle);
        setFileName(handle.name);
        setData(parsed);
        setHistory([]);
        setIsDirty(false);
        setLastSaveTime(null); // 重置上次保存时间，避免引起歧义
        showToast('打开文件成功');
      } else {
        alertModal('导入失败：文件格式不符合排期矩阵的数据结构。');
      }
    } catch (err) {
      if (err.name !== 'AbortError') alertModal('打开文件失败: ' + err.message);
    }
  };

  const handleSave = useCallback(async () => {
    if ((!isDirty && fileHandle) || isAutoSaving) return; // 拦截冲突
    setIsSaving(true);
    try {
      let handle = fileHandle;
      if (!handle) {
        handle = await window.showSaveFilePicker({
          types: [{ description: '排期数据文件 (JSON)', accept: { 'application/json': ['.json'] } }],
          suggestedName: fileName,
        });
        setFileHandle(handle);
        setFileName(handle.name);
      } else {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          const permission = await handle.requestPermission({ mode: 'readwrite' });
          if (permission !== 'granted') throw new Error('未获得写入权限');
        }
      }
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      
      setIsDirty(false);
      setLastSaveTime({ time: new Date(), method: 'manual' });
      showToast('保存成功');
    } catch (err) {
      if (err.name !== 'AbortError') alertModal('保存失败: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }, [data, isDirty, fileHandle, fileName, showToast, isAutoSaving]);

  // --- 新增：核心自动保存机制 ---
  const handleAutoSave = useCallback(async () => {
    // 仅在有改动、已关联本地文件、且没有在进行任何手动/自动保存时才执行
    if (!isDirty || !fileHandle || isSaving || isAutoSaving) return;

    setIsAutoSaving(true);
    try {
      // 静默检查权限，如果没有权限说明可能过期或被撤销，此时放弃自动保存，等待用户手动点击保存触发弹窗
      if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        setIsAutoSaving(false);
        return;
      }

      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      setIsDirty(false);
      setLastSaveTime({ time: new Date(), method: 'auto' });
      // 故意不调用 showToast，实现无感静默保存
    } catch (err) {
      console.error('自动保存静默失败:', err);
    } finally {
      setIsAutoSaving(false);
    }
  }, [data, isDirty, fileHandle, isSaving, isAutoSaving]);

  // --- 新增：导出为图片功能 ---
  const handleExportImage = async () => {
    if (!matrixRef.current || isExporting) return;
    setIsExporting(true);
    showToast('正在生成高清长图，请稍候...');
    
    try {
      // 改用更现代的 html-to-image 库，完美支持 Tailwind v4 的 oklch 颜色
      if (!window.htmlToImage) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      const dataUrl = await window.htmlToImage.toPng(matrixRef.current, {
        pixelRatio: 2, // 2倍超清渲染
        backgroundColor: '#f8fafc', // 对应 bg-slate-50
      });
      
      const a = document.createElement('a');
      a.href = dataUrl;
      // 使用当前文件名 + 当前日期作为图片名
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const dateStr = new Date().toLocaleDateString().replace(/\//g, '');
      a.download = `${nameWithoutExt}_${dateStr}.png`;
      a.click();
      
      showToast('图片导出成功！');
    } catch (err) {
      console.error('导出图片失败:', err);
      alertModal('导出图片失败: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // --- 新增：基于防抖的自动保存触发器 ---
  useEffect(() => {
    // 停止操作 3 秒后触发自动保存
    if (!isDirty || !fileHandle || isSaving || isAutoSaving) return;

    const timer = setTimeout(() => {
      handleAutoSave();
    }, 3000);

    return () => clearTimeout(timer); // 任何键盘输入或数据改变都会清除计时器，重新计时
  }, [data, isDirty, fileHandle, isSaving, isAutoSaving, handleAutoSave]);


  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setData(previousState);
    setHistory(prev => prev.slice(0, -1));
    setIsDirty(true);
    showToast('已撤销');
  }, [history, showToast]);

  // 全局快捷键注册
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (hoveredTaskRef.current) {
          e.preventDefault();
          copiedTaskRef.current = hoveredTaskRef.current;
          showToast('已复制事项卡片');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (copiedTaskRef.current && hoveredCellRef.current) {
          e.preventDefault();
          pasteTask(hoveredCellRef.current.sprintId, hoveredCellRef.current.swimlaneId, copiedTaskRef.current);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleUndo, pasteTask, showToast]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确认离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // --- 过滤展示数据逻辑 ---
  const visibleTasks = data.tasks.filter(task => {
    const r = task.resources || {};
    const hasFe = parseFloat(r.fe||0) > 0;
    const hasBe = parseFloat(r.be||0) > 0;
    const hasQa = parseFloat(r.qa||0) > 0;
    const hasS = parseFloat(r.s||0) > 0;
    const hasJ = parseFloat(r.j||0) > 0;

    if (!hasFe && !hasBe && !hasQa && !hasS && !hasJ) return true;
    return (hasFe && filters.fe) || (hasBe && filters.be) || (hasQa && filters.qa) || (hasS && filters.s) || (hasJ && filters.j);
  });

  // --- 聚合当前迭代的总资源 ---
  const getSprintTotalResourcesText = (sprintId) => {
    const sprintTasks = visibleTasks.filter(t => t.sprintId === sprintId);
    let fe = 0, be = 0, qa = 0, s = 0, j = 0;
    
    sprintTasks.forEach(t => {
      if (t.resources) {
        fe += parseFloat(t.resources.fe || 0);
        be += parseFloat(t.resources.be || 0);
        qa += parseFloat(t.resources.qa || 0);
        s += parseFloat(t.resources.s || 0);
        j += parseFloat(t.resources.j || 0);
      }
    });

    const parts = [];
    if (fe > 0) parts.push(`前${roundResource(fe)}`);
    if (be > 0) parts.push(`后${roundResource(be)}`);
    if (qa > 0) parts.push(`测${roundResource(qa)}`);
    if (s > 0) parts.push(`S${roundResource(s)}`);
    if (j > 0) parts.push(`J${roundResource(j)}`);

    return parts.length > 0 ? parts.join(' ') : null;
  };

  // --- 列宽调整逻辑 ---
  const handleResizeStart = (e, targetId, isTargetColumn = false) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = isTargetColumn 
      ? (data.targetColumnWidth || 200) 
      : (data.sprints.find(s => s.id === targetId)?.width || 256);

    const onMouseMove = (moveEvent) => {
      document.body.style.userSelect = 'none';
      const newWidth = Math.max(isTargetColumn ? 120 : 160, startWidth + (moveEvent.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [targetId]: newWidth }));
    };

    const onMouseUp = (upEvent) => {
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(isTargetColumn ? 120 : 160, startWidth + (upEvent.clientX - startX));
      
      setColumnWidths(prev => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });

      if (isTargetColumn) {
        updateData(prev => ({ ...prev, targetColumnWidth: finalWidth }));
      } else {
        updateData(prev => ({
          ...prev,
          sprints: prev.sprints.map(s => s.id === targetId ? { ...s, width: finalWidth } : s)
        }));
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // --- 拖拽核心逻辑 ---
  const handleDragStart = (e, task) => {
    setDraggedItem(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id); 
    setTimeout(() => { e.target.classList.add('opacity-50'); }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-50');
    setDraggedItem(null);
  };

  const handleDropOnCell = (sprintId, swimlaneId) => {
    if (!draggedItem) return;
    if (draggedItem.sprintId === sprintId && draggedItem.swimlaneId === swimlaneId) return;

    updateData(prevData => {
      let newTasks = [...prevData.tasks];
      const targetCellTasks = newTasks.filter(t => t.sprintId === sprintId && t.swimlaneId === swimlaneId);
      const newOrder = targetCellTasks.length > 0 ? Math.max(...targetCellTasks.map(t => t.order)) + 1 : 1;

      newTasks = newTasks.map(t => t.id === draggedItem.id ? { ...t, sprintId, swimlaneId, order: newOrder } : t);

      const sourceCellTasks = newTasks
        .filter(t => t.sprintId === draggedItem.sprintId && t.swimlaneId === draggedItem.swimlaneId)
        .sort((a, b) => a.order - b.order);
        
      sourceCellTasks.forEach((t, index) => {
        const taskIndex = newTasks.findIndex(nt => nt.id === t.id);
        newTasks[taskIndex].order = index + 1;
      });
      return { ...prevData, tasks: newTasks };
    });
  };

  const handleDropOnTask = (e, targetTask) => {
    e.stopPropagation();
    if (!draggedItem || draggedItem.id === targetTask.id) return;

    updateData(prevData => {
      let newTasks = [...prevData.tasks];
      const targetCellTasks = newTasks.filter(t => t.sprintId === targetTask.sprintId && t.swimlaneId === targetTask.swimlaneId).sort((a, b) => a.order - b.order);
      const sourceTasks = newTasks.filter(t => t.sprintId === draggedItem.sprintId && t.swimlaneId === draggedItem.swimlaneId);

      if (draggedItem.sprintId !== targetTask.sprintId || draggedItem.swimlaneId !== targetTask.swimlaneId) {
          sourceTasks.filter(t => t.id !== draggedItem.id).sort((a,b)=>a.order - b.order).forEach((t, index) => {
              const idx = newTasks.findIndex(nt => nt.id === t.id);
              newTasks[idx].order = index + 1;
          });
      }

      const draggedIndexInNewTasks = newTasks.findIndex(t => t.id === draggedItem.id);
      newTasks[draggedIndexInNewTasks] = { ...newTasks[draggedIndexInNewTasks], sprintId: targetTask.sprintId, swimlaneId: targetTask.swimlaneId };

      const updatedTargetTasks = targetCellTasks.filter(t => t.id !== draggedItem.id);
      const dropIndex = updatedTargetTasks.findIndex(t => t.id === targetTask.id);
      
      updatedTargetTasks.splice(dropIndex, 0, newTasks[draggedIndexInNewTasks]);

      updatedTargetTasks.forEach((t, index) => {
          const idx = newTasks.findIndex(nt => nt.id === t.id);
          newTasks[idx].order = index + 1;
      });
      return { ...prevData, tasks: newTasks };
    });
  };

  // --- CRUD 操作 ---
  const addTask = (sprintId, swimlaneId) => {
    updateData(prevData => {
      const targetCellTasks = prevData.tasks.filter(t => t.sprintId === sprintId && t.swimlaneId === swimlaneId);
      const newOrder = targetCellTasks.length > 0 ? Math.max(...targetCellTasks.map(t => t.order)) + 1 : 1;
      const newTask = { 
        id: generateId(), 
        sprintId, 
        swimlaneId, 
        text: '新事项', 
        order: newOrder,
        resources: { fe: '', be: '', qa: '', s: '', j: '' } 
      };
      return { ...prevData, tasks: [...prevData.tasks, newTask] };
    });
  };

  const updateTaskText = (taskId, newText) => {
    updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, text: newText } : t) }));
  };

  const updateTaskResources = (taskId, newResources) => {
    updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, resources: newResources } : t) }));
  };

  const deleteTask = (taskId) => {
    updateData(prevData => {
      const taskToDelete = prevData.tasks.find(t => t.id === taskId);
      if (!taskToDelete) return prevData;

      let newTasks = prevData.tasks.filter(t => t.id !== taskId);
      const cellTasks = newTasks
        .filter(t => t.sprintId === taskToDelete.sprintId && t.swimlaneId === taskToDelete.swimlaneId)
        .sort((a, b) => a.order - b.order);
        
      cellTasks.forEach((t, index) => {
        const idx = newTasks.findIndex(nt => nt.id === t.id);
        newTasks[idx].order = index + 1;
      });

      return { ...prevData, tasks: newTasks };
    });
  };

  const toggleSwimlane = (swimlaneId) => {
    updateData(prev => ({ ...prev, swimlanes: prev.swimlanes.map(s => s.id === swimlaneId ? { ...s, collapsed: !s.collapsed } : s) }));
  };

  const updateGoalText = (type, id, newText) => {
    updateData(prev => {
      if (type === 'month') return { ...prev, months: prev.months.map(m => m.id === id ? { ...m, goal: newText } : m) };
      if (type === 'monthName') return { ...prev, months: prev.months.map(m => m.id === id ? { ...m, name: newText } : m) };
      if (type === 'swimlane') return { ...prev, swimlanes: prev.swimlanes.map(s => s.id === id ? { ...s, name: newText } : s) };
      if (type === 'sprint') return { ...prev, sprints: prev.sprints.map(s => s.id === id ? { ...s, name: newText } : s) };
      return prev;
    });
  };

  const addMonth = () => {
    updateData(prevData => {
      const newMonthId = generateId();
      const newMonth = { id: newMonthId, name: '新阶段', goal: '阶段核心目标...' };
      const newSprint = { id: generateId(), monthId: newMonthId, name: '新迭代', width: 256 };
      return { ...prevData, months: [...prevData.months, newMonth], sprints: [...prevData.sprints, newSprint] };
    });
  };

  const deleteMonth = (monthId) => {
    confirmModal('确定删除该阶段吗？将同时删除下属的所有迭代及排期事项。', () => {
      updateData(prevData => {
        const sprintsToRemove = prevData.sprints.filter(s => s.monthId === monthId).map(s => s.id);
        return {
          ...prevData,
          months: prevData.months.filter(m => m.id !== monthId),
          sprints: prevData.sprints.filter(s => s.monthId !== monthId),
          tasks: prevData.tasks.filter(t => !sprintsToRemove.includes(t.sprintId))
        };
      });
    });
  };

  const addSprint = (monthId) => {
    updateData(prevData => {
      const newSprint = { id: generateId(), monthId, name: '新迭代', width: 256 };
      const lastSprintIndex = prevData.sprints.map(s => s.monthId).lastIndexOf(monthId);
      const newSprints = [...prevData.sprints];
      newSprints.splice(lastSprintIndex >= 0 ? lastSprintIndex + 1 : newSprints.length, 0, newSprint);
      return { ...prevData, sprints: newSprints };
    });
  };

  const deleteSprint = (sprintId) => {
    const sprint = data.sprints.find(s => s.id === sprintId);
    const monthSprints = data.sprints.filter(s => s.monthId === sprint.monthId);
    
    if (monthSprints.length <= 1) {
      alertModal('这是该阶段下的最后一个迭代，无法直接删除。请直接删除整个阶段。');
      return;
    }
    
    confirmModal('确定删除该迭代吗？将同时删除该迭代内的所有排期事项。', () => {
      updateData(prevData => ({
        ...prevData,
        sprints: prevData.sprints.filter(s => s.id !== sprintId),
        tasks: prevData.tasks.filter(t => t.sprintId !== sprintId)
      }));
    });
  };

  const addSwimlane = () => {
    updateData(prev => ({
      ...prev,
      swimlanes: [...prev.swimlanes, { id: generateId(), name: '新增目标\n1. 新子事项', collapsed: false }]
    }));
  };

  const deleteSwimlane = (swimlaneId) => {
    confirmModal('确定删除该横向目标吗？将同时删除该条线上的所有排期事项。', () => {
      updateData(prevData => ({
        ...prevData,
        swimlanes: prevData.swimlanes.filter(sw => sw.id !== swimlaneId),
        tasks: prevData.tasks.filter(t => t.swimlaneId !== swimlaneId)
      }));
    });
  };

  const currentTargetColWidth = columnWidths['targetCol'] || data.targetColumnWidth || 200;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-sm font-sans text-slate-800">

      {/* 弹窗遮罩 */}
      {modalConfig && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-slate-200">
            <div className="flex items-start mb-4">
              <AlertCircle className="text-orange-500 mr-3 shrink-0" size={24} />
              <p className="text-slate-800 text-base font-medium leading-relaxed mt-0.5">{modalConfig.message}</p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              {modalConfig.type === 'confirm' && (
                <button onClick={() => setModalConfig(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium">取消</button>
              )}
              <button onClick={() => { if (modalConfig.onConfirm) modalConfig.onConfirm(); setModalConfig(null); }} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-300 shadow-sm z-50">
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-800">敏捷全景排期矩阵</h1>
            
            {/* 新增：状态提示区，支持未保存/自动保存中/已自动保存的优雅切换 */}
            <div className="flex items-center min-w-[120px]">
              {isDirty && !isAutoSaving && (
                <span className="flex items-center text-orange-600 text-xs font-semibold px-2.5 py-0.5 bg-orange-50 rounded-full border border-orange-200">
                  <AlertCircle size={14} className="mr-1" />未保存
                </span>
              )}
              {isAutoSaving && (
                <span className="flex items-center text-blue-600 text-xs font-semibold px-2.5 py-0.5 bg-blue-50 rounded-full border border-blue-200">
                  <svg className="animate-spin -ml-1 mr-1.5 h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  自动保存中...
                </span>
              )}
              {/* 精准显示最后保存时间和保存方式 */}
              {!isDirty && lastSaveTime && !isAutoSaving && (
                <span className="flex items-center text-slate-400 text-xs font-medium px-2.5 py-0.5 animate-fade-in" title={`更新于 ${lastSaveTime.time.toLocaleTimeString()}`}>
                   ✓ 已{lastSaveTime.method === 'auto' ? '自动' : '手动'}保存 ({lastSaveTime.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                </span>
              )}
            </div>

            {/* 视图筛选复选框组 */}
            <div className="flex items-center gap-3 ml-2 pl-4 border-l border-slate-200">
              <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                <Filter size={12} /> 视图过滤
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-blue-600 transition-colors">
                <input type="checkbox" checked={filters.fe} onChange={e=>setFilters({...filters, fe: e.target.checked})} className="accent-blue-500 rounded-sm w-3 h-3"/> 前
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" checked={filters.be} onChange={e=>setFilters({...filters, be: e.target.checked})} className="accent-indigo-500 rounded-sm w-3 h-3"/> 后
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-emerald-600 transition-colors">
                <input type="checkbox" checked={filters.qa} onChange={e=>setFilters({...filters, qa: e.target.checked})} className="accent-emerald-500 rounded-sm w-3 h-3"/> 测
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-purple-600 transition-colors">
                <input type="checkbox" checked={filters.s} onChange={e=>setFilters({...filters, s: e.target.checked})} className="accent-purple-500 rounded-sm w-3 h-3"/> S
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-pink-600 transition-colors">
                <input type="checkbox" checked={filters.j} onChange={e=>setFilters({...filters, j: e.target.checked})} className="accent-pink-500 rounded-sm w-3 h-3"/> J
              </label>
            </div>
          </div>
          <span className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
             {fileName}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 文件系统操作按钮组 */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200">
            <button onClick={handleNew} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md transition-all font-medium text-xs shadow-sm" title="新建空白排期文件">
              <FilePlus size={14} /> 新建
            </button>
            <div className="w-[1px] h-4 bg-slate-300 mx-1"></div>
            <button onClick={handleOpen} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md transition-all font-medium text-xs shadow-sm" title="打开本地 JSON 数据">
              <FolderOpen size={14} /> 打开
            </button>
            <div className="w-[1px] h-4 bg-slate-300 mx-1"></div>
            <button onClick={handleExportImage} disabled={isExporting} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-md transition-all font-medium text-xs shadow-sm disabled:opacity-50" title="导出当前完整视图为高清图片">
              {isExporting ? <svg className="animate-spin h-3.5 w-3.5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <Camera size={14} />} 导出
            </button>
          </div>

          <button onClick={handleUndo} disabled={history.length === 0} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors" title={`撤销 (${IS_MAC ? 'Cmd' : 'Ctrl'}+Z)`}>
            <Undo size={18} />
          </button>
          <button onClick={handleSave} disabled={(!isDirty && fileHandle !== null) || isAutoSaving} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${((!isDirty && fileHandle !== null) || isAutoSaving) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30'}`}>
            <Save size={16} />
            {isSaving ? '保存中...' : `保存 (${IS_MAC ? 'Cmd' : 'Ctrl'}+S)`}
          </button>
        </div>
      </header>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-2.5 rounded-lg shadow-xl z-50 animate-fade-in-down font-medium text-sm flex items-center gap-2">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          {toastMessage}
        </div>
      )}

      {/* Matrix Area */}
      <div className="flex-1 overflow-auto bg-slate-50 relative custom-scrollbar">
        <table ref={matrixRef} className="w-full border-collapse border-2 border-slate-300 min-w-max bg-slate-50">
          <thead className="sticky top-0 z-30">
            {/* Months Row */}
            <tr>
              <th 
                className="sticky left-0 top-0 z-40 bg-slate-100 border-b-2 border-slate-300 border-r-2 border-r-slate-400 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] relative"
                style={{ width: currentTargetColWidth, minWidth: currentTargetColWidth }}
              >
                <div className="flex justify-center items-center h-full p-3 font-bold text-slate-700">目标</div>
                <div 
                  className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 transition-colors"
                  onMouseDown={(e) => handleResizeStart(e, 'targetCol', true)}
                />
              </th>
              {data.months.map(month => {
                const colSpan = data.sprints.filter(s => s.monthId === month.id).length;
                return (
                  <th key={month.id} colSpan={colSpan || 1} className="bg-white border border-slate-300 align-top p-0 group/month">
                    <div className="flex flex-col h-full">
                      <div className="bg-slate-100 py-2 px-6 flex justify-center items-center font-bold text-slate-800 border-b border-slate-300 relative">
                        <EditableText 
                           value={month.name} 
                           onChange={(val) => updateGoalText('monthName', month.id, val)}
                           className="outline-none text-center hover:bg-slate-200 rounded px-2 transition-colors"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/month:opacity-100 flex items-center gap-1 transition-opacity">
                          <button onClick={() => addSprint(month.id)} className="p-1 text-slate-500 hover:text-blue-600 bg-white shadow-sm rounded border border-slate-300" title="新增迭代"><Plus size={14} /></button>
                          <button onClick={() => deleteMonth(month.id)} className="p-1 text-slate-500 hover:text-red-500 bg-white shadow-sm rounded border border-slate-300" title="删除该阶段"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="p-2 flex-1 flex justify-center">
                        <EditableText 
                           value={month.goal} 
                           onChange={(val) => updateGoalText('month', month.id, val)}
                           className="w-full text-xs text-slate-600 outline-none resize-none bg-transparent hover:bg-slate-100 p-1.5 rounded transition-colors text-center"
                           placeholder="输入阶段目标..."
                           multiline
                           formatAsGoal={true}
                        />
                      </div>
                    </div>
                  </th>
                );
              })}
              <th className="bg-slate-100 border border-slate-300 w-12 hover:bg-blue-50 cursor-pointer transition-colors group" rowSpan={2} onClick={addMonth} title="新增阶段">
                <div className="flex justify-center items-center h-full text-slate-400 group-hover:text-blue-600"><Plus size={24} /></div>
              </th>
            </tr>
            {/* Sprints Row */}
            <tr>
              <th 
                className="sticky left-0 z-40 bg-slate-100 border-b border-slate-300 border-r-2 border-r-slate-400 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                style={{ width: currentTargetColWidth, minWidth: currentTargetColWidth }}
              ></th>
              {data.sprints.map(sprint => {
                const cellWidth = columnWidths[sprint.id] || sprint.width || 256;
                const totalResText = getSprintTotalResourcesText(sprint.id);

                return (
                  <th 
                    key={sprint.id} 
                    style={{ width: cellWidth, minWidth: cellWidth }}
                    className="bg-slate-100 border border-slate-300 p-2 text-center relative group/sprint"
                  >
                    <div className="flex flex-col justify-center items-center px-4">
                      <EditableText 
                         value={sprint.name} 
                         onChange={(val) => updateGoalText('sprint', sprint.id, val)}
                         className="outline-none text-sm font-semibold text-slate-700 text-center hover:bg-slate-200 rounded px-2 transition-colors"
                      />
                      {/* 迭代资源汇总展示 */}
                      {totalResText ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium shadow-sm">
                           <Users size={10} /> {totalResText}
                        </div>
                      ) : (
                        <div className="h-4"></div>
                      )}
                    </div>
                    <button onClick={() => deleteSprint(sprint.id)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/sprint:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity bg-white shadow-sm border border-slate-200 rounded"><Trash2 size={14} /></button>
                    <div className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 transition-colors" onMouseDown={(e) => handleResizeStart(e, sprint.id)}/>
                  </th>
                );
              })}
            </tr>
          </thead>
          
          <tbody>
            {data.swimlanes.map(swimlane => (
              <React.Fragment key={swimlane.id}>
                <tr>
                  {/* 泳道头 (固定在左侧) */}
                  <td 
                    className="sticky left-0 z-20 bg-white border border-slate-300 border-r-2 border-r-slate-400 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] align-top group/swimlane"
                    style={{ width: currentTargetColWidth, minWidth: currentTargetColWidth }}
                  >
                    <div className="p-3 flex items-start gap-1">
                      <button onClick={() => toggleSwimlane(swimlane.id)} className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0 bg-slate-100 rounded hover:bg-slate-200">
                        {swimlane.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <div className="flex-1 relative">
                        <EditableText 
                           value={swimlane.name} 
                           onChange={(val) => updateGoalText('swimlane', swimlane.id, val)}
                           className="font-bold text-slate-800 text-sm outline-none resize-none bg-transparent hover:bg-slate-100 p-1.5 rounded w-full pr-6"
                           multiline
                           formatAsGoal={true}
                        />
                        <button onClick={() => deleteSwimlane(swimlane.id)} className="absolute right-0 top-0 opacity-0 group-hover/swimlane:opacity-100 p-1.5 text-slate-400 hover:text-red-500 bg-white rounded shadow-sm border border-slate-300"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </td>

                  {/* 矩阵格子 */}
                  {data.sprints.map(sprint => {
                    // 使用过滤后的可见任务列表进行渲染
                    const cellTasks = visibleTasks
                      .filter(t => t.sprintId === sprint.id && t.swimlaneId === swimlane.id)
                      .sort((a, b) => a.order - b.order);
                    
                    const cellWidth = columnWidths[sprint.id] || sprint.width || 256;

                    return (
                      <td 
                        key={`${swimlane.id}-${sprint.id}`} 
                        style={{ width: cellWidth, minWidth: cellWidth }}
                        className={`border border-slate-300 align-top p-2 bg-white transition-colors hover:bg-slate-50/50 ${swimlane.collapsed ? 'hidden' : ''}`}
                      >
                        <DroppableCell 
                          sprintId={sprint.id} 
                          swimlaneId={swimlane.id}
                          onDrop={handleDropOnCell}
                          onMouseEnter={() => hoveredCellRef.current = { sprintId: sprint.id, swimlaneId: swimlane.id }}
                        >
                          <div className="flex flex-col gap-2.5 min-h-[60px]">
                            {cellTasks.map(task => (
                              <DraggableTask
                                key={task.id}
                                task={task}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onDropOnTask={handleDropOnTask}
                                onUpdateText={updateTaskText}
                                onUpdateResources={updateTaskResources}
                                onDelete={deleteTask}
                                onMouseEnter={() => hoveredTaskRef.current = task}
                                onMouseLeave={() => { if(hoveredTaskRef.current?.id === task.id) hoveredTaskRef.current = null; }}
                              />
                            ))}
                            
                            {/* 快捷新建按钮 */}
                            <button
                              onClick={() => addTask(sprint.id, swimlane.id)}
                              className="flex items-center gap-1.5 text-xs text-slate-400 font-medium hover:text-blue-600 py-1.5 px-2 rounded-md hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                              style={{ opacity: cellTasks.length === 0 ? 1 : undefined }}
                            >
                              <Plus size={14} /> 新增事项
                            </button>
                          </div>
                        </DroppableCell>
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            ))}
            
            {/* 新增泳道按钮行 */}
            <tr>
              <td 
                className="sticky left-0 z-20 bg-white border border-slate-300 border-r-2 border-r-slate-400 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] p-0"
                style={{ width: currentTargetColWidth, minWidth: currentTargetColWidth }}
              >
                <button onClick={addSwimlane} className="w-full h-full flex items-center justify-center gap-2 p-3.5 text-sm text-slate-500 font-medium hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Plus size={16} /> 新增横向目标
                </button>
              </td>
              <td colSpan={data.sprints.length + 1} className="bg-slate-50/50 border border-slate-300"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 子组件：可释放的格子容器 ---
function DroppableCell({ children, sprintId, swimlaneId, onDrop, onMouseEnter }) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = () => setIsOver(true);
  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsOver(false);
    onDrop(sprintId, swimlaneId);
  };

  return (
    <div 
      className={`h-full w-full rounded-lg transition-all duration-200 group ${isOver ? 'bg-blue-50 outline-dashed outline-2 outline-blue-400 outline-offset-[-2px]' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={onMouseEnter}
    >
      {children}
    </div>
  );
}

// --- 子组件：可拖拽的卡片 ---
function DraggableTask({ task, onDragStart, onDragEnd, onDropOnTask, onUpdateText, onUpdateResources, onDelete, onMouseEnter, onMouseLeave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingResources, setIsEditingResources] = useState(false);
  
  const [resData, setResData] = useState(task.resources || { fe: '', be: '', qa: '', s: '', j: '' });
  
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef(null);
  const popoverRef = useRef(null);
  const resDataRef = useRef(resData);

  // 保证闭包内获取的是最新的表单数据
  useEffect(() => { resDataRef.current = resData; }, [resData]);

  // 处理文本编辑时光标居末
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      const val = inputRef.current.value;
      inputRef.current.value = '';
      inputRef.current.value = val;
    }
  }, [isEditing]);

  // 全局拦截：鼠标点击空白区域自动保存并关闭资源弹窗
  useEffect(() => {
    if (!isEditingResources) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsEditingResources(false);
        onUpdateResources(task.id, resDataRef.current);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditingResources, task.id, onUpdateResources]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onDropOnTask(e, task);
  };

  const handleTextBlur = (e) => {
    setIsEditing(false);
    if (e.target.value.trim() !== task.text) {
      onUpdateText(task.id, e.target.value);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const val = e.target.value;
        e.target.value = val.substring(0, start) + '\n' + val.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 1;
      } else {
        e.preventDefault();
        e.target.blur();
      }
    }
  };

  const hasResources = task.resources && 
    (parseFloat(task.resources.fe || 0) > 0 || 
     parseFloat(task.resources.be || 0) > 0 || 
     parseFloat(task.resources.qa || 0) > 0 || 
     parseFloat(task.resources.s || 0) > 0 ||
     parseFloat(task.resources.j || 0) > 0);

  return (
    <div
      draggable={!isEditing && !isEditingResources}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative group bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-700 hover:border-blue-400 shadow-sm hover:shadow-md transition-all duration-200
        ${isOver ? 'border-t-[3px] border-t-blue-500' : ''}
        ${(!isEditing && !isEditingResources) ? 'cursor-grab active:cursor-grabbing' : ''}
      `}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          defaultValue={task.text}
          onBlur={handleTextBlur}
          onKeyDown={handleKeyDown}
          className="w-full min-h-[50px] p-1.5 border-2 border-blue-400 rounded-md outline-none resize-none leading-relaxed text-slate-800"
          rows={4}
          title="敲击 Enter 保存，Ctrl+Enter 换行"
        />
      ) : (
        <div className="flex flex-col">
          <div className="flex items-start gap-1">
            <span className="font-semibold text-slate-400 shrink-0 mt-[1px] select-none">{task.order}.</span>
            <div 
              className="flex-1 whitespace-pre-wrap break-words leading-relaxed" 
              title="双击进行编辑"
              onDoubleClick={() => setIsEditing(true)}
            >
              {task.text}
            </div>
          </div>
          
          {/* 任务卡片微标区 */}
          {!isEditingResources && hasResources && (
             <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] select-none">
                {parseFloat(task.resources.fe || 0) > 0 && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">前 {task.resources.fe}</span>}
                {parseFloat(task.resources.be || 0) > 0 && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">后 {task.resources.be}</span>}
                {parseFloat(task.resources.qa || 0) > 0 && <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">测 {task.resources.qa}</span>}
                {parseFloat(task.resources.s || 0) > 0 && <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">S {task.resources.s}</span>}
                {parseFloat(task.resources.j || 0) > 0 && <span className="bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded border border-pink-100">J {task.resources.j}</span>}
             </div>
          )}
        </div>
      )}

      {/* 资源配置弹层区 */}
      {isEditingResources && (
        <div 
          ref={popoverRef}
          className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded-md shadow-sm"
          onClick={(e) => e.stopPropagation()} 
          onKeyDown={(e) => {
             if (e.key === 'Enter') {
                e.preventDefault();
                setIsEditingResources(false);
                onUpdateResources(task.id, resData);
             }
          }}
        >
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="font-medium text-slate-600 flex items-center gap-1"><Users size={12}/> 资源排期</span>
            <button onClick={() => { setIsEditingResources(false); onUpdateResources(task.id, resData); }} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200 focus-within:border-blue-400 transition-colors">
              <span className="text-slate-400 w-4 font-medium shrink-0">前</span>
              <input type="number" step="0.1" min="0" placeholder="0" className="w-full outline-none text-slate-700 bg-transparent" value={resData.fe} onChange={e => setResData({...resData, fe: e.target.value})} />
            </label>
            <label className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200 focus-within:border-blue-400 transition-colors">
              <span className="text-slate-400 w-4 font-medium shrink-0">后</span>
              <input type="number" step="0.1" min="0" placeholder="0" className="w-full outline-none text-slate-700 bg-transparent" value={resData.be} onChange={e => setResData({...resData, be: e.target.value})} />
            </label>
            <label className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200 focus-within:border-blue-400 transition-colors">
              <span className="text-slate-400 w-4 font-medium shrink-0">测</span>
              <input type="number" step="0.1" min="0" placeholder="0" className="w-full outline-none text-slate-700 bg-transparent" value={resData.qa} onChange={e => setResData({...resData, qa: e.target.value})} />
            </label>
            <label className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200 focus-within:border-blue-400 transition-colors">
              <span className="text-slate-400 w-4 font-medium shrink-0">S</span>
              <input type="number" step="0.1" min="0" placeholder="0" className="w-full outline-none text-slate-700 bg-transparent" value={resData.s} onChange={e => setResData({...resData, s: e.target.value})} />
            </label>
            <label className="flex items-center gap-1.5 bg-white p-1 rounded border border-slate-200 focus-within:border-blue-400 transition-colors">
              <span className="text-slate-400 w-4 font-medium shrink-0">J</span>
              <input type="number" step="0.1" min="0" placeholder="0" className="w-full outline-none text-slate-700 bg-transparent" value={resData.j} onChange={e => setResData({...resData, j: e.target.value})} />
            </label>
          </div>
        </div>
      )}
      
      {/* 悬浮操作栏 */}
      {!isEditing && !isEditingResources && (
        <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-1 bg-white/95 rounded-md p-1 backdrop-blur-md shadow-md border border-slate-200 z-10">
           <button onClick={() => setIsEditingResources(true)} className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors" title="分配资源">
             <Users size={12} />
           </button>
           <div className="w-[1px] h-3 bg-slate-200"></div>
           <button onClick={() => setIsEditing(true)} className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors" title="编辑文本">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
           </button>
           <button onClick={() => onDelete(task.id)} className="text-slate-500 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors" title="删除事项">
             <Trash2 size={12} />
           </button>
        </div>
      )}
    </div>
  );
}

// --- 子组件：通用行内可编辑文本 ---
function EditableText({ value, onChange, className, placeholder, multiline, formatAsGoal }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const ref = useRef(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      if (multiline) {
        ref.current.style.height = 'auto';
        ref.current.style.height = ref.current.scrollHeight + 'px';
      }
    }
  }, [isEditing, multiline]);

  const handleBlur = () => {
    setIsEditing(false);
    if (currentValue !== value) {
      onChange(currentValue);
    }
  };

  const handleChange = (e) => {
    setCurrentValue(e.target.value);
    if (multiline && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };

  if (isEditing) {
    return multiline ? (
      <textarea
        ref={ref}
        value={currentValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${className} border-2 border-blue-400 bg-white`}
        placeholder={placeholder}
      />
    ) : (
      <input
        ref={ref}
        value={currentValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && ref.current.blur()}
        className={`${className} border-2 border-blue-400 bg-white`}
        placeholder={placeholder}
      />
    );
  }

  // 特殊排版呈现：目标列（区分大标题和细化的拆解事项）
  if (formatAsGoal && value) {
    const lines = value.split('\n');
    const title = lines[0] || '';
    const rest = lines.slice(1).join('\n');
    const isCenter = className.includes('text-center');
    
    return (
      <div 
        className={`cursor-pointer flex flex-col w-full ${isCenter ? 'text-center items-center' : 'text-left'} ${className}`}
        onClick={() => setIsEditing(true)}
        title="点击进行编辑"
      >
        <div className={`font-bold text-slate-800 ${className.includes('text-sm') ? 'text-sm' : 'text-[13px]'} leading-tight`}>{title}</div>
        {rest && <div className={`text-xs text-slate-500 font-normal mt-1 leading-relaxed whitespace-pre-wrap ${isCenter ? 'text-center' : 'text-left'}`}>{rest}</div>}
      </div>
    );
  }

  return (
    <div 
      className={`whitespace-pre-wrap cursor-pointer ${className} min-h-[1.5em]`}
      onClick={() => setIsEditing(true)}
      title="点击进行编辑"
    >
      {value || <span className="text-slate-400 italic font-normal">{placeholder}</span>}
    </div>
  );
}