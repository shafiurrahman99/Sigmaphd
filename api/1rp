import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseServer = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RATE_PER_MONTH = 100; // 1 month (30 days) = ৳100
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_THIS_IN_ENV';

function signSessionToken(payloadObj) {
    const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [data, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
}

function normalizeLoanStatus(rawStatus, settledDate = null) {
    const clean = String(rawStatus ?? '').trim().toLowerCase();
    if (clean === 'paid' || clean === 'settled' || clean === 'completed') return 'Paid';
    if (clean === 'due received' || clean === 'received') return 'Due Received';
    if (settledDate && String(settledDate).trim() !== '' && clean !== 'due') return 'Paid';
    return 'Due';
}

function getValidityExpiryMs(accountRow = {}) {
    if (accountRow.validity_expires_at) {
        const ts = new Date(accountRow.validity_expires_at).getTime();
        if (!Number.isNaN(ts)) return ts;
    }
    if (accountRow.activated_at) {
        const baseTs = new Date(accountRow.activated_at).getTime();
        const days = Number(accountRow.validity_days) || 0;
        if (!Number.isNaN(baseTs) && days > 0) {
            return baseTs + days * 24 * 60 * 60 * 1000;
        }
    }
    return 0;
}

async function loadDiscountsMap() {
    const { data, error } = await supabaseServer
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

function calculateValidityCart(cartItems = [], discountsMap = {}, useCouponWallet = false, walletBalance = 0) {
    let totalDays = 0;
    let baseTotal = 0;
    let discountTotal = 0;

    const items = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
        const months = Math.max(1, parseInt(item.months, 10) || 1);
        const qty = Math.max(1, parseInt(item.qty, 10) || 1);
        const days = months * 30 * qty;
        const discountPct = Number(discountsMap[months] ?? 0);
        const itemBase = months * RATE_PER_MONTH * qty;
        const itemDiscount = (itemBase * discountPct) / 100;
        const subtotal = Math.max(0, itemBase - itemDiscount);

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
            subtotal: Number(subtotal.toFixed(2))
        };
    });

    const subtotal = Math.max(0, Number((baseTotal - discountTotal).toFixed(2)));
    const walletDeducted = useCouponWallet
        ? Math.min(Math.max(0, Number(walletBalance || 0)), subtotal)
        : 0;
    const payableAmount = Math.max(0, Number((subtotal - walletDeducted).toFixed(2)));

    return {
        items,
        totalDays,
        baseTotal: Number(baseTotal.toFixed(2)),
        discountTotal: Number(discountTotal.toFixed(2)),
        subtotal,
        walletDeducted: Number(walletDeducted.toFixed(2)),
        payableAmount
    };
}

function extractDeleteIds(body, payload) {
    const raw =
        (Array.isArray(body?.ids) && body.ids) ||
        (Array.isArray(payload?.ids) && payload.ids) ||
        (body?.id !== undefined && body?.id !== null ? [body.id] : null) ||
        (payload?.id !== undefined && payload?.id !== null ? [payload.id] : null) ||
        [];

    return raw
        .map((v) => (typeof v === 'object' && v !== null ? (v.id ?? v.row_id ?? v.entry_id) : v))
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
}

async function getAuthorizedAccount(req, parsedBody, payload, allowExpired = false) {
    const authHeader = req.headers?.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = parsedBody?.session_token || payload?.session_token || bearerToken;
    const session = verifySessionToken(token);

    const targetId = session?.composite_user_id || parsedBody?.composite_user_id || payload?.composite_user_id;
    if (!targetId) return { error: 'Unauthorized: Missing session or user context.' };

    const { data: account, error } = await supabaseServer
        .from('accounts_master')
        .select('*')
        .eq('composite_user_id', targetId)
        .single();

    if (error || !account) return { error: 'Account not found.' };
    if (account.status === 'Pending') return { error: 'Account is pending approval.' };

    const expiryMs = getValidityExpiryMs(account);
    const isExpired = !expiryMs || Date.now() >= expiryMs;
    if (isExpired && !allowExpired) {
        return { error: 'Validity expired. Please extend validity.', expired: true, account };
    }

    return { account, isExpired };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { action, company_id = '101', payload = {} } = body;

        const publicActions = ['authenticate_user', 'register_new_license'];
        const validityAllowedActions = ['preview_validity_cart', 'buy_validity'];

        let authCtx = null;
        if (!publicActions.includes(action)) {
            authCtx = await getAuthorizedAccount(req, body, payload, validityAllowedActions.includes(action));
            if (authCtx.error) {
                return res.status(401).json({
                    success: false,
                    message: authCtx.message || authCtx.error,
                    expired: Boolean(authCtx.expired)
                });
            }
        }

        const actor = authCtx?.account;
        const compUserId = actor?.composite_user_id;

        switch (action) {
            case 'authenticate_user': {
                const userName = String(payload.user_name || '').trim();
                const password = String(payload.password || '').trim();
                if (!userName || !password) {
                    return res.status(200).json({ success: false, message: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই দিন।' });
                }

                const { data, error } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_name', userName)
                    .eq('password', password)
                    .single();

                if (error || !data) {
                    return res.status(200).json({ success: false, message: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড!' });
                }
                if (data.status === 'Pending') {
                    return res.status(200).json({ success: false, message: 'আপনার অ্যাকাউন্টটি এখনো পেন্ডিং রয়েছে।' });
                }

                const expiryMs = getValidityExpiryMs(data);
                const isExpired = !expiryMs || Date.now() >= expiryMs;
                const sessionToken = signSessionToken({
                    composite_user_id: data.composite_user_id,
                    company_id: data.company_id,
                    role: data.role || 'User',
                    exp: Date.now() + 24 * 60 * 60 * 1000
                });

                const { password: _omit, ...safeUser } = data;
                return res.status(200).json({
                    success: true,
                    session_token: sessionToken,
                    user: {
                        ...safeUser,
                        is_validity_expired: isExpired,
                        pending_validity_days: Number(data.pending_validity_days || 0),
                        validity_approval_status: data.validity_approval_status || 'NONE'
                    }
                });
            }

            case 'fetch_dashboard_data': {
                const [incExp, loansRec, loansPay, marketExp, accounts, chats] = await Promise.all([
                    supabaseServer.from('income_expense').select('*').eq('composite_user_id', compUserId)
                        .order('income_expense_date', { ascending: false }).order('created_at', { ascending: false }),
                    supabaseServer.from('loan_records').select('*').eq('composite_user_id', compUserId)
                        .eq('loan_records_direction', 'receivable').order('loan_records_entry_date', { ascending: false }),
                    supabaseServer.from('loan_records').select('*').eq('composite_user_id', compUserId)
                        .eq('loan_records_direction', 'payable').order('loan_records_entry_date', { ascending: false }),
                    supabaseServer.from('income_expense').select('*').eq('composite_user_id', compUserId)
                        .eq('income_expense_type', 'expense').order('income_expense_date', { ascending: false }).order('created_at', { ascending: false }),
                    supabaseServer.from('accounts_master')
                        .select('id, company_id, user_id, user_name, composite_user_id, role, status, lot_id, owner_id, upline_id, wallet_balance, validity_expires_at, activated_at, validity_days, pending_validity_days, validity_approval_status')
                        .eq('company_id', actor.company_id || company_id),
                    supabaseServer.from('forum_chat').select('*')
                        .eq('company_id', actor.company_id || company_id).eq('chat_channel', 'Public_Forum').order('created_at', { ascending: true })
                ]);

                const norm = (rows) => (rows || []).map((r) => ({
                    ...r,
                    loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                }));

                return res.status(200).json({
                    success: true,
                    income_expenses: incExp.data || [],
                    loans_receivable: norm(loansRec.data),
                    loans_payable: norm(loansPay.data),
                    daily_expenses: marketExp.data || [],
                    accounts: accounts.data || [],
                    public_chats: chats.data || []
                });
            }

            case 'user_password_change': {
                const oldPass = String(payload.old_password || '');
                const newPass = String(payload.new_password || '');
                const newUserName = String(payload.new_username || actor.user_name).trim();

                if (!oldPass || !newPass || newPass.length < 4) {
                    return res.status(200).json({ success: false, message: 'সঠিক পুরাতন ও নতুন পাসওয়ার্ড দিন।' });
                }
                if (actor.password !== oldPass) {
                    return res.status(200).json({ success: false, message: 'পুরাতন পাসওয়ার্ডটি ভুল দিয়েছেন!' });
                }

                const { error } = await supabaseServer
                    .from('accounts_master')
                    .update({ user_name: newUserName, password: newPass })
                    .eq('composite_user_id', compUserId);
                if (error) throw error;

                return res.status(200).json({
                    success: true,
                    message: `ইউজারনেম ও পাসওয়ার্ড আপডেট হয়েছে! (${actor.buyer_email || 'N/A'})`
                });
            }

            case 'save_income_expense':
            case 'insert_income_expense': {
                const rec = payload.record || payload;
                const amount = Number(rec.amount ?? rec.income_expense_amount ?? 0);
                const desc = String(rec.desc ?? rec.description ?? rec.income_expense_description ?? '').trim();
                if (!desc || !(amount > 0)) {
                    return res.status(200).json({ success: false, message: 'সঠিক Description ও Amount দিন।' });
                }

                const type = String(rec.type || rec.entry_type || rec.income_expense_type || 'income').toLowerCase() === 'expense' ? 'expense' : 'income';
                const status = String(rec.status || rec.income_expense_status || 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';

                const { data, error } = await supabaseServer
                    .from('income_expense')
                    .insert([{
                        composite_user_id: compUserId,
                        income_expense_type: type,
                        income_expense_date: rec.date || rec.entry_date || rec.income_expense_date || new Date().toISOString().slice(0, 10),
                        income_expense_description: desc,
                        income_expense_amount: amount,
                        income_expense_status: status
                    }])
                    .select()
                    .single();
                if (error) throw error;

                return res.status(200).json({ ok: true, success: true, data });
            }

            case 'update_income_expense_status': {
                const id = body.id ?? payload.id;
                const status = String(body.status ?? payload.status ?? 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';
                if (!id) return res.status(400).json({ success: false, message: 'id is required.' });

                const { data: updated, error } = await supabaseServer
                    .from('income_expense')
                    .update({ income_expense_status: status })
                    .eq('id', id)
                    .eq('composite_user_id', compUserId)
                    .select()
                    .single();
                if (error) throw error;

                if (updated && status === 'Paid') {
                    await supabaseServer
                        .from('loan_records')
                        .update({ loan_records_status: 'Paid', loan_records_settled_date: new Date().toISOString().slice(0, 10) })
                        .eq('composite_user_id', compUserId)
                        .ilike('loan_records_description', `%[ExpDue#${updated.id}]%`);
                }

                return res.status(200).json({ ok: true, success: true, data: updated });
            }

            case 'delete_income_expense':
            case 'delete_income_entries':
            case 'delete_market_expenses': {
                const ids = extractDeleteIds(body, payload);
                if (!ids.length) return res.status(400).json({ success: false, message: 'ids array is required.' });

                let q = supabaseServer.from('income_expense').delete().in('id', ids).eq('composite_user_id', compUserId);
                if (action === 'delete_market_expenses') q = q.eq('income_expense_type', 'expense');

                const { data, error } = await q.select('id');
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'save_loan':
            case 'insert_loan_record': {
                const rec = payload.record || payload;
                const amount = Number(rec.amount ?? rec.loan_records_amount ?? 0);
                const desc = String(rec.description ?? rec.person_name ?? rec.loan_records_description ?? '').trim();
                if (!desc || !(amount > 0)) {
                    return res.status(200).json({ success: false, message: 'সঠিক Description ও Amount দিন।' });
                }

                const rawDir = String(rec.direction || rec.category || rec.loan_type || rec.loan_records_direction || 'receivable').toLowerCase();
                const direction = rawDir === 'payable' ? 'payable' : 'receivable';
                const settledDate = rec.settled_date || rec.settle_date || rec.loan_records_settled_date || null;
                const status = normalizeLoanStatus(rec.status ?? rec.loan_records_status ?? 'Due', settledDate);

                const { data: inserted, error } = await supabaseServer
                    .from('loan_records')
                    .insert([{
                        composite_user_id: compUserId,
                        loan_records_direction: direction,
                        loan_records_description: desc,
                        loan_records_amount: amount,
                        loan_records_entry_date: rec.entry_date || rec.date || rec.loan_records_entry_date || new Date().toISOString().slice(0, 10),
                        loan_records_settled_date: settledDate,
                        loan_records_extra_amount: Number(rec.extra_amount ?? rec.loan_records_extra_amount ?? 0) || 0,
                        loan_records_status: status,
                        loan_records_source: String(rec.source ?? rec.loan_records_source ?? 'Ledger').trim()
                    }])
                    .select()
                    .single();
                if (error) throw error;

                if (inserted.loan_records_direction === 'receivable' && amount > 0) {
                    await supabaseServer.from('income_expense').insert([{
                        composite_user_id: compUserId,
                        income_expense_type: 'expense',
                        income_expense_date: inserted.loan_records_entry_date,
                        income_expense_description: `Receivable Out (${desc}) [Loan#${inserted.id}]`,
                        income_expense_amount: amount,
                        income_expense_status: 'Paid'
                    }]);
                }

                return res.status(200).json({ ok: true, success: true, data: inserted });
            }

            case 'settle_loan':
            case 'settle_loan_record': {
                const rec = payload.record || payload;
                if (!rec.id) return res.status(400).json({ success: false, message: 'id is required.' });

                const { data: existing, error: fetchErr } = await supabaseServer
                    .from('loan_records').select('*').eq('id', rec.id).eq('composite_user_id', compUserId).single();
                if (fetchErr || !existing) return res.status(200).json({ success: false, message: 'Loan record not found.' });

                const settledDate = rec.loan_records_settled_date || rec.settled_date || rec.settle_date || new Date().toISOString().slice(0, 10);
                const nextStatus = normalizeLoanStatus(rec.loan_records_status ?? rec.status ?? 'Paid', settledDate);
                const nextExtra = Math.max(0, Number(rec.loan_records_extra_amount ?? rec.extra_amount ?? existing.loan_records_extra_amount ?? 0) || 0);

                const { data: updated, error } = await supabaseServer
                    .from('loan_records')
                    .update({ loan_records_status: nextStatus, loan_records_settled_date: settledDate, loan_records_extra_amount: nextExtra })
                    .eq('id', rec.id).eq('composite_user_id', compUserId).select().single();
                if (error) throw error;

                const isSettled = ['Paid', 'Due Received'].includes(nextStatus);
                const principal = Number(updated.loan_records_amount || 0);

                if (updated.loan_records_direction === 'receivable' && isSettled && (principal + nextExtra) > 0) {
                    const tag = `[LoanSettle#${updated.id}]`;
                    const { data: dup } = await supabaseServer.from('income_expense').select('id')
                        .eq('composite_user_id', compUserId).ilike('income_expense_description', `%${tag}%`);
                    if (!dup?.length) {
                        await supabaseServer.from('income_expense').insert([{
                            composite_user_id: compUserId,
                            income_expense_type: 'income',
                            income_expense_date: settledDate,
                            income_expense_description: `Receivable Settled (${updated.loan_records_description || 'Loan'}) ${tag}`,
                            income_expense_amount: principal + nextExtra,
                            income_expense_status: 'Paid'
                        }]);
                    }
                }

                if (updated.loan_records_direction === 'payable' && isSettled) {
                    const match = String(updated.loan_records_description || '').match(/\[ExpDue#([^\]]+)\]/);
                    if (match?.[1]) {
                        await supabaseServer.from('income_expense')
                            .update({ income_expense_status: 'Paid', income_expense_date: settledDate, income_expense_amount: (principal + nextExtra) || principal })
                            .eq('id', match[1]).eq('composite_user_id', compUserId);
                    } else if (nextExtra > 0) {
                        const tag = `[PayableExtra#${updated.id}]`;
                        const { data: dup } = await supabaseServer.from('income_expense').select('id')
                            .eq('composite_user_id', compUserId).ilike('income_expense_description', `%${tag}%`);
                        if (!dup?.length) {
                            await supabaseServer.from('income_expense').insert([{
                                composite_user_id: compUserId,
                                income_expense_type: 'expense',
                                income_expense_date: settledDate,
                                income_expense_description: `Payable Extra (${updated.loan_records_description || 'Payable'}) ${tag}`,
                                income_expense_amount: nextExtra,
                                income_expense_status: 'Paid'
                            }]);
                        }
                    }
                }

                return res.status(200).json({ ok: true, success: true, data: updated });
            }

            case 'delete_loan_records':
            case 'delete_loan_entries':
            case 'delete_loans': {
                const ids = extractDeleteIds(body, payload);
                if (!ids.length) return res.status(400).json({ success: false, message: 'ids array is required.' });
                const { data, error } = await supabaseServer.from('loan_records').delete().in('id', ids).eq('composite_user_id', compUserId).select('id');
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'save_market_expense': {
                const amount = Number(payload.amount ?? 0);
                const desc = String(payload.description ?? payload.desc ?? '').trim();
                if (!desc || !(amount > 0)) {
                    return res.status(200).json({ success: false, message: 'সঠিক Description ও Amount দিন।' });
                }

                const cleanStatus = String(payload.status || 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';
                const expDate = payload.expense_date || payload.date || new Date().toISOString().slice(0, 10);

                const { data: insertedExp, error } = await supabaseServer
                    .from('income_expense')
                    .insert([{
                        composite_user_id: compUserId,
                        income_expense_type: 'expense',
                        income_expense_date: expDate,
                        income_expense_description: desc,
                        income_expense_amount: amount,
                        income_expense_status: cleanStatus
                    }])
                    .select()
                    .single();
                if (error) throw error;

                if (cleanStatus === 'Due') {
                    await supabaseServer.from('loan_records').insert([{
                        composite_user_id: compUserId,
                        loan_records_direction: 'payable',
                        loan_records_description: `${desc} [ExpDue#${insertedExp.id}]`,
                        loan_records_amount: amount,
                        loan_records_entry_date: expDate,
                        loan_records_settled_date: null,
                        loan_records_extra_amount: 0,
                        loan_records_status: 'Due',
                        loan_records_source: 'Daily Expense'
                    }]);
                }

                return res.status(200).json({ success: true, data: insertedExp });
            }

            case 'buy_lot': {
                const qty = Math.min(200, Math.max(1, parseInt(payload.quantity, 10) || 1));
                const lotId = String(payload.lot_id || '').trim();
                if (!lotId) return res.status(200).json({ success: false, message: 'Lot ID প্রয়োজন।' });

                const compId = actor.company_id || company_id;
                const rows = Array.from({ length: qty }, (_, i) => ({
                    company_id: compId,
                    user_id: `sub_${lotId.toLowerCase().replace(/[^a-z0-9]/g, '')}_${String(i + 1).padStart(2, '0')}`,
                    user_name: 'user_' + Math.floor(1000 + Math.random() * 9000),
                    password: 'pass' + Math.floor(1000 + Math.random() * 9000),
                    role: 'User',
                    status: 'In_Stock',
                    request_type: 'Lot',
                    lot_id: lotId,
                    owner_id: compUserId,
                    upline_id: compUserId,
                    wallet_balance: 0.0
                }));

                const { error } = await supabaseServer.from('accounts_master').insert(rows);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Lot purchased successfully.' });
            }

            case 'process_id_sale_cashback': {
                const { sold_item_id, buyer_name, buyer_mobile, buyer_email, coupon_code } = payload;
                if (!sold_item_id) return res.status(200).json({ success: false, message: 'Sold item required.' });

                const { data: soldItem, error: soldErr } = await supabaseServer
                    .from('accounts_master')
                    .select('id, owner_id, status')
                    .eq('id', sold_item_id)
                    .eq('owner_id', compUserId)
                    .eq('status', 'In_Stock')
                    .single();
                if (soldErr || !soldItem) {
                    return res.status(200).json({ success: false, message: 'Stock item not found or already sold.' });
                }

                const { error: updErr } = await supabaseServer
                    .from('accounts_master')
                    .update({ status: 'Active', buyer_name, buyer_mobile, buyer_email, coupon_code })
                    .eq('id', sold_item_id);
                if (updErr) throw updErr;

                const directBonus = 8.0;
                const chainPool = 2.0;
                let sellerBalance = Number(actor.wallet_balance || 0) + directBonus;

                const uplines = [];
                let nextUpline = actor.upline_id;
                const visited = new Set([compUserId]);

                while (nextUpline && !visited.has(nextUpline) && uplines.length < 100) {
                    visited.add(nextUpline);
                    const { data: up } = await supabaseServer
                        .from('accounts_master')
                        .select('composite_user_id, wallet_balance, upline_id')
                        .eq('composite_user_id', nextUpline)
                        .single();
                    if (!up) break;
                    uplines.push(up);
                    nextUpline = up.upline_id;
                }

                const n = uplines.length;
                if (n === 0) {
                    sellerBalance += chainPool;
                } else {
                    const weightSum = (n * (n + 1)) / 2;
                    for (let i = 0; i < n; i++) {
                        const share = (chainPool * (n - i)) / weightSum;
                        await supabaseServer
                            .from('accounts_master')
                            .update({ wallet_balance: Number(uplines[i].wallet_balance || 0) + share })
                            .eq('composite_user_id', uplines[i].composite_user_id);
                    }
                }

                await supabaseServer.from('accounts_master').update({ wallet_balance: sellerBalance }).eq('composite_user_id', compUserId);
                return res.status(200).json({ success: true, message: 'Sale and cashback processed.' });
            }

            case 'register_new_license': {
                const name = String(payload.name || '').trim();
                const mobile = String(payload.mobile || '').trim();
                const email = String(payload.email || '').trim();
                if (!name || !mobile) {
                    return res.status(200).json({ success: false, message: 'নাম ও মোবাইল নম্বর দিন।' });
                }

                const compId = String(company_id || '101');
                const adminId = `${compId}_admin`;
                const { error } = await supabaseServer.from('accounts_master').insert([{
                    company_id: compId,
                    user_id: 'user_' + Math.floor(1000 + Math.random() * 9000),
                    user_name: 'user_' + Math.floor(1000 + Math.random() * 9000),
                    password: 'pass' + Math.floor(1000 + Math.random() * 9000),
                    role: 'User',
                    status: 'Pending',
                    request_type: 'Single',
                    owner_id: adminId,
                    upline_id: adminId,
                    buyer_name: name,
                    buyer_mobile: mobile,
                    buyer_email: email,
                    wallet_balance: 0.0
                }]);
                if (error) throw error;

                return res.status(200).json({ success: true, message: 'License request submitted.' });
            }

            case 'preview_validity_cart': {
                const discountsMap = await loadDiscountsMap();
                const walletBalance = Number(actor.wallet_balance || 0);
                const summary = calculateValidityCart(payload.items || [], discountsMap, Boolean(payload.use_coupon_wallet), walletBalance);
                return res.status(200).json({
                    success: true,
                    summary: {
                        ...summary,
                        walletBalance,
                        pendingDays: Number(actor.pending_validity_days || 0),
                        approvalStatus: actor.validity_approval_status || 'NONE'
                    }
                });
            }

            case 'buy_validity': {
                const trxId = String(payload.trx_id || '').trim();
                if (!trxId) return res.status(200).json({ success: false, message: 'Transaction ID দিন।' });

                const discountsMap = await loadDiscountsMap();
                const useWallet = Boolean(payload.use_coupon_wallet);
                const walletBalance = Number(actor.wallet_balance || 0);
                const calc = calculateValidityCart(payload.items || [], discountsMap, useWallet, walletBalance);
                if (calc.totalDays <= 0) {
                    return res.status(200).json({ success: false, message: 'কার্টে অন্তত একটি প্ল্যান যোগ করুন।' });
                }

                const { data: reqRow, error: reqErr } = await supabaseServer
                    .from('validity_extension_requests')
                    .insert({
                        account_id: actor.id,
                        company_id: actor.company_id ?? null,
                        user_id: actor.user_id ?? null,
                        composite_user_id: actor.composite_user_id ?? null,
                        days_requested: calc.totalDays,
                        base_total: calc.baseTotal,
                        discount_total: calc.discountTotal,
                        subtotal: calc.subtotal,
                        wallet_deducted: calc.walletDeducted,
                        payable_amount: calc.payableAmount,
                        use_coupon_wallet: useWallet,
                        trx_id: trxId,
                        payment_method: 'Cash Pay',
                        status: 'Admin Approval'
                    })
                    .select()
                    .single();
                if (reqErr) throw reqErr;

                const nextPendingDays = Number(actor.pending_validity_days || 0) + calc.totalDays;
                await supabaseServer
                    .from('accounts_master')
                    .update({ pending_validity_days: nextPendingDays, validity_approval_status: 'Admin Approval' })
                    .eq('id', actor.id);

                return res.status(200).json({
                    success: true,
                    request: reqRow,
                    summary: { ...calc, walletBalance, pendingDays: nextPendingDays, approvalStatus: 'Admin Approval' }
                });
            }

            case 'approve_validity_request': {
                if (!['Admin', 'SuperAdmin'].includes(String(actor.role || ''))) {
                    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
                }
                const requestId = Number(payload.request_id);
                if (!requestId) return res.status(200).json({ success: false, message: 'Request ID প্রয়োজন।' });

                const { data, error } = await supabaseServer.rpc('approve_validity_extension', { p_request_id: requestId });
                if (error) throw error;

                return res.status(200).json({ success: true, approved: Array.isArray(data) ? data[0] : data });
            }

            case 'balance_transfer': {
                const amount = Number(payload.amount || 0);
                const recipientId = String(payload.recipient_id || '').trim();
                if (!(amount > 0) || !recipientId) {
                    return res.status(200).json({ success: false, message: 'সঠিক প্রাপক এবং অ্যামাউন্ট দিন।' });
                }

                const { data: recipient, error: recErr } = await supabaseServer
                    .from('accounts_master')
                    .select('id, composite_user_id, wallet_balance')
                    .or(`user_name.eq.${recipientId},user_id.eq.${recipientId},composite_user_id.eq.${recipientId}`)
                    .single();
                if (recErr || !recipient) {
                    return res.status(200).json({ success: false, message: 'প্রাপক পাওয়া যায়নি।' });
                }
                if (recipient.composite_user_id === compUserId) {
                    return res.status(200).json({ success: false, message: 'নিজের অ্যাকাউন্টে ট্রান্সফার করা যাবে না।' });
                }

                const senderBal = Number(actor.wallet_balance || 0);
                if (senderBal < amount) {
                    return res.status(200).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
                }

                await supabaseServer.from('accounts_master').update({ wallet_balance: senderBal - amount }).eq('id', actor.id);
                await supabaseServer.from('accounts_master').update({ wallet_balance: Number(recipient.wallet_balance || 0) + amount }).eq('id', recipient.id);

                return res.status(200).json({ success: true, message: 'সফলভাবে ব্যালেন্স ট্রান্সফার সম্পন্ন হয়েছে!' });
            }

            case 'send_chat': {
                const message = String(payload.message || '').trim();
                const channel = String(payload.channel || 'Public_Forum').trim();
                if (!message) return res.status(200).json({ success: false, message: 'মেসেজ খালি রাখা যাবে না।' });

                const { error } = await supabaseServer.from('forum_chat').insert([{
                    company_id: actor.company_id,
                    user_id: actor.user_id,
                    composite_user_id: compUserId,
                    sender_role: actor.role || 'User',
                    chat_channel: channel,
                    message
                }]);
                if (error) throw error;

                return res.status(200).json({ success: true, message: 'Message dispatched.' });
            }

            default:
                return res.status(400).json({ success: false, message: 'Invalid action command.' });
        }
    } catch (error) {
        console.error('[PROXY ERROR]:', error);
        return res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
    }
}
