import { createClient } from '@supabase/supabase-js';

// --- SigmaPHD Environment Variables Mapping ---
const SUPABASE_URL = process.env.SIGMAPHD_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SIGMAPHD_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const { action, company_id, user_id, composite_user_id, payload } = req.body;
        let result = { success: false };

        switch (action) {
            case 'LOGIN':
                const { data: userAuth, error: authError } = await supabase
                    .from('users_auth')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id)
                    .single();

                if (authError || !userAuth) {
                    result = { success: false, message: 'User not found' };
                } else {
                    result = { success: true, user: userAuth };
                }
                break;

            case 'ADD_INCOME_EXPENSE':
                const { error: incExpErr } = await supabase
                    .from('income_expense')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        entry_type: payload.entry_type,
                        entry_date: payload.entry_date,
                        description: payload.description,
                        amount: payload.amount
                    }]);
                
                if (incExpErr) throw incExpErr;
                result = { success: true, message: 'Income/Expense added successfully' };
                break;

            case 'ADD_LOAN':
                const { error: loanErr } = await supabase
                    .from('loan_records')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        loan_category: payload.loan_category,
                        entry_date: payload.entry_date,
                        person_name: payload.person_name,
                        amount: payload.amount,
                        is_returned: false
                    }]);

                if (loanErr) throw loanErr;
                result = { success: true, message: 'Loan record saved' };
                break;

            case 'SETTLE_LOAN':
                const { error: settleErr } = await supabase
                    .from('loan_records')
                    .update({ 
                        is_returned: true, 
                        return_date: payload.return_date, 
                        extra_fee_or_charge: payload.extra_fee_or_charge 
                    })
                    .eq('id', payload.id);

                if (settleErr) throw settleErr;
                result = { success: true, message: 'Loan settled successfully' };
                break;

            case 'ADD_DAILY_EXPENSE':
                const { error: expErr } = await supabase
                    .from('daily_expenses')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        expense_date: payload.expense_date,
                        description: payload.description,
                        amount: payload.amount,
                        status: payload.status
                    }]);

                if (expErr) throw expErr;
                result = { success: true, message: 'Daily expense recorded' };
                break;

            case 'SAVE_BUSINESS_PROFILE':
                const { error: profileErr } = await supabase
                    .from('business_profile')
                    .upsert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        company_name: payload.company_name,
                        address: payload.address,
                        mobile: payload.mobile,
                        footer_note: payload.footer_note
                    }], { onConflict: 'company_id,user_id' });

                if (profileErr) throw profileErr;
                result = { success: true, message: 'Business profile saved' };
                break;

            case 'REQUEST_LOT':
            case 'APPROVE_LOT':
                const { error: lotErr } = await supabase
                    .from('lot_inventory')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        lot_no: payload.lot_no,
                        quantity: payload.quantity,
                        net_payable: payload.net_payable,
                        status: payload.status || 'Pending'
                    }]);

                if (lotErr) throw lotErr;
                result = { success: true, message: 'Lot request handled' };
                break;

            case 'SELL_LOT_ID':
                const { error: sellErr } = await supabase
                    .from('lot_licenses')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        lot_no: payload.lot_no,
                        assigned_user_id: payload.assigned_user_id,
                        assigned_password: payload.assigned_password,
                        seller_token: payload.seller_token,
                        buyer_info: payload.buyer_info,
                        is_sold: true
                    }]);

                if (sellErr) throw sellErr;
                result = { success: true, message: 'License sold successfully' };
                break;

            default:
                return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
        }

        return res.status(200).json(result);

    } catch (err) {
        console.error('Root Proxy Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}
