// ============================================================
// Dashboard — integrated with the Spring Boot backend (port 8091)
//
//   GET    /api/dashboard/summary                  KPIs, charts, recent rows, top partners
//   GET    /api/quotations?page&size&sort          Recent Quotations (server-side paging/sorting)
//   GET    /api/quotations/{id}                    full quotation (Duplicate)
//   PATCH  /api/quotations/{id}/status             Edit modal -> status
//   POST   /api/quotations                         Duplicate
//   GET    /api/notifications/...                  bell dropdown
//
// Every response is wrapped as ApiResponse { success, message, data }.
// Session.authFetch (session.js) prepends window.API_BASE and adds the Bearer token.
// ============================================================

// ---------------- helpers ----------------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-animate bg-gray-800 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

async function apiCall(path, options) {
  if (!window.Session || typeof Session.authFetch !== 'function') {
    throw new Error('Session.authFetch is not available (is session.js loaded?)');
  }
  const res = await Session.authFetch(path, options);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  // FIX: tolerate 204 No Content (e.g. DELETE) — no body means success
  if (res.status === 204) return null;
  if (!res.ok || !body || body.success === false) {
    const fieldMsg = body && Array.isArray(body.errors) && body.errors.length
      ? body.errors.map((e) => e.message).join(', ') : '';
    const err = new Error((body && body.message) || fieldMsg || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body.data;
}

function can(code) {
  try {
    if (window.Session && typeof Session.can === 'function') return !!Session.can(code);
    if (window.Session && typeof Session.hasPermission === 'function') return !!Session.hasPermission(code);
    const raw = sessionStorage.getItem('sqms_session');
    const perms = raw ? JSON.parse(raw).permissions : null;
    if (Array.isArray(perms)) return perms.includes(code);
  } catch (_) {}
  return true;
}

// ============================================================
// Sidebar
// ============================================================
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const toggleIcon = document.getElementById('toggleIcon');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

const drawerMQ = window.matchMedia('(max-width: 1023px)');
const isDrawerViewport = () => drawerMQ.matches;
const OPEN_BY_DEFAULT_ON_DRAWER = true;
const defaultSidebarState = () => (isDrawerViewport() ? OPEN_BY_DEFAULT_ON_DRAWER : true);
let sidebarExpanded = defaultSidebarState();

function setSidebarExpanded(next) {
  sidebarExpanded = next;
  sidebar.classList.toggle('expanded', next);
  sidebar.classList.toggle('collapsed', !next);
  toggleIcon.style.transform = next ? 'rotate(180deg)' : 'rotate(0deg)';
  const showBackdrop = next && isDrawerViewport();
  sidebarBackdrop?.classList.toggle('visible', showBackdrop);
  sidebarBackdrop?.classList.toggle('hidden', !showBackdrop);
}
setSidebarExpanded(sidebarExpanded);
sidebarToggle.addEventListener('click', () => setSidebarExpanded(!sidebarExpanded));
sidebarBackdrop?.addEventListener('click', () => setSidebarExpanded(false));
drawerMQ.addEventListener('change', () => setSidebarExpanded(defaultSidebarState()));

document.getElementById('sidebarNav')?.addEventListener('click', (e) => {
  if (e.target.closest('.nav-item') && isDrawerViewport()) setSidebarExpanded(false);
});

// ============================================================
// Logout
// ============================================================
function logoutUser() {
  try {
    if (window.Session && typeof Session.logout === 'function') Session.logout();
    else { sessionStorage.removeItem('sqms_session'); window.location.href = '/index.html'; }
  } catch (_) { window.location.href = '/index.html'; }
}

// ============================================================
// Formatting
// ============================================================
const STATUS_LABEL = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' };
const statusLabel = (s) => STATUS_LABEL[String(s || '').toUpperCase()] || s || '—';
const statusKey = (s) => String(s || '').toLowerCase();

function formatINR(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function formatCompactINR(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  n = Number(n);
  const abs = Math.abs(n);
  if (abs >= 1e7) return '₹' + (n / 1e7).toFixed(1) + 'Cr';
  if (abs >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L';
  if (abs >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}
function formatSize(kw) {
  if (kw === null || kw === undefined || isNaN(Number(kw))) return '—';
  return Number(kw) + ' kW';
}
function parseIsoDate(iso) {
  if (!iso) return null;
  // FIX: accept both "YYYY-MM-DD" (LocalDate) and full ISO-8601 datetime
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}
function formatDate(iso) {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
}
function formatDateLong(iso) {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// ============================================================
// Greeting + avatar
// ============================================================
function decodeJwtPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (_) { return null; }
}
function getLoggedInUserName() {
  const sources = [];
  try {
    if (window.Session) {
      if (typeof Session.getUser === 'function') sources.push(Session.getUser());
      if (typeof Session.getSession === 'function') sources.push(Session.getSession());
      if (Session.user) sources.push(Session.user);
    }
  } catch (_) {}
  try { const raw = sessionStorage.getItem('sqms_session'); if (raw) sources.push(JSON.parse(raw)); } catch (_) {}
  for (const s of sources.filter(Boolean)) {
    const u = s.user || s.data?.user || s.data || s;
    const name = u.fullName || u.name || u.userName || u.username ||
      [u.firstName, u.lastName].filter(Boolean).join(' ') ||
      (u.email ? u.email.split('@')[0] : '');
    if (name) return String(name).trim();
    const token = s.token || s.accessToken || u.token;
    const claims = token ? decodeJwtPayload(token) : null;
    const fromJwt = claims && (claims.name || claims.fullName || claims.username || claims.sub);
    if (fromJwt) return String(fromJwt).trim();
  }
  return 'User';
}
(function renderUserName() {
  const name = getLoggedInUserName();
  setText('greetingName', name);
  setText('profileInitial', name.charAt(0).toUpperCase());
})();

// ============================================================
// Role visibility
// ============================================================
function applyRoleBasedVisibility() {
  const userRole = window.currentUserRole;
  document.querySelectorAll('[data-role]').forEach((el) => {
    const roles = el.getAttribute('data-role').split(',').map((r) => r.trim());
    el.style.display = roles.includes(userRole) ? '' : 'none';
  });
}
applyRoleBasedVisibility();
const isSuperAdmin = () => window.currentUserRole === 'SUPER_ADMIN';

// ============================================================
// Charts
// ============================================================
Chart.defaults.font.family = "'Poppins', sans-serif";
Chart.defaults.font.size = 11;

const paletteBerry = '#810B38';
const paletteMaroon = '#541A1A';
const paletteTan = '#DCC3AA';

const chartTooltipOpts = {
  backgroundColor: '#fff', titleColor: '#1F2937', bodyColor: '#6B7280',
  borderColor: '#D3B999', borderWidth: 1, padding: 10, cornerRadius: 10,
  displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
};

window.statusPieChart = new Chart(document.getElementById('chartStatusDistribution'), {
  type: 'doughnut',
  data: {
    labels: ['Pending', 'Accepted', 'Rejected'],
    datasets: [{ data: [0, 0, 0], backgroundColor: [paletteTan, paletteBerry, paletteMaroon],
      borderColor: '#F1E2D1', borderWidth: 3, hoverOffset: 6 }],
  },
  options: {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#6B7280', boxWidth: 8, boxHeight: 8, padding: 8, font: { size: 10 }, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: chartTooltipOpts,
    },
  },
});

window.sizeBarChart = new Chart(document.getElementById('chartSizeDistribution'), {
  type: 'bar',
  data: {
    labels: ['Small (≤5 kW)', 'Medium (6–20 kW)', 'Large (>20 kW)'],
    datasets: [{ label: 'Quotations', data: [0, 0, 0],
      backgroundColor: [paletteBerry, paletteTan, paletteMaroon], borderRadius: 8, maxBarThickness: 46 }],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: chartTooltipOpts },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6B7280' } },
      y: { beginAtZero: true, ticks: { color: '#6B7280', precision: 0 }, grid: { color: '#D3B999' } },
    },
  },
});

// ============================================================
// Dashboard summary
// ============================================================
const dashError = document.getElementById('dashError');

async function loadDashboardData() {
  try {
    const data = await apiCall('/api/dashboard/summary');
    dashError.classList.add('hidden');
    renderDashboardSummary(data);
  } catch (err) {
    console.warn('loadDashboardData() failed:', err.message);
    setText('dashErrorMsg', err.status === 403
      ? 'You do not have permission to view dashboard data.'
      : `Couldn't load dashboard data: ${err.message}`);
    dashError.classList.remove('hidden');
  }
}
document.getElementById('dashRetryBtn')?.addEventListener('click', () => { loadDashboardData(); loadQuotations(); });

function renderDashboardSummary(d) {
  const total = d.totalQuotations ?? 0;

  setText('kpiTotalQuotations', total.toLocaleString('en-IN'));
  setText('kpiTotalValue', formatCompactINR(d.totalQuotationValue));
  setText('kpiTotalValue2', formatCompactINR(d.totalQuotationValue));
  setText('kpiAcceptedInline', `${(d.acceptedQuotations ?? 0).toLocaleString('en-IN')} quotations`);

  setText('kpiMonthQuotations', (d.monthQuotations ?? 0).toLocaleString('en-IN'));
  setText('kpiMonthLabel', new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));
  const monthPct = total > 0 ? Math.min(100, Math.round((d.monthQuotations ?? 0) * 100 / total)) : 0;
  const bar = document.getElementById('kpiMonthBar');
  if (bar) bar.style.width = monthPct + '%';

  setText('kpiTodayQuotations', d.todayQuotations ?? 0);
  setText('kpiAccepted', d.acceptedQuotations ?? 0);
  setText('kpiRejected', d.rejectedQuotations ?? 0);
  setText('kpiPending', d.pendingQuotations ?? 0);

  setText('kpiPendingApprovals', d.pendingApprovals ?? '—');
  setText('kpiPendingApprovalsLabel', isSuperAdmin() ? 'Pending Approvals (All Partners)' : 'Pending Approvals');

  setText('kpiWinRate', `${d.winRatePercent ?? 0}% accepted`);
  setText('kpiWinRateSub', `${d.acceptedQuotations ?? 0} of ${total} quotations`);

  window.statusPieChart.data.datasets[0].data = [d.pendingQuotations ?? 0, d.acceptedQuotations ?? 0, d.rejectedQuotations ?? 0];
  window.statusPieChart.update();
  window.sizeBarChart.data.datasets[0].data = [d.smallSystems ?? 0, d.mediumSystems ?? 0, d.largeSystems ?? 0];
  window.sizeBarChart.update();

  if (isSuperAdmin()) {
    setText('kpiTotalPartners', d.totalPartners ?? '—');
    setText('kpiActivePartnersSuffix', d.activePartners != null ? `(${d.activePartners} active)` : '');
    setText('kpiPlatformRevenue', formatCompactINR(d.totalQuotationValue));
    setText('kpiReferralPayoutsPending', formatCompactINR(d.platformPendingReferralPayouts));
    renderTopPartners(d.topPartners || []);
  }

  if (window.currentUserRole === 'CHANNEL_PARTNER_ADMIN' || window.currentUserRole === 'CHANNEL_PARTNER_SALES') {
    setText('kpiMyCustomers', d.totalCustomers ?? '—');
    setText('kpiMyQuotations', d.totalQuotations ?? '—');
    setText('kpiMyRevenueMonth', formatCompactINR(d.monthQuotationValue));
    setText('kpiMyReferralIncome', formatCompactINR(d.totalReferralIncome));
  }

  renderRecentQuotations(d.recentQuotations || []);
  applyRoleBasedVisibility();
}

function renderTopPartners(list) {
  const tbody = document.getElementById('topPartnersTbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr class="state-row"><td colspan="4" class="text-center text-gray-400 py-3">No partner data yet</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((p, i) => `
    <tr class="state-row">
      <td data-label="Rank">#${i + 1}</td>
      <td data-label="Partner Name" class="font-medium">${esc(p.partnerName)} <span class="text-gray-400">(${esc(p.partnerCode)})</span></td>
      <td data-label="Total Quotations">${esc(p.totalQuotations)}</td>
      <td data-label="Total Revenue">${formatCompactINR(p.totalRevenue)}</td>
    </tr>`).join('');
}

// ============================================================
// Right-panel recent list
// ============================================================
const statusInitial = { PENDING: 'P', ACCEPTED: 'A', REJECTED: 'R' };
const statusBadgeBg = { PENDING: 'bg-amber-100 text-amber-600', ACCEPTED: 'bg-emerald-100 text-emerald-600', REJECTED: 'bg-rose-100 text-rose-500' };

function renderRecentQuotations(rows) {
  const list = document.getElementById('recentQuotationsList');
  if (!list) return;
  if (!rows.length) {
    list.innerHTML = '<p class="text-[11px] text-gray-400">No quotations yet</p>';
    return;
  }
  list.innerHTML = rows.slice(0, 6).map((q) => {
    const st = String(q.status || '').toUpperCase();
    return `
      <div class="quote-row">
        <div class="w-9 h-9 rounded-full ${statusBadgeBg[st] || ''} flex items-center justify-center text-xs font-bold">${statusInitial[st] || '?'}</div>
        <div class="quote-info">
          <p>${esc(q.code)} · ${esc(q.customerName)}</p>
          <p>${formatSize(q.systemSizeKw)} · ${formatDate(q.quoteDate)}</p>
        </div>
        <span class="quote-pill ${statusKey(st)}">${esc(statusLabel(st))}</span>
      </div>`;
  }).join('');
}

// ============================================================
// Recent Quotations table (server-side)
// ============================================================
const tableStatusPillClass = { PENDING: 'pill-pending', ACCEPTED: 'pill-accepted', REJECTED: 'pill-rejected' };
const SORT_FIELD = { no: 'code', size: 'systemSizeKw', amount: 'totalAmount', status: 'status', date: 'quoteDate', customer: null, channelPartner: null };

let sortKey = 'date', sortDir = 'desc';
let currentPage = 1, rowsPerPage = 10, totalRows = 0, totalPages = 1;
let pageRows = [], tableLoading = false, tableError = '', tableSeq = 0;

const qTbody = document.getElementById('quotationsTbody');
const paginationControls = document.getElementById('paginationControls');
const rowsRangeLabel = document.getElementById('rowsRangeLabel');
const rowsPerPageSelect = document.getElementById('rowsPerPage');

const ICONS = {
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 12 15 15"></polyline></svg>',
  duplicate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
};

function mapListItem(q) {
  // FIX: tolerate both `customer: {name}` and flattened `customerName`
  return {
    id: q.id,
    no: q.code,
    customer: q.customer?.name || q.customerName || '—',
    channelPartner: q.partner?.code || q.partnerCode || '—',
    size: q.systemSizeKw,
    amount: q.totalAmount,
    status: String(q.status || '').toUpperCase(),
    date: q.quoteDate,
  };
}

function actionIconsHtml(id) {
  const editBtn = can('QUOTATION:EDIT')
    ? `<button class="action-icon-btn icon-edit" data-action="edit" data-id="${id}" title="Edit status">${ICONS.edit}</button>` : '';
  const dupBtn = can('QUOTATION:CREATE')
    ? `<button class="action-icon-btn icon-duplicate" data-action="duplicate" data-id="${id}" title="Duplicate">${ICONS.duplicate}</button>` : '';
  return `
    <div class="row-actions">
      <button class="action-icon-btn icon-view" data-action="view" data-id="${id}" title="View">${ICONS.view}</button>
      ${editBtn}
      <button class="action-icon-btn icon-print" data-action="print" data-id="${id}" title="Print">${ICONS.print}</button>
      <button class="action-icon-btn icon-pdf" data-action="pdf" data-id="${id}" title="Download PDF">${ICONS.pdf}</button>
      ${dupBtn}
    </div>`;
}

function visibleRows() {
  const rows = [...pageRows];
  if (SORT_FIELD[sortKey] === null) {
    const k = sortKey === 'customer' ? 'customer' : 'channelPartner';
    rows.sort((a, b) => String(a[k]).toLowerCase().localeCompare(String(b[k]).toLowerCase()) * (sortDir === 'asc' ? 1 : -1));
  }
  return rows;
}

function colCount() { return isSuperAdmin() ? 8 : 7; }

function renderTable() {
  if (tableLoading && !pageRows.length) {
    qTbody.innerHTML = `<tr class="state-row"><td colspan="${colCount()}" class="text-center text-gray-400 py-4">Loading…</td></tr>`;
  } else if (tableError && !pageRows.length) {
    qTbody.innerHTML = `<tr class="state-row"><td colspan="${colCount()}" class="text-center text-rose-500 py-4">${esc(tableError)} <button type="button" class="underline font-semibold" data-retry>Try again</button></td></tr>`;
  } else if (!pageRows.length) {
    qTbody.innerHTML = `<tr class="state-row"><td colspan="${colCount()}" class="text-center text-gray-400 py-4">No quotations yet</td></tr>`;
  } else {
    qTbody.innerHTML = visibleRows().map((q) => `
      <tr data-id="${q.id}">
        <td data-label="Quotation No." class="font-medium">${esc(q.no)}</td>
        <td data-label="Customer">${esc(q.customer)}</td>
        ${isSuperAdmin() ? `<td data-label="Channel Partner">${esc(q.channelPartner)}</td>` : ''}
        <td data-label="System Size">${formatSize(q.size)}</td>
        <td data-label="Amount">${formatINR(q.amount)}</td>
        <td data-label="Status"><span class="pill ${tableStatusPillClass[q.status] || ''}">${esc(statusLabel(q.status))}</span></td>
        <td data-label="Date">${formatDate(q.date)}</td>
        <td data-label="Actions">${actionIconsHtml(q.id)}</td>
      </tr>`).join('');
  }

  const start = (currentPage - 1) * rowsPerPage;
  rowsRangeLabel.textContent = totalRows === 0
    ? 'No records'
    : `${start + 1}–${Math.min(start + pageRows.length, totalRows)} of ${totalRows}`;

  renderPagination();
  updateSortIcons();

  document.querySelectorAll('#quotationsTable thead th[data-key="channelPartner"]').forEach((th) => {
    th.style.display = isSuperAdmin() ? '' : 'none';
  });
}

async function loadQuotations() {
  const mySeq = ++tableSeq;
  tableLoading = true;
  tableError = '';
  renderTable();

  const field = SORT_FIELD[sortKey];
  const qs = new URLSearchParams({
    page: String(currentPage - 1),
    size: String(rowsPerPage),
    sort: `${field || 'quoteDate'},${field ? sortDir : 'desc'}`,
  });

  try {
    const data = await apiCall('/api/quotations?' + qs.toString());
    if (mySeq !== tableSeq) return;
    // FIX: accept both Spring `Page` envelope and a plain array
    const items = Array.isArray(data) ? data : (data.content || []);
    pageRows = items.map(mapListItem);
    totalRows = Array.isArray(data) ? items.length : (data.totalElements ?? items.length);
    totalPages = Array.isArray(data) ? 1 : Math.max(1, data.totalPages ?? 1);
    if (currentPage > totalPages) { currentPage = totalPages; return loadQuotations(); }
  } catch (err) {
    if (mySeq !== tableSeq) return;
    console.warn('loadQuotations() failed:', err.message);
    pageRows = []; totalRows = 0;
    tableError = err.status === 403 ? 'You do not have permission to view quotations.' : `Couldn't load quotations: ${err.message}`;
  } finally {
    if (mySeq === tableSeq) { tableLoading = false; renderTable(); }
  }
}

function renderPagination() {
  let html = '';
  html += `<span class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="prev">‹</span>`;
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
      if (p === 2 || p === totalPages - 1) html += '<span class="pagination-btn disabled">…</span>';
      continue;
    }
    html += `<span class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</span>`;
  }
  html += `<span class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="next">›</span>`;
  paginationControls.innerHTML = html;
}

paginationControls.addEventListener('click', (e) => {
  const btn = e.target.closest('.pagination-btn[data-page]');
  if (!btn || btn.classList.contains('disabled')) return;
  const p = btn.getAttribute('data-page');
  if (p === 'prev') currentPage = Math.max(1, currentPage - 1);
  else if (p === 'next') currentPage = Math.min(totalPages, currentPage + 1);
  else currentPage = parseInt(p, 10);
  loadQuotations();
});

function updateSortIcons() {
  document.querySelectorAll('#quotationsTable thead th[data-key]').forEach((th) => {
    const icon = th.querySelector('.sort-icon');
    const key = th.getAttribute('data-key');
    th.classList.toggle('sorted', key === sortKey);
    if (icon) icon.textContent = key === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '⇅';
  });
}

document.querySelectorAll('#quotationsTable thead th[data-key]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-key');
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    currentPage = 1;
    if (SORT_FIELD[key] === null) { updateSortIcons(); renderTable(); loadQuotations(); }
    else loadQuotations();
  });
});

rowsPerPageSelect?.addEventListener('change', () => {
  rowsPerPage = parseInt(rowsPerPageSelect.value, 10);
  currentPage = 1;
  loadQuotations();
});

// ============================================================
// Row actions
// ============================================================
const quoteModal = document.getElementById('quoteModal');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const quoteForm = document.getElementById('quoteForm');

const fldNo = document.getElementById('fldNo');
const fldCustomer = document.getElementById('fldCustomer');
const fldSize = document.getElementById('fldSize');
const fldAmount = document.getElementById('fldAmount');
const fldStatus = document.getElementById('fldStatus');
const fldDate = document.getElementById('fldDate');

let modalQuoteId = null;
const findRow = (id) => pageRows.find((q) => String(q.id) === String(id));

function openModal(id, mode) {
  const q = findRow(id);
  if (!q) return;
  modalQuoteId = q.id;
  fldNo.value = q.no;
  fldCustomer.value = q.customer;
  fldSize.value = formatSize(q.size);
  fldAmount.value = formatINR(q.amount);
  fldStatus.value = q.status;
  fldDate.value = (q.date || '').slice(0, 10);
  quoteForm.querySelectorAll('.field-input').forEach((el) => { el.disabled = true; });

  if (mode === 'view') {
    modalTitle.textContent = 'Quotation Details';
    modalSubtitle.textContent = `${q.no} · Read-only`;
    modalSaveBtn.classList.add('hidden');
    modalCancelBtn.textContent = 'Close';
  } else {
    fldStatus.disabled = false;
    modalTitle.textContent = 'Update Status';
    modalSubtitle.textContent = `${q.no} · Only the status can be changed here`;
    modalSaveBtn.classList.remove('hidden');
    modalSaveBtn.disabled = false;
    modalCancelBtn.textContent = 'Cancel';
  }
  quoteModal.classList.remove('hidden');
}
function closeModal() { quoteModal.classList.add('hidden'); modalQuoteId = null; }

modalCloseBtn?.addEventListener('click', closeModal);
modalCancelBtn?.addEventListener('click', closeModal);
quoteModal?.addEventListener('click', (e) => { if (e.target === quoteModal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !quoteModal.classList.contains('hidden')) closeModal(); });

modalSaveBtn?.addEventListener('click', async () => {
  const q = findRow(modalQuoteId);
  if (!q) return;
  if (fldStatus.value === q.status) { closeModal(); return; }
  modalSaveBtn.disabled = true;
  try {
    await apiCall(`/api/quotations/${q.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: fldStatus.value }),
    });
    closeModal();
    showToast(`${q.no} is now ${statusLabel(fldStatus.value)}`);
    loadDashboardData();
    loadQuotations();
    Notifications.refresh();
  } catch (err) {
    modalSaveBtn.disabled = false;
    showToast(err.status === 403 ? 'You do not have permission to change the status' : err.message);
  }
});

/* Print */
function printQuotation(id) {
  const q = findRow(id);
  if (!q) return;
  setText('pNo', q.no);
  setText('pCustomer', q.customer);
  setText('pSize', formatSize(q.size));
  setText('pAmount', formatINR(q.amount));
  setText('pStatus', statusLabel(q.status));
  setText('pDate', formatDateLong(q.date));
  setText('pGenDate', new Date().toLocaleString('en-IN'));
  window.print();
}

/* PDF */
function downloadQuotationPdf(id) {
  const q = findRow(id);
  if (!q) return;
  if (!window.jspdf) { showToast('PDF library failed to load — check your connection'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(16); doc.setTextColor(129, 11, 56);
  doc.text('Solar Quotation Management', 40, 50);
  doc.setFontSize(11); doc.setTextColor(107, 114, 128);
  doc.text('Quotation Slip', 40, 68);
  doc.setDrawColor(129, 11, 56);
  doc.line(40, 78, 555, 78);
  const rows = [
    ['Quotation No.', q.no], ['Customer', q.customer], ['System Size', formatSize(q.size)],
    ['Amount', 'Rs. ' + Number(q.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })],
    ['Status', statusLabel(q.status)], ['Date', formatDateLong(q.date)],
  ];
  let y = 110;
  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setTextColor(107, 114, 128); doc.text(label, 40, y);
    doc.setTextColor(31, 41, 55); doc.text(String(value), 220, y);
    y += 26;
  });
  doc.setFontSize(9); doc.setTextColor(156, 163, 175);
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, 40, y + 20);
  doc.save(`${q.no}.pdf`);
  showToast(`Downloaded ${q.no}.pdf`);
}

/* Duplicate */
function toNum(v) { return v === null || v === undefined || v === '' ? undefined : Number(v); }
function buildCreateRequestFrom(d) {
  const req = {
    customerId: d.customer?.id ?? d.customerId,
    projectId: d.projectId ?? undefined,
    systemSizeKw: toNum(d.systemSizeKw),
    mounting: d.mounting || undefined,
    items: (d.items || []).map((it) => ({
      productId: it.productId ?? undefined, name: it.name, type: it.type || undefined,
      qty: toNum(it.qty), unit: it.unit, rate: toNum(it.rate),
    })),
    installationCost: toNum(d.installationCost),
    transportCost: toNum(d.transportCost),
    otherLabel: d.otherLabel || undefined,
    otherCost: toNum(d.otherCost),
    gstPercent: toNum(d.gstPercent) ?? 0,
    discountType: d.discountType || 'FLAT',
    discountValue: toNum(d.discountValue),
    tariff: toNum(d.tariff),
    escalationPercent: toNum(d.escalationPercent),
    advance: toNum(d.advance),
    terms: d.terms || undefined,
  };
  if (d.paymentTerms) {
    req.paymentTerms = {
      advance: toNum(d.paymentTerms.advance), material: toNum(d.paymentTerms.material),
      installation: toNum(d.paymentTerms.installation), balance: toNum(d.paymentTerms.balance),
    };
  }
  if (d.bank && (d.bank.accountNumber || d.bank.bankName)) {
    req.bank = {
      accountName: d.bank.accountName, bankName: d.bank.bankName, accountNumber: d.bank.accountNumber,
      ifsc: d.bank.ifsc, branch: d.bank.branch,
    };
  }
  return req;
}

async function duplicateQuotation(id, btn) {
  const q = findRow(id);
  if (!q) return;
  if (btn) btn.disabled = true;
  try {
    const full = await apiCall(`/api/quotations/${q.id}`);
    const created = await apiCall('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCreateRequestFrom(full)),
    });
    showToast(`Duplicated as ${created.code}`);
    sortKey = 'date'; sortDir = 'desc'; currentPage = 1;
    loadDashboardData(); loadQuotations(); Notifications.refresh();
  } catch (err) {
    showToast(err.status === 403 ? 'You do not have permission to create quotations' : `Duplicate failed: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* wire row actions */
qTbody?.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) { loadQuotations(); return; }
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const id = actionBtn.getAttribute('data-id');
    const action = actionBtn.getAttribute('data-action');
    if (action === 'view') openModal(id, 'view');
    else if (action === 'edit') openModal(id, 'edit');
    else if (action === 'print') printQuotation(id);
    else if (action === 'pdf') downloadQuotationPdf(id);
    else if (action === 'duplicate') duplicateQuotation(id, actionBtn);
    return;
  }
  const row = e.target.closest('tr[data-id]');
  if (row) openModal(row.getAttribute('data-id'), 'view');
});

// ============================================================
// New Quotation button
// ============================================================
const newQuotationBtn = document.getElementById('newQuotationBtn');
if (newQuotationBtn && !can('QUOTATION:CREATE')) newQuotationBtn.classList.add('hidden');
newQuotationBtn?.addEventListener('click', () => { window.location.href = '/Quotation/quotation.html'; });

// ============================================================
// Topbar dropdowns
// ============================================================
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');
const profileLogoutBtn = document.getElementById('profileLogoutBtn');

function closeAllTopbarDropdowns(except) {
  [notifDropdown, profileDropdown].forEach((dd) => { if (dd && dd !== except) dd.classList.add('hidden'); });
  notifBtn?.setAttribute('aria-expanded', String(!notifDropdown.classList.contains('hidden')));
}
notifBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = notifDropdown.classList.contains('hidden');
  closeAllTopbarDropdowns();
  notifDropdown.classList.toggle('hidden', !willOpen);
  notifBtn.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) Notifications.onOpen();
});
profileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = profileDropdown.classList.contains('hidden');
  closeAllTopbarDropdowns();
  profileDropdown.classList.toggle('hidden', !willOpen);
});
notifDropdown?.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => closeAllTopbarDropdowns());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !notifDropdown.classList.contains('hidden')) {
    closeAllTopbarDropdowns();
    notifBtn.focus();
  }
});

// ============================================================
// Notifications
// ============================================================
const Notifications = (() => {
  const BASE = '/api/notifications';
  const PAGE_SIZE = 10;
  const POLL_MS = 30000;
  const ENTITY_LINKS = {
    QUOTATION: '/Quotation/quotation.html',
    CUSTOMER: '/customer/customer.html',
    PROJECT: '/project/project.html',
  };

  const listEl    = document.getElementById('notifList');
  const badgeEl   = document.getElementById('notifBadge');
  const markAllEl = document.getElementById('notifMarkAllBtn');
  const moreEl    = document.getElementById('notifLoadMoreBtn');
  const tabEls    = document.querySelectorAll('#notifDropdown .notif-tab');

  const state = { items: [], page: 0, hasMore: false, unread: 0, unreadOnly: false, loading: false, error: false, loaded: false };

  const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${Math.max(m, 1)} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
    return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const call = (path, options) => apiCall(BASE + path, options);

  function renderBadge() {
    const n = state.unread;
    badgeEl.textContent = n > 99 ? '99+' : String(n);
    badgeEl.classList.toggle('hidden', n <= 0);
    notifBtn.setAttribute('aria-label', n > 0 ? `Notifications, ${n} unread` : 'Notifications');
    markAllEl.disabled = n <= 0;
  }

  function itemHtml(n) {
    const sev = String(n.severity || 'INFO').toLowerCase();
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" role="listitem" data-id="${n.id}">
        <span class="notif-dot sev-${esc(sev)}"></span>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title)}</div>
          ${n.message ? `<div class="notif-msg">${esc(n.message)}</div>` : ''}
          <span class="notif-time">${esc(timeAgo(n.createdAt))}</span>
        </div>
        <button type="button" class="notif-del" data-del="${n.id}" title="Remove" aria-label="Remove notification">${CLOSE_SVG}</button>
      </div>`;
  }

  function renderList() {
    if (state.loading && !state.items.length) {
      listEl.innerHTML = '<div class="notif-state">Loading…</div>';
    } else if (state.error && !state.items.length) {
      listEl.innerHTML = '<div class="notif-state">Couldn\'t load notifications.<br><button type="button" data-retry>Try again</button></div>';
    } else if (!state.items.length) {
      listEl.innerHTML = `<div class="notif-state">${state.unreadOnly ? 'You\'re all caught up 🎉' : 'No notifications yet'}</div>`;
    } else {
      listEl.innerHTML = state.items.map(itemHtml).join('');
    }
    moreEl.classList.toggle('hidden', !state.hasMore);
    moreEl.disabled = state.loading;
    moreEl.textContent = state.loading ? 'Loading…' : 'Load more';
  }

  async function fetchUnreadCount() {
    try {
      const data = await call('/unread-count');
      const prev = state.unread;
      state.unread = data?.unread ?? 0;
      renderBadge();
      if (state.unread > prev && !notifDropdown.classList.contains('hidden')) load(true);
    } catch (err) {
      console.warn('Notifications: unread-count failed:', err.message);
    }
  }

  let reqSeq = 0;
  async function load(reset) {
    if (state.loading && !reset) return;
    const mySeq = ++reqSeq;
    state.loading = true; state.error = false;
    if (reset) state.page = 0;
    renderList();

    const nextPage = reset ? 0 : state.page + 1;
    const qs = new URLSearchParams({ page: String(nextPage), size: String(PAGE_SIZE), unreadOnly: String(state.unreadOnly) });

    try {
      const data = await call('/list?' + qs.toString());
      if (mySeq !== reqSeq) return;
      // FIX: accept both Page envelope and plain list
      const incoming = Array.isArray(data) ? data : (data.content || []);
      if (reset) state.items = incoming;
      else {
        const seen = new Set(state.items.map((i) => i.id));
        state.items = state.items.concat(incoming.filter((i) => !seen.has(i.id)));
      }
      const page = Array.isArray(data) ? 0 : (data.page ?? nextPage);
      const totalPages = Array.isArray(data) ? 1 : (data.totalPages ?? 0);
      state.page = page;
      state.hasMore = page + 1 < totalPages;
      state.loaded = true;
    } catch (err) {
      if (mySeq !== reqSeq) return;
      console.warn('Notifications: list failed:', err.message);
      state.error = true;
      if (!reset) showToast('Couldn\'t load more notifications');
    } finally {
      if (mySeq === reqSeq) { state.loading = false; renderList(); }
    }
  }

  async function markRead(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item || item.read) return;
    item.read = true;
    state.unread = Math.max(0, state.unread - 1);
    renderBadge(); renderList();
    try {
      // FIX: backend route is /{id}/read (not /{id}/markRead/read)
      const data = await call(`/${id}/read`, { method: 'PATCH' });
      state.unread = data?.unread ?? state.unread;
      renderBadge();
    } catch (err) {
      item.read = false;
      fetchUnreadCount();
      renderList();
      showToast('Couldn\'t mark as read');
    }
  }

  async function markAllRead() {
    if (state.unread <= 0) return;
    markAllEl.disabled = true;
    try {
      // FIX: backend route is /read-all (not /markAllRead/read-all)
      const data = await call('/read-all', { method: 'PATCH' });
      state.unread = data?.unread ?? 0;
      state.items.forEach((i) => { i.read = true; });
      if (state.unreadOnly) { state.items = []; state.hasMore = false; }
      renderBadge(); renderList();
    } catch (err) {
      showToast('Couldn\'t mark all as read');
      renderBadge();
    }
  }

  async function remove(id) {
    const idx = state.items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const [removed] = state.items.splice(idx, 1);
    renderList();
    try {
      // FIX: backend route is /{id} with DELETE (not /delete/{id})
      const data = await call(`/${id}`, { method: 'DELETE' });
      state.unread = data?.unread ?? state.unread;
      renderBadge();
      if (state.items.length < PAGE_SIZE && state.hasMore) load(true);
    } catch (err) {
      state.items.splice(idx, 0, removed);
      renderList();
      showToast('Couldn\'t remove notification');
    }
  }

  function openItem(id) {
    const n = state.items.find((i) => i.id === id);
    if (!n) return;
    markRead(id);
    const link = ENTITY_LINKS[n.entityType];
    if (link) window.location.href = link;
  }

  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) { load(true); return; }
    const del = e.target.closest('[data-del]');
    if (del) { remove(Number(del.getAttribute('data-del'))); return; }
    const row = e.target.closest('.notif-item');
    if (row) openItem(Number(row.getAttribute('data-id')));
  });

  markAllEl.addEventListener('click', markAllRead);
  moreEl.addEventListener('click', () => load(false));

  tabEls.forEach((tab) => {
    tab.addEventListener('click', () => {
      const unreadOnly = tab.getAttribute('data-filter') === 'unread';
      if (unreadOnly === state.unreadOnly) return;
      state.unreadOnly = unreadOnly;
      tabEls.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      state.items = [];
      load(true);
    });
  });

  let timer = null;
  function startPolling() {
    stopPolling();
    timer = setInterval(() => { if (!document.hidden) fetchUnreadCount(); }, POLL_MS);
  }
  function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchUnreadCount(); });

  return {
    init() { renderBadge(); renderList(); fetchUnreadCount(); startPolling(); },
    onOpen() { load(true); fetchUnreadCount(); },
    refresh() { fetchUnreadCount(); if (!notifDropdown.classList.contains('hidden')) load(true); },
    destroy: stopPolling,
  };
})();

profileLogoutBtn?.addEventListener('click', () => {
  Notifications.destroy();
  logoutUser();
});

// ============================================================
// Init
// ============================================================
renderTable();
loadDashboardData();
loadQuotations();
Notifications.init();