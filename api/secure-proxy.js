import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করা
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel Environment Variables থেকে সিক্রেট মানগুলো নেওয়া
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server environment variables not configured!' });
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { action, payload } = req.body;

    // ১. সুপার এডমিন ভেরিফিকেশন RPC কল
    if (action === 'verify_admin') {
      const { admin_id, password } = payload;
      const { data, error } = await supabaseClient.rpc('verify_super_admin', {
        p_admin_id: admin_id,
        p_password: password
      });

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ২. কোম্পানি লগইন বা ডেটা ফেচিং এর জন্য
    if (action === 'get_company') {
      const { company_id } = payload;
      const { data, error } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('company_id', company_id)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // অন্য কোনো অ্যাকশন হলে
    return res.status(400).json({ error: 'Invalid action specified' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
