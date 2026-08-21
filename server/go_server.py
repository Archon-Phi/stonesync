"""
StoneSync Room & WebSocket Server Manager
Manages room instances, player identity registration, and authoritative state broadcasting over WebSockets.
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
from server.go_game import GoGame

logger = logging.getLogger("StoneSyncServer")

class Room:
    def __init__(self, room_id: str, board_size: int = 19, komi: Optional[float] = None, handicap: int = 0):
        self.room_id = room_id
        self.game = GoGame(board_size=board_size, komi=komi, handicap=handicap)
        # Mapping player_id -> color ('B' or 'W')
        self.players: Dict[str, str] = {}
        # Active WebSocket connections: websocket -> player_id
        self.connections: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()

    def register_player(self, player_id: str) -> str:
        """Assign role ('B', 'W', or 'observer') to player_id."""
        if player_id in self.players:
            return self.players[player_id]

        assigned_colors = set(self.players.values())
        if 'B' not in assigned_colors:
            self.players[player_id] = 'B'
            return 'B'
        elif 'W' not in assigned_colors:
            self.players[player_id] = 'W'
            return 'W'
        else:
            return 'observer'

    def get_players_info(self) -> list:
        return [
            {
                "player_id": pid,
                "short_id": pid[:6],
                "color": color
            }
            for pid, color in self.players.items()
        ]

    def get_state_payload(self) -> dict:
        return {
            "type": "state",
            "room_id": self.room_id,
            "game_state": self.game.to_dict(),
            "players": self.get_players_info()
        }

    async def broadcast(self, message: dict):
        payload_str = json.dumps(message)
        disconnected = []
        for ws in list(self.connections.keys()):
            try:
                await ws.send_text(payload_str)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                disconnected.append(ws)
        for ws in disconnected:
            self.connections.pop(ws, None)


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(self, room_id: str, board_size: int = 19, komi: Optional[float] = None, handicap: int = 0) -> Room:
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id, board_size=board_size, komi=komi, handicap=handicap)
        return self.rooms[room_id]

    async def connect_client(self, websocket: WebSocket, room_id: str, player_id: str, board_size: int = 19, komi: Optional[float] = None, handicap: int = 0) -> Tuple[Room, str]:
        await websocket.accept()
        room = self.get_or_create_room(room_id, board_size=board_size, komi=komi, handicap=handicap)

        
        async with room.lock:
            role = room.register_player(player_id)
            room.connections[websocket] = player_id
            
        # Send initial sync payload specifically to this connection
        sync_payload = room.get_state_payload()
        sync_payload["your_role"] = role
        sync_payload["your_player_id"] = player_id
        await websocket.send_text(json.dumps(sync_payload))

        # Broadcast state update to room so everyone sees player updates
        await room.broadcast(room.get_state_payload())
        return room, role

    async def disconnect_client(self, websocket: WebSocket, room: Room):
        async with room.lock:
            room.connections.pop(websocket, None)
            await room.broadcast(room.get_state_payload())

    async def handle_message(self, websocket: WebSocket, room: Room, player_id: str, raw_text: str):
        try:
            data = json.loads(raw_text)
        except Exception:
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON format"}))
            return

        action = data.get("action")
        async with room.lock:
            role = room.players.get(player_id, 'observer')

            if action == "move":
                r = data.get("r")
                c = data.get("c")
                if r is None or c is None:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Missing coordinates"}))
                    return
                try:
                    res = room.game.place_stone(int(r), int(c), role)
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "move", "captured": res["captured"], "by": role}
                    await room.broadcast(state)
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "pass":
                try:
                    res = room.game.pass_turn(role)
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "pass", "by": role, "game_over": res["game_over"]}
                    await room.broadcast(state)
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "reset":
                new_bs = data.get("board_size", room.game.board_size)
                new_komi = data.get("komi", room.game.komi)
                try:
                    room.game.reset(board_size=int(new_bs), komi=float(new_komi))
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "reset", "by": role}
                    await room.broadcast(state)
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "sync":
                state = room.get_state_payload()
                state["your_role"] = role
                state["your_player_id"] = player_id
                await websocket.send_text(json.dumps(state))

            else:
                await websocket.send_text(json.dumps({"type": "error", "message": f"Unknown action: {action}"}))
