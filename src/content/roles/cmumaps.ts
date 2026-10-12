/**
 * The CMUMaps role's journey. Its copy restates the role's entry in portfolio.json and adds nothing the
 * entry does not say. A separate copy pass revises it.
 */
import type { RoleStory } from '../../components/roles/types.ts'

export const CMUMAPS: RoleStory = {
  id: 'cmumaps',
  acts: [
    {
      key: 'arrival',
      span: 1.4,
      lines: ['CMUMaps', 'Data & Software Engineer'],
      callouts: [],
    },
    {
      key: 'work',
      span: 2.6,
      eyebrow: 'the pipeline',
      // 15K+ nodes is the role's portfolio.json figure, and the other counts come from public/roles/cmumaps/campus.json.
      readout: ['15K+ OpenStreetMap nodes', '74 buildings', '195 floors', '75 entrances'],
      lines: ['The pipeline behind CMUMaps, the campus map used by 12K+ people.'],
      callouts: [
        { text: 'Hover a building to name it', anchor: 'campus' },
      ],
    },
    {
      key: 'impact',
      span: 1.6,
      eyebrow: 'shipped',
      lines: ['Footprints, floors, and entrances, published for the map.'],
      callouts: [],
    },
  ],
  restLocal: [0.6, 0.6, 0.5],
  room: { src: '/roles/rooms/cmumaps.webp', focusX: 0.35 },
  // One label per building, in campus.json order. Wings that share a name carry their code's number.
  panels: ['Scott Hall', 'Mellon Institute', 'Porter Hall', 'Scaife Hall', 'Hamerschlag Hall', 'Wean Hall', 'Newell-Simon Hall', 'Hunt Library', 'Cohon University Center', 'Purnell Center for the Arts', 'Doherty Hall', 'Warner Hall', 'Cyert Hall', 'Roberts Engineering Hall', 'Baker Hall', 'Facilities Management Services Building', 'Collaborative Innovation Center', 'Hamburg Hall', 'Smith Hall', 'College of Fine Arts', 'Posner Hall', 'Posner Center', 'Margaret Morrison Carnegie Hall', 'Donner House', 'West Wing', 'Resnik House', 'Boss House', 'McGill House', 'Hamerschlag House', 'Scobell House', 'Welch House', 'Henderson House', 'Spirit House', 'Woodlawn Apartments', 'Roselawn Terrace 3', 'Roselawn Terrace 1', 'Roselawn Terrace 2', 'Margaret Morrison Apartments Greek Housing', 'Stever House', 'Mudge House', 'Gates & Hillman Centers', 'Greek Quad 1', 'Greek Quad 3', 'Greek Quad 2', 'Greek Quad 4', 'Alumni House', 'Greek Quad 5', 'Greek Quad 6', 'Bramer House', '4516 Henry (UTDC)', '300 S. Craig (Police)', '4616 Henry', 'Whitfield Hall', '407 S. Craig', '4615 Forbes (CTTEC)', 'Fairfax Apartments', '417 S. Craig', '205 S. Craig', '620 Henry', 'WQED Building', 'Morewood Gardens', 'Neville Apartments', 'Fifth Neville Apartments', 'Clyde House', 'Highlands Apartments', '4721 Fifth Ave (CDFD)', 'Tepper Building', 'Residence on Fifth', 'TCS Hall', 'Ansys Hall', 'Morewood E-Tower', 'Hall of the Arts', 'Fifth and Clyde House', 'Forbes Beeler Apartments'],
  links: [],
  credit: 'Campus data © OpenStreetMap contributors',
  poster: { src: '/roles/cmumaps/poster.webp', alt: 'A printed map of Carnegie Mellon\'s campus with its buildings raised from their footprints, under three floating glass map layers' },
  scene: () => import('../../components/roles/scenes/cmumaps.ts'),
}
