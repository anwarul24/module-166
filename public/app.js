(() => {
  'use strict';

  // ----- Config -----
  const API = '/api/transactions';
  const CACHE_KEY = 'expense-tracker:transactions';
  const CURRENCY = 'USD'; // change to e.g. 'BDT', 'EUR', 'INR'
  const CATEGORIES = {
    expense: ['Food', 'Shopping', 'Transport', 'Bills', 'Health', 'Entertainment', 'Other'],
    income: ['Salary', 'Freelance', 'Gift', 'Other'],
  };

  // ----- State -----
  let transactions = [];
  let filter = 'all';
  let query = '';
  let editingId = null;
  let pendingDeleteId = null;

  // ----- Elements -----
  const $ = (s) => document.querySelector(s);
  const form = $('#form');
  const els = {
    balance: $('#balance'), income: $('#totalIncome'), expense: $('#totalExpense'),
    splitIn: $('#splitIncome'), splitOut: $('#splitExpense'),
    rows: $('#rows'), table: $('#table'), empty: $('#empty'),
    monthly: $('#monthly'), toast: $('#toast'), banner: $('#banner'),
    category: $('#category'), date: $('#date'), submit: $('#submitBtn'),
    cancel: $('#cancelEdit'), formTitle: $('#formTitle'), search: $('#search'),
    dialog: $('#confirm'), confirmText: $('#confirmText'),
  };

  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const formatDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ----- API + local cache -----
  async function api(path = '', options = {}) {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Request failed.');
      err.fieldErrors = data.errors;
      throw err;
    }
    return data;
  }

  const saveCache = () => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(transactions)); } catch (_) { /* storage full or blocked */ }
  };
  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch (_) { return []; }
  };

  // ----- UI helpers -----
  let toastTimer;
  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function showBanner(message) {
    els.banner.textContent = message || '';
    els.banner.hidden = !message;
  }

  function fillCategories(type, selected = '') {
    els.category.innerHTML = '<option value="">Choose a category</option>' +
      CATEGORIES[type].map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (selected && !CATEGORIES[type].includes(selected)) {
      els.category.insertAdjacentHTML('beforeend', `<option value="${esc(selected)}">${esc(selected)}</option>`);
    }
    els.category.value = selected;
  }

  function setErrors(errors = {}) {
    form.querySelectorAll('[data-error]').forEach((p) => {
      const msg = errors[p.dataset.error] || '';
      p.textContent = msg;
      p.closest('.field').classList.toggle('invalid', Boolean(msg));
    });
  }

  const selectedType = () => form.elements.type.value;

  // ----- Validation (mirrors server rules) -----
  function validate(values) {
    const errors = {};
    if (!values.title) errors.title = 'Enter a title.';
    else if (values.title.length > 100) errors.title = 'Title must be 100 characters or fewer.';

    if (values.amount === '') errors.amount = 'Enter an amount.';
    else if (!Number.isFinite(Number(values.amount))) errors.amount = 'Enter a valid number.';
    else if (Number(values.amount) <= 0) errors.amount = 'Amount must be greater than 0.';
    else if (Number(values.amount) >= 1e10) errors.amount = 'Amount is too large.';

    if (!['income', 'expense'].includes(values.type)) errors.type = 'Choose income or expense.';
    if (!values.category) errors.category = 'Choose a category.';
    if (!values.date || Number.isNaN(Date.parse(values.date))) errors.date = 'Choose a date.';
    return errors;
  }

  // ----- Rendering -----
  function renderSummary() {
    const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    els.income.textContent = money.format(income);
    els.expense.textContent = money.format(expense);
    els.balance.textContent = money.format(income - expense);
    const total = income + expense;
    els.splitIn.style.width = total ? `${(income / total) * 100}%` : '0';
    els.splitOut.style.width = total ? `${(expense / total) * 100}%` : '0';
  }

  function visibleTransactions() {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) =>
      (filter === 'all' || t.type === filter) &&
      (!q || t.title.toLowerCase().includes(q)));
  }

  function renderList() {
    const list = visibleTransactions();
    els.empty.hidden = list.length > 0;
    els.table.hidden = list.length === 0;

    if (!list.length) {
      if (!transactions.length) {
        els.empty.innerHTML = '<strong>No transactions yet</strong>Add your first income or expense using the form.';
      } else {
        els.empty.innerHTML = '<strong>No matching transactions</strong>Try a different filter or search term.';
      }
      els.rows.innerHTML = '';
      return;
    }

    els.rows.innerHTML = list.map((t) => `
      <tr>
        <td data-label="Title">${esc(t.title)}</td>
        <td data-label="Category">${esc(t.category)}</td>
        <td data-label="Type"><span class="badge badge-${t.type}">${t.type === 'income' ? 'Income' : 'Expense'}</span></td>
        <td data-label="Date">${formatDate(t.date)}</td>
        <td data-label="Amount" class="num amount-${t.type}">${t.type === 'income' ? '+' : '−'}${money.format(t.amount)}</td>
        <td class="cell-actions">
          <div class="row-actions">
            <button type="button" class="icon-btn" data-edit="${t.id}">Edit</button>
            <button type="button" class="icon-btn danger" data-delete="${t.id}">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function renderMonthly() {
    const months = {};
    transactions.forEach((t) => {
      const key = t.date.slice(0, 7);
      months[key] = months[key] || { income: 0, expense: 0 };
      months[key][t.type] += t.amount;
    });
    const keys = Object.keys(months).sort().reverse().slice(0, 6);
    if (!keys.length) {
      els.monthly.innerHTML = '<div class="empty"><strong>Nothing to summarise yet</strong>Monthly totals appear once you add transactions.</div>';
      return;
    }
    const max = Math.max(...keys.map((k) => months[k].expense), 1);
    els.monthly.innerHTML = keys.map((k) => {
      const m = months[k];
      const [y, mo] = k.split('-').map(Number);
      const name = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return `
        <div class="month">
          <span class="month-name">${name}</span>
          <div class="month-bar" role="img" aria-label="Expenses ${money.format(m.expense)}"><span style="width:${(m.expense / max) * 100}%"></span></div>
          <div class="month-figures">${money.format(m.expense)} spent<small>${money.format(m.income)} earned</small></div>
        </div>`;
    }).join('');
  }

  function render() {
    renderSummary();
    renderList();
    renderMonthly();
  }

  // ----- Form flow -----
  function resetForm() {
    editingId = null;
    form.reset();
    form.elements.type.value = 'expense';
    fillCategories('expense');
    els.date.value = today();
    els.formTitle.textContent = 'Add transaction';
    els.submit.textContent = 'Add transaction';
    els.cancel.hidden = true;
    setErrors();
  }

  function startEdit(id) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    form.elements.title.value = t.title;
    form.elements.amount.value = t.amount;
    form.elements.type.value = t.type;
    fillCategories(t.type, t.category);
    els.date.value = t.date;
    els.formTitle.textContent = 'Edit transaction';
    els.submit.textContent = 'Save changes';
    els.cancel.hidden = false;
    setErrors();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus({ preventScroll: true });
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') fillCategories(selectedType());
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {
      title: form.elements.title.value.trim(),
      amount: form.elements.amount.value.trim(),
      type: selectedType(),
      category: els.category.value,
      date: els.date.value,
    };
    const errors = validate(values);
    setErrors(errors);
    if (Object.keys(errors).length) {
      form.querySelector('.invalid input, .invalid select')?.focus();
      return;
    }

    const wasEditing = editingId !== null;
    els.submit.disabled = true;
    try {
      const body = JSON.stringify({ ...values, amount: Number(values.amount) });
      if (wasEditing) {
        const saved = await api(`/${editingId}`, { method: 'PUT', body });
        transactions = transactions.map((t) => (t.id === saved.id ? saved : t));
      } else {
        const saved = await api('', { method: 'POST', body });
        transactions.unshift(saved);
      }
      transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      saveCache();
      showBanner('');
      render();
      resetForm();
      toast(wasEditing ? 'Transaction updated.' : 'Transaction added successfully.');
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      toast(err.message === 'Failed to fetch' ? 'Cannot reach the server. Try again.' : err.message, true);
    } finally {
      els.submit.disabled = false;
    }
  });

  els.cancel.addEventListener('click', resetForm);

  // ----- Table actions -----
  els.rows.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) startEdit(Number(editBtn.dataset.edit));
    if (delBtn) {
      const t = transactions.find((x) => x.id === Number(delBtn.dataset.delete));
      if (!t) return;
      pendingDeleteId = t.id;
      els.confirmText.textContent = `“${t.title}” (${money.format(t.amount)}) will be removed.`;
      els.dialog.showModal();
    }
  });

  els.dialog.addEventListener('close', async () => {
    if (els.dialog.returnValue !== 'ok' || pendingDeleteId === null) { pendingDeleteId = null; return; }
    const id = pendingDeleteId;
    pendingDeleteId = null;
    try {
      await api(`/${id}`, { method: 'DELETE' });
      transactions = transactions.filter((t) => t.id !== id);
      if (editingId === id) resetForm();
      saveCache();
      render();
      toast('Transaction deleted.');
    } catch (err) {
      toast(err.message === 'Failed to fetch' ? 'Cannot reach the server. Try again.' : err.message, true);
    }
  });

  // ----- Filter + search -----
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderList();
    });
  });
  els.search.addEventListener('input', () => { query = els.search.value; renderList(); });

  // ----- Init -----
  async function init() {
    resetForm();
    transactions = loadCache(); // instant first paint from the local copy
    render();
    try {
      transactions = await api();
      saveCache();
      showBanner('');
    } catch (_) {
      showBanner(transactions.length
        ? 'Cannot reach the database. Showing your last saved copy; changes are disabled until it reconnects.'
        : 'Cannot reach the database. Check that the server and PostgreSQL are running.');
    }
    render();
  }

  init();
})();
