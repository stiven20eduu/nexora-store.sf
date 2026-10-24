/* NEXORA · entrega de códigos Roblox.
   El código solo llega al pedido privado del comprador una vez completado. */
export const isRobloxOrder = order => order?.game === "Roblox" || order?.gameKey === "roblox";
export const validRobloxCode = value => /^[A-Za-z0-9][A-Za-z0-9-]{7,79}$/.test(String(value || "").trim());

export function askRobloxCode(order) {
  return new Promise(resolve => {
    let done = false;
    const overlay = document.createElement("div");
    overlay.className = "nx-code-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(3,8,17,.85);display:grid;place-items:center;padding:18px;";
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Entregar código Roblox");
    dialog.style.cssText = "width:min(100%,480px);border:1px solid #c08a4a;border-radius:20px;padding:25px;background:#121c2b;color:#f7f8fc;box-shadow:0 25px 85px #0009;font:14px Arial,sans-serif;";
    const title = document.createElement("h2");
    title.textContent = "Entregar código de Roblox";
    title.style.cssText = "margin:0 0 10px;font-size:24px;color:#ffc275";
    const info = document.createElement("p");
    info.textContent = (order?.product || "Pedido Roblox") + " · Cliente: " + (order?.customer || order?.id || "NEXORA");
    info.style.cssText = "color:#c0cede;line-height:1.5";
    const note = document.createElement("p");
    note.textContent = "Para completar este pedido debes ingresar un código de canje válido, sin usar. Al confirmar quedará visible en la cuenta del comprador.";
    note.style.cssText = "color:#e1dfd6;line-height:1.65";
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.htmlFor = "nxRedeemCode";
    label.textContent = "Código de canje";
    label.style.cssText = "display:block;margin-bottom:8px;font-weight:bold;";
    const input = document.createElement("input");
    input.id = "nxRedeemCode";
    input.type = "password";
    input.placeholder = "Ingresa el código completo";
    input.autocomplete = "new-password";
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.maxLength = 80;
    input.required = true;
    input.style.cssText = "display:block;width:100%;padding:14px;border:1px solid #546783;border-radius:10px;background:#070e19;color:#fff;font:inherit;box-sizing:border-box;letter-spacing:.05em;";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Mostrar código";
    toggle.setAttribute("aria-pressed", "false");
    toggle.style.cssText = "margin-top:10px;padding:9px 12px;border:1px solid #546783;border-radius:10px;background:#172437;color:#fff;cursor:pointer;";
    toggle.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      toggle.textContent = visible ? "Ocultar código" : "Mostrar código";
      toggle.setAttribute("aria-pressed", String(visible));
    });
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.style.cssText = "min-height:18px;margin:8px 0;color:#ffadad;font-size:12px";
    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.style.cssText = "padding:12px 18px;border:1px solid #546783;border-radius:11px;background:#172437;color:#fff;cursor:pointer;";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Entregar código y completar";
    submit.style.cssText = "padding:12px 18px;border:0;border-radius:11px;background:#35cf9c;color:#09281f;font-weight:800;cursor:pointer;";
    const previousFocus = document.activeElement;
    const close = value => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    };
    const onKeydown = event => {
      if (event.key === "Escape") {event.preventDefault();close(null);}
      if (event.key === "Tab") {
        const focusable = [input,toggle,cancel,submit];
        const first = focusable[0],last = focusable[focusable.length-1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
      }
    };
    cancel.addEventListener("click", () => close(null));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const code = input.value.trim();
      if (!validRobloxCode(code)) {
        error.textContent = "Revisa el código: entre 8 y 80 caracteres, solo letras, números y guiones, sin espacios.";
        input.focus();
        return;
      }
      close(code);
    });
    buttons.append(cancel, submit);
    form.append(label, input, toggle, error, buttons);
    dialog.append(title, info, note, form);
    overlay.append(dialog);
    document.body.append(overlay);
    document.addEventListener("keydown", onKeydown);
    input.focus();
  });
}

export function renderRobloxDelivery(order) {
  if (!isRobloxOrder(order) || order?.status !== "completed") return null;
  const section = document.createElement("section");
  section.style.cssText = "margin:16px 0 8px;padding:18px;border:1px solid rgba(90,220,165,.4);border-radius:14px;background:linear-gradient(135deg,#122b29,#111e2b);";
  const heading = document.createElement("h4");
  heading.textContent = "🎁 Tu código de Roblox";
  heading.style.cssText = "font-size:17px;margin:0 0 11px;color:#aeffda;";
  section.append(heading);
  // El código nuevo se consulta en un documento privado tras autenticar al comprador.
  if (order?.redemptionLoading || order?.redemptionError) {
    const message = document.createElement("p");
    message.textContent = order.redemptionError
      ? "No se pudo cargar el código privado. Recarga la página o contacta con soporte si continúa."
      : "Cargando tu código privado de Roblox…";
    message.style.cssText = "line-height:1.65;color:#cbdacf;";
    section.append(message);
    return section;
  }
  const code = String(order?.redemptionCode || "");
  if (!validRobloxCode(code)) {
    const missing = document.createElement("p");
    missing.textContent = "Este pedido figura como completado, pero no tiene un código de canje registrado. Comunícate con soporte NEXORA indicando tu número de pedido.";
    missing.style.cssText = "line-height:1.6;color:#f6d5a5";
    const support = document.createElement("a");
    support.href = "soporte.html";
    support.textContent = "Ir a soporte NEXORA →";
    support.style.cssText = "color:#ffc27d;text-decoration:underline";
    section.append(missing,support);
    return section;
  }
  const small = document.createElement("p");
  small.textContent = "Código privado · oculto por defecto. No lo compartas y úsalo en tu cuenta Roblox correcta.";
  small.style.cssText = "color:#cbdacb;line-height:1.6;font-size:13px;";
  const box = document.createElement("div");
  box.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0;";
  const value = document.createElement("code");
  value.textContent = "••••••••";
  value.style.cssText = "display:block;background:#07131e;border:1px solid #577c79;border-radius:10px;padding:13px;letter-spacing:.09em;font-size:clamp(13px,3vw,19px);color:#fff;overflow-wrap:anywhere;flex:1;min-width:130px;user-select:all;";
  const show = document.createElement("button");
  show.type = "button";
  show.textContent = "Mostrar";
  show.setAttribute("aria-pressed", "false");
  show.style.cssText = "padding:12px;border-radius:10px;border:1px solid #547883;background:#182c36;color:#e7f9f2;font-weight:800;cursor:pointer;";
  show.addEventListener("click", () => {
    const revealed = show.getAttribute("aria-pressed") !== "true";
    value.textContent = revealed ? code : "••••••••";
    show.textContent = revealed ? "Ocultar" : "Mostrar";
    show.setAttribute("aria-pressed", String(revealed));
  });
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copiar código";
  copy.style.cssText = "padding:12px;border-radius:10px;border:1px solid #72deb9;background:#2bc695;color:#09271d;font-weight:800;cursor:pointer;";
  copy.addEventListener("click", async () => {
    try {await navigator.clipboard.writeText(code);copy.textContent="Copiado ✓";}
    catch {copy.textContent="Selecciona y copia el código";}
  });
  box.append(value,show,copy);
  const list = document.createElement("ol");
  list.style.cssText = "margin:12px 0 4px;padding-left:23px;color:#dbe9e7;line-height:1.75;font-size:13px;";
  for (const text of [
    "Abre la página oficial de canje e inicia sesión en tu cuenta Roblox.",
    "Escribe o pega el código que aparece arriba.",
    "Pulsa Canjear y sigue las indicaciones de Roblox. Si el código añade crédito, puedes usarlo para comprar Robux."
  ]) {
    const li=document.createElement("li");li.textContent=text;list.append(li);
  }
  const link=document.createElement("a");
  link.href="https://www.roblox.com/redeem";
  link.target="_blank";
  link.rel="noopener noreferrer";
  link.textContent="Abrir página oficial para canjear código ↗";
  link.style.cssText="display:inline-block;margin-top:13px;color:#ffd18e;text-decoration:underline;font-weight:800;font-size:13px;";
  section.append(small,box,list,link);
  return section;
}
