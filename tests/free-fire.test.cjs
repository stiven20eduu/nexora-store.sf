const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const edge=fs.readFileSync('supabase/functions/ff-player/index.ts','utf8');
function server(fetch){
 let handler;
 const context=vm.createContext({fetch,Request,Response,URL,AbortController,AbortSignal,console:{log(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms/100),clearTimeout,Deno:{serve(fn){handler=fn}}});
 vm.runInContext(edge,context);
 return uid=>handler(new Request('https://example.test/?uid='+uid));
}
test('validates input before calling providers',async()=>{
 const run=server(()=>{throw Error('must not fetch')});
 assert.equal((await run('bad')).status,400);
});
test('successful fallback survives a failed Garena source and is cached',async()=>{
 let calls=0;
 const run=server(async url=>{calls++;return new Response(JSON.stringify(url.includes('glob-info2')?{nickname:'Test player',region:'SAC'}:{error:'invalid_id'}),{status:url.includes('glob-info2')?200:403})});
 const r=await run('12345678');assert.equal(r.status,200);assert.equal((await r.json()).nickname,'Test player');
 await new Promise(r=>setTimeout(r,20));const before=calls;
 assert.equal((await run('12345678')).status,200);assert.equal(calls,before);
});
test('outage and regional invalid_id do not become player_not_found',async()=>{
 const run=server(async()=>new Response('{"error":"invalid_id"}',{status:403}));
 const r=await run('12345678');assert.equal(r.status,503);assert.equal((await r.json()).error,'lookup_unavailable');
});
test('hung upstreams are aborted within the total deadline',async()=>{
 const run=server((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
 const start=Date.now();assert.equal((await run('12345678')).status,503);assert.ok(Date.now()-start<500);
});
const html=fs.readFileSync('juego.html','utf8');
const script=html.slice(html.indexOf('let freeFireLookupController'),html.indexOf('mlPlayerId.addEventListener(',html.indexOf('let freeFireLookupController')));
function ui(fetch){
 const node=()=>({value:'12345678',textContent:'',disabled:false,style:{},classList:{add(){},remove(){}},addEventListener(t,fn){this[t]=fn}});
 const c={fetch,AbortController,setTimeout,clearTimeout,gameKey:'free-fire',playerId:node(),verifyBtn:node(),verifyMessage:node(),verifiedPlayer:{},freeFireVerificationStatus:'idle',updateSummary(){}};
 vm.createContext(c);vm.runInContext(script,c);return c;
}
test('changing ID discards a late successful response',async()=>{
 let resolve;const c=ui(()=>new Promise(r=>resolve=r));const pending=c.verifyBtn.click();
 c.playerId.value='87654321';c.playerId.input();
 resolve(new Response('{"ok":true,"uid":"12345678","nickname":"Old player"}'));
 await pending;assert.equal(c.freeFireVerificationStatus,'idle');assert.equal(c.verifiedPlayer.id,'');assert.equal(c.verifyBtn.disabled,false);
});
test('404 endpoint outage remains retryable',async()=>{
 const c=ui(async()=>new Response('{"message":"not found"}',{status:404}));await c.verifyBtn.click();
 assert.equal(c.freeFireVerificationStatus,'unavailable');assert.equal(c.verifyBtn.textContent,'Reintentar búsqueda');
});
test('mismatched returned UID is never accepted',async()=>{
 const c=ui(async()=>new Response('{"ok":true,"uid":"87654321","nickname":"Wrong"}'));await c.verifyBtn.click();assert.equal(c.freeFireVerificationStatus,'unavailable');
});
test('matching account is shown',async()=>{
 const c=ui(async()=>new Response('{"ok":true,"uid":"12345678","nickname":"Test"}'));await c.verifyBtn.click();assert.equal(c.freeFireVerificationStatus,'valid');assert.equal(c.verifiedPlayer.id,'12345678');
});
