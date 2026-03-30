const STORAGE_KEY = "luis-task-board-v1";
const DEFAULT_CONFIG = {
  dataSource: {
    type: "local-api",
    apiEndpoint: "/api/tasks",
  },
};

const DEFAULT_TASKS = [];
const CATEGORIES = ["Money", "COO", "Study", "IP", "Value Investing", "个人杂事"];
const QUADRANTS = [
  { priority: "★★★★", title: "★★★★ 第一象限", subtitle: "紧急且重要" },
  { priority: "★★★", title: "★★★ 第二象限", subtitle: "重要不紧急" },
  { priority: "★★", title: "★★ 第三象限", subtitle: "紧急不重要" },
  { priority: "★", title: "★ 第四象限", subtitle: "不紧急不重要" },
];

let tasks = [];
let currentView = "board";
const runtimeConfig = resolveConfig();
const filters = { role: "" };

const board = document.getElementById("board");
const quadrantBoard = document.getElementById("quadrantBoard");
const boardView = document.getElementById("boardView");
const quadrantView = document.getElementById("quadrantView");
const completedSection = document.getElementById("completedSection");
const completedCount = document.getElementById("completedCount");
const completedList = document.getElementById("completedList");
const roleFilter = document.getElementById("roleFilter");
const coreWorkList = document.getElementById("coreWorkList");
const syncStatus = document.getElementById("syncStatus");
const columnTemplate = document.getElementById("columnTemplate");
const taskTemplate = document.getElementById("taskTemplate");
const quadrantTemplate = document.getElementById("quadrantTemplate");
const viewTabs = [...document.querySelectorAll(".view-tab")];

roleFilter.addEventListener("change", () => {
  filters.role = roleFilter.value;
  render();
});

viewTabs.forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    viewTabs.forEach((tab) => tab.classList.toggle("is-active", tab === button));
    boardView.hidden = currentView !== "board";
    quadrantView.hidden = currentView !== "quadrant";
    render();
  });
});

function resolveConfig() {
  const incoming = window.TASK_BOARD_CONFIG || {};
  return {
    ...DEFAULT_CONFIG,
    ...incoming,
    dataSource: {
      ...DEFAULT_CONFIG.dataSource,
      ...(incoming.dataSource || {}),
    },
  };
}

function getDataSource() {
  return runtimeConfig.dataSource || DEFAULT_CONFIG.dataSource;
}

function loadTasksFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_TASKS);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : structuredClone(DEFAULT_TASKS);
  } catch {
    return structuredClone(DEFAULT_TASKS);
  }
}

function persistTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  void saveTasksToServer();
}

async function loadTasksFromServer() {
  const source = getDataSource();
  try {
    const data = source.type === "supabase"
      ? await loadTasksFromSupabase(source)
      : await loadTasksFromLocalApi(source);
    if (!Array.isArray(data)) throw new Error("invalid tasks payload");
    syncStatus.textContent = source.type === "supabase" ? "云端同步已连接" : "本地同步已连接";
    return data;
  } catch {
    syncStatus.textContent = "离线模式（本地缓存）";
    return loadTasksFromLocalStorage();
  }
}

async function saveTasksToServer() {
  const source = getDataSource();
  try {
    if (source.type === "supabase") {
      await saveTasksToSupabase(source, tasks);
      syncStatus.textContent = "云端同步已连接";
      return;
    }
    await saveTasksToLocalApi(source, tasks);
    syncStatus.textContent = "本地同步已连接";
  } catch {
    syncStatus.textContent = "本地已保存，云端未同步";
  }
}

async function loadTasksFromLocalApi(source) {
  const response = await fetch(source.apiEndpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function saveTasksToLocalApi(source, payload) {
  const response = await fetch(source.apiEndpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function assertSupabaseConfig(source) {
  if (!source.supabaseUrl || !source.supabaseAnonKey) {
    throw new Error("missing supabase config");
  }
}

function buildSupabaseHeaders(source, extra = {}) {
  return {
    apikey: source.supabaseAnonKey,
    Authorization: `Bearer ${source.supabaseAnonKey}`,
    ...extra,
  };
}

async function loadTasksFromSupabase(source) {
  assertSupabaseConfig(source);
  const table = source.table || "task_boards";
  const boardId = encodeURIComponent(source.boardId || "laolu-main");
  const url = `${source.supabaseUrl}/rest/v1/${table}?board_id=eq.${boardId}&select=tasks,updated_at`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: buildSupabaseHeaders(source),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return structuredClone(DEFAULT_TASKS);
  }
  return Array.isArray(rows[0].tasks) ? rows[0].tasks : structuredClone(DEFAULT_TASKS);
}

async function saveTasksToSupabase(source, payload) {
  assertSupabaseConfig(source);
  const table = source.table || "task_boards";
  const url = `${source.supabaseUrl}/rest/v1/${table}`;
  const body = {
    board_id: source.boardId || "laolu-main",
    tasks: payload,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(url, {
    method: "POST",
    headers: buildSupabaseHeaders(source, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function priorityOf(task) {
  const match = (task.title || "").match(/^★+/);
  return match ? match[0] : "";
}

function plainTitle(task) {
  return (task.title || "").replace(/^★+\s*/, "").trim();
}

function quadrantLabel(priority) {
  return QUADRANTS.find((item) => item.priority === priority)?.subtitle || "";
}

function matchesRole(task) {
  const delegate = (task.delegate || "").trim();
  if (!filters.role) return true;
  if (!delegate) return false;
  if (filters.role === "assistant") {
    return !/ai|codex|notebooklm|supabase|openclaw/i.test(delegate);
  }
  if (filters.role === "ai") {
    return /ai|codex|notebooklm|supabase|openclaw/i.test(delegate);
  }
  return true;
}

function filteredPendingTasks() {
  return tasks.filter((task) => !task.completed && matchesRole(task));
}

function updateTask(id, patch) {
  tasks = tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
  persistTasks();
}

function addTask(task) {
  tasks = [task, ...tasks];
  persistTasks();
  render();
}

function buildInlineForm(form, category) {
  const titleInput = form.querySelector(".inline-title");
  const goalInput = form.querySelector(".inline-goal");
  const delegateInput = form.querySelector(".inline-delegate");
  const prioritySelect = form.querySelector(".inline-priority");
  const cancelBtn = form.querySelector(".inline-cancel-btn");
  const isPersonal = category === "个人杂事";

  titleInput.placeholder = isPersonal ? "新增一项杂事，例如：买药" : "新增一项工作，例如：投资人风险报告";
  goalInput.hidden = isPersonal;
  delegateInput.hidden = isPersonal;
  prioritySelect.hidden = isPersonal;
  goalInput.required = !isPersonal;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rawTitle = titleInput.value.trim();
    if (!rawTitle) return;
    addTask({
      id: crypto.randomUUID(),
      category,
      title: isPersonal ? rawTitle : `${prioritySelect.value} ${rawTitle}`,
      goal: isPersonal ? "" : goalInput.value.trim(),
      delegate: isPersonal ? "" : delegateInput.value.trim(),
      owner: "",
      completed: false,
    });
    form.reset();
    form.hidden = true;
  });

  cancelBtn.addEventListener("click", () => {
    form.reset();
    form.hidden = true;
  });
}

function buildTaskCard(task) {
  const fragment = taskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const checkbox = fragment.querySelector(".task-check");
  const titleInput = fragment.querySelector(".task-title");
  const prioritySelect = fragment.querySelector(".task-priority-select");
  const quadrantBadge = fragment.querySelector(".task-quadrant-badge");
  const goalInput = fragment.querySelector(".task-goal");
  const delegateInput = fragment.querySelector(".task-delegate");
  const deleteBtn = fragment.querySelector(".delete-btn");
  const taskGrid = fragment.querySelector(".task-grid");
  const meta = fragment.querySelector(".task-meta");

  const isPersonal = task.category === "个人杂事";
  const priority = priorityOf(task) || "★★★";

  card.id = `task-${task.id}`;
  card.dataset.priority = priority;
  checkbox.checked = task.completed;
  titleInput.value = plainTitle(task);

  if (task.completed) card.classList.add("is-completed");

  if (isPersonal) {
    card.classList.add("task-card-personal");
    taskGrid.style.display = "none";
    meta.style.display = "none";
  } else {
    prioritySelect.value = priority;
    quadrantBadge.textContent = quadrantLabel(priority);
    goalInput.value = task.goal || "";
    delegateInput.value = task.delegate || "";
    autoSizeTextarea(goalInput);
    autoSizeTextarea(delegateInput);
  }

  checkbox.addEventListener("change", () => {
    updateTask(task.id, { completed: checkbox.checked });
    render();
  });

  titleInput.addEventListener("input", () => {
    const nextTitle = titleInput.value.trim();
    updateTask(task.id, {
      title: isPersonal ? nextTitle : `${prioritySelect.value} ${nextTitle}`.trim(),
    });
  });

  if (!isPersonal) {
    prioritySelect.addEventListener("change", () => {
      quadrantBadge.textContent = quadrantLabel(prioritySelect.value);
      updateTask(task.id, {
        title: `${prioritySelect.value} ${titleInput.value.trim()}`.trim(),
      });
      render();
    });

    goalInput.addEventListener("input", () => {
      updateTask(task.id, { goal: goalInput.value });
      autoSizeTextarea(goalInput);
    });

    delegateInput.addEventListener("input", () => {
      updateTask(task.id, { delegate: delegateInput.value });
      autoSizeTextarea(delegateInput);
    });
  }

  deleteBtn.addEventListener("click", () => {
    tasks = tasks.filter((item) => item.id !== task.id);
    persistTasks();
    render();
  });

  return fragment;
}

function renderCoreWork(pending) {
  const coreItems = pending.filter((task) => priorityOf(task) === "★★★★");
  coreWorkList.innerHTML = "";
  if (!coreItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "当前没有第一象限任务。";
    coreWorkList.appendChild(empty);
    return;
  }
  coreItems.forEach((task) => {
    const article = document.createElement("article");
    article.className = "core-work-item";
    article.innerHTML = `
      <strong>${escapeHtml(plainTitle(task))}</strong>
      <span>${escapeHtml(task.category)}</span>
      <p>${escapeHtml(task.goal || "先补充核心任务")}</p>
    `;
    coreWorkList.appendChild(article);
  });
}

function renderBoard(pending) {
  board.innerHTML = "";
  CATEGORIES.forEach((category) => {
    const fragment = columnTemplate.content.cloneNode(true);
    const titleEl = fragment.querySelector(".column-title");
    const countEl = fragment.querySelector(".column-count");
    const listEl = fragment.querySelector(".task-list");
    const quickAddBtn = fragment.querySelector(".quick-add-btn");
    const form = fragment.querySelector(".inline-task-form");
    const items = pending.filter((task) => task.category === category);

    titleEl.textContent = category;
    countEl.textContent = `${items.length} 条待办`;
    buildInlineForm(form, category);

    quickAddBtn.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) {
        form.querySelector(".inline-title").focus();
      }
    });

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "这一列当前没有待办。";
      listEl.appendChild(empty);
    } else {
      items.forEach((task) => listEl.appendChild(buildTaskCard(task)));
    }

    board.appendChild(fragment);
  });
}

function renderQuadrants(pending) {
  quadrantBoard.innerHTML = "";
  QUADRANTS.forEach((quadrant) => {
    const fragment = quadrantTemplate.content.cloneNode(true);
    const titleEl = fragment.querySelector(".quadrant-title");
    const subtitleEl = fragment.querySelector(".quadrant-subtitle");
    const listEl = fragment.querySelector(".task-list");
    const items = pending.filter((task) => priorityOf(task) === quadrant.priority);

    titleEl.textContent = quadrant.title;
    subtitleEl.textContent = quadrant.subtitle;

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "这一象限当前没有任务。";
      listEl.appendChild(empty);
    } else {
      items.forEach((task) => listEl.appendChild(buildTaskCard(task)));
    }

    quadrantBoard.appendChild(fragment);
  });
}

function renderCompleted() {
  completedList.innerHTML = "";
  const finishedTasks = tasks.filter((task) => task.completed);
  completedCount.textContent = `${finishedTasks.length} 条已完成任务`;
  if (!finishedTasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "还没有已完成任务。";
    completedList.appendChild(empty);
    return;
  }
  finishedTasks.forEach((task) => completedList.appendChild(buildTaskCard(task)));
}

function render() {
  const pending = filteredPendingTasks();
  renderCoreWork(pending);
  renderBoard(pending);
  renderQuadrants(pending);
  renderCompleted();
  boardView.hidden = currentView !== "board";
  quadrantView.hidden = currentView !== "quadrant";
  completedSection.hidden = false;
}

function autoSizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 86)}px`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function init() {
  tasks = await loadTasksFromServer();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  render();
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch {
      // 静默失败
    }
  }
}

init();
