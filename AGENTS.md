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

### 3. Move Evaluator & Analysis Subagents
- Background workers running KataGo / Leela Zero engines that consume room state broadcasts, calculate win probabilities, and output move heatmaps.

---

## 🔌 API & Integration Interfaces

```
                  ┌──────────────────────┐
                  │   Go Web Browser UI  │
                  └──────────┬───────────┘
                             │ WebSocket
                             ▼
┌────────────────────────────────────────────────────────┐
│               FastAPI App & Room Manager               │
│                   (server/app.py)                      │
└──────────┬──────────────────────────┬──────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│  Go Engine Core      │  │  AI Agent Bot / KataGo Bridge│
│  (server/go_game.py) │  │  (server/agents/)            │
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
