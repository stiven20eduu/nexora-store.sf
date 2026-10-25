const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
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

test('El service worker no registra notificaciones push y protege las peticiones privadas',()=>{
 const code=fs.readFileSync(require.resolve('../service-worker.js'),'utf8');
 assert.doesNotMatch(code,/addEventListener\(\s*["']push["']/);
 assert.doesNotMatch(code,/addEventListener\(\s*["']notificationclick["']/);
 assert.match(code,/request\.method\s*!==\s*"GET"/);
 assert.match(code,/request\.headers\.has\("Authorization"\)/);
});
