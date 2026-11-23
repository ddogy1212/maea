/* KIN — NFC Identity Studio
 * Private local draft. Shareable URL-fragment profiles. Web NFC NDEF read/write.
 * No remote database, registration, analytics or credentials.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const KEY='kin-profile-draft-v1';
  const PICTURE={
    architecture:'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1300&q=85',
    ocean:'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1300&q=85',
    night:'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1300&q=85'
  };
  const fields=[
    ['name','nameInput',36],['role','roleInput',50],['org','orgInput',46],
    ['phone','phoneInput',30],['email','emailInput',100],['site','siteInput',180],
    ['note','noteInput',100]
  ];
  const utf8=new TextEncoder();
  const decoder=new TextDecoder('utf-8');
  let toastHandle;
  let qrInstance=null;
  let previousQr='';
  let currentMode='card';
  let tagType='card';
  let tagCapacity=144;
  let tagMode='auto';
  let nfcPending=null;
  let scanAbort=null;
  let helpReturn=null;
  let isVisitor=false;
  let cardShareLink='';
  let readRecords=[];
  let data={
    name:'',role:'',org:'',phone:'',email:'',site:'',note:'',theme:'architecture'
  };

  const utfBytes=s=>utf8.encode(String(s||'')).length;
  const trim=(s,length)=>String(s??'').trim().slice(0,length);
  const safeTheme=s=>Object.hasOwn(PICTURE,s)?s:'architecture';
  const normalizeProfile=raw=>{
    const p={};
    for(const [field,,max] of fields)p[field]=trim(raw?.[field],max);
    p.theme=safeTheme(raw?.theme);
    return p;
  };
  const startsProtocol=value=>/^(https?:)\/\//i.test(value);
  function safeWebsite(value) {
    const s=trim(value,180);
    if(!s)return '';
    if(/^[a-z][a-z0-9+.-]*:/i.test(s)&&!startsProtocol(s))return '';
    const url=startsProtocol(s)?s:'https://'+s;
    try {
      const parsed=new URL(url);
      if(!['https:','http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password)return '';
      return parsed.href;
    }catch{return '';}
  }
  const siteLabel=s=>{
    try{
      const url=new URL(safeWebsite(s));
      return url.hostname.replace(/^www\./,'')+(url.pathname==='/'?'':url.pathname).slice(0,55);
    }catch{return '';}
  };
  const cleanPhone=s=>String(s||'').replace(/[^\d+*#]/g,'').slice(0,30);
  const cleanEmail=s=>{
    const value=trim(s,100);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?value:'';
  };

  function packProfile(profile,compact=false) {
    const p=normalizeProfile(profile);
    let role=p.role,org=p.org,phone=p.phone,email=p.email,site=safeWebsite(p.site),note=p.note;
    if(compact){
      role='';org='';note='';
      if(phone){email='';site='';}
      else if(email){site='';}
    }
    const array=[p.name,role,org,phone,email,site,note,p.theme];
    const bytes=utf8.encode(JSON.stringify(array));
    let binary='';
    for(const byte of bytes)binary+=String.fromCharCode(byte);
    const b64=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return b64;
  }
  function unpackProfile(encoded) {
    if(!/^[A-Za-z0-9_-]{8,2400}$/.test(encoded||''))return null;
    try {
      const base=encoded.replace(/-/g,'+').replace(/_/g,'/');
      const binary=atob(base+'='.repeat((4-base.length%4)%4));
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const payload=JSON.parse(decoder.decode(bytes));
      if(!Array.isArray(payload)||payload.length!==8)return null;
      if(payload.some(value=>typeof value!=='string'))return null;
      const [name,role,org,phone,email,site,note,theme]=payload;
      const data=normalizeProfile({name,role,org,phone,email,site,note,theme});
      return data.name?data:null;
    }catch{return null;}
  }
  function baseUrl() {
    const url=new URL(location.href);
    url.hash='';url.search='';
    return url.href;
  }
  function linkFor(profile,compact=false) {
    return baseUrl()+'#c='+packProfile(profile,compact);
  }
  function ndefEstimate(payload) {
    if(!payload?.data)return 0;
    // Conservative estimation; URI records can use NFC URI prefix compression,
    // while tag TLV and actual record headers vary by chip and format.
    const overhead=payload.recordType==='text'?20:14;
    return utfBytes(payload.data)+overhead;
  }
  function getCardVariant(mode,capacity=tagCapacity) {
    const p=normalizeProfile(data);
    if(!p.name)return {error:'명함을 먼저 만들고 이름을 적어 주세요.'};
    const full={recordType:'url',data:linkFor(p,false),description:'전체 디지털 명함'};
    const compact={recordType:'url',data:linkFor(p,true),description:'간단 명함 (이름·연락처)'};
    if(mode==='full')return full;
    if(mode==='compact')return compact;
    return ndefEstimate(full)<=capacity?full:compact;
  }
  function getTagPayload() {
    let result;
    if(tagType==='card')result=getCardVariant(tagMode,tagCapacity);
    else if(tagType==='url'){
      const raw=$('tagUrl').value.trim();
      const valid=safeWebsite(raw);
      result=valid?{recordType:'url',data:valid,description:'웹사이트 주소'}:
        {error:'https:// 로 시작하는 유효한 웹사이트 주소를 입력해 주세요.'};
    } else {
      const content=$('tagText').value.trim();
      result=content?{recordType:'text',data:content,description:'텍스트 메모'}:
        {error:'기록할 메모를 입력해 주세요.'};
    }
    if(result.error)return {...result,bytes:0,fits:false};
    const bytes=ndefEstimate(result);
    return {...result,bytes,fits:bytes<=tagCapacity};
  }
  function prettySize(n){return n.toLocaleString('ko-KR')+'B';}
  const bytesText=n=>prettySize(n);
  function toast(message) {
    const node=$('toast');
    node.textContent=message;
    node.classList.add('show');
    clearTimeout(toastHandle);
    toastHandle=setTimeout(()=>node.classList.remove('show'),3500);
  }

  function loadDraft() {
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY)||'null');
      if(parsed && typeof parsed==='object')data=normalizeProfile(parsed);
    }catch{}
  }
  function saveDraft() {
    try{localStorage.setItem(KEY,JSON.stringify(data));}
    catch{ /* In private-browsing contexts, persistence can be unavailable. */ }
  }
  function syncEditor() {
    for(const [field,id] of fields)$(id).value=data[field];
    $$('.theme-choice').forEach(button=>{
      const active=button.dataset.theme===data.theme;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function syncCard() {
    $('previewName').textContent=data.name||'Your name here.';
    $('previewRole').textContent=data.role||'A SMALL CARD. A BIG FIRST IMPRESSION.';
    $('previewOrg').textContent=(data.org||'AN INTRODUCTION, REIMAGINED').toUpperCase();
    $('previewSite').textContent=siteLabel(data.site)||'KIN / DIGITAL CONTACT';
    $('cardArtwork').dataset.theme=data.theme;
    cardShareLink=data.name?linkFor(data,false):'';
    $('shareCard').disabled=!data.name;
    $('downloadVcf').disabled=!data.name;
    $('copyLink').disabled=!data.name;
    $('saveQr').disabled=!data.name;
    $('writeCardNfc').disabled=!data.name;
    $('linkSummary').textContent=data.name?'받는 사람이 링크를 열면 연락처를 저장할 수 있어요.':'이름을 적으면 QR 공유 링크가 만들어져요.';
    renderQr(cardShareLink);
    renderCapacity();
  }
  function handleProfileInput(event){
    const input=event.target;
    const info=fields.find(entry=>entry[1]===input.id);
    if(!info)return;
    data[info[0]]=trim(input.value,info[2]);
    saveDraft();
    syncCard();
  }
  function setTheme(theme){
    data.theme=safeTheme(theme);
    saveDraft();syncEditor();syncCard();
  }
  function renderQr(value){
    const holder=$('qrCode');
    if(value===previousQr)return;
    previousQr=value;
    qrInstance=null;
    holder.replaceChildren();
    if(!value){
      const label=document.createElement('span');
      label.textContent='이름을 입력하면 QR이 생성됩니다.';
      holder.appendChild(label);
      return;
    }
    if(typeof QRCode==='undefined'){
      const label=document.createElement('span');
      label.textContent='QR 생성 모듈을 불러오지 못했어요. 링크 복사를 이용해 주세요.';
      holder.appendChild(label);
      return;
    }
    try{
      qrInstance=new QRCode(holder,{
        text:value,width:116,height:116,
        colorDark:'#1a2d20',colorLight:'#ffffff',
        correctLevel:QRCode.CorrectLevel.M
      });
    }catch{
      holder.replaceChildren();
      const label=document.createElement('span');
      label.textContent='QR에 담을 정보가 너무 길어요. 내용을 줄이거나 링크를 복사해 주세요.';
      holder.appendChild(label);
    }
  }

  async function downloadQr() {
    if(!cardShareLink){toast('먼저 명함에 이름을 입력해 주세요.');return;}
    const canvas=$('qrCode').querySelector('canvas');
    if(!canvas || !canvas.toBlob){toast('QR 모듈을 불러오지 못했어요. 링크 공유를 이용해 주세요.');return;}
    try{
      const blob=await new Promise((resolve,reject)=>{
        canvas.toBlob(result=>result?resolve(result):reject(new Error('QR export')),'image/png');
      });
      const name=(data.name||'contact').replace(/[^a-zA-Z0-9가-힣_-]/g,'-').slice(0,35);
      saveBlob(blob,'kin-qr-'+name+'.png');
      toast('QR 코드를 PNG로 저장했어요.');
    }catch{toast('QR 이미지 저장에 실패했어요. 링크를 복사해 주세요.');}
  }
  function vcard(profile) {
    const p=normalizeProfile(profile);
    const vEscape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const lines=['BEGIN:VCARD','VERSION:3.0','FN:'+vEscape(p.name)];
    if(p.org)lines.push('ORG:'+vEscape(p.org));
    if(p.role)lines.push('TITLE:'+vEscape(p.role));
    if(p.phone)lines.push('TEL;TYPE=CELL:'+vEscape(p.phone));
    if(cleanEmail(p.email))lines.push('EMAIL;TYPE=INTERNET:'+vEscape(cleanEmail(p.email)));
    if(safeWebsite(p.site))lines.push('URL:'+vEscape(safeWebsite(p.site)));
    if(p.note)lines.push('NOTE:'+vEscape(p.note));
    lines.push('END:VCARD');
    return lines.join('\r\n')+'\r\n';
  }
  function saveBlob(blob,filename){
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2200);
  }
  function downloadContact(profile) {
    const p=normalizeProfile(profile);
    if(!p.name){toast('먼저 명함에 이름을 적어 주세요.');return;}
    const filename=(p.name||'contact').replace(/[/\\:*?"<>|\x00-\x1f]/g,'').slice(0,40)||'contact';
    saveBlob(new Blob([vcard(p)],{type:'text/vcard;charset=utf-8'}),filename+'.vcf');
    toast('연락처 파일을 저장했어요.');
  }
  async function copyText(text){
    if(!text)return false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);return true;
      }
    }catch{}
    const field=document.createElement('textarea');
    field.value=text;field.readOnly=true;field.style.position='fixed';field.style.opacity='0';
    document.body.appendChild(field);field.select();
    let success=false;
    try{success=document.execCommand('copy');}catch{}
    field.remove();return success;
  }
  function sendShare(url,title='KIN — Digital Identity') {
    if(!url)return;
    if(navigator.share){
      navigator.share({title,url}).catch(error=>{
        if(error?.name!=='AbortError')copyText(url).then(ok=>toast(ok?'공유 대신 링크를 복사했어요.':'공유할 수 없어요. 링크 복사를 이용해 주세요.'));
      });
    }else copyText(url).then(ok=>toast(ok?'공유 링크를 복사했어요.':'클립보드 접근에 실패했어요.'));
  }

  function renderCapacity() {
    const payload=getTagPayload();
    const measure=payload.bytes||0;
    $('capacityNumber').textContent=payload.error?'— / '+tagCapacity+'B':prettySize(measure)+' / '+tagCapacity+'B';
    const percent=Math.min(100,Math.round(measure/tagCapacity*100));
    $('capacityFill').style.width=percent+'%';
    $('capacityFill').classList.toggle('warning',!payload.fits&&!!measure);
    const notice=$('capacityNotice');
    notice.classList.toggle('error',!payload.fits||!!payload.error);
    if(payload.error)notice.textContent=payload.error;
    else if(payload.fits)notice.textContent=payload.description+' · 예상 용량 이내예요. 실제 태그 유형에 따라 기록 가능 여부는 달라질 수 있어요.';
    else notice.textContent='예상 '+prettySize(measure)+'로 현재 기준을 넘어요. 간단 명함이나 짧은 URL을 선택하세요.';
    $('writeNfc').disabled=!!payload.error||!payload.fits;
    $('copyTagPayload').disabled=!!payload.error;
  }
  function setTab(tab) {
    currentMode=tab==='tag'?'tag':'card';
    $('cardPanel').hidden=currentMode!=='card';
    $('tagPanel').hidden=currentMode!=='tag';
    $$('.mode-tab').forEach(button=>{
      const active=button.dataset.tab===currentMode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    renderCapacity();
  }
  function setTagType(type) {
    tagType=['card','url','text'].includes(type)?type:'card';
    $$('.tag-type').forEach(button=>{
      const active=button.dataset.tagType===tagType;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('cardTagOptions').hidden=tagType!=='card';
    $('urlTagOptions').hidden=tagType!=='url';
    $('textTagOptions').hidden=tagType!=='text';
    renderCapacity();
  }
  function nfcSupported(){
    return !!(window.isSecureContext && 'NDEFReader' in window);
  }
  function nfcError(error){
    const name=String(error?.name||'');
    if(name==='NotAllowedError')return 'NFC 접근 권한을 허용해야 기록할 수 있어요.';
    if(name==='NotSupportedError')return '이 기기나 태그는 Web NFC를 지원하지 않아요.';
    if(name==='NotReadableError')return '태그를 읽지 못했어요. NFC를 켜고 다시 대보세요.';
    if(name==='AbortError')return 'NFC 작업이 취소됐어요.';
    if(name==='NetworkError')return '태그와 연결할 수 없어요. 위치를 다시 맞춰보세요.';
    return '기록·읽기에 실패했어요. 태그 용량, 잠금 상태와 NFC 권한을 확인해 주세요.';
  }
  function status(text,mode=''){
    const el=$('nfcStatus');
    el.textContent=text;
    el.classList.remove('error','success');
    if(mode)el.classList.add(mode);
  }
  function requestNfcWrite(){
    const payload=getTagPayload();
    if(payload.error){toast(payload.error);return;}
    if(!payload.fits){toast('먼저 태그 용량에 맞게 내용을 줄여 주세요.');return;}
    if(!nfcSupported()){
      status('현재 환경에서는 Web NFC를 사용할 수 없어요. Android Chrome의 HTTPS 주소에서 열어 주세요.','error');
      toast('이 브라우저는 NFC 기록을 지원하지 않아요. QR·링크 공유는 사용할 수 있어요.');
      return;
    }
    nfcPending=payload;
    $('confirmHeading').textContent='이 내용을 태그에 기록할까요?';
    $('confirmBody').textContent=payload.description+' · 예상 '+prettySize(payload.bytes)+' · 기존 태그 내용이 덮어써질 수 있어요.';
    $('confirmLayer').hidden=false;
    $('cancelWrite').focus();
  }
  function cancelWrite(){
    nfcPending=null;
    $('confirmLayer').hidden=true;
    $('writeNfc').focus();
  }
  async function commitNfcWrite(){
    const current=nfcPending;
    nfcPending=null;
    $('confirmLayer').hidden=true;
    if(!current)return;
    if(!nfcSupported()){status('NFC를 지원하지 않는 브라우저예요.','error');return;}
    const write=$('writeNfc');
    write.disabled=true;
    status('NFC 준비 중 — 휴대폰 뒷면에 태그를 가까이 대세요.');
    try{
      const reader=new NDEFReader();
      const record=current.recordType==='text'
        ?{recordType:'text',data:current.data,lang:'ko'}
        :{recordType:'url',data:current.data};
      await reader.write({records:[record]});
      status('NFC 기록 완료! 다른 NFC 리더로 내용을 확인해 볼 수 있어요.','success');
      toast('태그에 기록했어요. ✳');
    }catch(error){
      status(nfcError(error),'error');
      toast(nfcError(error));
    }finally{renderCapacity();}
  }
  async function startScan(){
    if(!nfcSupported()){
      status('이 브라우저에서는 NFC 스캔을 지원하지 않아요.','error');
      toast('Android Chrome에서 HTTPS로 열어 주세요.');
      return;
    }
    if(scanAbort)scanAbort.abort();
    const controller=new AbortController();
    scanAbort=controller;
    $('scanNfc').disabled=true;
    $('stopScan').hidden=false;
    const result=$('scanResult');
    result.hidden=false;
    result.textContent='NFC 스캔 준비 중. 휴대폰 뒷면에 태그를 대세요.';
    try{
      const reader=new NDEFReader();
      reader.onreading=event=>{
        if(scanAbort!==controller)return;
        const serial=event.serialNumber||'번호가 없는 태그';
        readRecords=[];
        for(const rec of event.message.records){
          let text;
          try{text=new TextDecoder(rec.encoding||'utf-8').decode(rec.data);}
          catch{text='내용을 읽을 수 없는 레코드';}
          readRecords.push({type:rec.recordType,value:text});
        }
        result.replaceChildren();
        const head=document.createElement('strong');
        head.textContent='태그 인식 완료 · '+serial;
        result.appendChild(head);
        for(const record of readRecords){
          const p=document.createElement('div');
          p.textContent=record.type.toUpperCase()+' / '+record.value.slice(0,1500);
          result.appendChild(p);
          if(record.type==='url' && /^https?:\/\//i.test(record.value)){
            try{
              const parsed=new URL(record.value);
              if(['https:','http:'].includes(parsed.protocol)){
                const a=document.createElement('a');
                a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';
                a.textContent='이 링크 열기 ↗';
                result.appendChild(a);
              }
            }catch{}
          }
        }
        if(!readRecords.length){
          const p=document.createElement('div');p.textContent='저장된 NDEF 레코드가 없어요.';result.appendChild(p);
        }
      };
      reader.onreadingerror=()=>{result.textContent='태그 정보를 읽지 못했어요. 다시 대보세요.';};
      await reader.scan({signal:controller.signal});
      result.textContent='스캔 중입니다. 휴대폰 뒷면에 NFC 태그를 대세요.';
    }catch(error){
      result.textContent=nfcError(error);
      $('scanNfc').disabled=false;
      $('stopScan').hidden=true;
      if(scanAbort===controller)scanAbort=null;
    }
  }
  function stopScan(){
    if(scanAbort){scanAbort.abort();scanAbort=null;}
    $('scanNfc').disabled=false;
    $('stopScan').hidden=true;
    status('스캔을 중지했어요.');
  }
  function showHelp() {
    helpReturn=document.activeElement;
    $('helpLayer').hidden=false;
    document.body.classList.add('locked');
    $('closeHelp').focus();
  }
  function closeHelp(){
    $('helpLayer').hidden=true;
    document.body.classList.remove('locked');
    if(helpReturn?.focus)helpReturn.focus({preventScroll:true});
  }

  function publicLink(url,label,display) {
    const a=document.createElement('a');
    a.href=url;a.target=url.startsWith('http')?'_blank':'_self';
    if(a.target==='_blank')a.rel='noopener noreferrer';
    const left=document.createElement('span'),center=document.createElement('strong'),arrow=document.createElement('span');
    left.textContent=label;center.textContent=display;arrow.textContent='↗';
    a.append(left,center,arrow);
    return a;
  }
  function showVisitor(profile){
    const p=normalizeProfile(profile);
    isVisitor=true;
    $('studioApp').hidden=true;
    $('publicView').hidden=false;
    $('publicName').textContent=p.name;
    $('publicRole').textContent=p.role||'NICE TO MEET YOU.';
    $('publicOrg').textContent=p.org||'A PERSONAL INTRODUCTION';
    $('publicNote').textContent=p.note||'';
    $('publicNote').hidden=!p.note;
    $('publicArtwork').querySelector('.public-photo').style.backgroundImage='url("'+PICTURE[p.theme]+'")';
    $('publicLinks').replaceChildren();
    const phone=cleanPhone(p.phone),email=cleanEmail(p.email),site=safeWebsite(p.site);
    if(phone)$('publicLinks').appendChild(publicLink('tel:'+phone,'PHONE',p.phone));
    if(email)$('publicLinks').appendChild(publicLink('mailto:'+email,'EMAIL',email));
    if(site)$('publicLinks').appendChild(publicLink(site,'WEB',siteLabel(site)));
    const hasContact=!!(phone||email||site);
    if(!hasContact){
      const p=document.createElement('p');
      p.textContent='이 명함에 공개된 연락 방법이 없어요.';
      $('publicLinks').appendChild(p);
    }
    $('publicSave').addEventListener('click',()=>downloadContact(profile));
    $('publicShare').addEventListener('click',()=>sendShare(location.href,'KIN / '+p.name));
  }

  function bind(){
    fields.forEach(([,id])=>$(id).addEventListener('input',handleProfileInput));
    $$('.theme-choice').forEach(button=>button.addEventListener('click',()=>setTheme(button.dataset.theme)));
    $('shareCard').addEventListener('click',()=>{
      if(!data.name){toast('명함에 이름을 먼저 입력해 주세요.');return;}
      if(cardShareLink.length>2100){toast('명함 정보가 너무 길어요. 소개 문구를 조금 줄여 주세요.');return;}
      sendShare(cardShareLink,'KIN / '+data.name);
    });
    $('downloadVcf').addEventListener('click',()=>downloadContact(data));
    $('saveQr').addEventListener('click',()=>void downloadQr());
    $('copyLink').addEventListener('click',async()=>{
      const success=await copyText(cardShareLink);
      toast(success?'명함 링크를 복사했어요.':'복사에 실패했어요. HTTPS 환경인지 확인해 주세요.');
    });
    $('writeCardNfc').addEventListener('click',()=>{
      tagType='card';setTagType('card');setTab('tag');
      document.querySelector('.tool').scrollIntoView({behavior:'smooth',block:'start'});
      $('writeNfc').focus({preventScroll:true});
      toast('태그 용량을 확인한 뒤 아래 기록 버튼을 누르세요.');
    });
    $$('.mode-tab').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
    $$('.tag-type').forEach(button=>button.addEventListener('click',()=>setTagType(button.dataset.tagType)));
    $('cardTagMode').addEventListener('change',event=>{tagMode=event.target.value;renderCapacity();});
    $('tagCapacity').addEventListener('change',event=>{tagCapacity=Number(event.target.value);renderCapacity();});
    $('tagUrl').addEventListener('input',renderCapacity);
    $('tagText').addEventListener('input',renderCapacity);
    $('writeNfc').addEventListener('click',requestNfcWrite);
    $('cancelWrite').addEventListener('click',cancelWrite);
    $('confirmWrite').addEventListener('click',()=>void commitNfcWrite());
    $('copyTagPayload').addEventListener('click',async()=>{
      const payload=getTagPayload();
      if(payload.error){toast(payload.error);return;}
      const ok=await copyText(payload.data);
      toast(ok?'태그에 담을 내용을 복사했어요.':'클립보드에 복사하지 못했어요.');
    });
    $('scanNfc').addEventListener('click',()=>void startScan());
    $('stopScan').addEventListener('click',stopScan);
    for(const id of ['aboutBtn','showHelp'])$(id).addEventListener('click',showHelp);
    for(const id of ['closeHelp','closeHelpShade','helpOkay'])$(id).addEventListener('click',closeHelp);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(!$('confirmLayer').hidden){event.preventDefault();cancelWrite();}
        else if(!$('helpLayer').hidden){event.preventDefault();closeHelp();}
      }
      if(event.key==='Tab'){
        const modal=$('confirmLayer').hidden?$('helpLayer').hidden?null:$('helpLayer'):$('confirmLayer');
        if(!modal)return;
        const focusable=[...modal.querySelectorAll('button:not([disabled])')];
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden && scanAbort)stopScan();
    });
    window.addEventListener('hashchange',()=>{
      if(location.hash.startsWith('#c=')){
        const profile=unpackProfile(location.hash.slice(3));
        if(profile && !isVisitor)showVisitor(profile);
      }
    });
  }

  function init(){
    const fragment=location.hash;
    if(fragment.startsWith('#c=')){
      const profile=unpackProfile(fragment.slice(3));
      if(profile){showVisitor(profile);return;}
      toast('명함 링크가 올바르지 않아 새 명함 만들기 화면을 열었어요.');
      history.replaceState(null,'',baseUrl());
    }
    loadDraft();
    syncEditor();syncCard();setTab('card');setTagType('card');bind();
    status(nfcSupported()
      ?'이 브라우저는 Web NFC를 지원합니다. NFC가 켜져 있는지 확인해 주세요.'
      :'NFC 기록은 지원되는 Android Chrome의 HTTPS 환경에서만 가능합니다.');
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  init();
})();
