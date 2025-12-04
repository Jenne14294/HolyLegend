document.addEventListener('DOMContentLoaded', () => {
    
    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const btnEnterTower = document.getElementById('btn-enter-tower');
    const btnExitTower = document.getElementById('btn-tower-exit');
    const btnAttack = document.getElementById('btn-attack');
    
    // 獎勵相關
    const rewardLayer = document.getElementById('reward-layer');
    const rewardCardsContainer = document.getElementById('reward-cards-container');

    // 多人準備相關
    const readyCheckLayer = document.getElementById('ready-check-layer');
    const readySlotsContainer = document.getElementById('ready-slots-container');
    const btnReadyAccept = document.getElementById('btn-ready-accept');
    const btnReadyDecline = document.getElementById('btn-ready-decline');

    // 簡化存取 Game.state
    const state = window.Game.state; 
    const socket = window.Game.socket; 

    // 多人模式狀態標記
    let isMultiplayerMode = false;
    let waitingForTurn = false; // 是否正在等待隊友行動

    // 獎勵圖示
    const REWARD_ICONS = {
        'STR': '💪', 'DEX': '🦶', 'CON': '🛡️', 'INT': '🔮',
        'GOLD': '💰', 'EXP': '✨',
        'HP': '❤️', 'HEAL_PERCENT': '❤️', // 相容兩種寫法
        'MP': '💧', 'MP_RECOVER_PERCENT': '💧'
    };


    // ===========================
    // Socket 事件監聽 (多人戰鬥核心)
    // ===========================
    if (socket) {
        // ... (init_ready_check, update_ready_view, ready_check_canceled 保持不變) ...
        socket.on('init_ready_check', (members) => {
            isMultiplayerMode = true;
            renderReadyCheckModal(members);
            lobbyLayer.classList.add('hidden');
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
            lobbyLayer.classList.remove('hidden');
            btnReadyAccept.disabled = false;
            btnReadyDecline.disabled = false;
            btnReadyAccept.innerText = "接受";
            window.Game.playMusic('/holylegend/audio/game_lobby.ogg');
        });

        // 3. 多人戰鬥開始
        socket.on('multiplayer_battle_start', (initialData) => {
            readyCheckLayer.classList.add('hidden');
            
            state.currentFloor = initialData.floor;
            state.enemyMaxHp = initialData.enemyMaxHp;
            state.enemyHp = initialData.enemyHp;
            
            // 重置個人狀態
            // 注意：多人模式下 Server 記錄了血量，前端這裡主要是顯示用
            // 如果是復活，Server 應該會處理好血量並通知 (目前簡化版未實作Server回傳血量，暫時保留本地血量)
            
            state.isGameOver = false;
            state.processingLevelUp = false;
            waitingForTurn = false;
            
            // 【修正】傳入 Server 指定的怪物類型
            startNewFloor(true, initialData.monsterType); 
            
            window.Game.playMusic('/holylegend/audio/tower_theme.ogg');
            // alert("戰鬥開始！"); // 這個 alert 有時候會很煩，可以註解掉
        });

        // 4. 【修正】回合結算
        socket.on('turn_result', (result) => {
            // result: { damageDealt, targetSocketId, damageTaken, isEnemyDead, deadPlayerId, isAllDead }
            
            // 怪物受傷動畫
            const enemyImg = document.getElementById('enemy-img');
            if(enemyImg) {
                enemyImg.style.transform = 'scale(0.8)';
                setTimeout(() => enemyImg.style.transform = 'scale(1)', 100);
            }

            state.enemyHp = Math.max(0, state.enemyHp - result.damageDealt);
            showDamageNumber(result.damageDealt); 
            updateEnemyUI();

            // 處理玩家受傷
            if (result.damageTaken > 0 && result.targetSocketId) {
                setTimeout(() => {
                    if (result.targetSocketId === socket.id) {
                        playerTakeDamage(result.damageTaken); // 這會扣本地血量並更新UI
                        alert(`怪物攻擊了你！造成 ${result.damageTaken} 點傷害！`);
                    } else {
                        console.log("怪物攻擊了隊友");
                        // 這裡可以加一個視覺效果顯示隊友受傷
                    }
                }, 600);
            }

            // 【關鍵】處理有人死亡
            if (result.deadPlayerId) {
                if (result.deadPlayerId === socket.id) {
                    // 我死了 -> 鎖定操作，變成觀戰模式
                    state.isGameOver = true; 
                    alert("你已倒下！進入觀戰模式...");
                    updateControlsState(); // 變灰
                } else {
                    // 隊友死了
                    console.log("隊友倒下了！");
                }
            }

            // 【關鍵】全滅處理
            if (result.isAllDead) {
                alert(`全隊覆沒！止步於第 ${state.currentFloor} 層`);
                resetBattle();
                return;
            }

            // 如果我沒死，就解鎖按鈕，準備下一回合
            if (!state.isGameOver) {
                waitingForTurn = false;
                state.isTurnLocked = false; 
                updateControlsState(); 
            }

            if (result.isEnemyDead) {
                handleMonsterDeath();
            }
        });
        
        socket.on('game_over_all', (data) => {
             alert(`全隊覆沒！`);
             resetBattle();
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
    if (btnReadyAccept) {
        btnReadyAccept.addEventListener('click', () => {
            socket.emit('respond_ready', true); // 同意
            // UI 鎖定，等待其他人
            btnReadyAccept.disabled = true;
            btnReadyDecline.disabled = true;
            btnReadyAccept.innerText = "等待中...";
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

            if (isMultiplayerMode) {
                // --- 多人模式 ---
                waitingForTurn = true;
                // 發送動作給 Server，不直接扣血
                socket.emit('player_action', { type: 'attack' });
                // 等待 Server 回傳 turn_result
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


    // 玩家受傷處理 (通用)
    async function playerTakeDamage(amount) {
        state.playerHp -= amount;
        if (state.playerHp < 0) state.playerHp = 0;
        updatePlayerUI();
        
        document.body.style.backgroundColor = '#500';
        setTimeout(() => document.body.style.backgroundColor = '', 100);

        // 玩家死亡
        if (state.playerHp <= 0) {
            // 倒下邏輯
            alert("你已倒下！等待隊友救援或戰鬥結束...");
            // 多人模式下，玩家倒下不代表遊戲結束，除非全滅
            if (!isMultiplayerMode) {
                if (state.isGameOver) return;
                state.isGameOver = true;

                const expGained = calculateGameOver();
                alert(`你已在第 ${state.currentFloor} 層倒下\n你獲得了 ${expGained} 點經驗值！`);
                
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

    function startNewFloor(isMultiplayerInit = false) {
        state.floor++;
        if (!isMultiplayerInit) {
            // 單人模式才自己算血量，多人模式血量由 Server 下發
            state.enemyMaxHp = 100 + (state.currentFloor * 10);
            state.enemyHp = state.enemyMaxHp;
        }

        state.isTurnLocked = false;
        state.isGameOver = false; 
        state.processingLevelUp = false; 
        
        // 【修正 3】新樓層開始，解開回合鎖，恢復按鈕樣式
        state.isTurnLocked = false;
        if(btnAttack) {
            btnAttack.style.filter = "";
            btnAttack.style.transform = "";
        }
        
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
                state.currentFloor++;
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
                    alert(`恢復了 ${heal} 點生命！`);
                } else {
                    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + rewardData.rewardValue);
                    alert(`恢復了 ${rewardData.rewardValue} 點生命！`);
                }
                break;
            case 'MP': // 資料庫是用 MP
                if (rewardData.rewardPercent > 0) {
                    const mana = Math.floor(state.playerMaxMp * (rewardData.rewardPercent / 100));
                    state.playerMp = Math.min(state.playerMaxMp, state.playerMp + mana);
                } else {
                    state.playerMp = Math.min(state.playerMaxMp, state.playerMp + rewardData.rewardValue);
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
            default:
                console.log("未知的獎勵類型:", rewardData.rewardType);
        }
        
        // 2. 更新介面顯示 (血量、金幣變動)
        updatePlayerUI();
        updateTopBarUI();

        // 3. 隱藏獎勵層
        rewardLayer.classList.add('hidden');

        // 4. 進入下一層
        state.currentFloor++;
        startNewFloor();
    }

    async function enemyAttack() {
        // 注意：這裡不要檢查 isTurnLocked，因為這就是解鎖的時刻
        if (state.isGameOver || state.processingLevelUp) return;

        const dmg = 5;
        state.isTurnLocked = false; // 解鎖

        playerTakeDamage(dmg);
        updateControlsState();

    }

    function resetBattle() {
        state.goldCollected = 0;
        state.currentFloor = 1; 
        state.isGameOver = false;
        state.processingLevelUp = false;
        isMultiplayerMode = false;
        
        towerLayer.classList.add('hidden');
        lobbyLayer.classList.remove('hidden');
        readyCheckLayer.classList.add('hidden'); // 確保關閉

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