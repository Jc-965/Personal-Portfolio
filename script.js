// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomBetween = (min, max) => Math.random() * (max - min) + min;

// ============================================================================
// YEAR UPDATE
// ============================================================================

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

// ============================================================================
// NAVIGATION MENU
// ============================================================================

const navToggle = document.querySelector(".nav__toggle");
const navMenu = document.querySelector(".nav__menu");

const closeNavMenu = () => {
  navMenu?.classList.remove("is-open");
  navToggle?.classList.remove("is-active");
};

navToggle?.addEventListener("click", () => {
  navMenu?.classList.toggle("is-open");
  navToggle.classList.toggle("is-active");
});

navMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");

    // Add click animation
    link.classList.add("is-clicking");
    setTimeout(() => link.classList.remove("is-clicking"), 150);

    if (targetId === "#top") {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    }
    closeNavMenu();
  });
});

// Active section tracking
const navLinks = navMenu?.querySelectorAll("a");
const sections = document.querySelectorAll("section[id]");

const updateActiveNav = () => {
  if (!navLinks || !sections.length) return;

  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;

  // Find which section is most in view
  let activeSection = null;
  let maxVisibility = 0;

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const sectionTop = rect.top + scrollY;
    const sectionHeight = rect.height;

    // Calculate how much of the section is visible in the viewport
    const visibleTop = Math.max(scrollY, sectionTop);
    const visibleBottom = Math.min(scrollY + windowHeight, sectionTop + sectionHeight);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    // Weight sections near the top of viewport more heavily
    const topWeight = 1 - Math.min(Math.abs(rect.top) / windowHeight, 1) * 0.5;
    const visibility = visibleHeight * topWeight;

    if (visibility > maxVisibility) {
      maxVisibility = visibility;
      activeSection = section;
    }
  });

  // Update nav link active states
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    const isActive = activeSection && href === `#${activeSection.id}`;
    link.classList.toggle("is-active", isActive);
  });
};

// Throttle scroll updates for performance
let scrollTimeout;
window.addEventListener("scroll", () => {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    updateActiveNav();
    scrollTimeout = null;
  }, 50);
}, { passive: true });

// Initial update
updateActiveNav();

document.addEventListener("scroll", () => {
  if (!navMenu || window.innerWidth > 960) return;
  closeNavMenu();
});

// ============================================================================
// GLOBAL CONSTANTS & STATE
// ============================================================================

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const root = document.documentElement;
const cursorNova = document.querySelector(".cursor--nova");
const cursorTrailEl = cursorNova?.querySelector(".cursor__trail");
const background = document.querySelector(".background");
const backgroundLayers = document.querySelectorAll(".background__layer");
const backToTopButton = document.querySelector(".back-to-top");

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const pointerTarget = { ...pointer };
const trailPoint = { ...pointer };

let lastPointer = { ...pointer };
let velocity = 0;
let animationFrame;
let isPressing = false;
let pointerInViewport = false;

// ============================================================================
// CURSOR & POINTER EFFECTS
// ============================================================================

const applyPointerStyles = () => {
  const progressX = pointer.x / Math.max(window.innerWidth, 1);
  const progressY = pointer.y / Math.max(window.innerHeight, 1);
  const hue = 200 + progressX * 80;
  const lightness = 40 + progressY * 12 + Math.min(velocity / 18, 8);
  const speedFactor = clamp(velocity / 320, 0, 1);

  if (cursorNova) {
    cursorNova.style.setProperty("--cursor-speed", speedFactor.toFixed(3));
    const offsetX = clamp(pointer.x - trailPoint.x, -80, 80);
    cursorNova.style.setProperty("--trail-offset", `${offsetX.toFixed(2)}px`);
    if (cursorTrailEl) {
      const trailOpacity = Math.max(0.15, 0.2 + speedFactor * 0.4);
      cursorTrailEl.style.opacity = trailOpacity.toFixed(3);
    }
  }

  if (root) {
    root.style.setProperty("--cursor-x", `${pointer.x}px`);
    root.style.setProperty("--cursor-y", `${pointer.y}px`);
    root.style.setProperty("--cursor-v", velocity.toFixed(2));
    root.style.setProperty("--cursor-angle", `0deg`);
    root.style.setProperty("--bg-hue", hue.toFixed(2));
    root.style.setProperty("--bg-lightness", lightness.toFixed(2));
    root.style.setProperty("--cursor-hue", hue.toFixed(2));
  }

  if (background) {
    background.style.setProperty("--cursor-x", `${pointer.x}px`);
    background.style.setProperty("--cursor-y", `${pointer.y}px`);
    background.style.setProperty("--cursor-v", velocity.toFixed(2));
    background.style.setProperty("--cursor-angle", `0deg`);
    background.style.setProperty("--bg-hue", hue.toFixed(2));
    background.style.setProperty("--bg-lightness", lightness.toFixed(2));
  }

  backgroundLayers.forEach((layer, index) => {
    const depth = parseFloat(layer.dataset.depth || "0.05");
    const offsetX = (pointer.x - window.innerWidth / 2) * depth;
    const offsetY = (pointer.y - window.innerHeight / 2) * depth;
    layer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    layer.style.opacity = String(
      clamp(0.32 + velocity / 640 - index * 0.05, 0.1, 0.72)
    );
  });
};

// ============================================================================
// BACK TO TOP BUTTON
// ============================================================================

backToTopButton?.addEventListener("click", (event) => {
  event.preventDefault();
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
});

const updateCursor = () => {
  pointer.x = pointerTarget.x;
  pointer.y = pointerTarget.y;

  const dx = pointer.x - lastPointer.x;
  const dy = pointer.y - lastPointer.y;
  const distance = Math.hypot(dx, dy);
  velocity = 0.18 * distance + 0.82 * velocity;
  lastPointer = { ...pointer };
  trailPoint.x +=
    (pointer.x - trailPoint.x) * (prefersReducedMotion ? 1 : 0.16);
  trailPoint.y +=
    (pointer.y - trailPoint.y) * (prefersReducedMotion ? 1 : 0.16);
  applyPointerStyles();

  animationFrame = requestAnimationFrame(updateCursor);
};

const enableCursor = () => {
  cursorNova?.classList.remove("is-hidden");
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(updateCursor);
};

document.addEventListener("pointermove", (event) => {
  pointerTarget.x = event.clientX;
  pointerTarget.y = event.clientY;
  pointerInViewport = true;
  enableCursor();
});

document.addEventListener("pointerenter", (event) => {
  pointerTarget.x = event.clientX;
  pointerTarget.y = event.clientY;
  pointer.x = pointerTarget.x;
  pointer.y = pointerTarget.y;
  trailPoint.x = pointer.x;
  trailPoint.y = pointer.y;
  pointerInViewport = true;
  enableCursor();
});

document.addEventListener("pointerleave", () => {
  cursorNova?.classList.add("is-hidden");
  cursorNova?.classList.remove("is-pressed");
  cursorNova?.removeAttribute("data-mode");
  isPressing = false;
  document.body.classList.remove("is-pressing");
  if (background) {
    background.classList.remove("is-hovered");
  }
  pointerInViewport = false;
  trailPoint.x = pointer.x;
  trailPoint.y = pointer.y;
  cancelAnimationFrame(animationFrame);
  pointer.x = window.innerWidth / 2;
  pointer.y = window.innerHeight / 2;
  pointerTarget.x = pointer.x;
  pointerTarget.y = pointer.y;
  trailPoint.x = pointer.x;
  trailPoint.y = pointer.y;
  applyPointerStyles();
});

applyPointerStyles();

// ============================================================================
// ANIMATED BACKGROUND CANVAS
// ============================================================================

// Detect low-end devices for performance optimization
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEnd = isMobile || navigator.hardwareConcurrency <= 4 || window.innerWidth < 768;

if (background && !prefersReducedMotion) {
  background.classList.add("is-ready");

  const backgroundCanvas = background.querySelector(".background__canvas");
  const ctx = backgroundCanvas?.getContext("2d");

  const scene = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: isLowEnd ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 2.2),
  };

  const grid = {
    spacing: isLowEnd ? 42 : 34,
    offsetX: 0,
    offsetY: 0,
    driftX: 0,
    driftY: 0,
  };

  const nodes = [];
  const edges = [];
  const impulses = [];
  let canvasFrame;
  let lastFrameTime = 0;
  const targetFPS = isLowEnd ? 30 : 60;
  const frameInterval = 1000 / targetFPS;

  // Calculate distance from point to line segment
  const distanceToSegment = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby || 1;
    const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    const dx = px - closestX;
    const dy = py - closestY;
    return { distance: Math.hypot(dx, dy), closestX, closestY };
  };

  // Configure canvas dimensions and scaling
  const setCanvasSize = () => {
    if (!backgroundCanvas || !ctx) return;

    scene.width = window.innerWidth;
    scene.height = window.innerHeight;
    scene.dpr = Math.min(window.devicePixelRatio || 1, 2.2);

    backgroundCanvas.width = scene.width * scene.dpr;
    backgroundCanvas.height = scene.height * scene.dpr;
    backgroundCanvas.style.width = `${scene.width}px`;
    backgroundCanvas.style.height = `${scene.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scene.dpr, scene.dpr);
  };

  // Initialize node network with tree-like structure
  const initNodes = () => {
    nodes.length = 0;
    edges.length = 0;

    const branchSet = new Set();
    // Reduce node count significantly on low-end devices
    const treeCount = isLowEnd
      ? Math.max(3, Math.round(scene.width / 400))
      : Math.max(6, Math.round(scene.width / 220));
    const nodesPerTree = isLowEnd
      ? Math.round(clamp(scene.height / 160, 6, 12))
      : Math.round(clamp(scene.height / 90, 14, 30));
    const treeColumns = [];

    // Create edge connection between nodes
    const connect = (fromId, toId) => {
      if (fromId === undefined || toId === undefined) return;
      const key = fromId < toId ? `${fromId}-${toId}` : `${toId}-${fromId}`;
      if (!branchSet.has(key)) {
        branchSet.add(key);
        edges.push([fromId, toId]);
      }
    };

    // Generate vertical tree structures
    for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
      const column = [];
      const baseX = ((treeIndex + 0.5) / treeCount) * scene.width + randomBetween(-48, 48);
      const branchSwing = randomBetween(18, 32);
      const wobble = randomBetween(0.8, 1.8);

      for (let i = 0; i < nodesPerTree; i += 1) {
        const depth = i / Math.max(nodesPerTree - 1, 1);
        const sway = Math.sin(depth * Math.PI * wobble) * branchSwing;
        const noise = randomBetween(-12, 12);
        const x = clamp(baseX + sway + noise, 32, scene.width - 32);
        const y = scene.height * (0.04 + depth * 0.88) + randomBetween(-18, 18);
        const id = nodes.length;

        nodes.push({
          id,
          x,
          y,
          baseX: x,
          baseY: y,
          anchorX: x,
          anchorY: y,
          vx: 0,
          vy: 0,
          radius: randomBetween(0.8, 1.6),
          halo: 0,
          phase: Math.random() * Math.PI * 2,
          depth: depth + Math.random() * 0.05,
          driftRadius: randomBetween(14, 40) * (0.4 + depth * 0.55),
          driftSpeed: randomBetween(0.1, 0.28),
          swirlSpeed: randomBetween(0.06, 0.2),
          jitter: randomBetween(4, 12),
        });

        column.push(id);

        // Connect to previous node in column
        const previousId = column[column.length - 2];
        connect(previousId, id);

        // Randomly create branch connections
        if (column.length > 4 && Math.random() > 0.62) {
          const branchSpan = Math.min(4, column.length - 2);
          const backOffset = Math.floor(Math.random() * branchSpan);
          const branchId = column[Math.max(0, column.length - 2 - backOffset)];
          connect(branchId, id);
        }
      }
      treeColumns.push(column);
    }

    // Connect adjacent tree columns
    for (let treeIndex = 0; treeIndex < treeColumns.length - 1; treeIndex += 1) {
      const current = treeColumns[treeIndex];
      const next = treeColumns[treeIndex + 1];
      const pairCount = Math.min(current.length, next.length);
      const stride = Math.max(2, Math.floor(pairCount / 5));

      for (let i = stride; i < pairCount; i += stride) {
        const from = current[i - Math.floor(Math.random() * Math.min(2, i))];
        const to = next[Math.min(next.length - 1, i + Math.floor(Math.random() * 3) - 1)];
        connect(from, to);
      }
    }

    // Create sparse long-distance connections
    for (let treeIndex = 0; treeIndex < treeColumns.length - 2; treeIndex += 1) {
      const current = treeColumns[treeIndex];
      const far = treeColumns[treeIndex + 2];
      if (!current || !far) continue;

      const pairCount = Math.min(current.length, far.length);
      const attempts = Math.max(1, Math.floor(pairCount / 6));

      for (let i = 0; i < attempts; i += 1) {
        if (Math.random() > 0.55) continue;
        const from = current[Math.floor(Math.random() * pairCount)];
        const to = far[Math.floor(Math.random() * pairCount)];
        connect(from, to);
      }
    }
  };

  // Add ripple impulse effect at coordinates (skip on low-end)
  const addImpulse = (x, y, power = 1.35) => {
    if (isLowEnd) return; // Skip impulses on low-end devices

    impulses.push({
      x,
      y,
      power,
      radius: 60,
      start: performance.now(),
    });

    // Limit active impulses
    if (impulses.length > 8) {
      impulses.shift();
    }
  };

  // Main animation loop for background canvas
  const animateBackground = (now) => {
    if (!ctx) return;

    // Frame throttling for low-end devices
    if (isLowEnd) {
      const elapsed = now - lastFrameTime;
      if (elapsed < frameInterval) {
        canvasFrame = requestAnimationFrame(animateBackground);
        return;
      }
      lastFrameTime = now - (elapsed % frameInterval);
    }

    // Clear canvas
    ctx.clearRect(0, 0, scene.width, scene.height);

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, scene.width, scene.height);
    gradient.addColorStop(0, "#020218");
    gradient.addColorStop(0.4, "#050523");
    gradient.addColorStop(0.75, "#03031a");
    gradient.addColorStop(1, "#010114");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

    const time = now * 0.0012;
    const pointerFactor = pointerInViewport ? clamp(velocity / 180, 0.08, 0.92) : 0.06;
    const influenceRadius = pointerInViewport ? 280 + velocity * 0.8 : 170;

    // Update grid drift and parallax
    grid.spacing = isLowEnd ? clamp(scene.width / 28, 36, 50) : clamp(scene.width / 44, 26, 34);
    grid.driftX += 0.032 + Math.sin(time * 0.6) * 0.007;
    grid.driftY += 0.028 + Math.cos(time * 0.5) * 0.007;

    const parallaxX = pointerInViewport && !isLowEnd ? (pointer.x - scene.width / 2) * 0.1 : 0;
    const parallaxY = pointerInViewport && !isLowEnd ? (pointer.y - scene.height / 2) * 0.1 : 0;
    const offsetX = (grid.offsetX + grid.driftX + parallaxX) % grid.spacing;
    const offsetY = (grid.offsetY + grid.driftY + parallaxY) % grid.spacing;

    ctx.save();
    ctx.globalAlpha = isLowEnd ? 0.7 : 0.9;

    // Larger steps on low-end devices for fewer line segments
    const warpStepY = isLowEnd ? grid.spacing : grid.spacing / 2;
    const warpStepX = isLowEnd ? grid.spacing : grid.spacing / 2;
    const gravityRadius = pointerInViewport && !isLowEnd ? 320 + velocity * 0.6 : 0;

    // Draw vertical grid lines with distortion
    for (let x = -grid.spacing; x < scene.width + grid.spacing; x += grid.spacing) {
      const baseX = x + offsetX;
      const hueShift = 208 + (pointerInViewport && !isLowEnd ? clamp(1 - Math.abs(pointer.x - baseX) / 420, 0, 1) * 48 : 0);
      const alpha = isLowEnd ? 0.16 : 0.14 + pointerFactor * 0.28 + (pointerInViewport ? clamp(1 - Math.abs(pointer.x - baseX) / 360, 0, 1) * 0.28 : 0);

      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 78%, 58%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();

      const steps = Math.ceil((scene.height + grid.spacing * 2) / warpStepY);
      for (let s = 0; s <= steps; s += 1) {
        const baseY = -grid.spacing + s * warpStepY + offsetY;
        let drawX = baseX;
        let drawY = baseY;

        // Apply pointer gravity effect (skip on low-end)
        if (pointerInViewport && !isLowEnd) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawX += dx * influence * 0.22;
          drawY += dy * influence * 0.04;
        }

        // Apply impulse ripple effects (skip on low-end)
        if (!isLowEnd) {
          impulses.forEach((impulse) => {
            if (!impulse.radius) return;
            const idx = drawX - impulse.x;
            const idy = drawY - impulse.y;
            const dist = Math.hypot(idx, idy);
            if (dist < impulse.radius) {
              const strength = (1 - dist / impulse.radius) * impulse.power;
              const normX = idx / (dist || 1);
              drawX += normX * strength * 22;
            }
          });
        }

        s === 0 ? ctx.moveTo(drawX, drawY) : ctx.lineTo(drawX, drawY);
      }
      ctx.stroke();
    }

    // Draw horizontal grid lines with distortion
    for (let y = -grid.spacing; y < scene.height + grid.spacing; y += grid.spacing) {
      const baseY = y + offsetY;
      const hueShift = 200 + (pointerInViewport && !isLowEnd ? clamp(1 - Math.abs(pointer.y - baseY) / 360, 0, 1) * 42 : 0);
      const alpha = isLowEnd ? 0.15 : 0.13 + pointerFactor * 0.26 + (pointerInViewport ? clamp(1 - Math.abs(pointer.y - baseY) / 320, 0, 1) * 0.26 : 0);

      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 76%, 56%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.78;
      ctx.beginPath();

      const steps = Math.ceil((scene.width + grid.spacing * 2) / warpStepX);
      for (let s = 0; s <= steps; s += 1) {
        const baseX = -grid.spacing + s * warpStepX + offsetX;
        let drawX = baseX;
        let drawY = baseY;

        // Apply pointer gravity effect (skip on low-end)
        if (pointerInViewport && !isLowEnd) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawY += dy * influence * 0.22;
          drawX += dx * influence * 0.04;
        }

        // Apply impulse ripple effects (skip on low-end)
        if (!isLowEnd) {
          impulses.forEach((impulse) => {
            if (!impulse.radius) return;
            const idx = drawX - impulse.x;
            const idy = drawY - impulse.y;
            const dist = Math.hypot(idx, idy);
            if (dist < impulse.radius) {
              const strength = (1 - dist / impulse.radius) * impulse.power;
              const normY = idy / (dist || 1);
              drawY += normY * strength * 22;
            }
          });
        }

        s === 0 ? ctx.moveTo(drawX, drawY) : ctx.lineTo(drawX, drawY);
      }
      ctx.stroke();
    }

    ctx.restore();

    // Update and clean up impulses
    for (let i = impulses.length - 1; i >= 0; i -= 1) {
      const impulse = impulses[i];
      impulse.radius += 34;
      impulse.power *= 0.92;

      const age = (now - impulse.start) / 1000;
      impulse.fade = Math.max(0, 1 - age / 1.6);

      if (impulse.power < 0.05 || impulse.fade <= 0) {
        impulses.splice(i, 1);
      }
    }

    // Apply node separation forces (skip on low-end devices for performance)
    if (!isLowEnd) {
      for (let i = 0; i < nodes.length; i += 1) {
        const nodeA = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const nodeB = nodes[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distSq = dx * dx + dy * dy;
          const separationRadius = 46;

          if (distSq === 0 || distSq > separationRadius * separationRadius) continue;

          const dist = Math.sqrt(distSq);
          const push = ((separationRadius - dist) / separationRadius) * 0.42;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          nodeA.vx -= nx * push;
          nodeA.vy -= ny * push;
          nodeB.vx += nx * push;
          nodeB.vy += ny * push;
        }
      }
    }

    // Update node physics and interactions
    nodes.forEach((node) => {
      node.halo *= 0.92;

      // Calculate organic drift motion
      const driftX = Math.sin(time * node.driftSpeed + node.phase) * node.driftRadius;
      const driftY = Math.cos(time * node.swirlSpeed + node.phase * 1.2) * node.driftRadius * 0.6;
      const jitterX = Math.sin(time * 0.6 + node.phase * 1.7) * node.jitter;
      const jitterY = Math.cos(time * 0.5 + node.phase * 1.3) * node.jitter;

      node.baseX = clamp(node.anchorX + driftX + jitterX, 36, scene.width - 36);
      node.baseY = clamp(node.anchorY + driftY + jitterY, 36, scene.height - 36);

      const swayX = Math.sin(time * 1.2 + node.phase) * 0.45;
      const swayY = Math.cos(time * 1 + node.phase) * 0.45;
      node.vx += (node.baseX - node.x) * 0.016 + swayX;
      node.vy += (node.baseY - node.y) * 0.014 + swayY;

      // Pointer repulsion effect (simplified on low-end)
      if (pointerInViewport && !isLowEnd) {
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const distance = Math.hypot(dx, dy) || 0.001;

        if (distance < influenceRadius) {
          const force = (1 - distance / influenceRadius) * (0.7 + pointerFactor * 1.2);
          node.vx -= (dx / distance) * force;
          node.vy -= (dy / distance) * force;
          node.halo = Math.min(1, node.halo + force * 0.45 + pointerFactor * 0.32);
        }
      }

      // Impulse wave effects (skip on low-end)
      if (!isLowEnd) {
        impulses.forEach((impulse) => {
          if (!impulse.radius) return;
          const dx = node.x - impulse.x;
          const dy = node.y - impulse.y;
          const distance = Math.hypot(dx, dy) || 0.001;

          if (distance < impulse.radius) {
            const wave = (1 - distance / impulse.radius) * impulse.power;
            node.vx += (dx / distance) * wave * 1.55;
            node.vy += (dy / distance) * wave * 1.55;
            node.halo = Math.min(1, node.halo + wave * 1.1 * impulse.fade);
          }
        });
      }

      // Apply velocity damping and update position
      node.vx *= 0.9;
      node.vy *= 0.9;
      node.x += node.vx;
      node.y += node.vy;
      node.x = clamp(node.x, 24, scene.width - 24);
      node.y = clamp(node.y, 24, scene.height - 24);
    });

    // Draw edges between nodes
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    edges.forEach(([fromId, toId]) => {
      const from = nodes[fromId];
      const to = nodes[toId];
      if (!from || !to) return;

      let highlight = 0;

      if (isLowEnd) {
        // Simplified highlight calculation for low-end devices
        highlight = Math.max(from.halo, to.halo) * 0.5;
      } else {
        // Calculate proximity to pointer
        const { distance: pointerDistance } = pointerInViewport
          ? distanceToSegment(pointer.x, pointer.y, from.x, from.y, to.x, to.y)
          : { distance: Infinity };

        // Calculate highlight intensity
        highlight = Math.max(from.halo, to.halo) * 0.78;

        if (pointerInViewport && pointerDistance < 160) {
          highlight = Math.max(highlight, (1 - pointerDistance / 160) * (0.7 + pointerFactor));
        }

        // Add impulse highlights
        impulses.forEach((impulse) => {
          if (!impulse.radius) return;
          const { distance } = distanceToSegment(impulse.x, impulse.y, from.x, from.y, to.x, to.y);
          if (distance < impulse.radius) {
            highlight = Math.max(highlight, (1 - distance / impulse.radius) * impulse.fade * 0.4);
          }
        });
      }

      // Draw edge with dynamic color
      const hue = 208 + highlight * 100;
      const alpha = isLowEnd ? 0.2 : 0.16 + highlight * 0.42;
      ctx.strokeStyle = `hsla(${hue}, 88%, ${42 + highlight * 18}%, ${alpha})`;
      ctx.lineWidth = isLowEnd ? 0.6 : 0.45 + highlight * 1.3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    // Draw nodes with glow effects (simplified for low-end devices)
    nodes.forEach((node) => {
      const baseRadius = node.radius * (0.78 + node.depth * 0.26);

      if (isLowEnd) {
        // Simplified rendering for low-end devices - no gradients
        ctx.fillStyle = `hsla(${212 + node.halo * 90}, 92%, 76%, ${0.7 + node.halo * 0.18})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const glowRadius = baseRadius * (1.9 + node.halo * 2.6);

        // Draw outer glow
        const gradientNode = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
        gradientNode.addColorStop(0, `hsla(${210 + node.halo * 110}, 92%, 70%, ${0.34 + node.halo * 0.24})`);
        gradientNode.addColorStop(0.65, `hsla(${212 + node.halo * 120}, 88%, 60%, ${0.24 + node.halo * 0.22})`);
        gradientNode.addColorStop(1, "rgba(6, 18, 48, 0)");
        ctx.fillStyle = gradientNode;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw node core
        ctx.fillStyle = `hsla(${212 + node.halo * 90}, 92%, 76%, ${0.7 + node.halo * 0.18})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw node outline
        ctx.strokeStyle = `hsla(${208 + node.halo * 120}, 92%, 82%, ${0.22 + node.halo * 0.28})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius + 1.6 + node.halo * 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    canvasFrame = requestAnimationFrame(animateBackground);
  };

  // Initialize canvas and start animation
  if (backgroundCanvas && ctx) {
    setCanvasSize();
    initNodes();
    canvasFrame = requestAnimationFrame(animateBackground);

    window.addEventListener("resize", () => {
      setCanvasSize();
      initNodes();
    });
  }

  // Background interaction handlers
  document.addEventListener("pointermove", () => {
    background.classList.add("is-hovered");
  });

  document.addEventListener("pointerdown", (event) => {
    background.classList.add("is-active");
    addImpulse(event.clientX, event.clientY, 1.6);
  });

  document.addEventListener("pointerup", () => {
    background.classList.remove("is-active");
  });

  document.addEventListener("pointerleave", () => {
    background.classList.remove("is-active");
    background.classList.remove("is-hovered");
  });
}

// ============================================================================
// POINTER INTERACTION HANDLERS
// ============================================================================

document.addEventListener("pointerdown", (event) => {
  isPressing = true;
  document.body.classList.add("is-pressing");
  pointerInViewport = true;
  pointerTarget.x = event.clientX;
  pointerTarget.y = event.clientY;
  cursorNova?.classList.add("is-pressed");
  enableCursor();
});

["pointerup", "pointercancel"].forEach((type) => {
  document.addEventListener(type, () => {
    isPressing = false;
    document.body.classList.remove("is-pressing");
    cursorNova?.classList.remove("is-pressed");
  });
});

// ============================================================================
// CURSOR MODE SWITCHING
// ============================================================================

const focusableElements = document.querySelectorAll("a, button, input, textarea, [data-cursor]");

focusableElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    const state = element.getAttribute("data-cursor") || "interactive";
    document.body.dataset.cursor = state;
    cursorNova?.setAttribute("data-mode", state);
  });

  element.addEventListener("mouseleave", () => {
    delete document.body.dataset.cursor;
    cursorNova?.removeAttribute("data-mode");
  });
});

// ============================================================================
// INTERSECTION OBSERVERS
// ============================================================================

// Animate elements on scroll
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  document
    .querySelectorAll(".panel, .project-card, .timeline__item, [data-animate]")
    .forEach((el) => observer.observe(el));
}

// Dynamic accent color switching
const accentSections = document.querySelectorAll("section[data-accent]");

if ("IntersectionObserver" in window && accentSections.length) {
  const accentObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.body.style.setProperty(
            "--accent-active",
            `var(--accent-${entry.target.dataset.accent})`
          );
        }
      });
    },
    { threshold: 0.51 }
  );

  accentSections.forEach((section) => accentObserver.observe(section));
}
