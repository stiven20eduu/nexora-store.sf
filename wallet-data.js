import { auth } from "./firebase.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, getDocs, query,
  where, orderBy, limit, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(auth.app);
const ADMIN_EMAILS = new Set(["nexora.store.sf@gmail.com", "stiven20eduu@gmail.com"]);

async function session() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Debes iniciar sesión para continuar.");
  return user;
}
async function adminSession() {
  const user = await session();
  if (!user.emailVerified || !ADMIN_EMAILS.has((user.email || "").toLowerCase())) {
    throw new Error("Acceso reservado a una cuenta administradora con correo verificado.");
  }
  return user;
}
export function formatSoles(cents) {
  return "S/ " + (Number(cents || 0) / 100).toFixed(2);
}
export function parseSoles(input) {
  const value = String(input).trim().replace(",", ".");
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(value)) throw new Error("Escribe un monto válido, por ejemplo 20.00.");
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 100000) {
    throw new Error("La recarga debe ser entre S/ 1 y S/ 1000.");
  }
  return cents;
}
export async function requestYapeTopup({ amount, operation, payer, proofImage }) {
  const user = await session();
  const amountCents = parseSoles(amount);
  const yapeOperation = String(operation || "").replace(/\s/g, "");
  if (!/^\d{6,16}$/.test(yapeOperation)) throw new Error("Ingresa un número de operación de Yape válido (6 a 16 dígitos).");
  const payerName = String(payer || "").trim();
  if (payerName.length > 80) throw new Error("El nombre no puede superar 80 caracteres.");

  // El navegador convertirá PNG/JPG a JPEG reducido antes de enviarlo.
  // El comprobante nunca verifica el pago: el administrador revisa Yape.
  const payload = {
    uid: user.uid, amountCents, yapeOperation, payerName,
    status: "pending", createdAt: serverTimestamp()
  };
  if (proofImage !== undefined && proofImage !== null && proofImage !== "") {
    if (typeof proofImage !== "string" ||
        proofImage.length > 180000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(proofImage)) {
      throw new Error("Comprobante inválido o demasiado grande. Selecciona otra imagen.");
    }
    payload.proofImage = proofImage;
    payload.proofUploadedAt = serverTimestamp();
  }
  const reference = await addDoc(collection(db, "yapeTopups"), payload);
  return reference.id;
}
export async function getMyWallet() {
  const user = await session();
  const ref = doc(db, "users", user.uid, "wallet", "main");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().balanceCents || 0 : 0;
}
export async function getMyTopups() {
  const user = await session();
  const snapshots = await getDocs(query(collection(db, "yapeTopups"), where("uid", "==", user.uid)));
  return snapshots.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 60);
}
export async function getAdminTopups() {
  await adminSession();
  const [pending, recent] = await Promise.all([
    getDocs(query(collection(db, "yapeTopups"), where("status", "==", "pending"))),
    getDocs(query(collection(db, "yapeTopups"), orderBy("createdAt", "desc"), limit(50)))
  ]);
  const merged = new Map();
  [...pending.docs, ...recent.docs].forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
  return [...merged.values()].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
export async function getCustomerLabel(uid) {
  await adminSession();
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().displayName || uid : uid;
}
export async function approveYapeTopup(id) {
  const admin = await adminSession();
  await runTransaction(db, async tx => {
    const ref = doc(db, "yapeTopups", id);
    const requestSnap = await tx.get(ref);
    if (!requestSnap.exists()) throw new Error("No encontramos la solicitud.");
    const topup = requestSnap.data();
    if (topup.status !== "pending") throw new Error("Esta recarga ya fue revisada.");
    if (!/^\d{6,16}$/.test(topup.yapeOperation) || !Number.isSafeInteger(topup.amountCents) || topup.amountCents < 100) {
      throw new Error("Datos de recarga inválidos.");
    }
    const usedRef = doc(db, "yapeOperations", topup.yapeOperation);
    const walletRef = doc(db, "users", topup.uid, "wallet", "main");
    const usedSnap = await tx.get(usedRef);
    if (usedSnap.exists()) throw new Error("Este número de operación ya se usó para otra recarga. No lo apruebes.");
    const walletSnap = await tx.get(walletRef);
    const balance = walletSnap.exists() ? walletSnap.data().balanceCents : 0;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("El saldo existente no es válido.");
    const nextBalance = balance + topup.amountCents;
    if (!Number.isSafeInteger(nextBalance) || nextBalance > 100000000) throw new Error("Límite de saldo excedido.");
    tx.set(usedRef, {
      topupId: id, uid: topup.uid, amountCents: topup.amountCents, usedAt: serverTimestamp()
    });
    tx.set(walletRef, { balanceCents: nextBalance, updatedAt: serverTimestamp() });
    tx.update(ref, {
      status: "approved", processedBy: admin.uid, processedAt: serverTimestamp()
    });
  });
}
export async function rejectYapeTopup(id) {
  const admin = await adminSession();
  await runTransaction(db, async tx => {
    const ref = doc(db, "yapeTopups", id);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== "pending") throw new Error("La solicitud ya no está pendiente.");
    tx.update(ref, { status: "rejected", processedBy: admin.uid, processedAt: serverTimestamp() });
  });
}

/**
 * Paga un pedido con saldo acreditado. El precio se obtiene de Firestore,
 * nunca del navegador, y la billetera y el pedido se modifican en una
 * transacción atómica. Reintentar el mismo historyId no descuenta otra vez.
 */
export async function buyWithNexoraBalance(order) {
  const user = await session();
  const gameKey = String(order?.gameKey || "");
  if (gameKey === "roblox") {
    throw new Error("Por ahora no hay Robux (mantenimiento). Las compras de Roblox están suspendidas.");
  }
  const game = String(order?.game || "");
  const product = String(order?.product || "");
  const historyId = String(order?.historyId || "");
  if (!/^[a-z0-9-]{2,80}$/.test(gameKey) ||
      !game || game.length > 100 || !product || product.length > 200 ||
      !/^[A-Za-z0-9-]{1,80}$/.test(historyId)) {
    throw new Error("El pedido no tiene los datos necesarios. Selecciona el producto nuevamente.");
  }
  const expected = Math.round(Number(order.price) * 100);
  if (!Number.isSafeInteger(expected) || expected < 100) {
    throw new Error("El precio del pedido no es válido.");
  }
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const catalogId = encodeURIComponent(gameKey + "::" + product);
  if (catalogId.length > 400) throw new Error("Producto no válido.");
  const itemRef = doc(db, "catalogPrices", catalogId);
  const walletRef = doc(db, "users", user.uid, "wallet", "main");
  const orderRef = doc(db, "users", user.uid, "orders", historyId);
  const result = await runTransaction(db, async tx => {
    // Las lecturas ocurren antes de todas las escrituras.
    const [existing, itemSnap, walletSnap] = await Promise.all([
      tx.get(orderRef), tx.get(itemRef), tx.get(walletRef)
    ]);
    if (existing.exists()) {
      if (existing.data().paymentMethod === "wallet") {
        return { orderId: historyId, alreadyPaid: true,
          balanceCents: walletSnap.exists() ? walletSnap.data().balanceCents : 0 };
      }
      throw new Error("Este pedido ya fue registrado con otro método de pago.");
    }
    if (!itemSnap.exists() || !itemSnap.data().enabled) {
      throw new Error("El pago con saldo no está disponible para este producto.");
    }
    const item = itemSnap.data();
    if (item.game !== game || item.product !== product ||
        !Number.isSafeInteger(item.priceCents) || item.priceCents !== expected) {
      throw new Error("El precio oficial cambió. Regresa al catálogo y elige el producto de nuevo.");
    }
    if (!walletSnap.exists()) {
      throw new Error("No tienes saldo confirmado. Recarga con Yape primero.");
    }
    const balance = walletSnap.data().balanceCents;
    if (!Number.isSafeInteger(balance) || balance < item.priceCents) {
      throw new Error("Saldo insuficiente. Puedes recargar tu cuenta con Yape.");
    }
    const remaining = balance - item.priceCents;
    tx.set(orderRef, {
      game:item.game, product:item.product, price:item.priceCents/100,
      priceCents:item.priceCents, currency:"PEN",
      status:"verified", paymentMethod:"wallet", catalogId,
      playerId:clean(order.playerId,100),serverId:clean(order.serverId,100),
      playerName:clean(order.playerName,120),playerRegion:clean(order.playerRegion,100),
      createdAt:serverTimestamp()
    });
    tx.update(walletRef, {
      balanceCents:remaining, updatedAt:serverTimestamp(), lastPurchaseId:historyId
    });
    return { orderId: historyId, alreadyPaid:false, balanceCents:remaining };
  });
  return result;
}
