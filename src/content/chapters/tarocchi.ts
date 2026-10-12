/**
 * Tarocchi's chapter, grounded in the Tarocchi repository (gameReducer.ts, SelectPage.tsx, ResultPage.tsx,
 * ClaudeChat.tsx, claude-backend/server.js, MusicPlayer.tsx) as recorded on 2026-10-11. The deal is random and
 * ignores the player's choices, which reach Claude with the question and the cards. The audio is one looping
 * track, so no copy calls it synchronized. The card art is Sarah Seekins's PixelTarot pack, used as edited
 * derivatives under its licence and credited on the close act.
 */
import type { ChapterStory } from '../../components/chapter/types.ts'

export const TAROCCHI: ChapterStory = {
  id: 'tarocchi',
  name: 'Tarocchi',
  titleNoun: 'reading',
  acts: [
    {
      key: 'arrival',
      span: 1.6,
      backdrop: 0,
      lines: [
        'Tarocchi',
        'A tarot game that turns a personal question into a short adventure.',
        'A pixel-art guide leads players through illustrated scenes before revealing their cards. Claude uses the question, the cards, and the choices made along the way to write a reading that reflects the journey.',
      ],
      callouts: [],
    },
    // The relief stands from about 0.34 of the act, the loop is whole from 0.55 to 0.68, and the voxels are home by
    // 0.96. The rest point sits on the loop.
    {
      key: 'magician',
      span: 2.6,
      backdrop: null,
      eyebrow: 'the cards',
      lines: [
        'The deck has 78 cards, each with upright and reversed meanings.',
        'PixelTarot artwork by Sarah Seekins gives the cards their visual style. CSS transforms and animation add tilting cards, drifting backgrounds, and particles.',
      ],
      callouts: [
        { text: 'Hover to separate the pixels', anchor: 'head' },
        { text: 'Click to scatter the card', anchor: 'robe' },
      ],
    },
    // The fifth card is face up by 0.78 of the act, and the spread rests there until the branches act takes it in.
    {
      key: 'spread',
      span: 2.8,
      backdrop: 0,
      eyebrow: 'choosing a spread',
      lines: [
        'Three spreads give the reading a different focus.',
        'The Three-Card spread looks at past, present, and future. Compass explores what’s behind and ahead, while the V spread compares two possible choices and their outcomes.',
      ],
      choices: [
        { label: 'Three-Card', command: 'spread', value: 'three' },
        { label: 'Compass', command: 'spread', value: 'compass' },
        { label: 'V spread', command: 'spread', value: 'v' },
      ],
      callouts: [{ text: 'Click a card to reveal it', anchor: 'deal' }],
    },
    {
      key: 'branches',
      span: 2.6,
      backdrop: 1,
      eyebrow: 'following the story',
      lines: [
        'The route is shuffled from five illustrated settings, from a castle to the countryside.',
        'Each scene offers three choices. A React reducer keeps the spread, scene order, and answers in one shared state, so they arrive together at the final reading.',
      ],
      // gameReducer.ts chooses the scene count from the spread and carries every answer to the result.
      readout: [
        '3, 4, or 5 scenes per reading',
        'Scene order shuffled each time',
        'Choices carried into the final reading',
      ],
      callouts: [{ text: 'Hover to preview a setting', anchor: 'scene' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'bringing the reading together',
      lines: [
        'The final reading connects the cards with the player’s question and choices.',
        'An Express backend passes that context to Claude, which writes the reading in Maestro Tarocchi’s voice. The cards are drawn at random; the choices shape how they’re interpreted.',
        'Built by a team of four in two days at HackCMU 2025.',
      ],
      callouts: [],
    },
  ],
  restLocal: [0.65, 0.62, 0.86, 0.62, 0.5],
  // The composite centres its window on each focus point. The table keeps the candles and the crystal ball in frame,
  // and the archway keeps its opening. The five scenes are the app's own backdrops, which a hovered plate shows.
  backdrops: [
    { src: '/Tarocchi/chapter/rooms/table.webp', focus: [0.55, 0.55], levels: [0.06, 0.62] },
    { src: '/Tarocchi/chapter/rooms/archway.webp', focus: [0.42, 0.55], levels: [0.04, 0.5] },
    { src: '/Tarocchi/chapter/scenes/castle.webp', focus: [0.5, 0.5], levels: [0.04, 0.6] },
    { src: '/Tarocchi/chapter/scenes/cave.webp', focus: [0.5, 0.5], levels: [0.04, 0.45] },
    { src: '/Tarocchi/chapter/scenes/city.webp', focus: [0.5, 0.5], levels: [0.06, 0.6] },
    { src: '/Tarocchi/chapter/scenes/forest.webp', focus: [0.5, 0.5], levels: [0.04, 0.42] },
    { src: '/Tarocchi/chapter/scenes/rural.webp', focus: [0.5, 0.55], levels: [0.06, 0.7] },
  ],
  // Panel order is the scene's: the Three-Card slots, the Compass slots (south, west, east, north), the V slots
  // (root, then each choice and its outcome), then the five scenes in SCENES order.
  panels: [
    'Past', 'Present', 'Future',
    'South · your past', 'West · left behind', 'East · what awaits', 'North · the advice',
    'Root', 'Choice A', 'Outcome A', 'Choice B', 'Outcome B',
    'Castle', 'Cave', 'City', 'Forest', 'Countryside',
  ],
  tags: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Claude API', 'Express'],
  links: [{ label: 'View source', href: 'https://github.com/Rusty-Wild-Whales/Tarocchi' }],
  credit: 'Card art by Sarah Seekins (cheepixel.art)',
  poster: { src: '/Tarocchi/chapter/poster.webp', alt: 'The Magician card from Tarocchi, its pixels lifted into a relief above the card' },
  theme: {
    fontsHref: 'https://fonts.googleapis.com/css2?family=Jacquard+24&family=Alegreya:ital,wght@0,500;0,600;1,500&family=Pixelify+Sans:wght@500;600&display=swap',
    vars: {
      // A pixel blackletter title, a sturdy old-book serif for the copy, and a pixel sans for labels and buttons.
      '--ch-title': '"Jacquard 24", serif',
      '--ch-title-scale': '1.2',
      '--ch-title-weight': '400',
      '--ch-title-tracking': '0.01em',
      '--ch-body': '"Alegreya", Georgia, serif',
      '--ch-label': '"Pixelify Sans", monospace',
      '--ch-label-tracking': '0.06em',
      '--ch-accent': '#e8c26a',
      '--ch-ink': '#f1e9ff',
      '--ch-panel': 'rgba(20, 10, 34, 0.72)',
      '--ch-hairline': 'rgba(232, 194, 106, 0.38)',
    },
    // A violet decode and edge floor, and the room's ink graded toward purple, for the reading table's candlelight.
    tint: [0.55, 0.36, 1.0],
    grade: [1.0, 0.86, 1.16],
  },
  scene: () => import('../../components/chapter/scenes/tarocchi.ts'),
}
