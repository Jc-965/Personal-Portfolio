/**
 * The SoftCom Lab role's journey. Its copy restates the role's resume entry and adds nothing the entry does not
 * say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SOFTCOM: RoleStory = {
  id: 'softcom',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['SoftCom Lab, Cal Poly Pomona', 'Machine Learning Research Intern'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'computer vision',
      lines: ['A computer-vision model that assesses Parkinson\'s exercises.'],
      readout: ['95.4% mean accuracy', 'controlled video trials'],
      callouts: [
        { text: 'Hover a keypoint to name it', anchor: 'joint' },
        { text: 'Click the figure for a rep', anchor: 'figure' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'published',
      lines: ['First author of a peer-reviewed paper (CS & IT-CSCP 2024) on a mobile platform for Parkinson\'s care.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.8],
  room: { src: '/roles/rooms/softcom.webp', focusX: 0.35 },
  // The keypoint names in the scene's skeleton order, one shown at a time for the hovered keypoint.
  panels: ['nose', 'left shoulder', 'right shoulder', 'left elbow', 'right elbow', 'left wrist', 'right wrist', 'left hip', 'right hip', 'left knee', 'right knee', 'left ankle', 'right ankle'],
  // A mint decode, and the room's ink graded toward mint.
  look: { tint: [0.22, 0.95, 0.72], grade: [0.82, 1.06, 1.0] },
  links: [{ label: 'read the paper', href: 'https://aircconline.com/csit/abstract/v14n17/csit141723.html' }],
  poster: { src: '/roles/softcom/poster.webp', alt: 'A wooden mannequin raising both arms under a pose skeleton on a mint-gridded stage, filmed by a phone on a tripod, beside a gauge at 95.4% mean accuracy and the published paper' },
  scene: () => import('../../components/roles/scenes/softcom.ts'),
}
