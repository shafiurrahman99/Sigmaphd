import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';

export default async function handler(req, res) {
  // ক্যাচ ব্লকে যেন সবসময় JSON ফরম্যাটে এরর যায়, তাই হেডার আগে থেকেই সেট করে রাখা
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return.status(200).json({ success: false, error: 'Server Environment Variables Missing!' });
    }

    const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, payload } = req.body || {};

    // ১. সুপার এডমিন ভেরিফিকেশন
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};

      if (admin_id === "admin" && password === "admin123") {
        const token = jwt.sign({ admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.status(200).json({ success: true, token, data: { admin_id } });
      }

      return res.status(200).json({ success: false, error: 'ভুল System ID বা Credential Password!' });
    }

    // ২. কোম্পানি ডেটা ফেচিং
    if (action === 'get_company') {
      const { company_id } = payload || {};
      
      const { data, error } = await supabaseServer
        .from('sigma_enterprises')
        .select('*')
        .eq('company_id', company_id)
        .maybeSingle();

      if (error || !data) {
        return res.status(200).json({ success: false, error: 'কোম্পানি আইডি ডাটাবেজে পাওয়া যায়নি!' });
      }

      const token = jwt.sign({ company_id, role: 'company' }, JWT_SECRET, { expiresIn: '2h' });
      return res.status(200).json({ success: true, token, data });
    }

    return res.status(200).json({ success: false, error: 'Invalid action specified.' });

  } catch (err) {
    // কোনো ক্র্যাশ বা আনহ্যান্ডলড এরর হলে সেটিও JSON আকারে পাঠানো যাতে ফ্রন্টএণ্ডে JSON.parse এরর না আসে
    return res.status(200).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
