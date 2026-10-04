import { auth } from "./firebase.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const db = getFirestore(auth.app);
async function current() {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Inicia sesión para guardar datos en tu cuenta.");
  return auth.currentUser;
}
export async function loadAccount() {
  const user = await current();
  const [photo, orders] = await Promise.all([
    getDoc(doc(db, "users", user.uid, "profile", "main")),
    getDocs(query(collection(db, "users", user.uid, "orders"), orderBy("createdAt", "desc"), limit(100)))
  ]);
  return { uid: user.uid, photo: photo.data()?.photo || "", orders: orders.docs.map(d => ({ id: d.id, ...d.data() })) };
}
export async function savePhoto(photo) {
  if (typeof photo !== "string" || photo.length > 60000 || (photo && !/^data:image\/jpeg;base64,/.test(photo))) throw new Error("Imagen no válida.");
  const user = await current();
  await setDoc(doc(db, "users", user.uid, "profile", "main"), { photo, updatedAt: serverTimestamp() });
  return user.uid;
}
export async function recordOrder(order) {
  const user = await current();
  if (!order.historyId || !/^[a-zA-Z0-9-]{1,80}$/.test(order.historyId)) throw new Error("Pedido no válido.");
  const price = Number(order.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Importe no válido.");
  const ref = doc(db, "users", user.uid, "orders", order.historyId);
  if ((await getDoc(ref)).exists()) return;
  await setDoc(ref, {
    game: String(order.game || "").slice(0,100),
    product: String(order.product || "").slice(0,200),
    price, currency: "PEN", status: "pending",
    createdAt: serverTimestamp()
  });
}
