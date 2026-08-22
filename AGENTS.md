# 🤖 StoneSync Agent Architecture

This document describes the AI Agent architecture, bot integrations, and automated background workers for **StoneSync**.

---

## 🏗️ Overview

StoneSync is designed with a clean API boundary that allows AI agents, engine bots (e.g. KataGo, Leela Zero, GNU Go), and automated subagents to interface directly via WebSockets or Python module bindings.

---

## 🤖 Agent Roles & Types

### 1. Bot Players (AI Opponents)
AI agents can connect to any room as player Black or White over WebSockets.
- **WebSocket Protocol**: Connects via `ws://<host>/ws/go/<room_id>?player_id=bot_<name>`
- **Action Payload**:
  ```json
  { "action": "move", "r": 3, "c": 3 }
  ```
- **Authoritative Validation**: Bot moves undergo identical rule checks (liberties, Ko, suicide) as human players.

### 2. Referee & Arbiter Agents
- Automated agents monitoring room events, detecting player disconnect timeouts, and auto-scoring inactive matches.

### 4. Local Ollama LLM Agent (StoneSensei)
- Agentic Go-playing layer powered by a local Ollama LLM (`http://127.0.0.1:11434`).
- **Continuous Multi-Turn Chat History**: Append-only JSON/memory buffer per game session (`session_id`).
- **State Context Injection**: Automatically injects board state, opponent moves (GTP coordinates e.g. E4), and capture counts.
- **Confidential & Local Network Binding**: Binds to `0.0.0.0` on configurable port (`OLLAMA_AGENT_PORT`, default: `8085`) for remote client access with zero external data sharing.
- **Endpoints**:
  - `POST /api/ollama/predict` (or `/api/ollama/move`): Returns structured move prediction and tactical commentary.
  - `POST /api/ollama/chat`: Sends multi-turn chat messages within game session context.
  - `GET /api/ollama/history/{session_id}`: Retrieves continuous chat history.
  - `POST /api/ollama/reset/{session_id}`: Clears session history buffer.
  - `GET /api/ollama/health`: Status check.

---

## 🔌 API & Integration Interfaces

```
                  ┌──────────────────────┐
                  │   Go Web Browser UI  │
                  └──────────┬───────────┘
                             │ WebSocket / REST
                             ▼
┌────────────────────────────────────────────────────────┐
│               FastAPI App & Room Manager               │
│                   (server/app.py)                      │
└──────────┬──────────────────────────┬──────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│  Go Engine Core      │  │  Ollama Agent Service & Bot  │
│  (server/go_game.py) │  │  (server/agents/ollama_agent)│
└──────────────────────┘  └──────────────────────────────┘
```

---

## 🛠️ Developing Custom Agents

To create a custom Python agent for StoneSync:

```python
import asyncio
import json
import websockets

async def run_bot(room_id="main-match", bot_id="bot_alpha"):
    uri = f"ws://localhost:8080/ws/go/{room_id}?player_id={bot_id}"
    async with websockets.connect(uri) as ws:
        async for msg in ws:
            data = json.loads(msg)
            if data.get("type") == "state":
                state = data["game_state"]
                # Add bot decision logic here
                print(f"Current Turn: {state['current_player']}")

if __name__ == "__main__":
    asyncio.run(run_bot())
```

### Running the Ollama Agent Service

Expose the agentic Ollama service over your local network interface (`0.0.0.0:8085`):

```bash
python3 -m server.agents.ollama_agent
```

