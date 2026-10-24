'use strict';
const {test,before,after}=require('node:test');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const fingerprint=code=>createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,writeBatch,serverTimestamp}=require('firebase/firestore');

let env;
const path='users/alice/orders/roblox-private-test';
const delivery=path+'/privateDelivery/roblox';
const code='RBX-ABC12345',codeHash=fingerprint(code),claim='robloxCodeClaims/'+codeHash;
const authDb=(uid,email='buyer@example.com',email_verified=true)=>
  env.authenticatedContext(uid,{email,email_verified}).firestore();

before(async()=>{
  env=await initializeTestEnvironment({
    projectId:'demo-nexora-roblox-private',
    firestore:{rules:fs.readFileSync(require.resolve('../firestore.rules'),'utf8')}
  });
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),path),{
      game:'Roblox',product:'300 Robux',price:15,status:'processing',
      createdAt:serverTimestamp()
    });
    await setDoc(doc(ctx.firestore(),'users/bob/orders/roblox-private-other'),{
      game:'Roblox',product:'300 Robux',price:15,status:'processing',
      createdAt:serverTimestamp()
    });
    await setDoc(doc(ctx.firestore(),'users/carl/orders/roblox-multi-test'),{
      game:'Roblox',product:'Robux con dos códigos',price:24,status:'processing',
      createdAt:serverTimestamp()
    });
    await setDoc(doc(ctx.firestore(),'users/dave/orders/roblox-multi-duplicate'),{
      game:'Roblox',product:'Robux',price:12,status:'processing',
      createdAt:serverTimestamp()
    });
    await setDoc(doc(ctx.firestore(),'users/alice/orders/roblox-old-test'),{
      game:'Roblox',product:'100 Robux',price:5,status:'completed',
      redemptionCode:'LEGACY-CODE-1234',createdAt:serverTimestamp()
    });
  });
});
after(async()=>env?.cleanup());

test('Comprador y MVP verificado pueden leer un código; otros no',async()=>{
  // Cada acceso se comprueba tras la entrega en una transacción.
  const admin=authDb('mvp','nexora.store.sf@gmail.com');
  const batch=writeBatch(admin);
  batch.set(doc(admin,claim),{uid:'alice',orderId:'roblox-private-test',addedAt:serverTimestamp(),addedBy:'mvp'});
  batch.set(doc(admin,delivery),{code,codeHash,addedAt:serverTimestamp(),addedBy:'mvp'});
  batch.update(doc(admin,path),{status:'completed',redemptionAddedAt:serverTimestamp(),redemptionAddedBy:'mvp'});
  await assertSucceeds(batch.commit());

  const mine=await assertSucceeds(getDoc(doc(authDb('alice'),delivery)));
  if(mine.data().code!==code)throw Error('Código incorrecto');
  await assertSucceeds(getDoc(doc(authDb('mvp','nexora.store.sf@gmail.com'),delivery)));
  await assertFails(getDoc(doc(authDb('mvp','nexora.store.sf@gmail.com',false),delivery)));
  await assertFails(getDoc(doc(authDb('bob'),delivery)));
  await assertFails(getDocs(collection(authDb('alice'),path+'/privateDelivery')));
  await assertFails(getDoc(doc(authDb('bob'),path)));
});

test('Dos pedidos no pueden reservar la misma huella de Roblox',async()=>{
 const admin=authDb('mvp','nexora.store.sf@gmail.com');
 const second='users/bob/orders/roblox-private-other';
 const batch=writeBatch(admin);
 batch.set(doc(admin,claim),{uid:'bob',orderId:'roblox-private-other',addedAt:serverTimestamp(),addedBy:'mvp'});
 batch.set(doc(admin,second+'/privateDelivery/roblox'),{
   code,codeHash,addedAt:serverTimestamp(),addedBy:'mvp'
 });
 batch.update(doc(admin,second),{status:'completed',redemptionAddedAt:serverTimestamp(),redemptionAddedBy:'mvp'});
 await assertFails(batch.commit());
 const original=await assertSucceeds(getDoc(doc(admin,second)));
 if(original.data().status!=='processing')throw Error('La transacción duplicada alteró otro pedido');
 const deliveryAfter=await assertSucceeds(getDoc(doc(authDb('bob'),second+'/privateDelivery/roblox')));
 if(deliveryAfter.exists())throw Error('La transacción duplicada guardó un código privado');
});

test('Los clientes no pueden consultar ni alterar el registro de huellas',async()=>{
 await assertFails(getDoc(doc(authDb('alice'),claim)));
 await assertFails(setDoc(doc(authDb('alice'),claim),{uid:'alice',orderId:'fake'}));
});

test('El cliente no puede modificar ni borrar el código entregado',async()=>{
  await assertFails(updateDoc(doc(authDb('alice'),delivery),{code:'RBX-OTHER99'}));
  await assertFails(setDoc(doc(authDb('alice'),delivery),{code:'RBX-OTHER99'}));
  await assertFails(updateDoc(doc(authDb('mvp','nexora.store.sf@gmail.com'),delivery),{code:'RBX-OTHER99'}));
});

test('La entrega anterior sigue visible al dueño, nunca a otro cliente',async()=>{
  const older='users/alice/orders/roblox-old-test';
  const old=await assertSucceeds(getDoc(doc(authDb('alice'),older)));
  if(old.data().redemptionCode!=='LEGACY-CODE-1234')throw Error('Falta compatibilidad');
  await assertFails(getDoc(doc(authDb('bob'),older)));
});

test('No se puede crear un código en un pedido de otra persona como comprador',async()=>{
  const buyer=authDb('alice');
  await assertFails(setDoc(doc(buyer,'users/alice/orders/new-order/privateDelivery/roblox'),{
    code:'RBX-FOO12345',addedAt:serverTimestamp(),addedBy:'alice'
  }));
});

test('Un pedido puede entregar dos códigos de Roblox en una sola operación privada',async()=>{
  const admin=authDb('mvp','nexora.store.sf@gmail.com');
  const pathMulti='users/carl/orders/roblox-multi-test';
  const codes=['RBX-MULTI111','RBX-MULTI222'];
  const hashes=codes.map(fingerprint);
  const batch=writeBatch(admin);
  for(const hash of hashes){
    batch.set(doc(admin,'robloxCodeClaims/'+hash),{
      uid:'carl',orderId:'roblox-multi-test',addedAt:serverTimestamp(),addedBy:'mvp'
    });
  }
  batch.set(doc(admin,pathMulti+'/privateDelivery/roblox'),{
    codes,codeHashes:hashes,addedAt:serverTimestamp(),addedBy:'mvp'
  });
  batch.update(doc(admin,pathMulti),{
    status:'completed',redemptionAddedAt:serverTimestamp(),redemptionAddedBy:'mvp'
  });
  await assertSucceeds(batch.commit());
  const privateOrder=await assertSucceeds(getDoc(doc(authDb('carl'),pathMulti+'/privateDelivery/roblox')));
  if(privateOrder.data().codes.join('|')!==codes.join('|'))throw Error('Faltan códigos del pedido');
  await assertFails(getDoc(doc(authDb('dave'),pathMulti+'/privateDelivery/roblox')));
});

test('No se pueden repetir códigos privados ni reservar una huella ya usada',async()=>{
  const admin=authDb('mvp','nexora.store.sf@gmail.com');
  const pathOther='users/dave/orders/roblox-multi-duplicate';
  const code='RBX-MULTI111',hash=fingerprint(code);
  const batch=writeBatch(admin);
  batch.set(doc(admin,'robloxCodeClaims/'+hash),{
    uid:'dave',orderId:'roblox-multi-duplicate',addedAt:serverTimestamp(),addedBy:'mvp'
  });
  batch.set(doc(admin,pathOther+'/privateDelivery/roblox'),{
    codes:[code],codeHashes:[hash],addedAt:serverTimestamp(),addedBy:'mvp'
  });
  batch.update(doc(admin,pathOther),{
    status:'completed',redemptionAddedAt:serverTimestamp(),redemptionAddedBy:'mvp'
  });
  await assertFails(batch.commit());
  const unchanged=await assertSucceeds(getDoc(doc(authDb('dave'),pathOther)));
  if(unchanged.data().status!=='processing')throw Error('El pedido se completó pese al rechazo');
});
