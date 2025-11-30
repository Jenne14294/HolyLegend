document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. 從 URL 獲取參數
    const urlParams = new URLSearchParams(window.location.search);
    // 預設 ID 為 1 (如果沒有傳的話)
    const playerId = urlParams.get('id') || 1; 
    const isTutorial = urlParams.get('tutorial') === 'true';

    // 2. 模擬從後端獲取的資料 (未來替換成 fetch('/api/get_player'))
    // 這裡我們暫時用一個假資料物件
    let playerData = {
        id: playerId,
        nickname: "載入中...",
        role: "warrior", // warrior, archer, mage
        level: 1,
        hp: 100,
        maxHp: 100,
        mp: 20,
        maxMp: 20,
        exp: 0,
        maxExp: 100
    };

    // 實際的 fetch 寫法範例 (註解中)：
    /*
    try {
        const response = await fetch(`/api/player/${playerId}`);
        const data = await response.json();
        if (data.success) {
            playerData = data.player;
        }
    } catch (e) {
        console.error("無法載入玩家資料", e);
    }
    */

    // 為了展示效果，我們根據 URL 的 role 參數來覆蓋假資料
    // (之後後端會自動給正確的資料，不需要這樣寫)
    const urlRole = urlParams.get('role');
    const urlName = urlParams.get('name');
    if(urlRole) playerData.role = urlRole;
    if(urlName) playerData.nickname = urlName;


    // 3. 更新 UI 的函數
    function updateUI() {
        // 更新文字
        document.getElementById('playerName').textContent = playerData.nickname;
        document.getElementById('playerLevel').textContent = playerData.level;
        document.getElementById('hpText').textContent = `${playerData.hp}/${playerData.maxHp}`;
        document.getElementById('mpText').textContent = `${playerData.mp}/${playerData.maxMp}`;

        // 更新進度條寬度
        const hpPercent = (playerData.hp / playerData.maxHp) * 100;
        const mpPercent = (playerData.mp / playerData.maxMp) * 100;
        const expPercent = (playerData.exp / playerData.maxExp) * 100;

        document.getElementById('hpBar').style.width = `${hpPercent}%`;
        document.getElementById('mpBar').style.width = `${mpPercent}%`;
        document.getElementById('expBar').style.width = `${expPercent}%`;

        // 更新頭像
        const avatarImg = document.getElementById('playerAvatar');
        // 假設你的圖片路徑是這樣，根據我們之前的討論
        if (playerData.role === 'warrior') {
            avatarImg.src = '/holylegend/images/Warrior_1.png';
        } else if (playerData.role === 'archer') {
            avatarImg.src = '/holylegend/images/Archer_1.png';
        } else if (playerData.role === 'mage') {
            avatarImg.src = '/holylegend/images/Mage_1.png';
        } else {
            // 預設圖
            avatarImg.src = 'https://via.placeholder.com/80';
        }
    }

    // 4. 執行初始化
    updateUI();

    // 5. 如果是新手教學，彈出提示
    if (isTutorial) {
        setTimeout(() => {
            alert(`歡迎來到 Holy Legend，${playerData.nickname}！\n請點擊左側的「爬塔」開始你的第一次冒險！`);
        }, 500);
    }
});