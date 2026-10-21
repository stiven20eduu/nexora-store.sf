import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, query, orderBy, limit, where, onSnapshot, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const db = getFirestore(auth.app);
export const isNotificationAdmin = u => !!u?.emailVerified && ['nexora.store.sf@gmail.com','stiven20eduu@gmail.com'].includes(u.email?.toLowerCase());
export async function requestAttention(uid, orderId, message) {
  if (!isNotificationAdmin(auth.currentUser)) throw new Error('Usa una cuenta MVP con correo verificado.');
  message = message.trim();
  if (message.length < 5 || message.length > 500) throw new Error('Escribe entre 5 y 500 caracteres.');
  // Un único aviso por pedido; actualizarlo vuelve a avisar al cliente.
  await setDoc(doc(db,'users',uid,'notifications','attention-'+orderId), {
    kind:'attention', title:'Tu pedido necesita tu atención', body:message,
    orderId, url:'soporte.html?orderId='+encodeURIComponent(orderId),
    createdAt:serverTimestamp(), authorUid:auth.currentUser.uid
  });
}
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./notifications.css',import.meta.url);document.head.append(css);
const host=document.createElement('div');host.id='nx-notifications';host.hidden=true;
host.innerHTML=`<button class="nx-bell" aria-label="Notificaciones" aria-expanded="false">🔔 <span class="nx-count" hidden>0</span></button><section class="nx-notice-panel" aria-label="Notificaciones de NEXORA" hidden><div class="nx-notice-heading"><h2>Notificaciones</h2><button class="nx-close" aria-label="Cerrar notificaciones">×</button></div><p class="nx-state" role="status"></p><div class="nx-tools"><button class="nx-enable">Activar en este celular</button><button class="nx-read">Marcar como leídas</button></div><p class="nx-device-state" role="status"></p><div class="nx-feed"></div></section>`;
document.body.append(host);
const $=s=>host.querySelector(s),sources=new Map(),errors=new Set();let stops=[],user=null,epoch=0,read={};
const storageKey=uid=>'nexora-notices-read:'+uid;
const signature=n=>String(n.createdAt?.toMillis?.()||0)+':'+n.body;
function persist(){try{localStorage.setItem(storageKey(user.uid),JSON.stringify(read));}catch{}}
function render(){
 if(!user)return;
 const fallbackTopups=new Set([...(sources.get('topups')||[]),...(sources.get('pendingTopups')||[])].map(n=>n.topupId));
 const notices=[...sources.values()].flat().filter(n=>!(n.id.startsWith('personal:')&&['topup','mvp-topup'].includes(n.kind)&&fallbackTopups.has(n.topupId))).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)).slice(0,100);
 const unread=notices.filter(n=>read[n.id]!==signature(n)).length;
 $('.nx-count').hidden=!unread;$('.nx-count').textContent=unread>99?'99+':String(unread);
 $('.nx-bell').setAttribute('aria-label',`Notificaciones: ${unread} sin leer`);
 $('.nx-notice-heading h2').textContent=isNotificationAdmin(user)?'Avisos MVP / ADM':'Notificaciones';
 $('.nx-state').textContent=errors.size?'Algunos avisos no están disponibles. Revisa tus permisos de Firebase o reconecta.':isNotificationAdmin(user)?'Pedidos y recargas pendientes de NEXORA.':'Tus pedidos y recargas de saldo de NEXORA.';
 const feed=$('.nx-feed');feed.replaceChildren();
 for(const n of notices){
  const a=document.createElement('a');a.className='nx-notice'+(read[n.id]!==signature(n)?' nx-unread':'');
  // Solo destinos propios, nunca URLs proporcionadas libremente.
  a.href=n.kind==='mvp-order'?'admin-pedidos.html':n.kind==='mvp-topup'?'admin-recargas.html':n.kind==='topup'?'recargar-saldo.html':n.kind==='attention'?'soporte.html?orderId='+encodeURIComponent(n.orderId||''):n.kind==='order'?'perfil.html':'index.html';
  const title=document.createElement('strong');title.textContent=n.title;
  const body=document.createElement('p');body.textContent=n.body;
  const time=document.createElement('small');time.textContent=n.createdAt?.toDate?.().toLocaleString('es-PE')||'Ahora';
  a.append(title,body,time);a.onclick=()=>{read[n.id]=signature(n);persist();render();};feed.append(a);
 }
 if(!notices.length){const p=document.createElement('p');p.textContent='No tienes avisos recientes.';feed.append(p);}
}
function toggle(open){$('.nx-notice-panel').hidden=!open;$('.nx-bell').setAttribute('aria-expanded',String(open));if(open)$('.nx-close').focus();}
$('.nx-bell').onclick=()=>toggle($('.nx-notice-panel').hidden);$('.nx-close').onclick=()=>{toggle(false);$('.nx-bell').focus();};
host.addEventListener('keydown',e=>{if(e.key==='Escape'){toggle(false);$('.nx-bell').focus();}});
$('.nx-read').onclick=()=>{for(const n of [...sources.values()].flat())read[n.id]=signature(n);persist();render();};
window.addEventListener('storage',e=>{if(user&&e.key===storageKey(user.uid)){try{read=JSON.parse(e.newValue||'{}');}catch{read={};}render();}});
async function bindWorker(uid){
 if(!('serviceWorker' in navigator))return null;
 const reg=await navigator.serviceWorker.register(new URL('./service-worker.js',import.meta.url),{scope:new URL('./',import.meta.url).pathname});
 await navigator.serviceWorker.ready;
 const worker=reg.active; if(!worker)return reg;
 await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timeout=setTimeout(()=>reject(new Error('No se pudo vincular este dispositivo. Reabre la app.')),8000);channel.port1.onmessage=e=>{clearTimeout(timeout);e.data?.ok?resolve():reject(new Error('No se pudo guardar la configuración del dispositivo.'));};worker.postMessage({type:'NEXORA_BIND',uid},[channel.port2]);});
 return reg;
}
async function enablePush(ask){
 const current=user,version=epoch;if(!current)return;
 if(!('Notification' in window))throw new Error('Este navegador no admite notificaciones. Puedes usar la campana.');
 // Pedir permiso como consecuencia directa del botón, antes de accesos de red.
 if(ask && Notification.permission==='default')await Notification.requestPermission();
 const config=await getDoc(doc(db,'notificationConfig','public'));
 const vapidKey=config.data()?.vapidKey;
 if(!vapidKey)throw new Error('Los avisos del celular aún no están activados por NEXORA. Puedes consultar la campana.');
 const {getMessaging,getToken,isSupported}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js');
 if(!await isSupported())throw new Error('Este navegador no admite estos avisos. Prueba con la app instalada desde Chrome.');
 if(Notification.permission!=='granted')throw new Error('Permite las notificaciones en los ajustes del navegador para recibirlas.');
 const reg=await bindWorker(current.uid);
 const token=await getToken(getMessaging(auth.app),{vapidKey,serviceWorkerRegistration:reg});
 if(!token||version!==epoch||auth.currentUser?.uid!==current.uid)return;
 const {getFunctions,httpsCallable}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js');
 await httpsCallable(getFunctions(auth.app,'us-central1'),'registerPushDevice')({token});
 if(version===epoch){$('.nx-device-state').textContent='Notificaciones activadas en este dispositivo.';$('.nx-enable').textContent='Comprobar notificaciones';}
}
$('.nx-enable').onclick=async()=>{const btn=$('.nx-enable');btn.disabled=true;$('.nx-device-state').textContent='Activando…';try{await enablePush(true);}catch(e){$('.nx-device-state').textContent=e.code==='permission-denied'?'La activación en Firebase está pendiente.':e.code?.startsWith('functions/')?'El servicio de notificaciones todavía no está disponible.':e.message;}finally{btn.disabled=false;}};
onAuthStateChanged(auth,async next=>{
 epoch++;for(const stop of stops)stop();stops=[];sources.clear();errors.clear();user=next;host.hidden=!next;toggle(false);$('.nx-feed').replaceChildren();$('.nx-count').hidden=true;$('.nx-device-state').textContent='';
 // Invalidar el destinatario del dispositivo también al cerrar o cambiar de cuenta.
 const version=epoch;
 bindWorker(next?.uid||null).then(()=>{if(version!==epoch)bindWorker(user?.uid||null).catch(()=>{});}).catch(()=>{});
 if(!next)return;
 try{read=JSON.parse(localStorage.getItem(storageKey(next.uid))||'{}');}catch{read={};}
 function watch(key,ref,map){stops.push(onSnapshot(ref,snap=>{if(version!==epoch)return;sources.set(key,snap.docs.map(d=>map(d)));errors.delete(key);render();},()=>{if(version!==epoch)return;errors.add(key);render();}));}
 watch('personal',query(collection(db,'users',next.uid,'notifications'),orderBy('createdAt','desc'),limit(50)),d=>({...d.data(),id:'personal:'+d.id}));
 // Estados de recargas visibles sin depender de funciones server-side.
 watch('topups',query(collection(db,'yapeTopups'),where('uid','==',next.uid),limit(60)),d=>{
  const t=d.data(),amount=Number.isInteger(t.amountCents)?'S/ '+(t.amountCents/100).toFixed(2):'tu saldo';
  const approved=t.status==='approved',rejected=t.status==='rejected';
  return {id:'topup:'+d.id,topupId:d.id,kind:'topup',title:approved?'¡Tu saldo fue acreditado!':rejected?'Recarga no aprobada':'Recarga en revisión',
    body:approved?'Se acreditaron '+amount+' a tu saldo NEXORA.':rejected?'La solicitud de '+amount+' fue rechazada. Puedes consultar soporte.':'Tu solicitud de '+amount+' está pendiente de verificación.',
    createdAt:t.processedAt||t.createdAt};
 });
 if(isNotificationAdmin(next)){
  watch('pendingTopups',query(collection(db,'yapeTopups'),where('status','==','pending'),limit(60)),d=>{
   const t=d.data(),amount=Number.isInteger(t.amountCents)?'S/ '+(t.amountCents/100).toFixed(2):'saldo';
   return {id:'mvp-topup:'+d.id,topupId:d.id,kind:'mvp-topup',title:'Recarga de saldo pendiente',
     body:'Solicitud de '+amount+' por revisar. Verifica el pago antes de acreditarlo.',createdAt:t.createdAt};
  });
 }
 // Estados de pedidos disponibles incluso antes de desplegar el servidor push.
 const labels={pending:'Pedido recibido',verified:'Pago confirmado',processing:'Tu pedido está en proceso',completed:'¡Tu pedido está completado!',cancelled:'Pedido cancelado'};
 watch('orders',query(collection(db,'users',next.uid,'orders'),orderBy('createdAt','desc'),limit(30)),d=>({id:'order:'+d.id,kind:'order',title:labels[d.data().status]||'Pedido actualizado',body:(d.data().product||'Pedido')+' · '+(labels[d.data().status]||d.data().status),createdAt:d.data().createdAt}));
 render();
 if('Notification' in window&&Notification.permission==='granted')enablePush(false).catch(()=>{$('.nx-device-state').textContent='Consulta los avisos aquí. La conexión de notificaciones del celular está pendiente.';});
});
