document.addEventListener('DOMContentLoaded', () => {
    
    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const teamLayer = document.getElementById('team-layer');
    const btnEnterTower = document.getElementById('btn-enter-tower');
    const btnExitTower = document.getElementById('btn-tower-exit');
    const btnAttack = document.getElementById('btn-attack');
    const teammatesContainer = document.getElementById('teammates-container'); // 新增這個
    
    // 獎勵與準備
    const rewardLayer = document.getElementById('reward-layer');
    const rewardCardsContainer = document.getElementById('reward-cards-container');
    const readyCheckLayer = document.getElementById('ready-check-layer');
    const readySlotsContainer = document.getElementById('ready-slots-container');
    const btnReadyAccept = document.getElementById('btn-ready-accept');
    const btnReadyDecline = document.getElementById('btn-ready-decline');

    const state = window.Game.state; 
    const socket = window.Game.socket; 

    // 多人模式狀態標記
    let isMultiplayerMode = false;
    let waitingForTurn = false; // 是否正在等待隊友行動
    let battleLogContainer = null; // 日誌容器
    let myReadyStatus = false; // 記錄自己的準備狀態

    // 獎勵圖示
    const REWARD_ICONS = {
        'STR': '💪', 'DEX': '🦶', 'CON': '🛡️', 'INT': '🔮',
        'GOLD': '💰', 'EXP': '✨',
        'HP': '❤️', 'HEAL_PERCENT': '❤️', // 相容兩種寫法
        'MP': '💧', 'MP_RECOVER_PERCENT': '💧'
    };

    // 執行 UI 初始化
    initBattleLogUI();

    // ===========================
    // 初始化：動態建立戰鬥日誌 UI
    // ===========================
    function initBattleLogUI() {
        // 1. 注入 CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .battle-log {
                position: absolute;
                top: 70px; /* Header 下方 */
                left: 10px;
                right: 10px;
                height: 100px; /* 固定高度 */
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #555;
                border-radius: 4px;
                pointer-events: none; /* 讓點擊穿透，不影響打怪 */
                overflow-y: hidden;
                display: flex;
                flex-direction: column;
                justify-content: flex-end; /* 訊息從底部開始 */
                padding: 5px 10px;
                font-family: 'VT323', monospace;
                font-size: 1.1rem;
                z-index: 5;
            }
            .log-line { margin-top: 2px; text-shadow: 1px 1px 0 #000; opacity: 0.9; }
            .log-player { color: #f1c40f; } /* 黃色：自己 */
            .log-team { color: #3498db; }   /* 藍色：隊友/全隊 */
            .log-enemy { color: #e74c3c; }  /* 紅色：怪物/受傷 */
            .log-system { color: #bdc3c7; } /* 灰色：系統 */
        `;
        document.head.appendChild(style);

        // 2. 建立 DOM
        if (!document.getElementById('battle-log')) {
            const logDiv = document.createElement('div');
            logDiv.id = 'battle-log';
            logDiv.className = 'battle-log';
            if (towerLayer) towerLayer.appendChild(logDiv);
            battleLogContainer = logDiv;
        } else {
            battleLogContainer = document.getElementById('battle-log');
        }
    }

    // 輔助：新增日誌訊息
    function addBattleLog(message, type = 'log-system') {
        if (!battleLogContainer) return;
        
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        line.innerText = message;
        battleLogContainer.appendChild(line);

        // 只保留最近 5 條
        while (battleLogContainer.children.length > 5) {
            battleLogContainer.removeChild(battleLogContainer.firstChild);
        }
    }


    // ===========================
    // Socket 事件監聽 (多人戰鬥核心)
    // ===========================
    if (socket) {
        socket.on('init_ready_check', (members) => {
            isMultiplayerMode = true;
            myReadyStatus = false; // 重置
            renderReadyCheckModal(members);
            lobbyLayer.classList.add('hidden');
            teamLayer.classList.add('hidden');
            towerLayer.classList.remove('hidden');
            readyCheckLayer.classList.remove('hidden');
        });

        socket.on('update_ready_view', (data) => {
            updateReadySlotStatus(data.socketId, data.status);
        });

        socket.on('ready_check_canceled', (data) => {
            alert(`${data.nickname} 拒絕了準備，取消戰鬥。`);
            readyCheckLayer.classList.add('hidden');
            towerLayer.classList.add('hidden');
            teamLayer.classList.remove('hidden');
            btnReadyAccept.disabled = false;
            btnReadyDecline.disabled = false;
            btnReadyAccept.innerText = "接受";
            window.Game.playMusic('/holylegend/audio/game_lobby.ogg');
        });

        socket.on('multiplayer_battle_start', (initialData) => {
            readyCheckLayer.classList.add('hidden');
            state.currentFloor = initialData.floor;
            state.enemyMaxHp = initialData.enemyMaxHp;
            state.enemyHp = initialData.enemyHp;
            state.isGameOver = false;
            state.processingLevelUp = false;
            waitingForTurn = false;
            state.isTurnLocked = false;
            readyCheckLayer.classList.add('hidden');
            rewardLayer.classList.add('hidden'); // ★ 確保這一行存在，不然下一層開始了獎勵視窗還在

            // 【新增】渲染隊友介面
            if (initialData.players) {
                renderTeammatesUI(initialData.players);
            }
            
            startNewFloor(true, initialData.monsterType); 
            window.Game.playMusic('/holylegend/audio/tower_theme.ogg');
            
            addBattleLog(`=== 第 ${initialData.floor} 層戰鬥開始 ===`, 'log-system');
        });

        socket.on('turn_result', (result) => {
            const enemyImg = document.getElementById('enemy-img');
            if(enemyImg) {
                enemyImg.style.transform = 'scale(0.8)';
                setTimeout(() => enemyImg.style.transform = 'scale(1)', 100);
            }

            state.enemyHp = Math.max(0, state.enemyHp - result.damageDealt);
            showDamageNumber(result.damageDealt); 
            updateEnemyUI();

            if (result.playersStatus) {
                updateTeammatesUI(result.playersStatus);
                
                const myStatus = result.playersStatus[socket.id];
                if (myStatus) {
                    state.playerHp = myStatus.hp;
                    updatePlayerUI(); // 這裡才更新 UI
                }
            }

            // 顯示全隊傷害日誌
            addBattleLog(`隊伍合力造成 ${result.damageDealt} 點傷害`, 'log-team');

            if (result.damageTaken > 0 && result.targetSocketId) {
                setTimeout(() => {
                    if (result.targetSocketId === socket.id) {
                        playerTakeDamageVisual(result.damageTaken); 
                        // 日誌在 playerTakeDamage 裡處理
                    } else {
                        addBattleLog(`隊友受到了 ${result.damageTaken} 點傷害！`, 'log-enemy');
                    }
                }, 600);
            }

            if (result.deadPlayerId) {
                if (result.deadPlayerId === socket.id) {
                    state.isGameOver = true; 
                    state.playerHp = 0;
                    updatePlayerUI();
                    addBattleLog("你已倒下！進入觀戰模式...", 'log-enemy');
                    alert("你已倒下！進入觀戰模式...");
                    updateControlsState(); 
                } else {
                    addBattleLog("一名隊友倒下了！", 'log-enemy');
                }
            }

            // 【新增】同步隊友血量
            if (result.playersStatus) {
                updateTeammatesUI(result.playersStatus);
                
                // 同步自己的血量 (Server Authority 校正)
                // 雖然本地有 playerTakeDamage，但用 Server 的值校正更準
                const myStatus = result.playersStatus[socket.id];
                if (myStatus) {
                    state.playerHp = myStatus.hp;
                    updatePlayerUI();
                }
            }

            if (result.isAllDead) {
                return;
            }

            if (!state.isGameOver && !result.isEnemyDead) {
                waitingForTurn = false;
                state.isTurnLocked = false; 
                updateControlsState(); 
            }

            if (result.isEnemyDead) {
                handleMonsterDeath();
            }
        });

        socket.on('multiplayer_show_rewards', () => {
            showRewards();
        });

        // ★ 新增：等待隊友選擇中
        socket.on('waiting_for_teammates', (data) => {
            // 可以在這裡顯示一個簡單的 Loading 畫面或文字
            // 這裡簡單用 Alert 或者改變 UI 文字
            // 為了不打斷體驗，建議在 rewardLayer 顯示文字就好
            const container = document.getElementById('reward-cards-container');
            container.innerHTML = `<div style="color:white; font-size:1.5rem;">
                等待隊友選擇... (${data.current}/${data.total})
            </div>`;
        });
        
        socket.on('game_over_all', async (data) => {
             // 【修正】防止重複執行
             if (state.isEndingProcessing) return;
             state.isEndingProcessing = true;

             state.currentFloor = data.floor;
             alert(`全隊覆沒！止步於第 ${state.currentFloor} 層`);
             
             await saveProgress();
             resetBattle();
             
             state.isEndingProcessing = false;
        });
    }

    // ===========================
    // 進入爬塔按鈕
    // ===========================
    if (btnEnterTower) {
        btnEnterTower.addEventListener('click', () => {
            // 判斷是否在隊伍中 (檢查 HTML 裡是否有隊伍資訊，或是 check myRoomId)
            // 這裡假設如果 team-status-text 顯示有房間號，就是多人
            const teamText = document.querySelector('.team-status-text');
            const isInTeam = teamText && teamText.innerText.includes('房號');
            btnReadyAccept.style.backgroundColor = ""; // 恢復原色

            if (isInTeam) {
                // --- 多人模式 ---
                // 發送請求給 Server，Server 會廣播 init_ready_check 給全隊
                socket.emit('request_tower_start');
            } else {
                // --- 單人模式 (保持原樣) ---
                isMultiplayerMode = false;
                lobbyLayer.classList.add('hidden');
                towerLayer.classList.remove('hidden');
                window.Game.playMusic('/holylegend/audio/tower_theme.ogg');
                startNewFloor();
                
            }
        });
    }

    // ===========================
    // 準備確認按鈕
    // ===========================
    // 【新增】準備/取消按鈕邏輯
    if (btnReadyAccept) {
        btnReadyAccept.addEventListener('click', () => {
            if (!myReadyStatus) {
                // 接受
                socket.emit('respond_ready', true);
                myReadyStatus = true;
                btnReadyAccept.innerText = "取消";
                btnReadyAccept.style.backgroundColor = "#e67e22"; // 橘色
                btnReadyDecline.disabled = true; // 已準備就不能直接按拒絕，要先取消
            } else {
                // 取消準備
                socket.emit('cancel_ready');
                myReadyStatus = false;
                btnReadyAccept.innerText = "接受";
                btnReadyAccept.style.backgroundColor = ""; // 恢復原色
                btnReadyDecline.disabled = false;
            }
        });
    }

    if (btnReadyDecline) {
        btnReadyDecline.addEventListener('click', () => {
            socket.emit('respond_ready', false); // 拒絕
            // 回大廳
            readyCheckLayer.classList.add('hidden');
            lobbyLayer.classList.remove('hidden');
            towerLayer.classList.add('hidden');
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
            
            if (isMultiplayerMode) {
                socket.emit('leave_battle'); // 通知 Server 離開
            }

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

           if (isMultiplayerMode && socket) {
                waitingForTurn = true;
                // 【關鍵修正】把本地的 HP 傳給 Server，強迫 Server 同步
                socket.emit('player_action', { 
                    type: 'attack',
                    currentHp: state.playerHp,
                    AdditionState: state.AdditionState
                });
            } else {
                // --- 單人模式 (原邏輯) ---
                performLocalAttack();
            }
        });
    }

    // 單人攻擊邏輯 (封裝)
    function performLocalAttack() {
        const enemyImg = document.getElementById('enemy-img');
        let damage = 0;

        if(enemyImg) {
            enemyImg.style.transform = 'scale(0.9)';
            setTimeout(() => enemyImg.style.transform = 'scale(1)', 100);
        }

        state.AdditionState.forEach(value => {
            for (let i = 0; i < state.AdditionState.length; i++)
            {
                damage += value * 0.25;
            }
        });

        const system_critRate = Math.random() * 100
        let critRate = (state.AdditionState.DEX * 0.25 + state.AdditionState.INT * 0.15)
        let CritMultiply = 1;

        if (system_critRate < critRate)
        {
            CritMultiply = 2;
        }

        let damageMultiply = 0.8 + Math.random() * 0.4
        damage = Math.round(damage * damageMultiply * CritMultiply);
        // 若有屬性加成...
        
        state.enemyHp -= damage;
        addBattleLog(`你對怪物造成 ${damage} 點傷害`, 'log-player');
        showDamageNumber(damage);
        updateEnemyUI();

        if (state.enemyHp <= 0) {
            handleMonsterDeath();
        } else {
            setTimeout(enemyAttack, 500); // 單人怪物反擊
        }
    }

    // 怪物死亡處理 (通用)
    function handleMonsterDeath() {
        state.processingLevelUp = true;
        state.goldCollected += 50;
        updateTopBarUI();
        
        addBattleLog(`怪物被擊敗！獲得 50 金幣`, 'log-system');
        state.currentFloor++;
        const enemyImg = document.getElementById('enemy-img');
        if(enemyImg) enemyImg.style.opacity = '0';
        
        setTimeout(() => {
            if (state.isGameOver) return; 
            if (isMultiplayerMode) {
                // 多人模式：等待 Server 發送下一層指令 (或者 Server 直接發獎勵)
                // 這裡暫時模擬：
                // socket.emit('request_next_floor'); 
            } else {
                const RewardRate = Math.floor(Math.random() * 100)

                if (RewardRate <= 14) {
                    showRewards(); // 單人顯示獎勵
                }

                else {
                    startNewFloor();
                }
                
            }
        }, 500);
    }

    function playerTakeDamageVisual(amount) {
        // 純視覺，不改 state.playerHp
        document.body.style.backgroundColor = '#500';
        setTimeout(() => document.body.style.backgroundColor = '', 100);
        addBattleLog(`你受到 ${amount} 點傷害！`, 'log-enemy');
    }


    // 單人模式專用：包含扣血邏輯
    function playerTakeDamage(amount) {
        state.playerHp -= amount;
        if (state.playerHp < 0) state.playerHp = 0;
        updatePlayerUI();
        
        document.body.style.backgroundColor = '#500';
        setTimeout(() => document.body.style.backgroundColor = '', 100);
        addBattleLog(`你受到 ${amount} 點傷害！`, 'log-enemy');

        if (state.playerHp <= 0 && !isMultiplayerMode) {
            addBattleLog("你已倒下！戰鬥結束。", 'log-enemy');
            alert("你已倒下！");
            state.isGameOver = true;
            saveProgress().then(resetBattleToLobby);
        }
    }

    // --- 輔助函式 ---
    // 渲染準備視窗
    function renderReadyCheckModal(members) {
        const container = document.getElementById('ready-slots-container');
        container.innerHTML = '';

        // 復原按鈕
        btnReadyAccept.disabled = false;
        btnReadyDecline.disabled = false;
        btnReadyAccept.innerText = "接受";

        members.forEach(m => {
            const roleName = m.state.role ? (m.state.role.charAt(0).toUpperCase() + m.state.role.slice(1).toLowerCase()) : 'Novice';
            const imgSrc = `/holylegend/images/classes/${roleName}_1.png`;

            const slot = document.createElement('div');
            slot.className = 'ready-slot active'; // 標記有人
            slot.id = `slot-${m.socketId}`; // 方便後續更新狀態
            
            slot.innerHTML = `
                <img src="${imgSrc}" class="slot-avatar">
                <div class="slot-status"></div>
                <div class="slot-name">${m.nickname}</div>
            `;
            container.appendChild(slot);
        });
    }

    // 更新某個格子的勾勾
    function updateReadySlotStatus(socketId, status) {
        const slot = document.getElementById(`slot-${socketId}`);
        if (slot) {
            if (status === 'accepted') {
                slot.classList.add('accepted');
            } else if (status === 'declined') {
                slot.classList.add('declined');
            }
        }
    }

    // 更新按鈕外觀 (冷卻/等待中)
    function updateControlsState() {
        if (waitingForTurn || state.isTurnLocked) {
            btnAttack.style.filter = "grayscale(100%)";
            btnAttack.style.transform = "translateY(2px)";
        } else {
            btnAttack.style.filter = "";
            btnAttack.style.transform = "";
        }
    }

    async function resetBattle() {
        state.goldCollected = 0;
        state.currentFloor = 1; 
        state.isGameOver = false;
        state.processingLevelUp = false;
        state.playerHp = state.playerMaxHp;
        state.playerMp = state.playerMaxMp;
        
        towerLayer.classList.add('hidden');
        lobbyLayer.classList.remove('hidden');
        readyCheckLayer.classList.add('hidden'); // 確保關閉

        window.Game.playMusic('/holylegend/audio/game_lobby.ogg');
        await initGame();
        
    }

    // 回到大廳 (單人用)
    async function resetBattleToLobby() {
        state.goldCollected = 0;
        state.currentFloor = 1; 
        state.isGameOver = false;
        
        towerLayer.classList.add('hidden');
        lobbyLayer.classList.remove('hidden');
        window.Game.playMusic('/holylegend/audio/game_lobby.ogg');
        await initGame();
    }

    async function initGame() {
        try {
            const response = await fetch('/holylegend/system/status');
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                // 更新全域狀態
                Game.state.playerHp = data.hp;
                Game.state.playerMaxHp = data.maxHp;
                Game.state.playerMp = data.mp;
                Game.state.playerMaxMp = data.maxMp;
                Game.state.level = data.level;
                Game.state.currentFloor = 1;
                Game.state.role = data.role; // 記錄職業
                Game.state.AdditionState = data.AdditionState;
                Game.state.AdditionEXP = 0;
                Game.InitData.nickname = data.nickname;
                
                // 更新 UI
                Game.updateLobbyUI(data);
            } else {
                console.warn("API 回傳失敗");
            }
        } catch (error) {
            console.error("無法連線到伺服器:", error);
            Game.updateLobbyUI(window.INITIAL_PLAYER_DATA);
        }
    }

    async function saveProgress() {
        const expGained = calculateGameOver();
        alert(`你已在 ${state.currentFloor} 層\n獲得點 ${expGained} 經驗值`)
        try {
            await fetch('/holylegend/game_lobby/save_status', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exp: expGained,
                    gold: state.goldCollected
                })
            });
            console.log(`存檔成功: EXP+${expGained}, Gold+${state.goldCollected}`);
        } catch (err) {
            console.error("結算失敗", err);
        }
    }

    function calculateGameOver() {
        const floor = state.currentFloor;
        let EXPgained = 0;
        let baseEXP = 1;
        for (let i = 1; i <= floor; i++) {
            EXPgained += baseEXP * i;
            if (i % 10 === 0) EXPgained += 20; 
            else if (i % 5 === 0) EXPgained += 5;
        }

        EXPgained += state.AdditionEXP;
        return EXPgained;
    }

    function startNewFloor(isMultiplayerInit = false, specifiedMonster = null) {
        state.processingLevelUp = false; 

        if (!isMultiplayerInit) {
            state.enemyMaxHp = 100 + (state.currentFloor * 10);
            state.enemyHp = state.enemyMaxHp;
        }
        
        // 確保沒死才能解鎖
        if (!state.isGameOver) {
            state.isTurnLocked = false;
            waitingForTurn = false;
            updateControlsState();
        }

        const enemyImg = document.getElementById('enemy-img');
        if(enemyImg) {
            enemyImg.style.opacity = '1';
            let randomMonster = 'slime';
            if (specifiedMonster) {
                randomMonster = specifiedMonster;
            } else {
                const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                randomMonster = monsters[Math.floor(Math.random() * monsters.length)];
            }
            enemyImg.src = `/holylegend/images/enemies/${randomMonster}.png`;
            enemyImg.onerror = function() {
                this.src = '/holylegend/images/enemies/slime.png'; 
            };
        }
        updateEnemyUI();
        updateTopBarUI();
        updatePlayerUI();
    }

    

    async function showRewards() {
        // 1. 顯示遮罩
        rewardLayer.classList.remove('hidden');
        // 顯示載入中提示
        rewardCardsContainer.innerHTML = '<div style="color: white; font-size: 1.5rem;">正在祈禱...</div>';

        try {
            // 2. 從路由獲取資料 (API)
            const response = await fetch('/holylegend/system/rewards');
            const result = await response.json();

            // if (!result.success) throw new Error(result.msg || '無法獲取獎勵');

            const allRewards = result.data; // 資料庫裡的所有獎勵

            // 3. 隨機抽取 3 個獎勵
            const options = [];
            // 複製一份陣列以免影響原資料
            const pool = [...allRewards];

            for(let i=0; i<3; i++) {
                if (pool.length === 0) break;
                const randIndex = Math.floor(Math.random() * pool.length);
                options.push(pool[randIndex]);
                pool.splice(randIndex, 1); // 取出後移除，避免重複
            }

            // 清空載入文字
            rewardCardsContainer.innerHTML = '';

            // 4. 生成卡片 DOM
            options.forEach((rewardData, index) => {
                const card = document.createElement('div');
                card.className = 'reward-card';
                
                // 設置動畫延遲
                card.style.animationDelay = `${index * 0.2}s`;

                // 根據資料庫欄位準備顯示內容
                let icon = REWARD_ICONS[rewardData.rewardType] || '🎁';
                let desc = '';

                if (rewardData.rewardType === 'GOLD') {
                    desc = `獲得 ${rewardData.rewardValue} 金幣`;
                } else if (rewardData.rewardType === 'EXP') {
                    desc = `獲得 ${rewardData.rewardValue} 經驗`;
                } else if (rewardData.rewardPercent > 0) {
                    desc = `恢復 ${rewardData.rewardPercent}% ${rewardData.rewardType}`;
                } else {
                    desc = `${rewardData.rewardType} +${rewardData.rewardValue}`;
                }

                card.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="card-icon">${icon}</div>
                            <div class="card-name">${rewardData.name}</div>
                            <div class="card-desc">${desc}</div>
                        </div>
                        <div class="card-back"></div>
                    </div>
                `;

                // 【關鍵修正】監聽動畫結束，強制設定樣式
                // 解決 CSS forwards 可能導致卡片變回透明的問題
                card.addEventListener('animationend', () => {
                    // 如果已經被點擊(正在退場)，就不干涉
                    if (card.classList.contains('clicked')) return;
                    
                    card.style.opacity = '1';
                    card.style.transform = 'translate(0, 0) rotateY(0deg) scale(1)';
                });

                // 5. 綁定點擊事件
                card.addEventListener('click', () => {
                    applyReward(rewardData);
                });

                rewardCardsContainer.appendChild(card);

                // 6. 觸發進場動畫
                setTimeout(() => {
                    card.classList.add('animate-in');
                }, 50);
            });

        } catch (e) {
            console.error("獎勵系統錯誤:", e);
            rewardCardsContainer.innerHTML = '<div style="color: white;">獎勵載入失敗...</div>';
            // 失敗保底：2秒後自動進入下一層
            setTimeout(() => {
                rewardLayer.classList.add('hidden');
                startNewFloor();
            }, 2000);
        }
    }

    function applyReward(rewardData) {
        // 1. 執行效果 (根據 rewardType)
        switch (rewardData.rewardType) {
            case 'HP': // 資料庫是用 HP
                if (rewardData.rewardPercent > 0) {
                    const heal = Math.floor(state.playerMaxHp * (rewardData.rewardPercent / 100));
                    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + heal);
                    addBattleLog(`恢復了 ${heal} 點生命！`, 'log-player');
                } else {
                    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + rewardData.rewardValue);
                    addBattleLog(`恢復了 ${rewardData.rewardValue} 點生命！`, 'log-player');
                }
                break;
            case 'MP': // 資料庫是用 MP
                if (rewardData.rewardPercent > 0) {
                    const mana = Math.floor(state.playerMaxMp * (rewardData.rewardPercent / 100));
                    state.playerMp = Math.min(state.playerMaxMp, state.playerMp + mana);
                    addBattleLog(`恢復了 ${mana} 點魔力！`, 'log-player');
                } else {
                    state.playerMp = Math.min(state.playerMaxMp, state.playerMp + rewardData.rewardValue);
                    addBattleLog(`恢復了 ${rewardData.rewardValue} 點魔力！`, 'log-player');
                }
                break;
            case 'GOLD':
                state.goldCollected += rewardData.rewardValue;
                break;
            case 'EXP':
                // 這裡暫時用 alert 提示，實際可加到一個暫存變數 bonusExp，結算時一併送出
                // 如果後端結算API沒有接收 bonusExp，這裡僅為視覺效果
                state.AdditionEXP += rewardData.rewardValue;
                alert(`獲得 ${rewardData.rewardValue} 經驗值 (將於結算時發放)`);
                break;
            case 'STR':
                state.AdditionState[0] += rewardData.rewardValue;
            case 'DEX':
                state.AdditionState[1] += rewardData.rewardValue;
            case 'CON':
                state.AdditionState[2] += rewardData.rewardValue;
            case 'INT':
                state.AdditionState[3] += rewardData.rewardValue;
                alert(`${rewardData.name} 生效！(本次冒險屬性提升)`);
                break;
            case 'REVIVE':
                state.playerHp = state.playerMaxHp;
                state.playerMp = state.playerMaxMp;
                state.isDead = false;
            default:
                console.log("未知的獎勵類型:", rewardData);
        }

        // 3. 動畫結束後的行為
        setTimeout(() => {
            updatePlayerUI();
            updateTopBarUI();
            
            if (isMultiplayerMode && socket) {
                // 多人模式：通知 Server 我選好了，並且不關閉遮罩(等待隊友)
                socket.emit('player_selected_reward', { 
                    reward: rewardData
                });
                
                // 清空卡片，顯示等待訊息
                rewardCardsContainer.innerHTML = '<div style="color: white; font-size: 1.5rem;">等待隊友選擇...</div>';
                // 注意：不要移除 hidden，讓遮罩繼續蓋著，直到下一層開始
            } else {
                // 單人模式：直接進下一層
                rewardLayer.classList.add('hidden');
                state.currentFloor++;
                startNewFloor();
            }
        }, 600);
    }

    async function enemyAttack() {
        // 注意：這裡不要檢查 isTurnLocked，因為這就是解鎖的時刻
        if (state.isGameOver || state.processingLevelUp) return;

        const dmg = 5;
        state.isTurnLocked = false; // 解鎖

        playerTakeDamage(dmg);
        updateControlsState();

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


    // ===========================
    //  新增：隊友 UI 輔助函式
    // ===========================

    function renderTeammatesUI(players) {
        teammatesContainer.innerHTML = ''; // 清空

        players.forEach(p => {
            // 跳過自己，只顯示隊友
            if (p.socketId === socket.id) return;

            const roleName = p.role ? (p.role.charAt(0).toUpperCase() + p.role.slice(1).toLowerCase()) : 'Novice';
            const imgSrc = `/holylegend/images/classes/${roleName}_1.png`;

            const card = document.createElement('div');
            card.className = 'tm-card';
            card.dataset.id = p.socketId; // 用 socketId 識別

            // 計算初始百分比
            const hpPct = (p.hp / p.maxHp) * 100;
            const mpPct = (p.mp / p.maxMp) * 100;

            card.innerHTML = `
                <div class="tm-avatar-box">
                    <img src="${imgSrc}" onerror="this.src='/holylegend/images/classes/Novice_1.png'">
                </div>
                <div class="tm-info">
                    <div class="tm-name">${p.nickname}</div>
                    <div class="tm-bar-group">
                        <div class="tm-hp-bar">
                            <div class="fill" style="width: ${hpPct}%"></div>
                        </div>
                        <div class="tm-mp-bar">
                            <div class="fill" style="width: ${mpPct}%"></div>
                        </div>
                    </div>
                </div>
            `;
            
            // 點擊事件 (未來擴充：對隊友使用技能)
            card.addEventListener('click', () => {
                console.log(`點擊了隊友: ${p.nickname} (${p.socketId})`);
                // 例如：useSkillOn(p.socketId);
            });

            teammatesContainer.appendChild(card);
        });
    }

    function updateTeammatesUI(statusMap) {
        // statusMap: { socketId: { hp, isDead }, ... }
        
        const cards = teammatesContainer.querySelectorAll('.tm-card');
        cards.forEach(card => {
            const sid = card.dataset.id;
            const status = statusMap[sid];
            
            if (status) {
                // 1. 處理死亡樣式
                if (status.isDead) {
                    card.classList.add('dead');
                } else {
                    card.classList.remove('dead');
                }

                // 2. 更新血條 (這裡簡化，假設 maxHp 不變，或者可以從 dataset 存 maxHp)
                // 為了簡單，我們假設 maxHp 是 100 (或者需要從一開始存起來)
                // 更好的做法是在 render 時把 maxHp 存到 dataset
                // 這裡先做一個簡單的視覺更新，假設滿血比例
                
                // 修正：因為我們不知道 maxHp，這裡用一個簡單的視覺縮放
                // 實務上應該在 render 時存 data-max-hp
                // 暫時解法：如果 hp=0 width=0, 否則大致顯示
                // 為了準確，建議修改 renderTeammates 把 maxHp 存入
                
                // 讓我們優化一下 renderTeammates (上面代碼我沒改 dataset，這裡補救一下)
                // 如果您希望準確，請在 renderTeammates 的 card.dataset.maxHp = p.maxHp;
                // 這裡先假設 width 直接反映百分比 (如果後端傳來的是數值，這裡會有點問題)
                
                // 既然是休閒，我們先做視覺回饋：
                // 我們需要 maxHp 才能算百分比。
                // 如果沒存 maxHp，這裡會有點難算。
                // 建議方案：後端直接傳 hpPercent 比較快，或者前端存 map。
            }
        });
    }
    
    // 優化版：需要先建立一個 Map 存隊友最大血量
    const teammatesData = {}; // 用來存 { socketId: maxHp }

    // 重新覆寫 renderTeammatesUI 以儲存 maxHp
    function renderTeammatesUI(players) {
        teammatesContainer.innerHTML = ''; 

        players.forEach(p => {
            if (p.socketId === socket.id) return;
            
            // 存起來
            teammatesData[p.socketId] = { maxHp: p.maxHp || 100, maxMp: p.maxMp || 50 };

            const roleName = p.role ? (p.role.charAt(0).toUpperCase() + p.role.slice(1).toLowerCase()) : 'Novice';
            const imgSrc = `/holylegend/images/classes/${roleName}_1.png`;

            const card = document.createElement('div');
            card.className = 'tm-card';
            card.dataset.id = p.socketId;

            const hpPct = (p.hp / p.maxHp) * 100;
            const mpPct = (p.mp / p.maxMp) * 100;

            card.innerHTML = `
                <div class="tm-avatar-box">
                    <img src="${imgSrc}">
                </div>
                <div class="tm-info">
                    <div class="tm-name">${p.nickname}</div>
                    <div class="tm-bar-group">
                        <div class="tm-hp-bar"><div class="fill" style="width: ${hpPct}%"></div></div>
                        <div class="tm-mp-bar"><div class="fill" style="width: ${mpPct}%"></div></div>
                    </div>
                </div>
            `;
            teammatesContainer.appendChild(card);
        });
    }

    // 重新覆寫 updateTeammatesUI
    function updateTeammatesUI(statusMap) {
        const cards = teammatesContainer.querySelectorAll('.tm-card');
        cards.forEach(card => {
            const sid = card.dataset.id;
            const status = statusMap[sid];
            const maxData = teammatesData[sid]; // 取出最大值

            if (status && maxData) {
                if (status.isDead) card.classList.add('dead');
                else card.classList.remove('dead');

                const hpPct = (status.hp / maxData.maxHp) * 100;
                // MP 如果後端沒傳，就先不動
                
                const hpBar = card.querySelector('.tm-hp-bar .fill');
                if(hpBar) hpBar.style.width = `${Math.max(0, hpPct)}%`;
            }
        });
    }
});