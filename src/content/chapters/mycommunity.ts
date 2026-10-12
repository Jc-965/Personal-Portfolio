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
        'Find troops. Follow community needs. Organize service.',
        'An Android app for Boy Scouts. It lets a troop leader put the troop on a shared map so scouts and families can find it, and it lists service organizations and world news to help a troop choose its next service project.',
      ],
      callouts: [],
    },
    // The creases open from 0.06 to 0.48 of the act, the half fold from 0.38 to 0.54, and the land rises from 0.5
    // to 0.78. The rest point sits on the risen land.
    {
      key: 'unfold',
      span: 2.8,
      backdrop: 1,
      eyebrow: 'the troop map',
      lines: [
        'Signing in, or choosing to browse as a guest, opens the Troop Map.',
        'It is a Google Map that starts over the middle of the contiguous United States at zoom 3.5, with zoom controls and the map toolbar turned on. Once you grant either location permission, your own position shows on it too.',
      ],
      callouts: [{ text: 'Point at the land to trace its contour', anchor: 'summit' }],
    },
    // The pins drop from 0.08 to 0.47 of the act, and the act rests with every pin down.
    {
      key: 'troops',
      span: 2.8,
      backdrop: null,
      eyebrow: 'troops as pins',
      lines: [
        "Each troop in the database becomes a pin titled with its name, and the signed-in leader's own troop is azure.",
        'The map redraws every pin whenever /Troop Details changes in Firebase, then fits several troops with 120 px of padding, zooms to level 11 on one, and returns to its starting view when there are none.',
      ],
      choices: [
        { label: 'Several troops', command: 'troops', value: 'many' },
        { label: 'One troop', command: 'troops', value: 'one' },
        { label: 'No troops', command: 'troops', value: 'none' },
      ],
      callouts: [{ text: 'Hover a pin for its name, click to center it', anchor: 'pin' }],
    },
    // The signs stand from 0.1 to 0.61 of the act, and the readout types in across it.
    {
      key: 'app',
      span: 2.6,
      backdrop: 0,
      eyebrow: 'the app',
      lines: [
        'Four screens share a bottom bar: Troop Map, Community Service, News, and My Troop. News loads the New York Times world top stories.',
        'Sign-in is Google only. Guests can browse, and a signed-in leader edits the troop, which the form checks before it saves.',
      ],
      // The writes and checks from LoginActivity.handleSignedInAccount, MyTroopActivity.showEditDialog, and
      // FirebaseUtil.sanitizeKey.
      readout: [
        'sign-in → /User/{key}',
        'save → /Troop Details/{key}',
        'key = email with . # $ [ ] / → ,',
        'name required, email valid',
        'lat [-90, 90], lng [-180, 180]',
      ],
      callouts: [{ text: 'Hover a screen to bring it forward', anchor: 'sign' }],
    },
    {
      key: 'close',
      span: 1.7,
      backdrop: 0,
      eyebrow: 'built with',
      lines: [
        'A native Android app in Java, for Android 7.0 and later.',
        'Google Maps draws the map, the app writes its users and troops to Firebase Realtime Database, and Google Sign-In handles accounts. The news feed comes from the New York Times Top Stories API through OkHttp and Gson, and Glide loads its photos.',
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
