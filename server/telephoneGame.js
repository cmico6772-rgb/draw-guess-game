'use strict';

const { pickWords, normalizeWordKey } = require('./words');

const MIN_PLAYERS = 4;
const WORD_SELECT_DURATION = 10;
const DRAW_DURATION = 60;
const GUESS_DURATION = 20;
const SHOWCASE_ORIGINAL_WAIT = 5;
const SHOWCASE_DRAW_WAIT = 15;
const SHOWCASE_GUESS_WAIT = 10;
const CHAIN_VOTE_DURATION = 15;
const CHAIN_SUCCESS_BONUS = 10;
const SUCCESS_THRESHOLD = 0.6; // strictly greater than 60%

/**
 * Build step plan for a chain with n players. The chain always alternates
 * draw -> guess -> draw -> guess ... and MUST end on a guess.
 *
 * For even n the natural last step is already a guess. For odd n the natural
 * last step is a draw, so we append ONE extra guessing step whose actor wraps
 * back to the first player in the chain order (playerOffset === n maps to the
 * origin, since (originIdx + n) % n === originIdx).
 */
function buildChainPlan(n) {
  const steps = [];
  for (let i = 0; i < n; i += 1) {
    steps.push({ type: i % 2 === 0 ? 'draw' : 'guess', playerOffset: i });
  }
  if (steps.length && steps[steps.length - 1].type === 'draw') {
    steps.push({ type: 'guess', playerOffset: n });
  }
  return steps;
}

function playerAt(order, originIdx, offset) {
  const n = order.length;
  return order[(originIdx + offset) % n];
}

class TelephoneGame {
  constructor(room) {
    this.room = room;
    this.phase = 'wordSelect';
    this.playerOrder = [];
    this.stepIndex = 0;
    this.chainPlan = [];
    this.chains = [];
    this.usedWords = new Set();
    this.wordChoices = {};
    this.wordPicked = {};
    this.timerEndsAt = 0;
    this.tickTimer = null;
    this.phaseTimer = null;
    this.submissions = {};
    this.showcaseChainIdx = 0;
    this.showcaseItemIdx = 0;
    this.showcaseRatings = {};
    this.currentRateCreator = null;
    this.currentShowcaseItemKey = null;
    this.currentShowcaseItem = null;
    this.currentShowcaseChain = null;
    this.currentVoteChainId = null;
    this.successVotes = {};
    this.scores = {};
    this._stageLock = false;
  }

  get io() { return this.room.io; }
  get code() { return this.room.code; }

  // Host-selected drawing time for Drawing Telephone (1/3/5 minutes).
  get drawDuration() {
    const t = this.room.settings && Number(this.room.settings.telDrawTime);
    return [60, 180, 300].indexOf(t) !== -1 ? t : DRAW_DURATION;
  }

  // Players still connected (they are the ones expected to rate / vote).
  getConnectedPlayers() {
    return this.playerOrder.filter((pid) => {
      const p = this.room.getPlayerById(pid);
      return p && p.connected;
    });
  }

  playerName(id) {
    const p = this.room.getPlayerById(id);
    return p ? p.name : 'Player';
  }

  initScores() {
    this.scores = {};
    this.playerOrder.forEach((id) => {
      this.scores[id] = { reaction: 0, bonus: 0, total: 0 };
    });
  }

  // Eligible raters exclude the item's creator AND any disconnected player,
  // so the showcase can advance as soon as everyone still present has reacted.
  getEligibleRaters() {
    return this.playerOrder.filter((pid) => {
      if (pid === this.currentRateCreator) return false;
      const p = this.room.getPlayerById(pid);
      return p && p.connected;
    });
  }

  // Transfer order for the chain a player is currently working on:
  // { prev: {original}|{name}, next: {last}|{name} }
  getTransferInfo(playerId) {
    const assign = this.getAssignment(playerId);
    if (!assign) return null;
    const originIdx = assign.originIdx;
    const info = {};
    if (this.stepIndex <= 0) {
      info.prev = { original: true };
    } else {
      const prevId = playerAt(this.playerOrder, originIdx, this.stepIndex - 1);
      info.prev = { name: this.playerName(prevId) };
    }
    if (this.stepIndex + 1 < this.chainPlan.length) {
      const nextId = playerAt(this.playerOrder, originIdx, this.stepIndex + 1);
      info.next = { name: this.playerName(nextId) };
    } else {
      info.next = { last: true };
    }
    return info;
  }

  // Word-selection transfer: the player owns the chain, then draws it,
  // and the next player in order will receive that drawing.
  getWordSelectTransfer(playerId) {
    const idx = this.playerOrder.indexOf(playerId);
    if (idx === -1) return null;
    const n = this.playerOrder.length;
    const nextId = this.playerOrder[(idx + 1) % n];
    return { prev: { original: true }, next: { name: this.playerName(nextId) } };
  }

  getStageProgress() {
    const total = this.playerOrder.length;
    if (this.phase === 'wordSelect') {
      const done = this.playerOrder.filter((pid) => this.wordPicked[pid]).length;
      return { label: 'Players ready', done, total };
    }
    if (this.phase === 'drawing') {
      const done = this.playerOrder.filter((pid) => this.submissions[pid]).length;
      return { label: 'Drawings submitted', done, total };
    }
    if (this.phase === 'guessing') {
      const done = this.playerOrder.filter((pid) => this.submissions[pid]).length;
      return { label: 'Guesses submitted', done, total };
    }
    if (this.phase === 'showcase' && this.currentShowcaseItem && this.currentShowcaseItem.rateable) {
      const eligible = this.getEligibleRaters();
      const ratings = this.showcaseRatings[this.currentShowcaseItemKey] || {};
      const done = eligible.filter((pid) => ratings[pid] != null).length;
      return { label: 'Ratings submitted', done, total: eligible.length };
    }
    if (this.phase === 'chainVote' && this.currentVoteChainId) {
      const votes = this.successVotes[this.currentVoteChainId] || {};
      const done = Object.keys(votes).length;
      return { label: 'Votes submitted', done, total: this.getConnectedPlayers().length };
    }
    return null;
  }

  scheduleStageTimeout(fn, seconds) {
    this.phaseTimer = setTimeout(fn, seconds * 1000);
  }

  start() {
    const active = this.room.activePlayers();
    if (active.length < MIN_PLAYERS) return false;

    this.playerOrder = active.map((p) => p.playerId);
    const n = this.playerOrder.length;
    this.chainPlan = buildChainPlan(n);
    this.initScores();
    this.chains = this.playerOrder.map((originId) => ({
      chainId: 'chain-' + originId,
      originalPlayerId: originId,
      originalWord: null,
      steps: [],
      finalGuess: null,
      successVotes: {},
      success: false,
      participants: new Set([originId]),
    }));

    this.room.phase = 'tel_wordselect';
    this.room.clearTimers();
    // Emit game-started FIRST so the client finishes its screen setup
    // (which hides overlays) before word options open their overlay.
    this.io.to(this.code).emit('telephoneGameStarted', {
      playerOrder: this.playerOrder,
      orderNames: this.playerOrder.map((id) => ({ id, name: this.playerName(id) })),
      settings: {
        wordSelectTime: WORD_SELECT_DURATION,
        drawTime: this.drawDuration,
        guessTime: GUESS_DURATION,
      },
    });
    this.beginWordSelect();
    return true;
  }

  beginWordSelect() {
    this._stageLock = false;
    this.phase = 'wordSelect';
    this.room.phase = 'tel_wordselect';
    this.wordPicked = {};
    this.submissions = {};
    this.timerEndsAt = Date.now() + WORD_SELECT_DURATION * 1000;

    const category = this.room.settings && this.room.settings.category;
    this.playerOrder.forEach((pid) => {
      try {
        const words = pickWords(3, this.usedWords, category);
        this.wordChoices[pid] = words;
        words.forEach((w) => this.usedWords.add(normalizeWordKey(w)));
      } catch (e) {
        this.wordChoices[pid] = pickWords(3, new Set(), category);
      }
      const p = this.room.getPlayerById(pid);
      if (p && p.socketId) {
        this.io.to(p.socketId).emit('telephoneWordOptions', {
          words: this.wordChoices[pid],
          duration: WORD_SELECT_DURATION,
          transfer: this.getWordSelectTransfer(pid),
        });
      }
    });

    this.broadcastStage();
    this.startTick();
    this.scheduleStageTimeout(() => this.timeoutWordSelect(), WORD_SELECT_DURATION);
  }

  timeoutWordSelect() {
    if (this.phase !== 'wordSelect' || this._stageLock) return;
    this.playerOrder.forEach((pid) => {
      if (!this.wordPicked[pid] && this.wordChoices[pid]?.length) {
        this.confirmWord(pid, this.wordChoices[pid][0]);
      }
    });
    this.finishWordSelect();
  }

  chooseWord(playerId, word) {
    if (this.phase !== 'wordSelect' || this._stageLock) return;
    const choices = this.wordChoices[playerId];
    if (!choices || choices.indexOf(word) === -1) return;
    this.confirmWord(playerId, word);
    this.broadcastStage();
    if (this.playerOrder.every((pid) => this.wordPicked[pid])) {
      this.finishWordSelect();
    }
  }

  confirmWord(playerId, word) {
    if (this.wordPicked[playerId]) return;
    this.wordPicked[playerId] = word;
    const chain = this.chains.find((c) => c.originalPlayerId === playerId);
    if (chain) chain.originalWord = word;
  }

  finishWordSelect() {
    if (this._stageLock || this.phase !== 'wordSelect') return;
    if (!this.playerOrder.every((pid) => this.wordPicked[pid])) return;
    this._stageLock = true;
    this.clearTimers();
    this.stepIndex = 0;
    this.beginStep();
  }

  getAssignment(playerId) {
    const n = this.playerOrder.length;
    for (let originIdx = 0; originIdx < n; originIdx += 1) {
      const step = this.chainPlan[this.stepIndex];
      if (!step) return null;
      const actor = playerAt(this.playerOrder, originIdx, step.playerOffset);
      if (actor === playerId) {
        return { chain: this.chains[originIdx], step, originIdx };
      }
    }
    return null;
  }

  getPromptForDraw(chain) {
    if (this.stepIndex === 0) return chain.originalWord;
    const prev = chain.steps[this.stepIndex - 1];
    if (prev && prev.type === 'guess') return prev.guessText;
    if (prev && prev.type === 'draw') return prev.promptWord;
    return chain.originalWord;
  }

  getDrawingForGuess(chain) {
    for (let i = this.stepIndex - 1; i >= 0; i -= 1) {
      const st = chain.steps[i];
      if (st && st.type === 'draw') return st;
    }
    return null;
  }

  beginStep() {
    this._stageLock = false;
    this.submissions = {};
    const step = this.chainPlan[this.stepIndex];
    if (!step) {
      this.beginShowcase();
      return;
    }

    if (step.type === 'draw') {
      this.phase = 'drawing';
      this.room.phase = 'tel_drawing';
      this.timerEndsAt = Date.now() + this.drawDuration * 1000;
    } else {
      this.phase = 'guessing';
      this.room.phase = 'tel_guessing';
      this.timerEndsAt = Date.now() + GUESS_DURATION * 1000;
    }

    this.playerOrder.forEach((pid) => {
      const assign = this.getAssignment(pid);
      const p = this.room.getPlayerById(pid);
      if (!p || !p.socketId || !assign) return;

      if (assign.step.type === 'draw') {
        this.io.to(p.socketId).emit('telephoneDrawPrompt', {
          promptWord: this.getPromptForDraw(assign.chain),
          duration: this.drawDuration,
          stepIndex: this.stepIndex,
          transfer: this.getTransferInfo(pid),
        });
      } else {
        const drawStep = this.getDrawingForGuess(assign.chain);
        this.io.to(p.socketId).emit('telephoneGuessPrompt', {
          imageData: drawStep ? drawStep.imageData : null,
          previousPromptWord: drawStep ? drawStep.promptWord : assign.chain.originalWord,
          duration: GUESS_DURATION,
          stepIndex: this.stepIndex,
          transfer: this.getTransferInfo(pid),
        });
      }
    });

    this.broadcastStage();
    this.startTick();
    const dur = step.type === 'draw' ? this.drawDuration : GUESS_DURATION;
    this.scheduleStageTimeout(() => this.timeoutStep(), dur);
  }

  submitDrawing(playerId, data, isAuto) {
    if (this.phase !== 'drawing' || this._stageLock) return;
    if (this.submissions[playerId] && !isAuto) return;
    const assign = this.getAssignment(playerId);
    if (!assign || assign.step.type !== 'draw') return;

    const strokes = data && data.strokes ? data.strokes : [];
    const imageData = data && data.imageData ? data.imageData : null;

    assign.chain.steps[this.stepIndex] = {
      type: 'draw',
      playerId,
      promptWord: this.getPromptForDraw(assign.chain),
      strokes,
      imageData,
      ratings: {},
    };
    assign.chain.participants.add(playerId);
    this.submissions[playerId] = true;
    this.broadcastStage();
    this.tryFinishStep();
  }

  submitGuess(playerId, text, isAuto) {
    if (this.phase !== 'guessing' || this._stageLock) return;
    if (this.submissions[playerId] && !isAuto) return;
    const assign = this.getAssignment(playerId);
    if (!assign || assign.step.type !== 'guess') return;

    const drawStep = this.getDrawingForGuess(assign.chain);
    const fallback = drawStep ? drawStep.promptWord : assign.chain.originalWord;
    const guessText = String(text || '').trim().slice(0, 60) || fallback;

    assign.chain.steps[this.stepIndex] = {
      type: 'guess',
      playerId,
      previousPromptWord: drawStep ? drawStep.promptWord : assign.chain.originalWord,
      guessText,
      ratings: {},
    };
    assign.chain.participants.add(playerId);
    this.submissions[playerId] = true;
    this.broadcastStage();
    this.tryFinishStep();
  }

  allStepSubmissionsComplete() {
    return this.playerOrder.every((pid) => {
      const a = this.getAssignment(pid);
      return !a || this.submissions[pid];
    });
  }

  tryFinishStep() {
    if (!this.allStepSubmissionsComplete()) return;
    this.finishStep();
  }

  timeoutStep() {
    if (this._stageLock || (this.phase !== 'drawing' && this.phase !== 'guessing')) return;
    this.playerOrder.forEach((pid) => {
      if (this.submissions[pid]) return;
      const assign = this.getAssignment(pid);
      if (!assign) return;
      if (assign.step.type === 'draw') {
        this.submitDrawing(pid, { strokes: [], imageData: null }, true);
      } else {
        const drawStep = this.getDrawingForGuess(assign.chain);
        const fallback = drawStep ? drawStep.promptWord : assign.chain.originalWord;
        this.submitGuess(pid, fallback, true);
      }
    });
    this.finishStep();
  }

  finishStep() {
    if (this._stageLock) return;
    if (!this.allStepSubmissionsComplete()) return;
    this._stageLock = true;
    this.clearTimers();

    const step = this.chainPlan[this.stepIndex];
    if (step && step.type === 'guess') {
      this.chains.forEach((chain) => {
        const st = chain.steps[this.stepIndex];
        if (st && st.type === 'guess') chain.finalGuess = st.guessText;
      });
    }

    this.stepIndex += 1;
    if (this.stepIndex >= this.chainPlan.length) {
      this.beginShowcase();
    } else {
      this.beginStep();
    }
  }

  beginShowcase() {
    this._stageLock = false;
    this.phase = 'showcase';
    this.room.phase = 'tel_showcase';
    this.showcaseChainIdx = 0;
    this.showcaseItemIdx = 0;
    this.showcaseRatings = {};
    this.io.to(this.code).emit('telephoneShowcaseStart', { chatEnabled: true });
    this.showNextShowcaseItem();
  }

  getShowcaseItems(chain) {
    const items = [{
      kind: 'original',
      playerId: chain.originalPlayerId,
      text: chain.originalWord,
      wait: SHOWCASE_ORIGINAL_WAIT,
      rateable: false,
    }];
    chain.steps.forEach((st, idx) => {
      if (st.type === 'draw') {
        items.push({
          kind: 'draw',
          stepIndex: idx,
          playerId: st.playerId,
          imageData: st.imageData,
          promptWord: st.promptWord,
          wait: SHOWCASE_DRAW_WAIT,
          rateable: true,
        });
      } else {
        items.push({
          kind: 'guess',
          stepIndex: idx,
          playerId: st.playerId,
          text: st.guessText,
          wait: SHOWCASE_GUESS_WAIT,
          rateable: true,
        });
      }
    });
    return items;
  }

  showNextShowcaseItem() {
    if (this.showcaseChainIdx >= this.chains.length) {
      this.beginFinal();
      return;
    }

    const chain = this.chains[this.showcaseChainIdx];
    const items = this.getShowcaseItems(chain);

    if (this.showcaseItemIdx >= items.length) {
      this.beginChainVote(chain);
      return;
    }

    const item = items[this.showcaseItemIdx];
    const itemKey = chain.chainId + '-' + this.showcaseItemIdx;
    this.showcaseRatings[itemKey] = {};
    this.currentRateCreator = item.rateable ? item.playerId : null;
    this.currentShowcaseItemKey = itemKey;
    this.currentShowcaseItem = item;
    this.currentShowcaseChain = chain;
    this._stageLock = false;
    this.timerEndsAt = Date.now() + item.wait * 1000;

    this.io.to(this.code).emit('telephoneShowcaseItem', {
      chainIndex: this.showcaseChainIdx,
      chainId: chain.chainId,
      itemIndex: this.showcaseItemIdx,
      totalChains: this.chains.length,
      originalPlayerName: this.playerName(chain.originalPlayerId),
      item,
      itemKey,
    });

    this.broadcastStage();
    this.startTick();
    this.scheduleStageTimeout(() => this.timeoutShowcaseItem(), item.wait);
  }

  allRatingsComplete() {
    if (!this.currentShowcaseItem || !this.currentShowcaseItem.rateable) return false;
    const eligible = this.getEligibleRaters();
    const ratings = this.showcaseRatings[this.currentShowcaseItemKey] || {};
    return eligible.every((pid) => ratings[pid] != null);
  }

  timeoutShowcaseItem() {
    if (this._stageLock) return;
    this.advanceShowcaseItem();
  }

  advanceShowcaseItem() {
    if (this._stageLock) return;
    this._stageLock = true;
    this.clearTimers();

    if (this.currentShowcaseChain && this.currentShowcaseItem && this.currentShowcaseItemKey) {
      this.finalizeItemRatings(
        this.currentShowcaseChain,
        this.currentShowcaseItem,
        this.currentShowcaseItemKey,
      );
    }

    this.showcaseItemIdx += 1;
    this.currentShowcaseItemKey = null;
    this.currentShowcaseItem = null;
    this.currentRateCreator = null;
    this.showNextShowcaseItem();
  }

  finalizeItemRatings(chain, item, itemKey) {
    if (!item.rateable) return;
    const ratings = this.showcaseRatings[itemKey] || {};
    const st = chain.steps[item.stepIndex];
    if (!st) return;
    // Flower = +10, Poop = -10. Missing ratings are simply skipped.
    Object.keys(ratings).forEach((raterId) => {
      if (st.playerId === raterId) return;
      if (!this.scores[st.playerId]) return;
      this.scores[st.playerId].reaction += ratings[raterId];
    });
    st.ratings = Object.assign({}, ratings);
  }

  rateItem(playerId, itemKey, reaction) {
    if (this.phase !== 'showcase' || this._stageLock) return;
    if (playerId === this.currentRateCreator) return;
    if (itemKey !== this.currentShowcaseItemKey) return;
    if (reaction !== 'flower' && reaction !== 'poop') return;
    const value = reaction === 'flower' ? 10 : -10;
    if (!this.showcaseRatings[itemKey]) this.showcaseRatings[itemKey] = {};
    if (this.showcaseRatings[itemKey][playerId] != null) return;
    this.showcaseRatings[itemKey][playerId] = value;
    this.io.to(this.code).emit('telephoneRatingUpdate', {
      itemKey, playerId, reaction, value,
    });
    this.broadcastStage();
    if (this.allRatingsComplete()) this.advanceShowcaseItem();
  }

  beginChainVote(chain) {
    this._stageLock = false;
    this.phase = 'chainVote';
    this.currentVoteChainId = chain.chainId;
    this.successVotes[chain.chainId] = {};
    this.timerEndsAt = Date.now() + CHAIN_VOTE_DURATION * 1000;

    this.io.to(this.code).emit('telephoneChainVote', {
      chainIndex: this.showcaseChainIdx,
      chainId: chain.chainId,
      originalWord: chain.originalWord,
      finalGuess: chain.finalGuess,
      originalPlayerName: this.playerName(chain.originalPlayerId),
      duration: CHAIN_VOTE_DURATION,
    });

    this.broadcastStage();
    this.startTick();
    this.scheduleStageTimeout(() => this.timeoutChainVote(chain), CHAIN_VOTE_DURATION);
  }

  voteChainSuccess(playerId, chainId, yes) {
    if (this.phase !== 'chainVote' || this._stageLock) return;
    if (chainId !== this.currentVoteChainId) return;
    if (!this.successVotes[chainId]) this.successVotes[chainId] = {};
    if (this.successVotes[chainId][playerId] !== undefined) return;
    this.successVotes[chainId][playerId] = !!yes;
    this.broadcastStage();
    // Advance as soon as every still-connected player has voted.
    if (Object.keys(this.successVotes[chainId]).length >= this.getConnectedPlayers().length) {
      this.finishChainVote(chainId);
    }
  }

  timeoutChainVote(chain) {
    if (this.phase !== 'chainVote' || this._stageLock) return;
    if (!chain) return;
    this.finishChainVote(chain.chainId);
  }

  finishChainVote(chainId) {
    if (this._stageLock) return;
    this._stageLock = true;
    this.clearTimers();

    const chain = this.chains.find((c) => c.chainId === chainId);
    if (!chain) {
      this._stageLock = false;
      return;
    }

    const votes = this.successVotes[chainId] || {};
    const submittedIds = Object.keys(votes);
    const yesCount = submittedIds.filter((pid) => votes[pid]).length;
    const submittedCount = submittedIds.length;
    const pct = submittedCount > 0 ? yesCount / submittedCount : 0;
    chain.success = pct > SUCCESS_THRESHOLD;
    chain.successVotes = votes;

    if (chain.success) {
      chain.participants.forEach((pid) => {
        if (this.scores[pid]) this.scores[pid].bonus += CHAIN_SUCCESS_BONUS;
      });
    }

    this.io.to(this.code).emit('telephoneChainVoteResult', {
      chainId: chain.chainId,
      originalWord: chain.originalWord,
      finalGuess: chain.finalGuess,
      yesCount,
      submittedCount,
      totalPlayers: this.playerOrder.length,
      yesPercent: Math.round(pct * 100),
      success: chain.success,
      bonus: chain.success ? CHAIN_SUCCESS_BONUS : 0,
    });

    this.showcaseChainIdx += 1;
    this.showcaseItemIdx = 0;
    this.currentVoteChainId = null;
    this.phase = 'showcase';
    this._stageLock = false;
    // NOTE: scheduleStageTimeout takes SECONDS. Pass 4 (not 4000) so the next
    // chain begins ~4s after the result instead of ~66 minutes later.
    this.scheduleStageTimeout(() => this.showNextShowcaseItem(), 4);
  }

  beginFinal() {
    this.phase = 'final';
    this.room.phase = 'gameend';
    this.clearTimers();

    Object.keys(this.scores).forEach((pid) => {
      const s = this.scores[pid];
      s.total = s.reaction + s.bonus;
    });

    const ranking = this.playerOrder
      .map((id) => ({
        id,
        name: this.playerName(id),
        reaction: this.scores[id].reaction,
        bonus: this.scores[id].bonus,
        total: this.scores[id].total,
      }))
      .sort((a, b) => b.total - a.total)
      .map((r, i) => Object.assign({ rank: i + 1 }, r));

    this.io.to(this.code).emit('telephoneFinalResults', { ranking, gameType: 'telephone' });
  }

  returnToLobby() {
    this.clearTimers();
    this.room.telephone = null;
    this.room.resetGameSession();
    this.room.phase = 'lobby';
    this.io.to(this.code).emit('clearCanvas');
    this.room.broadcastPlayers();
    this.room.broadcastSettings();
    this.io.to(this.code).emit('returnToLobby', {
      settings: this.room.settings,
      players: this.room.serializePlayers(),
    });
  }

  buildStateSync(forPlayer) {
    const base = {
      gameType: 'telephone',
      telephonePhase: this.phase,
      stepIndex: this.stepIndex,
      timeLeft: Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000)),
      playerOrder: this.playerOrder,
      orderNames: this.playerOrder.map((id) => ({ id, name: this.playerName(id) })),
      progress: this.getStageProgress(),
    };

    if (this.phase === 'wordSelect' && forPlayer) {
      base.wordOptions = this.wordChoices[forPlayer.playerId];
      base.wordPicked = !!this.wordPicked[forPlayer.playerId];
      base.transfer = this.getWordSelectTransfer(forPlayer.playerId);
    }
    if (this.phase === 'drawing' && forPlayer) {
      const assign = this.getAssignment(forPlayer.playerId);
      if (assign && assign.step.type === 'draw') {
        base.drawPrompt = this.getPromptForDraw(assign.chain);
        base.transfer = this.getTransferInfo(forPlayer.playerId);
      }
    }
    if (this.phase === 'guessing' && forPlayer) {
      const assign = this.getAssignment(forPlayer.playerId);
      if (assign && assign.step.type === 'guess') {
        const drawStep = this.getDrawingForGuess(assign.chain);
        base.guessImage = drawStep ? drawStep.imageData : null;
        base.previousPromptWord = drawStep ? drawStep.promptWord : assign.chain.originalWord;
        base.transfer = this.getTransferInfo(forPlayer.playerId);
      }
    }
    if (this.phase === 'showcase' || this.phase === 'chainVote') {
      base.showcaseChainIdx = this.showcaseChainIdx;
      base.showcaseItemIdx = this.showcaseItemIdx;
    }
    return base;
  }

  broadcastStage() {
    this.io.to(this.code).emit('telephoneStageUpdate', {
      phase: this.phase,
      stepIndex: this.stepIndex,
      totalSteps: this.chainPlan.length,
      timeLeft: Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000)),
      chatDisabled: this.phase === 'wordSelect' || this.phase === 'drawing' || this.phase === 'guessing',
      progress: this.getStageProgress(),
    });
  }

  startTick() {
    this.broadcastStage();
    this.tickTimer = setInterval(() => {
      this.broadcastStage();
    }, 1000);
  }

  clearTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  clearTimers() {
    this.clearTick();
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  handleDisconnect() {
    // Game continues; synchronized timeout handles missing players.
  }

  destroy() {
    this.clearTimers();
  }
}

module.exports = {
  TelephoneGame,
  MIN_PLAYERS,
  buildChainPlan,
  WORD_SELECT_DURATION,
  DRAW_DURATION,
  GUESS_DURATION,
};
