/* global DG */
'use strict';

(function () {
  if (!window.DG) return;

  var socket = DG.socket;
  var $ = DG.$;
  var state = DG.state;

  var tel = {
    active: false,
    phase: null,
    wordPicked: false,
    currentItemKey: null,
    currentItemCreator: null,
    submittedDraw: false,
    submittedGuess: false,
    ratedItems: {},
    votedChains: {},
  };

  function playerName(id) {
    var p = state.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : 'Player';
  }

  function exportCanvasImage() {
    try {
      return DG.canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function clearLocalCanvas() {
    DG.setHistory([]);
    DG.fillWhite();
    DG.renderAll();
  }

  function showDrawUI(prompt, duration) {
    tel.active = true;
    state.telLocalDraw = true;
    state.telPhase = 'drawing';
    DG.hideAllOverlays();
    DG.enterGameScreen();
    $('chip-mode').textContent = 'Telephone';
    $('chip-round').textContent = 'Drawing';
    $('chip-drawer').textContent = 'Draw: ' + prompt;
    $('word-display').textContent = prompt;
    $('hint-display').textContent = '';
    $('canvas-status').textContent = '';
    $('toolbar').classList.remove('hidden');
    DG.setupToolbarVisibility();
    DG.setMode('pen');
    clearLocalCanvas();
    DG.renderTimer(duration || 60);
    DG.setChatDisabled(true);
    tel.submittedDraw = false;
  }

  function showGuessUI(imageData, duration) {
    tel.active = true;
    state.telLocalDraw = false;
    state.telPhase = 'guessing';
    $('toolbar').classList.add('hidden');
    $('word-display').textContent = '';
    $('chip-round').textContent = 'Guessing';
    $('chip-drawer').textContent = 'Guess the drawing';
    DG.renderTimer(duration || 20);
    DG.setChatDisabled(true);
    var img = $('tel-guess-image');
    if (imageData) {
      img.src = imageData;
      img.classList.remove('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
    }
    $('tel-guess-input').value = '';
    DG.showOverlay('overlay-tel-guess');
    tel.submittedGuess = false;
  }

  function submitDrawing() {
    if (tel.submittedDraw) return;
    tel.submittedDraw = true;
    state.telLocalDraw = false;
    $('toolbar').classList.add('hidden');
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
    socket.emit('telephoneSubmitGuess', { text: text });
    DG.hideOverlay('overlay-tel-guess');
  }

  function appendShowcaseBubble(html) {
    var feed = $('tel-showcase-feed');
    var div = document.createElement('div');
    div.className = 'tel-bubble';
    div.innerHTML = html;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function buildRateButtons(itemKey, creatorId) {
    var panel = $('tel-rating-panel');
    var box = $('tel-rate-btns');
    box.innerHTML = '';
    if (creatorId === state.me || tel.ratedItems[itemKey]) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    for (var i = 1; i <= 10; i += 1) {
      (function (score) {
        var b = document.createElement('button');
        b.className = 'btn tel-rate-btn';
        b.textContent = String(score);
        b.addEventListener('click', function () {
          socket.emit('telephoneRateItem', { itemKey: itemKey, score: score });
          tel.ratedItems[itemKey] = true;
          panel.classList.add('hidden');
        });
        box.appendChild(b);
      })(i);
    }
  }

  // ---- Socket handlers ----

  socket.on('telephoneGameStarted', function () {
    tel.active = true;
    state.gameType = 'telephone';
    DG.hideAllOverlays();
    DG.enterGameScreen();
    $('chip-mode').textContent = 'Telephone';
    DG.setChatDisabled(true);
  });

  function showWordOptions(data) {
    tel.phase = 'wordSelect';
    state.telPhase = 'wordSelect';
    tel.wordPicked = false;
    var box = $('tel-choose-words');
    box.innerHTML = '';
    (data.words || []).forEach(function (w) {
      var b = document.createElement('button');
      b.textContent = w;
      b.addEventListener('click', function () {
        socket.emit('telephoneChooseWord', { word: w });
        tel.wordPicked = true;
        var kids = box.children;
        for (var i = 0; i < kids.length; i += 1) kids[i].disabled = true;
        b.classList.add('selected');
        $('tel-word-wait').textContent = 'Waiting for other players...';
      });
      box.appendChild(b);
    });
    $('tel-word-wait').textContent = tel.wordPicked ? 'Waiting for other players...' : '';
    $('tel-word-timer').textContent = 'Choose within ' + (data.duration || 10) + 's';
    DG.showOverlay('overlay-tel-words');
    DG.setChatDisabled(true);
  }

  socket.on('telephoneWordOptions', function (data) {
    showWordOptions(data);
  });

  socket.on('telephoneDrawPrompt', function (data) {
    DG.hideOverlay('overlay-tel-words');
    showDrawUI(data.promptWord, data.duration);
  });

  socket.on('telephoneGuessPrompt', function (data) {
    showGuessUI(data.imageData, data.duration);
  });

  function renderStageProgress(progress) {
    var el = $('tel-stage-progress');
    if (!progress || !tel.active) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.classList.remove('hidden');
    el.textContent = progress.label + ': ' + progress.done + ' / ' + progress.total;
  }

  socket.on('telephoneStageUpdate', function (data) {
    tel.phase = data.phase;
    state.telPhase = data.phase;
    if (data.chatDisabled) DG.setChatDisabled(true, 'Chat is disabled during drawing and guessing.');
    else DG.setChatDisabled(false);
    if (data.timeLeft != null) DG.renderTimer(data.timeLeft);
    renderStageProgress(data.progress);
  });

  socket.on('telephoneShowcaseStart', function () {
    tel.phase = 'showcase';
    state.telLocalDraw = false;
    state.telPhase = 'showcase';
    $('toolbar').classList.add('hidden');
    $('tel-showcase-feed').innerHTML = '';
    $('tel-rating-panel').classList.add('hidden');
    $('tel-vote-panel').classList.add('hidden');
    $('tel-vote-result').textContent = '';
    DG.hideOverlay('overlay-tel-guess');
    DG.hideOverlay('overlay-tel-words');
    DG.showOverlay('overlay-tel-showcase');
    DG.setChatDisabled(false);
    $('chip-round').textContent = 'Showcase';
    $('word-display').textContent = 'Chain showcase — chat enabled';
    renderStageProgress(null);
  });

  socket.on('telephoneShowcaseItem', function (data) {
    var item = data.item;
    tel.currentItemKey = data.itemKey;
    tel.currentItemCreator = item.playerId;
    $('tel-vote-panel').classList.add('hidden');
    $('tel-rating-panel').classList.add('hidden');
    $('tel-showcase-title').textContent = 'Chain ' + (data.chainIndex + 1) + ' of ' + data.totalChains;

    if (item.kind === 'original') {
      appendShowcaseBubble('<strong>' + DG.escapeHtml(playerName(item.playerId)) +
        '</strong> selected the original word: <em>' + DG.escapeHtml(item.text) + '</em>');
    } else if (item.kind === 'draw') {
      var imgHtml = item.imageData
        ? '<img class="tel-bubble-img" src="' + item.imageData + '" alt="Drawing"/>'
        : '<em>(blank drawing)</em>';
      appendShowcaseBubble('<strong>' + DG.escapeHtml(playerName(item.playerId)) +
        '</strong> drew ' + DG.escapeHtml(item.promptWord || '') + ':<br/>' + imgHtml);
      buildRateButtons(data.itemKey, item.playerId);
    } else if (item.kind === 'guess') {
      appendShowcaseBubble('<strong>' + DG.escapeHtml(playerName(item.playerId)) +
        '</strong> guessed: <em>' + DG.escapeHtml(item.text) + '</em>');
      buildRateButtons(data.itemKey, item.playerId);
    }
  });

  socket.on('telephoneChainVote', function (data) {
    tel.currentVoteChainId = data.chainId;
    $('tel-rating-panel').classList.add('hidden');
    $('tel-vote-panel').classList.remove('hidden');
    $('tel-vote-result').textContent = '';
    $('tel-vote-question').textContent = 'Is the final guess similar to the original word?';
    appendShowcaseBubble('<strong>Chain vote:</strong> Original <em>' + DG.escapeHtml(data.originalWord) +
      '</em> → Final guess <em>' + DG.escapeHtml(data.finalGuess || '?') + '</em>');
    tel.votedChains[data.chainId] = false;
    if (data.duration) DG.renderTimer(data.duration);
  });

  socket.on('telephoneRatingUpdate', function () {
    // Progress refreshed via telephoneStageUpdate tick
  });

  socket.on('telephoneChainVoteResult', function (data) {
    $('tel-vote-panel').classList.add('hidden');
    renderStageProgress(null);
    var submitted = data.submittedCount != null ? data.submittedCount : data.total;
    var msg = 'Original: <em>' + DG.escapeHtml(data.originalWord) + '</em> | Final: <em>' +
      DG.escapeHtml(data.finalGuess || '?') + '</em><br/>Yes votes: ' + data.yesCount + '/' + submitted +
      ' submitted (' + data.yesPercent + '%) — <strong>' + (data.success ? 'Success' : 'Failed') + '</strong>';
    if (data.success) msg += ' (+10 bonus to all participants)';
    appendShowcaseBubble(msg);
    $('tel-vote-result').textContent = data.success ? 'Chain successful!' : 'Chain failed.';
  });

  socket.on('telephoneFinalResults', function (data) {
    tel.phase = 'final';
    state.phase = 'gameend';
    DG.hideOverlay('overlay-tel-showcase');
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

  $('btn-tel-submit-guess').addEventListener('click', submitGuess);
  $('tel-guess-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitGuess();
  });

  $('btn-tel-vote-yes').addEventListener('click', function () {
    if (!tel.currentVoteChainId) return;
    socket.emit('telephoneVoteSuccess', { chainId: tel.currentVoteChainId, yes: true });
    $('tel-vote-panel').classList.add('hidden');
  });
  $('btn-tel-vote-no').addEventListener('click', function () {
    if (!tel.currentVoteChainId) return;
    socket.emit('telephoneVoteSuccess', { chainId: tel.currentVoteChainId, yes: false });
    $('tel-vote-panel').classList.add('hidden');
  });

  $('btn-tel-back-room').addEventListener('click', function () {
    if (DG.amHost()) socket.emit('returnToLobby');
  });
  $('btn-tel-leave').addEventListener('click', function () {
    socket.emit('leaveRoom');
    DG.hideAllOverlays();
    DG.showScreen('home');
  });

  socket.on('returnToLobby', function () {
    tel.active = false;
    tel.phase = null;
    state.gameType = 'drawguess';
    state.telLocalDraw = false;
    state.telPhase = null;
    DG.hideOverlay('overlay-tel-final');
  });

  socket.on('stateSync', function (data) {
    if (data.gameType !== 'telephone') return;
    tel.active = true;
    state.gameType = 'telephone';
    DG.enterGameScreen();
    if (data.telephonePhase === 'wordSelect' && data.wordOptions && !data.wordPicked) {
      showWordOptions({ words: data.wordOptions, duration: data.timeLeft || 10 });
    }
    if (data.telephonePhase === 'drawing' && data.drawPrompt) {
      showDrawUI(data.drawPrompt, data.timeLeft);
    }
    if (data.telephonePhase === 'guessing') {
      showGuessUI(data.guessImage, data.timeLeft);
    }
    if (data.telephonePhase === 'showcase') {
      DG.showOverlay('overlay-tel-showcase');
      DG.setChatDisabled(false);
    }
    renderStageProgress(data.progress);
  });
})();
