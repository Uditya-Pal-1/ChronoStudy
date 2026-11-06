(() => {
  const read = key => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  let subjects = read('subjects').filter(s => s && typeof s.name === 'string');
  let tasks = read('tasks').filter(t => t && typeof t.title === 'string').map(t => ({ ...t, id: String(t.id ?? Date.now() + Math.random()), done: Boolean(t.done), reminder: Boolean(t.reminder) }));
  let sessions = read('studySessions').filter(s => s && typeof s.date === 'string');
  const recordedTaskIds = new Set(sessions.filter(s => s.taskId).map(s => String(s.taskId)));
  tasks.filter(t => t.done && !recordedTaskIds.has(t.id) && (t.completedAt || t.startDate)).forEach(t => sessions.push({ id: `task-${t.id}`, taskId: t.id, title: t.title, subject: t.subject || '', minutes: Number(t.duration) || 0, date: t.completedAt || t.startDate, type: 'task' }));
  if (sessions.length) localStorage.setItem('studySessions', JSON.stringify(sessions));
  let filter = 'all';
  let dailyGoal = Math.min(1440, Math.max(15, Number(localStorage.getItem('studyspace-daily-goal')) || 120));
  let timerMinutes = 25;
  let secondsLeft = timerMinutes * 60;
  let timerInterval = null;
  let toastTimeout;
  let reminderInterval;
  function localDateValue() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const save = () => { localStorage.setItem('subjects', JSON.stringify(subjects)); localStorage.setItem('tasks', JSON.stringify(tasks)); localStorage.setItem('studySessions', JSON.stringify(sessions)); };
  const subjectFor = name => subjects.find(s => s.name === name);
  const colorFor = name => subjectFor(name)?.color || '#8b86a9';
  const dateTime = t => t.startDate ? new Date(`${t.startDate}T${t.startTime || '00:00'}`) : null;
  const formatDate = value => { if (!value) return ''; const d = new Date(`${value}T12:00:00`); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const setToday = () => {
    const now = new Date();
    $('todayLabel').textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    $('liveClock').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };
  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 2500); }
  function openDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); }
  function closeDialog(id) { const dialog = $(id); if (dialog.open) dialog.close(); }
  function renderSubjects() {
    $('subjects').innerHTML = subjects.length ? subjects.map(s => `<li><span class="subject-dot" style="background:${esc(s.color)}"></span><span class="subject-label">${esc(s.name)}</span><span class="subject-count">${tasks.filter(t => t.subject === s.name).length}</span></li>`).join('') : '<li class="side-empty">Add your first subject</li>';
    const chosen = $('subjectFilter').value;
    $('subjectFilter').innerHTML = '<option value="all">All subjects</option>' + subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    $('subjectFilter').value = subjects.some(s => s.name === chosen) ? chosen : 'all';
    const current = $('subjectSelect').value;
    $('subjectSelect').innerHTML = subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    if (subjects.some(s => s.name === current)) $('subjectSelect').value = current;
    $('subjectSelect').disabled = subjects.length === 0;
    const sessionSubjectValue = $('sessionSubject').value;
    $('sessionSubject').innerHTML = '<option value="">General study</option>' + subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    $('sessionSubject').value = subjects.some(s => s.name === sessionSubjectValue) ? sessionSubjectValue : '';
    const completed = tasks.filter(t => t.done).length;
    $('subjectOverview').innerHTML = subjects.length ? subjects.map(s => {
      const own = tasks.filter(t => t.subject === s.name); const done = own.filter(t => t.done).length; const pct = own.length ? Math.round(done / own.length * 100) : 0;
      return `<div class="subject-row"><div class="subject-row-info"><span class="subject-dot" style="background:${esc(s.color)}"></span><span>${esc(s.name)}</span></div><span class="subject-row-count">${own.length} ${own.length === 1 ? 'task' : 'tasks'}</span><div class="subject-progress"><span style="width:${pct}%;background:${esc(s.color)}"></span></div></div>`;
    }).join('') : '<div class="empty-state" style="padding:20px 5px">Your subjects will show up here.</div>';
    $('totalStat').textContent = tasks.length;
    $('completedStat').textContent = completed;
    const minutes = sessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
    $('hoursStat').textContent = Math.floor(minutes / 60);
    $('minutesStat').textContent = minutes % 60;
    const pct = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    $('completionStat').textContent = pct;
    $('miniProgress').style.width = `${pct}%`;
    $('progressSummary').textContent = `${pct}%`;
    $('progressBar').style.width = `${pct}%`;
    $('allCount').textContent = tasks.length;
    $('taskCountLabel').textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
  }
  function renderTasks() {
    const query = $('taskSearch').value.trim().toLowerCase();
    const subject = $('subjectFilter').value;
    const mode = $('sortTasks').value;
    const now = new Date();
    let visible = tasks.filter(t => {
      const matchesMode = filter === 'all' || (filter === 'completed' && t.done) || (filter === 'upcoming' && !t.done && (!dateTime(t) || dateTime(t) >= now));
      return matchesMode && (subject === 'all' || t.subject === subject) && (!query || `${t.title} ${t.subject} ${t.notes || ''}`.toLowerCase().includes(query));
    });
    visible = [...visible].sort((a, b) => mode === 'priority' ? ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 1) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 1) : mode === 'title' ? a.title.localeCompare(b.title) : (dateTime(a)?.getTime() ?? Infinity) - (dateTime(b)?.getTime() ?? Infinity));
    $('taskInspector').innerHTML = visible.length ? visible.map(t => {
      const when = [formatDate(t.startDate), t.startTime].filter(Boolean).join(' · ');
      return `<article class="task-card ${t.done ? 'done' : ''}"><input class="task-check" type="checkbox" aria-label="Mark ${esc(t.title)} complete" data-toggle="${esc(t.id)}" ${t.done ? 'checked' : ''}><div class="task-main"><div class="task-title">${esc(t.title)}</div><div class="task-meta"><span class="task-subject"><span class="subject-dot" style="background:${esc(colorFor(t.subject))}"></span>${esc(t.subject || 'No subject')}</span>${when ? `<span>◷ ${esc(when)}</span>` : ''}${t.duration ? `<span>◴ ${esc(t.duration)} min</span>` : ''}${t.reminder ? '<span>♧ Reminder</span>' : ''}${t.notes ? `<span title="${esc(t.notes)}">${esc(t.notes.length > 36 ? `${t.notes.slice(0, 36)}…` : t.notes)}</span>` : ''}</div></div><span class="priority priority-${esc((t.priority || 'medium').toLowerCase())}">${esc(t.priority || 'Medium')}</span><div class="task-actions"><button class="task-action" data-edit="${esc(t.id)}" aria-label="Edit ${esc(t.title)}" title="Edit task">✎</button><button class="task-action" data-delete="${esc(t.id)}" aria-label="Delete ${esc(t.title)}" title="Delete task">×</button></div></article>`;
    }).join('') : `<div class="empty-state"><strong>${tasks.length ? 'No tasks match that view.' : 'A fresh start.'}</strong>${tasks.length ? 'Try a different filter or search.' : 'Add a study task and make a little progress today.'}</div>`;
    $('taskInspector').querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('change', () => toggleTask(el.dataset.toggle)));
    $('taskInspector').querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => editTask(el.dataset.edit)));
    $('taskInspector').querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => deleteTask(el.dataset.delete)));
  }
  function renderAll() { renderSubjects(); renderTasks(); renderHistory(); }
  function toggleTask(id) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    if (!task.done) {
      const date = localDateValue(); task.done = true; task.completedAt = date;
      if (!sessions.some(s => String(s.taskId) === id)) sessions.push({ id: `task-${id}`, taskId: id, title: task.title, subject: task.subject || '', minutes: Number(task.duration) || 0, date, type: 'task' });
      showToast('Task complete — nice work!');
    } else { task.done = false; delete task.completedAt; sessions = sessions.filter(s => String(s.taskId) !== id); }
    save(); renderAll();
  }
  function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); save(); renderAll(); showToast('Task removed'); }
  function editTask(id) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    $('taskDialogTitle').textContent = 'Edit study task'; $('editingTaskId').value = task.id;
    $('taskInput').value = task.title; $('subjectSelect').value = task.subject; $('priority').value = task.priority || 'Medium'; $('startDate').value = task.startDate || ''; $('startTime').value = task.startTime || ''; $('duration').value = task.duration || ''; $('notes').value = task.notes || ''; $('reminder').checked = task.reminder;
    openDialog('taskDialog');
  }
  function resetTaskForm() { $('taskForm').reset(); $('editingTaskId').value = ''; $('taskDialogTitle').textContent = 'Add a study task'; $('startDate').value = localDateValue(); }
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!subjects.length) { closeDialog('taskDialog'); showToast('Add a subject before creating a task'); openDialog('subjectDialog'); return; }
    const id = $('editingTaskId').value;
    const item = { id: id || String(Date.now()), title: $('taskInput').value.trim(), subject: $('subjectSelect').value, priority: $('priority').value, startDate: $('startDate').value, startTime: $('startTime').value, duration: $('duration').value, notes: $('notes').value.trim(), reminder: $('reminder').checked, done: false };
    if (id) { const old = tasks.find(t => t.id === id); item.done = old?.done || false; item.completedAt = old?.completedAt; tasks = tasks.map(t => t.id === id ? item : t); sessions = sessions.map(s => String(s.taskId) === id ? { ...s, title: item.title, subject: item.subject } : s); showToast('Task updated'); }
    else { tasks.push(item); showToast('Task added to your plan'); }
    save(); renderAll(); closeDialog('taskDialog'); resetTaskForm();
  });
  function addSubject(event) {
    event.preventDefault(); const name = $('subjectInput').value.trim();
    if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) { showToast('That subject already exists'); return; }
    subjects.push({ name, color: $('subjectColor').value }); save(); renderAll(); closeDialog('subjectDialog'); $('subjectForm').reset(); $('subjectColor').value = '#7667e8'; showToast(`${name} added`);
  }
  $('subjectForm').addEventListener('submit', addSubject);
  ['newTaskTop', 'newTaskPanel'].forEach(id => $(id).addEventListener('click', () => { resetTaskForm(); if (!subjects.length) { openDialog('subjectDialog'); showToast('Start by adding a subject'); } else openDialog('taskDialog'); }));
  ['addSubjectButton', 'quickAddSubject'].forEach(id => $(id).addEventListener('click', () => openDialog('subjectDialog')));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  document.querySelectorAll('.dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  document.querySelectorAll('.filter-tab').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.toggle('active', tab === button)); renderTasks(); }));
  $('taskSearch').addEventListener('input', renderTasks); $('subjectFilter').addEventListener('change', renderTasks); $('sortTasks').addEventListener('change', renderTasks);
  $('clearCompleted').addEventListener('click', () => { const n = tasks.filter(t => t.done).length; if (!n) { showToast('No completed tasks to clear'); return; } tasks = tasks.filter(t => !t.done); save(); renderAll(); showToast(`${n} completed ${n === 1 ? 'task' : 'tasks'} cleared`); });
  $('themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('studyspace-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); });
  if (localStorage.getItem('studyspace-theme') === 'dark') document.body.classList.add('dark');
  function updateTimer() {
    const mins = Math.floor(secondsLeft / 60); const secs = secondsLeft % 60;
    $('timerDisplay').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    $('timerRing').style.background = `conic-gradient(#8272e7 ${((timerMinutes * 60 - secondsLeft) / (timerMinutes * 60)) * 360}deg,#eeeefa 0deg)`;
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; $('timerStart').textContent = 'Resume focus'; $('timerState').textContent = 'PAUSED'; }
  $('timerStart').addEventListener('click', () => {
    if (timerInterval) { stopTimer(); return; }
    if (secondsLeft <= 0) { secondsLeft = timerMinutes * 60; updateTimer(); }
    $('timerStart').textContent = 'Pause session'; $('timerState').textContent = $('timerState').textContent === 'BREAK TIME' ? 'BREAK TIME' : 'FOCUSING';
    timerInterval = setInterval(() => { secondsLeft--; updateTimer(); if (secondsLeft <= 0) { stopTimer(); $('timerState').textContent = 'SESSION COMPLETE'; $('timerStart').textContent = 'Start again'; showToast('Session complete — take a mindful break'); if (timerMinutes > 5) { sessions.push({ id: `focus-${Date.now()}`, title: 'Focus session', subject: '', minutes: timerMinutes, date: localDateValue(), type: 'focus' }); save(); renderAll(); } } }, 1000);
  });
  $('timerReset').addEventListener('click', () => { stopTimer(); secondsLeft = timerMinutes * 60; $('timerStart').textContent = 'Start focus'; $('timerState').textContent = 'READY TO FOCUS'; updateTimer(); });
  document.querySelectorAll('.mode-button').forEach(button => button.addEventListener('click', () => {
    stopTimer(); document.querySelectorAll('.mode-button').forEach(b => b.classList.toggle('active', b === button));
    timerMinutes = Number(button.dataset.minutes); secondsLeft = timerMinutes * 60; $('timerStart').textContent = timerMinutes === 5 ? 'Start break' : 'Start focus'; $('timerState').textContent = timerMinutes === 5 ? 'READY FOR A BREAK' : 'READY TO FOCUS'; updateTimer();
  }));
  const keyForDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const sessionsOn = key => sessions.filter(s => s.date === key);
  const dayLabel = key => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  function renderCalendar() {
    $('calendarMonth').textContent = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(first.getDate() - offset);
    const today = localDateValue();
    $('calendarDays').innerHTML = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index); const key = keyForDate(date); const daySessions = sessionsOn(key);
      const planned = tasks.some(t => t.startDate === key); const done = daySessions.some(s => s.type === 'task'); const focused = daySessions.some(s => s.type === 'focus' || s.type === 'logged');
      const classes = ['calendar-day', date.getMonth() !== calendarMonth.getMonth() ? 'outside' : '', key === today ? 'today' : '', key === selectedDate ? 'selected' : '', (daySessions.length || planned) ? 'has-activity' : '', done ? 'completed' : focused ? 'focused' : ''].filter(Boolean).join(' ');
      return `<button class="${classes}" data-calendar-date="${key}" aria-label="${esc(dayLabel(key))}${daySessions.length ? `, ${daySessions.length} sessions` : ''}" title="${esc(dayLabel(key))}${daySessions.length ? ` · ${daySessions.length} sessions` : planned ? ' · Planned study' : ''}">${date.getDate()}</button>`;
    }).join('');
    $('calendarDays').querySelectorAll('[data-calendar-date]').forEach(button => button.addEventListener('click', () => { selectedDate = button.dataset.calendarDate; calendarMonth = new Date(`${selectedDate}T12:00:00`); renderHistory(); document.querySelector('.session-log').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
  }
  function renderHeatmap() {
    const today = new Date(); const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end); start.setDate(start.getDate() - 363); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const counts = new Map(); sessions.forEach(s => counts.set(s.date, (counts.get(s.date) || 0) + 1));
    const totalDays = Math.ceil((end - start) / 86400000) + 1; const weeks = Math.ceil(totalDays / 7); const year = today.getFullYear();
    const yearActive = [...counts.entries()].filter(([key, value]) => key.startsWith(`${year}-`) && value > 0).length;
    $('activeDays').textContent = yearActive;
    const activeDates = new Set([...counts.entries()].filter(([, count]) => count > 0).map(([key]) => key));
    const streakStart = activeDates.has(keyForDate(end)) ? end : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    let streak = 0; const streakDate = new Date(streakStart);
    while (activeDates.has(keyForDate(streakDate))) { streak++; streakDate.setDate(streakDate.getDate() - 1); }
    $('streakCount').textContent = streak;
    const labels = []; let previousMonth = -1;
    for (let week = 0; week < weeks; week++) { const date = new Date(start); date.setDate(start.getDate() + week * 7); if (date.getMonth() !== previousMonth) { labels.push(`<span style="left:${week * 12}px">${date.toLocaleDateString(undefined, { month: 'short' })}</span>`); previousMonth = date.getMonth(); } }
    $('heatmapMonths').innerHTML = labels.join('');
    const cells = [];
    for (let index = 0; index < weeks * 7; index++) { const date = new Date(start); date.setDate(start.getDate() + index); const key = keyForDate(date); const count = counts.get(key) || 0; const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4; const future = date > end;
      cells.push(`<button class="heat-cell level-${future ? 0 : level}" data-heat-date="${key}" ${future ? 'disabled' : ''} title="${future ? '' : `${count} ${count === 1 ? 'session' : 'sessions'} · ${esc(dayLabel(key))}`}" aria-label="${future ? 'Future date' : `${count} sessions on ${esc(dayLabel(key))}`}"></button>`); }
    $('heatmap').innerHTML = cells.join('');
    $('heatmap').querySelectorAll('[data-heat-date]:not(:disabled)').forEach(button => button.addEventListener('click', () => { selectedDate = button.dataset.heatDate; calendarMonth = new Date(`${selectedDate}T12:00:00`); renderHistory(); document.querySelector('.calendar-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  }
  function renderSessionList() {
    const entries = selectedDate ? sessionsOn(selectedDate).sort((a, b) => b.id.localeCompare(a.id)) : [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    $('sessionLogTitle').textContent = selectedDate ? `Sessions · ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Recent sessions';
    $('sessionCount').textContent = `${entries.length} ${entries.length === 1 ? 'session' : 'sessions'}`;
    $('sessionList').innerHTML = entries.length ? entries.map(s => `<div class="session-entry"><span class="session-badge">${s.type === 'task' ? '✓' : '◷'}</span><div class="session-copy"><strong>${esc(s.title)}</strong><span>${esc(s.subject || (s.type === 'focus' ? 'Focused study' : s.type === 'logged' ? 'Logged session' : 'Completed task'))} · ${esc(dayLabel(s.date))}</span></div><span class="session-minutes">${Number(s.minutes) ? `${Number(s.minutes)} min` : 'Complete'}</span></div>`).join('') : `<div class="session-empty">${selectedDate ? `No study sessions on ${esc(dayLabel(selectedDate))}.` : 'Complete a task or finish a focus timer to start your study history.'}</div>`;
  }
  function renderHistory() {
    renderCalendar(); renderHeatmap(); renderSessionList();
    const todayMinutes = sessions.filter(s => s.date === localDateValue()).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
    const percent = Math.min(100, Math.round(todayMinutes / dailyGoal * 100));
    $('goalProgressText').textContent = `${todayMinutes} of ${dailyGoal} minutes`;
    $('goalProgressBar').style.width = `${percent}%`;
    $('goalPercent').textContent = `${percent}%`;
  }
  $('prevMonth').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
  $('nextMonth').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
  $('logPastSession').addEventListener('click', () => { $('sessionDate').value = selectedDate || localDateValue(); $('sessionTitle').value = ''; $('sessionDuration').value = 45; openDialog('sessionDialog'); });
  $('sessionForm').addEventListener('submit', event => {
    event.preventDefault();
    const date = $('sessionDate').value; const title = $('sessionTitle').value.trim(); const minutes = Number($('sessionDuration').value);
    if (!date || !title || !Number.isFinite(minutes) || minutes < 1) return;
    sessions.push({ id: `logged-${Date.now()}`, title, subject: $('sessionSubject').value, minutes, date, type: 'logged' });
    selectedDate = date; calendarMonth = new Date(`${date}T12:00:00`); save(); renderAll(); closeDialog('sessionDialog'); showToast('Study session saved to your history');
  });
  $('editGoal').addEventListener('click', () => { $('goalMinutes').value = dailyGoal; openDialog('goalDialog'); });
  $('goalForm').addEventListener('submit', event => {
    event.preventDefault(); const value = Number($('goalMinutes').value);
    if (!Number.isInteger(value) || value < 15 || value > 1440) { showToast('Choose a goal between 15 and 1,440 minutes'); return; }
    dailyGoal = value; localStorage.setItem('studyspace-daily-goal', String(dailyGoal)); renderHistory(); closeDialog('goalDialog'); showToast('Daily study goal updated');
  });
  $('exportData').addEventListener('click', () => {
    const backup = { app: 'ChronoStudy', version: 1, exportedAt: new Date().toISOString(), subjects, tasks, sessions, dailyGoal };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `chronostudy-backup-${localDateValue()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('Backup downloaded');
  });
  $('importData').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || backup.app !== 'ChronoStudy' || backup.version !== 1 || !Array.isArray(backup.subjects) || !Array.isArray(backup.tasks) || !Array.isArray(backup.sessions)) throw new Error('invalid');
      if (!confirm('Import this backup and replace the subjects, tasks, and study history currently saved in ChronoStudy?')) return;
      subjects = backup.subjects.filter(s => s && typeof s.name === 'string').map(s => ({ name: s.name.slice(0, 40), color: /^#[\da-f]{6}$/i.test(s.color) ? s.color : '#7667e8' }));
      tasks = backup.tasks.filter(t => t && typeof t.title === 'string').map(t => ({ ...t, id: String(t.id ?? Date.now() + Math.random()), title: t.title.slice(0, 100), done: Boolean(t.done), reminder: Boolean(t.reminder) }));
      sessions = backup.sessions.filter(s => s && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && typeof s.title === 'string').map(s => ({ ...s, id: String(s.id ?? Date.now() + Math.random()), minutes: Math.max(0, Number(s.minutes) || 0), title: s.title.slice(0, 100) }));
      if (Number.isInteger(backup.dailyGoal) && backup.dailyGoal >= 15 && backup.dailyGoal <= 1440) dailyGoal = backup.dailyGoal;
      localStorage.setItem('studyspace-daily-goal', String(dailyGoal)); save(); selectedDate = null; renderAll(); showToast('Backup restored successfully');
    } catch { showToast('That file is not a valid ChronoStudy backup'); }
    finally { event.target.value = ''; }
  });
  const notified = new Set();
  function checkReminders() {
    const now = Date.now();
    tasks.filter(t => t.reminder && !t.done && t.startDate && t.startTime).forEach(t => {
      const key = `${t.id}:${t.startDate}:${t.startTime}`; const time = dateTime(t)?.getTime();
      if (time && Math.abs(time - now) <= 30000 && !notified.has(key)) { notified.add(key); showToast(`Study time: ${t.title}`); const audio = $('reminderSound'); audio.currentTime = 0; audio.play().catch(() => {}); }
    });
  }
  setToday(); setInterval(setToday, 1000); $('startDate').value = localDateValue(); $('goalMinutes').value = dailyGoal; updateTimer(); renderAll(); reminderInterval = setInterval(checkReminders, 15000); document.addEventListener('visibilitychange', () => { if (!document.hidden) { setToday(); checkReminders(); } });
})();
