"""
Unit tests for StoneSync Go Game Engine.
Tests:
- single-stone capture
- suicide rejection
- ko rejection
- two-pass game end + score with komi
"""
import unittest
from server.go_game import GoGame

class TestGoGame(unittest.TestCase):

    def test_single_stone_capture(self):
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
        
        self.assertEqual(res['captured'], 1)
        self.assertIsNone(game.grid[1][2], "Captured White stone should be removed from board")
        self.assertEqual(game.captures['B'], 1, "Black capture count should be 1")

    def test_suicide_rejection(self):
        game = GoGame(board_size=9)
        # White surrounds corner (0, 0) by placing at (0, 1) and (1, 0)
        game.place_stone(4, 4, 'B')
        game.place_stone(0, 1, 'W')
        game.place_stone(5, 5, 'B')
        game.place_stone(1, 0, 'W')
        
        # Attempting to play at (0, 0) has 0 liberties and captures no stones.
        with self.assertRaises(ValueError):
            game.place_stone(0, 0, 'B')
        
        self.assertIsNone(game.grid[0][0], "Corner intersection should remain empty")

    def test_suicide_legal_when_capturing(self):
        game = GoGame(board_size=9)
        game.place_stone(0, 1, 'B')
        game.place_stone(0, 0, 'W')
        res = game.place_stone(1, 0, 'B')
        self.assertEqual(res['captured'], 1)
        self.assertIsNone(game.grid[0][0])

    def test_ko_rejection(self):
        game = GoGame(board_size=9)
        moves = [
            (0, 1, 'B'), (0, 2, 'W'),
            (1, 0, 'B'), (1, 3, 'W'),
            (2, 1, 'B'), (2, 2, 'W'),
            (1, 2, 'B')
        ]
        for r, c, player in moves:
            game.place_stone(r, c, player)

        res = game.place_stone(1, 1, 'W')
        self.assertEqual(res['captured'], 1)
        self.assertIsNone(game.grid[1][2], "B(1, 2) should be captured")

        with self.assertRaises(ValueError):
            game.place_stone(1, 2, 'B')

    def test_two_pass_game_end_and_score(self):
        game = GoGame(board_size=9, komi=6.5)
        game.place_stone(0, 0, 'B')
        res_w = game.pass_turn('W')
        self.assertFalse(res_w['game_over'])
        res_b = game.pass_turn('B')
        self.assertTrue(res_b['game_over'])
        self.assertTrue(game.game_over)

        self.assertEqual(game.final_score['B'], 80.0)
        self.assertEqual(game.final_score['W'], 6.5)
        self.assertEqual(game.winner, 'B')

    def test_invalid_turn_and_bounds(self):
        game = GoGame(board_size=9)
        with self.assertRaises(ValueError):
            game.place_stone(0, 0, 'W')

        with self.assertRaises(ValueError):
            game.place_stone(10, 10, 'B')

if __name__ == '__main__':
    unittest.main()
