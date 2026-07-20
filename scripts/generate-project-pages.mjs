import { mkdir, readFile, writeFile } from 'node:fs/promises'

const siteUrl = 'https://www.jc-965.com'
const content = JSON.parse(
  await readFile(new URL('../src/content/portfolio.json', import.meta.url), 'utf8'),
)

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const renderHead = ({ title, description, canonical, cssPath }) => `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#03070d" />
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="${cssPath}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />`

const renderNav = () => `<nav class="nav" aria-label="Case study navigation">
  <a href="/">← Portfolio</a>
  <a href="/projects/">All case studies</a>
  <a href="${escapeHtml(content.profile.resumePath)}" download>Résumé</a>
  <a href="mailto:${escapeHtml(content.profile.email)}">Contact</a>
</nav>`

const renderFooter = () => `<footer class="footer">
  <span>© ${new Date().getUTCFullYear()} ${escapeHtml(content.profile.name)}</span>
  <a href="${escapeHtml(content.profile.github)}">GitHub</a>
  <a href="${escapeHtml(content.profile.linkedin)}">LinkedIn</a>
</footer>`

const renderProject = (project) => {
  const url = `${siteUrl}/projects/${project.id}/`
  const caseStudy = project.caseStudy
  const stats = project.stats
    .map(({ label, value }) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('\n')
  const approach = caseStudy.approach.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
  const outcomes = caseStudy.outcomes.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
  const tags = project.tech.map((item) => `<span>${escapeHtml(item)}</span>`).join('\n')
  const image = caseStudy.image
    ? `<figure class="project-image"><img src="${escapeHtml(caseStudy.image)}" alt="${escapeHtml(project.name)} project interface" width="1600" height="904" /><figcaption>${escapeHtml(project.name)} in production</figcaption></figure>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>${renderHead({
    title: `${project.name} case study | Jesse Chen`,
    description: project.lead,
    canonical: url,
    cssPath: '../project-page.css',
  })}
</head>
<body style="--accent: ${escapeHtml(project.accent)}">
  <a class="skip-link" href="#content">Skip to case study</a>
  <main class="page" id="content">
    ${renderNav()}
    <header class="project-hero">
      <p class="eyebrow">${escapeHtml(project.tag)}</p>
      <h1>${escapeHtml(project.name)}</h1>
      <p class="lede">${escapeHtml(project.lead)}</p>
    </header>
${image ? `    ${image}\n` : ''}    <section class="meta" aria-label="Project results">${stats}</section>
    <section class="panel">
      <p class="eyebrow">Role</p>
      <h2>${escapeHtml(caseStudy.role)}</h2>
    </section>
    <section class="panel">
      <p class="eyebrow">Challenge</p>
      <h2>What had to be solved</h2>
      <p>${escapeHtml(caseStudy.challenge)}</p>
    </section>
    <section class="panel">
      <p class="eyebrow">Approach</p>
      <h2>How I built it</h2>
      <ol>${approach}</ol>
    </section>
    <section class="panel">
      <p class="eyebrow">Outcomes</p>
      <h2>What changed</h2>
      <ul class="outcomes">${outcomes}</ul>
      <div class="tags" aria-label="Technology used">${tags}</div>
    </section>
    ${renderFooter()}
  </main>
</body>
</html>
`
}

const cards = content.projects
  .map((project) => `<article class="project-card" style="--card-accent: ${escapeHtml(project.accent)}">
    <p class="eyebrow">${escapeHtml(project.tag)}</p>
    <h2><a href="./${escapeHtml(project.id)}/">${escapeHtml(project.name)}</a></h2>
    <p>${escapeHtml(project.lead)}</p>
    <ul class="outcomes">${project.caseStudy.outcomes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <a class="card-link" href="./${escapeHtml(project.id)}/" aria-label="Read the ${escapeHtml(project.name)} case study">Read case study →</a>
  </article>`)
  .join('\n')

const indexHtml = `<!doctype html>
<html lang="en">
<head>${renderHead({
  title: 'Software engineering case studies | Jesse Chen',
  description: 'Detailed software engineering case studies covering mobile reliability, full-stack systems, privacy, and interactive experiences.',
  canonical: `${siteUrl}/projects/`,
  cssPath: './project-page.css',
})}
</head>
<body>
  <a class="skip-link" href="#content">Skip to case studies</a>
  <main class="page" id="content">
    ${renderNav()}
    <header class="project-hero project-hero--index">
      <p class="eyebrow">Selected engineering work</p>
      <h1>Case studies</h1>
      <p class="lede">The constraints, technical decisions, and measurable outcomes behind four shipped products.</p>
    </header>
    <section class="project-grid" aria-label="Project case studies">${cards}</section>
    ${renderFooter()}
  </main>
</body>
</html>
`

await mkdir(new URL('../public/projects/', import.meta.url), { recursive: true })
await writeFile(new URL('../public/projects/index.html', import.meta.url), indexHtml)

for (const project of content.projects) {
  const directory = new URL(`../public/projects/${project.id}/`, import.meta.url)
  await mkdir(directory, { recursive: true })
  await writeFile(new URL('index.html', directory), renderProject(project))
}

const sitemapEntries = [
  `${siteUrl}/`,
  `${siteUrl}/projects/`,
  ...content.projects.map((project) => `${siteUrl}/projects/${project.id}/`),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`
await writeFile(new URL('../public/sitemap.xml', import.meta.url), sitemap)

console.log(`Generated ${content.projects.length} project case studies and sitemap.`)
