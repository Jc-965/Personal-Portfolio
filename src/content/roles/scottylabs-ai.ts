/**
 * The ScottyLabs AI role's journey. Its copy restates the role's resume entry, the source of truth for this role,
 * and adds nothing the entry does not say.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SCOTTYLABS_AI: RoleStory = {
  id: 'scottylabs-ai',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['ScottyLabs AI', 'Head of Agent Engineering'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'bark',
      readout: ['leads 25 engineers', 'live MCP lookups: maps, courses, dining, transit', '300 ms injection guard', '16 live attack tests'],
      lines: ['Architect and principal author of Bark, CMU\'s campus AI assistant.'],
      callouts: [
        { text: 'Click a tool to ask Bark', anchor: 'tool' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'memory and cost',
      lines: ['Per-user pgvector memory, and prompt costs cut 44%.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  room: { src: '/roles/rooms/scottylabs-ai.webp', focusX: 0.35 },
  // Hover names for the scene's pick targets, in its panel order: the four MCP tools, the core, the guard, the
  // memory, the SSE pipeline's three server stages, and the chat window.
  panels: ['Maps MCP', 'Courses MCP', 'Dining MCP', 'Transit MCP', 'Bark', 'Injection guard', 'pgvector memory', 'LangGraph', 'FastAPI', 'Express', 'React client'],
  links: [],
  poster: { src: '/roles/scottylabs-ai/poster.webp', alt: 'Bark as a glowing violet core above a Scottie dog, fed by campus map, course, dining, and transit tools, answering into a chat window through an injection guard' },
  scene: () => import('../../components/roles/scenes/scottylabs-ai.ts'),
}
