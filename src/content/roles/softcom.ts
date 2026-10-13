/**
 * Exercise-assessment research and publication, grounded in the supplied resumes. Accuracy is limited to the
 * controlled video trials; the copy makes no clinical-outcome claim.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SOFTCOM: RoleStory = {
  id: 'softcom',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: [
        'SoftCom Lab, Cal Poly Pomona',
        'Machine Learning Research Intern',
        'Research into using computer vision to give people living with Parkinson’s feedback on exercise form, as part of a mobile care platform.',
      ],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'understanding the movement',
      lines: [
        'Developed and evaluated a model that follows body keypoints through exercise videos to assess form.',
        'Tracking the shoulders, elbows, and knees lets the model follow how a movement unfolds over time.',
      ],
      readout: ['95.4% mean accuracy in controlled video trials'],
      callouts: [
        { text: 'Hover a joint to see what is tracked', anchor: 'joint' },
        { text: 'Tap the figure to watch a repetition', anchor: 'figure' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'sharing the research',
      lines: [
        'Published a peer-reviewed paper as first author at CS & IT-CSCP 2024, describing the mobile platform and its approach to exercise assessment for Parkinson’s care.',
      ],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.8],
  room: { src: '/roles/rooms/softcom.webp', focusX: 0.35 },
  // The keypoint names in the scene's skeleton order, one shown at a time for the hovered keypoint.
  panels: ['nose', 'left shoulder', 'right shoulder', 'left elbow', 'right elbow', 'left wrist', 'right wrist', 'left hip', 'right hip', 'left knee', 'right knee', 'left ankle', 'right ankle'],
  // A mint decode, and the room's ink graded toward mint.
  look: { tint: [0.22, 0.95, 0.72], grade: [0.82, 1.06, 1.0] },
  links: [],
  poster: { src: '/roles/softcom/poster.webp', alt: 'A wooden mannequin raising both arms under a pose skeleton on a mint-gridded stage, filmed by a phone on a tripod, beside a gauge at 95.4% mean accuracy and the published paper' },
  scene: () => import('../../components/roles/scenes/softcom.ts'),
}
