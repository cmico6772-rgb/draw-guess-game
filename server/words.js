'use strict';

// JSON files are loaded by Node once at server startup and then cached in
// memory. No word-bank file is read for individual word requests.
const RAW_BANKS = {
  anime: require('./wordBanks/animeCharacters.json'),
  objects: require('./wordBanks/realObjects.json'),
  movies: require('./wordBanks/movieTitles.json'),
  people: require('./wordBanks/famousPeople.json'),
  food: require('./wordBanks/food.json'),
  vehicles: require('./wordBanks/vehicles.json'),
  sports: require('./wordBanks/sports.json'),
  douyinMemes: require('./wordBanks/douyinMemes.json'),
};

const CATEGORY_META = [
  { key: 'all', label: 'All Mixed' },
  { key: 'anime', label: 'Anime & Cartoons' },
  { key: 'objects', label: 'Real Objects' },
  { key: 'movies', label: 'Movie Titles' },
  { key: 'people', label: 'Famous People' },
  { key: 'food', label: 'Food & Drinks' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'sports', label: 'Sports' },
  { key: 'douyinMemes', label: 'Douyin / TikTok Memes' },
];

const CATEGORY_KEYS = CATEGORY_META.map((category) => category.key);

/** Trim and collapse whitespace while preserving display capitalization. */
function cleanDisplayWord(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** Case-insensitive normalized display value. */
function normalizeWord(value) {
  return cleanDisplayWord(value).toLowerCase();
}

/** Historical key format used by game state: ignore whitespace as well. */
function normalizeWordKey(value) {
  return normalizeWord(value).replace(/\s+/g, '');
}

function cleanBank(category, raw) {
  if (!Array.isArray(raw)) {
    throw new TypeError(`Word bank "${category}" must be a JSON array.`);
  }

  const words = [];
  const seen = new Set();
  raw.forEach((value) => {
    const word = cleanDisplayWord(value);
    if (!word) return;
    const key = normalizeWordKey(word);
    if (seen.has(key)) return;
    seen.add(key);
    words.push(word);
  });

  if (!words.length) {
    throw new Error(`Word bank "${category}" contains no valid words.`);
  }
  return Object.freeze(words);
}

// Validate and clean every category once during module initialization.
const CATEGORIES = {};
Object.keys(RAW_BANKS).forEach((category) => {
  CATEGORIES[category] = cleanBank(category, RAW_BANKS[category]);
});
Object.freeze(CATEGORIES);

// De-duplicated union used by All Mixed.
const ALL = [];
const allSeen = new Set();
Object.keys(CATEGORIES).forEach((category) => {
  CATEGORIES[category].forEach((word) => {
    const key = normalizeWordKey(word);
    if (allSeen.has(key)) return;
    allSeen.add(key);
    ALL.push(word);
  });
});
Object.freeze(ALL);

const NOT_ENOUGH_WORDS_MSG =
  'Not enough unused words left. Please restart the game or expand the word bank.';
const NOT_ENOUGH_WORDS_IN_CATEGORY_MSG =
  'Not enough unused words left in this category. Please choose another category or restart the game.';
const WORD_ALREADY_USED_MSG =
  'This word has already been used in this game. Please choose another word.';

function getWordCategories() {
  return CATEGORY_META.map((category) => ({ ...category }));
}

function isValidCategory(category) {
  return CATEGORY_KEYS.includes(category);
}

function getWordsByCategory(category) {
  if (!category || category === 'all') return ALL;
  return CATEGORIES[category] || [];
}

function toUsedSet(usedWords) {
  if (usedWords instanceof Set) return usedWords;
  return new Set((usedWords || []).map(normalizeWordKey));
}

/**
 * Efficient partial Fisher-Yates selection. Only the selected options are
 * shuffled; the in-memory source bank is never mutated.
 */
function getRandomWords(category, count, usedWords) {
  const source = getWordsByCategory(category);
  const used = toUsedSet(usedWords);
  const available = source.filter((word) => !used.has(normalizeWordKey(word)));

  if (available.length < count) {
    const specific = category && category !== 'all' && CATEGORIES[category];
    const error = new Error(
      specific ? NOT_ENOUGH_WORDS_IN_CATEGORY_MSG : NOT_ENOUGH_WORDS_MSG,
    );
    error.code = 'NOT_ENOUGH_WORDS';
    throw error;
  }

  for (let i = 0; i < count; i += 1) {
    const index = i + Math.floor(Math.random() * (available.length - i));
    [available[i], available[index]] = [available[index], available[i]];
  }
  return available.slice(0, count);
}

// Backward-compatible signature used by the existing game managers.
function pickWords(count, usedWords, category) {
  return getRandomWords(category || 'all', count, usedWords);
}

function countAvailableWords(usedWords, category) {
  const used = toUsedSet(usedWords);
  return getWordsByCategory(category || 'all')
    .filter((word) => !used.has(normalizeWordKey(word))).length;
}

module.exports = {
  CATEGORIES,
  CATEGORY_META,
  CATEGORY_KEYS,
  ALL,
  getWordCategories,
  getWordsByCategory,
  getRandomWords,
  normalizeWord,
  normalizeWordKey,
  pickWords,
  countAvailableWords,
  isValidCategory,
  NOT_ENOUGH_WORDS_MSG,
  NOT_ENOUGH_WORDS_IN_CATEGORY_MSG,
  WORD_ALREADY_USED_MSG,
};
