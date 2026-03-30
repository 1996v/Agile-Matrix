# Agile Matrix - 敏捷全景排期矩阵
Agile Matrix 是一款基于 React + Tailwind CSS 构建的**单机、轻量级**敏捷路线图与迭代排期工具。致力于解决传统 Excel 排期维护繁琐、不易拖拽关联、长周期目标与底层任务对齐困难的痛点。

它**无需任何后端数据库**，所有数据完全基于现代浏览器的 `File System Access API` 直接读写本地的 JSON 文件。这使得该应用不仅能够做到极致的安全与隐私，还能像传统的 Word / Excel 一样，实现不同项目、不同文件之间的数据完全隔离。

## ✨ 核心特性
+ **🚀**** 极速拖拽排期 (Drag & Drop)**：支持卡片在不同 Sprint 迭代和业务泳道之间自由流转，目标格子自动追加，源格子序号自动向上递补。
+ **📊**** 跨层级目标冻结对齐**：纵横二维表头冻结。不论页面如何滚动，顶部的“阶段大目标”和左侧的“业务线目标”永远固定在视野内。
+ **👥**** 精细化资源管理**：每张任务卡片支持独立填报开发资源（前端、后端、测试、规划），Sprint 顶部将自动汇总各角色的总人天开销。
+ **💾**** 本地文件系统直写**：采用原生的“新建/打开/保存”心智模型。直接在你的本地硬盘建立或修改 `.json` 排期文件，安全可靠。
+ **⏪**** 撤销与防丢机制**：内置 50 步操作历史记录 (`Ctrl+Z` 撤销)。存在未保存变动时，阻拦页面关闭刷新。

## 🛠️ 如何启动本项目？
本项目提供两种使用模式：**单机本地模式**（无需后端，数据存在本地文件）和**多人协作模式**（带后端服务器，支持多端实时同步）。

### 启动方式一：多人协作模式（Server 模式）- 推荐团队使用
如果你需要多人同时在线排期、数据自动云端同步、避免编辑冲突，请使用此模式。

**前置要求**：安装了 Node.js (推荐 v18+)。

1. 启动后端服务器：
进入 `server` 目录，安装依赖并启动服务：
```bash
cd server
npm install
npm start
```
*此时后端服务将运行在 `http://localhost:3001`，并使用 SQLite 作为轻量数据库 `agile-matrix.db`。*

2. 启动前端页面：
新开一个终端窗口，回到项目根目录，安装依赖并启动：
```bash
cd ..
npm install
npm run dev
```

3. 在浏览器中打开 `http://localhost:5173/`。你现在可以在不同浏览器窗口或不同电脑（需在同一局域网并修改连接 IP）上体验任务卡片的实时拖拽和锁定同步了！

### 启动方式二：单机本地模式（纯前端）
如果你只是个人排期，不需要多端同步，你可以直接启动前端项目。所有数据将通过浏览器的 `File System Access API` 直接保存在你的本地硬盘中。

1. 进入项目根目录并安装依赖：

```plain
npm install
```

2. 启动本地开发服务器：

```plain
npm run dev
```

3. 在浏览器中打开 `http://localhost:5173/`。

### 启动方式三：从零创建单文件版本（纯净重建）
如果你在某些特殊环境下，手头只有一份核心代码文件 (`App.jsx`)，你可以通过 Vite 快速重新构建整个项目工程结构。

**步骤 1：使用 Vite 创建空的 React 项目** 打开终端（或命令提示符），输入以下命令（中途遇到提示请用方向键选择 `React` 和 `JavaScript`）：

```plain
npm create vite@latest agile-matrix -- --template react
```

**步骤 2：进入目录并安装核心依赖**

```plain
cd agile-matrix
npm install
# 安装本工具需要的图标库和全新 V4 版的 Tailwind 插件
npm install lucide-react @tailwindcss/vite
```

**步骤 3：配置环境**

+ **1. 修改配置:** 打开根目录的 `vite.config.js`，加入 tailwind 插件：

```plain
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

+ **2. 引入样式:** 打开 `src/index.css`，清空里面所有内容，只保留下面这一行代码：

```plain
@import "tailwindcss";
```

**步骤 4：覆盖核心代码并启动**

1. 将本工具的完整单文件代码替换掉 `src/App.jsx` 中的全部内容。
2. 运行 `npm run dev` 即可享受顺滑的排期体验！

## 💡 数据存储说明 (File System Access)
本工具未接入任何后端云服务，点击 **保存 (**`**Ctrl+S**`**)** 时，数据将会直接回写到你**初次【新建】或【打开】所绑定的那个本地 JSON 文件**中。

**⚠️**** 注意**：由于现代浏览器的安全策略（File System Access API 规范），应用在重启或重新刷新网页后，**会丢失对该本地文件的读写授权句柄**。因此，当你刷新页面后，需要重新点击页面右上角的【打开】按钮，重新选中你上次保存的 JSON 文件即可恢复继续工作。

## 📜 许可
MIT License.

