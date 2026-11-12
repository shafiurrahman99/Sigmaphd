import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করা
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'Server environment variables (SUPABASE_URL or SUPABASE_ANON_KEY) are missing!' 
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const { action, payload } = req.body || {};

    // ১. সুপার এডমিন ভেরিফিকেশন (লগইন)
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};
      const { data, error } = await supabaseClient.rpc('verify_super_admin', {
        p_admin_id: admin_id,
        p_password: password
      });

      if (error) {
        // পাসওয়ার্ড ভুল বা ডেটাবেজ এরর হলে সঠিক JSON ফরম্যাটে এরর রিটার্ন করা
        return res.status(200).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, data });
    }

    // ২. কোম্পানি ডেটা ফেচিং
    if (action === 'get_company') {
      const { company_id } = payload || {};
      const { data, error } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('company_id', company_id)
        .maybeSingle();

      if (error) {
        return res.status(200).json({ success: false, error: error.message });
      }
      return res.status(200).json({ success: true, data });
    }

    return res.status(200).json({ success: false, error: 'Invalid action specified' });

  } catch (err) {
    // যেকোনো আনহ্যান্ডলড এক্সেপশন বা সার্ভার ক্র্যাশ রোধে JSON আকারে এরর পাঠানো
    return res.status(200).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
