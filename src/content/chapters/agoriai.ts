/**
 * Agoriai's chapter, grounded in the Agoriai repository (backend/src/index.ts, backend/src/db/schema.ts,
 * backend/src/db/seed.ts, frontend/src/pages/Nexus.tsx, frontend/src/components/ui/GlassShatterOverlay.tsx) and
 * output/chapter-assets/agoriai.md, as recorded on 2026-10-11. The constellation is the app's own /api/graph
 * response for its seed data. No copy repeats the portfolio's relationship-signal or edge counts, which the
 * repository does not support, and none says the visibility levels cover every response, since the user endpoints
 * return school and year at every level. The levels are claimed for posts and comments only.
 */
import type { ChapterStory } from '../../components/chapter/types.ts'

export const AGORIAI: ChapterStory = {
  id: 'agoriai',
  name: 'Agoriai',
  titleNoun: 'network',
  acts: [
    {
      key: 'arrival',
      span: 1.6,
      backdrop: 0,
      lines: [
        'agoriai',
        'An anonymous career network for students.',
        'Students sign up with a school email and get a generated alias. They share interview experiences, ask questions, look up companies, and message each other without giving up their names. This constellation is the app’s Nexus graph, built from what its API returns for the demo data: 8 companies, 8 students, and 25 weighted links.',
      ],
      callouts: [],
    },
    // SwiftCedar leaves the graph by 0.24 of the act and the messages pane is in place by 0.4. The pane breaks on
    // its own from 0.74 if the reader has not clicked it. The rest point sits before that, with both in view.
    {
      key: 'identity',
      span: 2.8,
      backdrop: null,
      eyebrow: 'who you are',
      lines: [
        'Every account starts anonymous, and its owner decides how much to show.',
        'The alias stays the display name. Role adds a field of interest, school adds the university and graduation year, and real name adds the name beside the alias. Posts and comments follow the level.',
        'Messages have a second lock. Either person can ask to reveal, and real names appear only once the other accepts. The app breaks a pane of glass into 28 shards when they do.',
      ],
      choices: [
        { label: 'anonymous', command: 'tier', value: 'anonymous' },
        { label: 'role', command: 'tier', value: 'role' },
        { label: 'school', command: 'tier', value: 'school' },
        { label: 'real name', command: 'tier', value: 'realName' },
      ],
      callouts: [
        { text: 'Pick a level to open the shells', anchor: 'orb' },
        { text: 'Click the glass to accept the reveal', anchor: 'glass' },
      ],
    },
    // The two components are apart by 0.4 of the act, and the readout has typed by about 0.4.
    {
      key: 'nexus',
      span: 2.6,
      backdrop: 1,
      eyebrow: 'the nexus',
      lines: [
        'The Nexus draws students and companies as one network.',
        'A link takes its weight from the connection between two nodes, and each post a student writes about a company adds one more, up to 10. A keyword classifier sorts every node into a sector, and the demo data falls into two islands: tech, and finance with consulting.',
      ],
      // The live response and the force constants of the app's D3 layout (Nexus.tsx), where n is the node count and
      // r a node's radius in px.
      readout: [
        'GET /api/graph → 16 nodes, 25 links',
        'link distance = clamp(170 − 1.8n, 90, 200) / weight',
        'charge = −(12r + 110), collide = r + 26',
      ],
      callouts: [
        { text: 'Hover a node to light its neighbours', anchor: 'hub' },
        { text: 'Click a node to pluck its links', anchor: 'pluck' },
      ],
    },
    // The graph has sunk into its tables by 0.3 of the act, and the scrolled request lands back on its screen by
    // 0.64. The rest point holds the finished trip with its tables lit.
    {
      key: 'stack',
      span: 2.8,
      backdrop: null,
      eyebrow: 'the stack',
      lines: [
        'Under the graph sit three layers.',
        'A React 19 client calls one Elysia server on Bun, which answers 36 routes under /api from 13 PostgreSQL tables through Drizzle ORM. Sessions are random bearer tokens, and the server keeps only their SHA-256 hash.',
      ],
      choices: [
        { label: 'GET /api/posts', command: 'request', value: 'posts' },
        { label: 'GET /api/graph', command: 'request', value: 'graph' },
        { label: 'POST …/identity/request', command: 'request', value: 'reveal' },
      ],
      callouts: [{ text: 'Pick a request to send it', anchor: 'route' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'the build',
      lines: [
        'Built with teammates at TartanHacks 2026, and published by Rusty Wild Whales under the MIT licence.',
        'Posts, comments, tags, and messages pass a moderation check before they save. It undoes leetspeak, strips invisible characters, and catches longer words spelled one letter off.',
      ],
      callouts: [],
    },
  ],
  restLocal: [0.65, 0.6, 0.62, 0.72, 0.5],
  // The composite centres its window on each focus point. The hall keeps the lit row of laptops in frame, and the
  // quad keeps the two lamps and the crossing paths.
  backdrops: [
    { src: '/Agoriai/chapter/rooms/hackathon-hall.webp', focus: [0.48, 0.5], levels: [0.07, 0.8] },
    { src: '/Agoriai/chapter/rooms/campus-quad.webp', focus: [0.5, 0.5], levels: [0.05, 0.7] },
  ],
  // The scene finds each label by its text, so these strings must match the scene's: the 16 node labels of
  // nexus-graph.json, the two islands, SwiftCedar's four fields, the three layers, and the 13 tables of schema.ts.
  panels: [
    'Google', 'Goldman Sachs', 'McKinsey & Company', 'Meta', 'JPMorgan Chase', 'Apple', 'Boston Consulting Group', 'Stripe',
    'StellarPenguin', 'QuietMaple', 'BrightLantern', 'CosmicFalcon', 'SwiftCedar', 'GentlePrism', 'BoldCompass', 'VividHarbor',
    'tech · 4 companies, 5 students', 'finance and consulting · 4 companies, 3 students',
    'alias · SwiftCedar', 'field · finance', 'school · Harvard, 2025', 'name · Jamie Rivera',
    'client · React 19', 'server · Elysia on Bun', 'database · PostgreSQL',
    'users', 'auth_accounts', 'auth_sessions', 'companies', 'internships', 'posts', 'comments', 'post_votes',
    'comment_votes', 'connections', 'conversations', 'conversation_participants', 'messages',
  ],
  tags: ['React 19', 'TypeScript', 'D3', 'Tailwind CSS', 'Bun', 'Elysia', 'Drizzle ORM', 'PostgreSQL'],
  links: [{ label: 'source', href: 'https://github.com/Rusty-Wild-Whales/Agoriai' }],
  poster: { src: '/Agoriai/chapter/poster.webp', alt: 'The Agoriai Nexus graph as a constellation: glass solids for companies and glowing orbs for students, joined by lines of light' },
  theme: {
    fontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    // The app's own faces: Fraunces for the lowercase wordmark and Manrope for its interface (frontend/src/index.css).
    vars: {
      '--ch-title': '"Fraunces", Georgia, serif',
      // Fraunces sets narrower than the default mono title, so the wordmark scales up to hold the same measure.
      '--ch-title-scale': '1.18',
      '--ch-title-weight': '600',
      '--ch-title-tracking': '-0.025em',
      '--ch-body': '"Manrope", system-ui, sans-serif',
      '--ch-label': '"IBM Plex Mono", monospace',
      '--ch-label-tracking': '0.12em',
      '--ch-accent': '#f5a524',
      '--ch-ink': '#e6edfb',
      '--ch-panel': 'rgba(8, 15, 34, 0.76)',
      '--ch-hairline': 'rgba(96, 150, 255, 0.42)',
    },
    // An electric blue decode and edge floor (#4c8bff, the project's accent, lifted a little for the glyphs), and
    // the rooms' ink graded toward blue so the hall's screens and the quad's dusk read cold.
    tint: [0.1, 0.3, 1.0],
    grade: [0.84, 0.97, 1.2],
  },
  scene: () => import('../../components/chapter/scenes/agoriai.ts'),
}
