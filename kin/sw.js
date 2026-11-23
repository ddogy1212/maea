/* KIN — installable independent app; cache app shell without handling personal contacts. */
const VERSION='kin-shell-v1';
const FONTS='kin-fonts-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('kin-')&&![VERSION,FONTS].includes(key)).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    if(req.mode==='navigate'){
      event.respondWith(fetch(req).then(response=>{
        // Only cache the unpersonalized app shell; profile hash is never in HTTP requests.
        if(response.ok)caches.open(VERSION).then(cache=>cache.put('./index.html',response.clone()));
        return response;
      }).catch(()=>caches.match('./index.html')));
    }else{
      event.respondWith(fetch(req).then(response=>{
        if(response.ok)caches.open(VERSION).then(cache=>cache.put(req,response.clone()));
        return response;
      }).catch(()=>caches.match(req)));
    }
  }else if(url.hostname==='cdnjs.cloudflare.com'&&url.pathname.includes('/qrcodejs/')){
    event.respondWith(caches.open(FONTS).then(async cache=>{
      const saved=await cache.match(req);
      if(saved)return saved;
      const response=await fetch(req);
      if(response.ok||response.type==='opaque')await cache.put(req,response.clone());
      return response;
    }));
  }
});
