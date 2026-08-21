"""
Go Game Engine (StoneSync)
Authoritative Go rules implementation: liberties, captures, suicide, Ko, passing, and territory scoring.
"""
from typing import Dict, List, Optional, Tuple, Set

class GoGame:
    def __init__(self, board_size: int = 19, komi: float = 6.5):
        if board_size not in (9, 13, 19):
            raise ValueError("Board size must be 9, 13, or 19")
        self.board_size = board_size
        self.komi = float(komi)
        self.reset()

    def reset(self, board_size: Optional[int] = None, komi: Optional[float] = None):
        if board_size is not None:
            if board_size not in (9, 13, 19):
                raise ValueError("Board size must be 9, 13, or 19")
            self.board_size = board_size
        if komi is not None:
            self.komi = float(komi)

        self.grid: List[List[Optional[str]]] = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.current_player: str = 'B'
        self.captures: Dict[str, int] = {'B': 0, 'W': 0}
        self.pass_count: int = 0
        self.game_over: bool = False
        self.winner: Optional[str] = None
        self.final_score: Optional[Dict[str, float]] = None
        self.territory: Optional[Dict[str, int]] = None
        self.last_move: Optional[Dict[str, int]] = None
        
        # History stores tuple of tuples representation of the grid for Ko check
        initial_snapshot = tuple(tuple(row) for row in self.grid)
        self.history: List[Tuple[Tuple[Optional[str], ...], ...]] = [initial_snapshot]

    def _get_neighbors(self, r: int, c: int) -> List[Tuple[int, int]]:
        neighbors = []
        if r > 0:
            neighbors.append((r - 1, c))
        if r < self.board_size - 1:
            neighbors.append((r + 1, c))
        if c > 0:
            neighbors.append((r, c - 1))
        if c < self.board_size - 1:
            neighbors.append((r, c + 1))
        return neighbors

    def _get_group_and_liberties(self, grid: List[List[Optional[str]]], r: int, c: int) -> Tuple[Set[Tuple[int, int]], Set[Tuple[int, int]]]:
        color = grid[r][c]
        if color is None:
            return set(), set()

        group: Set[Tuple[int, int]] = {(r, c)}
        liberties: Set[Tuple[int, int]] = set()
        queue: List[Tuple[int, int]] = [(r, c)]

        while queue:
            curr_r, curr_c = queue.pop(0)
            for nr, nc in self._get_neighbors(curr_r, curr_c):
                neighbor_val = grid[nr][nc]
                if neighbor_val is None:
                    liberties.add((nr, nc))
                elif neighbor_val == color and (nr, nc) not in group:
                    group.add((nr, nc))
                    queue.append((nr, nc))

        return group, liberties

    def place_stone(self, r: int, c: int, player: str) -> Dict[str, int]:
        if self.game_over:
            raise ValueError("Game is already over")
        if player != self.current_player:
            raise ValueError(f"Not your turn. Current player is {self.current_player}")
        if not (0 <= r < self.board_size and 0 <= c < self.board_size):
            raise ValueError("Move position out of bounds")
        if self.grid[r][c] is not None:
            raise ValueError("Intersection is already occupied")

        opponent = 'W' if player == 'B' else 'B'
        
        # Create temp grid simulation
        temp_grid = [row[:] for row in self.grid]
        temp_grid[r][c] = player

        # Check adjacent opponent groups for capture
        captured_stones: Set[Tuple[int, int]] = set()
        for nr, nc in self._get_neighbors(r, c):
            if temp_grid[nr][nc] == opponent and (nr, nc) not in captured_stones:
                opp_group, opp_liberties = self._get_group_and_liberties(temp_grid, nr, nc)
                if len(opp_liberties) == 0:
                    captured_stones.update(opp_group)

        # Remove captured stones from temp grid
        for cr, cc in captured_stones:
            temp_grid[cr][cc] = None

        # Suicide check: player's group must have liberties after captures are removed
        my_group, my_liberties = self._get_group_and_liberties(temp_grid, r, c)
        if len(my_liberties) == 0:
            raise ValueError("Suicide move is illegal")

        # Ko rule check: forbid repeating the previous board state (or recent opponent board state)
        temp_snapshot = tuple(tuple(row) for row in temp_grid)
        if len(self.history) >= 2 and temp_snapshot == self.history[-2]:
            raise ValueError("Ko rule violation: illegal immediate recapture")

        # Apply move
        self.grid = temp_grid
        self.captures[player] += len(captured_stones)
        self.pass_count = 0
        self.last_move = {'r': r, 'c': c}
        self.history.append(temp_snapshot)
        self.current_player = opponent

        return {'captured': len(captured_stones)}

    def pass_turn(self, player: str) -> Dict[str, bool]:
        if self.game_over:
            raise ValueError("Game is already over")
        if player != self.current_player:
            raise ValueError(f"Not your turn. Current player is {self.current_player}")

        self.pass_count += 1
        self.last_move = None
        current_snapshot = tuple(tuple(row) for row in self.grid)
        self.history.append(current_snapshot)
        self.current_player = 'W' if player == 'B' else 'B'

        if self.pass_count >= 2:
            self.game_over = True
            self.calculate_score()

        return {'game_over': self.game_over}

    def calculate_score(self):
        visited: Set[Tuple[int, int]] = set()
        territory: Dict[str, int] = {'B': 0, 'W': 0}

        for r in range(self.board_size):
            for c in range(self.board_size):
                if self.grid[r][c] is None and (r, c) not in visited:
                    empty_region: Set[Tuple[int, int]] = {(r, c)}
                    queue: List[Tuple[int, int]] = [(r, c)]
                    adjacent_colors: Set[str] = set()
                    visited.add((r, c))

                    while queue:
                        curr_r, curr_c = queue.pop(0)
                        for nr, nc in self._get_neighbors(curr_r, curr_c):
                            val = self.grid[nr][nc]
                            if val is None:
                                if (nr, nc) not in visited:
                                    visited.add((nr, nc))
                                    empty_region.add((nr, nc))
                                    queue.append((nr, nc))
                            else:
                                adjacent_colors.add(val)

                    if adjacent_colors == {'B'}:
                        territory['B'] += len(empty_region)
                    elif adjacent_colors == {'W'}:
                        territory['W'] += len(empty_region)

        self.territory = territory
        b_score = float(territory['B'] + self.captures['B'])
        w_score = float(territory['W'] + self.captures['W']) + self.komi

        self.final_score = {
            'B': round(b_score, 1),
            'W': round(w_score, 1)
        }

        if b_score > w_score:
            self.winner = 'B'
        elif w_score > b_score:
            self.winner = 'W'
        else:
            self.winner = 'Draw'

    def to_dict((self) -> dict:
        return {
            'board_size': self.board_size,
            'komi': self.komi,
            'grid': self.grid,
            'current_player': self.current_player,
            'captures': self.captures,
            'pass_count': self.pass_count,
            'game_over': self.game_over,
            'winner': self.winner,
            'final_score': self.final_score,
            'territory': self.territory,
            'last_move': self.last_move
        }
