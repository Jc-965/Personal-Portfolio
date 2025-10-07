const body = document.body;
const canvas = document.querySelector('.background__canvas');
const ctx = canvas.getContext('2d', { alpha: true });

const core = document.querySelector('.cursor--core');
const ring = document.querySelector('.cursor--ring');
const trail = Array.from(document.querySelectorAll('.cursor--trail span'));

let pointerTarget = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let pointer = { x: pointerTarget.x, y: pointerTarget.y };
let ringState = { x: pointer.x, y: pointer.y };
const trailState = trail.map(() => ({ x: pointer.x, y: pointer.y }));
let pointerDown = false;

function setCursorPosition() {
  core.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
  const scale = pointerDown ? 0.82 : 1;
  ring.style.transform = `translate3d(${ringState.x}px, ${ringState.y}px, 0) scale(${scale})`;
  trail.forEach((dot, index) => {
    const state = trailState[index];
    dot.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
  });
}

function animateCursor() {
  const smoothing = pointerDown ? 0.35 : 0.28;
  pointer.x += (pointerTarget.x - pointer.x) * (pointerDown ? 0.45 : 0.35);
  pointer.y += (pointerTarget.y - pointer.y) * (pointerDown ? 0.45 : 0.35);

  ringState.x += (pointerTarget.x - ringState.x) * smoothing;
  ringState.y += (pointerTarget.y - ringState.y) * smoothing;

  trailState.forEach((state, index) => {
    const lag = 0.22 + index * 0.04;
    state.x += (pointerTarget.x - state.x) * (pointerDown ? lag + 0.08 : lag + 0.04);
    state.y += (pointerTarget.y - state.y) * (pointerDown ? lag + 0.08 : lag + 0.04);
  });

  setCursorPosition();
  requestAnimationFrame(animateCursor);
}

animateCursor();

window.addEventListener('pointermove', (event) => {
  pointerTarget = { x: event.clientX, y: event.clientY };
  body.classList.add('is-pointer-active');
});

window.addEventListener('pointerdown', () => {
  pointerDown = true;
});

window.addEventListener('pointerup', () => {
  pointerDown = false;
});

window.addEventListener('pointerleave', () => {
  body.classList.remove('is-pointer-active');
  pointerDown = false;
});

// Accent-aware cursor states
const cursorTargets = document.querySelectorAll('[data-cursor]');

cursorTargets.forEach((target) => {
  target.addEventListener('pointerenter', () => {
    const type = target.getAttribute('data-cursor');
    if (type === 'accent') {
      const accentRoot = target.closest('[data-accent]');
      if (accentRoot) {
        const accent = getComputedStyle(accentRoot).getPropertyValue('--cursor-accent');
        if (accent) {
          body.style.setProperty('--cursor-accent', accent);
        }
      }
      body.dataset.cursor = 'accent';
    } else if (type === 'link' || type === 'interactive' || type === 'focus') {
      body.dataset.cursor = 'accent';
      const accentRoot = target.closest('[data-accent]');
      if (accentRoot) {
        const accent = getComputedStyle(accentRoot).getPropertyValue('--cursor-accent');
        body.style.setProperty('--cursor-accent', accent);
      } else {
        body.style.setProperty('--cursor-accent', getComputedStyle(document.documentElement).getPropertyValue('--accent-neutral'));
      }
    } else {
      body.dataset.cursor = '';
    }
  });

  target.addEventListener('pointerleave', () => {
    body.dataset.cursor = '';
    body.style.removeProperty('--cursor-accent');
  });
});

// Navigation highlighting
const navLinks = Array.from(document.querySelectorAll('.masthead__nav a'));
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const index = sections.indexOf(entry.target);
      if (index !== -1 && entry.isIntersecting) {
        navLinks.forEach((link) => link.classList.remove('is-active'));
        navLinks[index].classList.add('is-active');
      }
    });
  },
  { threshold: 0.4 }
);

sections.forEach((section) => observer.observe(section));

// Navigation toggle for mobile
const toggle = document.querySelector('.masthead__toggle');

if (toggle) {
  toggle.addEventListener('click', () => {
    document.querySelector('.masthead__nav').classList.toggle('is-open');
  });
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelector('.masthead__nav').classList.remove('is-open');
  });
});

// Footer year
const yearNode = document.querySelector('[data-year]');
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

// Background particle network
let width = 0;
let height = 0;
let dpr = window.devicePixelRatio || 1;
const particles = [];
const impulses = [];
const MAX_PARTICLES = 120;
const INFLUENCE_RADIUS = 220;

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.2 + Math.random() * 0.4;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = 1.2 + Math.random() * 1.6;
  }

  update(delta) {
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    if (this.x < -40 || this.x > width + 40 || this.y < -40 || this.y > height + 40) {
      this.reset();
    }

    // Pointer interaction
    const dx = this.x - pointerTarget.x;
    const dy = this.y - pointerTarget.y;
    const dist = Math.hypot(dx, dy);
    if (dist < INFLUENCE_RADIUS) {
      const force = (1 - dist / INFLUENCE_RADIUS) * 0.35;
      const normX = dx / (dist || 1);
      const normY = dy / (dist || 1);
      this.vx += normX * force;
      this.vy += normY * force;
    }

    // Impulses from clicks
    impulses.forEach((impulse) => {
      const idX = this.x - impulse.x;
      const idY = this.y - impulse.y;
      const iDist = Math.hypot(idX, idY);
      if (iDist < impulse.radius) {
        const intensity = (1 - iDist / impulse.radius) * impulse.power;
        this.vx += (idX / (iDist || 1)) * intensity * 0.8;
        this.vy += (idY / (iDist || 1)) * intensity * 0.8;
      }
    });

    this.vx *= 0.985;
    this.vy *= 0.985;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(159, 140, 255, 0.85)';
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initParticles() {
  particles.length = 0;
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push(new Particle());
  }
}

let lastTime = performance.now();

function render(time) {
  const delta = Math.min((time - lastTime) / 16.7, 3);
  lastTime = time;

  ctx.clearRect(0, 0, width, height);

  // Draw connections first for layering
  for (let i = 0; i < particles.length; i += 1) {
    const p1 = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      const p2 = particles[j];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 160) {
        const opacity = 1 - dist / 160;
        ctx.strokeStyle = `rgba(79, 125, 255, ${opacity * 0.35})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  particles.forEach((particle) => {
    particle.update(delta);
    particle.draw();
  });

  for (let i = impulses.length - 1; i >= 0; i -= 1) {
    const impulse = impulses[i];
    impulse.power *= 0.92;
    impulse.radius += 4;
    if (impulse.power < 0.05) {
      impulses.splice(i, 1);
    }
  }

  requestAnimationFrame(render);
}

function setupBackground() {
  resize();
  initParticles();
  lastTime = performance.now();
  requestAnimationFrame(render);
}

setupBackground();

window.addEventListener('resize', () => {
  resize();
  initParticles();
});

window.addEventListener('pointerdown', (event) => {
  impulses.push({ x: event.clientX, y: event.clientY, radius: 0, power: 1 });
});
