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

const body = document.body;

const addMediaListener = (mediaQueryList, handler) => {
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", handler);
  } else if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(handler);
  }
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let prefersReducedMotion = reducedMotionQuery.matches;

const pointerFineQuery = window.matchMedia("(pointer: fine)");
let pointerFine = pointerFineQuery.matches;

let shouldUseCustomCursor = pointerFine && !prefersReducedMotion;
let backgroundQualityDirty = false;

const root = document.documentElement;
const cursorNova = document.querySelector(".cursor--nova");
const cursorTrailEl = cursorNova?.querySelector(".cursor__trail");
const background = document.querySelector(".background");
const backgroundLayers = document.querySelectorAll(".background__layer");

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const pointerTarget = { ...pointer };
let lastPointer = { ...pointer };
let velocity = 0;
let animationFrame = null;
let isPressing = false;
let pointerInViewport = false;
const trailPoint = { ...pointer };

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomBetween = (min, max) => Math.random() * (max - min) + min;

const updateCursor = () => {
  if (prefersReducedMotion) {
    animationFrame = null;
    return;
  }

  const smoothing = shouldUseCustomCursor ? (isPressing ? 0.28 : 0.2) : 1;
  pointer.x += (pointerTarget.x - pointer.x) * smoothing;
  pointer.y += (pointerTarget.y - pointer.y) * smoothing;

  const dx = pointer.x - lastPointer.x;
  const dy = pointer.y - lastPointer.y;
  const distance = Math.hypot(dx, dy);
  velocity = 0.18 * distance + 0.82 * velocity;
  lastPointer = { ...pointer };

  const trailLerp = prefersReducedMotion || !shouldUseCustomCursor ? 1 : 0.16;
  trailPoint.x += (pointer.x - trailPoint.x) * trailLerp;
  trailPoint.y += (pointer.y - trailPoint.y) * trailLerp;

  const progressX = pointer.x / Math.max(window.innerWidth, 1);
  const progressY = pointer.y / Math.max(window.innerHeight, 1);
  const hue = 200 + progressX * 80;
  const lightness = 40 + progressY * 12 + Math.min(velocity / 18, 8);
  const speedFactor = clamp(velocity / 320, 0, 1);

  if (shouldUseCustomCursor && cursorNova) {
    cursorNova.style.setProperty("transform", `translate3d(${pointer.x}px, ${pointer.y}px, 0)`);
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

  const parallaxEase = shouldUseCustomCursor ? 0.32 : 0.24;
  backgroundLayers.forEach((layer, index) => {
    const depth = parseFloat(layer.dataset.depth || "0.05");
    const offsetX = (pointer.x - window.innerWidth / 2) * depth;
    const offsetY = (pointer.y - window.innerHeight / 2) * depth;
    layer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    layer.style.opacity = String(clamp(parallaxEase + velocity / (shouldUseCustomCursor ? 640 : 960) - index * 0.05, 0.1, shouldUseCustomCursor ? 0.72 : 0.58));
  });

  animationFrame = requestAnimationFrame(updateCursor);
};

const ensureCursorLoop = () => {
  if (prefersReducedMotion) return;
  if (animationFrame !== null) return;
  animationFrame = requestAnimationFrame(updateCursor);
};

const syncCursorState = () => {
  shouldUseCustomCursor = pointerFine && !prefersReducedMotion;
  if (shouldUseCustomCursor) {
    body.classList.add("has-custom-cursor");
    if (pointerInViewport) {
      cursorNova?.classList.remove("is-hidden");
    }
  } else {
    body.classList.remove("has-custom-cursor");
    cursorNova?.classList.add("is-hidden");
    cursorNova?.classList.remove("is-pressed");
    cursorNova?.removeAttribute("data-mode");
  }

  if (prefersReducedMotion && animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  } else if (!prefersReducedMotion && pointerInViewport) {
    ensureCursorLoop();
  }

  trailPoint.x = pointer.x;
  trailPoint.y = pointer.y;
  backgroundQualityDirty = true;
};

syncCursorState();

addMediaListener(reducedMotionQuery, (event) => {
  prefersReducedMotion = event.matches;
  syncCursorState();
});

addMediaListener(pointerFineQuery, (event) => {
  pointerFine = event.matches;
  syncCursorState();
});

document.addEventListener(
  "pointermove",
  (event) => {
    pointerTarget.x = event.clientX;
    pointerTarget.y = event.clientY;
    pointerInViewport = true;
    if (shouldUseCustomCursor) {
      cursorNova?.classList.remove("is-hidden");
    }
    ensureCursorLoop();
  },
  { passive: true }
);

document.addEventListener("pointerleave", () => {
  cursorNova?.classList.add("is-hidden");
  cursorNova?.classList.remove("is-pressed");
  cursorNova?.removeAttribute("data-mode");
  isPressing = false;
  body.classList.remove("is-pressing");
  if (background) {
    background.classList.remove("is-hovered");
  }
  pointerInViewport = false;
  trailPoint.x = pointer.x;
  trailPoint.y = pointer.y;
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  pointer.x = window.innerWidth / 2;
  pointer.y = window.innerHeight / 2;
  pointerTarget.x = pointer.x;
  pointerTarget.y = pointer.y;
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
    spacing: 34,
    offsetX: 0,
    offsetY: 0,
    driftX: 0,
    driftY: 0,
  };

  const nodes = [];
  const edges = [];
  const impulses = [];
  const spatialBuckets = new Map();
  let spatialCellSize = 72;
  let canvasFrame;
  let nodesNeedRebuild = true;

  const getQuality = () => {
    if (prefersReducedMotion) return 0.4;
    const width = window.innerWidth || scene.width;
    if (!pointerFine) {
      return clamp(width / 1800, 0.55, 0.72);
    }
    if (width < 768) return 0.72;
    if (width < 1080) return 0.85;
    return 1;
  };

  let quality = getQuality();

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
    const maxDpr = quality > 0.85 ? 2 : 1.5;
    scene.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
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
    impulses.length = 0;
    spatialBuckets.clear();
    const branchSet = new Set();
    const densityScale = 0.55 + quality * 0.45;
    const treeCount = Math.max(4, Math.round((scene.width / 240) * densityScale));
    const nodesPerTree = Math.round(
      clamp((scene.height / 95) * densityScale, 10, 24 + quality * 10)
    );
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
          radius: randomBetween(0.9, 1.6) * (0.85 + quality * 0.35),
          halo: 0,
          phase: Math.random() * Math.PI * 2,
          depth: depth + Math.random() * 0.05,
          driftRadius: randomBetween(14, 40) * (0.4 + depth * 0.55) * (0.8 + quality * 0.35),
          driftSpeed: randomBetween(0.1, 0.28) * (0.7 + quality * 0.4),
          swirlSpeed: randomBetween(0.06, 0.2) * (0.7 + quality * 0.4),
          jitter: randomBetween(4, 12) * (0.7 + quality * 0.5),
        });

        column.push(id);
        const previousId = column[column.length - 2];
        connect(previousId, id);

        if (column.length > 4 && Math.random() > 0.62) {
          const branchSpan = Math.min(4, column.length - 2);
          const backOffset = Math.floor(Math.random() * branchSpan);
          const branchId = column[Math.max(0, column.length - 2 - backOffset)];
          connect(branchId, id);
        }
      }
      treeColumns.push(column);
    }

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

    nodesNeedRebuild = false;
  };

  const addImpulse = (x, y, power = 1.35) => {
    impulses.push({
      x,
      y,
      power,
      radius: 60,
      start: performance.now(),
    });
    const impulseLimit = Math.round(4 + quality * 4);
    if (impulses.length > impulseLimit) {
      impulses.shift();
    }
  };

  const rebuildSpatialBuckets = (cellSize) => {
    spatialBuckets.clear();
    nodes.forEach((node, index) => {
      const cellX = Math.floor(node.x / cellSize);
      const cellY = Math.floor(node.y / cellSize);
      const key = `${cellX}:${cellY}`;
      let bucket = spatialBuckets.get(key);
      if (!bucket) {
        bucket = [];
        spatialBuckets.set(key, bucket);
      }
      bucket.push(index);
    });
  };

  const animateBackground = (now) => {
    if (!ctx) return;

    if (backgroundQualityDirty) {
      const nextQuality = getQuality();
      if (Math.abs(nextQuality - quality) > 0.02) {
        quality = nextQuality;
        setCanvasSize();
        nodesNeedRebuild = true;
      } else {
        quality = nextQuality;
      }
      backgroundQualityDirty = false;
    }

    if (nodesNeedRebuild) {
      initNodes();
    }

    ctx.clearRect(0, 0, scene.width, scene.height);

    const gradient = ctx.createLinearGradient(0, 0, scene.width, scene.height);
    gradient.addColorStop(0, "#020218");
    gradient.addColorStop(0.4, "#050523");
    gradient.addColorStop(0.75, "#03031a");
    gradient.addColorStop(1, "#010114");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

    const time = now * 0.0012;
    const pointerStrength = shouldUseCustomCursor ? 1 : 0.7;
    const pointerFactor = pointerInViewport
      ? clamp(
          velocity / (shouldUseCustomCursor ? 180 : 260),
          pointerFine ? 0.08 : 0.04,
          shouldUseCustomCursor ? 0.92 : 0.5
        )
      : 0.05;
    const influenceRadius = pointerInViewport
      ? shouldUseCustomCursor
        ? 280 + velocity * 0.8
        : 220 + velocity * 0.5
      : 160;

    const spacingMin = 26 + (1 - quality) * 3;
    const spacingMax = 34 + (1 - quality) * 4;
    grid.spacing = clamp(scene.width / 44, spacingMin, spacingMax);
    grid.driftX += 0.024 + Math.sin(time * 0.6) * 0.006 * quality;
    grid.driftY += 0.02 + Math.cos(time * 0.5) * 0.006 * quality;

    const parallaxX = pointerInViewport ? (pointer.x - scene.width / 2) * 0.1 * pointerStrength : 0;
    const parallaxY = pointerInViewport ? (pointer.y - scene.height / 2) * 0.1 * pointerStrength : 0;
    const offsetX = (grid.offsetX + grid.driftX + parallaxX) % grid.spacing;
    const offsetY = (grid.offsetY + grid.driftY + parallaxY) % grid.spacing;

    ctx.save();
    ctx.globalAlpha = 0.88;
    const warpFactor = quality > 0.85 ? 0.5 : quality > 0.7 ? 0.75 : 1;
    const warpStepY = grid.spacing * warpFactor;
    const warpStepX = grid.spacing * warpFactor;
    const gravityRadius = pointerInViewport
      ? shouldUseCustomCursor
        ? 320 + velocity * 0.6
        : 240 + velocity * 0.45
      : 0;

    for (let x = -grid.spacing; x < scene.width + grid.spacing; x += grid.spacing) {
      const baseX = x + offsetX;
      const hueShift = 208 + (pointerInViewport ? clamp(1 - Math.abs(pointer.x - baseX) / 420, 0, 1) * 48 : 0);
      const alpha = 0.08 + pointerFactor * 0.2 + (pointerInViewport ? clamp(1 - Math.abs(pointer.x - baseX) / 360, 0, 1) * 0.18 * pointerStrength : 0);
      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 74%, 56%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const steps = Math.ceil((scene.height + grid.spacing * 2) / warpStepY);
      for (let s = 0; s <= steps; s += 1) {
        const baseY = -grid.spacing + s * warpStepY + offsetY;
        let drawX = baseX;
        let drawY = baseY;
        if (pointerInViewport) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawX += dx * influence * 0.22 * pointerStrength;
          drawY += dy * influence * 0.04 * pointerStrength;
        }
        impulses.forEach((impulse) => {
          if (!impulse.radius) return;
          const idx = drawX - impulse.x;
          const idy = drawY - impulse.y;
          const dist = Math.hypot(idx, idy);
          if (dist < impulse.radius) {
            const strength = (1 - dist / impulse.radius) * impulse.power;
            const normX = idx / (dist || 1);
            drawX += normX * strength * 20;
          }
        });
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
      const hueShift = 200 + (pointerInViewport ? clamp(1 - Math.abs(pointer.y - baseY) / 360, 0, 1) * 42 : 0);
      const alpha = 0.075 + pointerFactor * 0.18 + (pointerInViewport ? clamp(1 - Math.abs(pointer.y - baseY) / 320, 0, 1) * 0.18 * pointerStrength : 0);
      ctx.strokeStyle = `hsla(${hueShift.toFixed(1)}, 70%, 52%, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.58;
      ctx.beginPath();
      const steps = Math.ceil((scene.width + grid.spacing * 2) / warpStepX);
      for (let s = 0; s <= steps; s += 1) {
        const baseX = -grid.spacing + s * warpStepX + offsetX;
        let drawX = baseX;
        let drawY = baseY;
        if (pointerInViewport) {
          const dx = pointer.x - baseX;
          const dy = pointer.y - baseY;
          const distSq = dx * dx + dy * dy;
          const influence = Math.exp(-distSq / Math.max(gravityRadius * gravityRadius, 1));
          drawY += dy * influence * 0.22 * pointerStrength;
          drawX += dx * influence * 0.04 * pointerStrength;
        }
        impulses.forEach((impulse) => {
          if (!impulse.radius) return;
          const idx = drawX - impulse.x;
          const idy = drawY - impulse.y;
          const dist = Math.hypot(idx, idy);
          if (dist < impulse.radius) {
            const strength = (1 - dist / impulse.radius) * impulse.power;
            const normY = idy / (dist || 1);
            drawY += normY * strength * 20;
          }
        });
        if (s === 0) {
          ctx.moveTo(drawX, drawY);
        } else {
          ctx.lineTo(drawX, drawY);
        }
      }
      ctx.stroke();
    }
    ctx.restore();

    const impulseGrowth = 24 + quality * 16;
    const impulseDecay = 0.88 + quality * 0.04;
    for (let i = impulses.length - 1; i >= 0; i -= 1) {
      const impulse = impulses[i];
      impulse.radius += impulseGrowth;
      impulse.power *= impulseDecay;
      const age = (now - impulse.start) / 1000;
      impulse.fade = Math.max(0, 1 - age / 1.4);
      if (impulse.power < 0.05 || impulse.fade <= 0) {
        impulses.splice(i, 1);
      }
    }

    const separationRadius = 32 + quality * 18;
    spatialCellSize = Math.max(separationRadius * 1.35, 54);
    rebuildSpatialBuckets(spatialCellSize);
    const separationSq = separationRadius * separationRadius;
    const separationForce = 0.3 + quality * 0.16;

    nodes.forEach((node, index) => {
      const cellX = Math.floor(node.x / spatialCellSize);
      const cellY = Math.floor(node.y / spatialCellSize);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const bucket = spatialBuckets.get(`${cellX + ox}:${cellY + oy}`);
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b += 1) {
            const otherIndex = bucket[b];
            if (otherIndex <= index) continue;
            const other = nodes[otherIndex];
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const distSq = dx * dx + dy * dy;
            if (distSq === 0 || distSq > separationSq) continue;
            const dist = Math.sqrt(distSq);
            const push = ((separationRadius - dist) / separationRadius) * separationForce;
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            node.vx -= nx * push;
            node.vy -= ny * push;
            other.vx += nx * push;
            other.vy += ny * push;
          }
        }
      }
    });

    const damping = 0.86 + quality * 0.06;
    const basePullX = 0.012 + quality * 0.008;
    const basePullY = 0.01 + quality * 0.008;

    nodes.forEach((node) => {
      node.halo *= 0.92;
      const driftX = Math.sin(time * node.driftSpeed + node.phase) * node.driftRadius;
      const driftY = Math.cos(time * node.swirlSpeed + node.phase * 1.2) * node.driftRadius * 0.6;
      const jitterX = Math.sin(time * 0.6 + node.phase * 1.7) * node.jitter;
      const jitterY = Math.cos(time * 0.5 + node.phase * 1.3) * node.jitter;
      node.baseX = clamp(node.anchorX + driftX + jitterX, 36, scene.width - 36);
      node.baseY = clamp(node.anchorY + driftY + jitterY, 36, scene.height - 36);
      const swayX = Math.sin(time * 1.2 + node.phase) * 0.45;
      const swayY = Math.cos(time * 1 + node.phase) * 0.45;
      node.vx += (node.baseX - node.x) * basePullX + swayX;
      node.vy += (node.baseY - node.y) * basePullY + swayY;

      if (pointerInViewport) {
        const dx = pointer.x - node.x;
        const dy = pointer.y - node.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < influenceRadius) {
          const force = (1 - distance / influenceRadius) * (0.7 + pointerFactor * 1.2 * pointerStrength);
          node.vx -= (dx / distance) * force;
          node.vy -= (dy / distance) * force;
          node.halo = Math.min(1, node.halo + force * 0.45 + pointerFactor * 0.28);
        }
      }

      impulses.forEach((impulse) => {
        if (!impulse.radius) return;
        const dx = node.x - impulse.x;
        const dy = node.y - impulse.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance < impulse.radius) {
          const wave = (1 - distance / impulse.radius) * impulse.power;
          node.vx += (dx / distance) * wave * 1.45;
          node.vy += (dy / distance) * wave * 1.45;
          node.halo = Math.min(1, node.halo + wave * 1.1 * impulse.fade);
        }
      });

      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
      node.x = clamp(node.x, 24, scene.width - 24);
      node.y = clamp(node.y, 24, scene.height - 24);
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

      let highlight = Math.max(from.halo, to.halo) * 0.78;
      if (pointerInViewport && pointerDistance < 160) {
        highlight = Math.max(highlight, (1 - pointerDistance / 160) * (0.7 + pointerFactor * pointerStrength));
      }

      impulses.forEach((impulse) => {
        if (!impulse.radius) return;
        const { distance } = distanceToSegment(impulse.x, impulse.y, from.x, from.y, to.x, to.y);
        if (distance < impulse.radius) {
          highlight = Math.max(highlight, (1 - distance / impulse.radius) * impulse.fade * 0.4);
        }
      });

      const hue = 208 + highlight * 100;
      const alpha = 0.16 + highlight * 0.42;
      ctx.strokeStyle = `hsla(${hue}, 88%, ${42 + highlight * 18}%, ${alpha})`;
      ctx.lineWidth = 0.45 + highlight * 1.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const baseRadius = node.radius * (0.78 + node.depth * 0.26);
      const glowRadius = baseRadius * (1.9 + node.halo * 2.6);
      const gradientNode = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
      gradientNode.addColorStop(0, `hsla(${210 + node.halo * 110}, 92%, 70%, ${0.34 + node.halo * 0.24})`);
      gradientNode.addColorStop(0.65, `hsla(${212 + node.halo * 120}, 88%, 60%, ${0.24 + node.halo * 0.22})`);
      gradientNode.addColorStop(1, "rgba(6, 18, 48, 0)");
      ctx.fillStyle = gradientNode;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${212 + node.halo * 90}, 92%, 76%, ${0.7 + node.halo * 0.18})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${208 + node.halo * 120}, 92%, 82%, ${0.22 + node.halo * 0.28})`;
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius + 1.6 + node.halo * 3.4, 0, Math.PI * 2);
      ctx.stroke();
    });

    canvasFrame = requestAnimationFrame(animateBackground);
  };

  if (backgroundCanvas && ctx) {
    setCanvasSize();
    initNodes();
    canvasFrame = requestAnimationFrame(animateBackground);
    window.addEventListener("resize", () => {
      backgroundQualityDirty = true;
      nodesNeedRebuild = true;
      setCanvasSize();
    });
  }

  document.addEventListener(
    "pointermove",
    () => {
      background.classList.add("is-hovered");
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      background.classList.add("is-active");
      addImpulse(event.clientX, event.clientY, 1.6);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerup",
    () => {
      background.classList.remove("is-active");
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    background.classList.remove("is-active");
    background.classList.remove("is-hovered");
  });
}

  document.addEventListener(
    "pointerdown",
    (event) => {
      isPressing = true;
      body.classList.add("is-pressing");
      pointerInViewport = true;
      pointerTarget.x = event.clientX;
      pointerTarget.y = event.clientY;
      if (shouldUseCustomCursor) {
        cursorNova?.classList.add("is-pressed");
      }
      ensureCursorLoop();
    },
    { passive: true }
  );

["pointerup", "pointercancel"].forEach((type) =>
  document.addEventListener(
    type,
    () => {
      isPressing = false;
      body.classList.remove("is-pressing");
      cursorNova?.classList.remove("is-pressed");
    },
    { passive: true }
  )
);

const focusableElements = document.querySelectorAll("a, button, input, textarea, [data-cursor]");

focusableElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    const state = element.getAttribute("data-cursor") || "interactive";
    body.dataset.cursor = state;
    cursorNova?.setAttribute("data-mode", state);
  });
  element.addEventListener("mouseleave", () => {
    delete body.dataset.cursor;
    cursorNova?.removeAttribute("data-mode");
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
          body.style.setProperty(
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
