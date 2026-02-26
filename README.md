Agile Matrix - 敏捷全景排期矩阵

Agile Matrix 是一款基于 React + Tailwind CSS 构建的单机、轻量级敏捷路线图与迭代排期工具。致力于解决传统 Excel 排期维护繁琐、不易拖拽关联、长周期目标与底层任务对齐困难的痛点。

它无需任何后端数据库，所有数据完全基于现代浏览器的 File System Access API 直接读写本地的 JSON 文件。这使得该应用不仅能够做到极致的安全与隐私，还能像传统的 Word / Excel 一样，实现不同项目、不同文件之间的数据完全隔离。

✨ 核心特性

🚀 极速拖拽排期 (Drag & Drop)：支持卡片在不同 Sprint 迭代和业务泳道之间自由流转，目标格子自动追加，源格子序号自动向上递补。

📊 跨层级目标冻结对齐：纵横二维表头冻结。不论页面如何滚动，顶部的“阶段大目标”和左侧的“业务线目标”永远固定在视野内。

👥 精细化资源管理：每张任务卡片支持独立填报开发资源（前端、后端、测试、规划），Sprint 顶部将自动汇总各角色的总人天开销。

💾 本地文件系统直写：采用原生的“新建/打开/保存”心智模型。直接在你的本地硬盘建立或修改 .json 排期文件，安全可靠。

⏪ 撤销与防丢机制：内置 50 步操作历史记录 (Ctrl+Z 撤销)。存在未保存变动时，阻拦页面关闭刷新。

🛠️ 如何启动本项目？

本项目采用纯前端架构，你可以选择以下任意一种方式在本地启动并运行。

启动方式一：从完整仓库启动（推荐）

如果你已经 git clone 下载了完整的代码仓库到本地，只需执行以下标准的 Node.js 命令。

前置要求：安装了 Node.js (推荐 v18+)。

进入项目根目录并安装依赖：

npm install


启动本地开发服务器：

npm run dev


在浏览器中打开终端显示的本地地址（通常是 http://localhost:5173/），即可开始使用！

启动方式二：从零创建单文件版本（纯净重建）

如果你在某些特殊环境下，手头只有一份核心代码文件 (App.jsx)，你可以通过 Vite 快速重新构建整个项目工程结构。

步骤 1：使用 Vite 创建空的 React 项目
打开终端（或命令提示符），输入以下命令（中途遇到提示请用方向键选择 React 和 JavaScript）：

npm create vite@latest agile-matrix -- --template react


步骤 2：进入目录并安装核心依赖

cd agile-matrix
npm install
# 安装本工具需要的图标库和全新 V4 版的 Tailwind 插件
npm install lucide-react @tailwindcss/vite


步骤 3：配置环境

1. 修改配置: 打开根目录的 vite.config.js，加入 tailwind 插件：

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})


2. 引入样式: 打开 src/index.css，清空里面所有内容，只保留下面这一行代码：

@import "tailwindcss";


步骤 4：覆盖核心代码并启动

将本工具的完整单文件代码替换掉 src/App.jsx 中的全部内容。

运行 npm run dev 即可享受顺滑的排期体验！

💡 数据存储说明 (File System Access)

本工具未接入任何后端云服务，点击 保存 (Ctrl+S) 时，数据将会直接回写到你初次【新建】或【打开】所绑定的那个本地 JSON 文件中。

⚠️ 注意：由于现代浏览器的安全策略（File System Access API 规范），应用在重启或重新刷新网页后，会丢失对该本地文件的读写授权句柄。因此，当你刷新页面后，需要重新点击页面右上角的【打开】按钮，重新选中你上次保存的 JSON 文件即可恢复继续工作。

📜 许可

MIT License.