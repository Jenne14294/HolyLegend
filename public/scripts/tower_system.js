document.addEventListener('DOMContentLoaded', () => {
    
    // --- 變數宣告 ---
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const bg_audio = document.getElementById('bg-music-source');
    
    // 按鈕
    const btnEnterTower = document.getElementById('btn-enter-tower');
    const btnAttack = document.getElementById('btn-attack');

    // 戰鬥狀態 (預設值，等待 API 更新)
    let battleState = {
        inCombat: false,
        isGameOver: false,      // 防止重複死亡的鎖
        processingLevelUp: false, // 【新增】防止重複過關的鎖
        currentFloor: 1,
        goldCollected: 0,
        playerHp: 100,
        playerMaxHp: 100,
        playerMp: 30,
        playerMaxMp: 30,
        enemyHp: 100,
        enemyMaxHp: 100
    };

    // ===========================
    // 0. 初始化：跟後端拿資料 (Fetch API)
    // ===========================
    async function initGame() {
        try {
            // 呼叫後端 API
            const response = await fetch('/holylegend/game_lobby/status');
            const result = await response.json();

            console.log(result)

            if (result.success) {
                const data = result.data;
                
                // 1. 更新本地戰鬥狀態
                battleState.playerHp = data.hp;
                battleState.playerMaxHp = data.maxHp;
                battleState.playerMp = data.mp;
                battleState.playerMaxMp = data.maxMp;
                battleState.currentFloor = data.currentFloor;
                // 注意：這裡只存總金幣，戰鬥中獲得的是另外算
                
                // 2. 更新大廳 UI
                updateLobbyUI(data);

                console.log("玩家資料載入成功:", data);
            } else {
                // 如果失敗 (例如 Token 過期)，踢回登入頁
                alert('登入逾時，請重新登入');
                window.location.href = '/holylegend/';
            }
        } catch (error) {
            console.error("無法連線到伺服器:", error);
        }
    }

    // 執行初始化
    initGame();


    // ===========================
    // 1. 進入爬塔
    // ===========================
    if (btnEnterTower) {
        btnEnterTower.addEventListener('click', () => {
            lobbyLayer.classList.add('hidden');
            towerLayer.classList.remove('hidden');
            startNewFloor();
            if (bg_audio) {
                bg_audio.src = '/holylegend/audio/tower_theme.ogg';
                bg_audio.play();
            }
        });
    }

    // ===========================
    // 3. 戰鬥邏輯：攻擊
    // ===========================
    if (btnAttack) {
        btnAttack.addEventListener('click', () => {
            // 【關鍵修正 1】加入 processingLevelUp 檢查
            // 如果遊戲結束、或者正在過關中，禁止攻擊
            if (battleState.isGameOver || battleState.processingLevelUp || battleState.playerHp <= 0) return;

            // 動畫
            const enemyImg = document.getElementById('enemy-img');
            if(enemyImg) {
                enemyImg.style.transform = 'scale(0.9)';
                setTimeout(() => enemyImg.style.transform = 'scale(1)', 100);
            }

            // 扣血
            const damage = Math.floor(Math.random() * 10) + 10;
            battleState.enemyHp -= damage;

            showDamageNumber(damage);
            updateEnemyUI();

            // 判斷死亡
            if (battleState.enemyHp <= 0) {
                // 【關鍵修正 2】立刻上鎖，防止連點導致重複進入此區塊
                battleState.processingLevelUp = true;

                battleState.goldCollected += 50;
                updateTopBarUI();
                
                if(enemyImg) enemyImg.style.opacity = '0';
                
                setTimeout(() => {
                    if (battleState.isGameOver) return; 

                    alert('怪物被擊敗！前往下一層...');
                    battleState.currentFloor++;
                    startNewFloor(); // 這裡面會負責解鎖
                }, 500);
            } else {
                setTimeout(enemyAttack, 500);
            }
        });
    }

    // --- 輔助函式 ---

    function updateLobbyUI(data) {
        safeSetText('lobbyLevel', data.level);
        safeSetText('lobbyName', data.nickname);
        safeSetText('lobbyHp', data.hp);
        safeSetText('lobbyMp', data.mp);
        
        const avatar = document.getElementById('lobbyAvatar');
        if (avatar && data.role) {
            avatar.src = `images/Classes/${data.role}_1.png`;
        }
    }

    function startNewFloor() {
        // 【關鍵修正 3】新樓層開始，解開所有鎖
        battleState.isGameOver = false; 
        battleState.processingLevelUp = false; 

        battleState.enemyMaxHp = 100 + (battleState.currentFloor * 10);
        battleState.enemyHp = battleState.enemyMaxHp;
        
        const enemyImg = document.getElementById('enemy-img');
        if(enemyImg) {
            enemyImg.style.opacity = '1';
            
            // --- 隨機怪物圖片邏輯 ---
            // 定義怪物列表 (請確保 /holylegend/images/ 資料夾有這些檔名)
            const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
            // 隨機選一個索引
            const randomIndex = Math.floor(Math.random() * monsters.length);
            const randomMonster = monsters[randomIndex];
            
            // 設定圖片路徑
            enemyImg.src = `/holylegend/images/enemies/${randomMonster}.png`;
        }
        
        updateEnemyUI();
        updateTopBarUI();
        updatePlayerUI();
    }

    async function enemyAttack() {
        // 【關鍵修正 2】如果遊戲已經結束 (IsGameOver 為 true)，直接取消這次攻擊
        // 這能防止多個 setTimeout 同時觸發導致的重複結算
        if (battleState.isGameOver) return;

        const dmg = 5;
        battleState.playerHp -= dmg;
        if (battleState.playerHp < 0) battleState.playerHp = 0;
        
        updatePlayerUI();
        
        document.body.style.backgroundColor = '#500';
        setTimeout(() => document.body.style.backgroundColor = '', 100);

        if (battleState.playerHp <= 0) {
            // 【關鍵修正 3】雙重檢查鎖：如果已經標記為結束，就不要再執行
            if (battleState.isGameOver) return;
            
            // 立即上鎖
            battleState.isGameOver = true;

            alert(`你已在第 ${battleState.currentFloor} 層倒下`);
            const expGained = calculateGameOver();
            alert(`你獲得了 ${expGained} 點經驗值！`);
            
            try {
                const response = await fetch('/holylegend/game_lobby/save_status', { // 建議統一改為 /api/game/settle
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        exp: expGained
                    })
                });
            } catch (err) {
                console.error("結算失敗", err);
            }

            // 回到大廳或重整
            location.reload();
        }
    }

    function showDamageNumber(num) {
        const popup = document.getElementById('damage-popup');
        if(!popup) return;
        popup.innerText = `-${num}`;
        popup.classList.remove('pop');
        void popup.offsetWidth; 
        popup.classList.add('pop');
    }

    function updateEnemyUI() {
        const pct = (battleState.enemyHp / battleState.enemyMaxHp) * 100;
        const bar = document.getElementById('enemy-hp-fill');
        if(bar) bar.style.width = `${Math.max(0, pct)}%`;
    }

    function updatePlayerUI() {
        safeSetText('battle-hp-text', `${battleState.playerHp}/${battleState.playerMaxHp}`);
        safeSetText('battle-mp-text', `${battleState.playerMp}/${battleState.playerMaxMp}`);
        
        const hpPct = (battleState.playerHp / battleState.playerMaxHp) * 100;
        const mpPct = (battleState.playerMp / battleState.playerMaxMp) * 100;
        
        const hpBar = document.getElementById('battle-hp-bar');
        const mpBar = document.getElementById('battle-mp-bar');
        if(hpBar) hpBar.style.width = `${hpPct}%`;
        if(mpBar) mpBar.style.width = `${mpPct}%`;
    }

    function updateTopBarUI() {
        safeSetText('tower-floor', battleState.currentFloor);
        safeSetText('tower-gold', battleState.goldCollected);
    }

    function safeSetText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function calculateGameOver() {
        const floor = battleState.currentFloor;
        let EXPgained = 0;
        let baseEXP = 1;

        for (let i = 1; i <= floor; i++) {
            if (i % 10 === 0) {
                EXPgained += 20; // 每10層額外獎勵 20 點經驗值
            }

            EXPgained += baseEXP * i;
        }

        return EXPgained;
    }   
});