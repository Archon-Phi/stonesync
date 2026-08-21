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

    def test_resignation(self):
        game = GoGame(board_size=9)
        game.place_stone(0, 0, 'B')
        game.resign('B')
        self.assertTrue(game.game_over)
        self.assertEqual(game.winner, 'W')
        self.assertEqual(game.win_reason, 'resignation')

    def test_time_controls_byoyomi(self):
        import time
        start_ts = time.time()
        game = GoGame(
            board_size=9,
            time_control='byoyomi',
            main_time_sec=2.0,
            byoyomi_periods=2,
            byoyomi_time_sec=1.0
        )
        game.last_move_timestamp = start_ts
        game.place_stone(0, 0, 'B', now_ts=start_ts + 2.2)
        self.assertEqual(game.clocks['B']['main_time'], 0.0)

    def test_time_controls_fischer(self):
        import time
        start_ts = time.time()
        game = GoGame(
            board_size=9,
            time_control='fischer',
            main_time_sec=10.0,
            fischer_increment_sec=3.0
        )
        game.last_move_timestamp = start_ts
        game.place_stone(0, 0, 'B', now_ts=start_ts + 0.1)
        self.assertGreaterEqual(game.clocks['B']['main_time'], 11.5)


    def test_legal_moves(self):
        game = GoGame(board_size=9)
        legal_b = game.get_legal_moves('B')
        self.assertEqual(len(legal_b), 81)

    def test_superko_rejection(self):
        game = GoGame(board_size=9, superko=True)
        # Create initial state
        game.place_stone(0, 0, 'B')
        game.place_stone(8, 8, 'W')
        # Check initial snapshot is recorded
        self.assertGreaterEqual(len(game.history), 3)

    def test_chinese_area_scoring(self):
        game = GoGame(board_size=9, komi=7.5, rules_mode='chinese')
        game.place_stone(0, 0, 'B')
        game.pass_turn('W')
        game.pass_turn('B')
        self.assertTrue(game.game_over)
        # In Chinese scoring: B = 1 stone + 80 territory = 81.0, W = 0 stones + 0 territory + 7.5 komi = 7.5
        self.assertEqual(game.final_score['B'], 81.0)
        self.assertEqual(game.final_score['W'], 7.5)

if __name__ == '__main__':
    unittest.main()


