import PaperCard from './PaperCard'
import StickyNote from './StickyNote'
import SketchDivider from './SketchDivider'
import SketchAnnotation from './SketchAnnotation'
import ScrollRevealBlock from './ScrollRevealBlock'
import InkWash from './InkWash'

const experiences = [
  { period: 'Summer 2026', title: 'Blue Shield of California', role: 'Incoming Mobile SWE Intern', accent: '#2d7ff9' },
  { period: 'Dec 2025 – Present', title: 'Sorcea Labs', role: 'Mobile SWE Intern · 1.5K+ users', accent: '#00ffff' },
  { period: 'Sep 2025 – Present', title: 'CMUMaps', role: 'Data & Software Engineer · 142 buildings', accent: '#00ff41' },
  { period: 'Sep – Dec 2025', title: 'Game Creation Society', role: 'Core Developer · UE5 Blueprints', accent: '#ff00ff' },
  { period: 'Jun 2025 – Feb 2026', title: 'Coding Minds Academy', role: 'Instructor · Python/C++/JS', accent: '#ffcc00' },
  { period: 'Jun 2023 – Aug 2024', title: 'SoftCom Lab', role: 'Research Intern · Peer-reviewed publication', accent: '#ff3366' },
]

const coursework = [
  '15-122 Principles of Imperative Computation',
  '15-150 Principles of Functional Programming',
  '15-213 Introduction to Computer Systems',
  '21-127 Concepts of Mathematics',
  '15-112 Fundamentals of Programming',
]

export default function AboutSection() {
  return (
    <div className="sp-about">
      <ScrollRevealBlock direction="up" className="sp-about__header">
        <h2 className="sp-section-title">
          <span className="sp-section-title__marker" aria-hidden="true">§</span>
          About Me
        </h2>
        <p className="sp-section-subtitle">The person behind the projects</p>
        <SketchDivider delay={0.2} />
      </ScrollRevealBlock>

      <div className="sp-about__layout">
        {/* Profile card */}
        <ScrollRevealBlock direction="left">
          <PaperCard variant="taped" tilt={-0.8} className="sp-about__profile">
            <div className="sp-about__avatar" aria-hidden="true">
              <span className="sp-about__avatar-placeholder">JC</span>
            </div>
            <h3 className="sp-about__name">Jesse Chen</h3>
            <p className="sp-about__role">
              <SketchAnnotation text="Computer Science @ Carnegie Mellon SCS" type="underline" delay={0.4} />
            </p>
            <div className="sp-about__info-lines">
              <span className="sp-about__info-line">📍 Pittsburgh, PA</span>
              <span className="sp-about__info-line">🎓 Carnegie Mellon University</span>
              <span className="sp-about__info-line">💻 Full-Stack · Mobile · Data</span>
            </div>
          </PaperCard>
        </ScrollRevealBlock>

        {/* Bio narrative */}
        <ScrollRevealBlock direction="right" delay={0.1}>
          <PaperCard variant="clean" className="sp-about__bio">
            <h3 className="sp-about__bio-heading">Background</h3>
            <p className="sp-about__bio-text">
              I'm a CS student at Carnegie Mellon who builds things to understand them. My work
              spans from interactive frontends and mobile health platforms to geospatial data
              pipelines and game systems — I'm most excited when a project needs both technical
              depth and thoughtful design.
            </p>
            <p className="sp-about__bio-text">
              I've shipped production Flutter apps at Sorcea Labs, built Python data pipelines
              for CMUMaps, created Unreal Engine 5 gameplay systems with Game Creation Society,
              and published peer-reviewed research on Parkinson's mobile-health analysis at
              SoftCom Lab.
            </p>
            <p className="sp-about__bio-text">
              Outside of code, I was a clarinet section leader and soloist who performed with the
              Pasadena Symphony and Pops, and I earned Eagle Scout through BSA. This portfolio
              itself is an experiment in creative engineering — and you found the secret part.
            </p>
          </PaperCard>
        </ScrollRevealBlock>
      </div>

      {/* Margin sticky notes */}
      <div className="sp-about__margin-notes">
        <ScrollRevealBlock direction="scale" delay={0}>
          <StickyNote color="yellow" tilt={1.5}>
            <p className="sp-about__margin-text">
              <strong>Next up:</strong> Incoming Mobile SWE Intern at Blue Shield of California
              for Summer 2026, working on healthcare mobile technology.
            </p>
          </StickyNote>
        </ScrollRevealBlock>

        <ScrollRevealBlock direction="scale" delay={0.08}>
          <StickyNote color="blue" tilt={-0.8}>
            <p className="sp-about__margin-text">
              <strong>Fun fact:</strong> This secret portfolio was triggered by tapping the field
              folio counter 5 times. You found it.
            </p>
          </StickyNote>
        </ScrollRevealBlock>

        <ScrollRevealBlock direction="scale" delay={0.16}>
          <StickyNote color="green" tilt={0.6}>
            <p className="sp-about__margin-text">
              <strong>Currently:</strong> SWE Intern at Sorcea Labs (Flutter/Dart, 1.5K+ users),
              Data Engineer at CMUMaps (142 buildings, 1.2K+ paths).
            </p>
          </StickyNote>
        </ScrollRevealBlock>
      </div>

      <InkWash variant="fold" />

      {/* ── Experience Timeline ── */}
      <ScrollRevealBlock direction="up" className="sp-about__timeline-section">
        <h3 className="sp-about__timeline-heading">Experience Timeline</h3>
        <SketchDivider />
        <div className="sp-about__timeline">
          <div className="sp-about__timeline-line" aria-hidden="true" />
          {experiences.map((exp, i) => (
            <ScrollRevealBlock
              key={exp.title}
              direction={i % 2 === 0 ? 'left' : 'right'}
              delay={i * 0.06}
              className="sp-about__timeline-entry"
            >
              <div className="sp-about__timeline-dot" style={{ borderColor: exp.accent }} aria-hidden="true" />
              <div className="sp-about__timeline-content">
                <span className="sp-about__timeline-period">{exp.period}</span>
                <strong className="sp-about__timeline-title">{exp.title}</strong>
                <span className="sp-about__timeline-role">{exp.role}</span>
              </div>
            </ScrollRevealBlock>
          ))}
        </div>
      </ScrollRevealBlock>

      <InkWash variant="bleed" />

      {/* ── Coursework ── */}
      <ScrollRevealBlock direction="up" className="sp-about__coursework-section">
        <PaperCard variant="worn" tilt={0.4} className="sp-about__coursework-card">
          <h3 className="sp-about__coursework-heading">Relevant Coursework</h3>
          <ul className="sp-about__coursework-list">
            {coursework.map((course, i) => (
              <ScrollRevealBlock key={course} direction="left" delay={i * 0.04} as="li" className="sp-about__coursework-item">
                <span className="sp-about__coursework-bullet" aria-hidden="true">▸</span>
                {course}
              </ScrollRevealBlock>
            ))}
          </ul>
        </PaperCard>
      </ScrollRevealBlock>

      <InkWash variant="tape-strip" />

      {/* ── Beyond Code ── */}
      <ScrollRevealBlock direction="up" className="sp-about__beyond-section">
        <h3 className="sp-about__beyond-heading">Beyond Code</h3>
        <SketchDivider />
        <div className="sp-about__beyond-grid">
          <ScrollRevealBlock direction="left">
            <PaperCard variant="pinned" tilt={-0.6} className="sp-about__beyond-card">
              <h4 className="sp-about__beyond-title">Eagle Scout</h4>
              <p className="sp-about__beyond-desc">
                Led construction of wooden signage and a large outdoor banner for a local elementary
                school. Organized 15 volunteers and 200+ hours of service.
              </p>
            </PaperCard>
          </ScrollRevealBlock>

          <ScrollRevealBlock direction="right" delay={0.08}>
            <PaperCard variant="taped" tilt={0.8} className="sp-about__beyond-card">
              <h4 className="sp-about__beyond-title">Clarinet Section Leader</h4>
              <p className="sp-about__beyond-desc">
                4 years as section leader and soloist. 200+ hours annually in rehearsals
                and performances. Performed nationally with the Pasadena Symphony and Pops.
              </p>
            </PaperCard>
          </ScrollRevealBlock>

          <ScrollRevealBlock direction="left" delay={0.16}>
            <PaperCard variant="clean" tilt={-0.3} className="sp-about__beyond-card">
              <h4 className="sp-about__beyond-title">Arcadia App Development</h4>
              <p className="sp-about__beyond-desc">
                Developer & Treasurer. Helped build a digital student ID system used by
                2,000+ students. Managed finances and expanded project capacity.
              </p>
            </PaperCard>
          </ScrollRevealBlock>
        </div>
      </ScrollRevealBlock>

      {/* ── Interest tags ── */}
      <ScrollRevealBlock direction="up" className="sp-about__interests">
        <h3 className="sp-about__interests-heading">Interests & Focus Areas</h3>
        <div className="sp-about__interest-tags">
          {[
            'Mobile Engineering', 'Interactive UI', 'Healthcare Tech',
            'Creative Coding', 'Data Pipelines', 'Geospatial Systems',
            'Game Development', 'Motion Design', 'Open Source',
          ].map((interest, i) => (
            <ScrollRevealBlock key={interest} direction="scale" delay={i * 0.03} className="sp-about__interest-tag-wrap">
              <span className="sp-about__interest-tag">{interest}</span>
            </ScrollRevealBlock>
          ))}
        </div>
      </ScrollRevealBlock>
    </div>
  )
}
