document.addEventListener('DOMContentLoaded', () => {
    
    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const btnEnterTower = document.getElementById('btn-enter-tower');
    const btnExitTower = document.getElementById('btn-tower-exit');
    const btnAttack = document.getElementById('btn-attack');

    // 簡化存取 Game.state
    const state = window.Game.state; 

    // ===========================
    // 進入爬塔
    // ===========================
    if (btnEnterTower) {
        btnEnterTower.addEventListener('click', () => {
            lobbyLayer.classList.add('hidden');
            towerLayer.classList.remove('hidden');
            
            startNewFloor();
            // 呼叫 Game Core 播放戰鬥音樂
            window.Game.playMusic('/holylegend/audio/tower_theme.ogg');
        });
    }

    // ===========================
    // 離開爬塔 (結算)
    // ===========================
    if (btnExitTower) {
        btnExitTower.addEventListener('click', async () => {
            if (state.isGameOver || state.processingLevelUp) return;

            const totalExp = calculateGameOver(); 

            if (!confirm(`確定要離開嗎？\n目前獲得金幣: ${state.goldCollected}\n預計獲得經驗: ${totalExp}`)) return;

            state.isGameOver = true;
            alert(`結算完成！\n獲得金幣: ${state.goldCollected}\n獲得經驗: ${totalExp}`);
            
            resetBattle();
        });
    }

    // ===========================
    // 戰鬥邏輯：攻擊
    // ===========================
    if (btnAttack) {
        btnAttack.addEventListener('click', () => {
            // 【修正 1】加入 state.isTurnLocked 檢查
            // 防止玩家在怪物反擊的空檔連續攻擊 (強制回合制)
            if (state.isGameOver || state.processingLevelUp || state.playerHp <= 0 || state.isTurnLocked) return;

            // 【修正 2】立即上鎖，直到怪物反擊結束才能再按
            state.isTurnLocked = true;
            
            // (選用) 視覺回饋：讓按鈕變灰，提示冷卻中
            btnAttack.style.filter = "grayscale(100%)";
            btnAttack.style.transform = "translateY(2px)"; // 壓下去的效果

            const enemyImg = document.getElementById('enemy-img');
            if(enemyImg) {
                enemyImg.style.transform = 'scale(0.9)';
                setTimeout(() => enemyImg.style.transform = 'scale(1)', 100);
            }

            // 假設 playerLevel 存在
            const playerLevel = state.level || 1; // 預設 1 級
            const baseDamage = Math.floor(Math.random() * 10) + 10;

            // 公式 1：等級線性加成
            const damage = Math.round(baseDamage + playerLevel * 1.1); // 每等級加 2 點傷害

            state.enemyHp -= damage;

            showDamageNumber(damage);
            updateEnemyUI();

            // 怪物死亡
            if (state.enemyHp <= 0) {
                state.processingLevelUp = true;
                state.goldCollected += 50;
                updateTopBarUI();
                
                if(enemyImg) enemyImg.style.opacity = '0';
                
                // 怪物死了，不需要解鎖 isTurnLocked，因為 startNewFloor 會負責重置
                
                setTimeout(() => {
                    if (state.isGameOver) return; 
                    state.currentFloor++;
                    startNewFloor();
                }, 500);
            } else {
                setTimeout(enemyAttack, 500);
            }
        });
    }

    // --- 輔助函式 ---

    function calculateGameOver() {
        const floor = state.currentFloor;
        let EXPgained = 0;
        let baseEXP = 1;
        for (let i = 1; i <= floor; i++) {
            EXPgained += baseEXP * i;
            if (i % 10 === 0) EXPgained += 20; 
            else if (i % 5 === 0) EXPgained += 5;
        }
        return EXPgained;
    }

    function startNewFloor() {
        state.isGameOver = false; 
        state.processingLevelUp = false; 
        
        // 【修正 3】新樓層開始，解開回合鎖，恢復按鈕樣式
        state.isTurnLocked = false;
        if(btnAttack) {
            btnAttack.style.filter = "";
            btnAttack.style.transform = "";
        }

        state.enemyMaxHp = 100 + (state.currentFloor * 10);
        state.enemyHp = state.enemyMaxHp;
        
        const enemyImg = document.getElementById('enemy-img');
        if(enemyImg) {
            enemyImg.style.opacity = '1';
            const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
            const randomIndex = Math.floor(Math.random() * monsters.length);
            const randomMonster = monsters[randomIndex];
            enemyImg.src = `/holylegend/images/enemies/${randomMonster}.png`;
            enemyImg.onerror = function() {
                this.src = '/holylegend/images/enemies/slime.png'; 
            };
        }
        updateEnemyUI();
        updateTopBarUI();
        updatePlayerUI();
    }

    async function enemyAttack() {
        // 注意：這裡不要檢查 isTurnLocked，因為這就是解鎖的時刻
        if (state.isGameOver || state.processingLevelUp) return;

        const dmg = 5;
        state.playerHp -= dmg;
        if (state.playerHp < 0) state.playerHp = 0;
        
        updatePlayerUI();
        
        // 【修正 4】怪物攻擊完畢，解開回合鎖，玩家可以再次攻擊
        state.isTurnLocked = false;
        if(btnAttack) {
            btnAttack.style.filter = "";
            btnAttack.style.transform = "";
        }

        document.body.style.backgroundColor = '#500';
        setTimeout(() => document.body.style.backgroundColor = '', 100);

        // 玩家死亡
        if (state.playerHp <= 0) {
            if (state.isGameOver) return;
            state.isGameOver = true;

            alert(`你已在第 ${state.currentFloor} 層倒下`);
            const expGained = calculateGameOver();
            alert(`你獲得了 ${expGained} 點經驗值！`);
            
            try {
                await fetch('/holylegend/game_lobby/save_status', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        exp: expGained,
                        gold: state.goldCollected
                    })
                });
            } catch (err) {
                console.error("結算失敗", err);
            }

            resetBattle();
        }
    }

    function resetBattle() {
        state.goldCollected = 0;
        state.currentFloor = 1; 
        state.isGameOver = false;
        state.processingLevelUp = false;
        
        towerLayer.classList.add('hidden');
        lobbyLayer.classList.remove('hidden');

        // 切回大廳音樂
        window.Game.playMusic('/holylegend/audio/game_lobby.ogg');
        
        location.reload(); 
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
        const pct = (state.enemyHp / state.enemyMaxHp) * 100;
        const bar = document.getElementById('enemy-hp-fill');
        if(bar) bar.style.width = `${Math.max(0, pct)}%`;
    }

    function updatePlayerUI() {
        window.Game.safeSetText('battle-hp-text', `${state.playerHp}/${state.playerMaxHp}`);
        window.Game.safeSetText('battle-mp-text', `${state.playerMp}/${state.playerMaxMp}`);
        
        const hpPct = (state.playerHp / state.playerMaxHp) * 100;
        const mpPct = (state.playerMp / state.playerMaxMp) * 100;
        
        const hpBar = document.getElementById('battle-hp-bar');
        const mpBar = document.getElementById('battle-mp-bar');
        if(hpBar) hpBar.style.width = `${hpPct}%`;
        if(mpBar) mpBar.style.width = `${mpPct}%`;
    }

    function updateTopBarUI() {
        window.Game.safeSetText('tower-floor', state.currentFloor);
        window.Game.safeSetText('tower-gold', state.goldCollected);
    }
});