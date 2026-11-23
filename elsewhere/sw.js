/* ELSEWHERE v3 — independent scope, simple offline shell */
const CACHE='elsewhere-studio-v3';
const SCENES='elsewhere-photo-v3';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>
    (key.startsWith('elsewhere-')||key.startsWith('press-'))&&![CACHE,SCENES].includes(key)
  ).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    if(req.mode==='navigate'){
      event.respondWith(fetch(req).then(response=>{
        if(response.ok)caches.open(CACHE).then(c=>c.put('./index.html',response.clone()));
        return response;
      }).catch(()=>caches.match('./index.html')));
    } else{
      event.respondWith(fetch(req).then(response=>{
        if(response.ok)caches.open(CACHE).then(c=>c.put(req,response.clone()));
        return response;
      }).catch(()=>caches.match(req)));
    }
  }else if(url.hostname==='images.unsplash.com'){
    event.respondWith(caches.open(SCENES).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      const response=await fetch(req);
      if(response.ok||response.type==='opaque'){
        await cache.put(req,response.clone());
        const keys=await cache.keys();
        if(keys.length>12)await cache.delete(keys[0]);
      }
      return response;
    }));
  }
});
