"""
StoneSync Local Ollama LLM Agentic Go-Playing Layer.

This module implements an agentic Go-playing layer using a local Ollama LLM.
Key Architecture & Capabilities:
1. PRIVACY & LOCAL NETWORK:
   - Queries local Ollama service (default: http://127.0.0.1:11434).
   - Exposes REST API service over 0.0.0.0 on a configurable port (default: 8085).
   - Zero external telemetry or third-party data forwarding (strictly local & confidential).
   - Respects low resource usage configurations (sliding window history, strict token limits, HTTP timeouts).
   - Does NOT use 'sudo' or privileged Linux system calls.

2. CONTINUOUS CHAT HISTORY & CONVERSATION:
   - Append-only JSON/memory buffer array per game session (`session_id`).
   - Injects game-specific state context vectors (e.g. board size, turn, last opponent move notation/coordinates, captures).
   - Retains system prompt, user game states/questions, and assistant tactical logic across multi-turn sessions.

3. STANDARDIZED API & PAYLOAD HANDLING:
   - Accepts JSON payload vectors containing board vectors, captures, move history.
   - Returns structured string predictions, GTP coordinates, and tactical commentary.

4. EXPLICIT INLINE COMMENTS:
   - Details payload parsing, context building, Ollama HTTP exchange, and fallback execution loops.
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from typing import Dict, List, Optional, Tuple, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from server.go_game import GoGame
from server.agents.bot import StoneBot

# Configure logger for StoneSync Ollama Agent
logger = logging.getLogger("StoneSyncOllamaAgent")
logging.basicConfig(level=logging.INFO)


# -----------------------------------------------------------------------------
# Configuration & Coordinate Translation Utilities
# -----------------------------------------------------------------------------

class OllamaConfig:
    """
    Configuration parameters for local Ollama integration and network service.
    Reads environment variables with sensible defaults for low resource usage.
    """
    def __init__(self):
        # Local Ollama service endpoint (strictly confidential, no external forwarding)
        self.ollama_host: str = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
        # LLM model name registered in local Ollama instance (e.g., llama3, mistral, qwen2.5)
        self.model_name: str = os.getenv("OLLAMA_MODEL", "llama3")
        # Request timeout in seconds to maintain low latency and prevent hanging processes
        self.request_timeout: float = float(os.getenv("OLLAMA_TIMEOUT", "10.0"))
        # Max tokens generated per prompt to restrict resource utilization
        self.max_tokens: int = int(os.getenv("OLLAMA_MAX_TOKENS", "256"))
        # Temperature setting for LLM response generation (low temp for strategic consistency)
        self.temperature: float = float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))
        # Port for binding local network exposure (0.0.0.0)
        self.port: int = int(os.getenv("OLLAMA_AGENT_PORT", "8085"))
        # Network host binding (0.0.0.0 for local network client access)
        self.host: str = os.getenv("OLLAMA_AGENT_HOST", "0.0.0.0")


def coords_to_gtp(r: int, c: int, board_size: int = 19) -> str:
    """
    Convert (row, col) zero-indexed integer coordinates to standard Go GTP notation.
    Note: Go GTP notation uses columns A-T (skipping 'I') and rows 1 to board_size (bottom to top).
    """
    col_letters = "ABCDEFGHJKLMNOPQRST"
    if 0 <= c < len(col_letters) and 0 <= r < board_size:
        col_char = col_letters[c]
        row_num = board_size - r  # Row 0 is top of grid (board_size), Row N is bottom (1)
        return f"{col_char}{row_num}"
    return f"({r},{c})"


def gtp_to_coords(gtp_str: str, board_size: int = 19) -> Optional[Tuple[int, int]]:
    """
    Convert standard GTP notation string (e.g., 'E4', 'D16', 'K10') to zero-indexed (row, col) integer tuple.
    Returns None if format is invalid.
    """
    if not gtp_str:
        return None
    s = gtp_str.strip().upper()
    col_letters = "ABCDEFGHJKLMNOPQRST"
    if len(s) >= 2 and s[0] in col_letters and s[1:].isdigit():
        c = col_letters.index(s[0])
        row_num = int(s[1:])
        r = board_size - row_num
        if 0 <= r < board_size and 0 <= c < board_size:
            return (r, c)
    return None


# -----------------------------------------------------------------------------
# Data Models for JSON Payloads
# -----------------------------------------------------------------------------

class LastMovePayload(BaseModel):
    """Payload vector representing the preceding move on the Go board."""
    r: Optional[int] = Field(default=None, description="0-indexed row integer")
    c: Optional[int] = Field(default=None, description="0-indexed column integer")
    player: Optional[str] = Field(default=None, description="Player color 'B' or 'W'")
    notation: Optional[str] = Field(default=None, description="GTP notation e.g. E4")


class MovePredictionRequest(BaseModel):
    """Standardized request payload from external game clients to request LLM prediction."""
    session_id: str = Field(..., description="Unique session identifier for multi-turn chat history")
    board_size: int = Field(default=19, description="Board grid size (9, 13, or 19)")
    current_player: str = Field(default='W', description="Player color for turn ('B' or 'W')")
    last_move: Optional[LastMovePayload] = Field(default=None, description="Last played move vector")
    grid: Optional[List[List[Optional[str]]]] = Field(default=None, description="Full board grid state matrix ('B', 'W', or None)")
    captures: Optional[Dict[str, int]] = Field(default_factory=lambda: {"B": 0, "W": 0})
    user_message: Optional[str] = Field(default=None, description="Optional strategic query or commentary prompt")



class ChatMessageRequest(BaseModel):
    """Payload for direct multi-turn conversational messages."""
    session_id: str = Field(..., description="Unique game session ID")
    message: str = Field(..., description="User query or chat text")
    board_context: Optional[Dict[str, Any]] = Field(default=None, description="Optional extra board state object")


# -----------------------------------------------------------------------------
# Continuous Multi-Turn Chat Buffer System
# -----------------------------------------------------------------------------

class SessionChatBuffer:
    """
    Append-only JSON memory buffer retaining multi-turn conversation context
    for a single game session. Caps history length to maintain low resource usage.
    """
    def __init__(self, session_id: str, max_turns: int = 50):
        self.session_id = session_id
        self.max_turns = max_turns
        self.history: List[Dict[str, Any]] = []
        self._init_system_prompt()

    def _init_system_prompt(self):
        """Initialize append-only history with system prompt defining AI agent role."""
        system_msg = {
            "role": "system",
            "content": (
                "You are StoneSensei, an expert AI Go (Weiqi/Baduk) Grandmaster and Tactical Advisor. "
                "You evaluate Go board vectors, territory, group liberties, and capture balances. "
                "Always provide precise GTP move recommendations (e.g. 'Play at E4') along with concise tactical commentary. "
                "All board and conversation data is strictly confidential within this local deployment."
            ),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metadata": {"type": "system_prompt"}
        }
        self.history.append(system_msg)

    def append_message(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Append a new message entry into the session chat history log.
        Maintains low resource usage by trimming oldest turns beyond `max_turns`.
        """
        entry = {
            "role": role,
            "content": content,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metadata": metadata or {}
        }
        self.history.append(entry)

        # Trimming loop structure: retain system prompt (index 0) + newest N messages
        if len(self.history) > (self.max_turns + 1):
            sys_prompt = self.history[0]
            self.history = [sys_prompt] + self.history[-(self.max_turns):]

    def get_ollama_messages(self) -> List[Dict[str, str]]:
        """Extract roll window messages formatted for Ollama API payload."""
        return [{"role": item["role"], "content": item["content"]} for item in self.history]

    def clear(self):
        """Reset and re-initialize session chat history."""
        self.history = []
        self._init_system_prompt()


# -----------------------------------------------------------------------------
# Ollama Agent Manager Engine
# -----------------------------------------------------------------------------

class OllamaAgentManager:
    """
    Core engine managing active session chat buffers, HTTP interaction with local Ollama,
    state context injection, and fallback heuristic decision processing.
    """
    def __init__(self, config: Optional[OllamaConfig] = None):
        self.config = config or OllamaConfig()
        self.sessions: Dict[str, SessionChatBuffer] = {}
        # Heuristic fallback bot for backup move selection when Ollama service is unavailable
        self.fallback_bot = StoneBot(difficulty='tactical')

    def get_session(self, session_id: str) -> SessionChatBuffer:
        """Fetch or create append-only chat history buffer for session_id."""
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionChatBuffer(session_id)
        return self.sessions[session_id]

    def query_ollama(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Execute synchronous HTTP request to local Ollama instance (/api/chat).
        Uses Python standard urllib library for minimal resource overhead and zero external dependencies.
        Strictly local connection (no external data sharing).
        """
        url = f"{self.config.ollama_host.rstrip('/')}/api/chat"
        payload = {
            "model": self.config.model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
                "num_predict": self.config.max_tokens
            }
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.config.request_timeout) as resp:
                if resp.status == 200:
                    body = resp.read().decode("utf-8")
                    return json.loads(body)
                else:
                    logger.warning(f"Ollama endpoint returned HTTP status {resp.status}")
                    return {"error": f"HTTP {resp.status}"}
        except (urllib.error.URLError, TimeoutError, Exception) as e:
            logger.info(f"Ollama local service query failed ({url}): {e}")
            return {"error": str(e)}

    def generate_move_and_commentary(self, req: MovePredictionRequest) -> Dict[str, Any]:
        """
        Main payload handling routine:
        1. Retrieves continuous chat buffer for session_id.
        2. Formats and injects game state context vector into chat history.
        3. Queries local Ollama LLM for move prediction & commentary.
        4. Parses GTP coordinates or falls back to heuristic engine if needed.
        5. Returns standardized JSON output response.
        """
        session = self.get_session(req.session_id)

        # Construct human-readable last move string for context injection
        last_move_str = "None"
        if req.last_move:
            if req.last_move.notation:
                last_move_str = req.last_move.notation
            elif req.last_move.r is not None and req.last_move.c is not None:
                last_move_str = coords_to_gtp(req.last_move.r, req.last_move.c, req.board_size)
            if req.last_move.player:
                last_move_str = f"{last_move_str} by player {req.last_move.player}"

        b_caps = req.captures.get("B", 0) if req.captures else 0
        w_caps = req.captures.get("W", 0) if req.captures else 0

        # Build game-specific state context string to inject into chat window
        context_str = (
            f"[GAME STATE UPDATE]\n"
            f"The opponent just played at {last_move_str}.\n"
            f"Current capture count is Black: {b_caps}, White: {w_caps}.\n"
            f"Board Size: {req.board_size}x{req.board_size} | Turn: {req.current_player}.\n"
        )
        if req.user_message:
            context_str += f"User Note/Query: {req.user_message}\n"

        # Append state context into continuous session chat history
        session.append_message(
            role="user",
            content=context_str,
            metadata={"last_move": last_move_str, "captures": req.captures}
        )

        # Perform query loop to local Ollama service
        ollama_resp = self.query_ollama(session.get_ollama_messages())

        commentary = ""
        suggested_move = None
        coords = None

        if "error" not in ollama_resp and "message" in ollama_resp:
            assistant_text = ollama_resp["message"].get("content", "")
            commentary = assistant_text
            # Append LLM assistant response to continuous history
            session.append_message(
                role="assistant",
                content=assistant_text,
                metadata={"source": "ollama_llm"}
            )
            # Scan tokens in assistant response for valid GTP coordinate notation (e.g. E4, D16)
            words = assistant_text.replace(",", " ").replace(".", " ").replace(":", " ").split()
            for token in words:
                parsed = gtp_to_coords(token, req.board_size)
                if parsed:
                    coords = parsed
                    suggested_move = coords_to_gtp(coords[0], coords[1], req.board_size)
                    break

        # Fallback decision loop: use heuristic StoneBot if LLM is offline or gave non-coordinate text
        if not coords:
            game = GoGame(board_size=req.board_size)
            if req.grid:
                game.grid = req.grid
            game.current_player = req.current_player
            self.fallback_bot.color = req.current_player
            fb_move = self.fallback_bot.select_move(game)
            if fb_move:
                coords = (fb_move[0], fb_move[1])
                suggested_move = coords_to_gtp(coords[0], coords[1], req.board_size)
                if not commentary:
                    commentary = f"Tactical analysis recommends playing at {suggested_move} to secure local liberties."
            else:
                suggested_move = "PASS"
                if not commentary:
                    commentary = "No high-value legal move found. Recommended action: PASS."

            # Append fallback note to history if Ollama was not available
            if "error" in ollama_resp:
                session.append_message(
                    role="assistant",
                    content=commentary,
                    metadata={"source": "heuristic_fallback"}
                )

        return {
            "status": "success",
            "session_id": req.session_id,
            "prediction": {
                "suggested_move": suggested_move,
                "coords": {"r": coords[0], "c": coords[1]} if coords else None,
                "commentary": commentary
            },
            "history_length": len(session.history),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }


# -----------------------------------------------------------------------------
# FastAPI Integration Service & Network Exposure (0.0.0.0)
# -----------------------------------------------------------------------------

agent_app = FastAPI(
    title="StoneSync Ollama Agent Service",
    description="Agentic Go-playing LLM layer with multi-turn chat history exposed over local network interface."
)

# Enable CORS middleware to support remote external game clients on the local network
agent_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate global manager and config
agent_manager = OllamaAgentManager()


@agent_app.get("/api/ollama/health")
@agent_app.get("/health")
def health_check():
    """Service status and local configuration status endpoint."""
    return {
        "status": "online",
        "service": "StoneSync Ollama Agent",
        "config": {
            "ollama_host": agent_manager.config.ollama_host,
            "model_name": agent_manager.config.model_name,
            "host": agent_manager.config.host,
            "port": agent_manager.config.port,
            "request_timeout": agent_manager.config.request_timeout,
            "max_tokens": agent_manager.config.max_tokens
        }
    }


@agent_app.post("/api/ollama/predict")
@agent_app.post("/api/ollama/move")
def predict_move_endpoint(req: MovePredictionRequest):
    """
    Standardized payload endpoint. Receives board vectors, updates append-only chat history,
    queries Ollama LLM, and returns structured move prediction and tactical commentary.
    """
    try:
        return agent_manager.generate_move_and_commentary(req)
    except Exception as e:
        logger.error(f"Error handling move prediction payload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@agent_app.post("/api/ollama/chat")
def chat_message_endpoint(req: ChatMessageRequest):
    """
    Multi-turn chat endpoint allowing custom tactical conversation within session context.
    """
    try:
        session = agent_manager.get_session(req.session_id)
        msg_text = req.message
        if req.board_context:
            msg_text = f"[BOARD STATE] {json.dumps(req.board_context)}\n{req.message}"

        session.append_message(role="user", content=msg_text)
        resp = agent_manager.query_ollama(session.get_ollama_messages())

        if "error" not in resp and "message" in resp:
            assistant_content = resp["message"].get("content", "")
            session.append_message(role="assistant", content=assistant_content)
            return {
                "status": "success",
                "session_id": req.session_id,
                "response": assistant_content,
                "history_length": len(session.history)
            }
        else:
            fallback_msg = "StoneSensei is operating in local fallback mode."
            session.append_message(role="assistant", content=fallback_msg)
            return {
                "status": "fallback",
                "session_id": req.session_id,
                "response": fallback_msg,
                "history_length": len(session.history)
            }
    except Exception as e:
        logger.error(f"Error handling chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@agent_app.get("/api/ollama/history/{session_id}")
def get_session_history_endpoint(session_id: str):
    """Retrieve full append-only session chat history."""
    session = agent_manager.get_session(session_id)
    return {
        "session_id": session_id,
        "history": session.history,
        "total_messages": len(session.history)
    }


@agent_app.post("/api/ollama/reset/{session_id}")
def reset_session_endpoint(session_id: str):
    """Reset session chat history buffer."""
    session = agent_manager.get_session(session_id)
    session.clear()
    return {
        "status": "success",
        "message": f"Session history buffer for '{session_id}' reset successfully."
    }


# -----------------------------------------------------------------------------
# OllamaStoneBot Adapter for StoneSync Room Integration
# -----------------------------------------------------------------------------

class OllamaStoneBot:
    """
    StoneSync Bot Player Adapter using the Ollama Agent layer.
    Can be used by StoneSync WebSocket rooms to drive AI turns.
    """
    def __init__(self, color: str = 'W', session_id: str = "main-match", manager: Optional[OllamaAgentManager] = None):
        self.color = color
        self.session_id = session_id
        self.manager = manager or agent_manager

    def select_move(self, game: GoGame) -> Optional[Tuple[int, int]]:
        if game.game_over or game.current_player != self.color:
            return None

        # Build last move payload vector from game.last_move
        last_move_payload = None
        if game.last_move:
            last_r = game.last_move.get("r")
            last_c = game.last_move.get("c")
            last_p = 'B' if self.color == 'W' else 'W'
            if last_r is not None and last_c is not None:
                gtp_notation = coords_to_gtp(last_r, last_c, game.board_size)
                last_move_payload = LastMovePayload(r=last_r, c=last_c, player=last_p, notation=gtp_notation)


        req = MovePredictionRequest(
            session_id=self.session_id,
            board_size=game.board_size,
            current_player=self.color,
            last_move=last_move_payload,
            grid=game.grid,
            captures={"B": game.captures['B'], "W": game.captures['W']}
        )

        res = self.manager.generate_move_and_commentary(req)
        prediction = res.get("prediction", {})
        coords = prediction.get("coords")
        if coords:
            return (coords["r"], coords["c"])
        return None


# Runnable entry point for exposing standalone network service over local interface (0.0.0.0)
if __name__ == "__main__":
    import uvicorn
    cfg = OllamaConfig()
    logger.info(f"Starting StoneSync Ollama Agent Service on {cfg.host}:{cfg.port}...")
    uvicorn.run(agent_app, host=cfg.host, port=cfg.port)
