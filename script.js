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
const cursorComet = document.querySelector(".cursor--comet");
const background = document.querySelector(".background");
const backgroundLayers = document.querySelectorAll(".background__layer");

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastPointer = { ...pointer };
let velocity = 0;
let animationFrame;
let isPressing = false;
let pointerInViewport = false;
const trail = [];
const maxTrail = 14;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomBetween = (min, max) => Math.random() * (max - min) + min;

const updateCursor = () => {
  const dx = pointer.x - lastPointer.x;
  const dy = pointer.y - lastPointer.y;
  const distance = Math.hypot(dx, dy);
  velocity = 0.18 * distance + 0.82 * velocity;
  lastPointer = { ...pointer };

  trail.unshift({ x: pointer.x, y: pointer.y });
  if (trail.length > maxTrail) {
    trail.pop();
  }

  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;
  const progressX = pointer.x / Math.max(window.innerWidth, 1);
  const progressY = pointer.y / Math.max(window.innerHeight, 1);
  const hue = 200 + progressX * 80;
  const lightness = 40 + progressY * 12 + Math.min(velocity / 18, 8);
  const speedFactor = clamp(velocity / 320, 0, 1);
  const scale = isPressing ? 0.82 : 1 + speedFactor * 0.25;

  if (cursorComet) {
    cursorComet.style.setProperty(
      "transform",
      `translate3d(${pointer.x}px, ${pointer.y}px, 0) rotate(${angleDeg}deg) scale(${scale})`
    );
    cursorComet.style.setProperty("--comet-velocity", (0.45 + speedFactor * 0.45).toFixed(2));

    const trailShadow = trail
      .map((point, index) => {
        if (index === 0) return null;
        const progress = index / Math.max(trail.length - 1, 1);
        const fade = Math.pow(1 - progress, 1.6);
        const offsetX = point.x - pointer.x;
        const offsetY = point.y - pointer.y;
        const blur = Math.max(8 - index * 0.4, 2);
        const spread = Math.max(6 - index * 0.3, 1.5);
        const hueShift = hue + progress * 36;
        return `${offsetX}px ${offsetY}px ${blur}px ${spread}px hsla(${hueShift.toFixed(1)}, 92%, ${68 - progress * 14}%, ${0.28 * fade})`;
      })
      .filter(Boolean)
      .join(", ");

    cursorComet.style.boxShadow = trailShadow;
  }

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
    layer.style.opacity = String(clamp(0.32 + velocity / 640 - index * 0.05, 0.1, 0.72));
  });

  animationFrame = requestAnimationFrame(updateCursor);
};

const enableCursor = () => {
  if (prefersReducedMotion) return;
  cursorComet?.classList.remove("is-hidden");
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
  cursorComet?.classList.add("is-hidden");
  isPressing = false;
  document.body.classList.remove("is-pressing");
  if (background) {
    background.classList.remove("is-hovered");
  }
  pointerInViewport = false;
  trail.length = 0;
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
    spacing: 52,
    offsetX: 0,
    offsetY: 0,
    driftX: 0,
    driftY: 0,
  };

  const nodes = [];
  const edges = [];
  const pulses = [];
  let canvasFrame;

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
    const branchSet = new Set();
    const treeCount = Math.max(3, Math.round(scene.width / 420));
    const nodesPerTree = Math.round(clamp(scene.height / 120, 9, 18));
    const treeColumns = [];

    const connect = (fromId, toId) => {
      if (fromId === undefined || toId === undefined) return;
      const key = fromId < toId ? `${fromId}-${toId}` : `${toId}-${fromId}`;
      if (!branchSet.has(key)) {
        branchSet.add(key);
        edges.push([fromId, toId]);
      }
    };

    for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
      const column = [];
      const baseX = ((treeIndex + 0.5) / treeCount) * scene.width + randomBetween(-42, 42);
      const branchSwing = randomBetween(18, 34);
      const wobble = randomBetween(0.6, 1.2);
      for (let i = 0; i < nodesPerTree; i += 1) {
        const depth = i / Math.max(nodesPerTree - 1, 1);
        const sway = Math.sin(depth * Math.PI * wobble) * branchSwing;
        const noise = randomBetween(-10, 10);
        const x = clamp(baseX + sway + noise, 24, scene.width - 24);
        const y = scene.height * (0.08 + depth * 0.84) + randomBetween(-16, 16);
        const id = nodes.length;

        nodes.push({
          id,
          x,
          y,
          baseX: x,
          baseY: y,
          vx: 0,
          vy: 0,
          radius: randomBetween(1.4, 2.6),
          halo: 0,
          phase: Math.random() * Math.PI * 2,
          depth: depth + Math.random() * 0.05,
        });

        column.push(id);
        const previousId = column[column.length - 2];
        connect(previousId, id);

        if (column.length > 3 && Math.random() > 0.58) {
          const branchSpan = Math.min(3, column.length - 2);
          const branchId = column[column.length - 1 - Math.floor(Math.random() * branchSpan) - 1];
          connect(branchId, id);
        }
      }
      treeColumns.push(column);
    }

    for (let treeIndex = 0; treeIndex < treeColumns.length - 1; treeIndex += 1) {
      const current = treeColumns[treeIndex];
      const next = treeColumns[treeIndex + 1];
      const pairCount = Math.min(current.length, next.length);
      const stride = Math.max(2, Math.floor(pairCount / 4));
      for (let i = stride; i < pairCount; i += stride) {
        const from = current[i - Math.floor(Math.random() * Math.min(2, i))];
        const to = next[Math.min(next.length - 1, i + Math.floor(Math.random() * 2) - 1)];
        connect(from, to);
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

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const warpStepY = grid.spacing / 2;
    const warpStepX = grid.spacing / 2;
    const gravityRadius = pointerInViewport ? 320 + velocity * 0.6 : 0;

    for (let x = -grid.spacing; x < scene.width + grid.spacing; x += grid.spacing) {
      const baseX = x + offsetX;
      const hueShift = 208 + (pointerInViewport ? clamp(1 - Math.abs(pointer.x - baseX) / 420, 0, 1) * 60 : 0);
      const alpha = 0.05 + pointerFactor * 0.18 + (pointerInViewport ? clamp(1 - Math.abs(pointer.x - baseX) / 360, 0, 1) * 0.22 : 0);
      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 68%, 38%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      const steps = Math.ceil((scene.height + grid.spacing * 2) / warpStepY);
      for (let s = 0; s <= steps; s += 1) {
        const baseY = -grid.spacing + s * warpStepY + offsetY;
        let drawX = baseX;
        const drawY = baseY;
        if (pointerInViewport) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawX += dx * influence * 0.22;
        }
        if (s === 0) {
          ctx.moveTo(drawX, drawY);
        } else {
          ctx.lineTo(drawX, drawY);
        }
      }
      ctx.stroke();
    }

    for (let y = -grid.spacing; y < scene.height + grid.spacing; y += grid.spacing) {
      const baseY = y + offsetY;
      const hueShift = 196 + (pointerInViewport ? clamp(1 - Math.abs(pointer.y - baseY) / 360, 0, 1) * 48 : 0);
      const alpha = 0.045 + pointerFactor * 0.16 + (pointerInViewport ? clamp(1 - Math.abs(pointer.y - baseY) / 320, 0, 1) * 0.2 : 0);
      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 62%, 34%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const steps = Math.ceil((scene.width + grid.spacing * 2) / warpStepX);
      for (let s = 0; s <= steps; s += 1) {
        const baseX = -grid.spacing + s * warpStepX + offsetX;
        let drawY = baseY;
        const drawX = baseX;
        if (pointerInViewport) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawY += dy * influence * 0.22;
        }
        if (s === 0) {
          ctx.moveTo(drawX, drawY);
        } else {
          ctx.lineTo(drawX, drawY);
        }
      }
      ctx.stroke();
    }
    ctx.restore();

    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      const age = (now - pulse.start) / 1000;
      const radius = 60 + age * 360;
      const fade = Math.max(0, 1 - age / 1.8);
      if (fade <= 0) {
        pulses.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${210 + age * 48}, 84%, 60%, ${0.24 * fade})`;
      ctx.lineWidth = 1.2;
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
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < influenceRadius) {
          const force = (1 - distance / influenceRadius) * (0.9 + pointerFactor * 1.2);
          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
          node.halo = Math.min(1, node.halo + force * 0.7 + pointerFactor * 0.5);
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

      let highlight = Math.max(from.halo, to.halo) * 0.8;
      if (pointerInViewport && pointerDistance < 160) {
        highlight = Math.max(highlight, (1 - pointerDistance / 160) * (0.6 + pointerFactor));
      }

      pulses.forEach((pulse) => {
        if (!pulse.radius) return;
        const { distance } = distanceToSegment(pulse.x, pulse.y, from.x, from.y, to.x, to.y);
        if (distance < pulse.radius) {
          highlight = Math.max(highlight, (1 - distance / pulse.radius) * pulse.fade * 0.6);
        }
      });

      const hue = 198 + highlight * 110;
      const alpha = 0.12 + highlight * 0.36;
      ctx.strokeStyle = `hsla(${hue}, 82%, ${38 + highlight * 18}%, ${alpha})`;
      ctx.lineWidth = 0.6 + highlight * 1.4;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const baseRadius = node.radius * (0.9 + node.depth * 0.25);
      const glowRadius = baseRadius * (1.8 + node.halo * 3.1);
      const gradientNode = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
      gradientNode.addColorStop(0, `hsla(${204 + node.halo * 110}, 88%, 70%, ${0.42 + node.halo * 0.35})`);
      gradientNode.addColorStop(1, "rgba(12, 28, 66, 0)");
      ctx.fillStyle = gradientNode;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${210 + node.halo * 80}, 92%, 74%, ${0.75 + node.halo * 0.2})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${198 + node.halo * 110}, 92%, 80%, ${0.28 + node.halo * 0.32})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius + 2 + node.halo * 4.5, 0, Math.PI * 2);
      ctx.stroke();
    });

    canvasFrame = requestAnimationFrame(animateBackground);
  };

  if (backgroundCanvas && ctx) {
    setCanvasSize();
    initNodes();
    canvasFrame = requestAnimationFrame(animateBackground);
    window.addEventListener("resize", () => {
      setCanvasSize();
      initNodes();
    });
  }

  document.addEventListener("pointermove", () => {
    background.classList.add("is-hovered");
  });

  document.addEventListener("pointerdown", (event) => {
    background.classList.add("is-active");
    addPulse(event.clientX, event.clientY, 1);
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
