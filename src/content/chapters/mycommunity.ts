/**
 * MyCommunity's chapter, grounded in the MyCommunity repository (MapFragment.java, MyTroopActivity.java,
 * LoginActivity.java, BaseActivity.java, Troop.java, FirebaseUtil.java, NewsActivity.java, app/build.gradle,
 * res/values/strings.xml) as recorded in output/chapter-assets/mycommunity.md on 2026-10-11. The database rules
 * deny the app's reads, since it never signs in to Firebase Auth, so no copy says the map is live or populated: it
 * describes what the code does with each troop. Profiles are created and updated but never deleted. The troop names
 * and places on the map are decorative, and the repository is private, so the chapter carries no source link.
 */
import type { ChapterStory } from '../../components/chapter/types.ts'

export const MYCOMMUNITY: ChapterStory = {
  id: 'mycommunity',
  name: 'MyCommunity',
  titleNoun: 'trail map',
  acts: [
    {
      key: 'arrival',
      span: 1.6,
      backdrop: 0,
      lines: [
        'MyCommunity',
        'An Android prototype for finding Scout troops and planning community service.',
        'MyCommunity brings a troop map, service organizations, and current news into one app. It’s designed to help families find a troop and give leaders a starting point for their next service project.',
      ],
      callouts: [],
    },
    // The creases open from 0.06 to 0.48 of the act, the half fold from 0.38 to 0.54, and the land rises from 0.5
    // to 0.78. The rest point sits on the risen land.
    {
      key: 'unfold',
      span: 2.8,
      backdrop: 1,
      eyebrow: 'finding a troop',
      lines: [
        'The troop map is the first stop, with or without an account.',
        'Google Maps provides the location view. Access to the phone’s location is optional, so families can explore the app before sharing a location or signing in.',
      ],
      callouts: [{ text: 'Move over the map to explore the terrain', anchor: 'summit' }],
    },
    // The pins drop from 0.08 to 0.47 of the act, and the act rests with every pin down.
    {
      key: 'troops',
      span: 2.8,
      backdrop: null,
      eyebrow: 'troop profiles on the map',
      lines: [
        'Troop profiles connect names and contact details to a place on the map.',
        'The Firebase listener is designed to update the pins when a troop record changes. The map fits the available troops into view and marks the leader’s own troop in blue.',
        'The locations shown here are sample troops.',
      ],
      choices: [
        { label: 'Several troops', command: 'troops', value: 'many' },
        { label: 'One troop', command: 'troops', value: 'one' },
        { label: 'No troops', command: 'troops', value: 'none' },
      ],
      callouts: [{ text: 'Select a pin to focus on a troop', anchor: 'pin' }],
    },
    // The signs stand from 0.1 to 0.61 of the act, and the readout types in across it.
    {
      key: 'app',
      span: 2.6,
      backdrop: 0,
      eyebrow: 'planning a service project',
      lines: [
        'Service listings and a news feed offer starting points for choosing a project.',
        'Leaders can explore organizations to volunteer with, read current news, and keep a troop’s description, contact email, and location together in its profile.',
      ],
      // BaseActivity's navigation, VolunteerActivity's five static listings, and the profile sign-in flow.
      readout: [
        '4 sections for troops and service',
        '5 service organizations to explore',
        'Google Sign-In for troop profiles',
      ],
      callouts: [{ text: 'Hover to explore a screen', anchor: 'sign' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'how it’s built',
      lines: [
        'Built as a native Android app in Java.',
        'Google Maps handles the map, and Firebase provides the troop data model and listeners. The news feed uses OkHttp and Gson to load New York Times stories, with Glide caching article images.',
      ],
      callouts: [],
    },
  ],
  restLocal: [0.65, 0.82, 0.6, 0.66, 0.55],
  // The trailhead keeps its lantern, tent, and blank sign in frame. The map table keeps the folded map, the compass,
  // and the neckerchief.
  backdrops: [
    { src: '/MyCommunity/chapter/rooms/trailhead.webp', focus: [0.6, 0.55], levels: [0.03, 0.5] },
    { src: '/MyCommunity/chapter/rooms/map-table.webp', focus: [0.5, 0.55], levels: [0.04, 0.55] },
  ],
  // Panel order is the scene's: the eight decorative troops in TROOPS order, then the four screens in SCREENS order.
  panels: [
    'Troop 12 · Cedar Ridge',
    'Troop 41 · your troop',
    'Troop 77 · Lantern Lake',
    'Troop 104 · Birch Hollow',
    'Troop 215 · Fox Run',
    'Troop 308 · Granite Falls',
    'Troop 9 · Pine Bluff',
    'Troop 560 · Elk Meadow',
    'Welcome',
    'Troop Map',
    'Community Service',
    'My Troop',
  ],
  tags: ['Java', 'Android', 'Google Maps', 'Firebase', 'Google Sign-In', 'OkHttp', 'Gson', 'Glide'],
  links: [],
  poster: { src: '/MyCommunity/chapter/poster.webp', alt: 'A paper trail map unfolded into raised terrain, with red troop pins and one azure pin standing on it' },
  theme: {
    fontsHref: 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800&family=Bitter:ital,wght@0,400;0,600;1,400&family=Overpass+Mono:wght@400;600&display=swap',
    vars: {
      '--ch-title': '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif',
      // Big Shoulders is a condensed face and sets about 0.8 times as wide as the default title face.
      '--ch-title-scale': '1.25',
      '--ch-title-weight': '800',
      '--ch-title-tracking': '0.02em',
      '--ch-body': '"Bitter", Georgia, serif',
      '--ch-label': '"Overpass Mono", monospace',
      '--ch-accent': '#e2774a',
      '--ch-ink': '#f1ead9',
      '--ch-panel': 'rgba(16, 24, 14, 0.74)',
      '--ch-hairline': 'rgba(226, 119, 74, 0.4)',
    },
    // A moss-green decode and edge floor, and the room's ink graded warm, for a campsite at dusk.
    tint: [0.42, 0.6, 0.18],
    grade: [1.08, 1.0, 0.8],
  },
  scene: () => import('../../components/chapter/scenes/mycommunity.ts'),
}
