// ============================================================
// Cost Calculator — backend-integrated
//   POST   /api/calculations/preview      live totals (debounced)
//   POST   /api/calculations              save new
//   GET    /api/calculations?page&size&…  history list
//   GET    /api/calculations/{id}         full detail
//   PUT    /api/calculations/{id}         update
//   DELETE /api/calculations/{id}         delete
// All wrapped as ApiResponse { success, message, data }.
// ============================================================

// ============================================================
// Sidebar collapse / expand (shared)
// ============================================================
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const toggleIcon = document.getElementById("toggleIcon");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const drawerMQ = window.matchMedia("(max-width: 1023px)");
const isDrawerViewport = () => drawerMQ.matches;
let sidebarExpanded = !isDrawerViewport();

function setSidebarExpanded(next) {
  sidebarExpanded = next;
  sidebar?.classList.toggle("expanded", next);
  sidebar?.classList.toggle("collapsed", !next);
  if (toggleIcon) toggleIcon.style.transform = next ? "rotate(180deg)" : "rotate(0deg)";
  const showBackdrop = next && isDrawerViewport();
  sidebarBackdrop?.classList.toggle("visible", showBackdrop);
  sidebarBackdrop?.classList.toggle("hidden", !showBackdrop);
}
setSidebarExpanded(sidebarExpanded);
sidebarToggle?.addEventListener("click", () => setSidebarExpanded(!sidebarExpanded));
sidebarBackdrop?.addEventListener("click", () => setSidebarExpanded(false));
drawerMQ.addEventListener("change", () => setSidebarExpanded(!isDrawerViewport()));
document.getElementById("sidebarNav")?.addEventListener("click", (e) => {
  if (e.target.closest(".nav-item") && isDrawerViewport()) setSidebarExpanded(false);
});

// ============================================================
// Logout
// ============================================================
function logoutUser() {
  try {
    if (window.Session && typeof Session.logout === "function") Session.logout();
    else sessionStorage.removeItem("sqms_session");
  } catch (_) {}
  window.location.href = "../index.html";
}

// ============================================================
// Topbar dropdowns
// ============================================================
const notifBtn = document.getElementById("notifBtn");
const notifDropdown = document.getElementById("notifDropdown");
const profileBtn = document.getElementById("profileBtn");
const profileDropdown = document.getElementById("profileDropdown");
const profileLogoutBtn = document.getElementById("profileLogoutBtn");

function closeAllTopbarDropdowns(except) {
  [notifDropdown, profileDropdown].forEach(dd => { if (dd && dd !== except) dd.classList.add("hidden"); });
}
notifBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = notifDropdown.classList.contains("hidden");
  closeAllTopbarDropdowns();
  notifDropdown.classList.toggle("hidden", !willOpen);
});
profileBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = profileDropdown.classList.contains("hidden");
  closeAllTopbarDropdowns();
  profileDropdown.classList.toggle("hidden", !willOpen);
});
document.addEventListener("click", () => closeAllTopbarDropdowns());
profileLogoutBtn?.addEventListener("click", logoutUser);

// ============================================================
// Shared helpers
// ============================================================
function formatINR(n) {
  const val = Math.round(Number(n) || 0);
  return "₹" + val.toLocaleString("en-IN");
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast-animate bg-gray-800 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
function pulse(el) { if (!el) return; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** Unwrap ApiResponse { success, data }. Throws on failure. */
async function apiCall(path, options) {
  if (!window.Session || typeof Session.authFetch !== "function") {
    throw new Error("Session.authFetch unavailable (session.js missing?)");
  }
  const res = await Session.authFetch(path, options);
  if (res.status === 204) return null;
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok || !body || body.success === false) {
    const fieldMsg = body?.errors?.map(e => e.message).join(", ") || "";
    const err = new Error(body?.message || fieldMsg || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body.data;
}

// ============================================================
// Live Cost Calculator — server-side math
// ============================================================
const formIds = {
  material: "cMaterial",
  installation: "cInstallation",
  transportation: "cTransportation",
  civil: "cCivil",
  labour: "cLabour",
  electrical: "cElectrical",
  other: "cOther",
  discount: "cDiscount",
  gstPct: "cGstPct",       // <-- fixed: was read as formIds.gstPercent before
};

/** Read the live form into a CalculationRequestDto shape. */
function buildRequestFromForm() {
  const g = (id) => toNum(document.getElementById(id)?.value);
  const gstRaw = g(formIds.gstPct);
  
  // Session se partnerId nikaalo
  const currentSession = window.Session ? Session.getSession() : {};
  const currentPartnerId = currentSession ? currentSession.partnerId : null;

  return {
    partnerId: currentPartnerId, // <--- YEH ADD KARO
    customerName: document.getElementById("fCustomer")?.value.trim() || "",
    projectName: document.getElementById("fProject")?.value.trim() || "",
    capacityKw: toNum(document.getElementById("fCapacity")?.value),
    projectType: (document.getElementById("fProjectType")?.value || "RESIDENTIAL").toUpperCase(),
    materialCost: g(formIds.material),
    installationCost: g(formIds.installation),
    transportationCost: g(formIds.transportation),
    civilCost: g(formIds.civil),
    labourCost: g(formIds.labour),
    electricalCost: g(formIds.electrical),
    otherCost: g(formIds.other),
    discount: g(formIds.discount),
    gstPercent: gstRaw > 0 ? gstRaw : 18,
  };
}

// Debounced preview
let previewTimer = null;
let previewSeq = 0;
let lastPreviewResult = null;

/** Matches @Valid on CalculationRequestDto — do not hit the server otherwise. */
function isPreviewReady(req) {
  return req.customerName.trim().length > 0 && Number(req.capacityKw) >= 0.01;
}

function clearPreviewDisplay() {
  ["sumMaterial","sumInstallation","sumGst","sumFinal",
   "rSubtotal","rGstAmount","rGrandTotal","rCostPerKw","rSaving"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "₹0"; });

  const live = document.getElementById("liveCalcBreakdown");
  if (live) live.innerHTML =
    '<p class="text-[11px] text-gray-400">Enter Customer and a Capacity ≥ 0.01 kW to see the live breakdown.</p>';

  lastPreviewResult = null;
}

// ---- SINGLE definition: refuses to call the server on invalid input ----
async function requestPreview() {
  const seq = ++previewSeq;
  const req = buildRequestFromForm();

  if (!isPreviewReady(req)) {
    clearPreviewDisplay();
    return;
  }

  try {
    const data = await apiCall("/api/calculations/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (seq !== previewSeq) return;
    lastPreviewResult = data;
    renderPreview(data, req);
  } catch (err) {
    if (seq !== previewSeq) return;
    console.warn("preview failed:", err.message);
    showToastInline(`Preview unavailable: ${err.message}`);
  }
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(requestPreview, 250);
}

let inlineErrorEl = null;
function showToastInline(msg) {
  if (!inlineErrorEl) {
    inlineErrorEl = document.createElement("div");
    inlineErrorEl.className = "text-[10.5px] text-rose-600 mt-1";
    document.getElementById("liveCalcBreakdown")?.parentElement?.appendChild(inlineErrorEl);
  }
  inlineErrorEl.textContent = msg;
  setTimeout(() => { if (inlineErrorEl) inlineErrorEl.textContent = ""; }, 4000);
}

/** Populate every numeric readout from a CalculationResponseDto. */
function renderPreview(res, req) {
  if (!res) return;
  // Summary cards
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = formatINR(val); };
  set("sumMaterial", res.materialCost);
  set("sumInstallation", res.installationCost);
  set("sumGst", res.gstAmount);
  set("sumFinal", res.finalCost);
  ["sumMaterial", "sumInstallation", "sumGst", "sumFinal"].forEach(id => pulse(document.getElementById(id)));

  // Live breakdown (server numbers)
  renderBreakdown("liveCalcBreakdown", res);

  // Sticky result panel
  set("rSubtotal", res.subtotal);
  set("rGstAmount", res.gstAmount);
  set("rGrandTotal", res.finalCost);
  set("rCostPerKw", res.costPerKw);
  set("rSaving", res.estimatedSaving);
}

/** Renders the breakdown from a CalculationResponseDto (used by live panel + view modal). */
function renderBreakdown(containerId, r) {
  if (!r) return;
  const rows = [
    { op: "", label: "Material Cost", value: r.materialCost },
    { op: "+", label: "Installation Cost", value: r.installationCost },
    { op: "+", label: "Transportation Cost", value: r.transportationCost },
    { op: "+", label: "Civil Work Cost", value: r.civilCost },
    { op: "+", label: "Labour Cost", value: r.labourCost },
    { op: "+", label: "Electrical Cost", value: r.electricalCost },
    { op: "+", label: "Other Charges", value: r.otherCost },
  ];
  let html = rows.map(x => `
    <div class="calc-row">
      <span class="calc-op">${x.op}</span>
      <span class="calc-label">${x.label}</span>
      <span class="calc-value">${formatINR(x.value)}</span>
    </div>`).join("");

  html += `
    <div class="calc-row calc-negative">
      <span class="calc-op">−</span>
      <span class="calc-label">Discount</span>
      <span class="calc-value">${formatINR(r.discount)}</span>
    </div>
    <div class="calc-row calc-subtotal">
      <span class="calc-op"></span>
      <span class="calc-label">Subtotal</span>
      <span class="calc-value">${formatINR(r.subtotal)}</span>
    </div>
    <div class="calc-row">
      <span class="calc-op">+</span>
      <span class="calc-label">GST (${r.gstPercent ?? 0}%)</span>
      <span class="calc-value">${formatINR(r.gstAmount)}</span>
    </div>
    <div class="calc-row calc-final">
      <span class="calc-op">=</span>
      <span class="calc-label">Final Cost</span>
      <span class="calc-value">${formatINR(r.finalCost)}</span>
    </div>`;

  const el = document.getElementById(containerId);
  if (el) el.innerHTML = html;
}

// Wire inputs → debounced preview
document.querySelectorAll(".calc-input").forEach(el => el.addEventListener("input", schedulePreview));
document.getElementById("fCapacity")?.addEventListener("input", schedulePreview);
document.getElementById("fProjectType")?.addEventListener("change", schedulePreview);
document.getElementById("fCustomer")?.addEventListener("input", schedulePreview);

// ============================================================
// History — server-paged list
// ============================================================
const historyState = {
  page: 0, size: 20, totalPages: 1, totalElements: 0,
  rows: [], loading: false, error: "", seq: 0,
  sortKey: "createdAt", sortDir: "desc",
};

function isSuperAdmin() {
  return window.currentUserRole === "SUPER_ADMIN";
}

const historyTbody = document.getElementById("historyTbody");
const channelPartnerHeader = document.getElementById("channelPartnerHeader");

function historyQuery() {
  return new URLSearchParams({
    page: String(historyState.page),
    size: String(historyState.size),
  });
}

async function loadHistory() {
  const mySeq = ++historyState.seq;
  historyState.loading = true;
  renderHistoryTable();

  try {
    const page = await apiCall("/api/calculations?" + historyQuery().toString());
    if (mySeq !== historyState.seq) return;
    historyState.rows = page.content || [];
    historyState.totalElements = page.totalElements ?? historyState.rows.length;
    historyState.totalPages = Math.max(1, page.totalPages ?? 1);
    historyState.error = "";
  } catch (err) {
    if (mySeq !== historyState.seq) return;
    console.warn("loadHistory failed:", err.message);
    historyState.rows = [];
    historyState.totalElements = 0;
    historyState.error = err.status === 403
      ? "You do not have permission to view calculations."
      : `Couldn't load history: ${err.message}`;
  } finally {
    if (mySeq === historyState.seq) {
      historyState.loading = false;
      renderHistoryTable();
    }
  }
}

function sortedRows(rows) {
  const list = [...rows];
  const dir = historyState.sortDir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    const k = historyState.sortKey;
    const av = a[k];
    const bv = b[k];
    if (k === "createdAt") return (new Date(av).getTime() - new Date(bv).getTime()) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av ?? "").toLowerCase().localeCompare(String(bv ?? "").toLowerCase()) * dir;
  });
  return list;
}

const ICONS = {
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
};
function actionIconsHtml(id) {
  return `
    <div class="row-actions">
      <button class="action-icon-btn icon-view" data-action="view" data-id="${id}" title="View">${ICONS.view}</button>
      <button class="action-icon-btn icon-edit" data-action="edit" data-id="${id}" title="Edit">${ICONS.edit}</button>
      <button class="action-icon-btn icon-delete" data-action="delete" data-id="${id}" title="Delete">${ICONS.delete}</button>
    </div>`;
}

function renderHistoryTable() {
  if (!historyTbody) return;
  const isAdmin = isSuperAdmin();
  channelPartnerHeader?.classList.toggle("hidden", !isAdmin);

  if (historyState.loading && !historyState.rows.length) {
    historyTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color:#9CA3AF;">Loading…</td></tr>`;
  } else if (historyState.error && !historyState.rows.length) {
    historyTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color:#E11D48;">${esc(historyState.error)}</td></tr>`;
  } else if (!historyState.rows.length) {
    historyTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color:#9CA3AF;">No calculations saved yet.</td></tr>`;
  } else {
    const rows = sortedRows(historyState.rows);
    historyTbody.innerHTML = rows.map(rec => `
      <tr data-id="${rec.id}" class="fade-in">
        <td data-label="Calculation ID" class="font-medium">${esc(rec.code || rec.id)}</td>
        <td data-label="Customer">${esc(rec.customerName || "—")}</td>
        <td data-label="Project">${esc(rec.projectName || "—")}</td>
        <td data-label="Capacity">${rec.capacityKw ?? 0} kW</td>
        <td data-label="Final Cost">${formatINR(rec.finalCost)}</td>
        <td data-label="Date">${formatDate(rec.createdAt)}</td>
        ${isAdmin ? `<td data-label="Channel Partner">${esc(rec.partnerName || "—")}</td>` : ""}
        <td data-label="Actions">${actionIconsHtml(rec.id)}</td>
      </tr>`).join("");
  }
  updateSortIcons();
}

function updateSortIcons() {
  document.querySelectorAll("#historyTable thead th[data-key]").forEach(th => {
    const icon = th.querySelector(".sort-icon");
    const key = th.getAttribute("data-key");
    const active = key === historyState.sortKey;
    th.classList.toggle("sorted", active);
    if (icon) icon.textContent = active ? (historyState.sortDir === "asc" ? "↑" : "↓") : "⇅";
  });
}

// client-side sort over the loaded page (server returns newest-first)
document.querySelectorAll("#historyTable thead th[data-key]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-key");
    const map = {
      id: "code", customer: "customerName", project: "projectName",
      capacity: "capacityKw", finalCost: "finalCost", date: "createdAt",
      channelPartner: "partnerName",
    };
    const nextKey = map[key] || key;
    if (historyState.sortKey === nextKey) {
      historyState.sortDir = historyState.sortDir === "asc" ? "desc" : "asc";
    } else {
      historyState.sortKey = nextKey;
      historyState.sortDir = "asc";
    }
    renderHistoryTable();
  });
});

// ============================================================
// Save Calculation  →  POST /api/calculations
// ============================================================
document.getElementById("saveCalcBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("saveCalcBtn");
  const body = buildRequestFromForm();
  if (!body.customerName) { showToast("Customer name is required"); return; }
  if (body.capacityKw <= 0) { showToast("System capacity must be greater than 0"); return; }

  btn.disabled = true;
  try {
    const created = await apiCall("/api/calculations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    showToast(`Saved as ${created.code || created.id}`);
    historyState.page = 0;
    await loadHistory();
    resetForm();
    clearPreviewDisplay();
  } catch (err) {
    showToast(err.status === 403 ? "You do not have permission to save calculations" : err.message);
  } finally {
    btn.disabled = false;
  }
});

function resetForm() {
  ["fCustomer", "fProject", "fCapacity"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  Object.values(formIds).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === formIds.gstPct) el.value = 18;
    else el.value = "";
  });
  const pt = document.getElementById("fProjectType");
  if (pt) pt.value = "Residential";
}

// ============================================================
// View modal  →  GET /api/calculations/{id}
// ============================================================
const viewModal = document.getElementById("viewModal");
document.getElementById("viewModalCloseBtn")?.addEventListener("click", () => viewModal?.classList.add("hidden"));
document.getElementById("viewModalCloseBtn2")?.addEventListener("click", () => viewModal?.classList.add("hidden"));
viewModal?.addEventListener("click", (e) => { if (e.target === viewModal) viewModal.classList.add("hidden"); });

async function openViewModal(id) {
  try {
    const rec = await apiCall(`/api/calculations/${id}`);
    document.getElementById("viewModalSubtitle").textContent =
      `${rec.code || rec.id} · ${formatDate(rec.createdAt)}`;
    document.getElementById("vCustomer").textContent = rec.customerName || "—";
    document.getElementById("vProject").textContent = rec.projectName || "—";
    document.getElementById("vCapacity").textContent = `${rec.capacityKw ?? 0} kW`;
    document.getElementById("vProjectType").textContent = humanizeProjectType(rec.projectType);
    renderBreakdown("viewCalcBreakdown", rec);
    viewModal.classList.remove("hidden");
  } catch (err) {
    showToast(err.status === 403 ? "View permission required" : err.message);
  }
}

function humanizeProjectType(t) {
  if (!t) return "—";
  const s = String(t).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// Edit modal  →  PUT /api/calculations/{id}
// ============================================================
const editModal = document.getElementById("editModal");
let editingId = null;

document.getElementById("editModalCloseBtn")?.addEventListener("click", () => editModal?.classList.add("hidden"));
document.getElementById("editCancelBtn")?.addEventListener("click", () => editModal?.classList.add("hidden"));
editModal?.addEventListener("click", (e) => { if (e.target === editModal) editModal.classList.add("hidden"); });

async function openEditModal(id) {
  try {
    const rec = await apiCall(`/api/calculations/${id}`);
    editingId = rec.id;
    document.getElementById("editModalSubtitle").textContent = rec.code || rec.id;
    document.getElementById("eCustomer").value = rec.customerName || "";
    document.getElementById("eProject").value = rec.projectName || "";
    document.getElementById("eCapacity").value = rec.capacityKw ?? 0;
    document.getElementById("eProjectType").value = humanizeProjectType(rec.projectType);
    document.getElementById("eMaterial").value = rec.materialCost ?? 0;
    document.getElementById("eInstallation").value = rec.installationCost ?? 0;
    document.getElementById("eTransportation").value = rec.transportationCost ?? 0;
    document.getElementById("eCivil").value = rec.civilCost ?? 0;
    document.getElementById("eLabour").value = rec.labourCost ?? 0;
    document.getElementById("eElectrical").value = rec.electricalCost ?? 0;
    document.getElementById("eOther").value = rec.otherCost ?? 0;
    document.getElementById("eDiscount").value = rec.discount ?? 0;
    document.getElementById("eGstPct").value = rec.gstPercent ?? 18;
    editModal.classList.remove("hidden");
  } catch (err) {
    showToast(err.status === 403 ? "View permission required" : err.message);
  }
}

document.getElementById("editSaveBtn")?.addEventListener("click", async () => {
  const currentSession = window.Session ? Session.getSession() : {};
  
  const body = {
    partnerId: currentSession?.partnerId || null, // <-- YEH ADD KARO (Fix for 500)
    customerName: document.getElementById("eCustomer").value.trim(),
    projectName: document.getElementById("eProject").value.trim(),
    capacityKw: toNum(document.getElementById("eCapacity").value),
    
    // YAHAN .toUpperCase() LAGAO (Fix for Enum mismatch)
    projectType: (document.getElementById("eProjectType").value || "RESIDENTIAL").toUpperCase(),
    
    materialCost: toNum(document.getElementById("eMaterial").value),
    installationCost: toNum(document.getElementById("eInstallation").value),
    transportationCost: toNum(document.getElementById("eTransportation").value),
    civilCost: toNum(document.getElementById("eCivil").value),
    labourCost: toNum(document.getElementById("eLabour").value),
    electricalCost: toNum(document.getElementById("eElectrical").value),
    otherCost: toNum(document.getElementById("eOther").value),
    discount: toNum(document.getElementById("eDiscount").value),
    gstPercent: toNum(document.getElementById("eGstPct").value) || 18,
  };
  
  if (!body.customerName) { showToast("Customer name is required"); return; }
  if (body.capacityKw <= 0) { showToast("Capacity must be greater than 0"); return; }

  const btn = document.getElementById("editSaveBtn");
  btn.disabled = true;
  try {
    await apiCall(`/api/calculations/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    editModal.classList.add("hidden");
    showToast("Calculation updated");
    await loadHistory();
  } catch (err) {
    showToast(err.status === 403 ? "You do not have permission to edit" : err.message);
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
// Delete modal  →  DELETE /api/calculations/{id}
// ============================================================
const deleteModal = document.getElementById("deleteModal");
let deletingId = null;
let deletingCode = null;

document.getElementById("deleteModalCloseBtn")?.addEventListener("click", () => deleteModal?.classList.add("hidden"));
document.getElementById("deleteCancelBtn")?.addEventListener("click", () => deleteModal?.classList.add("hidden"));
deleteModal?.addEventListener("click", (e) => { if (e.target === deleteModal) deleteModal.classList.add("hidden"); });

function openDeleteModal(id) {
  const rec = historyState.rows.find(r => String(r.id) === String(id));
  deletingId = id;
  deletingCode = rec?.code || id;
  document.getElementById("deleteCalcId").textContent = deletingCode;
  deleteModal.classList.remove("hidden");
}

async function loadDropdownData() {
    try {
        // 1. Customers Load karo
        const custData = await apiCall("/api/calculations/dropdown/customers");
        const custList = document.getElementById("customerList");
        if (custList && custData) {
            custList.innerHTML = custData.map(c => `<option value="${esc(c.name)}">`).join('');
        }

        // 2. Projects Load karo
        const projData = await apiCall("/api/calculations/dropdown/projects");
        const projList = document.getElementById("projectList");
        if (projList && projData) {
            projList.innerHTML = projData.map(p => `<option value="${esc(p.name)}">`).join('');
        }
    } catch (err) {
        console.error("Dropdown load failed:", err);
    }
}

document.getElementById("deleteConfirmBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("deleteConfirmBtn");
  btn.disabled = true;
  try {
    await apiCall(`/api/calculations/${deletingId}`, { method: "DELETE" });
    deleteModal.classList.add("hidden");
    showToast(`${deletingCode} deleted`);
    await loadHistory();
  } catch (err) {
    showToast(err.status === 403 ? "You do not have permission to delete" : err.message);
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
// Row action wiring
// ============================================================
historyTbody?.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (!actionBtn) return;
  const id = actionBtn.getAttribute("data-id");
  const action = actionBtn.getAttribute("data-action");
  if (action === "view") openViewModal(id);
  else if (action === "edit") openEditModal(id);
  else if (action === "delete") openDeleteModal(id);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  [viewModal, editModal, deleteModal].forEach(m => m?.classList.add("hidden"));
});

// ============================================================
// Print — uses the last server preview so the slip matches what the user sees
// ============================================================
document.getElementById("printCalcBtn")?.addEventListener("click", async () => {
  await requestPreview();
  const r = lastPreviewResult;
  if (!r) { showToast("Nothing to print yet — enter customer and capacity first"); return; }

  const rows = [
    ["Customer", document.getElementById("fCustomer")?.value.trim() || "—"],
    ["Project", document.getElementById("fProject")?.value.trim() || "—"],
    ["Capacity", `${r.capacityKw ?? 0} kW`],
    ["Project Type", humanizeProjectType(r.projectType)],
    ["Material Cost", formatINR(r.materialCost)],
    ["Installation Cost", formatINR(r.installationCost)],
    ["Transportation Cost", formatINR(r.transportationCost)],
    ["Civil Work Cost", formatINR(r.civilCost)],
    ["Labour Cost", formatINR(r.labourCost)],
    ["Electrical Cost", formatINR(r.electricalCost)],
    ["Other Charges", formatINR(r.otherCost)],
    ["Discount", formatINR(r.discount)],
    ["Subtotal", formatINR(r.subtotal)],
    [`GST (${r.gstPercent ?? 0}%)`, formatINR(r.gstAmount)],
  ];

  document.getElementById("printBody").innerHTML = rows
    .map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`)
    .join("") + `<tr class="print-total"><th>Final Cost</th><td>${formatINR(r.finalCost)}</td></tr>`;
  document.getElementById("pGenDate").textContent = new Date().toLocaleString("en-IN");
  window.print();
});

// ============================================================
// Export PDF — from the loaded history page
// ============================================================
document.getElementById("exportPdfBtn")?.addEventListener("click", () => {
  if (!window.jspdf) { showToast("PDF library failed to load"); return; }
  if (!historyState.rows.length) { showToast("Nothing to export"); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setDrawColor(129, 11, 56);
  doc.setFillColor(247, 236, 225);
  doc.rect(40, 20, 30, 30, "F");
  doc.setTextColor(129, 11, 56);
  doc.setFontSize(8);
  doc.text("LOGO", 42, 40);
  doc.setFontSize(16);
  doc.text("Solar Quotation Management", 80, 45);
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text("Calculation History", 40, 62);
  doc.line(40, 72, 555, 72);

  const isAdmin = isSuperAdmin();
  const cols = isAdmin
    ? ["ID", "Customer", "Project", "Capacity", "Final Cost", "Date", "Partner"]
    : ["ID", "Customer", "Project", "Capacity", "Final Cost", "Date"];
  const colX = isAdmin
    ? [40, 95, 180, 280, 350, 420, 490]
    : [40, 95, 180, 280, 350, 420];

  let y = 96;
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  cols.forEach((c, i) => doc.text(c, colX[i], y));
  y += 8;
  doc.setDrawColor(220, 195, 170);
  doc.line(40, y, 555, y);
  y += 16;

  doc.setFontSize(9);
  sortedRows(historyState.rows).forEach(rec => {
    if (y > 780) { doc.addPage(); y = 50; }
    doc.setTextColor(31, 41, 55);
    doc.text(String(rec.code || rec.id), colX[0], y);
    doc.text(String(rec.customerName || "—").slice(0, 18), colX[1], y);
    doc.text(String(rec.projectName || "—").slice(0, 20), colX[2], y);
    doc.text(`${rec.capacityKw ?? 0} kW`, colX[3], y);
    doc.text(formatINR(rec.finalCost), colX[4], y);
    doc.text(formatDate(rec.createdAt), colX[5], y);
    if (isAdmin && colX[6]) doc.text(String(rec.partnerName || "—").slice(0, 18), colX[6], y);
    y += 20;
  });

  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(`Generated on ${new Date().toLocaleString("en-IN")}`, 40, y + 16);
  doc.save("calculation-history.pdf");
  showToast("Downloaded calculation-history.pdf");
});

// ============================================================
// Export Excel — from the loaded history page
// ============================================================
document.getElementById("exportExcelBtn")?.addEventListener("click", () => {
  if (!window.XLSX) { showToast("Excel library failed to load"); return; }
  if (!historyState.rows.length) { showToast("Nothing to export"); return; }

  const isAdmin = isSuperAdmin();
  const rows = sortedRows(historyState.rows).map(rec => {
    const base = {
      "Calculation ID": rec.code || rec.id,
      "Customer": rec.customerName || "—",
      "Project": rec.projectName || "—",
      "Capacity (kW)": rec.capacityKw ?? 0,
      "Project Type": humanizeProjectType(rec.projectType),
      "Material Cost": rec.materialCost ?? 0,
      "Installation Cost": rec.installationCost ?? 0,
      "Transportation Cost": rec.transportationCost ?? 0,
      "Civil Work Cost": rec.civilCost ?? 0,
      "Labour Cost": rec.labourCost ?? 0,
      "Electrical Cost": rec.electricalCost ?? 0,
      "Other Charges": rec.otherCost ?? 0,
      "Discount": rec.discount ?? 0,
      "GST %": rec.gstPercent ?? 0,
      "Subtotal": Math.round(rec.subtotal ?? 0),
      "GST Amount": Math.round(rec.gstAmount ?? 0),
      "Final Cost": Math.round(rec.finalCost ?? 0),
      "Cost Per kW": Math.round(rec.costPerKw ?? 0),
      "Date": rec.createdAt ? String(rec.createdAt).slice(0, 10) : "",
    };
    if (isAdmin) base["Channel Partner"] = rec.partnerName || "—";
    return base;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Calculation History");
  XLSX.writeFile(wb, "calculation-history.xlsx");
  showToast("Downloaded calculation-history.xlsx");
});

// ============================================================
// Init
// ============================================================
// Do NOT call requestPreview() here — the form is empty, it would 400.
// The live panel shows an empty-state hint until the user types valid input.
clearPreviewDisplay();
loadHistory();
loadDropdownData();

// Re-render once session.js has set the real role
window.addEventListener("DOMContentLoaded", () => {
  renderHistoryTable();
});