import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SIGMAPHD_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SIGMAPHD_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SIGMAPHD_JWT_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'sigma-root-proxy-secret';

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RATE_PER_MONTH = 100; // ১ মাস (৩০ দিন) = ৳১০০

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

function extractSessionToken(req, parsedBody, payload) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
    return parsedBody?.session_token || payload?.session_token || bearer || '';
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

function getValidityExpiryMs(accountRow = {}) {
    if (accountRow.validity_expires_at) {
        const ts = new Date(accountRow.validity_expires_at).getTime();
        if (!Number.isNaN(ts)) return ts;
    }
    if (accountRow.activated_at) {
        const baseTs = new Date(accountRow.activated_at).getTime();
        const days = Number(accountRow.validity_days) || 0;
        if (!Number.isNaN(baseTs) && days > 0) {
            return baseTs + (days * 24 * 60 * 60 * 1000);
        }
    }
    return 0;
}

async function getTargetAccount(supabase, compositeUserId, fallbackCompanyId, payload = {}) {
    const targetCompId = compositeUserId || payload?.composite_user_id;

    if (targetCompId) {
        const { data, error } = await supabase
            .from('accounts_master')
            .select('*')
            .eq('composite_user_id', targetCompId)
            .single();

        if (!error && data) return data;
    }

    const fallbackUserName = payload?.user_name ? String(payload.user_name).trim() : '';
    if (fallbackUserName) {
        let query = supabase
            .from('accounts_master')
            .select('*')
            .eq('user_name', fallbackUserName);

        if (fallbackCompanyId) {
            query = query.eq('company_id', fallbackCompanyId);
        }

        const { data, error } = await query.limit(1).maybeSingle();
        if (!error && data) return data;
    }

    return null;
}

function normalizeLoanStatus(rawStatus, settledDate = null) {
    const clean = String(rawStatus ?? '').trim().toLowerCase();
    if (clean === 'paid' || clean === 'settled' || clean === 'completed') return 'Paid';
    if (clean === 'due received' || clean === 'received') return 'Due Received';
    if (settledDate && String(settledDate).trim() !== '' && clean !== 'due') return 'Paid';
    return 'Due';
}

function mapIncomeExpensePayload(record, compositeUserId) {
    const type = (record.type || record.income_expense_type || 'income').toString().toLowerCase() === 'expense'
        ? 'expense'
        : 'income';
    const rawStatus = String(record.status || record.income_expense_status || 'Paid').trim().toLowerCase();
    const status = rawStatus === 'due' ? 'Due' : 'Paid';
    const amount = Number(record.amount ?? record.income_expense_amount ?? 0);

    return {
        composite_user_id: compositeUserId,
        income_expense_type: type,
        income_expense_date: record.date || record.income_expense_date || new Date().toISOString().slice(0, 10),
        income_expense_description: String(record.desc ?? record.description ?? record.income_expense_description ?? '').trim().slice(0, 250),
        income_expense_amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        income_expense_status: status
    };
}

function mapLoanPayload(record, compositeUserId) {
    const rawDir = String(record.direction || record.loan_category || record.loan_type || record.loan_records_direction || 'receivable').toLowerCase();
    const direction = rawDir === 'payable' ? 'payable' : 'receivable';
    const settledDate = record.settled_date || record.settle_date || record.loan_records_settled_date || null;
    const status = normalizeLoanStatus(record.status ?? record.loan_records_status ?? 'Due', settledDate);
    const amount = Number(record.amount ?? record.loan_records_amount ?? 0);
    const extraAmount = Number(record.extra_amount ?? record.loan_records_extra_amount ?? 0);

    return {
        composite_user_id: compositeUserId,
        loan_records_direction: direction,
        loan_records_description: String(record.description ?? record.person_name ?? record.loan_records_description ?? '').trim().slice(0, 250),
        loan_records_amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        loan_records_entry_date: record.entry_date || record.date || record.loan_records_entry_date || new Date().toISOString().slice(0, 10),
        loan_records_settled_date: settledDate,
        loan_records_extra_amount: Number.isFinite(extraAmount) && extraAmount >= 0 ? extraAmount : 0,
        loan_records_status: status,
        loan_records_source: String(record.source ?? record.loan_records_source ?? 'Ledger').trim().slice(0, 60)
    };
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
    if (!Array.isArray(ids) || ids.length === 0) {
        return { error: { message: 'ids array is required.' }, invalidInput: true };
    }

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
        const { action, company_id = '101', composite_user_id, payload } = parsedBody;

        const publicActions = [
            'authenticate_user',
            'fetch_dashboard_data',
            'buy_lot',
            'buy_validity',
            'preview_validity_cart',
            'register_new_license'
        ];

        const token = extractSessionToken(req, parsedBody, payload);
        const session = verifySessionToken(token);
        const effectiveCompositeUserId = session?.composite_user_id || composite_user_id || payload?.composite_user_id;
        const effectiveRole = session?.role || 'User';

        if (!effectiveCompositeUserId && !publicActions.includes(action)) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Missing Composite User ID context.' });
        }

        switch (action) {
            case 'authenticate_user': {
                const { user_name, password } = payload || {};
                if (!user_name || !password) {
                    return res.status(200).json({ success: false, message: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই প্রদান করুন।' });
                }

                const cleanUserName = String(user_name).trim();
                const cleanPassword = String(password).trim();

                const { data, error } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('company_id', company_id)
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
                    company_id: data.company_id || company_id,
                    role: data.role || 'User'
                });

                const { password: _hiddenPassword, ...safeUser } = data;

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
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .order('income_expense_date', { ascending: false })
                        .order('created_at', { ascending: false }),
                    supabaseServer
                        .from('loan_records')
                        .select('*')
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .eq('loan_records_direction', 'receivable')
                        .order('loan_records_entry_date', { ascending: false }),
                    supabaseServer
                        .from('loan_records')
                        .select('*')
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .eq('loan_records_direction', 'payable')
                        .order('loan_records_entry_date', { ascending: false }),
                    supabaseServer
                        .from('income_expense')
                        .select('*')
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .eq('income_expense_type', 'expense')
                        .order('income_expense_date', { ascending: false })
                        .order('created_at', { ascending: false }),
                    supabaseServer.from('accounts_master').select('*').eq('company_id', company_id),
                    supabaseServer
                        .from('forum_chat')
                        .select('*')
                        .eq('company_id', company_id)
                        .eq('chat_channel', 'Public_Forum')
                        .order('created_at', { ascending: true })
                ]);

                const normalizedLoansRec = (loansRec.data || []).map((r) => ({
                    ...r,
                    loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                }));
                const normalizedLoansPay = (loansPay.data || []).map((r) => ({
                    ...r,
                    loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                }));

                return res.status(200).json({
                    success: true,
                    income_expenses: incExp.data || [],
                    loans_receivable: normalizedLoansRec,
                    loans_payable: normalizedLoansPay,
                    daily_expenses: marketExp.data || [],
                    accounts: accounts.data || [],
                    public_chats: chats.data || []
                });
            }

            case 'fetch_ledger': {
                const [ieRows, loanRows] = await Promise.all([
                    supabaseServer
                        .from('income_expense')
                        .select('*')
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .order('income_expense_date', { ascending: false })
                        .order('created_at', { ascending: false })
                        .order('id', { ascending: false }),
                    supabaseServer
                        .from('loan_records')
                        .select('*')
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .order('loan_records_entry_date', { ascending: false })
                        .order('created_at', { ascending: false })
                        .order('id', { ascending: false })
                ]);

                if (ieRows.error) throw ieRows.error;
                if (loanRows.error) throw loanRows.error;

                const normalizedLoans = (loanRows.data || []).map((r) => ({
                    ...r,
                    loan_records_status: normalizeLoanStatus(r.loan_records_status, r.loan_records_settled_date)
                }));

                return res.status(200).json({
                    ok: true,
                    success: true,
                    composite_user_id: effectiveCompositeUserId,
                    income_expense: ieRows.data || [],
                    loan_records: normalizedLoans
                });
            }

            case 'user_password_change': {
                const { new_username, old_password, new_password, user_id } = payload || {};
                const targetKey = effectiveCompositeUserId || user_id;

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

                const updatedUserName = new_username ? String(new_username).trim() : userRecord.user_name;

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

            case 'save_income_expense':
            case 'insert_income_expense': {
                const srcRecord = payload?.record || payload || {};
                const rowToInsert = mapIncomeExpensePayload(srcRecord, effectiveCompositeUserId);
                if (rowToInsert.income_expense_amount <= 0) {
                    return res.status(400).json({ ok: false, success: false, message: 'Valid positive amount is required.' });
                }

                const { data: inserted, error } = await supabaseServer
                    .from('income_expense')
                    .insert([rowToInsert])
                    .select()
                    .single();
                if (error) throw error;

                return res.status(200).json({
                    ok: true,
                    success: true,
                    data: inserted,
                    message: 'Income/Expense recorded securely.'
                });
            }

            case 'update_income_expense_status': {
                const id = parsedBody.id ?? payload?.id;
                const rawStatus = String(parsedBody.status ?? payload?.status ?? 'Paid').trim().toLowerCase();
                const status = rawStatus === 'due' ? 'Due' : 'Paid';
                if (!id) {
                    return res.status(400).json({ ok: false, success: false, message: 'id is required.' });
                }

                const { data: updated, error } = await supabaseServer
                    .from('income_expense')
                    .update({ income_expense_status: status })
                    .eq('id', id)
                    .eq('composite_user_id', effectiveCompositeUserId)
                    .select()
                    .single();
                if (error) throw error;

                if (updated && status === 'Paid') {
                    const payableTag = `[ExpDue#${updated.id}]`;
                    const settledDate = new Date().toISOString().slice(0, 10);
                    await supabaseServer
                        .from('loan_records')
                        .update({
                            loan_records_status: 'Paid',
                            loan_records_settled_date: settledDate
                        })
                        .eq('composite_user_id', effectiveCompositeUserId)
                        .ilike('loan_records_description', `%${payableTag}%`);
                }

                return res.status(200).json({ ok: true, success: true, data: updated });
            }

            case 'delete_income_expense':
            case 'delete_income_entries': {
                const ids = extractDeleteIds(parsedBody, payload);
                if (ids.length === 0) {
                    return res.status(400).json({ ok: false, success: false, message: 'ids array is required.' });
                }

                const { data, error } = await deleteIncomeExpenseRows(ids, effectiveCompositeUserId);
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'delete_market_expenses': {
                const ids = extractDeleteIds(parsedBody, payload);
                if (ids.length === 0) {
                    return res.status(400).json({ ok: false, success: false, message: 'ids array is required.' });
                }

                const { data, error } = await deleteIncomeExpenseRows(ids, effectiveCompositeUserId, {
                    column: 'income_expense_type',
                    value: 'expense'
                });
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'delete_monthly_summary': {
                const ids = extractDeleteIds(parsedBody, payload);
                const months = Array.isArray(parsedBody?.months)
                    ? parsedBody.months
                    : (Array.isArray(payload?.months) ? payload.months : []);

                if (ids.length > 0) {
                    const { data, error } = await deleteIncomeExpenseRows(ids, effectiveCompositeUserId);
                    if (error) throw error;
                    return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
                }

                if (months.length > 0) {
                    const { data: rows, error: fetchErr } = await supabaseServer
                        .from('income_expense')
                        .select('id, income_expense_date')
                        .eq('composite_user_id', effectiveCompositeUserId);
                    if (fetchErr) throw fetchErr;

                    const monthSet = new Set(months.map((m) => String(m).slice(0, 7)));
                    const matchedIds = (rows || [])
                        .filter((r) => monthSet.has(String(r.income_expense_date || '').slice(0, 7)))
                        .map((r) => r.id);

                    if (matchedIds.length === 0) {
                        return res.status(200).json({ ok: true, success: true, deleted: 0, ids: [] });
                    }

                    const { data, error } = await deleteIncomeExpenseRows(matchedIds, effectiveCompositeUserId);
                    if (error) throw error;
                    return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids: matchedIds });
                }

                return res.status(400).json({ ok: false, success: false, message: 'ids or months is required.' });
            }

            case 'save_loan':
            case 'insert_loan_record': {
                const srcRecord = payload?.record || payload || {};
                const rowToInsert = mapLoanPayload(srcRecord, effectiveCompositeUserId);
                if (rowToInsert.loan_records_amount <= 0) {
                    return res.status(400).json({ ok: false, success: false, message: 'Valid positive loan amount is required.' });
                }

                const { data: inserted, error } = await supabaseServer
                    .from('loan_records')
                    .insert([rowToInsert])
                    .select()
                    .single();
                if (error) throw error;

                if (inserted.loan_records_direction === 'receivable' && Number(inserted.loan_records_amount || 0) > 0) {
                    const baseAmt = Number(inserted.loan_records_amount);
                    const entryDate = inserted.loan_records_entry_date || new Date().toISOString().slice(0, 10);
                    const descText = `Receivable Out (${inserted.loan_records_description || 'Entry'}) [Loan#${inserted.id}]`;

                    await supabaseServer.from('income_expense').insert([{
                        composite_user_id: effectiveCompositeUserId,
                        income_expense_type: 'expense',
                        income_expense_date: entryDate,
                        income_expense_description: descText,
                        income_expense_amount: baseAmt,
                        income_expense_status: 'Paid'
                    }]);
                }

                return res.status(200).json({
                    ok: true,
                    success: true,
                    data: inserted,
                    message: 'Loan record synchronized.'
                });
            }

            case 'settle_loan':
            case 'settle_loan_record': {
                const rec = payload?.record || payload || {};
                const id = rec.id;
                if (!id) {
                    return res.status(400).json({ ok: false, success: false, message: 'id is required.' });
                }

                const { data: existingLoan, error: fetchLoanErr } = await supabaseServer
                    .from('loan_records')
                    .select('*')
                    .eq('id', id)
                    .eq('composite_user_id', effectiveCompositeUserId)
                    .single();
                if (fetchLoanErr || !existingLoan) throw fetchLoanErr || new Error('Loan record not found.');

                const rawNextStatus = rec.loan_records_status ?? rec.status ?? 'Paid';
                const nextSettledDate = rec.loan_records_settled_date || rec.settled_date || rec.settle_date || new Date().toISOString().slice(0, 10);
                const nextStatus = normalizeLoanStatus(rawNextStatus, nextSettledDate);
                const nextExtraAmount = Math.max(0, Number(rec.loan_records_extra_amount ?? rec.extra_amount ?? existingLoan.loan_records_extra_amount ?? 0) || 0);

                const { data: updated, error } = await supabaseServer
                    .from('loan_records')
                    .update({
                        loan_records_status: nextStatus,
                        loan_records_settled_date: nextSettledDate,
                        loan_records_extra_amount: nextExtraAmount
                    })
                    .eq('id', id)
                    .eq('composite_user_id', effectiveCompositeUserId)
                    .select()
                    .single();
                if (error) throw error;

                const isSettledNow = ['Paid', 'Due Received'].includes(String(nextStatus));
                const principalAmount = Number(updated.loan_records_amount || 0);

                if (updated.loan_records_direction === 'receivable' && isSettledNow) {
                    const totalReceivedIncome = principalAmount + nextExtraAmount;
                    if (totalReceivedIncome > 0) {
                        const tag = `[LoanSettle#${updated.id}]`;
                        const { data: existingInc } = await supabaseServer
                            .from('income_expense')
                            .select('id')
                            .eq('composite_user_id', effectiveCompositeUserId)
                            .ilike('income_expense_description', `%${tag}%`);

                        if (!existingInc || existingInc.length === 0) {
                            await supabaseServer.from('income_expense').insert([{
                                composite_user_id: effectiveCompositeUserId,
                                income_expense_type: 'income',
                                income_expense_date: nextSettledDate,
                                income_expense_description: `Receivable Settled (${updated.loan_records_description || 'Loan'}) - Principal + Extra ${tag}`,
                                income_expense_amount: totalReceivedIncome,
                                income_expense_status: 'Paid'
                            }]);
                        }
                    }
                }

                if (updated.loan_records_direction === 'payable' && isSettledNow) {
                    const descStr = String(updated.loan_records_description || '');
                    const expDueMatch = descStr.match(/\[ExpDue#([^\]]+)\]/);

                    if (expDueMatch && expDueMatch[1]) {
                        const linkedExpId = expDueMatch[1];
                        const totalExpenseAmt = principalAmount + nextExtraAmount;
                        await supabaseServer
                            .from('income_expense')
                            .update({
                                income_expense_status: 'Paid',
                                income_expense_date: nextSettledDate,
                                income_expense_amount: totalExpenseAmt > 0 ? totalExpenseAmt : principalAmount
                            })
                            .eq('id', linkedExpId)
                            .eq('composite_user_id', effectiveCompositeUserId);
                    } else if (nextExtraAmount > 0) {
                        const tag = `[PayableExtra#${updated.id}]`;
                        const { data: existingExp } = await supabaseServer
                            .from('income_expense')
                            .select('id')
                            .eq('composite_user_id', effectiveCompositeUserId)
                            .ilike('income_expense_description', `%${tag}%`);

                        if (!existingExp || existingExp.length === 0) {
                            await supabaseServer.from('income_expense').insert([{
                                composite_user_id: effectiveCompositeUserId,
                                income_expense_type: 'expense',
                                income_expense_date: nextSettledDate,
                                income_expense_description: `Payable Extra Expense (${updated.loan_records_description || 'Payable'}) ${tag}`,
                                income_expense_amount: nextExtraAmount,
                                income_expense_status: 'Paid'
                            }]);
                        }
                    }
                }

                return res.status(200).json({
                    ok: true,
                    success: true,
                    data: updated,
                    message: 'Loan settlement processed.'
                });
            }

            case 'delete_loan_records':
            case 'delete_loan_entries':
            case 'delete_loans': {
                const ids = extractDeleteIds(parsedBody, payload);
                if (ids.length === 0) {
                    return res.status(400).json({ ok: false, success: false, message: 'ids array is required.' });
                }

                const { data, error } = await supabaseServer
                    .from('loan_records')
                    .delete()
                    .in('id', ids)
                    .eq('composite_user_id', effectiveCompositeUserId)
                    .select('id');
                if (error) throw error;
                return res.status(200).json({ ok: true, success: true, deleted: (data || []).length, ids });
            }

            case 'save_market_expense': {
                const { expense_date, description, amount, status } = payload || {};
                const cleanStatus = String(status || 'Paid').trim().toLowerCase() === 'due' ? 'Due' : 'Paid';
                const rowToInsert = mapIncomeExpensePayload(
                    {
                        type: 'expense',
                        date: expense_date,
                        desc: description,
                        amount,
                        status: cleanStatus
                    },
                    effectiveCompositeUserId
                );

                if (rowToInsert.income_expense_amount <= 0) {
                    return res.status(200).json({ success: false, message: 'সঠিক পরিমাণ অ্যামাউন্ট প্রদান করুন।' });
                }

                const { data: insertedExp, error } = await supabaseServer
                    .from('income_expense')
                    .insert([rowToInsert])
                    .select()
                    .single();
                if (error) throw error;

                if (cleanStatus === 'Due' && Number(insertedExp.income_expense_amount || 0) > 0) {
                    const expTag = `[ExpDue#${insertedExp.id}]`;
                    const cleanDesc = String(insertedExp.income_expense_description || 'Due Expense').trim();
                    await supabaseServer.from('loan_records').insert([{
                        composite_user_id: effectiveCompositeUserId,
                        loan_records_direction: 'payable',
                        loan_records_description: `${cleanDesc} ${expTag}`,
                        loan_records_amount: Number(insertedExp.income_expense_amount),
                        loan_records_entry_date: insertedExp.income_expense_date || new Date().toISOString().slice(0, 10),
                        loan_records_settled_date: null,
                        loan_records_extra_amount: 0,
                        loan_records_status: 'Due',
                        loan_records_source: 'Daily Expense'
                    }]);
                }

                return res.status(200).json({
                    success: true,
                    data: insertedExp,
                    message: cleanStatus === 'Due'
                        ? 'Due expense added to Payable until Paid.'
                        : 'Daily market expense logged.'
                });
            }

            case 'buy_lot': {
                const { lot_id, quantity } = payload || {};
                const qtyNum = Math.min(200, Math.max(1, parseInt(quantity, 10) || 1));
                const compId = effectiveCompositeUserId ? effectiveCompositeUserId.split('_')[0] : company_id;
                const ownerId = effectiveCompositeUserId || (compId + '_admin');
                const rowsToInsert = [];

                for (let i = 1; i <= qtyNum; i++) {
                    const subId = `sub_${String(lot_id || 'LOT').toLowerCase().replace(/[^a-z0-9]/g, '')}_${String(i).padStart(2, '0')}`;
                    rowsToInsert.push({
                        company_id: compId,
                        user_id: subId,
                        user_name: 'user_' + crypto.randomInt(1000, 9999),
                        password: 'pass' + crypto.randomInt(1000, 9999),
                        role: 'User',
                        status: 'In_Stock',
                        request_type: 'Lot',
                        lot_id: String(lot_id || '').trim(),
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
                const { seller_composite_id, sold_item_id, buyer_name, buyer_mobile, buyer_email, coupon_code } = payload || {};

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

                const directBonus = 8.00;
                const chainPoolTotal = 2.00;
                let totalSellerNewBalance = Number(sellerData?.wallet_balance || 0) + directBonus;

                const uplinesChain = [];
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

                const N = uplinesChain.length;

                if (N === 0) {
                    totalSellerNewBalance += chainPoolTotal;
                } else {
                    const totalWeight = (N * (N + 1)) / 2;

                    for (let i = 0; i < N; i++) {
                        const currentWeight = N - i;
                        const shareAmount = (chainPoolTotal * currentWeight) / totalWeight;

                        const targetCompositeId = uplinesChain[i].composite_user_id;
                        const targetOldBalance = Number(uplinesChain[i].wallet_balance || 0);

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
                const { name, mobile, email } = payload || {};
                const compId = company_id || '101';
                const randomUserName = 'user_' + crypto.randomInt(1000, 9999);
                const defaultAdminCompositeId = compId + '_admin';

                const { error } = await supabaseServer.from('accounts_master').insert([{
                    company_id: compId,
                    user_id: 'user_' + crypto.randomInt(1000, 9999),
                    user_name: randomUserName,
                    password: 'pass' + crypto.randomInt(1000, 9999),
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
                const accountRow = await getTargetAccount(supabaseServer, effectiveCompositeUserId, company_id, payload);

                if (!accountRow) {
                    return res.status(200).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                const discountsMap = await loadDiscountsFromDb(supabaseServer);
                const walletBalance = Number(accountRow.wallet_balance || 0);
                const summary = calculateValidityCart(
                    payload?.items || [],
                    discountsMap,
                    Boolean(payload?.use_coupon_wallet),
                    walletBalance
                );

                return res.status(200).json({
                    success: true,
                    summary: {
                        ...summary,
                        walletBalance,
                        pendingDays: Number(accountRow.pending_validity_days || 0),
                        approvalStatus: accountRow.validity_approval_status || 'NONE',
                    }
                });
            }

            case 'buy_validity': {
                const accountRow = await getTargetAccount(supabaseServer, effectiveCompositeUserId, company_id, payload);

                if (!accountRow) {
                    return res.status(200).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।' });
                }

                const trxId = String(payload?.trx_id || '').trim();
                if (!trxId) {
                    return res.status(200).json({ success: false, message: 'Transaction ID প্রদান করুন।' });
                }

                const discountsMap = await loadDiscountsFromDb(supabaseServer);
                const useCouponWallet = Boolean(payload?.use_coupon_wallet);
                const walletBalance = Number(accountRow.wallet_balance || 0);
                const calc = calculateValidityCart(
                    payload?.items || [],
                    discountsMap,
                    useCouponWallet,
                    walletBalance
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
                    message: `Cash Pay রিকোয়েস্ট (${calc.totalDays} দিন) জমা হয়েছে—Wait for Validity Approval।`,
                    request: reqRow,
                    summary: {
                        ...calc,
                        walletBalance,
                        pendingDays: nextPendingDays,
                        approvalStatus: 'Admin Approval',
                    }
                });
            }

            case 'approve_validity_request': {
                if (session && !['Admin', 'SuperAdmin'].includes(String(effectiveRole))) {
                    return res.status(403).json({ success: false, message: 'Forbidden: Admin permission required.' });
                }

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
                const { recipient_id, amount } = payload || {};
                const transferAmount = parseFloat(amount) || 0;

                if (transferAmount <= 0) {
                    return res.status(200).json({ success: false, message: 'সঠিক পরিমাণ অ্যামাউন্ট প্রদান করুন।' });
                }

                const { data: senderData, error: senderErr } = await supabaseServer
                    .from('accounts_master')
                    .select('wallet_balance, composite_user_id')
                    .eq('composite_user_id', effectiveCompositeUserId)
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

                if (recErr || !recipientData || recipientData.composite_user_id === effectiveCompositeUserId) {
                    return res.status(200).json({ success: false, message: 'প্রাপক ইউজারনেম সঠিক নয় বা পাওয়া যায়নি।' });
                }

                const currentRecipientBalance = parseFloat(recipientData.wallet_balance || 0);

                const { error: updateSenderErr } = await supabaseServer
                    .from('accounts_master')
                    .update({ wallet_balance: currentSenderBalance - transferAmount })
                    .eq('composite_user_id', effectiveCompositeUserId);

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
                const { channel, message } = payload || {};
                const cleanMsg = String(message || '').trim().slice(0, 1000);
                if (!cleanMsg) {
                    return res.status(200).json({ success: false, message: 'খালি মেসেজ পাঠানো যাবে না।' });
                }

                const { error } = await supabaseServer.from('forum_chat').insert([{
                    company_id: effectiveCompositeUserId?.split('_')[0],
                    user_id: effectiveCompositeUserId?.split('_')[1],
                    composite_user_id: effectiveCompositeUserId,
                    sender_role: effectiveRole || 'User',
                    chat_channel: channel || 'Public_Forum',
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
        return res.status(500).json({ success: false, message: error.message || 'Internal server proxy error.' });
    }
}
