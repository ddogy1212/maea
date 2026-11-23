/* ELSEWHERE postcard smoke test — Node 20+, no dependencies. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const directory=__dirname;
const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
const css=fs.readFileSync(path.join(directory,'styles.css'),'utf8');
const js=fs.readFileSync(path.join(directory,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(directory,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.webmanifest'),'utf8'));

async function run(){
  new vm.Script(js,{filename:'app.js'});
  new vm.Script(sw,{filename:'sw.js'});
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'balanced CSS');
  assert.equal(manifest.name.includes('ELSEWHERE'),true);
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const required=new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
  for(const id of required)assert(ids.has(id),'missing DOM element: '+id);

  const nodes=new Map();
  const classList={add(){},remove(){},toggle(){},contains(){return false}};
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,classList,value:'',innerHTML:'',textContent:'',style:{},
      hidden:id==='archiveOverlay'||id==='confirmLayer'||id==='canvasWait',
      disabled:false,
      addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){},
      contains(){return false},removeAttribute(){},click(){}
    });
    return nodes.get(id);
  };

  const counters={paint:0,image:0,download:0,photoBlob:0};
  const ctx={
    font:'',fillStyle:'',imageSmoothingEnabled:false,imageSmoothingQuality:'',
    save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},rotate(){},
    fillRect(x,y,w,h){assert([x,y,w,h].every(Number.isFinite),'finite rectangle');counters.paint++;},
    drawImage(){counters.image++;},
    createLinearGradient(){return{addColorStop(){}};},
    measureText(value){
      return{width:[...String(value)].reduce((sum,c)=>sum+(c.charCodeAt(0)>128?52:28),0)};
    },
    fillText(value,x,y,width){
      assert(Number.isFinite(x)&&Number.isFinite(y),'finite text position');
      if(arguments.length===4)assert(Number.isFinite(width),'finite maxWidth');
      counters.paint++;
    }
  };
  const createCanvas=()=>({
    width:1600,height:1200,getContext(){return ctx;},
    toBlob(cb,type){counters.photoBlob++;cb(new Blob([Buffer.alloc(3000,7)],{type:type||'image/png'}));},
    toDataURL(){return 'data:image/jpeg;base64,'+Buffer.from('preview').toString('base64');}
  });
  const canvas=createCanvas();
  const documentMock={
    getElementById(id){return id==='postcardCanvas'?canvas:element(id);},
    querySelector(){return element('preview-stage');},
    querySelectorAll(){return[];},
    activeElement:element('focus'),body:element('body'),
    fonts:{ready:Promise.resolve()},
    addEventListener(){},
    createElement(tag){
      if(tag==='canvas')return createCanvas();
      if(tag==='a')return{href:'',download:'',click(){counters.download++;},remove(){}};
      return element('created-'+tag);
    }
  };
  documentMock.body.appendChild=()=>{};

  const windowMock={addEventListener(){},matchMedia(){return{matches:false}}};
  const activeUrls=new Set();
  let counter=0;
  const urlMock={
    createObjectURL(){const url='blob:test-'+(++counter);activeUrls.add(url);return url;},
    revokeObjectURL(url){activeUrls.delete(url);}
  };
  class ImageMock {
    constructor(){this.naturalWidth=1600;this.naturalHeight=1200;}
    set src(url){
      this._src=url;
      if(url.startsWith('blob:')){this.naturalWidth=1080;this.naturalHeight=1920;}
      Promise.resolve().then(()=>this.onload?.());
    }
    get src(){return this._src;}
  }
  const storage=new Map();
  const mockDb={
    objectStoreNames:{contains(){return storage.size>=0;}},
    createObjectStore(){},
    transaction(){
      const tx={oncomplete:null,onabort:null,onerror:null,objectStore(){
        return {
          put(data){return request(()=>{storage.set(data.id,data);return data.id;});},
          getAll(){return request(()=>[...storage.values()]);},
          delete(id){return request(()=>storage.delete(id));}
        };
      }};
      function request(fn){
        const req={result:null,onsuccess:null,onerror:null};
        queueMicrotask(()=>{
          try{req.result=fn();req.onsuccess?.();tx.oncomplete?.();}
          catch(e){req.onerror?.();tx.onerror?.();}
        });
        return req;
      }
      return tx;
    }
  };
  const indexedDBMock={open(){
    const request={result:mockDb,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};
    queueMicrotask(()=>request.onsuccess?.());
    return request;
  }};
  const instrumentation=js.replace(/\n  init\(\);\n\}\)\(\);\s*$/,
    '\n  init();globalThis.__TEST__={state,render,readPhoto,changeMood,changeSuggestion,nextStyle,paint,saveArchive,restoreCard,readArchive,archiveCards:()=>archiveCards,requestDelete,deleteCard,download,share};\n})();');
  assert.notEqual(instrumentation,js,'test hook inserted');
  const sandbox={
    document:documentMock,window:windowMock,Image:ImageMock,URL:urlMock,
    navigator:{},location:{protocol:'file:',hostname:''},indexedDB:indexedDBMock,
    Blob,File,crypto:{randomUUID:()=>'id-'+(++counter)},
    setTimeout,clearTimeout,queueMicrotask,console
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(instrumentation,sandbox,{filename:'app.js'});
  const app=sandbox.__TEST__;
  assert(app,'app initialized');

  assert.equal(await app.render(),true,'demo loads');
  assert.equal(canvas.width,1600);
  assert.equal(canvas.height,1200);
  assert(counters.paint>100,'actual graphic composition');
  for(const style of ['editorial','cinema','polaroid']){
    for(const portrait of [false,true]){
      app.paint({
        ...app.state,style,
        title:'아주 오래 기억하고 싶은 특별한 순간이었어',
        note:'오래도록 남겨 두고 싶은 우리의 작은 이야기.'
      },{
        naturalWidth:portrait?1200:1900,
        naturalHeight:portrait?2000:1000
      },canvas);
      assert.equal(canvas.width,portrait?1200:1600);
      assert.equal(canvas.height,portrait?1600:1200);
    }
  }
  app.changeMood('celebrate');
  assert.equal(app.state.mood,'celebrate');
  app.changeSuggestion();assert.equal(app.state.variation,1);
  app.nextStyle();assert.equal(app.state.style,'cinema');

  const upload=new Blob([Buffer.alloc(1200,31)],{type:'image/jpeg'});
  upload.name='나의 여름.jpg';
  await app.readPhoto(upload);
  assert.equal(app.state.source.kind,'upload');
  assert.equal(app.state.source.blob,upload);
  await app.render();
  assert.equal(canvas.width,1200,'portrait upload maps to portrait output');
  await app.saveArchive();
  assert.equal(storage.size,1,'archive stores source photo locally');
  assert.equal(element('archiveCount').textContent,'1');
  const saved=[...storage.values()][0];
  assert(saved.imageBlob instanceof Blob,'persist editable photo');
  assert(saved.preview.startsWith('data:image/jpeg;'),'persist thumbnail');

  await app.restoreCard(saved);
  assert.equal(app.state.archiveId,saved.id);
  assert.equal(app.state.title,saved.title);
  assert.equal(await app.render(),true);
  await app.download();
  await app.share(); // no Web Share API; should download an image instead.
  assert.equal(counters.download,2,'download and share fallback');
  app.requestDelete(saved.id);
  await app.deleteCard();
  assert.equal(storage.size,0,'delete archive entry');

  console.log('PASS: syntax, DOM, 6 postcard layouts, moods, portrait upload, local archive, PNG download and sharing fallback.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
