import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Critical Error: Supabase URL or Service Role Key is missing!');
}

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Rate Limiting
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (!ipRequestCounts.has(clientIp)) {
    ipRequestCounts.set(clientIp, { count: 1, startTime: now });
  } else {
    let ipData = ipRequestCounts.get(clientIp);
    if (now - ipData.startTime < RATE_LIMIT_WINDOW) {
      ipData.count++;
      if (ipData.count > MAX_REQUESTS) {
        return res.status(429).json({ success: false, error: 'Too many requests! Rate limit exceeded.' });
      }
    } else {
      ipRequestCounts.set(clientIp, { count: 1, startTime: now });
    }
  }

  try {
    const { action, payload } = req.body || {};

    // --- ১. সুপার এডমিন ভেরিফিকেশন (Initial Auth & Super Admin Login) ---
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};
      
      // আপনি যদি ডেটাবেজ টেবিল থেকে এডমিন চেক করতে চান:
      const { data, error } = await supabaseServer
        .from('sigma_enterprises')
        .select('*')
        .eq('company_id', 0) // সুপার এডমিনের জন্য আইডি 0 ধরে নিতে পারেন অথবা আলাদা টেবিল রাখতে পারেন
        .maybeSingle();

      // ডিফল্ট বা ডেটাবেজ ভিত্তিক পাসওয়ার্ড ভ্যালিডেশন
      if ((admin_id === "admin" && password === "admin123") || (data && String(data.secret_pass).trim() === String(password).trim())) {
        const token = jwt.sign({ admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.status(200).json({ success: true, token, data: { admin_id: admin_id } });
      }

      return res.status(200).json({ success: false, error: 'ভুল System ID বা Credential Password!' });
    }

    // --- ২. কোম্পানি ডেটা ফেচিং ও লগইন ---
    if (action === 'get_company') {
      const { company_id } = payload || {};
      
      const { data, error } = await supabaseServer
        .from('sigma_enterprises')
        .select('company_id, secret_pass, layout_html, style_css, interfacebuttonlogic_js, databasefacing_js, advanceengine_js')
        .eq('company_id', company_id)
        .maybeSingle();

      if (error || !data) {
        return res.status(200).json({ success: false, error: 'কোম্পানি আইডি ডাটাবেজে পাওয়া যায়নি!' });
      }

      const token = jwt.sign({ company_id, role: 'company' }, JWT_SECRET, { expiresIn: '2h' });

      return res.status(200).json({ success: true, token, data });
    }

    return res.status(200).json({ success: false, error: 'Invalid action specified in proxy request.' });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
