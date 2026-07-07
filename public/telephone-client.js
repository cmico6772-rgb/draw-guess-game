/* global DG */
'use strict';

(function () {
  if (!window.DG) return;

  var socket = DG.socket;
  var $ = DG.$;
  var state = DG.state;

  // Narrator name shown for system messages during the showcase.
  var NARRATOR = 'Teacher Xiao Zhuang';

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
  };

  function playerName(id) {
    var p = state.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : 'Player';
  }

  // Export the current canvas as a white-background PNG at a sane resolution.
  // Drawing directly from the (possibly high-DPI) canvas onto a fresh sized
  // canvas avoids transparent/blank exports and keeps payloads small.
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

  // ---- Showcase layout helpers (full page inside the game screen) ----
  function enterShowcaseLayout() {
    var cw = $('canvas-wrap');
    if (cw) cw.classList.add('hidden');
    $('toolbar').classList.add('hidden');
    var submit = $('btn-tel-submit-draw');
    if (submit) submit.classList.add('hidden');
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
    var submit = $('btn-tel-submit-draw');
    if (submit) {
      submit.classList.remove('hidden');
      submit.disabled = false;
      submit.textContent = 'Submit Drawing';
    }
  }

  function showGuessUI(imageData, duration, transfer) {
    tel.active = true;
    state.telLocalDraw = false;
    state.telPhase = 'guessing';
    exitShowcaseLayout();
    $('toolbar').classList.add('hidden');
    var submit = $('btn-tel-submit-draw');
    if (submit) submit.classList.add('hidden');
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
  }

  function submitDrawing() {
    if (tel.submittedDraw) return;
    tel.submittedDraw = true;
    state.telLocalDraw = false;
    $('toolbar').classList.add('hidden');
    var submit = $('btn-tel-submit-draw');
    if (submit) submit.classList.add('hidden');
    $('canvas-status').textContent = 'Drawing submitted. Waiting for other players...';
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

  function buildInlineRating(bubble, itemKey, creatorId) {
    if (creatorId === state.me) return;
    var wrap = document.createElement('div');
    wrap.className = 'tel-inline-rating tel-rate-btns';
    if (tel.ratedItems[itemKey]) {
      wrap.innerHTML = '<span class="tel-rate-done">Rated</span>';
      bubble.appendChild(wrap);
      return;
    }
    for (var i = 1; i <= 10; i += 1) {
      (function (score) {
        var b = document.createElement('button');
        b.className = 'tel-rate-btn';
        b.textContent = String(score);
        b.addEventListener('click', function () {
          if (tel.ratedItems[itemKey]) return;
          socket.emit('telephoneRateItem', { itemKey: itemKey, score: score });
          tel.ratedItems[itemKey] = true;
          var kids = wrap.querySelectorAll('.tel-rate-btn');
          for (var k = 0; k < kids.length; k += 1) {
            kids[k].disabled = true;
            kids[k].classList.remove('selected');
          }
          b.classList.add('selected');
        });
        wrap.appendChild(b);
      })(i);
    }
    bubble.appendChild(wrap);
  }

  // ---- Socket handlers ----
  socket.on('telephoneGameStarted', function () {
    tel.active = true;
    state.gameType = 'telephone';
    DG.hideAllOverlays();
    exitShowcaseLayout();
    DG.enterGameScreen();
    $('chip-mode').textContent = 'Telephone';
    DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
  });

  function showWordOptions(data) {
    tel.phase = 'wordSelect';
    state.telPhase = 'wordSelect';
    tel.wordPicked = !!data.wordPicked;
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
    // Mirror progress inside the full-screen overlays that cover the header.
    var wp = $('tel-word-progress');
    if (wp) wp.textContent = tel.phase === 'wordSelect' ? text : '';
    var gp = $('tel-guess-progress');
    if (gp) gp.textContent = tel.phase === 'guessing' ? text : '';
  }

  socket.on('telephoneStageUpdate', function (data) {
    tel.phase = data.phase;
    state.telPhase = data.phase;
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
      submitDrawing();
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
  });

  socket.on('telephoneShowcaseItem', function (data) {
    var item = data.item;
    tel.currentItemKey = data.itemKey;
    tel.currentItemCreator = item.playerId;
    $('tel-vote-panel').classList.add('hidden');
    $('tel-rating-panel').classList.add('hidden');
    $('tel-showcase-progress').textContent = 'Chain ' + (data.chainIndex + 1) + ' / ' + data.totalChains;

    if (item.kind === 'original') {
      appendShowcaseBubble({
        cls: 'system',
        author: NARRATOR,
        html: '<strong>' + DG.escapeHtml(playerName(item.playerId)) +
          '</strong> selected the original word: <em>' + DG.escapeHtml(item.text) + '</em>',
      });
    } else if (item.kind === 'draw') {
      var imgHtml = item.imageData
        ? '<img class="tel-bubble-img" src="' + item.imageData + '" alt="Drawing"/>'
        : '<em>(blank drawing)</em>';
      var bubble = appendShowcaseBubble({
        author: playerName(item.playerId),
        html: 'I drew it like this:<br/>' + imgHtml,
      });
      buildInlineRating(bubble, data.itemKey, item.playerId);
    } else if (item.kind === 'guess') {
      var gBubble = appendShowcaseBubble({
        author: playerName(item.playerId),
        html: 'I guessed: <em>' + DG.escapeHtml(item.text) + '</em>',
      });
      buildInlineRating(gBubble, data.itemKey, item.playerId);
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
    exitShowcaseLayout();
    var table = $('tel-final-table');
    table.innerHTML = '';
    var header = document.createElement('div');
    header.className = 'tel-final-row tel-final-header';
    header.innerHTML = '<span>Player</span><span>Draw</span><span>Guess</span><span>Bonus</span><span>Total</span>';
    table.appendChild(header);
    (data.ranking || []).forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'tel-final-row' + (i === 0 ? ' top1' : '');
      row.innerHTML = '<span>' + (i + 1) + '. ' + DG.escapeHtml(r.name) +
        (r.id === state.me ? ' (you)' : '') + '</span>' +
        '<span>' + r.drawRating + '</span><span>' + r.guessRating + '</span>' +
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
  if (submitDrawBtn) submitDrawBtn.addEventListener('click', submitDrawing);

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
    state.gameType = 'drawguess';
    state.telLocalDraw = false;
    state.telPhase = null;
    exitShowcaseLayout();
    renderHeaderTransfer(null);
    DG.hideOverlay('overlay-tel-final');
  });

  socket.on('stateSync', function (data) {
    if (data.gameType !== 'telephone') return;
    tel.active = true;
    state.gameType = 'telephone';
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
  });
})();
