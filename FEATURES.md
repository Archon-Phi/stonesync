# ✨ StoneSync Features & Specification

**StoneSync** is a high-performance, real-time multiplayer Go (Weiqi/Baduk) web application built with a Python FastAPI backend and an HTML5/Canvas frontend.

---

## 🏛️ 1. Core Go Game Engine

- **Authoritative Rule Enforcement**: All rules are validated on the server before state broadcasts.
- **Board Grid Dimensions**: Supports standard 9x9, 13x13, and 19x19 board sizes.
- **Liberties & Connected Groups**: Multi-stone group liberty tracking using graph traversal (BFS/DFS).
- **Stone Captures**: Opponent groups with 0 liberties are removed immediately, incrementing capture counts.
- **Suicide Rule**: Placements with 0 liberties are rejected as illegal unless the move captures opponent stones and gains liberties.
- **Ko Rule**: Immediate recaptures recreating the exact previous board position are strictly forbidden.
- **Passing & Game Termination**: Two consecutive passes end the match and trigger automatic scoring.
- **Territory Flood Fill Scoring**: Territory calculated using connected empty intersection area scoring + captured stones + configurable Komi (default 6.5).

---

## 🌐 2. Real-Time Multiplayer & Rooms

- **URL-Based Rooms**: Join or create rooms instantly via `/go?room=<id>&board_size=19&komi=6.5`.
- **Automatic Role Assignment**: First two connected unique player IDs become Black and White; subsequent connections join as read-only Observers.
- **Persistent Identity**: Client player ID saved in `localStorage` (`stonesync_player_id`).
- **WebSocket Protocol**: Authoritative state broadcast over WebSockets after every valid action (`move`, `pass`, `reset`, `sync`).

---

## 🎨 3. Themes & Visual Engine

- **Interactive Canvas Board**: High-DPI canvas rendering with star points (hoshi) and last-move indicators.
- **Multiple Board Themes**:
  - 🪵 **Classic Kaya Wood**: Natural wood grain aesthetics with dark mahogany lines and traditional slate/shell stones.
  - 💎 **Obsidian Glass**: Deep dark slate background with cyan glowing grid lines and obsidian black / glowing white stones.
  - ⚡ **Cyberpunk Neon**: Dark violet background with neon pink grid lines and vibrant neon purple / cyan stones.
- **Visual Influence Heatmap**: Toggleable overlay showing real-time territorial influence gradients across the board.

---

## 🎧 4. Spatial Audio Synthesizer

- **Web Audio API Synthesis**: Dynamic pitch modulation depending on stone position on the grid (corner stones produce higher crisp impact, center stones produce deep wood resonance).
- **Piece Removal Sounds**: Audio feedback when capture counts increase.
- **Volume & Mute Controls**: Interactive volume range slider and mute management.
