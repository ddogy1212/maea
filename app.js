/* MAEA — A place for the present. Pure JavaScript, no build step. */
(() => {
  'use strict';

  const STORAGE_KEY = 'maea.state.v1';
  const RING = 2 * Math.PI * 114;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const el = (id) => document.getElementById(id);
  const mediaReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sceneList = [
    {
      id: 'forest', title: 'A slower kind<br><em>of morning.</em>',
      desc: '소란스러운 세상에서 조금 떨어진 숲.<br>숨을 고르고, 가장 중요한 일부터 시작해요.',
      label: '숲의 아침', kind: 'FOREST', bg: '#253c30',
      photo: 'https://images.unsplash.com/photo-1448375240586-882707db888b', alt: '햇살이 스며드는 울창한 숲'
    },
    {
      id: 'alpine', title: 'Somewhere<br><em>above the noise.</em>',
      desc: '높은 산과 맑은 공기처럼.<br>복잡한 마음을 한 겹씩 가볍게 해봐요.',
      label: '산 너머의 고요', kind: 'MOUNTAIN', bg: '#455c67',
      photo: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470', alt: '웅장한 산과 호수가 펼쳐진 풍경'
    },
    {
      id: 'ocean', title: 'Let the tide<br><em>take its time.</em>',
      desc: '멀리 밀려났다 다시 돌아오는 파도.<br>속도를 정하는 건 오직 당신이에요.',
      label: '푸른 바다', kind: 'OCEAN', bg: '#2e5669',
      photo: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b', alt: '깊고 넓게 펼쳐진 푸른 바다'
    },
    {
      id: 'sunset', title: 'Stay for<br><em>the last light.</em>',
      desc: '하루의 끝에서 만나는 따뜻한 빛.<br>오늘의 작은 진전도 충분히 의미 있어요.',
      label: '해 질 무렵', kind: 'GOLDEN HOUR', bg: '#865747',
      photo: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8', alt: '노을이 내려앉은 풍경'
    },
    {
      id: 'night', title: 'Make room<br><em>for the stars.</em>',
      desc: '도시가 조용해지는 시간.<br>아직 끝내지 못한 생각에 자리를 내어줘요.',
      label: '별이 뜬 밤', kind: 'NIGHT SKY', bg: '#17283d',
      photo: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455', alt: '별이 빛나는 밤하늘'
    },
    {
      id: 'meadow', title: 'Nothing to prove.<br><em>Just be here.</em>',
      desc: '바람이 지나가는 넓은 들판.<br>잠시 멈추는 것도 나아가는 방법이에요.',
      label: '바람의 들판', kind: 'OPEN FIELD', bg: '#5f7357',
      photo: 'https://images.unsplash.com/photo-1472396961693-142e6e269027', alt: '초록빛 나무와 자연이 어우러진 들판'
    }
  ];

  const DEFAULTS = {
    scene: 'forest',
    mode: 'focus',
    durations: { focus: 25, break: 5 },
    timer: { running: false, remaining: 1500, total: 1500, endAt: null },
    selectedTaskId: null,
    tasks: [],
    sessions: [],
    volume: 45,
    settings: { motion: true, notifications: false }
  };

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return structuredClone(DEFAULTS);
      const result = {
        ...structuredClone(DEFAULTS), ...saved,
        durations: { ...DEFAULTS.durations, ...(saved.durations || {}) },
        timer: { ...DEFAULTS.timer, ...(saved.timer || {}) },
        settings: { ...DEFAULTS.settings, ...(saved.settings || {}) },
        tasks: Array.isArray(saved.tasks) ? saved.tasks.slice(-150) : [],
        sessions: Array.isArray(saved.sessions) ? saved.sessions.slice(-1000) : []
      };
      if (!sceneList.some(s => s.id === result.scene)) result.scene = 'forest';
      if (!['focus', 'break'].includes(result.mode)) result.mode = 'focus';
      for (const key of ['focus', 'break']) {
        const n = Number(result.durations[key]);
        result.durations[key] = Number.isFinite(n) ? Math.max(1, Math.min(180, Math.round(n))) : DEFAULTS.durations[key];
      }
      if (!Number.isFinite(result.timer.remaining) || !Number.isFinite(result.timer.total) || result.timer.total <= 0) {
        result.timer = { ...DEFAULTS.timer };
      }
      result.volume = Number.isFinite(Number(result.volume)) ? Math.min(100, Math.max(0, Number(result.volume))) : 45;
      return result;
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  let state = readState();
  let activePhoto = 'a';
  let currentSound = 'off';
  let lastSound = 'rain';
  let soundEngine = null;
  let currentPanel = null;
  let pendingSessionId = null;
  let chosenMood = '';
  let lastFocusElement = null;
  let toastTimeout;
  let clockInterval;
  const escaped = (value) => String(value ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[s]);
  const timeFormat = (seconds) => {
    const safe = Math.max(0, Math.ceil(seconds));
    return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
  };
  const dayKey = (date = new Date()) => [
    date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')
  ].join('-');
  const dayMinutes = (date = dayKey()) => state.sessions
    .filter(s => s.mode === 'focus' && s.day === date)
    .reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { toast('저장 공간이 부족해 기록을 보관하지 못했어요.'); }
  };

  function toast(text) {
    const node = el('toast');
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.classList.remove('show'), 3200);
  }

  function clockHeader() {
    const d = new Date();
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    el('topToday').textContent = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
    el('localClock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function photoUrl(scene, wide = true) {
    return scene.photo + (wide ? '?auto=format&fit=crop&w=2200&q=85' : '?auto=format&fit=crop&w=480&q=78');
  }

  function renderGallery() {
    el('sceneGallery').innerHTML = sceneList.map((scene, index) => `
      <button class="scene-card ${scene.id === state.scene ? 'active' : ''}" type="button"
        data-scene="${scene.id}" aria-pressed="${scene.id === state.scene}"
        aria-label="${escaped(scene.label)} 풍경 선택">
        <img src="${photoUrl(scene, false)}" alt="${escaped(scene.alt)}" loading="${index < 3 ? 'eager' : 'lazy'}">
        <span class="scene-n">${String(index + 1).padStart(2, '0')}</span>
        <span class="scene-selected" aria-hidden="true">✳</span>
        <span class="scene-label">${escaped(scene.label)}</span>
      </button>`).join('');
    $$('#sceneGallery [data-scene]').forEach(b => b.addEventListener('click', () => setScene(b.dataset.scene)));
  }

  function setScene(id, initial = false) {
    const scene = sceneList.find(s => s.id === id);
    if (!scene) return;
    state.scene = id;
    const position = sceneList.indexOf(scene) + 1;
    el('sceneTitle').innerHTML = scene.title;
    el('sceneDescription').innerHTML = scene.desc;
    el('sceneCounter').textContent = 'NO. ' + String(position).padStart(2, '0') + ' — THE QUIET COLLECTION';
    el('storyKind').textContent = String(position).padStart(2, '0') + ' / 06  •  ' + scene.kind;
    el('sceneFraction').textContent = String(position).padStart(2, '0') + ' — 06';
    document.body.style.backgroundColor = scene.bg;
    if (initial) {
      el('photoA').style.backgroundImage = 'url("' + photoUrl(scene) + '")';
      el('photoA').classList.add('visible');
      el('photoB').classList.remove('visible');
      activePhoto = 'a';
    } else {
      const incoming = activePhoto === 'a' ? el('photoB') : el('photoA');
      const outgoing = activePhoto === 'a' ? el('photoA') : el('photoB');
      incoming.style.backgroundImage = 'url("' + photoUrl(scene) + '")';
      incoming.classList.add('visible');
      outgoing.classList.remove('visible');
      activePhoto = activePhoto === 'a' ? 'b' : 'a';
    }
    $$('#sceneGallery .scene-card').forEach(button => {
      const on = button.dataset.scene === id;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    });
    if (!initial) save();
  }

  function renderIntent() {
    const task = state.tasks.find(t => t.id === state.selectedTaskId && !t.done);
    if (!task) state.selectedTaskId = null;
    el('intentLabel').textContent = task ? task.text : '이번 시간에 할 일 정하기';
  }

  function renderTimer() {
    const { running, remaining, total } = state.timer;
    const clamped = Math.max(0, Math.min(total, remaining));
    el('timerDisplay').textContent = timeFormat(clamped);
    el('progressCircle').style.strokeDasharray = String(RING);
    el('progressCircle').style.strokeDashoffset = String(RING * (1 - clamped / Math.max(total, 1)));
    el('clockLabel').textContent = state.mode === 'focus' ? 'TIME TO FOCUS' : 'TIME TO BREATHE';
    el('timerSubtitle').textContent = running ? '당신만의 시간 속에 있어요.' : (state.mode === 'focus' ? '지금 이 순간에만 집중해요.' : '잠깐 쉬어가도 좋아요.');
    el('playLabel').textContent = running ? '잠시 멈추기' : (remaining < total ? '이어서 하기' : '시작하기');
    el('timerPlay').querySelector('svg').innerHTML = running
      ? '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'
      : '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>';
    document.title = running ? timeFormat(clamped) + ' · MAEA' : 'MAEA — a place for the present';
    $$('.mode-btn').forEach(b => {
      const chosen = b.dataset.mode === state.mode;
      b.classList.toggle('selected', chosen);
      b.setAttribute('aria-pressed', String(chosen));
    });
    const choices = state.mode === 'focus' ? [25,45,60] : [5,10,15];
    $$('.duration').forEach((b, i) => {
      if (i < 3) {
        b.dataset.duration = choices[i];
        b.textContent = choices[i] + '분';
      }
      b.classList.toggle('active', Number(b.dataset.duration) === state.durations[state.mode]);
    });
    el('todayMinutes').textContent = 'TODAY · ' + dayMinutes() + ' MIN';
  }

  function resetTimer(saveChanges = true) {
    state.timer = {
      running: false,
      remaining: state.durations[state.mode] * 60,
      total: state.durations[state.mode] * 60,
      endAt: null
    };
    renderTimer();
    if (saveChanges) save();
  }

  function checkTimer() {
    if (!state.timer.running) return;
    state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    if (state.timer.remaining <= 0) completeTimer();
    else renderTimer();
  }

  function pauseTimer() {
    if (!state.timer.running) return;
    state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    state.timer.running = false;
    state.timer.endAt = null;
    save();
    renderTimer();
    toast('타이머를 잠시 멈췄어요.');
  }

  function playTimer() {
    if (state.timer.running) {
      pauseTimer();
      return;
    }
    if (state.timer.remaining <= 0) state.timer.remaining = state.timer.total;
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    save();
    renderTimer();
    toast(state.mode === 'focus' ? '좋아요. 이 순간에 집중해 봐요.' : '편안하게 쉬어가요.');
  }

  function completeTimer() {
    if (!state.timer.running) return;
    const mode = state.mode;
    const duration = Math.round(state.timer.total / 60);
    const task = state.tasks.find(t => t.id === state.selectedTaskId);
    state.timer.running = false;
    state.timer.endAt = null;
    const session = {
      id: makeId(),
      mode,
      duration,
      day: dayKey(),
      timestamp: new Date().toISOString(),
      task: mode === 'focus' && task ? task.text : '',
      scene: state.scene,
      mood: '',
      note: ''
    };
    state.sessions.push(session);
    state.sessions = state.sessions.slice(-1000);
    resetTimer(false);
    renderJournal();
    save();
    gentleChime();
    if (state.settings.notifications && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('MAEA · 시간이 다 되었어요', { body: mode === 'focus' ? '집중을 완료했어요. 수고했어요!' : '휴식이 끝났어요. 다음 순간을 시작해 볼까요?' }); } catch { /* unsupported browser */ }
    }
    if (mode === 'focus') {
      pendingSessionId = session.id;
      chosenMood = '';
      el('reflectionInput').value = '';
      $$('.mood-row button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      el('finishBody').textContent = duration + '분의 집중을 마쳤어요. 어떤 기분으로 끝났나요?';
      el('finishModal').hidden = false;
      el('finishSave').focus();
    } else {
      toast('휴식을 마쳤어요. 다시 시작할 준비가 되면 알려주세요.');
    }
  }

  function setMode(mode) {
    if (!['focus','break'].includes(mode) || mode === state.mode) return;
    if (state.timer.running) {
      toast('먼저 타이머를 멈춘 뒤 모드를 바꿔 주세요.');
      return;
    }
    if (state.timer.remaining !== state.timer.total && !confirm('진행 중인 시간을 초기화하고 모드를 바꿀까요?')) return;
    state.mode = mode;
    resetTimer();
  }

  function chooseDuration(value) {
    if (state.timer.running) {
      toast('시간을 바꾸려면 먼저 타이머를 멈춰 주세요.');
      return;
    }
    let mins = Number(value);
    if (value === 'custom') {
      const answer = prompt('몇 분으로 설정할까요? (1~180분)', String(state.durations[state.mode]));
      if (answer === null) return;
      if (!/^\d+$/.test(answer.trim())) {
        toast('1~180 사이의 숫자를 입력해 주세요.');
        return;
      }
      mins = Number(answer);
    }
    if (!Number.isInteger(mins) || mins < 1 || mins > 180) {
      toast('1~180분으로 설정할 수 있어요.');
      return;
    }
    if (state.timer.remaining !== state.timer.total && !confirm('진행 중인 시간을 초기화할까요?')) return;
    state.durations[state.mode] = mins;
    resetTimer();
    if (value === 'custom') toast(mins + '분으로 설정했어요.');
  }

  function renderTasks() {
    const list = el('taskList');
    if (!state.tasks.length) {
      list.innerHTML = '<div class="task-empty">아직 할 일이 없어요.<br>작은 목표 하나부터 적어보세요.</div>';
    } else {
      list.innerHTML = [...state.tasks].sort((a,b) => Number(a.done) - Number(b.done)).map(task => `
        <div class="task-item ${task.done ? 'done' : ''} ${task.id === state.selectedTaskId ? 'intent' : ''}">
          <button class="task-check" type="button" data-check="${escaped(task.id)}" aria-label="${task.done ? '완료 취소' : '완료 표시'}">
            <svg viewBox="0 0 24 24"><path d="m5 12 5 5L19 7"/></svg></button>
          <button class="task-text" type="button" data-select="${escaped(task.id)}" title="이번 집중 목표로 선택">${escaped(task.text)}</button>
          ${task.id === state.selectedTaskId && !task.done ? '<span class="task-current">선택됨</span>' : ''}
          <button class="task-delete" type="button" data-delete="${escaped(task.id)}" aria-label="할 일 삭제">×</button>
        </div>`).join('');
    }
    el('taskCount').textContent = state.tasks.filter(t => !t.done).length + ' LEFT';
    renderIntent();
  }

  function handleTasksClick(event) {
    const action = event.target.closest('[data-check],[data-select],[data-delete]');
    if (!action) return;
    const id = action.dataset.check || action.dataset.select || action.dataset.delete;
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    if ('check' in action.dataset) {
      task.done = !task.done;
      if (task.done && state.selectedTaskId === id) state.selectedTaskId = null;
    } else if ('select' in action.dataset) {
      if (task.done) { toast('완료한 항목은 목표로 선택할 수 없어요.'); return; }
      state.selectedTaskId = state.selectedTaskId === id ? null : id;
      toast(state.selectedTaskId ? '이번 집중 시간의 목표로 설정했어요.' : '목표 선택을 해제했어요.');
    } else {
      state.tasks = state.tasks.filter(t => t.id !== id);
      if (state.selectedTaskId === id) state.selectedTaskId = null;
    }
    renderTasks();
    save();
  }

  function renderJournal() {
    el('statToday').innerHTML = dayMinutes() + '<small>min</small>';
    el('statSessions').innerHTML = state.sessions.filter(s => s.mode === 'focus').length + '<small>times</small>';
    const daily = Array.from({length:7}, (_, index) => {
      const date = new Date();
      date.setHours(12,0,0,0);
      date.setDate(date.getDate() - (6 - index));
      return { date: dayKey(date), label: ['일','월','화','수','목','금','토'][date.getDay()], amount: dayMinutes(dayKey(date)) };
    });
    const max = Math.max(20, ...daily.map(d => d.amount));
    el('weekBars').innerHTML = daily.map((d, i) => `
      <div class="week-column ${i === 6 ? 'today' : ''}" aria-label="${d.date} ${d.amount}분">
        <strong>${d.amount || '·'}</strong>
        <div class="bar-track"><div class="bar-fill" style="height:${d.amount ? Math.max(5, Math.round(d.amount / max * 100)) : 0}%"></div></div>
        <small>${d.label}</small>
      </div>`).join('');
    const recent = [...state.sessions].filter(s => s.mode === 'focus').reverse().slice(0,12);
    el('historyList').innerHTML = recent.length ? recent.map(s => {
      const date = new Date(s.timestamp);
      const time = Number.isNaN(date.getTime()) ? s.day : date.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
      return `<div class="history-item"><div><strong>${escaped(s.task || '나만의 집중 시간')}${s.mood ? ' · ' + escaped(s.mood) : ''}</strong>
      <small>${escaped(time)} · ${escaped((sceneList.find(x => x.id === s.scene) || sceneList[0]).label)}${s.note ? '<br>' + escaped(s.note) : ''}</small></div>
      <span>${Number(s.duration) || 0} MIN</span></div>`;
    }).join('') : '<div class="history-empty">첫 번째 집중 기록을 기다리고 있어요.<br>서두르지 않아도 괜찮아요.</div>';
  }

  function refreshNavigation(panel) {
    $$('.rail-btn, .mobile-link').forEach(b => {
      const selected = b.dataset.panel === panel || (!panel && (b.id === 'navHome' || b.hasAttribute('data-mobile-home')));
      b.classList.toggle('active', selected);
    });
  }

  function openPanel(panel) {
    if (!['tasks','journal','settings'].includes(panel)) return;
    if (currentPanel === panel) return closePanel();
    lastFocusElement = document.activeElement;
    currentPanel = panel;
    $$('.panel-page').forEach(page => page.classList.toggle('active', page.dataset.page === panel));
    el('scrim').hidden = false;
    el('sidePanel').classList.add('open');
    el('sidePanel').setAttribute('aria-hidden','false');
    refreshNavigation(panel);
    if (panel === 'tasks') renderTasks();
    if (panel === 'journal') renderJournal();
    setTimeout(() => el('closePanel').focus({ preventScroll:true }), 80);
  }

  function closePanel() {
    if (!currentPanel) return;
    currentPanel = null;
    el('sidePanel').classList.remove('open');
    el('sidePanel').setAttribute('aria-hidden','true');
    el('scrim').hidden = true;
    refreshNavigation(null);
    if (lastFocusElement?.focus) lastFocusElement.focus({ preventScroll: true });
  }

  function toggleFocusView() {
    document.body.classList.toggle('focus-only');
    const on = document.body.classList.contains('focus-only');
    el('focusView').setAttribute('aria-label', on ? '집중 화면 닫기' : '집중 화면 전환');
    el('focusView').setAttribute('title', on ? '집중 화면 닫기' : '집중 화면');
    if (on) closePanel();
    toast(on ? '집중 화면이에요. Esc 키로 나올 수 있어요.' : '기본 화면으로 돌아왔어요.');
  }

  function openShortcuts() {
    closePanel();
    el('shortcutModal').hidden = false;
    el('closeShortcuts').focus();
  }
  function closeShortcuts() { el('shortcutModal').hidden = true; }

  function finishReflection() {
    if (!pendingSessionId) { el('finishModal').hidden = true; return; }
    const session = state.sessions.find(s => s.id === pendingSessionId);
    if (session) {
      session.mood = chosenMood;
      session.note = el('reflectionInput').value.trim().slice(0,240);
      save();
      renderJournal();
    }
    pendingSessionId = null;
    el('finishModal').hidden = true;
    toast('소중한 순간을 기록했어요.');
  }

  function dismissFinish() {
    pendingSessionId = null;
    el('finishModal').hidden = true;
  }

  function exportData() {
    const content = JSON.stringify({
      title: 'MAEA — My Moments',
      exportedAt: new Date().toISOString(),
      sessions: state.sessions,
      tasks: state.tasks
    }, null, 2);
    const file = new Blob([content], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'maea-moments-' + dayKey() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('기록 파일을 준비했어요.');
  }

  function eraseData() {
    if (!confirm('정말 모든 할 일과 기록을 삭제할까요? 이 작업은 되돌릴 수 없어요.')) return;
    state.tasks = [];
    state.sessions = [];
    state.selectedTaskId = null;
    renderTasks();
    renderJournal();
    renderTimer();
    save();
    toast('기록과 할 일을 초기화했어요.');
  }

  /* Gentle synthesized noise, so nothing needs to be streamed or downloaded. */
  function createSoundEngine() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) { toast('이 브라우저는 공간 소리를 지원하지 않아요.'); return null; }
    try {
      const ctx = new Context();
      const seconds = 3;
      const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let brown = 0;
        for (let i = 0; i < data.length; i++) {
          brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = (Math.random() * 2 - 1) * .63 + brown * .36;
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.loop = true;
      const filter = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      const master = ctx.createGain();
      master.gain.value = 0;
      amp.gain.value = 0.65;
      source.connect(filter); filter.connect(amp); amp.connect(master); master.connect(ctx.destination);
      source.start();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.type = 'sine';
      lfo.connect(lfoGain);
      lfoGain.connect(amp.gain);
      lfo.start();
      return { ctx, source, filter, amp, master, lfo, lfoGain };
    } catch {
      toast('오디오를 시작할 수 없어요. 브라우저 설정을 확인해 주세요.');
      return null;
    }
  }

  async function applySound() {
    if (currentSound === 'off') {
      if (soundEngine) soundEngine.master.gain.setTargetAtTime(0, soundEngine.ctx.currentTime, .09);
      renderSounds();
      return;
    }
    if (!soundEngine) soundEngine = createSoundEngine();
    if (!soundEngine) { currentSound = 'off'; renderSounds(); return; }
    const {ctx, filter, amp, master, lfo, lfoGain} = soundEngine;
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch { /* mobile audio restriction */ }
    const now = ctx.currentTime;
    const presets = {
      rain: { kind:'bandpass', freq:1150, q:.4, amp:.78, lfo:.03, depth:0 },
      ocean: { kind:'lowpass', freq:410, q:.5, amp:.59, lfo:.12, depth:.31 },
      wind: { kind:'lowpass', freq:220, q:.7, amp:.48, lfo:.07, depth:.22 }
    };
    const p = presets[currentSound] || presets.rain;
    filter.type = p.kind;
    filter.frequency.setTargetAtTime(p.freq, now, .18);
    filter.Q.setTargetAtTime(p.q, now, .18);
    amp.gain.setTargetAtTime(p.amp, now, .2);
    lfo.frequency.setTargetAtTime(p.lfo, now, .2);
    lfoGain.gain.setTargetAtTime(p.depth, now, .2);
    master.gain.setTargetAtTime((state.volume / 100) * .24, now, .1);
    renderSounds();
  }

  function renderSounds() {
    $$('.sound-choice').forEach(b => {
      const active = b.dataset.sound === currentSound;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    el('soundMute').setAttribute('aria-label', currentSound === 'off' ? '소리 켜기' : '소리 끄기');
    el('soundMute').style.opacity = currentSound === 'off' ? '.5' : '1';
    el('soundVolume').value = state.volume;
  }

  function gentleChime() {
    if (!soundEngine || soundEngine.ctx.state !== 'running') return;
    const {ctx} = soundEngine;
    const now = ctx.currentTime;
    [440,660,880].forEach((freq,index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      osc.connect(gain);gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0,now+index*.16);
      gain.gain.linearRampToValueAtTime(.035,now+index*.16+.03);
      gain.gain.exponentialRampToValueAtTime(.0001,now+index*.16+1.3);
      osc.start(now+index*.16); osc.stop(now+index*.16+1.4);
    });
  }

  function applyMotion() {
    document.body.classList.toggle('no-motion', state.settings.motion === false);
    el('motionToggle').checked = state.settings.motion !== false;
  }

  function initEvents() {
    el('sceneGallery').addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      const buttons = $$('#sceneGallery [data-scene]');
      const current = buttons.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next = buttons[(current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus(); next.scrollIntoView({block:'nearest',inline:'nearest',behavior:state.settings.motion && !mediaReduce.matches?'smooth':'auto'});
    });

    $$('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $$('.duration').forEach(b => b.addEventListener('click', () => chooseDuration(b.dataset.duration)));
    el('timerPlay').addEventListener('click', playTimer);
    el('storyStart').addEventListener('click', () => {
      if (state.timer.running) {
        document.querySelector('#timerWrap').scrollIntoView({behavior:'smooth',block:'center'});
      } else playTimer();
    });
    el('timerReset').addEventListener('click', () => {
      if ((state.timer.running || state.timer.remaining !== state.timer.total) && !confirm('타이머를 처음부터 다시 시작할까요?')) return;
      resetTimer();
      toast('타이머를 초기화했어요.');
    });
    el('focusView').addEventListener('click', toggleFocusView);
    $$('[data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
    el('navHome').addEventListener('click', () => { closePanel(); window.scrollTo({top:0,behavior:'smooth'}); });
    $('[data-mobile-home]').addEventListener('click', () => {
      closePanel(); window.scrollTo({top:0,behavior:'smooth'});
      refreshNavigation(null);
    });
    el('closePanel').addEventListener('click', closePanel);
    el('scrim').addEventListener('click', closePanel);
    el('taskList').addEventListener('click', handleTasksClick);
    el('taskForm').addEventListener('submit', event => {
      event.preventDefault();
      const input = el('taskInput');
      const value = input.value.trim();
      if (!value) return;
      state.tasks.push({id:makeId(),text:value.slice(0,90),done:false});
      input.value = '';
      renderTasks();save();
      input.focus();
    });
    el('clearTasks').addEventListener('click', () => {
      const count = state.tasks.filter(t => t.done).length;
      if (!count) { toast('정리할 완료 항목이 없어요.');return; }
      state.tasks = state.tasks.filter(t => !t.done);
      renderTasks();save();
      toast(count + '개의 완료 항목을 정리했어요.');
    });
    el('exportHistory').addEventListener('click', exportData);
    el('exportSettings').addEventListener('click', exportData);
    el('eraseData').addEventListener('click', eraseData);
    el('motionToggle').addEventListener('change', event => {
      state.settings.motion = event.target.checked;
      applyMotion();save();
    });
    el('notifyToggle').addEventListener('change', async event => {
      if (!event.target.checked) {
        state.settings.notifications = false;save();return;
      }
      if (!('Notification' in window) || !window.isSecureContext) {
        event.target.checked = false;
        toast('이 브라우저에서는 알림을 사용할 수 없어요.');
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        state.settings.notifications = permission === 'granted';
        event.target.checked = state.settings.notifications;
        save();
        toast(state.settings.notifications ? '알림을 허용했어요.' : '알림 권한이 허용되지 않았어요.');
      } catch {
        event.target.checked = false;
        toast('알림 권한을 요청할 수 없어요.');
      }
    });

    $$('.sound-choice').forEach(button => button.addEventListener('click', () => {
      const sound = button.dataset.sound;
      currentSound = currentSound === sound ? 'off' : sound;
      if (currentSound !== 'off') lastSound = currentSound;
      applySound();
    }));
    el('soundMute').addEventListener('click', () => {
      if (currentSound === 'off') currentSound = lastSound;
      else { lastSound = currentSound; currentSound = 'off'; }
      applySound();
    });
    el('soundVolume').addEventListener('input', event => {
      state.volume = Math.max(0,Math.min(100,Number(event.target.value)));
      if (soundEngine && currentSound !== 'off') soundEngine.master.gain.setTargetAtTime((state.volume/100)*.24,soundEngine.ctx.currentTime,.07);
      save();
    });

    $$('.mood-row button').forEach(button => button.addEventListener('click', () => {
      chosenMood = button.dataset.mood;
      $$('.mood-row button').forEach(b => {
        const on = b === button;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }));
    el('finishSave').addEventListener('click', finishReflection);
    el('finishClose').addEventListener('click', dismissFinish);
    el('helpLink').addEventListener('click', openShortcuts);
    el('showShortcuts').addEventListener('click', openShortcuts);
    el('closeShortcuts').addEventListener('click', closeShortcuts);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!el('finishModal').hidden) { dismissFinish();return; }
        if (!el('shortcutModal').hidden) { closeShortcuts();return; }
        if (currentPanel) {closePanel();return;}
        if (document.body.classList.contains('focus-only')) toggleFocusView();
        return;
      }
      const tag = document.activeElement?.tagName;
      const editing = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;
      if (editing || !el('finishModal').hidden || !el('shortcutModal').hidden || currentPanel) return;
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();openShortcuts();return;
      }
      if (/^[1-6]$/.test(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
        setScene(sceneList[Number(event.key) - 1].id);return;
      }
      if (event.code === 'Space' && !['BUTTON','A'].includes(tag)) {
        event.preventDefault();playTimer();
      }
    });

    document.addEventListener('visibilitychange', () => { checkTimer();clockHeader();renderJournal(); });
    window.addEventListener('focus', checkTimer);
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      // Keep multiple open tabs consistent with the last persisted change.
      state = readState();
      setScene(state.scene,true);
      renderTasks();renderJournal();renderTimer();applyMotion();
    });
  }

  function init() {
    renderGallery();
    setScene(state.scene,true);
    renderIntent();
    applyMotion();
    el('notifyToggle').checked = !!state.settings.notifications;
    renderSounds();
    renderTasks();
    renderJournal();
    clockHeader();
    initEvents();
    if (state.timer.running && typeof state.timer.endAt === 'number') {
      checkTimer();
    } else if (state.timer.running) {
      resetTimer();
    } else {
      renderTimer();
    }
    clearInterval(clockInterval);
    clockInterval = setInterval(() => { checkTimer();clockHeader(); }, 500);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }

  init();
})();
