/* =====================================================================
   SMART EXPENSE TRACKER - APPLICATION LOGIC
   Author: Karthik Yadav
   Description: Vanilla JavaScript (ES6) application logic for a
   premium personal finance management dashboard. Uses LocalStorage
   for persistence and Chart.js for data visualization.
   ===================================================================== */

"use strict";

/* =====================================================================
   1. CONSTANTS & STORAGE KEYS
   ===================================================================== */
const STORAGE_KEYS = Object.freeze({
  TRANSACTIONS: "expenseTracker_transactions",
  BUDGET: "expenseTracker_budget",
  THEME: "expenseTracker_theme",
  SETTINGS: "expenseTracker_settings",
});

const CATEGORY_LABELS = Object.freeze({
  Food: "Food & Dining",
  Transport: "Transport",
  Shopping: "Shopping",
  Bills: "Bills & Utilities",
  Entertainment: "Entertainment",
  Health: "Health & Fitness",
  Education: "Education",
  Salary: "Salary",
  Freelance: "Freelance",
  Investment: "Investment",
  Other: "Other",
});

const CHART_COLOR_PALETTE = [
  "#2563eb", "#06b6d4", "#22c55e", "#f59e0b",
  "#ef4444", "#9333ea", "#f472b6", "#14b8a6",
  "#a855f7", "#84cc16", "#0ea5e9",
];

const DEBOUNCE_DELAY_MS = 300;

/* =====================================================================
   2. APPLICATION STATE (in-memory, synced with LocalStorage)
   ===================================================================== */
const appState = {
  transactions: [],   // Array of transaction objects
  monthlyBudget: 0,   // Number
  settings: {
    currency: "₹",
    notificationsEnabled: true,
  },
  filters: {
    searchTerm: "",
    category: "all",
    type: "all",
    month: "",
    sortBy: "newest",
  },
  pendingDeleteId: null, // Used by the delete confirmation modal
  charts: {
    pie: null,
    bar: null,
    line: null,
  },
};

/* =====================================================================
   3. UTILITY / HELPER FUNCTIONS
   ===================================================================== */

/**
 * Generates a reasonably unique ID using timestamp + random suffix.
 * @returns {string} unique identifier
 */
function generateUniqueId() {
  return `txn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

/**
 * Formats a numeric value into a currency string using the selected symbol.
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const symbol = appState.settings.currency || "₹";
  return `${symbol}${safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a readable format.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return "-";
  const dateObj = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) return isoDate;
  return dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Escapes HTML special characters to prevent injection when rendering
 * user-provided text content into the DOM as innerHTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Creates a debounced version of a function. Delays execution until
 * `delay` milliseconds have passed since the last invocation.
 * @param {Function} callback
 * @param {number} delay
 * @returns {Function}
 */
function debounce(callback, delay) {
  let timerId;
  return function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback.apply(this, args), delay);
  };
}

/**
 * Creates a throttled version of a function that only executes at
 * most once every `limit` milliseconds.
 * @param {Function} callback
 * @param {number} limit
 * @returns {Function}
 */
function throttle(callback, limit) {
  let waiting = false;
  return function throttled(...args) {
    if (!waiting) {
      callback.apply(this, args);
      waiting = true;
      setTimeout(() => { waiting = false; }, limit);
    }
  };
}

/**
 * Safely reads and parses JSON data from LocalStorage.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function readFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read "${key}" from LocalStorage:`, error);
    return fallback;
  }
}

/**
 * Safely writes data to LocalStorage as JSON.
 * @param {string} key
 * @param {*} value
 * @returns {boolean} success flag
 */
function writeToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to write "${key}" to LocalStorage:`, error);
    showToast("Storage error: could not save your data.", "danger");
    return false;
  }
}

/* =====================================================================
   4. TOAST NOTIFICATIONS
   ===================================================================== */
const TOAST_ICONS = {
  success: "fa-circle-check",
  danger: "fa-circle-xmark",
  warning: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

/**
 * Displays a toast notification if notifications are enabled in settings.
 * @param {string} message
 * @param {"success"|"danger"|"warning"|"info"} type
 */
function showToast(message, type = "info") {
  if (!appState.settings.notificationsEnabled) return;

  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info} toast-icon"></i>
    <div class="toast-content"><p>${escapeHtml(message)}</p></div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

/* =====================================================================
   5. LOCALSTORAGE PERSISTENCE LAYER
   ===================================================================== */

function loadStateFromStorage() {
  appState.transactions = readFromStorage(STORAGE_KEYS.TRANSACTIONS, []);
  appState.monthlyBudget = readFromStorage(STORAGE_KEYS.BUDGET, 0);
  appState.settings = {
    ...appState.settings,
    ...readFromStorage(STORAGE_KEYS.SETTINGS, {}),
  };
}

function saveTransactions() {
  writeToStorage(STORAGE_KEYS.TRANSACTIONS, appState.transactions);
}

function saveBudget() {
  writeToStorage(STORAGE_KEYS.BUDGET, appState.monthlyBudget);
}

function saveSettings() {
  writeToStorage(STORAGE_KEYS.SETTINGS, appState.settings);
}

/* =====================================================================
   6. FORM VALIDATION
   ===================================================================== */

/**
 * Validates the transaction form fields and displays inline errors.
 * @param {Object} data - Extracted form values
 * @returns {boolean} true if the form data is valid
 */
function validateTransactionForm(data) {
  let isValid = true;

  const titleError = document.getElementById("titleError");
  const amountError = document.getElementById("amountError");
  const categoryError = document.getElementById("categoryError");
  const dateError = document.getElementById("dateError");

  [titleError, amountError, categoryError, dateError].forEach((el) => {
    if (el) el.textContent = "";
  });
  ["titleInput", "amountInput", "categoryInput", "dateInput"].forEach((id) => {
    document.getElementById(id).classList.remove("input-error");
  });

  if (!data.title || data.title.trim().length < 2) {
    titleError.textContent = "Please enter a valid title (min 2 characters).";
    document.getElementById("titleInput").classList.add("input-error");
    isValid = false;
  }

  if (Number.isNaN(data.amount) || data.amount <= 0) {
    amountError.textContent = "Amount must be a positive number.";
    document.getElementById("amountInput").classList.add("input-error");
    isValid = false;
  } else if (data.amount > 100000000) {
    amountError.textContent = "Amount seems too large. Please check the value.";
    document.getElementById("amountInput").classList.add("input-error");
    isValid = false;
  }

  if (!data.category) {
    categoryError.textContent = "Please select a category.";
    document.getElementById("categoryInput").classList.add("input-error");
    isValid = false;
  }

  if (!data.date) {
    dateError.textContent = "Please select a valid date.";
    document.getElementById("dateInput").classList.add("input-error");
    isValid = false;
  } else {
    const selectedDate = new Date(`${data.date}T00:00:00`);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (Number.isNaN(selectedDate.getTime())) {
      dateError.textContent = "Invalid date format.";
      document.getElementById("dateInput").classList.add("input-error");
      isValid = false;
    } else if (selectedDate > today) {
      dateError.textContent = "Date cannot be in the future.";
      document.getElementById("dateInput").classList.add("input-error");
      isValid = false;
    }
  }

  return isValid;
}

/* =====================================================================
   7. CRUD OPERATIONS FOR TRANSACTIONS
   ===================================================================== */

/**
 * Adds a new transaction to state and persists it.
 * @param {Object} transactionData
 */
function createTransaction(transactionData) {
  const newTransaction = {
    id: generateUniqueId(),
    title: transactionData.title.trim(),
    amount: parseFloat(transactionData.amount),
    category: transactionData.category,
    type: transactionData.type,
    date: transactionData.date,
    notes: transactionData.notes ? transactionData.notes.trim() : "",
    createdAt: new Date().toISOString(),
  };

  appState.transactions.push(newTransaction);
  saveTransactions();
  showToast("Transaction added successfully.", "success");
}

/**
 * Updates an existing transaction identified by ID.
 * @param {string} id
 * @param {Object} updatedData
 */
function updateTransaction(id, updatedData) {
  const index = appState.transactions.findIndex((txn) => txn.id === id);
  if (index === -1) {
    showToast("Transaction not found.", "danger");
    return;
  }

  appState.transactions[index] = {
    ...appState.transactions[index],
    title: updatedData.title.trim(),
    amount: parseFloat(updatedData.amount),
    category: updatedData.category,
    type: updatedData.type,
    date: updatedData.date,
    notes: updatedData.notes ? updatedData.notes.trim() : "",
  };

  saveTransactions();
  showToast("Transaction updated successfully.", "success");
}

/**
 * Removes a transaction from state by ID.
 * @param {string} id
 */
function deleteTransaction(id) {
  appState.transactions = appState.transactions.filter((txn) => txn.id !== id);
  saveTransactions();
  showToast("Transaction deleted successfully.", "success");
}

/**
 * Finds a single transaction by its ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
function findTransactionById(id) {
  return appState.transactions.find((txn) => txn.id === id);
}

/* =====================================================================
   8. FILTERING / SEARCHING / SORTING (uses map, filter, reduce, sort)
   ===================================================================== */

/**
 * Applies search term, category, type and month filters, then sorts
 * the resulting list according to the selected sort option.
 * @returns {Array<Object>}
 */
function getFilteredAndSortedTransactions() {
  const { searchTerm, category, type, month, sortBy } = appState.filters;
  const lowerSearch = searchTerm.trim().toLowerCase();

  let result = appState.transactions.filter((txn) => {
    const matchesSearch =
      !lowerSearch ||
      txn.title.toLowerCase().includes(lowerSearch) ||
      txn.category.toLowerCase().includes(lowerSearch) ||
      String(txn.amount).includes(lowerSearch);

    const matchesCategory = category === "all" || txn.category === category;
    const matchesType = type === "all" || txn.type === type;
    const matchesMonth = !month || txn.date.slice(0, 7) === month;

    return matchesSearch && matchesCategory && matchesType && matchesMonth;
  });

  const sorters = {
    newest: (a, b) => new Date(b.date) - new Date(a.date),
    oldest: (a, b) => new Date(a.date) - new Date(b.date),
    highest: (a, b) => b.amount - a.amount,
    lowest: (a, b) => a.amount - b.amount,
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
  };

  result = [...result].sort(sorters[sortBy] || sorters.newest);
  return result;
}

/* =====================================================================
   9. FINANCIAL CALCULATIONS (uses reduce, filter, destructuring)
   ===================================================================== */

/**
 * Computes all dashboard-level financial figures from the full
 * transaction list (not the filtered view).
 * @returns {Object} calculated financial metrics
 */
function calculateFinancialSummary() {
  const { transactions, monthlyBudget } = appState;

  const totalIncome = transactions
    .filter((txn) => txn.type === "income")
    .reduce((sum, txn) => sum + txn.amount, 0);

  const totalExpense = transactions
    .filter((txn) => txn.type === "expense")
    .reduce((sum, txn) => sum + txn.amount, 0);

  const currentBalance = totalIncome - totalExpense;
  const spentAmount = totalExpense;
  const remainingBudget = monthlyBudget - spentAmount;
  const savings = remainingBudget > 0 ? remainingBudget : 0;
  const budgetUsedPercent = monthlyBudget > 0
    ? Math.min(Math.round((spentAmount / monthlyBudget) * 100), 999)
    : 0;

  const expenseAmounts = transactions
    .filter((txn) => txn.type === "expense")
    .map((txn) => txn.amount);

  const averageExpense = expenseAmounts.length
    ? expenseAmounts.reduce((a, b) => a + b, 0) / expenseAmounts.length
    : 0;

  const highestExpense = expenseAmounts.length ? Math.max(...expenseAmounts) : 0;
  const lowestExpense = expenseAmounts.length ? Math.min(...expenseAmounts) : 0;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthlyIncome = transactions
    .filter((txn) => txn.type === "income" && txn.date.slice(0, 7) === currentMonthKey)
    .reduce((sum, txn) => sum + txn.amount, 0);

  const monthlyExpense = transactions
    .filter((txn) => txn.type === "expense" && txn.date.slice(0, 7) === currentMonthKey)
    .reduce((sum, txn) => sum + txn.amount, 0);

  return {
    totalIncome,
    totalExpense,
    currentBalance,
    remainingBudget,
    savings,
    budgetUsedPercent,
    averageExpense,
    highestExpense,
    lowestExpense,
    monthlyIncome,
    monthlyExpense,
    totalTransactions: transactions.length,
  };
}

/* =====================================================================
   10. ANIMATED COUNTER
   ===================================================================== */

/**
 * Animates a numeric value counting up inside a target element.
 * @param {HTMLElement} element
 * @param {number} endValue
 * @param {boolean} isCurrency
 */
function animateCounter(element, endValue, isCurrency = true) {
  if (!element) return;
  const startValue = 0;
  const duration = 900;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (endValue - startValue) * easedProgress;

    element.textContent = isCurrency
      ? formatCurrency(currentValue)
      : Math.round(currentValue).toLocaleString("en-IN");

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = isCurrency ? formatCurrency(endValue) : endValue.toLocaleString("en-IN");
    }
  }

  requestAnimationFrame(step);
}

/* =====================================================================
   11. RENDERING: DASHBOARD CARDS & HERO
   ===================================================================== */

function renderDashboardSummary() {
  const summary = calculateFinancialSummary();

  animateCounter(document.getElementById("statBalance"), summary.currentBalance);
  animateCounter(document.getElementById("statBudget"), appState.monthlyBudget);
  animateCounter(document.getElementById("statIncome"), summary.totalIncome);
  animateCounter(document.getElementById("statExpense"), summary.totalExpense);
  animateCounter(document.getElementById("statSavings"), summary.savings);
  animateCounter(document.getElementById("statTransactions"), summary.totalTransactions, false);

  document.getElementById("heroBalance").textContent = formatCurrency(summary.currentBalance);
  document.getElementById("heroIncome").textContent = formatCurrency(summary.totalIncome);
  document.getElementById("heroExpense").textContent = formatCurrency(summary.totalExpense);

  renderBudgetSection(summary);
  renderAnalyticsSummary(summary);
}

/* =====================================================================
   12. RENDERING: TRANSACTION TABLE
   ===================================================================== */

function renderTransactionsTable() {
  const tbody = document.getElementById("transactionsTableBody");
  const emptyState = document.getElementById("emptyState");
  const resultsCount = document.getElementById("resultsCount");
  const filtered = getFilteredAndSortedTransactions();

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.hidden = false;
    resultsCount.textContent = "No transactions to display.";
    return;
  }

  emptyState.hidden = true;
  resultsCount.textContent = `Showing ${filtered.length} of ${appState.transactions.length} transaction(s).`;

  const rowsHtml = filtered.map((txn, index) => {
    const shortId = txn.id.slice(-6).toUpperCase();
    const categoryLabel = CATEGORY_LABELS[txn.category] || txn.category;
    const typeBadgeClass = txn.type === "income" ? "badge-income" : "badge-expense";
    const amountClass = txn.type === "income" ? "amount-income" : "amount-expense";
    const amountPrefix = txn.type === "income" ? "+" : "-";

    return `
      <tr style="animation-delay:${Math.min(index * 30, 400)}ms">
        <td>#${escapeHtml(shortId)}</td>
        <td>${escapeHtml(txn.title)}</td>
        <td>${escapeHtml(categoryLabel)}</td>
        <td class="${amountClass}">${amountPrefix}${formatCurrency(txn.amount)}</td>
        <td><span class="badge ${typeBadgeClass}">${txn.type === "income" ? "Income" : "Expense"}</span></td>
        <td>${formatDate(txn.date)}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn action-view" data-action="view" data-id="${txn.id}" aria-label="View transaction" title="View">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="action-btn action-edit" data-action="edit" data-id="${txn.id}" aria-label="Edit transaction" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="action-btn action-delete" data-action="delete" data-id="${txn.id}" aria-label="Delete transaction" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rowsHtml;
}

/* =====================================================================
   13. RENDERING: BUDGET SECTION
   ===================================================================== */

function renderBudgetSection(summary) {
  const spent = summary.totalExpense;
  const budget = appState.monthlyBudget;
  const remaining = budget - spent;
  const usedPercent = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;

  document.getElementById("budgetSpentAmount").textContent = formatCurrency(spent);
  document.getElementById("budgetRemainingAmount").textContent = formatCurrency(remaining > 0 ? remaining : 0);
  document.getElementById("budgetUsedPercent").textContent = `${budget > 0 ? Math.round((spent / budget) * 100) : 0}%`;

  const progressBar = document.getElementById("budgetProgressBar");
  const progressFill = document.getElementById("budgetProgressFill");
  const alertMsg = document.getElementById("budgetAlertMsg");

  progressBar.setAttribute("aria-valuenow", String(usedPercent));
  progressFill.style.width = `${usedPercent}%`;

  progressFill.classList.remove("progress-warning", "progress-danger");
  if (budget > 0 && spent > budget) {
    progressFill.classList.add("progress-danger");
    alertMsg.hidden = false;
  } else if (budget > 0 && usedPercent >= 80) {
    progressFill.classList.add("progress-warning");
    alertMsg.hidden = true;
  } else {
    alertMsg.hidden = true;
  }

  document.getElementById("budgetInput").value = budget > 0 ? budget : "";
}

/* =====================================================================
   14. RENDERING: ANALYTICS SUMMARY CARDS
   ===================================================================== */

function renderAnalyticsSummary(summary) {
  document.getElementById("anMonthlyIncome").textContent = formatCurrency(summary.monthlyIncome);
  document.getElementById("anMonthlyExpense").textContent = formatCurrency(summary.monthlyExpense);
  document.getElementById("anSavings").textContent = formatCurrency(summary.savings);
  document.getElementById("anBudgetUsed").textContent = `${summary.budgetUsedPercent}%`;
  document.getElementById("anBudgetRemaining").textContent = formatCurrency(
    summary.remainingBudget > 0 ? summary.remainingBudget : 0
  );
  document.getElementById("anAvgExpense").textContent = formatCurrency(summary.averageExpense);
  document.getElementById("anHighestExpense").textContent = formatCurrency(summary.highestExpense);
  document.getElementById("anLowestExpense").textContent = formatCurrency(summary.lowestExpense);
}

/* =====================================================================
   15. CHART.JS VISUALIZATIONS
   ===================================================================== */

/**
 * Builds the data needed for the "Expenses by Category" pie chart.
 * @returns {{labels: string[], data: number[]}}
 */
function buildCategoryChartData() {
  const expenseByCategory = appState.transactions
    .filter((txn) => txn.type === "expense")
    .reduce((acc, txn) => {
      const label = CATEGORY_LABELS[txn.category] || txn.category;
      acc[label] = (acc[label] || 0) + txn.amount;
      return acc;
    }, {});

  return {
    labels: Object.keys(expenseByCategory),
    data: Object.values(expenseByCategory),
  };
}

/**
 * Builds monthly expense totals for the last 6 months for the bar chart.
 * @returns {{labels: string[], data: number[]}}
 */
function buildMonthlyExpenseChartData() {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    });
  }

  const totalsByMonth = months.map(({ key }) =>
    appState.transactions
      .filter((txn) => txn.type === "expense" && txn.date.slice(0, 7) === key)
      .reduce((sum, txn) => sum + txn.amount, 0)
  );

  return { labels: months.map((m) => m.label), data: totalsByMonth };
}

/**
 * Builds income vs expense trend data for the last 6 months.
 * @returns {{labels: string[], income: number[], expense: number[]}}
 */
function buildIncomeExpenseTrendData() {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    });
  }

  const income = months.map(({ key }) =>
    appState.transactions
      .filter((txn) => txn.type === "income" && txn.date.slice(0, 7) === key)
      .reduce((sum, txn) => sum + txn.amount, 0)
  );

  const expense = months.map(({ key }) =>
    appState.transactions
      .filter((txn) => txn.type === "expense" && txn.date.slice(0, 7) === key)
      .reduce((sum, txn) => sum + txn.amount, 0)
  );

  return { labels: months.map((m) => m.label), income, expense };
}

/**
 * Returns the current theme-aware chart text/grid colors.
 * @returns {{text: string, grid: string}}
 */
function getChartThemeColors() {
  const isDark = document.body.classList.contains("dark-theme");
  return {
    text: isDark ? "#b6c2d9" : "#64748b",
    grid: isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.18)",
  };
}

/**
 * (Re)renders all three Chart.js visualizations using the latest data.
 * Wrapped in try...catch to gracefully handle any rendering errors.
 */
function renderAllCharts() {
  try {
    const themeColors = getChartThemeColors();

    renderCategoryPieChart(themeColors);
    renderMonthlyBarChart(themeColors);
    renderIncomeExpenseLineChart(themeColors);
  } catch (error) {
    console.error("Chart rendering error:", error);
    showToast("Unable to render charts at this time.", "warning");
  }
}

function renderCategoryPieChart(themeColors) {
  const ctx = document.getElementById("categoryPieChart");
  if (!ctx) return;
  const { labels, data } = buildCategoryChartData();

  if (appState.charts.pie) appState.charts.pie.destroy();

  appState.charts.pie = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels.length ? labels : ["No expenses yet"],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: CHART_COLOR_PALETTE,
        borderWidth: 2,
        borderColor: document.body.classList.contains("dark-theme") ? "#16213a" : "#ffffff",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: themeColors.text, boxWidth: 14, padding: 14 } },
      },
    },
  });
}

function renderMonthlyBarChart(themeColors) {
  const ctx = document.getElementById("monthlyBarChart");
  if (!ctx) return;
  const { labels, data } = buildMonthlyExpenseChartData();

  if (appState.charts.bar) appState.charts.bar.destroy();

  appState.charts.bar = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Monthly Expenses",
        data,
        backgroundColor: "#2563eb",
        borderRadius: 8,
        maxBarThickness: 42,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: themeColors.text }, grid: { display: false } },
        y: { ticks: { color: themeColors.text }, grid: { color: themeColors.grid }, beginAtZero: true },
      },
    },
  });
}

function renderIncomeExpenseLineChart(themeColors) {
  const ctx = document.getElementById("incomeExpenseLineChart");
  if (!ctx) return;
  const { labels, income, expense } = buildIncomeExpenseTrendData();

  if (appState.charts.line) appState.charts.line.destroy();

  appState.charts.line = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Income",
          data: income,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
        },
        {
          label: "Expense",
          data: expense,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: themeColors.text } } },
      scales: {
        x: { ticks: { color: themeColors.text }, grid: { display: false } },
        y: { ticks: { color: themeColors.text }, grid: { color: themeColors.grid }, beginAtZero: true },
      },
    },
  });
}

/* =====================================================================
   16. MASTER RENDER FUNCTION
   ===================================================================== */

function renderApp() {
  renderDashboardSummary();
  renderTransactionsTable();
  renderAllCharts();
}

/* =====================================================================
   17. VIEW / EDIT / DELETE MODAL HANDLERS
   ===================================================================== */

function openViewModal(id) {
  const txn = findTransactionById(id);
  if (!txn) return;

  const body = document.getElementById("viewModalBody");
  body.innerHTML = `
    <dl>
      <div><dt>Title</dt><dd>${escapeHtml(txn.title)}</dd></div>
      <div><dt>Amount</dt><dd>${formatCurrency(txn.amount)}</dd></div>
      <div><dt>Category</dt><dd>${escapeHtml(CATEGORY_LABELS[txn.category] || txn.category)}</dd></div>
      <div><dt>Type</dt><dd>${txn.type === "income" ? "Income" : "Expense"}</dd></div>
      <div><dt>Date</dt><dd>${formatDate(txn.date)}</dd></div>
      <div><dt>Transaction ID</dt><dd>#${escapeHtml(txn.id.slice(-6).toUpperCase())}</dd></div>
    </dl>
    ${txn.notes ? `<p style="margin-top:18px;"><strong>Notes:</strong> ${escapeHtml(txn.notes)}</p>` : ""}
  `;

  toggleModal("viewModalOverlay", true);
}

function openEditForm(id) {
  const txn = findTransactionById(id);
  if (!txn) return;

  document.getElementById("transactionId").value = txn.id;
  document.getElementById("titleInput").value = txn.title;
  document.getElementById("amountInput").value = txn.amount;
  document.getElementById("categoryInput").value = txn.category;
  document.getElementById("typeInput").value = txn.type;
  document.getElementById("dateInput").value = txn.date;
  document.getElementById("notesInput").value = txn.notes || "";

  document.getElementById("submitBtnText").textContent = "Update Transaction";
  document.getElementById("addTransaction").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("titleInput").focus();
}

function openDeleteModal(id) {
  appState.pendingDeleteId = id;
  toggleModal("deleteModalOverlay", true);
}

/**
 * Shows or hides a modal overlay by ID, managing focus and inert state.
 * @param {string} overlayId
 * @param {boolean} show
 */
function toggleModal(overlayId, show) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.hidden = !show;
}

/* =====================================================================
   18. EXPORT / IMPORT / BACKUP FEATURES
   ===================================================================== */

/**
 * Triggers a browser file download for the given text content.
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 */
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportTransactionsAsCsv() {
  if (appState.transactions.length === 0) {
    showToast("There are no transactions to export.", "warning");
    return;
  }

  const headers = ["ID", "Title", "Category", "Amount", "Type", "Date", "Notes"];
  const rows = appState.transactions.map((txn) => [
    txn.id, txn.title, CATEGORY_LABELS[txn.category] || txn.category,
    txn.amount, txn.type, txn.date, txn.notes || "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  downloadFile(`smart-expense-tracker-${Date.now()}.csv`, csvContent, "text/csv");
  showToast("Export completed successfully.", "success");
}

function exportTransactionsAsJson() {
  if (appState.transactions.length === 0) {
    showToast("There are no transactions to export.", "warning");
    return;
  }
  downloadFile(
    `smart-expense-tracker-${Date.now()}.json`,
    JSON.stringify(appState.transactions, null, 2),
    "application/json"
  );
  showToast("Export completed successfully.", "success");
}

function printFinancialReport() {
  window.print();
}

/**
 * Validates that an imported object looks like a proper transaction.
 * @param {*} item
 * @returns {boolean}
 */
function isValidTransactionShape(item) {
  return (
    item &&
    typeof item.title === "string" &&
    typeof item.amount === "number" &&
    typeof item.category === "string" &&
    (item.type === "income" || item.type === "expense") &&
    typeof item.date === "string"
  );
}

/**
 * Imports transactions from a user-selected JSON file, validating
 * each record and skipping duplicates by ID.
 * @param {File} file
 */
function importTransactionsFromFile(file) {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const incoming = Array.isArray(parsed) ? parsed : [];

      const existingIds = new Set(appState.transactions.map((txn) => txn.id));
      let importedCount = 0;

      incoming.forEach((item) => {
        if (!isValidTransactionShape(item)) return;
        const id = existingIds.has(item.id) ? generateUniqueId() : (item.id || generateUniqueId());
        if (existingIds.has(id)) return;

        appState.transactions.push({
          id,
          title: item.title.trim(),
          amount: item.amount,
          category: item.category,
          type: item.type,
          date: item.date,
          notes: item.notes || "",
          createdAt: item.createdAt || new Date().toISOString(),
        });
        existingIds.add(id);
        importedCount += 1;
      });

      if (importedCount > 0) {
        saveTransactions();
        renderApp();
        showToast(`Import completed: ${importedCount} transaction(s) added.`, "success");
      } else {
        showToast("No valid transactions found in the selected file.", "warning");
      }
    } catch (error) {
      console.error("Import error:", error);
      showToast("Failed to import file: invalid JSON format.", "danger");
    }
  };

  reader.onerror = () => {
    showToast("Failed to read the selected file.", "danger");
  };

  reader.readAsText(file);
}

function backupAllData() {
  const backupPayload = {
    transactions: appState.transactions,
    monthlyBudget: appState.monthlyBudget,
    settings: appState.settings,
    exportedAt: new Date().toISOString(),
  };
  downloadFile(
    `smart-expense-tracker-backup-${Date.now()}.json`,
    JSON.stringify(backupPayload, null, 2),
    "application/json"
  );
  showToast("Backup downloaded successfully.", "success");
}

function restoreAllData(file) {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);

      if (Array.isArray(parsed.transactions)) {
        appState.transactions = parsed.transactions.filter(isValidTransactionShape);
      }
      if (typeof parsed.monthlyBudget === "number") {
        appState.monthlyBudget = parsed.monthlyBudget;
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        appState.settings = { ...appState.settings, ...parsed.settings };
      }

      saveTransactions();
      saveBudget();
      saveSettings();
      applyCurrentTheme();
      renderApp();
      showToast("Data restored successfully.", "success");
    } catch (error) {
      console.error("Restore error:", error);
      showToast("Failed to restore data: invalid backup file.", "danger");
    }
  };

  reader.readAsText(file);
}

function clearAllApplicationData() {
  appState.transactions = [];
  appState.monthlyBudget = 0;
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
  localStorage.removeItem(STORAGE_KEYS.BUDGET);
  renderApp();
  showToast("All data has been cleared.", "success");
}

/* =====================================================================
   19. THEME (DARK / LIGHT MODE)
   ===================================================================== */

function applyCurrentTheme() {
  const savedTheme = readFromStorage(STORAGE_KEYS.THEME, "light");
  const themeIcon = document.getElementById("themeIcon");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeIcon) {
      themeIcon.classList.remove("fa-moon");
      themeIcon.classList.add("fa-sun");
    }
  } else {
    document.body.classList.remove("dark-theme");
    if (themeIcon) {
      themeIcon.classList.remove("fa-sun");
      themeIcon.classList.add("fa-moon");
    }
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark-theme");
  writeToStorage(STORAGE_KEYS.THEME, isDark ? "dark" : "light");

  const themeIcon = document.getElementById("themeIcon");
  if (themeIcon) {
    themeIcon.classList.toggle("fa-moon", !isDark);
    themeIcon.classList.toggle("fa-sun", isDark);
  }

  renderAllCharts();
}

/* =====================================================================
   20. EVENT HANDLERS: TRANSACTION FORM
   ===================================================================== */

function handleTransactionFormSubmit(event) {
  event.preventDefault();

  const idField = document.getElementById("transactionId");
  const formData = {
    title: document.getElementById("titleInput").value,
    amount: parseFloat(document.getElementById("amountInput").value),
    category: document.getElementById("categoryInput").value,
    type: document.getElementById("typeInput").value,
    date: document.getElementById("dateInput").value,
    notes: document.getElementById("notesInput").value,
  };

  if (!validateTransactionForm(formData)) return;

  if (idField.value) {
    updateTransaction(idField.value, formData);
  } else {
    createTransaction(formData);
  }

  resetTransactionForm();
  renderApp();
}

function resetTransactionForm() {
  document.getElementById("transactionForm").reset();
  document.getElementById("transactionId").value = "";
  document.getElementById("submitBtnText").textContent = "Add Transaction";
  document.getElementById("dateInput").value = new Date().toISOString().slice(0, 10);

  ["titleError", "amountError", "categoryError", "dateError"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  ["titleInput", "amountInput", "categoryInput", "dateInput"].forEach((id) => {
    document.getElementById(id).classList.remove("input-error");
  });
}

/* =====================================================================
   21. EVENT HANDLERS: TABLE ACTION BUTTONS (event delegation)
   ===================================================================== */

function handleTableActionClick(event) {
  const actionBtn = event.target.closest("[data-action]");
  if (!actionBtn) return;

  const { action, id } = actionBtn.dataset;

  if (action === "view") openViewModal(id);
  if (action === "edit") openEditForm(id);
  if (action === "delete") openDeleteModal(id);
}

/* =====================================================================
   22. EVENT HANDLERS: BUDGET FORM
   ===================================================================== */

function handleBudgetFormSubmit(event) {
  event.preventDefault();
  const budgetError = document.getElementById("budgetError");
  const value = parseFloat(document.getElementById("budgetInput").value);

  budgetError.textContent = "";

  if (Number.isNaN(value) || value < 0) {
    budgetError.textContent = "Please enter a valid budget amount.";
    return;
  }

  appState.monthlyBudget = value;
  saveBudget();
  renderApp();
  showToast("Budget updated successfully.", "success");
}

/* =====================================================================
   23. EVENT HANDLERS: SEARCH / FILTER / SORT TOOLBAR
   ===================================================================== */

const handleSearchInput = debounce((event) => {
  appState.filters.searchTerm = event.target.value;
  renderTransactionsTable();
}, DEBOUNCE_DELAY_MS);

function handleFilterChange() {
  appState.filters.category = document.getElementById("filterCategory").value;
  appState.filters.type = document.getElementById("filterType").value;
  appState.filters.month = document.getElementById("filterMonth").value;
  appState.filters.sortBy = document.getElementById("sortSelect").value;
  renderTransactionsTable();
}

function resetAllFilters() {
  appState.filters = { searchTerm: "", category: "all", type: "all", month: "", sortBy: "newest" };

  document.getElementById("searchInput").value = "";
  document.getElementById("filterCategory").value = "all";
  document.getElementById("filterType").value = "all";
  document.getElementById("filterMonth").value = "";
  document.getElementById("sortSelect").value = "newest";

  renderTransactionsTable();
  showToast("Filters have been reset.", "info");
}

/* =====================================================================
   24. NAVIGATION: MOBILE MENU, SCROLL SPY, SCROLL PROGRESS, BACK TO TOP
   ===================================================================== */

function initMobileNavigation() {
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const navLinks = document.getElementById("navLinks");

  hamburgerBtn.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("nav-open");
    hamburgerBtn.classList.toggle("open", isOpen);
    hamburgerBtn.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("nav-open");
      hamburgerBtn.classList.remove("open");
      hamburgerBtn.setAttribute("aria-expanded", "false");
    });
  });
}

function initScrollEffects() {
  const scrollProgress = document.getElementById("scrollProgress");
  const backToTopBtn = document.getElementById("backToTopBtn");

  const handleScroll = throttle(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progressPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    scrollProgress.style.width = `${progressPercent}%`;
    backToTopBtn.classList.toggle("visible", scrollTop > 420);
  }, 120);

  window.addEventListener("scroll", handleScroll);

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/**
 * Highlights the nav link corresponding to the section currently in view.
 */
function initScrollSpy() {
  const sections = ["hero", "transactions", "analytics", "budget", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const navLinkMap = {};
  document.querySelectorAll(".nav-link[data-nav]").forEach((link) => {
    const targetId = link.getAttribute("href").replace("#", "");
    if (targetId) navLinkMap[targetId] = link;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          Object.values(navLinkMap).forEach((link) => link.classList.remove("active-link"));
          const activeLink = navLinkMap[entry.target.id];
          if (activeLink) activeLink.classList.add("active-link");
        }
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
}

/* =====================================================================
   25. RIPPLE BUTTON EFFECT
   ===================================================================== */

function initRippleEffect() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".ripple");
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const circle = document.createElement("span");
    const size = Math.max(rect.width, rect.height);

    circle.className = "ripple-circle";
    circle.style.width = circle.style.height = `${size}px`;
    circle.style.left = `${event.clientX - rect.left - size / 2}px`;
    circle.style.top = `${event.clientY - rect.top - size / 2}px`;

    button.appendChild(circle);
    setTimeout(() => circle.remove(), 620);
  });
}

/* =====================================================================
   26. KEYBOARD ACCESSIBILITY (Escape closes modals)
   ===================================================================== */

function initKeyboardAccessibility() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ["viewModalOverlay", "deleteModalOverlay", "settingsModalOverlay"].forEach((id) => {
        toggleModal(id, false);
      });
    }
  });
}

/* =====================================================================
   27. SETTINGS MODAL HANDLERS
   ===================================================================== */

function applySettingsToUI() {
  document.getElementById("currencySelect").value = appState.settings.currency;
  document.getElementById("notificationToggle").checked = appState.settings.notificationsEnabled;
}

function initSettingsHandlers() {
  document.getElementById("settingsNavBtn").addEventListener("click", (event) => {
    event.preventDefault();
    applySettingsToUI();
    toggleModal("settingsModalOverlay", true);
  });

  document.getElementById("settingsModalCloseBtn").addEventListener("click", () => {
    toggleModal("settingsModalOverlay", false);
  });

  document.getElementById("settingsThemeBtn").addEventListener("click", toggleTheme);

  document.getElementById("currencySelect").addEventListener("change", (event) => {
    appState.settings.currency = event.target.value;
    saveSettings();
    renderApp();
    showToast("Currency preference updated.", "success");
  });

  document.getElementById("notificationToggle").addEventListener("change", (event) => {
    appState.settings.notificationsEnabled = event.target.checked;
    saveSettings();
  });

  document.getElementById("backupDataBtn").addEventListener("click", backupAllData);

  document.getElementById("restoreFileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) restoreAllData(file);
    event.target.value = "";
  });

  document.getElementById("clearAllDataBtn").addEventListener("click", () => {
    const confirmed = window.confirm("This will permanently delete ALL transactions and reset your budget. Continue?");
    if (confirmed) clearAllApplicationData();
  });
}

/* =====================================================================
   28. APPLICATION INITIALIZATION
   ===================================================================== */

function initEventListeners() {
  // Transaction form
  document.getElementById("transactionForm").addEventListener("submit", handleTransactionFormSubmit);
  document.getElementById("resetFormBtn").addEventListener("click", resetTransactionForm);

  // Table actions (delegated)
  document.getElementById("transactionsTableBody").addEventListener("click", handleTableActionClick);

  // View modal
  document.getElementById("viewModalCloseBtn").addEventListener("click", () => toggleModal("viewModalOverlay", false));
  document.getElementById("viewModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "viewModalOverlay") toggleModal("viewModalOverlay", false);
  });

  // Delete modal
  document.getElementById("deleteModalCloseBtn").addEventListener("click", () => toggleModal("deleteModalOverlay", false));
  document.getElementById("cancelDeleteBtn").addEventListener("click", () => toggleModal("deleteModalOverlay", false));
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    if (appState.pendingDeleteId) {
      deleteTransaction(appState.pendingDeleteId);
      appState.pendingDeleteId = null;
      renderApp();
    }
    toggleModal("deleteModalOverlay", false);
  });
  document.getElementById("deleteModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "deleteModalOverlay") toggleModal("deleteModalOverlay", false);
  });

  // Settings modal overlay backdrop click
  document.getElementById("settingsModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "settingsModalOverlay") toggleModal("settingsModalOverlay", false);
  });

  // Search / Filter / Sort
  document.getElementById("searchInput").addEventListener("input", handleSearchInput);
  document.getElementById("filterCategory").addEventListener("change", handleFilterChange);
  document.getElementById("filterType").addEventListener("change", handleFilterChange);
  document.getElementById("filterMonth").addEventListener("change", handleFilterChange);
  document.getElementById("sortSelect").addEventListener("change", handleFilterChange);
  document.getElementById("resetFiltersBtn").addEventListener("click", resetAllFilters);

  // Export / Import
  document.getElementById("exportCsvBtn").addEventListener("click", exportTransactionsAsCsv);
  document.getElementById("exportJsonBtn").addEventListener("click", exportTransactionsAsJson);
  document.getElementById("printReportBtn").addEventListener("click", printFinancialReport);
  document.getElementById("importFileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importTransactionsFromFile(file);
    event.target.value = "";
  });

  // Budget
  document.getElementById("budgetForm").addEventListener("submit", handleBudgetFormSubmit);

  // Theme toggle (navbar icon)
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

  // Hero quick action buttons
  document.getElementById("heroAddIncomeBtn").addEventListener("click", () => {
    document.getElementById("addTransaction").scrollIntoView({ behavior: "smooth" });
    document.getElementById("typeInput").value = "income";
    document.getElementById("titleInput").focus();
  });
  document.getElementById("heroAddExpenseBtn").addEventListener("click", () => {
    document.getElementById("addTransaction").scrollIntoView({ behavior: "smooth" });
    document.getElementById("typeInput").value = "expense";
    document.getElementById("titleInput").focus();
  });
  document.getElementById("heroViewReportsBtn").addEventListener("click", () => {
    document.getElementById("analytics").scrollIntoView({ behavior: "smooth" });
  });

  // Profile icon scrolls to about/contact section
  document.getElementById("profileBtn").addEventListener("click", () => {
    document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
  });
}

/**
 * Main application bootstrap function. Runs once the DOM is ready.
 */
function initApp() {
  try {
    loadStateFromStorage();
    applyCurrentTheme();

    document.getElementById("currentYear").textContent = new Date().getFullYear();
    document.getElementById("dateInput").value = new Date().toISOString().slice(0, 10);

    initEventListeners();
    initSettingsHandlers();
    initMobileNavigation();
    initScrollEffects();
    initScrollSpy();
    initRippleEffect();
    initKeyboardAccessibility();

    renderApp();
  } catch (error) {
    console.error("Application failed to initialize:", error);
    showToast("Something went wrong while starting the app.", "danger");
  } finally {
    const pageLoader = document.getElementById("pageLoader");
    setTimeout(() => {
      if (pageLoader) pageLoader.classList.add("loader-hidden");
    }, 500);
  }
}

document.addEventListener("DOMContentLoaded", initApp);
