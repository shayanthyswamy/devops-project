const STORAGE = {
  invoicesKey: "cbs_invoices_v1",
  themeKey: "cbs_theme_v1",
};

const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
}

function loadInvoices() {
  try {
    const raw = localStorage.getItem(STORAGE.invoicesKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDateOnly(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inRange(dateStr, startStr, endStr) {
  // compares YYYY-MM-DD strings lexicographically
  if (!dateStr) return false;
  if (startStr && dateStr < startStr) return false;
  if (endStr && dateStr > endStr) return false;
  return true;
}

function showToast({ type = "ok", title, message }) {
  const wrap = document.querySelector(".toastWrap");
  if (!wrap) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "danger" ? "toastDanger" : "toastOk"}`;
  toast.innerHTML = `
    <div class="toastIcon">${type === "danger" ? "!" : "✓"}</div>
    <div>
      <p class="toastTitle">${escapeHtml(title || (type === "danger" ? "Error" : "Done"))}</p>
      <p class="toastMsg">${escapeHtml(message || "")}</p>
    </div>
  `;
  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity .2s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  }, 2800);
}

function getThemePreference() {
  return localStorage.getItem(STORAGE.themeKey) || "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  const toggleBtn = document.querySelector("#themeToggleBtn");
  if (toggleBtn) toggleBtn.textContent = theme === "light" ? "Dark" : "Light";
}

function initThemeToggle() {
  applyTheme(getThemePreference());
  const toggleBtn = document.querySelector("#themeToggleBtn");
  if (!toggleBtn) return;
  toggleBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    localStorage.setItem(STORAGE.themeKey, next);
    applyTheme(next);
  });
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildCsv(rows) {
  const headers = Object.keys(rows[0] || { a: 1 });
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}`;
}

function groupDaily(invoices) {
  const map = new Map(); // date -> agg
  invoices.forEach((inv) => {
    const date = inv.date || "";
    if (!date) return;
    const cur = map.get(date) || { date, invoices: 0, sales: 0, tax: 0, discount: 0 };
    cur.invoices += 1;
    cur.sales += money(inv.totals?.grandTotal);
    cur.tax += money(inv.totals?.taxAmount);
    cur.discount += money(inv.totals?.discountAmount);
    map.set(date, cur);
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function groupMonthly(invoices) {
  const map = new Map(); // yyyy-mm -> agg
  invoices.forEach((inv) => {
    const date = inv.date || "";
    if (date.length < 7) return;
    const month = date.slice(0, 7);
    const cur = map.get(month) || { month, invoices: 0, sales: 0, tax: 0, discount: 0 };
    cur.invoices += 1;
    cur.sales += money(inv.totals?.grandTotal);
    cur.tax += money(inv.totals?.taxAmount);
    cur.discount += money(inv.totals?.discountAmount);
    map.set(month, cur);
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function renderRows(tableTbody, rows, mode) {
  tableTbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">No invoices found for the selected range.</td>`;
    tableTbody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const key = mode === "daily" ? r.date : r.month;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(key)}</td>
      <td class="mono">${escapeHtml(r.invoices)}</td>
      <td class="mono">${fmt.format(money(r.sales))}</td>
      <td class="mono">${fmt.format(money(r.discount))}</td>
      <td class="mono">${fmt.format(money(r.tax))}</td>
    `;
    tableTbody.appendChild(tr);
  });
}

function initReportApp() {
  const invoices = loadInvoices();
  const modeEl = document.querySelector("#reportMode");
  const startEl = document.querySelector("#startDate");
  const endEl = document.querySelector("#endDate");
  const monthFromEl = document.querySelector("#monthFrom");
  const monthToEl = document.querySelector("#monthTo");

  const tableTbody = document.querySelector("#reportTbody");

  const kpis = {
    invoices: document.querySelector("#kpiInvoices"),
    sales: document.querySelector("#kpiSales"),
    avg: document.querySelector("#kpiAvg"),
    discount: document.querySelector("#kpiDiscount"),
    tax: document.querySelector("#kpiTax"),
  };

  function computeFiltered() {
    const mode = modeEl?.value || "daily";
    if (mode === "daily") {
      const start = startEl?.value || "";
      const end = endEl?.value || "";
      return invoices.filter((inv) => inRange(inv.date, start, end));
    }

    // monthly
    const from = monthFromEl?.value || "";
    const to = monthToEl?.value || "";
    return invoices.filter((inv) => {
      const d = inv.date || "";
      if (d.length < 7) return false;
      const month = d.slice(0, 7);
      if (from && month < from) return false;
      if (to && month > to) return false;
      return true;
    });
  }

  function computeKpis(filtered) {
    const totalInvoices = filtered.length;
    const sales = filtered.reduce((s, inv) => s + money(inv.totals?.grandTotal), 0);
    const discount = filtered.reduce((s, inv) => s + money(inv.totals?.discountAmount), 0);
    const tax = filtered.reduce((s, inv) => s + money(inv.totals?.taxAmount), 0);
    const avg = totalInvoices ? sales / totalInvoices : 0;
    return { totalInvoices, sales, discount, tax, avg };
  }

  function render(mode) {
    const filtered = computeFiltered();
    const k = computeKpis(filtered);

    if (kpis.invoices) kpis.invoices.textContent = String(k.totalInvoices);
    if (kpis.sales) kpis.sales.textContent = fmt.format(k.sales);
    if (kpis.avg) kpis.avg.textContent = fmt.format(k.avg);
    if (kpis.discount) kpis.discount.textContent = fmt.format(k.discount);
    if (kpis.tax) kpis.tax.textContent = fmt.format(k.tax);

    if (mode === "daily") {
      const rows = groupDaily(filtered);
      renderRows(tableTbody, rows, "daily");
    } else {
      const rows = groupMonthly(filtered);
      renderRows(tableTbody, rows, "monthly");
    }
  }

  function syncModeUI() {
    const mode = modeEl?.value || "daily";
    const dailyWrap = document.querySelector("#dailyControls");
    const monthlyWrap = document.querySelector("#monthlyControls");
    if (dailyWrap) dailyWrap.style.display = mode === "daily" ? "block" : "none";
    if (monthlyWrap) monthlyWrap.style.display = mode === "monthly" ? "block" : "none";
  }

  const buildCsvBtn = document.querySelector("#downloadReportCsvBtn");
  if (buildCsvBtn) {
    buildCsvBtn.addEventListener("click", () => {
      const mode = modeEl?.value || "daily";
      const filtered = computeFiltered();
      const rows =
        mode === "daily"
          ? groupDaily(filtered).map((r) => ({ Period: r.date, Invoices: r.invoices, Sales: r.sales, Discount: r.discount, Tax: r.tax }))
          : groupMonthly(filtered).map((r) => ({ Period: r.month, Invoices: r.invoices, Sales: r.sales, Discount: r.discount, Tax: r.tax }));

      if (!rows.length) {
        showToast({ type: "danger", title: "Nothing to export", message: "No data in the selected range." });
        return;
      }
      downloadText(`cake-billing-report-${mode}-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(rows));
      showToast({ type: "ok", title: "Exported", message: "Report CSV downloaded." });
    });
  }

  const printReportBtn = document.querySelector("#printReportBtn");
  if (printReportBtn) {
    printReportBtn.addEventListener("click", () => window.print());
  }

  modeEl?.addEventListener("change", () => {
    syncModeUI();
    render(modeEl.value);
  });
  [startEl, endEl, monthFromEl, monthToEl].forEach((el) => {
    el?.addEventListener("input", () => render(modeEl?.value || "daily"));
    el?.addEventListener("change", () => render(modeEl?.value || "daily"));
  });

  // defaults
  syncModeUI();
  const today = normalizeDateOnly(new Date());
  if (startEl && endEl) {
    startEl.value = today;
    endEl.value = today;
  }
  if (monthFromEl && monthToEl) {
    const month = today.slice(0, 7);
    monthFromEl.value = month;
    monthToEl.value = month;
  }

  render(modeEl?.value || "daily");
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  if (document.querySelector("#reportApp")) initReportApp();
});

