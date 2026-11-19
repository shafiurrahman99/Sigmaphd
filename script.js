/**
 * =========================================================================
 * SIGMA PhD™ - PRODUCTION SCRIPT (JavaScript Logic & API Connector)
 * =========================================================================
 */

let GLOBAL_COMPANY_ID = "101";
let currentUserName = "";
let currentCompositeUserId = "";
let validityExpiryTime = new Date().getTime();
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

function showToast(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-text').innerText = text;
    toast.classList.remove('hidden');
    setTimeout(hideToast, 3500);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
}

function formatMoney(num) {
    return '৳ ' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -------------------------------------------------------------------------
// DIRECT BACKEND & DATABASE COMMUNICATION (PROXY / API)
// -------------------------------------------------------------------------
async function callBackendApi(action, payload) {
    try {
        const response = await fetch('/api/root-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action, 
                company_id: GLOBAL_COMPANY_ID, 
                composite_user_id: currentCompositeUserId, 
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
        
        let buyerMobile = user.buyer_mobile || '01818589423'; 
        let lastFourDigits = buyerMobile.length >= 4 ? buyerMobile.slice(-4) : '8423';
        
        localStorage.setItem('composite_user_id', user.composite_user_id);
        localStorage.setItem('user_name', user.user_name || uname);
        localStorage.setItem('buyer_email', user.buyer_email || '');
        
        applyValidityStateFromUser(user);

        document.getElementById('currentLoggedInUser').innerText = currentUserName;
        document.getElementById('displayCompositeId').innerText = currentCompositeUserId;
        document.getElementById('userCouponCode').innerText = 'SIGMA_' + lastFourDigits;
        document.getElementById('walletBalanceText').innerText = formatMoney(user.wallet_balance || 0);
        
        document.getElementById('page1').classList.add('hidden');
        document.getElementById('page2').classList.remove('hidden');
        
        await loadAllDatabaseRecords();
        showToast('স্বাগতম ' + currentUserName + '! সফলভাবে লগইন হয়েছে।');
    } else {
        showToast(res.message || 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!');
    }
}

function handleLogOut() {
    currentUserName = "";
    currentCompositeUserId = "";
    localStorage.clear();
    sessionStorage.clear();
    document.getElementById('page2').classList.add('hidden');
    document.getElementById('page1').classList.remove('hidden');
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
            applyValidityStateFromUser(me);
            if (document.getElementById('walletBalanceText')) {
                document.getElementById('walletBalanceText').innerText = formatMoney(me.wallet_balance || 0);
            }
        }
    }
    renderAllDashboardTables();
    renderLotInventory();
}

function applyValidityStateFromUser(user = {}) {
    if (user.validity_expires_at) {
        validityExpiryTime = new Date(user.validity_expires_at).getTime();
    } else if (user.activated_at) {
        validityExpiryTime = new Date(user.activated_at).getTime() + ((Number(user.validity_days) || 30) * 24 * 60 * 60 * 1000);
    } else {
        validityExpiryTime = new Date().getTime() + ((Number(user.validity_days) || 30) * 24 * 60 * 60 * 1000);
    }
    updateValidityPendingBadge(user.pending_validity_days || 0, user.validity_approval_status || 'NONE');
}

function updateValidityPendingBadge(pendingDays = 0, approvalStatus = 'NONE') {
    const badge = document.getElementById('validityPendingBadge');
    if (!badge) return;
    const days = Number(pendingDays || 0);
    if (days > 0 || approvalStatus === 'Admin Approval') {
        badge.innerText = `Validity Extend ${days} Days Pending`;
        badge.classList.remove('hidden');
    } else {
        badge.innerText = '';
        badge.classList.add('hidden');
    }
}

function startValidityCountdown() {
    setInterval(() => {
        const now = new Date().getTime();
        const diff = Math.max(0, validityExpiryTime - now);
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if(document.getElementById('countdownDays')) {
            document.getElementById('countdownDays').innerText = String(d).padStart(2, '0');
            document.getElementById('countdownHours').innerText = String(h).padStart(2, '0');
            document.getElementById('countdownMins').innerText = String(m).padStart(2, '0');
            document.getElementById('countdownSecs').innerText = String(s).padStart(2, '0');
        }
    }, 1000);
}

function renderAllDashboardTables() {
    renderMonthlySummaryTable();
    renderLoanTables();
    renderMarketExpensesTable();
}

// -------------------------------------------------------------------------
// MONTHLY SUMMARY TABLE
// -------------------------------------------------------------------------
function renderMonthlySummaryTable() {
    let totalInc = 0;
    let totalExp = 0;
    const monthlyMap = {};

    incomeExpenseRecords.forEach(item => {
        const monthKey = item.entry_date ? item.entry_date.slice(0, 7) : '2026-11';
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { inc: 0, exp: 0 };

        if (item.entry_type === 'Income') {
            totalInc += Number(item.amount);
            monthlyMap[monthKey].inc += Number(item.amount);
        } else if (item.entry_type === 'IncomeDeduction') {
            totalInc -= Number(item.amount);
            monthlyMap[monthKey].inc -= Number(item.amount);
        } else if (item.entry_type === 'Expense') {
            totalExp += Number(item.amount);
            monthlyMap[monthKey].exp += Number(item.amount);
        }
    });

    marketExpenses.forEach(m => {
        if (m.status === 'Paid') {
            const monthKey = m.expense_date ? m.expense_date.slice(0, 7) : '2026-11';
            if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { inc: 0, exp: 0 };
            totalExp += Number(m.amount);
            monthlyMap[monthKey].exp += Number(m.amount);
        }
    });

    const netSurplus = totalInc - totalExp;
    document.getElementById('totalIncomeAll').innerText = formatMoney(totalInc);
    document.getElementById('totalExpenseAll').innerText = formatMoney(totalExp);
    document.getElementById('totalSurplusAll').innerText = formatMoney(netSurplus);

    const tbody = document.getElementById('monthlyRowsContainer');
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

function openIncomeModal() { document.getElementById('incomeModal').classList.remove('hidden'); }
function closeIncomeModal() { document.getElementById('incomeModal').classList.add('hidden'); }

async function handleIncomeSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('incomeEntryType').value;
    const date = document.getElementById('incomeDate').value;
    const desc = document.getElementById('incomeDesc').value.trim();
    const amount = parseFloat(document.getElementById('incomeAmount').value) || 0;

    const res = await callBackendApi('save_income_expense', { type, date, desc, amount });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeIncomeModal();
        showToast(`${type} এন্ট্রি সফলভাবে সেভ হয়েছে!`);
    } else {
        showToast(res.message || 'সেভ করতে সমস্যা হয়েছে।');
    }
}

function openLoanModal() { document.getElementById('loanModal').classList.remove('hidden'); }
function closeLoanModal() { document.getElementById('loanModal').classList.add('hidden'); }

async function handleLoanSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('loanType').value;
    const date = document.getElementById('loanDate').value;
    const person = document.getElementById('loanPersonName').value.trim();
    const amount = parseFloat(document.getElementById('loanAmount').value) || 0;

    const res = await callBackendApi('save_loan', { category: type, date, person_name: person, amount });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeLoanModal();
        showToast('লোন রেকর্ড সংরক্ষিত হয়েছে।');
    } else {
        showToast(res.message || 'সংরক্ষণ ব্যর্থ হয়েছে।');
    }
}

function renderLoanTables() {
    let givenTotal = 0;
    const givenList = document.getElementById('loanGivenList');
    givenList.innerHTML = loanGivenRecords.length === 0 ? '<p class="text-[11px] text-slate-500">No Receivable records.</p>' : loanGivenRecords.map(l => {
        if (l.status !== 'Paid') givenTotal += Number(l.amount);
        return `
            <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                <div>
                    <span class="font-bold text-slate-200">${l.person_name}</span>
                    <span class="text-[10px] text-slate-400 block">${l.entry_date} • ${l.status === 'Paid' ? '<span class="text-emerald-400">Settled</span>' : '<span class="text-amber-400">Pending</span>'}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-amber-400">${formatMoney(l.amount)}</span>
                    ${l.status !== 'Paid' ? `<button onclick="openSettleModal('${l.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('loanGivenTotalText').innerText = 'Total: ' + formatMoney(givenTotal);

    let takenTotal = 0;
    const takenList = document.getElementById('loanTakenList');
    takenList.innerHTML = loanTakenRecords.length === 0 ? '<p class="text-[11px] text-slate-500">No Payable records.</p>' : loanTakenRecords.map(l => {
        if (l.status !== 'Paid') takenTotal += Number(l.amount);
        return `
            <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                <div>
                    <span class="font-bold text-slate-200">${l.person_name}</span>
                    <span class="text-[10px] text-slate-400 block">${l.entry_date} • ${l.status === 'Paid' ? '<span class="text-emerald-400">Paid</span>' : '<span class="text-rose-400">Due</span>'}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-rose-400">${formatMoney(l.amount)}</span>
                    ${l.status !== 'Paid' ? `<button onclick="openSettleModal('${l.id}')" class="bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('loanTakenTotalText').innerText = 'Total: ' + formatMoney(takenTotal);
}

function openSettleModal(id) {
    document.getElementById('settleLoanId').value = id;
    document.getElementById('settleLoanModal').classList.remove('hidden');
}
function closeSettleModal() { document.getElementById('settleLoanModal').classList.add('hidden'); }

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
        showToast(res.message || 'সেটেলমেন্ট ব্যর্থ হয়েছে।');
    }
}

function openMarketModal() { document.getElementById('marketModal').classList.remove('hidden'); }
function closeMarketModal() { document.getElementById('marketModal').classList.add('hidden'); }

async function handleMarketSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('marketDate').value;
    const desc = document.getElementById('marketDesc').value.trim();
    const amount = parseFloat(document.getElementById('marketAmount').value) || 0;
    const status = document.getElementById('marketStatus').value;

    const res = await callBackendApi('save_market_expense', { expense_date: date, description: desc, amount, status });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeMarketModal();
        showToast('দৈনিক খরচ যুক্ত হয়েছে!');
    } else {
        showToast(res.message || 'খরচ যুক্ত করতে সমস্যা হয়েছে।');
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
    if (marketExpenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-3 text-center text-slate-500">No daily expenses recorded.</td></tr>';
        return;
    }
    tbody.innerHTML = marketExpenses.map(m => `
        <tr class="text-slate-300">
            <td class="py-2 px-2 font-mono text-[11px]">${m.expense_date}</td>
            <td class="py-2 px-2">${m.description}</td>
            <td class="py-2 px-2 font-mono text-rose-400 font-bold">${formatMoney(m.amount)}</td>
            <td class="py-2 px-2 text-right">
                <button onclick="toggleMarketStatus('${m.id}')" class="${m.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-700/50' : 'bg-amber-950 text-amber-400 border-amber-700/50'} border px-2 py-0.5 rounded text-[10px] font-bold">
                    ${m.status}
                </button>
            </td>
        </tr>
    `).join('');
}

// -------------------------------------------------------------------------
// LOT & LICENSE MANAGEMENT
// -------------------------------------------------------------------------
function openBuyLotModal() {
    document.getElementById('generatedLotNumber').innerText = 'LT-' + Math.floor(1000 + Math.random() * 9000);
    calculateLotPrice();
    document.getElementById('buyLotModal').classList.remove('hidden');
}
function closeBuyLotModal() { document.getElementById('buyLotModal').classList.add('hidden'); }

function calculateLotPrice() {
    const qty = parseInt(document.getElementById('lotQuantitySelect').value) || 10;
    const sub = qty * 100;
    const disc = sub * 0.20;
    const net = sub - disc;
    document.getElementById('lotSubTotalText').innerText = formatMoney(sub);
    document.getElementById('lotDiscountText').innerText = '- ' + formatMoney(disc);
    document.getElementById('lotNetTotalText').innerText = formatMoney(net);
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
        showToast(res.message || 'লট ক্রয় ব্যর্থ হয়েছে।');
    }
}

function renderLotInventory() {
    const inStockItems = accountsMasterRecords.filter(a => a.owner_id === currentCompositeUserId && a.status === 'In_Stock');
    document.getElementById('availableLotIdsCount').innerText = inStockItems.length;
    const activeSubs = accountsMasterRecords.filter(a => a.upline_id === currentCompositeUserId && a.status !== 'In_Stock');
    document.getElementById('subUserCount').innerText = activeSubs.length || 1;

    const listEl = document.getElementById('lotInventorySummaryList');
    const selectEl = document.getElementById('sellLotIdSelect');

    if (inStockItems.length === 0) {
        if(listEl) listEl.innerHTML = '<p class="text-slate-500">No In_Stock IDs available.</p>';
        if(selectEl) selectEl.innerHTML = '<option value="">No Stock Available</option>';
    } else {
        if(listEl) {
            listEl.innerHTML = inStockItems.map(item => `
                <div class="flex justify-between items-center bg-[#131822] px-2 py-1 rounded border border-slate-800">
                    <span class="text-amber-400 font-mono">${item.lot_id} • ${item.user_name || item.user_id}</span>
                    <span class="text-emerald-400 font-bold">In_Stock</span>
                </div>
            `).join('');
        }
        if(selectEl) {
            selectEl.innerHTML = '<option value="">-- Select Lot ID --</option>' + inStockItems.map(item => `
                <option value="${item.id || item.lot_id}" data-password="${item.password || ''}">${item.lot_id} - ${item.user_name || item.user_id} (In_Stock)</option>
            `).join('');
        }
    }
}

function openSellLicenseModal() {
    renderLotInventory();
    const userCoupon = document.getElementById('userCouponCode').innerText;
    document.getElementById('sellCouponCodeInput').value = userCoupon;
    document.getElementById('sellLicenseModal').classList.remove('hidden');
}

function closeSellLicenseModal() { 
    document.getElementById('sellLicenseModal').classList.add('hidden'); 
}

async function handleSellNewIdSubmit(e) {
    e.preventDefault();
    const selectedId = document.getElementById('sellLotIdSelect').value;
    const couponCode = document.getElementById('sellCouponCodeInput').value;
    const name = document.getElementById('sellBuyerName').value.trim();
    const mobile = document.getElementById('sellBuyerMobile').value.trim();
    const email = document.getElementById('sellBuyerEmail').value.trim();

    const res = await callBackendApi('process_id_sale_cashback', { 
        seller_composite_id: currentCompositeUserId, 
        sold_item_id: selectedId,
        coupon_code: couponCode,
        buyer_name: name,
        buyer_mobile: mobile,
        buyer_email: email
    });

    if (res.success) {
        await loadAllDatabaseRecords();
        closeSellLicenseModal();
        showToast('আইডি বিক্রি সফল হয়েছে এবং ক্যাশব্যাক যুক্ত হয়েছে!');
    } else {
        showToast(res.message || 'আইডি বিক্রি সম্পন্ন করা যায়নি।');
    }
}

// -------------------------------------------------------------------------
// VALIDITY EXTENSION (Dropdown + Cart + Backend Calculation + Cash Pay)
// -------------------------------------------------------------------------
function openBuyValidityModal() {
    document.getElementById('buyValidityModal')?.classList.remove('hidden');
    refreshValiditySummaryDisplay(validityCart);
}

function closeBuyValidityModal() {
    document.getElementById('buyValidityModal')?.classList.add('hidden');
}

function addValidityToCart() {
    const months = Math.max(1, parseInt(document.getElementById('validityPlanDropdown')?.value, 10) || 1);
    const found = validityCart.find((i) => i.months === months);
    if (found) {
        found.qty += 1;
    } else {
        validityCart.push({ months, qty: 1 });
    }
    refreshValiditySummaryDisplay(validityCart);
}

function removeValidityCartItem(idx) {
    validityCart.splice(idx, 1);
    refreshValiditySummaryDisplay(validityCart);
}

async function refreshValiditySummaryDisplay(items = validityCart) {
    const box = document.getElementById('validityCartItems');
    if (!items || !items.length) {
        if (box) box.innerHTML = `<p class="text-slate-500 text-center py-2">Cart is empty. Select a plan & click Add.</p>`;
        const setZero = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        setZero('validityTotalDaysText', '0 Days');
        setZero('validityBasePriceText', formatMoney(0));
        setZero('validityDiscountText', '- ' + formatMoney(0));
        setZero('validitySubtotalText', formatMoney(0));
        setZero('validityPayableText', formatMoney(0));
        return;
    }

    const useCouponWallet = Boolean(document.getElementById('useCouponWalletCheckbox')?.checked);
    const res = await callBackendApi('preview_validity_cart', { items, use_coupon_wallet: useCouponWallet });

    if (!res.success) {
        showToast(res.message || 'হিসাব লোড করা যায়নি।');
        return;
    }

    const summary = res.summary || {};
    if (box && Array.isArray(summary.items)) {
        box.innerHTML = summary.items.map((it, idx) => `
            <div class="flex items-center justify-between bg-[#0f172a] border border-slate-800 rounded-lg px-2.5 py-1.5">
                <div>
                    <span class="font-semibold text-white">${it.months} Month${it.months > 1 ? 's' : ''} (${it.days} Days)</span>
                    <span class="text-slate-400"> × ${it.qty}</span>
                    ${it.discountPct > 0 ? `<span class="ml-1 text-[11px] text-emerald-400">(-${it.discountPct}%)</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-mono text-slate-200">${formatMoney(it.subtotal || 0)}</span>
                    <button type="button" onclick="removeValidityCartItem(${idx})" class="text-rose-400 hover:text-rose-300 font-bold">×</button>
                </div>
            </div>
        `).join('');
    }

    const setVal = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setVal('validityTotalDaysText', `${summary.totalDays || 0} Days`);
    setVal('validityBasePriceText', formatMoney(summary.baseTotal || 0));
    setVal('validityDiscountText', '- ' + formatMoney(summary.discountTotal || 0));
    setVal('validitySubtotalText', formatMoney(summary.subtotal || 0));
    setVal('validityPayableText', formatMoney(summary.payableAmount || 0));

    if (typeof summary.pendingDays !== 'undefined') {
        updateValidityPendingBadge(summary.pendingDays, summary.approvalStatus);
    }
}

async function handleCashPayValidity() {
    const trxInput = document.getElementById('validityTrxId');
    const trxId = trxInput ? trxInput.value.trim() : '';
    const useCouponWallet = Boolean(document.getElementById('useCouponWalletCheckbox')?.checked);

    if (!validityCart.length) {
        showToast('কার্টে অন্তত একটি প্ল্যান যোগ করুন।');
        return;
    }
    if (!trxId) {
        showToast('Cash Pay-এর জন্য Transaction ID দিন।');
        if (trxInput) trxInput.focus();
        return;
    }

    const res = await callBackendApi('buy_validity', {
        items: validityCart,
        use_coupon_wallet: useCouponWallet,
        trx_id: trxId,
        payment_method: 'Cash Pay'
    });

    if (res.success) {
        const summary = res.summary || {};
        updateValidityPendingBadge(summary.pendingDays, summary.approvalStatus || 'Admin Approval');
        validityCart = [];
        if (trxInput) trxInput.value = '';
        const cb = document.getElementById('useCouponWalletCheckbox');
        if (cb) cb.checked = false;
        refreshValiditySummaryDisplay([]);
        closeBuyValidityModal();
        await loadAllDatabaseRecords();
        showToast(res.message || 'Cash Pay রিকোয়েস্ট জমা হয়েছে—Admin Approval পেন্ডিং।');
    } else {
        showToast(res.message || 'Validity extension failed.');
    }
}

function openBalanceTransferModal() { document.getElementById('balanceTransferModal').classList.remove('hidden'); }
function closeBalanceTransferModal() { document.getElementById('balanceTransferModal').classList.add('hidden'); }

async function handleBalanceTransferSubmit(e) {
    e.preventDefault();
    const recipient = document.getElementById('transferRecipientId').value;
    const amount = parseFloat(document.getElementById('transferAmount').value) || 0;

    const res = await callBackendApi('balance_transfer', { recipient_id: recipient, amount });
    if (res.success) {
        await loadAllDatabaseRecords();
        closeBalanceTransferModal();
        showToast('ব্যালেন্স ট্রান্সফার সফল হয়েছে!');
    } else {
        showToast(res.message || 'ব্যালেন্স ট্রান্সফার ব্যর্থ হয়েছে।');
    }
}

function openBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.remove('hidden'); }
function closeBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.add('hidden'); }

async function handleLandingBuySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('landingBuyerName').value.trim();
    const mobile = document.getElementById('landingBuyMobile').value.trim();
    const email = document.getElementById('landingBuyEmail').value.trim();
    const trxId = document.getElementById('landingBuyPaymentId').value.trim();

    const res = await callBackendApi('register_new_license', {
        name: name,
        mobile: mobile,
        email: email,
        trx_id: trxId
    });

    if (res.success) {
        closeBuyLicenseLandingModal();
        showToast('নতুন আইডির আবেদন সফলভাবে জমা হয়েছে!');
    } else {
        showToast(res.message || 'সাবমিট করতে সমস্যা হয়েছে।');
    }
}

function openAddDeviceModal() { document.getElementById('addDeviceModal').classList.remove('hidden'); }
function closeAddDeviceModal() { document.getElementById('addDeviceModal').classList.add('hidden'); }

async function handleAddDeviceSubmit(e) {
    e.preventDefault();
    if (activeDevices < 2) {
        activeDevices++;
        document.getElementById('activeDeviceCount').innerText = activeDevices;
        closeAddDeviceModal();
        showToast('নতুন ডিভাইস যুক্ত হয়েছে!');
    } else {
        showToast('সর্বোচ্চ ২টি ডিভাইস যুক্ত করা যাবে!');
    }
}

// -------------------------------------------------------------------------
// CHAT & CASH MEMO LOGIC
// -------------------------------------------------------------------------
function openMyChatModal() {
    exitIndividualChat();
    renderChatUsersList();
    renderUniversalMessages();
    document.getElementById('myChatModal').classList.remove('hidden');
}

function renderChatUsersList() {
    const container = document.getElementById('chatUsersListContainer');
    const otherUsers = accountsMasterRecords.filter(u => (u.user_name || u.user_id) !== currentUserName);
    container.innerHTML = otherUsers.map(u => `
        <button type="button" onclick="openIndividualChat('${u.user_name || u.user_id}')" 
            class="shrink-0 bg-[#131822] hover:bg-indigo-950/60 border border-slate-700 hover:border-indigo-500/60 rounded-xl px-3 py-1.5 flex items-center space-x-1.5 transition-all">
            <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
            <span class="text-xs font-bold text-slate-200">${u.user_name || u.user_id}</span>
        </button>
    `).join('');
}

function renderUniversalMessages() {
    const box = document.getElementById('universalChatBox');
    box.innerHTML = universalMessages.map(m => {
        const isMe = m.user_name === currentUserName || m.user_id === currentUserName;
        const senderLabel = m.user_name || m.user_id || 'User';
        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You (' + senderLabel + ')' : senderLabel}</span>
                <div class="${isMe ? 'bg-emerald-600 text-slate-950 font-semibold' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">
                    ${m.message}
                </div>
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendUniversalMessage(e) {
    e.preventDefault();
    const input = document.getElementById('universalMsgInput');
    const text = input.value.trim();
    if (!text) return;

    const res = await callBackendApi('send_chat', { channel: 'Public_Forum', message: text });
    if (res.success) {
        universalMessages.push({ user_name: currentUserName, message: text });
        input.value = '';
        renderUniversalMessages();
    }
}

function openIndividualChat(partnerName) {
    activePrivatePartner = partnerName;
    document.getElementById('universalChatView').classList.add('hidden');
    document.getElementById('individualChatView').classList.remove('hidden');
    document.getElementById('chatBackBtn').classList.remove('hidden');
    document.getElementById('chatModalTitle').innerHTML = `<i class="fa-solid fa-user-lock text-indigo-400"></i><span>${partnerName}</span>`;
    document.getElementById('activeChatPartnerName').innerText = partnerName;
    renderIndividualMessages();
}

function exitIndividualChat() {
    activePrivatePartner = null;
    document.getElementById('individualChatView').classList.add('hidden');
    document.getElementById('universalChatView').classList.remove('hidden');
    document.getElementById('chatBackBtn').classList.add('hidden');
    document.getElementById('chatModalTitle').innerHTML = `<i class="fa-solid fa-comments text-emerald-400"></i><span>My Chat (Universal & Users)</span>`;
}

function renderIndividualMessages() {
    if (!activePrivatePartner) return;
    const box = document.getElementById('individualChatBox');
    const msgs = privateMessagesMap[activePrivatePartner] || [];
    box.innerHTML = msgs.map(m => {
        const isMe = m.user_name === currentUserName || m.user_id === currentUserName;
        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You' : (m.user_name || m.user_id)}</span>
                <div class="${isMe ? 'bg-indigo-600 text-white font-medium' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">
                    ${m.message}
                </div>
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendIndividualMessage(e) {
    e.preventDefault();
    if (!activePrivatePartner) return;
    const input = document.getElementById('individualMsgInput');
    const text = input.value.trim();
    if (!text) return;

    const channelName = 'DM_' + [currentUserName, activePrivatePartner].sort().join('_');
    const res = await callBackendApi('send_chat', { channel: channelName, message: text });
    if (res.success) {
        if (!privateMessagesMap[activePrivatePartner]) privateMessagesMap[activePrivatePartner] = [];
        privateMessagesMap[activePrivatePartner].push({ user_name: currentUserName, message: text });
        input.value = '';
        renderIndividualMessages();
    }
}

function openCashMemoModal() { document.getElementById('cashMemoModal').classList.remove('hidden'); }
function openSettingsModal() {
    document.getElementById('settingsComposite').innerText = currentCompositeUserId;
    document.getElementById('settingsModal').classList.remove('hidden');
}
function toggleAccountsSection() {
    const container = document.getElementById('accountsSectionContainer');
    const toggleText = document.getElementById('accountsToggleText');
    const toggleIcon = document.getElementById('accountsToggleIcon');
    container.classList.toggle('hidden');
    toggleText.innerText = container.classList.contains('hidden') ? 'Show Accounts' : 'Hide Accounts';
    toggleIcon.className = container.classList.contains('hidden') ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
}
function copyCouponCode() {
    navigator.clipboard.writeText(document.getElementById('userCouponCode').innerText);
    showToast('Coupon Copied!');
}

function lockBusinessSetup() {
    document.getElementById('memoHeaderConfig').setAttribute('readonly', true);
    document.getElementById('memoFooterConfig').setAttribute('readonly', true);
    const btn = document.getElementById('lockBusinessSetupBtn');
    btn.innerText = 'Locked (Saved)';
    btn.classList.replace('bg-amber-600', 'bg-slate-700');
    showToast('বিজনেস সেটআপ লক করা হয়েছে!');
}

function addProductToMemoCart() {
    const desc = document.getElementById('memoProdDesc').value.trim();
    const qty = parseInt(document.getElementById('memoProdQty').value) || 1;
    const rate = parseFloat(document.getElementById('memoProdRate').value) || 0;
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
        return `<tr>
            <td class="py-1.5 px-2 text-slate-300">${item.desc}</td>
            <td class="py-1.5 px-1 text-center">${item.qty}</td>
            <td class="py-1.5 px-1 text-right">৳ ${item.rate}</td>
            <td class="py-1.5 px-2 text-right text-emerald-400 font-bold">৳ ${item.total}</td>
            <td class="py-1.5 px-1 text-center text-rose-400 cursor-pointer" onclick="memoCart.splice(${idx},1); renderMemoCart();">×</td>
        </tr>`;
    }).join('');
    document.getElementById('memoCartGrandTotal').innerText = formatMoney(grand);
}

function openA4PdfPreview() {
    const headerText = document.getElementById('memoHeaderConfig').value;
    const footerText = document.getElementById('memoFooterConfig').value;
    const custName = document.getElementById('memoCustomerName').value;
    const custMob = document.getElementById('memoCustomerMobile').value;
    let grand = memoCart.reduce((acc, i) => acc + i.total, 0);

    const contentBox = document.getElementById('a4PdfContentBox');
    contentBox.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0; font-size: 20px; color: #111; font-weight: bold;">${headerText}</h2>
            <h3 style="margin: 8px 0 0 0; font-size: 15px; background: #eee; display: inline-block; padding: 2px 20px; border-radius: 4px; font-weight: bold;">CASH MEMO</h3>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 15px; color: #333;">
            <div><strong>Customer Name:</strong> ${custName}<br><strong>Mobile:</strong> ${custMob}</div>
            <div style="text-align: right;"><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}<br><strong>Memo No:</strong> #MEMO-${Math.floor(Math.random()*90000+10000)}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
            <thead>
                <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px; text-align: left;">Item Description</th>
                    <th style="padding: 8px; text-align: center;">Qty</th>
                    <th style="padding: 8px; text-align: right;">Rate</th>
                    <th style="padding: 8px; text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${memoCart.map(i => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px;">${i.desc}</td>
                        <td style="padding: 8px; text-align: center;">${i.qty}</td>
                        <td style="padding: 8px; text-align: right;">৳ ${i.rate}</td>
                        <td style="padding: 8px; text-align: right; font-weight: bold;">৳ ${i.total}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div style="text-align: right; font-size: 15px; font-weight: bold; margin-bottom: 40px;">Grand Total: ৳ ${grand.toFixed(2)}</div>
        <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px;">${footerText}</div>
    `;
    document.getElementById('cashMemoModal').classList.add('hidden');
    document.getElementById('a4PdfPreviewModal').classList.remove('hidden');
}

function saveMemoToDevice() {
    showToast('ক্যাশ মেমো সেভ হয়েছে!');
    document.getElementById('a4PdfPreviewModal').classList.add('hidden');
}

function printMemoPdf() {
    const printArea = document.getElementById('a4MemoPrintArea');
    printArea.innerHTML = document.getElementById('a4PdfContentBox').innerHTML;
    printArea.classList.remove('hidden');
    document.getElementById('a4PdfPreviewModal').classList.add('hidden');
    window.print();
    printArea.classList.add('hidden');
}

// -------------------------------------------------------------------------
// USER PASSWORD & USERNAME CHANGE LOGIC
// -------------------------------------------------------------------------
function openUserPassModal() {
    const compId = localStorage.getItem('composite_user_id') || currentCompositeUserId || 'N/A';
    const buyerEmail = localStorage.getItem('buyer_email') || 'N/A';
    const currentUN = localStorage.getItem('user_name') || currentUserName || '';

    document.getElementById('modalCompositeId').innerText = compId;
    document.getElementById('modalAutoEmail').innerText = buyerEmail;
    document.getElementById('newUsernameInput').value = currentUN;

    const modal = document.getElementById('userPassModal');
    if (modal) modal.style.display = 'flex';
}

function closeUserPassModal() {
    const modal = document.getElementById('userPassModal');
    if (modal) modal.style.display = 'none';
}

async function submitUserPasswordChange() {
    const newUsername = document.getElementById('newUsernameInput').value.trim();
    const oldPassword = document.getElementById('oldPasswordInput').value.trim();
    const newPassword = document.getElementById('newPasswordInput').value.trim();
    const confirmPassword = document.getElementById('confirmPasswordInput').value.trim();
    
    const compositeUserId = document.getElementById('modalCompositeId').innerText;
    const buyerEmail = document.getElementById('modalAutoEmail').innerText;

    if (!oldPassword || !newPassword || !confirmPassword) {
        alert('দয়া করে পুরাতন এবং নতুন পাসওয়ার্ডের ঘরগুলো পূরণ করুন।');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('নতুন পাসওয়ার্ড এবং পুনরায় দেওয়া পাসওয়ার্ড মিলছে না!');
        return;
    }

    if (!compositeUserId || compositeUserId === 'N/A' || compositeUserId === '--') {
        alert('Composite User ID পাওয়া যায়নি। দয়া করে আবার লগইন করুন।');
        return;
    }

    const btn = document.getElementById('btnAcceptLoginAgain');
    if (btn) {
        btn.innerText = 'Processing...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/root-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'user_password_change',
                composite_user_id: compositeUserId,
                user_id: compositeUserId,
                payload: {
                    new_username: newUsername,
                    old_password: oldPassword,
                    new_password: newPassword,
                    buyer_email: buyerEmail
                }
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload(); 
        } else {
            alert(result.message || 'পরিবর্তন ব্যর্থ হয়েছে!');
        }
    } catch (err) {
        console.error(err);
        alert('সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে।');
    } finally {
        if (btn) {
            btn.innerText = 'Accept & Login Again';
            btn.disabled = false;
        }
    }
}

// -------------------------------------------------------------------------
// LOT PASSWORD AUTO-FILL (Select Lot ID to Sell)
// -------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
    const lotIdSelectElement = document.getElementById('sellLotIdSelect');
    const lotPasswordElement = document.getElementById('lotPassword');

    if (lotIdSelectElement && lotPasswordElement) {
        lotIdSelectElement.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const password = selectedOption ? selectedOption.getAttribute('data-password') : '';
            
            if (password) {
                lotPasswordElement.value = password;
            } else {
                const selectedVal = this.value;
                const foundItem = accountsMasterRecords.find(item => item.id == selectedVal || item.lot_id == selectedVal);
                
                if (foundItem && foundItem.password) {
                    lotPasswordElement.value = foundItem.password;
                } else {
                    lotPasswordElement.value = '';
                }
            }
        });
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('incomeDate')) document.getElementById('incomeDate').value = today;
    if(document.getElementById('loanDate')) document.getElementById('loanDate').value = today;
    if(document.getElementById('marketDate')) document.getElementById('marketDate').value = today;
    if(document.getElementById('settleDate')) document.getElementById('settleDate').value = today;
    startValidityCountdown();
    renderMemoCart();
});
