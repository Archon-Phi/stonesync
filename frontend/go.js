/**
 * StoneSync Client Application
 * WebSocket real-time Go game engine client with Canvas rendering, Themes, Spatial Audio, & Influence Heatmap.
 */

(function () {
  'use strict';

  // --- 1. Client Identity & State ---
  function getOrCreatePlayerId() {
    let pid = localStorage.getItem('stonesync_player_id');
    if (!pid) {
      pid = 'user_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('stonesync_player_id', pid);
    }
    return pid;
  }

  const playerId = getOrCreatePlayerId();
  let socket = null;
  let currentGameState = null;
  let myRole = 'observer'; // 'B', 'W', or 'observer'
  let prevCapturesCount = 0;
  let hoveredIntersection = null;

  // Theme & Visual Features State
  let currentTheme = localStorage.getItem('stonesync_theme') || 'kaya';
  let showHeatmap = false;
  let masterVolume = parseFloat(localStorage.getItem('stonesync_volume') || '0.8');

  // --- 2. Parse & Sync URL Parameters ---
  const urlParams = new URLSearchParams(window.location.search);
  let currentRoomId = urlParams.get('room') || 'stonesync-main';
  let currentMode = urlParams.get('mode') || 'online';
  let currentBoardSize = parseInt(urlParams.get('board_size') || '19', 10);
  let currentHandicap = parseInt(urlParams.get('handicap') || '0', 10);
  let currentKomi = urlParams.has('komi') ? parseFloat(urlParams.get('komi')) : (currentHandicap >= 2 ? 0.5 : 6.5);

  if (![9, 13, 19].includes(currentBoardSize)) {
    currentBoardSize = 19;
  }

  // --- 3. DOM Elements ---
  const roomInput = document.getElementById('room-input');
  const modeSelect = document.getElementById('mode-select');
  const boardSizeSelect = document.getElementById('board-size-select');
  const handicapSelect = document.getElementById('handicap-select');
  const komiInput = document.getElementById('komi-input');
  const themeSelect = document.getElementById('theme-select');
  const volumeRange = document.getElementById('volume-range');
  const shareUrlInput = document.getElementById('share-url-input');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const roomForm = document.getElementById('room-form');



  const playerRoleBadge = document.getElementById('player-role-badge');
  const turnIndicator = document.getElementById('turn-indicator');
  const passCountBadge = document.getElementById('pass-count-badge');
  const lastMoveText = document.getElementById('last-move-text');
  const blackCapturesEl = document.getElementById('black-captures');
  const whiteCapturesEl = document.getElementById('white-captures');
  const playersListEl = document.getElementById('players-list');

  const btnPass = document.getElementById('btn-pass');
  const btnHeatmap = document.getElementById('btn-heatmap');
  const btnReset = document.getElementById('btn-reset');
  const toastBanner = document.getElementById('toast-banner');

  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('go-board');
  const ctx = canvas.getContext('2d');

  // Game Over Modal
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameResultTitle = document.getElementById('game-result-title');
  const winnerText = document.getElementById('winner-text');
  const blackTotalScore = document.getElementById('black-total-score');
  const blackScoreDetail = document.getElementById('black-score-detail');
  const whiteTotalScore = document.getElementById('white-total-score');
  const whiteScoreDetail = document.getElementById('white-score-detail');
  const komiDisplay = document.getElementById('komi-display');
  const btnModalReset = document.getElementById('btn-modal-reset');
  const btnModalClose = document.getElementById('btn-modal-close');

  // --- 4. Spatial Audio Engine ---
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  // Synthesize spatial pitch-shifted stone impact sound based on board position
  function playSpatialPlacementSound(row, col, size) {
    if (masterVolume <= 0) return;
    try {
      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;

      const now = ctxAudio.currentTime;

      // Distance from board center (0 at center, 1 at corner)
      const center = (size - 1) / 2;
      const distFromCenter = Math.hypot(row - center, col - center) / (center * Math.SQRT2 || 1);

      // Pitch shift: center = deep 380Hz, corner = crisp 680Hz
      const baseFreq = 380 + (distFromCenter * 300);

      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.08);

      // Sharp wood impact envelope
      gain.gain.setValueAtTime(masterVolume * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctxAudio.destination);

      osc.start(now);
      osc.stop(now + 0.08);

      // Soft high-frequency transient click
      const noiseOsc = ctxAudio.createOscillator();
      const noiseGain = ctxAudio.createGain();
      noiseOsc.type = 'triangle';
      noiseOsc.frequency.setValueAtTime(baseFreq * 2.5, now);
      noiseGain.gain.setValueAtTime(masterVolume * 0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      noiseOsc.connect(noiseGain);
      noiseGain.connect(ctxAudio.destination);

      noiseOsc.start(now);
      noiseOsc.stop(now + 0.03);
    } catch (e) {
      // Audio graceful fallback
    }
  }

  function playCaptureSound() {
    if (masterVolume <= 0) return;
    try {
      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;

      const now = ctxAudio.currentTime;
      [0, 0.035].forEach((delay, idx) => {
        const osc = ctxAudio.createOscillator();
        const gain = ctxAudio.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(750 + (idx * 100), now + delay);
        osc.frequency.exponentialRampToValueAtTime(300, now + delay + 0.06);

        gain.gain.setValueAtTime(masterVolume * (0.8 - idx * 0.2), now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

        osc.connect(gain);
        gain.connect(ctxAudio.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.06);
      });
    } catch (e) {
      // Audio graceful fallback
    }
  }

  // --- 5. Theme & Controls Sync ---
  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('stonesync_theme', theme);
    canvasContainer.className = `canvas-container theme-${theme}`;
    renderBoard();
  }

  themeSelect.value = currentTheme;
  applyTheme(currentTheme);

  themeSelect.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });

  volumeRange.value = masterVolume.toString();
  volumeRange.addEventListener('input', (e) => {
    masterVolume = parseFloat(e.target.value);
    localStorage.setItem('stonesync_volume', masterVolume.toString());
  });

  btnHeatmap.addEventListener('click', () => {
    showHeatmap = !showHeatmap;
    btnHeatmap.classList.toggle('btn-active-heatmap', showHeatmap);
    renderBoard();
  });

  function updateUrlAndControls() {
    roomInput.value = currentRoomId;
    if (modeSelect) modeSelect.value = currentMode;
    boardSizeSelect.value = currentBoardSize.toString();
    if (handicapSelect) handicapSelect.value = currentHandicap.toString();
    komiInput.value = currentKomi.toString();

    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomId)}&mode=${currentMode}&board_size=${currentBoardSize}&handicap=${currentHandicap}&komi=${currentKomi}`;
    shareUrlInput.value = fullUrl;
    window.history.replaceState({}, '', fullUrl);
  }

  btnCopyUrl.addEventListener('click', () => {
    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
      showToast('Room URL copied to clipboard!', false);
    }).catch(() => {
      showToast('Failed to copy URL', true);
    });
  });

  if (handicapSelect) {
    handicapSelect.addEventListener('change', () => {
      const val = parseInt(handicapSelect.value, 10);
      if (val >= 2 && komiInput.value === '6.5') {
        komiInput.value = '0.5';
      }
    });
  }

  roomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentRoomId = roomInput.value.trim() || 'stonesync-main';
    currentMode = modeSelect ? modeSelect.value : 'online';
    currentBoardSize = parseInt(boardSizeSelect.value, 10);
    currentHandicap = handicapSelect ? parseInt(handicapSelect.value, 10) : 0;
    currentKomi = parseFloat(komiInput.value);
    updateUrlAndControls();
    connectWebSocket();
  });

  // --- 6. Toast Notification Helper ---
  let toastTimer = null;
  function showToast(msg, isError = true) {
    if (toastTimer) clearTimeout(toastTimer);
    toastBanner.textContent = msg;
    toastBanner.style.background = isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)';
    toastBanner.classList.remove('toast-hidden');

    toastTimer = setTimeout(() => {
      toastBanner.classList.add('toast-hidden');
    }, 3200);
  }

  function createDefaultGameState(size = 19, komi = 6.5, handicap = 0) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    let firstPlayer = 'B';
    if (handicap >= 2) {
      firstPlayer = 'W';
      const starPts = [
        [3, 3], [3, 9], [3, 15],
        [9, 3], [9, 9], [9, 15],
        [15, 3], [15, 9], [15, 15]
      ];
      const count = Math.min(handicap, starPts.length);
      for (let i = 0; i < count; i++) {
        const [r, c] = starPts[i];
        if (r < size && c < size) grid[r][c] = 'B';
      }
    }
    return {
      board_size: size,
      komi: komi,
      handicap: handicap,
      current_player: firstPlayer,
      pass_count: 0,
      captures: { B: 0, W: 0 },
      game_over: false,
      grid: grid,
      last_move: null
    };
  }

  currentGameState = createDefaultGameState(currentBoardSize, currentKomi, currentHandicap);

  // --- 7. WebSocket Connection ---
  function connectWebSocket() {
    if (socket) {
      socket.close();
      socket = null;
    }

    const host = window.location.host || '127.0.0.1:8080';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${host}/ws/go/${encodeURIComponent(currentRoomId)}?player_id=${encodeURIComponent(playerId)}&mode=${currentMode}&board_size=${currentBoardSize}&handicap=${currentHandicap}&komi=${currentKomi}`;

    try {
      socket = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      showToast('Server disconnected. Offline practice mode active.', false);
      return;
    }

    socket.onopen = () => {
      console.log('Connected to StoneSync Room:', currentRoomId);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          handleStateUpdate(data);
        } else if (data.type === 'error') {
          showToast(data.message, true);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    socket.onclose = () => {
      if (playerRoleBadge) {
        playerRoleBadge.textContent = 'Disconnected (Reconnecting...)';
        playerRoleBadge.className = 'badge role-badge role-observer';
      }
      setTimeout(() => {
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 3500);
    };

    socket.onerror = (err) => {
      console.warn('WebSocket Error:', err);
    };
  }


  // --- 8. Handle State Updates ---
  function handleStateUpdate(data) {
    const gameState = data.game_state;
    currentGameState = gameState;

    if (data.your_role) {
      myRole = data.your_role;
    } else {
      const me = data.players.find(p => p.player_id === playerId);
      myRole = me ? me.color : 'observer';
    }

    // Audio spatial sound calculation
    const totalCaptures = (gameState.captures.B || 0) + (gameState.captures.W || 0);
    if (data.last_action) {
      if (data.last_action.captured > 0 || totalCaptures > prevCapturesCount) {
        playCaptureSound();
      } else if (data.last_action.action === 'move' && gameState.last_move) {
        playSpatialPlacementSound(gameState.last_move.r, gameState.last_move.c, gameState.board_size);
      }
    }
    prevCapturesCount = totalCaptures;

    updateRoleBadge();
    updateTurnIndicator(gameState);
    updateCaptures(gameState);
    updatePassCount(gameState);
    updateLastMove(gameState);
    updatePlayersList(data.players);
    updateButtons(gameState);

    if (gameState.game_over) {
      showGameOverModal(gameState);
    } else {
      gameOverOverlay.classList.add('modal-hidden');
    }

    renderBoard();
  }

  function updateRoleBadge() {
    if (myRole === 'B') {
      playerRoleBadge.textContent = 'Black (First Move)';
      playerRoleBadge.className = 'badge role-badge role-black';
    } else if (myRole === 'W') {
      playerRoleBadge.textContent = 'White';
      playerRoleBadge.className = 'badge role-badge role-white';
    } else {
      playerRoleBadge.textContent = 'Observer (Read-Only)';
      playerRoleBadge.className = 'badge role-badge role-observer';
    }
  }

  function updateTurnIndicator(state) {
    const isBlack = state.current_player === 'B';
    turnIndicator.className = `badge turn-badge ${isBlack ? 'turn-black' : 'turn-white'}`;
    turnIndicator.innerHTML = `
      <span class="stone-icon ${isBlack ? 'stone-black' : 'stone-white'}"></span>
      ${isBlack ? "Black's Turn" : "White's Turn"}
    `;
  }

  function updateCaptures(state) {
    blackCapturesEl.textContent = state.captures.B || 0;
    whiteCapturesEl.textContent = state.captures.W || 0;
  }

  function updatePassCount(state) {
    passCountBadge.textContent = `${state.pass_count} / 2`;
  }

  function updateLastMove(state) {
    if (state.last_move) {
      const colLetter = String.fromCharCode(65 + state.last_move.c);
      const rowNum = state.board_size - state.last_move.r;
      lastMoveText.textContent = `${colLetter}${rowNum} (Row ${state.last_move.r + 1}, Col ${state.last_move.c + 1})`;
    } else {
      lastMoveText.textContent = '—';
    }
  }

  function updatePlayersList(players) {
    if (!players || players.length === 0) {
      playersListEl.innerHTML = '<span class="muted">No players connected.</span>';
      return;
    }

    playersListEl.innerHTML = players.map(p => {
      const isMe = p.player_id === playerId;
      let colorTag = '<span class="badge role-observer">Observer</span>';
      if (p.color === 'B') colorTag = '<span class="badge role-black"><span class="stone-icon stone-black"></span> Black</span>';
      if (p.color === 'W') colorTag = '<span class="badge role-white"><span class="stone-icon stone-white"></span> White</span>';

      return `
        <div class="player-item">
          <div class="player-info">
            <span class="mono">${p.short_id}</span>
            ${isMe ? '<span class="player-you-tag">YOU</span>' : ''}
          </div>
          ${colorTag}
        </div>
      `;
    }).join('');
  }

  function updateButtons(state) {
    const isMyTurn = (myRole === 'B' && state.current_player === 'B') || (myRole === 'W' && state.current_player === 'W');
    btnPass.disabled = !isMyTurn || state.game_over;
  }

  function showGameOverModal(state) {
    komiDisplay.textContent = state.komi;
    let winnerStr = 'Draw Match!';
    if (state.winner === 'B') winnerStr = 'Black Wins!';
    if (state.winner === 'W') winnerStr = 'White Wins!';

    winnerText.textContent = winnerStr;
    
    if (state.final_score) {
      blackTotalScore.textContent = state.final_score.B;
      whiteTotalScore.textContent = state.final_score.W;
      
      const terrB = state.territory ? state.territory.B : 0;
      const terrW = state.territory ? state.territory.W : 0;

      blackScoreDetail.textContent = `Territory: ${terrB} | Captures: ${state.captures.B}`;
      whiteScoreDetail.textContent = `Territory: ${terrW} | Captures: ${state.captures.W} | Komi: ${state.komi}`;
    }

    gameOverOverlay.classList.remove('modal-hidden');
  }

  btnModalClose.addEventListener('click', () => {
    gameOverOverlay.classList.add('modal-hidden');
  });

  btnModalReset.addEventListener('click', () => {
    gameOverOverlay.classList.add('modal-hidden');
    sendReset();
  });

  btnPass.addEventListener('click', () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ action: 'pass' }));
  });

  function sendReset() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'reset',
      board_size: currentBoardSize,
      komi: currentKomi
    }));
  }

  btnReset.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the current match?')) {
      sendReset();
    }
  });

  // --- 9. Canvas Go Board Renderer & Heatmap ---
  function getStarPoints(size) {
    if (size === 19) {
      return [
        [3, 3], [3, 9], [3, 15],
        [9, 3], [9, 9], [9, 15],
        [15, 3], [15, 9], [15, 15]
      ];
    } else if (size === 13) {
      return [
        [3, 3], [3, 9],
        [6, 6],
        [9, 3], [9, 9]
      ];
    } else if (size === 9) {
      return [
        [2, 2], [2, 6],
        [4, 4],
        [6, 2], [6, 6]
      ];
    }
    return [];
  }

  function resizeCanvas() {
    if (!canvasContainer || !canvas) return;
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', () => {
    renderBoard();
  });

  function renderBoard() {
    if (!canvasContainer || !canvas) return;
    resizeCanvas();
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    ctx.clearRect(0, 0, width, height);


    const size = currentGameState ? currentGameState.board_size : currentBoardSize;
    const padding = 36;
    const boardArea = Math.min(width, height) - (padding * 2);
    const cellSize = boardArea / (size - 1);

    const startX = (width - boardArea) / 2;
    const startY = (height - boardArea) / 2;

    // Theme Colors Configuration
    let lineColor = '#382414';
    let textColor = '#4A3018';
    let starColor = '#382414';

    if (currentTheme === 'obsidian') {
      lineColor = 'rgba(56, 189, 248, 0.4)';
      textColor = '#38BDF8';
      starColor = '#38BDF8';
    } else if (currentTheme === 'cyberpunk') {
      lineColor = 'rgba(244, 63, 94, 0.5)';
      textColor = '#F43F5E';
      starColor = '#F43F5E';
    }

    // A. Draw Grid Lines
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = lineColor;

    for (let i = 0; i < size; i++) {
      ctx.beginPath();
      ctx.moveTo(startX, startY + i * cellSize);
      ctx.lineTo(startX + boardArea, startY + i * cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(startX + i * cellSize, startY);
      ctx.lineTo(startX + i * cellSize, startY + boardArea);
      ctx.stroke();
    }

    // B. Draw Board Coordinate Markers
    ctx.fillStyle = textColor;
    ctx.font = '600 11px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < size; i++) {
      const colChar = String.fromCharCode(65 + i);
      const rowNum = (size - i).toString();

      ctx.fillText(colChar, startX + i * cellSize, startY - 18);
      ctx.fillText(colChar, startX + i * cellSize, startY + boardArea + 18);

      ctx.fillText(rowNum, startX - 18, startY + i * cellSize);
      ctx.fillText(rowNum, startX + boardArea + 18, startY + i * cellSize);
    }

    // C. Draw Star Points
    const starPoints = getStarPoints(size);
    ctx.fillStyle = starColor;
    starPoints.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(startX + c * cellSize, startY + r * cellSize, Math.max(3, cellSize * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });

    if (!currentGameState) return;

    const grid = currentGameState.grid;

    // D. Influence Heatmap Layer (if toggled)
    if (showHeatmap) {
      renderInfluenceHeatmap(startX, startY, cellSize, size, grid);
    }

    // E. Render Placed Stones
    const lastMove = currentGameState.last_move;
    const stoneRadius = cellSize * 0.46;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const stone = grid[r][c];
        if (!stone) continue;

        const cx = startX + c * cellSize;
        const cy = startY + r * cellSize;

        drawStone(cx, cy, stoneRadius, stone, currentTheme);

        if (lastMove && lastMove.r === r && lastMove.c === c) {
          ctx.beginPath();
          ctx.arc(cx, cy, stoneRadius * 0.45, 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = stone === 'B' ? '#F59E0B' : '#EF4444';
          ctx.stroke();
        }
      }
    }

    // F. Draw Hover Preview Stone
    if (hoveredIntersection && !currentGameState.game_over) {
      const isMyTurn = (currentMode === 'solo') || (myRole !== 'observer' && currentGameState.current_player === myRole);
      if (isMyTurn) {
        const { r, c } = hoveredIntersection;
        if (grid[r] && grid[r][c] === null) {
          const cx = startX + c * cellSize;
          const cy = startY + r * cellSize;
          const previewColor = (currentMode === 'solo') ? currentGameState.current_player : myRole;

          ctx.save();
          ctx.globalAlpha = 0.55;
          drawStone(cx, cy, stoneRadius, previewColor, currentTheme);
          ctx.restore();
        }
      }
    }

  }

  // Render visual territorial influence clouds
  function renderInfluenceHeatmap(startX, startY, cellSize, size, grid) {
    const influence = Array.from({ length: size }, () => Array(size).fill(0));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const stone = grid[r][c];
        if (!stone) continue;
        const val = stone === 'B' ? 1 : -1;

        // Radiate influence to neighboring cells
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
              const d = Math.hypot(dr, dc);
              influence[nr][nc] += val * Math.exp(-d / 2.0);
            }
          }
        }
      }
    }

    // Render influence gradients
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inf = influence[r][c];
        if (Math.abs(inf) < 0.25) continue;

        const cx = startX + c * cellSize;
        const cy = startY + r * cellSize;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.75, 0, Math.PI * 2);

        if (inf > 0) {
          // Black Influence
          ctx.fillStyle = `rgba(59, 130, 246, ${Math.min(0.35, inf * 0.12)})`;
        } else {
          // White Influence
          ctx.fillStyle = `rgba(245, 158, 11, ${Math.min(0.35, Math.abs(inf) * 0.12)})`;
        }
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawStone(cx, cy, radius, color, theme) {
    ctx.save();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);

    if (color === 'B') {
      const grad = ctx.createRadialGradient(
        cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
        cx, cy, radius
      );

      if (theme === 'cyberpunk') {
        grad.addColorStop(0, '#A855F7');
        grad.addColorStop(0.5, '#3B0764');
        grad.addColorStop(1, '#090514');
        ctx.shadowColor = '#C084FC';
        ctx.shadowBlur = 12;
      } else if (theme === 'obsidian') {
        grad.addColorStop(0, '#334155');
        grad.addColorStop(0.5, '#0F172A');
        grad.addColorStop(1, '#020617');
        ctx.shadowColor = '#000000';
      } else {
        grad.addColorStop(0, '#4B5563');
        grad.addColorStop(0.4, '#1F2937');
        grad.addColorStop(1, '#030712');
      }

      ctx.fillStyle = grad;
      ctx.fill();

      // Specular Reflection
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.35, cy - radius * 0.35, radius * 0.3, radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(
        cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
        cx, cy, radius
      );

      if (theme === 'cyberpunk') {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.5, '#22D3EE');
        grad.addColorStop(1, '#0891B2');
        ctx.shadowColor = '#22D3EE';
        ctx.shadowBlur = 12;
      } else if (theme === 'obsidian') {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.5, '#E2E8F0');
        grad.addColorStop(1, '#94A3B8');
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 8;
      } else {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.6, '#F3F4F6');
        grad.addColorStop(0.9, '#E5E7EB');
        grad.addColorStop(1, '#9CA3AF');
      }

      ctx.fillStyle = grad;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.3, cy - radius * 0.3, radius * 0.35, radius * 0.2, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
    }

    ctx.restore();
  }

  // --- 10. Canvas User Input Handling ---
  function getIntersectionFromCoords(mouseX, mouseY) {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    const size = currentGameState ? currentGameState.board_size : currentBoardSize;
    const padding = 36;
    const boardArea = Math.min(width, height) - (padding * 2);
    const cellSize = boardArea / (size - 1);
    const startX = (width - boardArea) / 2;
    const startY = (height - boardArea) / 2;

    const col = Math.round((mouseX - startX) / cellSize);
    const row = Math.round((mouseY - startY) / cellSize);

    if (row >= 0 && row < size && col >= 0 && col < size) {
      const interX = startX + col * cellSize;
      const interY = startY + row * cellSize;
      const dist = Math.hypot(mouseX - interX, mouseY - interY);
      if (dist <= cellSize * 0.45) {
        return { r: row, c: col };
      }
    }
    return null;
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const inter = getIntersectionFromCoords(mouseX, mouseY);
    if (JSON.stringify(inter) !== JSON.stringify(hoveredIntersection)) {
      hoveredIntersection = inter;
      renderBoard();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (hoveredIntersection !== null) {
      hoveredIntersection = null;
      renderBoard();
    }
  });

  canvas.addEventListener('click', (e) => {
    getAudioContext();

    if (!currentGameState || currentGameState.game_over) return;
    if (currentMode !== 'solo' && myRole === 'observer') {
      showToast('Observers cannot place stones', true);
      return;
    }
    if (currentMode !== 'solo' && currentGameState.current_player !== myRole) {
      showToast(`Not your turn! Waiting for ${currentGameState.current_player === 'B' ? 'Black' : 'White'}`, true);
      return;
    }


    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const inter = getIntersectionFromCoords(mouseX, mouseY);
    if (inter) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          action: 'move',
          r: inter.r,
          c: inter.c
        }));
      }
    }
  });

  // --- 11. SGF Export & Import Handlers ---
  const btnExportSgf = document.getElementById('btn-export-sgf');
  const inputImportSgf = document.getElementById('input-import-sgf');

  if (btnExportSgf) {
    btnExportSgf.addEventListener('click', () => {
      window.location.href = `/api/room/${encodeURIComponent(currentRoomId)}/sgf`;
    });
  }

  if (inputImportSgf) {
    inputImportSgf.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const sgfContent = evt.target.result;
        try {
          const res = await fetch(`/api/room/${encodeURIComponent(currentRoomId)}/sgf`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: sgfContent
          });
          if (res.ok) {
            showToast('SGF game record imported successfully!', false);
          } else {
            const errText = await res.text();
            showToast(`SGF Import Error: ${errText}`, true);
          }
        } catch (err) {
          showToast(`Import failed: ${err.message}`, true);
        }
      };
      reader.readAsText(file);
    });
  }

  // --- 12. Initialization ---
  updateUrlAndControls();
  connectWebSocket();
  setTimeout(resizeCanvas, 50);

})();

