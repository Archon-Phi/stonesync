"""
Unit tests for StoneSync Handicap Stone Placement & Custom Komi engine rules.
"""
import unittest
from server.go_game import GoGame, get_handicap_positions

class TestHandicapStones(unittest.TestCase):

    def test_handicap_coordinates_19x19(self):
        positions_4 = get_handicap_positions(19, 4)
        self.assertEqual(len(positions_4), 4)
        self.assertIn((3, 3), positions_4)
        self.assertIn((3, 15), positions_4)
        self.assertIn((15, 3), positions_4)
        self.assertIn((15, 15), positions_4)

        positions_9 = get_handicap_positions(19, 9)
        self.assertEqual(len(positions_9), 9)
        self.assertIn((9, 9), positions_9)  # Tengen

    def test_handicap_game_initialization(self):
        # 4 stone handicap on 19x19
        game = GoGame(board_size=19, handicap=4)
        self.assertEqual(game.handicap, 4)
        self.assertEqual(game.komi, 0.5, "Handicap games default to 0.5 Komi")
        self.assertEqual(game.current_player, 'W', "First move belongs to White in handicap games")
        
        # Verify 4 Black stones placed
        black_count = sum(row.count('B') for row in game.grid)
        self.assertEqual(black_count, 4)

    def test_handicap_move_sequence(self):
        game = GoGame(board_size=9, handicap=2)
        # First move MUST be White
        self.assertEqual(game.current_player, 'W')
        game.place_stone(4, 4, 'W')
        self.assertEqual(game.current_player, 'B')
        game.place_stone(0, 0, 'B')
        self.assertEqual(game.current_player, 'W')

if __name__ == '__main__':
    unittest.main()
