export type Pillar = 'screen' | 'charts' | 'classics';

export type Book = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  pillar: Pillar;
  tagline?: string;
  note: string;
  keywords?: string[];
  color: string;
  coverUrl?: string | null;
  adaptations?: BookAdaptation[];
  isActive?: boolean;
};

export type PillarInfo = { id: Pillar; label: string; detail: string; color: string };

export type BookAdaptation = {
  title: string;
  format: 'film' | 'series';
  releaseYear: number;
  platform: string | null;
  tmdbId?: number | null;
  castMembers?: string[];
  tmdbLookupStatus?: 'pending' | 'matched' | 'not_found' | 'ambiguous' | 'year_mismatch';
};

export const PILLARS: PillarInfo[] = [
  { id: 'screen', label: 'Screen', detail: 'Stories made for the screen', color: '#d97452' },
  { id: 'charts', label: 'Charts', detail: 'Books showing up across reading charts', color: '#6177a2' },
  { id: 'classics', label: 'Classics', detail: 'Enduring books across ideas and literature', color: '#477d6c' },
];

const BOOK_TAGLINES: Record<string, string> = {
  dune: 'A desert world holds the key to unimaginable power.',
  'project-hail-mary': 'One astronaut. One impossible mission. A second chance.',
  'seven-husbands': 'A Hollywood icon finally tells her own story.',
  godfather: 'A family legacy built on loyalty, power, and fear.',
  'schindlers-ark': 'Compassion transformed into an industrial sanctuary.',
  'no-country': 'A chance discovery sets a relentless pursuit in motion.',
  'handmaids-tale': 'One woman’s memory outlasts the regime that owns her.',
  'queens-gambit': 'A brilliant mind seeks its next move beyond the board.',
  'three-body-problem': 'A distant signal changes everything we know about the universe.',
  'dawn-of-everything': 'The story of civilization is stranger than we imagine.',
  'the-prince': 'A clear-eyed guide to power, ambition, and rule.',
  'dictators-handbook': 'The few who matter can decide the fate of many.',
  sapiens: 'How shared beliefs made strangers into a global society.',
  'structure-scientific-revolutions': 'When a paradigm breaks, science sees the world anew.',
  'silent-spring': 'The unseen cost of pesticides reaches every living thing.',
  'nineteen-eighty-four': 'In a world of manufactured truth, memory is resistance.',
  'bluest-eye': 'A child’s longing reveals the cruelty of imposed beauty.',
  persepolis: 'A girl comes of age as her country is remade.',
  'no-one-talking': 'A mind split between the viral and the intimate.',
  'trick-mirror': 'Essays on the stories and screens that shape us.',
  'anthropocene-reviewed': 'Everyday wonders, measured against a changing planet.',
  'fifth-season': 'Three journeys through a world that keeps breaking.',
  'tomorrow-tomorrow-tomorrow': 'Two friends make games, and remake their lives.',
  'song-of-achilles': 'A myth retold through love, loss, and loyalty.',
  nightingale: 'Two sisters find different paths through occupied France.',
  'the-housemaid': 'A dream job hides a house full of shifting rules.',
  'thursday-murder-club': 'Four retirement-village friends take on an unsolved case.',
  verity: 'A ghostwriter uncovers a disturbing story behind a family’s success.',
  'midnight-library': 'Between life and death, every choice opens another possible life.',
  'lessons-in-chemistry': 'A scientist turns a cooking show into a lesson in possibility.',
  'remarkably-bright-creatures': 'A lonely cleaner and an observant octopus find common ground.',
  'forrest-gump': 'An openhearted man crosses paths with a changing America.',
  'silence-of-the-lambs': 'An ambitious trainee seeks a killer’s insight to stop another.',
  'a-beautiful-mind': 'A brilliant mathematician’s work and life challenge the boundaries of reality.',
  'the-reader': 'A postwar romance confronts literacy, memory, and moral responsibility.',
  'english-patient': 'War brings strangers together in a villa haunted by memory.',
  rebecca: 'A new bride lives beneath the shadow of the wife before her.',
  'ben-hur': 'Betrayal sends a Judean nobleman on a journey of revenge and faith.',
  'normal-people': 'Two people keep finding each other as their worlds change.',
  'big-little-lies': 'A polished school community hides rivalries and a fatal secret.',
  'station-eleven': 'After a pandemic, artists carry culture through a changed world.',
  shogun: 'An English pilot enters a dangerous contest for power in Japan.',
  pachinko: 'One Korean family seeks belonging across generations in Japan.',
  'underground-railroad': 'An escape from slavery becomes a journey through alternate histories.',
  'daisy-jones-six': 'A band’s rise and breakup unfold through the voices of its members.',
  'classic-things-fall-apart': 'A community faces colonial rule and the cost of rapid change.',
  'classic-beloved': 'A haunting past asks what love can endure.',
  'classic-the-odyssey': 'A long journey home tests identity, loyalty, and survival.',
  'classic-wide-sargasso-sea': 'A silenced woman claims a story at the margins of a classic.',
  'classic-one-hundred-years-solitude': 'One family’s history becomes a portrait of solitude and power.',
  'classic-house-on-mango-street': 'A young narrator imagines a home and future of her own.',
  'classic-fire-next-time': 'Two essays confront race, faith, and the promise of America.',
  'classic-orientalism': 'How systems of knowledge turn cultures into stories of power.',
  'classic-wretched-of-earth': 'A fierce examination of colonialism and the struggle after it.',
  'classic-warmth-of-other-suns': 'Three journeys illuminate the Great Migration and its lasting impact.',
  'classic-souls-of-black-folk': 'Essays on race, education, and democracy in America.',
  'classic-great-transformation': 'How markets reshape societies and the lives within them.',
  'classic-origin-of-species': 'A theory of natural selection changes how we see life.',
  'classic-sixth-extinction': 'A modern extinction crisis unfolds across the living world.',
  'classic-emperor-of-all-maladies': 'The story of cancer told through science, struggle, and discovery.',
  'classic-man-who-mistook-wife-hat': 'Strange clinical cases reveal the fragile shape of identity.',
  'classic-immortal-life-henrietta-lacks': 'One family seeks justice for the woman whose cells changed medicine.',
  'classic-cosmos': 'A journey through the universe and humanity’s place within it.',
  'classic-meditations': 'Private reflections on discipline, change, and meeting hardship.',
  'classic-second-sex': 'A landmark account of how gender shapes women’s lives.',
  'classic-room-of-ones-own': 'A writer asks what women need in order to create.',
  'classic-myth-of-sisyphus': 'How to live honestly when life offers no easy answers.',
  'classic-pedagogy-of-oppressed': 'Education becomes a practice of dialogue and freedom.',
  'classic-brief-history-time': 'Time, space, and the laws behind the cosmos.',
};

const createBook = (
  id: string,
  title: string,
  author: string,
  year: number,
  isbn: string,
  pillar: Pillar,
  note: string,
  color: string,
  adaptations: BookAdaptation[] = [],
  isActive = pillar === 'screen',
): Book => ({
  id,
  title,
  author,
  year,
  isbn,
  pillar,
  tagline: BOOK_TAGLINES[id],
  note,
  color,
  adaptations,
  isActive,
});

export const BOOKS: Book[] = [
  createBook('dune', 'Dune', 'Frank Herbert', 1965, '9780441172719', 'screen', 'A young heir steps into a struggle over the most valuable resource in the universe.', '#c69a62'),
  createBook('project-hail-mary', 'Project Hail Mary', 'Andy Weir', 2021, '9780593135204', 'screen', 'A lone astronaut wakes with no memory and a mission to save life on Earth.', '#64858b'),
  createBook('seven-husbands', 'The Seven Husbands of Evelyn Hugo', 'Taylor Jenkins Reid', 2017, '9781501161933', 'screen', 'A reclusive screen legend finally tells the story behind her carefully built image.', '#a86d72'),
  createBook('godfather', 'The Godfather', 'Mario Puzo', 1969, '9780451205766', 'screen', 'A crime-family succession story that became one of cinema’s defining dramas.', '#8a634a'),
  createBook('schindlers-ark', "Schindler's Ark", 'Thomas Keneally', 1982, '9780671880316', 'screen', 'A documented account of an industrialist who helped save more than a thousand people.', '#717568'),
  createBook('no-country', 'No Country for Old Men', 'Cormac McCarthy', 2005, '9780375706677', 'screen', 'A chance discovery of drug money sets a spare, relentless chase in motion.', '#8a7259'),
  createBook('handmaids-tale', "The Handmaid's Tale", 'Margaret Atwood', 1985, '9780385490818', 'screen', 'A personal account of life under a regime that has turned reproduction into state power.', '#b6534c'),
  createBook('queens-gambit', 'The Queen’s Gambit', 'Walter Tevis', 1983, '9781400030606', 'screen', 'An orphaned chess prodigy navigates ambition, isolation, and a world built around the board.', '#718259'),
  createBook('three-body-problem', 'The Three-Body Problem', 'Cixin Liu', 2008, '9780765382030', 'screen', 'A scientist follows a trail from a secret research project to an unsettling first contact.', '#54788b'),
  createBook('dawn-of-everything', 'The Dawn of Everything', 'David Graeber & David Wengrow', 2021, '9780374157357', 'classics', 'A sweeping challenge to familiar stories about the origins of inequality and society.', '#8a9b79'),
  createBook('the-prince', 'The Prince', 'Niccolò Machiavelli', 1532, '9781536840491', 'classics', 'A compact, unsentimental examination of how rulers gain and hold power.', '#9a7957'),
  createBook('dictators-handbook', 'The Dictator’s Handbook', 'Bruce Bueno de Mesquita & Alastair Smith', 2011, '9781610390446', 'classics', 'A political-science lens on why leaders reward some groups and neglect others.', '#547c72'),
  createBook('sapiens', 'Sapiens', 'Yuval Noah Harari', 2011, '9780062316097', 'classics', 'A sweeping account of how shared stories helped humans organize at scale.', '#d0a45f'),
  createBook('structure-scientific-revolutions', 'The Structure of Scientific Revolutions', 'Thomas S. Kuhn', 1962, '9780226458120', 'classics', 'A landmark argument about how scientific fields change when old frameworks stop fitting.', '#6d8392'),
  createBook('silent-spring', 'Silent Spring', 'Rachel Carson', 1962, '9780618249060', 'classics', 'A landmark account of how chemical pesticides can ripple through living systems.', '#65836a'),
  createBook('nineteen-eighty-four', '1984', 'George Orwell', 1949, '9780451524935', 'classics', 'A citizen tries to hold on to truth in a state built around surveillance and control.', '#ad5b4e'),
  createBook('bluest-eye', 'The Bluest Eye', 'Toni Morrison', 1970, '9780307278449', 'classics', 'A young girl’s story exposes the damage wrought by racism and narrow ideals of beauty.', '#795e77'),
  createBook('persepolis', 'Persepolis', 'Marjane Satrapi', 2000, '9780375714573', 'classics', 'A graphic memoir follows a girl growing up through revolution, war, and exile.', '#565a61'),
  createBook('no-one-talking', 'No One Is Talking About This', 'Patricia Lockwood', 2021, '9780593189588', 'charts', 'A novelist traces how life online remakes language, attention, and intimacy.', '#967da0'),
  createBook('trick-mirror', 'Trick Mirror', 'Jia Tolentino', 2019, '9780525510567', 'charts', 'Nine essays examine the stories and incentives shaping life online.', '#967da0'),
  createBook('anthropocene-reviewed', 'The Anthropocene Reviewed', 'John Green', 2021, '9780525555216', 'charts', 'A series of personal essays reviews everyday things against the scale of human history.', '#618f83'),
  createBook('fifth-season', 'The Fifth Season', 'N. K. Jemisin', 2015, '9780316229296', 'charts', 'On a world in ecological collapse, three lives converge around a hidden power.', '#7d718e'),
  createBook('tomorrow-tomorrow-tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 2022, '9780593321201', 'charts', 'Two longtime friends build games together and keep finding new ways to begin again.', '#5d8a84'),
  createBook('song-of-achilles', 'The Song of Achilles', 'Madeline Miller', 2011, '9780062060624', 'charts', 'A reimagining of the Iliad told through the bond between Patroclus and Achilles.', '#b47c66'),
];