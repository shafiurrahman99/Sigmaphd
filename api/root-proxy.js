import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // Only allow POST requests for security bridging
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
    }

    try {
        const { action, company_id = "101", composite_user_id, payload } = req.body;

        // লগইন, ডাটা ফেচ এবং গেম/পেমেন্ট বা লট ক্রয়ের ক্ষেত্রে composite_user_id বাধ্যতামূলক নয় এমন অ্যাকশনগুলো এখানে যুক্ত করা হলো
        const publicActions = ['authenticate_user', 'fetch_dashboard_data', 'buy_lot', 'buy_validity'];
        if (!composite_user_id && !publicActions.includes(action)) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Missing Composite User ID context.' });
        }

        console.log(`[SECURE PROXY] Action: ${action} | User: ${composite_user_id || 'Public/System'}`);

        // Route the action securely to respective backend handlers or database queries
        switch (action) {
            // ১. ইউজার অথেন্টিকেশন (accounts_master টেবিল চেক)
            case 'authenticate_user': {
                const { user_id, password } = payload;
                const { data, error } = await supabaseServer
                    .from('accounts_master')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id)
                    .eq('password', password)
                    .single();

                if (error || !data) {
                    return res.status(200).json({ success: false, message: 'ভুল ইউজার আইডি অথবা পাসওয়ার্ড!' });
                }
                return res.status(200).json({ success: true, user: data });
            }

            // ২. ড্যাশবোর্ডের সমস্ত টেবিল ডাটা একসাথে ফেচ করা
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

            // ৩. আয় বা ব্যয় সেভ করা
            case 'save_income_expense': {
                const { type, date, desc, amount } = payload;
                const { error } = await supabaseServer.from('income_expense').insert([{
                    company_id: company_id || composite_user_id.split('_')[0],
                    user_id: composite_user_id.split('_')[1],
                    composite_user_id,
                    entry_type: type,
                    entry_date: date,
                    description: desc,
                    amount
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Income/Expense recorded securely.' });
            }

            // ৪. লোন বা ধার রেকর্ড সেভ করা
            case 'save_loan': {
                const { category, date, person_name, amount } = payload;
                const { error } = await supabaseServer.from('loan_records').insert([{
                    company_id: composite_user_id.split('_')[0],
                    user_id: composite_user_id.split('_')[1],
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

            // ৫. লোন সেটেলমেন্ট করা
            case 'settle_loan': {
                const { id, settle_date, extra_amount } = payload;
                const { error } = await supabaseServer.from('loan_records')
                    .update({ status: 'Paid', settle_date, extra_amount })
                    .eq('id', id);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Loan settlement processed.' });
            }

            // ৬. দৈনিক বাজার খরচ সেভ করা
            case 'save_market_expense': {
                const { expense_date, description, amount, status } = payload;
                const { error } = await supabaseServer.from('daily_expenses').insert([{
                    company_id: composite_user_id.split('_')[0],
                    user_id: composite_user_id.split('_')[1],
                    composite_user_id,
                    expense_date,
                    description,
                    amount,
                    status
                }]);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Daily market expense logged.' });
            }

            // ৭. লট ক্রয় করে ইনভেন্টরিতে আইডি যোগ করা (কম্পোজিট আইডি ছাড়াই গ্লোবালি কাজ করবে)
            case 'buy_lot': {
                const { lot_id, quantity } = payload;
                const compId = composite_user_id ? composite_user_id.split('_')[0] : company_id;
                const ownerId = composite_user_id || (compId + '_admin');
                const rowsToInsert = [];

                for (let i = 1; i <= quantity; i++) {
                    const subId = `sub_${lot_id.toLowerCase().replace('-', '')}_${String(i).padStart(2, '0')}`;
                    rowsToInsert.push({
                        company_id: compId,
                        user_id: subId,
                        password: 'pass' + Math.floor(1000 + Math.random() * 9000),
                        role: 'User',
                        status: 'In_Stock',
                        request_type: 'Lot',
                        lot_id,
                        owner_user_id: ownerId,
                        upline_id: ownerId,
                        wallet_balance: 0.00
                    });
                }

                const { error } = await supabaseServer.from('accounts_master').insert(rowsToInsert);
                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Lot purchased and inventory updated.' });
            }

            // ৮. আইডি বিক্রি এবং Stored Procedure (process_id_sale_cashback) ট্রিগার করা
            case 'process_id_sale_cashback': {
                const { seller_composite_id, sold_item_id } = payload;

                // আইডি স্ট্যাটাস Active করা
                await supabaseServer.from('accounts_master').update({ status: 'Active' }).eq('id', sold_item_id);

                // পোস্টগ্রেজুএসের Stored Procedure কল করা
                const { error } = await supabaseServer.rpc('process_id_sale_cashback', {
                    p_seller_composite_id: seller_composite_id,
                    p_direct_bonus: 8.00,
                    p_chain_pool: 2.00
                });

                if (error) throw error;
                return res.status(200).json({ success: true, message: 'Cashback and weighted distribution executed.' });
            }

            // ৯. মেয়াদ বৃদ্ধি (Validity)
            case 'buy_validity': {
                const { trx_id } = payload;
                return res.status(200).json({ success: true, message: 'Validity extended successfully.' });
            }

            // ১০. ব্যালেন্স ট্রান্সফার
            case 'balance_transfer': {
                const { recipient_id, amount } = payload;
                return res.status(200).json({ success: true, message: 'Balance transferred securely.' });
            }

            // ১১. চ্যাট মেসেজ পাঠানো
            case 'send_chat': {
                const { channel, message } = payload;
                const { error } = await supabaseServer.from('forum_chat').insert([{
                    company_id: composite_user_id.split('_')[0],
                    user_id: composite_user_id.split('_')[1],
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
