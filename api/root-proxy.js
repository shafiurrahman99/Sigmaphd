// Sign In ফর্ম সাবমিট করার সময় ব্যাকএন্ডে কল করা:
signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = userIdInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        const response = await fetch('/api/root-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'signin', userId, password })
        });
        
        const result = await response.json();
        if (result.success) {
            showStatus(result.message);
            // সফল হলে পরবর্তী পেজে রিডাইরেক্ট বা ড্যাশবোর্ডে নিয়ে যান
        } else {
            showStatus(result.message, true);
        }
    } catch (err) {
        showStatus('Server connection error!', true);
    }
});
