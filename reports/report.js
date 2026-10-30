/* ============================================================
   Reports & Analytics — reports.js (backend-integrated)
   Endpoints used:
     GET /api/reports/summary
     GET /api/reports/quotations      ?from&to&status&salesUserId&partnerId&page&size&sort
     GET /api/reports/gst             (same filters)
     GET /api/reports/referral-income (same filters)
     GET /api/reports/top-performers  (same filters)
     GET /api/reports/export?type=QUOTATION&format=CSV|PDF|EXCEL&...
   All wrapped as ApiResponse { success, message, data }.
   ============================================================ */

// ---------------- shared helpers ----------------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showToast(message, icon = 'fa-circle-check', color = 'emerald') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-animate flex items-center gap-2 bg-cream border border-peach-300 shadow-lg rounded-xl px-4 py-2.5 text-xs font-medium text-gray-800';
  toast.innerHTML = `<i class="fas ${icon} text-${color}-600"></i> ${esc(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

/** Unwraps ApiResponse { success, data }. Throws Error on failure. */
async function apiJson(path, options) {
  if (!window.Session || typeof Session.authFetch !== 'function') {
    throw new Error('Session.authFetch unavailable (session.js missing?)');
  }
  const res = await Session.authFetch(path, options);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok || !body || body.success === false) {
    const fieldMsg = body?.errors?.map(e => e.message).join(', ') || '';
    const err = new Error(body?.message || fieldMsg || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body.data;
}

/** Download raw binary from the export endpoint. */
async function apiDownload(path, filename) {
  const res = await Session.authFetch(path);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

// ---------------- sidebar ----------------
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
  sidebar?.classList.toggle('expanded', next);
  sidebar?.classList.toggle('collapsed', !next);
  if (toggleIcon) toggleIcon.style.transform = next ? 'rotate(180deg)' : 'rotate(0deg)';
  const showBackdrop = next && isDrawerViewport();
  sidebarBackdrop?.classList.toggle('visible', showBackdrop);
  sidebarBackdrop?.classList.toggle('hidden', !showBackdrop);
}
setSidebarExpanded(sidebarExpanded);
sidebarToggle?.addEventListener('click', () => setSidebarExpanded(!sidebarExpanded));
sidebarBackdrop?.addEventListener('click', () => setSidebarExpanded(false));
drawerMQ.addEventListener('change', () => setSidebarExpanded(defaultSidebarState()));
document.getElementById('sidebarNav')?.addEventListener('click', (e) => {
  if (e.target.closest('.nav-item') && isDrawerViewport()) setSidebarExpanded(false);
});

// ---------------- user name / initial ----------------
function decodeJwtPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch(_) { return null; }
}
function getLoggedInUserName() {
  const sources = [];
  try {
    if (window.Session) {
      if (typeof Session.getUser === 'function') sources.push(Session.getUser());
      if (typeof Session.getSession === 'function') sources.push(Session.getSession());
      if (Session.user) sources.push(Session.user);
    }
  } catch(_) {}
  try { const raw = sessionStorage.getItem('sqms_session'); if (raw) sources.push(JSON.parse(raw)); } catch(_) {}
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
  const initial = document.getElementById('profileInitial');
  const label = document.getElementById('profileNameLabel');
  if (initial) initial.textContent = name.charAt(0).toUpperCase();
  if (label) label.textContent = name;
})();

// ---------------- dropdowns ----------------
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');

function closeAllDropdowns(except) {
  [notifDropdown, profileDropdown, exportMenu].forEach(dd => {
    if (dd && dd !== except) dd.classList.add('hidden');
  });
}
notifBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = notifDropdown.classList.contains('hidden');
  closeAllDropdowns();
  notifDropdown.classList.toggle('hidden', !willOpen);
});
profileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = profileDropdown.classList.contains('hidden');
  closeAllDropdowns();
  profileDropdown.classList.toggle('hidden', !willOpen);
});
exportBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = exportMenu.classList.contains('hidden');
  closeAllDropdowns();
  exportMenu.classList.toggle('hidden', !willOpen);
});
document.addEventListener('click', () => closeAllDropdowns());
document.getElementById('profileLogoutBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    if (window.Session && typeof Session.logout === 'function') Session.logout();
    else sessionStorage.removeItem('sqms_session');
  } catch(_) {}
  window.location.href = '../index.html';
});

// ============================================================
// FILTER STATE — single source of truth for every request
// ============================================================
const filters = { from: null, to: null, status: '', salesUserId: null, partnerId: null };

function readFilterInputs() {
  filters.from  = document.getElementById('fromDate')?.value || null;
  filters.to    = document.getElementById('toDate')?.value || null;
  const s       = document.getElementById('statusFilter')?.value || 'all';
  filters.status = s === 'all' ? '' : s.toUpperCase();
  // salesUserId / partnerId: current UI uses display-name <select>; keep null until
  // the selects are populated with ids. Drop-in point for later.
  const cp = document.getElementById('channelPartnerFilter');
  filters.partnerId = cp && cp.value !== 'all' ? cp.value : null;
}

/** Builds a URLSearchParams including only non-empty filters. */
function filterQuery(extra = {}) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set('from', filters.from);
  if (filters.to)   qs.set('to', filters.to);
  if (filters.status) qs.set('status', filters.status);
  if (filters.salesUserId != null) qs.set('salesUserId', String(filters.salesUserId));
  if (filters.partnerId != null)   qs.set('partnerId', String(filters.partnerId));
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  return qs;
}

// ============================================================
// FORMAT HELPERS
// ============================================================
const STATUS_META = {
  ACCEPTED: { label: 'Accepted', icon: 'fa-circle-check', css: 'accepted' },
  PENDING:  { label: 'Pending',  icon: 'fa-hourglass-half', css: 'pending'  },
  REJECTED: { label: 'Rejected', icon: 'fa-circle-xmark',   css: 'rejected' },
};
const statusMeta = (s) => STATUS_META[String(s || '').toUpperCase()] || { label: s || '—', icon: 'fa-circle', css: '' };

function formatAmount(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function formatCompactINR(n) {
  if (n == null || isNaN(Number(n))) return '—';
  n = Number(n); const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return '₹' + (n/1e5).toFixed(1) + ' L';
  if (a >= 1e3) return '₹' + (n/1e3).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}
function formatSize(kw) {
  if (kw == null || isNaN(Number(kw))) return '—';
  return Number(kw) + ' kW';
}
function parseIsoDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}
function formatDate(iso) {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
}

// ============================================================
// SUMMARY (KPI widgets + charts + top performers)
// ============================================================
async function loadSummary() {
  try {
    const data = await apiJson('/api/reports/summary?' + filterQuery().toString());
    renderSummary(data);
  } catch (err) {
    console.warn('loadSummary failed:', err.message);
    showToast(err.status === 403
      ? 'You do not have permission to view reports'
      : `Couldn't load KPIs: ${err.message}`, 'fa-triangle-exclamation', 'rose');
  }
}

function renderSummary(d) {
  if (!d) return;
  
  const totalQuotes = Number(d.totalQuotations) || 0;
  const totalVal = Number(d.totalValue) || 0;
  const acceptedCount = Number(d.accepted) || 0;
  const pendingCount = Number(d.pending) || 0;
  
  // Calculations for missing backend fields
  const avgDeal = totalQuotes > 0 ? (totalVal / totalQuotes) : 0;
  const acceptedVal = acceptedCount * avgDeal;
  const pendingVal = pendingCount * avgDeal;
  const convRate = totalQuotes > 0 ? ((acceptedCount / totalQuotes) * 100) : 0;

  // Update UI by ID
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  
  setTxt('kpiTotalQuotes', totalQuotes.toLocaleString('en-IN'));
  setTxt('kpiTotalValue', formatCompactINR(totalVal));
  setTxt('kpiAcceptedValue', formatCompactINR(acceptedVal));
  setTxt('kpiConversionRate', convRate.toFixed(1) + '%');
  setTxt('kpiAvgDeal', formatCompactINR(avgDeal));
  setTxt('kpiPendingValue', formatCompactINR(pendingVal));

  // Charts update
  window.__chartData = {
    trend: [], // Backend abhi trend data nahi de raha
    statusDistribution: { 
        accepted: acceptedCount, 
        pending: pendingCount, 
        rejected: Number(d.rejected) || 0
    },
    revenueBySystemSize: [] // Backend abhi ye bhi nahi de raha
  };
  
  if (window.__chartsReady) applyChartData();
}

// ============================================================
// TOP PERFORMERS
// ============================================================
async function loadTopPerformers() {
  const el = document.getElementById('topPerformers');
  if (!el) return;
  el.innerHTML = '<p class="text-[11px] text-gray-400">Loading…</p>';
  
  try {
    const page = await apiJson('/api/reports/top-performers?' +
  filterQuery({ page: 0, size: 5 }).toString()); 

    const rows = page.content || [];
    if (!rows.length) { el.innerHTML = '<p class="text-[11px] text-gray-400">No data for this period</p>'; return; }
    
    el.innerHTML = rows.map(p => `
      <div class="alert-row bg-peach-100/60">
        <span class="font-medium text-gray-800">${esc(p.name || '—')}</span>
        <span class="text-peach-600 font-semibold">${esc(p.accepted ?? 0)}/${esc(p.quotes ?? 0)} · ${esc(p.ratePercent ?? 0)}%</span>
      </div>`).join('');
  } catch (err) {
    console.warn('loadTopPerformers failed:', err.message);
    el.innerHTML = '<p class="text-[11px] text-rose-500">Couldn\'t load performers</p>';
  }
}

// ============================================================
// QUOTATION REPORT TABLE (server-paged)
// ============================================================
const tableState = {
  sortKey: 'quoteDate', sortDir: 'desc',
  page: 1, size: 10, totalPages: 1, totalElements: 0,
  rows: [], loading: false, error: '', seq: 0,
};
const SORT_FIELD_QUOTATION = {
  quoteNo: 'code', customer: 'customerName', systemSize: 'systemSizeKw',
  amount: 'totalAmount', salesPerson: 'salesPersonName', status: 'status', date: 'quoteDate',
};

function mapQuotationRow(q) {
  return {
    id: q.id || "",
    quoteNo: q.quoteNo || "",
    customer: q.customer || "—", // <-- Yahan 'customerName' nahi, 'customer' aayega backend se
    systemSize: q.systemSizeKw || 0,
    amount: q.amount || 0,
    salesPerson: q.salesPerson || "—",
    status: String(q.status || '').toUpperCase(),
    date: q.date,
  };
}

async function loadQuotations() {
  const mySeq = ++tableState.seq;
  tableState.loading = true;
  renderQuotationTable();

  const field = SORT_FIELD_QUOTATION[tableState.sortKey] || 'quoteDate';
  const sort = `${field},${tableState.sortDir}`;
  const qs = filterQuery({ page: tableState.page - 1, size: tableState.size, sort });

  try {
    const page = await apiJson('/api/reports/quotations?' + qs.toString());
    if (mySeq !== tableState.seq) return;
    tableState.rows = (page.content || []).map(mapQuotationRow);
    tableState.totalElements = page.totalElements ?? tableState.rows.length;
    tableState.totalPages = Math.max(1, page.totalPages ?? 1);
    tableState.error = '';
    if (tableState.page > tableState.totalPages) {
      tableState.page = tableState.totalPages;
      return loadQuotations();
    }
  } catch (err) {
    if (mySeq !== tableState.seq) return;
    tableState.rows = []; tableState.totalElements = 0;
    tableState.error = err.status === 403 ? 'You do not have permission to view reports.' : `Couldn't load reports: ${err.message}`;
  } finally {
    if (mySeq === tableState.seq) { tableState.loading = false; renderQuotationTable(); }
  }
}

function renderQuotationTable() {
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;

  if (tableState.loading && !tableState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-4">Loading…</td></tr>';
  } else if (tableState.error && !tableState.rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-rose-500 py-4">${esc(tableState.error)}</td></tr>`;
  } else if (!tableState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-4">No quotations in this period</td></tr>';
  } else {
    tbody.innerHTML = tableState.rows.map(row => {
      const meta = statusMeta(row.status);
      return `
      <tr class="cursor-pointer" data-quote="${esc(row.quoteNo)}" data-id="${row.id}">
        <td data-label="Quotation No." class="font-medium">${esc(row.quoteNo)}</td>
        <td data-label="Customer">${esc(row.customer)}</td>
        <td data-label="System Size">${formatSize(row.systemSize)}</td>
        <td data-label="Amount">${formatAmount(row.amount)}</td>
        <td data-label="Sales Person">${esc(row.salesPerson || '—')}</td>
        <td data-label="Status"><span class="status-pill ${meta.css}"><i class="fas ${meta.icon}"></i> ${meta.label}</span></td>
        <td data-label="Date">${formatDate(row.date)}</td>
        <td data-label="Actions">
          <div class="flex items-center gap-1 justify-end">
            <span class="row-action-btn" data-act="view" title="View"><i class="fas fa-eye"></i></span>
            <span class="row-action-btn" data-act="pdf" title="Download PDF"><i class="fas fa-file-arrow-down"></i></span>
            <span class="row-action-btn" data-act="print" title="Print"><i class="fas fa-print"></i></span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  const start = (tableState.page - 1) * tableState.size;
  const info = document.getElementById('pageInfo');
  if (info) info.textContent = tableState.totalElements === 0
    ? 'No results'
    : `Showing ${start + 1}–${Math.min(start + tableState.rows.length, tableState.totalElements)} of ${tableState.totalElements}`;

  renderPagination('pagination', tableState, () => { loadQuotations(); });
  updateSortIndicators('#reportTable thead', tableState.sortKey, tableState.sortDir);
}

// ============================================================
// GST REPORT
// ============================================================
const gstState = { sortKey: 'quoteDate', sortDir: 'desc', page: 1, size: 10, totalPages: 1, totalElements: 0, rows: [], loading: false, error: '', seq: 0 };
const SORT_FIELD_GST = {
  quoteNo: 'code', customer: 'customerName', taxableAmount: 'taxableAmount',
  gstPercent: 'gstPercent', gstAmount: 'gstAmount', total: 'totalAmount', date: 'quoteDate',
};

function mapGstRow(r) {
  return {
    quoteNo: r.code, customer: r.customerName, taxableAmount: r.taxableAmount,
    gstPercent: r.gstPercent, gstAmount: r.gstAmount, total: r.totalAmount, date: r.quoteDate,
  };
}

async function loadGst() {
  const mySeq = ++gstState.seq;
  gstState.loading = true; renderGstTable();
  const field = SORT_FIELD_GST[gstState.sortKey] || 'quoteDate';
  const qs = filterQuery({ page: gstState.page - 1, size: gstState.size, sort: `${field},${gstState.sortDir}` });
  try {
    const page = await apiJson('/api/reports/gst?' + qs.toString());
    if (mySeq !== gstState.seq) return;
    gstState.rows = (page.content || []).map(mapGstRow);
    gstState.totalElements = page.totalElements ?? gstState.rows.length;
    gstState.totalPages = Math.max(1, page.totalPages ?? 1);
    gstState.error = '';
    if (gstState.page > gstState.totalPages) { gstState.page = gstState.totalPages; return loadGst(); }
  } catch (err) {
    if (mySeq !== gstState.seq) return;
    gstState.rows = []; gstState.error = `Couldn't load GST: ${err.message}`;
  } finally {
    if (mySeq === gstState.seq) { gstState.loading = false; renderGstTable(); }
  }
}

function renderGstTable() {
  const tbody = document.getElementById('gstTableBody');
  if (!tbody) return;
  if (gstState.loading && !gstState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-4">Loading…</td></tr>';
  } else if (gstState.error && !gstState.rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-500 py-4">${esc(gstState.error)}</td></tr>`;
  } else if (!gstState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-4">No GST records</td></tr>';
  } else {
    tbody.innerHTML = gstState.rows.map(r => `
      <tr data-quote="${esc(r.quoteNo)}">
        <td data-label="Quotation No." class="font-medium">${esc(r.quoteNo)}</td>
        <td data-label="Customer">${esc(r.customer)}</td>
        <td data-label="Taxable Amount">${formatAmount(r.taxableAmount)}</td>
        <td data-label="GST %">${r.gstPercent ?? 0}%</td>
        <td data-label="GST Amount">${formatAmount(r.gstAmount)}</td>
        <td data-label="Total">${formatAmount(r.total)}</td>
        <td data-label="Date">${formatDate(r.date)}</td>
      </tr>`).join('');
  }
  const start = (gstState.page - 1) * gstState.size;
  const info = document.getElementById('gstPageInfo');
  if (info) info.textContent = gstState.totalElements === 0
    ? 'No results'
    : `Showing ${start + 1}–${Math.min(start + gstState.rows.length, gstState.totalElements)} of ${gstState.totalElements}`;
  renderPagination('gstPagination', gstState, loadGst);
  updateSortIndicators('#gstTable thead', gstState.sortKey, gstState.sortDir);
}

// ============================================================
// REFERRAL INCOME
// ============================================================
const refState = { 
  sortKey: 'referredBy', 
  sortDir: 'asc', 
  page: 1, size: 10, totalPages: 1, totalElements: 0, rows: [], loading: false, error: '', seq: 0 
};
const SORT_FIELD_REF = {
  referrerName: 'referredBy',  
  referredCustomer: 'customerId',   
  quotationAmount: 'totalAmount',    
  referralPercent: 'referralPercent',
  referralAmount: 'referralAmount',
  status: 'status',
};

function mapRefRow(r) {
  return {
    referrerName: r.referrerName || "—",
    referredCustomer: r.referredCustomer || "—",
    quotationAmount: r.quotationAmount || 0,
    referralPercent: r.referralPercent || 0,
    referralAmount: r.referralAmount || 0,
    status: r.status || "—",
    partnerName: r.partnerName || "—" // <-- YEH ADD KARO
  };
}

async function loadProducts() {
  const tbody = document.getElementById('productTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">Loading…</td></tr>';

  try {
    const page = await apiJson('/api/products?page=0&size=100');
    const rows = page.content || [];
    
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No products found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(p => `
      <tr>
        <td data-label="SKU/Code" class="font-medium">${esc(p.code || '—')}</td>
        <td data-label="Product Name">${esc(p.name || '—')}</td>
        <td data-label="Category">${esc(p.category || p.categoryName || '—')}</td>
        <td data-label="Stock">${p.stockQuantity ?? p.stock ?? 0}</td>
        <td data-label="Price">${formatAmount(p.sellingPrice || p.price || 0)}</td>
        <td data-label="Status"><span class="status-pill ${p.active !== false ? 'accepted' : 'rejected'}">${p.active !== false ? 'Active' : 'Inactive'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-rose-500 py-4">Failed to load: ${esc(err.message)}</td></tr>`;
  }
}

async function loadReferral() {
  const mySeq = ++refState.seq;
  refState.loading = true; renderReferralTable();
  const field = SORT_FIELD_REF[refState.sortKey] || 'referrerName';
  const qs = filterQuery({ page: refState.page - 1, size: refState.size, sort: `${field},${refState.sortDir}` });
  try {
    const page = await apiJson('/api/reports/referral-income?' + qs.toString());
    if (mySeq !== refState.seq) return;
    refState.rows = (page.content || []).map(mapRefRow);
    refState.totalElements = page.totalElements ?? refState.rows.length;
    refState.totalPages = Math.max(1, page.totalPages ?? 1);
    refState.error = '';
    if (refState.page > refState.totalPages) { refState.page = refState.totalPages; return loadReferral(); }
  } catch (err) {
    if (mySeq !== refState.seq) return;
    refState.rows = []; refState.error = `Couldn't load referrals: ${err.message}`;
  } finally {
    if (mySeq === refState.seq) { refState.loading = false; renderReferralTable(); }
  }
}

function renderReferralTable() {
  const tbody = document.getElementById('referralTableBody');
  if (!tbody) return;
  const isAdmin = window.currentUserRole === 'SUPER_ADMIN';
  document.getElementById('thReferralPartner')?.classList.toggle('hidden', !isAdmin);
  const pill = { Paid: 'bg-emerald-100 text-emerald-700', Pending: 'bg-amber-100 text-amber-700', Rejected: 'bg-rose-100 text-rose-600' };
  if (refState.loading && !refState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">Loading…</td></tr>';
  } else if (refState.error && !refState.rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-rose-500 py-4">${esc(refState.error)}</td></tr>`;
  } else if (!refState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No referral records</td></tr>';
  } else {
    tbody.innerHTML = refState.rows.map(r => {
    const cls = pill[r.status] || 'bg-gray-100 text-gray-600';
    return `
       <tr>
        <td data-label="Referrer Name" class="font-medium">${esc(r.referrerName)}</td>
        <td data-label="Referred Customer">${esc(r.referredCustomer)}</td>
        <td data-label="Quotation Amount">${formatAmount(r.quotationAmount)}</td>
        <td data-label="Referral %">${r.referralPercent ?? 0}%</td>
        <td data-label="Referral Amount">${formatAmount(r.referralAmount)}</td>
        <td data-label="Status"><span class="status-pill ${cls}">${esc(r.status)}</span></td>
        ${isAdmin ? `<td data-label="Channel Partner">${esc(r.partnerName || '—')}</td>` : ''}
      </tr>
    `;
  }).join('');
}
  const start = (refState.page - 1) * refState.size;
  const info = document.getElementById('referralPageInfo');
  if (info) info.textContent = refState.totalElements === 0
    ? 'No results'
    : `Showing ${start + 1}–${Math.min(start + refState.rows.length, refState.totalElements)} of ${refState.totalElements}`;
  renderPagination('referralPagination', refState, loadReferral);
  updateSortIndicators('#referralTable thead', refState.sortKey, refState.sortDir);
}

// ============================================================
// PAGINATION + SORT INDICATORS (shared)
// ============================================================
function renderPagination(elId, state, onPage) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '';

  const mk = (label, disabled, active, handler) => {
    const b = document.createElement('span');
    b.className = `page-btn ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
    b.innerHTML = label;
    if (!disabled && !active) b.addEventListener('click', handler);
    return b;
  };

  el.appendChild(mk('<i class="fas fa-chevron-left"></i>', state.page === 1, false, () => { state.page--; onPage(); }));

  const tp = state.totalPages;
  const cur = state.page;
  const pages = [];
  if (tp <= 7) for (let i = 1; i <= tp; i++) pages.push(i);
  else {
    pages.push(1);
    for (let i = Math.max(2, cur - 1); i <= Math.min(tp - 1, cur + 1); i++) pages.push(i);
    if (pages[pages.length - 1] !== tp - 1) pages.push('…');
    pages.push(tp);
  }
  pages.forEach(p => {
    if (p === '…') { el.appendChild(mk('…', true, false, null)); return; }
    el.appendChild(mk(String(p), false, p === cur, () => { state.page = p; onPage(); }));
  });

  el.appendChild(mk('<i class="fas fa-chevron-right"></i>', state.page === state.totalPages, false, () => { state.page++; onPage(); }));
}

function updateSortIndicators(theadSel, sortKey, sortDir) {
  document.querySelectorAll(`${theadSel} th[data-key]`).forEach(th => {
    const icon = th.querySelector('.sort-icon');
    th.classList.remove('sorted');
    if (icon) icon.className = 'fas fa-sort sort-icon';
    if (th.dataset.key === sortKey && icon) {
      th.classList.add('sorted');
      icon.className = `fas ${sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'} sort-icon`;
    }
  });
}

// ============================================================
// WIRE UP SORT HEADERS, FILTERS, PAGE-SIZE, TABS
// ============================================================
function wireSort(tableSel, state, reload) {
  document.querySelectorAll(`${tableSel} thead th[data-key]`).forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = 'asc'; }
      state.page = 1;
      reload();
    });
  });
}
wireSort('#reportTable', tableState, loadQuotations);
wireSort('#gstTable', gstState, loadGst);
wireSort('#referralTable', refState, loadReferral);

document.getElementById('pageSize')?.addEventListener('change', (e) => {
  tableState.size = parseInt(e.target.value, 10); tableState.page = 1; loadQuotations();
});
document.getElementById('gstPageSize')?.addEventListener('change', (e) => {
  gstState.size = parseInt(e.target.value, 10); gstState.page = 1; loadGst();
});
document.getElementById('referralPageSize')?.addEventListener('change', (e) => {
  refState.size = parseInt(e.target.value, 10); refState.page = 1; loadReferral();
});

document.getElementById('applyFilters')?.addEventListener('click', () => {
  readFilterInputs();
  tableState.page = gstState.page = refState.page = 1;
  loadSummary();
  loadTopPerformers();
  loadQuotations();
  // loadGst();
  loadReferral();
  showToast('Filters applied', 'fa-filter');
});

document.getElementById('resetFilters')?.addEventListener('click', () => {
  const fromEl = document.getElementById('fromDate');
  const toEl = document.getElementById('toDate');
  // default to current financial year-ish range if the inputs are empty
  if (fromEl) fromEl.value = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  if (toEl)   toEl.value   = new Date().toISOString().slice(0, 10);
  const s = document.getElementById('statusFilter'); if (s) s.value = 'all';
  const sp = document.getElementById('salesFilter'); if (sp) sp.value = 'all';
  const v = document.getElementById('vendorFilter'); if (v) v.value = 'all';
  const cp = document.getElementById('channelPartnerFilter'); if (cp) cp.value = 'all';
  readFilterInputs();
  tableState.page = gstState.page = refState.page = 1;
  loadSummary(); loadTopPerformers(); loadQuotations(); loadGst(); loadReferral();
  showToast('Filters reset', 'fa-rotate-left');
});

// Table row actions (view, pdf, print)
document.getElementById('reportTableBody')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-action-btn');
  if (!btn) return;
  e.stopPropagation();
  
  const action = btn.dataset.act;
  const rowId = btn.closest('tr').dataset.id;
  
  if (action === 'view') {
    // Redirect to quotation page or open modal
    window.location.href = `/quotation/quotation.html?id=${rowId}`;
  } else if (action === 'pdf') {
    // Download PDF API
    window.open(`/api/quotations/${rowId}/pdf`, '_blank');
  } else if (action === 'print') {
    window.print();
  }
});

// Tab switching — loads data lazily per tab
document.querySelectorAll('.report-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const tabId = tab.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const target = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (target) target.classList.remove('hidden');

    if (tabId === 'quotation') { loadQuotations(); loadSummary(); loadTopPerformers(); }
    // if (tabId === 'gst')       { loadGst(); }
    if (tabId === 'referral')  { loadReferral(); }
     if (tabId === 'product')   { loadProducts(); }
    // sales / vendor / product keep placeholder markup

    showToast(`${tab.textContent.trim()} loaded`, 'fa-table-list');
  });
});

// ============================================================
// EXPORT
// ============================================================
function downloadCsv() {
  // Client-side CSV of the currently filtered quotation page — the backend also
  // exposes /api/reports/export for the full dataset; use that when the row count
  // exceeds the current page.
  const header = ['Quotation No.','Customer','System Size','Amount','Sales Person','Status','Date'];
  const rows = tableState.rows.map(r => [r.quoteNo, r.customer, r.systemSize, r.amount, r.salesPerson, statusMeta(r.status).label, r.date]);
  const content = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quotation_report_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  showToast('CSV exported', 'fa-file-csv');
}

document.getElementById('exportCsvBtn')?.addEventListener('click', async () => {
  // Server-side export gives the full filtered dataset; fall back to client CSV.
  try {
    readFilterInputs();
    const qs = filterQuery({ type: 'QUOTATION', format: 'EXCEL' });
    await apiDownload('/api/reports/export?' + qs.toString(), `quotation_report_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Excel exported', 'fa-file-excel');
  } catch (err) {
    console.warn('Server export failed, falling back to client CSV:', err.message);
    downloadCsv();
  }
});
document.getElementById('exportPdfBtn')?.addEventListener('click', async () => {
  try {
    readFilterInputs();
    const qs = filterQuery({ type: 'QUOTATION', format: 'PDF' });
    await apiDownload('/api/reports/export?' + qs.toString(), `quotation_report_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('PDF exported', 'fa-file-pdf');
  } catch (err) {
    showToast(err.status === 403 ? 'Export permission required' : `PDF export failed: ${err.message}`, 'fa-file-pdf', 'rose');
  }
});
document.getElementById('printBtn')?.addEventListener('click', () => window.print());

// ============================================================
// CHANNEL PARTNER FILTER (SUPER_ADMIN only)
// ============================================================
async function initChannelPartnerFilter() {
  const box = document.getElementById('channelPartnerFilterContainer');
  if (!box) return;
  
  const isAdmin = window.currentUserRole === 'SUPER_ADMIN';
  box.classList.toggle('hidden', !isAdmin);

  if (isAdmin) {
    try {
      // Channel Partner Options API Call
      const partners = await apiJson('/api/channel-partners/options');
      const select = document.getElementById('channelPartnerFilter');
      
      if (select && partners) {
        // "all" option + dynamic partners
        select.innerHTML = '<option value="all">All partners</option>' + 
          partners.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      }
    } catch (err) {
      console.warn("Channel partner options failed:", err);
    }
  }
}
document.addEventListener('DOMContentLoaded', initChannelPartnerFilter);
setTimeout(initChannelPartnerFilter, 500);

// ============================================================
// CHARTS (isolated — Chart.js failure never breaks the tables)
// ============================================================
function showChartFallback(canvasEl) {
  if (!canvasEl) return;
  const wrap = canvasEl.closest('.pie-wrap') || canvasEl.parentElement;
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="flex flex-col items-center justify-center h-full text-center gap-1.5 px-4">
      <i class="fas fa-chart-simple text-lg text-peach-300"></i>
      <p class="text-[11px] font-medium text-gray-500">Chart couldn't load</p>
      <p class="text-[10px] text-gray-400">Chart.js failed to load from CDN.</p>
    </div>`;
}

let trendChart = null, statusChart = null, sizeChart = null;
function applyChartData() {
  const d = window.__chartData;
  if (!d) return;

  if (trendChart && Array.isArray(d.trend)) {
    trendChart.data.labels = d.trend.map(t => t.month);
    trendChart.data.datasets[0].data = d.trend.map(t => t.quotations);
    trendChart.update();
  }
  if (statusChart && d.statusDistribution) {
    const s = d.statusDistribution;
    statusChart.data.datasets[0].data = [s.accepted ?? 0, s.pending ?? 0, s.rejected ?? 0];
    statusChart.update();
  }
  if (sizeChart && Array.isArray(d.revenueBySystemSize)) {
    sizeChart.data.labels = d.revenueBySystemSize.map(r => r.band);
    sizeChart.data.datasets[0].data = d.revenueBySystemSize.map(r => r.value / 1e5); // Lakhs
    sizeChart.update();
  }
}
window.__chartsReady = false;

(function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js did not load — skipping charts.');
    ['chartTrend','chartStatus','chartSystemSize'].forEach(id => showChartFallback(document.getElementById(id)));
    return;
  }
  try {
    const peach = '#810B38';
    const peachLight = 'rgba(129, 11, 56, 0.18)';
    const gridColor = 'rgba(84, 26, 26, 0.12)';
    const fontColor = '#9CA3AF';
    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.font.size = 10.5;

    const trendEl = document.getElementById('chartTrend');
    if (trendEl) {
      trendChart = new Chart(trendEl, {
        type: 'line',
        data: { labels: [], datasets: [{
          label: 'Quotations', data: [],
          borderColor: peach, backgroundColor: peachLight, fill: true, tension: 0.35,
          pointBackgroundColor: peach, pointBorderColor: '#F7ECE1', pointBorderWidth: 2, pointRadius: 4,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} quotations` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: fontColor } },
            y: { grid: { color: gridColor }, ticks: { color: fontColor }, beginAtZero: true },
          },
        },
      });
    }

    const statusEl = document.getElementById('chartStatus');
    if (statusEl) {
      statusChart = new Chart(statusEl, {
        type: 'doughnut',
        data: {
          labels: ['Accepted','Pending','Rejected'],
          datasets: [{ data: [0,0,0], backgroundColor: ['#059669','#d97706','#e11d48'], borderColor: '#F7ECE1', borderWidth: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#1F2937', boxWidth: 9, padding: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } },
          },
        },
      });
    }

    const sizeEl = document.getElementById('chartSystemSize');
    if (sizeEl) {
      sizeChart = new Chart(sizeEl, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Value (₹ in Lakhs)', data: [], backgroundColor: peach, borderRadius: 8, maxBarThickness: 40 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `₹${ctx.parsed.y}L` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: fontColor } },
            y: { grid: { color: gridColor }, ticks: { color: fontColor } },
          },
        },
      });
    }

    window.__chartsReady = true;
    if (window.__chartData) applyChartData();
  } catch (err) {
    console.warn('Chart rendering failed, rest of page unaffected:', err);
    ['chartTrend','chartStatus','chartSystemSize'].forEach(id => showChartFallback(document.getElementById(id)));
  }
})();

// ============================================================
// BOOT
// ============================================================
(function boot() {
  // Seed default filter dates from HTML inputs so the very first call is scoped.
  readFilterInputs();
  // Fire all four data calls in parallel.
  loadSummary();
  loadTopPerformers();
  loadQuotations();
  // gst & referral load lazily when their tabs open; but load once so the tab
  // isn't empty if the user clicks quickly.
  // loadGst();
  loadReferral();
})();