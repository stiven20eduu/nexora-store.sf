const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {IDBFactory}=require('fake-indexeddb');
const {eventKey,orderNotice,topupNotice}=require('../functions/notification-model');
test('Los eventos tienen IDs estables y los pedidos distinguen destinatarios',()=>{
 assert.equal(eventKey('u:event1'),eventKey('u:event1'));assert.notEqual(eventKey('u:event1'),eventKey('v:event1'));
 assert.match(orderNotice({status:'completed',product:'100 Robux'},'order').title,/completado/);
 assert.equal(orderNotice({status:'verified'},'order',true).url,'admin-pedidos.html');
 assert.equal(orderNotice({status:'processing'},'order').url,'perfil.html');
});
test('Las recargas pendientes avisan al MVP y las aprobadas/rechazadas al titular',()=>{
 const pending=topupNotice({status:'pending',amountCents:2500},'t-1',true);
 assert.equal(pending.kind,'mvp-topup');
 assert.equal(pending.url,'admin-recargas.html');
 assert.match(pending.title,/pendiente/);
 const approved=topupNotice({status:'approved',amountCents:2500},'t-1');
 assert.equal(approved.kind,'topup');
 assert.equal(approved.url,'recargar-saldo.html');
 assert.match(approved.title,/acreditado/);
 assert.match(approved.body,/S\/ 25\.00/);
 const rejected=topupNotice({status:'rejected',amountCents:2500},'t-1');
 assert.match(rejected.title,/no aprobada/);
 assert.notEqual(rejected.title,approved.title);
});
function worker(){const handlers={},shown=[],opened=[],scope='https://example.com/nexora/';const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,...options})},location:{origin:'https://example.com'},addEventListener:(event,fn)=>handlers[event]=fn,clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 const context=vm.createContext({self,URL,indexedDB:new IDBFactory(),Date,Promise,Response});vm.runInContext(fs.readFileSync(require.resolve('../service-worker.js'),'utf8'),context);
 async function invoke(kind,event){let result;handlers[kind]({...event,waitUntil:p=>result=p});await result;}
 return {shown,opened,bind:uid=>invoke('message',{data:{type:'NEXORA_BIND',uid},ports:[{postMessage(){}}]}),push:data=>invoke('push',{data:{json:()=>({data})}}),click:url=>invoke('notificationclick',{notification:{close(){},data:{url}}})};}
test('El dispositivo descarta avisos de otra cuenta, tras logout y duplicados',async()=>{
 const w=worker();const notice={uid:'alice',id:'event1',body:'Un aviso',url:'https://example.com/nexora/perfil.html'};
 await w.push(notice);assert.equal(w.shown.length,0);
 await w.bind('alice');await w.push(notice);await w.push(notice);assert.equal(w.shown.length,1);
 await w.bind('bob');await w.push({...notice,id:'event2'});assert.equal(w.shown.length,1);
 await w.push({...notice,uid:'bob',id:'event3'});assert.equal(w.shown.length,2);
 await w.bind(null);await w.push({...notice,uid:'bob',id:'event4'});assert.equal(w.shown.length,2);
});
test('Las notificaciones nunca abren dominios externos o rutas ajenas',async()=>{
 const w=worker();await w.bind('alice');await w.push({uid:'alice',id:'evil',url:'https://evil.example/phish'});
 assert.equal(w.shown[0].data.url,'https://example.com/nexora/index.html');
 await w.click('https://evil.example/');await w.click('https://example.com/other/');await w.click('https://example.com/nexora/perfil.html');
 assert.deepEqual(w.opened,['https://example.com/nexora/index.html','https://example.com/nexora/index.html','https://example.com/nexora/perfil.html']);
});
