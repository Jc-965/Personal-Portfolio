import AsciiWorld from './hero/AsciiWorld'
import Printed from './hero/Printed'
import portfolio from '../content/portfolio.json'

export default function Hero() {
  const { profile } = portfolio
  const [first, ...rest] = profile.name.split(' ')
  const lines = [first, rest.join(' ')].filter(Boolean)

  return (
    <section className="hero" id="top" aria-labelledby="hero-name">
      <AsciiWorld title={lines.join('\n').toUpperCase()} />
      <div className="hero__stage">
        <div className="hero__copy">
          <h1 id="hero-name" className="hero__name">
            <span>{first}</span> <span>{rest.join(' ')}</span>
          </h1>
          <p className="hero__role"><Printed text={profile.role} delay={900} /></p>
          <p className="hero__claim"><Printed text={profile.claim} delay={1450} /></p>
        </div>
      </div>
    </section>
  )
}
