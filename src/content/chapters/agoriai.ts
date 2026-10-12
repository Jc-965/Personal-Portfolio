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
        'A place for students to share career advice and make connections.',
        'Agoriai brings interview experiences, internship discussions, and company information into one place. Students start with a generated alias, so they can join the conversation before deciding whether to share their name.',
      ],
      callouts: [],
    },
    // SwiftCedar leaves the graph by 0.24 of the act and the messages pane is in place by 0.4. The pane breaks on
    // its own from 0.74 if the reader has not clicked it. The rest point sits before that, with both in view.
    {
      key: 'identity',
      span: 2.8,
      backdrop: null,
      eyebrow: 'identity and privacy',
      lines: [
        'Students choose which details appear with their posts and comments.',
        'Four visibility settings range from an alias alone to a field of interest, school, or real name. The server applies that setting when it returns a post or comment.',
        'Sharing names in a direct message takes agreement from both people. Either can ask, and the other can accept or decline.',
      ],
      choices: [
        { label: 'Alias only', command: 'tier', value: 'anonymous' },
        { label: 'Field of interest', command: 'tier', value: 'role' },
        { label: 'School', command: 'tier', value: 'school' },
        { label: 'Real name', command: 'tier', value: 'realName' },
      ],
      callouts: [
        { text: 'Choose how much to share', anchor: 'orb' },
        { text: 'Click to preview a mutual reveal', anchor: 'glass' },
      ],
    },
    // The two components are apart by 0.4 of the act, and the readout has typed by about 0.4.
    {
      key: 'nexus',
      span: 2.6,
      backdrop: 1,
      eyebrow: 'finding connections',
      lines: [
        'Find people through the companies they’re connected to.',
        'The Nexus uses D3 to turn student connections and company discussions into an interactive map. Stronger links bring related people and companies closer together, making it easier to explore who has experience with a company.',
      ],
      // Describe the graph's inputs and keep the seed counts explicitly labelled as demo data.
      readout: [
        'Students and companies in one graph',
        'Links weighted by connections and posts',
        'Demo data: 16 nodes, 25 links',
      ],
      callouts: [
        { text: 'Hover to see connected people and companies', anchor: 'hub' },
        { text: 'Click to trace a connection', anchor: 'pluck' },
      ],
    },
    // The graph has sunk into its tables by 0.3 of the act, and the scrolled request lands back on its screen by
    // 0.64. The rest point holds the finished trip with its tables lit.
    {
      key: 'stack',
      span: 2.8,
      backdrop: null,
      eyebrow: 'how the app works',
      lines: [
        'A React interface backed by Bun, Elysia, and PostgreSQL.',
        'The backend handles discussions, company search, messaging, and identity requests through 36 API endpoints. Drizzle manages the data model, and session tokens are stored as hashes to avoid keeping the original tokens in the database.',
      ],
      choices: [
        { label: 'Discussions', command: 'request', value: 'posts' },
        { label: 'Connections', command: 'request', value: 'graph' },
        { label: 'Name reveal', command: 'request', value: 'reveal' },
      ],
      callouts: [{ text: 'Follow a request through the app', anchor: 'route' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'keeping discussions useful',
      lines: [
        'Built in 36 hours at TartanHacks 2026 and shared as open source.',
        'A custom moderation filter checks posts, comments, tags, and messages before they’re saved. It accounts for misspellings, hidden characters, and letter substitutions that can slip past a basic word list.',
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
  links: [{ label: 'View source', href: 'https://github.com/Rusty-Wild-Whales/Agoriai' }],
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
