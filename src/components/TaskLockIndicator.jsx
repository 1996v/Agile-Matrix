import React from 'react';

/**
 * 任务锁定覆盖层 - 当其他用户锁定任务时显示红色标识
 */
export default function TaskLockIndicator({ userName }) {
  return (
    <div className="absolute inset-0 rounded-lg bg-red-500/10 border-2 border-red-400 z-10 flex items-start justify-end p-1 pointer-events-none">
      <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-medium max-w-[80px] truncate">
        {userName || '他人编辑中'}
      </span>
    </div>
  );
}
