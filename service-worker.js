/* NEXORA STORE PWA · Cache limitado a recursos públicos del propio sitio.
   No almacena llamadas a Firebase, métodos POST, APIs ni respuestas privadas. */
const CACHE_NAME = "nexora-public-v10";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./nexora-premium.css?v=3",
  "./nexora-experience.js?v=2",
  "./icon-192.png",
  "./icon-512.png",
  "./Emblema%20Nexora%20Store%20SF%20con%20corona.png"
];
const ROOT = new URL("./", self.registration.scope);
const allowedFiles = /\.(?:css|js|svg|png|jpe?g|webp|gif|ico|woff2?|json)$/i;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(SHELL.map(path => cache.add(path).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("nexora-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // No interceptar APIs, Firebase, URLs externas, peticiones de usuario o descargas.
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(ROOT.pathname) ||
      url.pathname.includes("/api/") ||
      request.headers.has("Authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-cache" }).catch(() => {
        const home = new URL("index.html", ROOT);
        return caches.match(home.href).then(res => res || Response.error());
      })
    );
    return;
  }

  if (!allowedFiles.test(url.pathname)) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || Response.error()))
  );
});

// Persistir destinatario y deduplicación sin guardar mensajes privados en caché.
function noticeDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('nexora-push',1);r.onupgradeneeded=()=>{r.result.createObjectStore('settings');r.result.createObjectStore('seen');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function bindRecipient(uid){const db=await noticeDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(uid,'uid');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
self.addEventListener('message',event=>{if(event.data?.type==='NEXORA_BIND')event.waitUntil(bindRecipient(typeof event.data.uid==='string'?event.data.uid:null).then(()=>event.ports[0]?.postMessage({ok:true})).catch(()=>event.ports[0]?.postMessage({ok:false})));});
async function claimNotice(data){
 const db=await noticeDB();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(['settings','seen'],'readwrite'),settings=tx.objectStore('settings'),seen=tx.objectStore('seen');let accept=false;
  settings.get('uid').onsuccess=e=>{if(e.target.result!==data.uid)return;seen.get(data.id).onsuccess=e=>{if(e.target.result)return;accept=true;seen.put(Date.now(),data.id);};};
  // Mantener limitada la memoria de duplicados.
  seen.openCursor().onsuccess=e=>{const cursor=e.target.result;if(cursor){if(cursor.value<Date.now()-2*86400000)cursor.delete();cursor.continue();}};
  tx.oncomplete=()=>resolve(accept);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
self.addEventListener('push',event=>{
 let data;try{data=event.data.json().data;}catch{return;}
 if(!data?.id||!data?.uid)return;
 event.waitUntil((async()=>{
  if(!await claimNotice(data))return;
  let url=new URL('index.html',ROOT);try{const candidate=new URL(data.url,ROOT);if(candidate.origin===ROOT.origin&&candidate.pathname.startsWith(ROOT.pathname))url=candidate;}catch{}
  await self.registration.showNotification('NEXORA STORE',{body:data.body||'Tienes un nuevo aviso.',icon:new URL('icon-192.png',ROOT).href,badge:new URL('icon-192.png',ROOT).href,tag:data.id,data:{url:url.href},renotify:false});
 })());
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{let url=new URL('index.html',ROOT);try{const candidate=new URL(event.notification.data?.url,ROOT);if(candidate.origin===ROOT.origin&&candidate.pathname.startsWith(ROOT.pathname))url=candidate;}catch{}const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const tab=tabs.find(t=>t.url.startsWith(ROOT.href));if(tab){await tab.navigate(url.href);await tab.focus();}else await self.clients.openWindow(url.href);})());});
