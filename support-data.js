/* NEXORA — bandeja de soporte. Reportes privados asociados a Firebase Auth. */
import { auth } from "./firebase.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  writeBatch, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(auth.app);
const MVP_EMAILS = new Set(["nexora.store.sf@gmail.com", "stiven20eduu@gmail.com"]);
const MAX_IMAGE_LENGTH = 155000;
const MAX_IMAGES = 3;
export const SUPPORT_CATEGORIES = Object.freeze({
  pedido:"Problema con un pedido", saldo:"Saldo o recarga", cuenta:"Mi cuenta",
  producto:"Producto o código", otro:"Otra consulta"
});
export const SUPPORT_STATUSES = Object.freeze({
  open:"Recibido", reviewing:"En revisión", resolved:"Resuelto"
});
async function currentUser() {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Inicia sesión para enviar una solicitud.");
  return auth.currentUser;
}
async function requireMvp() {
  const user = await currentUser();
  if (!user.emailVerified || !MVP_EMAILS.has((user.email || "").toLowerCase())) {
    throw new Error("Esta cuenta no tiene acceso MVP verificado.");
  }
  return user;
}
const trim = (v, max) => String(v || "").trim().slice(0, max + 1);

export async function compressEvidence(file) {
  if (!file || !["image/jpeg","image/png","image/webp"].includes(file.type))
    throw new Error("Las evidencias deben ser imágenes JPG, PNG o WebP.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Cada imagen debe pesar menos de 8 MB antes de comprimir.");
  const url = URL.createObjectURL(file);
  let bitmap;
  try {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo abrir una de las imágenes."));
      img.src = url;
    });
    if (!bitmap.naturalWidth || !bitmap.naturalHeight) throw new Error("Imagen inválida.");
    if (bitmap.naturalWidth * bitmap.naturalHeight > 32000000) throw new Error("Imagen demasiado grande.");
    let scale = Math.min(1, 1260 / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {alpha:false});
    if (!ctx) throw new Error("Tu navegador no puede procesar la imagen.");
    let result="";
    for (let attempt=0; attempt<6; attempt++) {
      canvas.width=Math.max(1,Math.round(bitmap.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(bitmap.naturalHeight*scale));
      ctx.fillStyle="#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [0.78,0.61,0.46,0.32]) {
        result=canvas.toDataURL("image/jpeg", quality);
        if (result.length <= MAX_IMAGE_LENGTH) return result;
      }
      scale*=0.76;
    }
    throw new Error("No se pudo reducir una de las imágenes. Prueba con otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sendSupportTicket({category,subject,description,orderId,images=[]}) {
  const user=await currentUser();
  const safeCategory=String(category || "");
  const title=trim(subject,100);
  const body=trim(description,2000);
  const order=trim(orderId,80);
  if (!Object.hasOwn(SUPPORT_CATEGORIES,safeCategory)) throw new Error("Elige el motivo de tu consulta.");
  if (title.length<5||title.length>100) throw new Error("El asunto debe tener entre 5 y 100 caracteres.");
  if (body.length<20||body.length>2000) throw new Error("Describe lo ocurrido con al menos 20 caracteres.");
  if (order.length>80) throw new Error("El número de pedido es demasiado largo.");
  if (!Array.isArray(images)||images.length>MAX_IMAGES) throw new Error("Puedes adjuntar hasta 3 imágenes.");
  if (images.some(x=>typeof x!=="string"||x.length>MAX_IMAGE_LENGTH||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x)))
    throw new Error("Una evidencia no es válida.");
  const ref=doc(collection(db,"supportTickets"));
  const batch=writeBatch(db);
  batch.set(ref,{
    uid:user.uid, category:safeCategory, subject:title,
    description:body, orderId:order, imageCount:images.length,
    status:"open", createdAt:serverTimestamp()
  });
  images.forEach((image,index)=>{
    batch.set(doc(db,"supportTickets",ref.id,"images",String(index)),{
      uid:user.uid,image,createdAt:serverTimestamp()
    });
  });
  await batch.commit();
  return ref.id;
}

function normalize(snap){return {id:snap.id,...snap.data()};}
export async function getMySupportTickets() {
  const user=await currentUser();
  const result=await getDocs(query(collection(db,"supportTickets"),where("uid","==",user.uid)));
  return result.docs.map(normalize).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,30);
}
export async function getMvpSupportTickets(){
  await requireMvp();
  const result=await getDocs(query(collection(db,"supportTickets"),orderBy("createdAt","desc"),limit(100)));
  return result.docs.map(normalize);
}
export async function getSupportImages(ticket) {
  const user=await currentUser();
  if(!ticket?.id || !/^[A-Za-z0-9_-]{8,80}$/.test(ticket.id)) throw new Error("Caso inválido.");
  const admin=user.emailVerified&&MVP_EMAILS.has((user.email||"").toLowerCase());
  if (!admin&&ticket.uid!==user.uid) throw new Error("Acceso denegado.");
  const result=await getDocs(collection(db,"supportTickets",ticket.id,"images"));
  return result.docs.map(normalize).filter(item=>
    typeof item.image==="string"&&item.image.length<=MAX_IMAGE_LENGTH&&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(item.image)
  ).sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,MAX_IMAGES);
}
export async function respondSupportTicket(ticketId, status, reply) {
  const user=await requireMvp();
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(ticketId)) throw new Error("Caso inválido.");
  if(!Object.hasOwn(SUPPORT_STATUSES,status)) throw new Error("Estado no válido.");
  const message=trim(reply,1000);
  if(message.length>1000) throw new Error("La respuesta excede 1000 caracteres.");
  if(status==="resolved"&&message.length<5) throw new Error("Escribe una respuesta antes de marcar como resuelto.");
  const ref=doc(db,"supportTickets",ticketId);
  await updateDoc(ref,{
    status,adminReply:message,reviewedBy:user.uid,updatedAt:serverTimestamp()
  });
}
