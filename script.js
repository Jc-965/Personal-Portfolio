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

const cursor = document.querySelector(".cursor");
const cursorOutline = document.querySelector(".cursor-outline");

const setCursorPosition = (event) => {
  const { clientX, clientY } = event;
  cursor?.setAttribute(
    "style",
    `top: ${clientY}px; left: ${clientX}px;`
  );
  cursorOutline?.setAttribute(
    "style",
    `top: ${clientY}px; left: ${clientX}px;`
  );
};

document.addEventListener("mousemove", (event) => {
  cursor?.classList.remove("is-hidden");
  cursorOutline?.classList.remove("is-hidden");
  window.requestAnimationFrame(() => setCursorPosition(event));
});

document.addEventListener("mouseleave", () => {
  cursor?.classList.add("is-hidden");
  cursorOutline?.classList.add("is-hidden");
});

const focusableElements = document.querySelectorAll(
  "a, button, input, textarea"
);

focusableElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    cursor?.classList.add("is-active");
    cursorOutline?.classList.add("is-active");
  });

  element.addEventListener("mouseleave", () => {
    cursor?.classList.remove("is-active");
    cursorOutline?.classList.remove("is-active");
  });
});

document.addEventListener("scroll", () => {
  if (!navMenu || window.innerWidth > 960) return;
  navMenu.classList.remove("is-open");
  navToggle?.classList.remove("is-active");
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
    { threshold: 0.15 }
  );

  document.querySelectorAll(".panel, .project-card, .timeline__item").forEach((el) => {
    observer.observe(el);
  });
}
