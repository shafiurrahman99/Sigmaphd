let GLOBAL_COMPANY_ID = "101";
let currentUserId = "admin";
let currentCompositeUserId = "101_admin";
let validityExpiryTime = new Date().getTime() + (30 * 24 * 60 * 60 * 1000);
let activeDevices = 1;

let accountsMasterRecords = [
    { id: 'acc_1', company_id: '101', user_id: 'top_boss', password: '123', composite_user_id: '101_top_boss', wallet_balance: 0.00, upline_id: null },
    { id: 'acc_2', company_id: '101', user_id: 'mid_leader', password: '123', composite_user_id: '101_mid_leader', wallet_balance: 0.00, upline_id: '101_top_boss' },
    { id: 'acc_3', company_id: '101', user_id: 'admin', password: '1234', composite_user_id: '101_admin', wallet_balance: 0.00, upline_id: '101_mid_leader' },
    { id: 'acc_4', company_id: '101', user_id: 'sub_user_01', password: '123', composite_user_id: '101_sub_user_01', wallet_balance: 0.00, upline_id: '101_admin', status: 'In_Stock', lot_id: 'LT-9042' }
];

let incomeExpenseRecords = [
    { entry_type: 'Income', entry_date: '2026-11-01', description: 'Initial Capital', amount: 50000, timestamp: Date.now() - 100000 }
];
let loanGivenRecords = [];
let loanTakenRecords = [];
let marketExpenses = [];
let memoCart = [{ desc: 'Software License Key', qty: 1, rate: 500, total: 500 }];

let activePrivatePartner = null;
let universalMessages = [
    { sender: 'top_boss', text: 'সবাইকে স্বাগতম! আমাদের নতুন লট এবং ড্যাশবোর্ড সিস্টেম এখন লাইভ।', time: '08:30 PM' },
    { sender: 'mid_leader', text: 'ধন্যবাদ! হিসাব-নিকাশ এবং ক্যাশ মেমো খুব সুন্দর কাজ করছে।', time: '08:35 PM' }
];
let privateMessagesMap = {
    'top_boss': [{ sender: 'top_boss', text: 'হ্যালো! তোমার লট স্টক কেমন চলছে?', time: '08:40 PM' }],
    'mid_leader': [{ sender: 'mid_leader', text: 'ভাই, নতুন আইডি সেলের কমিশন ঠিকমতো যোগ হচ্ছে।', time: '08:45 PM' }],
    'sub_user_01': [{ sender: 'sub_user_01', text: 'আসসালামু আলাইকুম, আমি নতুন একাউন্ট অ্যাক্টিভ করেছি।', time: '08:50 PM' }]
};

function showToast(text) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-text').innerText = text;
    toast.classList.remove('hidden');
    setTimeout(hideToast, 3500);
}

function hideToast() {
    document.getElementById('toast').classList.add('hidden');
}

function formatMoney(num) {
    return '৳ ' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Secure API Communication via Proxy
async function callBackendApi(action, payload) {
    try {
        const response = await fetch('api/root-proxy.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, composite_user_id: currentCompositeUserId, payload })
        });
        const result = await response.json();
        return result;
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, message: 'Network or server communication error.' };
    }
}

function handleMainSignIn(e) {
    e.preventDefault();
    const uid = document.getElementById('mainUserId').value.trim();
    const pass = document.getElementById('mainUserPassword').value.trim();
    const user = accountsMasterRecords.find(u => u.user_id === uid && u.password === pass);

    if (user) {
        currentUserId = user.user_id;
        currentCompositeUserId = user.composite_user_id;
        document.getElementById('currentLoggedInUser').innerText = currentUserId;
        document.getElementById('displayCompositeId').innerText = currentCompositeUserId;
        document.getElementById('userCouponCode').innerText = 'SIGMA-' + currentUserId.toUpperCase();
        document.getElementById('sellAutoCouponCode').innerText = 'SIGMA-' + currentUserId.toUpperCase();
        updateWalletDisplay();
        
        document.getElementById('page1').classList.add('hidden');
        document.getElementById('page2').classList.remove('hidden');
        
        renderAllDashboardTables();
        renderLotInventory();
        showToast('স্বাগতম ' + currentUserId + '! সফলভাবে লগইন হয়েছে।');
    } else {
        showToast('ভুল ইউজার আইডি অথবা পাসওয়ার্ড! (ডেমো: admin / 1234)');
    }
}

function handleLogOut() {
    document.getElementById('page2').classList.add('hidden');
    document.getElementById('page1').classList.remove('hidden');
    showToast('সফলভাবে লগআউট করা হয়েছে।');
}

function updateWalletDisplay() {
    const user = accountsMasterRecords.find(u => u.user_id === currentUserId);
    if (user) {
        document.getElementById('walletBalanceText').innerText = formatMoney(user.wallet_balance);
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
            const monthKey = m.date ? m.date.slice(0, 7) : '2026-11';
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

    await callBackendApi('save_income_expense', { type, date, desc, amount });
    incomeExpenseRecords.push({ entry_type: type, entry_date: date, description: desc, amount, timestamp: Date.now() });
    closeIncomeModal();
    renderAllDashboardTables();
    showToast(`${type} এন্ট্রি সফলভাবে সেভ হয়েছে!`);
}

function openLoanModal() { document.getElementById('loanModal').classList.remove('hidden'); }
function closeLoanModal() { document.getElementById('loanModal').classList.add('hidden'); }
async function handleLoanSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('loanType').value;
    const date = document.getElementById('loanDate').value;
    const person = document.getElementById('loanPersonName').value.trim();
    const amount = parseFloat(document.getElementById('loanAmount').value) || 0;
    const id = 'LN-' + Date.now();

    await callBackendApi('save_loan', { type, date, person, amount });
    if (type === 'Receivable') {
        loanGivenRecords.push({ id, date, person, amount, settled: false });
        incomeExpenseRecords.push({ entry_type: 'IncomeDeduction', entry_date: date, description: `Receivable Given: ${person}`, amount, timestamp: Date.now() });
        showToast('Receivable এন্ট্রি হয়েছে এবং ইনকাম থেকে মাইনাস করা হয়েছে।');
    } else {
        loanTakenRecords.push({ id, date, person, amount, settled: false });
        showToast('Payable রেকর্ড সেভ হয়েছে।');
    }
    closeLoanModal();
    renderAllDashboardTables();
}

function renderLoanTables() {
    let givenTotal = 0;
    const givenList = document.getElementById('loanGivenList');
    givenList.innerHTML = loanGivenRecords.length === 0 ? '<p class="text-[11px] text-slate-500">No Receivable records.</p>' : loanGivenRecords.map(l => {
        if (!l.settled) givenTotal += l.amount;
        return `
            <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                <div>
                    <span class="font-bold text-slate-200">${l.person}</span>
                    <span class="text-[10px] text-slate-400 block">${l.date} • ${l.settled ? '<span class="text-emerald-400">Settled</span>' : '<span class="text-amber-400">Pending</span>'}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-amber-400">${formatMoney(l.amount)}</span>
                    ${!l.settled ? `<button onclick="openSettleModal('${l.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('loanGivenTotalText').innerText = 'Total: ' + formatMoney(givenTotal);

    let takenTotal = 0;
    const takenList = document.getElementById('loanTakenList');
    takenList.innerHTML = loanTakenRecords.length === 0 ? '<p class="text-[11px] text-slate-500">No Payable records.</p>' : loanTakenRecords.map(l => {
        if (!l.settled) takenTotal += l.amount;
        return `
            <div class="flex items-center justify-between bg-[#131822] border border-slate-800 rounded-lg p-2 text-xs">
                <div>
                    <span class="font-bold text-slate-200">${l.person}</span>
                    <span class="text-[10px] text-slate-400 block">${l.date} • ${l.settled ? '<span class="text-emerald-400">Paid</span>' : '<span class="text-rose-400">Due</span>'}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-rose-400">${formatMoney(l.amount)}</span>
                    ${!l.settled ? `<button onclick="openSettleModal('${l.id}')" class="bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-1 rounded text-[10px]">Settle</button>` : ''}
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

    await callBackendApi('settle_loan', { id, date, extra });

    const given = loanGivenRecords.find(l => l.id === id);
    if (given && !given.settled) {
        given.settled = true;
        incomeExpenseRecords.push({ entry_type: 'Income', entry_date: date, description: `Receivable Settled: ${given.person}`, amount: given.amount, timestamp: Date.now() });
        showToast('Receivable সেটেল হয়েছে এবং ইনকামে যোগ হয়েছে!');
    }

    const taken = loanTakenRecords.find(l => l.id === id);
    if (taken && !taken.settled) {
        taken.settled = true;
        if (extra > 0) {
            incomeExpenseRecords.push({ entry_type: 'Expense', entry_date: date, description: `Payable Extra/Charge: ${taken.person}`, amount: extra, timestamp: Date.now() });
        }
        showToast('Payable লোন সেটেল করা হয়েছে!');
    }

    closeSettleModal();
    renderAllDashboardTables();
}

function openMarketModal() { document.getElementById('marketModal').classList.remove('hidden'); }
function closeMarketModal() { document.getElementById('marketModal').classList.add('hidden'); }
async function handleMarketSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('marketDate').value;
    const desc = document.getElementById('marketDesc').value.trim();
    const amount = parseFloat(document.getElementById('marketAmount').value) || 0;
    const status = document.getElementById('marketStatus').value;

    await callBackendApi('save_market_expense', { date, desc, amount, status });
    marketExpenses.push({ id: 'EXP-' + Date.now(), date, desc, amount, status });
    closeMarketModal();
    renderAllDashboardTables();
    showToast('দৈনিক খরচ যুক্ত হয়েছে!');
}

function toggleMarketStatus(id) {
    const item = marketExpenses.find(m => m.id === id);
    if (item) {
        item.status = item.status === 'Paid' ? 'Due' : 'Paid';
        renderAllDashboardTables();
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
            <td class="py-2 px-2 font-mono text-[11px]">${m.date}</td>
            <td class="py-2 px-2">${m.desc}</td>
            <td class="py-2 px-2 font-mono text-rose-400 font-bold">${formatMoney(m.amount)}</td>
            <td class="py-2 px-2 text-right">
                <button onclick="toggleMarketStatus('${m.id}')" class="${m.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border-emerald-700/50' : 'bg-amber-950 text-amber-400 border-amber-700/50'} border px-2 py-0.5 rounded text-[10px] font-bold">
                    ${m.status}
                </button>
            </td>
        </tr>
    `).join('');
}

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
    
    await callBackendApi('buy_lot', { lotNo, qty });

    for (let i = 1; i <= qty; i++) {
        const subId = `sub_${lotNo.toLowerCase().replace('-', '')}_${String(i).padStart(2, '0')}`;
        accountsMasterRecords.push({
            id: 'acc_' + Date.now() + '_' + i,
            company_id: GLOBAL_COMPANY_ID,
            user_id: subId,
            password: 'pass' + Math.floor(1000 + Math.random() * 9000),
            composite_user_id: `${GLOBAL_COMPANY_ID}_${subId}`,
            wallet_balance: 0.00,
            upline_id: currentCompositeUserId,
            status: 'In_Stock',
            lot_id: lotNo
        });
    }
    closeBuyLotModal();
    renderLotInventory();
    showToast(`${lotNo} লটের ${qty}টি আইডি ইনভেন্টরিতে যুক্ত হয়েছে!`);
}

function renderLotInventory() {
    const inStockItems = accountsMasterRecords.filter(a => a.status === 'In_Stock');
    document.getElementById('availableLotIdsCount').innerText = inStockItems.length;
    const activeSubs = accountsMasterRecords.filter(a => a.upline_id === currentCompositeUserId && a.status !== 'In_Stock');
    document.getElementById('subUserCount').innerText = activeSubs.length || 1;

    const listEl = document.getElementById('lotInventorySummaryList');
    const selectEl = document.getElementById('sellLotIdSelect');

    if (inStockItems.length === 0) {
        listEl.innerHTML = '<p class="text-slate-500">No In_Stock IDs available.</p>';
        selectEl.innerHTML = '<option value="">No Stock Available</option>';
    } else {
        listEl.innerHTML = inStockItems.map(item => `
            <div class="flex justify-between items-center bg-[#131822] px-2 py-1 rounded border border-slate-800">
                <span class="text-amber-400 font-mono">${item.lot_id} • ${item.user_id}</span>
                <span class="text-emerald-400 font-bold">In_Stock</span>
            </div>
        `).join('');

        selectEl.innerHTML = inStockItems.map(item => `
            <option value="${item.id}">${item.lot_id} - ${item.user_id} (In_Stock)</option>
        `).join('');
        populateSelectedLotCredentials();
    }
}

function populateSelectedLotCredentials() {
    const selectedId = document.getElementById('sellLotIdSelect').value;
    const item = accountsMasterRecords.find(a => a.id === selectedId);
    if (item) {
        document.getElementById('sellAssignedUserId').value = item.user_id;
        document.getElementById('sellAssignedPassword').value = item.password;
    }
}

function openSellLicenseModal() {
    renderLotInventory();
    document.getElementById('sellLotIdSelect').onchange = populateSelectedLotCredentials;
    document.getElementById('sellLicenseModal').classList.remove('hidden');
}
function closeSellLicenseModal() { document.getElementById('sellLicenseModal').classList.add('hidden'); }

async function handleSellNewIdSubmit(e) {
    e.preventDefault();
    const selectedId = document.getElementById('sellLotIdSelect').value;
    const item = accountsMasterRecords.find(a => a.id === selectedId);
    if (!item) {
        showToast('বিক্রি করার জন্য কোনো ইন-স্টক আইডি নেই!');
        return;
    }

    await callBackendApi('process_id_sale_cashback', { seller_composite_id: currentCompositeUserId, sold_item_id: item.id });

    item.status = 'Active';
    const seller = accountsMasterRecords.find(u => u.user_id === currentUserId);
    if (seller) {
        seller.wallet_balance += 8.00;
    }
    updateWalletDisplay();
    renderLotInventory();
    closeSellLicenseModal();
    showToast(`আইডি (${item.user_id}) বিক্রি সম্পন্ন! ওয়ালেটে +৳ 8.00 যোগ হয়েছে।`);
}

function openBuyValidityModal() { document.getElementById('buyValidityModal').classList.remove('hidden'); }
function closeBuyValidityModal() { document.getElementById('buyValidityModal').classList.add('hidden'); }
async function handleBuyValiditySubmit(e) {
    e.preventDefault();
    const trxId = document.getElementById('validityTrxId').value;
    await callBackendApi('buy_validity', { trxId });
    validityExpiryTime += (30 * 24 * 60 * 60 * 1000);
    closeBuyValidityModal();
    showToast('মেয়াদ সফলভাবে আরও ৩০ দিন বাড়ানো হয়েছে!');
}

function openBalanceTransferModal() { document.getElementById('balanceTransferModal').classList.remove('hidden'); }
function closeBalanceTransferModal() { document.getElementById('balanceTransferModal').classList.add('hidden'); }
async function handleBalanceTransferSubmit(e) {
    e.preventDefault();
    const recipient = document.getElementById('transferRecipientId').value;
    const amount = parseFloat(document.getElementById('transferAmount').value) || 0;

    await callBackendApi('balance_transfer', { recipient, amount });

    const seller = accountsMasterRecords.find(u => u.user_id === currentUserId);
    if (seller && seller.wallet_balance >= amount) {
        seller.wallet_balance -= amount;
        updateWalletDisplay();
        closeBalanceTransferModal();
        showToast('ব্যালেন্স ট্রান্সফার সফল হয়েছে!');
    } else {
        showToast('পর্যাপ্ত ব্যালেন্স নেই!');
    }
}

function openBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.remove('hidden'); }
function closeBuyLicenseLandingModal() { document.getElementById('buyLicenseLandingModal').classList.add('hidden'); }
async function handleLandingBuySubmit(e) {
    e.preventDefault();
    closeBuyLicenseLandingModal();
    showToast('নতুন আইডির আবেদন ও পেমেন্ট রিকোয়েস্ট জমা হয়েছে!');
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

function openMyChatModal() {
    exitIndividualChat();
    renderChatUsersList();
    renderUniversalMessages();
    document.getElementById('myChatModal').classList.remove('hidden');
}

function renderChatUsersList() {
    const container = document.getElementById('chatUsersListContainer');
    const otherUsers = accountsMasterRecords.filter(u => u.user_id !== currentUserId);
    container.innerHTML = otherUsers.map(u => `
        <button type="button" onclick="openIndividualChat('${u.user_id}')" 
            class="shrink-0 bg-[#131822] hover:bg-indigo-950/60 border border-slate-700 hover:border-indigo-500/60 rounded-xl px-3 py-1.5 flex items-center space-x-1.5 transition-all">
            <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
            <span class="text-xs font-bold text-slate-200">${u.user_id}</span>
        </button>
    `).join('');
}

function renderUniversalMessages() {
    const box = document.getElementById('universalChatBox');
    box.innerHTML = universalMessages.map(m => {
        const isMe = m.sender === currentUserId;
        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You (' + m.sender + ')' : m.sender} • ${m.time}</span>
                <div class="${isMe ? 'bg-emerald-600 text-slate-950 font-semibold' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">
                    ${m.text}
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

    await callBackendApi('send_chat', { channel: 'Public_Forum', text });

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    universalMessages.push({ sender: currentUserId, text, time: now });
    input.value = '';
    renderUniversalMessages();
}

function openIndividualChat(partnerId) {
    activePrivatePartner = partnerId;
    if (!privateMessagesMap[partnerId]) privateMessagesMap[partnerId] = [];
    
    document.getElementById('universalChatView').classList.add('hidden');
    document.getElementById('individualChatView').classList.remove('hidden');
    document.getElementById('chatBackBtn').classList.remove('hidden');
    document.getElementById('chatModalTitle').innerHTML = `<i class="fa-solid fa-user-lock text-indigo-400"></i><span>${partnerId}</span>`;
    document.getElementById('activeChatPartnerName').innerText = partnerId;
    
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
    if (msgs.length === 0) {
        box.innerHTML = `<p class="text-center text-slate-500 py-6">Start a private conversation with ${activePrivatePartner}...</p>`;
        return;
    }
    box.innerHTML = msgs.map(m => {
        const isMe = m.sender === currentUserId;
        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <span class="text-[10px] text-slate-400 mb-0.5 font-semibold">${isMe ? 'You' : m.sender} • ${m.time}</span>
                <div class="${isMe ? 'bg-indigo-600 text-white font-medium' : 'bg-[#131822] text-slate-200 border border-slate-800'} px-3 py-2 rounded-2xl max-w-[82%] break-words">
                    ${m.text}
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

    await callBackendApi('send_chat', { channel: 'DM_' + currentUserId + '_' + activePrivatePartner, text });

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    privateMessagesMap[activePrivatePartner].push({ sender: currentUserId, text, time: now });
    input.value = '';
    renderIndividualMessages();
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
    showToast('বিজনেস সেটআপ সফলভাবে লক করা হয়েছে!');
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
    showToast('ক্যাশ মেমো সফলভাবে মাই ডিভাইসে সেভ হয়েছে!');
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

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('incomeDate')) document.getElementById('incomeDate').value = today;
    if(document.getElementById('loanDate')) document.getElementById('loanDate').value = today;
    if(document.getElementById('marketDate')) document.getElementById('marketDate').value = today;
    if(document.getElementById('settleDate')) document.getElementById('settleDate').value = today;
    startValidityCountdown();
    renderMemoCart();
});
