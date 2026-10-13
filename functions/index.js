const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,FieldPath,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {getMessaging}=require('firebase-admin/messaging');
const {onDocumentCreated,onDocumentUpdated}=require('firebase-functions/v2/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {ADMINS,eventKey,orderNotice}=require('./notification-model');
initializeApp();const db=getFirestore();
const options={region:'us-central1',retry:true,maxInstances:4,timeoutSeconds:540};
const BASE='https://stiven20eduu.github.io/nexora-store.sf/';
exports.registerPushDevice=onCall({region:'us-central1',maxInstances:3},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','Inicia sesión.');
 const token=request.data?.token;
 if(typeof token!=='string'||token.length<50||token.length>4096||/\s/.test(token))throw new HttpsError('invalid-argument','Dispositivo no válido.');
 // Un token siempre pertenece a la última cuenta que lo registra.
 await db.collection('pushDevices').doc(eventKey(token)).set({uid:request.auth.uid,token,updatedAt:FieldValue.serverTimestamp()});
 return {ok:true};
});
async function eachUser(run){
 let last=null;
 for(;;){let q=db.collection('users').orderBy(FieldPath.documentId()).limit(200);if(last)q=q.startAfter(last);const page=await q.get();if(page.empty)return;for(const user of page.docs)await run(user.id);last=page.docs.at(-1);}
}
async function adminUids(){
 const users=await Promise.all(ADMINS.map(async email=>{try{return await getAuth().getUserByEmail(email);}catch(e){if(e.code==='auth/user-not-found')return null;throw e;}}));
 return users.filter(u=>u?.emailVerified&&!u.disabled).map(u=>u.uid);
}
async function createOnce(ref,data){try{await ref.create(data);}catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}}
async function queue(uid,id,notice){
 await createOnce(db.collection('notificationDeliveries').doc(eventKey(uid+':'+id)),{uid,eventId:id,...notice,createdAt:FieldValue.serverTimestamp()});
}
exports.notifyNewOrder=onDocumentCreated({...options,document:'users/{uid}/orders/{orderId}'},async event=>{
 const order=event.data.data();const notice=orderNotice(order,event.params.orderId,true);
 for(const uid of await adminUids()){
  await createOnce(db.doc(`users/${uid}/notifications/new-order-${eventKey(event.data.ref.path)}`),{...notice,createdAt:FieldValue.serverTimestamp()});
 }
 // El cliente ya ve el estado desde su pedido, sin duplicar el aviso en su bandeja.
 await queue(event.params.uid,event.id,orderNotice(order,event.params.orderId));
});
exports.notifyOrderStatus=onDocumentUpdated({...options,document:'users/{uid}/orders/{orderId}'},async event=>{
 const before=event.data.before.data(),after=event.data.after.data();
 if(before.status===after.status)return;
 await queue(event.params.uid,event.id,orderNotice(after,event.params.orderId));
});
exports.pushPersonalNotice=onDocumentCreated({...options,document:'users/{uid}/notifications/{id}'},async event=>{
 await queue(event.params.uid,event.id,event.data.data());
});
exports.pushUpdatedAttention=onDocumentUpdated({...options,document:'users/{uid}/notifications/{id}'},async event=>{
 const after=event.data.after.data();if(after.kind==='attention')await queue(event.params.uid,event.id,after);
});
exports.pushAnnouncement=onDocumentCreated({...options,document:'announcements/{id}'},async event=>{
 const data=event.data.data();
 await eachUser(uid=>queue(uid,'announcement:'+event.params.id,{kind:data.kind,title:data.title,body:data.body,url:'index.html'}));
});
exports.deliverNotification=onDocumentCreated({...options,document:'notificationDeliveries/{id}'},async event=>{
 const ref=event.data.ref,notice=event.data.data();
 if((await ref.get()).data()?.sentAt)return;
 // No enviar avisos atrasados después de un día de fallos.
 if(notice.createdAt?.toMillis()<Date.now()-86400000){await ref.update({expiredAt:FieldValue.serverTimestamp()});return;}
 if(notice.kind==='mvp-order'&&!(await adminUids()).includes(notice.uid)){await ref.update({skipped:true});return;}
 const devices=await db.collection('pushDevices').where('uid','==',notice.uid).get();
 for(const device of devices.docs){
  const data=device.data();
  if(data.updatedAt?.toMillis()<Date.now()-90*86400000){await device.ref.delete();continue;}
  // Releer al enviar: una cuenta distinta puede haber reclamado este dispositivo.
  if((await device.ref.get()).data()?.uid!==notice.uid)continue;
  try{
   await getMessaging().send({token:data.token,data:{id:event.params.id,uid:notice.uid,title:'NEXORA STORE',body:notice.kind==='mvp-order'?'Tienes un nuevo pedido por atender.':notice.kind==='attention'?'Un pedido necesita tu atención. Abre NEXORA.':notice.kind==='order'?'El estado de tu pedido cambió. Abre NEXORA.':'Hay un nuevo anuncio de NEXORA.',url:BASE+(notice.kind==='mvp-order'?'admin-pedidos.html':notice.kind==='attention'?'soporte.html?orderId='+encodeURIComponent(notice.orderId||''):notice.kind==='order'?'perfil.html':'index.html')},webpush:{headers:{TTL:'86400',Urgency:'normal'}}});
  }catch(e){
   if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code))await device.ref.delete();
   else throw e;
  }
 }
 await ref.update({sentAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});
});
