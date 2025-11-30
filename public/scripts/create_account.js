document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. 變數宣告與初始設定
    // ==========================================
    
    // 音樂與遮罩
    const startOverlay = document.getElementById('start-overlay');
    const bgMusic = document.getElementById('bgMusic');

    // 容器 (最外層的框框)
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');

    // 表單
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // 錯誤訊息區塊 (新增這兩個變數，確保抓對人)
    const loginErrorDiv = document.getElementById('login-error-message');
    const registerErrorDiv = document.getElementById('register-error-message');

    // 切換按鈕 (連結)
    const toRegisterBtn = document.getElementById('to-register-btn');
    const toLoginBtn = document.getElementById('to-login-btn');

    // ==========================================
    // 2. 處理開始遮罩與音樂播放
    // ==========================================
    const handleStartClick = () => {
        if (bgMusic) {
            bgMusic.play().catch(error => {
                console.warn("背景音樂自動播放被瀏覽器阻擋:", error);
            });
        }

        if (startOverlay) {
            startOverlay.classList.add('hidden');
            setTimeout(() => {
                startOverlay.style.display = 'none';
            }, 800);
            startOverlay.removeEventListener('click', handleStartClick);
        }
    };

    if (startOverlay) {
        startOverlay.addEventListener('click', handleStartClick);
    }

    // ==========================================
    // 3. 切換 登入/註冊 介面邏輯 (修正處)
    // ==========================================

    // 切換到「註冊頁」
    if (toRegisterBtn) {
        toRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 1. 切換容器顯示
            loginContainer.classList.add('hidden');
            registerContainer.classList.remove('hidden');
            
            // 2. 清除錯誤訊息 (修正：傳入 errorDiv 而不是 form)
            hideError(loginErrorDiv); 
            
            // 3. (選用) 重置表單輸入，避免切換回來還留著舊資料
            // loginForm.reset(); 
        });
    }

    // 切換回「登入頁」
    if (toLoginBtn) {
        toLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 1. 切換容器顯示
            registerContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
            
            // 2. 清除錯誤訊息 (修正：傳入 errorDiv 而不是 form)
            hideError(registerErrorDiv);
        });
    }

    // ==========================================
    // 4. 登入表單邏輯
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            // 鎖定按鈕
            setLoading(submitBtn, true, "LOADING...");
            hideError(loginErrorDiv);

            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/holylegend/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // --- 登入成功 ---
                    submitBtn.innerText = "SUCCESS!";
                    submitBtn.style.backgroundColor = "#2ecc71"; // 綠色

                    const userData = result.user.dataValues || result.user;
                    let targetUrl = '/holylegend/game_lobby'; 

                    if (!userData.jobId || userData.jobId == -1) {
                        targetUrl = '/holylegend/select_role'; 
                    } else {
                        targetUrl = `/holylegend/game_lobby`;
                    }

                    setTimeout(() => {
                        window.location.href = targetUrl;
                    }, 500);

                } else {
                    throw new Error(result.msg || '登入失敗');
                }

            } catch (err) {
                showError(loginErrorDiv, err.message);
                setLoading(submitBtn, false, "START GAME");
                shakeForm(loginContainer);
            }
        });
    }

    // ==========================================
    // 5. 註冊表單邏輯
    // ==========================================
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = registerForm.querySelector('button[type="submit"]');
            
            const formData = new FormData(registerForm);
            const data = Object.fromEntries(formData.entries());

            // 前端驗證
            if (data.password !== data.confirm_password) {
                showError(registerErrorDiv, '兩次輸入的密碼不相同！');
                shakeForm(registerContainer);
                return;
            }

            // 鎖定按鈕
            setLoading(submitBtn, true, "CREATING...");
            hideError(registerErrorDiv);

            try {
                const response = await fetch('/holylegend/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: data.username,
                        password: data.password
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // --- 註冊成功 ---
                    submitBtn.innerText = "WELCOME!";
                    submitBtn.style.backgroundColor = "#ffd700"; // 金色
                    submitBtn.style.color = "#000";

                    setTimeout(() => {
                        // 切換 UI 回登入
                        registerContainer.classList.add('hidden');
                        loginContainer.classList.remove('hidden');
                        
                        // 自動填入帳號
                        document.getElementById('login-username').value = data.username;
                        document.getElementById('login-password').focus();
                        
                        // 重置註冊按鈕與表單
                        setLoading(submitBtn, false, "CREATE HERO");
                        submitBtn.style.backgroundColor = ""; 
                        submitBtn.style.color = "";
                        registerForm.reset();

                    }, 1500);

                } else {
                    throw new Error(result.msg || '註冊失敗');
                }

            } catch (err) {
                showError(registerErrorDiv, err.message);
                setLoading(submitBtn, false, "CREATE HERO");
                shakeForm(registerContainer);
            }
        });
    }

    // ==========================================
    // 6. 工具函式 (共用)
    // ==========================================

    function showError(element, msg) {
        if (!element) return;
        element.innerText = `[ERROR] ${msg}`;
        element.style.display = 'block';
    }

    function hideError(element) {
        if (!element) return;
        element.style.display = 'none';
    }

    function setLoading(btn, isLoading, text) {
        if (isLoading) {
            btn.dataset.originalText = btn.innerText;
            btn.innerText = text;
            btn.disabled = true;
            btn.classList.add('loading');
        } else {
            btn.innerText = text || btn.dataset.originalText;
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    function shakeForm(container) {
        if (!container) return;
        container.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(10px)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(0)' }
        ], {
            duration: 400,
            iterations: 1
        });
    }
});