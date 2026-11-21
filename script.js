/**
 * =========================================================================
 * SIGMA PhD™ - PRODUCTION SCRIPT (JavaScript Logic & API Connector)
 * Integrated with Iframe Bridge (SIGMAPHD_DASHBOARD_BRIDGE) & Dashboard Sync
 * =========================================================================
 */

const BRIDGE_CHANNEL = 'SIGMAPHD_DASHBOARD_BRIDGE';
const PROXY_URL = '/api/root-proxy';

let GLOBAL_COMPANY_ID = "101";
let currentUserName = "";
let currentCompositeUserId = "";
let currentSessionToken = "";
let validityExpiryTime = 0;
let validityCountdownTimer = null;
let isValidityExpiredSession = false;
let activeDevices = 1;

let accountsMasterRecords = [];
let incomeExpenseRecords = [];
let loanGivenRecords = [];
let loanTakenRecords = [];
let marketExpenses = [];
let memoCart = [];
let validityCart = [];

let activePrivatePartner = null;
let universalMessages = [];
let privateMessagesMap = {};

const expandedSummaryYears = {};

const MONTH_SHORT_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function escapeHtml(val) {
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSessionToken() {
    if (currentSessionToken) return currentSessionToken;
    try {
        currentSessionToken = sessionStorage.getItem('sigma_session_token') || localStorage.getItem('sigma_session_token') || '';
    } catch (_) {}
    return currentSessionToken;
}

function setSessionToken(token) {
    currentSessionToken = String(token || '');
    try {
        if (currentSessionToken) {
            sessionStorage.setItem('sigma_session_token', currentSessionToken);
            localStorage.setItem('sigma_session_token', currentSessionToken);
        } else {
            sessionStorage.removeItem('sigma_session_token');
            localStorage.removeItem('sigma_session_token');
        }
    } catch (_) {}
}

function formatDisplayDate(rawDate) {
    if (!rawDate) return '-';
    const str = String(rawDate).trim();
    if (!str || str === '-') return '-';

    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        const yearFull = isoMatch[1];
        const monthIdx = Math.max(0, Math.min(11, parseInt(isoMatch[2], 10) - 1));
        const dayStr = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
        const yearTwo = yearFull.slice(-2);
        return `${dayStr} ${MONTH_SHORT_NAMES[monthIdx]} ${yearTwo}`;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        const dayStr = String(parsed.getUTCDate()).padStart(2, '0');
        const monStr = MONTH_SHORT_NAMES[parsed.getUTCMonth()];
        const yearTwo = String(parsed.getUTCFullYear()).slice(-2);
        return `${dayStr} ${monStr} ${yearTwo}`;
    }

    return str;
}

function formatMonthPeriodLabel(yearStr, monthNumStr) {
    const mIdx = Math.max(0, Math.min(11, parseInt(monthNumStr, 10) - 1));
    const yrTwo = String(yearStr || '').slice(-2);
    return `${MONTH_SHORT_NAMES[mIdx]} ${yrTwo}`;
}

function toggleSummaryYearGroup(yearKey) {
    const key = String(yearKey);
    const current = expandedSummaryYears[key] !== false;
    expandedSummaryYears[key] = !current;
    renderMonthlySummaryTable();
    if (typeof notifyParentFrameHeight === 'function') {
        notifyParentFrameHeight();
    }
}

function normalizeStatusLabel(rawStatus, settledDate = null) {
    const clean = String(rawStatus ?? '').trim().toLowerCase();
    if (clean === 'paid' || clean === 'settled' || clean === 'completed') return 'Paid';
    if (clean === 'due received' || clean === 'received') return 'Due Received';
    if (settledDate && String(settledDate).trim() !== '' && clean !== 'due') return 'Paid';
    return 'Due';
}

function resolveCompositeUserId() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = (urlParams.get('composite_user_id') || '').trim();
    const fromWindow = String(window.ACTIVE_COMPOSITE_USER_ID || '').trim();
    const fromState = String(currentCompositeUserId || '').trim();
    const fromStorage = String(localStorage.getItem('composite_user_id') || '').trim();
    const fromLabel = String(document.getElementById('active-composite-user-label')?.textContent || '').trim();
    const fromDisplay = String(document.getElementById('displayCompositeId')?.textContent || '').trim();

    const cleanLabel = (fromLabel && fromLabel !== '--' && fromLabel !== 'N/A') ? fromLabel : '';
    const cleanDisplay = (fromDisplay && fromDisplay !== '--' && fromDisplay !== 'N/A') ? fromDisplay : '';

    const resolved = fromState || fromWindow || fromUrl || fromStorage || cleanLabel || cleanDisplay || '';
    if (resolved) {
        currentCompositeUserId = resolved;
        window.ACTIVE_COMPOSITE_USER_ID = resolved;
        try {
            localStorage.setItem('composite_user_id', resolved);
        } catch (_) {}
        const lbl = document.getElementById('active-composite-user-label');
        if (lbl && lbl.textContent.trim() !== resolved) lbl.textContent = resolved;
        const disp = document.getElementById('displayCompositeId');
        if (disp && disp.textContent.trim() !== resolved) disp.textContent = resolved;
    }
    return resolved;
}

function setIEModalType(type = 'income') {
    const normalized = type === 'expense' ? 'expense' : 'income';
    const btnInc = document.getElementById('btn-type-income');
    const btnExp = document.getElementById('btn-type-expense');

    if (btnInc && btnExp) {
        if (normalized === 'income') {
            btnInc.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold bg-emerald-500 text-slate-950 cursor-pointer transition-all';
            btnExp.className = 'py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-300 hover:text-white cursor-pointer transition-all';
        } else {
            btnExp.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold bg-rose-500 text-white cursor-pointer transition-all';
            btnInc.className = 'py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-300 hover:text-white cursor-pointer transition-all';
        }
    }

    const typeHidden = document.getElementById('incomeEntryType');
    if (typeHidden) {
        typeHidden.value = normalized === 'expense' ? 'Expense' : 'Income';
    }
    window.__currentIEModalType = normalized;
}

function updateLoanEntryHint() {
    const dir = document.getElementById('loan-direction')?.value || 'receivable';
    const dateLabel = document.getElementById('loan-date-label');
    if (dateLabel) {
        dateLabel.textContent = dir === 'payable' ? 'Payable Date' : 'Receivable Date';
    }
}

function openModal(modalId) {
    resolveCompositeUserId();
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    if (typeof notifyParentFrameHeight === 'function') {
        notifyParentFrameHeight();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
}

function openIncomeExpenseModal(type = 'income') {
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('ie-date');
    if (dateEl && !dateEl.value) dateEl.value = today;
    setIEModalType(type);
    openModal('modal-income-expense');
}

function openLoanEntryModal() {
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('loan-date');
    if (dateEl && !dateEl.value) dateEl.value = today;
    updateLoanEntryHint();
    openModal('modal-loan-entry');
}

function openDailyExpenseModal() {
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('dexp-date');
    if (dateEl && !dateEl.value) dateEl.value = today;
    openModal('modal-daily-expense');
}

/**
 * Navigation & Section / Tab / Modal Switcher
 * Supports Dashboard, My Chat, Cash Memo, Show Accounts, Show Settings, My Set
 */
function showSectionByIds(targetIds = []) {
    const allSections = document.querySelectorAll(
        '[data-section], [data-tab-panel], .tab-panel, .page-section, #dashboardSection, #dashboardView, #dashboardContent, #chatSection, #myChatSection, #chatView, #cashMemoSection, #memoSection, #cashMemoView, #settingsSection, #showSettingsSection, #mySetSection, #userSetSection'
    );
    const targetSet = new Set(targetIds.filter(Boolean));
    let matchedAny = false;

    allSections.forEach((el) => {
        const idMatch = el.id && targetSet.has(el.id);
        const dataMatch =
            targetSet.has(el.dataset.section) ||
            targetSet.has(el.dataset.tabPanel) ||
            targetSet.has(el.dataset.view);
        if (idMatch || dataMatch) {
            el.classList.remove('hidden');
            if (el.style.display === 'none') el.style.display = '';
            matchedAny = true;
        } else if (targetSet.size > 0) {
            el.classList.add('hidden');
        }
    });

    if (window.self !== window.top && window.parent) {
        window.parent.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'NAVIGATE',
            compositeUserId: resolveCompositeUserId(),
            targets: Array.from(targetSet)
        }, '*');
    }

    notifyParentFrameHeight();
    return matchedAny;
}

function setActiveNavButton(activeKey) {
    const navButtons = document.querySelectorAll('nav button, nav a, [role="tab"], .nav-tab, .tab-btn');
    navButtons.forEach((btn) => {
        const key = (btn.dataset.tab || btn.dataset.target || btn.dataset.section || btn.id || btn.textContent || '')
            .trim()
            .toLowerCase();
        const isMatch = activeKey && key.includes(activeKey.toLowerCase());
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        btn.classList.toggle('active', isMatch);
    });
}

function switchToDashboard() {
    setActiveNavButton('dashboard');
    showSectionByIds(['dashboardSection', 'dashboardView', 'dashboardContent', 'dashboard-main', 'dashboard']);
    renderAllDashboardTables();
}

function switchToMyChat() {
    setActiveNavButton('chat');
    const found = showSectionByIds(['chatSection', 'myChatSection', 'chatView', 'myChatView', 'chatModal', 'myChatModal']);
    if (!found) {
        const modal = document.getElementById('modal-chat') || document.getElementById('myChatModal') || document.getElementById('chatModal');
        if (modal) openModal(modal.id);
    }
    renderUniversalMessages();
}

function switchToCashMemo() {
    setActiveNavButton('memo');
    const found = showSectionByIds(['cashMemoSection', 'memoSection', 'cashMemoView', 'memoView', 'cashMemoModal', 'memoModal']);
    if (!found) {
        const modal = document.getElementById('modal-cash-memo') || document.getElementById('cashMemoModal') || document.getElementById('memoModal');
        if (modal) openModal(modal.id);
    }
}

function openShowSettingsModal() {
    const existingModal =
        document.getElementById('modal-show-settings') ||
        document.getElementById('settingsModal') ||
        document.getElementById('showSettingsModal') ||
        document.getElementById('modal-settings');
    if (existingModal) {
        openModal(existingModal.id);
        return;
    }

    const foundSection = showSectionByIds(['settingsSection', 'showSettingsSection', 'settingsView', 'showSettingsView']);
    if (foundSection) return;

    const modal = document.createElement('div');
    modal.id = 'modal-show-settings';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/75 p-4';
    modal.innerHTML = `
        <div class="w-full max-w-lg rounded-2xl bg-[#0b1120] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#111827]">
                <h3 class="text-sm sm:text-base font-bold text-emerald-400">Settings</h3>
                <button type="button" onclick="closeModal('modal-show-settings')" class="text-slate-400 hover:text-white text-lg font-bold px-2">×</button>
            </div>
            <div class="p-4 space-y-3 text-xs sm:text-sm">
                <div class="flex items-center justify-between bg-[#131822] px-3 py-2 rounded-lg border border-slate-800">
                    <span class="text-slate-400">User</span>
                    <span class="font-semibold text-white">${escapeHtml(currentUserName || localStorage.getItem('user_name') || '-')}</span>
                </div>
                <div class="flex items-center justify-between bg-[#131822] px-3 py-2 rounded-lg border border-slate-800">
                    <span class="text-slate-400">Composite ID</span>
                    <span class="font-mono text-emerald-400">${escapeHtml(resolveCompositeUserId() || '-')}</span>
                </div>
                <div class="pt-2 flex justify-end gap-2">
                    <button type="button" onclick="openAccountsModal(); closeModal('modal-show-settings');" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs">Show Accounts</button>
                    <button type="button" onclick="closeModal('modal-show-settings')" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-semibold text-xs">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    openModal(modal.id);
}

function openMySetModal() {
    const existingModal =
        document.getElementById('modal-my-set') ||
        document.getElementById('mySetModal') ||
        document.getElementById('userSetModal') ||
        document.getElementById('modal-password-change');
    if (existingModal) {
        openModal(existingModal.id);
        return;
    }

    const foundSection = showSectionByIds(['mySetSection', 'userSetSection', 'mySetView', 'userSetView']);
    if (foundSection) return;

    const modal = document.createElement('div');
    modal.id = 'modal-my-set';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/75 p-4';
    modal.innerHTML = `
        <div class="w-full max-w-md rounded-2xl bg-[#0b1120] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#111827]">
                <h3 class="text-sm sm:text-base font-bold text-emerald-400">My Set</h3>
                <button type="button" onclick="closeModal('modal-my-set')" class="text-slate-400 hover:text-white text-lg font-bold px-2">×</button>
            </div>
            <div class="p-4 space-y-3 text-xs">
                <div>
                    <label class="block text-slate-400 mb-1">New Username (Optional)</label>
                    <input id="newUsernameInput" type="text" class="w-full rounded-lg bg-[#131822] border border-slate-700 px-3 py-2 text-white" />
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">Old Password</label>
                    <input id="oldPasswordInput" type="password" class="w-full rounded-lg bg-[#131822] border border-slate-700 px-3 py-2 text-white" />
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">New Password</label>
                    <input id="newPasswordInput" type="password" class="w-full rounded-lg bg-[#131822] border border-slate-700 px-3 py-2 text-white" />
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">Confirm Password</label>
                    <input id="confirmPasswordInput" type="password" class="w-full rounded-lg bg-[#131822] border border-slate-700 px-3 py-2 text-white" />
                </div>
                <div class="pt-2 flex justify-end gap-2">
                    <button type="button" onclick="submitUserPasswordChange()" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold">Save</button>
                    <button type="button" onclick="closeModal('modal-my-set')" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-semibold">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    openModal(modal.id);
}

function ensureAccountsModalContainer() {
    let modal = document.getElementById('modal-show-accounts') || document.getElementById('accountsListModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modal-show-accounts';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/75 p-4';
    modal.innerHTML = `
        <div class="w-full max-w-4xl rounded-2xl bg-[#0b1120] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#111827]">
                <h3 class="text-sm sm:text-base font-bold text-emerald-400">Accounts Master List</h3>
                <button type="button" onclick="closeModal('modal-show-accounts')" class="text-slate-400 hover:text-white text-lg font-bold px-2">×</button>
            </div>
            <div class="p-4 max-h-[70vh] overflow-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="border-b border-slate-800 text-slate-400">
                            <th class="py-2 px-2">User Name</th>
                            <th class="py-2 px-2">Composite ID</th>
                            <th class="py-2 px-2">Role</th>
                            <th class="py-2 px-2">Status</th>
                            <th class="py-2 px-2 text-right">Wallet</th>
                        </tr>
                    </thead>
                    <tbody id="accounts-master-modal-body"></tbody>
                </table>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

async function openAccountsModal() {
    if (!accountsMasterRecords.length) {
        await loadAllDatabaseRecords();
    }

    const modal = ensureAccountsModalContainer();
    const tbody = document.getElementById('accounts-master-modal-body') || document.getElementById('accountsListBody');
    const inlineBox = document.getElementById('accountsListContainer') || document.getElementById('showAccountsList');

    const rowsHtml = (accountsMasterRecords || []).length
        ? accountsMasterRecords.map((acc) => `
            <tr class="border-b border-slate-800/70 hover:bg-slate-900/60">
                <td class="py-2 px-2 font-semibold text-white">${escapeHtml(acc.user_name || acc.user_id || '-')}</td>
                <td class="py-2 px-2 font-mono text-emerald-300">${escapeHtml(acc.composite_user_id || '-')}</td>
                <td class="py-2 px-2 text-slate-300">${escapeHtml(acc.role || 'User')}</td>
                <td class="py-2 px-2"><span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-emerald-400">${escapeHtml(acc.status || 'Active')}</span></td>
                <td class="py-2 px-2 text-right font-mono font-bold text-amber-300">${formatMoney(acc.wallet_balance || 0)}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="5" class="py-4 text-center text-slate-400">No accounts found.</td></tr>';

    if (tbody) tbody.innerHTML = rowsHtml;
    if (inlineBox) {
        inlineBox.classList.remove('hidden');
        inlineBox.innerHTML = `<table class="w-full text-left border-collapse text-xs"><tbody>${rowsHtml}</tbody></table>`;
    }

    openModal(modal.id);
}

function toggleAccountsModal() {
    const modal = ensureAccountsModalContainer();
    const isOpen = !modal.classList.contains('hidden');
    if (isOpen) closeModal(modal.id);
    else openAccountsModal();
}

function showAccountsList() {
    return openAccountsModal();
}

function updateDeleteCounter(btnId, countId, selector) {
    const btn = document.getElementById(btnId);
    const cnt = document.getElementById(countId);
    const checkedCount = document.querySelectorAll(`${selector}:checked`).length;
    if (cnt) cnt.textContent = String(checkedCount);
    if (btn) {
        if (checkedCount > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
}

function openIncomeListModal() {
    const tbody = document.getElementById('income-list-modal-body');
    if (tbody && Array.isArray(incomeExpenseRecords)) {
        const incomes = incomeExpenseRecords.filter(
            (r) => String(r.entry_type || r.income_expense_type || 'Income').toLowerCase() === 'income'
        );
        if (incomes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400">No income entries found.</td></tr>';
        } else {
            tbody.innerHTML = incomes.map((r) => {
                const d = escapeHtml(formatDisplayDate(r.entry_date || r.income_expense_date || ''));
                const desc = escapeHtml(r.description || r.income_expense_description || '');
                const amt = Number(r.amount ?? r.income_expense_amount ?? 0) || 0;
                return `
                    <tr>
                        <td class="py-2 pl-3 pr-1"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-incomes', 'count-del-incomes', '.income-row-cb')" class="income-row-cb accent-emerald-500" value="${escapeHtml(r.id || '')}" /></td>
                        <td class="py-2 px-2.5 font-mono text-xs">${d}</td>
                        <td class="py-2 px-2.5">${desc}</td>
                        <td class="py-2 pl-2.5 pr-3 text-right font-bold text-emerald-400">${formatMoney(amt)}</td>
                    </tr>
                `;
            }).join('');
        }
    }
    updateDeleteCounter('btn-delete-incomes', 'count-del-incomes', '.income-row-cb');
    openModal('modal-income-list');
}

function openReceivableSettleModalById(id) {
    const item = (loanGivenRecords || []).find((x) => String(x.id) === String(id));
    if (!item) return;
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('rec-settle-id')) document.getElementById('rec-settle-id').value = item.id;
    if (document.getElementById('rec-settle-desc')) document.getElementById('rec-settle-desc').textContent = item.person_name || item.description || item.loan_records_description || 'Party';
    if (document.getElementById('rec-settle-principal')) document.getElementById('rec-settle-principal').textContent = formatMoney(item.amount ?? item.loan_records_amount ?? 0);
    if (document.getElementById('rec-settle-date')) document.getElementById('rec-settle-date').value = today;
    if (document.getElementById('rec-settle-extra')) document.getElementById('rec-settle-extra').value = '0';
    openModal('modal-receivable-settle');
}

function openPayableSettleModalById(id) {
    const item = (loanTakenRecords || []).find((x) => String(x.id) === String(id));
    if (!item) return;
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('pay-settle-id')) document.getElementById('pay-settle-id').value = item.id;
    if (document.getElementById('pay-settle-desc')) document.getElementById('pay-settle-desc').textContent = item.person_name || item.description || item.loan_records_description || 'Party';
    if (document.getElementById('pay-settle-principal')) document.getElementById('pay-settle-principal').textContent = formatMoney(item.amount ?? item.loan_records_amount ?? 0);
    if (document.getElementById('pay-settle-source')) document.getElementById('pay-settle-source').textContent = item.source || item.loan_records_source || 'Ledger';
    if (document.getElementById('pay-settle-date')) document.getElementById('pay-settle-date').value = today;
    if (document.getElementById('pay-settle-extra')) document.getElementById('pay-settle-extra').value = '0';
    openModal('modal-payable-settle');
}

async function handleIncomeExpenseSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const compId = resolveCompositeUserId();
    if (!compId) {
        showToast('Composite User ID পাওয়া যায়নি!', 'error');
        return;
    }

    const type = window.__currentIEModalType === 'expense' ? 'Expense' : 'Income';
    const date = document.getElementById('ie-date')?.value || new Date().toISOString().split('T')[0];
    const amount = parseFloat(document.getElementById('ie-amount')?.value) || 0;
    const desc = (document.getElementById('ie-description')?.value || '').trim();

    if (!desc || amount <= 0) {
        showToast('সঠিক Amount এবং Description দিন।', 'warn');
        return;
    }

    const res = await callBackendApi('save_income_expense', {
        composite_user_id: compId,
        type,
        entry_type: type,
        date,
        entry_date: date,
        desc,
        description: desc,
        amount,
        status: 'Paid'
    });

    if (res && res.success) {
        document.getElementById('form-income-expense')?.reset();
        closeModal('modal-income-expense');
        await loadAllDatabaseRecords();
        showToast(`${type} এন্ট্রি ডাটাবেজে সংরক্ষিত হয়েছে!`);
    } else {
        showToast((res && res.message) || 'এন্ট্রি সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
}

async function handleLoanEntrySubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const compId = resolveCompositeUserId();
    if (!compId) {
        showToast('Composite User ID পাওয়া যায়নি!', 'error');
        return;
    }

    const direction = (document.getElementById('loan-direction')?.value || 'receivable').toLowerCase();
    const status = document.getElementById('loan-status')?.value || 'Due';
    const personName = (document.getElementById('loan-description')?.value || '').trim();
    const amount = parseFloat(document.getElementById('loan-amount')?.value) || 0;
    const entryDate = document.getElementById('loan-date')?.value || new Date().toISOString().split('T')[0];

    if (!personName || amount <= 0) {
        showToast('Description এবং সঠিক Amount দিন।', 'warn');
        return;
    }

    const res = await callBackendApi('save_loan', {
        composite_user_id: compId,
        category: direction,
        loan_type: direction,
        direction,
        status,
        person_name: personName,
        description: personName,
        amount,
        entry_date: entryDate,
        date: entryDate
    });

    if (res && res.success) {
        document.getElementById('form-loan-entry')?.reset();
        closeModal('modal-loan-entry');
        await loadAllDatabaseRecords();
        showToast('লোন রেকর্ড ডাটাবেজে সংরক্ষিত হয়েছে!');
    } else {
        showToast((res && res.message) || 'লোন এন্ট্রি সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
}

async function handleDailyExpenseSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const compId = resolveCompositeUserId();
    if (!compId) {
        showToast('Composite User ID পাওয়া যায়নি!', 'error');
        return;
    }

    const date = document.getElementById('dexp-date')?.value || new Date().toISOString().split('T')[0];
    const amount = parseFloat(document.getElementById('dexp-amount')?.value) || 0;
    const desc = (document.getElementById('dexp-description')?.value || '').trim();
    const status = normalizeStatusLabel(document.getElementById('dexp-status')?.value || 'Paid');

    if (!desc || amount <= 0) {
        showToast('সঠিক Amount এবং Description দিন।', 'warn');
        return;
    }

    const res = await callBackendApi('save_market_expense', {
        composite_user_id: compId,
        expense_date: date,
        date,
        description: desc,
        desc,
        amount,
        status
    });

    if (res && res.success) {
        document.getElementById('form-daily-expense')?.reset();
        closeModal('modal-daily-expense');
        await loadAllDatabaseRecords();
        showToast(status === 'Due'
            ? 'Due expense Payable লিস্টে যুক্ত হয়েছে।'
            : 'দৈনিক খরচ ডাটাবেজে সংরক্ষিত হয়েছে!');
    } else {
        showToast((res && res.message) || 'খরচ সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
}

async function handleReceivableSettleSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const compId = resolveCompositeUserId();
    if (!compId) return;

    const id = document.getElementById('rec-settle-id')?.value || '';
    const settleDate = document.getElementById('rec-settle-date')?.value || new Date().toISOString().split('T')[0];
    const extraAmount = parseFloat(document.getElementById('rec-settle-extra')?.value) || 0;

    const res = await callBackendApi('settle_loan', {
        composite_user_id: compId,
        id,
        category: 'receivable',
        status: 'Paid',
        settle_date: settleDate,
        settled_date: settleDate,
        extra_amount: extraAmount
    });

    if (res && res.success) {
        closeModal('modal-receivable-settle');
        await loadAllDatabaseRecords();
        showToast('Receivable Paid/সেটেল সম্পন্ন হয়েছে!');
    } else {
        showToast((res && res.message) || 'সেটেলমেন্ট ব্যর্থ হয়েছে।', 'error');
    }
}

async function handlePayableSettleSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const compId = resolveCompositeUserId();
    if (!compId) return;

    const id = document.getElementById('pay-settle-id')?.value || '';
    const settleDate = document.getElementById('pay-settle-date')?.value || new Date().toISOString().split('T')[0];
    const extraAmount = parseFloat(document.getElementById('pay-settle-extra')?.value) || 0;

    const res = await callBackendApi('settle_loan', {
        composite_user_id: compId,
        id,
        category: 'payable',
        status: 'Paid',
        settle_date: settleDate,
        settled_date: settleDate,
        extra_amount: extraAmount
    });

    if (res && res.success) {
        closeModal('modal-payable-settle');
        await loadAllDatabaseRecords();
        showToast('Payable Paid/সেটেল সম্পন্ন হয়েছে!');
    } else {
        showToast((res && res.message) || 'সেটেলমেন্ট ব্যর্থ হয়েছে।', 'error');
    }
}

async function deleteSelectedIncomes() {
    const compId = resolveCompositeUserId();
    const ids = Array.from(document.querySelectorAll('.income-row-cb:checked')).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_income_entries', { composite_user_id: compId, ids });
    if (res && res.success) {
        await loadAllDatabaseRecords();
        openIncomeListModal();
        showToast('নির্বাচিত Income এন্ট্রি মুছে ফেলা হয়েছে।');
    }
}

async function deleteSelectedLoans(category) {
    const compId = resolveCompositeUserId();
    const ids = Array.from(document.querySelectorAll(`.loan-row-cb[data-cat="${category}"]:checked`)).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_loan_entries', { composite_user_id: compId, category, ids });
    if (res && res.success) {
        await loadAllDatabaseRecords();
        showToast('নির্বাচিত Loan এন্ট্রি মুছে ফেলা হয়েছে।');
    }
}

async function deleteSelectedExpenses() {
    const compId = resolveCompositeUserId();
    const ids = Array.from(document.querySelectorAll('.expense-row-cb:checked')).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_market_expenses', { composite_user_id: compId, ids });
    if (res && res.success) {
        await loadAllDatabaseRecords();
        showToast('নির্বাচিত Expense এন্ট্রি মুছে ফেলা হয়েছে।');
    }
}

function showToast(text, variant = 'success') {
    if (window.self !== window.top && window.parent) {
        window.parent.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'TOAST',
            compositeUserId: resolveCompositeUserId(),
            message: text,
            variant
        }, '*');
    }

    const toast = document.getElementById('toast');
    if (toast && document.getElementById('toast-text')) {
        document.getElementById('toast-text').innerText = text;
        toast.classList.remove('hidden');
        clearTimeout(window.__sigmaToastTimer);
        window.__sigmaToastTimer = setTimeout(hideToast, 3500);
        return;
    }

    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    const cls = variant === 'error'
        ? 'bg-rose-600 text-white border-rose-400/40'
        : variant === 'warn'
        ? 'bg-amber-500 text-slate-950 border-amber-300/40'
        : 'bg-emerald-500 text-slate-950 border-emerald-300/40';
    el.className = `pointer-events-auto px-4 py-2.5 rounded-xl border shadow-2xl text-xs sm:text-sm font-bold transition-all ${cls}`;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 250);
    }, 3000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
}

function formatMoney(num) {
    return '৳ ' + Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDashboardIframeEl() {
    return document.getElementById('dashboardFrame');
}

function syncCompositeIdToIframe(compId) {
    const cleanId = String(compId || '').trim();
    if (!cleanId) return;

    currentCompositeUserId = cleanId;
    window.ACTIVE_COMPOSITE_USER_ID = cleanId;
    try {
        localStorage.setItem('composite_user_id', cleanId);
    } catch (_) {}

    const compDisplay = document.getElementById('displayCompositeId');
    if (compDisplay) compDisplay.innerText = cleanId;

    const scopeLabel = document.getElementById('active-composite-user-label');
    if (scopeLabel) scopeLabel.innerText = cleanId;

    if (typeof window.syncDashboardIframeUser === 'function') {
        window.syncDashboardIframeUser(cleanId);
    } else {
        const frame = getDashboardIframeEl();
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({
                channel: BRIDGE_CHANNEL,
                type: 'SET_USER_SCOPE',
                compositeUserId: cleanId,
                payload: { composite_user_id: cleanId }
            }, '*');
        }
    }
}

function notifyParentFrameHeight() {
    if (window.self !== window.top && window.parent) {
        const shell = document.getElementById('dashboard-app-shell') || document.body;
        const height = shell ? shell.scrollHeight + 24 : document.documentElement.scrollHeight;
        window.parent.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'FRAME_HEIGHT',
            compositeUserId: resolveCompositeUserId(),
            height
        }, '*');
    }
}

async function callBackendApi(action, payload = {}) {
    try {
        const activeCompId = resolveCompositeUserId() || (payload && payload.composite_user_id) || '';
        const token = getSessionToken();
        const mergedPayload = {
            ...(payload || {}),
            ...(activeCompId ? { composite_user_id: activeCompId } : {})
        };

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                action,
                company_id: GLOBAL_COMPANY_ID,
                composite_user_id: activeCompId,
                session_token: token,
                payload: mergedPayload
            })
        });
        return await response.json();
    } catch (err) {
        console.error('Database API Error:', err);
        return { success: false, message: 'Network or database connection error.' };
    }
}

async function handleMainSignIn(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const uname = (document.getElementById('mainUserName')?.value || '').trim();
    const pass = (document.getElementById('mainUserPassword')?.value || '').trim();

    if (!uname || !pass) {
        showToast('ইউজারনেম এবং পাসওয়ার্ড দিন।', 'warn');
        return;
    }

    const res = await callBackendApi('authenticate_user', { user_name: uname, password: pass });

    if (res && res.success && res.user) {
        if (res.session_token) setSessionToken(res.session_token);
        const user = res.user;
        currentUserName = user.user_name || uname;
        currentCompositeUserId = user.composite_user_id || '';

        const buyerMobile = user.buyer_mobile || '01818589423';
        const lastFourDigits = buyerMobile.length >= 4 ? buyerMobile.slice(-4) : '8423';

        if (user.composite_user_id) localStorage.setItem('composite_user_id', user.composite_user_id);
        localStorage.setItem('user_name', currentUserName);
        localStorage.setItem('buyer_email', user.buyer_email || '');

        if (document.getElementById('currentLoggedInUser')) document.getElementById('currentLoggedInUser').innerText = currentUserName;
        if (currentCompositeUserId) syncCompositeIdToIframe(currentCompositeUserId);
        if (document.getElementById('userCouponCode')) document.getElementById('userCouponCode').innerText = 'SIGMA_' + lastFourDigits;
        if (document.getElementById('walletBalanceText')) document.getElementById('walletBalanceText').innerText = formatMoney(user.wallet_balance || 0);
        if (document.getElementById('validityWalletBalanceText')) document.getElementById('validityWalletBalanceText').innerText = formatMoney(user.wallet_balance || 0);

        document.getElementById('page1')?.classList.add('hidden');
        document.getElementById('page2')?.classList.remove('hidden');

        if (user.validity_expires_at || user.activated_at) {
            if (!applyValidityStateFromUser(user)) return;
        }

        await loadAllDatabaseRecords();
        notifyParentFrameHeight();
        showToast('স্বাগতম ' + currentUserName + '! সফলভাবে লগইন হয়েছে।');
    } else {
        showToast((res && res.message) || 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!', 'error');
    }
}

function handleLogOut() {
    if (validityCountdownTimer) {
        clearInterval(validityCountdownTimer);
        validityCountdownTimer = null;
    }
    isValidityExpiredSession = false;
    validityExpiryTime = 0;
    currentUserName = "";
    currentCompositeUserId = "";
    setSessionToken('');
    localStorage.clear();
    sessionStorage.clear();
    document.getElementById('page2')?.classList.add('hidden');
    document.getElementById('page1')?.classList.remove('hidden');
    showToast('সফলভাবে লগআউট করা হয়েছে।');
}

async function loadAllDatabaseRecords() {
    const activeCompId = resolveCompositeUserId();
    const res = await callBackendApi('fetch_dashboard_data', { composite_user_id: activeCompId });
    if (res && res.success) {
        incomeExpenseRecords = res.income_expenses || [];
        loanGivenRecords = (res.loans_receivable || []).map(r => ({
            ...r,
            loan_records_status: normalizeStatusLabel(r.loan_records_status, r.loan_records_settled_date),
            status: normalizeStatusLabel(r.loan_records_status, r.loan_records_settled_date)
        }));
        loanTakenRecords = (res.loans_payable || []).map(r => ({
            ...r,
            loan_records_status: normalizeStatusLabel(r.loan_records_status, r.loan_records_settled_date),
            status: normalizeStatusLabel(r.loan_records_status, r.loan_records_settled_date)
        }));
        marketExpenses = (res.daily_expenses || []).filter((m) => {
            const desc = String(m.income_expense_description || m.description || '');
            return !/\[(Loan|PayableExtra)#[^\]]+\]/i.test(desc);
        });
        accountsMasterRecords = res.accounts || [];
        universalMessages = res.public_chats || [];

        const me = accountsMasterRecords.find(a => a.composite_user_id === activeCompId);
        if (me) {
            if (document.getElementById('walletBalanceText')) document.getElementById('walletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            if (document.getElementById('validityWalletBalanceText')) document.getElementById('validityWalletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            if (me.validity_expires_at || me.activated_at) {
                if (!applyValidityStateFromUser(me)) return;
            }
        }
    }
    renderAllDashboardTables();
    renderLotInventory();
    renderUniversalMessages();
    notifyParentFrameHeight();
}

function getValidityExpiryTimestamp(user = {}) {
    if (user.validity_expires_at) {
        const ts = new Date(user.validity_expires_at).getTime();
        if (!Number.isNaN(ts)) return ts;
    }
    if (user.activated_at) {
        const baseTs = new Date(user.activated_at).getTime();
        const days = Number(user.validity_days) || 0;
        if (!Number.isNaN(baseTs) && days > 0) return baseTs + (days * 24 * 60 * 60 * 1000);
    }
    return 0;
}

function syncValidityPendingUI(pendingDays = 0, approvalStatus = 'NONE') {
    const days = Number(pendingDays || 0);
    const hasPending = days > 0 || approvalStatus === 'Admin Approval';
    const badge = document.getElementById('validityPendingBadge');
    if (badge) {
        badge.innerText = hasPending ? `Wait for Validity Approval (${days} Days Pending)` : '';
        badge.classList.toggle('hidden', !hasPending);
    }
    const modalNotice = document.getElementById('validityModalPendingNotice');
    const modalDetails = document.getElementById('validityModalPendingDetails');
    if (modalNotice) {
        modalNotice.classList.toggle('hidden', !hasPending);
        if (modalDetails) {
            modalDetails.innerText = hasPending ? `Pending Extension: ${days} Days • Status: Wait for Validity Approval` : '';
        }
    }
}

function enforceExpiredValidityFlow(user = {}) {
    const pendingDays = Number(user.pending_validity_days || 0);
    const approvalStatus = user.validity_approval_status || 'NONE';
    const hasPending = pendingDays > 0 || approvalStatus === 'Admin Approval';

    isValidityExpiredSession = true;
    syncValidityPendingUI(pendingDays, approvalStatus);
    currentUserName = "";
    currentCompositeUserId = "";
    setSessionToken('');
    localStorage.clear();
    sessionStorage.clear();

    document.getElementById('page2')?.classList.add('hidden');
    document.getElementById('page1')?.classList.remove('hidden');
    openBuyValidityModal();
    showToast(hasPending ? 'Wait for Validity Approval — ভ্যালিডিটি এক্সটেন্ড পেন্ডিং রয়েছে।' : 'আপনার ভ্যালিডিটি শেষ হয়ে গেছে!', 'warn');
}

function applyValidityStateFromUser(user = {}) {
    const expiryTs = getValidityExpiryTimestamp(user);
    const pendingDays = Number(user.pending_validity_days || 0);
    const approvalStatus = user.validity_approval_status || 'NONE';
    validityExpiryTime = expiryTs;
    syncValidityPendingUI(pendingDays, approvalStatus);

    if (!expiryTs || Date.now() >= expiryTs) {
        enforceExpiredValidityFlow(user);
        return false;
    }
    isValidityExpiredSession = false;
    startValidityCountdown();
    return true;
}

function startValidityCountdown() {
    if (validityCountdownTimer) clearInterval(validityCountdownTimer);
    const updateClock = () => {
        if (!validityExpiryTime) return;
        const diff = validityExpiryTime - Date.now();
        if (diff <= 0) {
            clearInterval(validityCountdownTimer);
            validityCountdownTimer = null;
            enforceExpiredValidityFlow({});
            return;
        }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        if (document.getElementById('countdownDays')) {
            document.getElementById('countdownDays').innerText = String(d).padStart(2, '0');
            document.getElementById('countdownHours').innerText = String(h).padStart(2, '0');
            document.getElementById('countdownMins').innerText = String(m).padStart(2, '0');
            document.getElementById('countdownSecs').innerText = String(s).padStart(2, '0');
        }
    };
    updateClock();
    validityCountdownTimer = setInterval(updateClock, 1000);
}

function renderAllDashboardTables() {
    renderMonthlySummaryTable();
    renderLoanTables();
    renderMarketExpensesTable();
}

function renderMonthlySummaryTable() {
    const tbody = document.getElementById('monthly-summary-body') || document.getElementById('monthlyRowsContainer');
    if (!tbody) return;

    let totalInc = 0, totalExp = 0;
    const yearGroups = {};
    const seenExpenseIds = new Set();

    const ensureBucket = (y, m) => {
        if (!yearGroups[y]) yearGroups[y] = { year: y, inc: 0, exp: 0, months: {} };
        if (!yearGroups[y].months[m]) yearGroups[y].months[m] = { inc: 0, exp: 0 };
    };

    const parseYM = (rawDate) => {
        const m = String(rawDate || '2026-11').trim().match(/^(\d{4})[-/](\d{1,2})/);
        if (m) return { year: m[1], month: String(parseInt(m[2], 10)).padStart(2, '0') };
        return { year: '2026', month: '11' };
    };

    (incomeExpenseRecords || []).forEach(item => {
        const type = String(item.income_expense_type || item.entry_type || 'income').toLowerCase();
        const { year, month } = parseYM(item.income_expense_date || item.entry_date);
        const amt = Number(item.income_expense_amount ?? item.amount ?? 0) || 0;
        const st = String(item.income_expense_status || item.status || 'Paid').toLowerCase();

        if (type === 'income') {
            ensureBucket(year, month);
            totalInc += amt;
            yearGroups[year].inc += amt;
            yearGroups[year].months[month].inc += amt;
        } else if (type === 'expense' && st === 'paid') {
            ensureBucket(year, month);
            if (item.id != null) seenExpenseIds.add(String(item.id));
            totalExp += amt;
            yearGroups[year].exp += amt;
            yearGroups[year].months[month].exp += amt;
        }
    });

    (marketExpenses || []).forEach(m => {
        if (m.id != null && seenExpenseIds.has(String(m.id))) return;
        if (String(m.income_expense_status || m.status || 'Paid').toLowerCase() === 'paid') {
            const { year, month } = parseYM(m.income_expense_date || m.expense_date);
            const amt = Number(m.income_expense_amount ?? m.amount ?? 0) || 0;
            ensureBucket(year, month);
            totalExp += amt;
            yearGroups[year].exp += amt;
            yearGroups[year].months[month].exp += amt;
        }
    });

    const net = totalInc - totalExp;
    if (document.getElementById('totalIncomeAll')) document.getElementById('totalIncomeAll').innerText = formatMoney(totalInc);
    if (document.getElementById('totalExpenseAll')) document.getElementById('totalExpenseAll').innerText = formatMoney(totalExp);
    if (document.getElementById('totalSurplusAll')) document.getElementById('totalSurplusAll').innerText = formatMoney(net);

    const years = Object.keys(yearGroups).sort((a, b) => Number(b) - Number(a));
    if (!years.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400 text-xs">No summary records found yet.</td></tr>';
        return;
    }

    const rows = [];
    years.forEach(yr => {
        const grp = yearGroups[yr];
        const expanded = expandedSummaryYears[yr] !== false;
        const yrSurplus = grp.inc - grp.exp;
        rows.push(`
            <tr class="bg-navy-850/90 text-white border-y border-slate-700/70">
                <td class="py-2.5 pl-3 pr-2 font-mono text-xs sm:text-sm font-bold">
                    <button type="button" onclick="toggleSummaryYearGroup('${escapeHtml(yr)}')" class="inline-flex items-center justify-center w-5 h-5 mr-2 rounded bg-slate-700 hover:bg-emerald-500 hover:text-slate-950 text-white font-bold text-xs">${expanded ? '−' : '+'}</button>
                    <span>${escapeHtml(yr)}</span>
                </td>
                <td class="py-2.5 px-2.5 font-bold text-emerald-400">${formatMoney(grp.inc)}</td>
                <td class="py-2.5 px-2.5 font-bold text-rose-400">${formatMoney(grp.exp)}</td>
                <td class="py-2.5 px-3 text-right font-extrabold ${yrSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoney(yrSurplus)}</td>
            </tr>
        `);
        if (expanded) {
            Object.keys(grp.months).sort((a, b) => Number(b) - Number(a)).forEach(m => {
                const mItem = grp.months[m];
                const mSurplus = mItem.inc - mItem.exp;
                rows.push(`
                    <tr class="text-slate-200 hover:bg-navy-850/50">
                        <td class="py-2 pl-9 pr-2 font-mono text-xs sm:text-sm text-slate-300">${escapeHtml(formatMonthPeriodLabel(yr, m))}</td>
                        <td class="py-2 px-2.5 font-semibold text-emerald-400">${formatMoney(mItem.inc)}</td>
                        <td class="py-2 px-2.5 font-semibold text-rose-400">${formatMoney(mItem.exp)}</td>
                        <td class="py-2 px-3 text-right font-bold ${mSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoney(mSurplus)}</td>
                    </tr>
                `);
            });
        }
    });
    tbody.innerHTML = rows.join('');
}

function renderLoanTables() {
    const recBody = document.getElementById('receivable-list-body');
    const payBody = document.getElementById('payable-list-body');
    let givenTotal = 0, givenDueCount = 0, takenTotal = 0, takenDueCount = 0;

    if (recBody) {
        const recRows = (loanGivenRecords || []).map(l => {
            const pName = escapeHtml(l.loan_records_description || l.person_name || 'Party');
            const eDate = escapeHtml(formatDisplayDate(l.loan_records_entry_date || l.entry_date));
            const sDate = l.loan_records_settled_date ? escapeHtml(formatDisplayDate(l.loan_records_settled_date)) : '-';
            const amt = Number(l.loan_records_amount ?? l.amount ?? 0) || 0;
            const extra = Number(l.loan_records_extra_amount ?? l.extra_amount ?? 0) || 0;
            const st = normalizeStatusLabel(l.loan_records_status ?? l.status, l.loan_records_settled_date);
            const settled = st === 'Paid' || st === 'Due Received';
            if (!settled) { givenTotal += amt; givenDueCount += 1; }
            return `
                <tr class="text-slate-200 hover:bg-navy-850/60">
                    <td class="py-2 pl-2.5 pr-1"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-receivable', 'count-del-receivable', '.loan-row-cb[data-cat=\\'receivable\\']')" class="loan-row-cb accent-rose-500" data-cat="receivable" value="${escapeHtml(l.id || '')}" /></td>
                    <td class="py-2 px-2 font-semibold">${pName}</td>
                    <td class="py-2 px-2 font-mono font-bold text-emerald-400">${formatMoney(amt)}</td>
                    <td class="py-2 px-2 font-mono text-[11px] text-slate-400">${eDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] ${sDate !== '-' ? 'text-emerald-300 font-semibold' : 'text-slate-400'}">${sDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] ${extra > 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}">${formatMoney(extra)}</td>
                    <td class="py-2 pl-2 pr-2.5 text-right">${!settled ? `<button type="button" onclick="openReceivableSettleModalById('${escapeHtml(l.id)}')" class="bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[11px]">Receive</button>` : `<span class="text-emerald-400 font-semibold text-[11px]">${escapeHtml(st)}</span>`}</td>
                </tr>
            `;
        });
        recBody.innerHTML = recRows.length ? recRows.join('') : '<tr><td colspan="7" class="py-4 text-center text-slate-400 text-xs">No Receivable records found.</td></tr>';
    }

    if (payBody) {
        const payRows = (loanTakenRecords || []).map(l => {
            const pName = escapeHtml(l.loan_records_description || l.person_name || 'Party');
            const eDate = escapeHtml(formatDisplayDate(l.loan_records_entry_date || l.entry_date));
            const sDate = l.loan_records_settled_date ? escapeHtml(formatDisplayDate(l.loan_records_settled_date)) : '-';
            const amt = Number(l.loan_records_amount ?? l.amount ?? 0) || 0;
            const extra = Number(l.loan_records_extra_amount ?? l.extra_amount ?? 0) || 0;
            const st = normalizeStatusLabel(l.loan_records_status ?? l.status, l.loan_records_settled_date);
            const settled = st === 'Paid' || st === 'Due Received';
            if (!settled) { takenTotal += amt; takenDueCount += 1; }
            return `
                <tr class="text-slate-200 hover:bg-navy-850/60">
                    <td class="py-2 pl-2.5 pr-1"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-payable', 'count-del-payable', '.loan-row-cb[data-cat=\\'payable\\']')" class="loan-row-cb accent-rose-500" data-cat="payable" value="${escapeHtml(l.id || '')}" /></td>
                    <td class="py-2 px-2 font-semibold">${pName}</td>
                    <td class="py-2 px-2 font-mono font-bold text-rose-400">${formatMoney(amt)}</td>
                    <td class="py-2 px-2 font-mono text-[11px] text-slate-400">${eDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] ${sDate !== '-' ? 'text-emerald-300 font-semibold' : 'text-slate-400'}">${sDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] ${extra > 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}">${formatMoney(extra)}</td>
                    <td class="py-2 pl-2 pr-2.5 text-right">${!settled ? `<button type="button" onclick="openPayableSettleModalById('${escapeHtml(l.id)}')" class="bg-rose-500 text-white font-bold px-2 py-0.5 rounded text-[11px]">Pay</button>` : `<span class="text-emerald-400 font-semibold text-[11px]">${escapeHtml(st)}</span>`}</td>
                </tr>
            `;
        });
        payBody.innerHTML = payRows.length ? payRows.join('') : '<tr><td colspan="7" class="py-4 text-center text-slate-400 text-xs">No Payable records found.</td></tr>';
    }

    if (document.getElementById('receivable-total-display')) document.getElementById('receivable-total-display').textContent = 'Total Due: ' + formatMoney(givenTotal);
    if (document.getElementById('receivable-due-count-badge')) document.getElementById('receivable-due-count-badge').textContent = `${givenDueCount} Due`;
    if (document.getElementById('payable-total-display')) document.getElementById('payable-total-display').textContent = 'Total Due: ' + formatMoney(takenTotal);
    if (document.getElementById('payable-due-count-badge')) document.getElementById('payable-due-count-badge').textContent = `${takenDueCount} Due`;
}

async function toggleMarketStatus(id) {
    const compId = resolveCompositeUserId();
    const cur = (marketExpenses || []).find(m => String(m.id) === String(id));
    const nextStatus = normalizeStatusLabel(cur?.income_expense_status ?? cur?.status ?? 'Due') === 'Paid' ? 'Due' : 'Paid';
    const res = await callBackendApi('update_income_expense_status', { composite_user_id: compId, id, status: nextStatus });
    if (res && res.success) {
        await loadAllDatabaseRecords();
        showToast(`স্ট্যাটাস ${nextStatus} হিসেবে আপডেট হয়েছে!`);
    }
}

function renderMarketExpensesTable() {
    const tbody = document.getElementById('daily-expenses-body') || document.getElementById('marketExpenseList');
    if (!tbody) return;
    if (!marketExpenses.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400 text-xs">No daily expenses recorded.</td></tr>';
        return;
    }
    tbody.innerHTML = marketExpenses.map(m => {
        const mDate = escapeHtml(formatDisplayDate(m.income_expense_date || m.expense_date));
        const mDesc = escapeHtml(m.income_expense_description || m.description || '');
        const mAmt = Number(m.income_expense_amount ?? m.amount ?? 0) || 0;
        const mStatus = normalizeStatusLabel(m.income_expense_status ?? m.status ?? 'Paid');
        return `
            <tr class="text-slate-200 hover:bg-navy-850/60">
                <td class="py-2.5 pl-3 pr-1"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-expenses', 'count-del-expenses', '.expense-row-cb')" class="expense-row-cb accent-rose-500" value="${escapeHtml(m.id || '')}" /></td>
                <td class="py-2.5 px-2.5 font-mono text-xs text-slate-400">${mDate}</td>
                <td class="py-2.5 px-2.5 font-semibold">${mDesc}</td>
                <td class="py-2.5 px-2.5 font-mono text-rose-400 font-bold">${formatMoney(mAmt)}</td>
                <td class="py-2.5 pl-2.5 pr-3 text-right">
                    <button type="button" onclick="toggleMarketStatus('${escapeHtml(m.id)}')" class="${mStatus === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-700/50' : 'bg-amber-950 text-amber-400 border-amber-700/50'} border px-2 py-0.5 rounded text-[11px] font-bold">${escapeHtml(mStatus)}</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderLotInventory() {
    const compId = resolveCompositeUserId();
    const inStockItems = accountsMasterRecords.filter(a => a.owner_id === compId && a.status === 'In_Stock');
    if (document.getElementById('availableLotIdsCount')) document.getElementById('availableLotIdsCount').innerText = inStockItems.length;
    const listEl = document.getElementById('lotInventorySummaryList');
    if (listEl) {
        listEl.innerHTML = inStockItems.length
            ? inStockItems.map(item => `<div class="flex justify-between items-center bg-[#131822] px-2 py-1 rounded border border-slate-800"><span class="text-amber-400 font-mono">${escapeHtml(item.lot_id)} • ${escapeHtml(item.user_name || item.user_id)}</span><span class="text-emerald-400 font-bold">In_Stock</span></div>`).join('')
            : '<p class="text-slate-500">No In_Stock IDs available.</p>';
    }
}

function openBuyValidityModal() {
    openModal('buyValidityModal');
    refreshValiditySummaryDisplay(validityCart);
}

function closeBuyValidityModal() {
    closeModal('buyValidityModal');
    if (isValidityExpiredSession) {
        document.getElementById('page2')?.classList.add('hidden');
        document.getElementById('page1')?.classList.remove('hidden');
    }
}

function addValidityToCart() {
    const months = Math.max(1, parseInt(document.getElementById('validityPlanDropdown')?.value, 10) || 1);
    const found = validityCart.find((i) => i.months === months);
    if (found) found.qty += 1;
    else validityCart.push({ months, qty: 1 });
    refreshValiditySummaryDisplay(validityCart);
}

function removeValidityCartItem(idx) {
    validityCart.splice(idx, 1);
    refreshValiditySummaryDisplay(validityCart);
}

async function refreshValiditySummaryDisplay(items = validityCart) {
    const compId = resolveCompositeUserId();
    const box = document.getElementById('validityCartItems');
    const useCouponWallet = Boolean(document.getElementById('useCouponWalletCheckbox')?.checked);

    const res = await callBackendApi('preview_validity_cart', {
        composite_user_id: compId,
        items: items || [],
        use_coupon_wallet: useCouponWallet
    });
    if (!res.success) return;

    const summary = res.summary || {};
    if (box && Array.isArray(summary.items) && summary.items.length) {
        box.innerHTML = summary.items.map((it, idx) => `
            <div class="flex items-center justify-between bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-1.5">
                <div><span class="font-semibold text-white">${escapeHtml(it.months)} Month(s) (${escapeHtml(it.days)} Days)</span> × ${escapeHtml(it.qty)}</div>
                <div class="flex items-center gap-2"><span class="font-mono text-slate-200">${formatMoney(it.subtotal || 0)}</span><button type="button" onclick="removeValidityCartItem(${idx})" class="text-rose-400 font-bold">×</button></div>
            </div>
        `).join('');
    } else if (box) {
        box.innerHTML = `<p class="text-slate-500 text-center py-2">Cart is empty. Select a plan & click Add.</p>`;
    }

    const setVal = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setVal('validityTotalDaysText', `${summary.totalDays || 0} Days`);
    setVal('validityBasePriceText', formatMoney(summary.baseTotal || 0));
    setVal('validityDiscountText', '- ' + formatMoney(summary.discountTotal || 0));
    setVal('validitySubtotalText', formatMoney(summary.subtotal || 0));
    setVal('validityWalletDeductText', '- ' + formatMoney(summary.walletDeducted || 0));
    setVal('validityPayableText', formatMoney(summary.payableAmount || 0));
    if (typeof summary.pendingDays !== 'undefined') syncValidityPendingUI(summary.pendingDays, summary.approvalStatus);
}

async function handleCashPayValidity() {
    const compId = resolveCompositeUserId();
    const trxBox = document.getElementById('validityTrxBox');
    const trxInput = document.getElementById('validityTrxId');
    if (!validityCart.length) return showToast('কার্টে অন্তত একটি প্ল্যান যোগ করুন।', 'warn');
    if (trxBox) trxBox.classList.remove('hidden');
    const trxId = trxInput ? trxInput.value.trim() : '';
    if (!trxId) return showToast('Transaction ID দিন।', 'warn');

    const res = await callBackendApi('buy_validity', {
        composite_user_id: compId,
        items: validityCart,
        use_coupon_wallet: Boolean(document.getElementById('useCouponWalletCheckbox')?.checked),
        trx_id: trxId,
        payment_method: 'Cash Pay'
    });

    if (res.success) {
        validityCart = [];
        if (trxInput) trxInput.value = '';
        await refreshValiditySummaryDisplay([]);
        if (!isValidityExpiredSession && compId) await loadAllDatabaseRecords();
        showToast('Wait for Validity Approval — রিকোয়েস্ট জমা হয়েছে।', 'warn');
    } else {
        showToast(res.message || 'Validity extension failed.', 'error');
    }
}

function renderUniversalMessages() {
    const box = document.getElementById('universalChatBox');
    if (!box) return;
    box.innerHTML = universalMessages.map(m => {
        const isMe = m.user_name === currentUserName || m.user_id === currentUserName;
        const senderLabel = escapeHtml(m.user_name || m.user_id || 'User');
        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You (' + senderLabel + ')' : senderLabel}</span>
                <div class="${isMe ? 'bg-emerald-600 text-slate-950 font-semibold' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">${escapeHtml(m.message)}</div>
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendUniversalMessage(e) {
    e.preventDefault();
    const input = document.getElementById('universalMsgInput');
    const text = (input?.value || '').trim();
    if (!text) return;
    const res = await callBackendApi('send_chat', { channel: 'Public_Forum', message: text });
    if (res.success) {
        universalMessages.push({ user_name: currentUserName, message: text });
        input.value = '';
        renderUniversalMessages();
    }
}

async function submitUserPasswordChange() {
    const newUsername = (document.getElementById('newUsernameInput')?.value || '').trim();
    const oldPassword = (document.getElementById('oldPasswordInput')?.value || '').trim();
    const newPassword = (document.getElementById('newPasswordInput')?.value || '').trim();
    const confirmPassword = (document.getElementById('confirmPasswordInput')?.value || '').trim();

    if (!oldPassword || !newPassword || !confirmPassword) return alert('সব ঘর পূরণ করুন।');
    if (newPassword !== confirmPassword) return alert('নতুন পাসওয়ার্ড মিলছে না!');

    const result = await callBackendApi('user_password_change', {
        new_username: newUsername,
        old_password: oldPassword,
        new_password: newPassword
    });

    if (result.success) {
        alert(result.message);
        handleLogOut();
        window.location.reload();
    } else {
        alert(result.message || 'পরিবর্তন ব্যর্থ হয়েছে!');
    }
}

window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.channel !== BRIDGE_CHANNEL) return;
    if (data.type === 'SET_USER_SCOPE') {
        const nextCompId = (data.payload && data.payload.composite_user_id) || data.compositeUserId;
        if (nextCompId && nextCompId !== currentCompositeUserId) {
            syncCompositeIdToIframe(nextCompId);
            if (document.getElementById('monthly-summary-body') || document.getElementById('monthlyRowsContainer')) {
                loadAllDatabaseRecords();
            }
        }
    } else if (data.type === 'REQUEST_USER_SCOPE') {
        syncCompositeIdToIframe(resolveCompositeUserId() || '101_admin');
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    ['incomeDate', 'loanDate', 'marketDate', 'settleDate', 'ie-date', 'loan-date', 'dexp-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    document.addEventListener('click', (event) => {
        const targetEl = event.target.closest('button, a, [role="tab"], [data-action], [data-tab], [data-target]');
        if (!targetEl) return;

        const attrHint = [
            targetEl.id,
            targetEl.dataset.action,
            targetEl.dataset.tab,
            targetEl.dataset.target,
            targetEl.dataset.section,
            targetEl.textContent
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (
            targetEl.matches('#btn-show-accounts, #showAccountsBtn, [data-action="show-accounts"], [data-toggle="accounts"]') ||
            /\bshow\s*accounts\b/.test(attrHint)
        ) {
            event.preventDefault();
            openAccountsModal();
            return;
        }

        if (/\b(show\s*settings|settings)\b/.test(attrHint)) {
            event.preventDefault();
            openShowSettingsModal();
            return;
        }

        if (/\b(my\s*set|myset)\b/.test(attrHint)) {
            event.preventDefault();
            openMySetModal();
            return;
        }

        if (/\b(my\s*chat|chat)\b/.test(attrHint)) {
            event.preventDefault();
            switchToMyChat();
            return;
        }

        if (/\b(cash\s*memo|memo)\b/.test(attrHint)) {
            event.preventDefault();
            switchToCashMemo();
            return;
        }

        if (/\bdashboard\b/.test(attrHint) && targetEl.closest('nav, [role="tablist"], .nav-bar, .tab-bar, header')) {
            event.preventDefault();
            switchToDashboard();
        }
    });

    const initialCompId = resolveCompositeUserId();
    if (initialCompId) {
        syncCompositeIdToIframe(initialCompId);
        if (document.getElementById('monthly-summary-body') || document.getElementById('receivable-list-body') || document.getElementById('daily-expenses-body')) {
            loadAllDatabaseRecords();
        }
    }
    notifyParentFrameHeight();
});
