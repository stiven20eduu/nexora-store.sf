'use strict';
const {test,before,after}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,writeBatch,serverTimestamp}=require('firebase/firestore');

let env;
const path='users/alice/orders/roblox-private-test';
const delivery=path+'/privateDelivery/roblox';
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
  batch.set(doc(admin,delivery),{code:'RBX-ABC12345',addedAt:serverTimestamp(),addedBy:'mvp'});
  batch.update(doc(admin,path),{status:'completed',redemptionAddedAt:serverTimestamp(),redemptionAddedBy:'mvp'});
  await assertSucceeds(batch.commit());

  const mine=await assertSucceeds(getDoc(doc(authDb('alice'),delivery)));
  if(mine.data().code!=='RBX-ABC12345')throw Error('Código incorrecto');
  await assertSucceeds(getDoc(doc(authDb('mvp','nexora.store.sf@gmail.com'),delivery)));
  await assertFails(getDoc(doc(authDb('mvp','nexora.store.sf@gmail.com',false),delivery)));
  await assertFails(getDoc(doc(authDb('bob'),delivery)));
  await assertFails(getDocs(collection(authDb('alice'),path+'/privateDelivery')));
  await assertFails(getDoc(doc(authDb('bob'),path)));
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
