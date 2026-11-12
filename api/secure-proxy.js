// --- STEP 1: INITIAL LOGIN CARD AUTHENTICATION ENGINE (Using Vercel Secure API) ---
        async function handleInitialAuth(event) {
            event.preventDefault();
            
            const userField = document.getElementById('initialUsername');
            const passField = document.getElementById('initialPassword');
            const alertBox = document.getElementById('alertBox');
            const authBtn = document.getElementById('authBtn');

            const username = userField.value.trim();
            const password = passField.value.trim();

            alertBox.className = "w-full max-w-md mb-3 p-2.5 rounded-lg text-xs text-center font-medium transition-all duration-300";

            authBtn.disabled = true;
            authBtn.innerText = "Authenticating via Secure API...";

            try {
                // সরাসরি Supabase-এ কল না করে আমাদের Vercel Serverless API-তে রিকোয়েস্ট পাঠানো হচ্ছে
                const response = await fetch('/api/secure-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'verify_admin',
                        payload: { admin_id: username, password: password }
                    })
                });

                const result = await response.json();

                if (!response.ok || !result.success || !result.data) {
                    throw new Error(result.error || "ভুল System ID বা Credential Password!");
                }

                alertBox.classList.add("bg-emerald-500/20", "text-emerald-300", "border", "border-emerald-500/40");
                alertBox.innerText = "✓ Authenticated! Entering Central Gateway...";
                alertBox.classList.remove("hidden");

                setTimeout(() => {
                    document.getElementById('initialAuthScreen').classList.add('hidden');
                    document.getElementById('sigmaMainWrapper').classList.remove('hidden');
                    navigateToExtension('/portal/gateway', 'Gateway Portal');
                }, 400);

            } catch (err) {
                alertBox.classList.add("bg-red-500/20", "text-red-300", "border", "border-red-500/40");
                alertBox.innerText = "✕ " + (err.message || "Access Denied!");
                alertBox.classList.remove("hidden");

                authBtn.disabled = false;
                authBtn.innerText = "Authenticate";
            }
        }
