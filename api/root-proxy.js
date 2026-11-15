import { createClient } from '@supabase/supabase-js';


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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

    const { action } = req.body || req.query;

    try {
        switch (action) {
            case 'signin': {
                const { userId, password } = req.body;
                if (!userId || !password) {
                    return res.status(400).json({ success: false, message: 'User ID and password are required.' });
                }

                const { data: users, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('user_id', userId);

                if (error || !users || users.length === 0) {
                    return res.status(401).json({ success: false, message: 'Invalid User ID or Password.' });
                }

                const user = users[0];
                if (user.status !== 'approved') {
                    return res.status(403).json({ success: false, message: `Account is currently ${user.status}. Please wait for admin approval.` });
                }

                return res.status(200).json({
                    success: true,
                    message: 'Sign in successful!',
                    user: { company_id: user.company_id, user_id: user.user_id, full_name: user.full_name }
                });
            }

            case 'register': {
                const { companyId, userId, fullName, email, password } = req.body;
                if (!companyId || !userId || !fullName || !email || !password) {
                    return res.status(400).json({ success: false, message: 'All registration fields are required.' });
                }

                const { data, error } = await supabase
                    .from('users')
                    .insert([
                        {
                            company_id: companyId,
                            user_id: userId,
                            full_name: fullName,
                            email: email,
                            password_hash: password,
                            status: 'pending'
                        }
                    ])
                    .select();

                if (error) {
                    return res.status(400).json({ success: false, message: error.message });
                }

                return res.status(201).json({
                    success: true,
                    message: 'Registration submitted successfully. Waiting for admin approval.',
                    data: data[0]
                });
            }

            case 'send_otp': {
                const { userId } = req.body;
                if (!userId) {
                    return res.status(400).json({ success: false, message: 'User ID is required.' });
                }

                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('company_id, user_id, email')
                    .eq('user_id', userId);

                if (userError || !users || users.length === 0) {
                    return res.status(404).json({ success: false, message: 'User ID not found.' });
                }

                const user = users[0];
                const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

                await supabase.from('otp_codes').insert([
                    {
                        company_id: user.company_id,
                        user_id: user.user_id,
                        otp_code: otpCode,
                        expires_at: expiresAt.toISOString(),
                        is_used: false
                    }
                ]);

                return res.status(200).json({
                    success: true,
                    message: `OTP sent successfully for User ID: ${userId}`
                });
            }

            default:
                return res.status(400).json({ success: false, message: 'Invalid action specified.' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
    }
}
