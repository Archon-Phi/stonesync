# StoneSync

**StoneSync** is a standalone, local-first online two-player Go (Weiqi/Baduk) web application featuring authoritative server-side rule validation, real-time WebSocket room multiplayer, host moderation controls, top bar MP3 music player, and a responsive HTML5 Canvas interface.

---

## ✨ Features & Architecture

### 🧠 Authoritative Go Game Engine (`server/go_game.py`)
- **Board Sizes**: 19x19, 13x13, and 9x9 canvas grids.
- **Rule Validation**: Group liberty tracking, suicide rejection, Positional & Situational Superko rules.
- **Scoring Modes**: Japanese Territory (`territory + captures + komi`) & Chinese Area Scoring (`living_stones + territory + komi`).
- **Time Control System**: Fischer increment, Byo-yomi periods, Absolute time controls, and untimed matches.
- **SGF Engine**: Full round-trip SGF game record export and file import.

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
- **AI Sensei Hints**: Heuristic tactical move evaluation overlay displaying glowing win-rate candidate markers (🥇 68%, 🥈 54%, 🥉 47%).

---

## 🛠️ Project Structure

```
stonesync/
├── server/
│   ├── app.py              # FastAPI application server, static routing & /api/audio-tracks
│   ├── go_game.py          # Authoritative Go rules engine (scenarios, liberties, superko)
│   ├── go_server.py        # WebSocket room manager, player roles & admin actions
│   ├── sgf.py              # SGF format parser & exporter
│   ├── test_go_game.py     # Engine unit tests (12 cases)
│   ├── test_handicap.py    # Star point handicap unit tests (3 cases)
│   ├── test_room_admin.py  # Room host & moderation unit tests (2 cases)
│   └── test_sgf.py         # SGF roundtrip unit tests (2 cases)
├── frontend/
│   ├── go.html             # Main web app layout & Admin Panel UI
│   ├── go.css              # Dark mode design system & glassmorphism
│   ├── go.js               # Canvas board renderer, Web Audio API & WebSocket client
│   ├── music/              # MP3 music tracks for top bar player
│   └── go-sounds/          # Board interaction WAV and MP3 sound effects
├── scripts/
│   ├── gen_sounds.py       # Audio sound asset generator script
│   └── release_tag.sh      # Git release tagging helper
├── PROJECT_ROADMAP.md      # GitHub issue index & Kanban roadmap
├── requirements.txt
├── README.md
├── LICENSE
└── .gitignore
```

---

## 🚀 Quick Start & Local Run Instructions

Follow these exact steps to run StoneSync locally:

```bash
# 1. Create a Python virtual environment
python3 -m venv .venv

# 2. Activate the virtual environment
source .venv/bin/activate

# 3. Install required dependencies
pip install -r requirements.txt

# 4. Start the FastAPI Uvicorn web server
uvicorn server.app:app --host 0.0.0.0 --port 8080

# 5. Open in your browser
# Navigate to http://localhost:8080/go
```

---

## 🧪 Running Unit Tests

Run pytest to execute the full automated test suite (19 test cases):

```bash
pytest -v
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
