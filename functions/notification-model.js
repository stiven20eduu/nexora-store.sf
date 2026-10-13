const crypto=require('node:crypto');
const ADMINS=['nexora.store.sf@gmail.com','stiven20eduu@gmail.com'];
const eventKey=value=>crypto.createHash('sha256').update(value).digest('hex');
function orderNotice(order,orderId,admin=false){
 const labels={pending:'Pedido recibido',verified:'Pago confirmado',processing:'Tu pedido está en proceso',completed:'¡Tu pedido está completado!',cancelled:'Pedido cancelado'};
 return {kind:admin?'mvp-order':'order',title:admin?'Nuevo pedido por atender':labels[order.status]||'Pedido actualizado',body:admin?'Hay un pedido nuevo en la bandeja MVP.':`${String(order.product||'Pedido').slice(0,200)} · ${labels[order.status]||'Revisa su estado'}`,orderId,url:admin?'admin-pedidos.html':'perfil.html'};
}
function topupNotice(topup,topupId,admin=false){
 const amount=Number.isInteger(topup.amountCents)?'S/ '+(topup.amountCents/100).toFixed(2):'tu saldo';
 const labels={pending:'Recarga recibida',approved:'¡Tu saldo fue acreditado!',rejected:'Recarga no aprobada'};
 return {
  kind:admin?'mvp-topup':'topup',
  title:admin?'Recarga de saldo pendiente':(labels[topup.status]||'Estado de tu recarga'),
  body:admin?'Hay una solicitud de '+amount+' pendiente de revisar. Verifica el pago antes de aprobarla.':topup.status==='approved'?'Se acreditaron '+amount+' a tu saldo NEXORA.':topup.status==='rejected'?'No se aprobó la solicitud de '+amount+'. Revisa el detalle o contacta con soporte.':'Recibimos tu solicitud de '+amount+'.',
  topupId,
  url:admin?'admin-recargas.html':'recargar-saldo.html'
 };
}
module.exports={ADMINS,eventKey,orderNotice,topupNotice};
