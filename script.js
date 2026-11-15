document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const regSubmitBtn = document.getElementById('regSubmitBtn');
    const statusMessage = document.getElementById('statusMessage');

    const showStatus = (text, isError = false) => {
        if (!statusMessage) return;
        statusMessage.classList.remove(
            'hidden',
            'bg-rose-500/20', 'text-rose-200', 'border', 'border-rose-400/30',
            'bg-emerald-500/20', 'text-emerald-200', 'border', 'border-emerald-400/30'
        );
        statusMessage.textContent = text;
        if (isError) {
            statusMessage.classList.add('bg-rose-500/20', 'text-rose-200', 'border', 'border-rose-400/30');
        } else {
            statusMessage.classList.add('bg-emerald-500/20', 'text-emerald-200', 'border', 'border-emerald-400/30');
        }
    };

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const companyIdEl = document.getElementById('regCompanyId');
            const userIdEl = document.getElementById('regUserId');
            const fullNameEl = document.getElementById('regFullName');
            const emailEl = document.getElementById('regEmail');
            const passwordEl = document.getElementById('regPassword');

            const companyId = companyIdEl ? companyIdEl.value.trim() : '';
            const userId = userIdEl ? userIdEl.value.trim() : '';
            const fullName = fullNameEl ? fullNameEl.value.trim() : '';
            const email = emailEl ? emailEl.value.trim() : '';
            const password = passwordEl ? passwordEl.value.trim() : '';

            if (!companyId || !userId || !fullName || !email || !password) {
                showStatus('দয়া করে সবগুলো ফিল্ড (কোম্পানি আইডি সহ) পূরণ করুন।', true);
                return;
            }

            try {
                const response = await fetch('/api/root-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'register', companyId, userId, fullName, email, password })
                });
                
                const result = await response.json();

                if (result.success) {
                    showStatus(result.message || 'রেজিস্ট্রেশন সফল হয়েছে!');
                    if (regSubmitBtn) {
                        regSubmitBtn.textContent = 'সাবমিট সফল';
                        regSubmitBtn.disabled = true;
                    }
                } else {
                    showStatus(result.message || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে।', true);
                }
            } catch (err) {
                showStatus('সার্ভার কানেকশন এরর! দয়া করে আবার চেষ্টা করুন।', true);
            }
        });
    }
});
