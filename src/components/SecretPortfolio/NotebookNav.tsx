import { motion } from 'framer-motion'

export type SectionId = 'projects' | 'about' | 'skills' | 'archive' | 'contact'

interface NotebookNavProps {
  active: SectionId
  onNavigate: (id: SectionId) => void
}

const tabs: { id: SectionId; label: string; shortLabel: string; pageNum: number }[] = [
  { id: 'projects', label: 'Projects', shortLabel: 'Proj.', pageNum: 1 },
  { id: 'about', label: 'About', shortLabel: 'About', pageNum: 2 },
  { id: 'skills', label: 'Skills', shortLabel: 'Skills', pageNum: 3 },
  { id: 'archive', label: 'Archive', shortLabel: 'Arch.', pageNum: 4 },
  { id: 'contact', label: 'Contact', shortLabel: 'End', pageNum: 5 },
]

const tabOffsets = [0, -0.5, 0.3, -0.2, 0.4]

export default function NotebookNav({ active, onNavigate }: NotebookNavProps) {
  return (
    <nav className="sp-nav" aria-label="Notebook sections">
      <div className="sp-nav__tabs">
        {tabs.map((tab, i) => (
          <motion.button
            key={tab.id}
            className={`sp-nav__tab ${active === tab.id ? 'sp-nav__tab--active' : ''}`}
            onClick={() => onNavigate(tab.id)}
            style={{ '--tab-offset': `${tabOffsets[i]}deg` } as React.CSSProperties}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            <span className="sp-nav__tab-num">{tab.pageNum}</span>
            <span className="sp-nav__tab-label">{tab.label}</span>
            <span className="sp-nav__tab-short">{tab.shortLabel}</span>
          </motion.button>
        ))}
      </div>
    </nav>
  )
}
