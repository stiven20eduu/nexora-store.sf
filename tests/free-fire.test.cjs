const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/ff-player/index.ts'),'utf8');
function server(fetch){
 let handler;
 const context=vm.createContext({fetch,Request,Response,URL,AbortController,AbortSignal,console:{log(){}},setTimeout:(fn,ms)=>setTimeout(fn,ms/100),clearTimeout,Deno:{env:{get(){return undefined}},serve(fn){handler=fn}}});
 vm.runInContext(edge,context);
 return uid=>handler(new Request('https://example.test/?uid='+uid));
}
test('validates input before calling providers',async()=>{
 const run=server(()=>{throw Error('must not fetch')});
 assert.equal((await run('bad')).status,400);
});
test('successful fallback survives a failed Garena source and is cached',async()=>{
 let calls=0;
 const run=server(async url=>{calls++;const found=String(url).includes('region=br');return new Response(JSON.stringify(found?{player_nickname:'Test player',player_region:'SAC'}:{error:'provider_down'}),{status:found?200:503,headers:{'content-type':'application/json'}})});
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
const html=fs.readFileSync(path.join(__dirname,'../juego.html'),'utf8');
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

test('Americas provider uses documented br region and returns the player nickname',async()=>{
 const requested=[];
 const ok=server(async url=>{
   requested.push(String(url));
   const isAmericas=String(url).includes('/api/nick?id=12345678&region=br');
   return new Response(JSON.stringify(isAmericas
     ?{player_nickname:'JugadorPrueba',player_region:'SAC'}
     :{error:'provider_down'}),{status:isAmericas?200:503,headers:{'content-type':'application/json'}});
 });
 const response=await ok('12345678');
 assert.equal(response.status,200);
 const player=await response.json();
 assert.equal(player.uid,'12345678');
 assert.equal(player.nickname,'JugadorPrueba');
 assert.equal(player.region,'SAC');
 assert.ok(requested.some(url=>url.includes('region=br')));
 assert.ok(requested.every(url=>!url.includes('region=sac')&&!url.includes('region=us')));
});

test('wrong account ID from an upstream provider is not treated as verified',async()=>{
 const bad=server(async()=>new Response(JSON.stringify({
   result:{basicInfo:{accountId:'99999999',nickname:'OtroJugador'}}
 }),{status:200,headers:{'content-type':'application/json'}}));
 const response=await bad('12345678');
 assert.equal(response.status,503);
 const data=await response.json();
 assert.equal(data.error,'lookup_unavailable');
});

test('provider 402 outage is not interpreted as a nonexistent player',async()=>{
 const run=server(async()=>new Response('{"error":"Invalid UID or server error"}',{status:402}));
 const response=await run('12345678');
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'lookup_unavailable');
});
