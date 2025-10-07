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
  const scene = { width: window.innerWidth, height: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2.2) };
  const particles = [];
  const ripples = [];
  const palette = [
    { hue: 210, saturation: 92, lightness: 62 },
    { hue: 268, saturation: 94, lightness: 66 },
    { hue: 188, saturation: 90, lightness: 58 },
    { hue: 326, saturation: 88, lightness: 64 },
  ];
  let canvasFrame;

  const particleCount = () => Math.round(clamp((scene.width * scene.height) / 6000, 130, 320));

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

  const createParticle = () => {
    const swatch = palette[Math.floor(Math.random() * palette.length)];
    return {
      x: Math.random() * scene.width,
      y: Math.random() * scene.height,
      vx: randomBetween(-0.45, 0.45),
      vy: randomBetween(-0.45, 0.45),
      baseVX: randomBetween(-0.16, 0.16),
      baseVY: randomBetween(-0.16, 0.16),
      radius: randomBetween(1, 2.4),
      hue: swatch.hue + randomBetween(-6, 6),
      saturation: swatch.saturation,
      lightness: swatch.lightness + randomBetween(-6, 6),
      noise: Math.random() * Math.PI * 2,
    };
  };

  const initParticles = () => {
    particles.length = 0;
    const count = particleCount();
    for (let i = 0; i < count; i += 1) {
      particles.push(createParticle());
    }
  };

  const spawnSpark = (x, y) => {
    const spark = document.createElement("span");
    spark.className = "background__spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    background.appendChild(spark);
    spark.addEventListener("animationend", () => {
      spark.remove();
    });
  };

  const spawnPulse = (x, y) => {
    const pulse = document.createElement("span");
    pulse.className = "background__pulse";
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    background.appendChild(pulse);
    pulse.addEventListener("animationend", () => {
      pulse.remove();
    });
  };

  const spawnRipple = (x, y) => {
    ripples.push({ x, y, radius: 0, alpha: 0.55, hue: 220 + Math.random() * 80 });
    if (ripples.length > 6) {
      ripples.shift();
    }
  };

  let lastAutoRipple = 0;

  const animateBackground = (now) => {
    if (!ctx) return;

    ctx.clearRect(0, 0, scene.width, scene.height);

    const gradient = ctx.createLinearGradient(0, 0, scene.width, scene.height);
    gradient.addColorStop(0, "rgba(6, 4, 24, 0.95)");
    gradient.addColorStop(0.5, "rgba(10, 6, 32, 0.92)");
    gradient.addColorStop(1, "rgba(8, 7, 26, 0.93)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, scene.width, scene.height);

    const time = now * 0.0012;
    const ambientStrength = 0.2 + Math.sin(time * 0.6) * 0.06 + Math.cos(time * 0.35) * 0.04;
    const pointerStrength = pointerInViewport
      ? clamp(0.22 + velocity / 180, 0.22, 1.45)
      : ambientStrength;
    const pointerRadius = pointerInViewport ? 220 : 160 + Math.sin(time * 0.7) * 20;

    if (now - lastAutoRipple > 4600) {
      const x = Math.random() * scene.width;
      const y = Math.random() * scene.height;
      spawnRipple(x, y);
      if (Math.random() > 0.4) {
        spawnSpark(x, y);
      }
      lastAutoRipple = now;
    }

    particles.forEach((particle) => {
      particle.vx += (particle.baseVX - particle.vx) * 0.018;
      particle.vy += (particle.baseVY - particle.vy) * 0.018;

      const swirl = Math.sin(time + particle.noise) * 0.32;
      const drift = Math.cos(time * 0.6 + particle.noise * 1.4) * 0.24;

      particle.x += particle.vx + swirl + pointerStrength * 0.2;
      particle.y += particle.vy + drift;

      if (pointerInViewport) {
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < pointerRadius) {
          const norm = distance === 0 ? 1 : distance;
          const force = (pointerRadius - distance) / pointerRadius;
          particle.vx += (dx / norm) * force * (0.6 + pointerStrength * 0.6);
          particle.vy += (dy / norm) * force * (0.6 + pointerStrength * 0.6);
        }
      }

      if (particle.x < -120) particle.x = scene.width + 120;
      if (particle.x > scene.width + 120) particle.x = -120;
      if (particle.y < -120) particle.y = scene.height + 120;
      if (particle.y > scene.height + 120) particle.y = -120;
    });

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const ripple = ripples[i];
      ripple.radius += 7 + ripple.radius * 0.035;
      ripple.alpha *= 0.965;
      if (ripple.alpha <= 0.02) {
        ripples.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${(ripple.hue + ripple.radius * 0.14) % 360}, 92%, 68%, ${ripple.alpha})`;
      ctx.lineWidth = 1.2 + Math.min(ripple.radius / 160, 5);
      ctx.stroke();

      particles.forEach((particle) => {
        const dx = particle.x - ripple.x;
        const dy = particle.y - ripple.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) return;
        const band = Math.abs(distance - ripple.radius);
        if (band < 120) {
          const influence = (120 - band) / 120;
          const wave = Math.cos((distance - ripple.radius) / 28) * influence * 0.68;
          particle.vx += (dx / distance) * wave;
          particle.vy += (dy / distance) * wave;
        }
      });
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    particles.forEach((particle) => {
      const size = particle.radius * (1 + pointerStrength * 0.45);
      const glow = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        size * 4.5
      );
      glow.addColorStop(0, `hsla(${particle.hue}, ${particle.saturation}%, ${particle.lightness}%, 0.9)`);
      glow.addColorStop(1, `hsla(${particle.hue}, ${particle.saturation}%, ${particle.lightness}%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    canvasFrame = requestAnimationFrame(animateBackground);
  };

  if (backgroundCanvas && ctx) {
    setCanvasSize();
    initParticles();
    canvasFrame = requestAnimationFrame(animateBackground);
    window.addEventListener("resize", () => {
      setCanvasSize();
      initParticles();
    });
  }

  document.addEventListener("pointermove", (event) => {
    background.classList.add("is-hovered");
    if (event.movementX || event.movementY) {
      if (Math.random() > 0.92) {
        spawnSpark(event.clientX, event.clientY);
      }
    }
  });

  document.addEventListener("pointerdown", (event) => {
    background.classList.add("is-active");
    spawnPulse(event.clientX, event.clientY);
    spawnRipple(event.clientX, event.clientY);
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i;
      const x = event.clientX + Math.cos(angle) * 12;
      const y = event.clientY + Math.sin(angle) * 12;
      spawnSpark(x, y);
    }
  });

  document.addEventListener("pointerup", () => {
    background.classList.remove("is-active");
  });

  document.addEventListener("pointerleave", () => {
    background.classList.remove("is-active");
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
