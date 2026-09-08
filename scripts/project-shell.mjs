export const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const swap = (html, pattern, replacement, name) => {
  if (!pattern.test(html)) throw new Error(`shell marker missing: ${name}`)
  return html.replace(pattern, replacement)
}

/** Stamps a project's head tags and crawler fallback into a copy of the built index.html. */
export function buildShell(indexHtml, { title, description, url, image, fallbackHtml }) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  let html = indexHtml
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${t}</title>`, 'title')
  html = swap(html, /(<meta name="description" content=")[^"]*(")/, `$1${d}$2`, 'description')
  html = swap(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`, 'canonical')
  html = swap(html, /(<meta property="og:type" content=")[^"]*(")/, `$1article$2`, 'og:type')
  html = swap(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, 'og:url')
  html = swap(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`, 'og:title')
  html = swap(html, /(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`, 'og:description')
  html = swap(html, /(<meta property="og:image" content=")[^"]*(")/, `$1${image}$2`, 'og:image')
  html = swap(html, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`, 'twitter:title')
  html = swap(html, /(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`, 'twitter:description')
  html = swap(html, /(<meta name="twitter:image" content=")[^"]*(")/, `$1${image}$2`, 'twitter:image')
  html = swap(html, /<main class="seo-fallback"[\s\S]*?<\/main>/, fallbackHtml, 'seo-fallback')
  return html
}
