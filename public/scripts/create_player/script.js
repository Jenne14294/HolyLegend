document.addEventListener('DOMContentLoaded', () => {
    const charCards = document.querySelectorAll('.char-card');
    const nicknameInput = document.getElementById('nicknameInput');
    const randomBtn = document.getElementById('randomBtn');
    const startBtn = document.getElementById('startBtn');

    let selectedRole = null;

    // --- 1. 角色選擇邏輯 ---
    charCards.forEach(card => {
        card.addEventListener('click', () => {
            // 移除其他卡片的 active 狀態
            charCards.forEach(c => c.classList.remove('active'));
            // 替自己加上 active
            card.classList.add('active');
            // 獲取選擇的角色
            selectedRole = card.getAttribute('data-role');
            console.log(`已選擇職業: ${selectedRole}`);
            // 檢查是否可以開始遊戲
            checkStartButtonState();
        });
    });

    // --- 2. 暱稱輸入監聽 ---
    nicknameInput.addEventListener('input', checkStartButtonState);

    // --- 3. 檢查開始按鈕狀態 ---
    function checkStartButtonState() {
        // 必須選擇了角色，且輸入框有內容
        if (selectedRole && nicknameInput.value.trim().length > 0) {
            startBtn.disabled = false;
        } else {
            startBtn.disabled = true;
        }
    }

    // --- 4. 開始遊戲點擊 ---
    startBtn.addEventListener('click', () => {
        const nickname = nicknameInput.value.trim();
        if (selectedRole && nickname) {
            alert(`準備出發！\n職業: ${selectedRole}\n暱稱: ${nickname}`);
            // 這裡執行實際開始遊戲的跳轉，例如：
            // window.location.href = `/game/start?role=${selectedRole}&name=${nickname}`;
        }
    });

    // --- 5. 隨機名稱生成器邏輯 ---
    randomBtn.addEventListener('click', () => {
        const randomName = generateFantasyName(2, 6); // 生成 2-6 個字元的名字
        nicknameInput.value = randomName;
        checkStartButtonState(); // 生成後也要檢查按鈕狀態
        // 添加一個小動畫反饋
        nicknameInput.style.borderColor = '#fff';
        setTimeout(() => {
             nicknameInput.style.borderColor = '';
        }, 200);
    });


    /**
     * 生成看起來像名字的隨機字串
     * @param {number} minLength 最小長度
     * @param {number} maxLength 最大長度
     * @returns {string} 隨機名稱
     */
    function generateFantasyName(minLength, maxLength) {
        // 定義一些常見奇幻名字的音節部件
        const vocals = ['a', 'e', 'i', 'o', 'u', 'ya', 'ye', 'ae', 'ea'];
        const consonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'x', 'z', 'sh', 'th', 'ch', 'gr', 'br', 'st'];
        
        let name = "";
        // 隨機決定這次要生成的目標長度
        const targetLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

        let isVowelNext = Math.random() > 0.5; // 隨機決定從母音還是子音開始

        while (name.length < targetLength) {
            let part;
            if (isVowelNext) {
                part = vocals[Math.floor(Math.random() * vocals.length)];
            } else {
                part = consonants[Math.floor(Math.random() * consonants.length)];
            }

            // 確保加上去後不會超過最大長度太多 (稍微寬容一點，之後會截斷)
            if (name.length + part.length <= targetLength + 1) {
                name += part;
                isVowelNext = !isVowelNext; // 切換下一次的類型
            } else {
                 // 如果加上去會太長，強制結束循環
                 break;
            }
        }

        // 強制截斷到最大長度 (確保符合 2-6 的要求)
        name = name.substring(0, maxLength);

        // 確保至少有最小長度 (如果運氣不好生成的太短)
        if (name.length < minLength) {
             // 遞歸調用自己重新生成，直到符合要求
             return generateFantasyName(minLength, maxLength);
        }
        
        // 將首字母大寫
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    // 初始化檢查
    checkStartButtonState();
});