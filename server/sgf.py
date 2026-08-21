"""
StoneSync SGF (Smart Game Format) Parser & Exporter
Handles parsing and serializing Go matches to and from standard .sgf format.
"""
import re
from typing import Dict, List, Optional, Tuple
from server.go_game import GoGame

# SGF coordinate mapping: 'a' -> 0, 'b' -> 1, ..., 's' -> 18
def coords_to_sgf(r: int, c: int) -> str:
    col_char = chr(ord('a') + c)
    row_char = chr(ord('a') + r)
    return f"{col_char}{row_char}"

def sgf_to_coords(sgf_str: str) -> Optional[Tuple[int, int]]:
    if not sgf_str or len(sgf_str) < 2:
        return None  # Pass move
    col = ord(sgf_str[0].lower()) - ord('a')
    row = ord(sgf_str[1].lower()) - ord('a')
    return (row, col)

def export_to_sgf(game: GoGame, black_player: str = "Black", white_player: str = "White") -> str:
    """Export current GoGame history to an SGF string."""
    headers = [
        "(;GM[1]",  # Game: Go
        "FF[4]",    # File Format: 4
        "CA[UTF-8]",
        "AP[StoneSync:1.0]",
        f"SZ[{game.board_size}]",
        f"KM[{game.komi}]",
        "RU[Japanese]",
        f"PB[{black_player}]",
        f"PW[{white_player}]"
    ]

    if game.winner:
        score_str = f"{game.winner}+"
        if game.final_score:
            diff = abs(game.final_score['B'] - game.final_score['W'])
            score_str += f"{diff:.1f}"
        headers.append(f"RE[{score_str}]")

    sgf_body = "".join(headers)

    # Reconstruct move sequence from history
    prev_grid = [[None for _ in range(game.board_size)] for _ in range(game.board_size)]
    player_turn = 'B'

    # Track moves from snapshots
    for snapshot in game.history[1:]:
        placed_pos = None
        for r in range(game.board_size):
            for c in range(game.board_size):
                if snapshot[r][c] == player_turn and prev_grid[r][c] is None:
                    placed_pos = (r, c)
                    break
            if placed_pos:
                break

        if placed_pos:
            sgf_code = coords_to_sgf(placed_pos[0], placed_pos[1])
            sgf_body += f";{player_turn}[{sgf_code}]"
        else:
            # Pass move
            sgf_body += f";{player_turn}[]"

        prev_grid = [list(row) for row in snapshot]
        player_turn = 'W' if player_turn == 'B' else 'B'

    sgf_body += ")"
    return sgf_body

def parse_sgf(sgf_content: str) -> GoGame:
    """Parse SGF string and replay moves onto a GoGame instance."""
    # Extract Board Size (SZ)
    sz_match = re.search(r"SZ\[(\d+)\]", sgf_content)
    board_size = int(sz_match.group(1)) if sz_match else 19

    # Extract Komi (KM)
    km_match = re.search(r"KM\[([\d\.]+)\]", sgf_content)
    komi = float(km_match.group(1)) if km_match else 6.5

    game = GoGame(board_size=board_size, komi=komi)

    # Extract move nodes: ;B[pd] or ;W[dp] or ;B[]
    move_pattern = re.findall(r";([BW])\[([a-z]{0,2})\]", sgf_content, re.IGNORECASE)

    for player, move_str in move_pattern:
        player = player.upper()
        if not move_str:  # Pass
            game.pass_turn(player)
        else:
            coords = sgf_to_coords(move_str)
            if coords:
                r, c = coords
                if 0 <= r < board_size and 0 <= c < board_size:
                    game.place_stone(r, c, player)

    return game
