/**
 * Sorcea's app experience, perceptual shade matching, and loading improvements, grounded in the supplied resumes.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const SORCEA: RoleStory = {
  id: "sorcea",
  acts: [
    {
      key: "arrival",
      span: 1.4,
      lines: [
        "Sorcea",
        "Software Engineer Intern, Mobile",
        "Sorcea helps people explore skincare and find products that suit them. The Flutter app serves more than 10,000 users. The work covered its core screens, shade matching, and loading speed.",
      ],
      callouts: [
        { text: "Home, search, and product screens", anchor: "screens" },
        { text: "Guided onboarding across seven screens", anchor: "tutorial" },
      ],
    },
    {
      key: "work",
      span: 2.6,
      eyebrow: "shade matching",
      lines: [
        "A custom color engine compares shades in CIELAB and ranks them by Delta-E, which measures how different two colors look.",
        "A Flutter CustomPainter gauge makes the results easier to read, showing the closest matches, skin-tone fit, and confidence bands.",
      ],
      // The first value is the scene's DEFAULT_TONE in components/roles/scenes/sorcea.ts.
      choices: [
        { label: "Warm beige", command: "tone", value: "#D2A07C" },
        { label: "Light beige", command: "tone", value: "#EDC9AE" },
        { label: "Warm tan", command: "tone", value: "#A97350" },
        { label: "Deep brown", command: "tone", value: "#6B4430" },
      ],
      callouts: [
        { text: "Hover or tap to try a skin tone", anchor: "solid" },
        { text: "See the match and its confidence", anchor: "gauge" },
      ],
    },
    {
      key: "impact",
      span: 1.6,
      eyebrow: "a faster app",
      lines: [
        "Rebuilt home, product, search, and onboarding from specification through release, including a 22-step tutorial.",
        "Also cut homepage load time by about 75% with parallel requests, feed prefetching, pagination, and caching.",
      ],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.85],
  room: { src: "/roles/rooms/sorcea.webp", focusX: 0.35 },
  // Rose glyphs for the vanity room, and the room's ink warmed toward rose.
  look: { tint: [1, 0.3, 0.48], grade: [1.12, 0.94, 1] },
  // Shown only while the pointer is on a phone, in the scene's SCREENS order.
  panels: ["Search", "Tutorial", "Home", "Product"],
  links: [],
  poster: {
    src: "/roles/sorcea/poster.webp",
    alt: "A vanity table with a glass cloche over a CIELAB color solid, a fan of foundation compacts, a shade gauge, four Sorcea app screens, and a jewellery box sending requests to the home screen",
  },
  scene: () => import("../../components/roles/scenes/sorcea.ts"),
};
