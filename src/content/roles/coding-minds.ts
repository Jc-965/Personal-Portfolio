/**
 * Curriculum design and teaching, grounded in portfolio.json. No student outcome metrics are claimed.
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
        'Students learn algorithms and competitive problem solving by building projects in Python, C++, and JavaScript.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'learning by building',
      lines: [
        'Designed the curriculum around structured coding labs, turning algorithm concepts into programs students could write and run themselves.',
        'Each lesson connects the idea behind an algorithm to the code that makes it work.',
      ],
      choices: [
        { label: 'Bubble sort', command: 'algorithm', value: 'sort' },
        { label: 'Breadth-first search', command: 'algorithm', value: 'bfs' },
        { label: 'Binary search', command: 'algorithm', value: 'search' },
      ],
      callouts: [
        { text: 'Choose a book to change the language', anchor: 'books' },
        { text: 'Tap the chalk to try another input', anchor: 'chalk' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'putting ideas into practice',
      lines: ['Taught the labs with a focus on problem solving: choosing an approach, writing the code, and understanding why it works.'],
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
