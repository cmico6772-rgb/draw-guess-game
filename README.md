# 你画我猜 (Draw and Guess) — v1

A real-time multiplayer Draw and Guess game. One player draws a secret word on an HTML Canvas while
everyone else races to guess it in the chat. Built with Node + Express + Socket.IO and a lightweight
vanilla HTML/CSS/JS client that works well in mobile browsers, including WeChat on Android and iPhone.

## Game rules

1. A player creates a room and shares the room code; others join with the code.
2. The host starts the game (needs at least 2 players).
3. Players take turns being the drawer, in join order.
4. At the start of each round the drawer picks one of three offered words.
5. The drawer has 3 minutes to draw; everyone else guesses in the chat box.
6. The drawer can type hints for the guessers.
7. Guessers earn points based on how fast they guess (plus a small bonus for guessing first).
8. The drawer earns points when at least one player guesses correctly.
9. After 3 minutes (or once everyone has guessed) the round ends and the answer is revealed.
10. When every player has drawn once, the game ends and the final ranking is shown.

## Run it

```bash
cd draw-guess
npm install
npm start
```

Then open `http://localhost:3000` in a browser. To play with friends on phones, make sure everyone is
on the same Wi-Fi and open `http://<your-computer-lan-ip>:3000` (e.g. `http://192.168.1.20:3000`).

Set a custom port with `PORT=4000 npm start`.

## Testing locally

Open several browser tabs (or phones). Create a room in one, join with the code in the others, then
have the host start the game.

## Notes

- All game state lives in memory on the server; rooms disappear when the server restarts.
- UI text and the word bank are in Chinese and can be swapped easily in `public/index.html`,
  `public/client.js`, and `server/words.js`.
