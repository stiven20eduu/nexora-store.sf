const {test,before,after}=require('node:test');const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,writeBatch,serverTimestamp}=require('firebase/firestore');let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-nexora',firestore:{rules:fs.readFileSync(require.resolve('../firestore.rules'),'utf8')}});await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/alice/orders/order-1'),{status:'verified'});});});
after(async()=>env?.cleanup());
const db=(uid,email='user@example.com',email_verified=true)=>env.authenticatedContext(uid,{email,email_verified}).firestore();
test('Solo MVP verificado puede solicitar atención; otros usuarios no pueden leerla',async()=>{
 const data={kind:'attention',title:'Tu pedido necesita tu atención',body:'Confirma tu ID de jugador.',orderId:'order-1',url:'soporte.html?orderId=order-1',createdAt:serverTimestamp(),authorUid:'mvp'};
 await assertFails(setDoc(doc(db('alice'),'users/alice/notifications/attention-order-1'),data));
 await assertFails(setDoc(doc(db('mvp','nexora.store.sf@gmail.com',false),'users/alice/notifications/attention-order-1'),data));
 await assertSucceeds(setDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'users/alice/notifications/attention-order-1'),data));
 await assertSucceeds(getDoc(doc(db('alice'),'users/alice/notifications/attention-order-1')));
 await assertFails(getDoc(doc(db('bob'),'users/alice/notifications/attention-order-1')));
 await assertFails(setDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'users/bob/notifications/attention-order-1'),data));
});
test('Anuncios restringidos y configuración sin acceso a tokens',async()=>{
 const data={kind:'news',title:'Nueva función',body:'Tenemos una nueva función para ti.',authorUid:'mvp',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db('alice'),'announcements/test'),data));
 await assertSucceeds(setDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'announcements/test'),data));
 await assertSucceeds(getDoc(doc(db('bob'),'announcements/test')));
 await assertFails(updateDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'announcements/test'),{title:'Cambio'}));
 await assertFails(setDoc(doc(db('alice'),'notificationConfig/public'),{vapidKey:'B'.repeat(87),updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'notificationConfig/public'),{vapidKey:'B'.repeat(87),updatedAt:serverTimestamp()}));
 await assertFails(getDoc(doc(db('mvp','nexora.store.sf@gmail.com'),'pushDevices/secret')));
 await assertFails(setDoc(doc(db('alice'),'notificationDeliveries/fake'),{uid:'alice'}));
});

test('Codigo de Roblox: entrega atomica, privada y no reutilizable',async()=>{
 const admin=db('mvp','nexora.store.sf@gmail.com');
 const alice=db('alice'),bob=db('bob');
 const path='users/alice/orders/roblox-test';
 const delivery=path+'/delivery/roblox';
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),{game:'Roblox',product:'Tarjeta regalo Roblox',status:'verified',paymentMethod:'wallet'});
 });
 // Un cliente no puede regalarse un codigo ni completar pedidos ajenos.
 await assertFails(setDoc(doc(alice,delivery),{code:'ROBLOX123456',deliveredBy:'alice',createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(admin,path),{status:'completed'}));
 await assertFails(getDoc(doc(alice,delivery)));
 const batch=writeBatch(admin);
 batch.set(doc(admin,delivery),{code:'ROBLOX123456',deliveredBy:'mvp',createdAt:serverTimestamp()});
 batch.update(doc(admin,path),{status:'completed'});
 await assertSucceeds(batch.commit());
 const received=await getDoc(doc(alice,delivery));
 if(received.data().code!=='ROBLOX123456')throw Error('Codigo no entregado al cliente.');
 await assertFails(getDoc(doc(bob,delivery)));
 await assertFails(updateDoc(doc(admin,delivery),{code:'OTROCODIGO9'}));
});
test('Codigo de Roblox: no se entrega con pago pendiente',async()=>{
 const admin=db('mvp','nexora.store.sf@gmail.com');
 const path='users/alice/orders/roblox-pending';
 const delivery=path+'/delivery/roblox';
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),{game:'Roblox',product:'Tarjeta regalo Roblox',status:'pending'});
 });
 const batch=writeBatch(admin);
 batch.set(doc(admin,delivery),{code:'ROBUXABCDE123',deliveredBy:'mvp',createdAt:serverTimestamp()});
 batch.update(doc(admin,path),{status:'completed'});
 await assertFails(batch.commit());
});
