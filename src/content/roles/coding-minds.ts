/**
 * The Coding Minds Academy role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const CODING_MINDS: RoleStory = {
  id: 'coding-minds',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['Coding Minds Academy', 'Instructor'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'curriculum',
      readout: ['Python, C++, JavaScript', 'algorithms and competitive problem solving', 'structured implementation labs'],
      lines: ['Designed and taught project-based lessons.'],
      choices: [
        { label: 'bubble sort', command: 'algorithm', value: 'sort' },
        { label: 'BFS', command: 'algorithm', value: 'bfs' },
        { label: 'binary search', command: 'algorithm', value: 'search' },
      ],
      callouts: [
        { text: 'Click a book to switch the language', anchor: 'books' },
        { text: 'Click the chalk for a new input', anchor: 'chalk' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'the classroom',
      lines: ['Designed the labs and taught them.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  room: { src: '/roles/rooms/coding-minds.webp', focusX: 0.35 },
  panels: [],
  links: [],
  poster: { src: '/roles/coding-minds/poster.webp', alt: 'A cutaway classroom with bubble sort code on the chalkboard, chalk bars mid-sort in front of it, desks, an ACSL pennant, and a stack of Python, C++, and JavaScript books' },
  scene: () => import('../../components/roles/scenes/coding-minds.ts'),
}
