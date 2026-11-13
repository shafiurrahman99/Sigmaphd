import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// ১. পরিবেশ ভ্যারিয়েবল (Vercel Environment Variables থেকে স্বয়ংক্রিয়ভাবে লোড হবে)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Critical Error: Supabase URL or Service Role Key is missing!');
}

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ২. ব্রুট-ফোর্স প্রটেকশনের জন্য রেট লিমিটিং ম্যাপ (IP ভিত্তিক)
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // ১ মিনিট
const MAX_REQUESTS = 20; // প্রতি মিনিটে সর্বোচ্চ ২০টি রিকোয়েস্ট

export default async function handler(req, res) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করা (নিরাপত্তা প্রাচীর)
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

    // --- ৪. সুপার এডমিন ভেরিফিকেশন (handleInitialAuth & handleSuperAdminLogin এর জন্য) ---
    if (action === 'verify_admin') {
      const { admin_id, password } = payload || {};
      
      // ডেটাবেজ টেবিল বা RPC ফাংশন দিয়ে এডমিন চেক (এখানে sigma_enterprises অথবা আপনার এডমিন টেবিল ব্যবহার করা হয়েছে)
      // আপনি যদি সরাসরি টেবিল চেক করতে চান:
      const { data, error } = await supabaseServer
        .from('sigma_enterprises')
        .select('*')
        .eq('company_id', 0) // অথবা সুপার এডমিনের সুনির্দিষ্ট কুয়েরি
        .maybeSingle();

      // অথবা আপনার যদি RPC ফাংশন থাকে:
      // const { data, error } = await supabaseServer.rpc('verify_super_admin', { p_admin_id: admin_id, p_password: password });

      // ডেমো বা প্রাথমিক নিরাপত্তার জন্য ইউজার আইডি ও পাসওয়ার্ড ভ্যালিডেশন (আপনার প্রয়োজনমতো কাস্টমাইজ করে নিতে পারেন)
      if (admin_id === "admin" && password === "admin123") { // এটি আপনার ডেটাবেজ চেক দিয়ে রিপ্লেস করতে পারেন
        const token = jwt.sign({ admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.status(200).json({ success: true, token, data: { admin_id } });
      }

      // যদি ডেটাবেজ থেকে ভ্যালিডেশন করতে চান:
      // if (error || !data) {
      //   return res.status(200).json({ success: false, error: 'ভুল System ID বা Credential Password!' });
      // }

      return res.status(200).json({ success: true, token: jwt.sign({ admin_id, role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' }), data });
    }

    // --- ৫. কোম্পানি ডেটা ফেচিং ও লগইন (handleCompanyLogin এর জন্য) ---
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

      // টোকেন ইস্যু করা
      const token = jwt.sign({ company_id, role: 'company' }, JWT_SECRET, { expiresIn: '2h' });

      return res.status(200).json({ success: true, token, data });
    }

    return res.status(200).json({ success: false, error: 'Invalid action specified in proxy request.' });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
}
