/* ELSEWHERE — Postcard Atelier | Vanilla JS / IndexedDB / Canvas */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const byId = id => document.getElementById(id);
  const escapes = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  const localDay = () => {
    const now = new Date();
    return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  };
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2));
  const imageSrc = (id, width = 1400) => 'https://images.unsplash.com/' + id + '?auto=format&fit=crop&w=' + width + '&q=85';
  const presets = [
    {id:'mediterranean',label:'Mediterranean Days',hint:'BY THE SEA',title:'Where the sun stays.',place:'A summer by the sea',image:'photo-1533105079780-92b9be482077',code:'01'},
    {id:'japan',label:'The Quiet Streets',hint:'THE OLD TOWN',title:'A walk without a map.',place:'Somewhere in Japan',image:'photo-1493976040374-85c8e12f0c0e',code:'02'},
    {id:'alps',label:'Above the Clouds',hint:'MOUNTAIN AIR',title:'Closer to the sky.',place:'The mountains',image:'photo-1464822759023-fed622ff2c3b',code:'03'},
    {id:'paris',label:'The City Lights',hint:'CITY IN BLOOM',title:'One more afternoon.',place:'Paris, France',image:'photo-1502602898657-3e91760cbb34',code:'04'},
    {id:'desert',label:'Golden Silence',hint:'OPEN LAND',title:'All the quiet in the world.',place:'The desert',image:'photo-1509316785289-025f5b846b35',code:'05'},
    {id:'openroad',label:'The Open Road',hint:'SOMEWHERE FAR',title:'Take the long way.',place:'On the road',image:'photo-1500530855697-b586d89ba3ee',code:'06'}
  ];
  const DEFAULT = () => ({
    id:null,scene:'mediterranean',customImage:null,zoom:100,title:'Where the sun stays.',place:'A summer by the sea',
    date:localDay(),message:'There are days that feel like they were made to remember.',
    template:'editorial',orientation:'landscape',favorite:false,createdAt:null,updatedAt:null
  });
  let draft = DEFAULT();
  let originalSignature = '';
  let currentFace = 'front';
  let mobileView = 'edit';
  let filter = 'all';
  let postcards = [];
  let renderSeq = 0;
  let toastTimer;
  let dbPromise = null;
  let customDialogResolver = null;
  let lastFocus = null;
  const cachedPhotos = new Map();

  function notify(message) {
    const box = byId('toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 3000);
  }

  function ask(title, message, okText='계속하기') {
    if (customDialogResolver) customDialogResolver(false);
    return new Promise(resolve => {
      customDialogResolver = resolve;
      byId('confirmTitle').textContent = title;
      byId('confirmText').textContent = message;
      byId('acceptConfirm').textContent = okText + ' ↗';
      byId('confirmDialog').hidden = false;
      byId('cancelConfirm').focus();
    });
  }

  function answerDialog(result) {
    byId('confirmDialog').hidden = true;
    if (customDialogResolver) {
      const fn = customDialogResolver;
      customDialogResolver = null;
      fn(result);
    }
  }

  function makeGallery() {
    byId('destinationGrid').innerHTML = presets.map((p, i) => `
      <button class="destination-card" type="button" data-preset="${p.id}" aria-label="${escapes(p.label)} 사진으로 엽서 만들기">
        <img src="${imageSrc(p.image, i===0 ? 1200 : 850)}" loading="${i < 2 ? 'eager' : 'lazy'}" alt="${escapes(p.label)} 분위기의 풍경 사진">
        <span class="d-top"><span>FIG. ${p.code} / THE JOURNEY EDIT</span><span aria-hidden="true">↗</span></span>
        <span class="d-bottom"><span><strong>${escapes(p.label)}</strong><small>${escapes(p.hint)}</small></span><i>✳</i></span>
      </button>`).join('');
    byId('imagePicker').innerHTML = presets.map(p => `
      <button class="image-option" type="button" data-image="${p.id}" aria-label="${escapes(p.label)} 배경으로 선택" aria-pressed="false">
        <img src="${imageSrc(p.image, 300)}" alt="${escapes(p.label)}" loading="lazy"></button>`).join('');
    $$('#destinationGrid [data-preset]').forEach(btn => btn.addEventListener('click', () => openStudio(btn.dataset.preset)));
    $$('#imagePicker [data-image]').forEach(btn => btn.addEventListener('click', () => {
      const p = presets.find(item => item.id === btn.dataset.image);
      if (!p) return;
      const previous = presets.find(item => item.id === draft.scene);
      const originalTitle = previous?.title || '';
      const originalPlace = previous?.place || '';
      if (!draft.title.trim() || draft.title === originalTitle) draft.title = p.title;
      if (!draft.place.trim() || draft.place === originalPlace) draft.place = p.place;
      draft.scene = p.id;
      draft.customImage = null;
      draft.zoom = 100;
      syncInputs();
      markDirty();
      renderCard();
    }));
  }

  function photoFor(data) {
    if (data.customImage) return data.customImage;
    const preset = presets.find(p => p.id === data.scene) || presets[0];
    return imageSrc(preset.image, 2200);
  }

  function signature(data) {
    return JSON.stringify({
      scene:data.scene,customImage:data.customImage,zoom:data.zoom,title:data.title,
      place:data.place,date:data.date,message:data.message,template:data.template,orientation:data.orientation
    });
  }

  function markDirty() {
    const changed = signature(draft) !== originalSignature;
    byId('unsavedIndicator').textContent = changed ? 'UNSAVED CHANGES ✳' : (draft.id ? 'SAVED MEMORY' : 'NEW MEMORY');
  }

  function syncInputs() {
    byId('titleInput').value = draft.title || '';
    byId('placeInput').value = draft.place || '';
    byId('dateInput').value = draft.date || localDay();
    byId('messageInput').value = draft.message || '';
    byId('imageZoom').value = draft.zoom || 100;
    byId('zoomValue').textContent = (draft.zoom || 100) + '%';
    byId('charCount').textContent = (draft.message || '').length + ' / 240';
    $$('#imagePicker [data-image]').forEach(b => {
      const active = !draft.customImage && b.dataset.image === draft.scene;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    $('.upload-photo').classList.toggle('selected-photo', !!draft.customImage);
    $$('#templatePicker [data-template]').forEach(b => {
      const active = draft.template === b.dataset.template;
      b.classList.toggle('selected', active);b.setAttribute('aria-pressed', String(active));
    });
    $$('[data-orientation]').forEach(b => {
      const active = draft.orientation === b.dataset.orientation;
      b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));
    });
    $$('.front-back-toggle button').forEach(b => {
      const active = b.dataset.face === currentFace;
      b.classList.toggle('active', active);b.setAttribute('aria-pressed',String(active));
    });
    updateMobileView();
  }

  function updateMobileView() {
    const shell = byId('studioLayout');
    shell.classList.toggle('view-edit', mobileView === 'edit');
    shell.classList.toggle('view-preview', mobileView === 'preview');
    $$('[data-mobile-view]').forEach(b => {
      const active = b.dataset.mobileView === mobileView;
      b.classList.toggle('active', active);b.setAttribute('aria-pressed', String(active));
    });
    if (mobileView === 'preview') renderCard();
  }

  async function openStudio(presetId=null, saved=null) {
    lastFocus = document.activeElement;
    if (saved) {
      draft = {...DEFAULT(),...structuredClone(saved)};
    } else {
      draft = DEFAULT();
      if (presetId) {
        const p = presets.find(item => item.id === presetId);
        if (p) Object.assign(draft, {scene:p.id,title:p.title,place:p.place});
      }
    }
    currentFace = 'front';
    mobileView = 'edit';
    syncInputs();
    originalSignature = signature(draft);
    markDirty();
    byId('studio').hidden = false;
    document.body.classList.add('studio-open');
    $('.studio-form-side').scrollTop = 0;
    byId('studioTitle').textContent = '';
    byId('studioTitle').innerHTML = draft.id ? 'Revisit a<br><em>little memory.</em>' : 'Make something<br><em>worth keeping.</em>';
    byId('savePostcard').firstChild.textContent = draft.id ? '변경사항 저장 ' : '내 보관함에 저장 ';
    byId('fileInput').value = '';
    await renderCard();
    byId('closeStudio').focus();
  }

  async function closeStudio() {
    if (signature(draft) !== originalSignature) {
      const yes = await ask('아직 완성하지 않았어요.', '저장하지 않은 편집 내용이 사라져요. 그래도 나갈까요?', '나가기');
      if (!yes) return;
    }
    byId('studio').hidden = true;
    document.body.classList.remove('studio-open');
    if (lastFocus?.focus) lastFocus.focus({preventScroll:true});
    renderSeq++;
  }

  function shapeW() {return draft.orientation === 'landscape' ? 1600 : 1200;}
  function shapeH() {return draft.orientation === 'landscape' ? 1200 : 1600;}

  function loadPicture(url) {
    if (!url) return Promise.reject(new Error('NO_IMAGE'));
    if (cachedPhotos.has(url)) return cachedPhotos.get(url);
    const promise = new Promise((resolve,reject) => {
      const img = new Image();
      if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE_UNAVAILABLE'));
      img.src = url;
    });
    cachedPhotos.set(url,promise);
    promise.catch(() => cachedPhotos.delete(url));
    if (cachedPhotos.size > 14) {
      for (const key of cachedPhotos.keys()) {
        if (key !== url) { cachedPhotos.delete(key); break; }
      }
    }
    return promise;
  }

  const font = (size,kind='serif',ital=false) =>
    kind === 'mono' ? `${size}px "DM Mono",monospace` :
    kind === 'sans' ? `${size}px "Noto Sans KR",sans-serif` :
    `${ital ? 'italic ' : ''}${size}px "Instrument Serif",Georgia,serif`;
  function text(ctx, str, x, y, size, color, opts={}) {
    ctx.save();ctx.font = font(size,opts.type,opts.italic);
    ctx.textBaseline=opts.baseline || 'alphabetic';
    ctx.textAlign=opts.align || 'left';
    ctx.fillStyle=color;
    if (opts.shadow) {ctx.shadowColor='#0006';ctx.shadowBlur=18;ctx.shadowOffsetY=3;}
    ctx.fillText(str,x,y,opts.maxWidth || undefined);
    ctx.restore();
  }
  function horizontalRule(ctx,x,y,width,color='#d7cabe',stroke=1) {
    ctx.fillStyle=color;ctx.fillRect(x,y,width,stroke);
  }
  function wrap(ctx,string,maxWidth,fontSize,kind='serif',maxLines=3) {
    const words = String(string || '').trim().split(/\s+/).filter(Boolean);
    ctx.save();ctx.font=font(fontSize,kind);
    const lines=[];
    let line='';
    // Words are split by whitespace; break a single unspaced CJK phrase by characters when necessary.
    const pushOversized = word => {
      let curr='';
      for(const char of Array.from(word)) {
        if (ctx.measureText(curr+char).width > maxWidth && curr) {
          lines.push(curr);curr=char;
        } else curr += char;
      }
      return curr;
    };
    for(const word of words) {
      if(lines.length>=maxLines) break;
      const candidate = line ? line+' '+word : word;
      if(ctx.measureText(candidate).width<=maxWidth) {
        line=candidate;
      } else {
        if(line) {lines.push(line);line='';}
        if(ctx.measureText(word).width>maxWidth) line=pushOversized(word);
        else line=word;
      }
    }
    if(line && lines.length<maxLines) lines.push(line);
    ctx.restore();
    return lines.slice(0,maxLines);
  }
  function drawWrapped(ctx,str,x,y,width,size,lineHeight,color,options={}) {
    const lines=wrap(ctx,str,width,size,options.type||'serif',options.maxLines||3);
    lines.forEach((line,index) => text(ctx,line,x,y+index*lineHeight,size,color,options));
    return lines.length;
  }
  function paintPaper(ctx,w,h,color='#f5f0e7') {
    ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
    // Deterministic photographic paper texture (not illustrative geometry).
    let seed=19011;
    const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    ctx.save();ctx.fillStyle='rgba(68,55,39,.036)';
    for(let n=0;n<4600;n++) {const x=random()*w,y=random()*h;ctx.fillRect(x,y,.5+random(),.5+random());}
    ctx.restore();
  }
  function coverPhoto(ctx,img,x,y,width,height,zoom=100,tint=null) {
    ctx.save();
    ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
    ctx.fillStyle='#c8c0b4';ctx.fillRect(x,y,width,height);
    if(img) {
      const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
      const scale=Math.max(width/iw,height/ih)*(Math.max(100,Math.min(165,zoom))/100);
      const dw=iw*scale,dh=ih*scale;
      ctx.drawImage(img,x+(width-dw)/2,y+(height-dh)/2,dw,dh);
    } else {
      const g=ctx.createLinearGradient(x,y,x+width,y+height);
      g.addColorStop(0,'#c8b4a1');g.addColorStop(1,'#726a66');
      ctx.fillStyle=g;ctx.fillRect(x,y,width,height);
    }
    if(tint){ctx.fillStyle=tint;ctx.fillRect(x,y,width,height);}
    ctx.restore();
  }
  function stamp(ctx,x,y,r,label='ELSEWHERE') {
    ctx.save();
    ctx.translate(x,y);ctx.rotate(-.15);
    ctx.strokeStyle='#926e5da8';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r-9,0,Math.PI*2);ctx.stroke();
    text(ctx,label,0,-8,Math.max(10,r*.24),'#866555',{align:'center',type:'mono',maxWidth:r*1.5});
    horizontalRule(ctx,-r*.55,0,r*1.1,'#987865',2);
    text(ctx,'✳',0,r*.45,Math.max(14,r*.48),'#866555',{align:'center'});
    ctx.restore();
  }
  function niceDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return 'UNDATED';
    const [y,m,d]=value.split('-');
    return d+' / '+m+' / '+y;
  }
  function paintEditorial(ctx,img,w,h,p) {
    paintPaper(ctx,w,h,'#f6f2e9');
    const border=w*.044;
    const portrait=h>w;
    const photoHeight=portrait?h*.715:h*.72;
    coverPhoto(ctx,img,border,border,w-2*border,photoHeight,p.zoom);
    const lower=border+photoHeight;
    const left=border+9;
    text(ctx,'ELSEWHERE / TRAVEL NOTES',left,lower+39,w*.0105,'#867a6e',{type:'mono'});
    text(ctx,niceDate(p.date),w-border-4,lower+39,w*.0105,'#867a6e',{align:'right',type:'mono'});
    horizontalRule(ctx,left,lower+57,w-2*border-18,'#d9cbbd',1.4);
    const title=p.title.trim()||'A place to remember.';
    const titleSize=portrait?w*.076:w*.067;
    const lines=wrap(ctx,title,w-2*border-30,titleSize,'serif',2);
    const start=lower+(portrait?135:142);
    lines.forEach((line,i)=>text(ctx,line,left,start+i*titleSize*.88,titleSize,'#3c3732',{italic:i===0,maxWidth:w-2*border-26}));
    const noteY=Math.min(h-border-22,start+(lines.length)*titleSize*.88+(portrait?45:35));
    text(ctx,(p.place.trim()||'SOMEWHERE SPECIAL').toUpperCase(),left,noteY,w*.012,'#8b7064',{type:'mono',maxWidth:w*.75});
    text(ctx,'✳',w-border-12,h-border-14,30,'#9d7765',{align:'right'});
  }
  function paintCinema(ctx,img,w,h,p) {
    coverPhoto(ctx,img,0,0,w,h,p.zoom);
    const shade=ctx.createLinearGradient(0,h*.21,0,h);
    shade.addColorStop(0,'rgba(8,13,14,.03)');shade.addColorStop(.47,'rgba(8,13,14,.23)');shade.addColorStop(1,'rgba(7,11,13,.83)');
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const edge=w*.05;
    text(ctx,'ELSEWHERE.',edge,edge+11,w*.016,'#fff1df',{type:'mono',shadow:true});
    text(ctx,'FRAME / '+(p.date||'0000').replaceAll('-','.'),w-edge,edge+11,w*.011,'#fff1df',{align:'right',type:'mono'});
    const size=w*.103;
    const title=p.title.trim()||'This is the moment.';
    const lines=wrap(ctx,title,w-2*edge,size,'serif',3);
    const base=h-h*.18-(lines.length-1)*size*.83;
    lines.forEach((line,i)=>text(ctx,line,edge,base+i*size*.83,size,'#fff8ed',{italic:i===0,shadow:true,maxWidth:w-2*edge}));
    horizontalRule(ctx,edge,h-edge-47,w-2*edge,'#fff8ed80',1.5);
    text(ctx,(p.place||'SOMEWHERE').toUpperCase(),edge,h-edge-7,w*.014,'#fff2e5',{type:'mono',maxWidth:w*.65});
    text(ctx,'A MEMORY TO KEEP  ✳',w-edge,h-edge-7,w*.011,'#fff2e5',{type:'mono',align:'right'});
  }
  function paintClassic(ctx,img,w,h,p) {
    paintPaper(ctx,w,h,'#eae3d6');
    const portrait=h>w,edge=w*.077;
    const photoY=edge+42,photoH=portrait?h*.6:h*.635;
    coverPhoto(ctx,img,edge,photoY,w-2*edge,photoH,p.zoom,'rgba(112,81,51,.11)');
    ctx.strokeStyle='#bdb2a2';ctx.lineWidth=2;
    ctx.strokeRect(edge-12,photoY-12,w-2*edge+24,photoH+24);
    text(ctx,'THE POSTCARD COLLECTION  /  NO. '+(p.scene==='custom'?'00':String(Math.max(1,presets.findIndex(x=>x.id===p.scene)+1)).padStart(2,'0')),w/2,edge-1,w*.0105,'#887768',{type:'mono',align:'center'});
    const under=photoY+photoH;
    text(ctx,'POSTCARD FROM SOMEWHERE',w/2,under+(portrait?90:86),w*.014,'#9e7960',{type:'mono',align:'center'});
    const title=p.title.trim()||'Wish you were here.';
    const size=portrait?w*.067:w*.068;
    const lines=wrap(ctx,title,w-2*edge,size,'serif',2);
    const base=under+(portrait?188:175);
    lines.forEach((line,i)=>text(ctx,line,w/2,base+i*size*.86,size,'#554235',{italic:true,align:'center',maxWidth:w-2*edge}));
    const footer=h-edge+4;
    horizontalRule(ctx,edge,footer-43,w-2*edge,'#baa994',2);
    text(ctx,(p.place||'AN UNNAMED PLACE').toUpperCase(),edge,footer,w*.012,'#836957',{type:'mono',maxWidth:w*.7});
    text(ctx,niceDate(p.date),w-edge,footer,w*.011,'#836957',{type:'mono',align:'right'});
  }
  function paintBack(ctx,w,h,p) {
    paintPaper(ctx,w,h,'#f1eadd');
    const portrait=h>w,edge=w*.075;
    const yTop=edge+64;
    text(ctx,'ELSEWHERE — THE POSTCARD ATELIER',edge,edge*.7,w*.012,'#856b5b',{type:'mono'});
    text(ctx,'PRIVATE CORRESPONDENCE  /  '+niceDate(p.date),w-edge,edge*.7,w*.011,'#9c8c7e',{type:'mono',align:'right'});
    horizontalRule(ctx,edge,yTop,w-2*edge,'#c2b5a5',2);
    if(portrait) {
      stamp(ctx,w-edge-91,yTop+126,72,'POSTMARK');
      text(ctx,'Dear memory,',edge,yTop+100,w*.064,'#806d5a',{italic:true});
      const fontSize=w*.030;
      const lines=wrap(ctx,p.message.trim()||'Some moments deserve to stay.',w-2*edge-14,fontSize,'sans',9);
      lines.forEach((line,i)=>text(ctx,line,edge,yTop+180+i*fontSize*1.65,fontSize,'#51493f',{type:'sans'}));
      horizontalRule(ctx,edge,h-edge-196,w-2*edge,'#c9bcac',1.5);
      text(ctx,'SENT FROM',edge,h-edge-153,w*.012,'#a08b79',{type:'mono'});
      drawWrapped(ctx,p.place||'SOMEWHERE',edge,h-edge-85,w-2*edge,w*.050,w*.060,'#584d40',{italic:true,maxLines:2});
      text(ctx,'WITH LOVE, ALWAYS',edge,h-edge-5,w*.013,'#a08b79',{type:'mono'});
    } else {
      const xRight=w*.54;
      ctx.fillStyle='#c5b8aa';ctx.fillRect(xRight,yTop+42,2,h-yTop-2*edge);
      stamp(ctx,w-edge-107,yTop+139,92,'POSTMARK');
      text(ctx,'A little note',edge,yTop+142,w*.059,'#7c6253',{italic:true});
      const size=w*.021;
      const lines=wrap(ctx,p.message.trim()||'Some moments deserve to stay.',xRight-2*edge-37,size,'sans',9);
      lines.forEach((line,i)=>text(ctx,line,edge,yTop+211+i*size*1.58,size,'#564b40',{type:'sans'}));
      text(ctx,'TO THE PLACE I STILL THINK OF',xRight+37,yTop+355,w*.012,'#907767',{type:'mono'});
      horizontalRule(ctx,xRight+37,yTop+393,w-edge-xRight-37,'#baa998',1);
      text(ctx,p.place.trim()||'Somewhere wonderful',xRight+37,yTop+459,w*.037,'#6f5144',{italic:true,maxWidth:w-edge-xRight-37});
      horizontalRule(ctx,xRight+37,yTop+482,w-edge-xRight-37,'#baa998',1);
      text(ctx,niceDate(p.date),xRight+37,yTop+554,w*.016,'#7f7165',{type:'mono'});
      text(ctx,'WISH YOU WERE HERE  /  ALWAYS',edge,h-edge+7,w*.011,'#a2907e',{type:'mono'});
    }
    horizontalRule(ctx,edge,h-edge+22,w-2*edge,'#bba996',2);
  }

  async function renderCard(force=false) {
    if(byId('studio').hidden && !force) return false;
    const seq=++renderSeq;
    const stage=byId('postcardCanvas');
    const w=shapeW(),h=shapeH();
    byId('canvasLoading').hidden=false;
    byId('formatLabel').textContent=w+' × '+h+' PX · PNG';
    const snap={...draft};
    let img=null;
    if(currentFace==='front') {
      try {img=await loadPicture(photoFor(snap));}catch {
        if(seq===renderSeq) notify('풍경 사진을 불러오지 못했어요. 다른 사진을 선택해 주세요.');
      }
    }
    if(document.fonts?.ready) {try{await document.fonts.ready;}catch{ /* browser fallback */ }}
    if(seq!==renderSeq) return false;
    stage.width=w;stage.height=h;
    const ctx=stage.getContext('2d',{alpha:false});
    if(!ctx) {byId('canvasLoading').hidden=true;notify('이 기기에서 캔버스 미리보기를 지원하지 않아요.');return false;}
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(currentFace==='back') paintBack(ctx,w,h,snap);
    else if(snap.template==='cinema') paintCinema(ctx,img,w,h,snap);
    else if(snap.template==='classic') paintClassic(ctx,img,w,h,snap);
    else paintEditorial(ctx,img,w,h,snap);
    byId('canvasLoading').hidden=true;
    return true;
  }

  function requestPreview() {
    // Run after the current input events, but don't queue duplicate heavy renders.
    clearTimeout(requestPreview.pending);
    requestPreview.pending=setTimeout(()=>renderCard(),120);
  }

  async function fileToCompressedImage(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('FORMAT');
    if (file.size>20*1024*1024) throw new Error('TOO_BIG');
    const readData=new Promise((resolve,reject) => {
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('READ'));
      reader.readAsDataURL(file);
    });
    const src=await readData;
    const image=await loadPicture(src);
    const edge=2400;
    const factor=Math.min(1,edge/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*factor));
    canvas.height=Math.max(1,Math.round(image.height*factor));
    const ctx=canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.88);
  }

  async function handleUpload(event) {
    const file=event.target.files?.[0];
    if (!file) return;
    notify('사진을 엽서에 맞게 준비하고 있어요.');
    try {
      const compressed=await fileToCompressedImage(file);
      draft.customImage=compressed;
      draft.scene='custom';
      draft.zoom=100;
      if(!draft.title.trim()) draft.title='A moment of mine.';
      syncInputs();
      markDirty();
      await renderCard();
      notify('내 사진을 적용했어요. 원하는 문장을 넣어보세요.');
    } catch(e) {
      notify(e.message==='TOO_BIG'?'20MB 이하의 사진을 선택해 주세요.': 'JPG, PNG, WEBP 파일인지 확인해 주세요.');
    } finally {event.target.value='';}
  }

  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function getPng() {
    const okay=await renderCard(true);
    if(!okay) throw new Error('RENDER');
    return new Promise((resolve,reject) => {
      try {
        byId('postcardCanvas').toBlob(blob=>blob?resolve(blob):reject(new Error('EXPORT')),'image/png');
      } catch (e) {reject(e);}
    });
  }
  function safeName() {
    return (draft.title||'my-postcard').trim().replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'-').slice(0,48)||'my-postcard';
  }
  async function downloadCurrent() {
    try {
      const blob=await getPng();
      downloadBlob(blob,'elsewhere-'+safeName()+'-'+currentFace+'.png');
      notify('고해상도 PNG 엽서를 준비했어요.');
    } catch {
      notify('사진의 이미지 저장이 제한되었어요. 내 사진을 직접 업로드해 다시 시도해 주세요.');
    }
  }
  async function shareCurrent() {
    try {
      const blob=await getPng();
      const file=new File([blob],'elsewhere-'+safeName()+'.png',{type:'image/png'});
      if(navigator.canShare?.({files:[file]}) && navigator.share) {
        try {await navigator.share({files:[file],title:'My postcard / ELSEWHERE'});}
        catch(e) {if(e.name!=='AbortError') notify('공유를 완료하지 못했어요. 다운로드를 이용해 주세요.');}
      } else {
        downloadBlob(blob,file.name);
        notify('이 기기는 이미지 공유를 지원하지 않아 PNG로 저장했어요.');
      }
    } catch {
      notify('이미지를 준비하지 못했어요. 업로드한 사진으로 다시 시도해 주세요.');
    }
  }

  // IndexedDB: supports larger image payloads than localStorage.
  function database() {
    if (dbPromise) return dbPromise;
    dbPromise=new Promise(resolve => {
      if (!('indexedDB' in window)) {resolve(null);return;}
      let request;
      try {request=indexedDB.open('elsewhere-postcards',1);}catch{resolve(null);return;}
      request.onupgradeneeded=() => {
        const db=request.result;
        if(!db.objectStoreNames.contains('cards')) db.createObjectStore('cards',{keyPath:'id'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>resolve(null);
      request.onblocked=()=>resolve(null);
    });
    return dbPromise;
  }

  async function dbOperation(mode, fn) {
    const db=await database();
    if(!db) throw new Error('NO_DATABASE');
    return new Promise((resolve,reject)=>{
      let tx,req,result;
      try {
        tx=db.transaction('cards',mode);
        req=fn(tx.objectStore('cards'));
        req.onsuccess=()=>{result=req.result;};
        req.onerror=()=>reject(req.error||new Error('DATABASE_ERROR'));
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(tx.error||new Error('DATABASE_ABORT'));
        tx.onerror=()=>reject(tx.error||new Error('DATABASE_ERROR'));
      } catch(e){reject(e);}
    });
  }
  async function fetchCards() {
    try {
      const list=await dbOperation('readonly',store=>store.getAll());
      postcards=Array.isArray(list)?list:[];
    } catch {
      try {postcards=JSON.parse(localStorage.getItem('elsewhere-fallback-cards')||'[]');}
      catch {postcards=[];}
    }
    postcards.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    renderArchive();
  }
  async function persistCard(card) {
    try {await dbOperation('readwrite',store=>store.put(card));}
    catch {
      const current=JSON.parse(localStorage.getItem('elsewhere-fallback-cards')||'[]');
      const merged=current.filter(x=>x.id!==card.id).concat(card);
      try {localStorage.setItem('elsewhere-fallback-cards',JSON.stringify(merged));}
      catch {throw new Error('STORAGE_FULL');}
    }
  }
  async function removeCard(id) {
    try {await dbOperation('readwrite',store=>store.delete(id));}
    catch {
      const current=JSON.parse(localStorage.getItem('elsewhere-fallback-cards')||'[]');
      localStorage.setItem('elsewhere-fallback-cards',JSON.stringify(current.filter(x=>x.id!==id)));
    }
  }

  function thumbnail() {
    try {
      const source=byId('postcardCanvas');
      const preview=document.createElement('canvas');
      preview.width=source.width>source.height?660:460;
      preview.height=Math.round(preview.width*source.height/source.width);
      preview.getContext('2d').drawImage(source,0,0,preview.width,preview.height);
      return preview.toDataURL('image/jpeg',.71);
    } catch {return null;}
  }

  async function saveCurrent() {
    const title=(draft.title||'').trim();
    if(!title) {
      notify('엽서 제목을 한 글자 이상 적어 주세요.');
      mobileView='edit';updateMobileView();byId('titleInput').focus();
      return;
    }
    if(title.length>60){notify('제목은 60자 이하로 적어 주세요.');return;}
    const card={...draft,title,place:draft.place.trim().slice(0,55),message:draft.message.trim().slice(0,240)};
    card.id=card.id||uid();
    card.createdAt=card.createdAt||new Date().toISOString();
    card.updatedAt=new Date().toISOString();
    if(currentFace!=='front') {
      const face=currentFace;
      currentFace='front';
      await renderCard(true);
      card.preview=thumbnail();
      currentFace=face;
      renderCard();
    } else {
      await renderCard(true);
      card.preview=thumbnail();
    }
    try {await persistCard(card);}
    catch {notify('저장 공간이 부족해요. 다른 브라우저 저장 공간을 확인해 주세요.');return;}
    draft={...card};
    originalSignature=signature(draft);
    markDirty();
    await fetchCards();
    notify('엽서를 내 보관함에 소중히 저장했어요.');
    byId('savePostcard').firstChild.textContent='변경사항 저장 ';
  }

  function renderArchive() {
    byId('archiveCount').textContent=String(postcards.length).padStart(2,'0');
    const query=byId('archiveSearch').value.trim().toLocaleLowerCase();
    const items=postcards.filter(p =>
      (filter==='all'||p.favorite) &&
      (!query||[p.title,p.place,p.message].join(' ').toLocaleLowerCase().includes(query))
    );
    const grid=byId('archiveGrid');
    if(!items.length) {
      const isEmpty=postcards.length===0;
      grid.innerHTML=`<div class="archive-empty"><div class="empty-flourish">✳</div><h3>${isEmpty ? 'A little space for memories.' : 'Nothing in this little corner.'}</h3>
      <p>${isEmpty ? '아직 보관된 엽서가 없어요.<br>첫 번째 장면을 직접 남겨보세요.' : '찾는 조건에 맞는 엽서가 없어요.<br>다른 검색어 또는 필터를 이용해 보세요.'}</p>
      ${isEmpty ? '<button type="button" data-empty-create>첫 엽서 만들기 ↗</button>' : '<button type="button" data-clear-filter>필터 초기화 ↗</button>'}</div>`;
      grid.querySelector('[data-empty-create]')?.addEventListener('click',()=>openStudio());
      grid.querySelector('[data-clear-filter]')?.addEventListener('click',()=>{
        filter='all';byId('archiveSearch').value='';syncFilter();renderArchive();
      });
      return;
    }
    grid.innerHTML=items.map(p=>{
      let cover=p.preview || p.customImage || photoFor(p);
      return `<article class="archive-card">
        <button type="button" class="archive-image-btn" data-edit="${escapes(p.id)}" aria-label="${escapes(p.title)} 엽서 편집">
          <img src="${escapes(cover)}" alt="${escapes(p.title)} 엽서" loading="lazy"></button>
        <div class="archive-card-info"><div><h3>${escapes(p.title)}</h3><p>${escapes((p.place||'SOMEWHERE')+' / '+niceDate(p.date))}</p></div>
          <div class="archive-card-actions"><button type="button" data-favorite="${escapes(p.id)}" class="${p.favorite?'faved':''}" aria-label="${p.favorite?'즐겨찾기 해제':'즐겨찾기에 추가'}" title="즐겨찾기">${p.favorite?'♥':'♡'}</button>
          <button type="button" data-remove="${escapes(p.id)}" aria-label="엽서 삭제" title="삭제">×</button></div>
        </div></article>`;
    }).join('');
  }
  function syncFilter() {
    $$('.archive-tab').forEach(b=>{
      const active=b.dataset.filter===filter;
      b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    });
  }
  async function handleArchiveClick(event) {
    const btn=event.target.closest('[data-edit],[data-favorite],[data-remove]');
    if(!btn) return;
    const id=btn.dataset.edit||btn.dataset.favorite||btn.dataset.remove;
    const card=postcards.find(p=>p.id===id);
    if(!card)return;
    if(btn.hasAttribute('data-edit')) {
      openStudio(null,card);
    } else if(btn.hasAttribute('data-favorite')) {
      card.favorite=!card.favorite;card.updatedAt=new Date().toISOString();
      try{await persistCard(card);await fetchCards();}
      catch{notify('즐겨찾기를 저장하지 못했어요.');}
    } else {
      const accepted=await ask('이 엽서를 지울까요?', '삭제한 엽서는 다시 되돌릴 수 없어요.', '엽서 삭제');
      if(!accepted)return;
      try {await removeCard(id);await fetchCards();notify('엽서를 보관함에서 삭제했어요.');}
      catch {notify('삭제하지 못했어요. 다시 시도해 주세요.');}
    }
  }

  function jumpArchive() {
    byId('archive').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    byId('archiveSearch').focus({preventScroll:true});
  }

  function bind() {
    $$('[data-open-studio]').forEach(b=>b.addEventListener('click',()=>openStudio()));
    byId('navArchive').addEventListener('click',jumpArchive);
    $('[data-mobile-archive]').addEventListener('click',jumpArchive);
    byId('mobileAbout').addEventListener('click',()=>byId('howItWorks').scrollIntoView({behavior:'smooth'}));
    byId('closeStudio').addEventListener('click',closeStudio);
    byId('fileInput').addEventListener('change',handleUpload);
    for(const [id,key] of [['titleInput','title'],['placeInput','place'],['dateInput','date'],['messageInput','message']]) {
      byId(id).addEventListener('input',event=>{
        draft[key]=event.target.value;
        if(key==='message')byId('charCount').textContent=draft.message.length+' / 240';
        markDirty();requestPreview();
      });
    }
    byId('imageZoom').addEventListener('input',event=>{
      draft.zoom=Number(event.target.value);byId('zoomValue').textContent=draft.zoom+'%';
      markDirty();requestPreview();
    });
    $$('#templatePicker [data-template]').forEach(btn=>btn.addEventListener('click',()=>{
      draft.template=btn.dataset.template;syncInputs();markDirty();renderCard();
    }));
    $$('[data-orientation]').forEach(btn=>btn.addEventListener('click',()=>{
      draft.orientation=btn.dataset.orientation;syncInputs();markDirty();renderCard();
    }));
    $$('[data-face]').forEach(btn=>btn.addEventListener('click',()=>{
      currentFace=btn.dataset.face;syncInputs();renderCard();
    }));
    $$('[data-mobile-view]').forEach(btn=>btn.addEventListener('click',()=>{
      mobileView=btn.dataset.mobileView;updateMobileView();
    }));
    byId('savePostcard').addEventListener('click',saveCurrent);
    byId('downloadPostcard').addEventListener('click',downloadCurrent);
    byId('sharePostcard').addEventListener('click',shareCurrent);
    byId('archiveGrid').addEventListener('click',handleArchiveClick);
    byId('archiveSearch').addEventListener('input',renderArchive);
    $$('.archive-tab').forEach(btn=>btn.addEventListener('click',()=>{
      filter=btn.dataset.filter;syncFilter();renderArchive();
    }));
    byId('cancelConfirm').addEventListener('click',()=>answerDialog(false));
    byId('acceptConfirm').addEventListener('click',()=>answerDialog(true));

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(!byId('confirmDialog').hidden){event.preventDefault();answerDialog(false);}
        else if(!byId('studio').hidden){event.preventDefault();closeStudio();}
        return;
      }
      if(!byId('studio').hidden) {
        if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s') {
          event.preventDefault();saveCurrent();
        }
        if(event.key==='Tab'&&!byId('confirmDialog').hidden) {
          const items=[byId('cancelConfirm'),byId('acceptConfirm')];
          const current=items.indexOf(document.activeElement);
          if(current!==-1){event.preventDefault();items[(current+(event.shiftKey?-1:1)+items.length)%items.length].focus();}
        }
      }else if(!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&event.key.toLowerCase()==='c'&&!event.ctrlKey&&!event.metaKey){
        openStudio();
      }
    });
    window.addEventListener('beforeunload',event=>{
      if(!byId('studio').hidden&&signature(draft)!==originalSignature){
        event.preventDefault();event.returnValue='';
      }
    });
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        const target=entry.target.id==='collection'?'collection':'discover';
        $$('.nav-link[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===target));
        $$('.mobile-nav-link[data-mobile-target]').forEach(link=>link.classList.toggle('active',link.dataset.mobileTarget===target));
      });
    },{rootMargin:'-20% 0px -65% 0px'});
    [byId('discover'),byId('collection')].forEach(node=>observer.observe(node));
  }

  function init() {
    makeGallery();bind();syncFilter();fetchCards();
    if('serviceWorker'in navigator && (location.protocol==='https:'||location.hostname==='localhost')){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  init();
})();
