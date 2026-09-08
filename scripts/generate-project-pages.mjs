/**
 * Runs after `vite build`. Copies the built index.html once per project with
 * that project's title, description, share image, and a plain-HTML summary for
 * crawlers, so /projects/<id>/ has the right preview and the app boots there.
 * Also writes the projects index shell and the sitemap.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildShell, escapeHtml } from './project-shell.mjs'
import { projects, profile, validateProject } from '../src/content/story.ts'

const siteUrl = 'https://www.jc-965.com'
const dist = new URL('../dist/', import.meta.url)
const indexHtml = await readFile(new URL('index.html', dist), 'utf8')

const problems = projects.flatMap(validateProject)
if (problems.length) {
  console.error(`Project content is incomplete:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}

const list = (items, prefix = '') => items.map(item => `<li>${prefix}${escapeHtml(item)}</li>`).join('')

const fallbackFor = (project) => `<main class="seo-fallback" aria-label="${escapeHtml(project.name)} project summary"><div class="seo-fallback__inner">
<p>Project by <a href="/">${escapeHtml(profile.name)}</a></p>
<h1>${escapeHtml(project.name)}</h1>
<p>${escapeHtml(project.tag)}</p>
<p>${escapeHtml(project.blurb)}</p>
<h2>Role</h2><p>${escapeHtml(project.story.role)}</p>
<h2>Problem</h2><ul>${list(project.story.problem.was, 'Before: ')}${list(project.story.problem.needed, 'Needed: ')}</ul>
<h2>Build</h2><ol>${list(project.story.build.map(step => step.step))}</ol>
<h2>Proof</h2><ul>${list(project.story.proof)}</ul>
<p>Built with ${project.tech.map(escapeHtml).join(', ')}.</p>
<p><a href="/projects/">All projects</a> · <a href="mailto:${escapeHtml(profile.email)}">Contact</a></p>
</div></main>`

for (const project of projects) {
  const dir = new URL(`projects/${project.id}/`, dist)
  await mkdir(dir, { recursive: true })
  const image = project.images?.[0]?.src ? `${siteUrl}${project.images[0].src}` : `${siteUrl}/og-image.jpg`
  await writeFile(new URL('index.html', dir), buildShell(indexHtml, {
    title: `${project.name} | ${profile.name}`,
    description: project.blurb,
    url: `${siteUrl}/projects/${project.id}/`,
    image,
    fallbackHtml: fallbackFor(project),
  }))
}

const indexFallback = `<main class="seo-fallback" aria-label="Projects"><div class="seo-fallback__inner"><h1>Projects by ${escapeHtml(profile.name)}</h1><ul>${projects.map(p => `<li><a href="/projects/${p.id}/">${escapeHtml(p.name)}</a>: ${escapeHtml(p.blurb)}</li>`).join('')}</ul></div></main>`
await mkdir(new URL('projects/', dist), { recursive: true })
await writeFile(new URL('projects/index.html', dist), buildShell(indexHtml, {
  title: `Projects | ${profile.name}`,
  description: `Software projects by ${profile.name}: ${projects.map(p => p.name).join(', ')}.`,
  url: `${siteUrl}/projects/`,
  image: `${siteUrl}/og-image.jpg`,
  fallbackHtml: indexFallback,
}))

const urls = [`${siteUrl}/`, `${siteUrl}/projects/`, ...projects.map(p => `${siteUrl}/projects/${p.id}/`)]
await writeFile(new URL('sitemap.xml', dist), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`)
console.log(`Wrote ${projects.length} project shells, the projects index, and the sitemap.`)
