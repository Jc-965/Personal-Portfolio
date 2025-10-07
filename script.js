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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
  cursorDot?.classList.remove("is-hidden");
  cursorRing?.classList.remove("is-hidden");
  cursorHalo?.classList.remove("is-hidden");
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(updateCursor);
};

document.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  enableCursor();
});

document.addEventListener("pointerleave", () => {
  cursorDot?.classList.add("is-hidden");
  cursorRing?.classList.add("is-hidden");
  cursorHalo?.classList.add("is-hidden");
  isPressing = false;
  document.body.classList.remove("is-pressing");
  if (background) {
    background.classList.remove("is-hovered");
  }
  cancelAnimationFrame(animationFrame);
});

if (background && !prefersReducedMotion) {
  background.classList.add("is-ready");

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

  document.addEventListener("pointermove", (event) => {
    background.classList.add("is-hovered");
    if (event.movementX || event.movementY) {
      if (Math.random() > 0.97) {
        spawnSpark(event.clientX, event.clientY);
      }
    }
  });

  document.addEventListener("pointerdown", (event) => {
    background.classList.add("is-active");
    spawnPulse(event.clientX, event.clientY);
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
}

document.addEventListener("pointerdown", () => {
  isPressing = true;
  document.body.classList.add("is-pressing");
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
