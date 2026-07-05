'use strict';

// English word bank for Draw & Guess (Default mode).
// Grouped loosely by how easy they are to draw. The server offers the drawer
// a random selection each turn.

const EASY = [
  'sun', 'moon', 'star', 'cloud', 'rain', 'tree', 'flower', 'apple', 'banana', 'grape',
  'house', 'car', 'plane', 'boat', 'bike', 'train', 'cat', 'dog', 'fish', 'bird',
  'eye', 'nose', 'mouth', 'hand', 'foot', 'hat', 'shoe', 'book', 'pen', 'cup',
  'table', 'chair', 'bed', 'door', 'window', 'lamp', 'clock', 'key', 'ball', 'heart',
];

const MEDIUM = [
  'rainbow', 'lightning', 'volcano', 'desert', 'island', 'bridge', 'castle', 'kite', 'balloon', 'umbrella',
  'cake', 'ice cream', 'pizza', 'burger', 'coffee', 'egg', 'panda', 'giraffe', 'penguin', 'dolphin',
  'octopus', 'spider', 'butterfly', 'bee', 'snail', 'crab', 'guitar', 'piano', 'drum', 'camera',
  'phone', 'laptop', 'rocket', 'robot', 'ghost', 'snowman', 'anchor', 'ladder', 'basket', 'candle',
];

const HARD = [
  'lighthouse', 'windmill', 'ferris wheel', 'roller coaster', 'fountain', 'pyramid', 'helicopter', 'submarine', 'dinosaur', 'mermaid',
  'unicorn', 'astronaut', 'fire truck', 'ambulance', 'excavator', 'telescope', 'microscope', 'treasure', 'waterfall', 'skateboard',
  'birthday party', 'flying a kite', 'fishing', 'skiing', 'swimming', 'camping', 'surfing', 'playing chess', 'brushing teeth', 'washing dishes',
];

const ALL = [].concat(EASY, MEDIUM, HARD);

// Pick `count` unique random words from the bank.
function pickWords(count) {
  const n = Math.min(count, ALL.length);
  const pool = ALL.slice();
  const chosen = [];
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

module.exports = { EASY, MEDIUM, HARD, ALL, pickWords };
