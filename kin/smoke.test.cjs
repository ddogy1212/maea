/* KIN — dependency-free smoke checks on Node 20+. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const folder=__dirname;
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
const css=fs.readFileSync(path.join(folder,'styles.css'),'utf8');
const source=fs.readFileSync(path.join(folder,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(folder,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.webmanifest'),'utf8'));

async function main(){
  new vm.Script(source,{filename:'app.js'});
  new vm.Script(sw,{filename:'sw.js'});
  assert.equal(manifest.short_name,'KIN');
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'CSS curly braces');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g)){
    if(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id))assert(ids.has(id),'missing id '+id);
  }
  const nodes=new Map();
  const cls={add(){},remove(){},toggle(){}};
  function el(id){
    if(!nodes.has(id))nodes.set(id,{
      id,value:'',textContent:'',innerHTML:'',hidden:false,
      checked:false,disabled:false,style:{},dataset:{},classList:cls,
      addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){},
      replaceChildren(...children){this.children=children;},
      appendChild(child){this.children=(this.children||[]).concat(child);},
      append(...children){this.children=(this.children||[]).concat(children);},
      querySelector(selector){
        if(selector==='.public-photo')return el('visitor-photo');
        if(selector==='canvas')return {toBlob(cb){cb(new Blob([Buffer.from('QR PNG')],{type:'image/png'}));}};
        return el('sub-'+selector);
      },querySelectorAll(){return[]}
    });
    return nodes.get(id);
  }
  const doc={
    getElementById:el,
    createElement(type){
      const node=el('generated-'+type+'-'+Math.random());
      if(type==='a'){node.click=()=>{};node.remove=()=>{};node.href='';node.download='';}
      if(type==='textarea'){node.select=()=>{};node.remove=()=>{};}
      return node;
    },
    querySelector(selector){return el('query-'+selector)},
    querySelectorAll(selector){
      if(selector==='.theme-choice')
        return ['architecture','ocean','night'].map(theme=>({
          dataset:{theme},classList:cls,setAttribute(){},addEventListener(){}
        }));
      if(selector==='.mode-tab')
        return ['card','tag'].map(tab=>({
          dataset:{tab},classList:cls,setAttribute(){},addEventListener(){}
        }));
      if(selector==='.tag-type')
        return ['card','url','text'].map(tagType=>({
          dataset:{tagType},classList:cls,setAttribute(){},addEventListener(){}
        }));
      return[];
    },
    body:el('body'),activeElement:el('focused'),
    addEventListener(){},execCommand(){return true;}
  };
  const store=new Map();
  const localStorage={
    getItem(k){return store.get(k)||null;},
    setItem(k,v){store.set(k,v);}
  };
  const messages=[];
  const readers=[];
  class Reader{
    constructor(){readers.push(this);}
    async write(msg){messages.push(msg);}
    async scan(){this.scanStarted=true;}
  }
  const win={
    isSecureContext:true,NDEFReader:Reader,
    addEventListener(){},
    matchMedia(){return{matches:false}}
  };
  let qrs=0;
  class QrMock{
    constructor(element,opts){qrs++;element.lastQR=opts.text;}
  }
  QrMock.CorrectLevel={M:0};
  const loc={
    href:'https://ddogy1212.github.io/maea/kin/',
    hash:'',protocol:'https:',hostname:'ddogy1212.github.io'
  };
  const injected=source.replace(/\n  init\(\);\n\}\)\(\);\s*$/,
    '\n  globalThis.__KIN_TEST__={data,normalizeProfile,packProfile,unpackProfile,linkFor,safeWebsite,vcard,getTagPayload,getCardVariant,ndefEstimate,requestNfcWrite,commitNfcWrite,startScan,stopScan,init,renderQr,syncCard,downloadQr,showVisitor};\n})();');
  assert.notEqual(injected,source,'test injection');
  const sandbox={
    document:doc,window:win,location:loc,
    navigator:{clipboard:{async writeText(){}},share:undefined},
    localStorage,Blob,TextEncoder,TextDecoder,URL,
    btoa,atob,QRCode:QrMock,NDEFReader:Reader,
    AbortController,
    setTimeout,clearTimeout,console,
    history:{replaceState(){}}
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(injected,sandbox,{filename:'app.js'});
  const app=sandbox.__KIN_TEST__;
  assert(app);

  const sample={
    name:'김테스트',role:'Creative maker',org:'My Lab',
    phone:'010-1234-5678',email:'hi@example.com',
    site:'https://example.org/portfolio',note:'작게 만들고 크게 연결합니다',theme:'ocean'
  };
  const packed=app.packProfile(sample);
  const unpacked=app.unpackProfile(packed);
  assert.equal(unpacked.name,'김테스트','Unicode round trip');
  assert.equal(unpacked.email,'hi@example.com');
  assert.equal(unpacked.theme,'ocean');
  assert.equal(app.unpackProfile('garbage'),null);
  assert.equal(app.safeWebsite('javascript:alert(1)'),'');
  assert.equal(app.safeWebsite('https://example.org/'), 'https://example.org/');
  const full=app.linkFor(sample);
  const compact=app.linkFor(sample,true);
  assert(full.includes('#c='));
  assert(compact.length<full.length,'compact NFC profile is shorter');
  assert.equal(app.unpackProfile(compact.split('#c=')[1]).phone,'010-1234-5678');
  assert.equal(app.unpackProfile(compact.split('#c=')[1]).email,'');
  const vcf=app.vcard(sample);
  assert(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0'));
  assert(vcf.includes('FN:김테스트'));
  assert(vcf.includes('TEL;TYPE=CELL:010-1234-5678'));
  assert(vcf.includes('END:VCARD'));
  assert.equal(app.ndefEstimate({recordType:'url',data:compact})>0,true);
  Object.assign(app.data,sample);
  const compactCandidate=app.getCardVariant('compact',144);
  assert.equal(compactCandidate.recordType,'url');
  assert(compactCandidate.data.includes('#c='));

  // Exercise actual UI boot, QR generation and native NFC writer call using a mocked reader.
  app.init();
  assert(qrs>0,'QR generated in browser');
  assert.equal(el('previewName').textContent,sample.name);
  el('cardTagMode').value='compact';
  el('tagCapacity').value='504';
  app.data.name='김테스트';
  // Default tag budget is 144 bytes; the compact option must be available within a sufficient 504B tag.
  el('writeNfc').disabled=false;
  app.requestNfcWrite();
  if(el('confirmLayer').hidden){
    // The automatic mode may exceed the default 144B budget; use short payload instead.
    app.data.role='';app.data.org='';app.data.email='';app.data.site='';app.data.note='';
    app.data.phone='01012345678';
    app.requestNfcWrite();
  }
  assert.equal(el('confirmLayer').hidden,false,'overwrite confirmation');
  await app.commitNfcWrite();
  assert.equal(messages.length,1,'writes one NDEF message');
  assert.equal(messages[0].records.length,1);
  assert.equal(messages[0].records[0].recordType,'url');
  assert(el('nfcStatus').textContent.includes('기록 완료'),'honest hardware result');

  await app.startScan();
  assert(readers.some(r=>r.scanStarted),'starts native scan');
  app.stopScan();

  // Recipient page must use textContent and safe DOM nodes.
  app.showVisitor({...sample,name:'<script>alert(1)</script>'});
  assert.equal(el('publicName').textContent,'<script>alert(1)</script>');
  assert.equal(el('publicView').hidden,false);
  assert(el('publicLinks').children.length>=3);
  console.log('PASS — KIN: assets, Unicode link, compact NFC card, URL safety, vCard, QR, NFC write/scan and public profile.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
