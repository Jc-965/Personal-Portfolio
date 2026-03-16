# Jesse Chen — Personal Portfolio

First-year Computer Science student at Carnegie Mellon University (SCS), concentrating in Machine Learning.
I build software that's reliable, thoughtful, and designed to make technology feel human.

**Live site:** [jessechen.net](https://jessechen.net)

---

## About Me

- Passionate about connecting **engineering precision** with **real-world impact**
- Enjoy working across the stack — from backend data pipelines to mobile and web interfaces
- Constantly learning, iterating, and building tools that make everyday systems a bit easier to trust

---

## Projects

- **Levio** — Cross-platform app supporting Parkinson's care with tracking, reminders, and guided therapy
- **CMUMaps** — Data pipeline powering campus navigation through structured GeoJSON and OSM parsing
- **MyCommunity** — Android app that helps Scouts find service projects using Firebase and Maps APIs
- **Tarocchi** — HackCMU web app blending art, logic, and storytelling in React and TypeScript

---

## Leadership & Involvement

- **ScottyLabs** — Data Engineer on the CMUMaps team
- **Arcadia App Dev** — Developer & Treasurer for school app projects
- **Eagle Scout** — Led and managed community service installations
- **Clarinet Section Leader** — Directed performances and trained musicians

---

## Portfolio Site

This portfolio is an interactive single-page app featuring a hand-crafted canvas background, 3D ASCII text, gyroscope parallax, and performance-adaptive rendering.

### Key Features

- **Interactive canvas background** — Procedurally generated node network with click-driven grid highlighting, pointer tracking, and gyroscope tilt response
- **3D ASCII text** — Hero section rendered with Three.js and React Three Fiber
- **Performance-adaptive** — Detects device capabilities and adjusts DPR, frame rate, node counts, and rendering complexity
- **Gyroscope parallax** — Tilting a mobile device shifts background layers with depth-based movement
- **Code-split sections** — Journey, Projects, Toolkit, and Constellation lazily loaded for fast initial paint

### Tech Stack

| Layer | Tools |
| --- | --- |
| Framework | React 18, TypeScript, Vite 5 |
| Animation | GSAP, Framer Motion |
| 3D | Three.js, React Three Fiber, React Three Postprocessing |
| Backend | Firebase |
| Icons | Lucide React |

### Getting Started

```bash
npm install
npm run dev       # development
npm run build     # production build
npm run preview   # preview production build
```

### Project Structure

```text
src/
├── components/
│   ├── Background.tsx      # Canvas node network with adaptive rendering
│   ├── Hero.tsx            # Animated hero with 3D ASCII text
│   ├── ASCIIText.tsx       # Three.js ASCII text renderer
│   ├── Journey.tsx         # Timeline section
│   ├── Projects.tsx        # Project showcase
│   ├── Toolkit.tsx         # Skills & technologies
│   ├── Constellation.tsx   # Interactive 3D section
│   ├── BeyondBuild.tsx     # Personal interests
│   ├── CardSwap.tsx        # GSAP card stack animation
│   ├── Magnet.tsx          # Magnetic hover effect
│   ├── DecryptedText.tsx   # Character-scramble text reveal
│   ├── Cursor.tsx          # Custom cursor
│   ├── LazySection.tsx     # Code-split section wrapper
│   └── ...
├── context/
│   └── GyroscopeContext.tsx # Gyroscope sensor management
├── hooks/
│   └── useIsPhone.tsx       # Mobile detection
├── data/                    # Static content
├── styles/                  # Global styles
└── assets/                  # Images & media
```
