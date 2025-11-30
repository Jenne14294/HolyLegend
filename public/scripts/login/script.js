// public/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.querySelector('.btn-pixel');
    const errorMsg = document.getElementById('error-message');

    // 監聽表單送出事件
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // 阻止傳統表單跳轉

        // 1. 鎖定按鈕，避免重複點擊
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "LOADING...";
        submitBtn.classList.add('loading');
        errorMsg.style.display = 'none'; // 隱藏舊的錯誤訊息

        // 取得輸入值
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        try {
            // 2. 用 Fetch API 發送請求給後端
            const response = await fetch('/holylegend/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                // 3. 登入成功 -> 跳轉到首頁或遊戲大廳
                
                submitBtn.innerText = "SUCCESS!";
                if (result.user.dataValues.jobId == -1) 
                {
                    herf_location = '/holylegend/select_role';
                }

                else 
                {
                    herf_location = '/holylegend/game_lobby';
                }
                setTimeout(() => {
                    window.location.href = herf_location; // 這裡填寫你想跳轉的網址
                }, 500);
            } else {
                // 4. 登入失敗 -> 顯示錯誤訊息
                throw new Error(result.msg || '登入失敗，請檢查帳號密碼');
            }

        } catch (err) {
            // 處理錯誤顯示
            errorMsg.innerText = `[ERROR] ${err.message}`;
            errorMsg.style.display = 'block';
            
            // 恢復按鈕
            submitBtn.innerText = originalBtnText;
            submitBtn.classList.remove('loading');
            
            // 可以加一個簡單的震動動畫 (選用)
            const container = document.querySelector('.nes-container');
            container.style.transform = 'translateX(5px)';
            setTimeout(() => container.style.transform = 'translateX(0)', 100);
            setTimeout(() => container.style.transform = 'translateX(-5px)', 200);
            setTimeout(() => container.style.transform = 'translateX(0)', 300);
        }
    });
});