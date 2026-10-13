/**
 * The Coding Minds Academy role's journey. The arrival describes the product or organization alone, in the project
 * chapters' voice, and never Jesse's part in it. The work and impact acts hold only his own work, each line opening
 * on its verb in resume voice. Every claim about the work comes from the role's entry in portfolio.json.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const CODING_MINDS: RoleStory = {
  id: 'coding-minds',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'Coding Minds Academy',
        'Instructor',
        'Coding Minds Academy is a coding school, with classes in Python, C++, and JavaScript.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'curriculum',
      lines: [
        'Designed a project-based curriculum on algorithms and competitive problem solving.',
        'Built each lesson as a structured lab where students implement the algorithm themselves.',
      ],
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
      lines: ['Taught the labs in the classroom.'],
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
