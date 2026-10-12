/* NEXORA Experience · Mejoras progresivas de interfaz, sin acceso a credenciales ni pagos. */
(() => {
  "use strict";
  const doc = document;
  const page = doc.body?.dataset?.nexoraPage || "";
  if (!page) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motion = () => reducedMotion.matches ? "auto" : "smooth";

  // Indicador de lectura. Se reutiliza un solo frame por desplazamiento.
  const progress = doc.createElement("div");
  progress.id = "nx-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  doc.body.append(progress);
  let scheduled = false;
  const scrollUpdate = () => {
    const max = Math.max(0, doc.documentElement.scrollHeight - window.innerHeight);
    const proportion = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
    progress.style.transform = "scaleX(" + proportion.toFixed(4) + ")";
    const back = doc.getElementById("nx-to-top");
    if (back) back.classList.toggle("nx-visible", window.scrollY > 540);
    scheduled = false;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(scrollUpdate);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("load", schedule, { once: true });

  // Volver arriba, accesible por teclado. Fuera de los flujos de compra.
  const top = doc.createElement("button");
  top.id = "nx-to-top";
  top.type = "button";
  top.title = "Volver al inicio";
  top.setAttribute("aria-label", "Volver al inicio de la página");
  top.textContent = "↑";
  top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: motion() }));
  doc.body.append(top);
  schedule();

  // Navegación rápida en móvil: links reales que funcionan aunque no haya sesión.
  if (["home", "game", "profile"].includes(page)) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
      games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12h12c2 0 3.4 1.7 4 5.7.2 1.5-1.1 2.4-2.4 1.7l-3.2-2.1H7.6l-3.2 2.1c-1.3.7-2.6-.2-2.4-1.7C2.6 13.7 4 12 6 12Z"/><path d="M7 15v4m-2-2h4m8-1h.01m2 2h.01"/></svg>',
      profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
    };
    const nav = doc.createElement("nav");
    nav.className = "nx-bottom-nav";
    nav.setAttribute("aria-label", "Navegación rápida móvil");
    const items = [
      { label: "Inicio", href: "index.html", current: page === "home", icon: icons.home },
      { label: "Juegos", href: "index.html#catalogo", current: page === "game", icon: icons.games },
      { label: "Mi cuenta", href: "perfil.html", current: page === "profile", icon: icons.profile }
    ];
    for (const item of items) {
      const a = doc.createElement("a");
      a.href = item.href;
      a.innerHTML = item.icon + "<span>" + item.label + "</span>";
      if (item.current) a.setAttribute("aria-current", "page");
      nav.append(a);
    }
    doc.body.append(nav);
  }

  // Aparición suave de contenidos informativos ya existentes.
  if (page === "home" && "IntersectionObserver" in window && !reducedMotion.matches) {
    const targets = doc.querySelectorAll(".trust-item,.section-head,.benefit,.step,.cta");
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("nx-in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -25px 0px", threshold: 0.07 });
    targets.forEach((element, i) => {
      element.classList.add("nx-reveal");
      element.style.setProperty("--nx-stagger", String((i % 4) * 55) + "ms");
      observer.observe(element);
    });
    doc.documentElement.classList.add("nx-ready");
    // Al modificar la preferencia de accesibilidad, el contenido se vuelve visible.
    reducedMotion.addEventListener?.("change", event => {
      if (!event.matches) return;
      doc.documentElement.classList.remove("nx-ready");
      targets.forEach(el => el.classList.add("nx-in"));
      observer.disconnect();
    });
  }

  // Búsqueda rápida en el catálogo: Ctrl+K, Cmd+K o / cuando no escribes en un campo.
  if (page === "home") {
    const search = doc.getElementById("searchInput");
    if (search) {
      doc.addEventListener("keydown", event => {
        if (event.defaultPrevented || event.altKey) return;
        const tag = event.target?.tagName;
        const editing = event.target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
        const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
        const slash = event.key === "/" && !editing && !event.ctrlKey && !event.metaKey;
        if (shortcut || slash) {
          event.preventDefault();
          search.scrollIntoView({ behavior: motion(), block: "center" });
          search.focus({ preventScroll: true });
        }
        if (event.key === "Escape" && doc.activeElement === search) search.blur();
      });
      if (!search.hasAttribute("aria-label")) search.setAttribute("aria-label", "Buscar juegos en NEXORA");
    }
  }

  // Medidas preventivas: las imágenes de contenido no bloquean el primer render.
  doc.querySelectorAll("main img, .catalog-card img, footer img").forEach(img => {
    if (img.closest(".hero-slide")) return;
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
  });
})();
