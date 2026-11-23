/* AHEAD offline shell — independent scope at /maea/ahead/ */
const CACHE='ahead-shell-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(key=>key.startsWith('ahead-')&&key!==CACHE).map(key=>caches.delete(key))
 )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return; // Do not cache decorative third-party photography.
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>{
   if(response.ok)caches.open(CACHE).then(cache=>cache.put('./index.html',response.clone()));
   return response;
  }).catch(()=>caches.match('./index.html')));
 } else{
  event.respondWith(fetch(req).then(response=>{
   if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));
   return response;
  }).catch(()=>caches.match(req)));
 }
});
