// Builds every crawlable artifact from src/content/portfolio.json: the static
// case-study pages under public/projects/, their social preview images, the
// sitemap, and the no-JS summary inside index.html. Runs before `vite build`,
// so the deployed copies always match the content file.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const siteUrl = 'https://www.jc-965.com'
const siteImage = `${siteUrl}/og-image.jpg`
const OG_WIDTH = 1200
const OG_HEIGHT = 630
const content = JSON.parse(
  await readFile(new URL('../src/content/portfolio.json', import.meta.url), 'utf8'),
)
const { profile } = content

const person = {
  '@type': 'Person',
  '@id': `${siteUrl}/#person`,
  name: profile.name,
  url: `${siteUrl}/`,
}

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

// Search result snippets cut off near 155 characters. Longer copy ends on a
// whole word so the truncated description never breaks mid-word.
const metaDescription = (text, max = 155) => {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

// `<` is escaped so page content can never close the script element early.
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`

const projectUrl = (project) => `${siteUrl}/projects/${project.id}/`

const coverAlt = (project) =>
  project.images?.find((image) => image.src === project.caseStudy.image)?.alt ??
  `${project.name} project interface`

// LinkedIn does not render WebP previews, so each case study with a cover gets
// a 1200x630 JPEG crop of it. Projects without a cover reuse the site image.
const writeOgImage = async (project, directory) => {
  const cover = project.caseStudy.image
  if (!cover) return siteImage
  const source = fileURLToPath(new URL(`../public${cover}`, import.meta.url))
  await sharp(source)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' })
    .jpeg({ quality: 82, progressive: true })
    .toFile(fileURLToPath(new URL('og.jpg', directory)))
  return `${projectUrl(project)}og.jpg`
}

const renderHead = ({ title, description, canonical, cssPath, ogType, image, imageAlt, structuredData }) => `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(metaDescription(description))}" />
  <meta name="robots" content="max-image-preview:large" />
  <meta name="theme-color" content="#03070d" />
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="${cssPath}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="${escapeHtml(profile.name)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="${OG_WIDTH}" />
  <meta property="og:image:height" content="${OG_HEIGHT}" />
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
  ${structuredData}`

const renderNav = () => `<nav class="nav" aria-label="Case study navigation">
  <a href="/">← Portfolio</a>
  <a href="/projects/">All case studies</a>
  <a href="mailto:${escapeHtml(profile.email)}">Contact</a>
</nav>`

const renderFooter = () => `<footer class="footer">
  <span>© ${new Date().getUTCFullYear()} ${escapeHtml(profile.name)}</span>
  <a href="${escapeHtml(profile.github)}">GitHub</a>
  <a href="${escapeHtml(profile.linkedin)}">LinkedIn</a>
</footer>`

const breadcrumbs = (trail) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, item], index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name,
    item,
  })),
})

const renderProject = (project, image) => {
  const url = projectUrl(project)
  const caseStudy = project.caseStudy
  const stats = project.stats
    .map(({ label, value }) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('\n')
  const approach = caseStudy.approach.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
  const outcomes = caseStudy.outcomes.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')
  const tags = project.tech.map((item) => `<span>${escapeHtml(item)}</span>`).join('\n')
  const figure = caseStudy.image
    ? `<figure class="project-image"><img src="${escapeHtml(caseStudy.image)}" alt="${escapeHtml(coverAlt(project))}" width="1600" height="904" /><figcaption>${escapeHtml(project.name)} in production</figcaption></figure>`
    : ''
  const title = `${project.name} case study | ${profile.name}`
  const structuredData = jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbs([
        ['Home', `${siteUrl}/`],
        ['Case studies', `${siteUrl}/projects/`],
        [project.name, url],
      ]),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: `${project.name} case study`,
        description: project.lead,
        image,
        url,
        mainEntityOfPage: url,
        author: person,
        keywords: project.tech.join(', '),
      },
    ],
  })

  return `<!doctype html>
<html lang="en">
<head>${renderHead({
    title,
    description: project.lead,
    canonical: url,
    cssPath: '../project-page.css',
    ogType: 'article',
    image,
    imageAlt: caseStudy.image ? coverAlt(project) : `${profile.name} portfolio`,
    structuredData,
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
${figure ? `    ${figure}\n` : ''}    <section class="meta" aria-label="Project results">${stats}</section>
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

const renderIndex = () => {
  const cards = content.projects
    .map((project) => `<article class="project-card" style="--card-accent: ${escapeHtml(project.accent)}">
    <p class="eyebrow">${escapeHtml(project.tag)}</p>
    <h2><a href="./${escapeHtml(project.id)}/">${escapeHtml(project.name)}</a></h2>
    <p>${escapeHtml(project.lead)}</p>
    <ul class="outcomes">${project.caseStudy.outcomes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <a class="card-link" href="./${escapeHtml(project.id)}/" aria-label="Read the ${escapeHtml(project.name)} case study">Read case study →</a>
  </article>`)
    .join('\n')
  const title = `Software engineering case studies | ${profile.name}`
  const description =
    'Detailed software engineering case studies covering mobile reliability, full-stack systems, privacy, and interactive experiences.'
  const structuredData = jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbs([
        ['Home', `${siteUrl}/`],
        ['Case studies', `${siteUrl}/projects/`],
      ]),
      {
        '@type': 'CollectionPage',
        '@id': `${siteUrl}/projects/`,
        url: `${siteUrl}/projects/`,
        name: title,
        description,
        author: person,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: content.projects.map((project, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: project.name,
            url: projectUrl(project),
          })),
        },
      },
    ],
  })

  return `<!doctype html>
<html lang="en">
<head>${renderHead({
    title,
    description,
    canonical: `${siteUrl}/projects/`,
    cssPath: './project-page.css',
    ogType: 'website',
    image: siteImage,
    imageAlt: `${profile.name} portfolio`,
    structuredData,
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
}

// The block crawlers and no-JS visitors read on the home page. React replaces
// it once the app mounts, so it carries the summary and every internal link a
// crawler needs without affecting the interactive page.
const renderHomeFallback = () => {
  const projects = content.projects
    .map(
      (project) =>
        `<li><a href="/projects/${escapeHtml(project.id)}/">${escapeHtml(project.name)}</a>: ${escapeHtml(project.lead)}</li>`,
    )
    .join('\n            ')
  const experiences = content.experiences
    .map(
      (experience) =>
        `<li>${escapeHtml(experience.role)}, ${escapeHtml(experience.company)} (${escapeHtml(experience.period)})</li>`,
    )
    .join('\n            ')
  return `      <main class="seo-fallback" aria-label="${escapeHtml(profile.name)} portfolio summary">
        <div class="seo-fallback__inner">
          <h1>${escapeHtml(profile.name)}, software engineer</h1>
          <p>${escapeHtml(profile.description)}</p>
          <h2>Selected projects</h2>
          <ul>
            ${projects}
          </ul>
          <h2>Experience</h2>
          <ul>
            ${experiences}
          </ul>
          <p>
            Read the <a href="/projects/">case studies</a>, see the code on
            <a href="${escapeHtml(profile.github)}">GitHub</a>, connect on
            <a href="${escapeHtml(profile.linkedin)}">LinkedIn</a>, or email
            <a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a>.
          </p>
        </div>
      </main>`
}

const writeHomeFallback = async () => {
  const indexUrl = new URL('../index.html', import.meta.url)
  const html = await readFile(indexUrl, 'utf8')
  const start = '<!-- seo-fallback:start -->'
  const end = '<!-- seo-fallback:end -->'
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from === -1 || to === -1 || to < from) {
    throw new Error('index.html is missing the seo-fallback markers')
  }
  const next = `${html.slice(0, from + start.length)}\n${renderHomeFallback()}\n      ${html.slice(to)}`
  if (next !== html) await writeFile(indexUrl, next)
}

await mkdir(new URL('../public/projects/', import.meta.url), { recursive: true })
await writeFile(new URL('../public/projects/index.html', import.meta.url), renderIndex())

for (const project of content.projects) {
  const directory = new URL(`../public/projects/${project.id}/`, import.meta.url)
  await mkdir(directory, { recursive: true })
  const image = await writeOgImage(project, directory)
  await writeFile(new URL('index.html', directory), renderProject(project, image))
}

await writeHomeFallback()

const sitemapEntries = [
  `${siteUrl}/`,
  `${siteUrl}/projects/`,
  ...content.projects.map(projectUrl),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`
await writeFile(new URL('../public/sitemap.xml', import.meta.url), sitemap)

console.log(`Generated ${content.projects.length} project case studies, the home fallback, and the sitemap.`)
