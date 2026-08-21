# StoneSync

**StoneSync** is a standalone, local-first online two-player Go (Weiqi/Baduk) web application with authoritative server-side rule validation, real-time WebSocket room multiplayer, audio sound effects, and a responsive HTML5 Canvas interface.

- **Authoritative Go Game Engine**: Full rule validation on Python backend.

  - **Board Sizes**: 9x9, 13x13, 19x19.
  - **Liberties & Captures**: Group liberty tracking and immediate stone removal.
  - **Suicide Rule**: Strictly forbidden unless capturing opponent stones.
  - **Ko Rule**: Rejection of immediate recaptures that recreate previous board states.
  - **Passing & Scoring**: Two consecutive passes trigger game end; territory flood fill calculation + captures + configurable Komi (default 6.5).
- **WebSocket Multiplayer Rooms**:
  - Room-based play via URL query parameter (e.g. `/go?room=my-room&board_size=19&komi=6.5`).
  - Automatic role assignment: First two unique players become Black and White; additional connections join as read-only observers.
  - Client identity persisted via `localStorage` `player_id`.
  - Real-time turn enforcement and state broadcasting.
- **Rich Canvas UI & Audio**:
  - High-performance 2D Canvas Go board with 3D stone gradients, star points, and move indicators.
  - Audio feedback: Random stone placement sounds (`GoGame-Thwack1.wav` .. `GoGame-Thwack4.wav`) and capture sound (`GoGame-PieceRemoved.mp3`).
  - Responsive design for mobile and desktop screens.

---

## Project Structure

```
stonesync/
├── server/
│   ├── app.py              # FastAPI application server & routes
│   ├── go_game.py          # Authoritative Go rule engine
│   ├── go_server.py        # Room & WebSocket connection manager
│   └── test_go_game.py     # Unit test suite
├── frontend/
│   ├── go.html             # Main web app layout
│   ├── go.css              # Dark theme CSS design system
│   ├── go.js               # Canvas renderer & WebSocket client
│   └── go-sounds/          # Audio WAV and MP3 assets
├── scripts/
│   ├── gen_sounds.py       # Audio sound generator script
│   └── release_tag.sh      # Git release tagging helper
├── requirements.txt
├── README.md
├── LICENSE
└── .gitignore
```

---

## Quick Start & Local Run Instructions

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
# Open http://localhost:8080/go
```

---

## Running Unit Tests

Run pytest to verify the Go game engine rules (captures, suicide, Ko, passing & scoring):

```bash
pytest server/test_go_game.py
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
