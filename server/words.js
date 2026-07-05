'use strict';

// English word bank for Draw & Guess (Default mode).
// Grouped by category for easy editing. All entries should be drawable.

const ANIMALS = [
  'cat', 'dog', 'rabbit', 'lion', 'tiger', 'elephant', 'giraffe', 'monkey', 'panda', 'penguin',
  'dolphin', 'shark', 'whale', 'turtle', 'snake', 'frog', 'horse', 'sheep', 'cow', 'pig',
  'chicken', 'duck', 'owl', 'eagle', 'butterfly', 'bee', 'spider', 'bear', 'wolf', 'fox',
  'deer', 'mouse', 'hamster', 'kangaroo', 'koala', 'zebra', 'camel', 'crocodile', 'parrot', 'flamingo',
  'squid', 'lobster', 'crab', 'snail', 'octopus', 'bat', 'gorilla', 'hippo', 'rhino', 'peacock',
];

const FOOD = [
  'apple', 'banana', 'pizza', 'burger', 'fries', 'noodles', 'sushi', 'cake', 'ice cream', 'sandwich',
  'hot dog', 'donut', 'cookie', 'chocolate', 'bread', 'cheese', 'egg', 'salad', 'taco', 'dumpling',
  'soup', 'steak', 'fish', 'carrot', 'potato', 'tomato', 'grape', 'orange', 'lemon', 'watermelon',
  'strawberry', 'corn', 'rice', 'pasta', 'popcorn', 'milk', 'honey', 'pancake', 'waffle', 'muffin',
  'coffee', 'tea', 'juice', 'candy', 'peanut', 'avocado', 'broccoli', 'mushroom', 'pizza slice', 'birthday cake',
];

const OBJECTS = [
  'chair', 'table', 'phone', 'computer', 'book', 'pencil', 'backpack', 'clock', 'umbrella', 'glasses',
  'key', 'candle', 'bottle', 'cup', 'camera', 'mirror', 'scissors', 'toothbrush', 'pillow', 'lamp',
  'guitar', 'ball', 'balloon', 'piano', 'drum', 'laptop', 'hammer', 'wrench', 'basket', 'ladder',
  'gift', 'ring', 'crown', 'sword', 'shield', 'treasure', 'envelope', 'television', 'remote', 'microwave',
  'toaster', 'pan', 'fork', 'knife', 'spoon', 'plate', 'vase', 'teddy bear', 'kite', 'anchor',
];

const NATURE = [
  'tree', 'flower', 'mountain', 'river', 'ocean', 'cloud', 'sun', 'moon', 'star', 'rainbow',
  'volcano', 'island', 'beach', 'forest', 'snowman', 'waterfall', 'leaf', 'fire', 'rock', 'cave',
  'desert', 'lightning', 'snowflake', 'grass', 'mushroom', 'cactus', 'sand', 'wave', 'tornado', 'rain',
  'snow', 'wind', 'eclipse', 'meteor', 'planet', 'comet', 'aurora', 'pond', 'lake', 'hill',
];

const PLACES = [
  'school', 'hospital', 'airport', 'restaurant', 'library', 'cinema', 'park', 'zoo', 'museum', 'supermarket',
  'playground', 'classroom', 'kitchen', 'bedroom', 'bathroom', 'farm', 'castle', 'church', 'stadium', 'hotel',
  'factory', 'bridge', 'lighthouse', 'windmill', 'tent', 'igloo', 'pyramid', 'tower', 'market', 'bakery',
];

const SPORTS = [
  'football', 'basketball', 'tennis', 'swimming', 'running', 'boxing', 'skiing', 'surfing', 'golf', 'baseball',
  'volleyball', 'badminton', 'skateboard', 'bicycle', 'hockey', 'cricket', 'archery', 'gymnastics', 'yoga', 'wrestling',
  'fencing', 'bowling', 'darts', 'ping pong', 'weightlifting', 'marathon', 'snowboarding', 'ice skating', 'kayaking', 'climbing',
];

const JOBS = [
  'doctor', 'nurse', 'teacher', 'chef', 'pilot', 'farmer', 'firefighter', 'police', 'astronaut', 'artist',
  'musician', 'builder', 'scientist', 'dentist', 'waiter', 'driver', 'soldier', 'pirate', 'wizard', 'detective',
  'magician', 'clown', 'barber', 'mechanic', 'photographer', 'judge', 'king', 'queen', 'knight', 'cowboy',
];

const VEHICLES = [
  'car', 'bus', 'train', 'airplane', 'boat', 'ship', 'helicopter', 'motorcycle', 'taxi', 'truck',
  'rocket', 'scooter', 'submarine', 'ambulance', 'fire truck', 'tractor', 'sailboat', 'canoe', 'jet ski', 'spaceship',
  'hot air balloon', 'cable car', 'ferry', 'tank', 'bulldozer', 'race car', 'police car', 'school bus', 'van', 'yacht',
];

const SCHOOL = [
  'ruler', 'eraser', 'chalkboard', 'desk', 'calculator', 'globe', 'homework', 'notebook', 'crayon', 'marker',
  'stapler', 'scissors', 'glue', 'paintbrush', 'diploma', 'school bus', 'locker', 'microscope', 'telescope', 'test paper',
];

const HOUSEHOLD = [
  'sofa', 'fridge', 'washing machine', 'toilet', 'shower', 'drawer', 'closet', 'blanket', 'towel', 'broom',
  'mop', 'vacuum', 'curtain', 'doormat', 'trash can', 'laundry basket', 'iron', 'kettle', 'blender', 'oven',
];

const ACTIONS = [
  'sleeping', 'dancing', 'singing', 'cooking', 'reading', 'jumping', 'crying', 'laughing', 'painting', 'fishing',
  'driving', 'flying', 'writing', 'eating', 'drinking', 'shopping', 'cleaning', 'gardening', 'camping', 'hiking',
  'skating', 'juggling', 'whistling', 'sneezing', 'yawning', 'stretching', 'meditating', 'photographing', 'building', 'digging',
];

const CHARACTERS_FANTASY = [
  'ghost', 'witch', 'vampire', 'dragon', 'unicorn', 'mermaid', 'superhero', 'ninja', 'robot', 'alien',
  'fairy', 'goblin', 'troll', 'genie', 'phoenix', 'griffin', 'centaur', 'skeleton', 'zombie', 'elf',
];

const EMOTIONS = [
  'happy', 'sad', 'angry', 'scared', 'surprised', 'love', 'tired', 'bored', 'excited', 'confused',
  'proud', 'shy', 'sick', 'hungry', 'thirsty', 'embarrassed', 'jealous', 'calm', 'worried', 'silly',
];

const TECHNOLOGY = [
  'tablet', 'keyboard', 'mouse', 'headphones', 'printer', 'satellite', 'drone', 'battery', 'light bulb', 'plug',
  'router', 'smartwatch', 'game controller', 'microphone', 'speaker', 'webcam', 'flash drive', 'charger', 'calculator watch', 'arcade machine',
];

const CATEGORIES = {
  animals: ANIMALS,
  food: FOOD,
  objects: OBJECTS,
  nature: NATURE,
  places: PLACES,
  sports: SPORTS,
  jobs: JOBS,
  vehicles: VEHICLES,
  school: SCHOOL,
  household: HOUSEHOLD,
  actions: ACTIONS,
  charactersFantasy: CHARACTERS_FANTASY,
  emotions: EMOTIONS,
  technology: TECHNOLOGY,
};

/** Case-insensitive, trim, collapse internal whitespace for duplicate checks. */
function normalizeWord(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeWordKey(text) {
  return normalizeWord(text).replace(/\s+/g, '');
}

const ALL = [];
const seen = new Set();
Object.keys(CATEGORIES).forEach((key) => {
  CATEGORIES[key].forEach((word) => {
    const k = normalizeWordKey(word);
    if (!k || seen.has(k)) return;
    seen.add(k);
    ALL.push(word);
  });
});

const NOT_ENOUGH_WORDS_MSG = 'Not enough unused words left. Please restart the game or expand the word bank.';
const WORD_ALREADY_USED_MSG = 'This word has already been used in this game. Please choose another word.';

/**
 * Pick `count` unique random words, excluding normalized keys in `usedKeys` (Set or array).
 */
function pickWords(count, usedKeys) {
  const used = usedKeys instanceof Set
    ? usedKeys
    : new Set((usedKeys || []).map(normalizeWordKey));

  const pool = ALL.filter((w) => !used.has(normalizeWordKey(w)));
  const n = Math.min(count, pool.length);
  if (n < count) {
    const err = new Error(NOT_ENOUGH_WORDS_MSG);
    err.code = 'NOT_ENOUGH_WORDS';
    throw err;
  }

  const working = pool.slice();
  const chosen = [];
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(Math.random() * working.length);
    chosen.push(working.splice(idx, 1)[0]);
  }
  return chosen;
}

function countAvailableWords(usedKeys) {
  const used = usedKeys instanceof Set
    ? usedKeys
    : new Set((usedKeys || []).map(normalizeWordKey));
  return ALL.filter((w) => !used.has(normalizeWordKey(w))).length;
}

module.exports = {
  CATEGORIES,
  ALL,
  normalizeWord,
  normalizeWordKey,
  pickWords,
  countAvailableWords,
  NOT_ENOUGH_WORDS_MSG,
  WORD_ALREADY_USED_MSG,
};
