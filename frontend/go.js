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

  function getPlayerName() {
    return localStorage.getItem('stonesync_player_name') || '';
  }

  function setPlayerName(name) {
    if (name) {
      localStorage.setItem('stonesync_player_name', name.trim());
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const playerId = getOrCreatePlayerId();
  let socket = null;
  let currentGameState = null;
  let myRole = 'observer'; // 'B', 'W', or 'observer'
  let prevCapturesCount = 0;
  let hoveredIntersection = null;
  let lastAIEvaluation = null;
  let senseiHintsActive = false;

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

  let currentTc = urlParams.get('tc') || 'none';
  let currentMainTimeMin = parseInt(urlParams.get('main_time') || '10', 10);
  let currentByoPeriods = parseInt(urlParams.get('byo_p') || '3', 10);
  let currentByoTimeSec = parseInt(urlParams.get('byo_t') || '30', 10);
  let currentAiDifficulty = urlParams.get('ai_difficulty') || 'medium';

  if (![9, 13, 19].includes(currentBoardSize)) {
    currentBoardSize = 19;
  }

  // --- 3. DOM Elements ---
  const roomInput = document.getElementById('room-input');
  const modeSelect = document.getElementById('mode-select');
  const aiDifficultyGroup = document.getElementById('ai-difficulty-group');
  const aiDifficultySelect = document.getElementById('ai-difficulty-select');
  const boardSizeSelect = document.getElementById('board-size-select');
  const handicapSelect = document.getElementById('handicap-select');
  const komiInput = document.getElementById('komi-input');
  const tcSelect = document.getElementById('tc-select');
  const mainTimeGroup = document.getElementById('main-time-group');
  const mainTimeInput = document.getElementById('main-time-input');
  const byoyomiGroup = document.getElementById('byoyomi-group');
  const byoyomiPeriodsInput = document.getElementById('byoyomi-periods-input');

  const themeSelect = document.getElementById('theme-select');
  const volumeRange = document.getElementById('volume-range');
  const shareUrlInput = document.getElementById('share-url-input');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const roomForm = document.getElementById('room-form');

  const clocksContainer = document.getElementById('clocks-container');
  const clockBoxBlack = document.getElementById('clock-box-black');
  const clockBoxWhite = document.getElementById('clock-box-white');
  const clockTimeBlack = document.getElementById('clock-time-black');
  const clockTimeWhite = document.getElementById('clock-time-white');
  const clockSubBlack = document.getElementById('clock-sub-black');
  const clockSubWhite = document.getElementById('clock-sub-white');

  const playerRoleBadge = document.getElementById('player-role-badge');
  const turnIndicator = document.getElementById('turn-indicator');
  const passCountBadge = document.getElementById('pass-count-badge');
  const lastMoveText = document.getElementById('last-move-text');
  const blackCapturesEl = document.getElementById('black-captures');
  const whiteCapturesEl = document.getElementById('white-captures');
  const playersListEl = document.getElementById('players-list');

  const btnPass = document.getElementById('btn-pass');
  const btnHeatmap = document.getElementById('btn-heatmap');
  const btnResign = document.getElementById('btn-resign');
  const btnReset = document.getElementById('btn-reset');
  const toastBanner = document.getElementById('toast-banner');

  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const emojiButtons = document.querySelectorAll('.btn-emoji');

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

  // Name Prompt Modal Elements
  const namePromptOverlay = document.getElementById('name-prompt-overlay');
  const namePromptForm = document.getElementById('name-prompt-form');
  const namePromptInput = document.getElementById('name-prompt-input');
  const btnEditName = document.getElementById('btn-edit-name');

  function showNamePromptModal() {
    if (!namePromptOverlay) return;
    const currentName = getPlayerName();
    if (namePromptInput) namePromptInput.value = currentName;
    namePromptOverlay.classList.remove('modal-hidden');
    setTimeout(() => { if (namePromptInput) namePromptInput.focus(); }, 100);
  }

  function hideNamePromptModal() {
    if (namePromptOverlay) namePromptOverlay.classList.add('modal-hidden');
  }

  if (namePromptForm) {
    namePromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = namePromptInput ? namePromptInput.value.trim() : '';
      if (val) {
        setPlayerName(val);
        hideNamePromptModal();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ action: 'set_name', name: val }));
        } else if (socket && socket.readyState === WebSocket.CONNECTING) {
          socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ action: 'set_name', name: val }));
          }, { once: true });
        } else {
          connectWebSocket();
        }
        showToast(`Welcome, ${val}!`, false);
      }
    });
  }

  if (btnEditName) {
    btnEditName.addEventListener('click', () => {
      showNamePromptModal();
    });
  }

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

  // Play authentic stone impact sound from uploaded WAV files based on board position
  function playSpatialPlacementSound(row, col, size) {
    if (masterVolume <= 0) return;
    try {
      preloadAudioAssets();
      const randomIndex = Math.floor(Math.random() * 4) + 1;
      const soundUrl = `./go-sounds/GoGame-Thwack${randomIndex}.wav`;
      if (playPreloadedSound(soundUrl, 0.85)) return;
      if (playPreloadedSound(`/static/go-sounds/GoGame-Thwack${randomIndex}.wav`, 0.85)) return;

      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;

      const now = ctxAudio.currentTime;
      const center = (size - 1) / 2;
      const distFromCenter = Math.hypot(row - center, col - center) / (center * Math.SQRT2 || 1);
      const baseFreq = 380 + (distFromCenter * 300);

      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.08);

      gain.gain.setValueAtTime(masterVolume * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctxAudio.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      // Audio graceful fallback
    }
  }

  function playCaptureSound() {
    if (masterVolume <= 0) return;
    try {
      preloadAudioAssets();
      if (playPreloadedSound('./go-sounds/GoGame-PieceRemoved.mp3', 0.9)) return;
      if (playPreloadedSound('/static/go-sounds/GoGame-PieceRemoved.mp3', 0.9)) return;


      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;

      const now = ctxAudio.currentTime;
      [0, 0.035].forEach((delay, idx) => {
        const osc = ctxAudio.createOscillator();
        const gain = ctxAudio.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(750 + (idx * 100), now + delay);
        osc.frequency.exponentialRampToValueAtTime(300, now + delay + 0.06);
        gain.gain.setValueAtTime(masterVolume * 0.7, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

        osc.connect(gain);
        gain.connect(ctxAudio.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.06);
      });
    } catch (e) {}
  }

  // --- 5. Theme & Controls Sync ---
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const themeToggleLabel = document.getElementById('theme-toggle-label');
  let currentDisplayMode = localStorage.getItem('stonesync_mode') || 'dark';

  function applyDisplayMode(mode) {
    currentDisplayMode = mode;
    localStorage.setItem('stonesync_mode', mode);
    if (mode === 'light') {
      document.body.classList.add('light-theme');
      if (themeToggleLabel) themeToggleLabel.textContent = 'Light Mode';
    } else {
      document.body.classList.remove('light-theme');
      if (themeToggleLabel) themeToggleLabel.textContent = 'Dark Mode';
    }
  }

  applyDisplayMode(currentDisplayMode);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const nextMode = (currentDisplayMode === 'dark') ? 'light' : 'dark';
      applyDisplayMode(nextMode);
      showToast(`Switched to ${nextMode.toUpperCase()} Mode UI`, false);
    });
  }

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

  function syncModeFieldsVisibility() {
    const selectedMode = modeSelect ? modeSelect.value : currentMode;
    if (aiDifficultyGroup) {
      aiDifficultyGroup.style.display = (selectedMode === 'ai') ? 'block' : 'none';
    }
  }

  function syncTcFieldsVisibility() {
    const val = tcSelect.value;
    if (val === 'none') {
      mainTimeGroup.style.display = 'none';
      byoyomiGroup.style.display = 'none';
    } else if (val === 'byoyomi') {
      mainTimeGroup.style.display = 'flex';
      byoyomiGroup.style.display = 'flex';
    } else {
      mainTimeGroup.style.display = 'flex';
      byoyomiGroup.style.display = 'none';
    }
  }

  if (modeSelect) {
    modeSelect.value = currentMode;
    syncModeFieldsVisibility();
    modeSelect.addEventListener('change', syncModeFieldsVisibility);
  }

  if (tcSelect) {
    tcSelect.value = currentTc;
    syncTcFieldsVisibility();
    tcSelect.addEventListener('change', syncTcFieldsVisibility);
  }

  if (aiDifficultySelect) {
    aiDifficultySelect.value = currentAiDifficulty;
  }

  function updateUrlAndControls() {
    roomInput.value = currentRoomId;
    const navRoomId = document.getElementById('nav-room-id');
    if (navRoomId) navRoomId.textContent = currentRoomId;
    if (modeSelect) modeSelect.value = currentMode;
    if (aiDifficultySelect) aiDifficultySelect.value = currentAiDifficulty;
    boardSizeSelect.value = currentBoardSize.toString();
    if (handicapSelect) handicapSelect.value = currentHandicap.toString();
    komiInput.value = currentKomi.toString();

    if (tcSelect) tcSelect.value = currentTc;
    if (mainTimeInput) mainTimeInput.value = currentMainTimeMin.toString();
    if (byoyomiPeriodsInput) byoyomiPeriodsInput.value = currentByoPeriods.toString();
    syncTcFieldsVisibility();
    syncModeFieldsVisibility();

    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomId)}&mode=${currentMode}&ai_difficulty=${encodeURIComponent(currentAiDifficulty)}&board_size=${currentBoardSize}&handicap=${currentHandicap}&komi=${currentKomi}&tc=${currentTc}&main_time=${currentMainTimeMin}&byo_p=${currentByoPeriods}`;
    shareUrlInput.value = fullUrl;
    window.history.replaceState({}, '', fullUrl);
  }


  let zenAmbientActive = false;
  let zenRainNode = null;
  let zenTimer = null;

  document.addEventListener('click', (e) => {
    const btnSensei = e.target.closest('#btn-sensei-hints');
    if (btnSensei) {
      try { getAudioContext(); } catch (err) {}
      senseiHintsActive = !senseiHintsActive;
      btnSensei.classList.toggle('active', senseiHintsActive);
      try {
        showToast(senseiHintsActive ? '💡 AI Sensei Tactical Move Evaluation Active' : 'Sensei Hints Hidden', !senseiHintsActive);
        renderBoard();
      } catch (err) {}
    }

    const btnZenAmbient = e.target.closest('#btn-zen-ambient');
    if (btnZenAmbient) {
      getAudioContext();
      preloadAudioAssets();
      zenAmbientActive = !zenAmbientActive;
      btnZenAmbient.classList.toggle('active', zenAmbientActive);
      if (zenAmbientActive) {
        startZenAmbientSoundscape();
        showToast('🔊 Zen Ambient Soundscape Activated (Rain & Bamboo Fountain)', false);
      } else {
        stopZenAmbientSoundscape();
        showToast('🔇 Zen Ambient Soundscape Muted', true);
      }
    }
  });

  let mp3Playlist = [
    { title: "🎵 Binary Stream", src: "./music/Binary_Stream.mp3" },
    { title: "🎵 Fsica Dembow", src: "./music/Fsica_Dembow.mp3" },
    { title: "🎵 Kernel Panic", src: "./music/Kernel_Panic.mp3" },
    { title: "🎧 Kyoto Rainfall", src: "./music/Kyoto-Rainfall.wav" },
    { title: "🎵 Protocol Flow", src: "./music/Protocol_Flow (1).mp3" },
    { title: "🎵 Recursive Pattern Minimal Mix", src: "./music/Recursive_Pattern_Minimal_Mix.mp3" },
    { title: "🎧 Slate Clatter Suite", src: "./music/Slate-Clatter-Suite.wav" },
    { title: "🎵 Standard Model", src: "./music/Standard_Model.mp3" },
    { title: "🎵 Standard Model Flow", src: "./music/Standard_Model_Flow.mp3" },
    { title: "🎵 System Core", src: "./music/System_Core.mp3" },
    { title: "🎵 System Overlord", src: "./music/System_Overlord.mp3" },
    { title: "🎵 Word Chain Dembow", src: "./music/Word_Chain_Dembow.mp3" },
    { title: "🎵 Wormhole Topology", src: "./music/Wormhole_Topology.mp3" }
  ];


  let currentTrackIdx = 0;

  async function fetchAudioTracks() {
    try {
      const resp = await fetch('/api/audio-tracks');
      if (resp.ok) {
        const data = await resp.json();
        if (data.tracks && data.tracks.length > 0) {
          mp3Playlist = data.tracks;
          soundAssetUrls.length = 0;
          data.tracks.forEach(t => soundAssetUrls.push(t.src));
          loadTrack(0);
        }
      }
    } catch (e) {}
  }

  const mp3Audio = document.getElementById('mp3-audio-element');
  const btnMp3Play = document.getElementById('btn-mp3-play');
  const btnMp3Prev = document.getElementById('btn-mp3-prev');
  const btnMp3Next = document.getElementById('btn-mp3-next');
  const mp3Title = document.getElementById('mp3-track-title');
  const mp3Time = document.getElementById('mp3-track-time');

  const ICON_PLAY = '<img src="/static/assets/icons/iconshock/play.svg" class="icon-xs" alt="Play">';
  const ICON_PAUSE = '<img src="/static/assets/icons/iconshock/pause.svg" class="icon-xs" alt="Pause">';

  function loadTrack(idx) {
    if (!mp3Audio || !mp3Playlist || !mp3Playlist[idx]) return;
    currentTrackIdx = idx;
    const track = mp3Playlist[currentTrackIdx];
    mp3Audio.src = track.src;
    if (mp3Title) {
      const cleanTitle = escapeHtml(track.title.replace(/^[🎵🎧]\s*/, ''));
      mp3Title.innerHTML = `<img src="/static/assets/icons/iconshock/music.svg" class="icon-xs" alt="Music"> ${cleanTitle}`;
    }
  }


  function togglePlayPause() {
    if (!mp3Audio) return;
    if (mp3Audio.paused) {
      mp3Audio.play().then(() => {
        if (btnMp3Play) btnMp3Play.innerHTML = ICON_PAUSE;
        showToast(`Playing: ${mp3Playlist[currentTrackIdx].title.replace(/^[🎵🎧]\s*/, '')}`, false);
      }).catch(e => {
        showToast('Click play to allow audio playback', true);
      });
    } else {
      mp3Audio.pause();
      if (btnMp3Play) btnMp3Play.innerHTML = ICON_PLAY;
    }
  }

  if (mp3Audio) {
    mp3Audio.addEventListener('timeupdate', () => {
      if (!mp3Time || !mp3Audio.duration) return;
      const cur = formatSeconds(mp3Audio.currentTime);
      const dur = formatSeconds(mp3Audio.duration);
      mp3Time.textContent = `${cur} / ${dur}`;
    });

    mp3Audio.addEventListener('ended', () => {
      loadTrack((currentTrackIdx + 1) % mp3Playlist.length);
      mp3Audio.play();
    });
  }

  if (btnMp3Play) btnMp3Play.addEventListener('click', togglePlayPause);
  if (btnMp3Next) {
    btnMp3Next.addEventListener('click', () => {
      loadTrack((currentTrackIdx + 1) % mp3Playlist.length);
      mp3Audio.play().then(() => {
        if (btnMp3Play) btnMp3Play.innerHTML = ICON_PAUSE;
      });
    });
  }
  if (btnMp3Prev) {
    btnMp3Prev.addEventListener('click', () => {
      loadTrack((currentTrackIdx - 1 + mp3Playlist.length) % mp3Playlist.length);
      mp3Audio.play().then(() => {
        if (btnMp3Play) btnMp3Play.innerHTML = ICON_PAUSE;
      });
    });
  }

  loadTrack(0);
  fetchAudioTracks();

  function startZenAmbientSoundscape() {
    try {
      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;
      if (zenRainNode) return;

      const bufferSize = 2 * ctxAudio.sampleRate;
      const noiseBuffer = ctxAudio.createBuffer(1, bufferSize, ctxAudio.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.015;
      }

      const whiteNoise = ctxAudio.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctxAudio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;

      const gain = ctxAudio.createGain();
      gain.gain.value = 0.12;

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctxAudio.destination);
      whiteNoise.start();

      zenRainNode = { whiteNoise, gain };

      zenTimer = setInterval(() => {
        if (zenAmbientActive) playShishiOdoshiSound();
      }, 11000);
    } catch (e) {}
  }

  function stopZenAmbientSoundscape() {
    if (zenRainNode) {
      try { zenRainNode.whiteNoise.stop(); } catch (e) {}
      zenRainNode = null;
    }
    if (zenTimer) {
      clearInterval(zenTimer);
      zenTimer = null;
    }
  }

  const soundBuffers = {};
  const soundAssetUrls = [
    './go-sounds/GoGame-Thwack1.wav',
    './go-sounds/GoGame-Thwack2.wav',
    './go-sounds/GoGame-Thwack3.wav',
    './go-sounds/GoGame-Thwack4.wav',
    './go-sounds/GoGame-PieceRemoved.mp3'
  ];


  async function preloadAudioAssets() {
    const ctxAudio = getAudioContext();
    if (!ctxAudio) return;
    for (const url of soundAssetUrls) {
      if (soundBuffers[url]) continue;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const decoded = await ctxAudio.decodeAudioData(arrayBuf);
          soundBuffers[url] = decoded;
        }
      } catch (e) {}
    }
  }

  function playPreloadedSound(url, volume = 0.5) {
    try {
      const ctxAudio = getAudioContext();
      if (!ctxAudio || !soundBuffers[url]) return false;
      const src = ctxAudio.createBufferSource();
      src.buffer = soundBuffers[url];
      const gain = ctxAudio.createGain();
      gain.gain.value = masterVolume * volume;
      src.connect(gain);
      gain.connect(ctxAudio.destination);
      src.start();
      return true;
    } catch (e) {
      return false;
    }
  }

  function playShishiOdoshiSound() {
    try {
      preloadAudioAssets();
      const randomIndex = Math.floor(Math.random() * 4) + 1;
      const soundUrl = `/static/go-sounds/GoGame-Thwack${randomIndex}.wav`;
      if (playPreloadedSound(soundUrl, 0.3)) return;

      const ctxAudio = getAudioContext();
      if (!ctxAudio) return;
      const now = ctxAudio.currentTime;

      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }


  document.querySelectorAll('.btn-side').forEach(btn => {

    btn.addEventListener('click', () => {
      const requestedColor = btn.dataset.color;
      document.querySelectorAll('.btn-side').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (requestedColor === 'both') {
        currentMode = 'debug';
        if (modeSelect) modeSelect.value = 'debug';
      } else {
        if (currentMode === 'debug') {
          currentMode = 'online';
          if (modeSelect) modeSelect.value = 'online';
        }
      }

      if (currentGameState) updateButtons(currentGameState);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          action: 'switch_side',
          color: requestedColor
        }));
      } else {
        updateUrlAndControls();
        connectWebSocket();
      }
    });
  });

  btnCopyUrl.addEventListener('click', () => {

    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
      showToast('Room URL copied to clipboard!', false);
    }).catch(() => {
      showToast('Failed to copy URL', true);
    });
  });

  const adminPauseBtn = document.getElementById('btn-admin-pause');
  const adminResetBtn = document.getElementById('btn-admin-reset');
  const adminKickSelect = document.getElementById('admin-kick-select');
  const adminKickBtn = document.getElementById('btn-admin-kick');
  const adminAwardBlackBtn = document.getElementById('btn-award-black');
  const adminAwardWhiteBtn = document.getElementById('btn-award-white');

  if (adminPauseBtn) {
    adminPauseBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'pause_clock' }));
      }
    });
  }

  if (adminResetBtn) {
    adminResetBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'reset' }));
      }
    });
  }

  if (adminKickBtn) {
    adminKickBtn.addEventListener('click', () => {
      const targetPid = adminKickSelect ? adminKickSelect.value : '';
      if (targetPid && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'kick_player', target_player_id: targetPid }));
      }
    });
  }

  if (adminAwardBlackBtn) {
    adminAwardBlackBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'declare_winner', winner: 'B' }));
      }
    });
  }

  if (adminAwardWhiteBtn) {
    adminAwardWhiteBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'declare_winner', winner: 'W' }));
      }
    });
  }

  const btnTogglePrivacy = document.getElementById('btn-toggle-privacy');
  const adminPassInput = document.getElementById('admin-pass-input');
  const btnManualScore = document.getElementById('btn-manual-score');
  const adminScoreB = document.getElementById('admin-score-b');
  const adminScoreW = document.getElementById('admin-score-w');

  if (btnTogglePrivacy) {
    btnTogglePrivacy.addEventListener('click', () => {
      const pwd = adminPassInput ? adminPassInput.value : '';
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          action: 'set_room_privacy',
          password: pwd,
          is_private: Boolean(pwd)
        }));
        showToast(pwd ? '🔒 Room Password Set & Locked' : '🔓 Room Unlocked', false);
      }
    });
  }

  if (btnManualScore) {
    btnManualScore.addEventListener('click', () => {
      const bPts = adminScoreB ? adminScoreB.value : '0';
      const wPts = adminScoreW ? adminScoreW.value : '0';
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          action: 'manual_score_override',
          b_score: parseFloat(bPts) || 0,
          w_score: parseFloat(wPts) || 0
        }));
      }
    });
  }



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

    if (tcSelect) currentTc = tcSelect.value;
    if (mainTimeInput) currentMainTimeMin = parseInt(mainTimeInput.value, 10) || 10;
    if (byoyomiPeriodsInput) currentByoPeriods = parseInt(byoyomiPeriodsInput.value, 10) || 3;

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
      last_move: null,
      time_control: 'none',
      clocks: {
        B: { main_time: 600, periods: 3, period_time: 30 },
        W: { main_time: 600, periods: 3, period_time: 30 }
      }
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
    const mainTimeSec = currentMainTimeMin * 60;
    const playerName = getPlayerName();
    const wsUrl = `${wsProtocol}//${host}/ws/go/${encodeURIComponent(currentRoomId)}?player_id=${encodeURIComponent(playerId)}&player_name=${encodeURIComponent(playerName)}&mode=${currentMode}&ai_difficulty=${encodeURIComponent(currentAiDifficulty)}&board_size=${currentBoardSize}&handicap=${currentHandicap}&komi=${currentKomi}&time_control=${currentTc}&main_time_sec=${mainTimeSec}&byoyomi_periods=${currentByoPeriods}&byoyomi_time_sec=${currentByoTimeSec}`;

    try {
      socket = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      showToast('Server disconnected. Offline practice mode active.', false);
      return;
    }

    socket.onopen = () => {
      console.log('Connected to StoneSync Room:', currentRoomId);
      const name = getPlayerName();
      if (name) {
        socket.send(JSON.stringify({ action: 'set_name', name: name }));
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          handleStateUpdate(data);
        } else if (data.type === 'chat') {
          handleChatMessage(data.chat);
        } else if (data.type === 'reaction') {
          handleReaction(data);
        } else if (data.type === 'error') {
          showToast(data.message, true);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    const isGitHubPages = window.location.hostname.endsWith('github.io');
    if (isGitHubPages) {
      if (playerRoleBadge) {
        playerRoleBadge.textContent = 'GitHub Pages Mode (Offline Sandbox)';
        playerRoleBadge.className = 'badge role-badge role-both';
      }
      showToast('⚡ Running on GitHub Pages — Offline Sandbox & AI Sensei Mode Active!', false);
      currentMode = 'debug';
      return;
    }

    socket.onclose = () => {
      if (playerRoleBadge) {
        playerRoleBadge.textContent = 'Disconnected (Reconnecting...)';
        playerRoleBadge.className = 'badge role-badge role-observer';
      }
      setTimeout(() => {
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 5000);
    };

    socket.onerror = (err) => {
      console.warn('WebSocket Connection Issue:', err);
    };
  }


  // --- 8. Clocks & Timers ---
  let clockInterval = null;

  function formatSeconds(sec) {
    if (sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateClockUI() {
    if (!currentGameState || !currentGameState.clocks || currentGameState.time_control === 'none') {
      clocksContainer.style.display = 'none';
      return;
    }

    clocksContainer.style.display = 'grid';
    const bClock = currentGameState.clocks.B;
    const wClock = currentGameState.clocks.W;
    const tc = currentGameState.time_control;
    const activePlayer = currentGameState.current_player;

    // Black Clock
    let bMain = bClock.main_time;
    let bSubText = "";
    if (tc === 'byoyomi') {
      if (bMain > 0) {
        bSubText = `Main Time (${bClock.periods} period${bClock.periods === 1 ? '' : 's'} left)`;
      } else {
        bMain = bClock.period_time;
        bSubText = `Byo-yomi: ${bClock.periods} period${bClock.periods === 1 ? '' : 's'}`;
      }
    } else if (tc === 'fischer') {
      bSubText = `+${currentGameState.fischer_increment_sec || 5}s per move`;
    }

    clockTimeBlack.textContent = formatSeconds(bMain);
    clockSubBlack.textContent = bSubText;

    // White Clock
    let wMain = wClock.main_time;
    let wSubText = "";
    if (tc === 'byoyomi') {
      if (wMain > 0) {
        wSubText = `Main Time (${wClock.periods} period${wClock.periods === 1 ? '' : 's'} left)`;
      } else {
        wMain = wClock.period_time;
        wSubText = `Byo-yomi: ${wClock.periods} period${wClock.periods === 1 ? '' : 's'}`;
      }
    } else if (tc === 'fischer') {
      wSubText = `+${currentGameState.fischer_increment_sec || 5}s per move`;
    }

    clockTimeWhite.textContent = formatSeconds(wMain);
    clockSubWhite.textContent = wSubText;

    // Active highlights & urgency
    const isGameOver = currentGameState.game_over;
    clockBoxBlack.classList.toggle('clock-active', activePlayer === 'B' && !isGameOver);
    clockBoxWhite.classList.toggle('clock-active', activePlayer === 'W' && !isGameOver);

    clockBoxBlack.classList.toggle('clock-urgent', activePlayer === 'B' && bMain <= 10 && !isGameOver);
    clockBoxWhite.classList.toggle('clock-urgent', activePlayer === 'W' && wMain <= 10 && !isGameOver);
  }

  // --- 9. Handle State Updates ---
  function handleStateUpdate(data) {
    const gameState = data.game_state;
    currentGameState = gameState;

    if (data.your_role) {
      myRole = data.your_role;
    } else {
      const me = data.players.find(p => p.player_id === playerId);
      myRole = me ? me.color : 'observer';
    }

    if (data.chat_history) {
      renderChatHistory(data.chat_history);
    }

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
    updateClockUI();
    updateAdminPanel(data);

    if (data.ai_evaluation) {
      lastAIEvaluation = data.ai_evaluation;
      updateAIEvaluationUI(lastAIEvaluation);
    }

    if (gameState.game_over) {
      showGameOverModal(gameState);
    } else {
      gameOverOverlay.classList.add('modal-hidden');
    }

    renderBoard();
  }

  function updateAdminPanel(data) {
    const adminPanelCard = document.getElementById('admin-panel-card');
    const adminPauseBtn = document.getElementById('btn-admin-pause');
    const adminKickSelect = document.getElementById('admin-kick-select');
    if (!adminPanelCard) return;

    const isHost = (data.host_id === playerId) || (currentMode === 'debug') || (myRole !== 'observer');
    adminPanelCard.style.display = isHost ? 'block' : 'none';

    if (adminPauseBtn && data.is_paused !== undefined) {
      adminPauseBtn.innerHTML = data.is_paused 
        ? '<img src="/static/assets/icons/iconshock/play.svg" class="icon-sm" alt="Resume"> Resume Clock' 
        : '<img src="/static/assets/icons/iconshock/pause.svg" class="icon-sm" alt="Pause"> Pause Clock';
    }

    if (adminKickSelect && data.players) {
      const currentVal = adminKickSelect.value;
      adminKickSelect.innerHTML = '<option value="">Select occupant...</option>';
      data.players.forEach(p => {
        if (p.player_id !== playerId) {
          const opt = document.createElement('option');
          opt.value = p.player_id;
          opt.textContent = `${p.short_id} (${p.color})`;
          adminKickSelect.appendChild(opt);
        }
      });
      if (currentVal) adminKickSelect.value = currentVal;
    }
  }

  function columnLetter(c) {
    // Standard Go notation skips I so it is not confused with 1.
    return String.fromCharCode(65 + c + (c >= 8 ? 1 : 0));
  }

  function toBoardCoords(r, c, size = 19) {
    return `${columnLetter(c)}${(size - r).toString()}`;
  }

  function updateAIEvaluationUI(evalData) {
    if (!evalData) return;

    const scoreLeadBadge = document.getElementById('score-lead-badge');
    const wrBlackText = document.getElementById('wr-black-text');
    const wrWhiteText = document.getElementById('wr-white-text');
    const wrBarFillB = document.getElementById('wr-bar-fill-b');
    const wrBarFillW = document.getElementById('wr-bar-fill-w');
    const topMovesList = document.getElementById('top-moves-list');

    if (scoreLeadBadge) {
      scoreLeadBadge.textContent = evalData.score_lead || 'Even Match';
      if (evalData.score_lead.startsWith('B')) {
        scoreLeadBadge.className = 'badge role-badge role-black';
      } else if (evalData.score_lead.startsWith('W')) {
        scoreLeadBadge.className = 'badge role-badge role-white';
      } else {
        scoreLeadBadge.className = 'badge role-badge role-observer';
      }
    }

    if (wrBlackText) wrBlackText.textContent = `Black ${evalData.win_rate_black}%`;
    if (wrWhiteText) wrWhiteText.textContent = `White ${evalData.win_rate_white}%`;

    if (wrBarFillB) wrBarFillB.style.width = `${evalData.win_rate_black}%`;
    if (wrBarFillW) wrBarFillW.style.width = `${evalData.win_rate_white}%`;

    if (topMovesList) {
      topMovesList.innerHTML = '';
      if (!evalData.top_moves || evalData.top_moves.length === 0) {
        topMovesList.innerHTML = '<div class="top-move-item empty-state">No legal move recommendations available.</div>';
        return;
      }

      evalData.top_moves.forEach(m => {
        const item = document.createElement('div');
        item.className = 'top-move-item';
        const coordsText = toBoardCoords(m.r, m.c, currentGameState ? currentGameState.board_size : currentBoardSize);

        item.innerHTML = `
          <span class="top-move-badge">${m.badge || '①'}</span>
          <span class="top-move-coords">${coordsText}</span>
          <div class="top-move-meta">
            <span class="top-move-note">${m.note}</span>
            <span class="top-move-winrate">Win Rate: ${m.win_rate_b}% (B) / ${m.win_rate_w}% (W)</span>
          </div>
        `;

        item.addEventListener('mouseenter', () => {
          hoveredIntersection = { r: m.r, c: m.c };
          renderBoard();
        });

        item.addEventListener('mouseleave', () => {
          hoveredIntersection = null;
          renderBoard();
        });

        item.addEventListener('click', () => {
          if (!currentGameState || currentGameState.game_over) return;
          if (currentMode !== 'solo' && currentMode !== 'debug' && myRole === 'observer') {
            showToast('Observers cannot place stones', true);
            return;
          }
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              action: 'move',
              r: m.r,
              c: m.c
            }));
          }
        });

        topMovesList.appendChild(item);
      });
    }
  }


  function renderChatHistory(history) {
    if (!chatMessages) return;
    if (!history || history.length === 0) {
      chatMessages.innerHTML = '<span class="muted">Welcome to room chat!</span>';
      return;
    }

    chatMessages.innerHTML = history.map(c => `
      <div class="chat-item">
        <div class="chat-meta">
          <span class="mono">${c.short_id}</span>
          <span class="badge ${c.role === 'B' ? 'role-black' : c.role === 'W' ? 'role-white' : 'role-observer'}" style="padding: 1px 6px; font-size: 0.7rem;">${c.role}</span>
          <span>${c.timestamp}</span>
        </div>
        <div class="chat-text">${escapeHtml(c.text)}</div>
      </div>
    `).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleChatMessage(c) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.innerHTML = `
      <div class="chat-meta">
        <span class="mono">${c.short_id}</span>
        <span class="badge ${c.role === 'B' ? 'role-black' : c.role === 'W' ? 'role-white' : 'role-observer'}" style="padding: 1px 6px; font-size: 0.7rem;">${c.role}</span>
        <span>${c.timestamp}</span>
      </div>
      <div class="chat-text">${escapeHtml(c.text)}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleReaction(data) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = data.emoji;
    
    // Position floating emoji over canvas
    const rect = canvasContainer.getBoundingClientRect();
    const left = rect.width / 2 + (Math.random() * 80 - 40);
    const top = rect.height / 2 + (Math.random() * 80 - 40);
    
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    canvasContainer.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function updateRoleBadge() {
    let activeKey = myRole;
    if (currentMode === 'debug') {
      activeKey = 'both';
      const activeColor = currentGameState ? (currentGameState.current_player === 'B' ? 'Black' : 'White') : 'Black';
      playerRoleBadge.textContent = `🛠️ Debug Sandbox (${activeColor})`;
      playerRoleBadge.className = 'badge role-badge role-black';
    } else if (myRole === 'B') {
      playerRoleBadge.textContent = 'Black (First Move)';
      playerRoleBadge.className = 'badge role-badge role-black';
    } else if (myRole === 'W') {
      playerRoleBadge.textContent = 'White';
      playerRoleBadge.className = 'badge role-badge role-white';
    } else {
      playerRoleBadge.textContent = 'Observer (Read-Only)';
      playerRoleBadge.className = 'badge role-badge role-observer';
    }

    document.querySelectorAll('.btn-side').forEach(b => {
      b.classList.toggle('active', b.dataset.color === activeKey);
    });
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
      const colLetter = columnLetter(state.last_move.c);
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
      const displayName = p.name || p.short_id || (p.player_id ? p.player_id.substring(0, 6) : 'Player');
      let colorTag = '<span class="badge role-observer">Observer</span>';
      if (p.color === 'B') colorTag = '<span class="badge role-black"><span class="stone-icon stone-black"></span> Black</span>';
      if (p.color === 'W') colorTag = '<span class="badge role-white"><span class="stone-icon stone-white"></span> White</span>';

      return `
        <div class="player-item">
          <div class="player-info">
            <span class="mono">${escapeHtml(displayName)}</span>
            ${isMe ? '<span class="player-you-tag">YOU</span>' : ''}
          </div>
          ${colorTag}
        </div>
      `;
    }).join('');
  }

  function updateButtons(state) {
    const isMyTurn = (currentMode === 'solo' || currentMode === 'debug') || (myRole === 'B' && state.current_player === 'B') || (myRole === 'W' && state.current_player === 'W');
    btnPass.disabled = !isMyTurn || state.game_over;
    if (btnResign) btnResign.disabled = (myRole === 'observer' && currentMode !== 'solo' && currentMode !== 'debug') || state.game_over;
  }


  function showGameOverModal(state) {
    komiDisplay.textContent = state.komi;
    let winnerStr = 'Draw Match!';
    if (state.winner === 'B') winnerStr = 'Black Wins!';
    if (state.winner === 'W') winnerStr = 'White Wins!';

    if (state.win_reason === 'resignation') {
      winnerStr += ' (By Resignation)';
    } else if (state.win_reason === 'timeout') {
      winnerStr += ' (On Time)';
    }

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

  if (btnResign) {
    btnResign.addEventListener('click', () => {
      if (confirm('Are you sure you want to resign the match?')) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ action: 'resign' }));
      }
    });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'chat', text: text }));
        chatInput.value = '';
      }
    });
  }

  emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'reaction', emoji: emoji }));
      }
    });
  });

  function sendReset() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      action: 'reset',
      board_size: currentBoardSize,
      komi: currentKomi,
      handicap: currentHandicap,
      time_control: currentTc,
      main_time_sec: currentMainTimeMin * 60,
      byoyomi_periods: currentByoPeriods
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
      const colChar = columnLetter(i);
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

    // Sensei Hints Tactical Layer (if toggled)
    if (senseiHintsActive) {
      renderSenseiHints(startX, startY, cellSize, size, grid);
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

  function renderSenseiHints(startX, startY, cellSize, size, grid) {
    if (!currentGameState || currentGameState.game_over) return;
    if (!lastAIEvaluation || !lastAIEvaluation.top_moves) return;

    const colors = ['#3b82f6', '#10b981', '#f59e0b'];
    lastAIEvaluation.top_moves.forEach((cand, idx) => {
      if (grid[cand.r] && grid[cand.r][cand.c] !== null) return;

      const cx = startX + cand.c * cellSize;
      const cy = startY + cand.r * cellSize;
      const color = colors[idx] || '#3b82f6';
      const label = `${cand.badge} ${cand.win_rate_b}%`;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.44, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fill();

      ctx.font = 'bold 11px "Space Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
      ctx.restore();
    });
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

      // Slate Micro-Grain lines for Black stones in Kaya theme
      if (theme === 'kaya') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.8;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(cx - radius * 0.8, cy + i * (radius * 0.25), radius * 1.1, -Math.PI * 0.15, Math.PI * 0.15);
          ctx.stroke();
        }
        ctx.restore();
      }

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
        grad.addColorStop(0.6, '#FDFBF7');
        grad.addColorStop(0.9, '#E5E0D8');
        grad.addColorStop(1, '#A39D93');
      }

      ctx.fillStyle = grad;
      ctx.fill();

      // Japanese Clam Shell grain lines for White stones in Kaya theme
      if (theme === 'kaya') {
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 160, 140, 0.28)';
        ctx.lineWidth = 1.0;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(cx + i * (radius * 0.25), cy - radius * 0.8, radius * 1.2, Math.PI * 0.35, Math.PI * 0.65);
          ctx.stroke();
        }
        ctx.restore();
      }

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
    if (currentMode !== 'solo' && currentMode !== 'debug' && myRole === 'observer') {
      showToast('Observers cannot place stones', true);
      return;
    }
    if (currentMode !== 'solo' && currentMode !== 'debug' && currentGameState.current_player !== myRole) {
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
  if (!getPlayerName()) {
    showNamePromptModal();
  }
  setTimeout(resizeCanvas, 50);

})();

