/* NEXORA · entrega de códigos Roblox.
   El código solo llega al pedido privado del comprador una vez completado. */
export const isRobloxOrder = order => order?.game === "Roblox" || order?.gameKey === "roblox";
export const validRobloxCode = value => /^[A-Za-z0-9][A-Za-z0-9-]{7,79}$/.test(String(value || "").trim());

// Deterministic fingerprint: no redemption code is exposed by the unique index.
// Case-insensitive to stop the same code being reused with different capitalization.
export async function fingerprintRobloxCode(value) {
  const code=String(value||"").trim();
  if(!validRobloxCode(code))throw new Error("Código Roblox inválido.");
  if(!globalThis.crypto?.subtle)throw new Error("No se puede comprobar la seguridad del código en este navegador.");
  const input=new TextEncoder().encode(code.toUpperCase());
  const digest=await globalThis.crypto.subtle.digest("SHA-256",input);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}

export const MAX_ROBLOX_CODES = 5;

// Evita duplicados dentro del pedido, incluso si cambian mayúsculas/minúsculas.
export function normalizeRobloxCodes(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_ROBLOX_CODES)
    throw new Error("Ingresa entre 1 y " + MAX_ROBLOX_CODES + " códigos de Roblox.");
  const codes = values.map(value => String(value || "").trim());
  if (codes.some(code => !validRobloxCode(code)))
    throw new Error("Cada código debe tener entre 8 y 80 caracteres: letras, números o guiones.");
  if (new Set(codes.map(code => code.toUpperCase())).size !== codes.length)
    throw new Error("No puedes entregar el mismo código dos veces en un pedido.");
  return codes;
}

export function askRobloxCodes(order) {
  return new Promise(resolve => {
    let finished = false;
    const values = [{code:"",visible:false}];
    const overlay = document.createElement("div");
    overlay.className = "nx-code-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(3,8,17,.88);display:grid;place-items:center;padding:18px;";
    const dialog = document.createElement("section");
    dialog.setAttribute("role","dialog");
    dialog.setAttribute("aria-modal","true");
    dialog.setAttribute("aria-label","Entregar códigos Roblox");
    dialog.style.cssText = "width:min(100%,520px);max-height:90vh;overflow:auto;border:1px solid #c08a4a;border-radius:20px;padding:25px;background:#121c2b;color:#f7f8fc;box-shadow:0 25px 85px #0009;font:14px Arial,sans-serif;";
    const title=document.createElement("h2");
    title.textContent="Entregar códigos de Roblox";
    title.style.cssText="margin:0 0 10px;font-size:24px;color:#ffc275";
    const info=document.createElement("p");
    info.textContent=(order?.product||"Pedido Roblox")+" · Cliente: "+(order?.customer||order?.id||"NEXORA");
    info.style.cssText="color:#c0cede;line-height:1.5";
    const note=document.createElement("p");
    note.textContent="Agrega los códigos necesarios para este pedido (máximo "+MAX_ROBLOX_CODES+"). Solo el comprador podrá verlos cuando marques el pedido como completado.";
    note.style.cssText="color:#e1dfd6;line-height:1.65";
    const form=document.createElement("form");
    const entries=document.createElement("div");
    const add=document.createElement("button");
    add.type="button";add.textContent="+ Agregar otro código";
    add.style.cssText="margin:12px 0;padding:11px 14px;border:1px solid #7ba5b2;border-radius:10px;background:#172d3f;color:#e9f6ff;font-weight:700;cursor:pointer";
    const error=document.createElement("p");
    error.setAttribute("role","alert");
    error.style.cssText="min-height:18px;margin:8px 0;color:#ffadad;font-size:12px";
    const buttons=document.createElement("div");
    buttons.style.cssText="display:flex;gap:10px;flex-wrap:wrap;";
    const cancel=document.createElement("button");
    cancel.type="button";cancel.textContent="Cancelar";
    cancel.style.cssText="padding:12px 18px;border:1px solid #546783;border-radius:11px;background:#172437;color:#fff;cursor:pointer";
    const submit=document.createElement("button");
    submit.type="submit";submit.textContent="Entregar códigos y completar";
    submit.style.cssText="padding:12px 18px;border:0;border-radius:11px;background:#35cf9c;color:#09281f;font-weight:800;cursor:pointer";
    const previousFocus=document.activeElement;
    const onKeydown=event=>{
      if(event.key==="Escape"){event.preventDefault();finish(null);}
      if(event.key!=="Tab")return;
      const focusable=Array.from(dialog.querySelectorAll('input,button:not([disabled])'));
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    function finish(result){
      if(finished)return;finished=true;
      document.removeEventListener("keydown",onKeydown);
      overlay.remove();
      if(previousFocus?.isConnected)previousFocus.focus();
      resolve(result);
    }
    function paint(){
      entries.replaceChildren();
      values.forEach((item,index)=>{
        const container=document.createElement("div");
        container.style.cssText="margin:10px 0;padding:13px;background:#0d1825;border:1px solid #345267;border-radius:12px";
        const label=document.createElement("label");
        label.textContent="Código "+(index+1);
        label.style.cssText="display:block;margin-bottom:8px;font-weight:bold";
        const input=document.createElement("input");
        input.type=item.visible?"text":"password";
        input.placeholder="Introduce el código completo";
        input.autocomplete="off";
        input.setAttribute("autocapitalize","off");
        input.spellcheck=false;input.maxLength=80;input.required=true;
        input.value=item.code;
        input.style.cssText="display:block;width:100%;padding:13px;border:1px solid #546783;border-radius:10px;background:#070e19;color:#fff;box-sizing:border-box;font:inherit";
        input.addEventListener("input",()=>{item.code=input.value;error.textContent="";});
        label.append(input);
        const toggle=document.createElement("button");
        toggle.type="button";toggle.textContent=item.visible?"Ocultar":"Mostrar";
        toggle.style.cssText="margin:9px 8px 0 0;padding:9px;border:1px solid #546783;border-radius:9px;background:#172437;color:#fff;cursor:pointer";
        toggle.addEventListener("click",()=>{item.visible=!item.visible;input.type=item.visible?"text":"password";toggle.textContent=item.visible?"Ocultar":"Mostrar";input.focus();});
        container.append(label,toggle);
        if(values.length>1){
          const remove=document.createElement("button");
          remove.type="button";remove.textContent="Quitar";
          remove.style.cssText=toggle.style.cssText;
          remove.addEventListener("click",()=>{values.splice(index,1);paint();});
          container.append(remove);
        }
        entries.append(container);
      });
      add.disabled=values.length>=MAX_ROBLOX_CODES;
      add.textContent=add.disabled?"Máximo "+MAX_ROBLOX_CODES+" códigos":"+ Agregar otro código";
    }
    add.addEventListener("click",()=>{if(values.length<MAX_ROBLOX_CODES){values.push({code:"",visible:false});paint();entries.lastElementChild?.querySelector("input")?.focus();}});
    cancel.addEventListener("click",()=>finish(null));
    form.addEventListener("submit",event=>{
      event.preventDefault();
      try{finish(normalizeRobloxCodes(values.map(item=>item.code)));}
      catch(e){error.textContent=e.message;entries.querySelector("input")?.focus();}
    });
    buttons.append(cancel,submit);
    form.append(entries,add,error,buttons);
    dialog.append(title,info,note,form);
    overlay.append(dialog);document.body.append(overlay);
    document.addEventListener("keydown",onKeydown);
    paint();entries.querySelector("input")?.focus();
  });
}

export function renderRobloxDelivery(order) {
  if (!isRobloxOrder(order) || order?.status !== "completed") return null;
  const section=document.createElement("section");
  section.style.cssText="margin:16px 0 8px;padding:18px;border:1px solid rgba(90,220,165,.4);border-radius:14px;background:linear-gradient(135deg,#122b29,#111e2b);";
  const heading=document.createElement("h4");
  heading.textContent="🎁 Tus códigos de Roblox";
  heading.style.cssText="font-size:17px;margin:0 0 11px;color:#aeffda;";
  section.append(heading);
  if(order?.redemptionLoading || order?.redemptionError) {
    const message=document.createElement("p");
    message.textContent=order.redemptionError
      ?"No se pudieron cargar los códigos privados. Actualiza la página o contacta con soporte."
      :"Cargando tus códigos privados de Roblox…";
    message.style.cssText="line-height:1.65;color:#cbdacf";
    section.append(message);return section;
  }
  // Compatible con pedidos antiguos que guardaban un solo redemptionCode.
  const incoming=Array.isArray(order?.redemptionCodes) && order.redemptionCodes.length
    ? order.redemptionCodes
    : (order?.redemptionCode ? [order.redemptionCode] : []);
  const codes=incoming.filter(validRobloxCode);
  if (!codes.length || codes.length !== incoming.length) {
    const missing=document.createElement("p");
    missing.textContent="Este pedido figura como completado, pero no se encuentran sus códigos de canje. Contacta con soporte NEXORA indicando el número de pedido.";
    missing.style.cssText="line-height:1.6;color:#f6d5a5";
    const support=document.createElement("a");
    support.href="soporte.html";support.textContent="Ir a soporte NEXORA →";
    support.style.cssText="color:#ffc27d;text-decoration:underline";
    section.append(missing,support);return section;
  }
  const small=document.createElement("p");
  small.textContent=codes.length===1
    ?"Código privado, oculto por defecto. No lo compartas."
    :codes.length+" códigos privados, ocultos por defecto. No los compartas.";
  small.style.cssText="color:#cbdacb;line-height:1.6;font-size:13px";
  section.append(small);
  codes.forEach((code,index)=>{
    const label=document.createElement("p");
    label.textContent="Código "+(index+1)+" de "+codes.length;
    label.style.cssText="color:#aeffda;font-size:13px;font-weight:800;margin:14px 0 6px";
    const box=document.createElement("div");
    box.style.cssText="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:6px 0";
    const value=document.createElement("code");
    value.textContent="••••••••";
    value.style.cssText="display:block;background:#07131e;border:1px solid #577c79;border-radius:10px;padding:13px;letter-spacing:.06em;font-size:clamp(13px,3vw,19px);color:#fff;overflow-wrap:anywhere;flex:1;min-width:120px;user-select:all";
    const show=document.createElement("button");
    show.type="button";show.textContent="Mostrar";show.setAttribute("aria-pressed","false");
    show.style.cssText="padding:12px;border-radius:10px;border:1px solid #547883;background:#182c36;color:#e7f9f2;font-weight:800;cursor:pointer";
    show.addEventListener("click",()=>{
      const revealed=show.getAttribute("aria-pressed")!=="true";
      value.textContent=revealed?code:"••••••••";
      show.textContent=revealed?"Ocultar":"Mostrar";
      show.setAttribute("aria-pressed",String(revealed));
    });
    const copy=document.createElement("button");
    copy.type="button";copy.textContent="Copiar";
    copy.style.cssText="padding:12px;border-radius:10px;border:1px solid #72deb9;background:#2bc695;color:#09271d;font-weight:800;cursor:pointer";
    copy.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(code);copy.textContent="Copiado ✓";}
      catch{copy.textContent="No se pudo copiar";}
    });
    box.append(value,show,copy);section.append(label,box);
  });
  const list=document.createElement("ol");
  list.style.cssText="margin:13px 0 4px;padding-left:23px;color:#dbe9e7;line-height:1.75;font-size:13px";
  for(const instruction of [
    "Abre la página oficial de Roblox para canjear e inicia sesión.",
    "Introduce cada código por separado en la página de canje.",
    "Pulsa Canjear y sigue las indicaciones. Los códigos de crédito se convierten en saldo para comprar Robux."
  ]){const li=document.createElement("li");li.textContent=instruction;list.append(li);}
  const link=document.createElement("a");
  link.href="https://www.roblox.com/redeem";link.target="_blank";link.rel="noopener noreferrer";
  link.textContent="Abrir página oficial de canje Roblox ↗";
  link.style.cssText="display:inline-block;margin-top:13px;color:#ffd18e;text-decoration:underline;font-weight:800;font-size:13px";
  section.append(list,link);return section;
}
