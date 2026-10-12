/* Worklog install/cache and safe click-target contract, narrowed to BAG only.
 * Shell versions are immutable cohorts, never stale-while-revalidate modules.
 * Source: worklog-voice-pwa public/sw.js @23d525b.
 */
importScripts('./pwa-assets.js');
const PREFIX='bag-side-01-shell-',BUILD=self.BAG_PWA_BUILD,CACHE=PREFIX+BUILD.version;
const ROOT='/bag-lab/';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  // All assets must pass integrity checks BEFORE a complete cache is published.
  const responses=await Promise.all(BUILD.assets.map(async({path,source,sha256})=>{
    const response=await fetch(new Request(ROOT+(source??path),{cache:'no-store',credentials:'same-origin'}));
    if(!response.ok||response.redirected)throw new Error('Incomplete BAG shell: '+path);
    const bytes=await response.clone().arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==sha256)throw new Error('Mixed BAG shell: '+path);
    if(path==='alpha.html'){
      const headers=new Headers(response.headers);headers.set('content-type','text/html; charset=utf-8');
      headers.delete('content-encoding');headers.delete('content-length');
      return {path,response:new Response(bytes,{status:200,headers})};
    }
    return {path,response};
  }));
  try{const cache=await caches.open(CACHE);for(const {path,response} of responses)await cache.put(ROOT+path,response);}
  catch(error){await caches.delete(CACHE);throw error;}
  // No automatic skipWaiting: old tabs keep the last complete cohort.
})()));
self.addEventListener('message',event=>{if(event.data?.type==='BAG_ACTIVATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Old cohorts remain until no older client can request them. No other cache
  // namespace or inventory database is ever deleted by this worker.
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
  // Do not cache demonstration, future landing or arbitrary paths in BAG scope.
  const path=url.pathname.slice(ROOT.length);
  if(!BUILD.assets.some(asset=>asset.path===path))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(ROOT+path)).then(response=>response||fetch(event.request)));
});
function bagTarget(value){try{const u=new URL(value||ROOT+'alpha.html',self.location.origin);if(u.origin===self.location.origin&&u.pathname===ROOT+'alpha.html')return u.href;}catch{}return new URL(ROOT+'alpha.html',self.location.origin).href;}
self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=bagTarget(event.notification.data?.url);
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
      if(new URL(client.url).pathname!==ROOT+'alpha.html')continue;
      if(client.url!==target)await client.navigate(target);return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
