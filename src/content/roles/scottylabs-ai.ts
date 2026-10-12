/**
 * The ScottyLabs AI Team role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SCOTTYLABS_AI: RoleStory = {
  id: 'scottylabs-ai',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['ScottyLabs AI Team', 'AI Platform Engineer', 'Apr 2026 – Present · Pittsburgh, PA'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'ai platform',
      lines: ['Launched an AI platform that grounds every answer in live university data, blocks hallucinated claims, and streams first tokens at 1.5s p95 across a LangGraph/FastAPI agent and React client.', 'Built injection-hardened cross-chat memory with LLM fact extraction, pgvector dedup, and per-user isolation, and cut prompt tokens 62% and helper-model latency 10x with query-matched MCP tool binding and context compression.'],
      callouts: [],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'built with',
      lines: ['FastAPI, LangGraph, MCP, React 19, pgvector, SSE.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  sky: { src: '/roles/skies/scottylabs-ai.webp', focusX: 0.5 },
  panels: [],
  links: [],
  poster: { src: '/roles/skies/scottylabs-ai.webp', alt: 'A floating island diorama for ScottyLabs AI Team' },
  scene: () => import('../../components/roles/scenes/scottylabs-ai.ts'),
}
