require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// Middleware Configuration
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'https://sigmaphd.vercel.app'],
    credentials: true
}));

// PostgreSQL Database Connection Pool (Supabase or Cloud DB)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// 1. SECURITY MIDDLEWARE (JWT & Composite ID Verification)
// ==========================================
const verifyToken = (req, res, next) => {
    const token = req.cookies.jwt_token;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized! Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { company_id, user_id, composite_user_id }
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token!' });
    }
};

// ==========================================
// 2. SECURE LOGIN API (POST /api/auth/login)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    const { user_id, password } = req.body;
    const company_id = 105; // Fixed company ID for data isolation

    if (!user_id || !password) {
        return res.status(400).json({ success: false, message: 'User ID and password are required!' });
    }

    try {
        // Automatically construct the composite user ID on the server side
        const paddedUserId = user_id.length <= 4 ? user_id.padStart(4, '0') : user_id.slice(-4);
        const composite_user_id = `${company_id}_${paddedUserId}`;

        const query = 'SELECT * FROM users WHERE company_id = $1 AND composite_user_id = $2';
        const result = await pool.query(query, [company_id, composite_user_id]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid User ID or password!' });
        }

        const user = result.rows[0];

        // Password Verification (Bcrypt)
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid password!' });
        }

        // Generate JWT Payload
        const tokenPayload = {
            company_id: user.company_id,
            user_id: user.user_id,
            composite_user_id: user.composite_user_id
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Set secure HttpOnly Cookie
        res.cookie('jwt_token', token, {
            httpOnly: true,
            secure: true, // Required for HTTPS environments like Vercel
            sameSite: 'none', // Required for cross-site requests
            maxAge: 24 * 60 * 60 * 1000 // 1 day expiration
        });

        res.json({ success: true, message: 'Login successful!' });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Internal server error!' });
    }
});

// ==========================================
// 3. LOGOUT API (POST /api/auth/logout)
// ==========================================
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('jwt_token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ success: true, message: 'Logout successful.' });
});

// ==========================================
// 4. GET DASHBOARD DATA API (GET /api/dashboard/data)
// ==========================================
app.get('/api/dashboard/data', verifyToken, async (req, res) => {
    try {
        const { company_id, composite_user_id } = req.user;

        const userQuery = 'SELECT wallet_balance, validity_days FROM users WHERE company_id = $1 AND composite_user_id = $2';
        const userResult = await pool.query(userQuery, [company_id, composite_user_id]);

        const deviceQuery = 'SELECT * FROM devices WHERE company_id = $1 AND composite_user_id = $2';
        const deviceResult = await pool.query(deviceQuery, [company_id, composite_user_id]);

        res.json({
            success: true,
            data: {
                user: userResult.rows[0] || { wallet_balance: 0, validity_days: 0 },
                devices: deviceResult.rows
            }
        });

    } catch (err) {
        console.error('Dashboard Fetch Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data.' });
    }
});

// ==========================================
// 5. SECURE INCOME STORE API (POST /api/income/store)
// ==========================================
app.post('/api/income/store', verifyToken, async (req, res) => {
    try {
        const { company_id, composite_user_id } = req.user;
        const { date, description, amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide a valid income amount.' });
        }

        const insertQuery = `
            INSERT INTO income_records (company_id, composite_user_id, income_date, description, amount) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [company_id, composite_user_id, date, description, amount];
        
        const newRecord = await pool.query(insertQuery, values);

        res.json({ success: true, message: 'Income saved successfully!', data: newRecord.rows[0] });

    } catch (err) {
        console.error('Income Store Error:', err);
        res.status(500).json({ success: false, message: 'Failed to save income record.' });
    }
});

// ==========================================
// 6. SECURE EXPENSE STORE API (POST /api/expenses/store)
// ==========================================
app.post('/api/expenses/store', verifyToken, async (req, res) => {
    try {
        const { company_id, composite_user_id } = req.user;
        const { date, description, amount, payment_status } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide a valid expense amount.' });
        }

        const insertQuery = `
            INSERT INTO expense_records (company_id, composite_user_id, expense_date, description, amount, payment_status) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const values = [company_id, composite_user_id, date, description, amount, payment_status];
        
        const newRecord = await pool.query(insertQuery, values);

        res.json({ success: true, message: 'Expense saved successfully!', data: newRecord.rows[0] });

    } catch (err) {
        console.error('Expense Store Error:', err);
        res.status(500).json({ success: false, message: 'Failed to save expense record.' });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Secure Server is running on port ${PORT}`);
});
