/**
 * The ScottyLabs AI role's journey, written in the project chapters' voice. Every claim about the work comes from
 * the role's resume entry. The other sentences say what the organization is or define a term in everyday words.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SCOTTYLABS_AI: RoleStory = {
  id: 'scottylabs-ai',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'ScottyLabs AI',
        'Head of Agent',
        'Bark is Carnegie Mellon’s campus AI assistant, built inside ScottyLabs, a 70-person student org. Leads the 25 engineers who build it, as Bark’s architect and principal author.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'grounded answers',
      lines: [
        'Bark grounds every answer in live university data.',
        'Campus maps, courses, dining, and transit each reach the model through an MCP tool, a connector it can query mid-answer. Binding only the tools a question needs, and compressing the context, cut prompt costs 44%.',
      ],
      readout: ['streams through LangGraph, FastAPI, Express, React'],
      callouts: [
        { text: 'Click a tool to ask Bark', anchor: 'tool' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'safety and memory',
      lines: [
        'A model-free guard blocks prompt injection in 300 ms.',
        'The guard was red-teamed, and it also stops prompt leaks mid-stream.',
        'Memory carries across each person’s chats in pgvector, isolated per user, which fixed a cross-tenant data leak.',
      ],
      readout: ['16 live tests for grounding and attacks'],
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
