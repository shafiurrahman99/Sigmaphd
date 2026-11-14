import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';
const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { action, payload } = req.body || {};

    // ১. সুপার এডমিন ভেরিফিকেশন প্রক্সি
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};
      
      const { data, error } = await supabaseServer
        .from('super_admin_vault')
        .select('*')
        .eq('admin_id', admin_id)
        .maybeSingle();

      if (error || !data || String(data.password).trim() !== String(password).trim()) {
        return res.status(200).json({ success: false, error: 'ভুল এডমিন আইডি বা পাসওয়ার্ড!' });
      }

      const token = jwt.sign({ admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });
      return res.status(200).json({ success: true, token, data: { admin_id } });
    }

    // ২. কোম্পানি ডেটা ফেচিং প্রক্সি
    if (action === 'get_company') {
      const { company_id } = payload || {};
      
      const { data, error } = await supabaseServer
        .from('companies')
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
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
