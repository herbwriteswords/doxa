const V='doxa-v1-2';
const F=['./','index.html','styles.css','app.js','collab.js','config.js','data/rhymes.js','data/synonyms.js','data/worship.js','manifest.webmanifest','icons/mark.svg','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
function stash(req,res){if(!res||(res.status!==200&&res.type!=='opaque'))return res;const copy=res.clone();caches.open(V).then(c=>c.put(req,copy)).catch(()=>{});return res}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  const config=url.origin===location.origin&&/(^|\/)config\.js$/.test(url.pathname);
  const firebase=url.hostname==='www.gstatic.com'&&url.pathname.indexOf('/firebasejs/')!==-1;
  if(config||firebase){e.respondWith(fetch(e.request).then(r=>stash(e.request,r)).catch(()=>caches.match(e.request)));return}
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
