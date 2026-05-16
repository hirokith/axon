<h1 align="center">
  ⚡ Axon
</h1>

<p align="center">
  <strong>给你的 AI Agent 一个体面的家。</strong><br/>
  基于 <a href="https://agentclientprotocol.com">Agent Client Protocol</a> 的桌面客户端。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/协议-ACP-purple" alt="ACP" />
  <img src="https://img.shields.io/badge/技术栈-Electron%20%2B%20React-teal" alt="Built with" />
  <img src="https://img.shields.io/github/license/hirokith/axon" alt="License" />
</p>

<p align="center">
  <sub>别再 <code>tail -f</code> 你的 Agent 日志了。来<em>看见</em>它在想什么。</sub>
</p>

<p align="center">
  <a href="./README.md">🌐 English</a>
</p>

---

## 🤔 为什么选 Axon？

AI Agent 很强大——但调试它们简直是噩梦：

> 🤯 "它为什么要调那个工具？"  
> 😵‍💫 "回复之前到底在*想*什么？"  
> 🫠 "能不能不打开 Wireshark 就**看到** JSON-RPC？"

**Axon 解决了这一切。** 一个应用，连接你的 Agent，实时观察所有过程——思考、工具调用、输出、原始协议消息——在一个漂亮的原生桌面界面里。

---

## ✨ 功能特性

### 💬 对话

- IDE 风格的深色/浅色 UI —— 和 VS Code 放在一起毫无违和感
- 完整的 Markdown + LaTeX 数学公式渲染
- 多会话管理，历史记录持久化（重启不丢！）
- 流式 token 展示 + 实时思考过程
- 每个会话独立工作目录

### 🤖 多 Agent 并行

- **同时连接和使用多个 Agent**
- Tab 标签页 UI —— 每个 Agent 拥有独立工作区
- 启动时自动连接，会话自动恢复
- **Test Connection** —— 保存前验证 CLI + ACP 握手是否正常

### 🔌 MCP Server 管理

- 配置 MCP 服务器（支持 stdio 和 HTTP 两种传输方式）
- 创建会话时可挂载指定的 MCP Server
- 完整增删改查 + JSON 导入模式批量配置

### 🔍 Agent 可观测性

- 🟢 **结构化日志** —— 思考、消息、工具调用分色展示
- 🛠️ **工具调用卡片** —— 可展开的 Input/Output，语法高亮、连续编号、耗时 + 完成时间
- 📡 **RAW 模式** —— 查看线路上的每一条 JSON-RPC 消息
- 📂 **输出预览** —— 浏览文件、查看 Diff、实时 HTML 预览、系统浏览器打开

### ⚙️ 配置管理

- 添加任意数量的 ACP Agent，自定义命令、参数、环境变量
- 原生目录选择器，快速设定工作目录
- 兼容**任何** ACP 协议的 Agent —— 零厂商锁定

### 💾 数据持久化

- 会话历史和结构化日志持久化存储在本地 SQL.js 数据库
- 数据存放在 OS `userData` 目录 —— 便携且私密

---

## 🚀 快速开始

### 下载安装

从 [**GitHub Releases**](https://github.com/hirokith/axon/releases) 获取最新版本：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Axon-x.x.x-arm64.dmg` |
| macOS (Intel) | `Axon-x.x.x-x64.dmg` |
| Windows | `Axon-x.x.x-Setup.exe` |
| Linux | `Axon-x.x.x.AppImage` / `.deb` |

> [!NOTE]
> **macOS 用户**：首次打开可能提示「无法验证开发者」。右键点击 app → 选择「打开」→ 再点「打开」即可（仅需一次）。  
> 或在终端执行：`xattr -cr /Applications/Axon.app`
>
> **Windows 用户**：SmartScreen 可能弹出警告，点击「更多信息」→「仍要运行」。

### 从源码运行

```bash
git clone https://github.com/hirokith/axon.git
cd axon
pnpm install
pnpm dev
```

搞定，跑起来了！🎉

---

## 🔌 连接你的 Agent

1. 打开 **Settings** → **Add Agent**
2. 填写 Agent 配置：

   | 字段 | 示例 |
   |------|------|
   | Name | `我的编码 Agent` |
   | Command | `node` |
   | Args | `dist/index.js` |
   | CWD | `/path/to/project` |
   | Env | `OPENAI_API_KEY=sk-...` |

3. 切到 **Chat** → 选择 Agent → 点击 **Connect**
4. 开聊！🗣️

---

## 🏗️ 技术栈

| | 技术 |
|---|-----|
| 🖥️ 框架 | Electron 42 |
| ⚛️ 前端 | React 19 + TypeScript |
| ⚡ 构建 | electron-vite + Vite 7 |
| 🎨 样式 | Tailwind CSS v4 |
| 🗃️ 状态 | Zustand（持久化） |
| 🌈 语法高亮 | Shiki |
| 📐 数学公式 | KaTeX |
| 📝 Markdown | react-markdown + remark-gfm |
| 🎯 图标 | Lucide React + Material Icon Theme |
| 💾 数据库 | SQL.js（文件级 SQLite） |

---

## 📡 协议支持

Axon 通过 stdio 原生实现 [ACP 协议](https://agentclientprotocol.com)：

- ✅ `initialize` 握手
- ✅ `session/new` + `session/prompt`，支持会话级 CWD 和 MCP 配置
- ✅ 流式 `session/update`（思考、消息、工具调用）
- ✅ 权限请求弹窗
- ✅ 优雅断开连接
- ✅ 多 Agent 并发连接
- ✅ MCP Server 透传（stdio 和 HTTP 传输）

---

## 📦 构建生产版本

```bash
pnpm build       # 仅构建
pnpm dist        # 打包当前平台安装包
pnpm dist:mac    # macOS (.dmg + .zip)
pnpm dist:win    # Windows (.exe)
pnpm dist:linux  # Linux (.AppImage + .deb)
```

产物输出到 `release/` 目录。🚢

---

## 🤝 参与贡献

有想法？发现 Bug？正在开发 ACP Agent 需要客户端支持？

欢迎 **提 Issue** 或发 PR —— 一起来搞！

---

## 📄 许可证

ISC

---

<p align="center">
  <sub>用 ☕ 和好奇心构建。为 Agent 开发者而生。</sub>
</p>
