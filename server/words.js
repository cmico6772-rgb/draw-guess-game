'use strict';

// English word bank for Draw & Guess and Drawing Telephone.
// Grouped by selectable category. All entries should be recognizable and
// drawable. Duplicate checks are case-insensitive and whitespace-insensitive.

// ---------------------------------------------------------------------------
// Selectable categories (host picks one in the lobby)
// ---------------------------------------------------------------------------

const ANIME = [
  'Naruto', 'Sasuke', 'Sakura Haruno', 'Kakashi', 'Itachi', 'Hinata', 'Gaara', 'Jiraiya', 'Rock Lee', 'Boruto',
  'Luffy', 'Zoro', 'Nami', 'Sanji', 'Chopper', 'Usopp', 'Ace', 'Shanks', 'Goku', 'Vegeta',
  'Gohan', 'Frieza', 'Piccolo', 'Doraemon', 'Nobita', 'Shizuka', 'Gian', 'Suneo', 'Pikachu', 'Ash Ketchum',
  'Charizard', 'Bulbasaur', 'Squirtle', 'Eevee', 'Mewtwo', 'Conan Edogawa', 'Ran Mouri', 'Shinchan', 'Totoro', 'Ponyo',
  'No Face', 'Kiki', 'Nezuko', 'Tanjiro', 'Zenitsu', 'Inosuke', 'Rengoku', 'Gojo', 'Sukuna', 'Yuji Itadori',
  'Megumi', 'Sailor Moon', 'SpongeBob', 'Patrick Star', 'Squidward', 'Mr Krabs', 'Sandy Cheeks', 'Mickey Mouse', 'Minnie Mouse', 'Donald Duck',
  'Goofy', 'Tom', 'Jerry', 'Winnie the Pooh', 'Tigger', 'Piglet', 'Peppa Pig', 'George Pig', 'Superman', 'Batman',
  'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Hulk', 'Thor', 'Black Panther', 'Doctor Strange', 'Elsa', 'Anna',
  'Olaf', 'Buzz Lightyear', 'Woody', 'Shrek', 'Donkey', 'Po', 'Minions', 'Gru', 'Lightning McQueen', 'Sonic',
  'Mario', 'Luigi', 'Kirby', 'Link', 'Zelda', 'Ultraman', 'Ultraman Tiga', 'Ultraman Zero', 'Ultraman Mebius', 'Ultraman Geed',
  'Boonie Bears Briar', 'Boonie Bears Bramble', 'Logger Vick', 'Pleasant Goat', 'Big Big Wolf', 'Lazy Goat', 'Pretty Goat', 'Weslie', 'Nezha', 'Monkey King',
  'Black Cat Detective', 'Calabash Brothers', 'GG Bond', 'Luo Xiaohei', 'McDull', 'Astro Boy', 'Hello Kitty', 'Kuromi', 'My Melody', 'Cinnamoroll',
  'Gudetama', 'Garfield', 'Scooby-Doo', 'Ben 10', 'Finn', 'Jake', 'Steven Universe', 'Rick Sanchez', 'Morty', 'Homer Simpson',
  'Bart Simpson', 'Lisa Simpson', 'Marge Simpson',
];

const OBJECTS = [
  'chair', 'table', 'phone', 'smartphone', 'computer', 'laptop', 'tablet', 'book', 'notebook', 'pencil',
  'pen', 'marker', 'crayon', 'backpack', 'school bag', 'clock', 'watch', 'umbrella', 'glasses', 'sunglasses',
  'key', 'lock', 'candle', 'bottle', 'water bottle', 'cup', 'mug', 'camera', 'mirror', 'scissors',
  'toothbrush', 'toothpaste', 'pillow', 'blanket', 'bed', 'sofa', 'lamp', 'desk lamp', 'guitar', 'violin',
  'piano', 'drum', 'ball', 'balloon', 'door', 'window', 'fridge', 'television', 'remote control', 'shoes',
  'socks', 'hat', 'cap', 'wallet', 'handbag', 'suitcase', 'ruler', 'eraser', 'calculator', 'headphones',
  'microphone', 'keyboard', 'mouse', 'charger', 'fan', 'air conditioner', 'washing machine', 'spoon', 'fork', 'knife',
  'plate', 'bowl', 'chopsticks', 'pan', 'pot', 'oven', 'microwave', 'toaster', 'soap', 'towel',
  'shampoo', 'comb', 'hair dryer', 'ring', 'necklace', 'bracelet', 'dice', 'chess piece', 'playing cards', 'toy car',
  'teddy bear', 'skateboard', 'broom', 'mop', 'trash can', 'tissue box', 'alarm clock', 'calendar', 'map', 'globe',
  'flashlight', 'battery', 'plug', 'socket', 'ladder', 'hammer', 'screwdriver', 'nail', 'saw', 'paintbrush',
  'bucket', 'rope', 'tape', 'glue', 'envelope', 'stamp', 'mailbox', 'shopping cart', 'basket', 'traffic cone',
  'flag', 'umbrella stand', 'flower pot', 'vase', 'camera tripod', 'speaker', 'radio', 'printer', 'whiteboard', 'paint palette',
  'helmet', 'mask', 'gift box', 'snow globe', 'lunch box',
];

const MOVIES = [
  'Titanic', 'Avatar', 'Avatar The Way of Water', 'Frozen', 'Frozen 2', 'Toy Story', 'Toy Story 2', 'Toy Story 3', 'Toy Story 4', 'Shrek',
  'Kung Fu Panda', 'Kung Fu Panda 2', 'Kung Fu Panda 3', 'Spider-Man', 'Spider-Man No Way Home', 'Batman', 'The Dark Knight', 'Superman', 'Iron Man', 'The Avengers',
  'Avengers Endgame', 'Avengers Infinity War', 'Captain America', 'Black Panther', 'Doctor Strange', 'Thor', 'Guardians of the Galaxy', 'Harry Potter', "Harry Potter and the Philosopher's Stone", 'Harry Potter and the Chamber of Secrets',
  'Jurassic Park', 'Jurassic World', 'Star Wars', 'The Lion King', 'Finding Nemo', 'Finding Dory', 'Cars', 'Cars 2', 'Minions', 'Despicable Me',
  'Inside Out', 'Coco', 'Moana', 'The Incredibles', 'The Incredibles 2', 'Transformers', 'Godzilla', 'King Kong', 'Jaws', 'Home Alone',
  'Pirates of the Caribbean', 'The Matrix', 'The Little Mermaid', 'Aladdin', 'Beauty and the Beast', 'Mulan', 'Zootopia', 'Up', 'WALL-E', 'Ratatouille',
  'Monsters Inc', 'Monsters University', 'Soul', 'Luca', 'Encanto', 'Elemental', 'Turning Red', 'Brave', 'Tangled', 'Wreck-It Ralph',
  'Big Hero 6', 'The Lego Movie', 'How to Train Your Dragon', 'Madagascar', 'Ice Age', 'Rio', 'The Croods', 'Puss in Boots', 'The Super Mario Bros Movie', 'Sonic the Hedgehog',
  'Detective Pikachu', 'The Hunger Games', 'Twilight', 'The Lord of the Rings', 'The Hobbit', 'Fast and Furious', 'Mission Impossible', 'Top Gun', 'Top Gun Maverick', 'Men in Black',
  'Ghostbusters', 'E.T.', 'Back to the Future', 'Indiana Jones', 'The Karate Kid', 'Jumanji', 'Night at the Museum', 'The Terminator', 'Alien', 'Predator',
  'Interstellar', 'Inception', 'The Martian', 'Gravity', 'La La Land', 'The Greatest Showman', 'Charlie and the Chocolate Factory', 'Alice in Wonderland', 'The Nightmare Before Christmas', 'Coraline',
  'Spirited Away', 'My Neighbor Totoro', 'Ponyo', "Howl's Moving Castle", 'Your Name', 'Weathering With You',
];

const PEOPLE = [
  'Cristiano Ronaldo', 'Lionel Messi', 'Neymar', 'Kylian Mbappe', 'Erling Haaland', 'David Beckham', 'Pele', 'Maradona', 'Michael Jordan', 'Kobe Bryant',
  'LeBron James', 'Stephen Curry', 'Kevin Durant', "Shaquille O'Neal", 'Yao Ming', 'Jeremy Lin', 'Taylor Swift', 'Michael Jackson', 'Ariana Grande', 'Billie Eilish',
  'Justin Bieber', 'Ed Sheeran', 'Drake', 'Beyonce', 'Rihanna', 'Lady Gaga', 'Bruno Mars', 'The Weeknd', 'Adele', 'Eminem',
  'Jay Chou', 'Jackie Chan', 'Bruce Lee', 'Jet Li', 'Donnie Yen', 'Dwayne Johnson', 'Tom Cruise', 'Leonardo DiCaprio', 'Will Smith', 'Robert Downey Jr',
  'Chris Hemsworth', 'Chris Evans', 'Zendaya', 'Emma Watson', 'Daniel Radcliffe', 'Johnny Depp', 'MrBeast', 'PewDiePie', 'Markiplier', 'Albert Einstein',
  'Isaac Newton', 'Elon Musk', 'Steve Jobs', 'Bill Gates', 'Mark Zuckerberg', 'Jeff Bezos', 'Shakespeare', 'Leonardo da Vinci', 'Van Gogh', 'Picasso',
  'Beethoven', 'Mozart', 'Napoleon', 'Cleopatra', 'Usain Bolt', 'Serena Williams', 'Roger Federer', 'Novak Djokovic', 'Rafael Nadal', 'Tiger Woods',
  'Lewis Hamilton', 'Michael Phelps', 'Simone Biles', 'Stephen Hawking', 'Marie Curie', 'Galileo', 'Charles Darwin', 'Nikola Tesla', 'Thomas Edison', 'Walt Disney',
  'Stan Lee', 'J.K. Rowling', 'Hayao Miyazaki', 'Hideo Kojima', 'Gordon Ramsay', 'Jamie Oliver', 'David Attenborough', 'Bear Grylls', 'Charlie Chaplin', 'Marilyn Monroe',
  'Audrey Hepburn', 'Elvis Presley', 'Bob Marley', 'Freddie Mercury', 'Queen Elizabeth II', 'Barack Obama', 'Martin Luther King Jr', 'Nelson Mandela', 'Abraham Lincoln', 'Zinedine Zidane',
  'Ronaldinho', 'Andres Iniesta', 'Kaka',
];

const FOOD = [
  'apple', 'banana', 'orange', 'watermelon', 'strawberry', 'grape', 'pineapple', 'mango', 'peach', 'pear',
  'cherry', 'lemon', 'lime', 'kiwi', 'coconut', 'blueberry', 'raspberry', 'pizza', 'burger', 'cheeseburger',
  'fries', 'noodles', 'ramen', 'spaghetti', 'pasta', 'sushi', 'sashimi', 'cake', 'birthday cake', 'ice cream',
  'sandwich', 'hot dog', 'donut', 'cookie', 'chocolate', 'bread', 'toast', 'cheese', 'egg', 'fried egg',
  'salad', 'taco', 'burrito', 'dumpling', 'soup', 'steak', 'fish', 'chicken', 'fried chicken', 'rice',
  'fried rice', 'pancake', 'waffle', 'milk', 'coffee', 'bubble tea', 'tea', 'juice', 'soda', 'carrot',
  'potato', 'tomato', 'corn', 'broccoli', 'cucumber', 'onion', 'garlic', 'pepper', 'mushroom', 'cabbage',
  'lettuce', 'pumpkin', 'sausage', 'bacon', 'lobster', 'crab', 'shrimp', 'oyster', 'salmon', 'tuna',
  'curry', 'hot pot', 'barbecue', 'meatball', 'pizza slice', 'popcorn', 'chips', 'candy', 'lollipop', 'marshmallow',
  'jelly', 'pudding', 'pie', 'cheesecake', 'cupcake', 'muffin', 'croissant', 'bagel', 'cereal', 'oatmeal',
  'yogurt', 'butter', 'honey', 'jam', 'peanut butter', 'tofu', 'spring roll', 'baozi', 'mooncake', 'zongzi',
  'egg tart', 'congee', 'roast duck', 'kebab', 'falafel', 'nachos', 'guacamole', 'avocado', 'omelette', 'lasagna',
  'macaroni', 'kimchi', 'fried noodles', 'curry rice', 'chicken wings', 'onion rings', 'milkshake', 'smoothie',
];

const VEHICLES = [
  'car', 'bus', 'train', 'airplane', 'boat', 'ship', 'helicopter', 'motorcycle', 'taxi', 'truck',
  'rocket', 'scooter', 'bicycle', 'subway', 'tram', 'ambulance', 'police car', 'fire truck', 'tractor', 'skateboard',
  'yacht', 'canoe', 'ferry', 'van', 'race car', 'tank', 'spaceship', 'hot air balloon', 'cable car', 'snowmobile',
  'jet ski', 'forklift', 'bulldozer', 'excavator', 'crane', 'electric scooter', 'electric car', 'school bus', 'double-decker bus', 'sports car',
  'convertible', 'limousine', 'pickup truck', 'garbage truck', 'cement mixer', 'dump truck', 'tow truck', 'delivery truck', 'ice cream truck', 'monster truck',
  'go-kart', 'Formula One car', 'rally car', 'bumper car', 'roller coaster', 'train engine', 'bullet train', 'steam train', 'freight train', 'subway train',
  'monorail', 'airplane jet', 'fighter jet', 'private jet', 'glider', 'drone', 'parachute', 'sailboat', 'speedboat', 'submarine',
  'cruise ship', 'pirate ship', 'aircraft carrier', 'kayak', 'rowboat', 'hovercraft', 'carriage', 'horse cart', 'rickshaw', 'wheelchair',
  'stroller', 'shopping cart', 'elevator', 'escalator', 'cableway', 'space shuttle', 'lunar rover', 'Mars rover', 'fire engine', 'rescue helicopter',
  'police motorcycle', 'moped', 'unicycle', 'segway', 'trolleybus', 'gondola', 'blimp', 'cargo ship', 'dirt bike', 'minivan',
];

const SPORTS = [
  'football', 'soccer', 'basketball', 'tennis', 'swimming', 'running', 'boxing', 'skiing', 'surfing', 'golf',
  'baseball', 'volleyball', 'badminton', 'skateboard', 'cycling', 'table tennis', 'rugby', 'cricket', 'ice hockey', 'gymnastics',
  'diving', 'archery', 'fencing', 'bowling', 'wrestling', 'karate', 'taekwondo', 'weightlifting', 'snowboarding', 'fishing',
  'horse riding', 'soccer ball', 'basketball hoop', 'tennis racket', 'boxing gloves', 'golf club', 'skateboard ramp', 'swimming pool', 'running shoes', 'goalkeeper',
  'referee', 'whistle', 'trophy', 'medal', 'stadium', 'gym', 'football field', 'basketball court', 'tennis court', 'baseball bat',
  'baseball glove', 'volleyball net', 'badminton shuttlecock', 'ping pong paddle', 'hockey stick', 'ice skates', 'ski goggles', 'surfboard', 'snowboard', 'skateboard helmet',
  'bicycle helmet', 'dumbbell', 'barbell', 'yoga mat', 'punching bag', 'climbing wall', 'rock climbing', 'marathon', 'sprint', 'relay race',
  'high jump', 'long jump', 'pole vault', 'javelin', 'discus', 'shot put', 'hurdles', 'rowing', 'sailing', 'canoeing',
  'kayaking', 'water polo', 'synchronized swimming', 'figure skating', 'speed skating', 'bobsleigh', 'luge', 'curling', 'handball', 'futsal',
  'dodgeball', 'frisbee', 'parkour', 'cheerleading', 'dance sport', 'chess', 'e-sports', 'martial arts', 'sumo', 'kickboxing', 'triathlon',
];

// Selectable categories the host can choose in the lobby.
const CATEGORIES = {
  anime: ANIME,
  objects: OBJECTS,
  movies: MOVIES,
  people: PEOPLE,
  food: FOOD,
  vehicles: VEHICLES,
  sports: SPORTS,
};

// Display metadata for the lobby selector. 'all' mixes every category.
const CATEGORY_META = [
  { key: 'all', label: 'All Mixed' },
  { key: 'anime', label: 'Anime & Cartoons' },
  { key: 'objects', label: 'Real Objects' },
  { key: 'movies', label: 'Movie Titles' },
  { key: 'people', label: 'Famous People' },
  { key: 'food', label: 'Food & Drinks' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'sports', label: 'Sports' },
];

const CATEGORY_KEYS = CATEGORY_META.map((c) => c.key);

/** Case-insensitive, trim, collapse internal whitespace for duplicate checks. */
function normalizeWord(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeWordKey(text) {
  return normalizeWord(text).replace(/\s+/g, '');
}

// De-duplicated union of every category, used by the 'all' (mixed) option.
const ALL = [];
const seenAll = new Set();
Object.keys(CATEGORIES).forEach((key) => {
  CATEGORIES[key].forEach((word) => {
    const k = normalizeWordKey(word);
    if (!k || seenAll.has(k)) return;
    seenAll.add(k);
    ALL.push(word);
  });
});

const NOT_ENOUGH_WORDS_MSG = 'Not enough unused words left. Please restart the game or expand the word bank.';
const NOT_ENOUGH_WORDS_IN_CATEGORY_MSG =
  'Not enough unused words left in this category. Please choose another category or restart the game.';
const WORD_ALREADY_USED_MSG = 'This word has already been used in this game. Please choose another word.';

/** Resolve the word pool for a category key. Unknown / 'all' -> the full mix. */
function poolForCategory(categoryKey) {
  if (categoryKey && CATEGORIES[categoryKey]) return CATEGORIES[categoryKey];
  return ALL;
}

/**
 * Pick `count` unique random words from the selected category (default: all),
 * excluding normalized keys in `usedKeys` (Set or array).
 */
function pickWords(count, usedKeys, categoryKey) {
  const used = usedKeys instanceof Set
    ? usedKeys
    : new Set((usedKeys || []).map(normalizeWordKey));

  const pool = poolForCategory(categoryKey).filter((w) => !used.has(normalizeWordKey(w)));
  if (pool.length < count) {
    const specific = categoryKey && CATEGORIES[categoryKey];
    const err = new Error(specific ? NOT_ENOUGH_WORDS_IN_CATEGORY_MSG : NOT_ENOUGH_WORDS_MSG);
    err.code = 'NOT_ENOUGH_WORDS';
    throw err;
  }

  const working = pool.slice();
  const chosen = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(Math.random() * working.length);
    chosen.push(working.splice(idx, 1)[0]);
  }
  return chosen;
}

function countAvailableWords(usedKeys, categoryKey) {
  const used = usedKeys instanceof Set
    ? usedKeys
    : new Set((usedKeys || []).map(normalizeWordKey));
  return poolForCategory(categoryKey).filter((w) => !used.has(normalizeWordKey(w))).length;
}

function isValidCategory(categoryKey) {
  return CATEGORY_KEYS.indexOf(categoryKey) !== -1;
}

module.exports = {
  CATEGORIES,
  CATEGORY_META,
  CATEGORY_KEYS,
  ALL,
  normalizeWord,
  normalizeWordKey,
  pickWords,
  countAvailableWords,
  isValidCategory,
  NOT_ENOUGH_WORDS_MSG,
  NOT_ENOUGH_WORDS_IN_CATEGORY_MSG,
  WORD_ALREADY_USED_MSG,
};
