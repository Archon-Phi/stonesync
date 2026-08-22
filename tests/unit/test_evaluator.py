"""
Unit tests for StoneSync AI Evaluator engine.
"""
import pytest
from server.go_game import GoGame
from server.evaluator import evaluate_game

def test_evaluator_initial_state():
    game = GoGame(board_size=19, komi=6.5)
    eval_result = evaluate_game(game)

    assert "win_rate_black" in eval_result
    assert "win_rate_white" in eval_result
    assert "score_lead" in eval_result
    assert "top_moves" in eval_result
    assert "influence_grid" in eval_result

    assert len(eval_result["top_moves"]) <= 3
    assert len(eval_result["influence_grid"]) == 19
    assert eval_result["win_rate_black"] + eval_result["win_rate_white"] == 100.0

def test_evaluator_top_moves_structure():
    game = GoGame(board_size=19, komi=6.5)
    game.place_stone(3, 3, 'B')
    eval_result = evaluate_game(game)

    top_moves = eval_result["top_moves"]
    assert len(top_moves) == 3

    first_move = top_moves[0]
    assert "r" in first_move
    assert "c" in first_move
    assert "score" in first_move
    assert "win_rate_b" in first_move
    assert "win_rate_w" in first_move
    assert "note" in first_move
    assert first_move["rank"] == 1
    assert first_move["badge"] == "①"
