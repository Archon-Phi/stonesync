"""
Unit tests for StoneSync Go Game Engine.
Tests:
- single-stone capture
- suicide rejection
- ko rejection
- two-pass game end + score with komi
"""
import pytest
from server.go_game import GoGame

def test_single_stone_capture():
    game = GoGame(board_size=9)
    # B at (1, 1)
    game.place_stone(1, 1, 'B')
    # W at (1, 2)
    game.place_stone(1, 2, 'W')
    # B surrounds W at (1, 2) via (0, 2), (2, 2), (1, 3)
    game.place_stone(0, 2, 'B')
    game.place_stone(4, 4, 'W') # dummy move
    game.place_stone(2, 2, 'B')
    game.place_stone(5, 5, 'W') # dummy move
    # Final capturing move at (1, 3)
    res = game.place_stone(1, 3, 'B')
    
    assert res['captured'] == 1
    assert game.grid[1][2] is None, "Captured White stone should be removed from board"
    assert game.captures['B'] == 1, "Black capture count should be 1"

def test_suicide_rejection():
    game = GoGame(board_size=9)
    # White surrounds corner (0, 0) by placing at (0, 1) and (1, 0)
    # B plays (4, 4)
    game.place_stone(4, 4, 'B')
    game.place_stone(0, 1, 'W')
    game.place_stone(5, 5, 'B')
    game.place_stone(1, 0, 'W')
    
    # Now it is B's turn. Attempting to play at (0, 0) has 0 liberties and captures no stones.
    with pytest.raises(ValueError, match="Suicide move is illegal"):
        game.place_stone(0, 0, 'B')
    
    assert game.grid[0][0] is None, "Corner intersection should remain empty"

def test_suicide_legal_when_capturing():
    game = GoGame(board_size=9)
    # Corner capture: W stone at (0,0). B at (0,1).
    # W plays (0, 0)
    # B plays (0, 1)
    # W plays (5, 5)
    # B plays (1, 0) -> captures W at (0,0) even though (1,0) completes surrounding.
    game.place_stone(0, 1, 'B')
    game.place_stone(0, 0, 'W')
    res = game.place_stone(1, 0, 'B')
    assert res['captured'] == 1
    assert game.grid[0][0] is None

def test_ko_rejection():
    game = GoGame(board_size=9)
    # Setup Ko structure:
    # B: (0, 1), (1, 0), (2, 1)
    # W: (0, 2), (1, 3), (2, 2)
    # B plays (1, 2)
    # W plays (1, 1) capturing B(1, 2)
    # B attempts to immediately play (1, 2) -> should be rejected by Ko rule.

    moves = [
        (0, 1, 'B'), (0, 2, 'W'),
        (1, 0, 'B'), (1, 3, 'W'),
        (2, 1, 'B'), (2, 2, 'W'),
        (1, 2, 'B')  # B places at (1, 2)
    ]
    for r, c, player in moves:
        game.place_stone(r, c, player)

    # W plays (1, 1) which captures B's stone at (1, 2)
    res = game.place_stone(1, 1, 'W')
    assert res['captured'] == 1
    assert game.grid[1][2] is None, "B(1, 2) should be captured"

    # Now B attempts immediate recapture at (1, 2)
    with pytest.raises(ValueError, match="Ko rule violation"):
        game.place_stone(1, 2, 'B')

def test_two_pass_game_end_and_score():
    game = GoGame(board_size=9, komi=6.5)
    # Black plays (0, 0)
    game.place_stone(0, 0, 'B')
    # White passes
    res_w = game.pass_turn('W')
    assert not res_w['game_over']
    # Black passes -> game ends
    res_b = game.pass_turn('B')
    assert res_b['game_over']
    assert game.game_over is True

    # Check score calculation
    # Black has stone at (0, 0). The rest of board (80 empty spots) are connected,
    # but adjacent to Black stone at (0, 0) and no White stones, so all 80 empty spots belong to Black territory!
    # Black territory = 80, Captures = 0 -> Score = 80.0
    # White territory = 0, Captures = 0, Komi = 6.5 -> Score = 6.5
    assert game.final_score['B'] == 80.0
    assert game.final_score['W'] == 6.5
    assert game.winner == 'B'

def test_invalid_turn_and_bounds():
    game = GoGame(board_size=9)
    with pytest.raises(ValueError, match="Not your turn"):
        game.place_stone(0, 0, 'W')

    with pytest.raises(ValueError, match="out of bounds"):
        game.place_stone(10, 10, 'B')
