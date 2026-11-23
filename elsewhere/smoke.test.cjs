/* PRESS smoke test — Node 20+, no dependencies or remote services. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));

async function main(){
  new vm.Script(code,{filename:'app.js'});
  new vm.Script(sw,{filename:'sw.js'});
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'CSS braces balanced');
  assert.equal(manifest.name.startsWith('PRESS'),true);
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const references=new Set([...code.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
  for(const id of references)assert(ids.has(id),'missing referenced UI element '+id);

  const nodes=new Map();
  const classList={add(){},remove(){},toggle(){}};
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,hidden:id==='compareBackdrop'||id==='resultsSection',
      textContent:'',innerHTML:'',value:'',style:{},disabled:false,classList,
      addEventListener(){},scrollIntoView(){},focus(){},removeAttribute(){},setAttribute(){},
      contains(){return false}
    });
    return nodes.get(id);
  };
  const context2d={fillStyle:'',imageSmoothingEnabled:false,imageSmoothingQuality:'',
    fillRect(){},drawImage(){}};
  let objectIndex=0,decoded=0;
  const doc={
    getElementById:element,querySelectorAll(){return[];},
    addEventListener(){},body:{appendChild(){}},activeElement:{tagName:'BODY'},
    createElement(tag){
      if(tag==='canvas')return {
        width:1,height:1,getContext(){return context2d;},
        toBlob(callback,mime){
          const length=Math.round(this.width*this.height/7);
          callback(new Blob([Buffer.alloc(length,15)],{type:mime}));
        }
      };
      return {click(){},remove(){},href:'',download:''};
    }
  };
  const windowMock={createImageBitmap:true,matchMedia(){return{matches:true}},addEventListener(){}};
  const urlMock={createObjectURL(){return'blob:press-'+(++objectIndex)},revokeObjectURL(){}};
  const loadBitmap=async()=>{decoded++;return{width:1600,height:1200,close(){}}};
  const instrument=code.replace(/\n  init\(\);\n\}\)\(\);\s*$/,
    '\n  init();globalThis.__TEST__={stored,acceptFiles,makeZip,clearAll,changeSettings,config};\n})();');
  assert.notEqual(instrument,code,'instrumented smoke-test hook');
  const sandbox={
    document:doc,window:windowMock,URL:urlMock,Blob,TextEncoder,DataView,Uint8Array,
    navigator:{},location:{protocol:'file:',hostname:''},setTimeout,clearTimeout,
    createImageBitmap:loadBitmap,
    crypto:{randomUUID:()=>String(Math.random())}
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(instrument,sandbox,{filename:'app.js'});
  const app=sandbox.__TEST__;
  assert(app,'app initialized');

  const one=new Blob([Buffer.alloc(850000,7)],{type:'image/jpeg'});one.name='학교 사진.jpg';
  const two=new Blob([Buffer.alloc(720000,3)],{type:'image/jpeg'});two.name='학교 사진.jpg';
  await app.acceptFiles([one,two]);
  for(let count=0;count<300;count++){
    if(app.stored.every(x=>x.status==='ready'))break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(app.stored.length,2,'accept multiple images');
  assert(app.stored.every(x=>x.status==='ready'),'all images process');
  assert(app.stored.every(x=>x.result.size>0),'nonempty outputs');
  assert(decoded>=2,'decode each source');
  assert(html.includes('전체 ZIP 저장'));
  assert(element('fileList').innerHTML.includes('저장 ↓'),'file results visible');
  const zip=await app.makeZip(app.stored);
  const bytes=Buffer.from(await zip.arrayBuffer());
  const eocd=bytes.length-22;
  assert.equal(bytes.readUInt32LE(0),0x04034b50,'local ZIP header');
  assert.equal(bytes.readUInt32LE(eocd),0x06054b50,'ZIP EOCD');
  assert.equal(bytes.readUInt16LE(eocd+10),2,'two ZIP records');
  const directoryOffset=bytes.readUInt32LE(eocd+16);
  assert.equal(bytes.readUInt32LE(directoryOffset),0x02014b50,'central directory signature');
  const recordSize=46+bytes.readUInt16LE(directoryOffset+28);
  assert.equal(bytes.readUInt32LE(directoryOffset+recordSize),0x02014b50,'second directory record');
  assert.equal(bytes.readUInt16LE(6),0x0800,'UTF-8 filename flag');
  const firstName=bytes.subarray(30,30+bytes.readUInt16LE(26)).toString('utf8');
  assert(firstName.includes('학교 사진-press.jpg'),'Korean filename encoded in UTF-8');
  app.clearAll();
  assert.equal(app.stored.length,0,'clear list');
  assert.equal(element('resultsSection').hidden,true,'hide empty results');
  console.log('PASS: syntax, DOM refs, batch encode, savings UI, ZIP headers, UTF-8 names, cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
