/* global DG */
'use strict';

(function () {
  if (!window.DG) return;

  var socket = DG.socket;
  var $ = DG.$;
  var state = DG.state;

  // Narrator name shown for system messages during the showcase.
  var NARRATOR = 'system755';

  // Full-screen drawing focus: hide chat/player panels, maximize the canvas.
  function setDrawFocus(on) {
    var screen = $('screen-game');
    if (screen) screen.classList.toggle('tel-focus-draw', !!on);
  }

  var tel = {
    active: false,
    phase: null,
    wordPicked: false,
    currentItemKey: null,
    currentItemCreator: null,
    currentVoteChainId: null,
    submittedDraw: false,
    submittedGuess: false,
    ratedItems: {},
    votedChains: {},
    playerOrder: [],
    playerNames: {},
  };

  function playerName(id) {
    if (tel.playerNames[id]) return tel.playerNames[id];
    var p = state.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : 'Player';
  }

  function cacheOrderNames(orderNames) {
    if (!orderNames || !orderNames.length) return;
    tel.playerOrder = orderNames.map(function (o) { return o.id; });
    orderNames.forEach(function (o) { tel.playerNames[o.id] = o.name; });
  }

  // Export the current canvas as a white-background PNG at a sane resolution.
  // Drawing from the canvas bitmap (not the CSS-filtered view) means the export
  // always preserves the real strokes as drawn, regardless of the View mode.
  function exportCanvasImage() {
    try {
      var src = DG.canvas;
      var sizeInfo = DG.getCssSize();
      var w = sizeInfo.w || src.width;
      var h = sizeInfo.h || src.height;
      if (!w || !h) return null;
      var maxW = 720;
      var scale = w > maxW ? maxW / w : 1;
      var off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(w * scale));
      off.height = Math.max(1, Math.round(h * scale));
      var octx = off.getContext('2d');
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, off.width, off.height);
      octx.drawImage(src, 0, 0, off.width, off.height);
      return off.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function clearLocalCanvas() {
    DG.setHistory([]);
    DG.fillWhite();
    DG.renderAll();
  }

  // ---- Transfer order (Previous — Me — Next) ----
  function transferHtml(transfer) {
    if (!transfer) return '';
    var prev = transfer.prev && transfer.prev.original
      ? 'Original Word'
      : (transfer.prev && transfer.prev.name ? DG.escapeHtml(transfer.prev.name) : '?');
    var next = transfer.next && transfer.next.last
      ? 'Final Answer'
      : (transfer.next && transfer.next.name ? DG.escapeHtml(transfer.next.name) : '?');
    return prev + ' \u2014 <span class="tel-me">Me</span> \u2014 ' + next;
  }

  function renderHeaderTransfer(transfer) {
    var el = $('tel-transfer');
    if (!el) return;
    if (!transfer) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = transferHtml(transfer);
  }

  function setOverlayTransfer(id, transfer) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = transfer ? transferHtml(transfer) : '';
  }

  // ---- Full player passing order (below the chat input) ----
  function renderPlayerOrder() {
    var el = $('tel-player-order');
    if (!el) return;
    var order = tel.playerOrder || [];
    if (!tel.active || order.length === 0) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    var connected = {};
    state.players.forEach(function (p) { connected[p.id] = p.connected; });
    var myIdx = order.indexOf(state.me);
    var n = order.length;
    var parts = order.map(function (id, i) {
      var isMe = id === state.me;
      var isAdj = myIdx >= 0 && (i === (myIdx + 1) % n || i === (myIdx - 1 + n) % n);
      // Offline if we know they are disconnected, or they dropped out of the
      // roster entirely (never mark "Me" as offline).
      var known = Object.prototype.hasOwnProperty.call(connected, id);
      var isOffline = isMe ? false : (!known || connected[id] === false);
      var label = isMe ? 'Me' : DG.escapeHtml(playerName(id));
      if (isOffline) label += ' (Disconnected)';
      var cls = isMe ? 'tel-po-me' : (isAdj ? 'tel-po-adj' : '');
      if (isOffline) cls += ' tel-po-off';
      return '<span class="' + cls + '">' + label + '</span>';
    });
    el.classList.remove('hidden');
    el.innerHTML = 'Passing order: ' + parts.join(' <span class="tel-po-arrow">\u2192</span> ');
  }

  // ---- Showcase layout helpers (full page inside the game screen) ----
  function enterShowcaseLayout() {
    setDrawFocus(false);
    var cw = $('canvas-wrap');
    if (cw) cw.classList.add('hidden');
    $('toolbar').classList.add('hidden');
    var sBtn = $('btn-tel-submit-draw');
    if (sBtn) sBtn.classList.add('hidden');
    $('tel-showcase-panel').classList.remove('hidden');
    renderHeaderTransfer(null);
    $('word-display').textContent = '';
  }

  function exitShowcaseLayout() {
    var cw = $('canvas-wrap');
    if (cw) cw.classList.remove('hidden');
    $('tel-showcase-panel').classList.add('hidden');
  }

  // ---- Drawing / guessing UI ----
  function showDrawUI(prompt, duration, transfer) {
    tel.active = true;
    state.telLocalDraw = true;
    state.telPhase = 'drawing';
    DG.hideAllOverlays();
    exitShowcaseLayout();
    DG.enterGameScreen();
    $('chip-mode').textContent = 'Telephone';
    $('chip-round').textContent = 'Drawing';
    $('chip-drawer').textContent = 'Draw: ' + prompt;
    $('word-display').textContent = prompt;
    $('hint-display').textContent = '';
    $('canvas-status').textContent = '';
    renderHeaderTransfer(transfer);
    $('toolbar').classList.remove('hidden');
    DG.setupToolbarVisibility();
    DG.setMode('pen');
    DG.applyBgMode('normal');
    clearLocalCanvas();
    DG.renderTimer(duration || 60);
    DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    tel.submittedDraw = false;
    setDrawFocus(true);
    var submitBtn = $('btn-tel-submit-draw');
    if (submitBtn) {
      submitBtn.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Drawing';
    }
    renderPlayerOrder();
  }

  function showGuessUI(imageData, duration, transfer) {
    tel.active = true;
    state.telLocalDraw = false;
    state.telPhase = 'guessing';
    setDrawFocus(false);
    exitShowcaseLayout();
    $('toolbar').classList.add('hidden');
    var sBtn = $('btn-tel-submit-draw');
    if (sBtn) sBtn.classList.add('hidden');
    $('word-display').textContent = '';
    $('chip-round').textContent = 'Guessing';
    $('chip-drawer').textContent = 'Guess the drawing';
    renderHeaderTransfer(transfer);
    DG.renderTimer(duration || 20);
    DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    var img = $('tel-guess-image');
    if (imageData) {
      img.src = imageData;
      img.classList.remove('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
    }
    setOverlayTransfer('tel-guess-transfer', transfer);
    $('tel-guess-input').value = '';
    DG.showOverlay('overlay-tel-guess');
    tel.submittedGuess = false;
    $('btn-tel-submit-guess').disabled = false;
    renderPlayerOrder();
  }

  // Submit the current canvas. Manual (Submit button) enables early advance;
  // auto (timer end) captures whatever is on the canvas. After submitting, the
  // canvas is locked for this player until the next stage.
  function submitDrawing(auto) {
    if (tel.submittedDraw) return;
    tel.submittedDraw = true;
    state.telLocalDraw = false; // lock the canvas for this player
    var submitBtn = $('btn-tel-submit-draw');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitted';
    }
    $('canvas-status').textContent = auto
      ? 'Time up \u2014 drawing submitted.'
      : 'Drawing submitted. Waiting for other players...';
    socket.emit('telephoneSubmitDrawing', {
      strokes: DG.getHistory().slice(),
      imageData: exportCanvasImage(),
    });
  }

  function submitGuess() {
    if (tel.submittedGuess) return;
    var text = $('tel-guess-input').value.trim();
    if (!text) return;
    tel.submittedGuess = true;
    $('btn-tel-submit-guess').disabled = true;
    socket.emit('telephoneSubmitGuess', { text: text });
    DG.hideOverlay('overlay-tel-guess');
    $('canvas-status').textContent = 'Guess submitted. Waiting for other players...';
  }

  // ---- Showcase feed (chat-style, one message at a time) ----
  function appendShowcaseBubble(opts) {
    var feed = $('tel-showcase-feed');
    var div = document.createElement('div');
    div.className = 'tel-bubble' + (opts.cls ? ' ' + opts.cls : '');
    var html = '';
    if (opts.author) html += '<span class="tel-bubble-author">' + DG.escapeHtml(opts.author) + '</span>';
    html += opts.html || '';
    div.innerHTML = html;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    return div;
  }

  // Two compact reaction buttons: Flower (+10) and Poop (-10). One vote only,
  // and never on your own item.
  function buildReactionButtons(bubble, itemKey, creatorId) {
    if (creatorId === state.me) return;
    var wrap = document.createElement('div');
    wrap.className = 'tel-reactions';
    if (tel.ratedItems[itemKey]) {
      wrap.innerHTML = '<span class="tel-rate-done">Reaction sent</span>';
      bubble.appendChild(wrap);
      return;
    }
    [
      { key: 'flower', label: '\uD83C\uDF38 +10' },
      { key: 'poop', label: '\uD83D\uDCA9 -10' },
    ].forEach(function (r) {
      var b = document.createElement('button');
      b.className = 'tel-reaction-btn ' + r.key;
      b.textContent = r.label;
      b.addEventListener('click', function () {
        if (tel.ratedItems[itemKey]) return;
        socket.emit('telephoneRateItem', { itemKey: itemKey, reaction: r.key });
        tel.ratedItems[itemKey] = true;
        var kids = wrap.querySelectorAll('.tel-reaction-btn');
        for (var k = 0; k < kids.length; k += 1) kids[k].disabled = true;
        b.classList.add('selected');
      });
      wrap.appendChild(b);
    });
    bubble.appendChild(wrap);
  }

  // ---- Socket handlers ----
  socket.on('telephoneGameStarted', function (data) {
    tel.active = true;
    state.gameType = 'telephone';
    tel.ratedItems = {};
    tel.votedChains = {};
    if (data) cacheOrderNames(data.orderNames);
    DG.hideAllOverlays();
    exitShowcaseLayout();
    DG.enterGameScreen();
    $('chip-mode').textContent = 'Telephone';
    DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    renderPlayerOrder();
  });

  function showWordOptions(data) {
    tel.phase = 'wordSelect';
    state.telPhase = 'wordSelect';
    tel.wordPicked = !!data.wordPicked;
    setDrawFocus(false);
    exitShowcaseLayout();
    var box = $('tel-choose-words');
    box.innerHTML = '';
    (data.words || []).forEach(function (w) {
      var b = document.createElement('button');
      b.textContent = w;
      if (tel.wordPicked) b.disabled = true;
      b.addEventListener('click', function () {
        if (tel.wordPicked) return;
        socket.emit('telephoneChooseWord', { word: w });
        tel.wordPicked = true;
        var kids = box.children;
        for (var i = 0; i < kids.length; i += 1) kids[i].disabled = true;
        b.classList.add('selected');
        $('tel-word-wait').textContent = 'Word selected. Waiting for other players...';
      });
      box.appendChild(b);
    });
    setOverlayTransfer('tel-word-transfer', data.transfer);
    $('tel-word-wait').textContent = tel.wordPicked ? 'Word selected. Waiting for other players...' : '';
    $('tel-word-timer').textContent = 'Choose within ' + (data.duration || 10) + 's, or one is chosen for you.';
    DG.showOverlay('overlay-tel-words');
    DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    renderPlayerOrder();
  }

  socket.on('telephoneWordOptions', function (data) {
    showWordOptions(data);
  });

  socket.on('telephoneDrawPrompt', function (data) {
    DG.hideOverlay('overlay-tel-words');
    showDrawUI(data.promptWord, data.duration, data.transfer);
  });

  socket.on('telephoneGuessPrompt', function (data) {
    DG.hideOverlay('overlay-tel-words');
    showGuessUI(data.imageData, data.duration, data.transfer);
  });

  function renderStageProgress(progress) {
    var el = $('tel-stage-progress');
    var text = progress && tel.active
      ? progress.label + ': ' + progress.done + ' / ' + progress.total
      : '';
    if (el) {
      el.classList.toggle('hidden', !text);
      el.textContent = text;
    }
    var wp = $('tel-word-progress');
    if (wp) wp.textContent = tel.phase === 'wordSelect' ? text : '';
    var gp = $('tel-guess-progress');
    if (gp) gp.textContent = tel.phase === 'guessing' ? text : '';
  }

  socket.on('telephoneStageUpdate', function (data) {
    tel.phase = data.phase;
    state.telPhase = data.phase;
    if (data.orderNames) cacheOrderNames(data.orderNames);
    var activeStage = data.phase === 'wordSelect' || data.phase === 'drawing' || data.phase === 'guessing';
    if (data.chatDisabled) DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    else DG.setChatDisabled(false);
    if (data.timeLeft != null) DG.renderTimer(data.timeLeft);
    renderStageProgress(data.progress);

    // The server auto-fills missing actions when the timer ends, but it cannot
    // read a player's local canvas. Push the current canvas / typed guess just
    // before the server times out so real work is not lost as a blank.
    if (data.phase === 'drawing' && data.timeLeft != null && data.timeLeft <= 2 &&
        state.telLocalDraw && !tel.submittedDraw) {
      submitDrawing(true);
    }
    if (data.phase === 'guessing' && data.timeLeft != null && data.timeLeft <= 1 &&
        !tel.submittedGuess) {
      var t = $('tel-guess-input').value.trim();
      if (t) submitGuess();
    }
    if (!activeStage) renderHeaderTransfer(null);
  });

  socket.on('telephoneShowcaseStart', function () {
    tel.phase = 'showcase';
    state.telLocalDraw = false;
    state.telPhase = 'showcase';
    DG.hideOverlay('overlay-tel-guess');
    DG.hideOverlay('overlay-tel-words');
    DG.enterGameScreen();
    enterShowcaseLayout();
    $('tel-showcase-feed').innerHTML = '';
    $('tel-rating-panel').classList.add('hidden');
    $('tel-vote-panel').classList.add('hidden');
    $('tel-vote-result').textContent = '';
    $('tel-showcase-progress').textContent = 'Get ready...';
    $('chip-round').textContent = 'Showcase';
    DG.setChatDisabled(false);
    appendShowcaseBubble({
      cls: 'system',
      author: NARRATOR,
      html: 'Let\u2019s reveal every chain, one message at a time. Chat is open \u2014 react as you watch!',
    });
    renderPlayerOrder();
  });

  socket.on('telephoneShowcaseItem', function (data) {
    var item = data.item;
    tel.currentItemKey = data.itemKey;
    tel.currentItemCreator = item.playerId;
    $('tel-vote-panel').classList.add('hidden');
    $('tel-rating-panel').classList.add('hidden');
    $('tel-showcase-progress').textContent = 'Chain ' + (data.chainIndex + 1) + ' / ' + data.totalChains;

    if (item.kind === 'original') {
      // Suspense reveal: announce first, then show the big word after 3s.
      appendShowcaseBubble({
        cls: 'system',
        author: NARRATOR,
        html: '<strong>' + DG.escapeHtml(playerName(item.playerId)) +
          '</strong>\u2019s original word is...',
      });
      (function (word) {
        setTimeout(function () {
          if (tel.currentItemKey !== data.itemKey) return;
          appendShowcaseBubble({
            cls: 'reveal',
            html: '<div class="tel-reveal-word">' + DG.escapeHtml(word) + '</div>',
          });
        }, 3000);
      })(item.text);
    } else if (item.kind === 'draw') {
      var imgHtml = item.imageData
        ? '<img class="tel-bubble-img" src="' + item.imageData + '" alt="Drawing"/>'
        : '<em>(blank drawing)</em>';
      var bubble = appendShowcaseBubble({
        author: playerName(item.playerId),
        html: 'I drew it like this:<br/>' + imgHtml,
      });
      buildReactionButtons(bubble, data.itemKey, item.playerId);
    } else if (item.kind === 'guess') {
      // Suspense reveal: "<Player> guessed..." then the big word after 3s.
      appendShowcaseBubble({
        author: playerName(item.playerId),
        html: 'guessed...',
      });
      (function (word, key, creator) {
        setTimeout(function () {
          if (tel.currentItemKey !== key) return;
          var revealBubble = appendShowcaseBubble({
            cls: 'reveal',
            html: '<div class="tel-reveal-word">' + DG.escapeHtml(word) + '</div>',
          });
          buildReactionButtons(revealBubble, key, creator);
        }, 3000);
      })(item.text, data.itemKey, item.playerId);
    }
  });

  socket.on('telephoneChainVote', function (data) {
    tel.currentVoteChainId = data.chainId;
    $('tel-rating-panel').classList.add('hidden');
    $('tel-vote-panel').classList.remove('hidden');
    $('tel-vote-result').textContent = '';
    $('tel-vote-question').textContent = 'Did the final guess match the original word?';
    appendShowcaseBubble({
      cls: 'system',
      author: NARRATOR,
      html: 'Chain complete! Original word: <em>' + DG.escapeHtml(data.originalWord) +
        '</em> \u2192 Final guess: <em>' + DG.escapeHtml(data.finalGuess || '?') +
        '</em>. Vote Yes or No below.',
    });
    tel.votedChains[data.chainId] = false;
    $('btn-tel-vote-yes').disabled = false;
    $('btn-tel-vote-no').disabled = false;
    if (data.duration) DG.renderTimer(data.duration);
  });

  socket.on('telephoneRatingUpdate', function () {
    // Progress counters are refreshed via telephoneStageUpdate ticks.
  });

  socket.on('telephoneChainVoteResult', function (data) {
    $('tel-vote-panel').classList.add('hidden');
    var submitted = data.submittedCount != null ? data.submittedCount : data.total;
    var html = '<strong>' + (data.success ? 'Chain succeeded!' : 'Chain failed.') + '</strong><br/>' +
      'Original: <em>' + DG.escapeHtml(data.originalWord) + '</em> | Final: <em>' +
      DG.escapeHtml(data.finalGuess || '?') + '</em><br/>Yes votes: ' + data.yesCount + ' / ' +
      submitted + ' submitted (' + data.yesPercent + '%)';
    if (data.success) html += '<br/>+10 bonus to everyone in this chain';
    appendShowcaseBubble({ cls: 'result', author: NARRATOR, html: html });
    $('tel-vote-result').textContent = data.success ? 'Chain successful!' : 'Chain failed.';
  });

  socket.on('telephoneFinalResults', function (data) {
    tel.phase = 'final';
    state.phase = 'gameend';
    setDrawFocus(false);
    exitShowcaseLayout();
    var table = $('tel-final-table');
    table.innerHTML = '';
    var header = document.createElement('div');
    header.className = 'tel-final-row tel-final-header';
    header.innerHTML = '<span>Player</span><span>Reaction</span><span>Bonus</span><span>Total</span>';
    table.appendChild(header);
    (data.ranking || []).forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'tel-final-row' + (i === 0 ? ' top1' : '');
      row.innerHTML = '<span>' + (i + 1) + '. ' + DG.escapeHtml(r.name) +
        (r.id === state.me ? ' (you)' : '') + '</span>' +
        '<span>' + r.reaction + '</span>' +
        '<span>' + r.bonus + '</span><span><strong>' + r.total + '</strong></span>';
      table.appendChild(row);
    });
    $('btn-tel-back-room').classList.toggle('hidden', !DG.amHost());
    $('tel-final-wait').classList.toggle('hidden', DG.amHost());
    DG.showOverlay('overlay-tel-final');
    DG.setChatDisabled(false);
  });

  // ---- UI events ----
  var submitDrawBtn = $('btn-tel-submit-draw');
  if (submitDrawBtn) {
    submitDrawBtn.addEventListener('click', function () { submitDrawing(false); });
  }

  $('btn-tel-submit-guess').addEventListener('click', submitGuess);
  $('tel-guess-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitGuess();
  });

  $('btn-tel-vote-yes').addEventListener('click', function () {
    if (!tel.currentVoteChainId) return;
    socket.emit('telephoneVoteSuccess', { chainId: tel.currentVoteChainId, yes: true });
    $('btn-tel-vote-yes').disabled = true;
    $('btn-tel-vote-no').disabled = true;
    $('tel-vote-result').textContent = 'You voted Yes. Waiting for other players...';
  });
  $('btn-tel-vote-no').addEventListener('click', function () {
    if (!tel.currentVoteChainId) return;
    socket.emit('telephoneVoteSuccess', { chainId: tel.currentVoteChainId, yes: false });
    $('btn-tel-vote-yes').disabled = true;
    $('btn-tel-vote-no').disabled = true;
    $('tel-vote-result').textContent = 'You voted No. Waiting for other players...';
  });

  $('btn-tel-back-room').addEventListener('click', function () {
    if (DG.amHost()) socket.emit('returnToLobby');
  });
  $('btn-tel-leave').addEventListener('click', function () {
    socket.emit('leaveRoom');
    DG.hideAllOverlays();
    exitShowcaseLayout();
    DG.showScreen('home');
  });

  socket.on('returnToLobby', function () {
    tel.active = false;
    tel.phase = null;
    tel.ratedItems = {};
    tel.votedChains = {};
    tel.playerOrder = [];
    state.gameType = 'drawguess';
    state.telLocalDraw = false;
    state.telPhase = null;
    setDrawFocus(false);
    exitShowcaseLayout();
    renderHeaderTransfer(null);
    renderPlayerOrder();
    DG.hideOverlay('overlay-tel-final');
  });

  // Keep the passing-order list fresh as players disconnect / reconnect.
  socket.on('players', function () {
    if (tel.active) renderPlayerOrder();
  });

  socket.on('stateSync', function (data) {
    if (data.gameType !== 'telephone') return;
    tel.active = true;
    state.gameType = 'telephone';
    if (data.orderNames) cacheOrderNames(data.orderNames);
    else if (data.playerOrder) tel.playerOrder = data.playerOrder;
    DG.enterGameScreen();
    if (data.telephonePhase === 'wordSelect' && data.wordOptions) {
      showWordOptions({
        words: data.wordOptions,
        duration: data.timeLeft || 10,
        wordPicked: data.wordPicked,
        transfer: data.transfer,
      });
    }
    if (data.telephonePhase === 'drawing' && data.drawPrompt) {
      showDrawUI(data.drawPrompt, data.timeLeft, data.transfer);
    }
    if (data.telephonePhase === 'guessing') {
      showGuessUI(data.guessImage, data.timeLeft, data.transfer);
    }
    if (data.telephonePhase === 'showcase' || data.telephonePhase === 'chainVote') {
      enterShowcaseLayout();
      DG.setChatDisabled(false);
    }
    renderStageProgress(data.progress);
    renderPlayerOrder();
  });
})();
