/**
 * Bark's purpose, agent architecture, and safeguards, grounded in the supplied resumes.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SCOTTYLABS_AI: RoleStory = {
  id: "scottylabs-ai",
  acts: [
    {
      key: "arrival",
      span: 1.4,
      lines: [
        "ScottyLabs AI",
        "Head of Agent Engineering",
        "Bark helps CMU students find their way around campus, look up courses, and check dining and transit information. It brings live university data into a conversation and can pick up where an earlier chat left off.",
      ],
      callouts: [],
    },
    {
      key: "work",
      span: 2.6,
      eyebrow: "building Bark",
      lines: [
        "Leading a team of 25 engineers as Bark’s architect and principal developer.",
        "The LangGraph agent checks live campus data through MCP tools before answering. Selecting only the tools relevant to each question and trimming the input context cut prompt costs by 44%.",
      ],
      readout: ["Responses stream directly into chat"],
      callouts: [{ text: "Choose a campus tool to ask Bark", anchor: "tool" }],
    },
    {
      key: "impact",
      span: 1.6,
      eyebrow: "memory and safeguards",
      lines: [
        "The guard checks for prompt injection and leaks during streaming, with 300 ms latency and no extra model call. Bark recalls earlier chats through pgvector search.",
      ],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  room: { src: "/roles/rooms/scottylabs-ai.webp", focusX: 0.35 },
  // Hover names for the scene's pick targets, in its panel order: the four MCP tools, the core, the guard, the
  // memory, the SSE pipeline's three server stages, and the chat window.
  panels: [
    "Campus maps",
    "Course information",
    "Dining information",
    "Transit information",
    "Bark agent",
    "Injection guard",
    "Conversation memory",
    "LangGraph agent",
    "FastAPI backend",
    "Express server",
    "React chat",
  ],
  links: [],
  poster: {
    src: "/roles/scottylabs-ai/poster.webp",
    alt: "Bark as a glowing violet core above a Scottie dog, fed by campus map, course, dining, and transit tools, answering into a chat window through an injection guard",
  },
  scene: () => import("../../components/roles/scenes/scottylabs-ai.ts"),
};
