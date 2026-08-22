"""
Unit tests for StoneBot AI difficulty configuration.
"""
import pytest
from server.go_game import GoGame
from server.agents.bot import StoneBot

def test_stonebot_difficulty_initialization():
    bot_easy = StoneBot(color="W", difficulty="easy")
    bot_medium = StoneBot(color="W", difficulty="medium")
    bot_hard = StoneBot(color="W", difficulty="hard")
    bot_master = StoneBot(color="W", difficulty="master")

    assert bot_easy.difficulty == "easy"
    assert bot_medium.difficulty == "medium"
    assert bot_hard.difficulty == "hard"
    assert bot_master.difficulty == "master"

def test_stonebot_select_move_all_difficulties():
    game = GoGame(board_size=9)
    game.place_stone(4, 4, 'B')  # Black plays center

    for diff in ["easy", "medium", "hard", "master"]:
        bot = StoneBot(color="W", difficulty=diff)
        move = bot.select_move(game)
        assert move is not None
        r, c = move
        assert 0 <= r < 9 and 0 <= c < 9
        assert game.grid[r][c] is None
