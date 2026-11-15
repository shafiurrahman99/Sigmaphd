document.addEventListener('DOMContentLoaded', () => {
    const signInForm = document.getElementById('signInForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotForm');

    const userIdInput = document.getElementById('userId');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const registerNewBtn = document.getElementById('registerNewBtn');
    const backButtons = document.querySelectorAll('[data-back-signin]');
    const statusMessage = document.getElementById('statusMessage');

    const regSubmitBtn = document.getElementById('regSubmitBtn');
    const simulateApproveBtn = document.getElementById('simulateApproveBtn');
    let regState = 'register'; 

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

    const switchView = (targetForm) => {
        if (statusMessage) statusMessage.classList.add('hidden');
        if (signInForm) signInForm.classList.add('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (forgotForm) forgotForm.classList.add('hidden');
        if (targetForm) targetForm.classList.remove('hidden');
    };

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    }

    if (forgotPasswordBtn && forgotForm) {
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(forgotForm);
        });
    }

    if (registerNewBtn && registerForm) {
        registerNewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(registerForm);
        });
    }

    backButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(signInForm);
        });
    });

    // Sign In Submit
    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = userIdInput ? userIdInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';

            if (!userId || !password) {
                showStatus('Please enter both User ID and Password.', true);
                return;
            }

            try {
                const response = await fetch('/api/root-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'signin', userId, password })
                });
                const result = await response.json();
                if (result.success) {
                    showStatus(result.message);
                } else {
                    showStatus(result.message, true);
                }
            } catch (err) {
                showStatus('Server connection error!', true);
            }
        });
    }

    // Register New Submit
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

            if (regState === 'approved') {
                showStatus(`Approved! Signing in as "${userId}" (${companyId})...`);
                return;
            }

            if (regState === 'pending') {
                showStatus('Your registration is still Pending admin approval.', true);
                return;
            }

            if (!companyId || !userId || !fullName || !email || !password) {
                showStatus('Please fill in all fields including Company ID.', true);
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
                    regState = 'pending';
                    if (regSubmitBtn) {
                        regSubmitBtn.textContent = 'Pending...';
                        regSubmitBtn.classList.remove('from-indigo-600', 'via-indigo-500', 'to-purple-600');
                        regSubmitBtn.classList.add('from-amber-600', 'via-amber-500', 'to-orange-600');
                    }
                    if (simulateApproveBtn) simulateApproveBtn.classList.remove('hidden');

                    ['regCompanyId', 'regUserId', 'regFullName', 'regEmail', 'regPassword'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.readOnly = true;
                            el.classList.add('opacity-70');
                        }
                    });
                    showStatus(result.message);
                } else {
                    showStatus(result.message, true);
                }
            } catch (err) {
                showStatus('Registration request failed.', true);
            }
        });
    }

    // Simulate Admin Approval
    if (simulateApproveBtn) {
        simulateApproveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            regState = 'approved';
            if (regSubmitBtn) {
                regSubmitBtn.textContent = 'Sign In';
                regSubmitBtn.classList.remove('from-amber-600', 'via-amber-500', 'to-orange-600');
                regSubmitBtn.classList.add('from-emerald-600', 'via-teal-500', 'to-cyan-600');
            }
            simulateApproveBtn.classList.add('hidden');
            showStatus('Admin Approved! You can now click Sign In directly.');
        });
    }

    // Forgot Password Submit
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const forgotUserIdEl = document.getElementById('forgotUserId');
            const target = forgotUserIdEl ? forgotUserIdEl.value.trim() : '';
            if (!target) {
                showStatus('Please enter your User ID.', true);
                return;
            }

            try {
                const response = await fetch('/api/root-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'send_otp', userId: target })
                });
                const result = await response.json();
                showStatus(result.message || `Reset code sent for "${target}".`);
            } catch (err) {
                showStatus(`Reset code sent for "${target}".`);
            }
            forgotForm.reset();
        });
    }
});
