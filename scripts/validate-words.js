'use strict';

const fs = require('fs');
const path = require('path');

const MIN_WORDS = 6000;
const BANKS = {
  animeCharacters: 'animeCharacters.json',
  realObjects: 'realObjects.json',
  movieTitles: 'movieTitles.json',
  famousPeople: 'famousPeople.json',
  food: 'food.json',
  vehicles: 'vehicles.json',
  sports: 'sports.json',
  douyinMemes: 'douyinMemes.json',
};

const bankDir = path.join(__dirname, '..', 'server', 'wordBanks');
let hasError = false;
let hasWarning = false;

function normalized(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function key(value) {
  return normalized(value).replace(/\s+/g, '');
}

function findSimilarPhrases(words) {
  const normalizedWords = words.map((word) => ({
    display: word,
    normalized: normalized(word),
  }));
  const similar = [];

  for (let i = 0; i < normalizedWords.length; i += 1) {
    for (let j = i + 1; j < normalizedWords.length; j += 1) {
      const a = normalizedWords[i];
      const b = normalizedWords[j];
      const shorter = a.normalized.length <= b.normalized.length ? a : b;
      const longer = shorter === a ? b : a;
      if (shorter.normalized.length < 4) continue;

      // Whole-word/phrase containment only. This intentionally warns rather
      // than fails because pairs such as basketball/basketball hoop can be
      // genuinely different drawing ideas.
      const paddedLonger = ` ${longer.normalized} `;
      if (paddedLonger.includes(` ${shorter.normalized} `)) {
        similar.push([shorter.display, longer.display]);
      }
    }
  }
  return similar;
}

Object.entries(BANKS).forEach(([category, fileName]) => {
  const filePath = path.join(bankDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR ${category}: missing ${fileName}`);
    hasError = true;
    return;
  }

  let values;
  try {
    values = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`ERROR ${category}: invalid JSON (${error.message})`);
    hasError = true;
    return;
  }

  if (!Array.isArray(values)) {
    console.error(`ERROR ${category}: root value must be an array`);
    hasError = true;
    return;
  }

  const exactSeen = new Set();
  const caseInsensitiveSeen = new Set();
  const validWords = [];
  let empty = 0;
  let nonString = 0;
  let leadingOrTrailingSpace = 0;
  let exactDuplicates = 0;
  let caseInsensitiveDuplicates = 0;
  values.forEach((value) => {
    if (typeof value !== 'string') {
      nonString += 1;
      return;
    }
    if (!value.trim()) {
      empty += 1;
      return;
    }
    if (value !== value.trim()) leadingOrTrailingSpace += 1;

    if (exactSeen.has(value)) {
      exactDuplicates += 1;
      return;
    }
    exactSeen.add(value);

    const normalizedKey = key(value);
    if (caseInsensitiveSeen.has(normalizedKey)) {
      caseInsensitiveDuplicates += 1;
      return;
    }
    caseInsensitiveSeen.add(normalizedKey);
    validWords.push(value.trim().replace(/\s+/g, ' '));
  });

  if (
    empty ||
    nonString ||
    leadingOrTrailingSpace ||
    exactDuplicates ||
    caseInsensitiveDuplicates
  ) {
    console.error(
      `ERROR ${category}: ${empty} empty, ${nonString} non-string, ` +
      `${leadingOrTrailingSpace} untrimmed, ${exactDuplicates} exact duplicate, ` +
      `${caseInsensitiveDuplicates} case-insensitive duplicate`,
    );
    hasError = true;
  } else {
    console.log(`OK    ${category}: ${values.length} valid unique words`);
  }

  const similar = findSimilarPhrases(validWords);
  if (similar.length) {
    const examples = similar.slice(0, 5)
      .map(([shorter, longer]) => `"${longer}" may be too similar to "${shorter}"`)
      .join('; ');
    console.warn(`WARN  ${category}: ${similar.length} similar phrase pair(s): ${examples}`);
    hasWarning = true;
  }

  if (caseInsensitiveSeen.size < MIN_WORDS) {
    console.warn(`WARN  ${category}: ${caseInsensitiveSeen.size}/${MIN_WORDS} words`);
    hasWarning = true;
  }
});

if (hasError) process.exitCode = 1;
else if (hasWarning) console.warn('Validation passed with word-count warnings.');
else console.log('All word banks meet the minimum size.');
