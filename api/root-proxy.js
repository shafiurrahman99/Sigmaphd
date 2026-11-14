            case 'FETCH_DASHBOARD_DATA':
                // ১. ডেইলিস খরচ ফেচ করা
                const { data: dailyExpenses, error: dExpErr } = await supabase
                    .from('daily_expenses')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id);
                if (dExpErr) throw dExpErr;

                // ২. লোন রেকর্ড ফেচ করা
                const { data: loanRecords, error: lRecErr } = await supabase
                    .from('loan_records')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id);
                if (lRecErr) throw lRecErr;

                // ৩. ইনকাম ও এক্সপেন্স রেকর্ড ফেচ করা
                const { data: incomeExpense, error: incExpListErr } = await supabase
                    .from('income_expense')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id);
                if (incExpListErr) throw incExpListErr;

                result = {
                    success: true,
                    data: {
                        daily_expenses: dailyExpenses,
                        loan_records: loanRecords,
                        income_expense: incomeExpense
                    }
                };
                break;


            case 'LOGIN':
                const { data: userAuth, error: authError } = await supabase
                    .from('users_auth')
                    .select('*')
                    .eq('company_id', company_id)
                    .eq('user_id', user_id)
                    .single();

                if (authError || !userAuth) {
                    result = { success: false, message: 'User not found' };
                } else if (userAuth.password && userAuth.password !== payload.password) {
                    result = { success: false, message: 'Incorrect password!' };
                } else {
                    result = { success: true, user: userAuth };
                }
                break;
