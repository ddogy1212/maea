/* ELSEWHERE — independent scope /maea/elsewhere/ */
const VERSION='elsewhere-v1.0.0';
const SCENES='elsewhere-scenes-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k.startsWith('elsewhere-')&&![VERSION,SCENES].includes(k)).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(u.origin===self.location.origin){
    if(req.mode==='navigate')event.respondWith(fetch(req).then(response=>{
      const copy=response.clone();
      caches.open(VERSION).then(c=>c.put('./index.html',copy));
      return response;
    }).catch(()=>caches.match('./index.html')));
    else event.respondWith(fetch(req).then(response=>{
      if(response.ok)caches.open(VERSION).then(c=>c.put(req,response.clone()));
      return response;
    }).catch(()=>caches.match(req)));
  }else if(u.hostname==='images.unsplash.com'){
    event.respondWith(caches.open(SCENES).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      const response=await fetch(req);
      if(response.ok||response.type==='opaque'){
        await cache.put(req,response.clone());
        const keys=await cache.keys();
        if(keys.length>32)await cache.delete(keys[0]);
      }
      return response;
    }));
  }
});
