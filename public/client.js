/* global io */
'use strict';

(function () {
  var socket = io();

  // ---------- State ----------
  var state = {
    me: null,
    roomCode: null,
    hostId: null,
    players: [],
    phase: 'lobby',
    isDrawer: false,
    word: null, // real word (drawer only)
    wordLength: 0,
    round: 0,
    totalRounds: 0,
    drawerName: '',
    mode: 'default',
    roundTime: 180,
    settings: { mode: 'default', roundTime: 180 },
    bgMode: 'normal',
    drawerWaiting: false,
    canSkipDrawer: false,
    waitLeft: 0,
  };

  // Finalized drawing history (synced) + the in-progress stroke.
  var history = [];
  var liveStroke = null;

  // Palette colors.
  var COLORS = [
    '#000000', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047',
    '#1e88e5', '#8e24aa', '#ec407a', '#6d4c41', '#9e9e9e',
  ];
  var tool = { color: '#000000', size: 6, opacity: 1, erasing: false, filling: false };

  var selectedChooseWord = null;

  // ---------- Stable player id + recent rooms (localStorage) ----------
  var LS_PLAYER_ID = 'drawGuessPlayerId';
  var LS_RECENT = 'drawGuessRecentRooms';
  var RECENT_MAX = 5;

  function getPlayerId() {
    try {
      var id = localStorage.getItem(LS_PLAYER_ID);
      if (!id) {
        id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(LS_PLAYER_ID, id);
      }
      return id;
    } catch (e) {
      return 'p_' + Date.now().toString(36);
    }
  }

  function loadRecentRooms() {
    try {
      var raw = localStorage.getItem(LS_RECENT);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecentRoom(roomCode, playerName) {
    try {
      var list = loadRecentRooms().filter(function (r) {
        return r.roomCode !== roomCode;
      });
      list.unshift({
        roomCode: roomCode,
        playerName: playerName,
        joinedAt: Date.now(),
      });
      if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
      localStorage.setItem(LS_RECENT, JSON.stringify(list));
    } catch (e) { /* ignore */ }
    renderRecentRooms();
  }

  function renderRecentRooms() {
    var section = $('recent-section');
    var listEl = $('recent-list');
    var rooms = loadRecentRooms();
    if (!rooms.length) {
      section.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }
    section.classList.remove('hidden');
    listEl.innerHTML = '';
    rooms.forEach(function (r) {
      var li = document.createElement('li');
      var info = document.createElement('div');
      info.className = 'recent-info';
      var code = document.createElement('div');
      code.className = 'recent-code';
      code.textContent = r.roomCode;
      var name = document.createElement('div');
      name.className = 'recent-name';
      name.textContent = r.playerName;
      info.appendChild(code);
      info.appendChild(name);
      var btn = document.createElement('button');
      btn.className = 'btn-rejoin';
      btn.textContent = 'Rejoin';
      btn.addEventListener('click', function () {
        $('input-name').value = r.playerName;
        $('input-code').value = r.roomCode;
        $('home-error').textContent = '';
        socket.emit('joinRoom', { code: r.roomCode, name: r.playerName, playerId: getPlayerId() });
      });
      li.appendChild(info);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  $('btn-clear-recent').addEventListener('click', function () {
    try { localStorage.removeItem(LS_RECENT); } catch (e) { /* ignore */ }
    renderRecentRooms();
  });

  // ---------- Element helpers ----------
  function $(id) { return document.getElementById(id); }

  var screens = {
    home: $('screen-home'),
    lobby: $('screen-lobby'),
    game: $('screen-game'),
  };

  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
  }

  function showOverlay(id) { $(id).classList.remove('hidden'); }
  function hideOverlay(id) { $(id).classList.add('hidden'); }
  function hideAllOverlays() {
    hideOverlay('overlay-choose');
    hideOverlay('overlay-freeword');
    hideOverlay('overlay-roundend');
    hideOverlay('overlay-gameend');
    hideOverlay('overlay-scores');
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function modeLabel(m) { return m === 'free' ? 'Free' : 'Default'; }
  function timeLabel(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  // ---------- Home ----------
  function getName() {
    var n = $('input-name').value.trim();
    return n || 'Player' + Math.floor(Math.random() * 900 + 100);
  }

  $('btn-create').addEventListener('click', function () {
    $('home-error').textContent = '';
    socket.emit('createRoom', { name: getName(), playerId: getPlayerId() });
  });

  $('btn-join').addEventListener('click', function () {
    var code = $('input-code').value.trim().toUpperCase();
    if (code.length < 4) {
      $('home-error').textContent = 'Please enter a 4-letter room code.';
      return;
    }
    $('home-error').textContent = '';
    socket.emit('joinRoom', { code: code, name: getName(), playerId: getPlayerId() });
  });

  // ---------- Lobby ----------
  $('btn-start').addEventListener('click', function () { socket.emit('startGame'); });

  $('btn-leave-lobby').addEventListener('click', function () {
    socket.emit('leaveRoom');
    showScreen('home');
    renderRecentRooms();
  });

  $('room-code').addEventListener('click', function () {
    var code = state.roomCode || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        function () { toast('Room code copied'); },
        function () { toast('Room code: ' + code); }
      );
    } else {
      toast('Room code: ' + code);
    }
  });

  function amHost() { return state.hostId === state.me; }

  // Settings segmented controls.
  var segMode = $('seg-mode');
  var segTime = $('seg-time');
  segMode.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn || !amHost()) return;
    socket.emit('updateSettings', { mode: btn.getAttribute('data-mode') });
  });
  segTime.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn || !amHost()) return;
    socket.emit('updateSettings', { roundTime: Number(btn.getAttribute('data-time')) });
  });

  function renderSettings() {
    var host = amHost();
    var mbtns = segMode.querySelectorAll('.seg-btn');
    for (var i = 0; i < mbtns.length; i += 1) {
      var m = mbtns[i].getAttribute('data-mode');
      mbtns[i].classList.toggle('selected', m === state.settings.mode);
      mbtns[i].disabled = !host;
    }
    var tbtns = segTime.querySelectorAll('.seg-btn');
    for (var j = 0; j < tbtns.length; j += 1) {
      var t = Number(tbtns[j].getAttribute('data-time'));
      tbtns[j].classList.toggle('selected', t === state.settings.roundTime);
      tbtns[j].disabled = !host;
    }
    $('settings-note').textContent = host
      ? 'You are the host. Choose the mode and round time.'
      : 'Only the host can change settings.';
  }

  function renderLobby() {
    $('room-code').textContent = state.roomCode || '----';
    var list = $('lobby-players');
    list.innerHTML = '';
    var host = amHost();
    state.players.forEach(function (p) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = p.name + (p.id === state.me ? ' (you)' : '');
      if (!p.connected) name.textContent += ' (offline)';
      li.appendChild(name);
      if (p.isHost) {
        var b = document.createElement('span');
        b.className = 'badge badge-host';
        b.textContent = 'Host';
        li.appendChild(b);
      }
      if (host && p.id !== state.me && !p.isHost) {
        var rm = document.createElement('button');
        rm.className = 'btn-remove';
        rm.textContent = 'Remove';
        rm.addEventListener('click', function () {
          socket.emit('removePlayer', { playerId: p.id });
        });
        li.appendChild(rm);
      }
      list.appendChild(li);
    });
    $('lobby-count').textContent = state.players.length;

    var host = amHost();
    var startBtn = $('btn-start');
    startBtn.classList.toggle('hidden', !host);
    var enough = state.players.length >= 2;
    startBtn.disabled = !enough;
    $('lobby-note').textContent = host
      ? (enough ? '' : 'Need at least 2 players.')
      : 'Waiting for the host to start...';

    renderSettings();
  }

  // ---------- Scoreboard ----------
  $('btn-scores').addEventListener('click', function () {
    renderScoreboard();
    showOverlay('overlay-scores');
  });
  $('btn-close-scores').addEventListener('click', function () { hideOverlay('overlay-scores'); });

  function renderScoreboard() {
    var board = $('scoreboard');
    board.innerHTML = '';
    var host = amHost();
    var sorted = state.players.slice().sort(function (a, b) { return b.score - a.score; });
    sorted.forEach(function (p) {
      var li = document.createElement('li');
      if (p.isDrawer) li.className = 'is-drawer';
      else if (p.hasGuessed) li.className = 'has-guessed';
      var name = document.createElement('div');
      name.className = 'sb-name';
      var icon = p.isDrawer ? '\u270F\uFE0F' : (p.hasGuessed ? '\u2705' : '');
      var offline = p.connected ? '' : ' (offline)';
      name.innerHTML = '<span>' + icon + '</span><span>' + escapeHtml(p.name) +
        (p.id === state.me ? ' (you)' : '') + offline + '</span>';
      var score = document.createElement('div');
      score.className = 'sb-score';
      score.textContent = p.score + ' pts';
      li.appendChild(name);
      li.appendChild(score);
      if (host && p.id !== state.me && !p.isHost && state.phase !== 'gameend') {
        var rm = document.createElement('button');
        rm.className = 'btn-remove';
        rm.textContent = 'Remove';
        rm.addEventListener('click', function () {
          socket.emit('removePlayer', { playerId: p.id });
        });
        li.appendChild(rm);
      }
      board.appendChild(li);
    });
  }

  // ---------- Chat ----------
  function addChat(opts) {
    var log = $('chat-log');
    var div = document.createElement('div');
    div.className = 'msg' + (opts.cls ? ' ' + opts.cls : '');
    if (opts.who) {
      div.innerHTML = '<span class="who">' + escapeHtml(opts.who) + ':</span> ' + escapeHtml(opts.text);
    } else {
      div.textContent = opts.text;
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  $('chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (state.isDrawer && state.phase === 'drawing') {
      socket.emit('hint', { text: text }); // drawer gives hints
    } else {
      socket.emit('guess', { text: text });
    }
  });

  function updateChatPlaceholder() {
    var input = $('chat-input');
    if (state.isDrawer && state.phase === 'drawing') {
      input.placeholder = 'Give the guessers a hint...';
    } else if (state.phase === 'drawing') {
      input.placeholder = 'Type your guess...';
    } else {
      input.placeholder = 'Chat...';
    }
  }

  // ---------- Header / round info ----------
  function renderChips() {
    $('chip-round').textContent = 'Round ' + state.round + '/' + state.totalRounds;
    $('chip-drawer').textContent = 'Drawer: ' + (state.drawerName || '-');
    $('chip-mode').textContent = modeLabel(state.mode);
    $('chip-time').textContent = timeLabel(state.roundTime);
  }

  function renderWordDisplay() {
    var el = $('word-display');
    // Only the drawer ever sees the word. Guessers get no word, no length,
    // no underscores, no spaces - nothing that hints at the answer.
    if (state.phase === 'drawing' && state.isDrawer && state.word) {
      el.textContent = state.word;
    } else {
      el.textContent = '';
    }
  }

  function renderTimer(timeLeft) {
    var el = $('timer');
    el.textContent = timeLabel(timeLeft);
    el.classList.toggle('urgent', timeLeft <= 15);
  }

  // ================= Canvas =================
  var canvas = $('canvas');
  var ctx = canvas.getContext('2d');
  var cssW = 0;
  var cssH = 0;

  function resizeCanvas() {
    var wrap = canvas.parentElement;
    cssW = wrap.clientWidth;
    cssH = wrap.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderAll();
  }

  function fillWhite() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();
  }

  function setStyle(s) {
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.globalAlpha = s.erase ? 1 : (s.o == null ? 1 : s.o);
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawDot(s, p) {
    ctx.beginPath();
    ctx.arc(p.x * cssW, p.y * cssH, Math.max(0.5, s.w / 2), 0, Math.PI * 2);
    ctx.fill();
  }

  function hexToRgb(hex) {
    hex = String(hex || '#000000').trim();
    if (hex.charAt(0) === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    var n = parseInt(hex, 16);
    if (isNaN(n) || hex.length < 6) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // Bucket / flood fill from a normalized point, operating in device pixels so
  // it is correct on high-DPI screens. Replaying it during renderAll on the
  // same prior pixels is deterministic across all clients.
  function floodFillAt(nx, ny, colorHex, opacity) {
    var w = canvas.width;
    var h = canvas.height;
    if (w <= 0 || h <= 0) return;
    var sx = Math.min(w - 1, Math.max(0, Math.floor(nx * w)));
    var sy = Math.min(h - 1, Math.max(0, Math.floor(ny * h)));
    var img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    var data = img.data;
    var start = (sy * w + sx) * 4;
    var tr = data[start], tg = data[start + 1], tb = data[start + 2], ta = data[start + 3];
    var fc = hexToRgb(colorHex);
    var a = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
    // Tolerance must reach anti-aliased interior pixels near stroke edges (often ~191 on white).
    var tol = 100 * 100 * 3;
    function match(i) {
      var dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb, da = data[i + 3] - ta;
      return (dr * dr + dg * dg + db * db + da * da) <= tol;
    }
    // Pixels that are clearly stroke ink (very dark) must never be filled.
    function isStrokePixel(i) {
      return data[i] + data[i + 1] + data[i + 2] < 120;
    }
    function paintPixel(i) {
      data[i] = Math.round(data[i] * (1 - a) + fc.r * a);
      data[i + 1] = Math.round(data[i + 1] * (1 - a) + fc.g * a);
      data[i + 2] = Math.round(data[i + 2] * (1 - a) + fc.b * a);
      data[i + 3] = Math.max(data[i + 3], Math.round(255 * a));
    }
    var visited = new Uint8Array(w * h);
    var stack = [sx, sy];
    while (stack.length) {
      var y = stack.pop();
      var x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      var p = y * w + x;
      if (visited[p]) continue;
      var i = p * 4;
      if (!match(i) || isStrokePixel(i)) continue;
      visited[p] = 1;
      paintPixel(i);
      stack.push(x + 1, y);
      stack.push(x - 1, y);
      stack.push(x, y + 1);
      stack.push(x, y - 1);
    }
    // Edge expansion: fill anti-aliased ring pixels adjacent to filled area (2 passes).
    for (var pass = 0; pass < 2; pass += 1) {
      for (var py = 0; py < h; py += 1) {
        for (var px = 0; px < w; px += 1) {
          var pp = py * w + px;
          if (visited[pp]) continue;
          var pi = pp * 4;
          if (isStrokePixel(pi)) continue;
          var hasFilledNeighbor =
            (px > 0 && visited[pp - 1]) || (px < w - 1 && visited[pp + 1]) ||
            (py > 0 && visited[pp - w]) || (py < h - 1 && visited[pp + w]);
          if (!hasFilledNeighbor) continue;
          visited[pp] = 1;
          paintPixel(pi);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Full smooth render of one finalized stroke using quadratic midpoints.
  function drawStroke(s) {
    var pts = s.pts;
    if (!pts || !pts.length) return;
    ctx.save();
    setStyle(s);
    if (pts.length === 1) {
      drawDot(s, pts[0]);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x * cssW, pts[0].y * cssH);
    for (var i = 1; i < pts.length - 1; i += 1) {
      var midX = (pts[i].x + pts[i + 1].x) / 2 * cssW;
      var midY = (pts[i].y + pts[i + 1].y) / 2 * cssH;
      ctx.quadraticCurveTo(pts[i].x * cssW, pts[i].y * cssH, midX, midY);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last.x * cssW, last.y * cssH);
    ctx.stroke();
    ctx.restore();
  }

  function renderAll() {
    fillWhite();
    for (var i = 0; i < history.length; i += 1) {
      var op = history[i];
      if (op && op.flood) floodFillAt(op.x, op.y, op.c, op.o);
      else drawStroke(op);
    }
    if (liveStroke) drawStroke(liveStroke);
  }

  // Incremental live rendering (last segment only) for responsiveness.
  function drawLiveSegment(s) {
    var pts = s.pts;
    var n = pts.length;
    ctx.save();
    setStyle(s);
    if (n === 1) {
      drawDot(s, pts[0]);
    } else {
      var a = pts[n - 2];
      var b = pts[n - 1];
      ctx.beginPath();
      ctx.moveTo(a.x * cssW, a.y * cssH);
      ctx.lineTo(b.x * cssW, b.y * cssH);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Drawing input (drawer only) ----
  var drawing = false;

  function canDraw() {
    return state.isDrawer && state.phase === 'drawing' && !state.drawerWaiting;
  }

  function renderDrawerWait() {
    var banner = $('drawer-wait-banner');
    var skipBtn = $('btn-skip-drawer');
    if (!state.drawerWaiting) {
      banner.classList.add('hidden');
      skipBtn.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
    $('drawer-wait-msg').textContent = 'The drawer disconnected. Waiting for them to rejoin...';
    $('drawer-wait-timer').textContent = 'Waiting for drawer: ' + state.waitLeft + 's';
    if (state.canSkipDrawer && amHost()) {
      skipBtn.classList.remove('hidden');
    } else {
      skipBtn.classList.add('hidden');
    }
  }

  function pointFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width;
    var y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function styleFromTool() {
    return { c: tool.color, w: tool.size, o: tool.opacity, erase: tool.erasing };
  }

  function pointerDown(e) {
    if (!canDraw()) return;
    if (e.preventDefault) e.preventDefault();
    // Bucket fill: a single click floods the clicked region, not a stroke.
    if (tool.filling) {
      var pf = pointFromEvent(e);
      var op = { flood: true, x: pf.x, y: pf.y, c: tool.color, o: tool.opacity };
      history.push(op);
      renderAll();
      socket.emit('floodFill', { x: pf.x, y: pf.y, c: tool.color, o: tool.opacity });
      return;
    }
    drawing = true;
    var st = styleFromTool();
    liveStroke = { c: st.c, w: st.w, o: st.o, erase: st.erase, pts: [] };
    socket.emit('strokeStart', st);
    var p = pointFromEvent(e);
    liveStroke.pts.push(p);
    drawLiveSegment(liveStroke);
    socket.emit('drawPoint', p);
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }

  function pointerMove(e) {
    if (!drawing || !canDraw() || !liveStroke) return;
    if (e.preventDefault) e.preventDefault();
    var p = pointFromEvent(e);
    liveStroke.pts.push(p);
    drawLiveSegment(liveStroke);
    socket.emit('drawPoint', p);
  }

  function pointerUp(e) {
    if (!drawing) return;
    if (e && e.preventDefault) e.preventDefault();
    drawing = false;
    if (liveStroke && liveStroke.pts.length) {
      history.push(liveStroke);
    }
    liveStroke = null;
    socket.emit('strokeEnd');
    renderAll(); // clean re-render so opacity looks correct
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerleave', pointerUp);
  } else {
    canvas.addEventListener('touchstart', function (e) { pointerDown(e.touches[0]); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', function (e) { pointerMove(e.touches[0]); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', function (e) { pointerUp(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mousemove', pointerMove);
    canvas.addEventListener('mouseup', pointerUp);
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 200); });

  // ---------- Toolbar ----------
  function updateColorPreview() {
    $('color-preview').style.background = tool.erasing ? '#ffffff' : tool.color;
  }

  // mode: 'pen' | 'eraser' | 'fill'
  function setMode(mode) {
    tool.erasing = mode === 'eraser';
    tool.filling = mode === 'fill';
    $('btn-pen').classList.toggle('active', mode === 'pen');
    $('btn-eraser').classList.toggle('active', mode === 'eraser');
    $('btn-fill').classList.toggle('active', mode === 'fill');
    updateColorPreview();
  }

  $('btn-pen').addEventListener('click', function () { setMode('pen'); });
  $('btn-eraser').addEventListener('click', function () { setMode('eraser'); });
  $('btn-fill').addEventListener('click', function () { setMode('fill'); });

  $('btn-palette').addEventListener('click', function () {
    $('palette').classList.toggle('hidden');
  });

  $('btn-undo').addEventListener('click', function () { if (canDraw()) socket.emit('undo'); });
  $('btn-redo').addEventListener('click', function () { if (canDraw()) socket.emit('redo'); });

  $('btn-clear').addEventListener('click', function () {
    if (!canDraw()) return;
    history = [];
    liveStroke = null;
    renderAll();
    socket.emit('clearCanvas');
  });

  // ---------- Background / view mode (drawer controlled, synced) ----------
  function applyBgMode(mode) {
    state.bgMode = mode;
    var filter = 'none';
    if (mode === 'inverted') filter = 'invert(1)';
    else if (mode === 'sepia') filter = 'sepia(0.85)';
    else if (mode === 'dim') filter = 'brightness(0.55)';
    canvas.style.filter = filter;
    canvas.style.webkitFilter = filter;
    var btns = document.querySelectorAll('.bg-btn');
    for (var i = 0; i < btns.length; i += 1) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-bg') === mode);
    }
  }

  $('bg-modes').addEventListener('click', function (e) {
    var b = e.target.closest('.bg-btn');
    if (!b || !state.isDrawer) return;
    socket.emit('bgMode', { mode: b.getAttribute('data-bg') });
  });

  var sizeSlider = $('size-slider');
  sizeSlider.addEventListener('input', function () {
    tool.size = Number(sizeSlider.value);
    $('size-value').textContent = tool.size;
    var preview = $('size-preview');
    var px = Math.max(4, Math.min(28, tool.size));
    preview.style.width = px + 'px';
    preview.style.height = px + 'px';
  });

  var opacitySlider = $('opacity-slider');
  opacitySlider.addEventListener('input', function () {
    var v = Number(opacitySlider.value);
    tool.opacity = v / 100;
    $('opacity-value').textContent = v;
  });

  function buildSwatches() {
    var box = $('swatches');
    box.innerHTML = '';
    COLORS.forEach(function (c) {
      var sw = document.createElement('div');
      sw.className = 'swatch' + (c === tool.color && !tool.erasing ? ' selected' : '');
      sw.style.background = c;
      if (c === '#ffffff') sw.style.boxShadow = '0 0 0 1.5px #cccccc';
      sw.addEventListener('click', function () {
        tool.color = c;
        if (tool.erasing || tool.filling) setMode('pen');
        $('custom-color').value = c.length === 7 ? c : '#000000';
        updateSwatchSelection();
        updateColorPreview();
      });
      box.appendChild(sw);
    });
  }

  function updateSwatchSelection() {
    var sw = $('swatches').children;
    for (var i = 0; i < sw.length; i += 1) {
      sw[i].classList.toggle('selected', !tool.erasing && COLORS[i] === tool.color);
    }
  }

  $('custom-color').addEventListener('input', function () {
    tool.color = $('custom-color').value;
    if (tool.erasing || tool.filling) setMode('pen');
    updateSwatchSelection();
    updateColorPreview();
  });

  function setupToolbarVisibility() {
    var show = state.isDrawer && !state.drawerWaiting;
    $('toolbar').classList.toggle('hidden', !show);
  }

  $('btn-skip-drawer').addEventListener('click', function () {
    if (amHost() && state.canSkipDrawer) socket.emit('skipDrawerRound');
  });

  // ---------- Enter game ----------
  function enterGameScreen() {
    if (!screens.game.classList.contains('active')) {
      showScreen('game');
      setTimeout(resizeCanvas, 40);
    }
  }

  // ================= Socket events =================
  socket.on('connect', function () {
    // state.me is stable playerId from roomJoined, not socket.id
  });

  socket.on('errorMsg', function (data) {
    if (screens.home.classList.contains('active')) {
      $('home-error').textContent = data.text;
    } else {
      toast(data.text);
    }
  });

  socket.on('removedFromRoom', function (data) {
    socket.emit('leaveRoom');
    hideAllOverlays();
    showScreen('home');
    renderRecentRooms();
    toast(data.text || 'You were removed from the room by the host.');
  });

  socket.on('drawerWait', function (data) {
    state.drawerWaiting = !!data.waiting;
    state.canSkipDrawer = !!data.canSkip;
    state.waitLeft = data.waitLeft || 0;
    renderDrawerWait();
    setupToolbarVisibility();
    if (data.waiting) {
      $('canvas-status').textContent = 'The drawer disconnected. Waiting for them to rejoin...';
    }
  });

  function applyStateSync(data) {
    if (!data) return;
    state.phase = data.phase;
    state.hostId = data.hostId;
    state.players = data.players || [];
    state.round = data.round || 0;
    state.totalRounds = data.totalRounds || 0;
    state.drawerName = data.drawerName || '';
    state.mode = data.mode || state.settings.mode;
    state.roundTime = data.roundTime || state.settings.roundTime;
    state.drawerWaiting = !!data.drawerWaiting;
    state.canSkipDrawer = !!data.canSkipDrawer;
    state.waitLeft = data.waitLeft || 0;
    if (data.settings) state.settings = data.settings;
    if (data.strokes) {
      history = data.strokes.slice();
      liveStroke = null;
      renderAll();
    }
    if (data.bgMode) applyBgMode(data.bgMode);
    if (data.word) state.word = data.word;
    state.isDrawer = data.drawerId === state.me;
    enterGameScreen();
    renderChips();
    renderWordDisplay();
    setupToolbarVisibility();
    renderDrawerWait();
    if (data.timeLeft != null) renderTimer(data.timeLeft);
  }

  socket.on('stateSync', function (data) {
    applyStateSync(data);
    if (data.phase === 'choosing' && state.isDrawer) {
      // Word overlays are re-sent by server on reconnect resume
    }
  });

  socket.on('roomJoined', function (data) {
    state.me = data.you;
    state.roomCode = data.code;
    state.hostId = data.hostId;
    state.phase = data.phase;
    saveRecentRoom(data.code, $('input-name').value.trim() || getName());
    if (data.reconnected && data.phase !== 'lobby' && data.phase !== 'gameend') {
      // stateSync will follow with full game state
      return;
    }
    showScreen('lobby');
    renderLobby();
  });

  socket.on('settings', function (s) {
    if (s && (s.mode === 'default' || s.mode === 'free')) state.settings.mode = s.mode;
    if (s && s.roundTime) state.settings.roundTime = s.roundTime;
    if (screens.lobby.classList.contains('active')) renderSettings();
  });

  socket.on('players', function (data) {
    state.players = data.players;
    var hostP = state.players.filter(function (p) { return p.isHost; })[0];
    if (hostP) state.hostId = hostP.id;
    if (screens.lobby.classList.contains('active')) renderLobby();
    if (screens.game.classList.contains('active')) {
      if (!$('overlay-scores').classList.contains('hidden')) renderScoreboard();
    }
  });

  socket.on('gameStarted', function (data) {
    if (data && data.settings) {
      state.settings = data.settings;
    }
    hideAllOverlays();
    enterGameScreen();
    addChat({ cls: 'system', text: 'Game started!' });
  });

  socket.on('choosingWord', function (data) {
    state.phase = 'choosing';
    state.round = data.round;
    state.totalRounds = data.totalRounds;
    state.drawerName = data.drawerName;
    state.mode = data.mode;
    state.roundTime = data.roundTime;
    state.isDrawer = data.drawerId === state.me;
    state.word = null;
    history = [];
    liveStroke = null;
    hideOverlay('overlay-roundend');
    enterGameScreen();
    renderChips();
    renderTimer(data.roundTime);
    setupToolbarVisibility();
    renderWordDisplay();
    $('hint-display').textContent = '';
    updateChatPlaceholder();
    applyBgMode('normal');
    renderAll();
    renderDrawerWait();

    if (state.isDrawer) {
      $('canvas-status').textContent = '';
    } else {
      $('canvas-status').textContent = data.drawerName + ' is choosing a word...';
      hideOverlay('overlay-choose');
      hideOverlay('overlay-freeword');
    }
  });

  socket.on('chooseWord', function (data) {
    // Default mode: drawer picks 1 of 3.
    selectedChooseWord = null;
    var box = $('choose-words');
    box.innerHTML = '';
    data.words.forEach(function (w) {
      var b = document.createElement('button');
      b.textContent = w;
      b.addEventListener('click', function () {
        selectedChooseWord = w;
        var kids = box.children;
        for (var i = 0; i < kids.length; i += 1) kids[i].classList.remove('selected');
        b.classList.add('selected');
        $('btn-start-drawing').disabled = false;
      });
      box.appendChild(b);
    });
    $('btn-start-drawing').disabled = true;
    $('choose-timer').textContent = 'Pick within ' + data.duration + 's, or one is chosen for you.';
    showOverlay('overlay-choose');
  });

  $('btn-start-drawing').addEventListener('click', function () {
    if (!selectedChooseWord) return;
    socket.emit('chooseWord', { word: selectedChooseWord });
    hideOverlay('overlay-choose');
  });

  socket.on('enterWord', function (data) {
    // Free mode: drawer types their own word.
    var input = $('free-word-input');
    input.value = '';
    $('btn-free-start').disabled = true;
    $('free-timer').textContent = 'Type within ' + data.duration + 's, or a random word is chosen.';
    showOverlay('overlay-freeword');
    setTimeout(function () { try { input.focus(); } catch (e) { /* ignore */ } }, 50);
  });

  $('free-word-input').addEventListener('input', function () {
    $('btn-free-start').disabled = !$('free-word-input').value.trim();
  });
  $('btn-free-start').addEventListener('click', function () {
    var w = $('free-word-input').value.trim();
    if (!w) return;
    socket.emit('chooseWord', { word: w });
    hideOverlay('overlay-freeword');
  });

  socket.on('roundStart', function (data) {
    state.phase = 'drawing';
    state.round = data.round;
    state.totalRounds = data.totalRounds;
    state.wordLength = data.wordLength;
    state.drawerName = data.drawerName;
    state.mode = data.mode;
    state.roundTime = data.roundTime;
    state.isDrawer = data.drawerId === state.me;
    history = [];
    liveStroke = null;
    state.drawerWaiting = false;
    state.canSkipDrawer = false;
    hideAllOverlays();
    enterGameScreen();
    renderAll();
    setupToolbarVisibility();
    renderChips();
    renderWordDisplay();
    $('hint-display').textContent = '';
    updateChatPlaceholder();
    $('canvas-status').textContent = state.isDrawer ? '' : (data.drawerName + ' is drawing');
    renderDrawerWait();
  });

  socket.on('yourWord', function (data) {
    state.word = data.word;
    renderWordDisplay();
  });

  // ---- drawing sync ----
  socket.on('strokeStart', function (style) {
    liveStroke = { c: style.c, w: style.w, o: style.o, erase: style.erase, pts: [] };
  });
  socket.on('drawPoint', function (p) {
    if (!liveStroke) liveStroke = { c: '#000', w: 6, o: 1, erase: false, pts: [] };
    liveStroke.pts.push(p);
    drawLiveSegment(liveStroke);
  });
  socket.on('strokeEnd', function () {
    if (liveStroke && liveStroke.pts.length) history.push(liveStroke);
    liveStroke = null;
    renderAll();
  });
  socket.on('floodFill', function (data) {
    history.push({ flood: true, x: data.x, y: data.y, c: data.c, o: data.o });
    renderAll();
  });
  socket.on('bgMode', function (data) {
    applyBgMode(data && data.mode ? data.mode : 'normal');
  });
  socket.on('drawHistory', function (data) {
    history = (data.strokes || []).slice();
    liveStroke = null;
    renderAll();
  });
  socket.on('clearCanvas', function () {
    history = [];
    liveStroke = null;
    renderAll();
  });

  // ---- chat / hints / guesses ----
  socket.on('chat', function (data) {
    if (data.system) addChat({ cls: 'system', text: data.text });
    else addChat({ who: data.name, text: data.text });
  });
  socket.on('correctGuess', function (data) {
    addChat({ cls: 'correct', text: '\uD83C\uDF89 ' + data.name + ' guessed the word!' });
  });
  socket.on('hint', function (data) {
    addChat({ cls: 'hint', text: '\uD83D\uDCA1 Hint: ' + data.text });
    $('hint-display').textContent = '\uD83D\uDCA1 ' + data.text;
  });

  socket.on('timer', function (data) {
    if (!state.drawerWaiting) renderTimer(data.timeLeft);
  });

  socket.on('roundEnd', function (data) {
    state.phase = 'roundend';
    $('canvas-status').textContent = '';
    $('reveal-word').textContent = data.word;
    var list = $('round-gains');
    list.innerHTML = '';
    (data.players || []).slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (p) {
      var gain = data.gains[p.id] || 0;
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = p.name + (p.id === state.me ? ' (you)' : '');
      var g = document.createElement('span');
      g.className = gain > 0 ? 'gain-pos' : 'gain-zero';
      g.textContent = '+' + gain;
      li.appendChild(name);
      li.appendChild(g);
      list.appendChild(li);
    });
    state.players = data.players || state.players;
    $('next-round-note').textContent = 'Next drawer in ' + data.nextIn + 's...';
    hideOverlay('overlay-choose');
    hideOverlay('overlay-freeword');
    showOverlay('overlay-roundend');
  });

  socket.on('gameEnd', function (data) {
    state.phase = 'gameend';
    hideOverlay('overlay-choose');
    hideOverlay('overlay-freeword');
    hideOverlay('overlay-roundend');
    var ol = $('final-ranking');
    ol.innerHTML = '';
    var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    data.ranking.forEach(function (r, i) {
      var li = document.createElement('li');
      if (i === 0) li.className = 'top1';
      var medal = document.createElement('span');
      medal.className = 'medal';
      medal.textContent = i < 3 ? medals[i] : r.rank;
      var name = document.createElement('span');
      name.textContent = r.name + (r.id === state.me ? ' (you)' : '');
      var score = document.createElement('span');
      score.className = 'fr-score';
      score.textContent = r.score + ' pts';
      li.appendChild(medal);
      li.appendChild(name);
      li.appendChild(score);
      ol.appendChild(li);
    });
    $('btn-play-again').classList.toggle('hidden', state.hostId !== state.me);
    showOverlay('overlay-gameend');
  });

  $('btn-play-again').addEventListener('click', function () { socket.emit('playAgain'); });
  $('btn-back-home').addEventListener('click', function () {
    socket.emit('leaveRoom');
    hideAllOverlays();
    showScreen('home');
    renderRecentRooms();
  });

  socket.on('reconnect', function () {
    socket.emit('requestDrawHistory');
  });

  // ---------- Init ----------
  renderRecentRooms();
  buildSwatches();
  updateColorPreview();
  (function initSizePreview() {
    var preview = $('size-preview');
    preview.style.width = '6px';
    preview.style.height = '6px';
  })();
})();
