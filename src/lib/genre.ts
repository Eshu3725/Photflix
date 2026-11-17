import { hash } from './format';
import type { Genre } from './types';

// First match wins, so more specific moods come before the catch-all travel words.
const RULES: [Genre, RegExp][] = [
  ['Romance', /wedding|marriage|engag|anniversary|honeymoon|reception|sangeet|mehndi|valentine|proposal/i],
  [
    'Celebration',
    /birthday|b-?day|party|diwali|deepavali|holi\b|christmas|xmas|new ?year|eid|pongal|onam|navratri|festival|graduation|farewell|reunion|concert/i,
  ],
  ['Family', /family|baby|kids?\b|mom|dad|grand|home|cousins?|naming|school/i],
  ['Nature', /trek|hike|hiking|mountain|forest|safari|wildlife|camp|monsoon|waterfall|lake|sunset|sunrise|garden|hills?\b/i],
  [
    'City',
    /city|street|downtown|mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|kolkata|london|paris|tokyo|new york|nyc|dubai|singapore/i,
  ],
  [
    'Adventure',
    /trip|travel|tour|vacation|holiday|road|beach|goa|island|journey|explor|weekend|getaway|ooty|munnar|kerala|manali|ladakh|bali|coast/i,
  ],
];

const TAGLINES: Record<Genre, string[]> = {
  Adventure: [
    'Some trips end. This one became a film.',
    'No itinerary survives the first great view.',
    'Every wrong turn made the final cut.',
    'Pack light. Remember everything.',
  ],
  Romance: [
    'Two people, one very good day.',
    'The part of the story everyone showed up for.',
    'Some promises deserve a big screen.',
    'It was always going to end like this.',
  ],
  Celebration: [
    'Loud, bright, and gone too fast.',
    'Everyone came. Nobody wanted to leave.',
    'One night. All the people who matter.',
    'The lights were on and so was everyone else.',
  ],
  Family: [
    'The cast you never had to audition.',
    'Ordinary days, in hindsight, were the plot.',
    'Small moments. Enormous people.',
    'Home is the whole storyline.',
  ],
  Nature: [
    'The quiet did most of the talking.',
    'Out past the signal, the good part begins.',
    'Weather permitting, and sometimes not.',
    'The view held still long enough to keep.',
  ],
  City: [
    'A million strangers and one good walk.',
    'The streets wrote this one themselves.',
    'Lights, crowds, and a camera that kept up.',
    'Every corner had a scene waiting.',
  ],
  'Slice of Life': [
    'Nothing happened. It was wonderful.',
    'The days that did not ask to be remembered.',
    'A small film about a real week.',
    'Unscripted, and better for it.',
  ],
};

export function guessGenre(title: string): Genre {
  for (const [genre, pattern] of RULES) if (pattern.test(title)) return genre;
  return 'Slice of Life';
}

export function pickTagline(title: string, genre: Genre): string {
  const lines = TAGLINES[genre];
  return lines[hash(title) % lines.length];
}

/** "IMG_2024_goa-trip" -> "Goa Trip" */
export function tidyTitle(name: string): string {
  const cleaned = name
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Untitled Film';
  if (cleaned !== cleaned.toLowerCase() && cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}
