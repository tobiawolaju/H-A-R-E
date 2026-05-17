# HARE
### Headless Autonomous Relay Engine

> Small, fast, always running.

HARE is a modular AI agent that operates headlessly in the background — monitoring signals, reasoning with Gemini Flash, and executing actions across Discord, Telegram, and X without manual intervention.

Built as infrastructure, not a chatbot. No UI. Just execution.

## Architecture
- **Gateways** — Discord, Telegram (inbound/outbound message routing)
- **Skills** — GitHub integration, web search, long-term memory
- **Heartbeat** — autonomous loop that drives scheduled posting and monitoring
- **Reasoning** — Gemini Flash as the core inference layer (ElizaOS v2 swap-ready)

## 📁 Project Structure

- **`core/`**: The central logic.
    - `orchestrator.js`: Manages message flow and tool loading.
    - `heartbeat.js`: Central loop for periodic tasks and health checks.
- **`gateways/`**: I/O adapters for different platforms.
    - `discord.js`: Self-bot gateway implementation.
    - `telegram.js`: Telegram adapter skeleton.
- **`skills/`**: Atomic capabilities loaded as tools.
    - `github.js`: GitHub repository and file operations.
    - `search.js`: Web searching and scraping.
    - `memory.js`: Interface for persistent memory (Sheets/JSON).
- **`utils/`**: Shared helpers.
    - `llm.js`: High-efficiency wrapper for Gemini API.
    - `logger.js`: Unified logging system.
- **`index.js`**: Main entry point.

## 🚀 Design Principles

1. **Lightweight**: Minimal dependencies and non-blocking I/O.
2. **API Efficient**: 
    - Pruned conversation history.
    - System prompt optimized for instruction following.
    - Single-pass tool calling (avoiding nested agent hops).
3. **Resilient**: The **Heartbeat** ensures the bot remains logged in and performs background tasks even without user input.
4. **Platform Agnostic**: Orchestrator speaks "Universal Event", making it easy to add new gateways.

## Usage Guide

### 1. Install

From the repository root, enter the runtime workspace and install dependencies:

```bash
cd hare
pnpm install
```

### 2. Configure secrets

Create a `.env` file in `hare/` and add the credentials for only the gateways and skills you plan to run. Typical values include:

```bash
GEMINI_API_KEY=your_gemini_key
GITHUB_TOKEN=your_github_token
DISCORD_TOKEN=your_discord_token
TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash
TWITTER_AUTH_TOKEN=your_x_auth_token
```

Leave unused gateway values blank or omit them so you can bring HARE online one surface at a time.

### 3. Start the agent

Run the headless process from `hare/`:

```bash
pnpm start
```

The startup logs show which gateways, skills, and scheduled loops are active. Keep the process running in a terminal, process manager, or container.

### 4. Run checks

Use the bundled smoke test before deploying changes:

```bash
pnpm test
```

Twitter/X-specific behavior has a separate test command:

```bash
pnpm test:twitter
```

### 5. Add or tune capabilities

- Add action modules in `skills/` when HARE needs a new capability.
- Add platform adapters in `gateways/` when HARE needs a new inbound or outbound surface.
- Keep shared helpers in `utils/` and orchestration changes in `core/`.
- Restart the agent after changing skills or gateways so the runtime loads the new behavior.

### 6. Operate safely

- Start with a minimal set of tokens and enable one gateway at a time.
- Watch logs during the first run of any new skill.
- Use scoped credentials where possible.
- Review generated pull requests or outbound posts before widening automation.
