<h1 align="center">
  🌰 Acorn
</h1>

<p align="center">
  <strong>给你的 AI Agent 一个体面的家。</strong><br/>
  基于 <a href="https://agentclientprotocol.com">Agent Client Protocol</a> 的桌面客户端。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/协议-ACP-purple" alt="ACP" />
  <img src="https://img.shields.io/badge/技术栈-Electron%20%2B%20React-teal" alt="Built with" />
  <img src="https://img.shields.io/github/license/hirokith/acorn" alt="License" />
</p>

<p align="center">
  <sub>别再 <code>tail -f</code> 你的 Agent 日志了。来<em>看见</em>它在想什么。</sub>
</p>

<p align="center">
  <a href="./README.md">🌐 English</a>
</p>

---

## 🤔 为什么选 Acorn？

AI Agent 很强大——但调试它们简直是噩梦：

> 🤯 "它为什么要调那个工具？"  
> 😵‍💫 "回复之前到底在*想*什么？"  
> 🫠 "能不能不打开 Wireshark 就**看到** JSON-RPC？"

**Acorn 解决了这一切。** 一个应用，连接你的 Agent，实时观察所有过程——思考、工具调用、输出、原始协议消息——在一个漂亮的原生桌面界面里。

---

## ✨ 功能特性

### 💬 对话

- IDE 风格的深色/浅色 UI —— 和 VS Code 放在一起毫无违和感
- 完整的 Markdown + LaTeX 数学公式渲染
- 多会话管理，历史记录持久化（重启不丢！）
- 流式 token 展示 + 实时思考过程

### 🔍 Agent 可观测性

- 🟢 **结构化日志** —— 思考、消息、工具调用分色展示
- 🛠️ **工具调用卡片** —— 可展开的 Input/Output，Shiki 语法高亮
- ⏱️ **耗时追踪** —— 每个工具调用精确到毫秒
- 📡 **RAW 模式** —— 查看线路上的每一条 JSON-RPC 消息

### 🐛 调试模式

- 完整的协议日志：请求、响应、通知，一个不漏
- 按类型过滤，按内容搜索
- 几秒钟定位问题，不再花几小时

### ⚙️ 配置管理

- 添加任意数量的 ACP Agent，自定义命令、参数、环境变量
- 一键切换不同 Agent
- 兼容**任何** ACP 协议的 Agent —— 零厂商锁定

---

## 🚀 快速开始

### 下载安装

从 [**GitHub Releases**](https://github.com/hirokith/acorn/releases) 获取最新版本：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Acorn-x.x.x-arm64.dmg` |
| macOS (Intel) | `Acorn-x.x.x-x64.dmg` |
| Windows | `Acorn-x.x.x-Setup.exe` |
| Linux | `Acorn-x.x.x.AppImage` / `.deb` |

> [!NOTE]
> **macOS 用户**：首次打开可能提示「无法验证开发者」。右键点击 app → 选择「打开」→ 再点「打开」即可（仅需一次）。  
> 或在终端执行：`xattr -cr /Applications/Acorn.app`
>
> **Windows 用户**：SmartScreen 可能弹出警告，点击「更多信息」→「仍要运行」。

### 从源码运行

```bash
git clone https://github.com/hirokith/acorn.git
cd acorn
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
| ⚛️ 前端 | React 18 + TypeScript |
| ⚡ 构建 | electron-vite + Vite 7 |
| 🎨 样式 | Tailwind CSS v4 |
| 🗃️ 状态 | Zustand（持久化） |
| 🌈 语法高亮 | Shiki |
| 📐 数学公式 | KaTeX |
| 📝 Markdown | react-markdown + remark-gfm |

---

## 📡 协议支持

Acorn 通过 stdio 原生实现 [ACP 协议](https://agentclientprotocol.com)：

- ✅ `initialize` 握手
- ✅ `session/new` + `session/prompt`
- ✅ 流式 `session/update`（思考、消息、工具调用）
- ✅ 权限请求弹窗
- ✅ 优雅断开连接

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
