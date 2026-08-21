"""
Go Game Engine (StoneSync)
Authoritative Go rules implementation: liberties, captures, suicide, Ko, passing, and territory scoring.
"""
import time
from typing import Dict, List, Optional, Tuple, Set

def get_handicap_positions(board_size: int, handicap: int) -> List[Tuple[int, int]]:
    if handicap < 2 or handicap > 9:
        return []
    if board_size == 19:
        top, mid, bot = 3, 9, 15
    elif board_size == 13:
        top, mid, bot = 3, 6, 9
    elif board_size == 9:
        top, mid, bot = 2, 4, 6
    else:
        return []

    coords = {
        'TR': (top, bot), 'BL': (bot, top), 'BR': (bot, bot), 'TL': (top, top),
        'C': (mid, mid), 'L': (mid, top), 'R': (mid, bot), 'T': (top, mid), 'B': (bot, mid)
    }

    if handicap == 2: order = ['TR', 'BL']
    elif handicap == 3: order = ['TR', 'BL', 'BR']
    elif handicap == 4: order = ['TR', 'BL', 'BR', 'TL']
    elif handicap == 5: order = ['TR', 'BL', 'BR', 'TL', 'C']
    elif handicap == 6: order = ['TR', 'BL', 'BR', 'TL', 'L', 'R']
    elif handicap == 7: order = ['TR', 'BL', 'BR', 'TL', 'L', 'R', 'C']
    elif handicap == 8: order = ['TR', 'BL', 'BR', 'TL', 'L', 'R', 'T', 'B']
    elif handicap == 9: order = ['TR', 'BL', 'BR', 'TL', 'C', 'L', 'R', 'T', 'B']
    else: order = []

    return [coords[k] for k in order]

class GoGame:
    def __init__(
        self,
        board_size: int = 19,
        komi: Optional[float] = None,
        handicap: int = 0,
        time_control: str = 'none',
        main_time_sec: float = 600.0,
        byoyomi_periods: int = 3,
        byoyomi_time_sec: float = 30.0,
        fischer_increment_sec: float = 5.0,
        rules_mode: str = 'japanese',
        superko: bool = False
    ):
        if board_size not in (9, 13, 19):
            raise ValueError("Board size must be 9, 13, or 19")
        self.board_size = board_size
        self.handicap = handicap
        if komi is None:
            komi = 0.5 if handicap >= 2 else 6.5
        self.komi = float(komi)
        self.rules_mode = rules_mode.lower()
        self.superko = superko
        self.reset(
            board_size=board_size,
            komi=komi,
            handicap=handicap,
            time_control=time_control,
            main_time_sec=main_time_sec,
            byoyomi_periods=byoyomi_periods,
            byoyomi_time_sec=byoyomi_time_sec,
            fischer_increment_sec=fischer_increment_sec,
            rules_mode=rules_mode,
            superko=superko
        )

    def reset(
        self,
        board_size: Optional[int] = None,
        komi: Optional[float] = None,
        handicap: Optional[int] = None,
        time_control: Optional[str] = None,
        main_time_sec: Optional[float] = None,
        byoyomi_periods: Optional[int] = None,
        byoyomi_time_sec: Optional[float] = None,
        fischer_increment_sec: Optional[float] = None,
        rules_mode: Optional[str] = None,
        superko: Optional[bool] = None
    ):
        if board_size is not None:
            if board_size not in (9, 13, 19):
                raise ValueError("Board size must be 9, 13, or 19")
            self.board_size = board_size
        if handicap is not None:
            self.handicap = handicap
        if komi is not None:
            self.komi = float(komi)
        if rules_mode is not None:
            self.rules_mode = rules_mode.lower()
        if superko is not None:
            self.superko = superko


        if time_control is not None:
            self.time_control = time_control
        else:
            if not hasattr(self, 'time_control'):
                self.time_control = 'none'

        if main_time_sec is not None: self.main_time_sec = float(main_time_sec)
        elif not hasattr(self, 'main_time_sec'): self.main_time_sec = 600.0

        if byoyomi_periods is not None: self.byoyomi_periods = int(byoyomi_periods)
        elif not hasattr(self, 'byoyomi_periods'): self.byoyomi_periods = 3

        if byoyomi_time_sec is not None: self.byoyomi_time_sec = float(byoyomi_time_sec)
        elif not hasattr(self, 'byoyomi_time_sec'): self.byoyomi_time_sec = 30.0

        if fischer_increment_sec is not None: self.fischer_increment_sec = float(fischer_increment_sec)
        elif not hasattr(self, 'fischer_increment_sec'): self.fischer_increment_sec = 5.0

        self.grid: List[List[Optional[str]]] = [[None for _ in range(self.board_size)] for _ in range(self.board_size)]
        self.current_player: str = 'B'
        self.captures: Dict[str, int] = {'B': 0, 'W': 0}
        self.pass_count: int = 0
        self.game_over: bool = False
        self.winner: Optional[str] = None
        self.win_reason: Optional[str] = None  # 'score', 'timeout', 'resignation'
        self.final_score: Optional[Dict[str, float]] = None
        self.territory: Optional[Dict[str, int]] = None
        self.last_move: Optional[Dict[str, int]] = None
        self.last_move_timestamp: Optional[float] = time.time()


        self.clocks = {
            'B': {
                'main_time': self.main_time_sec,
                'periods': self.byoyomi_periods,
                'period_time': self.byoyomi_time_sec
            },
            'W': {
                'main_time': self.main_time_sec,
                'periods': self.byoyomi_periods,
                'period_time': self.byoyomi_time_sec
            }
        }

        # Place handicap stones if handicap >= 2
        if self.handicap >= 2:
            positions = get_handicap_positions(self.board_size, self.handicap)
            for r, c in positions:
                self.grid[r][c] = 'B'
            self.current_player = 'W'

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

    def update_clock_on_turn_change(self, now_ts: Optional[float] = None):
        if self.time_control == 'none' or self.game_over:
            return
        if now_ts is None:
            now_ts = time.time()
        if self.last_move_timestamp is None:
            self.last_move_timestamp = now_ts
            return

        elapsed = max(0.0, now_ts - self.last_move_timestamp)
        p = self.current_player
        clock = self.clocks[p]

        if self.time_control == 'absolute':
            clock['main_time'] -= elapsed
            if clock['main_time'] <= 0:
                clock['main_time'] = 0.0
                self.game_over = True
                self.winner = 'W' if p == 'B' else 'B'
                self.win_reason = 'timeout'
        elif self.time_control == 'fischer':
            clock['main_time'] -= elapsed
            if clock['main_time'] <= 0:
                clock['main_time'] = 0.0
                self.game_over = True
                self.winner = 'W' if p == 'B' else 'B'
                self.win_reason = 'timeout'
            else:
                clock['main_time'] += self.fischer_increment_sec
        elif self.time_control == 'byoyomi':
            if clock['main_time'] > 0:
                if elapsed <= clock['main_time']:
                    clock['main_time'] -= elapsed
                else:
                    leftover = elapsed - clock['main_time']
                    clock['main_time'] = 0.0
                    if leftover <= clock['period_time']:
                        pass
                    else:
                        byo_leftover = leftover - clock['period_time']
                        periods_lost = 1 + int(byo_leftover // self.byoyomi_time_sec)
                        clock['periods'] -= periods_lost
                        if clock['periods'] <= 0:
                            clock['periods'] = 0
                            clock['period_time'] = 0.0
                            self.game_over = True
                            self.winner = 'W' if p == 'B' else 'B'
                            self.win_reason = 'timeout'
                        else:
                            clock['period_time'] = self.byoyomi_time_sec
            else:
                if elapsed <= clock['period_time']:
                    clock['period_time'] = self.byoyomi_time_sec
                else:
                    byo_leftover = elapsed - clock['period_time']
                    periods_lost = 1 + int(byo_leftover // self.byoyomi_time_sec)
                    clock['periods'] -= periods_lost
                    if clock['periods'] <= 0:
                        clock['periods'] = 0
                        clock['period_time'] = 0.0
                        self.game_over = True
                        self.winner = 'W' if p == 'B' else 'B'
                        self.win_reason = 'timeout'
                    else:
                        clock['period_time'] = self.byoyomi_time_sec

        self.last_move_timestamp = now_ts

    def check_timeout(self, now_ts: Optional[float] = None) -> bool:
        if self.time_control == 'none' or self.game_over or self.last_move_timestamp is None:
            return self.game_over
        if now_ts is None:
            now_ts = time.time()

        elapsed = max(0.0, now_ts - self.last_move_timestamp)
        p = self.current_player
        clock = self.clocks[p]

        if self.time_control in ('absolute', 'fischer'):
            if clock['main_time'] - elapsed <= 0:
                clock['main_time'] = 0.0
                self.game_over = True
                self.winner = 'W' if p == 'B' else 'B'
                self.win_reason = 'timeout'
        elif self.time_control == 'byoyomi':
            total_remaining = clock['main_time'] + (clock['periods'] * clock['period_time'])
            if total_remaining - elapsed <= 0:
                clock['main_time'] = 0.0
                clock['periods'] = 0
                clock['period_time'] = 0.0
                self.game_over = True
                self.winner = 'W' if p == 'B' else 'B'
                self.win_reason = 'timeout'

        return self.game_over

    def get_live_clocks(self, now_ts: Optional[float] = None) -> Dict[str, dict]:
        if now_ts is None:
            now_ts = time.time()
        self.check_timeout(now_ts)

        live_clocks = {
            'B': dict(self.clocks['B']),
            'W': dict(self.clocks['W'])
        }

        if self.time_control == 'none' or self.game_over or self.last_move_timestamp is None:
            return live_clocks

        elapsed = max(0.0, now_ts - self.last_move_timestamp)
        p = self.current_player
        clock = live_clocks[p]

        if self.time_control in ('absolute', 'fischer'):
            clock['main_time'] = max(0.0, clock['main_time'] - elapsed)
        elif self.time_control == 'byoyomi':
            if clock['main_time'] > 0:
                if elapsed <= clock['main_time']:
                    clock['main_time'] = max(0.0, clock['main_time'] - elapsed)
                else:
                    leftover = elapsed - clock['main_time']
                    clock['main_time'] = 0.0
                    if leftover <= clock['period_time']:
                        clock['period_time'] = max(0.0, clock['period_time'] - leftover)
                    else:
                        byo_leftover = leftover - clock['period_time']
                        periods_lost = 1 + int(byo_leftover // self.byoyomi_time_sec)
                        clock['periods'] = max(0, clock['periods'] - periods_lost)
                        rem = self.byoyomi_time_sec - (byo_leftover % self.byoyomi_time_sec)
                        clock['period_time'] = max(0.0, rem) if clock['periods'] > 0 else 0.0
            else:
                if elapsed <= clock['period_time']:
                    clock['period_time'] = max(0.0, clock['period_time'] - elapsed)
                else:
                    byo_leftover = elapsed - clock['period_time']
                    periods_lost = 1 + int(byo_leftover // self.byoyomi_time_sec)
                    clock['periods'] = max(0, clock['periods'] - periods_lost)
                    rem = self.byoyomi_time_sec - (byo_leftover % self.byoyomi_time_sec)
                    clock['period_time'] = max(0.0, rem) if clock['periods'] > 0 else 0.0

        return live_clocks

    def place_stone(self, r: int, c: int, player: str, now_ts: Optional[float] = None) -> Dict[str, int]:
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

        # Ko / Superko rule check
        temp_snapshot = tuple(tuple(row) for row in temp_grid)
        if self.superko:
            if temp_snapshot in self.history:
                raise ValueError("Superko rule violation: cannot repeat any previous board position")
        else:
            if len(self.history) >= 2 and temp_snapshot == self.history[-2]:
                raise ValueError("Ko rule violation: illegal immediate recapture")

        # Update player's clock for current turn before switching
        self.update_clock_on_turn_change(now_ts)
        if self.game_over:
            raise ValueError("Time expired before move was submitted")

        # Apply move
        self.grid = temp_grid
        self.captures[player] += len(captured_stones)
        self.pass_count = 0
        self.last_move = {'r': r, 'c': c}
        self.history.append(temp_snapshot)
        self.current_player = opponent

        return {'captured': len(captured_stones)}

    def pass_turn(self, player: str, now_ts: Optional[float] = None) -> Dict[str, bool]:
        if self.game_over:
            raise ValueError("Game is already over")
        if player != self.current_player:
            raise ValueError(f"Not your turn. Current player is {self.current_player}")

        self.update_clock_on_turn_change(now_ts)
        if self.game_over:
            raise ValueError("Time expired before pass was submitted")

        self.pass_count += 1
        self.last_move = None
        current_snapshot = tuple(tuple(row) for row in self.grid)
        self.history.append(current_snapshot)
        self.current_player = 'W' if player == 'B' else 'B'

        if self.pass_count >= 2:
            self.game_over = True
            self.win_reason = 'score'
            self.calculate_score()

        return {'game_over': self.game_over}

    def resign(self, player: str):
        if self.game_over:
            raise ValueError("Game is already over")
        self.game_over = True
        self.winner = 'W' if player == 'B' else 'B'
        self.win_reason = 'resignation'

    def is_legal_move(self, r: int, c: int, player: str) -> bool:
        if self.game_over or player != self.current_player:
            return False
        if not (0 <= r < self.board_size and 0 <= c < self.board_size):
            return False
        if self.grid[r][c] is not None:
            return False

        opponent = 'W' if player == 'B' else 'B'
        temp_grid = [row[:] for row in self.grid]
        temp_grid[r][c] = player

        captured_stones: Set[Tuple[int, int]] = set()
        for nr, nc in self._get_neighbors(r, c):
            if temp_grid[nr][nc] == opponent and (nr, nc) not in captured_stones:
                opp_group, opp_liberties = self._get_group_and_liberties(temp_grid, nr, nc)
                if len(opp_liberties) == 0:
                    captured_stones.update(opp_group)

        for cr, cc in captured_stones:
            temp_grid[cr][cc] = None

        _, my_liberties = self._get_group_and_liberties(temp_grid, r, c)
        if len(my_liberties) == 0:
            return False

        temp_snapshot = tuple(tuple(row) for row in temp_grid)
        if self.superko:
            if temp_snapshot in self.history:
                return False
        else:
            if len(self.history) >= 2 and temp_snapshot == self.history[-2]:
                return False

        return True

    def get_legal_moves(self, player: str) -> List[Tuple[int, int]]:
        legal = []
        for r in range(self.board_size):
            for c in range(self.board_size):
                if self.grid[r][c] is None and self.is_legal_move(r, c, player):
                    legal.append((r, c))
        return legal

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
        if self.rules_mode == 'chinese':
            b_stones = sum(row.count('B') for row in self.grid)
            w_stones = sum(row.count('W') for row in self.grid)
            b_score = float(territory['B'] + b_stones)
            w_score = float(territory['W'] + w_stones) + self.komi
        else:
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
        self.win_reason = 'score'

    def to_dict(self, now_ts: Optional[float] = None) -> dict:
        live_clocks = self.get_live_clocks(now_ts)
        return {
            'board_size': self.board_size,
            'komi': self.komi,
            'handicap': self.handicap,
            'grid': self.grid,
            'current_player': self.current_player,
            'captures': self.captures,
            'pass_count': self.pass_count,
            'game_over': self.game_over,
            'winner': self.winner,
            'win_reason': self.win_reason,
            'final_score': self.final_score,
            'territory': self.territory,
            'last_move': self.last_move,
            'time_control': self.time_control,
            'main_time_sec': self.main_time_sec,
            'byoyomi_periods': self.byoyomi_periods,
            'byoyomi_time_sec': self.byoyomi_time_sec,
            'fischer_increment_sec': self.fischer_increment_sec,
            'clocks': live_clocks
        }

