// NEXORA STORE: la campana y las notificaciones emergentes fueron retiradas.
// Se mantienen las funciones de atención individual para compatibilidad,
// sin montar elementos visuales ni registrar dispositivos push.
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
