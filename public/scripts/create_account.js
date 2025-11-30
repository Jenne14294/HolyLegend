document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. 變數宣告與初始設定
    // ==========================================
    
    // 音樂與遮罩
    const startOverlay = document.getElementById('start-overlay');
    const bgMusic = document.getElementById('bgMusic');

    // 容器
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');

    // 表單
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // 錯誤訊息區塊
    const loginErrorDiv = document.getElementById('login-error-message');
    const registerErrorDiv = document.getElementById('register-error-message');

    // 切換按鈕
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
    // 3. 切換 登入/註冊 介面邏輯 (修正版)
    // ==========================================

    // 切換到「註冊頁」
    if (toRegisterBtn) {
        toRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // UI 切換
            loginContainer.classList.add('hidden');
            registerContainer.classList.remove('hidden');
            
            // 清除錯誤訊息
            hideError(loginErrorDiv); 
            
            // 重置雙方按鈕狀態 (避免切換回來看到 Loading 或 Success)
            resetButtonState(loginForm.querySelector('button'), "START GAME");
            resetButtonState(registerForm.querySelector('button'), "CREATE HERO");
        });
    }

    // 切換回「登入頁」
    if (toLoginBtn) {
        toLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // UI 切換
            registerContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
            
            // 清除錯誤訊息
            hideError(registerErrorDiv);

            // 重置雙方按鈕狀態
            resetButtonState(loginForm.querySelector('button'), "START GAME");
            resetButtonState(registerForm.querySelector('button'), "CREATE HERO");
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

                    // 判斷是否需要創角
                    if (!userData.jobId || userData.jobId == -1) {
                        targetUrl = '/holylegend/select_role'; 
                    } else {
                        targetUrl = `/holylegend/game_scene.html?id=${userData.id}`;
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
                        // 1. 切換 UI 回登入
                        registerContainer.classList.add('hidden');
                        loginContainer.classList.remove('hidden');
                        
                        // 2. 自動填入帳號
                        document.getElementById('login-username').value = data.username;
                        document.getElementById('login-password').focus();
                        
                        // 3. 【關鍵修正】強制重置「登入按鈕」與「註冊按鈕」
                        // 確保切換過去時，登入按鈕是 "START GAME" 而不是別的狀態
                        const loginBtn = loginForm.querySelector('button');
                        resetButtonState(loginBtn, "START GAME");
                        
                        resetButtonState(submitBtn, "CREATE HERO");
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

    // 控制按鈕 Loading 狀態
    function setLoading(btn, isLoading, text) {
        if (isLoading) {
            // 如果還沒存過原始文字，才存 (避免連續點擊把 Loading 存成原始文字)
            if (!btn.dataset.originalText) {
                btn.dataset.originalText = btn.innerText;
            }
            btn.innerText = text;
            btn.disabled = true;
            btn.classList.add('loading');
        } else {
            btn.innerText = text || btn.dataset.originalText;
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    // 【新增】強制重置按鈕樣式 (顏色、文字、狀態)
    function resetButtonState(btn, defaultText) {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerText = defaultText;
        btn.style.backgroundColor = ""; // 清除行內樣式 (金色/綠色)
        btn.style.color = "";
        
        // 清除暫存
        delete btn.dataset.originalText;
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