/**
 * The ScottyLabs AI role's journey. The arrival describes the product in a line or two, in the project chapters'
 * voice. The work and impact acts hold only Jesse's own work, each line opening on its verb in resume voice. Every
 * claim comes from the role's resume entry.
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
        'Bark is Carnegie Mellon’s campus AI assistant. It answers questions about campus maps, courses, dining, and transit from live university data, and it remembers each person across chats.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'the agent',
      lines: [
        'Lead 25 engineers as Bark’s architect and principal author.',
        'Built the LangGraph agent that grounds every answer in live university data, through MCP tools (connectors the model can query) for maps, courses, dining, and transit.',
        'Cut prompt costs 44% by giving each question only the tools it needs and compressing the model’s context.',
      ],
      readout: ['typed SSE streaming, LangGraph to React'],
      callouts: [
        { text: 'Click a tool to ask Bark', anchor: 'tool' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'safety',
      lines: [
        'Built a model-free guard that blocks prompt injection and mid-stream prompt leaks in 300 ms, then red-teamed it.',
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
