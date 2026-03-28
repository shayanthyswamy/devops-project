/* Cake Billing System (frontend-only) */

const STORAGE = {
  invoicesKey: "cbs_invoices_v1",
  nextInvoiceKey: "cbs_next_invoice_number_v1",
  themeKey: "cbs_theme_v1",
};

const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function saveInvoices(invoices) {
  localStorage.setItem(STORAGE.invoicesKey, JSON.stringify(invoices));
}

function getNextInvoiceNumber() {
  const current = Number(localStorage.getItem(STORAGE.nextInvoiceKey) || "1");
  localStorage.setItem(STORAGE.nextInvoiceKey, String(current + 1));
  return current;
}

function normalizeDate(d) {
  // d: Date | string
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
}

function calcTotals({ items, taxRatePct, discountType, discountValue }) {
  const subtotal = items.reduce((sum, it) => sum + money(it.unitPrice) * money(it.qty), 0);
  const discountAmount =
    discountType === "percent"
      ? (subtotal * money(discountValue)) / 100
      : money(discountValue);
  const taxedBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxedBase * money(taxRatePct)) / 100;
  const grandTotal = taxedBase + taxAmount;
  return {
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal,
  };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast({ type = "ok", title, message }) {
  const wrap = document.querySelector(".toastWrap");
  if (!wrap) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "danger" ? "toastDanger" : "toastOk"}`;
  toast.innerHTML = `
    <div class="toastIcon">
      ${type === "danger" ? "!" : "✓"}
    </div>
    <div>
      <p class="toastTitle">${escapeHtml(title || (type === "danger" ? "Error" : "Saved"))}</p>
      <p class="toastMsg">${escapeHtml(message || "")}</p>
    </div>
  `;

  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity .2s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  }, 3200);
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
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderInvoiceList(invoices) {
  const list = document.querySelector("#invoiceList");
  if (!list) return;

  list.innerHTML = "";
  if (invoices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "small muted";
    empty.textContent = "No invoices yet. Create your first invoice!";
    list.appendChild(empty);
    return;
  }

  invoices
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 12)
    .forEach((inv) => {
      const total = fmt.format(money(inv.totals?.grandTotal));
      const el = document.createElement("div");
      el.className = "invoiceItem";
      el.innerHTML = `
        <div class="invoiceLeft">
          <div class="invoiceTop">
            <span class="badge"><span class="badgeDot"></span><span class="mono">${escapeHtml(inv.invoiceNumber || "")}</span></span>
            <span class="small">${escapeHtml(inv.date || "")}</span>
          </div>
          <div class="small muted">${escapeHtml(inv.customer?.name || "Walk-in customer")}</div>
        </div>
        <div style="text-align:right; display:flex; flex-direction:column; gap:6px;">
          <div style="font-weight:900;">${total}</div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button class="btn btnGhost" data-action="view" data-id="${encodeURIComponent(inv.id)}">View</button>
            <button class="btn btnDanger" data-action="del" data-id="${encodeURIComponent(inv.id)}">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(el);
    });
}

function openInvoiceModal(inv) {
  const overlay = document.querySelector("#modalOverlay");
  const modalBody = overlay?.querySelector("#modalBody");
  if (!overlay || !modalBody) return;

  const itemsHtml = (inv.items || [])
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td class="mono">${fmt.format(money(it.unitPrice))}</td>
        <td class="mono">${escapeHtml(it.qty)}</td>
        <td class="mono">${fmt.format(money(it.unitPrice) * money(it.qty))}</td>
      </tr>
    `
    )
    .join("");

  const totals = inv.totals || calcTotals(inv);
  modalBody.innerHTML = `
    <div class="modalHeader" style="padding:0 0 12px; border-bottom:none;">
      <div>
        <p class="modalTitle">Invoice ${escapeHtml(inv.invoiceNumber || "")}</p>
        <div class="small muted">Date: ${escapeHtml(inv.date || "")}</div>
      </div>
      <div class="btnRow no-print">
        <button class="btn" data-action="print">Print Invoice</button>
        <button class="btn" data-action="close">Close</button>
      </div>
    </div>

    <div class="twoCols">
      <div class="card" style="background: rgba(255,255,255,.02); box-shadow:none;">
        <p class="cardTitle">Customer</p>
        <div class="small muted">Name</div>
        <div style="font-weight:900; margin-bottom:10px;">${escapeHtml(inv.customer?.name || "Walk-in")}</div>
        <div class="small muted">Phone</div>
        <div style="font-weight:900;">${escapeHtml(inv.customer?.phone || "-")}</div>
      </div>

      <div class="card" style="background: rgba(255,255,255,.02); box-shadow:none;">
        <p class="cardTitle">Pricing</p>
        <div class="small muted">Tax rate</div>
        <div style="font-weight:900; margin-bottom:10px;" class="mono">${escapeHtml(inv.taxRatePct ?? 0)}%</div>
        <div class="small muted">Discount</div>
        <div style="font-weight:900;" class="mono">
          ${escapeHtml(inv.discount?.type || "amount")} ${escapeHtml(inv.discount?.value ?? 0)}
        </div>
      </div>
    </div>

    <div style="margin-top:14px;">
      <table class="table">
        <thead>
          <tr>
            <th>Cake</th>
            <th>Unit</th>
            <th>Qty</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || "<tr><td colspan='4' class='muted'>No items</td></tr>"}
        </tbody>
      </table>
    </div>

    <div style="margin-top:14px;" class="totals">
      <div class="totalItem">
        <div class="totalLabel">Subtotal</div>
        <div class="totalValue mono">${fmt.format(money(totals.subtotal))}</div>
      </div>
      <div class="totalItem">
        <div class="totalLabel">Discount</div>
        <div class="totalValue mono">-${fmt.format(money(totals.discountAmount))}</div>
      </div>
      <div class="totalItem">
        <div class="totalLabel">Tax</div>
        <div class="totalValue mono">${fmt.format(money(totals.taxAmount))}</div>
      </div>
      <div class="totalItem" style="border-color: rgba(110,231,255,.40); background: rgba(110,231,255,.08);">
        <div class="totalLabel">Grand total</div>
        <div class="totalValue mono">${fmt.format(money(totals.grandTotal))}</div>
      </div>
    </div>

    <div class="footerHint">Reports use these invoice totals by date.</div>
  `;
  overlay.classList.remove("hidden");
  overlay.style.display = "flex";

  const onOverlayClick = (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "close") {
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.removeEventListener("click", onOverlayClick);
      } else if (action === "print") {
        window.print();
      }
    };
  overlay.addEventListener("click", onOverlayClick);
}

function buildCsv(invoices) {
  const headers = [
    "InvoiceNumber",
    "InvoiceId",
    "Date",
    "CustomerName",
    "CustomerPhone",
    "Subtotal",
    "DiscountAmount",
    "TaxAmount",
    "GrandTotal",
    "ItemsCount",
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber || "",
    inv.id || "",
    inv.date || "",
    inv.customer?.name || "",
    inv.customer?.phone || "",
    money(inv.totals?.subtotal).toFixed(2),
    money(inv.totals?.discountAmount).toFixed(2),
    money(inv.totals?.taxAmount).toFixed(2),
    money(inv.totals?.grandTotal).toFixed(2),
    String((inv.items || []).length),
  ]);

  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };

  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

function initInvoiceApp() {
  const $ = (sel) => document.querySelector(sel);
  const itemsTableBody = $("#itemsTbody");
  const itemsCountEl = $("#itemsCount");
  const totalsEls = {
    subtotal: $("#subtotalValue"),
    discount: $("#discountAmountValue"),
    tax: $("#taxValue"),
    grand: $("#grandTotalValue"),
  };

  const customerName = $("#customerName");
  const customerPhone = $("#customerPhone");
  const invoiceDate = $("#invoiceDate");

  const cakeName = $("#cakeName");
  const unitPrice = $("#unitPrice");
  const qty = $("#qty");
  const addItemBtn = $("#addItemBtn");

  const items = [];

  const taxRatePct = $("#taxRatePct");
  const discountType = $("#discountType");
  const discountValue = $("#discountValue");
  const saveInvoiceBtn = $("#saveInvoiceBtn");
  const clearBtn = $("#clearBtn");
  const downloadBtn = $("#downloadCsvBtn");

  const initialInvoices = loadInvoices();
  renderInvoiceList(initialInvoices);

  function renderItems() {
    if (!itemsTableBody) return;
    itemsTableBody.innerHTML = "";
    items.forEach((it, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.name)}</td>
        <td class="mono">${fmt.format(money(it.unitPrice))}</td>
        <td class="mono">${escapeHtml(it.qty)}</td>
        <td class="mono">${fmt.format(money(it.unitPrice) * money(it.qty))}</td>
        <td style="text-align:right;">
          <button class="btn btnGhost" data-remove="${idx}">Remove</button>
        </td>
      `;
      itemsTableBody.appendChild(tr);
    });
    if (itemsCountEl) itemsCountEl.textContent = String(items.length);
    recalcAndRenderTotals();
  }

  function recalcAndRenderTotals() {
    const totals = calcTotals({
      items,
      taxRatePct: money(taxRatePct?.value),
      discountType: discountType?.value || "amount",
      discountValue: money(discountValue?.value),
    });
    if (totalsEls.subtotal) totalsEls.subtotal.textContent = fmt.format(totals.subtotal);
    if (totalsEls.discount) totalsEls.discount.textContent = fmt.format(totals.discountAmount);
    if (totalsEls.tax) totalsEls.tax.textContent = fmt.format(totals.taxAmount);
    if (totalsEls.grand) totalsEls.grand.textContent = fmt.format(totals.grandTotal);
  }

  function addItem() {
    const name = cakeName?.value?.trim();
    const p = money(unitPrice?.value);
    const q = Math.floor(money(qty?.value));
    if (!name) {
      showToast({ type: "danger", title: "Missing cake name", message: "Please enter a cake name." });
      return;
    }
    if (p <= 0) {
      showToast({ type: "danger", title: "Invalid price", message: "Unit price must be greater than 0." });
      return;
    }
    if (q <= 0) {
      showToast({ type: "danger", title: "Invalid quantity", message: "Quantity must be at least 1." });
      return;
    }

    items.push({ name, unitPrice: p, qty: q });

    if (cakeName) cakeName.value = "";
    if (unitPrice) unitPrice.value = "";
    if (qty) qty.value = "1";
    renderItems();
  }

  function resetInvoiceForm() {
    items.splice(0, items.length);
    renderItems();
    if (customerName) customerName.value = "";
    if (customerPhone) customerPhone.value = "";
    if (invoiceDate) invoiceDate.value = normalizeDate(new Date());
    if (cakeName) cakeName.value = "";
    if (unitPrice) unitPrice.value = "";
    if (qty) qty.value = "1";
    if (taxRatePct) taxRatePct.value = "0";
    if (discountType) discountType.value = "amount";
    if (discountValue) discountValue.value = "0";
    showToast({ type: "ok", title: "Cleared", message: "Invoice form reset." });
  }

  function saveInvoice() {
    if (items.length === 0) {
      showToast({ type: "danger", title: "No items", message: "Add at least one cake item." });
      return;
    }

    const invNumber = `INV-${String(getNextInvoiceNumber()).padStart(6, "0")}`;
    const date = invoiceDate?.value ? normalizeDate(invoiceDate.value) : normalizeDate(new Date());
    const cust = {
      name: customerName?.value?.trim() || "Walk-in customer",
      phone: customerPhone?.value?.trim() || "",
    };

    const discount = {
      type: discountType?.value || "amount",
      value: money(discountValue?.value),
    };

    const invoiceDraft = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      invoiceNumber: invNumber,
      date,
      createdAt: Date.now(),
      customer: cust,
      items: items.slice(),
      taxRatePct: money(taxRatePct?.value),
      discount,
    };

    invoiceDraft.totals = calcTotals({
      items: invoiceDraft.items,
      taxRatePct: invoiceDraft.taxRatePct,
      discountType: invoiceDraft.discount.type,
      discountValue: invoiceDraft.discount.value,
    });

    const invoices = loadInvoices();
    invoices.push(invoiceDraft);
    saveInvoices(invoices);
    renderInvoiceList(invoices);

    showToast({ type: "ok", title: "Invoice saved", message: `${invoiceDraft.invoiceNumber} added to your reports.` });
    resetInvoiceForm();
  }

  function deleteInvoice(id) {
    const invoices = loadInvoices();
    const next = invoices.filter((i) => String(i.id) !== String(id));
    saveInvoices(next);
    renderInvoiceList(next);
    showToast({ type: "ok", title: "Deleted", message: "Invoice removed." });
  }

  function attachGlobalHandlers() {
    document.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-action='view']");
      if (viewBtn) {
        const id = decodeURIComponent(viewBtn.getAttribute("data-id"));
        const inv = loadInvoices().find((i) => String(i.id) === String(id));
        if (inv) openInvoiceModal(inv);
        return;
      }

      const delBtn = e.target.closest("[data-action='del']");
      if (delBtn) {
        const id = decodeURIComponent(delBtn.getAttribute("data-id"));
        const inv = loadInvoices().find((i) => String(i.id) === String(id));
        const ok = window.confirm(`Delete invoice ${inv?.invoiceNumber || ""}?`);
        if (ok) deleteInvoice(id);
        return;
      }

      const removeBtn = e.target.closest("[data-remove]");
      if (removeBtn) {
        const idx = Number(removeBtn.getAttribute("data-remove"));
        if (Number.isFinite(idx) && idx >= 0) {
          items.splice(idx, 1);
          renderItems();
        }
        return;
      }
    });
  }

  // Hook events
  if (addItemBtn) addItemBtn.addEventListener("click", addItem);
  if (saveInvoiceBtn) saveInvoiceBtn.addEventListener("click", saveInvoice);
  if (clearBtn) clearBtn.addEventListener("click", resetInvoiceForm);

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const invoices = loadInvoices().slice();
      const csv = buildCsv(invoices);
      downloadText(`cake-billing-invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      showToast({ type: "ok", title: "CSV downloaded", message: "Invoices exported." });
    });
  }

  const printPageBtn = $("#printPageBtn");
  if (printPageBtn) {
    printPageBtn.addEventListener("click", () => window.print());
  }

  [taxRatePct, discountType, discountValue].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", recalcAndRenderTotals);
    el.addEventListener("change", recalcAndRenderTotals);
  });

  if (cakeName && unitPrice && qty) {
    [cakeName, unitPrice, qty].forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addItem();
        }
      });
    });
  }

  attachGlobalHandlers();
  renderItems();
  recalcAndRenderTotals();
}

// Entry
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  if (document.querySelector("#invoiceApp")) initInvoiceApp();
});

