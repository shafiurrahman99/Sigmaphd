import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RATE_PER_MONTH = 100; // ১ মাস (৩০ দিন) = ৳১০০

// ১. ডাটাবেজ থেকে অ্যাক্টিভ ডিসকাউন্ট পার্সেন্টেজ আনা
async function loadDiscountsFromDb(supabase) {
    const { data, error } = await supabase
        .from('validity_discounts')
        .select('months, discount_pct')
        .eq('is_active', true);

    if (error) throw error;

    const map = {};
    for (const row of data || []) {
        map[Number(row.months)] = Number(row.discount_pct || 0);
    }
    return map;
}

// ২. সার্ভারে কার্টের পূর্ণ হিসাবের ফর্মুলা
function calculateValidityCart(cartItems = [], discountsMap = {}, useCouponWallet = false, walletBalance = 0) {
    let totalDays = 0;
    let baseTotal = 0;
    let discountTotal = 0;

    const breakdown = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
        const months = Math.max(1, parseInt(item.months, 10) || 1);
        const qty = Math.max(1, parseInt(item.qty, 10) || 1);
        const days = months * 30 * qty;

        const discountPct = Number(discountsMap[months] ?? 0);
        const itemBase = months * RATE_PER_MONTH * qty;
        const itemDiscount = (itemBase * discountPct) / 100;
        const itemSubtotal = Math.max(0, itemBase - itemDiscount);

        totalDays += days;
        baseTotal += itemBase;
        discountTotal += itemDiscount;

        return {
            months,
            qty,
            days,
            discountPct,
            baseAmount: Number(itemBase.toFixed(2)),
            discountAmount: Number(itemDiscount.toFixed(2)),
            subtotal: Number(itemSubtotal.toFixed(2)),
        };
    });

    const subtotal = Math.max(0, Number((baseTotal - discountTotal).toFixed(2)));
    const walletDeducted = useCouponWallet
        ? Math.min(Math.max(0, Number(walletBalance || 0)), subtotal)
        : 0;
    const payableAmount = Math.max(0, Number((subtotal - walletDeducted).toFixed(2)));

    return {
        items: breakdown,
        totalDays,
        baseTotal: Number(baseTotal.toFixed(2)),
        discountTotal: Number(discountTotal.toFixed(2)),
        subtotal,
        walletDeducted: Number(walletDeducted.toFixed(2)),
        payableAmount,
    };
}

// ৩. ইউজারের লেটেস্ট অ্যাকাউন্ট রো লোড করা
async function getTargetAccount(supabase, compositeUserId, fallbackCompanyId) {
    if (!compositeUserId) return null;

    const { data, error } = await supabase
        .from('accounts_master')
        .select('*')
        .eq('composite_user_id', compositeUserId)
        .single();

    if (error || !data) return null;
    if (fallbackCompanyId && String(data.company_id) !== String(fallbackCompanyId)) {
        return data;
    }
    return data;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
    }

    try {
        const { action, company_id = "101", composite_user_id, payload } = req.body;

        // লগইন ছাড়াই যে রিকোয়েস্টগুলো পাস হবে
        const publicActions = [
            'authenticate_user',
            'fetch_dashboard_data',
            'buy_lot',
            'buy_validity',
            'preview_validity_cart',
            'register_new_license'
        ];

        if (!composite_user_id && !publicActions.includes(action)) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Missing Composite User ID context.' });
        }

        console.log(`[SECURE PROXY] Action: ${action} | User: ${composite_user_id || 'Public/System'}`);

        switch (action) {
            case 'authenticate_user': {
                const { user_name, password } = payload || {};

                if (!user_name || !password) {
                    return res.status(200).json({ success: false, message: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই প্রদান করুন।' });
                }

                const cleanUserName = String(user_name).trim();
                const cleanPassword = String(password).trim();

                // সুপাবেজ থেকে সরাসরি user_name এবং password দিয়ে ভেরিফাই করা
                const { data, error } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_name', cleanUserName)
                    .eq('password', cleanPassword)
                    .single();

                if (error || !data) {
                    console.log(`[LOGIN FAILED] User Name: ${cleanUserName} | Error:`, error?.message);
                    return res.status(200).json({ success: false, message: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!' });
                }

                if (data.status === 'Pending') {
                    return res.status(200).json({ success: false, message: 'আপনার অ্যাকাউন্টটি এখনো পেন্ডিং রয়েছে।' });
                }

                return res.status(200).json({ success: true, user: data });
            }

            case 'fetch_dashboard_data': {
                const [incExp, loansRec, loansPay, marketExp, accounts, chats] = await Promise.all([
                    supabaseServer.from('income_expense').select('*').eq('composite_user_id', composite_user_id).order('entry_date', { ascending: false }),
                    supabaseServer.from('loan_records').select('*').eq('composite_user_id', composite_user_id).eq('loan_category', 'Receivable'),
                    supabaseServer.from('loan_records').select('*').eq('composite_user_id', composite_user_id).eq('loan_category', 'Payable'),
                    supabaseServer.from('daily_expenses').select('*').eq('composite_user_id', composite_user_id).order('expense_date', { ascending: false }),
                    supabaseServer.from('accounts_master').select('*').eq('company_id', company_id),
                    supabaseServer.from('forum_chat').select('*').eq('company_id', company_id).eq('chat_channel', 'Public_Forum').order('created_at', { ascending: true })
                ]);

                return res.status(200).json({
                    success: true,
                    income_expenses: incExp.data || [],
                    loans_receivable: loansRec.data || [],
                    loans_payable: loansPay.data || [],
                    daily_expenses: marketExp.data || [],
                    accounts: accounts.data || [],
                    public_chats: chats.data || []
                });
            }

            case 'user_password_change': {
                const { new_username, old_password, new_password, user_id } = payload || {};
                const targetKey = composite_user_id || user_id;

                if (!targetKey) {
                    return res.status(200).json({ success: false, message: 'ইউজার আইডেন্টিফায়ার পাওয়া যায়নি।' });
                }

                const { data: userRecord, error: fetchErr } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('composite_user_id', targetKey)
                    .single();

                if (fetchErr || !userRecord) {
                    return res.status(200).json({ success: false, message: 'ডাটাবেজে ইউজার অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                if (userRecord.password !== old_password) {
                    return res.status(200).json({ success: false, message: 'পুরাতন পাসওয়ার্ডটি ভুল দিয়েছেন!' });
                }

                const updatedUserName = new_username ? new_username.trim() : userRecord.user_name;

                const { error: updateErr } = await supabaseServer
                    .from('accounts_master')
                    .update({
                        user_name: updatedUserName,
                        password: new_password
                    })
                    .eq('composite_user_id', userRecord.composite_user_id);

                if (updateErr) throw updateErr;

                const buyerEmail = userRecord.buyer_email || 'N/A';

                return res.status(200).json({
                    success: true,
                    message: `সফলভাবে ইউজারনেম ও পাসওয়ার্ড আপডেট হয়েছে! ${buyerEmail} ঠিকানায় নোটিফিকেশন পাঠানো হয়েছে।`
                });
            }

            case 'save_income_expense': {
                const { type, date, desc, amount } = payload;
                const { error } = await supabaseServer.from('income_expense').insert([{
                    company_id: company_id || composite_user_id?.split('_')[0],
                    user_id: composite_user_id?.split('_')[1],
                    composite_user_id,
                    entry_type: type,
                    entry_date: date,
                    description: desc,
                    amount
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Income/Expense recorded securely.' });
            }

            case 'save_loan': {
                const { category, date, person_name, amount } = payload;
                const { error } = await supabaseServer.from('loan_records').insert([{
                    company_id: composite_user_id?.split('_')[0],
                    user_id: composite_user_id?.split('_')[1],
                    composite_user_id,
                    loan_category: category,
                    entry_date: date,
                    person_name,
                    amount,
                    status: 'Due'
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Loan record synchronized.' });
            }

            case 'settle_loan': {
                const { id, settle_date, extra_amount } = payload;
                const { error } = await supabaseServer.from('loan_records')
                    .update({ status: 'Paid', settle_date, extra_amount })
                    .eq('id', id);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Loan settlement processed.' });
            }

            case 'save_market_expense': {
                const { expense_date, description, amount, status } = payload;
                const { error } = await supabaseServer.from('daily_expenses').insert([{
                    company_id: composite_user_id?.split('_')[0],
                    user_id: composite_user_id?.split('_')[1],
                    composite_user_id,
                    expense_date,
                    description,
                    amount,
                    status
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Daily market expense logged.' });
            }

            case 'buy_lot': {
                const { lot_id, quantity } = payload;
                const compId = composite_user_id ? composite_user_id.split('_')[0] : company_id;
                const ownerId = composite_user_id || (compId + '_admin');
                const rowsToInsert = [];

                for (let i = 1; i <= quantity; i++) {
                    const subId = `sub_${lot_id.toLowerCase().replace(/-/g, '')}_${String(i).padStart(2, '0')}`;
                    rowsToInsert.push({
                        company_id: compId,
                        user_id: subId,
                        user_name: 'user_' + Math.floor(1000 + Math.random() * 9000),
                        password: 'pass' + Math.floor(1000 + Math.random() * 9000),
                        role: 'User',
                        status: 'In_Stock',
                        request_type: 'Lot',
                        lot_id,
                        owner_id: ownerId,
                        upline_id: ownerId,
                        wallet_balance: 0.00
                    });
                }

                const { error } = await supabaseServer.from('accounts_master').insert(rowsToInsert);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Lot purchased successfully.' });
            }

            case 'process_id_sale_cashback': {
                const { seller_composite_id, sold_item_id, buyer_name, buyer_mobile, buyer_email, coupon_code } = payload;

                const { error: updateError } = await supabaseServer.from('accounts_master').update({
                    status: 'Active',
                    buyer_name,
                    buyer_mobile,
                    buyer_email,
                    coupon_code
                }).eq('id', sold_item_id);

                if (updateError) throw updateError;

                const { data: sellerData } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, upline_id, composite_user_id')
                    .eq('composite_user_id', seller_composite_id)
                    .single();

                let directBonus = 8.00;
                let chainPoolTotal = 2.00;
                let totalSellerNewBalance = (sellerData?.wallet_balance || 0) + directBonus;

                let uplinesChain = [];
                let currentUplineId = sellerData?.upline_id;

                while (currentUplineId && currentUplineId !== seller_composite_id) {
                    const { data: upData } = await supabaseServer
                        .from('accounts_master')
                        .select('composite_user_id, wallet_balance, upline_id')
                        .eq('composite_user_id', currentUplineId)
                        .single();

                    if (!upData) break;
                    uplinesChain.push(upData);
                    currentUplineId = upData.upline_id;
                    if (uplinesChain.length > 1000) break;
                }

                let N = uplinesChain.length;

                if (N === 0) {
                    totalSellerNewBalance += chainPoolTotal;
                } else {
                    let totalWeight = (N * (N + 1)) / 2;

                    for (let i = 0; i < N; i++) {
                        let currentWeight = N - i;
                        let shareAmount = (chainPoolTotal * currentWeight) / totalWeight;

                        let targetCompositeId = uplinesChain[i].composite_user_id;
                        let targetOldBalance = uplinesChain[i].wallet_balance || 0;

                        await supabaseServer.from('accounts_master')
                            .update({ wallet_balance: targetOldBalance + shareAmount })
                            .eq('composite_user_id', targetCompositeId);
                    }
                }

                await supabaseServer.from('accounts_master')
                    .update({ wallet_balance: totalSellerNewBalance })
                    .eq('composite_user_id', seller_composite_id);

                return res.status(200).json({
                    success: true,
                    message: 'Proportional chain distribution and direct bonus applied successfully.'
                });
            }

            case 'register_new_license': {
                const { name, mobile, email } = payload;
                const compId = company_id || "101";
                const randomUserName = 'user_' + Math.floor(1000 + Math.random() * 9000);
                const defaultAdminCompositeId = compId + '_admin';

                const { error } = await supabaseServer.from('accounts_master').insert([{
                    company_id: compId,
                    user_id: 'user_' + Math.floor(1000 + Math.random() * 9000),
                    user_name: randomUserName,
                    password: 'pass' + Math.floor(1000 + Math.random() * 9000),
                    role: 'User',
                    status: 'Pending',
                    request_type: 'Single',
                    owner_id: defaultAdminCompositeId,
                    upline_id: defaultAdminCompositeId,
                    buyer_name: name,
                    buyer_mobile: mobile,
                    buyer_email: email,
                    wallet_balance: 0.00
                }]);

                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Single license request registered with admin ownership.' });
            }

            case 'preview_validity_cart': {
                const targetCompositeId = composite_user_id || payload?.composite_user_id;
                const accountRow = await getTargetAccount(supabaseServer, targetCompositeId, company_id);

                if (!accountRow) {
                    return res.status(200).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                const discountsMap = await loadDiscountsFromDb(supabaseServer);
                const summary = calculateValidityCart(
                    payload?.items || [],
                    discountsMap,
                    Boolean(payload?.use_coupon_wallet),
                    accountRow.wallet_balance
                );

                return res.status(200).json({
                    success: true,
                    summary: {
                        ...summary,
                        pendingDays: Number(accountRow.pending_validity_days || 0),
                        approvalStatus: accountRow.validity_approval_status || 'NONE',
                    }
                });
            }

            case 'buy_validity': {
                const targetCompositeId = composite_user_id || payload?.composite_user_id;
                const accountRow = await getTargetAccount(supabaseServer, targetCompositeId, company_id);

                if (!accountRow) {
                    return res.status(200).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                const trxId = String(payload?.trx_id || '').trim();
                if (!trxId) {
                    return res.status(200).json({ success: false, message: 'Transaction ID প্রদান করুন।' });
                }

                const discountsMap = await loadDiscountsFromDb(supabaseServer);
                const useCouponWallet = Boolean(payload?.use_coupon_wallet);
                const calc = calculateValidityCart(
                    payload?.items || [],
                    discountsMap,
                    useCouponWallet,
                    accountRow.wallet_balance
                );

                if (calc.totalDays <= 0) {
                    return res.status(200).json({ success: false, message: 'কার্টে অন্তত একটি প্ল্যান যোগ করুন।' });
                }

                const { data: reqRow, error: reqErr } = await supabaseServer
                    .from('validity_extension_requests')
                    .insert({
                        account_id: accountRow.id,
                        company_id: accountRow.company_id ?? null,
                        user_id: accountRow.user_id ?? null,
                        composite_user_id: accountRow.composite_user_id ?? null,
                        days_requested: calc.totalDays,
                        base_total: calc.baseTotal,
                        discount_total: calc.discountTotal,
                        subtotal: calc.subtotal,
                        wallet_deducted: calc.walletDeducted,
                        payable_amount: calc.payableAmount,
                        use_coupon_wallet: useCouponWallet,
                        trx_id: trxId,
                        payment_method: 'Cash Pay',
                        status: 'Admin Approval',
                    })
                    .select()
                    .single();

                if (reqErr) throw reqErr;

                const nextPendingDays = Number(accountRow.pending_validity_days || 0) + calc.totalDays;

                const { error: accErr } = await supabaseServer
                    .from('accounts_master')
                    .update({
                        pending_validity_days: nextPendingDays,
                        validity_approval_status: 'Admin Approval',
                    })
                    .eq('id', accountRow.id);

                if (accErr) throw accErr;

                return res.status(200).json({
                    success: true,
                    message: `Cash Pay রিকোয়েস্ট (${calc.totalDays} দিন) জমা হয়েছে—Admin Approval পেন্ডিং।`,
                    request: reqRow,
                    summary: {
                        ...calc,
                        pendingDays: nextPendingDays,
                        approvalStatus: 'Admin Approval',
                    }
                });
            }

            case 'approve_validity_request': {
                const requestId = Number(payload?.request_id);
                if (!requestId) {
                    return res.status(200).json({ success: false, message: 'Request ID প্রয়োজন।' });
                }

                const { data, error } = await supabaseServer.rpc('approve_validity_extension', {
                    p_request_id: requestId,
                });

                if (error) throw error;

                return res.status(200).json({
                    success: true,
                    message: 'Validity approved and extended successfully.',
                    approved: Array.isArray(data) ? data[0] : data,
                });
            }

            case 'balance_transfer': {
                const { recipient_id, amount } = payload;
                const transferAmount = parseFloat(amount) || 0;

                if (transferAmount <= 0) {
                    return res.status(200).json({ success: false, message: 'সঠিক পরিমাণ অ্যামাউন্ট প্রদান করুন।' });
                }

                const { data: senderData, error: senderErr } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, composite_user_id')
                    .eq('composite_user_id', composite_user_id)
                    .single();

                if (senderErr || !senderData) {
                    return res.status(200).json({ success: false, message: 'প্রেরকের তথ্য পাওয়া যায়নি।' });
                }

                const currentSenderBalance = parseFloat(senderData.wallet_balance || 0);

                if (currentSenderBalance < transferAmount) {
                    return res.status(200).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
                }

                const { data: recipientData, error: recErr } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, composite_user_id, user_name, user_id')
                    .or(`user_name.eq.${recipient_id},user_id.eq.${recipient_id},composite_user_id.eq.${recipient_id}`)
                    .single();

                if (recErr || !recipientData) {
                    return res.status(200).json({ success: false, message: 'প্রাপক ইউজারনেম সঠিক নয় বা পাওয়া যায়নি।' });
                }

                const currentRecipientBalance = parseFloat(recipientData.wallet_balance || 0);

                const { error: updateSenderErr } = await supabaseServer
                    .from('accounts_master')
                    .update({ wallet_balance: currentSenderBalance - transferAmount })
                    .eq('composite_user_id', composite_user_id);

                if (updateSenderErr) throw updateSenderErr;

                const { error: updateRecipientErr } = await supabaseServer
                    .from('accounts_master')
                    .update({ wallet_balance: currentRecipientBalance + transferAmount })
                    .eq('composite_user_id', recipientData.composite_user_id);

                if (updateRecipientErr) throw updateRecipientErr;

                return res.status(200).json({
                    success: true,
                    message: 'সফলভাবে ব্যালেন্স ট্রান্সফার সম্পন্ন হয়েছে!'
                });
            }

            case 'send_chat': {
                const { channel, message } = payload;
                const { error } = await supabaseServer.from('forum_chat').insert([{
                    company_id: composite_user_id?.split('_')[0],
                    user_id: composite_user_id?.split('_')[1],
                    composite_user_id,
                    sender_role: 'User',
                    chat_channel: channel,
                    message
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Message dispatched.' });
            }

            default:
                return res.status(400).json({ success: false, message: 'Invalid action command specified.' });
        }

    } catch (error) {
        console.error('[PROXY ERROR]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Internal server proxy error.' });
    }
}
