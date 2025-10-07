const root = document.documentElement;
const body = document.body;
const canvas = document.querySelector('.background__canvas');
const ctx = canvas.getContext('2d', { alpha: true });

const glyph = document.querySelector('.cursor--glyph');
const halo = document.querySelector('.cursor--halo');
const trail = Array.from(document.querySelectorAll('.cursor--trail span'));

let pointerTarget = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let pointer = { x: pointerTarget.x, y: pointerTarget.y };
let haloState = { x: pointerTarget.x, y: pointerTarget.y };
const trailState = trail.map(() => ({ x: pointerTarget.x, y: pointerTarget.y }));
let pointerDown = false;
let rotation = 0;
let rotationTarget = 0;
let lastPointer = { x: pointerTarget.x, y: pointerTarget.y };
let accentLocked = false;

let width = 0;
let height = 0;
let dpr = window.devicePixelRatio || 1;
const particles = [];
const impulses = [];
let particleFill = 'rgba(159, 140, 255, 0.85)';
let particleLink = '79, 125, 255';

function normalizeAngle(angle) {
  let value = angle;
  if (Number.isNaN(value)) {
    return 0;
  }
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function parseColor(value) {
  if (!value) return null;
  const color = value.trim();
  if (!color) return null;
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (hex.length !== 6) return null;
    const intValue = Number.parseInt(hex, 16);
    return {
      r: (intValue >> 16) & 255,
      g: (intValue >> 8) & 255,
      b: intValue & 255,
    };
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((part, index) => index < 3);
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

function mixColor(color, target, weight) {
  return {
    r: Math.round(color.r + (target.r - color.r) * weight),
    g: Math.round(color.g + (target.g - color.g) * weight),
    b: Math.round(color.b + (target.b - color.b) * weight),
  };
}

function rgbToString({ r, g, b }) {
  return `${r}, ${g}, ${b}`;
}

function getSectionAccent(element) {
  if (!element) return null;
  const value = window.getComputedStyle(element).getPropertyValue('--cursor-accent');
  return value ? value.trim() : null;
}

function refreshParticlePalette() {
  const computed = window.getComputedStyle(root);
  const base = computed.getPropertyValue('--particle-base').trim() || '159, 140, 255';
  const link = computed.getPropertyValue('--particle-link').trim() || '79, 125, 255';
  particleFill = `rgba(${base}, 0.85)`;
  particleLink = link;
}

function setAccentPalette(value) {
  const rgb = parseColor(value);
  if (!rgb) return;
  const glow = mixColor(rgb, { r: 204, g: 212, b: 255 }, 0.35);
  const secondary = mixColor(rgb, { r: 96, g: 210, b: 255 }, 0.4);
  const tertiary = mixColor(rgb, { r: 228, g: 140, b: 255 }, 0.32);
  const particleBase = mixColor(rgb, { r: 255, g: 255, b: 255 }, 0.25);
  const particleLinkColor = mixColor(rgb, { r: 136, g: 170, b: 255 }, 0.36);

  root.style.setProperty('--cursor-active-rgb', rgbToString(rgb));
  root.style.setProperty('--cursor-glow-rgb', rgbToString(glow));
  root.style.setProperty('--gradient-highlight', rgbToString(rgb));
  root.style.setProperty('--gradient-secondary', rgbToString(secondary));
  root.style.setProperty('--gradient-tertiary', rgbToString(tertiary));
  root.style.setProperty('--particle-base', rgbToString(particleBase));
  root.style.setProperty('--particle-link', rgbToString(particleLinkColor));

  refreshParticlePalette();
}

const defaultAccentValue = window
  .getComputedStyle(root)
  .getPropertyValue('--accent-neutral')
  .trim() || '#5c6aa8';
let currentSectionAccentValue = defaultAccentValue;
setAccentPalette(defaultAccentValue);

function setCursorPosition() {
  const scale = pointerDown ? 0.94 : 1;
  glyph.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) rotate(${rotation}rad) scale(${scale})`;
  const haloScale = pointerDown ? 0.9 : 1.05;
  halo.style.transform = `translate3d(${haloState.x}px, ${haloState.y}px, 0) scale(${haloScale})`;
  trail.forEach((dot, index) => {
    const state = trailState[index];
    dot.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
  });
}

function animateCursor() {
  const follow = pointerDown ? 0.38 : 0.28;
  pointer.x += (pointerTarget.x - pointer.x) * follow;
  pointer.y += (pointerTarget.y - pointer.y) * follow;

  const haloFollow = pointerDown ? 0.2 : 0.16;
  haloState.x += (pointerTarget.x - haloState.x) * haloFollow;
  haloState.y += (pointerTarget.y - haloState.y) * haloFollow;

  trailState.forEach((state, index) => {
    const lag = Math.max(0.18, 0.38 - index * 0.04);
    const factor = pointerDown ? lag + 0.08 : lag;
    state.x += (pointerTarget.x - state.x) * factor;
    state.y += (pointerTarget.y - state.y) * factor;
  });

  const vx = pointer.x - lastPointer.x;
  const vy = pointer.y - lastPointer.y;
  const speed = Math.hypot(vx, vy);
  if (speed > 0.001) {
    rotationTarget = Math.atan2(vy, vx);
  }
  rotation += normalizeAngle(rotationTarget - rotation) * 0.2;
  const skew = Math.max(Math.min(vx * 0.12, 14), -14);
  glyph.style.setProperty('--cursor-skew', `${skew}deg`);
  halo.style.opacity = Math.min(1, 0.78 + speed * 0.025).toFixed(3);
  lastPointer = { x: pointer.x, y: pointer.y };

  setCursorPosition();
  requestAnimationFrame(animateCursor);
}

animateCursor();

window.addEventListener('pointermove', (event) => {
  pointerTarget = { x: event.clientX, y: event.clientY };
  body.classList.add('is-pointer-active');
});

window.addEventListener('pointerdown', (event) => {
  pointerDown = true;
  body.classList.add('is-pointer-down');
  impulses.push({ x: event.clientX, y: event.clientY, radius: 0, power: 1 });
});

window.addEventListener('pointerup', () => {
  pointerDown = false;
  body.classList.remove('is-pointer-down');
});

window.addEventListener('pointerleave', () => {
  body.classList.remove('is-pointer-active');
  body.classList.remove('is-pointer-down');
  pointerDown = false;
});

const cursorTargets = document.querySelectorAll('[data-cursor]');

cursorTargets.forEach((target) => {
  target.addEventListener('pointerenter', () => {
    const accentRoot = target.closest('[data-accent]');
    const accentValue = getSectionAccent(accentRoot) || currentSectionAccentValue || defaultAccentValue;
    accentLocked = true;
    body.dataset.cursor = 'accent';
    setAccentPalette(accentValue);
  });

  target.addEventListener('pointerleave', () => {
    accentLocked = false;
    body.dataset.cursor = '';
    setAccentPalette(currentSectionAccentValue || defaultAccentValue);
  });
});

const navLinks = Array.from(document.querySelectorAll('.masthead__nav a'));
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if (sections.length > 0) {
  const initialAccent = getSectionAccent(sections[0]) || defaultAccentValue;
  currentSectionAccentValue = initialAccent;
  if (!accentLocked) {
    setAccentPalette(initialAccent);
  }
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const index = sections.indexOf(entry.target);
      if (index !== -1 && entry.isIntersecting) {
        navLinks.forEach((link) => link.classList.remove('is-active'));
        navLinks[index].classList.add('is-active');
        const accentValue = getSectionAccent(entry.target) || defaultAccentValue;
        currentSectionAccentValue = accentValue;
        if (!accentLocked) {
          setAccentPalette(accentValue);
        }
      }
    });
  },
  { threshold: 0.45 }
);

sections.forEach((section) => observer.observe(section));

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

const yearNode = document.querySelector('[data-year]');
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const tiltTargets = document.querySelectorAll('[data-tilt]');

tiltTargets.forEach((element) => {
  element.addEventListener('pointermove', (event) => {
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty('--pointer-x', `${x}%`);
    element.style.setProperty('--pointer-y', `${y}%`);
    element.classList.add('is-tilting');
    clearTimeout(element._tiltTimeout);
    element._tiltTimeout = setTimeout(() => {
      element.classList.remove('is-tilting');
    }, 180);
  });

  element.addEventListener('pointerleave', () => {
    element.classList.remove('is-tilting');
    element.style.removeProperty('--pointer-x');
    element.style.removeProperty('--pointer-y');
    if (element._tiltTimeout) {
      clearTimeout(element._tiltTimeout);
    }
  });
});

const INFLUENCE_RADIUS = 240;
const LINK_DISTANCE = 170;

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.18 + Math.random() * 0.42;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = 1.1 + Math.random() * 1.8;
  }

  update(delta) {
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    if (this.x < -40 || this.x > width + 40 || this.y < -40 || this.y > height + 40) {
      this.reset();
      return;
    }

    const dx = this.x - pointerTarget.x;
    const dy = this.y - pointerTarget.y;
    const dist = Math.hypot(dx, dy);
    if (dist < INFLUENCE_RADIUS) {
      const force = (1 - dist / INFLUENCE_RADIUS) * 0.32;
      const normX = dx / (dist || 1);
      const normY = dy / (dist || 1);
      this.vx += normX * force;
      this.vy += normY * force;
    }

    impulses.forEach((impulse) => {
      const idX = this.x - impulse.x;
      const idY = this.y - impulse.y;
      const iDist = Math.hypot(idX, idY);
      if (iDist < impulse.radius) {
        const intensity = (1 - iDist / impulse.radius) * impulse.power;
        this.vx += (idX / (iDist || 1)) * intensity * 0.9;
        this.vy += (idY / (iDist || 1)) * intensity * 0.9;
      }
    });

    this.vx *= 0.984;
    this.vy *= 0.984;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = particleFill;
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
  const area = Math.max(width * height, 1);
  const density = Math.min(220, Math.max(90, Math.floor(area / 9000)));
  for (let i = 0; i < density; i += 1) {
    particles.push(new Particle());
  }
}

let lastTime = performance.now();

function render(time) {
  const delta = Math.min((time - lastTime) / 16.7, 3);
  lastTime = time;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i += 1) {
    const p1 = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      const p2 = particles[j];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.hypot(dx, dy);
      if (dist < LINK_DISTANCE) {
        const opacity = 1 - dist / LINK_DISTANCE;
        ctx.strokeStyle = `rgba(${particleLink}, ${opacity * 0.32})`;
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
    impulse.power *= 0.9;
    impulse.radius += 6;
    if (impulse.power < 0.05) {
      impulses.splice(i, 1);
    }
  }

  requestAnimationFrame(render);
}

function setupBackground() {
  resize();
  initParticles();
  refreshParticlePalette();
  lastTime = performance.now();
  requestAnimationFrame(render);
}

setupBackground();

window.addEventListener('resize', () => {
  resize();
  initParticles();
});
