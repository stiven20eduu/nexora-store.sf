/* La cabecera de juegos usa la misma sesión y saldo que Inicio. */
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const loginLink=document.querySelector('body[data-nexora-page="game"] .nav-actions .login');
const registerLink=document.querySelector('body[data-nexora-page="game"] .nav-actions .register');
const walletChip=document.getElementById("walletChip");
const walletChipAmount=document.getElementById("walletChipAmount");
let walletRequest=0;

async function refreshHeaderWallet(user,request){
 try{
  const {getMyWallet,formatSoles}=await import("./wallet-data.js");
  const cents=await getMyWallet();
  if(request!==walletRequest || auth.currentUser?.uid!==user.uid)return;
  if(!Number.isSafeInteger(cents)||cents<0)throw new Error("Saldo inválido");
  walletChipAmount.textContent=formatSoles(cents);
 }catch(error){
  if(request!==walletRequest||auth.currentUser?.uid!==user.uid)return;
  console.error("No se pudo consultar el saldo NEXORA",error);
  walletChipAmount.textContent="No disponible";
 }
}

onAuthStateChanged(auth,user=>{
 const request=++walletRequest;
 if(user){
  loginLink.textContent="Mi perfil";
  loginLink.href="perfil.html";
  loginLink.title=user.displayName||"Mi cuenta";
  loginLink.hidden=false;
  registerLink.hidden=true;
  walletChip.hidden=false;
  walletChipAmount.textContent="Cargando…";
  refreshHeaderWallet(user,request);
 }else{
  loginLink.textContent="Ingresar";
  loginLink.href="login.html";
  loginLink.removeAttribute("title");
  loginLink.hidden=false;
  registerLink.hidden=false;
  walletChip.hidden=true;
  walletChipAmount.textContent="";
 }
});
