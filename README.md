<h1 align="center">
  🌰 Acorn
</h1>

<p align="center">
  <strong>Your AI Agent deserves a proper home.</strong><br/>
  A gorgeous desktop client for the <a href="https://agentclientprotocol.com">Agent Client Protocol</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/protocol-ACP-purple" alt="ACP" />
  <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React-teal" alt="Built with" />
  <img src="https://img.shields.io/github/license/hirokith/acorn" alt="License" />
</p>

<p align="center">
  <sub>Stop <code>tail -f</code>-ing your agent logs. Start <em>seeing</em> what it thinks.</sub>
</p>

<p align="center">
  <a href="./README.zh-CN.md">🇨🇳 中文文档</a>
</p>

---

## 🤔 Why Acorn?

AI agents are powerful — but working with them today feels like talking to a black box:

> 🤯 "Why did it call that tool?"  
> 😵‍💫 "What was it *thinking* before responding?"  
> 🫠 "Can I just **see** the JSON-RPC without opening Wireshark?"

**Acorn fixes all of that.** One app. Connect your agent. Watch everything unfold in real time — thoughts, tool calls, outputs, raw protocol messages — in a beautiful, native interface.

---

## ✨ Features

### 💬 Chat
- IDE-inspired dark/light UI — feels right at home next to VS Code
- Full Markdown + LaTeX math rendering
- Multi-session with persistent history (survives restarts!)
- Streaming tokens with live thinking display

### 🔍 Agent Observability
- 🟢 **Structured logs** — thoughts, messages, and tool calls, color-coded
- 🛠️ **Tool call cards** — expandable Input/Output with Shiki syntax highlighting
- ⏱️ **Duration tracking** — know exactly how long each tool takes
- 📡 **RAW mode** — see every JSON-RPC message on the wire

### 🐛 Debug Mode
- Full protocol transcript: requests, responses, notifications
- Filter by type, search by content
- Find bugs in seconds, not hours

### ⚙️ Configuration
- Add unlimited ACP agents with custom commands, args, env vars
- Switch between agents in one click
- Works with **any** ACP-compatible agent — zero vendor lock-in

---

## 🚀 Quick Start

### Download

Grab the latest release from [**GitHub Releases**](https://github.com/hirokith/acorn/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Acorn-x.x.x-arm64.dmg` |
| macOS (Intel) | `Acorn-x.x.x-x64.dmg` |
| Windows | `Acorn-x.x.x-Setup.exe` |
| Linux | `Acorn-x.x.x.AppImage` / `.deb` |

> [!NOTE]
> **macOS users**: On first launch, you may see "Cannot verify developer". Right-click the app → "Open" → click "Open" again (one-time only).  
> Or run in terminal: `xattr -cr /Applications/Acorn.app`
>
> **Windows users**: SmartScreen may show a warning. Click "More info" → "Run anyway".

### From Source

```bash
git clone https://github.com/hirokith/acorn.git
cd acorn
pnpm install
pnpm dev
```

That's it. You're running. 🎉

---

## 🔌 Connect Your Agent

1. Open **Settings** → **Add Agent**
2. Fill in your agent's command:
   | Field | Example |
   |-------|---------|
   | Name | `My Coding Agent` |
   | Command | `node` |
   | Args | `dist/index.js` |
   | CWD | `/path/to/project` |
   | Env | `OPENAI_API_KEY=sk-...` |
3. Go to **Chat** → Select agent → Click **Connect**
4. Start chatting! 🗣️

---

## 🏗️ Tech Stack

| | Technology |
|---|-----------|
| 🖥️ Framework | Electron 42 |
| ⚛️ Frontend | React 19 + TypeScript |
| ⚡ Build | electron-vite + Vite 7 |
| 🎨 Styling | Tailwind CSS v4 |
| 🗃️ State | Zustand (persisted) |
| 🌈 Syntax | Shiki |
| 📐 Math | KaTeX |
| 📝 Markdown | react-markdown + remark-gfm |

---

## 📡 Protocol Support

Acorn speaks [ACP](https://agentclientprotocol.com) natively over stdio:

- ✅ `initialize` handshake
- ✅ `session/new` + `session/prompt`
- ✅ Streaming `session/update` (thoughts, messages, tool calls)
- ✅ Permission request dialogs
- ✅ Graceful disconnect

---

## 📦 Build for Production

```bash
pnpm build
```

Compiled output lands in `out/`. To package distributable binaries:

```bash
pnpm dist        # current platform
pnpm dist:mac    # macOS (.dmg, .zip)
pnpm dist:win    # Windows (.exe)
pnpm dist:linux  # Linux (.AppImage, .deb)
```

Packaged binaries land in `release/`. Ship it! 🚢

---

## 🤝 Contributing

Got an idea? Found a bug? Building an ACP agent and need something from the client side?

**Open an issue** or send a PR — we'd love to collaborate.

---

## 📄 License

ISC

---

<p align="center">
  <sub>Built with ☕ and curiosity. Made for agent builders, by agent builders.</sub>
</p>
