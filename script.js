const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const DB_KEY = "lifeOSData_v1";
const SESSION_KEY = "lifeOSSession_v1";

const quotes = [
  "You don't have to see the whole staircase, just take the first step.",
  "Small steps every day add up to big change.",
  "You are allowed to be a work in progress and still be proud of yourself.",
  "Focus on the next step, not the whole staircase.",
  "Discipline is choosing what you want most over what you want now.",
  "Start where you are. Use what you have. Do what you can.",
  "Your future is built by what you do today."
];
const tracks = [
  { title: "Midnight Focus", artist: "Ambient study mix", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { title: "Open Skies", artist: "Instrumental flow", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "Slow Orbit", artist: "Deep work soundtrack", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" }
];

let users = readDB();
let currentUser = null;
let data = null;
let authMode = "login";
let taskFilter = "all";
let quoteIndex = Math.floor(Math.random() * quotes.length);
let trackIndex = 0;
let toastTimer;
let timerDuration = 25 * 60;
let timerRemaining = timerDuration;
let timerInterval = null;
let timerRunning = false;
let timerModeMinutes = 25;
let sessionStartedAt = null;

function readDB() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DB_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(users)); }
  catch { showToast("Browser storage is unavailable."); }
}
function todayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function defaultData(name, email) {
  return {
    name, email, tasks: [], focusByDay: {}, completedByDay: {}, sessionsByDay: {},
    createdAt: new Date().toISOString()
  };
}
function safeText(value) { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#authTitle").innerHTML = signup ? 'Create your space<span class="accent">.</span>' : 'Welcome back<span class="accent">.</span>';
  $("#authSubtitle").textContent = signup ? "A fresh start, designed around you." : "Your day, your goals, your rhythm.";
  $("#authName").classList.toggle("hidden", !signup);
  $("#nameLabel").classList.toggle("hidden", !signup);
  $("#authName").required = signup;
  $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
  $("#authSubmit").innerHTML = signup ? 'Create my account <span>↗</span>' : 'Enter your space <span>↗</span>';
  $("#switchText").textContent = signup ? "Already have an account?" : "New around here?";
  $("#switchAuth").textContent = signup ? "Sign in" : "Create account";
  $("#authError").textContent = "";
}
$("#switchAuth").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));

$("#authForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#authName").value.trim();
  const email = $("#authEmail").value.trim().toLowerCase();
  const password = $("#authPassword").value;
  const error = $("#authError");
  error.textContent = "";
  if (!email || password.length < 4) { error.textContent = "Email aur kam se kam 4-character password daalo."; return; }

  if (authMode === "signup") {
    if (name.length < 2) { error.textContent = "Apna naam kam se kam 2 letters mein likho."; return; }
    if (users[email]) { error.textContent = "Is email se account pehle se hai. Sign in karo."; return; }
    // Demo-only local account: do not reuse a real password here.
    users[email] = { password, data: defaultData(name, email) };
    saveDB();
    signIn(email);
    showToast("Welcome to your new space!");
  } else {
    const user = users[email];
    if (!user || user.password !== password) { error.textContent = "Email ya password match nahi hua."; return; }
    signIn(email);
    showToast("Welcome back!");
  }
});
function signIn(email) {
  currentUser = email;
  data = users[email].data || defaultData(email.split("@")[0], email);
  users[email].data = data;
  try { sessionStorage.setItem(SESSION_KEY, email); } catch {}
  $("#authScreen").classList.add("hidden");
  $("#appScreen").classList.remove("hidden");
  updateProfile();
  updateDate();
  renderAll();
  showPage("overview");
}
function signOut() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  currentUser = null; data = null;
  $("#appScreen").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
  $("#authPassword").value = "";
  setAuthMode("login");
}
$("#logoutBtn").addEventListener("click", signOut);
function updateProfile() {
  const name = data.name || "Your name";
  $("#sideName").textContent = name;
  $("#sideEmail").textContent = data.email;
  $("#avatar").textContent = name.trim().charAt(0).toUpperCase() || "L";
}
function updateDate() {
  const now = new Date();
  $("#todayDate").textContent = now.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
}
function persist() {
  if (!currentUser || !users[currentUser]) return;
  users[currentUser].data = data;
  saveDB();
}
function showPage(page) {
  const pageNames = { overview:"Overview", tasks:"My tasks", insights:"Insights", focus:"Focus room" };
  Object.keys(pageNames).forEach(key => $(`#${key}Page`).classList.toggle("hidden", key !== page));
  $$(".nav-item[data-target]").forEach(button => button.classList.toggle("active", button.dataset.target === page));
  $("#pageCrumb").textContent = pageNames[page] || "Overview";
  if (page === "insights") renderInsights();
  if (page === "focus") updateFocusStats();
  window.scrollTo({ top:0, behavior:"smooth" });
}
$$(".nav-item[data-target]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.target)));
$$("[data-goto]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.goto)));

function addTask(value) {
  const title = value.trim();
  if (!title) return;
  data.tasks.unshift({ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, title, done:false, createdAt:todayKey(), completedAt:null });
  persist(); renderAll(); showToast("Task added. One step closer.");
}
$("#quickTaskForm").addEventListener("submit", event => { event.preventDefault(); addTask($("#quickTaskInput").value); $("#quickTaskInput").value = ""; });
$("#fullTaskForm").addEventListener("submit", event => { event.preventDefault(); addTask($("#fullTaskInput").value); $("#fullTaskInput").value = ""; });

function toggleTask(id) {
  const task = data.tasks.find(item => item.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? todayKey() : null;
  persist(); renderAll();
  showToast(task.done ? "Task completed. Nice work!" : "Task moved back to in progress.");
}
function deleteTask(id) {
  data.tasks = data.tasks.filter(task => task.id !== id);
  persist(); renderAll(); showToast("Task removed.");
}
function taskMarkup(task) {
  const completed = task.done ? " completed" : "";
  const dateText = task.done ? "Done" : (task.createdAt === todayKey() ? "Today" : new Date(task.createdAt + "T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}));
  return `<div class="task-row${completed}"><button class="task-check${task.done ? " done" : ""}" data-toggle-task="${safeText(task.id)}" aria-label="${task.done ? "Mark incomplete" : "Complete task"}">${task.done ? "✓" : ""}</button><span class="task-name">${safeText(task.title)}</span><span class="task-date">${dateText}</span><button class="delete-task" data-delete-task="${safeText(task.id)}" aria-label="Delete task">×</button></div>`;
}
function wireTaskButtons(root) {
  root.querySelectorAll("[data-toggle-task]").forEach(btn => btn.addEventListener("click", () => toggleTask(btn.dataset.toggleTask)));
  root.querySelectorAll("[data-delete-task]").forEach(btn => btn.addEventListener("click", () => deleteTask(btn.dataset.deleteTask)));
}
function renderTasks() {
  const today = todayKey();
  const todayTasks = data.tasks.filter(task => task.createdAt === today || task.completedAt === today);
  const quickList = $("#quickTaskList");
  const quickItems = todayTasks.slice(0, 5);
  quickList.innerHTML = quickItems.map(taskMarkup).join("");
  $("#emptyQuickTasks").classList.toggle("hidden", quickItems.length > 0);
  wireTaskButtons(quickList);

  let filtered = data.tasks;
  if (taskFilter === "active") filtered = filtered.filter(task => !task.done);
  if (taskFilter === "done") filtered = filtered.filter(task => task.done);
  const fullList = $("#fullTaskList");
  fullList.innerHTML = filtered.map(taskMarkup).join("");
  $("#emptyFullTasks").classList.toggle("hidden", filtered.length > 0);
  wireTaskButtons(fullList);
  const doneToday = data.tasks.filter(task => task.done && task.completedAt === today).length;
  $("#completedStat").textContent = doneToday;
  $("#taskStatCaption").textContent = `${data.tasks.filter(task => task.createdAt === today).length} tasks planned today`;
  const totalToday = data.tasks.filter(task => task.createdAt === today).length;
  $("#taskProgressBar").style.width = `${totalToday ? Math.min(100, doneToday / totalToday * 100) : 0}%`;
  $("#navTaskCount").textContent = data.tasks.filter(task => !task.done).length;
  $("#allTaskCount").innerHTML = `${data.tasks.length} <small>TOTAL</small>`;
  $("#allTimeDone").textContent = data.tasks.filter(task => task.done).length;
  $("#allTimeTasks").textContent = data.tasks.length;
}
$$(".filter-btn").forEach(button => button.addEventListener("click", () => {
  taskFilter = button.dataset.filter;
  $$(".filter-btn").forEach(btn => btn.classList.toggle("active", btn === button));
  if (data) renderTasks();
}));

function dateRange(days = 7) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(12,0,0,0);
    date.setDate(date.getDate() - i);
    dates.push({ key:todayKey(date), label:date.toLocaleDateString(undefined,{weekday:"short"}), isToday:i === 0 });
  }
  return dates;
}
function countsByDay() {
  const counts = {};
  data.tasks.forEach(task => {
    if (task.done && task.completedAt) counts[task.completedAt] = (counts[task.completedAt] || 0) + 1;
  });
  return counts;
}
function renderChart(element, large = false) {
  const counts = countsByDay();
  const dates = dateRange();
  const max = Math.max(1, ...dates.map(day => counts[day.key] || 0));
  element.innerHTML = dates.map(day => {
    const value = counts[day.key] || 0;
    const height = value ? Math.max(8, value / max * 100) : 3;
    return `<div class="chart-column${day.isToday ? " today" : ""}"><span class="bar-value">${value}</span><div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div><span class="bar-label">${day.label}</span></div>`;
  }).join("");
  return dates.reduce((sum, day) => sum + (counts[day.key] || 0), 0);
}
function calculateStreak() {
  const counts = countsByDay();
  let streak = 0;
  const date = new Date(); date.setHours(12,0,0,0);
  // A streak may continue from yesterday if today hasn't been completed yet.
  if (!counts[todayKey(date)]) date.setDate(date.getDate() - 1);
  while (counts[todayKey(date)] > 0) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
function totalFocus() { return Object.values(data.focusByDay || {}).reduce((sum, n) => sum + (Number(n) || 0), 0); }
function renderStats() {
  const today = todayKey();
  const focusToday = Number(data.focusByDay[today] || 0);
  $("#focusMinutesStat").textContent = focusToday;
  $("#focusProgressBar").style.width = `${Math.min(100, focusToday / 120 * 100)}%`;
  const streak = calculateStreak();
  $("#streakStat").textContent = streak;
  $("#streakProgressBar").style.width = `${Math.min(100, streak / 7 * 100)}%`;
  $("#focusTodayDetail").textContent = focusToday;
  $("#allTimeFocus").textContent = `${totalFocus()}m`;
  $("#sessionsToday").textContent = Number(data.sessionsByDay[today] || 0);
}
function renderInsights() {
  const total = renderChart($("#insightsChart"), true);
  $("#weeklyTotal").textContent = total;
  const focus = totalFocus();
  $("#allTimeFocus").textContent = `${focus}m`;
}
function renderAll() {
  renderTasks();
  renderChart($("#activityChart"));
  renderStats();
  renderInsights();
  $("#dailyQuote").textContent = quotes[quoteIndex];
}
$("#newQuoteBtn").addEventListener("click", () => {
  quoteIndex = (quoteIndex + 1) % quotes.length;
  $("#dailyQuote").textContent = quotes[quoteIndex];
});

function updateFocusStats() {
  if (!data) return;
  $("#focusTodayDetail").textContent = Number(data.focusByDay[todayKey()] || 0);
  $("#sessionsToday").textContent = Number(data.sessionsByDay[todayKey()] || 0);
}
function setTimerPreset(minutes) {
  if (timerRunning) pauseTimer();
  timerModeMinutes = minutes;
  timerDuration = minutes * 60;
  timerRemaining = timerDuration;
  $("#timerMode").textContent = minutes === 5 ? "SHORT BREAK" : "FOCUS TIME";
  $("#timerSubtext").textContent = minutes === 5 ? "Rest is part of the work." : "One tab. One task.";
  $$(".preset-btn").forEach(button => button.classList.toggle("active", Number(button.dataset.minutes) === minutes));
  updateTimerDisplay();
}
function updateTimerDisplay() {
  const mins = Math.floor(timerRemaining / 60);
  const secs = timerRemaining % 60;
  $("#timerDisplay").textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const progress = $("#timerProgress");
  const circumference = 2 * Math.PI * 106;
  progress.style.strokeDasharray = circumference;
  progress.style.strokeDashoffset = circumference * (1 - timerRemaining / timerDuration);
}
function pauseTimer() {
  clearInterval(timerInterval); timerInterval = null; timerRunning = false;
  $("#timerStart").innerHTML = 'Resume focus <span>▶</span>';
}
function startTimer() {
  if (timerRunning) { pauseTimer(); return; }
  if (timerRemaining <= 0) setTimerPreset(timerModeMinutes);
  timerRunning = true;
  sessionStartedAt = Date.now();
  $("#timerStart").innerHTML = 'Pause session <span>Ⅱ</span>';
  timerInterval = setInterval(() => {
    timerRemaining--;
    updateTimerDisplay();
    if (timerRemaining <= 0) completeTimer();
  }, 1000);
}
function completeTimer() {
  pauseTimer();
  if (timerModeMinutes !== 5) {
    const minutes = timerModeMinutes;
    const today = todayKey();
    data.focusByDay[today] = Number(data.focusByDay[today] || 0) + minutes;
    data.sessionsByDay[today] = Number(data.sessionsByDay[today] || 0) + 1;
    persist(); renderStats(); updateFocusStats();
    showToast(`Focus session complete! +${minutes} minutes.`);
  } else showToast("Break complete. Ready for another round?");
  timerRemaining = 0; updateTimerDisplay();
  $("#timerStart").innerHTML = 'Start again <span>▶</span>';
}
$$(".preset-btn").forEach(button => button.addEventListener("click", () => setTimerPreset(Number(button.dataset.minutes))));
$("#timerStart").addEventListener("click", startTimer);
$("#timerReset").addEventListener("click", () => { pauseTimer(); timerRemaining = timerDuration; updateTimerDisplay(); $("#timerStart").innerHTML = 'Start focus <span>▶</span>'; });
updateTimerDisplay();

function loadTrack(index) {
  trackIndex = (index + tracks.length) % tracks.length;
  const track = tracks[trackIndex];
  $("#trackTitle").textContent = track.title;
  $("#trackArtist").textContent = track.artist;
  $("#audioPlayer").src = track.url;
  $("#trackProgress").style.width = "0%";
  $("#musicStatus").textContent = "Ready to play";
  $("#playMusic").textContent = "▶";
  $$(".music-eq").forEach(el => el.classList.remove("playing"));
}
$("#playMusic").addEventListener("click", async () => {
  const audio = $("#audioPlayer");
  if (!audio.src) loadTrack(trackIndex);
  if (audio.paused) {
    try {
      await audio.play();
      $("#playMusic").textContent = "Ⅱ";
      $("#musicStatus").textContent = "Now playing";
      $$(".music-eq").forEach(el => el.classList.add("playing"));
    } catch {
      $("#musicStatus").textContent = "Playback unavailable";
      showToast("Music ke liye internet connection check karo.");
    }
  } else {
    audio.pause();
    $("#playMusic").textContent = "▶";
    $("#musicStatus").textContent = "Paused";
    $$(".music-eq").forEach(el => el.classList.remove("playing"));
  }
});
$("#prevTrack").addEventListener("click", () => { const wasPlaying = !$("#audioPlayer").paused; loadTrack(trackIndex - 1); if (wasPlaying) $("#playMusic").click(); });
$("#nextTrack").addEventListener("click", () => { const wasPlaying = !$("#audioPlayer").paused; loadTrack(trackIndex + 1); if (wasPlaying) $("#playMusic").click(); });
$("#audioPlayer").addEventListener("timeupdate", () => {
  const audio = $("#audioPlayer");
  if (audio.duration) $("#trackProgress").style.width = `${audio.currentTime / audio.duration * 100}%`;
});
$("#audioPlayer").addEventListener("ended", () => loadTrack(trackIndex + 1));
$("#audioPlayer").addEventListener("error", () => {
  $("#musicStatus").textContent = "Audio could not load";
  $("#playMusic").textContent = "▶";
  $$(".music-eq").forEach(el => el.classList.remove("playing"));
});
loadTrack(0);

$("#themeHint").addEventListener("click", () => showToast("You're already in your dark + neon space ✧"));

try {
  const savedEmail = sessionStorage.getItem(SESSION_KEY);
  if (savedEmail && users[savedEmail]) signIn(savedEmail);
} catch {}
