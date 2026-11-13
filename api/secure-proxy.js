import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// ১. পরিবেশ ভ্যারিয়েবল লোড করা (আপনার Vercel ড্যাশবোর্ডের সাথে হুবহু মিল রেখে)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Critical Error: Supabase URL or Service Role Key is missing in environment variables!');
}

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ২. সিম্পল রেট লিমিটিং ম্যাপ (IP ভিত্তিক ব্রুট-ফোর্স প্রটেকশন)
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // ১ মিনিট
const MAX_REQUESTS = 15; // প্রতি মিনিটে সর্বোচ্চ ১৫টি রিকোয়েস্ট

export default async function handler(req, res) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করা
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // --- ৩. রেট লিমিটিং চেক ---
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

    // --- ৪. সুপার এডমিন ভেরিফিকেশন (লগইন) ---
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};
      
      const { data, error } = await supabaseServer.rpc('verify_super_admin', {
        p_admin_id: admin_id,
        p_password: password
      });

      if (error || !data) {
        return res.status(200).json({ success: false, error: error?.message || 'Invalid Admin Credentials' });
      }

      // সফল হলে জাস্টিফাইড JWT টোকেন ইস্যু করা
      const token = jwt.sign({ admin_id: admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });

      return res.status(200).json({ success: true, token, data });
    }

    // --- ৫. কোম্পানি ডেটা ফেচিং ---
    if (action === 'get_company') {
      const { company_id } = payload || {};
      
      const { data, error } = await supabaseServer
        .from('sigma_enterprises') // আপনার ডেটাবেজের সঠিক টেবিল নেম
        .select('company_id, layout_html, style_css, interfacebuttonlogic_js, databasefacing_js, advanceengine_js')
        .eq('company_id', company_id)
        .maybeSingle();

      if (error || !data) {
        return res.status(200).json({ success: false, error: error?.message || 'Company not found' });
      }

      // সিকিউরিটির খাতিরে সিক্রেট পাসওয়ার্ড বা সংবেদনশীল ডেটা ফিল্টার করে পাঠানো
      return res.status(200).json({ success: true, data });
    }

    // --- ৬. অন্যান্য সুরক্ষিত অপারেশন (যদি টোকেন ভ্যালিডেশন প্রয়োজন হয়) ---
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded) {
          return res.status(200).json({ success: true, message: "Authorized secure proxy operation." });
        }
      } catch (jwtErr) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token!' });
      }
    }

    return res.status(200).json({ success: false, error: 'Invalid action specified' });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
