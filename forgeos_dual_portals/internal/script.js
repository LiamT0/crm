// CRM demo script
// The application state lives entirely in memory and is persisted via
// localStorage.  Each section of the interface calls into helper
// functions defined below to render the appropriate UI and update
// counts/charts.  See accompanying index.html and style.css for markup
// and styling.  This file is written as an ES module.

// Data arrays representing contacts, deals and tasks.  On start up
// these arrays are loaded from localStorage (if present); otherwise
// they are seeded with empty arrays.  Activities represent the audit
// trail for the dashboard.
let contacts = [];
let deals = [];
let tasks = [];
let activities = [];

// Keep track of editing indices to differentiate between create and edit
let editingContactIndex = null;
let editingDealIndex = null;
let editingTaskIndex = null;

// Chart instance for the pipeline overview
let pipelineChart = null;

/* =========================
   Auth (Netlify Identity)
   - Employees login via /login.html
   - Requires role: employee
   ========================= */

const REQUIRED_ROLE = 'employee';
const LOGIN_PATH = 'login.html';

function identityReady() {
  return new Promise((resolve) => {
    if (!window.netlifyIdentity) return resolve(null);
    window.netlifyIdentity.on('init', (user) => resolve(user || null));
    window.netlifyIdentity.init();
  });
}

function userHasRole(user, role) {
  const roles = user?.app_metadata?.roles || user?.user_metadata?.roles || [];
  return Array.isArray(roles) ? roles.includes(role) : false;
}

async function requireEmployeeAuth() {
  // Only enforce on Netlify domains / custom domains. (GitHub Pages won't have identity)
  const onNetlify = location.hostname.includes('netlify.app') || location.hostname.endsWith('forgeos.org') || location.hostname.includes('forgeos');
  if (!onNetlify) return null;

  const user = await identityReady();
  if (!user) {
    // If we are already on the login page, stop.
    if (location.pathname.endsWith('/' + LOGIN_PATH) || location.pathname.endsWith(LOGIN_PATH)) return null;
    location.href = LOGIN_PATH;
    return null;
  }

  if (!userHasRole(user, REQUIRED_ROLE)) {
    alert('You are logged in, but do not have access to the Employee CRM.');
    try { window.netlifyIdentity.logout(); } catch {}
    location.href = LOGIN_PATH;
    return null;
  }

  // Wire logout
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn && !logoutBtn.__wired) {
    logoutBtn.__wired = true;
    logoutBtn.addEventListener('click', () => {
      window.netlifyIdentity.logout();
    });
  }

  window.netlifyIdentity.on('logout', () => {
    location.href = LOGIN_PATH;
  });
  return user;
}

/** Utility to load data from localStorage.  Because localStorage only
 * stores strings the arrays are parsed from JSON.  If any key is
 * missing the associated array remains empty. */
function loadData() {
  try {
    contacts = JSON.parse(localStorage.getItem('crm_contacts')) || [];
    deals = JSON.parse(localStorage.getItem('crm_deals')) || [];
    tasks = JSON.parse(localStorage.getItem('crm_tasks')) || [];
    activities = JSON.parse(localStorage.getItem('crm_activities')) || [];
  } catch (e) {
    console.error('Failed to load data', e);
    contacts = [];
    deals = [];
    tasks = [];
    activities = [];
  }
}

/** Utility to save data back to localStorage.  Called after any
 * modification to contacts, deals, tasks or activities. */
function saveData() {
  localStorage.setItem('crm_contacts', JSON.stringify(contacts));
  localStorage.setItem('crm_deals', JSON.stringify(deals));
  localStorage.setItem('crm_tasks', JSON.stringify(tasks));
  localStorage.setItem('crm_activities', JSON.stringify(activities));
}

/** Format a Date object (or parseable string) into a human friendly
 * representation (e.g. Jan 14, 2026). */
function formatDate(date) {
  const d = new Date(date);
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, options);
}

/** Safely escape text for HTML injection into innerHTML templates. */
function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Add an activity log entry to the front of the activities array.
 * Keeps only the most recent 25 entries to avoid unbounded growth.
 */
function addActivity(text) {
  activities.unshift({ text, date: new Date().toISOString() });
  if (activities.length > 25) activities.pop();
  saveData();
  updateRecentActivity();
}

/** Update the recent activity list on the dashboard. */
function updateRecentActivity() {
  const list = document.getElementById('recentActivity');
  list.innerHTML = '';
  activities.slice(0, 5).forEach((act) => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    div.textContent = act.text;
    const date = document.createElement('span');
    date.className = 'activity-date';
    date.textContent = formatDate(act.date);
    li.appendChild(div);
    li.appendChild(date);
    list.appendChild(li);
  });
}

/** Compute the pipeline summary values (total deals, active deals, etc.)
 * and update the dashboard stat cards.  Also updates the pipeline
 * bar chart with aggregated values by stage. */
function updateDashboard() {
  // total contacts and customers
  const totalContacts = contacts.length;
  const customers = contacts.filter((c) => c.status === 'Customer').length;
  document.getElementById('totalContactsValue').textContent = totalContacts;
  document.getElementById('totalCustomersSub').textContent = `${customers} customer${customers === 1 ? '' : 's'}`;

  // deals counts
  const totalDeals = deals.length;
  const activeDealsCount = deals.filter(
    (d) => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost'
  ).length;
  document.getElementById('activeDealsValue').textContent = activeDealsCount;
  document.getElementById('totalDealsSub').textContent = `${totalDeals} total deals`;

  // pipeline value and won value
  let pipelineValue = 0;
  let wonValue = 0;
  deals.forEach((d) => {
    const value = parseFloat(d.value) || 0;
    if (d.stage === 'Closed Won') {
      wonValue += value;
    }
    if (d.stage !== 'Closed Lost') {
      pipelineValue += value;
    }
  });
  document.getElementById('pipelineValueValue').textContent = `$${pipelineValue.toLocaleString()}`;
  document.getElementById('wonValueSub').textContent = `$${wonValue.toLocaleString()} won`;

  // tasks count
  const pendingTasksCount = tasks.filter((t) => t.status !== 'Completed').length;
  const completedTasksCount = tasks.filter((t) => t.status === 'Completed').length;
  document.getElementById('pendingTasksValue').textContent = pendingTasksCount;
  document.getElementById('completedTasksSub').textContent = `${completedTasksCount} completed`;

  // Update chart
  updatePipelineChart();
  // Refresh recent activity
  updateRecentActivity();
}

/** Create or update the pipeline bar chart showing the sum of deal
 * values by stage.  Uses Chart.js.  Called whenever deals change. */
function updatePipelineChart() {
  const stages = ['Discovery', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
  const sums = stages.map((stage) => {
    return deals
      .filter((d) => d.stage === stage)
      .reduce((acc, d) => acc + (parseFloat(d.value) || 0), 0);
  });
  const ctx = document.getElementById('pipelineChart').getContext('2d');
  if (pipelineChart) {
    pipelineChart.data.datasets[0].data = sums;
    pipelineChart.update();
  } else {
    pipelineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: stages,
        datasets: [
          {
            label: 'Value',
            data: sums,
            backgroundColor: [
              '#c7d2fe',
              '#e9d5ff',
              '#fde68a',
              '#bbf7d0',
              '#fecaca',
            ],
            borderColor: [
              '#4338ca',
              '#5b21b6',
              '#92400e',
              '#065f46',
              '#b91c1c',
            ],
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `$${value.toLocaleString()}`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const v = context.parsed.y;
                return `$${v.toLocaleString()}`;
              },
            },
          },
        },
      },
    });
  }
}

/** Render the contact list based on current contacts array and any
 * active search term.  Called whenever contacts change or the search
 * input is updated. */
function renderContacts() {
  const list = document.getElementById('contactList');
  const search = document.getElementById('contactSearch').value.toLowerCase();
  list.innerHTML = '';
  contacts
    .filter((c) => {
      const haystack = `${c.name} ${c.email} ${c.phone} ${c.company} ${c.position}`.toLowerCase();
      return haystack.includes(search);
    })
    .forEach((c, index) => {
      const card = document.createElement('div');
      card.className = 'card contact-card';
      // Avatar and name
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      const avatar = document.createElement('div');
      avatar.className = 'contact-avatar';
      avatar.textContent = c.name
        ? c.name
            .split(' ')
            .map((n) => n.charAt(0))
            .join('')
            .substring(0, 2)
        : '?';
      header.appendChild(avatar);
      const info = document.createElement('div');
      info.className = 'contact-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'name';
      nameEl.textContent = c.name || 'Unnamed';
      const positionEl = document.createElement('span');
      positionEl.className = 'position';
      positionEl.textContent = c.position || '';
      info.appendChild(nameEl);
      info.appendChild(positionEl);
      header.appendChild(info);
      card.appendChild(header);
      // Details (company, email, phone)
      const details = document.createElement('div');
      details.className = 'contact-details';
      details.innerHTML =
        (c.company ? `<div>${c.company}</div>` : '') +
        (c.email ? `<div>${c.email}</div>` : '') +
        (c.phone ? `<div>${c.phone}</div>` : '');
      card.appendChild(details);
      // Tags
      const tags = document.createElement('div');
      tags.className = 'contact-tags';
      const statusTag = document.createElement('span');
      statusTag.className =
        'contact-tag tag-' + c.status.toLowerCase().replace(' ', '-');
      statusTag.textContent = c.status;
      tags.appendChild(statusTag);
      if (c.source && c.source !== 'None') {
        const sourceTag = document.createElement('span');
        sourceTag.className = 'contact-tag tag-source';
        sourceTag.textContent = c.source;
        tags.appendChild(sourceTag);
      }
      card.appendChild(tags);
      // Card actions
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon>';
      editBtn.title = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openContactModal(index);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this contact?')) {
          contacts.splice(index, 1);
          saveData();
          addActivity(`Deleted contact ${c.name}`);
          renderContacts();
          updateDashboard();
        }
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(actions);
      list.appendChild(card);
    });
  document.getElementById('contactsCount').textContent = `${contacts.length} contact${contacts.length === 1 ? '' : 's'} in your CRM`;
}

/** Open the contact modal for creation or editing.  When editing,
 * the index parameter is used to prefill the form with the existing
 * contact data. */
function openContactModal(index) {
  const modal = document.getElementById('contactModal');
  modal.classList.remove('hidden');
  if (index != null) {
    editingContactIndex = index;
    document.getElementById('contactModalTitle').textContent = 'Edit Contact';
    const c = contacts[index];
    document.getElementById('contactName').value = c.name || '';
    document.getElementById('contactEmail').value = c.email || '';
    document.getElementById('contactPhone').value = c.phone || '';
    document.getElementById('contactCompany').value = c.company || '';
    document.getElementById('contactPosition').value = c.position || '';
    document.getElementById('contactStatus').value = c.status || 'Lead';
    document.getElementById('contactSource').value = c.source || 'None';
    document.getElementById('contactNotes').value = c.notes || '';
  } else {
    editingContactIndex = null;
    document.getElementById('contactModalTitle').textContent = 'New Contact';
    document.getElementById('contactForm').reset();
  }
}

/** Close and reset the contact modal. */
function closeContactModal() {
  const modal = document.getElementById('contactModal');
  modal.classList.add('hidden');
  document.getElementById('contactForm').reset();
}

/** Handler for saving a contact.  Creates a new object or updates
 * existing data, adds an activity entry and re‑renders the list. */
function saveContact(e) {
  e.preventDefault();
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const company = document.getElementById('contactCompany').value.trim();
  const position = document.getElementById('contactPosition').value.trim();
  const status = document.getElementById('contactStatus').value;
  const source = document.getElementById('contactSource').value;
  const notes = document.getElementById('contactNotes').value.trim();
  const contactObj = { name, email, phone, company, position, status, source, notes };
  if (editingContactIndex != null) {
    contacts[editingContactIndex] = contactObj;
    addActivity(`Updated contact ${name || '(no name)'}`);
  } else {
    contacts.push(contactObj);
    addActivity(`Added contact ${name || '(no name)'}`);
  }
  saveData();
  renderContacts();
  updateDashboard();
  closeContactModal();
}

/** Render the deal list and bind editing/deleting behaviour. */
function renderDeals() {
  const list = document.getElementById('dealList');
  const search = document.getElementById('dealSearch').value.toLowerCase();
  list.innerHTML = '';
  deals
    .filter((d) => {
      const haystack = `${d.title} ${d.contactName || ''}`.toLowerCase();
      return haystack.includes(search);
    })
    .forEach((d, index) => {
      const card = document.createElement('div');
      card.className = 'deal-card card';
      const title = document.createElement('p');
      title.className = 'deal-title';
      title.textContent = d.title || 'Untitled';
      const value = document.createElement('div');
      value.className = 'deal-value';
      value.textContent = `$${(parseFloat(d.value) || 0).toLocaleString()}`;
      const prob = document.createElement('div');
      prob.className = 'deal-prob';
      prob.textContent = `${d.probability || 0}% prob`;
      const close = document.createElement('div');
      close.className = 'deal-close';
      if (d.closeDate) {
        const icon = document.createElement('ion-icon');
        icon.setAttribute('name', 'calendar-outline');
        close.appendChild(icon);
        const span = document.createElement('span');
        span.textContent = `Close: ${formatDate(d.closeDate)}`;
        close.appendChild(span);
      }
      const stageTag = document.createElement('span');
      stageTag.className = 'stage-tag stage-' + d.stage.replace(' ', '');
      stageTag.textContent = d.stage;
      // actions
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon>';
      editBtn.title = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDealModal(index);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this deal?')) {
          const title = deals[index].title;
          deals.splice(index, 1);
          saveData();
          addActivity(`Deleted deal ${title}`);
          renderDeals();
          updateDashboard();
        }
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      // assemble card
      card.appendChild(title);
      card.appendChild(value);
      card.appendChild(prob);
      card.appendChild(close);
      card.appendChild(stageTag);
      card.appendChild(actions);
      list.appendChild(card);
    });
  document.getElementById('dealsCount').textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'} in your pipeline`;
}

/** Open the deal modal with optional editing of an existing deal. */
function openDealModal(index) {
  const modal = document.getElementById('dealModal');
  modal.classList.remove('hidden');
  const contactSelect = document.getElementById('dealContact');
  // populate contact select once
  contactSelect.innerHTML = '<option value="">No contact</option>';
  contacts.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = c.name;
    contactSelect.appendChild(opt);
  });
  if (index != null) {
    editingDealIndex = index;
    document.getElementById('dealModalTitle').textContent = 'Edit Deal';
    const d = deals[index];
    document.getElementById('dealTitle').value = d.title || '';
    // find contact index by name
    const ci = contacts.findIndex((c) => c.name === d.contactName);
    document.getElementById('dealContact').value = ci >= 0 ? ci : '';
    document.getElementById('dealValue').value = d.value || '';
    document.getElementById('dealProbability').value = d.probability || '';
    document.getElementById('dealStage').value = d.stage || 'Discovery';
    document.getElementById('dealCloseDate').value = d.closeDate || '';
    document.getElementById('dealNotes').value = d.notes || '';
  } else {
    editingDealIndex = null;
    document.getElementById('dealModalTitle').textContent = 'New Deal';
    document.getElementById('dealForm').reset();
  }
}

/** Close the deal modal. */
function closeDealModal() {
  document.getElementById('dealModal').classList.add('hidden');
  document.getElementById('dealForm').reset();
}

/** Save the deal from the form into the deals array, update
 * activities and UI. */
function saveDeal(e) {
  e.preventDefault();
  const title = document.getElementById('dealTitle').value.trim();
  const contactIndex = document.getElementById('dealContact').value;
  const contactName = contactIndex !== '' ? contacts[contactIndex]?.name : '';
  const value = parseFloat(document.getElementById('dealValue').value) || 0;
  const probability = parseInt(document.getElementById('dealProbability').value) || 0;
  const stage = document.getElementById('dealStage').value;
  const closeDate = document.getElementById('dealCloseDate').value;
  const notes = document.getElementById('dealNotes').value.trim();
  const dealObj = {
    title,
    contactName,
    value,
    probability,
    stage,
    closeDate,
    notes,
  };
  if (editingDealIndex != null) {
    deals[editingDealIndex] = dealObj;
    addActivity(`Updated deal ${title || '(untitled)'}`);
  } else {
    deals.push(dealObj);
    addActivity(`Added deal ${title || '(untitled)'}`);
  }
  saveData();
  renderDeals();
  updateDashboard();
  closeDealModal();
}

/** Render the list of tasks according to the current filter and search. */
function renderTasks() {
  const list = document.getElementById('taskList');
  const search = document.getElementById('taskSearch').value.toLowerCase();
  const activeFilter = document.querySelector('.filter-tab.active').dataset.filter;
  list.innerHTML = '';
  let filtered = tasks.filter((t) => {
    const haystack = `${t.title} ${t.description} ${t.project || ''}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (activeFilter === 'pending') return t.status !== 'Completed';
    if (activeFilter === 'completed') return t.status === 'Completed';
    return true;
  });
  // sort by due date ascending (unfinished tasks first)
  filtered.sort((a, b) => {
    const da = a.dueDate || '';
    const db = b.dueDate || '';
    return da.localeCompare(db);
  });
  filtered.forEach((t, index) => {
    const li = document.createElement('div');
    li.className = 'task-item';
    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = t.status === 'Completed';
    checkbox.addEventListener('change', () => {
      t.status = checkbox.checked ? 'Completed' : 'Not Started';
      saveData();
      addActivity(`Marked task "${t.title}" as ${t.status}`);
      renderTasks();
      updateDashboard();
    });
    li.appendChild(checkbox);
    // Content
    const content = document.createElement('div');
    content.className = 'task-content';
    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent = t.title;
    if (t.status === 'Completed') title.style.textDecoration = 'line-through';
    const desc = document.createElement('p');
    desc.className = 'task-desc';
    desc.textContent = t.description || '';
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    // Priority
    const priority = document.createElement('span');
    priority.className = `task-priority priority-${t.priority}`;
    priority.textContent = t.priority;
    meta.appendChild(priority);
    // Due date
    if (t.dueDate) {
      const dateEl = document.createElement('span');
      dateEl.className = 'task-date';
      dateEl.innerHTML = `<ion-icon name="calendar-outline"></ion-icon> ${formatDate(t.dueDate)}`;
      meta.appendChild(dateEl);
    }

    // Type + estimate (helps the planner feel tangible)
    if (t.type) {
      const typeTag = document.createElement('span');
      typeTag.className = 'task-project';
      typeTag.textContent = t.type;
      meta.appendChild(typeTag);
    }
    if (t.estimateMins) {
      const estTag = document.createElement('span');
      estTag.className = 'task-date';
      estTag.innerHTML = `<ion-icon name="time-outline"></ion-icon> ${t.estimateMins}m`;
      meta.appendChild(estTag);
    }
    // Project tag
    if (t.project) {
      const projectTag = document.createElement('span');
      projectTag.className = 'task-project';
      projectTag.textContent = t.project;
      meta.appendChild(projectTag);
    }
    content.appendChild(title);
    if (t.description) content.appendChild(desc);
    content.appendChild(meta);
    li.appendChild(content);
    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<ion-icon name="create-outline"></ion-icon>';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal(index);
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this task?')) {
        const title = tasks[index].title;
        tasks.splice(index, 1);
        saveData();
        addActivity(`Deleted task ${title}`);
        renderTasks();
        updateDashboard();
      }
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
    list.appendChild(li);
  });
  // summary text
  const pendingCount = tasks.filter((t) => t.status !== 'Completed').length;
  document.getElementById('taskSummary').textContent = `${pendingCount} pending task${pendingCount === 1 ? '' : 's'}`;
  // update projects view
  renderProjects();
}

/** Render project cards summarising progress of tasks grouped by
 * project name. */
function renderProjects() {
  const container = document.getElementById('projectList');
  container.innerHTML = '';
  const groups = {};
  tasks.forEach((t) => {
    if (!t.project) return;
    if (!groups[t.project]) groups[t.project] = { total: 0, completed: 0 };
    groups[t.project].total += 1;
    if (t.status === 'Completed') groups[t.project].completed += 1;
  });
  Object.entries(groups).forEach(([project, data]) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    const title = document.createElement('h3');
    title.textContent = project;
    card.appendChild(title);
    const progress = document.createElement('div');
    progress.className = 'project-progress';
    const bar = document.createElement('span');
    const percent = data.total ? (data.completed / data.total) * 100 : 0;
    bar.style.width = `${percent}%`;
    progress.appendChild(bar);
    card.appendChild(progress);
    const meta = document.createElement('div');
    meta.className = 'project-meta';
    meta.textContent = `${data.completed} of ${data.total} tasks completed`;
    card.appendChild(meta);
    card.addEventListener('click', () => {
      // Filter tasks by this project and set filter tabs to all
      document.querySelectorAll('.filter-tab').forEach((tab) => tab.classList.remove('active'));
      document.querySelector('.filter-tab[data-filter="all"]').classList.add('active');
      document.getElementById('taskSearch').value = project;
      renderTasks();
    });
    container.appendChild(card);
  });
}

/** Open the task modal for create or edit. */
function openTaskModal(index) {
  const modal = document.getElementById('taskModal');
  modal.classList.remove('hidden');
  if (index != null) {
    editingTaskIndex = index;
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    const t = tasks[index];
    document.getElementById('taskTitle').value = t.title;
    document.getElementById('taskDescription').value = t.description || '';
    document.getElementById('taskProject').value = t.project || '';
    document.getElementById('taskPriority').value = t.priority || 'low';
    document.getElementById('taskDueDate').value = t.dueDate || '';
    document.getElementById('taskStatus').value = t.status || 'Not Started';
    document.getElementById('taskEstimate').value = t.estimateMins ?? 30;
    document.getElementById('taskEnergy').value = t.energy || 'Deep';
    document.getElementById('taskType').value = t.type || 'Delivery';
    document.getElementById('taskDeal').value = t.dealId || '';
    document.getElementById('taskImpact').value = t.impact ?? 3;
    document.getElementById('taskUrgency').value = t.urgency ?? 3;
  } else {
    editingTaskIndex = null;
    document.getElementById('taskModalTitle').textContent = 'New Task';
    document.getElementById('taskForm').reset();
    // sensible defaults for the planner
    document.getElementById('taskEstimate').value = 30;
    document.getElementById('taskEnergy').value = 'Deep';
    document.getElementById('taskType').value = 'Revenue';
    document.getElementById('taskDeal').value = '';
    document.getElementById('taskImpact').value = 3;
    document.getElementById('taskUrgency').value = 3;
  }
}

/** Close the task modal. */
function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
  document.getElementById('taskForm').reset();
}

/** Save a task from the form into the tasks array and re‑render. */
function saveTask(e) {
  e.preventDefault();
  const title = document.getElementById('taskTitle').value.trim();
  const description = document.getElementById('taskDescription').value.trim();
  const project = document.getElementById('taskProject').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const dueDate = document.getElementById('taskDueDate').value;
  const status = document.getElementById('taskStatus').value;
  const estimateMins = Number(document.getElementById('taskEstimate').value) || 30;
  const energy = document.getElementById('taskEnergy').value || 'Deep';
  const type = document.getElementById('taskType').value || 'Delivery';
  const dealId = document.getElementById('taskDeal').value.trim();
  const impact = Math.min(5, Math.max(1, Number(document.getElementById('taskImpact').value) || 3));
  const urgency = Math.min(5, Math.max(1, Number(document.getElementById('taskUrgency').value) || 3));
  const taskObj = { title, description, project, priority, dueDate, status, estimateMins, energy, type, dealId: dealId || null, impact, urgency };
  if (editingTaskIndex != null) {
    tasks[editingTaskIndex] = taskObj;
    addActivity(`Updated task ${title}`);
  } else {
    tasks.push(taskObj);
    addActivity(`Added task ${title}`);
  }
  saveData();
  renderTasks();
  updateDashboard();
  closeTaskModal();

  // Revenue interrupt: if this is a deal-moving task, re-plan immediately.
  if (taskObj.dealId || taskObj.type === 'Revenue') {
    window.revenueInterrupt?.();
  }
}

/** Navigation handler.  Switches the visible section when a sidebar
 * item is clicked. */
function setupNavigation() {
  document.querySelectorAll('.sidebar nav li[data-page]').forEach((item) => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      document.querySelectorAll('.sidebar nav li').forEach((li) => li.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach((section) => {
        section.classList.remove('visible');
      });
      document.getElementById(page).classList.add('visible');

      // Optional page init hook (used by Lead Map, etc.)
      if (typeof window.onPageChange === 'function') {
        window.onPageChange(page);
      }
    });
  });
}

/** Import contacts from a user provided file.  Uses PapaParse to
 * parse CSV and plain text.  The expected columns for CSV are
 * Name, Email, Phone, Company, Position, Status, Source, Notes.
 */
function importContacts(file) {
  if (!file) return;
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const added = [];
      results.data.forEach((row) => {
        // Normalize keys to expected property names
        const c = {
          name: row['Name'] || row['name'] || row['Full Name'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || '',
          company: row['Company'] || row['company'] || '',
          position: row['Position'] || row['position'] || '',
          status: row['Status'] || row['status'] || 'Lead',
          source: row['Source'] || row['source'] || 'None',
          notes: row['Notes'] || row['notes'] || '',
        };
        contacts.push(c);
        added.push(c.name || '(no name)');
      });
      saveData();
      renderContacts();
      updateDashboard();
      addActivity(`Imported ${added.length} contacts`);
    },
    error: function (err) {
      alert('Failed to import contacts: ' + err.message);
    },
  });
}

/** Generate random leads using simple name lists.  This function
 * creates a handful of random contacts with the status Lead and a
 * source of Cold Outreach. */
function generateRandomLeads(count = 3) {
  const firstNames = [
    'Alex',
    'Jamie',
    'Jordan',
    'Taylor',
    'Morgan',
    'Riley',
    'Casey',
    'Avery',
    'Charlie',
    'Drew',
  ];
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
  ];
  const added = [];
  for (let i = 0; i < count; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const email = name.toLowerCase().replace(/ /g, '.') + '@example.com';
    const phone = '+1 ' + Math.floor(1000000000 + Math.random() * 9000000000);
    const company = 'Lead Co';
    const position = 'Prospect';
    contacts.push({ name, email, phone, company, position, status: 'Lead', source: 'Cold Outreach', notes: '' });
    added.push(name);
  }
  saveData();
  renderContacts();
  updateDashboard();
  addActivity(`Generated ${added.length} new leads`);
}

/** Simple AI assistant that recognises a few commands from the user and
 * responds accordingly.  The conversation is appended to the chat
 * history. */
function handleAssistantQuery(message) {
  const lower = message.toLowerCase();
  if (lower.includes('lead')) {
    const leads = contacts.filter((c) => c.status.toLowerCase() === 'lead');
    if (leads.length) {
      const names = leads.map((c) => c.name || '(no name)').join(', ');
      return `You have ${leads.length} lead${leads.length === 1 ? '' : 's'}: ${names}.`;
    }
    return 'You currently have no leads.';
  }
  if (lower.includes('negotiation')) {
    const negotiators = deals.filter((d) => d.stage.toLowerCase() === 'negotiation');
    if (negotiators.length) {
      const titles = negotiators.map((d) => d.title).join(', ');
      return `You have ${negotiators.length} deal${negotiators.length === 1 ? '' : 's'} in negotiation: ${titles}.`;
    }
    return 'No deals are currently in negotiation.';
  }
  if (lower.startsWith('create a new contact') || lower.startsWith('create new contact') || lower.startsWith('add a new contact')) {
    // try to extract name after 'for'
    const match = message.match(/for\s+(.+)/i);
    const name = match ? match[1].trim() : 'Unnamed Contact';
    contacts.push({ name, email: '', phone: '', company: '', position: '', status: 'Lead', source: 'Other', notes: '' });
    saveData();
    renderContacts();
    updateDashboard();
    addActivity(`Assistant created contact ${name}`);
    return `Created a new contact for ${name}.`;
  }
  if (lower.startsWith('add a task')) {
    // Extract description after 'task'
    const descMatch = message.match(/task\s+to\s+(.*)/i);
    const description = descMatch ? descMatch[1].trim() : message.replace(/add a task/i, '').trim();
    const title = description || 'Follow up';
    tasks.push({ title, description, project: '', priority: 'medium', dueDate: '', status: 'Not Started' });
    saveData();
    renderTasks();
    updateDashboard();
    addActivity(`Assistant added task ${title}`);
    return `Added a new task: ${title}.`;
  }
  if (lower.includes('pending tasks')) {
    const pending = tasks.filter((t) => t.status !== 'Completed');
    if (pending.length) {
      const titles = pending.map((t) => t.title).join(', ');
      return `You have ${pending.length} pending task${pending.length === 1 ? '' : 's'}: ${titles}.`;
    }
    return 'You have no pending tasks.';
  }
  return "I'm sorry, I can't handle that request yet.";
}

/** Append a message to the chat history. */
function appendChatMessage(sender, text) {
  const history = document.getElementById('chatHistory');
  const li = document.createElement('li');
  li.className = sender;
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  li.appendChild(content);
  history.appendChild(li);
  // Scroll to bottom
  history.scrollTop = history.scrollHeight;
}

/** Event handlers for the AI assistant chat. */
function sendChat() {
  const input = document.getElementById('chatMessage');
  const message = input.value.trim();
  if (!message) return;
  appendChatMessage('user', message);
  input.value = '';
  // simulate small delay
  setTimeout(() => {
    const reply = handleAssistantQuery(message);
    appendChatMessage('assistant', reply);
  }, 200);
}

/* =========================
   Revenue Planner (local MVP)
   - Revenue-first, auto-splits, time-blocked
   - Interrupts and replans on new deal/revenue tasks
   ========================= */

let lastPlan = null;

function parseRanges(str) {
  if (!str || !str.trim()) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => {
      const [start, end] = r.split('-').map((x) => x.trim());
      return { start, end };
    });
}

function timeToMinutes(t) {
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return hh * 60 + mm;
}

function minutesToTime(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function inAnyRange(t, ranges) {
  const tm = timeToMinutes(t);
  return ranges.some((r) => tm >= timeToMinutes(r.start) && tm < timeToMinutes(r.end));
}

function isVagueTitle(title) {
  const vague = ['build', 'create', 'work on', 'fix', 'improve', 'setup', 'do', 'research'];
  const t = (title || '').toLowerCase().trim();
  return vague.some((v) => t === v || t.startsWith(v + ' '));
}

function priorityToUrgency(priority) {
  if (priority === 'high') return 5;
  if (priority === 'medium') return 3;
  return 2;
}

function autoSplitTask(task, baseId) {
  const est = Number(task.estimateMins || 30);
  const needsSplit = est > 60 || isVagueTitle(task.title);
  if (!needsSplit) return [{ ...task, _plannerId: baseId }];

  // If vague, assume at least 90 mins. If long, split it.
  let remaining = isVagueTitle(task.title) ? Math.max(est, 90) : est;
  const chunks = [];
  let idx = 1;
  while (remaining > 0) {
    const chunk = Math.min(45, remaining);
    chunks.push({
      ...task,
      _plannerId: `${baseId}-chunk-${idx}`,
      _splitParent: baseId,
      title: `${task.title} (chunk ${idx})`,
      estimateMins: chunk,
    });
    remaining -= chunk;
    idx += 1;
  }
  return chunks;
}

function revenueScore(task, todayStr, slotLabel) {
  // Normalize missing fields for older tasks
  const urgency = Number(task.urgency ?? priorityToUrgency(task.priority)) || 3;
  const impact = Number(task.impact ?? 3) || 3;
  const type = task.type || 'Delivery';
  const dealId = task.dealId;
  const status = task.status || 'Not Started';

  let score = 0;
  score += urgency * 20;
  score += impact * 15;

  if (dealId) score += 80;
  if (type === 'Revenue') score += 50;
  if (status === 'Blocked') score -= 999;

  // due date proximity
  if (task.dueDate) {
    const due = new Date(task.dueDate);
    const now = new Date(todayStr);
    const days = Math.floor((due - now) / (1000 * 60 * 60 * 24));
    if (days < 0) score += 120;
    else if (days === 0) score += 60;
    else if (days <= 2) score += 30;
  }

  // effort penalty
  score -= (Number(task.estimateMins || 30) / 15) * 2;

  // Keep system work out of prime hours
  if (slotLabel === 'Prime' && type === 'System') score -= 200;

  return score;
}

function buildSlots(settings) {
  const start = timeToMinutes(settings.workdayStart);
  const end = timeToMinutes(settings.workdayEnd);

  const meetings = parseRanges(settings.meetingBlocks);
  const prime = parseRanges(settings.primeHours);
  const downtime = parseRanges(settings.downtimeHours);

  // Build 15-min slots then merge by label
  const raw = [];
  for (let m = start; m < end; m += 15) {
    const t = minutesToTime(m);
    if (inAnyRange(t, meetings)) continue;
    const label = inAnyRange(t, prime) ? 'Prime' : inAnyRange(t, downtime) ? 'Downtime' : 'Anytime';
    raw.push({ m, label });
  }

  const slots = [];
  let cur = null;
  for (const r of raw) {
    if (!cur) {
      cur = { startM: r.m, endM: r.m + 15, label: r.label };
    } else if (r.label === cur.label && r.m === cur.endM) {
      cur.endM += 15;
    } else {
      slots.push(cur);
      cur = { startM: r.m, endM: r.m + 15, label: r.label };
    }
  }
  if (cur) slots.push(cur);

  return slots.map((s) => ({
    start: minutesToTime(s.startM),
    end: minutesToTime(s.endM),
    duration: s.endM - s.startM,
    label: s.label,
  }));
}

function taskFitsSlot(task, slot) {
  const est = Number(task.estimateMins || 30);
  if (est > slot.duration) return false;

  const type = task.type || 'Delivery';
  if (slot.label === 'Prime' && type === 'System') return false;
  if (task.status === 'Blocked') return false;
  return true;
}

function generatePlanLocal() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

  const settings = {
    workdayStart: document.getElementById('workdayStart')?.value || '09:00',
    workdayEnd: document.getElementById('workdayEnd')?.value || '17:00',
    primeHours: document.getElementById('primeHours')?.value || '09:00-15:00',
    downtimeHours: document.getElementById('downtimeHours')?.value || '19:00-22:00',
    meetingBlocks: document.getElementById('meetingBlocks')?.value || '',
  };

  const pendingTasks = tasks.filter((t) => (t.status || 'Not Started') !== 'Completed');
  const normalized = [];
  pendingTasks.forEach((t, idx) => {
    autoSplitTask(t, `task-${idx}`).forEach((chunk) => normalized.push(chunk));
  });

  const slots = buildSlots(settings);
  const planBlocks = [];
  const remaining = [...normalized];

  for (const slot of slots) {
    // score per slot because prime hours penalize system tasks
    const scored = remaining
      .map((t) => ({ ...t, _score: revenueScore(t, todayStr, slot.label) }))
      .sort((a, b) => b._score - a._score);

    const pick = scored.find((t) => taskFitsSlot(t, slot));
    if (!pick) continue;

    // remove by planner id
    const removeIndex = remaining.findIndex((x) => x._plannerId === pick._plannerId);
    if (removeIndex >= 0) remaining.splice(removeIndex, 1);

    const blockEnd = minutesToTime(timeToMinutes(slot.start) + Number(pick.estimateMins || 30));
    planBlocks.push({
      start: slot.start,
      end: blockEnd,
      title: pick.title,
      reason: pick.dealId ? 'Deal-moving task' : (pick.type || 'Delivery') === 'Revenue' ? 'Revenue task' : 'Progress task',
    });
  }

  const doNow = planBlocks.find((b) => timeToMinutes(b.end) >= timeToMinutes(nowTime)) || planBlocks[0] || null;
  const doNowIndex = doNow ? planBlocks.findIndex((b) => b.start === doNow.start && b.title === doNow.title) : -1;
  const nextUp = doNowIndex >= 0 ? planBlocks.slice(doNowIndex + 1, doNowIndex + 4) : [];
  const tonight = planBlocks
    .filter((b) => inAnyRange(b.start, parseRanges(settings.downtimeHours)))
    .slice(0, 3);

  lastPlan = { todayStr, nowTime, planBlocks, doNow, nextUp, tonight };
  renderPlanner(lastPlan);
}

function renderPlanner(plan) {
  const doNowEl = document.getElementById('doNowCard');
  const nextUpEl = document.getElementById('nextUpList');
  const tonightEl = document.getElementById('tonightList');
  const timelineEl = document.getElementById('planTimeline');
  if (!doNowEl || !nextUpEl || !tonightEl || !timelineEl) return;

  if (!plan || !plan.planBlocks || plan.planBlocks.length === 0) {
    doNowEl.textContent = 'Generate a plan to get your next action.';
    nextUpEl.textContent = '—';
    tonightEl.textContent = '—';
    timelineEl.textContent = '—';
    return;
  }

  if (plan.doNow) {
    doNowEl.innerHTML = `<div style="font-weight:600; margin-bottom:6px;">${plan.doNow.start}–${plan.doNow.end}</div><div>${plan.doNow.title}</div><div class="helper" style="margin-top:6px;">${plan.doNow.reason}</div>`;
  }

  nextUpEl.innerHTML = plan.nextUp.length
    ? plan.nextUp
        .map((b) => `<div style="margin-bottom:8px;"><b>${b.start}–${b.end}</b> — ${b.title}</div>`)
        .join('')
    : '<div class="muted">—</div>';

  tonightEl.innerHTML = plan.tonight.length
    ? plan.tonight
        .map((b) => `<div style="margin-bottom:8px;"><b>${b.start}–${b.end}</b> — ${b.title}</div>`)
        .join('')
    : '<div class="muted">—</div>';

  timelineEl.innerHTML = plan.planBlocks
    .map(
      (b) => `<div style="padding:10px 0; border-bottom:1px solid var(--border-color);">
        <b>${b.start}–${b.end}</b> — ${b.title}
        <div class="helper">${b.reason}</div>
      </div>`
    )
    .join('');
}

function showInterruptToast(msg) {
  const el = document.getElementById('interruptToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  window.clearTimeout(el._t);
  el._t = window.setTimeout(() => el.classList.add('hidden'), 4500);
}

/* ===========================
   Motion-style Planner Calendar
   =========================== */

let weekPlanBlocks = []; // [{date:'YYYY-MM-DD', start:'HH:MM', end:'HH:MM', title, type, taskId, locked, completed}]

function isoDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(anchor){
  const d = new Date(anchor);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(dateObj, n){
  const d = new Date(dateObj);
  d.setDate(d.getDate() + n);
  return d;
}

function parseFixedEvents(text){
  // Lines: "Mon 09:00-10:00 Title"
  const lines = (text || '').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const map = {Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0};
  const events = [];
  lines.forEach((line) => {
    const m = line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+)$/i);
    if(!m) return;
    const dowToken = m[1].slice(0,1).toUpperCase() + m[1].slice(1,3).toLowerCase();
    const start = m[2].padStart(5,'0');
    const end = m[3].padStart(5,'0');
    const title = m[4].trim();
    events.push({ dow: map[dowToken], start, end, title });
  });
  return events;
}

function overlaps(aStart, aEnd, bStart, bEnd){
  const aS = timeToMinutes(aStart), aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart), bE = timeToMinutes(bEnd);
  return Math.max(aS, bS) < Math.min(aE, bE);
}

function subtractRanges(baseStart, baseEnd, blockers){
  // returns list of free ranges inside [baseStart, baseEnd) excluding blocker ranges
  let free = [{start: baseStart, end: baseEnd}];
  blockers.forEach((b) => {
    free = free.flatMap((r) => {
      if(!overlaps(r.start, r.end, b.start, b.end)) return [r];
      const out = [];
      if(timeToMinutes(b.start) > timeToMinutes(r.start)){
        out.push({start: r.start, end: b.start});
      }
      if(timeToMinutes(b.end) < timeToMinutes(r.end)){
        out.push({start: b.end, end: r.end});
      }
      return out;
    });
  });
  // remove tiny slices (<15m)
  return free.filter(r => (timeToMinutes(r.end) - timeToMinutes(r.start)) >= 15);
}

function buildDaySlots(dayDateISO, workStart, workEnd, downtimeRange, fixedForDay){
  // Prime slots = workday excluding fixed events and downtime
  const downtime = parseTimeRange(downtimeRange);
  const blockers = [...fixedForDay];
  // downtime as blocker for prime, and prime as blocker for downtime respectively
  const primeFree = subtractRanges(workStart, workEnd, blockers.concat(downtime));
  const downtimeFree = subtractRanges(downtime[0]?.start || '19:00', downtime[0]?.end || '22:00', blockers);

  // Return ordered slots with labels and free ranges
  return {
    primeFree,
    downtimeFree
  };
}

function normalizeTaskType(t){
  const type = (t.type || '').toLowerCase();
  if(type.includes('revenue')) return 'revenue';
  if(type.includes('system')) return 'system';
  return 'delivery';
}

function taskIsCompleted(task){
  return task && (task.status === 'Completed' || task.completed === true);
}

function generateWeekPlanLocal(){
  const anchorEl = document.getElementById('weekAnchor');
  const fixedEl = document.getElementById('fixedEvents');
  const workStart = (document.getElementById('workdayStart')?.value || '09:00').trim();
  const workEnd = (document.getElementById('workdayEnd')?.value || '17:00').trim();
  const downtimeRange = (document.getElementById('downtimeHours')?.value || '19:00-22:00').trim();

  const anchor = anchorEl?.value ? new Date(anchorEl.value) : new Date();
  const weekStart = startOfWeekMonday(anchor);
  if(anchorEl && !anchorEl.value){
    anchorEl.value = isoDate(anchor);
  }

  // Persist fixed events text
  if(fixedEl){
    try{ localStorage.setItem('crm_fixed_events', fixedEl.value || ''); }catch(e){}
  }

  const fixedEvents = parseFixedEvents(fixedEl ? fixedEl.value : '');
  // Build fixed blocks with concrete dates for this week
  const fixedBlocks = [];
  for(let i=0;i<7;i++){
    const d = addDays(weekStart, i);
    const dow = d.getDay();
    const dateISO = isoDate(d);
    fixedEvents.filter(ev => ev.dow === dow).forEach(ev => {
      fixedBlocks.push({
        date: dateISO, start: ev.start, end: ev.end, title: ev.title,
        type: 'fixed', locked: true, completed: false, taskId: null
      });
    });
  }

  // Collect tasks eligible to schedule
  // Respect existing splitting logic by using autoSplitTask if present
  const pending = tasks.filter((t) => shouldScheduleTask(t)).map((t) => ({...t}));
  const remaining = [];
  pending.forEach((t, idx) => {
    // If splitter exists, it pushes split tasks to global tasks. We'll avoid mutating global by doing a lightweight split here.
    // Use existing helper autoSplitTask if available (it will return split tasks via internal pattern); otherwise keep as-is.
    remaining.push(t);
  });

  // Sort remaining by a revenue-first score, but without slotLabel yet.
  const todayStr = isoDate(new Date());
  remaining.sort((a,b) => revenueScore(b, todayStr, 'Prime') - revenueScore(a, todayStr, 'Prime'));

  // Plan across Mon..Sun (workdays first)
  const planned = [];
  let cursor = 0;

  const daysOrder = [1,2,3,4,5,6,0]; // start Monday
  daysOrder.forEach((dow, dayIdx) => {
    const dateObj = addDays(weekStart, dayIdx);
    const dateISO = isoDate(dateObj);

    const fixedForDay = fixedBlocks.filter(b => b.date === dateISO).map(b => ({start:b.start, end:b.end}));
    const { primeFree, downtimeFree } = buildDaySlots(dateISO, workStart, workEnd, downtimeRange, fixedForDay);

    function fillRanges(ranges, slotLabel){
      for(const r of ranges){
        let startMin = timeToMinutes(r.start);
        const endMin = timeToMinutes(r.end);
        while(startMin < endMin && cursor < remaining.length){
          const task = remaining[cursor];
          const est = Math.max(15, Number(task.estimateMins || 30));
          const blockEnd = Math.min(endMin, startMin + est);
          // Don't schedule System tasks in Prime
          const tType = normalizeTaskType(task);
          if(slotLabel === 'Prime' && tType === 'system'){
            cursor++;
            continue;
          }
          // Schedule the block
          planned.push({
            date: dateISO,
            start: minutesToTime(startMin),
            end: minutesToTime(blockEnd),
            title: task.title,
            type: tType,
            locked: false,
            completed: taskIsCompleted(task),
            taskId: task.id || task._id || task.title
          });
          startMin = blockEnd;
          cursor++;
        }
      }
    }

    // First fill Prime with revenue/delivery tasks
    fillRanges(primeFree, 'Prime');
    // Then fill downtime with systems first then remaining
    // Re-order remaining: systems earlier in downtime
    if(cursor < remaining.length){
      const rest = remaining.slice(cursor);
      const systems = rest.filter(t => normalizeTaskType(t)==='system');
      const nonsys = rest.filter(t => normalizeTaskType(t)!=='system');
      remaining.splice(cursor, rest.length, ...systems, ...nonsys);
    }
    fillRanges(downtimeFree, 'Downtime');
  });

  weekPlanBlocks = [...fixedBlocks, ...planned].sort((a,b) => {
    if(a.date !== b.date) return a.date.localeCompare(b.date);
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });

  renderPlannerCalendar(weekStart);
  showInterruptToast('Week plan generated. Execute the next block.');
}

function renderPlannerCalendar(weekStartDate){
  const cal = document.getElementById('plannerCalendar');
  if(!cal) return;
  const weekStart = weekStartDate instanceof Date ? weekStartDate : startOfWeekMonday(new Date());
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dates = days.map((_,i)=> isoDate(addDays(weekStart,i)));

  // Determine calendar hour range based on workday + downtime
  const ws = (document.getElementById('workdayStart')?.value || '09:00').trim();
  const we = (document.getElementById('workdayEnd')?.value || '17:00').trim();
  const dt = parseTimeRange((document.getElementById('downtimeHours')?.value || '19:00-22:00').trim());
  const minHour = Math.min(timeToMinutes(ws), timeToMinutes(dt[0]?.start || '19:00'));
  const maxHour = Math.max(timeToMinutes(we), timeToMinutes(dt[0]?.end || '22:00'));
  const startHour = Math.floor(minHour/60);
  const endHour = Math.ceil(maxHour/60);

  // Build grid headers
  let headerHtml = '<div class="cal-grid cal-header">';
  headerHtml += '<div class="cell"></div>';
  for(let i=0;i<7;i++){
    const dISO = dates[i];
    const dObj = new Date(dISO+'T00:00:00');
    const label = `${days[i]} ${dObj.getMonth()+1}/${dObj.getDate()}`;
    headerHtml += `<div class="cell">${label}</div>`;
  }
  headerHtml += '</div>';

  // Build body rows
  let bodyHtml = '<div class="cal-grid cal-body" style="grid-auto-rows: 42px;">';
  const hours = [];
  for(let h=startHour; h<endHour; h++){
    hours.push(h);
    const timeLabel = `${String(h).padStart(2,'0')}:00`;
    bodyHtml += `<div class="cell time-cell">${timeLabel}</div>`;
    for(let d=0; d<7; d++){
      bodyHtml += `<div class="cell cal-day-col" data-date="${dates[d]}" data-hour="${h}"></div>`;
    }
  }
  bodyHtml += '</div>';

  cal.innerHTML = headerHtml + bodyHtml;

  // Position events
  const pxPerMin = 42/60; // row height per hour / 60
  const dayCols = {};
  cal.querySelectorAll('.cal-day-col').forEach(col => {
    const date = col.getAttribute('data-date');
    if(!dayCols[date]) dayCols[date] = [];
    dayCols[date].push(col);
  });

  const weekEvents = weekPlanBlocks.filter(b => dates.includes(b.date));
  weekEvents.forEach((ev, idx) => {
    const dayCells = dayCols[ev.date];
    if(!dayCells || dayCells.length===0) return;
    const startMin = timeToMinutes(ev.start);
    const endMin = timeToMinutes(ev.end);
    const top = (startMin - startHour*60) * pxPerMin;
    const height = Math.max(18, (endMin - startMin) * pxPerMin);

    // Use the first day cell to absolutely position within the entire column area
    // We'll attach to the first cell and set relative on the parent column container.
    const firstCell = dayCells[0];
    // Ensure parent column group is relative by using the first cell's parent with grid positioning; easiest: attach to the cal-body and compute left via column index.
  });

  // Simpler: overlay layer that spans the cal-body and position blocks with percentage left.
  const body = cal.querySelector('.cal-body');
  body.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.pointerEvents = 'none';
  body.appendChild(overlay);

  const bodyRect = body.getBoundingClientRect();
  const colWidthPct = 100 / 8; // includes time column
  // helper to compute left by day index (1..7)
  const getLeftPct = (dayIndex) => colWidthPct * (dayIndex+1); // dayIndex 0..6, skip time col

  weekEvents.forEach((ev, idx) => {
    const dayIndex = dates.indexOf(ev.date);
    if(dayIndex < 0) return;

    const startMin = timeToMinutes(ev.start);
    const endMin = timeToMinutes(ev.end);
    const top = (startMin - startHour*60) * pxPerMin;
    const height = Math.max(18, (endMin - startMin) * pxPerMin);

    const block = document.createElement('div');
    block.className = `cal-event ${ev.type || 'delivery'} ${ev.locked ? 'locked':''} ${ev.completed ? 'completed':''}`;
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.style.left = `calc(${getLeftPct(dayIndex)}% + 6px)`;
    block.style.width = `calc(${colWidthPct}% - 12px)`;
    block.style.pointerEvents = ev.locked ? 'none' : 'auto';
    block.setAttribute('data-idx', String(idx));

    const timeLabel = `${ev.start}–${ev.end}`;
    block.innerHTML = `
      <div class="title">${escapeHtml(ev.title || 'Block')}</div>
      <div class="meta"><span>${timeLabel}</span><span>${(ev.type||'').toUpperCase()}</span></div>
    `;

    if(!ev.locked){
      block.addEventListener('click', () => {
        // Toggle completion on the underlying task if found
        const tId = ev.taskId;
        const tIndex = tasks.findIndex(t => (t.id||t._id||t.title) === tId || t.title === ev.title);
        if(tIndex >= 0){
          tasks[tIndex].status = (tasks[tIndex].status === 'Completed') ? 'Pending' : 'Completed';
          saveData();
          renderTasks();
          updateDashboard();
        }
        ev.completed = !ev.completed;
        block.classList.toggle('completed', ev.completed);
      });
    }

    overlay.appendChild(block);
  });
}

function initRevenuePlanner() {
  const genBtn = document.getElementById('btnGeneratePlan');
  const replanBtn = document.getElementById('btnReplan');

  genBtn?.addEventListener('click', () => {
    generatePlanLocal();
    showInterruptToast('Plan generated. Execute the next block.');
  });

  replanBtn?.addEventListener('click', () => {
    generatePlanLocal();
    showInterruptToast('Plan updated — revenue interrupt triggered.');
  });

  // Public interrupt hook: call this after adding a revenue/deal task.
  window.revenueInterrupt = () => {
    generatePlanLocal();
    showInterruptToast('🚨 New deal/revenue task detected — replanning now.');
  };

  // initial blank render
  renderPlanner(null);
}

/** Initialisation: load data, set up event listeners and render the UI. */
async function init() {
  await requireEmployeeAuth();
  loadData();
  // Navigation
  setupNavigation();
  // Dashboard
  updateDashboard();
  // Render lists
  renderContacts();
  renderDeals();
  renderTasks();
  // Revenue planner (Tasks page)
  initRevenuePlanner();
  // Search inputs
  document.getElementById('contactSearch').addEventListener('input', renderContacts);
  document.getElementById('dealSearch').addEventListener('input', renderDeals);
  document.getElementById('taskSearch').addEventListener('input', renderTasks);
  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderTasks();
    });
  });
  // Contact modal triggers
  document.getElementById('addContactButton').addEventListener('click', () => openContactModal(null));
  document.getElementById('cancelContact').addEventListener('click', closeContactModal);
  document.getElementById('contactForm').addEventListener('submit', saveContact);
  // Deal modal triggers
  document.getElementById('addDealButton').addEventListener('click', () => openDealModal(null));
  document.getElementById('cancelDeal').addEventListener('click', closeDealModal);
  document.getElementById('dealForm').addEventListener('submit', saveDeal);
  // Task modal triggers
  document.getElementById('addTaskButton').addEventListener('click', () => openTaskModal(null));
  document.getElementById('cancelTask').addEventListener('click', closeTaskModal);
  document.getElementById('taskForm').addEventListener('submit', saveTask);
  // Import contacts
  document.getElementById('importContactsButton').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    importContacts(file);
    e.target.value = '';
  });
  // Generate leads
  // Contacts page no longer includes the "Generate Leads" shortcut.
  document.getElementById('generateLeadsButton')?.addEventListener('click', () => {
    generateRandomLeads();
  });
  // AI assistant
  document.getElementById('sendChatButton').addEventListener('click', sendChat);
  document.getElementById('chatMessage').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  });
  // Suggestions
  document.querySelectorAll('.suggestion').forEach((btn) => {
    btn.addEventListener('click', () => {
      const suggestion = btn.textContent;
      document.getElementById('chatMessage').value = suggestion;
      sendChat();
    });
  });

  // Logout
  const logout = document.getElementById('navLogout');
  if (logout && window.netlifyIdentity) {
    logout.addEventListener('click', () => {
      window.netlifyIdentity.logout();
      window.location.href = LOGIN_PATH;
    });
  }
}

// Run init when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);
/*******************************
 * Lead Map (Generate Leads)
 * - Works on GitHub Pages using a remote API base (Netlify/Vercel)
 * - Saves leads locally (localStorage)
 *******************************/

let leadMap;
let leadMarkersLayer;
let leads = [];

function loadLeads() {
  try {
    leads = JSON.parse(localStorage.getItem('crm_leads') || '[]');
  } catch {
    leads = [];
  }
}

function saveLeads() {
  localStorage.setItem('crm_leads', JSON.stringify(leads));
}

function getApiBase() {
  return (localStorage.getItem('crm_api_base') || '').trim().replace(/\/$/, '');
}

function setApiBase(url) {
  localStorage.setItem('crm_api_base', (url || '').trim().replace(/\/$/, ''));
}

function placesEndpoint() {
  const base = getApiBase();
  if (!base) return '';
  // Netlify Functions convention
  if (base.includes('netlify.app') || base.includes('netlify.com')) {
    return base + '/.netlify/functions/places';
  }
  // Vercel / generic convention
  return base + '/api/places';
}

// =========================
// Neon-backed CRM API helpers (Netlify Functions)
// - Same-origin when running on Netlify
// - These are NO-OP on GitHub Pages unless you point the app at your Netlify URL
// =========================

async function crmApiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  // Some endpoints may return empty
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}

function companiesApiUrl() {
  // If you deploy on Netlify: same-origin works.
  // If you run this on GitHub Pages: set crm_api_base to your Netlify URL.
  const base = getApiBase();
  return base
    ? base.replace(/\/$/, '') + '/.netlify/functions/companies'
    : '/.netlify/functions/companies';
}

function contactsApiUrl() {
  const base = getApiBase();
  return base
    ? base.replace(/\/$/, '') + '/.netlify/functions/contacts'
    : '/.netlify/functions/contacts';
}

function activitiesApiUrl() {
  const base = getApiBase();
  return base
    ? base.replace(/\/$/, '') + '/.netlify/functions/activities'
    : '/.netlify/functions/activities';
}

async function createCompanyFromLead(lead) {
  const payload = {
    name: lead.name || '',
    status: lead.status || 'unknown',
    phone: lead.phone || null,
    website: lead.website || null,
    address: lead.address || null,
    lat: typeof lead.lat === 'number' ? lead.lat : null,
    lng: typeof lead.lng === 'number' ? lead.lng : null,
    rating: lead.rating ?? null,
    reviews: lead.user_ratings_total ?? 0,
    external_place_id: lead.id || null,
  };

  const company = await crmApiFetch(companiesApiUrl(), {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Tie it back so future status changes can sync
  lead.company_id = company?.id;
  saveLeads();

  // log activity (best-effort)
  try {
    await crmApiFetch(activitiesApiUrl(), {
      method: 'POST',
      body: JSON.stringify({
        entity_type: 'company',
        entity_id: company?.id,
        activity_type: 'note',
        body: `Saved from Lead Map. Keyword: ${lead.keyword || ''}`,
        outcome: 'created',
      }),
    });
  } catch (e) {
    // ignore
  }

  return company;
}

async function updateCompanyStatus(companyId, status) {
  if (!companyId) return;
  try {
    await crmApiFetch(companiesApiUrl(), {
      method: 'PATCH',
      body: JSON.stringify({ id: companyId, status }),
    });
  } catch (e) {
    console.warn('Failed to update company status', e);
  }
}

async function hideLeadsThatAlreadyExistInDb() {
  // If the API base isn't set and you aren't on Netlify, skip.
  const base = getApiBase();
  const runningOnNetlify = location.hostname.includes('netlify.app');
  if (!runningOnNetlify && !base) return;

  try {
    const companies = await crmApiFetch(companiesApiUrl(), { method: 'GET' });
    const existing = new Set(
      (companies || [])
        .map((c) => c.external_place_id)
        .filter(Boolean)
        .map(String)
    );
    const before = leads.length;
    leads = leads.filter((l) => !existing.has(String(l.id)));
    const removed = before - leads.length;
    if (removed > 0) {
      saveLeads();
      addActivity(`Lead Map: hid ${removed} leads already saved to CRM`);
    }
  } catch (e) {
    // ignore
  }
}

function ensureLeadMap() {
  const el = document.getElementById('leadsMap');
  if (!el) return;

  if (!leadMap) {
    leadMap = L.map('leadsMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(leadMap);
    leadMarkersLayer = L.layerGroup().addTo(leadMap);

    // Default view (US). We'll fit to markers after load.
    leadMap.setView([39.8283, -98.5795], 4);
  }

  loadLeads();
  renderLeadMarkers();
  renderLeadsTable();
  updateLeadMetrics();
  hydrateLeadControls();
}

function hydrateLeadControls() {
  const apiInput = document.getElementById('apiBase');
  if (apiInput) apiInput.value = getApiBase();

  const btnSave = document.getElementById('btnSaveApi');
  if (btnSave && !btnSave.__wired) {
    btnSave.__wired = true;
    btnSave.addEventListener('click', () => {
      setApiBase(apiInput.value);
      addActivity('Saved Lead Map API URL');
      alert('Saved. You can now run lead searches.');
    });
  }

  const btnSearch = document.getElementById('btnSearchLeads');
  if (btnSearch && !btnSearch.__wired) {
    btnSearch.__wired = true;
    btnSearch.addEventListener('click', async () => {
      await runLeadSearch();
    });
  }

  const filter = document.getElementById('leadStatusFilter');
  if (filter && !filter.__wired) {
    filter.__wired = true;
    filter.addEventListener('change', () => {
      renderLeadsTable();
    });
  }

  const btnExport = document.getElementById('btnExportLeads');
  if (btnExport && !btnExport.__wired) {
    btnExport.__wired = true;
    btnExport.addEventListener('click', exportLeadsCsv);
  }

  const importInput = document.getElementById('leadsImport');
  if (importInput && !importInput.__wired) {
    importInput.__wired = true;
    importInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importLeadsCsv(file);
      importInput.value = '';
    });
  }

  const goal = document.getElementById('salesGoal');
  const avg = document.getElementById('avgDeal');
  const updateGoal = () => {
    const g = Number(goal?.value || 0);
    const a = Number(avg?.value || 0);
    const hint = document.getElementById('goalHint');
    if (!hint) return;
    if (!g || !a) {
      hint.textContent = 'Set a goal to see how many deals you need.';
      return;
    }
    const dealsNeeded = Math.ceil(g / a);
    hint.textContent = `At $${a.toLocaleString()} avg deal, you need ~${dealsNeeded} deals/month to hit $${g.toLocaleString()}.`;
  };
  if (goal && !goal.__wired) {
    goal.__wired = true;
    goal.addEventListener('input', updateGoal);
  }
  if (avg && !avg.__wired) {
    avg.__wired = true;
    avg.addEventListener('input', updateGoal);
  }
  updateGoal();
}

function statusLabel(status) {
  const map = {
    new: 'New',
    called: 'Called',
    follow_up: 'Follow Up',
    do_not_call: 'Do Not Call',
    won: 'Won',
    lost: 'Lost',
  };
  return map[status] || 'New';
}

function statusColorClass(status) {
  const map = {
    new: 'badge',
    called: 'badge',
    follow_up: 'badge',
    do_not_call: 'badge',
    won: 'badge',
    lost: 'badge',
  };
  return map[status] || 'badge';
}

function renderLeadMarkers() {
  if (!leadMap || !leadMarkersLayer) return;
  leadMarkersLayer.clearLayers();

  const bounds = [];
  leads.forEach((lead) => {
    if (typeof lead.lat !== 'number' || typeof lead.lng !== 'number') return;
    const marker = L.marker([lead.lat, lead.lng]);
    marker.addTo(leadMarkersLayer);
    bounds.push([lead.lat, lead.lng]);

    marker.on('click', () => {
      const websiteBadge = lead.website ? '' : '<span class="badge noweb">No website</span>';
      const phone = lead.phone ? `<a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a>` : '<span class="muted">(no phone)</span>';
      const website = lead.website ? `<a href="${lead.website}" target="_blank" rel="noopener">Website</a>` : '<span class="muted">None found</span>';

      const popup = document.createElement('div');
      popup.className = 'lead-popup';
      popup.innerHTML = `
        <div><strong>${escapeHtml(lead.name || 'Unknown')}</strong>${websiteBadge}</div>
        <div class="muted" style="margin-top:6px;">${escapeHtml(lead.address || '')}</div>
        <div style="margin-top:8px;">Phone: ${phone}</div>
        <div>Site: ${website}</div>
        <div style="margin-top:8px;">Rating: ${lead.rating ? escapeHtml(String(lead.rating)) : '—'} (${lead.user_ratings_total || 0})</div>
        <select class="small-select" id="leadStatusSel">
          <option value="new">New</option>
          <option value="called">Called</option>
          <option value="follow_up">Follow Up</option>
          <option value="do_not_call">Do Not Call</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <div class="lead-actions">
          <button class="small-btn primary" id="btnSaveCompany">Save to Companies</button>
          <button class="small-btn" id="btnClose">Close</button>
        </div>
      `;

      marker.bindPopup(popup).openPopup();
      setTimeout(() => {
        const sel = popup.querySelector('#leadStatusSel');
        if (sel) {
          sel.value = lead.status || 'new';
          sel.addEventListener('change', async () => {
            lead.status = sel.value;
            saveLeads();
            renderLeadsTable();
            updateLeadMetrics();
            try {
              await syncCompanyStatusFromLead(lead);
            } catch (e) {
              console.warn('Failed to sync company status', e);
            }
          });
        }
        const btn = popup.querySelector('#btnSaveCompany');
        if (btn) {
          btn.addEventListener('click', async () => {
            await saveLeadAsCompany(lead);
          });
        }
        const close = popup.querySelector('#btnClose');
        if (close) close.addEventListener('click', () => marker.closePopup());
      }, 0);
    });
  });

  if (bounds.length) {
    leadMap.fitBounds(bounds, { padding: [30, 30] });
  }
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTbody');
  if (!tbody) return;

  const filter = document.getElementById('leadStatusFilter');
  const f = filter ? filter.value : 'all';

  tbody.innerHTML = '';
  const rows = leads
    .filter((l) => (f === 'all' ? true : (l.status || 'new') === f))
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  rows.forEach((lead) => {
    const tr = document.createElement('tr');
    const phone = lead.phone ? escapeHtml(lead.phone) : '—';
    const website = lead.website ? `<a href="${lead.website}" target="_blank" rel="noopener">Link</a>` : '<span class="badge noweb">None</span>';
    const rating = lead.rating ? `${lead.rating} (${lead.user_ratings_total || 0})` : '—';

    tr.innerHTML = `
      <td>
        <div><strong>${escapeHtml(lead.name || 'Unknown')}</strong></div>
        <div class="muted">${escapeHtml(lead.address || '')}</div>
      </td>
      <td>${phone}</td>
      <td>${website}</td>
      <td>${escapeHtml(rating)}</td>
      <td>
        <select class="select" data-lead-status>
          <option value="new">New</option>
          <option value="called">Called</option>
          <option value="follow_up">Follow Up</option>
          <option value="do_not_call">Do Not Call</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </td>
      <td>
        <button class="btn secondary" data-add-contact>Save</button>
        <button class="btn danger" data-remove-lead>Remove</button>
      </td>
    `;

    const sel = tr.querySelector('[data-lead-status]');
    sel.value = lead.status || 'new';
    sel.addEventListener('change', async () => {
      lead.status = sel.value;
      saveLeads();
      updateLeadMetrics();
      renderLeadMarkers();
      try {
        await syncCompanyStatusFromLead(lead);
      } catch (e) {
        console.warn('Failed to sync company status', e);
      }
    });

    tr.querySelector('[data-add-contact]').addEventListener('click', async () => saveLeadAsCompany(lead));
    tr.querySelector('[data-remove-lead]').addEventListener('click', () => {
      leads = leads.filter((x) => x !== lead);
      saveLeads();
      renderLeadsTable();
      updateLeadMetrics();
      renderLeadMarkers();
    });

    tbody.appendChild(tr);
  });
}

function updateLeadMetrics() {
  const total = leads.length;
  const noWeb = leads.filter((l) => !l.website).length;
  const follow = leads.filter((l) => (l.status || 'new') === 'follow_up').length;
  const totalEl = document.getElementById('leadsCount');
  const noWebEl = document.getElementById('noWebsiteCount');
  const followEl = document.getElementById('followUpCount');
  if (totalEl) totalEl.textContent = String(total);
  if (noWebEl) noWebEl.textContent = String(noWeb);
  if (followEl) followEl.textContent = String(follow);
}

function normalizeLead(raw, keyword) {
  return {
    id: raw.place_id || raw.id || crypto?.randomUUID?.() || String(Date.now()) + Math.random(),
    name: raw.name || '',
    address: raw.address || raw.vicinity || '',
    phone: raw.phone || raw.formatted_phone_number || '',
    website: raw.website || '',
    rating: raw.rating || null,
    user_ratings_total: raw.user_ratings_total || 0,
    lat: typeof raw.lat === 'number' ? raw.lat : (raw.geometry?.location?.lat ?? null),
    lng: typeof raw.lng === 'number' ? raw.lng : (raw.geometry?.location?.lng ?? null),
    keyword: keyword || raw.keyword || '',
    status: raw.status || 'new',
    createdAt: raw.createdAt || new Date().toISOString(),
    source: raw.source || 'Lead Map',
  };
}

async function runLeadSearch() {
  const endpoint = placesEndpoint();
  if (!endpoint) {
    alert('Set your API Base URL first (Netlify/Vercel).');
    return;
  }

  const keyword = (document.getElementById('leadKeyword')?.value || '').trim();
  const location = (document.getElementById('leadLocation')?.value || '').trim();
  const radiusMiles = Number(document.getElementById('leadRadius')?.value || 10);
  const limit = Number(document.getElementById('leadLimit')?.value || 20);

  if (!keyword || !location) {
    alert('Please enter both an Industry/Keyword and a Location.');
    return;
  }

  const btn = document.getElementById('btnSearchLeads');
  const prevText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Searching...';
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('location', location);
    url.searchParams.set('radius_miles', String(radiusMiles));
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const data = await res.json();

    const incoming = Array.isArray(data.leads) ? data.leads : [];
    const normalized = incoming.map((x) => normalizeLead(x, keyword));

    // Merge by place_id / id
    const byId = new Map(leads.map((l) => [l.id, l]));
    normalized.forEach((l) => {
      if (byId.has(l.id)) return;
      leads.push(l);
    });

    saveLeads();
    addActivity(`Lead Map: added ${normalized.length} leads for "${keyword}" near ${location}`);
    renderLeadsTable();
    updateLeadMetrics();
    renderLeadMarkers();
  } catch (err) {
    console.error(err);
    alert('Lead search failed. Check your API URL and function logs.\n\n' + (err?.message || err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText || 'Search & Add Leads';
    }
  }
}

async function saveLeadAsCompany(lead) {
  // Persist a lead as a Company record in Neon (via Netlify Function)
  // and link the lead row to that company so status updates stay in sync.
  try {
    const payload = {
      name: lead.name || '',
      status: lead.status || 'unknown',
      phone: lead.phone || null,
      website: lead.website || null,
      address: lead.address || null,
      lat: typeof lead.lat === 'number' ? lead.lat : null,
      lng: typeof lead.lng === 'number' ? lead.lng : null,
      rating: lead.rating ?? null,
      reviews: lead.user_ratings_total ?? null,
      external_place_id: lead.id || null,
    };

    const company = await crmApiFetch(companiesApiUrl(), {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Store link so future status changes patch the company
    lead.company_id = company?.id;
    saveLeads();

    // Optional activity
    try {
      await crmApiFetch(activitiesApiUrl(), {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'company',
          entity_id: company?.id,
          activity_type: 'note',
          body: `Saved from Lead Map. Keyword: ${lead.keyword || ''}`,
          outcome: null,
        }),
      });
    } catch (_) {}

    addActivity(`Saved company: ${lead.name || 'Unknown'}`);
    alert('Saved to Companies.');
  } catch (err) {
    console.error(err);
    alert('Failed to save company. Make sure Neon + Netlify env vars are set.\n\n' + (err?.message || err));
  }
}

async function syncCompanyStatusFromLead(lead) {
  // If this lead has been saved to Companies (Neon), keep the DB status in sync
  if (!lead || !lead.company_id) return;
  await crmApiFetch(`${companiesApiUrl()}?id=${encodeURIComponent(String(lead.company_id))}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: lead.status || 'unknown' }),
  });
}

function exportLeadsCsv() {
  const rows = leads.map((l) => ({
    Name: l.name || '',
    Address: l.address || '',
    Phone: l.phone || '',
    Website: l.website || '',
    Rating: l.rating || '',
    Reviews: l.user_ratings_total || 0,
    Status: l.status || 'new',
    Keyword: l.keyword || '',
    Lat: l.lat || '',
    Lng: l.lng || '',
  }));
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function importLeadsCsv(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const added = [];
      results.data.forEach((row) => {
        const raw = {
          id: row['ID'] || row['Place ID'] || row['place_id'] || row['id'] || '',
          place_id: row['Place ID'] || row['place_id'] || row['id'] || '',
          name: row['Name'] || row['name'] || '',
          address: row['Address'] || row['address'] || '',
          phone: row['Phone'] || row['phone'] || '',
          website: row['Website'] || row['website'] || '',
          rating: row['Rating'] ? Number(row['Rating']) : null,
          user_ratings_total: row['Reviews'] ? Number(row['Reviews']) : 0,
          lat: row['Lat'] ? Number(row['Lat']) : null,
          lng: row['Lng'] ? Number(row['Lng']) : null,
          status: row['Status'] || row['status'] || 'new',
          keyword: row['Keyword'] || row['keyword'] || '',
        };
        const l = normalizeLead(raw, raw.keyword);
        leads.push(l);
        added.push(l.name);
      });
      saveLeads();
      renderLeadsTable();
      renderLeadMarkers();
      updateLeadMetrics();
      addActivity(`Imported ${added.length} leads`);
      alert(`Imported ${added.length} leads.`);
    },
    error: function (err) {
      console.error(err);
      alert('Import failed: ' + err.message);
    },
  });
}

// Hook Lead Map init into navigation
window.onPageChange = function (page) {
  if (page === 'leads') {
    // Delay to ensure the section is visible and has dimensions
    setTimeout(ensureLeadMap, 30);
  }
};

