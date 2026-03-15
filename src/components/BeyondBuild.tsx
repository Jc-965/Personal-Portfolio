import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Smartphone, Clock, Music } from 'lucide-react'
import MagicBento, { type MagicBentoItem } from './MagicBento'
import useIsPhone from '../hooks/useIsPhone'

const desktopItems: MagicBentoItem[] = [
  {
    id: 'arcadia',
    icon: <Smartphone size={18} />,
    title: 'Arcadia App Development',
    subtitle: 'Developer & Treasurer',
    bullets: [
      'Helped develop a digital student ID system that improved check-ins for thousands of students.',
      'Worked closely with administrators to design features based on real student and faculty needs.',
      "Managed finances and outreach efforts, expanding the club's reach and project capacity.",
    ],
    stats: [
      { label: 'USERS', value: '2K+' },
      { label: 'EVENTS', value: '50+' },
    ],
    accent: '#3a9b95',
    feature: {
      variant: 'app',
      eyebrow: 'digital student hub',
      title: 'AHS Student App',
      tags: ['Digital ID', 'Events', 'Alerts', 'Schedule'],
      meters: [
        { label: 'Check-In', value: 'READY', level: 100 },
        { label: 'Events', value: '4 LIVE', level: 68 },
        { label: 'Notices', value: '2 NEW', level: 42 },
      ],
      notifications: ['Student ID active', 'Club Fair check-in opens at 4:30', '2 announcements just posted'],
    },
  },
  {
    id: 'eagle',
    icon: <Clock size={18} />,
    title: 'Eagle Scout',
    subtitle: 'Boy Scouts of America',
    bullets: [
      'Led the planning and construction of wooden signage and a large outdoor banner for a local elementary school.',
      'Organized volunteers and coordinated logistics to ensure safety, accuracy, and meaningful results.',
      'Mentored younger Scouts on leadership, communication, and responsibility through hands-on activities.',
    ],
    stats: [
      { label: 'HOURS', value: '200+' },
      { label: 'VOLUNTEERS', value: '15' },
    ],
    accent: '#b38e5d',
  },
  {
    id: 'clarinet',
    icon: <Music size={18} />,
    title: 'Clarinet Section Leader',
    subtitle: 'Soloist & Performer',
    bullets: [
      'Dedicated over 200 hours each year to rehearsals, performances, and coordinating with directors and peers.',
      'Led sectionals, coached younger clarinetists, and organized music for both marching and concert seasons.',
      'Performed nationally and abroad with the Pasadena Symphony and Pops, developing focus and composure under pressure.',
    ],
    stats: [
      { label: 'YEARS', value: '4' },
      { label: 'ANNUAL HRS', value: '200+' },
    ],
    accent: '#9c7fae',
  },
]

const mobileItems: MagicBentoItem[] = [
  {
    ...desktopItems[0],
    bullets: [
      'Built a digital student ID system used by thousands of students.',
      'Designed features with administrators based on real needs.',
      'Managed finances and outreach for the club.',
    ],
  },
  {
    ...desktopItems[1],
    bullets: [
      'Built signage and a banner for a local school.',
      'Organized volunteers and coordinated logistics.',
      'Mentored younger Scouts on leadership.',
    ],
  },
  {
    ...desktopItems[2],
    bullets: [
      '200+ hours yearly in rehearsals and performances.',
      'Led sectionals and coached younger players.',
      'Performed with the Pasadena Symphony and Pops.',
    ],
  },
]

export default function BeyondBuild() {
  const isPhone = useIsPhone()
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })

  return (
    <>
      <motion.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Beyond the build
        </p>
        <h2>Leadership, collaboration, and community impact</h2>
      </motion.header>

      <MagicBento
        items={isPhone ? mobileItems : desktopItems}
        textAutoHide
        enableStars={false}
        enableSpotlight
        enableBorderGlow
        enableTilt
        enableMagnetism
        clickEffect
        spotlightRadius={300}
        particleCount={12}
        glowColor="132, 0, 255"
        disableAnimations={false}
      />
    </>
  )
}
