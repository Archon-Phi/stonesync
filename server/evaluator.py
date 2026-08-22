"""
StoneSync AI Evaluator Engine
Calculates positional evaluation, win-rate probabilities, territorial heatmaps, and tactical move recommendations.
"""
import math
from typing import Dict, List, Optional, Tuple, Any
from server.go_game import GoGame

def evaluate_game(game: GoGame) -> Dict[str, Any]:
    """
    Evaluates current GoGame state and produces:
    - win_rate_black / win_rate_white (%)
    - score_lead (e.g. 'B+3.5 pts' or 'W+1.5 pts')
    - influence_grid: 2D matrix [-1.0, 1.0] for territorial heatmap
    - top_moves: list of top 3 recommended moves for current_player
    """
    size = game.board_size
    grid = game.grid
    current_p = game.current_player
    opp_p = 'W' if current_p == 'B' else 'B'

    # Collect stone positions
    b_stones = []
    w_stones = []
    for r in range(size):
        for c in range(size):
            if grid[r][c] == 'B':
                b_stones.append((r, c))
            elif grid[r][c] == 'W':
                w_stones.append((r, c))

    # 1. Compute territorial influence grid
    influence_grid: List[List[float]] = [[0.0 for _ in range(size)] for _ in range(size)]
    net_eval = 0.0

    for r in range(size):
        for c in range(size):
            if grid[r][c] == 'B':
                val = 1.0
            elif grid[r][c] == 'W':
                val = -1.0
            else:
                b_inf = 0.0
                for br, bc in b_stones:
                    dist_sq = (r - br) ** 2 + (c - bc) ** 2
                    b_inf += 1.0 / (dist_sq ** 0.75 + 0.5)

                w_inf = 0.0
                for wr, wc in w_stones:
                    dist_sq = (r - wr) ** 2 + (c - wc) ** 2
                    w_inf += 1.0 / (dist_sq ** 0.75 + 0.5)

                diff = b_inf - w_inf
                val = math.tanh(diff * 1.5)

            influence_grid[r][c] = round(val, 3)
            net_eval += val

    # Adjust net eval by Komi and captures
    komi_effect = game.komi if current_p == 'B' else -game.komi
    capture_effect = (game.captures['B'] - game.captures['W']) * 1.5
    total_eval = net_eval + capture_effect - (game.komi - 6.5)

    # 2. Win rate calculation (Sigmoid curve centered at 0 score)
    win_rate_b = round(100.0 / (1.0 + math.exp(-total_eval / 12.0)), 1)
    win_rate_b = max(1.0, min(99.0, win_rate_b))
    win_rate_w = round(100.0 - win_rate_b, 1)

    # Score lead estimation
    estimated_diff = total_eval * 0.4
    if abs(estimated_diff) < 0.5:
        score_lead_text = "Even Match"
    elif estimated_diff > 0:
        score_lead_text = f"B+{round(estimated_diff, 1)} pts"
    else:
        score_lead_text = f"W+{round(abs(estimated_diff), 1)} pts"

    # 3. Tactical candidate moves calculation
    legal_moves = game.get_legal_moves(current_p)
    candidate_moves: List[Dict[str, Any]] = []

    for r, c in legal_moves:
        score = 0.0
        note = "Standard Strategic Move"

        # Check captures
        temp_grid = [row[:] for row in grid]
        temp_grid[r][c] = current_p
        captured_count = 0
        for nr, nc in game._get_neighbors(r, c):
            if temp_grid[nr][nc] == opp_p:
                group, libs = game._get_group_and_liberties(temp_grid, nr, nc)
                if len(libs) == 0:
                    captured_count += len(group)

        if captured_count > 0:
            score += 50.0 + (captured_count * 15.0)
            note = f"🔥 Captures {captured_count} opponent stone{'s' if captured_count > 1 else ''}"

        # Defense: Atari escape
        for nr, nc in game._get_neighbors(r, c):
            if grid[nr][nc] == current_p:
                group, libs = game._get_group_and_liberties(grid, nr, nc)
                if len(libs) == 1 and captured_count == 0:
                    score += 35.0
                    note = "🛡️ Saves group in Atari danger"

        # Shape & Line heuristics
        mid = (size - 1) / 2
        center_dist = abs(r - mid) + abs(c - mid)
        score += max(0, 8 - center_dist * 0.5)

        min_edge = min(r, c, size - 1 - r, size - 1 - c)
        if min_edge in (2, 3):
            score += 10.0
            if captured_count == 0 and "Atari" not in note:
                note = "⭐ High-value 3rd/4th line territory"
        elif min_edge == 1:
            score += 4.0
        elif min_edge == 0 and captured_count == 0:
            score -= 5.0

        # Connection bonus
        friendly_neighbors = sum(1 for nr, nc in game._get_neighbors(r, c) if grid[nr][nc] == current_p)
        score += friendly_neighbors * 5.0
        if friendly_neighbors >= 2 and captured_count == 0 and "Atari" not in note:
            note = "🤝 Strong connecting shape"

        # Influence delta calculation
        move_win_b = win_rate_b + (score / 15.0 if current_p == 'B' else -score / 15.0)
        move_win_b = round(max(1.0, min(99.0, move_win_b)), 1)
        move_win_w = round(100.0 - move_win_b, 1)

        candidate_moves.append({
            "r": r,
            "c": c,
            "score": round(score, 1),
            "win_rate_b": move_win_b,
            "win_rate_w": move_win_w,
            "note": note
        })

    candidate_moves.sort(key=lambda x: x["score"], reverse=True)
    top_moves = candidate_moves[:3]

    for idx, m in enumerate(top_moves):
        m["rank"] = idx + 1
        m["badge"] = ["①", "②", "③"][idx]

    return {
        "win_rate_black": win_rate_b,
        "win_rate_white": win_rate_w,
        "score_lead": score_lead_text,
        "top_moves": top_moves,
        "influence_grid": influence_grid
    }
