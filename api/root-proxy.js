import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);


export default async function handler(req, res) {
    // CORS হেডার যুক্ত করা
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const { action, company_id, user_id, composite_user_id, payload } = req.body;

    try {
        switch (action) {
            case 'LOGIN': {
                const { password } = payload;
                const { data, error } = await supabaseServer
                    .from('buy_new_license')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id)
                    .single();

                if (error || !data) {
                    return res.status(401).json({ success: false, message: 'Invalid User or Company ID!' });
                }

                if (data.password !== password) {
                    return res.status(401).json({ success: false, message: 'Incorrect Password!' });
                }

                return res.status(200).json({ success: true, user: data });
            }

            case 'FETCH_DASHBOARD_DATA': {
                // সমান্তরালভাবে (parallel) ডাটাবেজ থেকে সব রেকর্ড ফেচ করা
                const [incomeExpenseRes, loanRes, dailyExpenseRes] = await Promise.all([
                    supabaseServer.from('income_expense').select('*').eq('composite_user_id', composite_user_id),
                    supabaseServer.from('loan_records').select('*').eq('composite_user_id', composite_user_id),
                    supabaseServer.from('daily_expenses').select('*').eq('composite_user_id', composite_user_id)
                ]);

                return res.status(200).json({
                    success: true,
                    data: {
                        income_expense: incomeExpenseRes.data || [],
                        loan_records: loanRes.data || [],
                        daily_expenses: dailyExpenseRes.data || []
                    }
                });
            }

            case 'BUY_NEW_LICENSE': {
                const { customer_mobile, customer_email, payment_id } = payload;
                const { data, error } = await supabaseServer
                    .from('buy_new_license')
                    .insert([{ 
                        customer_mobile, 
                        customer_email, 
                        payment_id: payment_id || '', 
                        status: 'Pending', 
                        created_at: new Date() 
                    }]);

                if (error) throw error;
                return res.status(200).json({ success: true, data });
            }

            case 'ADD_INCOME_EXPENSE': {
                const { entry_type, entry_date, description, amount } = payload;
                const { data, error } = await supabaseServer
                    .from('income_expense')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        entry_type,
                        entry_date,
                        description,
                        amount
                    }]);

                if (error) throw error;
                return res.status(200).json({ success: true, data });
            }

            case 'ADD_LOAN': {
                const { loan_category, entry_date, person_name, amount } = payload;
                const { data, error } = await supabaseServer
                    .from('loan_records')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        loan_category,
                        entry_date,
                        person_name,
                        amount
                    }]);

                if (error) throw error;
                return res.status(200).json({ success: true, data });
            }

            case 'ADD_DAILY_EXPENSE': {
                const { expense_date, description, amount, status } = payload;
                const { data, error } = await supabaseServer
                    .from('daily_expenses')
                    .insert([{
                        company_id,
                        user_id,
                        composite_user_id,
                        expense_date,
                        description,
                        amount,
                        status
                    }]);

                
                if (error) throw error;
                return res.status(200).json({ success: true, data });
            }

            default:
                return res.status(400).json({ success: false, error: 'Invalid Action Provided' });
        }
    } catch (err) {
        console.error('Proxy Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}
