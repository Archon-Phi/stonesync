# 🗺️ StoneSync Product Roadmap

This document outlines the planned release milestones for **StoneSync**, a local-first, authoritative online multiplayer Go application.

---

## 🎯 Release Milestones

### 🟢 Version 1.0.0 — MVP Core Launch (Current Release)
- [x] Authoritative Python FastAPI backend Go engine (`server/go_game.py`).
- [x] 9x9, 13x13, and 19x19 board support.
- [x] Liberty tracking, group captures, suicide prevention, and Ko rule enforcement.
- [x] Two-pass game end detection & territory flood fill scoring with configurable Komi.
- [x] Room-based WebSocket multiplayer with player role assignment (Black, White, Observer).
- [x] Client-side player identity (`localStorage`).
- [x] Responsive 2D HTML5 Canvas rendering engine.
- [x] 🪵 Kaya Wood, 💎 Obsidian Glass, and ⚡ Cyberpunk Neon board themes.
- [x] Spatial pitch-shifted Web Audio synthesizer for stone placements.
- [x] Dynamic influence & territory heatmap overlay.

---

### 🟡 Version 1.1.0 — Match Customization & Timers (Completed)
- [x] **Byo-yomi & Fischer Time Controls**: Server-authoritative move timers and clock countdowns.
- [x] **Handicap Stone Placement**: Standard 2 to 9 stone handicap setups.
- [x] **SGF Import & Export**: Download `.sgf` match replays (`/api/room/{roomId}/sgf`) and import existing SGF records.
- [x] **In-Game Chat & Reactions**: Real-time room text messaging and floating emoji stone overlays.

---

### 🔵 Version 1.2.0 — AI Assistant & Analysis Engine (Completed)
- [x] **StoneSensei Local Ollama Agent Layer**: Confidential local LLM agent (`0.0.0.0:8085`) with continuous multi-turn chat history.
- [x] **Positional AI Evaluator (`server/evaluator.py`)**: Real-time win-rate bar, score lead telemetry, and top tactical move overlay pins.
- [x] **Docker Compose Watch & DX**: Live frontend file sync and automated server hot-restarting.
- [x] **Automated E2E Test Suite (`tests/e2e/e2e.spec.js`)**: Playwright automation suite for UI canvas, identity modal sync, and REST endpoints.

---

### 🟣 Version 2.0.0 — Tournament & Mobile Apps (Planned)
- [ ] **Swiss Bracket Tournament Engine**: Automated multi-room pairing and leaderboard rankings.
- [ ] **Mobile Native PWA**: Offline puzzle solver and touch-optimized haptic feedback.
- [ ] **Phantom Go (Fog of War) Variant**: Hidden opponent stone game mode.
