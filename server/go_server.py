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

import asyncio
import json
import logging
import time
from typing import Dict, Set, Optional, Any, Tuple
from fastapi import WebSocket, WebSocketDisconnect
from server.go_game import GoGame
from server.agents.bot import StoneBot

logger = logging.getLogger("StoneSyncServer")

class Room:
    def __init__(
        self,
        room_id: str,
        board_size: int = 19,
        komi: Optional[float] = None,
        handicap: int = 0,
        is_solo: bool = False,
        is_ai: bool = False,
        time_control: str = 'none',
        main_time_sec: float = 600.0,
        byoyomi_periods: int = 3,
        byoyomi_time_sec: float = 30.0,
        fischer_increment_sec: float = 5.0
    ):
        self.room_id = room_id
        self.is_solo = is_solo
        self.is_ai = is_ai
        self.game = GoGame(
            board_size=board_size,
            komi=komi,
            handicap=handicap,
            time_control=time_control,
            main_time_sec=main_time_sec,
            byoyomi_periods=byoyomi_periods,
            byoyomi_time_sec=byoyomi_time_sec,
            fischer_increment_sec=fischer_increment_sec
        )
        self.players: Dict[str, str] = {}
        self.connections: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()
        self.chat_history: list = []

        if self.is_ai:
            self.players["bot_stonebot"] = "W"
            self.bot = StoneBot(color="W", difficulty="tactical")
        else:
            self.bot = None

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
                "short_id": "StoneBot" if pid == "bot_stonebot" else pid[:6],
                "color": color,
                "is_bot": pid == "bot_stonebot"
            }
            for pid, color in self.players.items()
        ]

    def get_state_payload(self) -> dict:
        return {
            "type": "state",
            "room_id": self.room_id,
            "game_state": self.game.to_dict(now_ts=time.time()),
            "players": self.get_players_info(),
            "chat_history": self.chat_history[-50:]
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

    async def trigger_ai_turn_if_needed(self):
        if not self.is_ai or not self.bot or self.game.game_over:
            return

        if self.game.current_player == self.bot.color:
            await asyncio.sleep(0.3)  # Brief pause for human realism
            move = self.bot.select_move(self.game)
            if move is None:
                try:
                    res = self.game.pass_turn(self.bot.color)
                    state = self.get_state_payload()
                    state["last_action"] = {"action": "pass", "by": self.bot.color, "game_over": res["game_over"]}
                    await self.broadcast(state)
                except ValueError:
                    pass
            else:
                r, c = move
                try:
                    res = self.game.place_stone(r, c, self.bot.color)
                    state = self.get_state_payload()
                    state["last_action"] = {"action": "move", "captured": res["captured"], "by": self.bot.color}
                    await self.broadcast(state)
                except ValueError:
                    pass


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(
        self,
        room_id: str,
        board_size: int = 19,
        komi: Optional[float] = None,
        handicap: int = 0,
        is_solo: bool = False,
        is_ai: bool = False,
        time_control: str = 'none',
        main_time_sec: float = 600.0,
        byoyomi_periods: int = 3,
        byoyomi_time_sec: float = 30.0,
        fischer_increment_sec: float = 5.0
    ) -> Room:
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(
                room_id,
                board_size=board_size,
                komi=komi,
                handicap=handicap,
                is_solo=is_solo,
                is_ai=is_ai,
                time_control=time_control,
                main_time_sec=main_time_sec,
                byoyomi_periods=byoyomi_periods,
                byoyomi_time_sec=byoyomi_time_sec,
                fischer_increment_sec=fischer_increment_sec
            )
        return self.rooms[room_id]

    async def connect_client(
        self,
        websocket: WebSocket,
        room_id: str,
        player_id: str,
        board_size: int = 19,
        komi: Optional[float] = None,
        handicap: int = 0,
        is_solo: bool = False,
        is_ai: bool = False,
        time_control: str = 'none',
        main_time_sec: float = 600.0,
        byoyomi_periods: int = 3,
        byoyomi_time_sec: float = 30.0,
        fischer_increment_sec: float = 5.0
    ) -> Tuple[Room, str]:
        await websocket.accept()
        room = self.get_or_create_room(
            room_id,
            board_size=board_size,
            komi=komi,
            handicap=handicap,
            is_solo=is_solo,
            is_ai=is_ai,
            time_control=time_control,
            main_time_sec=main_time_sec,
            byoyomi_periods=byoyomi_periods,
            byoyomi_time_sec=byoyomi_time_sec,
            fischer_increment_sec=fischer_increment_sec
        )
        if is_solo:
            room.is_solo = True
        if is_ai:
            room.is_ai = True
            if "bot_stonebot" not in room.players:
                room.players["bot_stonebot"] = "W"
                room.bot = StoneBot(color="W", difficulty="tactical")

        async with room.lock:
            role = room.register_player(player_id)
            room.connections[websocket] = player_id
            
        sync_payload = room.get_state_payload()
        sync_payload["your_role"] = role
        sync_payload["your_player_id"] = player_id
        await websocket.send_text(json.dumps(sync_payload))

        await room.broadcast(room.get_state_payload())
        await room.trigger_ai_turn_if_needed()
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
            if room.is_solo or data.get("is_solo"):
                role = room.game.current_player

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
                    await room.trigger_ai_turn_if_needed()
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "pass":
                try:
                    res = room.game.pass_turn(role)
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "pass", "by": role, "game_over": res["game_over"]}
                    await room.broadcast(state)
                    await room.trigger_ai_turn_if_needed()
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "resign":
                try:
                    room.game.resign(role)
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "resign", "by": role}
                    await room.broadcast(state)
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "reset":
                new_bs = data.get("board_size", room.game.board_size)
                new_komi = data.get("komi", room.game.komi)
                new_handicap = data.get("handicap", room.game.handicap)
                new_tc = data.get("time_control", room.game.time_control)
                new_mt = data.get("main_time_sec", room.game.main_time_sec)
                new_byo_p = data.get("byoyomi_periods", room.game.byoyomi_periods)
                new_byo_t = data.get("byoyomi_time_sec", room.game.byoyomi_time_sec)
                new_fisch = data.get("fischer_increment_sec", room.game.fischer_increment_sec)
                try:
                    room.game.reset(
                        board_size=int(new_bs),
                        komi=float(new_komi),
                        handicap=int(new_handicap),
                        time_control=str(new_tc),
                        main_time_sec=float(new_mt),
                        byoyomi_periods=int(new_byo_p),
                        byoyomi_time_sec=float(new_byo_t),
                        fischer_increment_sec=float(new_fisch)
                    )
                    state = room.get_state_payload()
                    state["last_action"] = {"action": "reset", "by": role}
                    await room.broadcast(state)
                    await room.trigger_ai_turn_if_needed()
                except ValueError as err:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(err)}))

            elif action == "chat":
                msg_text = str(data.get("text", "")).strip()
                if msg_text:
                    chat_item = {
                        "player_id": player_id,
                        "short_id": player_id[:6],
                        "role": role,
                        "text": msg_text,
                        "timestamp": time.strftime("%H:%M:%S")
                    }
                    room.chat_history.append(chat_item)
                    await room.broadcast({
                        "type": "chat",
                        "chat": chat_item
                    })

            elif action == "reaction":
                emoji = str(data.get("emoji", "🔥"))
                r = data.get("r")
                c = data.get("c")
                await room.broadcast({
                    "type": "reaction",
                    "player_id": player_id,
                    "role": role,
                    "emoji": emoji,
                    "r": r,
                    "c": c
                })

            elif action == "sync":
                state = room.get_state_payload()
                state["your_role"] = role
                state["your_player_id"] = player_id
                await websocket.send_text(json.dumps(state))

            else:
                await websocket.send_text(json.dumps({"type": "error", "message": f"Unknown action: {action}"}))

