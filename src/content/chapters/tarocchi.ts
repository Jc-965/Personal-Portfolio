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
        'A tarot reading told as a pixel-art journey.',
        'A wizard named Maestro Tarocchi asks for a spread and a question, then walks you through illustrated scenes where every choice is yours. At the end the cards are dealt, and Claude reads them against your question and the paths you took.',
      ],
      callouts: [],
    },
    // The relief stands from about 0.34 of the act, the loop is whole from 0.55 to 0.68, and the voxels are home by
    // 0.96. The rest point sits on the loop.
    {
      key: 'magician',
      span: 2.6,
      backdrop: null,
      eyebrow: 'the magician',
      lines: [
        'Every card is pixel art from PixelTarot, a deck drawn by Sarah Seekins.',
        'Each of the 78 cards can come up upright or reversed, and each way has its own meaning.',
      ],
      callouts: [
        { text: 'Move across the figure to part it', anchor: 'head' },
        { text: 'Click it to scatter the pixels', anchor: 'robe' },
      ],
    },
    // The fifth card is face up by 0.78 of the act, and the spread rests there until the branches act takes it in.
    {
      key: 'spread',
      span: 2.8,
      backdrop: 0,
      eyebrow: 'the spread',
      lines: [
        'The spread decides the shape of the reading.',
        'Three-Card reads the past, the present, and the future. Compass reads four directions. The V reads a choice, and where each side of it leads.',
      ],
      choices: [
        { label: 'Three-Card', command: 'spread', value: 'three' },
        { label: 'Compass', command: 'spread', value: 'compass' },
        { label: 'V spread', command: 'spread', value: 'v' },
      ],
      callouts: [{ text: 'Click a card to turn it', anchor: 'deal' }],
    },
    {
      key: 'branches',
      span: 2.6,
      backdrop: 1,
      eyebrow: 'the journey',
      lines: [
        'Then the reading becomes a walk.',
        'You visit one scene for each card, drawn at random from five: a castle, a cave, a city, a forest, and the countryside. Each scene asks a question and offers three paths, and the one you pick is kept for the reading.',
      ],
      // The reducer's own actions for a Compass reading, in order (gameReducer.ts).
      readout: [
        'SET_SPREAD 2 → compass, 4 scenes',
        'BEGIN_SCENES → shuffle 5, keep 4',
        'NEXT_SCENE "Follow the flicker of distant lantern light"',
        'stage → result, 4 choices kept',
      ],
      callouts: [{ text: 'Hover a scene to step into it', anchor: 'scene' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'the reading',
      lines: [
        'Maestro Tarocchi reads it back.',
        'A small Express server sends your question, your choices, and the dealt cards to Claude Sonnet 4, which answers in the voice of a witty but grounded tarot reader.',
        'Built in two days at HackCMU 2025 by a team of four, with React, TypeScript, Vite, and Tailwind CSS.',
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
  links: [{ label: 'source', href: 'https://github.com/Rusty-Wild-Whales/Tarocchi' }],
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
