"""
Unit tests for StoneSync SGF import and export module.
"""
import unittest
from server.go_game import GoGame
from server.sgf import export_to_sgf, parse_sgf, coords_to_sgf, sgf_to_coords

class TestSgfModule(unittest.TestCase):

    def test_sgf_coordinate_conversion(self):
        self.assertEqual(coords_to_sgf(0, 0), "aa")
        self.assertEqual(coords_to_sgf(3, 3), "dd")
        self.assertEqual(coords_to_sgf(18, 18), "ss")

        self.assertEqual(sgf_to_coords("aa"), (0, 0))
        self.assertEqual(sgf_to_coords("dd"), (3, 3))
        self.assertIsNone(sgf_to_coords(""))

    def test_sgf_export_and_parse_roundtrip(self):
        game = GoGame(board_size=9, komi=6.5)
        game.place_stone(2, 2, 'B')
        game.place_stone(2, 6, 'W')
        game.place_stone(6, 2, 'B')
        game.pass_turn('W')

        sgf_output = export_to_sgf(game, "Alice", "Bob")
        self.assertIn("SZ[9]", sgf_output)
        self.assertIn("KM[6.5]", sgf_output)
        self.assertIn(";B[cc]", sgf_output)
        self.assertIn(";W[gc]", sgf_output)
        self.assertIn(";W[]", sgf_output)


        # Re-import parsed SGF
        reconstructed_game = parse_sgf(sgf_output)
        self.assertEqual(reconstructed_game.board_size, 9)
        self.assertEqual(reconstructed_game.komi, 6.5)
        self.assertEqual(reconstructed_game.grid[2][2], 'B')
        self.assertEqual(reconstructed_game.grid[2][6], 'W')
        self.assertEqual(reconstructed_game.grid[6][2], 'B')

if __name__ == '__main__':
    unittest.main()
