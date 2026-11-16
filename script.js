const PROXY_URL = '/api/root-proxy';
let GLOBAL_COMPANY_ID = null;
let currentUserId = ""; 
let currentCompositeUserId = ""; 

let currentWalletBalance = 0.00;
let currentValidityDays = 0;
let activeDevices = 0;

let runningIncome = 0.00;
let runningExpense = 0.00;
let totalIncome2026 = 0.00;
let totalExpense2026 = 0.00;

let lotInventory = [];
let loanGivenRecords = [];
let loanTakenRecords = [];
let marketExpenses = [];
let incomeExpenseRecords = [];

function showToast(text) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-text').innerText = text;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3500);
}
function hideToast() { document.getElementById('toast').classList.add('hidden'); }
function formatMoney(amount) { return '৳ ' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ডাটাবেজ থেকে ড্যাশবোর্ড ডেটা ফেচ করা
async function fetchDashboardData(company_id, user_id) {
    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'FETCH_DASHBOARD_DATA', 
                company_id, 
                user_id,
                composite_user_id: currentCompositeUserId 
            })
        });
        const result = await response.json();
        if (result.success) {
            marketExpenses = result.data.daily_expenses || [];
            const allLoans = result.data.loan_records || [];
            incomeExpenseRecords = result.data.income_expense || [];

            loanGivenRecords = allLoans.filter(l => l.loan_category === 'Receivable');
            loanTakenRecords = allLoans.filter(l => l.loan_category === 'Payable');

            calculateFinancialTotals();
            updateFinancialDisplays();
        }
    } catch (err) {
        console.error('Database Fetch Error:', err);
    }
}

function calculateFinancialTotals() {
    totalIncome2026 = 0;
    totalExpense2026 = 0;
    runningIncome = 0;
    runningExpense = 0;

    const currentMonthStr = new Date().toISOString().slice(0, 7);

    incomeExpenseRecords.forEach(item => {
        const amt = parseFloat(item.amount || 0);
        const itemMonth = item.entry_date ? item.entry_date.slice(0, 7) : '';

        if (item.entry_type === 'Income') {
            totalIncome2026 += amt;
            if (itemMonth === currentMonthStr) runningIncome += amt;
        } else if (item.entry_type === 'Expense') {
            totalExpense2026 += amt;
            if (itemMonth === currentMonthStr) runningExpense += amt;
        }
    });
}

function updateFinancialDisplays() {
    document.getElementById('walletBalanceText').innerText = formatMoney(currentWalletBalance);
    document.getElementById('accountValidityDays').innerText = currentValidityDays;
    document.getElementById('activeDeviceCount').innerText = activeDevices;
    document.getElementById('displayCompositeId').innerText = currentCompositeUserId;
    
    document.getElementById('totalIncome2026').innerText = formatMoney(totalIncome2026);
    document.getElementById('totalExpense2026').innerText = formatMoney(totalExpense2026);
    document.getElementById('totalSurplus2026').innerText = formatMoney(totalIncome2026 - totalExpense2026);
    
    document.getElementById('runningMonthIncome').innerText = formatMoney(runningIncome);
    document.getElementById('runningMonthExpense').innerText = formatMoney(runningExpense);
    document.getElementById('runningMonthSurplus').innerText = formatMoney(runningIncome - runningExpense);

    renderLoanLists();
    renderExpenseList();
    renderLotInventory();
}

function renderLoanLists() {
    const givenContainer = document.getElementById('loanGivenList');
    const takenContainer = document.getElementById('loanTakenList');
    
    if (!givenContainer || !takenContainer) return;

    if (loanGivenRecords.length === 0) {
        givenContainer.innerHTML = `<p class="text-slate-500 text-center text-xs py-1">No database records found.</p>`;
        document.getElementById('loanGivenTotalText').innerText = `Total: ৳ 0.00`;
    } else {
        let gTotal = 0;
        givenContainer.innerHTML = loanGivenRecords.map(loan => {
            gTotal += parseFloat(loan.amount || 0);
            return `<div class="flex justify-between items-center text-xs bg-[#131822] p-2 rounded-lg">
                <span class="text-slate-200">${loan.person_name} (${loan.entry_date})</span>
                <span class="text-emerald-400 font-bold">৳ ${Number(loan.amount).toLocaleString()}</span>
            </div>`;
        }).join('');
        document.getElementById('loanGivenTotalText').innerText = `Total: ৳ ${gTotal.toLocaleString()}`;
    }

    if (loanTakenRecords.length === 0) {
        takenContainer.innerHTML = `<p class="text-slate-500 text-center text-xs py-1">No database records found.</p>`;
        document.getElementById('loanTakenTotalText').innerText = `Total: ৳ 0.00`;
    } else {
        let tTotal = 0;
        takenContainer.innerHTML = loanTakenRecords.map(loan => {
            tTotal += parseFloat(loan.amount || 0);
            return `<div class="flex justify-between items-center text-xs bg-[#131822] p-2 rounded-lg">
                <span class="text-slate-200">${loan.person_name} (${loan.entry_date})</span>
                <span class="text-rose-400 font-bold">৳ ${Number(loan.amount).toLocaleString()}</span>
            </div>`;
        }).join('');
        document.getElementById('loanTakenTotalText').innerText = `Total: ৳ ${tTotal.toLocaleString()}`;
    }
}

function renderExpenseList() {
    const tbody = document.getElementById('marketExpenseList');
    if (!tbody) return;
    if (marketExpenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-2 text-center text-slate-500">No expense records found.</td></tr>`;
        return;
    }
    tbody.innerHTML = marketExpenses.map(exp => `
        <tr class="hover:bg-slate-800/30">
            <td class="py-2 px-2 text-slate-400 text-[11px]">${exp.expense_date || '-'}</td>
            <td class="py-2 px-2 text-slate-200">${exp.description || '-'}</td>
            <td class="py-2 px-2 text-rose-400 font-semibold">৳ ${Number(exp.amount || 0).toLocaleString()}</td>
            <td class="py-2 px-2 text-right"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">${exp.status || 'N/A'}</span></td>
        </tr>
    `).join('');
}

function renderLotInventory() {
    const listEl = document.getElementById('lotInventorySummaryList');
    const countEl = document.getElementById('availableLotIdsCount');
    if (!listEl || !countEl) return;
    countEl.innerText = lotInventory.length;
    listEl.innerHTML = lotInventory.length > 0 ? '' : '<p class="text-slate-500 text-center py-1">No lots found in database.</p>';
}

// লগইন সাবমিট হ্যান্ডলার
async function handleMainSignIn(event) {
    event.preventDefault();
    const company_id = parseInt(document.getElementById('signInCompanyId').value);
    const user_id = document.getElementById('mainUserId').value.trim();
    const password = document.getElementById('mainUserPassword').value;

    GLOBAL_COMPANY_ID = company_id;
    currentUserId = user_id;
    currentCompositeUserId = `${company_id}_${user_id}`;

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'LOGIN', company_id, user_id, payload: { password } })
        });
        const result = await response.json();
        
        if (result.success) {
            const user = result.user || {};
            currentWalletBalance = user.wallet_balance || 0;
            currentValidityDays = user.validity_days || 0;
            
            document.getElementById('currentLoggedInUser').innerText = user_id;
            document.getElementById('userCouponCode').innerText = user.coupon_code || `SIGMA-${user_id}`;
            document.getElementById('page1').classList.add('hidden');
            document.getElementById('page2').classList.remove('hidden');
            
            updateFinancialDisplays();
            await fetchDashboardData(company_id, user_id);
            showToast('লগইন সফল হয়েছে!');
        } else {
            showToast(result.message || 'Login failed!');
        }
    } catch (err) {
        showToast('সার্ভার কানেকশন ত্রুটি!');
    }
}

async function handleLogOut() {
    document.getElementById('page2').classList.add('hidden');
    document.getElementById('page1').classList.remove('hidden');
    showToast('Logged out');
}

// Buy New ID / License সাবমিট হ্যান্ডলার
async function handleLandingBuySubmit(e) {
    e.preventDefault();
    const mobile = document.getElementById('landingBuyMobile').value.trim();
    const email = document.getElementById('landingBuyEmail').value.trim();

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'BUY_NEW_LICENSE',
                payload: { mobile, email }
            })
        });
        const result = await response.json();
        if (result.success) {
            showToast('লাইসেন্স রিকোয়েস্ট সফলভাবে জমা হয়েছে!');
            closeBuyLicenseLandingModal();
            document.getElementById('landingBuyMobile').value = '';
            document.getElementById('landingBuyEmail').value = '';
        } else {
            showToast(result.error || 'সংরক্ষণ ব্যর্থ হয়েছে!');
        }
    } catch (err) {
        showToast('সার্ভার কানেকশন ত্রুটি!');
    }
}

// ফর্ম সাবমিশন হ্যান্ডলারসমূহ (প্রক্সি API কল)
async function handleIncomeSubmit(e) {
    e.preventDefault();
    const entry_type = document.getElementById('incomeEntryType').value;
    const entry_date = document.getElementById('incomeDate').value;
    const description = document.getElementById('incomeDesc').value;
    const amount = parseFloat(document.getElementById('incomeAmount').value);

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ADD_INCOME_EXPENSE',
                company_id: GLOBAL_COMPANY_ID,
                user_id: currentUserId,
                composite_user_id: currentCompositeUserId,
                payload: { entry_type, entry_date, description, amount }
            })
        });
        const result = await response.json();
        if (result.success) {
            showToast('সফলভাবে সংরক্ষিত হয়েছে!');
            closeIncomeModal();
            await fetchDashboardData(GLOBAL_COMPANY_ID, currentUserId);
        } else {
            showToast(result.error || 'ব্যর্থ হয়েছে!');
        }
    } catch (err) {
        showToast('সার্ভার ত্রুটি!');
    }
}

async function handleLoanSubmit(e) {
    e.preventDefault();
    const loan_category = document.getElementById('loanType').value;
    const entry_date = document.getElementById('loanDate').value;
    const person_name = document.getElementById('loanPersonName').value;
    const amount = parseFloat(document.getElementById('loanAmount').value);

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ADD_LOAN',
                company_id: GLOBAL_COMPANY_ID,
                user_id: currentUserId,
                composite_user_id: currentCompositeUserId,
                payload: { loan_category, entry_date, person_name, amount }
            })
        });
        const result = await response.json();
        if (result.success) {
            showToast('লোন রেকর্ড সংরক্ষিত হয়েছে!');
            closeLoanModal();
            await fetchDashboardData(GLOBAL_COMPANY_ID, currentUserId);
        } else {
            showToast(result.error || 'ব্যর্থ হয়েছে!');
        }
    } catch (err) {
        showToast('সার্ভার ত্রুটি!');
    }
}

async function handleMarketSubmit(e) {
    e.preventDefault();
    const expense_date = document.getElementById('marketDate').value;
    const description = document.getElementById('marketDesc').value;
    const amount = parseFloat(document.getElementById('marketAmount').value);
    const status = document.getElementById('marketStatus').value;

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ADD_DAILY_EXPENSE',
                company_id: GLOBAL_COMPANY_ID,
                user_id: currentUserId,
                composite_user_id: currentCompositeUserId,
                payload: { expense_date, description, amount, status }
            })
        });
        const result = await response.json();
        if (result.success) {
            showToast('খরচ রেকর্ড করা হয়েছে!');
            closeMarketModal();
            await fetchDashboardData(GLOBAL_COMPANY_ID, currentUserId);
        } else {
            showToast(result.error || 'ব্যর্থ হয়েছে!');
        }
    } catch (err) {
        showToast('সার্ভার ত্রুটি!');
    }
}

// মোডাল কন্ট্রোল ও ইউটিলিটি
function openBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.remove('hidden'); }
function closeBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.add('hidden'); }
function openModLoginModal() { document.getElementById('modLoginModal').classList.remove('hidden'); }
function closeModLoginModal() { document.getElementById('modLoginModal').classList.add('hidden'); }
function openAddDeviceModal() { document.getElementById('addDeviceModal').classList.remove('hidden'); }
function closeAddDeviceModal() { document.getElementById('addDeviceModal').classList.add('hidden'); }
function openAddBalanceModal() { document.getElementById('addBalanceModal').classList.remove('hidden'); }
function closeAddBalanceModal() { document.getElementById('addBalanceModal').classList.add('hidden'); }
function openIncomeModal() { document.getElementById('incomeModal').classList.remove('hidden'); }
function closeIncomeModal() { document.getElementById('incomeModal').classList.add('hidden'); }
function openLoanModal() { document.getElementById('loanModal').classList.remove('hidden'); }
function closeLoanModal() { document.getElementById('loanModal').classList.add('hidden'); }
function openMarketModal() { document.getElementById('marketModal').classList.remove('hidden'); }
function closeMarketModal() { document.getElementById('marketModal').classList.add('hidden'); }
function openBuyLotModal() { document.getElementById('buyLotModal').classList.remove('hidden'); }
function closeBuyLotModal() { document.getElementById('buyLotModal').classList.add('hidden'); }
function openSellLicenseModal() { document.getElementById('sellLicenseModal').classList.remove('hidden'); }
function closeSellLicenseModal() { document.getElementById('sellLicenseModal').classList.add('hidden'); }
function openMyChatModal() { document.getElementById('myChatModal').classList.remove('hidden'); }
function openCashMemoModal() { document.getElementById('cashMemoModal').classList.remove('hidden'); }

function openSettingsModal() { 
    document.getElementById('settingsCompId').innerText = GLOBAL_COMPANY_ID || '-';
    document.getElementById('settingsComposite').innerText = currentCompositeUserId || '-';
    document.getElementById('settingsCoupon').innerText = document.getElementById('userCouponCode').innerText;
    document.getElementById('settingsModal').classList.remove('hidden'); 
}

function toggleAccountsSection() { 
    const container = document.getElementById('accountsSectionContainer');
    const toggleText = document.getElementById('accountsToggleText');
    const toggleIcon = document.getElementById('accountsToggleIcon');
    
    container.classList.toggle('hidden');
    if(container.classList.contains('hidden')) {
        toggleText.innerText = 'Show Accounts';
        toggleIcon.className = 'fa-solid fa-chevron-down';
    } else {
        toggleText.innerText = 'Hide Accounts';
        toggleIcon.className = 'fa-solid fa-chevron-up';
    }
}

function toggleYear(id) { document.getElementById(id).classList.toggle('hidden'); }
function copyCouponCode() { showToast('Copied'); }
function handleSendMessage(e) { e.preventDefault(); showToast('Message sent'); }
function handleDashboardChatSend(e) { e.preventDefault(); showToast('Chat sent'); }
function handleModLogin(e) { e.preventDefault(); closeModLoginModal(); }
function handleAddDeviceSubmit(e) { e.preventDefault(); closeAddDeviceModal(); }
function handleAddBalanceSubmit(e) { e.preventDefault(); closeAddBalanceModal(); }
function addProductToMemoCart() {}
function saveAndPreviewA4Memo() {}
function calculateLotPrice() {}
function handleCashPayLot() {}
function handleThirdPartyPayment() {}

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('incomeDate')) document.getElementById('incomeDate').value = today;
    if(document.getElementById('loanDate')) document.getElementById('loanDate').value = today;
    if(document.getElementById('marketDate')) document.getElementById('marketDate').value = today;
});
