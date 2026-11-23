/* AHEAD — offline-first task capture, deadline board and focus room.
 * No analytics, no network APIs, no frameworks or remote persistence.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const KEY='ahead-workbench-v1';
  const MAX_TASKS=500;
  const MAX_IMPORT_BYTES=3*1024*1024;
  const MAX_LINES=20;
  const allowedCategories=['일반','학교','국어','수학','영어','러시아어','과학','사회','개인'];
  const weekdayMap={'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6};
  const weekdayKorean=['일','월','화','수','목','금','토'];
  const emptyData=()=>({tasks:[],sessions:[],focus:{taskId:null,totalSec:1500,remainingSec:1500,running:false,endAt:null},version:1});
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID
    ?crypto.randomUUID():'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const validDate=(y,m,d)=>y>=1900&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31&&
    new Date(y,m-1,d).getFullYear()===y&&new Date(y,m-1,d).getMonth()===m-1&&new Date(y,m-1,d).getDate()===d;
  const dateString=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const today=()=>dateString(new Date());
  const dateShift=(date,num)=>{
    const [y,m,d]=date.split('-').map(Number);
    const out=new Date(y,m-1,d);
    out.setDate(out.getDate()+num);
    return dateString(out);
  };
  const fromISO=date=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
    const [y,m,d]=date.split('-').map(Number);
    return validDate(y,m,d)?new Date(y,m-1,d):null;
  };
  const formatDate=s=>{
    const date=fromISO(s);
    if(!date)return '날짜 없음';
    const diff=Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) -
      Date.UTC(...today().split('-').map((v,i)=>i===1?Number(v)-1:Number(v))))/86400000);
    if(diff===0)return '오늘';
    if(diff===1)return '내일';
    if(diff===-1)return '어제';
    return date.getMonth()+1+'/'+date.getDate()+' ('+weekdayKorean[date.getDay()]+')';
  };
  const minutesText=mins=>mins>=60?Math.floor(mins/60)+'시간'+(mins%60?' '+mins%60+'분':''):mins+'분';
  const dateAt=(date,time)=>fromISO(date) ? (date+'T'+(time||'23:59')+':00') : null;

  function parseTime(input) {
    const s=input;
    let match=s.match(/(?:오전|오후)\s*(\d{1,2})\s*시(?:\s*(반|\d{1,2}\s*분))?/);
    if(match){
      let hours=Number(match[1]);const pm=match[0].startsWith('오후');
      if(hours<1||hours>12)return {value:null,raw:null};
      hours=(hours%12)+(pm?12:0);
      const mins=match[2] ? (match[2]==='반'?30:Number(match[2].replace('분','').trim())):0;
      if(mins<0||mins>59)return {value:null,raw:null};
      return {value:String(hours).padStart(2,'0')+':'+String(mins).padStart(2,'0'),raw:match[0]};
    }
    match=s.match(/(?:^|\s|[([])([01]?\d|2[0-3]):([0-5]\d)(?=$|\s|까지|마감|\)|\]|[,.!?])/);
    if(match)return{value:match[1].padStart(2,'0')+':'+match[2],raw:match[0].trim()};
    match=s.match(/(?:^|\s)([01]?\d|2[0-3])시(?=$|\s|까지|마감)/);
    if(match)return{value:match[1].padStart(2,'0')+':00',raw:match[0].trim()};
    return{value:null,raw:null};
  }

  function parseDate(input, reference=new Date()) {
    const s=String(input);
    const current=dateString(reference);
    let m;
    if((m=s.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:일)?\b/))){
      const y=+m[1],mo=+m[2],day=+m[3];
      return validDate(y,mo,day)?{value:dateString(new Date(y,mo-1,day)),raw:m[0],kind:'explicit'}:null;
    }
    if((m=s.match(/\b(\d{1,2})\s*월\s*(\d{1,2})\s*일/))){
      const mo=+m[1],day=+m[2];let year=reference.getFullYear();
      if(validDate(year,mo,day)){
        // Interpret far-past month/day as the next occurrence; preserve dates from the last 30 days.
        const candidate=dateString(new Date(year,mo-1,day));
        if(candidate<dateShift(current,-30))year++;
        if(validDate(year,mo,day))return{value:dateString(new Date(year,mo-1,day)),raw:m[0],kind:'inferred-year'};
      }
      return null;
    }
    if((m=s.match(/(?:^|[^\d])(\d{1,2})[./](\d{1,2})(?=$|[^\d./])/))){
      const mo=+m[1],day=+m[2];let year=reference.getFullYear();
      if(validDate(year,mo,day)){
        if(dateString(new Date(year,mo-1,day))<dateShift(current,-30))year++;
        if(validDate(year,mo,day))return{value:dateString(new Date(year,mo-1,day)),raw:m[0].trim(),kind:'inferred-year'};
      }
    }
    if(s.includes('모레'))return{value:dateShift(current,2),raw:'모레',kind:'relative'};
    if(s.includes('내일'))return{value:dateShift(current,1),raw:'내일',kind:'relative'};
    if(s.includes('오늘'))return{value:current,raw:'오늘',kind:'relative'};
    m=s.match(/(다음\s*주|이번\s*주)?\s*([월화수목금토일])요일/);
    if(m){
      const target=weekdayMap[m[2]];
      const d=new Date(reference.getFullYear(),reference.getMonth(),reference.getDate());
      const thisMondayShift=(d.getDay()+6)%7;
      d.setDate(d.getDate()-thisMondayShift);
      if(m[1]?.replace(/\s/g,'')==='다음주')d.setDate(d.getDate()+7);
      d.setDate(d.getDate()+(target+6)%7);
      if(!m[1]&&dateString(d)<current)d.setDate(d.getDate()+7);
      return{value:dateString(d),raw:m[0].trim(),kind:'weekday'};
    }
    return null;
  }

  function detectCategory(text) {
    const prefix=String(text).match(/^\s*(?:\[|【)?\s*(국어|수학|영어|러시아어|과학|사회|학교|개인)(?:\]|】|:|\s|$)/);
    if(prefix)return prefix[1];
    const anywhere=String(text).match(/(?:^|\s)(국어|수학|영어|러시아어|과학|사회)(?=\s|$)/);
    if(anywhere)return anywhere[1];
    if(/동아리|선생님|수행평가|숙제|시험|과제/.test(text))return'학교';
    return'일반';
  }
  function detectEstimate(text) {
    let match=text.match(/(?:예상|소요|공부|집중|작업|복습|걸리는\s*시간)\s*[:=]?\s*(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분)?/);
    if(!match)match=text.match(/(?:^|\s)(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분)?(?=$|\s|정도|예상|소요)/);
    if(match)return Math.min(240,Math.max(5,Number(match[1])*60+Number(match[2]||0)));
    match=text.match(/(?:^|\s)(\d{1,3})\s*분(?:\s*(?:정도|소요|예상))?(?=$|\s|[,.!])/);
    return match ? Math.min(240,Math.max(5,Number(match[1]))) : 25;
  }
  function parseLine(input, reference=new Date()) {
    const original=String(input).trim().replace(/^[\s\-•·▪◦*]+/,'').replace(/^\d{1,2}[.)]\s*/,'').trim();
    if(!original)return null;
    const date=parseDate(original,reference);
    const time=date?parseTime(original):{value:null,raw:null};
    const estimate=detectEstimate(time.raw?original.replace(time.raw,' '):original);
    const important=/^(?:!+|★|긴급|중요)|\[긴급\]|\[중요\]/.test(original);
    let title=original
      .replace(/^[!★\s]+/,'')
      .replace(/^(?:\[(?:긴급|중요)\]|(?:긴급|중요)\s*[:：]?)\s*/,'');
    if(date?.raw)title=title.replace(date.raw,' ');
    if(time.raw)title=title.replace(time.raw,' ');
    // Remove isolated duration only when it was provided as an estimated effort.
    title=title.replace(/(?:예상|소요)\s*[:=]?\s*\d+\s*(?:시간|분)(?:\s*\d+\s*분)?/g,' ');
    title=title.replace(/\s+\d+\s*(?:시간|분)(?:\s*\d+\s*분)?(?:\s*(?:정도|소요|예상))?$/,' ');
    title=title.replace(/\s*(?:까지|마감|제출)\s*$/,' ').replace(/\s+/g,' ').trim();
    if(!title)title=original.slice(0,140);
    if(title.length>140)title=title.slice(0,137)+'…';
    const dueDate=date?.value||null;
    const referenceToday=dateString(reference);
    return{
      title,
      category:detectCategory(original),
      dueDate,
      dueTime:date?time.value:null,
      estimate,
      priority:important,
      today:!dueDate||dueDate<=referenceToday,
      inferredDate:date?.kind==='inferred-year'||date?.kind==='weekday'
    };
  }
  function parseInput(raw,reference=new Date()) {
    const lines=String(raw||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    return {entries:lines.slice(0,MAX_LINES).map(line=>parseLine(line,reference)).filter(Boolean),skipped:Math.max(0,lines.length-MAX_LINES)};
  }

  function normalizeTask(input){
    if(!input||typeof input!=='object')return null;
    const title=String(input.title||'').trim().slice(0,140);
    if(!title)return null;
    const dueDate=fromISO(input.dueDate)?input.dueDate:null;
    const dueTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime||'')?input.dueTime:null;
    return{
      id:String(input.id||uid()).slice(0,100),
      title,category:allowedCategories.includes(input.category)?input.category:'일반',
      dueDate,dueTime:dueDate?dueTime:null,
      estimate:Math.max(5,Math.min(240,Number(input.estimate)||25)),
      priority:!!input.priority,today:!!input.today,done:!!input.done,
      createdAt:typeof input.createdAt==='string'?input.createdAt:new Date().toISOString(),
      updatedAt:typeof input.updatedAt==='string'?input.updatedAt:new Date().toISOString(),
      completedAt:typeof input.completedAt==='string'?input.completedAt:null
    };
  }

  function normalizeSession(input){
    if(!input||typeof input!=='object')return null;
    const timestamp=new Date(input.at||'');
    const minutes=Math.round(Number(input.minutes));
    if(!Number.isFinite(timestamp.getTime())||!Number.isFinite(minutes)||minutes<1||minutes>240)return null;
    return{
      id:String(input.id||uid()).slice(0,100),
      at:timestamp.toISOString(),
      minutes,
      taskId:typeof input.taskId==='string'?input.taskId.slice(0,100):null
    };
  }

  function loadData() {
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY)||'null');
      if(!parsed||!Array.isArray(parsed.tasks))return emptyData();
      const cleaned=parsed.tasks.slice(0,MAX_TASKS).map(normalizeTask).filter(Boolean);
      const sessions=Array.isArray(parsed.sessions)?parsed.sessions.slice(-600).map(normalizeSession).filter(Boolean):[];
      const rawFocus=parsed.focus||{};
      const total=[1500,2700,3600].includes(rawFocus.totalSec)?rawFocus.totalSec:1500;
      let remaining=Math.max(0,Math.min(total,Number(rawFocus.remainingSec)||total));
      return{
        version:1,tasks:cleaned,sessions,
        focus:{
          taskId:typeof rawFocus.taskId==='string'?rawFocus.taskId:null,
          totalSec:total,
          remainingSec:remaining,
          running:!!rawFocus.running&&Number.isFinite(rawFocus.endAt),
          endAt:Number.isFinite(rawFocus.endAt)?rawFocus.endAt:null
        }
      };
    }catch{return emptyData();}
  }
  const data=loadData();
  let view='today';
  let modalReturnFocus=null;
  let selectedDelete=null;
  let confirmResolver=null;
  let currentPreview={entries:[],skipped:0};
  let timerTick=null;
  let toastTimer=null;
  let lastDay=today();

  function persist(showError=true) {
    try{
      data.sessions=data.sessions.slice(-600);
      localStorage.setItem(KEY,JSON.stringify(data));
      return true;
    }catch{
      if(showError)toast('저장 공간에 문제가 있어요. 백업 파일을 먼저 받아 주세요.');
      return false;
    }
  }
  function toast(message) {
    const node=$('toast');
    node.textContent=message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.classList.remove('visible'),3300);
  }

  function score(task) {
    if(task.done)return Number.MAX_SAFE_INTEGER;
    const date=task.dueDate;
    const days=date?(Date.UTC(...date.split('-').map((v,i)=>i===1?Number(v)-1:Number(v)))-
      Date.UTC(...today().split('-').map((v,i)=>i===1?Number(v)-1:Number(v))))/86400000:999;
    const minute=task.dueTime?Number(task.dueTime.slice(0,2))*60+Number(task.dueTime.slice(3)):1439;
    return Math.max(-10,days)*1440+minute+(task.priority?-200:0)+(task.today?-25:0);
  }
  const sorted=tasks=>tasks.sort((a,b)=>score(a)-score(b)||
    Number(!!b.priority)-Number(!!a.priority)||
    String(a.createdAt).localeCompare(String(b.createdAt)));
  function belongsToday(task){
    return !task.done&&(task.today||!!(task.dueDate&&task.dueDate<=today()));
  }
  function belongsUpcoming(task){
    return !task.done&&!!(task.dueDate&&task.dueDate>today())&&!task.today;
  }
  function tasksForView(){
    if(view==='done')return data.tasks.filter(task=>task.done).sort((a,b)=>
      String(b.completedAt||'').localeCompare(String(a.completedAt||'')));
    if(view==='all')return sorted(data.tasks.filter(task=>!task.done));
    if(view==='upcoming')return sorted(data.tasks.filter(belongsUpcoming));
    return sorted(data.tasks.filter(belongsToday));
  }

  function renderPreview(){
    const input=$('captureInput').value;
    currentPreview=parseInput(input);
    const entries=currentPreview.entries;
    $('addTasks').disabled=!entries.length||data.tasks.length>=MAX_TASKS;
    $('addLabel').textContent=entries.length?'할 일 '+entries.length+'개 추가':'할 일 추가하기';
    $('captureHint').textContent=data.tasks.length>=MAX_TASKS
      ?'할 일을 500개까지 저장할 수 있어요.'
      :currentPreview.skipped?'한 번에 최대 '+MAX_LINES+'줄까지 추가할 수 있어요.'
      :entries.some(e=>e.inferredDate)?'감지한 날짜의 연도·요일을 확인해 주세요.'
      :'날짜를 인식하지 못하면 오늘 할 일로 들어가요.';
    const node=$('parsePreview');
    node.hidden=!entries.length;
    if(!entries.length){node.innerHTML='';return;}
    node.innerHTML='<div class="parse-header">PREVIEW / '+entries.length+' TASK'+(entries.length===1?'':'S')+'</div>'+
      entries.slice(0,4).map(e=>
        '<div class="parse-line"><strong>'+escape(e.title)+'</strong><span>'+
        (e.dueDate?escape(e.dueDate+(e.dueTime?' '+e.dueTime:''))+(e.inferredDate?' *':''):'오늘 할 일')+
        '</span></div>'
      ).join('')+
      (entries.length>4?'<div class="parse-extra">외 '+(entries.length-4)+'개 항목</div>':'')+
      (currentPreview.skipped?'<div class="parse-extra">나머지 '+currentPreview.skipped+'줄은 입력창에 남아 있어요.</div>':'');
  }

  function capture(){
    const input=$('captureInput');
    const parsed=parseInput(input.value);
    if(!parsed.entries.length)return;
    const space=MAX_TASKS-data.tasks.length;
    const selected=parsed.entries.slice(0,Math.max(0,space));
    if(!selected.length){toast('할 일이 500개예요. 완료 항목을 정리해 주세요.');return;}
    const now=new Date().toISOString();
    const previousLength=data.tasks.length;
    data.tasks.push(...selected.map(({inferredDate,...entry})=>normalizeTask({
      ...entry,id:uid(),done:false,createdAt:now,updatedAt:now
    })));
    if(!persist()){data.tasks.length=previousLength;return;}
    const originalLines=input.value.split(/\r?\n/).filter(s=>s.trim());
    const removeCount=selected.length;
    input.value=originalLines.slice(removeCount).join('\n');
    view=selected.some(item=>!item.dueDate||item.dueDate<=today())?'today':'upcoming';
    $('searchInput').value='';
    render();
    input.focus();
    toast(selected.length+'개 할 일을 정리했어요. 이제 하나씩 시작해 볼까요?');
    if(window.matchMedia('(max-width:690px)').matches){
      document.querySelector('.board').scrollIntoView({behavior:'smooth'});
    }
  }

  function isOverdue(task){
    if(!task.dueDate)return false;
    if(task.dueDate<today())return true;
    if(task.dueDate>today()||!task.dueTime)return false;
    const now=new Date();
    const current=now.getHours()*60+now.getMinutes();
    return Number(task.dueTime.slice(0,2))*60+Number(task.dueTime.slice(3))<current;
  }
  function dueLabel(task){
    if(!task.dueDate)return'마감 없음';
    const dateLabel=formatDate(task.dueDate);
    return dateLabel+(task.dueTime?' '+task.dueTime:'')+
      (isOverdue(task)?' · 지남':'');
  }
  function renderList(){
    const search=$('searchInput').value.trim().toLocaleLowerCase();
    const tasks=tasksForView().filter(task=>
      !search||[task.title,task.category].join(' ').toLocaleLowerCase().includes(search));
    $('listStatus').textContent=(search?'SEARCH RESULTS':'SHOWING ')+tasks.length+' TASK'+(tasks.length===1?'':'S');
    const node=$('taskList');
    if(!tasks.length){
      const heading=search?'일치하는 일이 없어요.':view==='today'?'오늘은 목록이 비었어요.':
        view==='upcoming'?'다가오는 마감이 없어요.':view==='done'?'첫 완료를 기다리고 있어요.':'아직 할 일이 없어요.';
      const description=search?'다른 키워드를 입력해 보세요.':
        view==='today'?'위 입력창에 첫 할 일을 추가해 보세요.':
        view==='upcoming'?'마감이 생기면 이곳에서 확인할 수 있어요.':
        view==='done'?'작은 일 하나를 끝내면 여기에 기록돼요.':'위 입력창에 할 일을 적으면 바로 정리돼요.';
      node.innerHTML='<div class="task-empty"><span>✳</span><h3>'+heading+'</h3><p>'+description+'</p>'+
        '<button type="button" data-empty-capture>첫 할 일 적기 ↗</button></div>';
      return;
    }
    node.innerHTML=tasks.map(task=>{
      const due=task.dueDate?dueLabel(task):'';
      const dueClass=isOverdue(task)?'due-late':
        task.dueDate<=dateShift(today(),2)?'due-soon':'';
      return'<article class="task-row '+(task.done?'completed':'')+'" data-id="'+escape(task.id)+'">'+
        '<button type="button" class="task-check '+(task.done?'done':'')+'" data-check="'+escape(task.id)+'" aria-label="'+(task.done?'완료 취소':'완료 처리')+': '+escape(task.title)+'" aria-pressed="'+String(task.done)+'">'+(task.done?'✓':'✓')+'</button>'+
        '<div class="task-main"><span class="task-name" title="'+escape(task.title)+'">'+escape(task.title)+'</span>'+
        '<div class="task-meta"><span class="cat">'+escape(task.category)+'</span>'+
        (due?'<span class="'+dueClass+'">'+escape(due)+'</span>':'')+
        '<span>'+task.estimate+' MIN</span>'+
        (task.priority?'<span class="priority">★ 중요</span>':'')+
        (task.today&&!task.done?'<span>오늘</span>':'')+'</div></div>'+
        '<div class="task-actions">'+(!task.done?'<button type="button" class="run-task" data-focus="'+escape(task.id)+'">집중 ↗</button>':'')+
        '<button class="edit-task" type="button" data-edit="'+escape(task.id)+'" aria-label="'+escape(task.title)+' 편집" title="편집">⋯</button></div></article>';
    }).join('');
  }

  function renderMetrics(){
    const open=data.tasks.filter(t=>!t.done);
    const now=today(),last=dateShift(now,6);
    const countToday=open.filter(belongsToday).length;
    const countWeek=open.filter(t=>!!(t.dueDate&&t.dueDate>=now&&t.dueDate<=last)).length;
    const countDone=data.tasks.length-open.length;
    $('metricToday').textContent=String(countToday);
    $('metricWeek').textContent=String(countWeek);
    $('metricDone').textContent=String(countDone);
    $('tabToday').textContent=String(countToday);
    $('tabUpcoming').textContent=String(open.filter(belongsUpcoming).length);
    $('tabAll').textContent=String(open.length);
    $('tabDone').textContent=String(countDone);
    $('metricQuote').textContent=countToday===0&&countDone>0?'오늘도 한 걸음 해냈어요.':
      countWeek>3?'조금씩 나누면 충분해요.':'작은 일을 끝내는 것도 큰 진전.';
    const date=new Date();
    $('headerDate').textContent=(date.getMonth()+1)+' / '+date.getDate()+' · '+weekdayKorean[date.getDay()]+'요일';
  }
  function renderChart(){
    const days=Array.from({length:7},(_,index)=>dateShift(today(),index-6));
    const counts=days.map(day=>data.tasks.filter(t=>{
      if(!t.done||!t.completedAt)return false;
      const stamp=new Date(t.completedAt);
      return Number.isFinite(stamp.getTime())&&dateString(stamp)===day;
    }).length);
    const max=Math.max(1,...counts);
    $('weekChart').innerHTML=days.map((date,index)=>
      '<div class="chart-col '+(index===6?'today':'')+'"><div class="chart-bar-track">'+
      '<div class="chart-bar" title="'+escape(date)+' 완료 '+counts[index]+'개" style="height:'+Math.max(2,Math.round((counts[index]/max)*68))+'px"></div>'+
      '</div><span class="chart-day">'+weekdayKorean[fromISO(date).getDay()]+'</span></div>').join('');
    $('weekDone').textContent=counts.reduce((a,b)=>a+b,0)+'개';
  }

  function renderFocus(){
    const focused=data.tasks.find(t=>t.id===data.focus.taskId&&!t.done);
    $('focusTarget').textContent=focused?focused.title:'선택한 할 일이 없어요';
    $$('.preset').forEach(button=>{
      const active=Number(button.dataset.minutes)*60===data.focus.totalSec;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
      button.disabled=!!data.focus.running;
    });
    const sec=data.focus.running?Math.max(0,Math.ceil((data.focus.endAt-Date.now())/1000)):
      data.focus.remainingSec;
    $('timerMin').textContent=String(Math.floor(sec/60)).padStart(2,'0');
    $('timerSec').textContent=String(sec%60).padStart(2,'0');
    $('timerStart').innerHTML=(data.focus.running?'일시정지':'집중 시작')+' <span>↗</span>';
    $('timerNote').textContent=data.focus.running
      ?'다른 화면을 보다가 돌아와도 남은 시간을 계산해요.'
      :data.focus.remainingSec===data.focus.totalSec?'처음엔 25분만 해도 충분해요.':'멈춘 지점부터 다시 시작할 수 있어요.';
  }
  function render(){
    lastDay=today();
    renderPreview();renderMetrics();
    $$('.tab').forEach(button=>{
      const active=button.dataset.view===view;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    renderList();renderChart();renderFocus();
  }
  function checkTask(id){
    const task=data.tasks.find(t=>t.id===id);if(!task)return;
    task.done=!task.done;
    task.completedAt=task.done?new Date().toISOString():null;
    task.updatedAt=new Date().toISOString();
    if(task.done&&data.focus.taskId===id){
      pauseTimer();data.focus.taskId=null;
    }
    if(!persist())return;
    render();
    toast(task.done?'좋아! 할 일 하나를 끝냈어요. ✳':'완료를 취소하고 목록에 되돌렸어요.');
  }
  function setFocusTask(id){
    const task=data.tasks.find(t=>t.id===id&&!t.done);if(!task)return;
    if(data.focus.running)pauseTimer();
    data.focus.taskId=task.id;
    persist(false);renderFocus();
    if(window.matchMedia('(max-width:940px)').matches)
      document.querySelector('.focus-panel').scrollIntoView({behavior:'smooth',block:'start'});
    toast('이제 ‘'+task.title.slice(0,32)+'’에 집중할 차례예요.');
  }

  function setPreset(minutes){
    if(data.focus.running)return;
    const seconds=minutes*60;
    if(![1500,2700,3600].includes(seconds))return;
    data.focus.totalSec=seconds;data.focus.remainingSec=seconds;
    persist(false);renderFocus();
  }
  function startTimer(){
    if(data.focus.running){pauseTimer();return;}
    if(data.focus.remainingSec<=0)data.focus.remainingSec=data.focus.totalSec;
    data.focus.endAt=Date.now()+data.focus.remainingSec*1000;
    data.focus.running=true;
    persist(false);
    renderFocus();startTicker();
  }
  function pauseTimer(){
    if(!data.focus.running)return;
    data.focus.remainingSec=Math.max(0,Math.ceil((data.focus.endAt-Date.now())/1000));
    data.focus.endAt=null;data.focus.running=false;
    persist(false);renderFocus();
  }
  function resetTimer(){
    data.focus.running=false;data.focus.endAt=null;
    data.focus.remainingSec=data.focus.totalSec;
    persist(false);renderFocus();
  }
  function finishTimer(){
    if(!data.focus.running)return;
    data.focus.running=false;data.focus.endAt=null;
    data.focus.remainingSec=data.focus.totalSec;
    data.sessions.push({id:uid(),at:new Date().toISOString(),minutes:Math.round(data.focus.totalSec/60),taskId:data.focus.taskId});
    persist(false);
    renderFocus();
    toast('집중 시간이 끝났어요. 잠깐 쉬어도 좋아요. ✳');
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(Audio){
        const ctx=new Audio();const oscillator=ctx.createOscillator();const gain=ctx.createGain();
        oscillator.type='sine';oscillator.frequency.setValueAtTime(660,ctx.currentTime);
        gain.gain.setValueAtTime(.0001,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.09,ctx.currentTime+.03);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.35);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();oscillator.stop(ctx.currentTime+.38);
        oscillator.onended=()=>ctx.close();
      }
    }catch{}
  }
  function tick(){
    if(lastDay!==today())render();
    if(!data.focus.running)return;
    if(Date.now()>=data.focus.endAt){finishTimer();return;}
    renderFocus();
  }
  function startTicker(){
    if(timerTick)clearInterval(timerTick);
    timerTick=setInterval(tick,500);
  }
  function openTaskEditor(task=null){
    modalReturnFocus=document.activeElement;
    $('taskId').value=task?.id||'';
    $('taskTitle').value=task?.title||'';
    $('taskDate').value=task?.dueDate||'';
    $('taskTime').value=task?.dueTime||'';
    $('taskEstimate').value=String(task?.estimate||25);
    if(!$('taskEstimate').querySelector('option[value="'+(task?.estimate||25)+'"]'))
      $('taskEstimate').value='25';
    $('taskCategory').value=allowedCategories.includes(task?.category)?task.category:'일반';
    $('taskToday').checked=task?.today??true;
    $('taskPriority').checked=!!task?.priority;
    $('deleteTask').hidden=!task;
    $('modalTitle').innerHTML=task?'할 일 <em>편집하기.</em>':'할 일 <em>추가하기.</em>';
    $('taskModal').hidden=false;document.body.classList.add('modal-open');
    $('taskTitle').focus();
  }
  function closeModal(which){
    const node=$(which);node.hidden=true;
    if($('taskModal').hidden&&$('backupModal').hidden)document.body.classList.remove('modal-open');
    if(modalReturnFocus?.focus)modalReturnFocus.focus({preventScroll:true});
  }
  function saveTaskFromForm(event){
    event.preventDefault();
    const name=$('taskTitle').value.trim();
    if(!name){$('taskTitle').focus();return;}
    const id=$('taskId').value;
    const old=data.tasks.find(t=>t.id===id);
    if(!old&&data.tasks.length>=MAX_TASKS){toast('저장 가능한 할 일 개수(500개)에 도달했어요.');return;}
    const date=fromISO($('taskDate').value)?$('taskDate').value:null;
    const now=new Date().toISOString();
    const updated=normalizeTask({
      ...(old||{}),id:old?.id||uid(),
      title:name,category:$('taskCategory').value,
      dueDate:date,dueTime:date?$('taskTime').value:null,
      estimate:Number($('taskEstimate').value),
      priority:$('taskPriority').checked,today:$('taskToday').checked,
      createdAt:old?.createdAt||now,updatedAt:now,
      done:old?.done||false,completedAt:old?.completedAt||null
    });
    if(old)Object.assign(old,updated);
    else data.tasks.push(updated);
    if(!persist())return;
    closeModal('taskModal');
    render();
    toast(old?'할 일을 수정했어요.':'새 할 일을 추가했어요.');
  }

  function confirm(title,detail,actionText='삭제하기'){
    if(confirmResolver){confirmResolver(false);confirmResolver=null;}
    return new Promise(resolve=>{
      confirmResolver=resolve;
      $('confirmTitle').textContent=title;
      $('confirmDetail').textContent=detail;
      $('confirmYes').textContent=actionText;
      $('confirmModal').hidden=false;
      $('confirmCancel').focus();
    });
  }
  function settleConfirm(yes){
    $('confirmModal').hidden=true;
    if(confirmResolver){const resolve=confirmResolver;confirmResolver=null;resolve(yes);}
  }
  async function deleteTask(){
    const id=$('taskId').value;
    const task=data.tasks.find(t=>t.id===id);
    if(!task)return;
    const accepted=await confirm('이 할 일을 지울까요?','삭제한 할 일은 목록에서 없어져요.');
    if(!accepted){$('deleteTask').focus();return;}
    const index=data.tasks.indexOf(task);
    data.tasks.splice(index,1);
    if(data.focus.taskId===id){pauseTimer();data.focus.taskId=null;}
    persist(false);
    closeModal('taskModal');
    render();toast('할 일을 삭제했어요.');
  }

  function saveBlob(blob,filename){
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function exportJson(){
    const json=JSON.stringify({
      app:'AHEAD',version:1,exportedAt:new Date().toISOString(),
      tasks:data.tasks,sessions:data.sessions,focusSettings:{totalSec:data.focus.totalSec}
    },null,2);
    saveBlob(new Blob([json],{type:'application/json;charset=utf-8'}),
      'ahead-backup-'+today()+'.json');
    toast('백업 파일을 저장했어요.');
  }
  function icsEscape(s){
    return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  }
  function icsStamp(date){
    return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  }
  function foldLine(line){
    const encoder=new TextEncoder();
    let out='',width=0;
    for(const char of line){
      const size=encoder.encode(char).length;
      if(width+size>74){out+='\r\n ';width=1;}
      out+=char;width+=size;
    }
    return out;
  }
  function buildIcs(tasks){
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AHEAD//Personal Deadline Planner//KO',
      'CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const task of tasks){
      if(!task.dueDate||!fromISO(task.dueDate))continue;
      const day=task.dueDate.replaceAll('-','');
      const stamp=icsStamp(new Date());
      const title=icsEscape('[마감] '+task.title);
      lines.push('BEGIN:VEVENT','UID:'+icsEscape(task.id)+'@ahead.local','DTSTAMP:'+stamp,'SUMMARY:'+title,
        'DESCRIPTION:'+icsEscape('AHEAD에서 내보낸 마감 일정 / 분류: '+task.category));
      if(task.dueTime){
        const time=task.dueTime.replace(':','')+'00';
        const start=task.dueDate+'T'+task.dueTime+':00';
        const end=new Date(new Date(start).getTime()+15*60*1000);
        const dayEnd=dateString(end).replaceAll('-','');
        const timeEnd=String(end.getHours()).padStart(2,'0')+String(end.getMinutes()).padStart(2,'0')+'00';
        lines.push('DTSTART:'+day+'T'+time,'DTEND:'+dayEnd+'T'+timeEnd);
      } else {
        lines.push('DTSTART;VALUE=DATE:'+day,'DTEND;VALUE=DATE:'+dateShift(task.dueDate,1).replaceAll('-',''));
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n')+'\r\n';
  }
  function exportCalendar(){
    const tasks=data.tasks.filter(t=>!t.done&&t.dueDate);
    if(!tasks.length){toast('마감 날짜가 있는 할 일이 아직 없어요.');return;}
    const ics=buildIcs(tasks);
    saveBlob(new Blob([ics],{type:'text/calendar;charset=utf-8'}),
      'ahead-deadlines-'+today()+'.ics');
    toast(tasks.length+'개의 마감 일정을 캘린더 파일로 만들었어요.');
  }

  async function importJson(file){
    if(!file)return;
    if(file.size>MAX_IMPORT_BYTES){toast('3MB 이하의 AHEAD 백업 파일을 골라 주세요.');return;}
    let parsed;
    try{parsed=JSON.parse(await file.text());}catch{toast('백업 파일을 읽을 수 없어요.');return;}
    if(!parsed||parsed.app!=='AHEAD'||!Array.isArray(parsed.tasks)){
      toast('AHEAD에서 내보낸 JSON 백업 파일만 복원할 수 있어요.');return;
    }
    const candidate=parsed.tasks.slice(0,MAX_TASKS).map(normalizeTask).filter(Boolean);
    const ids=new Set(data.tasks.map(task=>task.id));
    const fresh=candidate.filter(task=>!ids.has(task.id)).slice(0,Math.max(0,MAX_TASKS-data.tasks.length));
    const sessionIds=new Set(data.sessions.map(session=>session.id));
    const importedSessions=Array.isArray(parsed.sessions)
      ?parsed.sessions.slice(-600).map(normalizeSession).filter(Boolean).filter(s=>!sessionIds.has(s.id))
      :[];
    const hasFocus=[1500,2700,3600].includes(parsed.focusSettings?.totalSec);
    if(!fresh.length&&!importedSessions.length&&!hasFocus){
      toast('새로 복원할 할 일이나 집중 기록이 없어요.');return;
    }
    const yes=await confirm('기록을 복원할까요?',
      '새 할 일 '+fresh.length+'개와 집중 기록 '+importedSessions.length+'개를 기존 데이터에 추가합니다.','복원하기');
    if(!yes)return;
    const previousLength=data.tasks.length;
    const previousSessions=[...data.sessions];
    const previousFocus={...data.focus};
    data.tasks.push(...fresh);
    data.sessions.push(...importedSessions);
    if(hasFocus&&!data.focus.running){
      data.focus.totalSec=parsed.focusSettings.totalSec;
      data.focus.remainingSec=parsed.focusSettings.totalSec;
    }
    if(!persist()){
      data.tasks.length=previousLength;
      data.sessions=previousSessions;
      Object.assign(data.focus,previousFocus);
      return;
    }
    closeModal('backupModal');render();
    toast('할 일 '+fresh.length+'개, 집중 기록 '+importedSessions.length+'개를 복원했어요.');
  }

  function openBackup(){
    modalReturnFocus=document.activeElement;
    $('backupModal').hidden=false;
    document.body.classList.add('modal-open');
    $('closeBackupModal').focus();
  }

  function handleTaskClick(event){
    const button=event.target.closest('[data-check],[data-focus],[data-edit],[data-empty-capture]');
    if(!button)return;
    if(button.dataset.emptyCapture!==undefined){
      $('captureInput').focus();$('capture').scrollIntoView({behavior:'smooth'});return;
    }
    if(button.dataset.check)checkTask(button.dataset.check);
    else if(button.dataset.focus)setFocusTask(button.dataset.focus);
    else if(button.dataset.edit)openTaskEditor(data.tasks.find(t=>t.id===button.dataset.edit));
  }
  function bind(){
    $('captureInput').addEventListener('input',renderPreview);
    $('addTasks').addEventListener('click',capture);
    $('captureInput').addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();capture();}
    });
    $$('.tab').forEach(button=>button.addEventListener('click',()=>{
      view=button.dataset.view;render();
    }));
    $('taskList').addEventListener('click',handleTaskClick);
    $('searchInput').addEventListener('input',renderList);
    $('showAll').addEventListener('click',()=>{view='all';render();});
    $('newTaskBtn').addEventListener('click',()=>openTaskEditor());
    $('taskForm').addEventListener('submit',saveTaskFromForm);
    $('taskDate').addEventListener('change',e=>{
      if(!$('taskId').value){
        const due=e.target.value;
        $('taskToday').checked=!due||due<=today();
      }
    });
    $('deleteTask').addEventListener('click',()=>void deleteTask());
    $('closeTaskModal').addEventListener('click',()=>closeModal('taskModal'));
    $('openBackup').addEventListener('click',openBackup);
    $('closeBackupModal').addEventListener('click',()=>closeModal('backupModal'));
    $('exportJson').addEventListener('click',exportJson);
    $('exportIcs').addEventListener('click',exportCalendar);
    $('importTrigger').addEventListener('click',()=>$('importInput').click());
    $('importInput').addEventListener('change',e=>{
      const file=e.target.files?.[0];e.target.value='';
      void importJson(file);
    });
    $$('[data-close-modal]').forEach(node=>node.addEventListener('click',()=>{
      if(!$('taskModal').hidden)closeModal('taskModal');
      if(!$('backupModal').hidden)closeModal('backupModal');
    }));
    $$('.preset').forEach(btn=>btn.addEventListener('click',()=>setPreset(Number(btn.dataset.minutes))));
    $('timerStart').addEventListener('click',startTimer);
    $('timerReset').addEventListener('click',resetTimer);
    $('changeFocusTask').addEventListener('click',()=>{
      view='all';render();
      $('searchInput').focus();
      document.querySelector('.board-left').scrollIntoView({behavior:'smooth'});
      toast('할 일 옆의 ‘집중 ↗’ 버튼을 눌러 선택해 주세요.');
    });
    $('confirmCancel').addEventListener('click',()=>settleConfirm(false));
    $('confirmYes').addEventListener('click',()=>settleConfirm(true));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if(!$('confirmModal').hidden){e.preventDefault();settleConfirm(false);}
        else if(!$('taskModal').hidden){e.preventDefault();closeModal('taskModal');}
        else if(!$('backupModal').hidden){e.preventDefault();closeModal('backupModal');}
      }
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&
        $('taskModal').hidden&&$('backupModal').hidden){
        e.preventDefault();$('captureInput').focus();$('capture').scrollIntoView({behavior:'smooth'});
      }
      // Trap focus in whichever modal is currently visible.
      if(e.key==='Tab'){
        const active=$('confirmModal').hidden?$('taskModal').hidden?$('backupModal').hidden?null:$('backupModal'):$('taskModal'):$('confirmModal');
        if(!active)return;
        const buttons=[...active.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([type=hidden]),select,textarea')];
        if(!buttons.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
    window.addEventListener('focus',tick);
  }
  function init(){
    bind();
    if(data.focus.running&&Date.now()>=data.focus.endAt)finishTimer();
    render();startTicker();
    if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  init();
})();
