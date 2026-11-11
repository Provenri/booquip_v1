alter table public.books add column subcategory text;

update public.books set subcategory = 'launchpad' where id = 'dune';
update public.books set subcategory = 'streaming-universe' where id = 'handmaids-tale';
update public.books set subcategory = 'blueprints-of-power' where id = 'dawn-of-everything';
update public.books set subcategory = 'scientific-paradigm-shifts' where id = 'sapiens';
update public.books set subcategory = 'algorithmic-blockbusters' where id in ('fifth-season', 'tomorrow-tomorrow-tomorrow');

insert into public.books (id, title, author, published_year, isbn, pillar, subcategory, note, cover_color)
values
  ('project-hail-mary', 'Project Hail Mary', 'Andy Weir', 2021, '9780593135204', 'screen', 'launchpad', 'A lone astronaut wakes with no memory and a mission to save life on Earth.', '#64858b'),
  ('seven-husbands', 'The Seven Husbands of Evelyn Hugo', 'Taylor Jenkins Reid', 2017, '9781501161933', 'screen', 'launchpad', 'A reclusive screen legend finally tells the story behind her carefully built image.', '#a86d72'),
  ('godfather', 'The Godfather', 'Mario Puzo', 1969, '9780451205766', 'screen', 'oscar-gold-standard', 'A crime-family succession story that became one of cinema’s defining dramas.', '#8a634a'),
  ('schindlers-ark', 'Schindler''s Ark', 'Thomas Keneally', 1982, '9780671880316', 'screen', 'oscar-gold-standard', 'A documented account of an industrialist who helped save more than a thousand people.', '#717568'),
  ('no-country', 'No Country for Old Men', 'Cormac McCarthy', 2005, '9780375706677', 'screen', 'oscar-gold-standard', 'A chance discovery of drug money sets a spare, relentless chase in motion.', '#8a7259'),
  ('queens-gambit', 'The Queen’s Gambit', 'Walter Tevis', 1983, '9781400030606', 'screen', 'streaming-universe', 'An orphaned chess prodigy navigates ambition, isolation, and a world built around the board.', '#718259'),
  ('three-body-problem', 'The Three-Body Problem', 'Cixin Liu', 2008, '9780765382030', 'screen', 'streaming-universe', 'A scientist follows a trail from a secret research project to an unsettling first contact.', '#54788b'),
  ('the-prince', 'The Prince', 'Niccolò Machiavelli', 1532, '9781536840491', 'civilization', 'blueprints-of-power', 'A compact, unsentimental examination of how rulers gain and hold power.', '#9a7957'),
  ('dictators-handbook', 'The Dictator’s Handbook', 'Bruce Bueno de Mesquita & Alastair Smith', 2011, '9781610390446', 'civilization', 'blueprints-of-power', 'A political-science lens on why leaders reward some groups and neglect others.', '#547c72'),
  ('structure-scientific-revolutions', 'The Structure of Scientific Revolutions', 'Thomas S. Kuhn', 1962, '9780226458120', 'civilization', 'scientific-paradigm-shifts', 'A landmark argument about how scientific fields change when old frameworks stop fitting.', '#6d8392'),
  ('silent-spring', 'Silent Spring', 'Rachel Carson', 1962, '9780618249060', 'civilization', 'scientific-paradigm-shifts', 'A landmark account of how chemical pesticides can ripple through living systems.', '#65836a'),
  ('nineteen-eighty-four', '1984', 'George Orwell', 1949, '9780451524935', 'civilization', 'forbidden-shelves', 'A citizen tries to hold on to truth in a state built around surveillance and control.', '#ad5b4e'),
  ('bluest-eye', 'The Bluest Eye', 'Toni Morrison', 1970, '9780307278449', 'civilization', 'forbidden-shelves', 'A young girl’s story exposes the damage wrought by racism and narrow ideals of beauty.', '#795e77'),
  ('persepolis', 'Persepolis', 'Marjane Satrapi', 2000, '9780375714573', 'civilization', 'forbidden-shelves', 'A graphic memoir follows a girl growing up through revolution, war, and exile.', '#565a61'),
  ('no-one-talking', 'No One Is Talking About This', 'Patricia Lockwood', 2021, '9780593189588', 'digital', 'substack-longform-pioneers', 'A novelist traces how life online remakes language, attention, and intimacy.', '#967da0'),
  ('trick-mirror', 'Trick Mirror', 'Jia Tolentino', 2019, '9780525510567', 'digital', 'substack-longform-pioneers', 'Nine essays examine the stories and incentives shaping life online.', '#967da0'),
  ('anthropocene-reviewed', 'The Anthropocene Reviewed', 'John Green', 2021, '9780525555216', 'digital', 'substack-longform-pioneers', 'A series of personal essays reviews everyday things against the scale of human history.', '#618f83'),
  ('song-of-achilles', 'The Song of Achilles', 'Madeline Miller', 2011, '9780062060624', 'digital', 'algorithmic-blockbusters', 'A reimagining of the Iliad told through the bond between Patroclus and Achilles.', '#b47c66')
on conflict (id) do nothing;

alter table public.books alter column subcategory set not null;
alter table public.books add constraint books_subcategory_check check (
  (pillar = 'screen' and subcategory in ('launchpad', 'oscar-gold-standard', 'streaming-universe')) or
  (pillar = 'civilization' and subcategory in ('blueprints-of-power', 'scientific-paradigm-shifts', 'forbidden-shelves')) or
  (pillar = 'digital' and subcategory in ('substack-longform-pioneers', 'algorithmic-blockbusters'))
);