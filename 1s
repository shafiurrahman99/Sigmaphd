/**
 * =========================================================================
 * SIGMA PhD™ - CLIENT SCRIPT (UI, Rendering, Modals & API Connector)
 * =========================================================================
 */

const BRIDGE_CHANNEL = 'SIGMAPHD_DASHBOARD_BRIDGE';
const PROXY_URL = '/api/root-proxy';
const TRUSTED_ORIGIN = window.location.origin;

let GLOBAL_COMPANY_ID = "101";
let currentUserName = "";
let currentCompositeUserId = "";
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
const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeHtml(val) {
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSessionToken() {
    return window.__SIGMA_SESSION_TOKEN || sessionStorage.getItem('sigma_session_token') || '';
}

function setSessionToken(token) {
    window.__SIGMA_SESSION_TOKEN = token || '';
    try {
        if (token) sessionStorage.setItem('sigma_session_token', token);
        else sessionStorage.removeItem('sigma_session_token');
    } catch (_) {}
}

function formatDisplayDate(rawDate) {
    if (!rawDate) return '-';
    const str = String(rawDate).trim();
    if (!str || str === '-') return '-';

    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        const mIdx = Math.max(0, Math.min(11, parseInt(isoMatch[2], 10) - 1));
        const dStr = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
        return `${dStr} ${MONTH_SHORT_NAMES[mIdx]} ${isoMatch[1].slice(-2)}`;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        const dStr = String(parsed.getUTCDate()).padStart(2, '0');
        const mStr = MONTH_SHORT_NAMES[parsed.getUTCMonth()];
        return `${dStr} ${mStr} ${String(parsed.getUTCFullYear()).slice(-2)}`;
    }
    return str;
}

function formatMonthPeriodLabel(yearStr, monthNumStr) {
    const mIdx = Math.max(0, Math.min(11, parseInt(monthNumStr, 10) - 1));
    return `${MONTH_SHORT_NAMES[mIdx]} ${String(yearStr || '').slice(-2)}`;
}

function toggleSummaryYearGroup(yearKey) {
    const key = String(yearKey);
    expandedSummaryYears[key] = !(expandedSummaryYears[key] !== false);
    renderMonthlySummaryTable();
    notifyParentFrameHeight();
}

function normalizeStatusLabel(rawStatus, settledDate = null) {
    const clean = String(rawStatus ?? '').trim().toLowerCase();
    if (clean === 'paid' || clean === 'settled' || clean === 'completed') return 'Paid';
    if (clean === 'due received' || clean === 'received') return 'Due Received';
    if (settledDate && String(settledDate).trim() !== '' && clean !== 'due') return 'Paid';
    return 'Due';
}

function formatMoney(num) {
    return '৳ ' + Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* =========================================================================
 * COMPOSITE USER ID (Hidden from DOM, Kept in Memory/Session) & BRIDGE
 * ========================================================================= */
function resolveCompositeUserId() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = (urlParams.get('composite_user_id') || '').trim();
    const fromWindow = String(window.ACTIVE_COMPOSITE_USER_ID || '').trim();
    const fromState = String(currentCompositeUserId || '').trim();
    let fromStorage = '';
    try {
        fromStorage = String(sessionStorage.getItem('composite_user_id') || '').trim();
    } catch (_) {}

    const resolved = fromState || fromWindow || fromUrl || fromStorage || '';
    if (resolved) {
        currentCompositeUserId = resolved;
        window.ACTIVE_COMPOSITE_USER_ID = resolved;
        try { sessionStorage.setItem('composite_user_id', resolved); } catch (_) {}
    }
    return resolved;
}

function syncCompositeIdToIframe(compId) {
    const cleanId = String(compId || '').trim();
    if (!cleanId) return;
    currentCompositeUserId = cleanId;
    window.ACTIVE_COMPOSITE_USER_ID = cleanId;
    try { sessionStorage.setItem('composite_user_id', cleanId); } catch (_) {}

    if (typeof window.syncDashboardIframeUser === 'function') {
        window.syncDashboardIframeUser(cleanId);
    } else {
        const frame = document.getElementById('dashboardFrame');
        frame?.contentWindow?.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'SET_USER_SCOPE',
            compositeUserId: cleanId,
            payload: { composite_user_id: cleanId }
        }, TRUSTED_ORIGIN);
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
        }, TRUSTED_ORIGIN);
    }
}

/* =========================================================================
 * API CONNECTOR (Attaches Session Token & Hidden Composite User ID)
 * ========================================================================= */
async function callBackendApi(action, payload = {}) {
    try {
        const activeCompId = resolveCompositeUserId() || payload?.composite_user_id || '';
        const token = getSessionToken();

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                action,
                company_id: GLOBAL_COMPANY_ID,
                composite_user_id: activeCompId,
                session_token: token,
                payload: { ...(payload || {}), ...(activeCompId ? { composite_user_id: activeCompId } : {}) }
            })
        });
        return await response.json();
    } catch (err) {
        console.error('Database API Error:', err);
        return { success: false, message: 'Network or database connection error.' };
    }
}

/* =========================================================================
 * TOAST & MODALS
 * ========================================================================= */
function showToast(text, variant = 'success') {
    if (window.self !== window.top && window.parent) {
        window.parent.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'TOAST',
            compositeUserId: resolveCompositeUserId(),
            message: text,
            variant
        }, TRUSTED_ORIGIN);
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
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 3000);
}

function hideToast() {
    document.getElementById('toast')?.classList.add('hidden');
}

function openModal(modalId) {
    resolveCompositeUserId();
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    notifyParentFrameHeight();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
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
    if (document.getElementById('incomeEntryType')) {
        document.getElementById('incomeEntryType').value = normalized === 'expense' ? 'Expense' : 'Income';
    }
    window.__currentIEModalType = normalized;
}

function updateLoanEntryHint() {
    const dir = document.getElementById('loan-direction')?.value || 'receivable';
    const dateLabel = document.getElementById('loan-date-label');
    if (dateLabel) dateLabel.textContent = dir === 'payable' ? 'Payable Date' : 'Receivable Date';
}

function openIncomeExpenseModal(type = 'income') {
    const d = document.getElementById('ie-date');
    if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    setIEModalType(type);
    openModal('modal-income-expense');
}

function openLoanEntryModal() {
    const d = document.getElementById('loan-date');
    if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    updateLoanEntryHint();
    openModal('modal-loan-entry');
}

function openDailyExpenseModal() {
    const d = document.getElementById('dexp-date');
    if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    openModal('modal-daily-expense');
}

function updateDeleteCounter(btnId, countId, selector) {
    const btn = document.getElementById(btnId);
    const cnt = document.getElementById(countId);
    const checkedCount = document.querySelectorAll(`${selector}:checked`).length;
    if (cnt) cnt.textContent = String(checkedCount);
    if (btn) btn.classList.toggle('hidden', checkedCount === 0);
}

/* =========================================================================
 * AUTH, SESSION & VALIDITY COUNTDOWN
 * ========================================================================= */
async function handleMainSignIn(e) {
    if (e?.preventDefault) e.preventDefault();
    const uname = document.getElementById('mainUserName')?.value.trim() || '';
    const pass = document.getElementById('mainUserPassword')?.value.trim() || '';
    if (!uname || !pass) {
        showToast('ইউজারনেম এবং পাসওয়ার্ড দিন।', 'warn');
        return;
    }

    const res = await callBackendApi('authenticate_user', { user_name: uname, password: pass });
    if (res?.success && res.user) {
        const user = res.user;
        if (res.session_token) setSessionToken(res.session_token);

        currentUserName = user.user_name || uname;
        currentCompositeUserId = user.composite_user_id || '';
        const mobile = user.buyer_mobile || '01818589423';
        const last4 = mobile.length >= 4 ? mobile.slice(-4) : '8423';

        try {
            if (currentCompositeUserId) sessionStorage.setItem('composite_user_id', currentCompositeUserId);
            sessionStorage.setItem('user_name', currentUserName);
            sessionStorage.setItem('buyer_email', user.buyer_email || '');
        } catch (_) {}

        if (document.getElementById('currentLoggedInUser')) document.getElementById('currentLoggedInUser').innerText = currentUserName;
        if (currentCompositeUserId) syncCompositeIdToIframe(currentCompositeUserId);
        if (document.getElementById('userCouponCode')) document.getElementById('userCouponCode').innerText = 'SIGMA_' + last4;
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
        showToast(res?.message || 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!', 'error');
    }
}

function handleLogOut() {
    if (validityCountdownTimer) { clearInterval(validityCountdownTimer); validityCountdownTimer = null; }
    isValidityExpiredSession = false;
    validityExpiryTime = 0;
    currentUserName = '';
    currentCompositeUserId = '';
    window.ACTIVE_COMPOSITE_USER_ID = '';
    setSessionToken('');
    try {
        localStorage.removeItem('sigma_session_token');
        localStorage.removeItem('composite_user_id');
        sessionStorage.clear();
    } catch (_) {}
    document.getElementById('page2')?.classList.add('hidden');
    document.getElementById('page1')?.classList.remove('hidden');
    showToast('সফলভাবে লগআউট করা হয়েছে।');
}

function getValidityExpiryTimestamp(user = {}) {
    if (user.validity_expires_at) {
        const ts = new Date(user.validity_expires_at).getTime();
        if (!Number.isNaN(ts)) return ts;
    }
    if (user.activated_at) {
        const baseTs = new Date(user.activated_at).getTime();
        const days = Number(user.validity_days) || 0;
        if (!Number.isNaN(baseTs) && days > 0) return baseTs + days * 24 * 60 * 60 * 1000;
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
    const notice = document.getElementById('validityModalPendingNotice');
    const details = document.getElementById('validityModalPendingDetails');
    if (notice) {
        notice.classList.toggle('hidden', !hasPending);
        if (details) details.innerText = hasPending ? `Pending Extension: ${days} Days • Status: Wait for Validity Approval` : '';
    }
}

function enforceExpiredValidityFlow(user = {}) {
    const pendingDays = Number(user.pending_validity_days || 0);
    const approvalStatus = user.validity_approval_status || 'NONE';
    isValidityExpiredSession = true;
    syncValidityPendingUI(pendingDays, approvalStatus);

    currentUserName = '';
    try { sessionStorage.removeItem('user_name'); } catch (_) {}
    document.getElementById('page2')?.classList.add('hidden');
    document.getElementById('page1')?.classList.remove('hidden');
    openBuyValidityModal();

    showToast(
        (pendingDays > 0 || approvalStatus === 'Admin Approval')
            ? 'Wait for Validity Approval — আপনার ভ্যালিডিটি এক্সটেন্ড পেন্ডিং রয়েছে।'
            : 'আপনার ভ্যালিডিটি শেষ হয়ে গেছে! অনুগ্রহ করে Validity Extend করুন।',
        'warn'
    );
}

function applyValidityStateFromUser(user = {}) {
    const expiryTs = getValidityExpiryTimestamp(user);
    validityExpiryTime = expiryTs;
    syncValidityPendingUI(user.pending_validity_days || 0, user.validity_approval_status || 'NONE');

    if (!expiryTs || Date.now() >= expiryTs) {
        enforceExpiredValidityFlow(user);
        return false;
    }
    isValidityExpiredSession = false;
    startValidityCountdown();
    return true;
}

function startValidityCountdown() {
    if (validityCountdownTimer) { clearInterval(validityCountdownTimer); validityCountdownTimer = null; }
    const tick = () => {
        if (!validityExpiryTime) return;
        const diff = validityExpiryTime - Date.now();
        if (diff <= 0) {
            clearInterval(validityCountdownTimer);
            validityCountdownTimer = null;
            ['countdownDays', 'countdownHours', 'countdownMins', 'countdownSecs'].forEach((id) => {
                if (document.getElementById(id)) document.getElementById(id).innerText = '00';
            });
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
    tick();
    validityCountdownTimer = setInterval(tick, 1000);
}

/* =========================================================================
 * DATA FETCH & TABLE RENDERERS
 * ========================================================================= */
async function loadAllDatabaseRecords() {
    const activeCompId = resolveCompositeUserId();
    const res = await callBackendApi('fetch_dashboard_data', { composite_user_id: activeCompId });
    if (res?.success) {
        incomeExpenseRecords = res.income_expenses || [];
        loanGivenRecords = (res.loans_receivable || []).map((r) => ({
            ...r,
            loan_records_status: normalizeStatusLabel(r.loan_records_status ?? r.status, r.loan_records_settled_date),
            status: normalizeStatusLabel(r.loan_records_status ?? r.status, r.loan_records_settled_date)
        }));
        loanTakenRecords = (res.loans_payable || []).map((r) => ({
            ...r,
            loan_records_status: normalizeStatusLabel(r.loan_records_status ?? r.status, r.loan_records_settled_date),
            status: normalizeStatusLabel(r.loan_records_status ?? r.status, r.loan_records_settled_date)
        }));
        marketExpenses = res.daily_expenses || [];
        accountsMasterRecords = res.accounts || [];
        universalMessages = res.public_chats || [];

        const me = accountsMasterRecords.find((a) => a.composite_user_id === activeCompId);
        if (me) {
            if (document.getElementById('walletBalanceText')) document.getElementById('walletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            if (document.getElementById('validityWalletBalanceText')) document.getElementById('validityWalletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            if ((me.validity_expires_at || me.activated_at) && !applyValidityStateFromUser(me)) return;
        }
    }
    renderMonthlySummaryTable();
    renderLoanTables();
    renderMarketExpensesTable();
    renderLotInventory();
    notifyParentFrameHeight();
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
        const match = String(rawDate || '2026-11').trim().match(/^(\d{4})[-/](\d{1,2})/);
        if (match) return { year: match[1], month: String(parseInt(match[2], 10)).padStart(2, '0') };
        return { year: '2026', month: '11' };
    };

    (incomeExpenseRecords || []).forEach((item) => {
        const type = String(item.entry_type || item.income_expense_type || 'Income').toLowerCase();
        const amt = Number(item.amount ?? item.income_expense_amount ?? 0) || 0;
        const st = String(item.status || item.income_expense_status || 'Paid').toLowerCase();
        const { year, month } = parseYM(item.entry_date || item.income_expense_date);

        if (type === 'income') {
            ensureBucket(year, month);
            totalInc += amt; yearGroups[year].inc += amt; yearGroups[year].months[month].inc += amt;
        } else if (type === 'incomededuction') {
            ensureBucket(year, month);
            totalInc -= amt; yearGroups[year].inc -= amt; yearGroups[year].months[month].inc -= amt;
        } else if (type === 'expense' && st === 'paid') {
            ensureBucket(year, month);
            if (item.id != null) seenExpenseIds.add(String(item.id));
            totalExp += amt; yearGroups[year].exp += amt; yearGroups[year].months[month].exp += amt;
        }
    });

    (marketExpenses || []).forEach((m) => {
        if (m.id != null && seenExpenseIds.has(String(m.id))) return;
        if (String(m.status || m.income_expense_status || 'Paid').toLowerCase() === 'paid') {
            const { year, month } = parseYM(m.expense_date || m.income_expense_date);
            const amt = Number(m.amount ?? m.income_expense_amount ?? 0) || 0;
            ensureBucket(year, month);
            totalExp += amt; yearGroups[year].exp += amt; yearGroups[year].months[month].exp += amt;
        }
    });

    const net = totalInc - totalExp;
    const setTxt = (id, v) => { if (document.getElementById(id)) document.getElementById(id).innerText = formatMoney(v); };
    setTxt('totalIncomeAll', totalInc); setTxt('totalExpenseAll', totalExp); setTxt('totalSurplusAll', net);
    setTxt('memo-total-income', totalInc); setTxt('memo-total-expense', totalExp); setTxt('memo-net-surplus', net);

    const years = Object.keys(yearGroups).sort((a, b) => Number(b) - Number(a));
    if (!years.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400 text-xs">No summary records found yet.</td></tr>';
        return;
    }

    const rows = [];
    years.forEach((yr) => {
        const grp = yearGroups[yr];
        const expanded = expandedSummaryYears[yr] !== false;
        const yrSurplus = grp.inc - grp.exp;
        rows.push(`
            <tr class="bg-navy-850/90 text-white border-y border-slate-700/70">
                <td class="py-2.5 pl-3 pr-2 font-mono text-xs sm:text-sm font-bold whitespace-nowrap">
                    <button type="button" onclick="toggleSummaryYearGroup('${escapeHtml(yr)}')" class="inline-flex items-center justify-center w-5 h-5 mr-2 rounded bg-slate-700 hover:bg-emerald-500 hover:text-slate-950 text-white font-bold text-xs cursor-pointer">${expanded ? '−' : '+'}</button>
                    <span>${escapeHtml(yr)}</span>
                </td>
                <td class="py-2.5 px-2.5 font-bold text-emerald-400 whitespace-nowrap">${formatMoney(grp.inc)}</td>
                <td class="py-2.5 px-2.5 font-bold text-rose-400 whitespace-nowrap">${formatMoney(grp.exp)}</td>
                <td class="py-2.5 px-3 text-right font-extrabold whitespace-nowrap ${yrSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoney(yrSurplus)}</td>
            </tr>
        `);
        if (expanded) {
            Object.keys(grp.months).sort((a, b) => Number(b) - Number(a)).forEach((m) => {
                const mItem = grp.months[m];
                const mSurplus = mItem.inc - mItem.exp;
                rows.push(`
                    <tr class="text-slate-200 hover:bg-navy-850/50">
                        <td class="py-2 pl-9 pr-2 font-mono text-xs sm:text-sm text-slate-300 whitespace-nowrap">${escapeHtml(formatMonthPeriodLabel(yr, m))}</td>
                        <td class="py-2 px-2.5 font-semibold text-emerald-400 whitespace-nowrap">${formatMoney(mItem.inc)}</td>
                        <td class="py-2 px-2.5 font-semibold text-rose-400 whitespace-nowrap">${formatMoney(mItem.exp)}</td>
                        <td class="py-2 px-3 text-right font-bold whitespace-nowrap ${mSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoney(mSurplus)}</td>
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
    const extraOf = (l, amt) => {
        const direct = Number(l.loan_records_extra_amount ?? l.extra_amount ?? 0);
        if (!Number.isNaN(direct) && direct > 0) return direct;
        const settled = Number(l.loan_records_settled_amount ?? NaN);
        return (!Number.isNaN(settled) && settled > amt) ? (settled - amt) : 0;
    };

    const buildRows = (list, cat, amtColor, btnClass, btnLabel, settleFn) => {
        let dueSum = 0, dueCnt = 0;
        const html = (list || []).map((l) => {
            const name = escapeHtml(l.person_name || l.description || l.loan_records_description || 'Party');
            const rawSettled = l.loan_records_settled_date || l.settle_date || null;
            const eDate = escapeHtml(formatDisplayDate(l.entry_date || l.date || l.loan_records_entry_date));
            const sDateRaw = rawSettled ? formatDisplayDate(rawSettled) : '-';
            const sDate = escapeHtml(sDateRaw);
            const amt = Number(l.amount ?? l.loan_records_amount ?? 0) || 0;
            const extra = extraOf(l, amt);
            const st = normalizeStatusLabel(l.status ?? l.loan_records_status ?? 'Due', rawSettled);
            const settled = st === 'Paid' || st === 'Due Received';
            if (!settled) { dueSum += amt; dueCnt += 1; }
            return `
                <tr class="text-slate-200 hover:bg-navy-850/60">
                    <td class="py-2 pl-2.5 pr-1 row-select-cb"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-${cat}', 'count-del-${cat}', '.loan-row-cb[data-cat=\\'${cat}\\']')" class="loan-row-cb accent-rose-500" data-cat="${cat}" value="${escapeHtml(l.id || '')}" /></td>
                    <td class="py-2 px-2 font-semibold break-words max-w-[130px] sm:max-w-none">${name}</td>
                    <td class="py-2 px-2 font-mono font-bold whitespace-nowrap ${amtColor}">${formatMoney(amt)}</td>
                    <td class="py-2 px-2 font-mono text-[11px] text-slate-400 whitespace-nowrap hidden sm:table-cell">${eDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] whitespace-nowrap hidden sm:table-cell ${sDateRaw !== '-' ? 'text-emerald-300 font-semibold' : 'text-slate-400'}">${sDate}</td>
                    <td class="py-2 px-2 font-mono text-[11px] whitespace-nowrap hidden sm:table-cell ${extra > 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}">${formatMoney(extra)}</td>
                    <td class="py-2 pl-1.5 pr-2 text-right whitespace-nowrap">
                        ${!settled ? `<button type="button" onclick="${settleFn}('${escapeHtml(l.id)}')" class="${btnClass} font-bold px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] cursor-pointer">${btnLabel}</button>` : `<span class="text-emerald-400 font-semibold text-[10px] sm:text-[11px]">${escapeHtml(st)}</span>`}
                    </td>
                </tr>
            `;
        });
        return { html, dueSum, dueCnt };
    };

    const rec = buildRows(loanGivenRecords, 'receivable', 'text-emerald-400', 'bg-emerald-500 hover:bg-emerald-400 text-slate-950', 'Receive', 'openReceivableSettleModalById');
    if (recBody) recBody.innerHTML = rec.html.length ? rec.html.join('') : '<tr><td colspan="7" class="py-4 text-center text-slate-400 text-xs">No Receivable records found.</td></tr>';
    if (document.getElementById('receivable-total-display')) document.getElementById('receivable-total-display').textContent = 'Total Due: ' + formatMoney(rec.dueSum);
    if (document.getElementById('receivable-due-count-badge')) document.getElementById('receivable-due-count-badge').textContent = `${rec.dueCnt} Due`;

    const pay = buildRows(loanTakenRecords, 'payable', 'text-rose-400', 'bg-rose-500 hover:bg-rose-400 text-white', 'Pay', 'openPayableSettleModalById');
    if (payBody) payBody.innerHTML = pay.html.length ? pay.html.join('') : '<tr><td colspan="7" class="py-4 text-center text-slate-400 text-xs">No Payable records found.</td></tr>';
    if (document.getElementById('payable-total-display')) document.getElementById('payable-total-display').textContent = 'Total Due: ' + formatMoney(pay.dueSum);
    if (document.getElementById('payable-due-count-badge')) document.getElementById('payable-due-count-badge').textContent = `${pay.dueCnt} Due`;

    updateDeleteCounter('btn-delete-receivable', 'count-del-receivable', ".loan-row-cb[data-cat='receivable']");
    updateDeleteCounter('btn-delete-payable', 'count-del-payable', ".loan-row-cb[data-cat='payable']");
}

function renderMarketExpensesTable() {
    const tbody = document.getElementById('daily-expenses-body') || document.getElementById('marketExpenseList');
    if (!tbody) return;
    if (!marketExpenses?.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400 text-xs">No daily expenses recorded.</td></tr>';
        updateDeleteCounter('btn-delete-expenses', 'count-del-expenses', '.expense-row-cb');
        return;
    }
    tbody.innerHTML = marketExpenses.map((m) => {
        const d = escapeHtml(formatDisplayDate(m.expense_date || m.date || m.income_expense_date));
        const desc = escapeHtml(m.description || m.desc || m.income_expense_description || '');
        const amt = Number(m.amount ?? m.income_expense_amount ?? 0) || 0;
        const st = normalizeStatusLabel(m.status ?? m.income_expense_status ?? 'Paid');
        return `
            <tr class="text-slate-200 hover:bg-navy-850/60">
                <td class="py-2 pl-2.5 pr-1 row-select-cb"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-expenses', 'count-del-expenses', '.expense-row-cb')" class="expense-row-cb accent-rose-500" value="${escapeHtml(m.id || '')}" /></td>
                <td class="py-2 px-2 font-mono text-xs text-slate-400 whitespace-nowrap hidden sm:table-cell">${d}</td>
                <td class="py-2 px-2 font-semibold text-xs break-words max-w-[130px] sm:max-w-none">${desc}</td>
                <td class="py-2 px-2 font-mono text-xs text-rose-400 font-bold whitespace-nowrap">${formatMoney(amt)}</td>
                <td class="py-2 pl-1.5 pr-2 text-right whitespace-nowrap">
                    <button type="button" onclick="toggleMarketStatus('${escapeHtml(m.id)}')" class="${st === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-700/50' : 'bg-amber-950 text-amber-400 border-amber-700/50'} border px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold cursor-pointer">${escapeHtml(st)}</button>
                </td>
            </tr>
        `;
    }).join('');
    updateDeleteCounter('btn-delete-expenses', 'count-del-expenses', '.expense-row-cb');
}

/* =========================================================================
 * FORM SUBMIT & DELETE HANDLERS
 * ========================================================================= */
async function handleIncomeExpenseSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    const type = window.__currentIEModalType === 'expense' ? 'Expense' : 'Income';
    const date = document.getElementById('ie-date')?.value || new Date().toISOString().split('T')[0];
    const amount = parseFloat(document.getElementById('ie-amount')?.value) || 0;
    const desc = (document.getElementById('ie-description')?.value || '').trim();
    if (!desc || amount <= 0) { showToast('সঠিক Amount এবং Description দিন।', 'warn'); return; }

    const res = await callBackendApi('save_income_expense', { type, date, desc, amount, status: 'Paid' });
    if (res?.success) {
        document.getElementById('form-income-expense')?.reset();
        closeModal('modal-income-expense');
        await loadAllDatabaseRecords();
        showToast(`${type} এন্ট্রি ডাটাবেজে সংরক্ষিত হয়েছে!`);
    } else showToast(res?.message || 'এন্ট্রি সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
}

async function handleLoanEntrySubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    const direction = (document.getElementById('loan-direction')?.value || 'receivable').toLowerCase();
    const status = document.getElementById('loan-status')?.value || 'Due';
    const personName = (document.getElementById('loan-description')?.value || '').trim();
    const amount = parseFloat(document.getElementById('loan-amount')?.value) || 0;
    const entryDate = document.getElementById('loan-date')?.value || new Date().toISOString().split('T')[0];
    if (!personName || amount <= 0) { showToast('Description এবং সঠিক Amount দিন।', 'warn'); return; }

    const res = await callBackendApi('save_loan', { direction, status, person_name: personName, amount, entry_date: entryDate });
    if (res?.success) {
        document.getElementById('form-loan-entry')?.reset();
        closeModal('modal-loan-entry');
        await loadAllDatabaseRecords();
        showToast('লোন রেকর্ড ডাটাবেজে সংরক্ষিত হয়েছে!');
    } else showToast(res?.message || 'লোন এন্ট্রি সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
}

async function handleDailyExpenseSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    const date = document.getElementById('dexp-date')?.value || new Date().toISOString().split('T')[0];
    const amount = parseFloat(document.getElementById('dexp-amount')?.value) || 0;
    const desc = (document.getElementById('dexp-description')?.value || '').trim();
    const status = normalizeStatusLabel(document.getElementById('dexp-status')?.value || 'Paid');
    if (!desc || amount <= 0) { showToast('সঠিক Amount এবং Description দিন।', 'warn'); return; }

    const res = await callBackendApi('save_market_expense', { expense_date: date, description: desc, amount, status });
    if (res?.success) {
        document.getElementById('form-daily-expense')?.reset();
        closeModal('modal-daily-expense');
        await loadAllDatabaseRecords();
        showToast(status === 'Due' ? 'Due expense Payable লিস্টে যুক্ত হয়েছে।' : 'দৈনিক খরচ সংরক্ষিত হয়েছে!');
    } else showToast(res?.message || 'খরচ সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
}

function openReceivableSettleModalById(id) {
    const item = loanGivenRecords.find((x) => String(x.id) === String(id));
    if (!item) return;
    if (document.getElementById('rec-settle-id')) document.getElementById('rec-settle-id').value = item.id;
    if (document.getElementById('rec-settle-desc')) document.getElementById('rec-settle-desc').textContent = item.person_name || item.loan_records_description || 'Party';
    if (document.getElementById('rec-settle-principal')) document.getElementById('rec-settle-principal').textContent = formatMoney(item.amount ?? item.loan_records_amount ?? 0);
    if (document.getElementById('rec-settle-date')) document.getElementById('rec-settle-date').value = new Date().toISOString().split('T')[0];
    if (document.getElementById('rec-settle-extra')) document.getElementById('rec-settle-extra').value = '0';
    openModal('modal-receivable-settle');
}

function openPayableSettleModalById(id) {
    const item = loanTakenRecords.find((x) => String(x.id) === String(id));
    if (!item) return;
    if (document.getElementById('pay-settle-id')) document.getElementById('pay-settle-id').value = item.id;
    if (document.getElementById('pay-settle-desc')) document.getElementById('pay-settle-desc').textContent = item.person_name || item.loan_records_description || 'Party';
    if (document.getElementById('pay-settle-principal')) document.getElementById('pay-settle-principal').textContent = formatMoney(item.amount ?? item.loan_records_amount ?? 0);
    if (document.getElementById('pay-settle-source')) document.getElementById('pay-settle-source').textContent = item.loan_records_source || 'Ledger';
    if (document.getElementById('pay-settle-date')) document.getElementById('pay-settle-date').value = new Date().toISOString().split('T')[0];
    if (document.getElementById('pay-settle-extra')) document.getElementById('pay-settle-extra').value = '0';
    openModal('modal-payable-settle');
}

async function handleReceivableSettleSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    const res = await callBackendApi('settle_loan', {
        id: document.getElementById('rec-settle-id')?.value || '',
        status: 'Paid',
        settled_date: document.getElementById('rec-settle-date')?.value || new Date().toISOString().split('T')[0],
        extra_amount: parseFloat(document.getElementById('rec-settle-extra')?.value) || 0
    });
    if (res?.success) { closeModal('modal-receivable-settle'); await loadAllDatabaseRecords(); showToast('Receivable সেটেল সম্পন্ন হয়েছে!'); }
    else showToast(res?.message || 'সেটেলমেন্ট ব্যর্থ হয়েছে।', 'error');
}

async function handlePayableSettleSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    const res = await callBackendApi('settle_loan', {
        id: document.getElementById('pay-settle-id')?.value || '',
        status: 'Paid',
        settled_date: document.getElementById('pay-settle-date')?.value || new Date().toISOString().split('T')[0],
        extra_amount: parseFloat(document.getElementById('pay-settle-extra')?.value) || 0
    });
    if (res?.success) { closeModal('modal-payable-settle'); await loadAllDatabaseRecords(); showToast('Payable সেটেল সম্পন্ন হয়েছে!'); }
    else showToast(res?.message || 'সেটেলমেন্ট ব্যর্থ হয়েছে।', 'error');
}

async function toggleMarketStatus(id) {
    const cur = marketExpenses.find((m) => String(m.id) === String(id));
    const nextStatus = normalizeStatusLabel(cur?.status ?? cur?.income_expense_status ?? 'Due') === 'Paid' ? 'Due' : 'Paid';
    const res = await callBackendApi('update_income_expense_status', { id, status: nextStatus });
    if (res?.success) { await loadAllDatabaseRecords(); showToast(`স্ট্যাটাস ${nextStatus} আপডেট হয়েছে!`); }
    else showToast(res?.message || 'স্ট্যাটাস আপডেট ব্যর্থ হয়েছে।', 'error');
}

async function deleteSelectedIncomes() {
    const ids = Array.from(document.querySelectorAll('.income-row-cb:checked')).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_income_entries', { ids });
    if (res?.success) { await loadAllDatabaseRecords(); openIncomeListModal(); showToast('নির্বাচিত Income মুছে ফেলা হয়েছে।'); }
}

async function deleteSelectedLoans(category) {
    const ids = Array.from(document.querySelectorAll(`.loan-row-cb[data-cat="${category}"]:checked`)).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_loan_entries', { category, ids });
    if (res?.success) { await loadAllDatabaseRecords(); showToast('নির্বাচিত Loan মুছে ফেলা হয়েছে।'); }
}

async function deleteSelectedExpenses() {
    const ids = Array.from(document.querySelectorAll('.expense-row-cb:checked')).map((cb) => cb.value).filter(Boolean);
    if (!ids.length) return;
    const res = await callBackendApi('delete_market_expenses', { ids });
    if (res?.success) { await loadAllDatabaseRecords(); showToast('নির্বাচিত Expense মুছে ফেলা হয়েছে।'); }
}

function openIncomeListModal() {
    const tbody = document.getElementById('income-list-modal-body');
    if (tbody) {
        const incomes = incomeExpenseRecords.filter((r) => String(r.entry_type || r.income_expense_type || 'Income').toLowerCase() === 'income');
        tbody.innerHTML = !incomes.length
            ? '<tr><td colspan="4" class="py-4 text-center text-slate-400">No income entries found.</td></tr>'
            : incomes.map((r) => `
                <tr>
                    <td class="py-2 pl-3 pr-1"><input type="checkbox" onchange="updateDeleteCounter('btn-delete-incomes', 'count-del-incomes', '.income-row-cb')" class="income-row-cb accent-emerald-500" value="${escapeHtml(r.id || '')}" /></td>
                    <td class="py-2 px-2.5 font-mono text-xs whitespace-nowrap">${escapeHtml(formatDisplayDate(r.entry_date || r.income_expense_date))}</td>
                    <td class="py-2 px-2.5">${escapeHtml(r.description || r.income_expense_description || '')}</td>
                    <td class="py-2 pl-2.5 pr-3 text-right font-bold text-emerald-400 whitespace-nowrap">${formatMoney(r.amount ?? r.income_expense_amount ?? 0)}</td>
                </tr>
            `).join('');
    }
    updateDeleteCounter('btn-delete-incomes', 'count-del-incomes', '.income-row-cb');
    openModal('modal-income-list');
}

/* =========================================================================
 * LOT, VALIDITY CART (Server-Priced), TRANSFER, CHAT & CASH MEMO
 * ========================================================================= */
function openBuyLotModal() {
    if (document.getElementById('generatedLotNumber')) document.getElementById('generatedLotNumber').innerText = 'LT-' + Math.floor(1000 + Math.random() * 9000);
    calculateLotPrice();
    openModal('buyLotModal');
}
function closeBuyLotModal() { closeModal('buyLotModal'); }

function calculateLotPrice() {
    const qty = parseInt(document.getElementById('lotQuantitySelect')?.value) || 10;
    const sub = qty * 100;
    const disc = sub * 0.2;
    if (document.getElementById('lotSubTotalText')) document.getElementById('lotSubTotalText').innerText = formatMoney(sub);
    if (document.getElementById('lotDiscountText')) document.getElementById('lotDiscountText').innerText = '- ' + formatMoney(disc);
    if (document.getElementById('lotNetTotalText')) document.getElementById('lotNetTotalText').innerText = formatMoney(sub - disc);
}

async function handleCashPayLot() {
    const lotNo = document.getElementById('generatedLotNumber')?.innerText;
    const qty = parseInt(document.getElementById('lotQuantitySelect')?.value) || 10;
    const res = await callBackendApi('buy_lot', { lot_id: lotNo, quantity: qty });
    if (res?.success) { closeBuyLotModal(); await loadAllDatabaseRecords(); showToast(`${lotNo} লটের ${qty}টি আইডি যুক্ত হয়েছে!`); }
    else showToast(res?.message || 'লট ক্রয় ব্যর্থ হয়েছে।', 'error');
}

function renderLotInventory() {
    const compId = resolveCompositeUserId();
    const inStock = accountsMasterRecords.filter((a) => a.owner_id === compId && a.status === 'In_Stock');
    if (document.getElementById('availableLotIdsCount')) document.getElementById('availableLotIdsCount').innerText = inStock.length;
    const listEl = document.getElementById('lotInventorySummaryList');
    const selectEl = document.getElementById('sellLotIdSelect');
    if (!inStock.length) {
        if (listEl) listEl.innerHTML = '<p class="text-slate-500">No In_Stock IDs available.</p>';
        if (selectEl) selectEl.innerHTML = '<option value="">No Stock Available</option>';
        return;
    }
    if (listEl) listEl.innerHTML = inStock.map((i) => `<div class="flex justify-between items-center bg-[#131822] px-2 py-1 rounded border border-slate-800"><span class="text-amber-400 font-mono">${escapeHtml(i.lot_id)} • ${escapeHtml(i.user_name || i.user_id)}</span><span class="text-emerald-400 font-bold">In_Stock</span></div>`).join('');
    if (selectEl) selectEl.innerHTML = '<option value="">-- Select Lot ID --</option>' + inStock.map((i) => `<option value="${escapeHtml(i.id)}" data-password="${escapeHtml(i.password || '')}">${escapeHtml(i.lot_id)} - ${escapeHtml(i.user_name || i.user_id)}</option>`).join('');
}

function openSellLicenseModal() {
    renderLotInventory();
    if (document.getElementById('sellCouponCodeInput')) document.getElementById('sellCouponCodeInput').value = document.getElementById('userCouponCode')?.innerText || '';
    openModal('sellLicenseModal');
}
function closeSellLicenseModal() { closeModal('sellLicenseModal'); }

async function handleSellNewIdSubmit(e) {
    e.preventDefault();
    const res = await callBackendApi('process_id_sale_cashback', {
        sold_item_id: document.getElementById('sellLotIdSelect')?.value,
        coupon_code: document.getElementById('sellCouponCodeInput')?.value,
        buyer_name: document.getElementById('sellBuyerName')?.value.trim(),
        buyer_mobile: document.getElementById('sellBuyerMobile')?.value.trim(),
        buyer_email: document.getElementById('sellBuyerEmail')?.value.trim()
    });
    if (res?.success) { closeSellLicenseModal(); await loadAllDatabaseRecords(); showToast('আইডি বিক্রি ও ক্যাশব্যাক সফল হয়েছে!'); }
    else showToast(res?.message || 'আইডি বিক্রি ব্যর্থ হয়েছে।', 'error');
}

function openBuyValidityModal() { openModal('buyValidityModal'); refreshValiditySummaryDisplay(validityCart); }
function closeBuyValidityModal() {
    closeModal('buyValidityModal');
    if (isValidityExpiredSession) { document.getElementById('page2')?.classList.add('hidden'); document.getElementById('page1')?.classList.remove('hidden'); }
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
    const box = document.getElementById('validityCartItems');
    const useWallet = Boolean(document.getElementById('useCouponWalletCheckbox')?.checked);
    const res = await callBackendApi('preview_validity_cart', { items: items || [], use_coupon_wallet: useWallet });
    if (!res?.success) { showToast(res?.message || 'হিসাব লোড করা যায়নি।', 'error'); return; }

    const s = res.summary || {};
    if (document.getElementById('validityWalletBalanceText')) document.getElementById('validityWalletBalanceText').innerText = formatMoney(s.walletBalance ?? 0);

    if (!items?.length) {
        if (box) box.innerHTML = `<p class="text-slate-500 text-center py-2">Cart is empty. Select a plan & click Add.</p>`;
        ['validityBasePriceText', 'validityDiscountText', 'validitySubtotalText', 'validityWalletDeductText', 'validityPayableText'].forEach((id) => {
            if (document.getElementById(id)) document.getElementById(id).innerText = (id.includes('Discount') || id.includes('Deduct') ? '- ' : '') + formatMoney(0);
        });
        if (document.getElementById('validityTotalDaysText')) document.getElementById('validityTotalDaysText').innerText = '0 Days';
        return;
    }

    if (box && Array.isArray(s.items)) {
        box.innerHTML = s.items.map((it, idx) => `
            <div class="flex items-center justify-between bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-1.5">
                <div><span class="font-semibold text-white">${escapeHtml(it.months)} Month${it.months > 1 ? 's' : ''} (${escapeHtml(it.days)} Days)</span><span class="text-slate-400"> × ${escapeHtml(it.qty)}</span>${it.discountPct > 0 ? `<span class="ml-1 text-[11px] text-emerald-400">(-${escapeHtml(it.discountPct)}%)</span>` : ''}</div>
                <div class="flex items-center gap-2"><span class="font-mono text-slate-200">${formatMoney(it.subtotal)}</span><button type="button" onclick="removeValidityCartItem(${idx})" class="text-rose-400 font-bold">×</button></div>
            </div>
        `).join('');
    }

    if (document.getElementById('validityTotalDaysText')) document.getElementById('validityTotalDaysText').innerText = `${s.totalDays || 0} Days`;
    if (document.getElementById('validityBasePriceText')) document.getElementById('validityBasePriceText').innerText = formatMoney(s.baseTotal || 0);
    if (document.getElementById('validityDiscountText')) document.getElementById('validityDiscountText').innerText = '- ' + formatMoney(s.discountTotal || 0);
    if (document.getElementById('validitySubtotalText')) document.getElementById('validitySubtotalText').innerText = formatMoney(s.subtotal || 0);
    if (document.getElementById('validityWalletDeductText')) document.getElementById('validityWalletDeductText').innerText = '- ' + formatMoney(s.walletDeducted || 0);
    if (document.getElementById('validityPayableText')) document.getElementById('validityPayableText').innerText = formatMoney(s.payableAmount || 0);
    syncValidityPendingUI(s.pendingDays || 0, s.approvalStatus || 'NONE');
}

async function handleCashPayValidity() {
    if (!validityCart.length) { showToast('কার্টে অন্তত একটি প্ল্যান যোগ করুন।', 'warn'); return; }
    document.getElementById('validityTrxBox')?.classList.remove('hidden');
    const trxInput = document.getElementById('validityTrxId');
    const trxId = trxInput?.value.trim() || '';
    if (!trxId) { showToast('Transaction ID দিন।', 'warn'); trxInput?.focus(); return; }

    const res = await callBackendApi('buy_validity', {
        items: validityCart,
        use_coupon_wallet: Boolean(document.getElementById('useCouponWalletCheckbox')?.checked),
        trx_id: trxId,
        payment_method: 'Cash Pay'
    });
    if (res?.success) {
        validityCart = [];
        if (trxInput) trxInput.value = '';
        await refreshValiditySummaryDisplay([]);
        if (!isValidityExpiredSession && resolveCompositeUserId()) await loadAllDatabaseRecords();
        showToast('Wait for Validity Approval — রিকোয়েস্ট পেন্ডিং রয়েছে।', 'warn');
    } else showToast(res?.message || 'Validity extension failed.', 'error');
}

function openBalanceTransferModal() { openModal('balanceTransferModal'); }
function closeBalanceTransferModal() { closeModal('balanceTransferModal'); }

async function handleBalanceTransferSubmit(e) {
    e.preventDefault();
    const res = await callBackendApi('balance_transfer', {
        recipient_id: document.getElementById('transferRecipientId')?.value,
        amount: parseFloat(document.getElementById('transferAmount')?.value) || 0
    });
    if (res?.success) { closeBalanceTransferModal(); await loadAllDatabaseRecords(); showToast('ব্যালেন্স ট্রান্সফার সফল হয়েছে!'); }
    else showToast(res?.message || 'ব্যালেন্স ট্রান্সফার ব্যর্থ হয়েছে।', 'error');
}

function openBuyLicenseLandingModal() { openModal('buyLicenseLandingModal'); }
function closeBuyLicenseLandingModal() { closeModal('buyLicenseLandingModal'); }

async function handleLandingBuySubmit(e) {
    e.preventDefault();
    const res = await callBackendApi('register_new_license', {
        name: document.getElementById('landingBuyerName')?.value.trim(),
        mobile: document.getElementById('landingBuyMobile')?.value.trim(),
        email: document.getElementById('landingBuyEmail')?.value.trim(),
        trx_id: document.getElementById('landingBuyPaymentId')?.value.trim()
    });
    if (res?.success) { closeBuyLicenseLandingModal(); showToast('নতুন আইডির আবেদন জমা হয়েছে!'); }
    else showToast(res?.message || 'সাবমিট করতে সমস্যা হয়েছে।', 'error');
}

function openAddDeviceModal() { openModal('addDeviceModal'); }
function closeAddDeviceModal() { closeModal('addDeviceModal'); }

async function handleAddDeviceSubmit(e) {
    e.preventDefault();
    if (activeDevices < 2) {
        activeDevices++;
        if (document.getElementById('activeDeviceCount')) document.getElementById('activeDeviceCount').innerText = activeDevices;
        closeAddDeviceModal();
        showToast('নতুন ডিভাইস যুক্ত হয়েছে!');
    } else showToast('সর্বোচ্চ ২টি ডিভাইস যুক্ত করা যাবে!', 'warn');
}

/* =========================================================================
 * CHAT & CASH MEMO (Pure Client UI)
 * ========================================================================= */
function openMyChatModal() { exitIndividualChat(); renderChatUsersList(); renderUniversalMessages(); openModal('myChatModal'); }

function renderChatUsersList() {
    const container = document.getElementById('chatUsersListContainer');
    if (!container) return;
    const others = accountsMasterRecords.filter((u) => (u.user_name || u.user_id) !== currentUserName);
    container.innerHTML = others.map((u) => {
        const partner = escapeHtml(u.user_name || u.user_id);
        return `
            <button type="button" onclick="openIndividualChat('${partner}')" class="shrink-0 bg-[#131822] hover:bg-indigo-950/60 border border-slate-700 rounded-xl px-3 py-1.5 flex items-center space-x-1.5">
                <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
                <span class="text-xs font-bold text-slate-200">${partner}</span>
            </button>
        `;
    }).join('');
}

function renderUniversalMessages() {
    const box = document.getElementById('universalChatBox');
    if (!box) return;
    box.innerHTML = universalMessages.map((m) => {
        const isMe = m.user_name === currentUserName || m.user_id === currentUserName;
        const sender = escapeHtml(m.user_name || m.user_id || 'User');
        const msg = escapeHtml(m.message);
        return `<div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}"><span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You (' + sender + ')' : sender}</span><div class="${isMe ? 'bg-emerald-600 text-slate-950 font-semibold' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">${msg}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendUniversalMessage(e) {
    e.preventDefault();
    const input = document.getElementById('universalMsgInput');
    const text = input?.value.trim() || '';
    if (!text) return;
    const res = await callBackendApi('send_chat', { channel: 'Public_Forum', message: text });
    if (res?.success) { universalMessages.push({ user_name: currentUserName, message: text }); input.value = ''; renderUniversalMessages(); }
}

function openIndividualChat(partnerName) {
    activePrivatePartner = partnerName;
    document.getElementById('universalChatView')?.classList.add('hidden');
    document.getElementById('individualChatView')?.classList.remove('hidden');
    document.getElementById('chatBackBtn')?.classList.remove('hidden');
    if (document.getElementById('activeChatPartnerName')) document.getElementById('activeChatPartnerName').innerText = partnerName;
    renderIndividualMessages();
}

function exitIndividualChat() {
    activePrivatePartner = null;
    document.getElementById('individualChatView')?.classList.add('hidden');
    document.getElementById('universalChatView')?.classList.remove('hidden');
    document.getElementById('chatBackBtn')?.classList.add('hidden');
}

function renderIndividualMessages() {
    if (!activePrivatePartner) return;
    const box = document.getElementById('individualChatBox');
    if (!box) return;
    const msgs = privateMessagesMap[activePrivatePartner] || [];
    box.innerHTML = msgs.map((m) => {
        const isMe = m.user_name === currentUserName || m.user_id === currentUserName;
        const sender = escapeHtml(m.user_name || m.user_id);
        const msg = escapeHtml(m.message);
        return `<div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}"><span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You' : sender}</span><div class="${isMe ? 'bg-indigo-600 text-white font-medium' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">${msg}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendIndividualMessage(e) {
    e.preventDefault();
    if (!activePrivatePartner) return;
    const input = document.getElementById('individualMsgInput');
    const text = input?.value.trim() || '';
    if (!text) return;
    const channel = 'DM_' + [currentUserName, activePrivatePartner].sort().join('_');
    const res = await callBackendApi('send_chat', { channel, message: text });
    if (res?.success) {
        if (!privateMessagesMap[activePrivatePartner]) privateMessagesMap[activePrivatePartner] = [];
        privateMessagesMap[activePrivatePartner].push({ user_name: currentUserName, message: text });
        input.value = '';
        renderIndividualMessages();
    }
}

function openCashMemoModal() { openModal('cashMemoModal'); }
function openSettingsModal() { openModal('settingsModal'); }
function toggleAccountsSection() {
    const c = document.getElementById('accountsSectionContainer');
    if (!c) return;
    c.classList.toggle('hidden');
    if (document.getElementById('accountsToggleText')) document.getElementById('accountsToggleText').innerText = c.classList.contains('hidden') ? 'Show Accounts' : 'Hide Accounts';
    notifyParentFrameHeight();
}
function copyCouponCode() {
    const code = document.getElementById('userCouponCode')?.innerText || '';
    if (code && navigator.clipboard) navigator.clipboard.writeText(code);
    showToast('Coupon Copied!');
}
function lockBusinessSetup() {
    document.getElementById('memoHeaderConfig')?.setAttribute('readonly', true);
    document.getElementById('memoFooterConfig')?.setAttribute('readonly', true);
    showToast('বিজনেস সেটআপ লক করা হয়েছে!');
}
function addProductToMemoCart() {
    const desc = document.getElementById('memoProdDesc')?.value.trim() || '';
    const qty = parseInt(document.getElementById('memoProdQty')?.value) || 1;
    const rate = parseFloat(document.getElementById('memoProdRate')?.value) || 0;
    if (!desc) return;
    memoCart.push({ desc, qty, rate, total: qty * rate });
    renderMemoCart();
}
function renderMemoCart() {
    const tbody = document.getElementById('memoCartTableBody');
    if (!tbody) return;
    let grand = 0;
    tbody.innerHTML = memoCart.map((item, idx) => {
        grand += item.total;
        return `<tr><td class="py-1.5 px-2 text-slate-300">${escapeHtml(item.desc)}</td><td class="py-1.5 px-1 text-center">${escapeHtml(item.qty)}</td><td class="py-1.5 px-1 text-right whitespace-nowrap">৳ ${escapeHtml(item.rate)}</td><td class="py-1.5 px-2 text-right text-emerald-400 font-bold whitespace-nowrap">৳ ${escapeHtml(item.total)}</td><td class="py-1.5 px-1 text-center text-rose-400 cursor-pointer" onclick="memoCart.splice(${idx},1); renderMemoCart();">×</td></tr>`;
    }).join('');
    if (document.getElementById('memoCartGrandTotal')) document.getElementById('memoCartGrandTotal').innerText = formatMoney(grand);
}
function openA4PdfPreview() {
    const header = escapeHtml(document.getElementById('memoHeaderConfig')?.value || '');
    const footer = escapeHtml(document.getElementById('memoFooterConfig')?.value || '');
    const custName = escapeHtml(document.getElementById('memoCustomerName')?.value || '');
    const custMob = escapeHtml(document.getElementById('memoCustomerMobile')?.value || '');
    const grand = memoCart.reduce((acc, i) => acc + i.total, 0);
    const box = document.getElementById('a4PdfContentBox');
    if (box) {
        box.innerHTML = `
            <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:15px;"><h2 style="margin:0;font-size:20px;font-weight:bold;">${header}</h2><h3 style="margin:8px 0 0;font-size:14px;background:#eee;display:inline-block;padding:2px 20px;border-radius:4px;">CASH MEMO</h3></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:15px;"><div><strong>Customer:</strong> ${custName}<br><strong>Mobile:</strong> ${custMob}</div><div style="text-align:right;"><strong>Date:</strong> ${escapeHtml(formatDisplayDate(new Date().toISOString().split('T')[0]))}</div></div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;"><thead><tr style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;"><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Rate</th><th style="padding:8px;text-align:right;">Total</th></tr></thead><tbody>${memoCart.map((i) => `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px;">${escapeHtml(i.desc)}</td><td style="padding:8px;text-align:center;">${escapeHtml(i.qty)}</td><td style="padding:8px;text-align:right;">৳ ${escapeHtml(i.rate)}</td><td style="padding:8px;text-align:right;font-weight:bold;">৳ ${escapeHtml(i.total)}</td></tr>`).join('')}</tbody></table>
            <div style="text-align:right;font-size:15px;font-weight:bold;margin-bottom:30px;">Grand Total: ৳ ${grand.toFixed(2)}</div>
            <div style="text-align:center;font-size:11px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:8px;">${footer}</div>
        `;
    }
    closeModal('cashMemoModal');
    openModal('a4PdfPreviewModal');
}
function saveMemoToDevice() { showToast('ক্যাশ মেমো সেভ হয়েছে!'); closeModal('a4PdfPreviewModal'); }
function printMemoPdf() {
    const area = document.getElementById('a4MemoPrintArea');
    const box = document.getElementById('a4PdfContentBox');
    if (area && box) { area.innerHTML = box.innerHTML; area.classList.remove('hidden'); }
    closeModal('a4PdfPreviewModal');
    window.print();
    if (area) area.classList.add('hidden');
}

/* =========================================================================
 * PASSWORD CHANGE & LISTENERS
 * ========================================================================= */
function openUserPassModal() {
    if (document.getElementById('modalAutoEmail')) document.getElementById('modalAutoEmail').innerText = sessionStorage.getItem('buyer_email') || 'N/A';
    if (document.getElementById('newUsernameInput')) document.getElementById('newUsernameInput').value = sessionStorage.getItem('user_name') || currentUserName || '';
    if (document.getElementById('userPassModal')) document.getElementById('userPassModal').style.display = 'flex';
}
function closeUserPassModal() {
    if (document.getElementById('userPassModal')) document.getElementById('userPassModal').style.display = 'none';
}
async function submitUserPasswordChange() {
    const newUsername = document.getElementById('newUsernameInput')?.value.trim() || '';
    const oldPassword = document.getElementById('oldPasswordInput')?.value.trim() || '';
    const newPassword = document.getElementById('newPasswordInput')?.value.trim() || '';
    const confirmPassword = document.getElementById('confirmPasswordInput')?.value.trim() || '';
    if (!oldPassword || !newPassword || newPassword !== confirmPassword) { alert('পাসওয়ার্ড যাচাই করে আবার দিন।'); return; }

    const res = await callBackendApi('user_password_change', { new_username: newUsername, old_password: oldPassword, new_password: newPassword });
    if (res?.success) { alert(res.message); handleLogOut(); window.location.reload(); }
    else alert(res?.message || 'পরিবর্তন ব্যর্থ হয়েছে!');
}

window.addEventListener('message', (event) => {
    if (event.origin !== TRUSTED_ORIGIN) return;
    const data = event.data;
    if (!data || data.channel !== BRIDGE_CHANNEL) return;
    if (data.type === 'SET_USER_SCOPE') {
        const nextId = data.payload?.composite_user_id || data.compositeUserId;
        if (nextId && nextId !== currentCompositeUserId) {
            syncCompositeIdToIframe(nextId);
            if (document.getElementById('monthly-summary-body') || document.getElementById('monthlyRowsContainer')) loadAllDatabaseRecords();
        }
    } else if (data.type === 'REQUEST_USER_SCOPE') {
        syncCompositeIdToIframe(resolveCompositeUserId() || '101_admin');
    } else if (data.type === 'TOAST' && data.message) showToast(data.message);
});

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    ['incomeDate', 'loanDate', 'marketDate', 'settleDate', 'ie-date', 'loan-date', 'dexp-date'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    const initialCompId = resolveCompositeUserId();
    if (initialCompId) {
        syncCompositeIdToIframe(initialCompId);
        if (document.getElementById('monthly-summary-body') || document.getElementById('receivable-list-body') || document.getElementById('daily-expenses-body')) {
            loadAllDatabaseRecords();
        }
    }
    renderMemoCart();
    notifyParentFrameHeight();
});
