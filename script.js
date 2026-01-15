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
function init() {
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
  document.getElementById('generateLeadsButton').addEventListener('click', () => {
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
}

// Run init when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);