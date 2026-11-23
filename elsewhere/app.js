/* ELSEWHERE — one photo, one feeling. Zero build dependencies. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const photoUrl = (id,size=1500) =>
    'https://images.unsplash.com/'+id+'?auto=format&fit=crop&w='+size+'&q=86';
  const scenes = [
    {id:'coast',image:'photo-1533105079780-92b9be482077',name:'The slow summer',hint:'THE SEA / SUNSHINE',place:'여름이 머물던 곳'},
    {id:'town',image:'photo-1493976040374-85c8e12f0c0e',name:'An afternoon walk',hint:'A WALK / THE CITY',place:'오래된 골목길'},
    {id:'mountain',image:'photo-1464822759023-fed622ff2c3b',name:'Closer to the sky',hint:'THE MOUNTAINS / SKY',place:'하늘 가까운 곳'},
    {id:'road',image:'photo-1500530855697-b586d89ba3ee',name:'The long way home',hint:'ON THE ROAD / FAR AWAY',place:'길 위에서'}
  ];
  const moods = {
    memory:[
      {title:'기억하고 싶은 하루',note:'이날의 빛과 공기를 오래 간직할게.'},
      {title:'그날의 우리',note:'별일 없던 하루가 가장 오래 기억나기도 해.'},
      {title:'사라지지 않을 장면',note:'언젠가 다시 꺼내 볼, 마음에 남은 순간.'}
    ],
    travel:[
      {title:'여기서의 하루',note:'멀리 떠나서야 만난, 가까운 행복.'},
      {title:'길 위의 우리',note:'목적지보다 오래 남을 여정.'},
      {title:'Wish you were here',note:'마음 한편에 오래 남을 풍경을 발견했어.'}
    ],
    celebrate:[
      {title:'오늘을 축하해',note:'오래도록 반짝일 오늘이 되기를.'},
      {title:'너에게 주는 한 장',note:'평범한 날도 특별하게 만드는 너에게.'},
      {title:'A little celebration',note:'이 아름다운 순간을 함께 기념하고 싶어.'}
    ],
    cheer:[
      {title:'잘하고 있어',note:'조금 천천히 가도 괜찮아. 언제나 응원할게.'},
      {title:'너의 모든 내일에',note:'어떤 길 위에서도 네 편이 되어줄게.'},
      {title:'You got this',note:'오늘의 너도 충분히 멋지다는 걸 잊지 마.'}
    ]
  };
  const styleNames=['editorial','cinema','polaroid'];
  const prettyStyle=['EDITORIAL','CINEMA','AFTERGLOW'];
  const localDate=() => {
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const uniqueId=()=>typeof crypto!=='undefined' && crypto.randomUUID
    ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
  const state={
    mood:'memory',variation:0,style:'editorial',
    title:moods.memory[0].title,note:moods.memory[0].note,place:'',
    date:localDate(),titleEdited:false,noteEdited:false,
    source:{kind:'sample',id:'coast',url:photoUrl(scenes[0].image,2200),blob:null},
    archiveId:null
  };
  let renderRevision=0;
  let lastRendered={revision:-1,hasImage:false};
  let cachedExport={revision:-1,promise:null};
  let uploadRevision=0;
  let currentOrientation='landscape';
  let archiveCards=[];
  let dbPromise;
  let pendingDeleteId=null;
  let formerFocus=null;
  let toastTimer=null;
  const imageCache=new Map();

  function toast(message) {
    const el=$('toast');
    el.textContent=message;
    el.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('shown'),3500);
  }
  function isMobile(){return window.matchMedia('(max-width:700px)').matches;}
  function changed() {state.archiveId=null;renderRevision++;}

  function setGallery() {
    $('sceneGallery').innerHTML=scenes.map((scene,index) =>
      '<button type="button" class="scene-card" data-scene="'+escape(scene.id)+'" aria-label="'+escape(scene.name)+' 풍경으로 엽서 만들기">'+
        '<img src="'+escape(photoUrl(scene.image,720))+'" loading="lazy" alt="'+escape(scene.name)+' 풍경 사진">'+
        '<span class="scene-index">FIG. 0'+(index+1)+' / THE JOURNEY EDIT</span><span class="scene-arrow" aria-hidden="true">↗</span>'+
        '<span class="scene-info"><strong>'+escape(scene.name)+'</strong><small>'+escape(scene.hint)+'</small></span>'+
      '</button>'
    ).join('');
  }

  function syncControls() {
    $('titleInput').value=state.title;
    $('noteInput').value=state.note;
    $('placeInput').value=state.place;
    $('titleCounter').textContent=state.title.length+' / 38';
    $('noteCounter').textContent=state.note.length+' / 90';
    $$('#moodList .mood').forEach(button=>{
      const active=button.dataset.mood===state.mood;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('previewBadge').textContent=state.source.kind==='sample'
      ? 'DEMO — 사진을 골라보세요'
      : 'YOUR PHOTO / READY TO KEEP';
    $('uploadLabelText').textContent=state.source.kind==='sample'
      ? '내 사진으로 바로 만들기' : '다른 사진으로 바꾸기';
  }

  function formatDate(value) {
    const data=String(value||localDate()).split('-');
    return data.length===3 ? data[2]+' / '+data[1]+' / '+data[0] : 'A DAY TO REMEMBER';
  }
  function font(size,kind='serif',italic=false) {
    if(kind==='mono')return size+'px "DM Mono", monospace';
    if(kind==='korean')return '400 '+size+'px "Noto Sans KR", sans-serif';
    return (italic?'italic ':'')+size+'px "Instrument Serif", Georgia, serif';
  }
  function drawText(ctx,string,x,y,size,color,opts={}) {
    ctx.save();
    ctx.font=font(size,opts.kind,opts.italic);
    ctx.fillStyle=color;
    ctx.textBaseline=opts.baseline||'alphabetic';
    ctx.textAlign=opts.align||'left';
    if(opts.shadow){ctx.shadowColor='#0008';ctx.shadowBlur=22;ctx.shadowOffsetY=3;}
    if(Number.isFinite(opts.maxWidth)&&opts.maxWidth>0)ctx.fillText(String(string),x,y,opts.maxWidth);
    else ctx.fillText(String(string),x,y);
    ctx.restore();
  }
  function fillRule(ctx,x,y,width,color='#ddd3c8',height=1) {
    ctx.fillStyle=color;ctx.fillRect(x,y,width,height);
  }
  function wrappedLines(ctx,string,maxWidth,size,kind,maxLines=3) {
    const value=String(string||'').trim();
    if(!value)return [];
    ctx.save();ctx.font=font(size,kind);
    const out=[];let line='';
    for(const char of Array.from(value)){
      if(char==='\n'){
        if(line)out.push(line.trimEnd());
        line='';
        if(out.length>=maxLines)break;
        continue;
      }
      const trial=line+char;
      if(ctx.measureText(trial).width>maxWidth&&line.trim()){
        out.push(line.trimEnd());
        if(out.length>=maxLines){line='';break;}
        line=char===' '?'':char;
      }else line=trial;
    }
    if(line.trim()&&out.length<maxLines)out.push(line.trimEnd());
    ctx.restore();
    return out.slice(0,maxLines);
  }
  function wrapText(ctx,string,x,startY,maxWidth,size,lineHeight,color,opts={}) {
    const lines=wrappedLines(ctx,string,maxWidth,size,opts.kind,opts.maxLines||3);
    lines.forEach((value,index)=>{
      drawText(ctx,value,x,startY+lineHeight*index,size,color,opts);
    });
    return lines.length;
  }
  function paper(ctx,w,h,color='#f5f0e6') {
    ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
    // Subtle deterministic print grain. This is a finishing touch, not a geometric illustration.
    let x=3411;
    const rand=()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
    ctx.fillStyle='rgba(63,47,38,.023)';
    for(let i=0;i<4200;i++) ctx.fillRect(rand()*w,rand()*h,.35+rand()*.8,.35+rand()*.8);
  }
  function drawPhoto(ctx,img,x,y,width,height,shade) {
    ctx.save();
    ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
    ctx.fillStyle='#9d9588';ctx.fillRect(x,y,width,height);
    if(img) {
      const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
      const scale=Math.max(width/iw,height/ih);
      ctx.drawImage(img,x+(width-iw*scale)/2,y+(height-ih*scale)/2,iw*scale,ih*scale);
    } else {
      const gradient=ctx.createLinearGradient(x,y,x+width,y+height);
      gradient.addColorStop(0,'#b6a99a');gradient.addColorStop(1,'#81766c');
      ctx.fillStyle=gradient;ctx.fillRect(x,y,width,height);
    }
    if(shade){ctx.fillStyle=shade;ctx.fillRect(x,y,width,height);}
    ctx.restore();
  }
  function drawEditorial(ctx,img,w,h,s) {
    paper(ctx,w,h);
    const portrait=h>w;
    const edge=w*.047;
    const photoH=portrait?h*.698:h*.625;
    drawPhoto(ctx,img,edge,edge,w-edge*2,photoH);
    const under=edge+photoH;
    fillRule(ctx,edge+3,under+42,w-edge*2-6,'#dfd1c3',1);
    drawText(ctx,'ELSEWHERE / A POSTCARD TO KEEP',edge+3,under+27,w*.0099,'#928477',{kind:'mono'});
    drawText(ctx,formatDate(s.date),w-edge-3,under+27,w*.0100,'#928477',{kind:'mono',align:'right'});
    const titleLength=Array.from(s.title||'').length;
    const titleSize=portrait?(titleLength>28?44:titleLength>18?55:72):(titleLength>28?50:titleLength>18?63:76);
    const titleY=under+120;
    const count=wrapText(ctx,s.title||'우리의 한 장면',edge+3,titleY,w-edge*2-20,titleSize,titleSize*.96,'#423a34',
      {kind:'korean',maxLines:2});
    const noteY=titleY+count*titleSize*.96+24;
    wrapText(ctx,s.note,edge+4,noteY,w-edge*2-75,portrait?25:23,35,'#77655a',{kind:'korean',maxLines:2});
    drawText(ctx,(s.place||'A MOMENT TO REMEMBER').toUpperCase(),edge+4,h-edge*.47,w*.011,'#a16e5e',{kind:'mono',maxWidth:w*.72});
    drawText(ctx,'✳',w-edge-12,h-edge*.50,30,'#ad7b64',{align:'right'});
  }
  function drawCinema(ctx,img,w,h,s) {
    drawPhoto(ctx,img,0,0,w,h);
    const gradient=ctx.createLinearGradient(0,h*.18,0,h);
    gradient.addColorStop(0,'#0d131000');
    gradient.addColorStop(.4,'#12191a25');
    gradient.addColorStop(1,'#0c151ad9');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    const edge=w*.065;
    drawText(ctx,'ELSEWHERE. / THE MEMORY ISSUE',edge,edge+13,w*.015,'#fff2e5',{kind:'mono',shadow:true});
    drawText(ctx,formatDate(s.date),w-edge,edge+13,w*.013,'#fff2e5',{kind:'mono',align:'right',shadow:true});
    const titleLength=Array.from(s.title||'').length;
    const titleSize=w*(titleLength>25?.047:titleLength>15?.06:.070);
    const lines=wrappedLines(ctx,s.title||'우리의 한 장면',w-2*edge,titleSize,'korean',3);
    const start=h-edge-143-(lines.length-1)*titleSize*1.2;
    lines.forEach((line,i)=>drawText(ctx,line,edge,start+i*titleSize*1.2,titleSize,'#fff7e9',{kind:'korean',shadow:true}));
    wrapText(ctx,s.note,edge,h-edge-94,w-2*edge,Math.max(21,w*.018),34,'#f4ebdf',{kind:'korean',maxLines:2,shadow:true});
    fillRule(ctx,edge,h-edge-56,w-2*edge,'#e9e1d57a',2);
    drawText(ctx,(s.place||'THIS PLACE, THIS MOMENT').toUpperCase(),edge,h-edge-18,w*.011,'#eee2d8',{kind:'mono',maxWidth:w*.7});
    drawText(ctx,'POSTCARD N° 001',w-edge,h-edge-18,w*.011,'#eee2d8',{kind:'mono',align:'right'});
  }
  function drawPolaroid(ctx,img,w,h,s) {
    paper(ctx,w,h,'#eee8da');
    const edge=w*.064,portrait=h>w;
    const top=edge+42;
    const photoH=portrait?h*.625:h*.55;
    drawPhoto(ctx,img,edge,top,w-2*edge,photoH,'rgba(117,75,51,.05)');
    fillRule(ctx,edge,edge-3,w-2*edge,'#c7b5a5',1.5);
    drawText(ctx,'THE EVERYDAY POSTCARD ATELIER',edge,edge-19,w*.0108,'#877368',{kind:'mono'});
    const under=top+photoH;
    drawText(ctx,'—   WISH YOU WERE HERE   —',w/2,under+(portrait?73:63),w*.011,'#9c7f6d',{kind:'mono',align:'center'});
    const titleLength=Array.from(s.title||'').length;
    const titleSize=portrait?(titleLength>24?46:titleLength>16?60:70):(titleLength>28?48:titleLength>18?61:76);
    const lines=wrappedLines(ctx,s.title||'그날의 우리',w-2*edge-10,titleSize,'korean',2);
    const titleY=under+(portrait?158:128);
    lines.forEach((line,i)=>drawText(ctx,line,w/2,titleY+i*titleSize*.95,titleSize,'#4a3b31',{kind:'korean',align:'center'}));
    const messageY=titleY+lines.length*titleSize*.96+12;
    wrapText(ctx,s.note,w/2,messageY,w-2*edge-20,Math.max(19,w*.019),34,'#83766a',
      {kind:'korean',align:'center',maxLines:2});
    fillRule(ctx,edge,h-edge+10,w-2*edge,'#cfc0b0',1.5);
    drawText(ctx,(s.place||'SOMEWHERE SPECIAL').toUpperCase(),edge,h-edge+38,w*.011,'#977d6b',{kind:'mono',maxWidth:w*.64});
    drawText(ctx,formatDate(s.date),w-edge,h-edge+38,w*.011,'#977d6b',{kind:'mono',align:'right'});
  }
  function paint(s,image,canvas) {
    const portrait=!!image&&(image.naturalHeight||image.height)>(image.naturalWidth||image.width)*1.1;
    const width=portrait?1200:1600,height=portrait?1600:1200;
    canvas.width=width;canvas.height=height;
    currentOrientation=portrait?'portrait':'landscape';
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('이미지 그리기를 지원하지 않는 기기예요.');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(s.style==='cinema')drawCinema(ctx,image,width,height,s);
    else if(s.style==='polaroid')drawPolaroid(ctx,image,width,height,s);
    else drawEditorial(ctx,image,width,height,s);
    $('exportDimensions').textContent=width+' × '+height+' PX · PNG';
  }

  function getImage(source) {
    const key=source.url;
    if(imageCache.has(key))return imageCache.get(key);
    const result=new Promise((resolve,reject)=>{
      const img=new Image();
      if(source.kind==='sample')img.crossOrigin='anonymous';
      img.decoding='async';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('풍경 사진을 불러오지 못했어요.'));
      img.src=key;
    });
    imageCache.set(key,result);
    result.catch(()=>imageCache.delete(key));
    if(imageCache.size>9){
      const oldKey=imageCache.keys().next().value;
      if(oldKey!==key)imageCache.delete(oldKey);
    }
    return result;
  }

  async function render() {
    const token=++renderRevision;
    $('canvasWait').hidden=false;
    const snapshot={...state,source:{...state.source}};
    let img=null;
    try {img=await getImage(snapshot.source);}
    catch { /* Placeholder renders but cannot be exported. */ }
    if(document.fonts?.ready){try{await document.fonts.ready;}catch{}}
    if(token!==renderRevision)return false;
    try{
      paint(snapshot,img,$('postcardCanvas'));
      lastRendered={revision:token,hasImage:!!img};
      cachedExport=img ? {revision:token,promise:canvasToBlob($('postcardCanvas')).catch(()=>null)} : {revision:token,promise:null};
      $('canvasWait').hidden=true;
      $('previewStatus').textContent=img
        ? (snapshot.source.kind==='sample'?'샘플 엽서 · 사진을 고르면 내 엽서가 돼요':'완성됐어요 · 바로 공유하거나 저장하세요')
        : '사진을 불러오지 못했어요. 내 사진을 선택해 주세요.';
      return !!img;
    }catch(error){
      $('canvasWait').hidden=true;
      $('previewStatus').textContent='미리보기를 만들지 못했어요.';
      lastRendered={revision:token,hasImage:false};
      cachedExport={revision:token,promise:null};
      return false;
    }
  }

  async function readPhoto(file) {
    if(!file) return;
    const thisUpload=++uploadRevision;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('JPG·PNG·WEBP 사진을 선택해 주세요.');return;}
    if(file.size>20*1024*1024){toast('사진은 20MB 이하만 사용할 수 있어요.');return;}
    if(file.size===0){toast('비어 있는 파일은 사용할 수 없어요.');return;}
    const url=URL.createObjectURL(file);
    const next={kind:'upload',id:null,url,blob:file};
    $('canvasWait').hidden=false;
    try {
      const img=await getImage(next);
      if((img.naturalWidth||img.width)*(img.naturalHeight||img.height)>65_000_000){
        throw new Error('해상도가 너무 큰 사진이에요. 65MP 이하로 선택해 주세요.');
      }
    } catch(error) {
      imageCache.delete(url);URL.revokeObjectURL(url);
      $('canvasWait').hidden=true;
      toast(error.message||'사진을 읽지 못했어요. 다른 파일을 골라 주세요.');
      return;
    }
    if(thisUpload!==uploadRevision){imageCache.delete(url);URL.revokeObjectURL(url);return;}
    const previous=state.source;
    state.source=next;changed();
    if(previous.kind!=='sample'&&previous.url.startsWith('blob:')){
      imageCache.delete(previous.url);
      URL.revokeObjectURL(previous.url);
    }
    syncControls();
    await render();
    toast('내 사진으로 엽서를 만들었어요. 바로 공유해 보세요! ✳');
    if(isMobile())$('postcardCanvas').scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function chooseScene(id) {
    uploadRevision++;
    const scene=scenes.find(x=>x.id===id);
    if(!scene)return;
    const previous=state.source;
    state.source={kind:'sample',id,url:photoUrl(scene.image,2200),blob:null};
    state.place=scene.place;
    changed();
    if(previous.kind!=='sample'&&previous.url.startsWith('blob:')){
      imageCache.delete(previous.url);URL.revokeObjectURL(previous.url);
    }
    syncControls();
    const ok=await render();
    if(!ok)toast('풍경을 불러오지 못했어요. 내 사진을 선택해 보세요.');
    $('create').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function updateText() {
    state.title=$('titleInput').value;
    state.note=$('noteInput').value;
    state.place=$('placeInput').value;
    $('titleCounter').textContent=state.title.length+' / 38';
    $('noteCounter').textContent=state.note.length+' / 90';
    changed();
    scheduleRender();
  }
  let renderDelay=0;
  function scheduleRender(){
    clearTimeout(renderDelay);
    renderDelay=setTimeout(()=>void render(),75);
  }

  function changeMood(mood) {
    if(!moods[mood])return;
    state.mood=mood;
    state.variation=0;
    if(!state.titleEdited)state.title=moods[mood][0].title;
    if(!state.noteEdited)state.note=moods[mood][0].note;
    changed();
    syncControls();
    void render();
  }

  function changeSuggestion() {
    state.variation=(state.variation+1)%moods[state.mood].length;
    const next=moods[state.mood][state.variation];
    state.title=next.title;state.note=next.note;
    state.titleEdited=false;state.noteEdited=false;
    changed();syncControls();void render();
  }
  function nextStyle() {
    state.style=styleNames[(styleNames.indexOf(state.style)+1)%styleNames.length];
    changed();
    $('nextStyle').innerHTML='디자인 바꾸기 <span aria-hidden="true">↻</span>';
    toast('디자인 '+prettyStyle[styleNames.indexOf(state.style)]+' 적용');
    void render();
  }

  function canvasToBlob(canvas,type='image/png',quality) {
    return new Promise((resolve,reject)=>{
      try{
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('이미지 파일을 만들지 못했어요.')),type,quality);
      }catch(e){reject(e);}
    });
  }
  async function imageBlob() {
    if(lastRendered.revision!==renderRevision || !lastRendered.hasImage || cachedExport.revision!==renderRevision || !cachedExport.promise){
      const success=await render();
      if(!success)throw new Error('사진을 불러오지 못했어요. 내 사진을 선택한 뒤 다시 시도해 주세요.');
    }
    const blob=await cachedExport.promise;
    if(!blob)throw new Error('엽서 이미지를 만들지 못했어요. 다시 시도해 주세요.');
    return blob;
  }
  function exportName() {
    return 'elsewhere-'+(state.title||'my-memory').trim()
      .replace(/[\\/:*?"<>|\x00-\x1f]/g,'').replace(/\s+/g,'-').slice(0,44)+'.png';
  }
  function saveFile(blob,filename) {
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=filename;
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function download() {
    const btn=$('downloadBtn');
    btn.disabled=true;
    try {
      saveFile(await imageBlob(),exportName());
      toast('엽서 이미지를 저장했어요. ✳');
    }catch(error){toast(error.message||'저장에 실패했어요.');}
    finally{btn.disabled=false;}
  }
  async function share() {
    const btn=$('shareBtn');
    btn.disabled=true;
    try{
      const blob=await imageBlob();
      const name=exportName();
      const file=new File([blob],name,{type:'image/png'});
      if(navigator.share && navigator.canShare?.({files:[file]})){
        try{
          await navigator.share({files:[file],title:'ELSEWHERE / 나만의 엽서'});
        }catch(error){
          if(error.name!=='AbortError'){
            saveFile(blob,name);
            toast('공유 대신 PNG로 저장했어요. 카톡에서 사진으로 보내면 돼요.');
          }
        }
      } else {
        saveFile(blob,name);
        toast('이 기기는 직접 공유를 지원하지 않아 PNG를 저장했어요.');
      }
    }catch(error){toast(error.message||'공유 준비에 실패했어요.');}
    finally{btn.disabled=false;}
  }

  function db(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('NO_DB'));return;}
      let req;
      try{req=indexedDB.open('elsewhere-studio-v2',1);}catch(e){reject(e);return;}
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('cards'))req.result.createObjectStore('cards',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('저장소를 열 수 없어요.'));
      req.onblocked=()=>reject(new Error('저장소가 다른 탭에 의해 잠겨 있어요.'));
    });
    return dbPromise;
  }
  async function dbAction(mode,operation){
    const database=await db();
    return new Promise((resolve,reject)=>{
      let result;
      let transaction;
      try{
        transaction=database.transaction('cards',mode);
        const req=operation(transaction.objectStore('cards'));
        req.onsuccess=()=>{result=req.result;};
        req.onerror=()=>reject(req.error||new Error('DB request failed'));
        transaction.oncomplete=()=>resolve(result);
        transaction.onabort=()=>reject(transaction.error||new Error('DB transaction aborted'));
        transaction.onerror=()=>reject(transaction.error||new Error('DB transaction failed'));
      }catch(e){reject(e);}
    });
  }
  async function readArchive(){
    try{
      archiveCards=await dbAction('readonly',store=>store.getAll());
      archiveCards.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    }catch{
      archiveCards=[];
    }
    $('archiveCount').textContent=String(archiveCards.length);
    drawArchive();
  }
  function thumbnail() {
    const full=$('postcardCanvas');
    const tiny=document.createElement('canvas');
    tiny.width=360;tiny.height=Math.round(full.height*360/full.width);
    tiny.getContext('2d').drawImage(full,0,0,tiny.width,tiny.height);
    return tiny.toDataURL('image/jpeg',.76);
  }
  async function packSource() {
    const img=await getImage(state.source);
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
    const factor=Math.min(1,1800/Math.max(iw,ih));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(iw*factor));
    canvas.height=Math.max(1,Math.round(ih*factor));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('사진을 보관함에 저장할 수 없어요.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvasToBlob(canvas,'image/jpeg',.88);
  }
  async function saveArchive() {
    const button=$('saveArchiveBtn');
    button.disabled=true;
    try{
      const blob=await imageBlob();
      if(!blob)throw new Error('사진을 만들 수 없어요.');
      if(!state.archiveId && archiveCards.length>=40)throw new Error('보관함이 가득 찼어요. 40장까지 저장할 수 있어요.');
      const sourceBlob=await packSource();
      const now=new Date().toISOString();
      const before=archiveCards.find(card=>card.id===state.archiveId);
      const card={
        id:state.archiveId||uniqueId(),createdAt:before?.createdAt||now,updatedAt:now,
        imageBlob:sourceBlob,preview:thumbnail(),
        title:state.title,note:state.note,place:state.place,mood:state.mood,
        variation:state.variation,style:state.style,date:state.date,
        titleEdited:state.titleEdited,noteEdited:state.noteEdited
      };
      await dbAction('readwrite',store=>store.put(card));
      state.archiveId=card.id;
      await readArchive();
      toast('내 엽서함에 저장했어요. 이 기기에서 다시 꺼내 볼 수 있어요. ♡');
    }catch(error){
      toast(error.message==='NO_DB'?'이 브라우저에서 보관함을 사용할 수 없어요. PNG로 저장해 주세요.':error.message||'저장에 실패했어요. 기기 공간을 확인해 주세요.');
    }finally{button.disabled=false;}
  }

  function drawArchive() {
    const container=$('archiveItems');
    if(!archiveCards.length){
      container.innerHTML='<div class="archive-empty"><span>✳</span><h3>Your story starts here.</h3>'+
        '<p>아직 보관한 엽서가 없어요.<br>사진 한 장으로 첫 장면을 만들어 보세요.</p>'+
        '<button type="button" data-archive-new>첫 엽서 만들기 ↗</button></div>';
      return;
    }
    container.innerHTML=archiveCards.map(card=>
      '<article class="archive-item">'+
      '<img src="'+escape(card.preview)+'" alt="'+escape(card.title||'나의 엽서')+' 이미지" loading="lazy">'+
      '<h3 class="archive-item-title">'+escape(card.title||'어느 날의 엽서')+'</h3>'+
      '<span class="archive-item-date">'+escape(formatDate(card.date))+'</span>'+
      '<div class="archive-item-controls"><button type="button" data-restore="'+escape(card.id)+'">다시 열기 ↗</button>'+
      '<button type="button" data-delete="'+escape(card.id)+'" aria-label="'+escape(card.title||'엽서')+' 삭제">삭제</button></div>'+
      '</article>').join('');
  }
  function openArchive(){
    formerFocus=document.activeElement;
    $('archiveOverlay').hidden=false;
    document.body.classList.add('modal-open');
    void readArchive();
    $('closeArchive').focus();
  }
  function closeArchive(){
    $('archiveOverlay').hidden=true;
    document.body.classList.remove('modal-open');
    if(formerFocus?.focus)formerFocus.focus({preventScroll:true});
  }
  async function restoreCard(card) {
    uploadRevision++;
    if(!card?.imageBlob){toast('이 엽서를 불러올 수 없어요.');return;}
    const url=URL.createObjectURL(card.imageBlob);
    const next={kind:'stored',id:null,url,blob:card.imageBlob};
    try{await getImage(next);}catch{
      URL.revokeObjectURL(url);toast('저장된 사진을 열 수 없어요.');return;
    }
    const previous=state.source;
    state.source=next;
    if(previous.kind!=='sample'&&previous.url.startsWith('blob:')){
      imageCache.delete(previous.url);URL.revokeObjectURL(previous.url);
    }
    for(const key of ['title','note','place','mood','variation','style','date','titleEdited','noteEdited']){
      if(card[key]!==undefined)state[key]=card[key];
    }
    state.archiveId=card.id;
    syncControls();closeArchive();
    await render();
    $('create').scrollIntoView({behavior:'smooth',block:'start'});
    toast('보관해 둔 엽서를 다시 열었어요. ✳');
  }
  function requestDelete(id){
    if(!archiveCards.some(card=>card.id===id))return;
    pendingDeleteId=id;
    $('confirmLayer').hidden=false;
    $('cancelConfirm').focus();
  }
  function cancelDelete(){pendingDeleteId=null;$('confirmLayer').hidden=true;$('closeArchive').focus();}
  async function deleteCard(){
    if(!pendingDeleteId)return;
    const id=pendingDeleteId;
    pendingDeleteId=null;
    $('confirmLayer').hidden=true;
    try{
      await dbAction('readwrite',store=>store.delete(id));
      if(state.archiveId===id)state.archiveId=null;
      await readArchive();
      toast('엽서를 보관함에서 지웠어요.');
      $('closeArchive').focus();
    }catch{toast('삭제에 실패했어요. 다시 시도해 주세요.');}
  }

  function bind(){
    $('photoInput').addEventListener('change',event=>{
      const file=event.target.files?.[0];
      event.target.value='';
      void readPhoto(file);
    });
    const areas=[$('dropArea'),document.querySelector('.preview-stage')];
    areas.forEach(area=>{
      area.addEventListener('dragover',event=>{event.preventDefault();area.classList.add('dragging');});
      area.addEventListener('dragleave',event=>{if(!area.contains(event.relatedTarget))area.classList.remove('dragging');});
      area.addEventListener('drop',event=>{
        event.preventDefault();area.classList.remove('dragging');
        void readPhoto(event.dataTransfer?.files?.[0]);
      });
    });
    window.addEventListener('dragover',event=>{
      if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();
    });
    window.addEventListener('drop',event=>{
      if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();
    });
    document.addEventListener('paste',event=>{
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      const file=Array.from(event.clipboardData?.files||[]).find(item=>item.type.startsWith('image/'));
      if(file){event.preventDefault();void readPhoto(file);}
    });
    $('moodList').addEventListener('click',event=>{
      const button=event.target.closest('[data-mood]');
      if(button)changeMood(button.dataset.mood);
    });
    $('titleInput').addEventListener('input',()=>{state.titleEdited=true;updateText();});
    $('noteInput').addEventListener('input',()=>{state.noteEdited=true;updateText();});
    $('placeInput').addEventListener('input',updateText);
    $('nextStyle').addEventListener('click',nextStyle);
    $('suggestText').addEventListener('click',changeSuggestion);
    $('shareBtn').addEventListener('click',()=>void share());
    $('downloadBtn').addEventListener('click',()=>void download());
    $('saveArchiveBtn').addEventListener('click',()=>void saveArchive());
    $('openArchive').addEventListener('click',openArchive);
    $('closeArchive').addEventListener('click',closeArchive);
    $('archiveMask').addEventListener('click',closeArchive);
    $('sceneGallery').addEventListener('click',event=>{
      const btn=event.target.closest('[data-scene]');
      if(btn)void chooseScene(btn.dataset.scene);
    });
    $('archiveItems').addEventListener('click',event=>{
      if(event.target.closest('[data-archive-new]')){closeArchive();$('photoInput').click();return;}
      const restore=event.target.closest('[data-restore]');
      if(restore){void restoreCard(archiveCards.find(card=>card.id===restore.dataset.restore));return;}
      const remove=event.target.closest('[data-delete]');
      if(remove)requestDelete(remove.dataset.delete);
    });
    $('cancelConfirm').addEventListener('click',cancelDelete);
    $('acceptConfirm').addEventListener('click',()=>void deleteCard());
    $('newPostcard').addEventListener('click',()=>{
      $('create').scrollIntoView({behavior:'smooth',block:'start'});
      $('photoInput').click();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(!$('confirmLayer').hidden){event.preventDefault();cancelDelete();}
        else if(!$('archiveOverlay').hidden){event.preventDefault();closeArchive();}
        return;
      }
      if(event.key==='Tab'&&!$('confirmLayer').hidden){
        const options=[$('cancelConfirm'),$('acceptConfirm')];
        const idx=options.indexOf(document.activeElement);
        if(idx!==-1){event.preventDefault();options[(idx+(event.shiftKey?-1:1)+options.length)%options.length].focus();}
      }
      if(event.key==='Tab'&&$('confirmLayer').hidden&&!$('archiveOverlay').hidden){
        const options=[$('closeArchive'),...$$('#archiveItems button:not([disabled])')];
        if(!options.length)return;
        const idx=options.indexOf(document.activeElement);
        if(idx!==-1&&((event.shiftKey&&idx===0)||(!event.shiftKey&&idx===options.length-1))){
          event.preventDefault();options[event.shiftKey?options.length-1:0].focus();
        }
      }
    });
  }
  function init(){
    setGallery();syncControls();bind();void render();void readArchive();
    if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  init();
})();
