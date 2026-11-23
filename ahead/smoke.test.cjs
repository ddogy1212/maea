/* AHEAD smoke test — Node 20+, no external packages.
 * Executes the actual parser and UI data flow in a simulated browser.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const folder=__dirname;
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
const css=fs.readFileSync(path.join(folder,'styles.css'),'utf8');
const js=fs.readFileSync(path.join(folder,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(folder,'sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.webmanifest'),'utf8'));

async function main(){
  new vm.Script(js,{filename:'app.js'});
  new vm.Script(sw,{filename:'sw.js'});
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'balanced CSS syntax');
  assert.equal(manifest.short_name,'AHEAD');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const m of js.matchAll(/\$\('([^']+)'\)/g)){
    assert(ids.has(m[1]),'missing referenced element: '+m[1]);
  }

  const nodes=new Map();
  const classList={add(){},remove(){},toggle(){}};
  function element(id){
    if(!nodes.has(id))nodes.set(id,{
      id,value:'',textContent:'',innerHTML:'',disabled:false,checked:false,
      hidden:false,classList,style:{},dataset:{},
      addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){},
      querySelector(){return{value:'25'}},querySelectorAll(){return[]}
    });
    return nodes.get(id);
  }
  element('taskEstimate').value='25';
  element('taskCategory').value='일반';
  const documentMock={
    getElementById:element,
    querySelector:element,
    querySelectorAll(selector){
      if(selector==='.tab')return['today','upcoming','all','done'].map(view=>({
        dataset:{view},classList,setAttribute(){},addEventListener(){}
      }));
      if(selector==='.preset')return[25,45,60].map(minutes=>({
        dataset:{minutes:String(minutes)},classList,setAttribute(){},addEventListener(){}
      }));
      return[];
    },
    body:element('body'),
    activeElement:element('focus'),
    addEventListener(){},
    createElement(tag){return{href:'',download:'',click(){},remove(){}}}
  };
  documentMock.body.appendChild=()=>{};

  const store=new Map();
  const storage={
    getItem(k){return store.has(k)?store.get(k):null;},
    setItem(k,v){store.set(k,v);}
  };
  const windowMock={matchMedia(){return{matches:false}},addEventListener(){}};
  const appCode=js.replace(/\n  init\(\);\n\}\)\(\);\s*$/,
    '\n  globalThis.__app={data,parseLine,parseInput,buildIcs,capture,render,checkTask,setFocusTask,setPreset,startTimer,pauseTimer,resetTimer,normalizeTask};\n})();');
  assert.notEqual(appCode,js,'test injection');
  const sandbox={
    document:documentMock,localStorage:storage,window:windowMock,
    navigator:{},location:{protocol:'file:',hostname:''},Blob,TextEncoder,
    crypto:require('node:crypto').webcrypto,
    URL:{createObjectURL(){return'blob:smoke'},revokeObjectURL(){}},
    setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},
    console
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appCode,sandbox,{filename:'app.js'});
  const app=sandbox.__app;
  assert(app,'application loaded');
  app.render();

  const fixed=new Date(2026,10,23);
  const examples=[
    ['국어 수행 11/27 22:00까지','2026-11-27','22:00',25,'국어'],
    ['내일 러시아어 단어 복습 30분','2026-11-24',null,30,'러시아어'],
    ['중요 수학 숙제 금요일','2026-11-27',null,25,'수학'],
    ['오늘 오후 11시 30분 국어 숙제','2026-11-23','23:30',25,'국어'],
    ['다음주 화요일 17:00 발표','2026-12-01','17:00',25,'일반'],
    ['1월 2일 복습','2027-01-02',null,25,'일반'],
    ['영어 수행평가',null,null,25,'영어'],
    ['독서 1시간',null,null,60,'일반']
  ];
  for(const [raw,date,time,mins,category] of examples){
    const item=app.parseLine(raw,fixed);
    assert.equal(item.dueDate,date,raw+' date');
    assert.equal(item.dueTime,time,raw+' time');
    assert.equal(item.estimate,mins,raw+' duration');
    assert.equal(item.category,category,raw+' category');
  }

  const ics=app.buildIcs([
    {id:'test-1',title:'국어 수행',dueDate:'2026-11-27',dueTime:'22:00',category:'국어'},
    {id:'test-2',title:'수학 시험',dueDate:'2026-12-03',dueTime:null,category:'수학'}
  ]);
  assert(ics.includes('DTSTART:20261127T220000'),'timed ICS deadline');
  assert(ics.includes('DTSTART;VALUE=DATE:20261203'),'all-day ICS deadline');
  assert(ics.includes('DTEND;VALUE=DATE:20261204'),'exclusive all-day ICS end');
  assert(ics.includes('\r\n'),'CRLF line termination');

  element('captureInput').value='내일 러시아어 단어 복습 30분\n국어 수행 11/27 22:00까지\n영어 단어 15분';
  app.capture();
  assert.equal(app.data.tasks.length,3,'multiline task capture');
  assert.equal(app.data.tasks[0].category,'러시아어');
  assert.equal(app.data.tasks[0].estimate,30);
  assert.equal(app.data.tasks[2].today,true);
  assert.equal(element('metricToday').textContent,'1');
  assert.equal(element('tabUpcoming').textContent,'2');
  assert(store.has('ahead-workbench-v1'),'saved locally');
  assert(element('taskList').innerHTML.includes('영어 단어'),'rendered task name');

  const focus=app.data.tasks[2];
  app.setFocusTask(focus.id);
  app.setPreset(45);
  app.startTimer();
  assert.equal(app.data.focus.running,true,'timer starts');
  assert.equal(app.data.focus.totalSec,2700,'45-minute preset');
  app.pauseTimer();
  assert.equal(app.data.focus.running,false,'timer pauses');
  app.resetTimer();
  assert.equal(app.data.focus.remainingSec,2700,'timer resets');
  app.checkTask(focus.id);
  assert.equal(focus.done,true,'mark complete');
  assert.equal(element('metricDone').textContent,'1','completion metric');
  app.checkTask(focus.id);
  assert.equal(focus.done,false,'undo completion');

  const malicious=app.normalizeTask({title:'<img src=x onerror=1>',today:true});
  app.data.tasks.push(malicious);
  app.render();
  assert(element('taskList').innerHTML.includes('&lt;img'),'escape user text');
  assert(!element('taskList').innerHTML.includes('<img src=x onerror=1>'),'no raw HTML injection');

  console.log('PASS — AHEAD: syntax, referenced HTML elements, parser, ICS, inbox, UI, storage, timer, completion, escaping.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
