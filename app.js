/* =========================================================
   TaskxNova — app.js
   Core application: dashboard, today's schedule, pomodoro,
   notes, goals, settings, page navigation, boot sequence.
   ========================================================= */

/* ---------------- Gamification ---------------- */
const Gamification = (function(){
  const LEVEL_XP = 200; // xp per level
  const BADGES = [
    { id:'first_log', icon:'🌱', label:'First Steps', test:g => g.totalLogs >= 1 },
    { id:'streak3', icon:'🔥', label:'3-Day Streak', test:g => g.streak >= 3 },
    { id:'streak7', icon:'⚡', label:'Week Warrior', test:g => g.streak >= 7 },
    { id:'streak30', icon:'👑', label:'Monthly Master', test:g => g.streak >= 30 },
    { id:'chapters10', icon:'📘', label:'10 Chapters', test:g => g.chaptersCompleted >= 10 },
    { id:'rev25', icon:'🧠', label:'25 Revisions', test:g => g.revisionsCompleted >= 25 },
    { id:'level5', icon:'💎', label:'Level 5', test:g => levelFor(g.xp).level >= 5 },
    { id:'pomo20', icon:'🍅', label:'20 Pomodoros', test:g => g.pomodoros >= 20 }
  ];

  let state = Storage.get('gamification', null) || {
    xp:0, streak:0, lastActiveDay:null, totalLogs:0, chaptersCompleted:0,
    revisionsCompleted:0, pomodoros:0, earnedBadges:[]
  };

  function save(){ Storage.set('gamification', state); }

  function levelFor(xp){
    const level = Math.floor(xp / LEVEL_XP) + 1;
    const into = xp % LEVEL_XP;
    return { level, into, pct: Math.round((into/LEVEL_XP)*100) };
  }

  function addXP(amount){
    state.xp += amount;
    save();
    checkBadges();
    renderWidget();
  }

  function touchDailyStreak(){
    const today = new Date().toDateString();
    if(state.lastActiveDay === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if(state.lastActiveDay === yesterday) state.streak += 1;
    else if(state.lastActiveDay !== today) state.streak = 1;
    state.lastActiveDay = today;
    save();
    checkBadges();
  }

  function onLogAdded(){ state.totalLogs += 1; touchDailyStreak(); addXP(15); }
  function onTaskCompleted(){ touchDailyStreak(); addXP(10); }
  function onChapterCompleted(){ state.chaptersCompleted += 1; save(); touchDailyStreak(); addXP(25); }
  function onRevisionAdded(){ addXP(5); }
  function onRevisionCompleted(){ state.revisionsCompleted += 1; save(); touchDailyStreak(); addXP(20); }
  function onPomodoroCompleted(){ state.pomodoros += 1; save(); touchDailyStreak(); addXP(30); }

  function checkBadges(){
    let newOnes = [];
    BADGES.forEach(b => {
      if(!state.earnedBadges.includes(b.id) && b.test(state)){
        state.earnedBadges.push(b.id);
        newOnes.push(b);
      }
    });
    if(newOnes.length){
      save();
      newOnes.forEach(b => Utils.toast(`Badge unlocked: ${b.icon} ${b.label}`, 'success'));
      renderBadges();
    }
  }

  function renderWidget(){
    const lvl = levelFor(state.xp);
    const lvlNum = document.getElementById('lvlNum');
    if(lvlNum) lvlNum.textContent = lvl.level;
    const ring = document.getElementById('xpRingFill');
    if(ring){
      const c = 2 * Math.PI * 22;
      ring.style.strokeDasharray = c;
      ring.style.strokeDashoffset = c - (c * lvl.pct/100);
    }
    const streakEl = document.getElementById('streakNum');
    if(streakEl) streakEl.textContent = state.streak;
    const streakEl2 = document.getElementById('streakNum2');
    if(streakEl2) streakEl2.textContent = state.streak;
    const xpText = document.getElementById('xpText');
    if(xpText) xpText.textContent = `${lvl.into}/${LEVEL_XP} XP`;
  }

  function renderBadges(){
    const grid = document.getElementById('badgeGrid');
    if(!grid) return;
    grid.innerHTML = BADGES.map(b => `
      <div class="badge ${state.earnedBadges.includes(b.id)?'earned':''}" data-tip="${b.label}">${b.icon}</div>
    `).join('');
  }

  function render(){ renderWidget(); renderBadges(); }

  return { onLogAdded, onTaskCompleted, onChapterCompleted, onRevisionAdded, onRevisionCompleted, onPomodoroCompleted, render, levelFor, get state(){ return state; } };
})();

/* ---------------- Sound effects (Web Audio, no external files) ---------------- */
const SoundFX = (function(){
  let ctx = null;

  function getCtx(){
    if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(ac, freq, startOffset, dur, opts){
    opts = opts || {};
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    const t0 = ac.currentTime + startOffset;
    const peak = opts.peak != null ? opts.peak : 0.16;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function play(kind){
    if(!AppSettings.settings.sound) return;
    try{
      const ac = getCtx();
      if(kind === 'focusEnd'){
        // bright ascending two-note chime — "focus session done, take a break"
        tone(ac, 880.00, 0,    0.30, { peak:0.18 });
        tone(ac, 1318.51, 0.16, 0.38, { peak:0.16 });
      } else if(kind === 'breakEnd'){
        // softer two-note chime — "break's over, back to focus"
        tone(ac, 659.25, 0,    0.24, { peak:0.14 });
        tone(ac, 987.77, 0.13, 0.30, { peak:0.13 });
      } else if(kind === 'tick'){
        tone(ac, 784, 0, 0.09, { peak:0.10, type:'sine' });
      }
    } catch(err){ /* Web Audio unavailable — fail silently */ }
  }

  function prime(){
    try{ getCtx(); } catch(err){ /* ignore */ }
  }

  return { play, prime };
})();

/* ---------------- Pomodoro ---------------- */
const Pomodoro = (function(){
  let mode = 'focus25';
  const MODES = { focus25:{focus:25,brk:5}, focus50:{focus:50,brk:10}, custom:{focus:25,brk:5} };
  let phase = 'focus';
  let secondsLeft = MODES.focus25.focus * 60;
  let totalSeconds = secondsLeft;
  let timer = null;
  let running = false;

  function setMode(m){
    mode = m;
    if(m === 'custom'){
      const f = parseInt(prompt('Focus minutes:', MODES.custom.focus)) || MODES.custom.focus;
      const b = parseInt(prompt('Break minutes:', MODES.custom.brk)) || MODES.custom.brk;
      MODES.custom.focus = f; MODES.custom.brk = b;
    }
    reset();
    document.querySelectorAll('.pomo-modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  }

  function reset(){
    pause();
    phase = 'focus';
    secondsLeft = MODES[mode].focus * 60;
    totalSeconds = secondsLeft;
    updateDisplay();
  }

  function toggle(){ running ? pause() : start(); }

  function start(){
    if(running) return;
    SoundFX.prime(); // unlock audio on this user gesture so timer-triggered chimes can play later
    running = true;
    document.getElementById('pomoMainIcon') && (document.getElementById('pomoMainIcon').innerHTML = pauseIcon());
    timer = setInterval(tick, 1000);
  }
  function pause(){
    running = false;
    clearInterval(timer);
    const ic = document.getElementById('pomoMainIcon');
    if(ic) ic.innerHTML = playIcon();
  }

  function tick(){
    secondsLeft -= 1;
    if(secondsLeft <= 0){
      if(phase === 'focus'){
        Gamification.onPomodoroCompleted();
        logPomodoro();
        SoundFX.play('focusEnd');
        Utils.toast('Focus session complete — take a break', 'success');
        phase = 'break';
        secondsLeft = MODES[mode].brk * 60;
        totalSeconds = secondsLeft;
      } else {
        SoundFX.play('breakEnd');
        Utils.toast('Break over — back to focus', 'info');
        phase = 'focus';
        secondsLeft = MODES[mode].focus * 60;
        totalSeconds = secondsLeft;
      }
    } else if(secondsLeft <= 3){
      SoundFX.play('tick'); // short countdown beep for the last 3 seconds of a phase
    }
    updateDisplay();
  }

  function logPomodoro(){
    const log = Storage.get('pomodoroLog', []);
    log.push({ ts: Date.now(), minutes: MODES[mode].focus });
    Storage.set('pomodoroLog', log);
  }

  function updateDisplay(){
    const m = Math.floor(secondsLeft/60), s = secondsLeft%60;
    const t = document.getElementById('pomoTimeText');
    if(t) t.textContent = `${Utils.pad2(m)}:${Utils.pad2(s)}`;
    const modeLabel = document.getElementById('pomoModeText');
    if(modeLabel) modeLabel.textContent = phase === 'focus' ? 'Focus' : 'Break';
    const ring = document.getElementById('pomoRingFill');
    if(ring){
      const c = 2 * Math.PI * 100;
      const pct = totalSeconds ? (secondsLeft/totalSeconds) : 0;
      ring.style.strokeDasharray = c;
      ring.style.strokeDashoffset = c * (1-pct);
    }
  }

  function playIcon(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
  function pauseIcon(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'; }

  function init(){ updateDisplay(); }

  return { setMode, toggle, reset, init };
})();

/* ---------------- Notes ---------------- */
const Notes = (function(){
  let notes = Storage.get('notes', []);
  let filter = '';

  function save(){ Storage.set('notes', notes); }

  function add(){
    notes.unshift({ id: Utils.uid(), title:'Untitled note', body:'', pinned:false, ts:Date.now() });
    save(); render();
  }
  function update(id, field, value){
    const n = notes.find(x => x.id === id);
    if(n){ n[field] = value; n.ts = Date.now(); save(); }
  }
  function togglePin(id){
    const n = notes.find(x => x.id === id);
    if(n){ n.pinned = !n.pinned; save(); render(); }
  }
  function remove(id){
    notes = notes.filter(n => n.id !== id);
    save(); render();
  }
  function setFilter(term){ filter = term.toLowerCase(); render(); }

  function render(){
    const grid = document.getElementById('notesGrid');
    if(!grid) return;
    let list = notes.filter(n => !filter || n.title.toLowerCase().includes(filter) || n.body.toLowerCase().includes(filter));
    list = [...list.filter(n=>n.pinned), ...list.filter(n=>!n.pinned)];
    if(list.length === 0){
      grid.innerHTML = `<div class="queue-empty"><div class="msg">No notes yet — tap + Add Note to start</div></div>`;
      return;
    }
    grid.innerHTML = list.map(n => `
      <div class="note-card ${n.pinned?'pinned':''}">
        <input class="note-title" value="${Utils.escapeHtml(n.title)}" onchange="Notes.update('${n.id}','title',this.value)">
        <textarea class="note-body" onchange="Notes.update('${n.id}','body',this.value)">${Utils.escapeHtml(n.body)}</textarea>
        <div class="note-foot">
          <span class="note-date">${Utils.fmtDate(n.ts)}</span>
          <div class="note-actions">
            <button class="${n.pinned?'pin-on':''}" onclick="Notes.togglePin('${n.id}')" data-tip="Pin">📌</button>
            <button onclick="Notes.remove('${n.id}')" data-tip="Delete">🗑️</button>
          </div>
        </div>
      </div>`).join('');
  }

  return { add, update, togglePin, remove, setFilter, render };
})();

/* ---------------- Goals ---------------- */
const Goals = (function(){
  let goals = Storage.get('goals', { daily:4, weekly:24, monthly:90 });

  function save(){ Storage.set('goals', goals); }
  function setTarget(period, val){ goals[period] = parseFloat(val) || 0; save(); render(); }

  function progress(period){
    const entries = Storage.get('entries', []);
    const now = new Date();
    let hours = 0;
    if(period === 'daily') hours = entries.filter(e => Utils.sameDay(e.ts, now)).reduce((s,e)=>s+e.dur,0);
    if(period === 'weekly'){
      const start = new Date(now); start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0);
      hours = entries.filter(e => e.ts >= start.getTime()).reduce((s,e)=>s+e.dur,0);
    }
    if(period === 'monthly') hours = entries.filter(e => new Date(e.ts).getMonth()===now.getMonth() && new Date(e.ts).getFullYear()===now.getFullYear()).reduce((s,e)=>s+e.dur,0);
    const target = goals[period] || 1;
    return { hours, target, pct: Utils.clamp(Math.round((hours/target)*100),0,100) };
  }

  function render(){
    const box = document.getElementById('goalsBox');
    if(!box) return;
    const periods = [['daily','Daily Goal'],['weekly','Weekly Goal'],['monthly','Monthly Goal']];
    box.innerHTML = periods.map(([key,label]) => {
      const p = progress(key);
      return `
      <div class="goal-card">
        <div class="goal-top">
          <span class="goal-label">${label}</span>
          <span class="goal-pct">${p.pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${p.pct}%;background:var(--primary-grad);"></div></div>
        <div class="field-row" style="margin-top:10px;">
          <span class="q-meta" style="font-size:11px;">${p.hours.toFixed(1)}h of</span>
          <input type="number" step="0.5" value="${goals[key]}" style="width:70px;" onchange="Goals.setTarget('${key}', this.value)">
          <span class="q-meta" style="font-size:11px;">hrs</span>
        </div>
      </div>`;
    }).join('');
  }

  return { setTarget, progress, render };
})();

/* ---------------- Settings ---------------- */
const AppSettings = (function(){
  let settings = Storage.get('settings', { theme:'dark', accent:'#6C63FF', notifications:true, sound:true });
  if(settings.sound === undefined) settings.sound = true; // migrate older saved settings

  function save(){ Storage.set('settings', settings); }

  function applyTheme(){
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.style.setProperty('--primary', settings.accent);
  }

  function toggleTheme(){
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme(); render();
  }
  function setAccent(hex){
    settings.accent = hex; save(); applyTheme(); render();
  }
  function toggleNotifications(){
    settings.notifications = !settings.notifications;
    save(); render();
  }
  function toggleSound(){
    settings.sound = !settings.sound;
    save(); render();
    if(settings.sound) SoundFX.play('breakEnd'); // quick audible confirmation it's on
  }

  function render(){
    const themeSwitch = document.getElementById('themeSwitch');
    if(themeSwitch) themeSwitch.classList.toggle('on', settings.theme === 'light');
    const notifSwitch = document.getElementById('notifSwitch');
    if(notifSwitch) notifSwitch.classList.toggle('on', settings.notifications);
    const soundSwitch = document.getElementById('soundSwitch');
    if(soundSwitch) soundSwitch.classList.toggle('on', settings.sound);
    document.querySelectorAll('.pomo-sound-toggle').forEach(b => b.classList.toggle('muted', !settings.sound));
    document.querySelectorAll('.accent-dot').forEach(d => d.classList.toggle('active', d.dataset.color === settings.accent));
  }

  function init(){ applyTheme(); }

  return { toggleTheme, setAccent, toggleNotifications, toggleSound, save, render, init, get settings(){ return settings; } };
})();

/* ---------------- Core App ---------------- */
  const App = (function(){
  const CATS = { "Physics":"#FBBF24", "Chemistry":"#60A5FA", "Maths":"#A78BFA" };
  let entries = Storage.get('entries', []) || [];
  let tasks = Storage.get('tasks', []) || [];

  let range = 'today';
  let currentPage = 'dashboard';
  let reminderDismissed = false;
  let distChart, waveChart;

  function save(){ Storage.set('entries', entries); }
  function saveTasks(){ Storage.set('tasks', tasks); }

  function reloadAll(){
    entries = Storage.get('entries', []);
    tasks = Storage.get('tasks', []);
    Revision.reload();
    Syllabus.reload();
    render();
    Revision.render();
    Syllabus.render();
    Calendar.render();
    Notes.render();
    Goals.render();
    Gamification.render();
  }

  function inRange(ts){
    const d = new Date(ts), n = new Date();
    if(range === 'today') return d.toDateString() === n.toDateString();
    if(range === 'week'){ const start = new Date(n); start.setDate(n.getDate()-n.getDay()); start.setHours(0,0,0,0); return d >= start; }
    if(range === 'month') return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    if(range === 'year') return d.getFullYear() === n.getFullYear();
    return true;
  }

  function setRange(r){
    range = r;
    document.querySelectorAll('#rangeTabs button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
    render();
  }

  function updateClock(){
    const now = new Date();
    const dateEl = document.getElementById('dateStr');
    const timeEl = document.getElementById('timeStr');
    if(dateEl) dateEl.textContent = now.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'}).toUpperCase();
    if(timeEl) timeEl.textContent = now.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    const chip = document.getElementById('topbarDate');
    if(chip) chip.textContent = now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  }

  function render(){
    const greetEl = document.getElementById('greetText');
    if(greetEl) greetEl.textContent = Utils.greeting();
    const quoteEl = document.getElementById('quoteText');
    if(quoteEl) quoteEl.textContent = Utils.dailyQuote();

    const periodEntries = entries.filter(e => inRange(e.ts));
    const gross = periodEntries.reduce((s,e)=>s+e.dur,0);
    const probPeriod = periodEntries.reduce((s,e)=>s+(e.prob||0),0);
    const probTotal = entries.reduce((s,e)=>s+(e.prob||0),0);
    const focus = gross > 0 ? Math.min(100, Math.round((probPeriod / (gross*4)) * 100)) : 0;
    const dueCounts = Revision.getDueCounts ? Revision.getDueCounts() : {total:0};
    const tasksDone = tasks.filter(t => Utils.sameDay(t.date||Date.now(), new Date()) && t.done).length;
    const tasksTotal = tasks.filter(t => Utils.sameDay(t.date||Date.now(), new Date())).length;

    setNum('statGross', gross, {decimals:1, suffix:'h'});
    setNum('statProbPeriod', probPeriod, {});
    setNum('statFocus', focus, {suffix:'%'});
    setText('statRevDue', dueCounts.total);
    setText('statTasksDone', `${tasksDone}/${tasksTotal}`);
    setText('statStreak', Gamification.state.streak);

    Charts.distribution(periodEntries, CATS);
    Charts.weeklyWave(entries);
    Charts.monthlyBars(entries);
    Charts.heatmap(entries);

    renderTasks();
    renderQueue();
  }

  function setNum(id, val, opts){
    const el = document.getElementById(id);
    if(!el) return;
    Utils.animateCounter(el, val, opts);
  }
  function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

  let queueView = 'today';

  function setQueueView(v){
    queueView = v;
    document.querySelectorAll('#queueTabs .q-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    const clearBtn = document.getElementById('queueClearBtn');
    if(clearBtn) clearBtn.style.display = v === 'today' ? '' : 'none';
    renderQueue();
  }

  function queueItemHtml(e){
    return `
        <div class="queue-item">
          <span class="q-dot" style="background:${CATS[e.cat]||'var(--text-faint)'}"></span>
          <div class="q-main">
            <div class="q-desc">${Utils.escapeHtml(e.desc)}</div>
            <div class="q-meta">${e.type ? e.type + ' · ' : ''}${e.dur} hr${e.dur!=1?'s':''} · ${e.prob||0} problems · ${Utils.fmtTime(e.ts)}</div>
          </div>
          <span class="q-cat-tag" style="background:${CATS[e.cat]||'rgba(255,255,255,0.08)'}22; color:${CATS[e.cat]||'var(--text-dim)'};">${e.cat}</span>
          <button class="q-del" onclick="App.removeEntry('${e.ts}')">&times;</button>
        </div>`;
  }

  function renderQueue(){
    const list = document.getElementById('queueList');
    if(!list) return;

    if(queueView === 'past'){
      const past = entries.filter(e => !Utils.sameDay(e.ts, new Date())).sort((a,b)=>b.ts-a.ts);
      if(past.length === 0){
        list.innerHTML = `<div class="queue-empty">
          <div class="msg">No past objectives logged yet</div>
        </div>`;
        return;
      }
      let html = '', lastKey = '';
      past.forEach(e => {
        const key = new Date(e.ts).toDateString();
        if(key !== lastKey){ html += `<div class="queue-date-heading">${Utils.fmtDateLong(e.ts)}</div>`; lastKey = key; }
        html += queueItemHtml(e);
      });
      list.innerHTML = html;
      return;
    }

    const todays = entries.filter(e => Utils.sameDay(e.ts, new Date())).sort((a,b)=>b.ts-a.ts);
    if(todays.length === 0){
      list.innerHTML = `<div class="queue-empty">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5D5D80" stroke-width="1.8"><path d="M12 2l1.5 6L20 9l-6 3 1 7-3-4-3 4 1-7-6-3 6.5-1z"/></svg></div>
        <div class="msg">No study sessions logged for today</div>
      </div>`;
    } else {
      list.innerHTML = todays.map(queueItemHtml).join('');
    }
  }

  function addEntry(desc, cat, type, dur, prob){
    const ts = Date.now();
    entries.push({ ts, desc, cat, type, dur, prob });
    save();
    Gamification.onLogAdded();
    render();
    return ts;
  }
  function removeEntry(ts){
    entries = entries.filter(e => e.ts != ts);
    const linked = tasks.find(t => t.entryTs == ts);
    if(linked){ linked.entryTs = null; linked.done = false; saveTasks(); }
    save(); render();
  }
  function clearQueue(){
    if(queueView === 'past'){ Utils.toast('Switch to Today to clear entries', 'info'); return; }
    if(!confirm("Clear all of today's logged objectives? This cannot be undone.")) return;
    entries = entries.filter(e => !Utils.sameDay(e.ts, new Date()));
    tasks.forEach(t => { if(t.date === new Date().toDateString()){ t.entryTs = null; t.done = false; } });
    saveTasks(); save(); render();
  }

  /* ------- Today's Schedule (tasks) — integrates logging a session ------- */
  function addTask(title, subject, type, duration, problems, priority){
    const task = { id: Utils.uid(), title, subject, type, duration, problems, priority: priority||'medium', done:false, date: new Date().toDateString(), entryTs:null };
    tasks.push(task);
    saveTasks();
    if(duration > 0){
      task.entryTs = addEntry(title, subject, type, duration, problems);
      task.done = true;
      saveTasks();
    }
    render();
  }
  function toggleTask(id){
    const t = tasks.find(x => x.id === id);
    if(!t) return;
    t.done = !t.done;
    if(t.done && !t.entryTs){
      t.entryTs = addEntry(t.title, t.subject, t.type||'', t.duration||0, t.problems||0);
    } else if(t.done){
      Gamification.onTaskCompleted();
    }
    saveTasks();
    render();
  }
  function deleteTask(id){
    const t = tasks.find(x => x.id === id);
    if(t && t.entryTs){ entries = entries.filter(e => e.ts !== t.entryTs); save(); }
    tasks = tasks.filter(x => x.id !== id);
    saveTasks(); render();
  }
  function renderTasks(){
    const list = document.getElementById('taskList');
    if(!list) return;
    const todays = tasks.filter(t => t.date === new Date().toDateString());
    if(todays.length === 0){
      list.innerHTML = `<div class="queue-empty"><div class="msg">No objectives scheduled — add one above</div></div>`;
      return;
    }
    list.innerHTML = todays.map(t => `
      <div class="task-row">
        <div class="task-check ${t.done?'on':''}" onclick="App.toggleTask('${t.id}')">${t.done?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>':''}</div>
        <div class="task-body">
          <div class="task-title ${t.done?'done':''}">${Utils.escapeHtml(t.title)}</div>
          <div class="task-meta">${t.subject||'General'}${t.type?' · '+t.type:''}${t.duration?' · '+t.duration+'h':''}${t.problems?' · '+t.problems+' probs':''}</div>
        </div>
        <span class="priority-tag ${t.priority}">${t.priority.toUpperCase()}</span>
        <button class="q-del" onclick="App.deleteTask('${t.id}')">&times;</button>
      </div>`).join('');
  }

  /* ------- Reminders ------- */
  function checkReminder(){
    if(reminderDismissed) return;
    const c = Revision.getDueCounts();
    const bar = document.getElementById('reminderBar');
    if(!bar) return;
    if(c.total === 0){ bar.style.display = 'none'; return; }
    let msg = '';
    if(c.overdue > 0 && c.dueToday > 0) msg = `<b>${c.overdue} topic${c.overdue!=1?'s':''} overdue</b> and <b>${c.dueToday} due today</b> for revision.`;
    else if(c.overdue > 0) msg = `<b>${c.overdue} topic${c.overdue!=1?'s':''} overdue</b> for revision — revise before it slips further.`;
    else msg = `<b>${c.dueToday} topic${c.dueToday!=1?'s':''} due today</b> for revision.`;
    document.getElementById('reminderText').innerHTML = msg;
    bar.style.display = 'block';
  }
  function dismissReminder(){ reminderDismissed = true; document.getElementById('reminderBar').style.display = 'none'; }
  function gotoRevisionFromReminder(){ dismissReminder(); setPage('revision'); }

  /* ------- Page nav ------- */
  function setPage(page){
    currentPage = page;
    document.querySelectorAll('#pageNav .page-tab').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page-view').forEach(el => el.style.display = 'none');
    const target = document.getElementById('page-' + page);
    if(target) { target.style.display = 'block'; target.classList.add('anim-in'); }
    if(page === 'revision') Revision.render();
    if(page === 'syllabus') Syllabus.render();
    if(page === 'calendar') Calendar.render();
    if(page === 'notes') Notes.render();
    if(page === 'goals') Goals.render();
    if(page === 'gamification') Gamification.render();
  }

  /* ------- Search & filter ------- */
  function globalSearch(term){
    term = term.trim().toLowerCase();
    if(!term) return;
    const inTasks = tasks.some(t => t.title.toLowerCase().includes(term));
    const inTopics = Revision.topics.some(t => t.name.toLowerCase().includes(term));
    const inNotes = (Storage.get('notes',[])||[]).some(n => n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term));
    if(inNotes) setPage('notes');
    else if(inTopics) setPage('revision');
    else if(inTasks) setPage('dashboard');
    Notes.setFilter(term);
  }

  /* ------- Data reset / backup ------- */
  function resetData(){
    if(!confirm('Reset all TaskxNova data on this device? This clears everything.')) return;
    Storage.KEYS.forEach(k => localStorage.removeItem(Storage.PREFIX + k));
    location.reload();
  }
  function importFile(fileInput){
    const file = fileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try{ Storage.importJSON(e.target.result); Utils.toast('Backup imported', 'success'); reloadAll(); }
      catch(err){ Utils.toast('Import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
  }

  /* ------- FAB ------- */
  function toggleFab(){
    document.getElementById('fabMenu').classList.toggle('open');
  }

  function init(){
    AppSettings.init();
    Utils.attachGlobalClickEffects();
    Utils.attachTiltEffect();
    updateClock();
    setInterval(updateClock, 1000);
    Pomodoro.init();

    document.getElementById('todayForm').addEventListener('submit', function(e){
      e.preventDefault();
      const titleInput = document.getElementById('todayTitle');
      const title = titleInput.value.trim();
      const subject = document.getElementById('todaySubject').value;
      const type = document.getElementById('todayType').value;
      const duration = parseFloat(document.getElementById('todayDuration').value) || 0;
      const problems = parseInt(document.getElementById('todayProblems').value) || 0;
      const priority = document.getElementById('todayPriority').value;
      if(!title){ Utils.shakeElement(titleInput); titleInput.focus(); return; }
      addTask(title, subject, type, duration, problems, priority);
      const submitBtn = this.querySelector('.btn-submit');
      Utils.showButtonSuccess(submitBtn, '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:6px;"><path d="M20 6L9 17l-5-5"/></svg>Added');
      this.reset();
      titleInput.focus();
    });

    document.getElementById('topicForm').addEventListener('submit', function(e){
      e.preventDefault();
      const subject = document.getElementById('topicSubject').value;
      const nameInput = document.getElementById('topicName');
      const name = nameInput.value.trim();
      if(!name){ Utils.shakeElement(nameInput); nameInput.focus(); return; }
      Revision.addTopic(subject, name);
      const submitBtn = this.querySelector('.btn-submit');
      Utils.showButtonSuccess(submitBtn, '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:6px;"><path d="M20 6L9 17l-5-5"/></svg>Scheduled');
      this.reset();
      nameInput.focus();
    });

    document.getElementById('rangeTabs').addEventListener('click', function(e){
      const btn = e.target.closest('button'); if(!btn) return;
      setRange(btn.dataset.range);
    });

    document.getElementById('pageNav').addEventListener('click', function(e){
      const btn = e.target.closest('button'); if(!btn) return;
      setPage(btn.dataset.page);
    });

    document.getElementById('sylTabs').addEventListener('click', function(e){
      const btn = e.target.closest('button'); if(!btn) return;
      Syllabus.setSubject(btn.dataset.subject);
    });

    document.getElementById('globalSearch').addEventListener('input', Utils.debounce(function(e){
      globalSearch(e.target.value);
    }, 300));

    document.addEventListener('keydown', function(e){
      if(e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA'){
        e.preventDefault(); document.getElementById('globalSearch').focus();
      }
      if(e.key === 'Escape'){
        document.getElementById('fabMenu').classList.remove('open');
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });

    render();
    Revision.render();
    Syllabus.render();
    Calendar.render();
    Notes.render();
    Goals.render();
    Gamification.render();
    checkReminder();
  }

  return {
    CATS, init, render, setRange, setPage, removeEntry, clearQueue, resetData, importFile,
    toggleTask, deleteTask, checkReminder, dismissReminder, gotoRevisionFromReminder,
    reloadAll, toggleFab, setQueueView
  };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', function(){
  App.init();
  Auth.init();
});
