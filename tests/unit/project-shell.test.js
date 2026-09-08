import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShell } from '../../scripts/project-shell.mjs'

const fixture = `<!doctype html><html><head>
<meta name="description" content="old" />
<title>Old</title>
<link rel="canonical" href="https://www.jc-965.com/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.jc-965.com/" />
<meta property="og:title" content="Old" />
<meta property="og:description" content="old" />
<meta property="og:image" content="https://www.jc-965.com/og-image.jpg" />
<meta name="twitter:title" content="Old" />
<meta name="twitter:description" content="old" />
<meta name="twitter:image" content="https://www.jc-965.com/og-image.jpg" />
</head><body><div id="root"><main class="seo-fallback" aria-label="x"><p>old</p></main></div></body></html>`

test('buildShell swaps every head marker and the fallback body', () => {
  const html = buildShell(fixture, {
    title: 'Agoriai | Jesse Chen',
    description: 'A "quoted" blurb',
    url: 'https://www.jc-965.com/projects/agoriai/',
    image: 'https://www.jc-965.com/Agoriai/nexus.webp',
    fallbackHtml: '<main class="seo-fallback"><h1>Agoriai</h1></main>',
  })
  assert.match(html, /<title>Agoriai \| Jesse Chen<\/title>/)
  assert.match(html, /name="description" content="A &quot;quoted&quot; blurb"/)
  assert.match(html, /rel="canonical" href="https:\/\/www.jc-965.com\/projects\/agoriai\/"/)
  assert.match(html, /property="og:type" content="article"/)
  assert.match(html, /property="og:image" content="https:\/\/www.jc-965.com\/Agoriai\/nexus.webp"/)
  assert.match(html, /name="twitter:image" content="https:\/\/www.jc-965.com\/Agoriai\/nexus.webp"/)
  assert.ok(html.includes('<h1>Agoriai</h1>'))
  assert.ok(!html.includes('<p>old</p>'))
})

test('buildShell refuses a document without the markers', () => {
  assert.throws(
    () => buildShell('<html></html>', { title: 't', description: 'd', url: 'u', image: 'i', fallbackHtml: '<main class="seo-fallback"></main>' }),
    /marker/,
  )
})
