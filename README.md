# Personal Portfolio

A single-page interactive portfolio crafted to showcase technical expertise, immersive visuals, and subtle motion design. The experience features animated gradient orbs, a responsive glassmorphism layout, a custom magnetic cursor, and scroll-triggered reveals across sections covering skills, experience, projects, and contact details.

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

## Customization

- Update `index.html` copy to reflect your own biography, achievements, and contact information.
- Adjust styling tokens, gradients, and layout within `styles.css`.
- Extend interactivity or analytics in `script.js`.

## Features

- Responsive navigation with mobile menu toggle
- Animated hero cards highlighting specialties and interests
- Tech-focused sections for skills, experience, and projects
- Scroll-triggered reveal animations
- Custom cursor with hover states and animated tech background
