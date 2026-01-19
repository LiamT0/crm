/* ForgeOS Client Portal (Netlify)
   - Auth via Netlify Identity
   - Shows: Dashboard, Projects, Webinars, Billing, Settings, Messages
   - Data: projects pulled from Neon through Netlify Functions
*/

const LOGIN_PATH = 'login.html';

function escapeHtml(input = '') {
  return String(input).replace(/[&<>"'`=\/]/g, (s) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#x60;',
    '=': '&#x3D;',
    '/': '&#x2F;',
  }[s]));
}

function identityReady() {
  return new Promise((resolve) => {
    if (!window.netlifyIdentity) return resolve(null);
    window.netlifyIdentity.on('init', (user) => resolve(user || null));
    window.netlifyIdentity.init();
  });
}

async function requireClientAuth() {
  const user = await identityReady();
  if (!user) {
    if (location.pathname.endsWith('/' + LOGIN_PATH) || location.pathname.endsWith(LOGIN_PATH)) return null;
    location.href = LOGIN_PATH;
    return null;
  }

  // Logout button
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn && !logoutBtn.__wired) {
    logoutBtn.__wired = true;
    logoutBtn.addEventListener('click', () => window.netlifyIdentity.logout());
  }

  window.netlifyIdentity.on('logout', () => {
    location.href = LOGIN_PATH;
  });

  return user;
}

async function authHeader() {
  const user = window.netlifyIdentity?.currentUser();
  if (!user) return {};
  const token = await user.jwt();
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(path) {
  const headers = await authHeader();
  const res = await fetch(path, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, await authHeader());
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

function setupNav() {
  document.querySelectorAll('.sidebar nav li[data-page]').forEach((item) => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      document.querySelectorAll('.sidebar nav li').forEach((li) => li.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach((section) => section.classList.remove('visible'));
      document.getElementById(page).classList.add('visible');

      if (page === 'projects') loadProjects();
      if (page === 'settings') loadProfile();
    });
  });
}

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderWebinars(webinars) {
  const list = document.getElementById('webinarList');
  if (!list) return;
  list.innerHTML = '';
  (webinars || []).forEach((w) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(w.title)}</div>
      <div class="helper" style="margin-top:4px;">${escapeHtml(w.date)} • ${escapeHtml(w.time)} • ${escapeHtml(w.format)}</div>
      <div style="margin-top:8px;">${escapeHtml(w.description || '')}</div>
      ${w.link ? `<div style="margin-top:10px;"><a class="btn primary" href="${w.link}" target="_blank" rel="noopener">Register</a></div>` : ''}
    `;
    list.appendChild(li);
  });
}

let cachedProjects = [];

async function loadProjects() {
  try {
    const data = await apiGet('/.netlify/functions/projects');
    cachedProjects = Array.isArray(data.projects) ? data.projects : [];
    renderProjects(cachedProjects);
    updateDashboardFromProjects(cachedProjects);
  } catch (e) {
    console.error(e);
    const list = document.getElementById('projectList');
    if (list) list.innerHTML = `<div class="card"><p class="muted">Couldn't load projects yet. Ask ForgeOS to attach your login email to your company record.</p></div>`;
  }
}

function renderProjects(projects) {
  const list = document.getElementById('projectList');
  if (!list) return;
  list.innerHTML = '';

  if (!projects.length) {
    list.innerHTML = `<div class="card"><p class="muted">No projects yet. When your first project starts, it will show up here.</p></div>`;
    return;
  }

  projects.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card project-card';
    const pct = Math.max(0, Math.min(100, Number(p.percent_complete || 0)));

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div>
          <div style="font-weight:600; font-size:16px;">${escapeHtml(p.name || 'Project')}</div>
          <div class="helper" style="margin-top:4px;">Status: <b>${escapeHtml(p.status || 'In Progress')}</b></div>
        </div>
        <div class="badge">${pct}%</div>
      </div>
      <div class="project-progress" style="margin-top:12px;"><span style="width:${pct}%"></span></div>
      <div class="helper" style="margin-top:10px;">${escapeHtml(p.last_update || '')}</div>
    `;

    card.addEventListener('click', () => openProjectModal(p));
    list.appendChild(card);
  });
}

function openProjectModal(project) {
  const modal = document.getElementById('projectModal');
  const title = document.getElementById('projectModalTitle');
  const body = document.getElementById('projectModalBody');
  if (!modal || !title || !body) return;

  title.textContent = project.name || 'Project';
  const pct = Math.max(0, Math.min(100, Number(project.percent_complete || 0)));

  body.innerHTML = `
    <div class="helper">Status: <b>${escapeHtml(project.status || 'In Progress')}</b> • Progress: <b>${pct}%</b></div>
    <div style="margin-top:12px;" class="project-progress"><span style="width:${pct}%"></span></div>
    <div style="margin-top:14px;">
      <div style="font-weight:600;">Latest Update</div>
      <div class="helper" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(project.last_update || '—')}</div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeProjectModal() {
  document.getElementById('projectModal')?.classList.add('hidden');
}

function updateDashboardFromProjects(projects) {
  const total = projects.length;
  const active = projects.filter((p) => (p.status || '').toLowerCase() !== 'complete').length;
  const avgPct = total ? Math.round(projects.reduce((a, p) => a + Math.max(0, Math.min(100, Number(p.percent_complete || 0))), 0) / total) : 0;
  setStat('projectsTotal', String(total));
  setStat('projectsActive', String(active));
  setStat('avgProgress', `${avgPct}%`);
}

async function loadProfile() {
  try {
    const data = await apiGet('/.netlify/functions/client_me');
    const c = data.company || {};
    document.getElementById('companyName') && (document.getElementById('companyName').textContent = c.name || 'Your Company');
    document.getElementById('profileCompany') && (document.getElementById('profileCompany').value = c.name || '');
    document.getElementById('profileBillingEmail') && (document.getElementById('profileBillingEmail').value = c.billing_email || '');
    document.getElementById('profilePhone') && (document.getElementById('profilePhone').value = c.phone || '');
  } catch (e) {
    console.error(e);
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const payload = {
    billing_email: document.getElementById('profileBillingEmail')?.value || '',
    phone: document.getElementById('profilePhone')?.value || '',
  };
  try {
    await apiPost('/.netlify/functions/client_update_profile', payload);
    alert('Saved.');
  } catch (e) {
    console.error(e);
    alert('Save failed: ' + (e.message || e));
  }
}

function renderMessages() {
  // MVP placeholder: this becomes a real thread later (Intercom-like)
  const box = document.getElementById('messagesBox');
  if (!box) return;
  box.innerHTML = `
    <div class="card">
      <p style="font-weight:600; margin-bottom:6px;">Messaging is coming next.</p>
      <p class="muted">For now, email your ForgeOS contact or reply to our project updates. Next version will include a secure in-portal thread per project.</p>
    </div>
  `;
}

function initBilling() {
  const btn = document.getElementById('btnBilling');
  if (!btn) return;
  btn.addEventListener('click', () => {
    alert('Stripe billing setup will be wired here. (Next step: Stripe Customer Portal URL + webhook sync)');
  });
}

async function init() {
  await requireClientAuth();
  setupNav();

  document.getElementById('closeProjectModal')?.addEventListener('click', closeProjectModal);
  document.getElementById('profileForm')?.addEventListener('submit', saveProfile);

  // Seed webinars (local placeholder)
  renderWebinars([
    {
      title: 'AI in the Trades: 3 Quick Wins (Free)',
      date: 'Weekly',
      time: 'TBD',
      format: 'Live Webinar',
      description: 'Learn how we automate quoting, invoice intake, and scheduling with real examples.',
      link: '#'
    }
  ]);

  initBilling();
  renderMessages();

  // Load initial dashboard data
  await loadProjects();
}

document.addEventListener('DOMContentLoaded', init);
