/**
 * StoneSync Client Application
 * WebSocket real-time Go game engine client with Canvas rendering & Audio feedback.
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

  // --- 2. Parse & Sync URL Parameters ---
  const urlParams = new URLSearchParams(window.location.search);
  let currentRoomId = urlParams.get('room') || 'stonesync-main';
  let currentBoardSize = parseInt(urlParams.get('board_size') || '19', 10);
  let currentKomi = parseFloat(urlParams.get('komi') || '6.5');

  if (![9, 13, 19].includes(currentBoardSize)) {
    currentBoardSize = 19;
  }

  // --- 3. DOM Elements ---
  const roomInput = document.getElementById('room-input');
  const boardSizeSelect = document.getElementById('board-size-select');
  const komiInput = document.getElementById('komi-input');
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

  // --- 4. Audio Engine ---
  const placementSounds = [
    '/static/go-sounds/GoGame-Thwack1.wav',
    '/static/go-sounds/GoGame-Thwack2.wav',
    '/static/go-sounds/GoGame-Thwack3.wav',
    '/static/go-sounds/GoGame-Thwack4.wav'
  ];
  const captureSoundUrl = '/static/go-sounds/GoGame-PieceRemoved.mp3';

  // Audio Context Resumption on user interaction
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

  function playSound(soundUrl) {
    try {
      getAudioContext();
      const audio = new Audio(soundUrl);
      audio.volume = 0.85;
      audio.play().catch(err => {
        console.log('Audio autoplay prevented or failed gracefully:', err);
      });
    } catch (e) {
      // Fail gracefully
    }
  }

  function playPlacementSound() {
    const randomIndex = Math.floor(Math.random() * placementSounds.length);
    playSound(placementSounds[randomIndex]);
  }

  function playCaptureSound() {
    playSound(captureSoundUrl);
  }

  // --- 5. Initial Form & URL Sync ---
  function updateUrlAndControls() {
    roomInput.value = currentRoomId;
    boardSizeSelect.value = currentBoardSize.toString();
    komiInput.value = currentKomi.toString();

    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomId)}&board_size=${currentBoardSize}&komi=${currentKomi}`;
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

  roomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentRoomId = roomInput.value.trim() || 'stonesync-main';
    currentBoardSize = parseInt(boardSizeSelect.value, 10);
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

  // --- 7. WebSocket Multiplayer Connection ---
  function connectWebSocket() {
    if (socket) {
      socket.close();
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/go/${encodeURIComponent(currentRoomId)}?player_id=${encodeURIComponent(playerId)}&board_size=${currentBoardSize}&komi=${currentKomi}`;

    socket = new WebSocket(wsUrl);

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
      playerRoleBadge.textContent = 'Disconnected (Reconnecting...)';
      playerRoleBadge.className = 'badge role-badge role-observer';
      setTimeout(() => {
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 2500);
    };

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  // --- 8. Handle State Updates ---
  function handleStateUpdate(data) {
    const gameState = data.game_state;
    currentGameState = gameState;

    if (data.your_role) {
      myRole = data.your_role;
    } else {
      // Find my role from players array
      const me = data.players.find(p => p.player_id === playerId);
      myRole = me ? me.color : 'observer';
    }

    // Audio sound check
    const totalCaptures = (gameState.captures.B || 0) + (gameState.captures.W || 0);
    if (data.last_action) {
      if (data.last_action.captured > 0 || totalCaptures > prevCapturesCount) {
        playCaptureSound();
      } else if (data.last_action.action === 'move') {
        playPlacementSound();
      }
    }
    prevCapturesCount = totalCaptures;

    // Update UI elements
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

  // --- 9. In-Game Controls Event Handlers ---
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

  // --- 10. Canvas Go Board Renderer ---
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
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    renderBoard();
  }

  window.addEventListener('resize', resizeCanvas);

  function renderBoard() {
    if (!canvasContainer || !canvas) return;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const size = currentGameState ? currentGameState.board_size : currentBoardSize;
    const padding = 36; // Padding around board for coordinates
    const boardArea = Math.min(width, height) - (padding * 2);
    const cellSize = boardArea / (size - 1);

    const startX = (width - boardArea) / 2;
    const startY = (height - boardArea) / 2;

    // A. Draw Grid Lines
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#382414';

    for (let i = 0; i < size; i++) {
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(startX, startY + i * cellSize);
      ctx.lineTo(startX + boardArea, startY + i * cellSize);
      ctx.stroke();

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(startX + i * cellSize, startY);
      ctx.lineTo(startX + i * cellSize, startY + boardArea);
      ctx.stroke();
    }

    // B. Draw Board Coordinate Markers
    ctx.fillStyle = '#4A3018';
    ctx.font = '600 11px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < size; i++) {
      const colChar = String.fromCharCode(65 + i);
      const rowNum = (size - i).toString();

      // Top & Bottom Columns
      ctx.fillText(colChar, startX + i * cellSize, startY - 18);
      ctx.fillText(colChar, startX + i * cellSize, startY + boardArea + 18);

      // Left & Right Rows
      ctx.fillText(rowNum, startX - 18, startY + i * cellSize);
      ctx.fillText(rowNum, startX + boardArea + 18, startY + i * cellSize);
    }

    // C. Draw Star Points (Hoshi)
    const starPoints = getStarPoints(size);
    ctx.fillStyle = '#382414';
    starPoints.forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(startX + c * cellSize, startY + r * cellSize, Math.max(3, cellSize * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });

    if (!currentGameState) return;

    const grid = currentGameState.grid;
    const lastMove = currentGameState.last_move;
    const stoneRadius = cellSize * 0.46;

    // D. Render Placed Stones
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const stone = grid[r][c];
        if (!stone) continue;

        const cx = startX + c * cellSize;
        const cy = startY + r * cellSize;

        drawStone(cx, cy, stoneRadius, stone);

        // Highlight last move with indicator
        if (lastMove && lastMove.r === r && lastMove.c === c) {
          ctx.beginPath();
          ctx.arc(cx, cy, stoneRadius * 0.45, 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = stone === 'B' ? '#F59E0B' : '#EF4444';
          ctx.stroke();
        }
      }
    }

    // E. Draw Hover Preview Stone
    if (hoveredIntersection && myRole !== 'observer' && currentGameState.current_player === myRole && !currentGameState.game_over) {
      const { r, c } = hoveredIntersection;
      if (grid[r] && grid[r][c] === null) {
        const cx = startX + c * cellSize;
        const cy = startY + r * cellSize;

        ctx.save();
        ctx.globalAlpha = 0.5;
        drawStone(cx, cy, stoneRadius, myRole);
        ctx.restore();
      }
    }
  }

  function drawStone(cx, cy, radius, color) {
    ctx.save();

    // Stone Drop Shadow
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
      grad.addColorStop(0, '#4B5563');
      grad.addColorStop(0.4, '#1F2937');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fill();

      // Soft Specular Reflection
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.35, cy - radius * 0.35, radius * 0.3, radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(
        cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
        cx, cy, radius
      );
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.6, '#F3F4F6');
      grad.addColorStop(0.9, '#E5E7EB');
      grad.addColorStop(1, '#9CA3AF');
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular Gloss
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.3, cy - radius * 0.3, radius * 0.35, radius * 0.2, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
    }

    ctx.restore();
  }

  // --- 11. Canvas User Input Handling ---
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
      // Check proximity (within 45% cell radius)
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
    getAudioContext(); // Ensure Audio Context is resumed on click

    if (!currentGameState || currentGameState.game_over) return;
    if (myRole === 'observer') {
      showToast('Observers cannot place stones', true);
      return;
    }
    if (currentGameState.current_player !== myRole) {
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

  // --- 12. Initialization ---
  updateUrlAndControls();
  connectWebSocket();

  // Initial canvas layout
  setTimeout(resizeCanvas, 50);

})();
