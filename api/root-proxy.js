import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SIGMAPHD_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SIGMAPHD_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SIGMAPHD_JWT_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'sigma-fallback-secret';

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const RATE_PER_MONTH = 100;

function signSessionToken(payload) {
    const exp = Date.now() + 24 * 60 * 60 * 1000;
    const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [data, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (!sig || sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    try {
        const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (!parsed.exp || Date.now() > parsed.exp) return null;
        return parsed;
    } catch {
        return null;
    }
}

function isPositiveNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) && n > 0;
}

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

function calculateValidityCart(cartItems = [], discountsMap = {}, useCouponWallet = false, walletBalance = 0) {
    let totalDays = 0;
    let baseTotal = 0;
    let discountTotal = 0;

    const breakdown = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
        const months = Math.min(24, Math.max(1, parseInt(item.months, 10) || 1));
        const qty = Math.min(50, Math.max(1, parseInt(item.qty, 10) || 1));
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

function normalizeLoanStatus(rawStatus, settledDate = null) {
    const clean = String(rawStatus ?? '').trim().toLowerCase();
    if (clean === 'paid' || clean === 'settled' || clean === 'completed') return 'Paid';
    if (clean === 'due received' || clean === 'received') return 'Due Received';
    if (settledDate && String(settledDate).trim() !== '' && clean !== 'due') return 'Paid';
    return 'Due';
}

function extractDeleteIds(parsedBody, payload) {
    const rawIds =
        (Array.isArray(parsedBody?.ids) && parsedBody.ids) ||
        (Array.isArray(payload?.ids) && payload.ids) ||
        (parsedBody?.id !== undefined && parsedBody?.id !== null ? [parsedBody.id] : null) ||
        (payload?.id !== undefined && payload?.id !== null ? [payload.id] : null) ||
        [];

    return rawIds
        .map((val) => (typeof val === 'object' && val !== null ? (val.id ?? val.row_id ?? val.entry_id) : val))
        .filter((val) => val !== undefined && val !== null && String(val).trim() !== '');
}

async function deleteIncomeExpenseRows(ids, compositeUserId, extraFilter = null) {
    let query = supabaseServer
        .from('income_expense')
        .delete()
        .in('id', ids)
        .eq('composite_user_id', compositeUserId);

    if (extraFilter?.column && extraFilter?.value !== undefined) {
        query = query.eq(extraFilter.column, extraFilter.value);
    }

    const { data, error } = await query.select('id');
    return { data, error };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
    }

    try {
        const parsedBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { action, company_id = '101', payload } = parsedBody;

        const publicActions = ['authenticate_user', 'register_new_license'];
        const authHeader = req.headers?.authorization || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const token = parsedBody.session_token || payload?.session_token || bearerToken;
        const session = verifySessionToken(token);

        if (!publicActions.includes(action) && !session?.composite_user_id) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Valid session token required.' });
        }

        const actorCompositeId = session?.composite_user_id || parsedBody.composite_user_id;
        const actorRole = session?.role || 'User';

        switch (action) {
            case 'authenticate_user': {
                const cleanUserName = String(payload?.user_name || '').trim();
                const cleanPassword = String(payload?.password || '').trim();
                if (!cleanUserName || !cleanPassword) {
                    return res.status(200).json({ success: false, message: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই প্রদান করুন।' });
                }

                const { data, error } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('company_id', String(company_id))
                    .eq('user_name', cleanUserName)
                    .eq('password', cleanPassword)
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
                    company_id: data.company_id || String(company_id),
                    role: data.role || 'User',
                });

                const { password: _omitted, ...safeUser } = data;

                return res.status(200).json({
                    success: true,
                    session_token: sessionToken,
                    user: {
                        ...safeUser,
                        is_validity_expired: isExpired,
                        pending_validity_days: Number(data.pending_validity_days || 0),
                        validity_approval_status: data.validity_approval_status || 'NONE',
                    }
                });
            }

            case 'fetch_dashboard_data': {
                const [incExp, loansRec, loansPay, marketExp, accounts, chats] = await Promise.all([
                    supabaseServer
                        .from('income_expense')
                        .select('*')
                        .eq('composite_user_id', actorCompositeId)
                        .order('income_expense_date', { ascending: false })
                        .order('created_at', { ascending: false }),
                    supabaseServer
                        .from('loan_records')
                        .select('*')
                        .eq('composite_user_id', actorCompositeId)
                        .eq('loan_records_direction', 'receivable')
                        .order('loan_records_entry_date', { ascending: false }),
                    supabaseServer
                        .from('loan_records')
                        .select('*')
                        .eq('composite_user_id', actorCompositeId)
                        .eq('loan_records_direction', 'payable')
                        .order('loan_records_entry_date', { ascending: false }),
                    supabaseServer
                        .from('income_expense')
                        .select('*')
                        .eq('composite_user_id', actorCompositeId)
                        .eq('income_expense_type', 'expense')
                        .order('income_expense_date', { ascending: false })
                        .order('created_at', { ascending: false }),
                    supabaseServer
                        .from('accounts_master')
                        .select('id, company_id, user_id, user_name, composite_user_id, role, status, lot_id, owner_id, upline_id, wallet_balance, validity_expires_at, activated_at, validity_days, pending_validity_days, validity_approval_status')
                        .eq('company_id', String(company_id)),
                    supabaseServer
                        .from('forum_chat')
                        .select('*')
                        .eq('company_id', String(company_id))
                        .eq('chat_channel', 'Public_Forum')
                        .order('created_at', { ascending: true })
                ]);

                return res.status(200).json({
                    success: true,
                    income_expenses: incExp.data || [],
                    loans_receivable: (loansRec.data || []).map((r) => ({
                        ...r,
                        loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                    })),
                    loans_payable: (loansPay.data || []).map((r) => ({
                        ...r,
                        loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                    })),
                    daily_expenses: marketExp.data || [],
                    accounts: accounts.data || [],
                    public_chats: chats.data || []
                });
            }

            case 'user_password_change': {
                const { new_username, old_password, new_password } = payload || {};
                if (!old_password || !new_password || String(new_password).length < 6) {
                    return res.status(200).json({ success: false, message: 'পুরাতন পাসওয়ার্ড এবং কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দিন।' });
                }

                const { data: userRecord, error: fetchErr } = await supabaseServer
                    .from('accounts_master')
                    .select('composite_user_id, user_name, password, buyer_email, token_version')
                    .eq('composite_user_id', actorCompositeId)
                    .single();

                if (fetchErr || !userRecord) {
                    return res.status(200).json({ success: false, message: 'ডাটাবেজে ইউজার অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }
                if (userRecord.password !== old_password) {
                    return res.status(200).json({ success: false, message: 'পুরাতন পাসওয়ার্ডটি ভুল দিয়েছেন!' });
                }

                const updatedUserName = new_username ? String(new_username).trim() : userRecord.user_name;
                const { error: updateErr } = await supabaseServer
                    .from('accounts_master')
                    .update({
                        user_name: updatedUserName,
                        password: String(new_password),
                        token_version: Number(userRecord.token_version || 1) + 1
                    })
                    .eq('composite_user_id', actorCompositeId);

                if (updateErr) throw updateErr;

                return res.status(200).json({
                    success: true,
                    message: `সফলভাবে ইউজারনেম ও পাসওয়ার্ড আপডেট হয়েছে! ${userRecord.buyer_email || 'N/A'} ঠিকানায় নোটিফিকেশন পাঠানো হয়েছে।`
                });
            }

            case 'save_income_expense':
            case 'insert_income_expense': {
                const src = payload?.record || payload || {};
                const amount = Number(src.amount ?? src.income_expense_amount ?? 0);
                if (!isPositiveNumber(amount)) {
                    return res.status(400).json({ ok: false, success: false, message: 'Valid positive amount is required.' });
                }

                const type = (src.type || src.income_expense_type || 'income').toString().toLowerCase() === 'expense' ? 'expense' : 'income';
                const status = String(src.status || src.income_expense_status || 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';

                const { data: inserted, error } = await supabaseServer
                    .from('income_expense')
                    .insert([{
                        composite_user_id: actorCompositeId,
                        income_expense_type: type,
                        income_expense_date: src.date || src.income_expense_date || new Date().toISOString().slice(0, 10),
                        income_expense_description: String(src.desc ?? src.description ?? src.income_expense_description ?? '').trim().slice(0, 250),
                        income_expense_amount: amount,
                        income_expense_status: status
                    }])
                    .select()
                    .single();

                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, data: inserted });
            }

            case 'update_income_expense_status': {
                const id = parsedBody.id ?? payload?.id;
                const status = String(parsedBody.status ?? payload?.status ?? 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';
                if (!id) return res.status(400).json({ ok: false, success: false, message: 'id is required.' });

                const { data: updated, error } = await supabaseServer
                    .from('income_expense')
                    .update({ income_expense_status: status })
                    .eq('id', id)
                    .eq('composite_user_id', actorCompositeId)
                    .select()
                    .single();

                if (error) throw error;

                if (updated && status === 'Paid') {
                    const payableTag = `[ExpDue#${updated.id}]`;
                    const settledDate = new Date().toISOString().slice(0, 10);
                    await supabaseServer
                        .from('loan_records')
                        .update({ loan_records_status: 'Paid', loan_records_settled_date: settledDate })
                        .eq('composite_user_id', actorCompositeId)
                        .ilike('loan_records_description', `%${payableTag}%`);
                }

                return res.status(200).json({ ok: true, success: true, data: updated });
            }

            case 'delete_income_expense':
            case 'delete_income_entries':
            case 'delete_market_expenses': {
                const ids = extractDeleteIds(parsedBody, payload);
                if (!ids.length) return res.status(400).json({ ok: false, success: false, message: 'ids array is required.' });

                const extra = action === 'delete_market_expenses' ? { column: 'income_expense_type', value: 'expense' } : null;
                const { data, error } = await deleteIncomeExpenseRows(ids, actorCompositeId, extra);
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'save_loan':
            case 'insert_loan_record': {
                const src = payload?.record || payload || {};
                const amount = Number(src.amount ?? src.loan_records_amount ?? 0);
                if (!isPositiveNumber(amount)) {
                    return res.status(400).json({ ok: false, success: false, message: 'Valid positive loan amount is required.' });
                }

                const direction = String(src.direction || src.loan_category || src.loan_records_direction || 'receivable').toLowerCase() === 'payable'
                    ? 'payable'
                    : 'receivable';
                const settledDate = src.settled_date || src.settle_date || src.loan_records_settled_date || null;
                const status = normalizeLoanStatus(src.status ?? src.loan_records_status ?? 'Due', settledDate);

                const { data: inserted, error } = await supabaseServer
                    .from('loan_records')
                    .insert([{
                        composite_user_id: actorCompositeId,
                        loan_records_direction: direction,
                        loan_records_description: String(src.description ?? src.person_name ?? src.loan_records_description ?? '').trim().slice(0, 250),
                        loan_records_amount: amount,
                        loan_records_entry_date: src.entry_date || src.date || src.loan_records_entry_date || new Date().toISOString().slice(0, 10),
                        loan_records_settled_date: settledDate,
                        loan_records_extra_amount: Number(src.extra_amount ?? src.loan_records_extra_amount ?? 0) || 0,
                        loan_records_status: status,
                        loan_records_source: String(src.source ?? src.loan_records_source ?? 'Ledger').trim().slice(0, 60)
                    }])
                    .select()
                    .single();

                if (error) throw error;

                if (inserted.loan_records_direction === 'receivable') {
                    await supabaseServer.from('income_expense').insert([{
                        composite_user_id: actorCompositeId,
                        income_expense_type: 'expense',
                        income_expense_date: inserted.loan_records_entry_date,
                        income_expense_description: `Receivable Out (${inserted.loan_records_description || 'Entry'}) [Loan#${inserted.id}]`,
                        income_expense_amount: amount,
                        income_expense_status: 'Paid'
                    }]);
                }

                return res.status(200).json({ ok: true, success: true, data: inserted });
            }

            case 'settle_loan':
            case 'settle_loan_record': {
                const rec = payload?.record || payload || {};
                const id = rec.id;
                if (!id) return res.status(400).json({ ok: false, success: false, message: 'id is required.' });

                const { data: existingLoan, error: fetchLoanErr } = await supabaseServer
                    .from('loan_records')
                    .select('*')
                    .eq('id', id)
                    .eq('composite_user_id', actorCompositeId)
                    .single();

                if (fetchLoanErr || !existingLoan) throw fetchLoanErr || new Error('Loan record not found.');

                const nextSettledDate = rec.loan_records_settled_date || rec.settled_date || rec.settle_date || new Date().toISOString().slice(0, 10);
                const nextStatus = normalizeLoanStatus(rec.loan_records_status ?? rec.status ?? 'Paid', nextSettledDate);
                const nextExtraAmount = Math.max(0, Number(rec.loan_records_extra_amount ?? rec.extra_amount ?? existingLoan.loan_records_extra_amount ?? 0) || 0);

                const { data: updated, error } = await supabaseServer
                    .from('loan_records')
                    .update({
                        loan_records_status: nextStatus,
                        loan_records_settled_date: nextSettledDate,
                        loan_records_extra_amount: nextExtraAmount
                    })
                    .eq('id', id)
                    .eq('composite_user_id', actorCompositeId)
                    .select()
                    .single();

                if (error) throw error;

                const isSettledNow = ['Paid', 'Due Received'].includes(String(nextStatus));
                const principalAmount = Number(updated.loan_records_amount || 0);

                if (updated.loan_records_direction === 'receivable' && isSettledNow) {
                    const totalReceivedIncome = principalAmount + nextExtraAmount;
                    const tag = `[LoanSettle#${updated.id}]`;
                    const { data: existingInc } = await supabaseServer
                        .from('income_expense')
                        .select('id')
                        .eq('composite_user_id', actorCompositeId)
                        .ilike('income_expense_description', `%${tag}%`);

                    if (totalReceivedIncome > 0 && (!existingInc || existingInc.length === 0)) {
                        await supabaseServer.from('income_expense').insert([{
                            composite_user_id: actorCompositeId,
                            income_expense_type: 'income',
                            income_expense_date: nextSettledDate,
                            income_expense_description: `Receivable Settled (${updated.loan_records_description || 'Loan'}) - Principal + Extra ${tag}`,
                            income_expense_amount: totalReceivedIncome,
                            income_expense_status: 'Paid'
                        }]);
                    }
                }

                if (updated.loan_records_direction === 'payable' && isSettledNow) {
                    const expDueMatch = String(updated.loan_records_description || '').match(/\[ExpDue#([^\]]+)\]/);
                    if (expDueMatch?.[1]) {
                        await supabaseServer
                            .from('income_expense')
                            .update({
                                income_expense_status: 'Paid',
                                income_expense_date: nextSettledDate,
                                income_expense_amount: (principalAmount + nextExtraAmount) || principalAmount
                            })
                            .eq('id', expDueMatch[1])
                            .eq('composite_user_id', actorCompositeId);
                    } else if (nextExtraAmount > 0) {
                        const tag = `[PayableExtra#${updated.id}]`;
                        const { data: existingExp } = await supabaseServer
                            .from('income_expense')
                            .select('id')
                            .eq('composite_user_id', actorCompositeId)
                            .ilike('income_expense_description', `%${tag}%`);

                        if (!existingExp || existingExp.length === 0) {
                            await supabaseServer.from('income_expense').insert([{
                                composite_user_id: actorCompositeId,
                                income_expense_type: 'expense',
                                income_expense_date: nextSettledDate,
                                income_expense_description: `Payable Extra Expense (${updated.loan_records_description || 'Payable'}) ${tag}`,
                                income_expense_amount: nextExtraAmount,
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
                const ids = extractDeleteIds(parsedBody, payload);
                if (!ids.length) return res.status(400).json({ ok: false, success: false, message: 'ids array is required.' });

                const { data, error } = await supabaseServer
                    .from('loan_records')
                    .delete()
                    .in('id', ids)
                    .eq('composite_user_id', actorCompositeId)
                    .select('id');

                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'save_market_expense': {
                const { expense_date, description, amount, status } = payload || {};
                if (!isPositiveNumber(amount)) {
                    return res.status(400).json({ success: false, message: 'Valid positive amount is required.' });
                }

                const cleanStatus = String(status || 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';
                const { data: insertedExp, error } = await supabaseServer
                    .from('income_expense')
                    .insert([{
                        composite_user_id: actorCompositeId,
                        income_expense_type: 'expense',
                        income_expense_date: expense_date || new Date().toISOString().slice(0, 10),
                        income_expense_description: String(description || '').trim().slice(0, 250),
                        income_expense_amount: Number(amount),
                        income_expense_status: cleanStatus
                    }])
                    .select()
                    .single();

                if (error) throw error;

                if (cleanStatus === 'Due') {
                    await supabaseServer.from('loan_records').insert([{
                        composite_user_id: actorCompositeId,
                        loan_records_direction: 'payable',
                        loan_records_description: `${String(insertedExp.income_expense_description || 'Due Expense').trim()} [ExpDue#${insertedExp.id}]`,
                        loan_records_amount: Number(insertedExp.income_expense_amount),
                        loan_records_entry_date: insertedExp.income_expense_date,
                        loan_records_settled_date: null,
                        loan_records_extra_amount: 0,
                        loan_records_status: 'Due',
                        loan_records_source: 'Daily Expense'
                    }]);
                }

                return res.status(200).json({ success: true, data: insertedExp });
            }

            case 'preview_validity_cart':
            case 'buy_validity': {
                const { data: accountRow, error: accFetchErr } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('composite_user_id', actorCompositeId)
                    .single();

                if (accFetchErr || !accountRow) {
                    return res.status(200).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                const discountsMap = await loadDiscountsFromDb(supabaseServer);
                const useCouponWallet = Boolean(payload?.use_coupon_wallet);
                const walletBalance = Number(accountRow.wallet_balance || 0);
                const calc = calculateValidityCart(payload?.items || [], discountsMap, useCouponWallet, walletBalance);

                if (action === 'preview_validity_cart') {
                    return res.status(200).json({
                        success: true,
                        summary: {
                            ...calc,
                            walletBalance,
                            pendingDays: Number(accountRow.pending_validity_days || 0),
                            approvalStatus: accountRow.validity_approval_status || 'NONE',
                        }
                    });
                }

                const trxId = String(payload?.trx_id || '').trim();
                if (!trxId) return res.status(200).json({ success: false, message: 'Transaction ID প্রদান করুন।' });
                if (calc.totalDays <= 0) return res.status(200).json({ success: false, message: 'কার্টে অন্তত একটি প্ল্যান যোগ করুন।' });

                const { data: reqRow, error: reqErr } = await supabaseServer
                    .from('validity_extension_requests')
                    .insert({
                        account_id: accountRow.id,
                        company_id: accountRow.company_id ? Number(accountRow.company_id) : null,
                        user_id: accountRow.user_id ?? null,
                        composite_user_id: accountRow.composite_user_id,
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
                    .update({ pending_validity_days: nextPendingDays, validity_approval_status: 'Admin Approval' })
                    .eq('id', accountRow.id);

                if (accErr) throw accErr;

                return res.status(200).json({
                    success: true,
                    message: `Cash Pay রিকোয়েস্ট (${calc.totalDays} দিন) জমা হয়েছে—Wait for Validity Approval।`,
                    request: reqRow,
                    summary: { ...calc, walletBalance, pendingDays: nextPendingDays, approvalStatus: 'Admin Approval' }
                });
            }

            case 'approve_validity_request': {
                if (!['Admin', 'SuperAdmin'].includes(String(actorRole))) {
                    return res.status(403).json({ success: false, message: 'Forbidden: Admin permission required.' });
                }
                const requestId = Number(payload?.request_id);
                if (!requestId) return res.status(200).json({ success: false, message: 'Request ID প্রয়োজন।' });

                const { data, error } = await supabaseServer.rpc('approve_validity_extension', { p_request_id: requestId });
                if (error) throw error;

                return res.status(200).json({
                    success: true,
                    message: 'Validity approved and extended successfully.',
                    approved: Array.isArray(data) ? data[0] : data,
                });
            }

            case 'balance_transfer': {
                const transferAmount = Number(payload?.amount || 0);
                const recipientId = String(payload?.recipient_id || '').trim();
                if (!isPositiveNumber(transferAmount) || !recipientId) {
                    return res.status(200).json({ success: false, message: 'সঠিক প্রাপক এবং অ্যামাউন্ট প্রদান করুন।' });
                }

                const { data: senderData, error: senderErr } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, composite_user_id')
                    .eq('composite_user_id', actorCompositeId)
                    .single();

                if (senderErr || !senderData) return res.status(200).json({ success: false, message: 'প্রেরকের তথ্য পাওয়া যায়নি।' });
                if (Number(senderData.wallet_balance || 0) < transferAmount) {
                    return res.status(200).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
                }

                const { data: recipientData, error: recErr } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, composite_user_id')
                    .or(`user_name.eq.${recipientId},user_id.eq.${recipientId},composite_user_id.eq.${recipientId}`)
                    .single();

                if (recErr || !recipientData || recipientData.composite_user_id === actorCompositeId) {
                    return res.status(200).json({ success: false, message: 'প্রাপক সঠিক নয় বা পাওয়া যায়নি।' });
                }

                const { error: upSender } = await supabaseServer
                    .from('accounts_master')
                    .update({ wallet_balance: Number(senderData.wallet_balance || 0) - transferAmount })
                    .eq('composite_user_id', actorCompositeId);
                if (upSender) throw upSender;

                const { error: upRec } = await supabaseServer
                    .from('accounts_master')
                    .update({ wallet_balance: Number(recipientData.wallet_balance || 0) + transferAmount })
                    .eq('composite_user_id', recipientData.composite_user_id);
                if (upRec) throw upRec;

                return res.status(200).json({ success: true, message: 'সফলভাবে ব্যালেন্স ট্রান্সফার সম্পন্ন হয়েছে!' });
            }

            case 'register_new_license': {
                const { name, mobile, email } = payload || {};
                if (!String(name || '').trim() || !String(mobile || '').trim()) {
                    return res.status(200).json({ success: false, message: 'নাম এবং মোবাইল নম্বর আবশ্যক।' });
                }

                const compId = String(company_id || '101');
                const adminId = `${compId}_admin`;
                const { error } = await supabaseServer.from('accounts_master').insert([{
                    company_id: compId,
                    user_id: 'user_' + crypto.randomInt(1000, 9999),
                    user_name: 'user_' + crypto.randomInt(1000, 9999),
                    password: crypto.randomBytes(6).toString('hex'),
                    role: 'User',
                    status: 'Pending',
                    request_type: 'Single',
                    owner_id: adminId,
                    upline_id: adminId,
                    buyer_name: String(name).trim().slice(0, 120),
                    buyer_mobile: String(mobile).trim().slice(0, 30),
                    buyer_email: String(email || '').trim().slice(0, 120),
                    wallet_balance: 0.00
                }]);

                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Single license request registered.' });
            }

            case 'send_chat': {
                const cleanMsg = String(payload?.message || '').trim().slice(0, 1000);
                const cleanChannel = String(payload?.channel || 'Public_Forum').trim().slice(0, 80);
                if (!cleanMsg) return res.status(200).json({ success: false, message: 'খালি মেসেজ পাঠানো যাবে না।' });

                const [compPart, userPart] = String(actorCompositeId).split('_');
                const { error } = await supabaseServer.from('forum_chat').insert([{
                    company_id: compPart || String(company_id),
                    user_id: userPart || actorCompositeId,
                    composite_user_id: actorCompositeId,
                    sender_role: actorRole,
                    chat_channel: cleanChannel,
                    message: cleanMsg
                }]);

                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Message dispatched.' });
            }

            default:
                return res.status(400).json({ success: false, message: 'Invalid action command specified.' });
        }
    } catch (error) {
        console.error('[PROXY ERROR]:', error);
        return res.status(500).json({ success: false, message: 'Internal server proxy error.' });
    }
}
