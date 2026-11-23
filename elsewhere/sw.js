/* PRESS image workshop — standalone service worker scoped to /elsewhere/ */
const SHELL_CACHE='press-shell-2026-11-v1';
const IMAGE_CACHE='press-demo-photo-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>(key.startsWith('press-')||key.startsWith('elsewhere-'))&&![SHELL_CACHE,IMAGE_CACHE].includes(key))
      .map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    if(req.mode==='navigate'){
      event.respondWith(fetch(req).then(response=>{
        if(response.ok) caches.open(SHELL_CACHE).then(cache=>cache.put('./index.html',response.clone()));
        return response;
      }).catch(()=>caches.match('./index.html')));
    }else{
      event.respondWith(fetch(req).then(response=>{
        if(response.ok) caches.open(SHELL_CACHE).then(cache=>cache.put(req,response.clone()));
        return response;
      }).catch(()=>caches.match(req)));
    }
  }else if(url.hostname==='images.unsplash.com'){
    event.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      const response=await fetch(req);
      if(response.ok||response.type==='opaque')await cache.put(req,response.clone());
      return response;
    }));
  }
});
