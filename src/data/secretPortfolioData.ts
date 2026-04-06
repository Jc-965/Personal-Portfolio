// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectLink {
  label: string
  url: string
}

export interface ProjectData {
  slug: string
  title: string
  subtitle: string
  summary: string
  impact: string
  techStack: string[]
  role: string
  duration: string
  problem: string
  solution: string
  features: string[]
  challenges: string[]
  outcomes: string[]
  notes: string[]
  links: ProjectLink[]
  accentColor: string
  paperVariant: 'clean' | 'worn' | 'taped' | 'pinned'
}

export interface SkillCategory {
  name: string
  icon: string
  items: string[]
}

export interface ArchiveEntry {
  title: string
  description: string
  tags: string[]
  date: string
  status: 'complete' | 'in-progress' | 'idea' | 'archived'
}

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects: ProjectData[] = [
  {
    slug: 'levio',
    title: 'Levio',
    subtitle: "Cross-platform mobile health platform for Parkinson's care",
    summary: "Engineered a cross-platform Flutter/Dart mobile health platform for Parkinson's symptom tracking, medication adherence, and recovery workflows with offline-first persistence.",
    impact: "Production health platform supporting Parkinson's patients with continuous care flow under unreliable network conditions",
    techStack: ['Flutter', 'Dart', 'Supabase', 'Offline Sync', 'GitHub Actions CI/CD'],
    role: 'Software Engineer',
    duration: '2025',
    problem: "Parkinson's patients need reliable digital tools for symptom tracking and medication adherence, but existing solutions break under unstable network conditions — exactly when high-priority care flows matter most.",
    solution: 'Built a cross-platform Flutter/Dart app with Supabase auth and data services, implementing offline-first local persistence so care workflows continue seamlessly without connectivity. Added automated iOS/Android release pipelines with GitHub Actions CI/CD and staged deployment checks.',
    features: [
      'Cross-platform iOS/Android deployment from single Flutter codebase',
      'Offline-first local persistence for uninterrupted care flows',
      'Supabase auth and real-time data sync',
      'Automated CI/CD pipelines with staged deployment checks',
      'Symptom tracking and medication adherence workflows',
    ],
    challenges: [
      'Offline-first sync conflicts — implemented conflict resolution strategy with Supabase to preserve data integrity',
      'CI/CD pipeline for both iOS and Android — built GitHub Actions workflows with staged deployment validation',
      'Maintaining care flow continuity under network instability — local persistence layer with background sync',
    ],
    outcomes: [
      'Deployed to iOS and Android app stores',
      'Hardened production delivery with automated release pipelines',
      'Preserved care continuity for high-priority flows under unstable network conditions',
    ],
    notes: [
      'Supabase was a great fit for auth + real-time — less overhead than raw Firebase for this use case',
      'Offline-first was the hardest constraint but most impactful feature',
      'GitHub Actions CI/CD saved hours of manual release work per deployment cycle',
      'Flutter hot reload made iterating on care flow UX dramatically faster',
    ],
    links: [],
    accentColor: '#6aa5af',
    paperVariant: 'taped',
  },
  {
    slug: 'agoriai',
    title: 'Agoriai',
    subtitle: 'Anonymous career network with privacy-preserving identity — Tartan Hacks 2026',
    summary: 'Built a full-stack anonymous career network for low-risk professional Q&A, company discovery, and trust-aware social interaction at Tartan Hacks 2026.',
    impact: 'Privacy-first professional networking with graph-based exploration and relationship-gated identity reveals',
    techStack: ['React 19', 'TypeScript', 'D3', 'Bun/Elysia', 'PostgreSQL/Drizzle'],
    role: 'Full-Stack Developer',
    duration: 'Tartan Hacks 2026',
    problem: 'Professional networking platforms force full identity disclosure, which discourages honest Q&A about companies, roles, and career decisions. People want to explore career information without social risk.',
    solution: 'Built a privacy-preserving identity system with moderated messaging flows and relationship-gated reveal mechanics. Used React 19, TypeScript, and D3 for graph-based exploration across company pages, relationship maps, and internship search on a Bun/Elysia + PostgreSQL/Drizzle backend.',
    features: [
      'Privacy-preserving identity controls with SHA-256 hashing',
      'D3 graph-based exploration of company relationships',
      'Relationship-gated reveal mechanics for trust-aware networking',
      'Moderated messaging flows for professional Q&A',
      'Company discovery and internship search interface',
    ],
    challenges: [
      'Balancing anonymity with trust — designed relationship-gated reveal mechanics so trust builds organically',
      'Graph rendering performance with D3 at scale — optimized force simulation with viewport culling',
      'Building a full backend in a hackathon — Bun/Elysia + Drizzle kept velocity high without sacrificing structure',
    ],
    outcomes: [
      'Shipped a working full-stack prototype at Tartan Hacks 2026',
      'Graph-based company exploration praised by judges for novel UX',
      'Privacy model validated through user testing during the event',
    ],
    notes: [
      'React 19 transitions made the graph navigation feel seamless',
      'Drizzle ORM was a great choice — type-safe queries with minimal boilerplate',
      'D3 force layout needed careful tuning to not tank performance with large graphs',
      'Would love to add real LinkedIn verification as an optional trust anchor in v2',
    ],
    links: [],
    accentColor: '#4c8bff',
    paperVariant: 'pinned',
  },
  {
    slug: 'tarocchi',
    title: 'Tarocchi',
    subtitle: 'Interactive branching narrative web experience',
    summary: 'Built an interactive narrative web experience with 24 branching story paths and a replayable state-driven progression model, with cinematic transitions and synchronized audio.',
    impact: '24 branching paths with parallax, synchronized audio, and cinematic scene transitions',
    techStack: ['React', 'Vite', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    role: 'Solo Developer',
    duration: '2025',
    problem: 'Traditional linear web storytelling lacks the engagement and replayability of branching narratives. There was no easy way to create an immersive, interactive story experience on the web with production-quality motion design.',
    solution: 'Engineered route logic and scene transitions in React/TypeScript to keep branching flows coherent as narrative complexity increased. Layered Framer Motion, parallax systems, and synchronized audio to deliver a cinematic, high-immersion presentation pipeline.',
    features: [
      '24 branching story paths with replayable state-driven progression',
      'Cinematic scene transitions with Framer Motion',
      'Parallax scroll systems for depth',
      'Synchronized audio tied to story progression',
      'Mobile-responsive immersive experience',
    ],
    challenges: [
      'Keeping 24 branching paths coherent — built a state machine to track narrative flow and prevent dead-end states',
      'Audio synchronization across scene transitions — custom hook to manage playback state tied to route changes',
      'Performance with layered parallax effects — optimized with will-change and GPU-accelerated transforms',
    ],
    outcomes: [
      'Fully playable interactive story with multiple endings',
      'Smooth scene transitions praised for cinematic feel',
      'Demonstrated creative coding capability alongside technical depth',
    ],
    notes: [
      'State machine for branching was surprisingly simple once the graph was modeled correctly',
      'Framer Motion AnimatePresence was perfect for scene transitions — no GSAP needed',
      'Audio was the hardest part — browsers block autoplay, had to build user-gesture-gated playback',
      'This project taught me more about motion design than any tutorial ever could',
    ],
    links: [],
    accentColor: '#9c7fae',
    paperVariant: 'clean',
  },
  {
    slug: 'mycommunity',
    title: 'MyCommunity',
    subtitle: 'Android civic discovery app with geospatial search',
    summary: 'Developed an Android civic-discovery app for geospatial search across troops, local opportunities, and community updates, powered by Firebase and Google Maps APIs.',
    impact: 'Unified geospatial civic discovery with map-driven content, Firebase data, and remote news feeds in one mobile workflow',
    techStack: ['Java', 'Firebase', 'Google Maps API', 'OkHttp', 'Gson', 'Glide'],
    role: 'Android Developer',
    duration: '2024',
    problem: 'Local community information — troop activities, volunteer opportunities, civic updates — was scattered across multiple websites, social media pages, and bulletin boards with no unified discovery interface.',
    solution: 'Built an Android app integrating Firebase-backed content, Google Maps APIs, and remote news feeds into a unified geospatial discovery workflow. Optimized map-driven browsing with OkHttp, Gson, and Glide so location-based search stayed fast and reliable on-device.',
    features: [
      'Geospatial search with Google Maps integration',
      'Firebase-backed community content management',
      'Remote news feed aggregation',
      'Location-based troop and opportunity discovery',
      'Optimized image loading with Glide',
    ],
    challenges: [
      'Map performance with many markers — implemented clustering and viewport-based lazy loading',
      'Firebase real-time sync with offline caching — designed data structure for efficient partial reads',
      'Network reliability on mobile — OkHttp interceptors for retry logic and graceful degradation',
    ],
    outcomes: [
      'Working Android app with integrated map-driven community discovery',
      'Fast location-based browsing with on-device optimization',
      'Unified 3+ data sources into a single mobile workflow',
    ],
    notes: [
      'First real Android project — learned a lot about the Activity/Fragment lifecycle the hard way',
      'Glide was essential for image performance — without it, scrolling was noticeably janky',
      'Firebase Realtime Database was overkill — Firestore would have been a better fit for this data model',
      'Google Maps API quota management was a surprise challenge — had to implement caching to stay under limits',
    ],
    links: [],
    accentColor: '#b38e5d',
    paperVariant: 'worn',
  },
]

// ─── Skills ──────────────────────────────────────────────────────────────────

export const skills: SkillCategory[] = [
  {
    name: 'Languages',
    icon: '◇',
    items: ['Python', 'TypeScript', 'JavaScript', 'C++', 'Dart', 'Java', 'C', 'SQL', 'Assembly'],
  },
  {
    name: 'Frameworks & Libraries',
    icon: '◆',
    items: ['React', 'Flutter', 'Firebase', 'Framer Motion', 'GSAP', 'Three.js', 'D3.js', 'Tailwind CSS', 'Unreal Engine 5', 'Android SDK'],
  },
  {
    name: 'Data & ML',
    icon: '▣',
    items: ['NumPy', 'Pandas', 'scikit-learn', 'Data Pipelines', 'Signal Processing', 'GeoJSON', 'ArcGIS', 'OpenStreetMap'],
  },
  {
    name: 'Systems & Tools',
    icon: '⬡',
    items: ['Git', 'Unix Shell', 'SSH', 'VS Code', 'GitHub Actions', 'CI/CD', 'Docker', 'Figma'],
  },
  {
    name: 'Backend & Infrastructure',
    icon: '◈',
    items: ['Supabase', 'AWS Amplify', 'AWS S3', 'Bun/Elysia', 'PostgreSQL', 'Drizzle ORM', 'Dio'],
  },
  {
    name: 'Concepts',
    icon: '○',
    items: ['Full-Stack Development', 'System Design', 'Agile Development', 'Technical Writing', 'Motion Design'],
  },
]

// ─── Archive ─────────────────────────────────────────────────────────────────

export const archiveEntries: ArchiveEntry[] = [
  {
    title: 'CMUMaps Data Pipeline',
    description: 'Python geospatial pipelines spanning 142 buildings and 1.2K+ path segments. Normalized OpenStreetMap data into validated, versioned JSON artifacts with automated S3 publishing.',
    tags: ['Python', 'OSM', 'GeoJSON', 'AWS S3'],
    date: '2025 – present',
    status: 'in-progress',
  },
  {
    title: 'Game Creation Society — UE5 Grapple System',
    description: 'Built Unreal Engine 5 Blueprint gameplay systems for grappling, tethering, and local multiplayer combat with physics-driven interactions.',
    tags: ['Unreal Engine 5', 'Blueprints', 'Multiplayer'],
    date: '2025',
    status: 'complete',
  },
  {
    title: 'Arcadia Student App',
    description: 'Helped build a digital student ID system that improved check-ins for thousands of students. Managed finances and outreach as Developer & Treasurer.',
    tags: ['Mobile', 'Student Tools', 'Leadership'],
    date: '2024',
    status: 'complete',
  },
  {
    title: 'SoftCom Lab Research',
    description: "Built reproducible Python pipelines for multimodal speech and motion analysis in a Parkinson's mobile-health study. Contributed to a peer-reviewed CCSIT publication.",
    tags: ['Python', 'NumPy', 'scikit-learn', 'Healthcare AI/ML'],
    date: '2023 – 2024',
    status: 'complete',
  },
  {
    title: 'This Portfolio',
    description: 'The site you\'re looking at — interactive 3D terrain, custom cursors, sketchbook mode, and this secret notebook. Built with React, Three.js, Framer Motion, and GSAP.',
    tags: ['React', 'Three.js', 'Framer Motion', 'GSAP'],
    date: '2025 – present',
    status: 'in-progress',
  },
  {
    title: 'Coding Minds Curriculum',
    description: 'Designed and taught project-based Python, C++, and JavaScript curriculum centered on algorithms and competitive problem solving (ACSL).',
    tags: ['Teaching', 'Python', 'C++', 'JavaScript'],
    date: '2025 – 2026',
    status: 'complete',
  },
]
