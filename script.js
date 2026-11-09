const STORAGE_KEY = 'worktracker';
const DRAG_THRESHOLD = 4;
const SCROLL_EDGE = 56;
const SCROLL_SPEED = 10;

const chipsEl = document.getElementById('chips');
const addCategoryBtn = document.getElementById('add-category');
const categoryInput = document.getElementById('category-input');
const tasksEl = document.getElementById('tasks');
const emptyEl = document.getElementById('empty');
const doneSection = document.getElementById('done-section');
const doneTasksEl = document.getElementById('done-tasks');
const doneHeading = document.getElementById('done-heading');
const statusEl = document.getElementById('status');

const state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.categories) && Array.isArray(saved.tasks)) {
      return saved;
    }
  } catch {
    // Unreadable or blocked storage: start with an empty tracker.
  }
  return { categories: [], tasks: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is unavailable: the tracker still works until the page closes.
  }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function announce(message) {
  statusEl.textContent = message;
}

function findRow(id) {
  return document.querySelector(`.task[data-id="${id}"]`);
}

/* Categories */

function renderCategories() {
  chipsEl.replaceChildren(...state.categories.map(makeChip));
}

function makeChip(name) {
  const chip = document.createElement('span');
  chip.className = 'chip';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'chip-name';
  addBtn.textContent = name;
  addBtn.title = `Add a ${name} task`;
  addBtn.addEventListener('click', () => addTask(name));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'chip-delete';
  deleteBtn.textContent = '×';
  deleteBtn.title = `Delete category ${name}`;
  deleteBtn.setAttribute('aria-label', `Delete category ${name}`);
  deleteBtn.addEventListener('click', () => deleteCategory(name));

  chip.append(addBtn, deleteBtn);
  return chip;
}

function openCategoryInput() {
  addCategoryBtn.hidden = true;
  categoryInput.hidden = false;
  categoryInput.focus();
}

function closeCategoryInput() {
  categoryInput.value = '';
  categoryInput.hidden = true;
  addCategoryBtn.hidden = false;
}

function commitCategory() {
  const name = categoryInput.value.trim();
  closeCategoryInput();
  if (!name) return;

  const isDuplicate = state.categories.some(
    (existing) => existing.toLowerCase() === name.toLowerCase()
  );
  if (isDuplicate) return;

  state.categories.push(name);
  save();
  render();
}

// Tasks keep their category label, so deleting a category leaves its tasks in place.
function deleteCategory(name) {
  state.categories = state.categories.filter((category) => category !== name);
  save();
  render();
}

addCategoryBtn.addEventListener('click', openCategoryInput);

categoryInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    // Without this, the same keypress activates the button that receives focus below.
    event.preventDefault();
    commitCategory();
    addCategoryBtn.focus();
  } else if (event.key === 'Escape') {
    closeCategoryInput();
    addCategoryBtn.focus();
  }
});

categoryInput.addEventListener('blur', () => {
  if (!categoryInput.hidden) commitCategory();
});

/* Tasks */

function addTask(category) {
  const task = {
    id: makeId(),
    category,
    description: '',
    created: new Date().toISOString(),
    done: false,
  };
  state.tasks.push(task);
  save();
  renderTasks();
  findRow(task.id).querySelector('.task-description').focus();
}

function removeTask(id) {
  // Keep keyboard users in place: focus moves to the neighbouring row's Remove button.
  const row = findRow(id);
  const neighbor = row.nextElementSibling || row.previousElementSibling;
  const neighborId = neighbor && neighbor.dataset.id;

  state.tasks = state.tasks.filter((task) => task.id !== id);
  save();
  renderTasks();

  if (neighborId) {
    findRow(neighborId).querySelector('.task-remove').focus();
  } else {
    addCategoryBtn.focus();
  }
}

// Re-adding at the end puts a reopened task last in the order and a finished one last in Done.
function setDone(task, done) {
  state.tasks = state.tasks.filter((other) => other !== task);
  task.done = done;
  state.tasks.push(task);
  save();
  renderTasks();
  findRow(task.id).querySelector('.task-check input').focus();
  announce(done ? 'Moved to Done.' : 'Moved back to the to-do list.');
}

function makeTask(task) {
  const item = document.createElement('li');
  item.className = 'task';
  item.dataset.id = task.id;

  if (!task.done) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'task-handle';
    handle.title = 'Drag to reorder';
    handle.addEventListener('keydown', onHandleKeydown);
    item.append(handle);
  }

  const checkLabel = document.createElement('label');
  checkLabel.className = 'task-check';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = Boolean(task.done);
  check.setAttribute('aria-label', `Mark ${task.category} task done`);
  check.addEventListener('change', () => setDone(task, check.checked));
  checkLabel.append(check);

  const body = document.createElement('div');
  body.className = 'task-body';

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (!task.done) {
    const rank = document.createElement('span');
    rank.className = 'task-rank';
    meta.append(rank);
  }

  const category = document.createElement('span');
  category.className = 'task-category';
  category.textContent = task.category;

  const date = document.createElement('time');
  date.className = 'task-date';
  date.dateTime = task.created;
  date.textContent = formatDate(task.created);
  date.title = 'Date created';

  meta.append(category, date);

  const description = document.createElement('textarea');
  description.className = 'task-description';
  description.rows = 1;
  description.placeholder = 'Add a description';
  description.value = task.description;
  description.setAttribute('aria-label', `Description for ${task.category} task`);
  description.addEventListener('input', () => {
    task.description = description.value;
    autosize(description);
    save();
  });
  description.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      description.blur();
    }
  });

  body.append(meta, description);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'task-remove';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', `Remove ${task.category} task`);
  remove.addEventListener('click', () => removeTask(task.id));

  item.append(checkLabel, body, remove);
  return item;
}

function updateRanks() {
  const rows = [...tasksEl.children];
  rows.forEach((row, index) => {
    row.querySelector('.task-rank').textContent = `#${index + 1}`;
    row.querySelector('.task-handle').setAttribute(
      'aria-label',
      `Reorder task, position ${index + 1} of ${rows.length}. Use the up and down arrow keys.`
    );
  });
}

function renderTasks() {
  const active = state.tasks.filter((task) => !task.done);
  const done = state.tasks.filter((task) => task.done);

  tasksEl.replaceChildren(...active.map(makeTask));
  doneTasksEl.replaceChildren(...done.map(makeTask));
  doneSection.hidden = done.length === 0;
  doneHeading.textContent = `Done (${done.length})`;
  updateRanks();
  autosizeAll();

  emptyEl.hidden = active.length > 0;
  if (!state.categories.length) {
    emptyEl.textContent = 'Add a category to get started.';
  } else if (done.length) {
    emptyEl.textContent = 'All done. Click a category to add another task.';
  } else {
    emptyEl.textContent = 'Nothing to do. Click a category to add a task.';
  }
}

function autosizeAll() {
  document.querySelectorAll('.task-description').forEach(autosize);
}

function render() {
  renderCategories();
  renderTasks();
}

/* Reordering */

// The on-screen order is the source of truth once a move ends.
function commitOrder() {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  const active = [...tasksEl.children].map((row) => byId.get(row.dataset.id));
  const done = state.tasks.filter((task) => task.done);
  state.tasks = [...active, ...done];
  save();
  updateRanks();
}

// Slides rows from their old spot to their new one after `change` moves them in the DOM.
function animateMove(rows, change) {
  const before = rows.map((row) => row.offsetTop);
  change();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  rows.forEach((row, index) => {
    const distance = before[index] - row.offsetTop;
    if (distance) {
      row.animate(
        [{ transform: `translateY(${distance}px)` }, { transform: 'none' }],
        { duration: 150, easing: 'ease-out' }
      );
    }
  });
}

// The dragged row itself is never moved in the DOM, because that would drop its pointer capture.
function moveNextAbove(row) {
  tasksEl.insertBefore(row.nextElementSibling, row);
}

function movePreviousBelow(row) {
  tasksEl.insertBefore(row.previousElementSibling, row.nextElementSibling);
}

function onHandleKeydown(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();

  const row = event.currentTarget.closest('.task');
  const movingUp = event.key === 'ArrowUp';
  if (movingUp ? !row.previousElementSibling : !row.nextElementSibling) return;

  animateMove([...tasksEl.children], () => {
    if (movingUp) movePreviousBelow(row);
    else moveNextAbove(row);
  });
  commitOrder();
  row.scrollIntoView({ block: 'nearest' });
  announce(`Moved to position ${[...tasksEl.children].indexOf(row) + 1} of ${tasksEl.children.length}.`);
}

let drag = null;

function onPointerDown(event) {
  if (drag || event.button !== 0) return;

  const row = event.target.closest('.task');
  if (!row || event.target.closest('textarea, input, .task-remove')) return;
  // On touch screens only the handle drags, so swiping a row still scrolls the page.
  if (event.pointerType !== 'mouse' && !event.target.closest('.task-handle')) return;

  drag = {
    row,
    pointerId: event.pointerId,
    clientY: event.clientY,
    startPageY: event.clientY + window.scrollY,
    startTop: row.offsetTop,
    startOrder: [...tasksEl.children],
    started: false,
    frame: 0,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onDragKeydown);
}

function onPointerMove(event) {
  if (event.pointerId !== drag.pointerId) return;
  drag.clientY = event.clientY;

  if (!drag.started) {
    const moved = Math.abs(event.clientY + window.scrollY - drag.startPageY);
    if (moved >= DRAG_THRESHOLD) startDrag();
  }
}

function startDrag() {
  drag.started = true;
  drag.row.classList.add('dragging');
  drag.row.setPointerCapture(drag.pointerId);
  document.body.classList.add('is-dragging');
  if (document.activeElement) document.activeElement.blur();
  drag.frame = requestAnimationFrame(dragFrame);
}

function dragFrame() {
  if (drag.clientY < SCROLL_EDGE) {
    window.scrollBy(0, -SCROLL_SPEED);
  } else if (drag.clientY > window.innerHeight - SCROLL_EDGE) {
    window.scrollBy(0, SCROLL_SPEED);
  }
  positionDraggedRow();
  drag.frame = requestAnimationFrame(dragFrame);
}

function positionDraggedRow() {
  const { row } = drag;
  const wanted = drag.startTop + drag.clientY + window.scrollY - drag.startPageY;
  // Swaps use the unclamped position: at the list's edge a clamped row's center sits exactly
  // on the end row's midpoint, so it could never pass it to take the first or last spot.
  const center = wanted + row.offsetHeight / 2;
  const siblings = [...tasksEl.children].filter((other) => other !== row);
  const midpoint = (other) => other.offsetTop + other.offsetHeight / 2;

  const passedNext = () => row.nextElementSibling && center > midpoint(row.nextElementSibling);
  const passedPrevious = () => row.previousElementSibling && center < midpoint(row.previousElementSibling);

  if (passedNext() || passedPrevious()) {
    animateMove(siblings, () => {
      while (passedNext()) moveNextAbove(row);
      while (passedPrevious()) movePreviousBelow(row);
    });
    updateRanks();
  }

  // Clamped to the list so a row dragged past the end can't make the page taller.
  const top = Math.max(0, Math.min(wanted, tasksEl.offsetHeight - row.offsetHeight));
  row.style.transform = `translateY(${top - row.offsetTop}px)`;
}

function endDrag() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  window.removeEventListener('keydown', onDragKeydown);

  const finished = drag;
  drag = null;
  if (!finished.started) return null;

  cancelAnimationFrame(finished.frame);
  finished.row.classList.remove('dragging');
  finished.row.style.transform = '';
  document.body.classList.remove('is-dragging');
  return finished;
}

function onPointerUp(event) {
  if (event.pointerId !== drag.pointerId) return;
  const droppedAt = drag.row.style.transform;
  const finished = endDrag();
  if (!finished) return;

  if (droppedAt && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finished.row.animate(
      [{ transform: droppedAt }, { transform: 'none' }],
      { duration: 150, easing: 'ease-out' }
    );
  }
  commitOrder();
  const position = [...tasksEl.children].indexOf(finished.row) + 1;
  announce(`Moved to position ${position} of ${tasksEl.children.length}.`);
}

function cancelDrag() {
  const finished = endDrag();
  if (!finished) return;

  tasksEl.replaceChildren(...finished.startOrder);
  updateRanks();
  announce('Move cancelled.');
}

function onPointerCancel(event) {
  if (event.pointerId === drag.pointerId) cancelDrag();
}

function onDragKeydown(event) {
  if (event.key === 'Escape' && drag.started) cancelDrag();
}

tasksEl.addEventListener('pointerdown', onPointerDown);

window.addEventListener('resize', autosizeAll);

/* Page tabs */

// Both pages stay loaded, so a running timer keeps going while the Work Tracker is showing.
function showPageFromHash() {
  const page = window.location.hash === '#time' ? 'time' : 'work';

  document.getElementById('page-work').hidden = page !== 'work';
  document.getElementById('page-time').hidden = page !== 'time';
  document.title = page === 'time' ? 'Time Tracker' : 'Work Tracker';
  document.querySelectorAll('.page-tabs a').forEach((tab) => {
    if (tab.dataset.page === page) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });

  // Descriptions can't be measured while their page is hidden.
  if (page === 'work') autosizeAll();
}

window.addEventListener('hashchange', showPageFromHash);

render();
showPageFromHash();
