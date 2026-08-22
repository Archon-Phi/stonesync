"""
StoneSync FastAPI Application
Serves static frontend assets, main UI route /go (and / redirect), and WebSocket endpoint for room multiplayer.
"""
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from server.go_server import RoomManager
from server.sgf import export_to_sgf, parse_sgf
from server.agents.ollama_agent import agent_app as ollama_agent_app
from fastapi import Response, Request

app = FastAPI(title="StoneSync - Online Multiplayer Go")

# Include local Ollama LLM Agent routes
app.include_router(ollama_agent_app.router)



# Locate frontend directory relative to current file
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
SOUNDS_DIR = FRONTEND_DIR / "go-sounds"
MUSIC_DIR = FRONTEND_DIR / "music"

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

@app.get("/api/audio-tracks")
async def get_audio_tracks():
    tracks = []
    if MUSIC_DIR.exists():
        for file in sorted(MUSIC_DIR.iterdir()):
            if file.is_file() and file.suffix.lower() in [".mp3", ".wav", ".ogg", ".flac", ".m4a"]:
                clean_name = file.stem.replace("_", " ").replace("-", " ")
                icon = "🎵" if file.suffix.lower() == ".mp3" else "🎧"
                tracks.append({
                    "title": f"{icon} {clean_name}",
                    "filename": file.name,
                    "src": f"/static/music/{file.name}",
                    "type": file.suffix.lower()
                })
    return {"tracks": tracks}



@app.websocket("/ws/go/{room_id}")
async def websocket_go_endpoint(
    websocket: WebSocket,
    room_id: str,
    player_id: str = Query(...),
    player_name: str = Query(""),
    board_size: int = Query(19),
    komi: float = Query(6.5),
    handicap: int = Query(0),
    mode: str = Query("online"),
    time_control: str = Query("none"),
    main_time_sec: float = Query(600.0),
    byoyomi_periods: int = Query(3),
    byoyomi_time_sec: float = Query(30.0),
    fischer_increment_sec: float = Query(5.0)
):

    is_solo = (mode in ("solo", "debug"))
    is_ai = (mode == "ai")
    is_debug = (mode == "debug")
    room, role = await room_manager.connect_client(
        websocket,
        room_id,
        player_id,
        player_name=player_name,
        board_size=board_size,
        komi=komi,
        handicap=handicap,
        is_solo=is_solo,
        is_ai=is_ai,
        is_debug=is_debug,
        time_control=time_control,
        main_time_sec=main_time_sec,
        byoyomi_periods=byoyomi_periods,
        byoyomi_time_sec=byoyomi_time_sec,
        fischer_increment_sec=fischer_increment_sec
    )



    try:
        while True:
            raw_text = await websocket.receive_text()
            await room_manager.handle_message(websocket, room, player_id, raw_text)
    except WebSocketDisconnect:
        await room_manager.disconnect_client(websocket, room)
    except Exception as e:
        await room_manager.disconnect_client(websocket, room)

@app.get("/api/room/{room_id}/sgf")
async def export_room_sgf(room_id: str):
    room = room_manager.get_or_create_room(room_id)
    sgf_content = export_to_sgf(room.game)
    return Response(
        content=sgf_content,
        media_type="application/x-go-sgf",
        headers={"Content-Disposition": f'attachment; filename="stonesync_{room_id}.sgf"'}
    )


@app.post("/api/room/{room_id}/sgf")
async def import_room_sgf(room_id: str, request: Request):
    body = await request.body()
    sgf_text = body.decode("utf-8")
    try:
        imported_game = parse_sgf(sgf_text)
        room = room_manager.get_or_create_room(room_id, board_size=imported_game.board_size, komi=imported_game.komi)
        async with room.lock:
            room.game = imported_game
            await room.broadcast(room.get_state_payload())
        return {"status": "success", "message": "SGF game record imported successfully"}
    except Exception as e:
        return Response(content=f"Invalid SGF content: {e}", status_code=400)

