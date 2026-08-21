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

### 🟡 Version 1.1.0 — Match Customization & Timers (Q3 2026)
- [ ] **Byo-yomi & Fischer Time Controls**: Server-authoritative move timers and clock countdowns.
- [ ] **Handicap Stone Placement**: Standard 2 to 9 stone handicap setups.
- [ ] **SGF Import & Export**: Download `.sgf` match replays and import existing games.
- [ ] **In-Game Chat & Reactions**: Real-time room text messaging and quick emoji stone overlays.

---

### 🔵 Version 1.2.0 — AI Assistant & Analysis (Q4 2026)
- [ ] **WASM KataGo AI Evaluator**: Client-side win-rate bar and top move suggestions.
- [ ] **Blunder & Error Inspector**: Jump to high-impact mistake turns during game review.
- [ ] **Ghost Variation Sandbox**: Interactive local side-board for testing move variations.

---

### 🟣 Version 2.0.0 — Tournament & Mobile Apps (2027)
- [ ] **Swiss Bracket Tournament Engine**: Automated multi-room pairing and leaderboard rankings.
- [ ] **Mobile Native PWA**: Offline puzzle solver and touch-optimized haptic feedback.
- [ ] **Phantom Go (Fog of War) Variant**: Hidden opponent stone game mode.
