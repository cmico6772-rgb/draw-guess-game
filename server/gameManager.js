'use strict';

const {
  pickWords,
  normalizeWordKey,
  NOT_ENOUGH_WORDS_MSG,
  WORD_ALREADY_USED_MSG,
} = require('./words');
const { TelephoneGame, MIN_PLAYERS: TEL_MIN_PLAYERS } = require('./telephoneGame');

const CHOOSE_DURATION = 25;
const ROUNDEND_DURATION = 6;
const DRAWER_WAIT_DURATION = 30;
const WORD_CHOICES = 3;
const MIN_PLAYERS = 2;

const ROUND_TIME_OPTIONS = [180, 420, 600];
const DEFAULT_SETTINGS = { gameType: 'drawguess', mode: 'default', roundTime: 180 };

const DRAWER_BONUS_PER_GUESSER = 20;

function computeGuesserPoints(timeLeftMs, totalRoundTimeSeconds) {
  const totalMs = totalRoundTimeSeconds * 1000;
  if (totalMs <= 0) return 1;
  return Math.max(1, Math.round((timeLeftMs / totalMs) * 100));
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalize(text) {
  return normalizeWordKey(text);
}

function clamp01(n) {
  n = Number(n);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeColor(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  if (!s || s.length > 25) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s) || /^rgba?\([\d.,\s%]+\)$/.test(s)) return s;
  return null;
}

function makePlayerId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

class Room {
  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.players = []; // { playerId, socketId, name, score, connected }
    this.hostPlayerId = null;
    this.phase = 'lobby';
    this.settings = Object.assign({}, DEFAULT_SETTINGS);

    this.turnOrder = []; // playerIds at game start
    this.turnIndex = -1;
    this.totalRounds = 0;
    this.roundNumber = 0;

    this.currentDrawerId = null; // playerId
    this.word = null;
    this.wordChoices = [];
    this.usedWords = new Set(); // normalized keys used in the current game
    this.correctGuessers = new Set(); // playerIds
    this.roundGains = {}; // playerId -> points

    this.strokes = [];
    this.redo = [];
    this.currentStroke = null;
    this.bgMode = 'normal';

    this.roundEndAt = 0;
    this.tickTimer = null;
    this.phaseTimer = null;

    // Drawer disconnect / wait state
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.pausedTimeLeft = 0;
    this.waitEndAt = 0;
    this.waitTickTimer = null;
    this.waitExpireTimer = null;

    this.telephone = null;
  }

  isTelephone() {
    return !!this.telephone;
  }

  isTelephonePhase() {
    return this.phase && String(this.phase).indexOf('tel_') === 0;
  }

  // ---- player helpers -------------------------------------------------

  getPlayerBySocket(socketId) {
    return this.players.find((p) => p.socketId === socketId) || null;
  }

  getPlayerById(playerId) {
    return this.players.find((p) => p.playerId === playerId) || null;
  }

  activePlayers() {
    return this.players.filter((p) => p.connected);
  }

  serializePlayers() {
    return this.players
      .filter((p) => p.connected || this.phase === 'drawing' || this.phase === 'choosing' || this.phase === 'roundend')
      .map((p) => ({
        id: p.playerId,
        name: p.name,
        score: p.score,
        connected: p.connected,
        isHost: p.playerId === this.hostPlayerId,
        isDrawer: p.playerId === this.currentDrawerId,
        hasGuessed: this.correctGuessers.has(p.playerId),
      }));
  }

  broadcastPlayers() {
    this.io.to(this.code).emit('players', { players: this.serializePlayers() });
  }

  broadcastSettings() {
    this.io.to(this.code).emit('settings', {
      gameType: this.settings.gameType,
      mode: this.settings.mode,
      roundTime: this.settings.roundTime,
    });
  }

  broadcastDrawerWait() {
    const waitLeft = this.drawerWaiting
      ? Math.max(0, Math.ceil((this.waitEndAt - Date.now()) / 1000))
      : 0;
    this.io.to(this.code).emit('drawerWait', {
      waiting: this.drawerWaiting,
      waitLeft,
      canSkip: this.canSkipDrawer,
      drawerId: this.currentDrawerId,
    });
  }

  attachPlayer(socket, name, playerId) {
    const clean = String(name || '').trim().slice(0, 16) || 'Player';
    const pid = playerId || makePlayerId();
    const existing = this.getPlayerById(pid);

    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      if (clean) existing.name = clean;
      if (this.drawerWaiting && existing.playerId === this.currentDrawerId) {
        this.resumeDrawer();
      }
      return { player: existing, reconnected: true };
    }

    const player = {
      playerId: pid,
      socketId: socket.id,
      name: clean,
      score: 0,
      connected: true,
    };
    this.players.push(player);
    if (!this.hostPlayerId) this.hostPlayerId = player.playerId;
    return { player, reconnected: false };
  }

  buildStateSync(forPlayer) {
    const payload = {
      phase: this.phase,
      hostId: this.hostPlayerId,
      settings: this.settings,
      players: this.serializePlayers(),
      round: this.roundNumber,
      totalRounds: this.totalRounds,
      drawerId: this.currentDrawerId,
      drawerName: (this.getPlayerById(this.currentDrawerId) || {}).name || '',
      mode: this.settings.mode,
      roundTime: this.settings.roundTime,
      bgMode: this.bgMode,
      strokes: this.strokes,
      drawerWaiting: this.drawerWaiting,
      canSkipDrawer: this.canSkipDrawer,
      waitLeft: this.drawerWaiting
        ? Math.max(0, Math.ceil((this.waitEndAt - Date.now()) / 1000))
        : 0,
    };

    if (this.phase === 'drawing' && !this.isTelephonePhase()) {
      payload.timeLeft = this.drawerWaiting
        ? this.pausedTimeLeft
        : this.timeLeft();
      payload.wordLength = this.word ? this.word.length : 0;
      if (forPlayer && forPlayer.playerId === this.currentDrawerId) {
        payload.word = this.word;
      }
    } else if (this.phase === 'choosing') {
      payload.chooseDuration = CHOOSE_DURATION;
    }

    if (this.telephone) {
      Object.assign(payload, this.telephone.buildStateSync(forPlayer));
      payload.gameType = 'telephone';
      return payload;
    }

    payload.gameType = 'drawguess';
    return payload;
  }

  removePlayer(socketId, voluntary) {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;

    if (this.phase === 'lobby' || this.phase === 'gameend' || voluntary) {
      this.players = this.players.filter((p) => p.playerId !== player.playerId);
      this.turnOrder = this.turnOrder.filter((id) => id !== player.playerId);
      if (this.hostPlayerId === player.playerId) {
        const next = this.activePlayers()[0];
        this.hostPlayerId = next ? next.playerId : null;
      }
      this.broadcastPlayers();
      return;
    }

    if (this.isTelephonePhase()) {
      if (this.telephone) this.telephone.handleDisconnect(player.playerId);
      this.broadcastPlayers();
      return;
    }

    if (
      player.playerId === this.currentDrawerId
      && (this.phase === 'choosing' || this.phase === 'drawing')
      && !this.drawerWaiting
    ) {
      this.handleDrawerDisconnect();
      this.broadcastPlayers();
      return;
    }

    if (
      (this.phase === 'choosing' || this.phase === 'drawing' || this.phase === 'roundend')
      && this.activePlayers().length < MIN_PLAYERS
      && !this.drawerWaiting
    ) {
      this.systemMessage('Not enough players. Game over.');
      this.endGame();
      return;
    }

    this.broadcastPlayers();
  }

  hostRemovePlayer(bySocketId, targetPlayerId) {
    if (!targetPlayerId) return false;
    const host = this.getPlayerBySocket(bySocketId);
    if (!host || host.playerId !== this.hostPlayerId) return false;
    if (targetPlayerId === host.playerId) return false;

    const target = this.getPlayerById(targetPlayerId);
    if (!target) return false;

    if (target.socketId) {
      this.io.to(target.socketId).emit('removedFromRoom', {
        text: 'You were removed from the room by the host.',
      });
    }

    const wasDrawer = target.playerId === this.currentDrawerId;
    this.players = this.players.filter((p) => p.playerId !== targetPlayerId);
    this.turnOrder = this.turnOrder.filter((id) => id !== targetPlayerId);
    this.correctGuessers.delete(targetPlayerId);
    delete this.roundGains[targetPlayerId];

    if (wasDrawer && (this.phase === 'choosing' || this.phase === 'drawing')) {
      this.clearWaitTimers();
      this.drawerWaiting = false;
      this.canSkipDrawer = false;
      this.skipDrawerRound(bySocketId, true);
      return true;
    }

    if (this.activePlayers().length < MIN_PLAYERS && this.phase !== 'lobby' && this.phase !== 'gameend') {
      this.systemMessage('Not enough players. Game over.');
      this.endGame();
      return true;
    }

    this.broadcastPlayers();
    return true;
  }

  isEmpty() {
    return this.players.length === 0;
  }

  systemMessage(text) {
    this.io.to(this.code).emit('chat', { system: true, text });
  }

  // ---- settings -------------------------------------------------------

  updateSettings(bySocketId, incoming) {
    const host = this.getPlayerBySocket(bySocketId);
    if (!host || host.playerId !== this.hostPlayerId) return;
    if (this.phase !== 'lobby' && this.phase !== 'gameend') return;
    if (!incoming || typeof incoming !== 'object') return;
    if (incoming.gameType === 'drawguess' || incoming.gameType === 'telephone') {
      this.settings.gameType = incoming.gameType;
    }
    if (incoming.mode === 'default' || incoming.mode === 'free') {
      this.settings.mode = incoming.mode;
    }
    if (ROUND_TIME_OPTIONS.indexOf(Number(incoming.roundTime)) !== -1) {
      this.settings.roundTime = Number(incoming.roundTime);
    }
    this.broadcastSettings();
  }

  // ---- drawer wait / reconnect ----------------------------------------

  handleDrawerDisconnect() {
    if (this.isTelephonePhase()) return;
    if (this.drawerWaiting) return;
    this.drawerWaiting = true;
    this.canSkipDrawer = false;
    this.clearTimers();

    if (this.phase === 'drawing') {
      this.pausedTimeLeft = this.timeLeft();
    } else {
      this.pausedTimeLeft = CHOOSE_DURATION;
    }

    this.systemMessage('The drawer disconnected. Waiting for them to rejoin...');
    this.waitEndAt = Date.now() + DRAWER_WAIT_DURATION * 1000;
    this.startWaitTick();
    this.waitExpireTimer = setTimeout(() => {
      this.canSkipDrawer = true;
      this.broadcastDrawerWait();
    }, DRAWER_WAIT_DURATION * 1000);
    this.broadcastDrawerWait();
  }

  startWaitTick() {
    this.broadcastDrawerWait();
    this.waitTickTimer = setInterval(() => {
      this.broadcastDrawerWait();
      if (Math.ceil((this.waitEndAt - Date.now()) / 1000) <= 0) {
        this.clearWaitTick();
      }
    }, 1000);
  }

  clearWaitTick() {
    if (this.waitTickTimer) {
      clearInterval(this.waitTickTimer);
      this.waitTickTimer = null;
    }
  }

  clearWaitTimers() {
    this.clearWaitTick();
    if (this.waitExpireTimer) {
      clearTimeout(this.waitExpireTimer);
      this.waitExpireTimer = null;
    }
  }

  resumeDrawer() {
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.clearWaitTimers();
    this.systemMessage('The drawer rejoined. Round resumed.');

    if (this.phase === 'drawing') {
      this.roundEndAt = Date.now() + this.pausedTimeLeft * 1000;
      this.startTick();
    } else if (this.phase === 'choosing') {
      const drawer = this.getPlayerById(this.currentDrawerId);
      if (this.settings.mode === 'default') {
        if (drawer && drawer.socketId) {
          this.io.to(drawer.socketId).emit('chooseWord', {
            words: this.wordChoices,
            duration: CHOOSE_DURATION,
          });
        }
      } else if (drawer && drawer.socketId) {
        this.io.to(drawer.socketId).emit('enterWord', { duration: CHOOSE_DURATION });
      }
      this.scheduleChooseTimeout();
    }

    this.broadcastDrawerWait();
    this.broadcastPlayers();
  }

  skipDrawerRound(bySocketId, forced) {
    const host = this.getPlayerBySocket(bySocketId);
    if (!host || host.playerId !== this.hostPlayerId) return;
    if (!forced && (!this.drawerWaiting || !this.canSkipDrawer)) return;

    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.clearWaitTimers();
    this.endRound({ skipNoBonus: true });
  }

  isDrawerActive(socketId) {
    const p = this.getPlayerBySocket(socketId);
    if (!p) return false;
    if (p.playerId !== this.currentDrawerId) return false;
    if (!p.connected) return false;
    if (this.drawerWaiting) return false;
    return true;
  }

  playerIdFromSocket(socketId) {
    const p = this.getPlayerBySocket(socketId);
    return p ? p.playerId : null;
  }

  // ---- game flow ------------------------------------------------------

  startGame(bySocketId) {
    const host = this.getPlayerBySocket(bySocketId);
    if (this.phase !== 'lobby' && this.phase !== 'gameend') return;
    if (!host || host.playerId !== this.hostPlayerId) return;

    if (this.settings.gameType === 'telephone') {
      if (this.activePlayers().length < TEL_MIN_PLAYERS) {
        this.io.to(bySocketId).emit('errorMsg', {
          text: 'At least 4 players are required to start Drawing Telephone.',
        });
        return;
      }
      this.telephone = new TelephoneGame(this);
      if (!this.telephone.start()) {
        this.telephone = null;
        return;
      }
      this.broadcastPlayers();
      return;
    }

    if (this.activePlayers().length < MIN_PLAYERS) {
      this.io.to(bySocketId).emit('errorMsg', { text: `Need at least ${MIN_PLAYERS} players to start.` });
      return;
    }

    this.turnOrder = this.activePlayers().map((p) => p.playerId);
    this.totalRounds = this.turnOrder.length;
    this.turnIndex = -1;
    this.roundNumber = 0;
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.usedWords = new Set();

    this.io.to(this.code).emit('gameStarted', { settings: this.settings });
    this.broadcastPlayers();
    this.nextTurnOrEnd();
  }

  resetGameSession() {
    this.clearTimers();
    this.clearWaitTimers();
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.pausedTimeLeft = 0;
    this.turnIndex = -1;
    this.roundNumber = 0;
    this.totalRounds = 0;
    this.turnOrder = [];
    this.currentDrawerId = null;
    this.word = null;
    this.wordChoices = [];
    this.usedWords = new Set();
    this.correctGuessers = new Set();
    this.roundGains = {};
    this.resetDrawing();
    if (this.telephone) {
      this.telephone.destroy();
      this.telephone = null;
    }
  }

  returnToLobby(bySocketId) {
    const host = this.getPlayerBySocket(bySocketId);
    if (!host || host.playerId !== this.hostPlayerId) return;
    if (this.phase !== 'gameend') return;

    if (this.telephone) {
      this.telephone.returnToLobby();
      return;
    }

    this.resetGameSession();
    this.phase = 'lobby';

    this.io.to(this.code).emit('clearCanvas');
    this.broadcastPlayers();
    this.broadcastSettings();
    this.io.to(this.code).emit('returnToLobby', {
      settings: this.settings,
      players: this.serializePlayers(),
    });
  }

  resetScores(bySocketId) {
    const host = this.getPlayerBySocket(bySocketId);
    if (!host || host.playerId !== this.hostPlayerId) return;
    if (this.phase !== 'lobby' && this.phase !== 'gameend') return;

    this.players.forEach((p) => { p.score = 0; });
    this.roundGains = {};
    this.broadcastPlayers();
    this.systemMessage('Scores have been reset.');
  }

  nextTurnOrEnd() {
    this.clearTimers();
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.clearWaitTimers();

    let next = null;
    while (this.turnIndex < this.turnOrder.length - 1) {
      this.turnIndex += 1;
      const candidate = this.getPlayerById(this.turnOrder[this.turnIndex]);
      if (candidate && candidate.connected) {
        next = candidate;
        break;
      }
    }

    if (!next) {
      this.endGame();
      return;
    }

    this.beginTurn(next);
  }

  resetDrawing() {
    this.strokes = [];
    this.redo = [];
    this.currentStroke = null;
    this.bgMode = 'normal';
  }

  isWordUsed(word) {
    return this.usedWords.has(normalizeWordKey(word));
  }

  markWordUsed(word) {
    const key = normalizeWordKey(word);
    if (key) this.usedWords.add(key);
  }

  handleWordPoolExhausted(drawer) {
    if (drawer && drawer.socketId) {
      this.io.to(drawer.socketId).emit('errorMsg', { text: NOT_ENOUGH_WORDS_MSG });
    }
    this.systemMessage(NOT_ENOUGH_WORDS_MSG);
    this.clearTimers();
    this.phaseTimer = setTimeout(() => {
      if (this.phase === 'choosing') this.nextTurnOrEnd();
    }, 3000);
  }

  pickAutoWordForFreeMode() {
    try {
      return pickWords(1, this.usedWords)[0];
    } catch (e) {
      if (e.code === 'NOT_ENOUGH_WORDS') return null;
      throw e;
    }
  }

  sendDefaultWordChoices(drawer) {
    try {
      this.wordChoices = pickWords(WORD_CHOICES, this.usedWords);
      if (drawer && drawer.socketId) {
        this.io.to(drawer.socketId).emit('chooseWord', {
          words: this.wordChoices,
          duration: CHOOSE_DURATION,
        });
      }
      return true;
    } catch (e) {
      if (e.code === 'NOT_ENOUGH_WORDS') {
        this.handleWordPoolExhausted(drawer);
        return false;
      }
      throw e;
    }
  }

  scheduleChooseTimeout() {
    this.phaseTimer = setTimeout(() => {
      if (this.phase !== 'choosing') return;
      let auto;
      if (this.settings.mode === 'default') {
        if (!this.wordChoices.length) return;
        auto = this.wordChoices[Math.floor(Math.random() * this.wordChoices.length)];
      } else {
        auto = this.pickAutoWordForFreeMode();
        if (!auto) {
          const drawer = this.getPlayerById(this.currentDrawerId);
          this.handleWordPoolExhausted(drawer);
          return;
        }
      }
      this.setWord(this.currentDrawerId, auto, true);
    }, CHOOSE_DURATION * 1000);
  }

  beginTurn(drawer) {
    this.phase = 'choosing';
    this.roundNumber += 1;
    this.currentDrawerId = drawer.playerId;
    this.word = null;
    this.correctGuessers = new Set();
    this.roundGains = {};
    this.resetDrawing();

    this.io.to(this.code).emit('clearCanvas');
    this.broadcastPlayers();

    this.io.to(this.code).emit('choosingWord', {
      drawerId: drawer.playerId,
      drawerName: drawer.name,
      round: this.roundNumber,
      totalRounds: this.totalRounds,
      mode: this.settings.mode,
      roundTime: this.settings.roundTime,
      duration: CHOOSE_DURATION,
    });

    if (drawer.socketId) {
      if (this.settings.mode === 'default') {
        if (!this.sendDefaultWordChoices(drawer)) return;
      } else {
        this.wordChoices = [];
        this.io.to(drawer.socketId).emit('enterWord', { duration: CHOOSE_DURATION });
      }
    }

    if (this.phase === 'choosing') this.scheduleChooseTimeout();
  }

  setWord(byPlayerId, word) {
    if (this.phase !== 'choosing') return;
    if (byPlayerId !== this.currentDrawerId) return;
    if (this.drawerWaiting) return;

    let w = String(word || '').trim();
    if (this.settings.mode === 'default') {
      if (this.wordChoices.indexOf(w) === -1) return;
    } else {
      w = w.slice(0, 30);
      if (!w) return;
      if (this.isWordUsed(w)) {
        const drawer = this.getPlayerById(this.currentDrawerId);
        if (drawer && drawer.socketId) {
          this.io.to(drawer.socketId).emit('errorMsg', { text: WORD_ALREADY_USED_MSG });
        }
        return;
      }
    }

    this.clearTimers();
    this.word = w;
    this.markWordUsed(w);
    this.phase = 'drawing';
    this.roundEndAt = Date.now() + this.settings.roundTime * 1000;

    const drawer = this.getPlayerById(this.currentDrawerId);

    this.io.to(this.code).emit('roundStart', {
      drawerId: this.currentDrawerId,
      drawerName: drawer ? drawer.name : '',
      round: this.roundNumber,
      totalRounds: this.totalRounds,
      wordLength: w.length,
      duration: this.settings.roundTime,
      mode: this.settings.mode,
      roundTime: this.settings.roundTime,
    });
    if (drawer && drawer.socketId) {
      this.io.to(drawer.socketId).emit('yourWord', { word: w });
    }
    this.systemMessage(`${drawer ? drawer.name : 'Player'} is drawing. Start guessing!`);
    this.startTick();
  }

  startTick() {
    if (this.drawerWaiting) return;
    this.emitTimer();
    this.tickTimer = setInterval(() => {
      if (this.drawerWaiting) return;
      const timeLeft = this.timeLeft();
      this.emitTimer();
      if (timeLeft <= 0) this.endRound();
    }, 1000);
  }

  timeLeft() {
    return Math.max(0, Math.ceil((this.roundEndAt - Date.now()) / 1000));
  }

  emitTimer() {
    const timeLeft = this.drawerWaiting ? this.pausedTimeLeft : this.timeLeft();
    this.io.to(this.code).emit('timer', { timeLeft, paused: this.drawerWaiting });
  }

  handleGuess(socketId, text) {
    const player = this.getPlayerBySocket(socketId);
    if (!player || !player.connected) return;
    const raw = String(text || '').trim().slice(0, 60);
    if (!raw) return;

    if (this.phase === 'drawing' && player.playerId === this.currentDrawerId) return;
    if (this.drawerWaiting) {
      this.io.to(this.code).emit('chat', { name: player.name, text: raw });
      return;
    }

    if (this.phase !== 'drawing' || this.correctGuessers.has(player.playerId)) {
      this.io.to(this.code).emit('chat', { name: player.name, text: raw });
      return;
    }

    if (normalize(raw) === normalize(this.word)) {
      this.registerCorrectGuess(player);
    } else {
      this.io.to(this.code).emit('chat', { name: player.name, text: raw });
    }
  }

  registerCorrectGuess(player) {
    this.correctGuessers.add(player.playerId);

    const timeLeftMs = Math.max(0, this.roundEndAt - Date.now());
    const points = computeGuesserPoints(timeLeftMs, this.settings.roundTime);

    player.score += points;
    this.roundGains[player.playerId] = (this.roundGains[player.playerId] || 0) + points;

    this.io.to(this.code).emit('correctGuess', {
      id: player.playerId,
      name: player.name,
      points,
    });

    const drawer = this.getPlayerById(this.currentDrawerId);
    if (drawer) {
      drawer.score += DRAWER_BONUS_PER_GUESSER;
      this.roundGains[drawer.playerId] = (this.roundGains[drawer.playerId] || 0) + DRAWER_BONUS_PER_GUESSER;
      this.systemMessage(`Drawer earned +${DRAWER_BONUS_PER_GUESSER} because ${player.name} guessed correctly.`);
    }

    this.broadcastPlayers();

    const guessers = this.activePlayers().filter((p) => p.playerId !== this.currentDrawerId);
    if (guessers.length > 0 && guessers.every((p) => this.correctGuessers.has(p.playerId))) {
      this.systemMessage('Everyone guessed it!');
      this.endRound();
    }
  }

  handleHint(socketId, text) {
    if (this.phase !== 'drawing' || this.drawerWaiting) return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.playerId !== this.currentDrawerId) return;
    const hint = String(text || '').trim().slice(0, 60);
    if (!hint) return;
    this.io.to(this.code).emit('hint', { text: hint });
  }

  // ---- drawing --------------------------------------------------------

  strokeStart(socketId, style) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId)) return;
    style = style || {};
    const stroke = {
      c: sanitizeColor(style.c) || '#000000',
      w: Math.max(1, Math.min(80, Number(style.w) || 6)),
      o: style.o == null ? 1 : Math.max(0.05, Math.min(1, Number(style.o))),
      erase: !!style.erase,
      pts: [],
    };
    this.currentStroke = stroke;
    this.io.to(this.code).except(socketId).emit('strokeStart', {
      c: stroke.c, w: stroke.w, o: stroke.o, erase: stroke.erase,
    });
  }

  drawPoint(socketId, pt) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId) || !this.currentStroke) return;
    if (!pt || typeof pt !== 'object') return;
    const p = { x: clamp01(pt.x), y: clamp01(pt.y) };
    this.currentStroke.pts.push(p);
    this.io.to(this.code).except(socketId).emit('drawPoint', p);
  }

  strokeEnd(socketId) {
    if (!this.isDrawerActive(socketId) || !this.currentStroke) return;
    if (this.currentStroke.pts.length) {
      this.strokes.push(this.currentStroke);
      this.redo = [];
    }
    this.currentStroke = null;
    this.io.to(this.code).except(socketId).emit('strokeEnd');
  }

  floodFill(socketId, op) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId)) return;
    if (!op || typeof op !== 'object') return;
    const c = sanitizeColor(op.c);
    if (!c) return;
    const fill = {
      flood: true,
      x: clamp01(op.x),
      y: clamp01(op.y),
      c,
      o: op.o == null ? 1 : Math.max(0.05, Math.min(1, Number(op.o))),
    };
    this.strokes.push(fill);
    this.redo = [];
    this.io.to(this.code).except(socketId).emit('floodFill', {
      x: fill.x, y: fill.y, c: fill.c, o: fill.o,
    });
  }

  setBgMode(socketId, mode) {
    if (!this.isDrawerActive(socketId)) return;
    if (['normal', 'inverted', 'sepia', 'dim'].indexOf(mode) === -1) return;
    this.bgMode = mode;
    this.io.to(this.code).emit('bgMode', { mode });
  }

  undo(socketId) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId)) return;
    if (!this.strokes.length) return;
    this.redo.push(this.strokes.pop());
    this.io.to(this.code).emit('drawHistory', { strokes: this.strokes });
  }

  redoStroke(socketId) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId)) return;
    if (!this.redo.length) return;
    this.strokes.push(this.redo.pop());
    this.io.to(this.code).emit('drawHistory', { strokes: this.strokes });
  }

  clearCanvas(socketId) {
    if (this.phase !== 'drawing' || !this.isDrawerActive(socketId)) return;
    this.resetDrawing();
    this.io.to(this.code).except(socketId).emit('clearCanvas');
  }

  sendDrawHistory(socketId) {
    if (this.phase === 'drawing' || this.phase === 'choosing') {
      this.io.to(socketId).emit('drawHistory', { strokes: this.strokes });
      this.io.to(socketId).emit('bgMode', { mode: this.bgMode });
    }
  }

  // ---- round / game end ----------------------------------------------

  endRound(opts) {
    if (this.phase === 'roundend' || this.phase === 'gameend') return;
    opts = opts || {};
    this.clearTimers();
    this.clearWaitTimers();
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.phase = 'roundend';

    this.broadcastPlayers();
    this.broadcastDrawerWait();
    this.io.to(this.code).emit('roundEnd', {
      word: this.word,
      gains: this.roundGains,
      players: this.serializePlayers(),
      nextIn: ROUNDEND_DURATION,
      skipped: !!opts.skipNoBonus,
    });

    this.phaseTimer = setTimeout(() => {
      this.nextTurnOrEnd();
    }, ROUNDEND_DURATION * 1000);
  }

  endGame() {
    this.clearTimers();
    this.clearWaitTimers();
    this.drawerWaiting = false;
    this.canSkipDrawer = false;
    this.phase = 'gameend';
    this.currentDrawerId = null;
    this.word = null;

    const ranking = this.players
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        id: p.playerId,
        name: p.name,
        score: p.score,
      }));

    this.io.to(this.code).emit('gameEnd', { ranking });
    this.broadcastPlayers();
    this.broadcastDrawerWait();
  }

  clearTimers() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }
}

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  createRoom() {
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const room = new Room(this.io, code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').trim().toUpperCase()) || null;
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      room.clearTimers();
      room.clearWaitTimers();
    }
    this.rooms.delete(code);
  }
}

module.exports = { GameManager, Room, ROUND_TIME_OPTIONS, MIN_PLAYERS, makePlayerId };
