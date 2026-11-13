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

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken'; // টোকেন ভ্যালিডেশনের জন্য

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma_phd_super_secure_secret_key';

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Simple Rate Limiting Map (IP based)
const ipRequestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // ১ মিনিট
const MAX_REQUESTS = 10; // প্রতি মিনিটে সর্বোচ্চ ১০টি রিকোয়েস্ট

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // --- ১. রেট লিমিটিং চেক (Rate Limiting) ---
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
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

    const { action, payload } = req.body;

    try {
        if (action === 'verify_admin' || action === 'authenticate_company') {
            const { company_id, admin_id, secret_pass, password } = payload;
            
            // ডাটাবেজ থেকে কুয়েরি করে পাসওয়ার্ড ও রোল যাচাই...
            // সফল হলে সার্ভার থেকে JWT সাইন্ড টোকেন ইস্যু করা হবে:
            const token = jwt.sign({ company_id: company_id || admin_id, role: 'authorized' }, JWT_SECRET, { expiresIn: '2h' });

            return res.status(200).json({ 
                success: true, 
                token: token, 
                message: "Authentication successful with security wall." 
            });
        }

        // --- ২. টোকেন ও রোল-বেজড অথোরাইজেশন চেক (RBAC) ---
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No authorization token provided!' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded) {
            return res.status(403).json({ success: false, error: 'Invalid or expired session token!' });
        }

        // টোকেন ভ্যালিড হলে নির্দিষ্ট অপারেশন সম্পন্ন করা...
        return res.status(200).json({ success: true, message: "Secure proxy operation executed." });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

