document.addEventListener('DOMContentLoaded', () => {
    const charCards = document.querySelectorAll('.char-card');
    const nicknameInput = document.getElementById('nicknameInput');
    const randomBtn = document.getElementById('randomBtn');
    const startBtn = document.getElementById('startBtn');
    
    // 獲取彈窗相關元素
    const tutorialModal = document.getElementById('tutorialModal');
    const btnTutorialYes = document.getElementById('btnTutorialYes');
    const btnTutorialNo = document.getElementById('btnTutorialNo');

    let selectedRole = null;

    // --- 1. 角色選擇邏輯 ---
    charCards.forEach(card => {
        card.addEventListener('click', () => {
            charCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedRole = card.getAttribute('data-role');
            checkStartButtonState();
        });
    });

    // --- 2. 暱稱輸入監聽 ---
    nicknameInput.addEventListener('input', checkStartButtonState);

    // --- 3. 檢查開始按鈕狀態 ---
    function checkStartButtonState() {
        if (selectedRole && nicknameInput.value.trim().length > 0) {
            startBtn.disabled = false;
        } else {
            startBtn.disabled = true;
        }
    }

    // --- 4. 開始遊戲點擊 (開啟彈窗) ---
    startBtn.addEventListener('click', () => {
        // 顯示彈窗
        tutorialModal.classList.remove('hidden');
    });

    // --- 5. 彈窗按鈕邏輯 ---
    
    // 選擇「是，進行教學」
    btnTutorialYes.addEventListener('click', () => {
        startGame(true);
    });

    // 選擇「否，跳過教學」
    btnTutorialNo.addEventListener('click', () => {
        startGame(false);
    });

    // 點擊遮罩背景也可以關閉 (選擇性功能)
    tutorialModal.addEventListener('click', (e) => {
        if (e.target === tutorialModal) {
            tutorialModal.classList.add('hidden');
        }
    });

    // --- 6. 實際跳轉函數 ---
    async function startGame(isTutorial) {
        const nickname = nicknameInput.value.trim();
        
        try {
            // 發送 POST 請求給後端
            const response = await fetch('/holylegend/set_role', { // 注意：這裡的路徑要對應你後端設定的路由
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: selectedRole,
                    name: nickname,
                    tutorial: isTutorial
                })
            });

            const data = await response.json();

            if (data.success) {
                // 創建成功，執行跳轉
                // 這裡我們將後端回傳的 playerId 帶入網址，方便遊戲場景讀取數據
                const finalUrl = `${data.redirectUrl}?id=${data.playerId}&tutorial=${data.tutorial}`;
                window.location.href = finalUrl; 
            } else {
                // 創建失敗 (例如名字重複或資料庫錯誤)
                alert('創建失敗：' + data.message);
                startBtn.disabled = false;
                startBtn.innerText = "開始遊戲";
            }

        } catch (error) {
            console.error('連線錯誤:', error);
            alert('無法連接到伺服器，請稍後再試。');
            startBtn.disabled = false;
            startBtn.innerText = "開始遊戲";
        }
    }

    // --- 7. 中文隨機名稱生成器 ---
    randomBtn.addEventListener('click', () => {
        const randomName = generateChineseName();
        nicknameInput.value = randomName;
        checkStartButtonState();
        
        // 動畫反饋
        nicknameInput.style.borderColor = '#ffd700'; // 金色閃爍
        setTimeout(() => {
             nicknameInput.style.borderColor = '';
        }, 200);
    });

    /**
     * 生成武俠/奇幻風格的中文名稱
     */
    function generateChineseName() {
        // 常見或好聽的姓氏
        const surnames = [
            '趙', '錢', '孫', '李', '周', '吳', '鄭', '王', '馮', '陳', 
            '褚', '衛', '蔣', '沈', '韓', '楊', '朱', '秦', '尤', '許',
            '何', '呂', '施', '張', '孔', '曹', '嚴', '華', '金', '魏',
            '陶', '姜', '戚', '謝', '鄒', '喻', '柏', '水', '竇', '章',
            '雲', '蘇', '潘', '葛', '奚', '范', '彭', '郎', '魯', '韋',
            '昌', '馬', '苗', '鳳', '花', '方', '俞', '任', '袁', '柳',
            '獨孤', '歐陽', '慕容', '上官', '令狐', '司馬', '諸葛' // 複姓
        ];

        // 適合奇幻/武俠風格的字
        const words = [
            '天', '地', '玄', '黃', '宇', '宙', '洪', '荒', '日', '月',
            '星', '辰', '風', '雷', '雨', '電', '霜', '雪', '冰', '炎',
            '龍', '虎', '鳳', '麟', '鶴', '鷹', '狼', '獅', '豹', '熊',
            '劍', '刀', '槍', '戟', '弓', '矢', '盾', '甲', '戰', '鬥',
            '靈', '魂', '魄', '神', '魔', '鬼', '妖', '仙', '佛', '道',
            '仁', '義', '禮', '智', '信', '忠', '孝', '勇', '猛', '剛',
            '逍', '遙', '無', '極', '太', '初', '元', '始', '真', '如',
            '影', '幻', '夢', '虛', '空', '滅', '絕', '殺', '破', '立',
            '蒼', '穹', '碧', '落', '黃', '泉', '紫', '微', '紅', '塵'
        ];

        // 1. 隨機選一個姓
        const surname = surnames[Math.floor(Math.random() * surnames.length)];
        
        // 2. 隨機決定名字是 1 個字還是 2 個字 (80% 機率雙字，20% 單字)
        const nameLength = Math.random() > 0.2 ? 2 : 1;
        
        let givenName = "";
        for (let i = 0; i < nameLength; i++) {
            givenName += words[Math.floor(Math.random() * words.length)];
        }

        return surname + givenName;
    }

    checkStartButtonState();
});