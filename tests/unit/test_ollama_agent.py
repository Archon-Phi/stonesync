"""
Unit tests for StoneSync Local Ollama LLM Agent Integration Layer.
"""
import pytest

from server.agents.ollama_agent import (
    OllamaConfig,
    SessionChatBuffer,
    OllamaAgentManager,
    OllamaStoneBot,
    coords_to_gtp,
    gtp_to_coords,
    agent_app,
    MovePredictionRequest,
    LastMovePayload
)
from server.go_game import GoGame


def test_ollama_config_defaults():
    config = OllamaConfig()
    assert config.host == "0.0.0.0"
    assert config.port == 8085
    assert "127.0.0.1" in config.ollama_host or "localhost" in config.ollama_host
    assert config.max_tokens == 256
    assert config.request_timeout == 10.0


def test_coordinate_conversions():
    # GTP notation skips 'I'
    # (0, 0) top left -> A19 on a 19x19 board
    assert coords_to_gtp(0, 0, 19) == "A19"
    assert gtp_to_coords("A19", 19) == (0, 0)

    # E4 test
    # Column E is index 4 ('A','B','C','D','E' -> 0,1,2,3,4)
    # Row 4 is 19 - 4 = 15
    assert coords_to_gtp(15, 4, 19) == "E4"
    assert gtp_to_coords("E4", 19) == (15, 4)

    # Invalid coordinates return None
    assert gtp_to_coords("ZZ99", 19) is None
    assert gtp_to_coords("", 19) is None


def test_session_chat_buffer():
    session = SessionChatBuffer(session_id="test-room-1", max_turns=5)
    assert len(session.history) == 1
    assert session.history[0]["role"] == "system"

    # Append user moves and assistant responses
    session.append_message("user", "Opponent played E4")
    session.append_message("assistant", "Recommend response at D4")

    assert len(session.history) == 3
    assert session.history[1]["content"] == "Opponent played E4"
    assert session.history[2]["content"] == "Recommend response at D4"

    # Verify reset/clear
    session.clear()
    assert len(session.history) == 1
    assert session.history[0]["role"] == "system"


def test_session_chat_buffer_rolling_trim():
    session = SessionChatBuffer(session_id="test-trim", max_turns=4)
    for i in range(10):
        session.append_message("user", f"Turn {i}")

    # System prompt + last 4 turns = max 5 entries
    assert len(session.history) == 5
    assert session.history[0]["role"] == "system"
    assert session.history[-1]["content"] == "Turn 9"


def test_ollama_agent_manager_move_prediction():
    manager = OllamaAgentManager()
    req = MovePredictionRequest(
        session_id="test-session-123",
        board_size=19,
        current_player="W",
        last_move=LastMovePayload(r=15, c=4, player="B", notation="E4"),
        captures={"B": 1, "W": 0},
        user_message="Find standard response to E4"
    )

    result = manager.generate_move_and_commentary(req)
    assert result["status"] == "success"
    assert result["session_id"] == "test-session-123"
    assert "prediction" in result
    assert "suggested_move" in result["prediction"]
    assert "coords" in result["prediction"]
    assert "commentary" in result["prediction"]

    # History should contain system prompt + context move + assistant response
    session = manager.get_session("test-session-123")
    assert len(session.history) >= 3
    user_msg = session.history[1]["content"]
    assert "Opponent just played at E4" in user_msg or "E4 by player B" in user_msg
    assert "Black: 1, White: 0" in user_msg


def test_fastapi_ollama_endpoints():
    from server.agents.ollama_agent import (
        health_check,
        predict_move_endpoint,
        chat_message_endpoint,
        get_session_history_endpoint,
        reset_session_endpoint,
        ChatMessageRequest
    )

    # 1. Health check
    health_resp = health_check()
    assert health_resp["status"] == "online"
    assert health_resp["config"]["host"] == "0.0.0.0"

    # 2. Predict move endpoint
    req = MovePredictionRequest(
        session_id="api-test-session",
        board_size=19,
        current_player="W",
        last_move=LastMovePayload(r=3, c=3, player="B", notation="D16"),
        captures={"B": 0, "W": 0}
    )
    res_data = predict_move_endpoint(req)
    assert res_data["status"] == "success"
    assert res_data["session_id"] == "api-test-session"
    assert "prediction" in res_data

    # 3. Multi-turn Chat endpoint
    chat_req = ChatMessageRequest(
        session_id="api-test-session",
        message="What is the key principle in this corner?"
    )
    chat_data = chat_message_endpoint(chat_req)
    assert "response" in chat_data

    # 4. Get history endpoint
    hist_data = get_session_history_endpoint("api-test-session")
    assert len(hist_data["history"]) >= 4

    # 5. Reset session endpoint
    reset_resp = reset_session_endpoint("api-test-session")
    assert reset_resp["status"] == "success"

    hist_data_after = get_session_history_endpoint("api-test-session")
    assert len(hist_data_after["history"]) == 1



def test_ollama_stonebot_adapter():
    game = GoGame(board_size=19)
    bot = OllamaStoneBot(color="W", session_id="bot-adapter-room")

    game.place_stone(3, 3, "B")
    move = bot.select_move(game)

    assert move is not None
    r, c = move
    assert 0 <= r < 19 and 0 <= c < 19
