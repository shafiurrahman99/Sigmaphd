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

/* =========================================================================
 * DASHBOARD ENTRY MODALS (Matches dashboard.html Modal IDs & Handlers)
 * ========================================================================= */
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
    const modal = document.getElementById(modalId);
    if (!modal) {
        showToast(`Modal (#${modalId}) খুঁজে পাওয়া যায়নি।`, 'error');
        return;
    }
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

function openIncomeListModal() {
    const tbody = document.getElementById('income-list-modal-body');
    if (tbody && Array.isArray(incomeExpenseRecords)) {
        const incomes = incomeExpenseRecords.filter(
            (r) => (r.entry_type || r.income_expense_type) === 'Income'
        );
        if (incomes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400">No income entries found.</td></tr>';
        } else {
            tbody.innerHTML = incomes.map((r) => {
                const d = r.entry_date || r.income_expense_date || '';
                const desc = r.description || r.income_expense_description || '';
                const amt = Number(r.amount ?? r.income_expense_amount ?? 0) || 0;
                return `
                    <tr>
                        <td class="py-2 pl-3 pr-1"><input type="checkbox" class="income-row-cb accent-emerald-500" value="${r.id || ''}" /></td>
                        <td class="py-2 px-2.5 font-mono text-xs">${d}</td>
                        <td class="py-2 px-2.5">${desc}</td>
                        <td class="py-2 pl-2.5 pr-3 text-right font-bold text-emerald-400">${formatMoney(amt)}</td>
                    </tr>
                `;
            }).join('');
        }
    }
    openModal('modal-income-list');
}

function showToast(text, variant = 'success') {
    if (window.self !== window.top && window.parent) {
        window.parent.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'TOAST',
            compositeUserId: currentCompositeUserId || window.ACTIVE_COMPOSITE_USER_ID || '',
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

/* -------------------------------------------------------------------------
 * IFRAME BRIDGE HELPERS (Parent index.html <-> Child dashboard.html)
 * ------------------------------------------------------------------------- */
function getDashboardIframeEl() {
    return document.getElementById('dashboardFrame');
}

function syncCompositeIdToIframe(compId) {
    const cleanId = String(compId || '').trim();
    if (!cleanId) return;

    currentCompositeUserId = cleanId;
    window.ACTIVE_COMPOSITE_USER_ID = cleanId;

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
            compositeUserId: currentCompositeUserId || window.ACTIVE_COMPOSITE_USER_ID || '',
            height
        }, '*');
    }
}

function isLedgerTable(val) {
    return Array.isArray(val);
}

// -------------------------------------------------------------------------
// DIRECT BACKEND & DATABASE COMMUNICATION (PROXY / API)
// -------------------------------------------------------------------------
async function callBackendApi(action, payload) {
    try {
        const activeCompId =
            currentCompositeUserId ||
            localStorage.getItem('composite_user_id') ||
            window.ACTIVE_COMPOSITE_USER_ID ||
            '';

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                company_id: GLOBAL_COMPANY_ID,
                composite_user_id: activeCompId,
                payload
            })
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error('Database API Error:', err);
        return { success: false, message: 'Network or database connection error.' };
    }
}

// -------------------------------------------------------------------------
// AUTHENTICATION & LOGIN (Using user_name and password)
// -------------------------------------------------------------------------
async function handleMainSignIn(e) {
    e.preventDefault();
    const uname = document.getElementById('mainUserName').value.trim();
    const pass = document.getElementById('mainUserPassword').value.trim();

    const res = await callBackendApi('authenticate_user', { user_name: uname, password: pass });

    if (res.success && res.user) {
        const user = res.user;
        currentUserName = user.user_name || uname;
        currentCompositeUserId = user.composite_user_id;

        const buyerMobile = user.buyer_mobile || '01818589423';
        const lastFourDigits = buyerMobile.length >= 4 ? buyerMobile.slice(-4) : '8423';

        localStorage.setItem('composite_user_id', user.composite_user_id);
        localStorage.setItem('user_name', user.user_name || uname);
        localStorage.setItem('buyer_email', user.buyer_email || '');

        if (document.getElementById('currentLoggedInUser')) {
            document.getElementById('currentLoggedInUser').innerText = currentUserName;
        }
        syncCompositeIdToIframe(currentCompositeUserId);

        if (document.getElementById('userCouponCode')) {
            document.getElementById('userCouponCode').innerText = 'SIGMA_' + lastFourDigits;
        }
        if (document.getElementById('walletBalanceText')) {
            document.getElementById('walletBalanceText').innerText = formatMoney(user.wallet_balance || 0);
        }
        if (document.getElementById('validityWalletBalanceText')) {
            document.getElementById('validityWalletBalanceText').innerText = formatMoney(user.wallet_balance || 0);
        }

        const isValidActive = applyValidityStateFromUser(user);
        if (!isValidActive) {
            return;
        }

        const page1 = document.getElementById('page1');
        const page2 = document.getElementById('page2');
        if (page1) page1.classList.add('hidden');
        if (page2) page2.classList.remove('hidden');

        await loadAllDatabaseRecords();
        notifyParentFrameHeight();
        showToast('স্বাগতম ' + currentUserName + '! সফলভাবে লগইন হয়েছে।');
    } else {
        showToast(res.message || 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!', 'error');
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
    localStorage.clear();
    sessionStorage.clear();
    const page2 = document.getElementById('page2');
    const page1 = document.getElementById('page1');
    if (page2) page2.classList.add('hidden');
    if (page1) page1.classList.remove('hidden');
    showToast('সফলভাবে লগআউট করা হয়েছে।');
}

// -------------------------------------------------------------------------
// LOAD ALL TABLES DATA FROM DATABASE
// -------------------------------------------------------------------------
async function loadAllDatabaseRecords() {
    const res = await callBackendApi('fetch_dashboard_data', {});
    if (res.success) {
        incomeExpenseRecords = res.income_expenses || [];
        loanGivenRecords = res.loans_receivable || [];
        loanTakenRecords = res.loans_payable || [];
        marketExpenses = res.daily_expenses || [];
        accountsMasterRecords = res.accounts || [];
        universalMessages = res.public_chats || [];

        const me = accountsMasterRecords.find(a => a.composite_user_id === currentCompositeUserId);
        if (me) {
            const isValidActive = applyValidityStateFromUser(me);
            if (document.getElementById('walletBalanceText')) {
                document.getElementById('walletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            }
            if (document.getElementById('validityWalletBalanceText')) {
                document.getElementById('validityWalletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            }
            if (!isValidActive) {
                return;
            }
        }
    }
    renderAllDashboardTables();
    renderLotInventory();
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
        if (!Number.isNaN(baseTs) && days > 0) {
            return baseTs + (days * 24 * 60 * 60 * 1000);
        }
    }
    return 0;
}

function syncValidityPendingUI(pendingDays = 0, approvalStatus = 'NONE') {
    const days = Number(pendingDays || 0);
    const hasPending = days > 0 || approvalStatus === 'Admin Approval';

    const badge = document.getElementById('validityPendingBadge');
    if (badge) {
        if (hasPending) {
            badge.innerText = `Wait for Validity Approval (${days} Days Pending)`;
            badge.classList.remove('hidden');
        } else {
            badge.innerText = '';
            badge.classList.add('hidden');
        }
    }

    const modalNotice = document.getElementById('validityModalPendingNotice');
    const modalDetails = document.getElementById('validityModalPendingDetails');
    if (modalNotice) {
        if (hasPending) {
            modalNotice.classList.remove('hidden');
            if (modalDetails) {
                modalDetails.innerText = `Pending Extension: ${days} Days • Status: Wait for Validity Approval`;
            }
        } else {
            modalNotice.classList.add('hidden');
            if (modalDetails) modalDetails.innerText = '';
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
    localStorage.clear();
    sessionStorage.clear();

    const page2 = document.getElementById('page2');
    const page1 = document.getElementById('page1');
    if (page2) page2.classList.add('hidden');
    if (page1) page1.classList.remove('hidden');

    openBuyValidityModal();

    if (hasPending) {
        showToast('Wait for Validity Approval — আপনার ভ্যালিডিটি এক্সটেন্ড পেন্ডিং রয়েছে।', 'warn');
    } else {
        showToast('আপনার ভ্যালিডিটি শেষ হয়ে গেছে! অনুগ্রহ করে Validity Extend করুন।', 'warn');
    }
}

function applyValidityStateFromUser(user = {}) {
    const expiryTs = getValidityExpiryTimestamp(user);
    const pendingDays = Number(user.pending_validity_days || 0);
    const approvalStatus = user.validity_approval_status || 'NONE';

    validityExpiryTime = expiryTs;
    syncValidityPendingUI(pendingDays, approvalStatus);

    const isExpired = !expiryTs || Date.now() >= expiryTs;
    if (isExpired) {
        enforceExpiredValidityFlow(user);
        return false;
    }

    isValidityExpiredSession = false;
    startValidityCountdown();
    return true;
}

function updateValidityPendingBadge(pendingDays = 0, approvalStatus = 'NONE') {
    syncValidityPendingUI(pendingDays, approvalStatus);
}

function startValidityCountdown() {
    if (validityCountdownTimer) {
        clearInterval(validityCountdownTimer);
        validityCountdownTimer = null;
    }

    const updateClock = () => {
        if (!validityExpiryTime) return;
        const now = Date.now();
        const diff = validityExpiryTime - now;

        if (diff <= 0) {
            clearInterval(validityCountdownTimer);
            validityCountdownTimer = null;
            if (document.getElementById('countdownDays')) {
                document.getElementById('countdownDays').innerText = '00';
                document.getElementById('countdownHours').innerText = '00';
                document.getElementById('countdownMins').innerText = '00';
                document.getElementById('countdownSecs').innerText = '00';
            }
            const badgeText = document.getElementById('validityPendingBadge')?.innerText || '';
            const pendingMatch = badgeText.match(/(\d+)\s*Days\s*Pending/i);
            const pendingDays = pendingMatch ? Number(pendingMatch[1]) : 0;
            const approvalStatus = badgeText ? 'Admin Approval' : 'NONE';
            enforceExpiredValidityFlow({
                pending_validity_days: pendingDays,
                validity_approval_status: approvalStatus
            });
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

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

// -------------------------------------------------------------------------
// MONTHLY SUMMARY TABLE (Supports both legacy & new income_expense columns)
// -------------------------------------------------------------------------
function renderMonthlySummaryTable() {
    const tbody = document.getElementById('monthlyRowsContainer');
    if (!tbody) return;

    let totalInc = 0;
    let totalExp = 0;
    const monthlyMap = {};

    incomeExpenseRecords.forEach(item => {
        const eType = item.entry_type || (item.income_expense_type === 'expense' ? 'Expense' : 'Income');
        const eDate = item.entry_date || item.income_expense_date || '2026-11';
        const eAmt = Number(item.amount ?? item.income_expense_amount ?? 0) || 0;
        const eStatus = item.status || item.income_expense_status || 'Paid';

        const monthKey = String(eDate).slice(0, 7);
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { inc: 0, exp: 0 };

        if (eType === 'Income') {
            totalInc += eAmt;
            monthlyMap[monthKey].inc += eAmt;
        } else if (eType === 'IncomeDeduction') {
            totalInc -= eAmt;
            monthlyMap[monthKey].inc -= eAmt;
        } else if (eType === 'Expense' && eStatus === 'Paid') {
            totalExp += eAmt;
            monthlyMap[monthKey].exp += eAmt;
        }
    });

    marketExpenses.forEach(m => {
        if (m.status === 'Paid') {
            const monthKey = (m.expense_date || '2026-11').slice(0, 7);
            if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { inc: 0, exp: 0 };
            totalExp += Number(m.amount || 0);
            monthlyMap[monthKey].exp += Number(m.amount || 0);
        }
    });

    const netSurplus = totalInc - totalExp;
    if (document.getElementById('totalIncomeAll')) document.getElementById('totalIncomeAll').innerText = formatMoney(totalInc);
    if (document.getElementById('totalExpenseAll')) document.getElementById('totalExpenseAll').innerText = formatMoney(totalExp);
    if (document.getElementById('totalSurplusAll')) document.getElementById('totalSurplusAll').innerText = formatMoney(netSurplus);

    const months = Object.keys(monthlyMap).sort().reverse();
    tbody.innerHTML = months.map(m => {
        const rowSurplus = monthlyMap[m].inc - monthlyMap[m].exp;
        return `
            <tr class="text-slate-300">
                <td class="py-2.5 px-3 font-mono">${m}</td>
                <td class="py-2.5 px-2 text-emerald-400">${formatMoney(monthlyMap[m].inc)}</td>
                <td class="py-2.5 px-2 text-rose-400">${formatMoney(monthlyMap[m].exp)}</td>
                <td class="py-2.5 px-2 text-right font-bold ${rowSurplus >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoney(rowSurplus)}</td>
            </tr>
        `;
    }).join('');
}

function openIncomeModal() { openIncomeExpenseModal('income'); }
function closeIncomeModal() { closeModal('modal-income-expense'); }

async function handleIncomeSubmit(e) {
    e.preventDefault();
    const type =
        document.getElementById('incomeEntryType')?.value ||
        (window.__currentIEModalType === 'expense' ? 'Expense' : 'Income');
    const date = document.getElementById('ie-date')?.value || document.getElementById('incomeDate')?.value;
    const desc = (document.getElementById('ie-description')?.value || document.getElementById('incomeDesc')?.value || '').trim();
    const amount = parseFloat(document.getElementById('ie-amount')?.value ?? document.getElementById('incomeAmount')?.value) || 0;

    const res = await callBackendApi('save_income_expense', { type, date, desc, amount });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeIncomeModal();
        showToast(`${type} এন্ট্রি সফলভাবে সেভ হয়েছে!`);
    } else {
        showToast(res.message || 'সেভ করতে সমস্যা হয়েছে।', 'error');
    }
}

function openLoanModal() { openLoanEntryModal(); }
function closeLoanModal() { closeModal('modal-loan-entry'); }

async function handleLoanSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('loan-direction')?.value || document.getElementById('loanType')?.value || 'receivable';
    const date = document.getElementById('loan-date')?.value || document.getElementById('loanDate')?.value;
    const person = (document.getElementById('loan-description')?.value || document.getElementById('loanPersonName')?.value || '').trim();
    const amount = parseFloat(document.getElementById('loan-amount')?.value ?? document.getElementById('loanAmount')?.value) || 0;

    const res = await callBackendApi('save_loan', { category: type, date, person_name: person, amount });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeLoanModal();
        showToast('লোন রেকর্ড সংরক্ষিত হয়েছে।');
    } else {
        showToast(res.message || 'সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
    }
}

function renderLoanTables() {
    const givenList = document.getElementById('loanGivenList');
    const takenList = document.getElementById('loanTakenList');
    if (!givenList || !takenList) return;

    let givenTotal = 0;
    givenList.innerHTML = loanGivenRecords.length === 0
        ? '<p class="text-[11px] text-slate-500">No Receivable records.</p>'
        : loanGivenRecords.map(l => {
            const pName = l.person_name || l.loan_records_description || 'Party';
            const eDate = l.entry_date || l.loan_records_entry_date || '';
            const amt = Number(l.amount ?? l.loan_records_amount ?? 0) || 0;
            const st = l.status || l.loan_records_status || 'Due';
            const isSettled = st === 'Paid' || st === 'Due Received';
            if (!isSettled) givenTotal += amt;
            return `
                <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                    <div>
                        <span class="font-bold text-slate-200">${pName}</span>
                        <span class="text-[10px] text-slate-400 block">${eDate} •${isSettled ? '<span class="text-emerald-400">' + st + '</span>' : '<span class="text-amber-400">Pending</span>'}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="font-mono font-bold text-amber-400">${formatMoney(amt)}</span>${!isSettled ? `<button onclick="openSettleModal('${l.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    if (document.getElementById('loanGivenTotalText')) {
        document.getElementById('loanGivenTotalText').innerText = 'Total: ' + formatMoney(givenTotal);
    }

    let takenTotal = 0;
    takenList.innerHTML = loanTakenRecords.length === 0
        ? '<p class="text-[11px] text-slate-500">No Payable records.</p>'
        : loanTakenRecords.map(l => {
            const pName = l.person_name || l.loan_records_description || 'Party';
            const eDate = l.entry_date || l.loan_records_entry_date || '';
            const amt = Number(l.amount ?? l.loan_records_amount ?? 0) || 0;
            const st = l.status || l.loan_records_status || 'Due';
            const isSettled = st === 'Paid' || st === 'Due Received';
            if (!isSettled) takenTotal += amt;
            return `
                <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                    <div>
                        <span class="font-bold text-slate-200">${pName}</span>
                        <span class="text-[10px] text-slate-400 block">${eDate} •${isSettled ? '<span class="text-emerald-400">' + st + '</span>' : '<span class="text-rose-400">Due</span>'}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="font-mono font-bold text-rose-400">${formatMoney(amt)}</span>${!isSettled ? `<button onclick="openSettleModal('${l.id}')" class="bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    if (document.getElementById('loanTakenTotalText')) {
        document.getElementById('loanTakenTotalText').innerText = 'Total: ' + formatMoney(takenTotal);
    }
}

function openSettleModal(id) {
    if (document.getElementById('settleLoanId')) document.getElementById('settleLoanId').value = id;
    if (document.getElementById('settleLoanModal')) openModal('settleLoanModal');
}
function closeSettleModal() { closeModal('settleLoanModal'); }

async function handleSettleLoanSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('settleLoanId').value;
    const date = document.getElementById('settleDate').value;
    const extra = parseFloat(document.getElementById('settleExtraAmount').value) || 0;

    const res = await callBackendApi('settle_loan', { id, settle_date: date, extra_amount: extra });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeSettleModal();
        showToast('লোন সেটেল করা হয়েছে!');
    } else {
        showToast(res.message || 'সেটেলমেন্ট ব্যর্থ হয়েছে।', 'error');
    }
}

function openMarketModal() { openDailyExpenseModal(); }
function closeMarketModal() { closeModal('modal-daily-expense'); }

async function handleMarketSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('dexp-date')?.value || document.getElementById('marketDate')?.value;
    const desc = (document.getElementById('dexp-description')?.value || document.getElementById('marketDesc')?.value || '').trim();
    const amount = parseFloat(document.getElementById('dexp-amount')?.value ?? document.getElementById('marketAmount')?.value) || 0;
    const status = document.getElementById('dexp-status')?.value || document.getElementById('marketStatus')?.value || 'Paid';

    const res = await callBackendApi('save_market_expense', { expense_date: date, description: desc, amount, status });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeMarketModal();
        showToast('দৈনিক খরচ যুক্ত হয়েছে!');
    } else {
        showToast(res.message || 'খরচ যুক্ত করতে সমস্যা হয়েছে।', 'error');
    }
}

async function toggleMarketStatus(id) {
    const res = await callBackendApi('toggle_market_expense_status', { id });
    if (res.success) {
        await loadAllDatabaseRecords();
    }
}

function renderMarketExpensesTable() {
    const tbody = document.getElementById('marketExpenseList');
    if (!tbody) return;
    if (marketExpenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-3 text-center text-slate-500">No daily expenses recorded.</td></tr>';
        return;
    }
    tbody.innerHTML = marketExpenses.map(m => {
        const mDate = m.expense_date || m.income_expense_date || '';
        const mDesc = m.description || m.income_expense_description || '';
        const mAmt = Number(m.amount ?? m.income_expense_amount ?? 0) || 0;
        const mStatus = m.status || m.income_expense_status || 'Paid';
        return `
            <tr class="text-slate-300">
                <td class="py-2 px-2 font-mono text-[11px]">${mDate}</td>
                <td class="py-2 px-2">${mDesc}</td>
                <td class="py-2 px-2 font-mono text-rose-400 font-bold">${formatMoney(mAmt)}</td>
                <td class="py-2 px-2 text-right">
                    <button onclick="toggleMarketStatus('${m.id}')" class="${mStatus === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-700/50' : 'bg-amber-950 text-amber-400 border-amber-700/50'} border px-2 py-0.5 rounded text-[10px] font-bold">
                        ${mStatus}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------------------
// LOT & LICENSE MANAGEMENT
// -------------------------------------------------------------------------
function openBuyLotModal() {
    if (document.getElementById('generatedLotNumber')) {
        document.getElementById('generatedLotNumber').innerText = 'LT-' + Math.floor(1000 + Math.random() * 9000);
    }
    calculateLotPrice();
    openModal('buyLotModal');
}
function closeBuyLotModal() { closeModal('buyLotModal'); }

function calculateLotPrice() {
    const qty = parseInt(document.getElementById('lotQuantitySelect')?.value) || 10;
    const sub = qty * 100;
    const disc = sub * 0.20;
    const net = sub - disc;
    if (document.getElementById('lotSubTotalText')) document.getElementById('lotSubTotalText').innerText = formatMoney(sub);
    if (document.getElementById('lotDiscountText')) document.getElementById('lotDiscountText').innerText = '- ' + formatMoney(disc);
    if (document.getElementById('lotNetTotalText')) document.getElementById('lotNetTotalText').innerText = formatMoney(net);
}

async function handleCashPayLot() {
    const lotNo = document.getElementById('generatedLotNumber').innerText;
    const qty = parseInt(document.getElementById('lotQuantitySelect').value) || 10;

    const res = await callBackendApi('buy_lot', { lot_id: lotNo, quantity: qty });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeBuyLotModal();
        showToast(`${lotNo} লটের ${qty}টি আইডি ইনভেন্টরিতে যুক্ত হয়েছে!`);
    } else {
        showToast(res.message || 'লট ক্রয় ব্যর্থ হয়েছে।', 'error');
    }
}

function renderLotInventory() {
    const inStockItems = accountsMasterRecords.filter(a => a.owner_id === currentCompositeUserId && a.status === 'In_Stock');
    if (document.getElementById('availableLotIdsCount')) {
        document.getElementById('availableLotIdsCount').innerText = inStockItems.length;
    }
    const activeSubs = accountsMasterRecords.filter(a => a.upline_id === currentCompositeUserId && a.status !== 'In_Stock');
    if (document.getElementById('subUserCount')) {
        document.getElementById('subUserCount').innerText = activeSubs.length || 1;
    }

    const listEl = document.getElementById('lotInventorySummaryList');
    const selectEl = document.getElementById('sellLotIdSelect');

    if (inStockItems.length === 0) {
        if (listEl) listEl.innerHTML = '<p class="text-slate-500">No In_Stock IDs available.</p>';
        if (selectEl) selectEl.innerHTML = '<option value="">No Stock Available</option>';
    } else {
        if (listEl) {
            listEl.innerHTML = inStockItems.map(item => `
                <div class="flex justify-between items-center bg-[#131822] px-2 py-1 rounded border border-slate-800">
                    <span class="text-amber-400 font-mono">${item.lot_id} •${item.user_name || item.user_id}</span>
