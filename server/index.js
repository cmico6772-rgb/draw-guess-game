'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { GameManager, makePlayerId } = require('./gameManager');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const games = new GameManager(io);

setInterval(() => {
  for (const [code, room] of games.rooms) {
    if (room.isEmpty()) games.deleteRoom(code);
  }
}, 60 * 1000);

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  function currentRoom() {
    return socket.data.roomCode ? games.getRoom(socket.data.roomCode) : null;
  }

  function joinSocketToRoom(room, name, playerId) {
    const pid = playerId || makePlayerId();
    const { player, reconnected } = room.attachPlayer(socket, name, pid);

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.playerId;

    socket.emit('roomJoined', {
      code: room.code,
      you: player.playerId,
      hostId: room.hostPlayerId,
      phase: room.phase,
      playerId: player.playerId,
      reconnected,
    });
    socket.emit('settings', room.settings);

    if (reconnected && room.phase !== 'lobby' && room.phase !== 'gameend') {
      socket.emit('stateSync', room.buildStateSync(player));
      room.sendDrawHistory(socket.id);
      room.broadcastDrawerWait();
    }

    room.broadcastPlayers();
    return { player, reconnected };
  }

  socket.on('createRoom', ({ name, playerId } = {}) => {
    const room = games.createRoom();
    joinSocketToRoom(room, name, playerId);
  });

  socket.on('joinRoom', ({ code, name, playerId } = {}) => {
    const room = games.getRoom(code);
    if (!room) {
      socket.emit('errorMsg', { text: 'This room no longer exists.' });
      return;
    }

    const existing = playerId ? room.getPlayerById(playerId) : null;
    if (room.phase !== 'lobby' && room.phase !== 'gameend') {
      if (!existing) {
        socket.emit('errorMsg', { text: 'The game is in progress. You cannot join right now.' });
        return;
      }
    }

    joinSocketToRoom(room, name, playerId);
  });

  socket.on('updateSettings', (settings = {}) => {
    const room = currentRoom();
    if (room) room.updateSettings(socket.id, settings);
  });

  socket.on('startGame', () => {
    const room = currentRoom();
    if (room) room.startGame(socket.id);
  });

  socket.on('chooseWord', ({ word } = {}) => {
    const room = currentRoom();
    if (room) {
      const pid = room.playerIdFromSocket(socket.id);
      if (pid) room.setWord(pid, word);
    }
  });

  socket.on('removePlayer', ({ playerId } = {}) => {
    const room = currentRoom();
    if (room) room.hostRemovePlayer(socket.id, playerId);
  });

  socket.on('skipDrawerRound', () => {
    const room = currentRoom();
    if (room) room.skipDrawerRound(socket.id, false);
  });

  socket.on('strokeStart', (style) => {
    const room = currentRoom();
    if (room) room.strokeStart(socket.id, style || {});
  });

  socket.on('drawPoint', (pt) => {
    const room = currentRoom();
    if (room && pt && typeof pt === 'object') room.drawPoint(socket.id, pt);
  });

  socket.on('strokeEnd', () => {
    const room = currentRoom();
    if (room) room.strokeEnd(socket.id);
  });

  socket.on('floodFill', (op) => {
    const room = currentRoom();
    if (room && op && typeof op === 'object') room.floodFill(socket.id, op);
  });

  socket.on('bgMode', ({ mode } = {}) => {
    const room = currentRoom();
    if (room) room.setBgMode(socket.id, mode);
  });

  socket.on('undo', () => {
    const room = currentRoom();
    if (room) room.undo(socket.id);
  });

  socket.on('redo', () => {
    const room = currentRoom();
    if (room) room.redoStroke(socket.id);
  });

  socket.on('clearCanvas', () => {
    const room = currentRoom();
    if (room) room.clearCanvas(socket.id);
  });

  socket.on('requestDrawHistory', () => {
    const room = currentRoom();
    if (room) room.sendDrawHistory(socket.id);
  });

  socket.on('guess', ({ text } = {}) => {
    const room = currentRoom();
    if (room) room.handleGuess(socket.id, text);
  });

  socket.on('hint', ({ text } = {}) => {
    const room = currentRoom();
    if (room) room.handleHint(socket.id, text);
  });

  socket.on('returnToLobby', () => {
    const room = currentRoom();
    if (room) room.returnToLobby(socket.id);
  });

  socket.on('resetScores', () => {
    const room = currentRoom();
    if (room) room.resetScores(socket.id);
  });

  socket.on('leaveRoom', () => {
    const room = currentRoom();
    if (room) {
      room.removePlayer(socket.id, true);
      socket.leave(room.code);
      if (room.isEmpty()) games.deleteRoom(room.code);
    }
    socket.data.roomCode = null;
    socket.data.playerId = null;
  });

  socket.on('disconnect', () => {
    const room = currentRoom();
    if (room) {
      room.removePlayer(socket.id, false);
      if (room.isEmpty()) games.deleteRoom(room.code);
    }
    socket.data.roomCode = null;
    socket.data.playerId = null;
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
