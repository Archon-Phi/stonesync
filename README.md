# StoneSync

**StoneSync** is a standalone, local-first online two-player Go (Weiqi/Baduk) web application featuring authoritative server-side rule validation, real-time WebSocket room multiplayer, Sensei AI Positional Evaluation, host moderation controls, top bar MP3 music player, and a responsive HTML5 Canvas interface.

---

## ✨ Features & Architecture

### 🧠 Authoritative Go Game Engine & AI Analytics (`server/`)
- **Board Sizes**: 19x19, 13x13, and 9x9 canvas grids.
- **Rule Validation**: Group liberty tracking, suicide rejection, Positional & Situational Superko rules.
- **AI Sensei Evaluation Engine (`server/evaluator.py`)**: Real-time win-rate calculation, score lead telemetry (`#score-lead-badge`), and top tactical move recommendations with canvas overlay pins (`①`, `②`, `③`).
- **Scoring Modes**: Japanese Territory (`territory + captures + komi`) & Chinese Area Scoring (`living_stones + territory + komi`).
- **Time Control System**: Fischer increment, Byo-yomi periods, Absolute time controls, and untimed matches.
- **SGF Engine (`server/sgf.py`)**: Full round-trip SGF game record export (`/api/room/{roomId}/sgf`) and file parsing.

### 👑 Room Admin & Moderation Controls (`server/go_server.py`)
- **Host Permissioning**: Room creator automatically assigned as room `host_id`.
- **Clock Controls**: Live `⏸️ Pause Clock` and `▶️ Resume Clock` match timer management.
- **Occupant Moderation**: Dropdown user selection with instant `Kick` action.
- **Game Adjudication**: Manual winner declaration (`👑 Black Wins` / `👑 White Wins`) and point score override.
- **Room Privacy Lock**: Set room passwords and toggle privacy locks (`🔒 Lock Room`).

### 🎵 Top Bar MP3 Music Player (`frontend/music/`)
- **Integrated MP3 Player Widget**: Compact glassmorphic pill in top navigation bar with play/pause, skip, and live timestamp ticker.
- **Isolated Audio Architecture**:
  - `frontend/music/`: Dedicated folder for MP3 music tracks automatically scanned via `/api/audio-tracks`.
  - `frontend/go-sounds/`: Dedicated folder for Go board stone impact WAVs (`GoGame-Thwack1.wav` .. `4`) and capture MP3s (`GoGame-PieceRemoved.mp3`).

### 🎨 Aesthetics & Sensei Mode
- **Japanese Slate & Shell Textures**: Procedural clam shell growth lines on White stones and slate micro-grain on Black stones.
- **Zen Ambient Soundscape**: Low-pass filtered rain generator with rhythmic bamboo fountain (*Shishi-odoshi*) click.
- **Visual Territory Heatmap**: Toggleable overlay showing real-time territorial influence gradients across board intersections.

---

## 🛠️ Project Directory Structure

```
stonesync/
├── server/
│   ├── app.py                 # FastAPI application server, static routing & REST endpoints
│   ├── go_game.py             # Authoritative Go rules engine (scenarios, liberties, superko)
│   ├── go_server.py           # WebSocket room manager, player roles & admin actions
│   ├── evaluator.py           # Real-time AI win-rate & tactical move evaluation engine
│   ├── sgf.py                 # SGF format parser & exporter
│   └── agents/                # StoneBot AI Opponent agent bridges
├── frontend/
│   ├── go.html                # Main web app layout, Sensei AI card & Admin Panel UI
│   ├── go.css                 # Dark mode design system & glassmorphism
│   ├── go.js                  # Canvas board renderer, Web Audio API & WebSocket client
│   ├── assets/                # QR codes and image assets
│   ├── music/                 # MP3 music tracks for top bar player
│   └── go-sounds/             # Board interaction WAV and MP3 sound effects
├── tests/
│   ├── unit/                  # Python backend engine unit tests (21 test cases)
│   └── e2e/                   # Playwright E2E automation tests (Node.js & Python specs)
├── docs/
│   ├── FEATURES.md            # Detailed feature specifications
│   ├── ROADMAP.md             # Project roadmap & build milestones
│   └── BUILD_ROADMAP.md       # Architecture & GitHub task breakdown
├── scripts/
│   ├── gen_sounds.py          # Audio sound asset generator script
│   └── release_tag.sh         # Git release tagging helper
├── Dockerfile                 # Production container build recipe
├── docker-compose.yml         # Standalone local/production Compose file
├── playwright.config.js       # Playwright E2E configuration & webServer manager
├── requirements.txt
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

---

## 🚀 Quick Start & Local Run Instructions

### Option 1: Running with Python Virtual Environment

```bash
# 1. Create a Python virtual environment
python3 -m venv .venv

# 2. Activate the virtual environment
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the FastAPI server
uvicorn server.app:app --host 0.0.0.0 --port 8080

# 5. Open in browser: http://localhost:8080/go
```

### Option 2: Running Anywhere with Docker Compose

```bash
# Build and launch StoneSync in detached mode
docker compose up --build -d

# Open in browser: http://localhost:8080/go
```

---

## 🧪 Running Automated Tests

### 1. Pytest Test Suite (22 Unit & E2E Tests)
```bash
PYTHONPATH=. .venv/bin/pytest -v
```

### 2. Playwright E2E UI Test Suite (`playwright-skill`)
```bash
# Execute Node.js Playwright suite
npx playwright test
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
