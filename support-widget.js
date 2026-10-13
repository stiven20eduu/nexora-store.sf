import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  SUPPORT_CATEGORIES, SUPPORT_STATUSES, sendSupportTicket, compressEvidence, getMySupportTickets
} from "./support-data.js";

const target=document.getElementById("atencion-cliente");
if(target) {
  target.innerHTML=`
    <div class="nx-support-container">
      <div class="nx-support-heading">
        <div>
          <div class="nx-support-eyebrow">NEXORA · CENTRO DE AYUDA</div>
          <h2>Estamos aquí para ayudarte.</h2>
          <p>¿Tuviste un inconveniente con tu pedido, tu saldo o tu cuenta? Cuéntanos qué ocurrió y adjunta capturas para que nuestro equipo MVP revise tu caso.</p>
        </div>
        <div class="nx-support-tags"><span>✓ Casos privados</span><span>✓ Hasta 3 capturas</span><span>✓ Seguimiento en tu cuenta</span></div>
      </div>
      <div class="nx-support-layout">
        <div class="nx-support-card">
          <h3>Enviar una solicitud</h3>
          <p>Completa los datos para abrir un nuevo caso. Tu descripción y las imágenes solo estarán disponibles para ti y el equipo autorizado de NEXORA.</p>
          <div id="nx-support-gate" class="nx-support-gate" role="status">Comprobando tu sesión…</div>
          <form id="nx-support-form" hidden>
            <div class="nx-support-dual">
              <div class="nx-support-field"><label class="nx-support-label" for="nx-support-category">¿Qué sucedió?</label>
                <select id="nx-support-category" required><option value="">Selecciona el motivo</option>
                  <option value="pedido">Problema con un pedido</option><option value="saldo">Saldo o recarga</option>
                  <option value="cuenta">Mi cuenta</option><option value="producto">Producto o código</option>
                  <option value="otro">Otra consulta</option></select>
              </div>
              <div class="nx-support-field"><label class="nx-support-label" for="nx-support-order">Número de pedido (opcional)</label>
                <input id="nx-support-order" maxlength="80" placeholder="Si tienes uno, escríbelo" autocomplete="off">
              </div>
            </div>
            <div class="nx-support-field"><label class="nx-support-label" for="nx-support-subject">Asunto de la solicitud</label>
              <input id="nx-support-subject" maxlength="100" minlength="5" placeholder="Ejemplo: Mi compra sigue pendiente" required>
            </div>
            <div class="nx-support-field"><label class="nx-support-label" for="nx-support-description">Cuéntanos qué pasó</label>
              <textarea id="nx-support-description" maxlength="2000" minlength="20" required placeholder="Explícanos cuándo ocurrió, qué producto compraste y cómo podemos ayudarte..."></textarea>
              <small>Escribe al menos 20 caracteres. No compartas contraseñas, códigos secretos ni datos bancarios.</small>
            </div>
            <div class="nx-support-field"><label class="nx-support-label" for="nx-support-files">Capturas o imágenes (opcional)</label>
              <label class="nx-support-drop" for="nx-support-files"><strong>📎 Adjuntar evidencias</strong><span>Selecciona hasta 3 imágenes JPG, PNG o WebP (máx. 8 MB por imagen). Se reducirán antes de enviarlas.</span>
                <input id="nx-support-files" type="file" accept="image/jpeg,image/png,image/webp" multiple>
              </label>
              <div id="nx-support-preview" class="nx-support-preview" aria-live="polite"></div>
            </div>
            <button id="nx-support-send" class="nx-support-button" type="submit">Enviar solicitud <span aria-hidden="true">→</span></button>
            <p class="nx-support-privacy">Al enviar, el equipo MVP podrá leer el reporte y ver las imágenes para investigar el problema. No publiques datos de otras personas sin permiso.</p>
          </form>
          <p id="nx-support-feedback" class="nx-support-feedback" role="status" aria-live="polite"></p>
        </div>
        <aside class="nx-support-card">
          <h3>Tu caso nos importa</h3>
          <p>Un buen reporte nos ayuda a encontrar lo ocurrido y resolverlo más fácilmente.</p>
          <div class="nx-support-side-note"><span class="symbol">01</span><div><b>Explica el problema</b><p>Indica el juego, producto y qué sucedió. Añade tu número de pedido si lo tienes.</p></div></div>
          <div class="nx-support-side-note"><span class="symbol">02</span><div><b>Adjunta tus capturas</b><p>Puedes enviar hasta tres imágenes como evidencia. Revisa que no aparezcan datos privados.</p></div></div>
          <div class="nx-support-side-note"><span class="symbol">03</span><div><b>Consulta tu seguimiento</b><p>Los administradores pueden marcar tu caso como en revisión o resuelto y dejarte una respuesta.</p></div></div>
          <div id="nx-support-history" class="nx-support-history" hidden>
            <h3>Mis solicitudes</h3><p style="font-size:11px;color:#9eacbc;line-height:1.7">Revisa las respuestas y el estado de tus casos recientes.</p>
            <button id="nx-support-refresh" type="button" class="nx-support-aux">↻ Actualizar mis casos</button>
            <div id="nx-support-history-list" class="nx-support-history-list" aria-live="polite"></div>
          </div>
        </aside>
      </div>
    </div>`;

  const el=id=>document.getElementById(id);
  const form=el("nx-support-form"), gate=el("nx-support-gate"), feedback=el("nx-support-feedback");
  const filesInput=el("nx-support-files"),preview=el("nx-support-preview"),send=el("nx-support-send");
  const history=el("nx-support-history"),historyList=el("nx-support-history-list");
  const noticeOrder=new URLSearchParams(location.search).get('orderId');
  if(noticeOrder && /^[A-Za-z0-9-]{1,80}$/.test(noticeOrder)){
    el('nx-support-order').value=noticeOrder;
    el('nx-support-category').value='pedido';
    el('nx-support-subject').value='Respuesta sobre mi pedido';
  }
  let files=[],busy=false,currentUid=null,renderId=0;
  const message=(value,error=false)=>{feedback.textContent=value;feedback.dataset.error=String(error)};
  function clearFiles(){files=[];filesInput.value="";drawPreviews();}
  function drawPreviews(){
    preview.replaceChildren();
    files.forEach((file,i)=>{
      const figure=document.createElement("figure");
      const img=document.createElement("img");
      const caption=document.createElement("figcaption");
      const remove=document.createElement("button");
      const obj=URL.createObjectURL(file);
      img.src=obj;img.alt="Vista previa de evidencia "+(i+1);
      img.onload=()=>URL.revokeObjectURL(obj);
      img.onerror=()=>URL.revokeObjectURL(obj);
      caption.textContent=file.name;
      remove.type="button";remove.textContent="×";
      remove.setAttribute("aria-label","Quitar imagen "+file.name);
      remove.disabled=busy;
      remove.addEventListener("click",()=>{files.splice(i,1);drawPreviews()});
      figure.append(img,remove,caption);preview.append(figure);
    });
  }
  filesInput.addEventListener("change",()=>{
    const incoming=Array.from(filesInput.files||[]);
    filesInput.value="";
    if(incoming.length+files.length>3){message("Puedes adjuntar un máximo de 3 imágenes.",true);return}
    if(incoming.some(x=>!["image/jpeg","image/png","image/webp"].includes(x.type)||x.size>8*1024*1024)){
      message("Usa imágenes JPG, PNG o WebP de hasta 8 MB cada una.",true);return;
    }
    files.push(...incoming);message("");drawPreviews();
  });

  const line=(parent,name,value)=>{
    const p=document.createElement("p");
    const b=document.createElement("b");b.textContent=name+" ";
    const text=document.createTextNode(String(value));
    p.append(b,text);parent.append(p);
  };
  async function loadMine(){
    const current=++renderId;
    if(!currentUid)return;
    historyList.textContent="Cargando tus reportes…";
    try{
      const tickets=await getMySupportTickets();
      if(current!==renderId)return;
      historyList.replaceChildren();
      if(!tickets.length){historyList.textContent="Aún no has enviado ninguna solicitud.";return}
      for(const ticket of tickets){
        const card=document.createElement("article");card.className="nx-support-ticket";
        const title=document.createElement("strong");title.textContent=ticket.subject||"Solicitud";
        const status=document.createElement("span");status.className="nx-support-status";
        status.dataset.state=ticket.status||"open";status.textContent=SUPPORT_STATUSES[ticket.status]||"Recibido";
        const small=document.createElement("small");
        small.textContent="Caso "+ticket.id.slice(0,10)+" · "+(SUPPORT_CATEGORIES[ticket.category]||"Consulta")
          +" · "+(ticket.createdAt?.toDate?.().toLocaleDateString("es-PE")||"Reciente");
        card.append(title,status,small);
        if(ticket.adminReply)line(card,"Respuesta MVP:",ticket.adminReply);
        historyList.append(card);
      }
    }catch(error){
      console.warn("No pudimos mostrar los reportes de soporte.",error);
      if(current===renderId)historyList.textContent="No pudimos cargar tus casos. Comprueba las reglas de acceso de Firebase.";
    }
  }
  el("nx-support-refresh").addEventListener("click",loadMine);

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(busy||!currentUid)return;
    busy=true;send.disabled=true;filesInput.disabled=true;send.textContent="Preparando solicitud…";message("");
    try{
      const images=[];
      for(let i=0;i<files.length;i++){
        message("Preparando imagen "+(i+1)+" de "+files.length+"…");
        images.push(await compressEvidence(files[i]));
      }
      if(auth.currentUser?.uid!==currentUid)throw new Error("La sesión cambió. Vuelve a intentarlo.");
      send.textContent="Enviando al equipo MVP…";
      const ticketId=await sendSupportTicket({
        category:el("nx-support-category").value,
        subject:el("nx-support-subject").value,
        description:el("nx-support-description").value,
        orderId:el("nx-support-order").value, images
      });
      form.reset();clearFiles();message("✓ Solicitud recibida. Número de caso: "+ticketId.slice(0,10)+". Puedes revisar su estado aquí.");
      await loadMine();
    }catch(error){
      console.warn("No se pudo enviar el reporte.",error);
      if(error.code==="permission-denied"){
        message("No se pudo guardar el reporte: las reglas de soporte aún no están habilitadas en Firebase.",true);
      }else{
        message(error.message||"No se pudo enviar. Revisa tu conexión y vuelve a intentarlo.",true);
      }
    }finally{
      busy=false;send.disabled=false;filesInput.disabled=false;send.textContent="Enviar solicitud →";drawPreviews();
    }
  });

  onAuthStateChanged(auth,user=>{
    currentUid=user?.uid||null;renderId++;
    form.hidden=!user;history.hidden=!user;gate.hidden=!!user;
    message("");
    if(!user){
      gate.innerHTML='Para enviar y consultar solicitudes necesitas <a href="login.html">iniciar sesión</a> o <a href="register.html">crear una cuenta gratuita</a>.';
      clearFiles();
      historyList.replaceChildren();
    }else{
      gate.textContent="";
      loadMine();
    }
  });
}
