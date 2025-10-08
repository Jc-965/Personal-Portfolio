const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const navToggle = document.querySelector(".nav__toggle");
const navMenu = document.querySelector(".nav__menu");

navToggle?.addEventListener("click", () => {
  navMenu?.classList.toggle("is-open");
  navToggle.classList.toggle("is-active");
});

navMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("is-open");
    navToggle?.classList.remove("is-active");
  });
});

document.addEventListener("scroll", () => {
  if (!navMenu || window.innerWidth > 960) return;
  navMenu.classList.remove("is-open");
  navToggle?.classList.remove("is-active");
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const root = document.documentElement;
const cursorGlyph = document.querySelector(".cursor--glyph");
const cursorDot = document.querySelector(".cursor--dot");
const cursorRing = document.querySelector(".cursor--ring");
const cursorHalo = document.querySelector(".cursor--halo");
const background = document.querySelector(".background");
const backgroundLayers = document.querySelectorAll(".background__layer");

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const ringPosition = { ...pointer };
const haloPosition = { ...pointer };
let lastPointer = { ...pointer };
let velocity = 0;
let animationFrame;
let isPressing = false;
let pointerInViewport = false;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomBetween = (min, max) => Math.random() * (max - min) + min;

const updateCursor = () => {
  const dx = pointer.x - lastPointer.x;
  const dy = pointer.y - lastPointer.y;
  const distance = Math.hypot(dx, dy);
  velocity = 0.12 * distance + 0.88 * velocity;
  lastPointer = { ...pointer };

  ringPosition.x += (pointer.x - ringPosition.x) * 0.18;
  ringPosition.y += (pointer.y - ringPosition.y) * 0.18;

  haloPosition.x += (pointer.x - haloPosition.x) * 0.08;
  haloPosition.y += (pointer.y - haloPosition.y) * 0.08;

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const pressFactor = isPressing ? 0.82 : 1;
  const haloPressFactor = isPressing ? 1.06 : 1;
  const progressX = pointer.x / Math.max(window.innerWidth, 1);
  const progressY = pointer.y / Math.max(window.innerHeight, 1);
  const hue = 200 + progressX * 80;
  const lightness = 40 + progressY * 12 + Math.min(velocity / 22, 6);

  const ringScale = (1 + clamp(velocity / 120, 0, 0.6)) * pressFactor;
  const haloScale = (1 + clamp(velocity / 250, 0, 0.8)) * haloPressFactor;
  const glyphScale = 0.95 + clamp(velocity / 260, 0, 0.35);
  const glyphRotation = angleDeg + Math.sin(performance.now() * 0.005) * 18;

  cursorGlyph?.style.setProperty(
    "transform",
    `translate3d(${pointer.x}px, ${pointer.y}px, 0) rotate(${glyphRotation}deg) scale(${glyphScale * (isPressing ? 0.9 : 1)})`
  );

  cursorDot?.style.setProperty(
    "transform",
    `translate3d(${pointer.x}px, ${pointer.y}px, 0) scale(${isPressing ? 0.72 : 1})`
  );

  cursorRing?.style.setProperty(
    "transform",
    `translate3d(${ringPosition.x}px, ${ringPosition.y}px, 0) scale(${ringScale})`
  );

  cursorRing?.style.setProperty("opacity", Math.min(1, 0.3 + velocity / 300));

  cursorHalo?.style.setProperty(
    "transform",
    `translate3d(${haloPosition.x}px, ${haloPosition.y}px, 0) scale(${haloScale})`
  );

  if (root) {
    root.style.setProperty("--cursor-x", `${pointer.x}px`);
    root.style.setProperty("--cursor-y", `${pointer.y}px`);
    root.style.setProperty("--cursor-v", velocity.toFixed(2));
    root.style.setProperty("--cursor-angle", `${angleDeg}deg`);
    root.style.setProperty("--bg-hue", hue.toFixed(2));
    root.style.setProperty("--bg-lightness", lightness.toFixed(2));
    root.style.setProperty("--cursor-hue", hue.toFixed(2));
  }

  if (background) {
    background.style.setProperty("--cursor-x", `${pointer.x}px`);
    background.style.setProperty("--cursor-y", `${pointer.y}px`);
    background.style.setProperty("--cursor-v", velocity.toFixed(2));
    background.style.setProperty("--cursor-angle", `${angleDeg}deg`);
    background.style.setProperty("--bg-hue", hue.toFixed(2));
    background.style.setProperty("--bg-lightness", lightness.toFixed(2));
  }

  backgroundLayers.forEach((layer, index) => {
    const depth = parseFloat(layer.dataset.depth || "0.05");
    const offsetX = (pointer.x - window.innerWidth / 2) * depth;
    const offsetY = (pointer.y - window.innerHeight / 2) * depth;
    layer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    layer.style.opacity = String(clamp(0.35 + velocity / 500 - index * 0.05, 0.15, 0.8));
  });

  animationFrame = requestAnimationFrame(updateCursor);
};

const enableCursor = () => {
  if (prefersReducedMotion) return;
  cursorGlyph?.classList.remove("is-hidden");
  cursorDot?.classList.remove("is-hidden");
  cursorRing?.classList.remove("is-hidden");
  cursorHalo?.classList.remove("is-hidden");
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(updateCursor);
};

document.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointerInViewport = true;
  enableCursor();
});

document.addEventListener("pointerleave", () => {
  cursorGlyph?.classList.add("is-hidden");
  cursorDot?.classList.add("is-hidden");
  cursorRing?.classList.add("is-hidden");
  cursorHalo?.classList.add("is-hidden");
  isPressing = false;
  document.body.classList.remove("is-pressing");
  if (background) {
    background.classList.remove("is-hovered");
  }
  pointerInViewport = false;
  cancelAnimationFrame(animationFrame);
});

if (background && !prefersReducedMotion) {
  background.classList.add("is-ready");

  const backgroundCanvas = background.querySelector(".background__canvas");
  const ctx = backgroundCanvas?.getContext("2d");
  const scene = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2.2),
  };

  const grid = {
    spacing: 86,
    offsetX: 0,
    offsetY: 0,
    driftX: 0,
    driftY: 0,
  };

  const nodes = [];
  const edges = [];
  const pulses = [];
  let canvasFrame;
  let lastAutoPulse = 0;

  const distanceToSegment = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby || 1;
    let t = (apx * abx + apy * aby) / abLenSq;
    t = clamp(t, 0, 1);
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    const dx = px - closestX;
    const dy = py - closestY;
    return { distance: Math.hypot(dx, dy), closestX, closestY };
  };

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

  const initNodes = () => {
    nodes.length = 0;
    edges.length = 0;
    const count = Math.round(clamp((scene.width * scene.height) / 9000, 18, 42));
    const branchSet = new Set();
    for (let i = 0; i < count; i += 1) {
      const depth = i / count;
      const sway = Math.sin(depth * Math.PI * 1.2) * 60;
      const x = scene.width * (0.2 + Math.random() * 0.6) + sway;
      const y = scene.height * (0.08 + depth * 0.82) + Math.cos(depth * 5.2) * 18;
      nodes.push({
        id: i,
        x,
        y,
        baseX: x,
        baseY: y,
        vx: 0,
        vy: 0,
        radius: randomBetween(3.2, 5.4),
        halo: 0,
        phase: Math.random() * Math.PI * 2,
        depth: depth + Math.random() * 0.08,
      });
    }

    const sorted = [...nodes].sort((a, b) => a.baseY - b.baseY);
    sorted.forEach((node, index) => {
      const candidates = sorted
        .slice(Math.max(0, index - 6), index)
        .sort((a, b) => {
          const da = Math.hypot(node.baseX - a.baseX, node.baseY - a.baseY);
          const db = Math.hypot(node.baseX - b.baseX, node.baseY - b.baseY);
          return da - db;
        });
      const connections = candidates.slice(0, clamp(1 + Math.floor(Math.random() * 3), 1, 3));
      connections.forEach((target) => {
        const key = node.id < target.id ? `${node.id}-${target.id}` : `${target.id}-${node.id}`;
        if (!branchSet.has(key)) {
          edges.push([node.id, target.id]);
          branchSet.add(key);
        }
      });
    });
  };

  const ensureTreeBackbone = () => {
    if (!nodes.length) return;
    const sorted = [...nodes].sort((a, b) => a.baseY - b.baseY);
    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const previous = sorted[i - 1];
      const key = current.id < previous.id ? `${current.id}-${previous.id}` : `${previous.id}-${current.id}`;
      if (!edges.some(([a, b]) => (a === current.id && b === previous.id) || (a === previous.id && b === current.id))) {
        edges.push([current.id, previous.id]);
      }
    }
  };

  const addPulse = (x, y, power = 1) => {
    pulses.push({ x, y, start: performance.now(), power });
    if (pulses.length > 8) {
      pulses.shift();
    }
  };

  const animateBackground = (now) => {
    if (!ctx) return;

    ctx.clearRect(0, 0, scene.width, scene.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, scene.height);
    gradient.addColorStop(0, "#01030c");
    gradient.addColorStop(0.45, "#040a1c");
    gradient.addColorStop(1, "#020411");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

    const time = now * 0.0012;
    const pointerFactor = pointerInViewport ? clamp(velocity / 180, 0.08, 0.9) : 0.08;
    const influenceRadius = pointerInViewport ? 240 + velocity * 0.8 : 160;

    grid.driftX += 0.02 + Math.sin(time * 0.6) * 0.004;
    grid.driftY += 0.018 + Math.cos(time * 0.5) * 0.004;

    const parallaxX = pointerInViewport ? (pointer.x - scene.width / 2) * 0.08 : 0;
    const parallaxY = pointerInViewport ? (pointer.y - scene.height / 2) * 0.08 : 0;
    const offsetX = (grid.offsetX + grid.driftX + parallaxX) % grid.spacing;
    const offsetY = (grid.offsetY + grid.driftY + parallaxY) % grid.spacing;

    if (now - lastAutoPulse > 5200) {
      addPulse(Math.random() * scene.width, Math.random() * scene.height, 0.75);
      lastAutoPulse = now;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let x = -grid.spacing; x < scene.width + grid.spacing; x += grid.spacing) {
      const posX = x + offsetX;
      const distX = pointerInViewport ? Math.abs(pointer.x - posX) : Infinity;
      const alpha = 0.07 + Math.max(0, 1 - distX / 320) * 0.25 + pointerFactor * 0.2;
      const hueShift = 210 + Math.max(0, 1 - distX / 420) * 70;
      ctx.strokeStyle = `hsla(${hueShift}, 68%, 42%, ${alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, scene.height);
      ctx.stroke();
    }

    for (let y = -grid.spacing; y < scene.height + grid.spacing; y += grid.spacing) {
      const posY = y + offsetY;
      const distY = pointerInViewport ? Math.abs(pointer.y - posY) : Infinity;
      const alpha = 0.06 + Math.max(0, 1 - distY / 320) * 0.22 + pointerFactor * 0.18;
      const hueShift = 198 + Math.max(0, 1 - distY / 360) * 60;
      ctx.strokeStyle = `hsla(${hueShift}, 62%, 36%, ${alpha})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, posY);
      ctx.lineTo(scene.width, posY);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      const age = (now - pulse.start) / 1000;
      const radius = 80 + age * 420;
      const fade = Math.max(0, 1 - age / 2.2);
      if (fade <= 0) {
        pulses.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${210 + age * 60}, 86%, 64%, ${0.3 * fade})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      pulse.radius = radius;
      pulse.fade = fade;
    }

    nodes.forEach((node) => {
      node.halo *= 0.92;
      const swayX = Math.sin(time * 1.4 + node.phase) * 0.6;
      const swayY = Math.cos(time * 1.1 + node.phase) * 0.6;
      node.vx += (node.baseX - node.x) * 0.02 + swayX;
      node.vy += (node.baseY - node.y) * 0.018 + swayY;

      if (pointerInViewport) {
        const dx = node.x - pointer.x;
        const dy = node.y - pointer.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < influenceRadius) {
          const force = (1 - distance / influenceRadius) * (1.6 + pointerFactor * 1.4);
          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
          node.halo = Math.min(1, node.halo + force * 0.6 + pointerFactor * 0.6);
        }
      }

      pulses.forEach((pulse) => {
        if (!pulse.radius) return;
        const dx = node.x - pulse.x;
        const dy = node.y - pulse.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < pulse.radius) {
          const wave = (1 - distance / pulse.radius) * pulse.power;
          node.vx += (dx / distance) * wave * 1.1;
          node.vy += (dy / distance) * wave * 1.1;
          node.halo = Math.min(1, node.halo + wave * 1.2 * pulse.fade);
        }
      });

      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x += node.vx;
      node.y += node.vy;
    });

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    edges.forEach(([fromId, toId]) => {
      const from = nodes[fromId];
      const to = nodes[toId];
      if (!from || !to) return;

      const { distance: pointerDistance } = pointerInViewport
        ? distanceToSegment(pointer.x, pointer.y, from.x, from.y, to.x, to.y)
        : { distance: Infinity };

      let highlight = Math.max(from.halo, to.halo);
      if (pointerInViewport && pointerDistance < 180) {
        highlight = Math.max(highlight, (1 - pointerDistance / 180) * (0.7 + pointerFactor));
      }

      pulses.forEach((pulse) => {
        if (!pulse.radius) return;
        const { distance } = distanceToSegment(pulse.x, pulse.y, from.x, from.y, to.x, to.y);
        if (distance < pulse.radius) {
          highlight = Math.max(highlight, (1 - distance / pulse.radius) * pulse.fade * 0.8);
        }
      });

      const hue = 198 + highlight * 120;
      const alpha = 0.16 + highlight * 0.55;
      ctx.strokeStyle = `hsla(${hue}, 82%, ${42 + highlight * 20}%, ${alpha})`;
      ctx.lineWidth = 1.2 + highlight * 2.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const baseRadius = node.radius * (1 + node.depth * 0.3);
      const glowRadius = baseRadius * (2.6 + node.halo * 3.8);
      const gradientNode = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
      gradientNode.addColorStop(0, `hsla(${204 + node.halo * 120}, 90%, 72%, ${0.6 + node.halo * 0.4})`);
      gradientNode.addColorStop(1, "rgba(12, 35, 78, 0)");
      ctx.fillStyle = gradientNode;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${210 + node.halo * 90}, 92%, 72%, 0.9)`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${200 + node.halo * 120}, 92%, 82%, ${0.35 + node.halo * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius + 3 + node.halo * 6, 0, Math.PI * 2);
      ctx.stroke();
    });

    canvasFrame = requestAnimationFrame(animateBackground);
  };

  if (backgroundCanvas && ctx) {
    setCanvasSize();
    initNodes();
    ensureTreeBackbone();
    canvasFrame = requestAnimationFrame(animateBackground);
    window.addEventListener("resize", () => {
      setCanvasSize();
      initNodes();
      ensureTreeBackbone();
    });
  }

  document.addEventListener("pointermove", () => {
    background.classList.add("is-hovered");
  });

  document.addEventListener("pointerdown", (event) => {
    background.classList.add("is-active");
    addPulse(event.clientX, event.clientY, 1.2);
  });

  document.addEventListener("pointerup", () => {
    background.classList.remove("is-active");
  });

  document.addEventListener("pointerleave", () => {
    background.classList.remove("is-active");
    background.classList.remove("is-hovered");
  });
}

document.addEventListener("pointerdown", () => {
  isPressing = true;
  document.body.classList.add("is-pressing");
  pointerInViewport = true;
});

["pointerup", "pointercancel"].forEach((type) =>
  document.addEventListener(type, () => {
    isPressing = false;
    document.body.classList.remove("is-pressing");
  })
);

const focusableElements = document.querySelectorAll("a, button, input, textarea, [data-cursor]");

focusableElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    const state = element.getAttribute("data-cursor") || "interactive";
    document.body.dataset.cursor = state;
  });
  element.addEventListener("mouseleave", () => {
    delete document.body.dataset.cursor;
  });
});

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
