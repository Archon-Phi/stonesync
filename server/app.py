"""
StoneSync FastAPI Application
Serves static frontend assets, main UI route /go (and / redirect), and WebSocket endpoint for room multiplayer.
"""
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from server.go_server import RoomManager

app = FastAPI(title="StoneSync - Online Multiplayer Go")

# Locate frontend directory relative to current file
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
SOUNDS_DIR = FRONTEND_DIR / "go-sounds"

# Ensure sound files exist
thwack1 = SOUNDS_DIR / "GoGame-Thwack1.wav"
if not thwack1.exists():
    try:
        from scripts.gen_sounds import generate_wav
        generate_wav(str(SOUNDS_DIR / "GoGame-Thwack1.wav"), frequency=540, duration=0.08, volume=0.85)
        generate_wav(str(SOUNDS_DIR / "GoGame-Thwack2.wav"), frequency=660, duration=0.07, volume=0.85)
        generate_wav(str(SOUNDS_DIR / "GoGame-Thwack3.wav"), frequency=480, duration=0.09, volume=0.85)
        generate_wav(str(SOUNDS_DIR / "GoGame-Thwack4.wav"), frequency=750, duration=0.06, volume=0.85)
        generate_wav(str(SOUNDS_DIR / "GoGame-PieceRemoved.mp3"), frequency=820, duration=0.12, volume=0.9, noise_mix=0.5, double_click=True)
    except Exception as e:
        print(f"Warning generating sound assets: {e}")

# Mount static files under /static
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


room_manager = RoomManager()

@app.get("/")
async def root():
    return RedirectResponse(url="/go")

@app.get("/go")
async def get_go_page():
    html_file = FRONTEND_DIR / "go.html"
    if html_file.exists():
        return FileResponse(str(html_file), media_type="text/html")
    return {"error": "go.html not found"}

@app.websocket("/ws/go/{room_id}")
async def websocket_go_endpoint(
    websocket: WebSocket,
    room_id: str,
    player_id: str = Query(...),
    board_size: int = Query(19),
    komi: float = Query(6.5)
):
    room, role = await room_manager.connect_client(websocket, room_id, player_id, board_size=board_size, komi=komi)
    try:
        while True:
            raw_text = await websocket.receive_text()
            await room_manager.handle_message(websocket, room, player_id, raw_text)
    except WebSocketDisconnect:
        await room_manager.disconnect_client(websocket, room)
    except Exception as e:
        await room_manager.disconnect_client(websocket, room)
