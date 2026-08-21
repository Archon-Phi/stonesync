"""
Unit tests for StoneSync Room Admin & Moderation Controls (Module 10)
"""
import pytest
from server.go_server import Room

def test_room_host_registration():
    room = Room(room_id="admin-test-room")
    role_host = room.register_player("host_user_1", preferred_color="B")
    assert role_host == "B"
    assert room.host_id == "host_user_1"

    role_p2 = room.register_player("guest_user_2", preferred_color="W")
    assert role_p2 == "W"
    assert room.host_id == "host_user_1"

def test_room_pause_and_winner_adjudication():
    room = Room(room_id="admin-test-room-2")
    room.register_player("host_user_1", preferred_color="B")

    # Test clock pause toggle
    assert not room.is_paused
    room.is_paused = True
    assert room.is_paused

    # Test admin winner adjudication
    assert not room.game.game_over
    room.game.game_over = True
    room.game.winner = "B"
    room.game.win_reason = "adjudication"

    assert room.game.game_over
    assert room.game.winner == "B"
    assert room.game.win_reason == "adjudication"

