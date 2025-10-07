# Personal Portfolio

A single-page interactive portfolio crafted to showcase a Carnegie Mellon School of Computer Science first-year’s story, technical range, and impact. The experience features animated gradient orbs, a responsive glassmorphism layout, a custom magnetic cursor, and scroll-triggered reveals across sections covering coursework, research, projects, and contact details.

## Getting Started

Serve the static files with any local web server from the project root.

### Option 1: Python (built in on macOS/Linux and available on Windows 10+)

```bash
cd /path/to/Personal-Portfolio
python3 -m http.server 8000
```

> **Tip:** On Windows you may need to run `py -m http.server 8000` instead. If you see a "No module named http.server" error, ensure you are using Python 3.

### Option 2: Node.js

If you have Node.js installed, you can use one of the lightweight static servers:

```bash
npx serve . --listen 8000
# or
npx http-server -p 8000
```

### Option 3: VS Code Live Server extension

1. Open the folder in VS Code.
2. Install the "Live Server" extension if you do not already have it.
3. Right-click `index.html` and choose **Open with Live Server**.

After starting any of the servers above, visit <http://localhost:8000> (or the port Live Server reports) to explore the portfolio.

## Deploying to the Web (jc-965.com)

You can host the static site anywhere you control and then connect your Wix-managed domain (`jc-965.com`). Two common options are below.

### Option A: GitHub Pages

1. Create a new public repository on GitHub and push this project to it.
2. In the repository settings, enable **Pages** with the `main` branch and `/ (root)` as the source.
3. Add a `CNAME` file at the project root containing `jc-965.com` so GitHub knows the custom domain.
4. In Wix, open **Domains → Advanced → DNS** and edit the records:
   - Add/Update four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
   - Add a `CNAME` record for `www` pointing to `<your-github-username>.github.io`.
5. Back in GitHub Pages, set the custom domain to `jc-965.com` and enforce HTTPS. DNS changes can take a few hours to propagate.

### Option B: Vercel (or Netlify, Render, etc.)

1. Import the repository into Vercel and deploy using the default static site settings.
2. In Vercel, add `jc-965.com` and `www.jc-965.com` under **Domains**.
3. Wix DNS setup:
   - Point an `A` record for `@` to the Vercel-provided IPv4 address (if given) or use the Vercel `ALIAS`/`ANAME` target.
   - Create a `CNAME` for `www` pointing to the Vercel domain shown (usually `cname.vercel-dns.com`).
4. Wait for DNS propagation and verify HTTPS is active from your hosting provider.

> **Tip:** Wix does not currently allow uploading arbitrary HTML as the main Wix site, so connecting the domain via DNS ensures your custom portfolio is served from the platform you control while still using your Wix-purchased domain.

## Customization

- Update `index.html` copy to reflect your own biography, achievements, and contact information.
- Adjust styling tokens, gradients, and layout within `styles.css`.
- Extend interactivity or analytics in `script.js`.

## Features

- Responsive navigation with mobile menu toggle
- Animated hero cards highlighting specialties and interests
- Tech-focused sections for skills, experience, and projects grounded in CMU SCS work
- Scroll-triggered reveal animations
- Custom cursor with hover states and animated tech background with hover/click ripples
