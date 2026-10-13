const crypto=require('node:crypto');
const ADMINS=['nexora.store.sf@gmail.com','stiven20eduu@gmail.com'];
const eventKey=value=>crypto.createHash('sha256').update(value).digest('hex');
function orderNotice(order,orderId,admin=false){
 const labels={pending:'Pedido recibido',verified:'Pago confirmado',processing:'Tu pedido está en proceso',completed:'¡Tu pedido está completado!',cancelled:'Pedido cancelado'};
 return {kind:admin?'mvp-order':'order',title:admin?'Nuevo pedido por atender':labels[order.status]||'Pedido actualizado',body:admin?'Hay un pedido nuevo en la bandeja MVP.':`${String(order.product||'Pedido').slice(0,200)} · ${labels[order.status]||'Revisa su estado'}`,orderId,url:admin?'admin-pedidos.html':'perfil.html'};
}
module.exports={ADMINS,eventKey,orderNotice};
