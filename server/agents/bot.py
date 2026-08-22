"""
StoneSync Tactical AI Agent (StoneBot)
Consumes GoGame state, evaluates legal moves, and returns intelligent move choices.
"""
import random
from typing import Dict, List, Optional, Tuple
from server.go_game import GoGame

class StoneBot:
    def __init__(self, color: str = 'W', difficulty: str = 'medium'):
        self.color = color
        self.difficulty = difficulty.lower()

    def select_move(self, game: GoGame) -> Optional[Tuple[int, int]]:
        """
        Select best move (row, col) for self.color according to self.difficulty.
        Returns None if bot decides to pass.
        """
        if game.game_over or game.current_player != self.color:
            return None

        legal_moves = game.get_legal_moves(self.color)
        if not legal_moves:
            return None  # Pass

        if self.difficulty in ('random', 'easy'):
            # Easy mode: 70% random choice
            if random.random() < 0.7:
                return random.choice(legal_moves)

        opponent = 'W' if self.color == 'B' else 'B'
        scored_moves: List[Tuple[float, Tuple[int, int]]] = []

        for r, c in legal_moves:
            score = 0.0

            # 1. Capture Opponent Stones
            temp_grid = [row[:] for row in game.grid]
            temp_grid[r][c] = self.color
            captured_count = 0
            for nr, nc in game._get_neighbors(r, c):
                if temp_grid[nr][nc] == opponent:
                    group, libs = game._get_group_and_liberties(temp_grid, nr, nc)
                    if len(libs) == 0:
                        captured_count += len(group)
            
            if captured_count > 0:
                score += 50.0 + (captured_count * 10.0)

            # 2. Defense: Check if this move saves a friendly group in Atari (1 liberty)
            for nr, nc in game._get_neighbors(r, c):
                if game.grid[nr][nc] == self.color:
                    group, libs = game._get_group_and_liberties(game.grid, nr, nc)
                    if len(libs) == 1:
                        score += 30.0

            # 3. Shape & Opening Heuristics
            size = game.board_size
            mid = (size - 1) / 2
            center_dist = abs(r - mid) + abs(c - mid)
            score += max(0, 10 - center_dist)

            min_edge = min(r, c, size - 1 - r, size - 1 - c)
            if min_edge in (2, 3):  # 3rd and 4th lines
                score += 8.0
            elif min_edge == 1:
                score += 3.0
            elif min_edge == 0:
                score -= 5.0

            # 4. Connectivity: Bonus for neighboring friendly stones
            friendly_neighbors = sum(1 for nr, nc in game._get_neighbors(r, c) if game.grid[nr][nc] == self.color)
            score += friendly_neighbors * 4.0

            # Noise based on difficulty
            if self.difficulty in ('easy', 'random'):
                score += random.uniform(-10.0, 10.0)
            elif self.difficulty == 'medium':
                score += random.uniform(-3.0, 3.0)
            elif self.difficulty == 'hard':
                score += random.uniform(-0.5, 0.5)

            scored_moves.append((score, (r, c)))

        scored_moves.sort(key=lambda x: x[0], reverse=True)

        if self.difficulty == 'easy':
            choices = scored_moves[:min(5, len(scored_moves))]
            return random.choice(choices)[1]

        if self.difficulty == 'medium':
            choices = scored_moves[:min(3, len(scored_moves))]
            return random.choice(choices)[1]

        # Hard & Master: top candidate move
        best_score, best_move = scored_moves[0]
        if best_score < -15.0:
            return None

        return best_move
