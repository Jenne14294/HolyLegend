document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const submitBtn = document.querySelector('.btn-pixel');
    const errorMsg = document.getElementById('error-message');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. 取得表單資料
        const formData = new FormData(registerForm);
        const data = Object.fromEntries(formData.entries());

        // 2. 前端驗證：檢查密碼是否一致
        if (data.password !== data.confirm_password) {
            showError('兩次輸入的密碼不相同！');
            return;
        }

        // 3. 鎖定按鈕
        setLoading(true);
        hideError();

        try {
            // 4. 發送請求給後端 (POST /auth/register)
            const response = await fetch('/holylegend/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: data.username,
                    password: data.password
                    // 不需要傳 confirm_password 給後端
                })
            });

            const result = await response.json();

            if (response.ok) {
                // 註冊成功
                submitBtn.innerText = "WELCOME HERO!";
                submitBtn.style.backgroundColor = "#ffc107"; // 變金色
                submitBtn.style.color = "#000";

                // 1.5秒後跳轉到登入頁面
                setTimeout(() => {
                    window.location.href = '/holylegend/'; 
                }, 1500);
            } else {
                throw new Error(result.msg || '註冊失敗');
            }

        } catch (err) {
            showError(err.message);
            setLoading(false);
            shakeForm();
        }
    });

    // --- 工具函式 ---

    function showError(msg) {
        errorMsg.innerText = `[ERROR] ${msg}`;
        errorMsg.style.display = 'block';
    }

    function hideError() {
        errorMsg.style.display = 'none';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.dataset.originalText = submitBtn.innerText;
            submitBtn.innerText = "CREATING...";
            submitBtn.classList.add('loading');
        } else {
            submitBtn.innerText = submitBtn.dataset.originalText || "CREATE HERO";
            submitBtn.classList.remove('loading');
        }
    }

    function shakeForm() {
        const container = document.querySelector('.nes-container');
        container.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' }
        ], {
            duration: 300,
            iterations: 1
        });
    }
});
