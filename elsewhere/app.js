/* PRESS. / Fast, local image compression and batch conversion. No backend. */
(() => {
  'use strict';

  const MAX_COUNT = 30;
  const MAX_BYTES = 35 * 1024 * 1024;
  const MAX_PIXELS = 65_000_000;
  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const encode = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supported = new Set(['image/jpeg','image/png','image/webp']);
  const stored = [];
  const config = {format:'auto', size:2560, quality:82};
  let epoch = 0;
  let processing = false;
  let runDelay;
  let toastTimer;
  let compareItemId = null;
  let priorFocus = null;
  const makeId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const sizeText = bytes => {
    if (bytes === null || !Number.isFinite(bytes)) return '—';
    const units = ['B','KB','MB','GB'];
    let num = Math.max(0, bytes);
    let index = 0;
    while (num >= 1024 && index < units.length - 1) {num /= 1024;index++;}
    return (index === 0 ? Math.round(num) : num.toFixed(num >= 100 ? 0 : 1)) + ' ' + units[index];
  };
  const percent = (before, after) => Math.round((1 - after / Math.max(before,1)) * 100);
  const ext = mime => mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const sanitized = name => String(name).replace(/[/\\:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,160) || 'image';
  const outputName = (name,mime) => {
    const basename=sanitized(name).replace(/\.(jpe?g|png|webp)$/i,'') || 'image';
    return basename + '-press.' + ext(mime);
  };

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3300);
  }

  function syncSettings() {
    $('formatSelect').value = config.format;
    $('sizeSelect').value = String(config.size);
    $('qualityRange').value = String(config.quality);
    $('qualityText').textContent = config.quality + '%';
  }

  function render() {
    const section = $('resultsSection');
    if (!stored.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const ready = stored.filter(item => item.status === 'ready');
    const errors = stored.filter(item => item.status === 'error');
    const busy = stored.filter(item => item.status === 'queued' || item.status === 'processing');
    const originalTotal = ready.reduce((n,item)=>n+item.file.size,0);
    const afterTotal = ready.reduce((n,item)=>n+item.result.size,0);
    $('savedPercent').textContent = ready.length ? (percent(originalTotal,afterTotal) >= 0 ? '−' : '+') + Math.abs(percent(originalTotal,afterTotal)) + '%' : '—';
    $('totalBefore').textContent = ready.length ? sizeText(originalTotal) : '—';
    $('totalAfter').textContent = ready.length ? sizeText(afterTotal) : '—';
    $('savedPercent').style.color = ready.length && afterTotal > originalTotal ? '#ab7254' : '#476d52';
    $('listCount').textContent = 'FILES / ' + stored.length;
    $('progressText').textContent = busy.length
      ? '변환 중 · ' + ready.length + '/' + stored.length
      : errors.length ? ready.length + '장 완료 · ' + errors.length + '장 확인 필요'
      : '모두 준비됐어요 · ' + ready.length + '장';
    $('downloadAll').disabled = busy.length > 0 || !ready.length;
    const html = stored.map(item => {
      const dimensions = item.width && item.height ? item.width + ' × ' + item.height + 'px' : '이미지 확인 중';
      const result = item.result;
      const saving = result ? percent(item.file.size,result.size) : 0;
      const status = item.status;
      const thumb = item.originalUrl || '';
      return `<article class="file-row ${status==='processing'||status==='queued'?'busy':''} ${status==='error'?'failed':''}" data-id="${encode(item.id)}">
        <img class="file-thumb" src="${encode(thumb)}" alt="" loading="lazy">
        <div class="file-name-col"><strong title="${encode(item.file.name)}">${encode(item.file.name)}</strong><span>${encode(dimensions)}</span></div>
        <div class="file-sizes"><del>${sizeText(item.file.size)}</del><strong>${status==='ready' ? sizeText(result.size) : '—'}</strong></div>
        <div class="file-saving">
          ${status==='ready'
            ? `<span class="${saving<0?'worse':''}">${item.keptOriginal ? '원본 유지' : saving>=0 ? '−'+saving+'%' : '+'+Math.abs(saving)+'%'} </span>
               <button type="button" data-compare="${encode(item.id)}" aria-label="${encode(item.file.name)} 변환 전후 비교">비교 ↗</button>`
            : status==='error'
              ? `<span class="worse">처리 실패</span><span class="file-error" title="${encode(item.error||'')}">${encode(item.error||'사진을 열 수 없어요.')}</span>`
              : '<span>압축하는 중...</span>'}
        </div>
        <div class="file-actions">
          <button class="file-download" type="button" data-download="${encode(item.id)}" ${status==='ready'?'':'disabled'}>저장 ↓</button>
          <button class="file-remove" type="button" data-remove="${encode(item.id)}" title="이 사진 제거" aria-label="${encode(item.file.name)} 제거">×</button>
        </div>
      </article>`;
    }).join('');
    $('fileList').innerHTML = html;
  }

  function cleanupResult(item) {
    if(item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    item.outputUrl = null;
    item.result = null;
    item.keptOriginal = false;
  }
  function clearItem(item) {
    cleanupResult(item);
    if(item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    item.originalUrl=null;
  }

  async function acceptFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const available = Math.max(0,MAX_COUNT-stored.length);
    const selected = files.slice(0,available);
    let ignored = files.length-selected.length;
    let unsupported = 0;
    let oversized = 0;
    const added = [];
    for (const file of selected) {
      if (!supported.has(file.type)) {unsupported++;continue;}
      if (file.size > MAX_BYTES) {oversized++;continue;}
      if (!file.size) {unsupported++;continue;}
      const originalUrl = URL.createObjectURL(file);
      const item = {id:makeId(), file, originalUrl, outputUrl:null, result:null, status:'queued',width:null,height:null,error:'',keptOriginal:false};
      stored.push(item);
      added.push(item);
    }
    if (ignored) toast('최대 30장까지 처리할 수 있어요. ' + ignored + '장은 제외했어요.');
    else if (oversized) toast('35MB를 넘는 ' + oversized + '장은 제외했어요.');
    else if (unsupported) toast('JPG·PNG·WEBP 파일만 지원해요. ' + unsupported + '장은 제외했어요.');
    if(!added.length) return;
    render();
    const section = $('resultsSection');
    section.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    void runQueue();
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file,{imageOrientation:'from-image'});
        return {image:bitmap,width:bitmap.width,height:bitmap.height,dispose:()=>bitmap.close()};
      } catch { /* fallback below */ }
    }
    const url=URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding='async';
      await new Promise((resolve,reject)=>{
        image.onload=resolve;
        image.onerror=()=>reject(new Error('파일을 이미지로 읽을 수 없어요.'));
        image.src=url;
      });
      return {image,width:image.naturalWidth,height:image.naturalHeight,dispose:()=>{}};
    } finally { URL.revokeObjectURL(url); }
  }

  function chooseMime(file) {
    if (config.format === 'jpeg') return 'image/jpeg';
    if (config.format === 'png') return 'image/png';
    if (config.format === 'webp') return 'image/webp';
    return file.type === 'image/png' ? 'image/webp' : file.type;
  }

  function canvasBlob(canvas,type,quality) {
    return new Promise((resolve,reject)=>{
      try {canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('브라우저에서 이미지 변환에 실패했어요.')),type,quality);}
      catch {reject(new Error('이미지를 저장할 수 없어요.'));}
    });
  }

  async function convert(item,options) {
    let decoded;
    try {
      decoded = await decodeImage(item.file);
      const {image,width,height} = decoded;
      if(!width || !height) throw new Error('사진 크기를 확인할 수 없어요.');
      if(width*height>MAX_PIXELS) throw new Error('사진이 너무 커요. 65MP 이하만 지원해요.');
      const scale = options.size>0 ? Math.min(1,options.size/Math.max(width,height)) : 1;
      const w = Math.max(1,Math.round(width*scale));
      const h = Math.max(1,Math.round(height*scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d',{alpha:true});
      if(!context) throw new Error('이미지를 편집할 수 없는 브라우저예요.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const requested = options.format==='auto'
        ? item.file.type==='image/png'?'image/webp':item.file.type
        : options.format==='jpeg'?'image/jpeg'
          : options.format==='png'?'image/png':'image/webp';
      if(requested==='image/jpeg') {
        context.fillStyle='#ffffff';
        context.fillRect(0,0,w,h);
      }
      context.drawImage(image,0,0,w,h);
      const blob = await canvasBlob(canvas,requested,options.quality/100);
      // A browser may silently replace an unsupported encoder with PNG.
      const actualMime = supported.has(blob.type) ? blob.type : 'image/png';
      const dimensionsUnchanged = w===width && h===height;
      const sameType = actualMime===item.file.type;
      const keepOriginal = options.format==='auto' && dimensionsUnchanged && sameType && blob.size>=item.file.size;
      return {blob:keepOriginal?item.file:blob,outputType:keepOriginal?item.file.type:actualMime,width,height,w,h,keptOriginal:keepOriginal};
    } finally {
      if(decoded?.dispose)decoded.dispose();
    }
  }

  async function runQueue() {
    if(processing) return;
    processing=true;
    try {
      while(true) {
        const job=stored.find(item=>item.status==='queued');
        if(!job) break;
        const token=epoch;
        const options={...config};
        job.status='processing';
        render();
        let conversion=null;
        try {
          conversion = await convert(job,options);
          if(!stored.includes(job)) continue;
          if(token!==epoch) {job.status='queued';continue;}
          cleanupResult(job);
          job.width=conversion.width;
          job.height=conversion.height;
          job.result=conversion.blob;
          job.outputUrl=URL.createObjectURL(conversion.blob);
          job.outputType=conversion.outputType;
          job.outputWidth=conversion.w;
          job.outputHeight=conversion.h;
          job.keptOriginal=conversion.keptOriginal;
          job.status='ready';
          job.error='';
        } catch(error) {
          if(!stored.includes(job)) continue;
          if(token!==epoch) {job.status='queued';continue;}
          job.status='error';
          job.error=String(error?.message||'변환할 수 없는 파일이에요.').slice(0,90);
        }
        render();
      }
    } finally {
      processing=false;
      render();
      if(stored.some(item=>item.status==='queued')) setTimeout(runQueue,0);
    }
  }

  function changeSettings() {
    epoch++;
    clearTimeout(runDelay);
    for(const item of stored) {
      cleanupResult(item);
      item.status='queued';
      item.error='';
    }
    render();
    runDelay=setTimeout(()=>void runQueue(),220);
  }

  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
  }
  function singleDownload(item) {
    if(!item?.result)return;
    downloadBlob(item.result,outputName(item.file.name,item.outputType));
    toast('사진을 저장했어요.');
  }

  // ZIP: store already-compressed images without recompressing them. RFC 1952-style CRC-32,
  // standard ZIP local file headers, central directory, and EOCD. UTF-8 filename flag set.
  const crcTable = Array.from({length:256},(_,index)=>{
    let x=index;
    for(let b=0;b<8;b++) x=(x&1)?(0xEDB88320^(x>>>1)):(x>>>1);
    return x>>>0;
  });
  function crc32(bytes) {
    let crc=0xFFFFFFFF;
    for(const b of bytes) crc=crcTable[(crc^b)&255]^(crc>>>8);
    return (crc^0xFFFFFFFF)>>>0;
  }
  function dosStamp(date=new Date()) {
    const year=Math.max(1980,Math.min(2107,date.getFullYear()));
    return {date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(),
      time:(date.getHours()<<11)|(date.getMinutes()<<5)|(Math.floor(date.getSeconds()/2))};
  }
  function makeHeader(size,writer) {
    const bytes=new Uint8Array(size);
    const view=new DataView(bytes.buffer);
    writer(view,bytes);
    return bytes;
  }
  async function makeZip(rows) {
    if(rows.length>0xFFFF) throw new Error('ZIP 파일 수 제한을 초과했어요.');
    const encoder=new TextEncoder();
    const parts=[];
    const directory=[];
    const usedNames=new Set();
    let offset=0, directorySize=0;
    const stamp=dosStamp();
    for(const item of rows) {
      const base=outputName(item.file.name,item.outputType);
      let filename=base,index=2;
      while(usedNames.has(filename.toLowerCase())) {
        filename=base.replace(/(\.[^.]+)$/,' ('+(index++)+')$1');
      }
      usedNames.add(filename.toLowerCase());
      const name=encoder.encode(filename);
      const bytes=new Uint8Array(await item.result.arrayBuffer());
      const size=bytes.byteLength;
      const crc=crc32(bytes);
      if(offset+size>=0xFFFFFFFF) throw new Error('ZIP 용량이 너무 커요. 사진을 나눠서 저장해 주세요.');
      const local=makeHeader(30+name.length,(v,buffer)=>{
        v.setUint32(0,0x04034b50,true);
        v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);
        v.setUint16(10,stamp.time,true);v.setUint16(12,stamp.date,true);
        v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);
        v.setUint16(26,name.length,true);v.setUint16(28,0,true);
        buffer.set(name,30);
      });
      parts.push(local,bytes);
      const currentOffset=offset;
      offset += local.length+size;
      const central=makeHeader(46+name.length,(v,buffer)=>{
        v.setUint32(0,0x02014b50,true);
        v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);
        v.setUint16(10,0,true);v.setUint16(12,stamp.time,true);v.setUint16(14,stamp.date,true);
        v.setUint32(16,crc,true);v.setUint32(20,size,true);v.setUint32(24,size,true);
        v.setUint16(28,name.length,true);v.setUint16(30,0,true);v.setUint16(32,0,true);
        v.setUint16(34,0,true);v.setUint16(36,0,true);v.setUint32(38,0,true);
        v.setUint32(42,currentOffset,true);
        buffer.set(name,46);
      });
      directory.push(central);
      directorySize+=central.length;
    }
    parts.push(...directory);
    const end=makeHeader(22,v=>{
      v.setUint32(0,0x06054b50,true);
      v.setUint16(4,0,true);v.setUint16(6,0,true);
      v.setUint16(8,rows.length,true);v.setUint16(10,rows.length,true);
      v.setUint32(12,directorySize,true);v.setUint32(16,offset,true);
      v.setUint16(20,0,true);
    });
    parts.push(end);
    return new Blob(parts,{type:'application/zip'});
  }

  async function downloadAll() {
    const rows=stored.filter(item=>item.status==='ready');
    if(!rows.length)return;
    const button=$('downloadAll');
    button.disabled=true;
    button.textContent='ZIP 파일을 만드는 중...';
    try {
      const zip=await makeZip(rows);
      const d=new Date();
      const name='press-images-'+[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+'.zip';
      downloadBlob(zip,name);
      toast(rows.length+'장의 사진을 ZIP 파일로 저장했어요.');
    } catch(error) {
      toast(String(error?.message||'ZIP 파일을 만들지 못했어요.'));
    } finally {
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 17v4h16v-4"/></svg> 전체 ZIP 저장 <span>↗</span>';
      render();
    }
  }

  function comparePosition() {
    const value=Number($('compareRange').value);
    $('compareAfter').style.clipPath='inset(0 0 0 '+value+'%)';
    $('compareDivider').style.left=value+'%';
  }
  function openCompare(item) {
    if(item?.status!=='ready')return;
    priorFocus=document.activeElement;
    compareItemId=item.id;
    $('compareBefore').src=item.originalUrl;
    $('compareAfter').src=item.outputUrl;
    $('compareTitle').textContent=item.file.name;
    $('compareStats').textContent=sizeText(item.file.size)+' → '+sizeText(item.result.size)+
      ' · '+item.outputWidth+' × '+item.outputHeight+'px · '+item.outputType.replace('image/','').toUpperCase();
    $('compareRange').value='50';
    comparePosition();
    $('compareBackdrop').hidden=false;
    $('closeCompare').focus();
  }
  function closeCompare() {
    $('compareBackdrop').hidden=true;
    compareItemId=null;
    $('compareBefore').removeAttribute('src');
    $('compareAfter').removeAttribute('src');
    if(priorFocus?.focus)priorFocus.focus({preventScroll:true});
  }

  function clearAll() {
    epoch++;
    clearTimeout(runDelay);
    for(const item of stored) clearItem(item);
    stored.length=0;
    if(!$('compareBackdrop').hidden)closeCompare();
    render();
    $('fileInput').value='';
    toast('목록을 비웠어요. 저장된 파일에는 영향이 없어요.');
  }

  function handleListAction(event) {
    const button=event.target.closest('[data-remove],[data-download],[data-compare]');
    if(!button)return;
    const id=button.dataset.remove||button.dataset.download||button.dataset.compare;
    const item=stored.find(row=>row.id===id);
    if(!item)return;
    if(button.hasAttribute('data-remove')) {
      const index=stored.indexOf(item);
      stored.splice(index,1);
      clearItem(item);
      if(compareItemId===id)closeCompare();
      render();
    } else if(button.hasAttribute('data-download')) singleDownload(item);
    else openCompare(item);
  }

  function bind() {
    const input=$('fileInput');
    for(const id of ['chooseFiles','addMore','bottomChoose']) {
      $(id).addEventListener('click',()=>input.click());
    }
    input.addEventListener('change',event=>{
      const selected=Array.from(event.target.files||[]);
      event.target.value='';
      void acceptFiles(selected);
    });
    const drop=$('uploadSection');
    for(const type of ['dragenter','dragover']) {
      drop.addEventListener(type,event=>{
        event.preventDefault();
        if(event.dataTransfer) event.dataTransfer.dropEffect='copy';
        drop.classList.add('dragover');
      });
    }
    drop.addEventListener('dragleave',event=>{
      if(!drop.contains(event.relatedTarget)) drop.classList.remove('dragover');
    });
    drop.addEventListener('drop',event=>{
      event.preventDefault();
      drop.classList.remove('dragover');
      void acceptFiles(event.dataTransfer?.files);
    });
    window.addEventListener('dragover',event=>{
      if(Array.from(event.dataTransfer?.types||[]).includes('Files')) event.preventDefault();
    });
    window.addEventListener('drop',event=>{
      if(Array.from(event.dataTransfer?.types||[]).includes('Files')) event.preventDefault();
    });
    document.addEventListener('paste',event=>{
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      const files=Array.from(event.clipboardData?.files||[]);
      if(files.length){event.preventDefault();void acceptFiles(files);}
    });
    $('fileList').addEventListener('click',handleListAction);
    $('downloadAll').addEventListener('click',()=>void downloadAll());
    $('clearAll').addEventListener('click',clearAll);
    $('formatSelect').addEventListener('change',event=>{config.format=event.target.value;changeSettings();});
    $('sizeSelect').addEventListener('change',event=>{config.size=Number(event.target.value);changeSettings();});
    $('qualityRange').addEventListener('input',event=>{
      config.quality=Number(event.target.value);
      $('qualityText').textContent=config.quality+'%';
      clearTimeout(runDelay);
      runDelay=setTimeout(changeSettings,380);
    });
    $('resetSettings').addEventListener('click',()=>{
      config.format='auto';config.size=2560;config.quality=82;
      syncSettings();changeSettings();toast('기본 설정으로 돌아왔어요.');
    });
    $('closeCompare').addEventListener('click',closeCompare);
    $('compareBackdrop').addEventListener('click',event=>{
      if(event.target===$('compareBackdrop'))closeCompare();
    });
    $('compareRange').addEventListener('input',comparePosition);
    $('compareDownload').addEventListener('click',()=>{
      const item=stored.find(row=>row.id===compareItemId);
      if(item)singleDownload(item);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!$('compareBackdrop').hidden){event.preventDefault();closeCompare();}
      if(event.key==='Tab'&&!$('compareBackdrop').hidden){
        const controls=[$('closeCompare'),$('compareRange'),$('compareDownload')];
        const at=controls.indexOf(document.activeElement);
        if(at>=0) {
          const next=at+(event.shiftKey?-1:1);
          if(next<0||next>=controls.length){event.preventDefault();controls[(next+controls.length)%controls.length].focus();}
        }
      }
    });
    // Retain object URLs for back-forward cache restoration.
  }

  function init() {
    syncSettings();
    bind();
    render();
    if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  init();
})();
