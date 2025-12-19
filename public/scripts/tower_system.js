document.addEventListener('DOMContentLoaded', () => {
    
    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const skillLayer = document.getElementById('skill-layer')
    const settingLayer = document.getElementById('settings-layer');
    const teamLayer = document.getElementById('team-layer');
    const jobLayer = document.getElementById('job-layer');
    const btnEnterTower = document.getElementById('btn-enter-tower');
    const btnExitTower = document.getElementById('btn-tower-exit');
    const btnAttack = document.getElementById('btn-attack');
    const teammatesContainer = document.getElementById('teammates-container'); // 新增這個
    
    // 獎勵與準備
    const rewardLayer = document.getElementById('reward-layer');
    const rewardCardsContainer = document.getElementById('reward-cards-container');
    const readyCheckLayer = document.getElementById('ready-check-layer');
    const btnReady = document.getElementById('btn-ready-accept');
    const btnDecline = document.getElementById('btn-ready-decline');

    // ★★★ 商店與背包 DOM ★★★
    const shopLayer = document.getElementById('shop-layer');
    const itemsGrid = document.getElementById('shop-items-grid');
    const goldDisplay = document.getElementById('shop-gold-val');
    const messageDisplay = document.getElementById('shop-message');
    const btnCloseShop = document.getElementById('btn-close-shop'); 

    const btnItem = document.getElementById('btn-item'); // 道具按鈕
    let inventoryLayer = document.getElementById('inventory-layer'); // 背包層

    const btnSkill= document.getElementById('btn-skill'); // 道具按鈕

    const state = window.Game.state; 
    const socket = window.Game.socket; 

    // 多人模式狀態標記
    let isMultiplayerMode = false;
    let waitingForTurn = false; // 是否正在等待隊友行動
    let battleLogContainer = null; // 日誌容器
    let myReadyStatus = false; // 記錄自己的準備狀態
    let shopSpendingAccumulator = 0;   // ★ 新增：商店消費累計 (用於防止雙重扣款)
    let pendingBuyItem = null; // 暫存正在購買的物品

    // 獎勵圖示
    const REWARD_ICONS = {
        'STR': '💪', 'DEX': '🦶', 'CON': '🛡️', 'INT': '🔮',
        'GOLD': '💰', 'EXP': '✨',
        'HP': '❤️', 'HEAL_PERCENT': '❤️', // 相容兩種寫法
        'MP': '💧', 'MP_RECOVER_PERCENT': '💧'
    };

    // 定義屬性對照表 (方便迴圈生成)
    const STAT_CONFIG = [
        { name: 'STR', label: '力量', icon: '💪' },
        { name: 'DEX', label: '敏捷', icon: '🦶' },
        { name: 'CON', label: '體質', icon: '🛡️' },
        { name: 'INT', label: '智力', icon: '🔮' }
    ];

    const defaultStat = ["STR", "DEX", "CON", "INT"]

    const additionMap = {
        CRIT: 'crit',
        DODGE: 'dodge',
        DMG_REDUCE: 'dmgReduce',
        HP_BONUS: 'hpBonus',
        MP_BONUS: 'mpBonus',
        REGEN: 'regen',
        MANA_RETURN: 'manaReflow',
        ATK_BONUS: 'atkBonus',
        SKILL_BONUS: 'skillBonus',
        EXP_BONUS: 'expBonus',
    };


    // 在 tower_system.js 的 DOMContentLoaded 裡面
    // 監聽事件系統結束後的通知
    document.addEventListener('event_completed', () => {
        // 事件結束，進入下一層
        startNewFloor();
    });

    // 初始化介面
    initBattleLogUI();
    initInventoryUI(); // ★ 初始化背包介面
    initActiveSkillUI(); // 初始化技能介面
    initShakeStyle(); 

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

    function initInventoryUI() {
        if (!document.getElementById('inventory-layer')) {
            const div = document.createElement('div');
            div.id = 'inventory-layer';
            div.className = 'hidden';
            div.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); z-index: 400; display: flex; justify-content: center; align-items: center;";
            
            div.innerHTML = `
                <div class="shop-card-container" style="border-color: #3498db;">
                    <div class="shop-header" style="background-color: #2980b9;">
                        <span class="shop-title" style="color:white; font-size:1.5rem;">🎒 背包</span>
                    </div>
                    <div class="shop-body">
                        <div id="inventory-grid" class="shop-grid"></div>
                    </div>
                    <div class="shop-footer">
                        <button id="btn-close-inventory" class="btn-leave-shop" style="background-color:#7f8c8d;">關閉</button>
                    </div>
                </div>
            `;
            // 插入
            const container = document.querySelector('.mobile-container') || document.body;
            container.appendChild(div);
            inventoryLayer = div;
        }
    }

    function initActiveSkillUI() {
        // 如果已經存在就不要重複建立
        if (!document.getElementById('active-skill-layer')) {
            const div = document.createElement('div');
            div.id = 'active-skill-layer';
            div.className = 'hidden';
            // 使用與背包一致的遮罩樣式
            div.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); z-index: 450; display: flex; justify-content: center; align-items: center;";
            
            div.innerHTML = `
                <div class="shop-card-container" style="border-color: #9b59b6; height: 70dvh;">
                    <!-- 1. 頂部：標題 (紫色系) -->
                    <div class="shop-header" style="background-color: #8e44ad;">
                        <span class="shop-title" style="color:white; font-size:1.5rem;">🪄 技能面板</span>
                        <div style="font-size: 0.8rem; color: #eee; font-family: 'VT323';">已裝備技能</div>
                    </div>

                    <!-- 2. 中間：技能網格 (唯一可滑動區域) -->
                    <div class="shop-body" style="flex: 1; overflow-y: auto; padding: 10px;">
                        <div id="active-skill-grid" class="shop-grid" style="grid-template-columns: repeat(2, 1fr); gap: 10px;">
                            <!-- JS 會根據 state.Equipment 渲染技能卡片 -->
                            <div style="color: #aaa; grid-column: 1/-1; text-align: center; margin-top: 20px;">未裝備任何技能</div>
                        </div>
                    </div>

                    <!-- 3. 底部：關閉按鈕 -->
                    <div class="shop-footer">
                        <button id="btn-close-active-skill" class="btn-leave-shop" style="background-color:#7f8c8d; width: 100%;">關閉</button>
                    </div>
                </div>
            `;

            // 插入到容器中
            const container = document.querySelector('.mobile-container') || document.body;
            container.appendChild(div);

            // 綁定關閉事件
            document.getElementById('btn-close-active-skill').addEventListener('click', () => {
                div.classList.add('hidden');
            });
        }
    }

    // --- 輔助函式：渲染已裝備技能到面板上 ---
    async function renderActiveSkills() {
        try {
            const grid = document.getElementById('active-skill-grid');
            if (!grid) return;

            const response = await fetch('/holylegend/system/skill');
            const result = await response.json();

            if (result.success) {
                const equipment = window.Game.state.Equipment || [];
                const activeSkills = [];
                const data = result.data;
                const state = window.Game.state;

                // 過濾出有效的裝備 ID
                equipment.forEach(item => {
                    if (!item) return;
                    if (item.requiredClass == state.jobId && item.category == 'CLASS_SKILL') {
                        const skill = data.find(skill => Number(skill.ItemId) === Number(item.id));
                        if (skill) activeSkills.push({...skill, image: item.image});
                    }
                });

                if (activeSkills.length === 0) {
                    grid.innerHTML = '<div style="color: #aaa; grid-column: 1/-1; text-align: center; margin-top: 20px;">目前沒有裝備技能符文</div>';
                } else {
                    grid.innerHTML = ''; // 先清空

                    activeSkills.forEach(skill => {
                        const card = document.createElement('div');
                        card.classList.add('shop-item');
                        card.style.padding = '8px';
                        card.style.borderColor = '#8e44ad';
                        card.style.cursor = 'pointer';

                        let typeColor = '#ccc';
                        let typeLabel = '';

                        if (skill.skillType === 'active') {
                            typeColor = '#e74c3c'; // 紅色
                            typeLabel = '【主動】';
                        } else if (skill.skillType === 'buff') {
                            typeColor = '#2ecc71'; // 綠色
                            typeLabel = '【增益】';
                        }

                        const consumeText = skill.consumeType && skill.consumeAmount
                            ? `${skill.consumeType.toUpperCase()}: ${skill.consumeAmount}`
                            : '無消耗';

                        card.innerHTML = `
                            <div class="item-img-box" style="width: 48px; height: 48px;">
                                <img src="/holylegend/images/items/${skill.image}" onerror="this.style.display='none';">
                            </div>

                            <div class="item-info" style="margin-top: 5px;">
                                <div class="item-name" style="color:${typeColor};">
                                    ${typeLabel} ${skill.name}
                                </div>

                                <div style="font-size: 0.7rem; color: #ccc; line-height: 1.2;">
                                    ${skill.description || '無描述'}
                                </div>

                                <div style="font-size: 0.6rem; color:${typeColor}; margin-top: 2px;">
                                    消耗: ${consumeText}
                                </div>
                            </div>

                            <button class="btn-use"
                                style="
                                    font-size:0.6rem;
                                    margin-top:5px;
                                    width:100%;
                                    color:${typeColor};
                                    border-color:${typeColor};
                                ">
                                釋放技能
                            </button>
                        `;

                        // 綁定點擊事件
                        card.querySelector('button').onclick = () => {
                            // 檢查玩家資源是否足夠
                            if (skill.consumeType === 'mp' && state.playerMp < skill.consumeAmount) {
                                return alert("魔力不足，無法釋放技能！");
                            }
                            if (skill.consumeType === 'hp' && state.playerHp < skill.consumeAmount) {
                                return alert("生命不足，無法釋放技能！");
                            }

                            // 資源足夠才使用技能
                            handleUseSkill(skill);
                        };

                        grid.appendChild(card);
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }

        document.getElementById('active-skill-layer').classList.remove('hidden');
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
            jobLayer.classList.add('hidden');
            settingLayer.classList.add('hidden');
            towerLayer.classList.remove('hidden');
            readyCheckLayer.classList.remove('hidden');
            skillLayer.classList.add('hidden');
        });

        socket.on('update_ready_view', (data) => {
            updateReadySlotStatus(data.socketId, data.status);
        });

        socket.on('ready_check_canceled', (data) => {
            io.to(roomId).emit('chat_message', { sender: '系統', text: `${data.nickname} 拒絕了準備，取消戰鬥。`, isSystem: true });
            readyCheckLayer.classList.add('hidden');
            towerLayer.classList.add('hidden');
            teamLayer.classList.remove('hidden');
            btnReady.disabled = false;
            btnReady.innerText = "接受";
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
            rewardLayer.classList.add('hidden'); // ★ 確保這一行存在，不然下一層開始了獎勵視窗還在

            // 【新增】渲染隊友介面
            if (initialData.players) {
                renderTeammatesUI(initialData.players);

                // 1. 找出我自己
                const myInfo = initialData.players.find(p => p.socketId === socket.id);
                
                if (myInfo) {
                    // 2. 覆蓋本地狀態 (這就是你要的 "送給原本玩家的 window.Game.state")
                    if (myInfo.AdditionState) {
                        state.AdditionState = myInfo.AdditionState;
                    }

                    let serverGoldDelta = myInfo.goldCollected || 0;
                    let realGoldChange = serverGoldDelta + shopSpendingAccumulator;

                    // 2. 金幣 (★ 累加：因為後端傳來的是事件獎勵的增量，不能覆蓋打怪賺的錢)
                     if (realGoldChange !== 0) {
                        state.goldCollected += realGoldChange;
                    }
                    
                    shopSpendingAccumulator = 0;

                    // 3. 經驗 (★ 累加)
                    if (myInfo.AdditionEXP) {
                        state.AdditionEXP += myInfo.AdditionEXP;
                    }

                    // ★ 同步背包
                    if (myInfo.Inventory) state.Inventory = myInfo.Inventory;
                }
            }
            
            startNewFloor(true, initialData.monsterType); 
            window.Game.playMusic('/holylegend/audio/tower_theme.ogg');
            
            addBattleLog(`=== 第 ${initialData.floor} 層戰鬥開始 ===`, 'log-system');
        });

        socket.on('player_revived', (data) => {
            console.log("收到復活通知:", data);
            
            // 1. 更新數值
            state.playerHp = data.hp;
            state.playerMp = data.mp;
            
            // 2. 解除死亡狀態
            state.isGameOver = false;
            
            // 3. 更新 UI
            updatePlayerUI();
            updateControlsState(); // 解鎖按鈕
            
            addBattleLog("你復活了！", "log-player");
            
            // (選用) 移除死亡濾鏡效果，如果有的話
            document.body.style.filter = "none"; 
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
                    state.playerMaxHp = myStatus.maxHp;
                    state.playerMp = myStatus.mp;
                    state.playerMaxMp = myStatus.maxMp;
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
            if (state.playerHp > 0) {
                showRewards(); 
            }
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


        // ==========================================
        // ★ 新增：多人事件相關監聽
        // ==========================================

        // 1. 觸發事件：顯示卡片
        socket.on('trigger_event', (eventData) => {
            if (state.playerHp > 0) {
                createAndShowEventCard(eventData);
            }
        });

        // 2. 事件被鎖定：有人正在檢定
        socket.on('event_locked', (data) => {
            // 找到事件卡片上的按鈕
            const btnTry = document.querySelector('.event-actions .btn-action');
            if (btnTry) {
                btnTry.disabled = true; 
                btnTry.innerText = `${data.nickname} 檢定中...`;
                btnTry.style.backgroundColor = '#555'; 
            }
        });

        // 3. 收到檢定結果
        socket.on('event_result', (result) => {
            // 這裡可以做 Alert 或是更新卡片文字
            alert(result.msg);
            
            // 更新描述文字，讓玩家知道結果
            const desc = document.querySelector('.event-desc');
            if (desc) desc.innerHTML += `<br><br><span style="color:${result.success ? '#2ecc71':'#e74c3c'}">${result.msg}</span>`;
        });

        // 4. 關閉事件視窗 (Server 通知所有人都確認完了)
        socket.on('close_event_window', () => {
            closeEventLayer();
        });

        // ---------------------------
        //  商店相關監聽
        // ---------------------------
        socket.on('trigger_shop', (data) => {
            if (state.playerHp > 0) {
                renderShopItems(data.items);
                // 暫存商品列表以便查詢價格
                window.Game.currentShopItems = data.items;
                
                shopLayer.classList.remove('hidden');
                if (goldDisplay) goldDisplay.innerText = state.goldCollected;
                if (btnCloseShop) {
                    btnCloseShop.disabled = false;
                    btnCloseShop.innerText = "X";
                }
                if (messageDisplay) messageDisplay.innerText = "歡迎光臨！";
            } else {
                socket.emit('player_leave_shop')
            }
        });
        

        socket.on('shop_update', (data) => {
            if (data.items) {
                renderShopItems(data.items);
                // 更新暫存
                window.Game.currentShopItems = data.items;
            }
        });

        // ★★★ 商店購買回饋 (修正版) ★★★
        socket.on('shop_buy_result', (result) => {
            if (result.success) {
                // 1. 確認交易：累計已花費金額，用於之後 startNextFloor 的補償計算
                if (pendingBuyItem) {
                    shopSpendingAccumulator += pendingBuyItem.price;
                    pendingBuyItem = null; // 清除暫存
                }

                // 2. 更新金幣顯示 (★ 注意：不使用 result.currentGold 覆蓋，避免跳成負數)
                updateLocalGoldDisplay();
                
                // 3. 更新背包
                if (result.newInventory) state.Inventory = result.newInventory;
                if (inventoryLayer && !inventoryLayer.classList.contains('hidden')) {
                    renderInventoryItems();
                }

                showMessage(result.msg || "購買成功！", '#2ecc71');
            } else {
                // 交易失敗：回滾 (把剛剛預扣的錢加回來)
                if (pendingBuyItem) {
                    state.goldCollected += pendingBuyItem.price;
                    pendingBuyItem = null;
                    updateLocalGoldDisplay();
                }
                
                showMessage(result.msg || "購買失敗", '#e74c3c');
                shakeShop();
            }
        });
        
        socket.on('close_shop_window', () => {
             shopLayer.classList.add('hidden');
        });

        socket.on('item_use_result', (result) => {
            if (result.success) {
                if (result.newInventory) state.Inventory = result.newInventory;
                if (result.hp !== undefined) state.playerHp = result.hp;
                if (result.mp !== undefined) state.playerMp = result.mp;
                
                updatePlayerUI();
                if (inventoryLayer && !inventoryLayer.classList.contains('hidden')) {
                    renderInventoryItems();
                }
                addBattleLog(result.msg, 'log-player');
                const p = document.createElement('div');
                p.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#2ecc71; font-size:2rem; font-weight:bold; z-index:999; animation: floatUp 1s forwards;";
                p.innerText = "使用成功!";
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 1000);
            } else {
                alert(result.msg);
            }
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
            btnReady.style.backgroundColor = ""; // 恢復原色

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
    if (btnReady) {
        btnReady.addEventListener('click', () => {
            if (!myReadyStatus) {
                // 接受
                socket.emit('respond_ready', { 
                    ready: true, 
                    latestState: window.Game.state // 把乾淨的數值傳回去
                });
                myReadyStatus = true;
                btnReady.innerText = "取消準備";
                btnReady.style.backgroundColor = "#e67e22"; // 橘色
            } else {
                // 取消準備
                socket.emit('respond_ready', { 
                    ready: false, 
                    latestState: window.Game.state // 把乾淨的數值傳回去
                });
                myReadyStatus = false;
                btnReady.innerText = "準備";
                btnReady.style.backgroundColor = ""; // 恢復原色
            }
        });
    }

    if (btnDecline)

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

    if (btnCloseShop) {
        btnCloseShop.addEventListener('click', () => {
            if (isMultiplayerMode && socket) {
                btnCloseShop.disabled = true;
                btnCloseShop.innerText = "X";
                closeShopLayer();
                showMessage("正在整理行囊...", '#aaa');
                socket.emit('player_leave_shop');
            } else {
                closeShopLayer();
                startNewFloor(); // 單人直接下一層
            }
        });
    }

    if (btnItem) {
        btnItem.addEventListener('click', () => {
            if (inventoryLayer) {
                inventoryLayer.classList.remove('hidden');
                renderInventoryItems();
            }
        });
    }

    if (btnSkill) {
        btnSkill.addEventListener('click', () => {
            // 直接呼叫全域的開啟函式
            renderActiveSkills();
        });
    }

    // 關閉背包按鈕 (Delegation)
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-close-inventory') {
            if (inventoryLayer) inventoryLayer.classList.add('hidden');
        }
    });

    // ===========================
    // 戰鬥邏輯：攻擊
    // ===========================
    if (btnAttack) {
        btnAttack.addEventListener('click', () => {
            // 【修正 1】加入 state.isTurnLocked 檢查
            // 防止玩家在怪物反擊的空檔連續攻擊 (強制回合制)
            if (state.isGameOver || state.processingLevelUp || state.isTurnLocked) return;

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
                    AdditionState: state.AdditionState,
                    AdditionAttribute: state.AdditionAttribute
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
        CritRate = state.AdditionAttribute.crit + state.AdditionState[1] * 0.25 + state.AdditionState[3] * 0.15
        let CritMultiply = 1;

        if (CritRate > system_critRate)
        {
            CritMultiply = 2;
        }

        let damageMultiply = 0.8 + Math.random() * 0.4
        let AttackMultiply = 1 + (state.AdditionAttribute.atkBonus / 100)

        damage = Math.round(damage * damageMultiply * CritMultiply * AttackMultiply);
        // 若有屬性加成...
        
        state.enemyHp -= damage;
        addBattleLog(`你對怪物造成 ${damage} 點傷害`, 'log-player');
        showDamageNumber(damage);
        updateEnemyUI();

        if (state.enemyHp <= 0) {
            handleMonsterDeath();
        } else {
            setTimeout(enemyAttack, 100); // 單人怪物反擊
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
            if (!isMultiplayerMode) {
                const eventRate = Math.floor(Math.random() * 100);
                const rewardRate = Math.floor(Math.random() * 100);
                const shopRate = Math.floor(Math.random() * 100);
                // const shopRate = 0;

                if (shopRate < 15) {
                    tryTriggerSinglePlayerShop();
                }
                else {
                    if (eventRate < 15) { 
                        tryTriggerSinglePlayerEvent(); // ★ 觸發事件
                } 
                
                else {
                    if (rewardRate <= 15) {
                        showRewards(); // 單人顯示獎勵
                }

                    else {
                        startNewFloor();
                    }
                }
            }
        }
        }, 500);
    }

    // 新增：單人獲取並觸發事件
    async function tryTriggerSinglePlayerEvent() {
        try {
            const response = await fetch('/holylegend/system/events');
            const result = await response.json();

            const allEvents = result.data; // 資料庫裡的所有獎勵
            const eventId = Math.floor(Math.random() * allEvents.length)
            const event = allEvents[eventId]

            createAndShowEventCard(event);

        } catch (e) {
            console.error("事件載入失敗", e);
            startNewFloor();
        }
    }


    // 商店
    async function tryTriggerSinglePlayerShop() {
        try {
            const response = await fetch('/holylegend/system/items');
            const result = await response.json();
            
            if (result.success && result.data && result.data.length > 0) {
                const pool = result.data;
                // 洗牌
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                // 選4個
                const selectedItems = pool.slice(0, 6);
                // 隨機庫存
                selectedItems.forEach(item => {
                    const max = item.maxStock || 5; 
                    item.currentStock = Math.ceil(Math.random() * max);
                });

                // 暫存以便購買時扣庫存
                window.Game.currentShopItems = selectedItems;
                
                renderShopItems(selectedItems);
                openShopLayer("旅行商人：只有這些了，要買要快。");
            } else {
                console.warn("商店無商品，跳過");
                startNewFloor();
            }
        } catch (e) {
            console.error("商店載入失敗", e);
            startNewFloor();
        }
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
        if (amount > 0) {
            addBattleLog(`你受到 ${amount} 點傷害！`, 'log-enemy');
        } else {
            addBattleLog(`你閃避了攻擊！`, 'log-enemy');
        }

        // 額外回血回魔
        if (state.AdditionAttribute.regen && state.playerHp > 0) {
            state.playerHp += state.AdditionAttribute.regen

            if (state.playerHp > state.playerMaxHp) {
                state.playerHp = state.playerMaxHp
            }
        }

        if (state.AdditionAttribute.manaReflow) {
            state.playerMp += state.AdditionAttribute.manaReflow

            if (state.playerMp > state.playerMaxMp) {
                state.playerMp = state.playerMaxMp
            }
        }
       

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
        btnReady.disabled = false;
        btnReady.innerText = "接受";

        members.forEach(m => {
            const imgSrc = m.state.avatar;

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
                slot.classList.remove('accepted');
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
            const response = await fetch('/holylegend/game_lobby/status');
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
                Game.InitData.exp = data.exp;
                Game.InitData.needEXP = data.needEXP;
                
                // 更新 UI
                Game.updateLobbyUI(Game);

                socket.emit('player_job_changed', {
                        // 只傳送需要的變動資料，Server 會處理廣播
                        newLevel: data.level,
                        newRole: data.role,
                        newMaxHp: data.maxHp,
                        newMaxMp: data.maxMp,
                        newAdditionState: data.AdditionState,
                        // 確保隊友能知道這個人現在的血量 (通常是滿血)
                        currentHp: data.hp, 
                        currentMp: data.mp,
                        avatar: data.avatar
                    });
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
        await saveSkillStone();
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
        const multiplier = 1 + (state.AdditionAttribute.expBonus / 100); // 1.3
        EXPgained = Math.round(EXPgained * multiplier);

        return EXPgained;
    }

    async function saveSkillStone() {
        const inventory = state.Inventory;
        const skills = state.Skills;

        const items = inventory.filter(item => item.category.includes('SKILL'))

        items.forEach(item => {
            const existed_skill = skills.find(skill => item.id == skill.id)

            if (existed_skill) {
                existed_skill.quantity += item.count;
            }

            else {
                skills.push({
                    id: item.id,
                    name: item.name, 
                    image: item.image, 
                    category: item.category, 
                    quantity: item.count, 
                    equipped: 0,
                    description: item.description,
                    requiredClass: item.requiredClass,
                    effectType: item.effectType,
                    effectValue: buff.value,
                    isPercentage: item.isPercentage,

                })
            }
        })

        try {
            const response = await fetch('/holylegend/game_lobby/save_skill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inventory: state.Skills,
                    equipment: state.Equipment
                })
            });
            const result = await response.json();

            if (result.success) {
                Game.updateLobbyUI(window.Game)
            }

            } catch {
                console.error("符文儲存失敗", e);
            }

        state.Inventory = [];
        state.Status = [];
    }

    function startNewFloor(isMultiplayerInit = false, specifiedMonster = null) {
        state.processingLevelUp = false; 

        if (!isMultiplayerInit) {
            state.enemyMaxHp = Math.round(100 + 10 * Math.pow(1.05, state.currentFloor));
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
        if (state.playerHp <= 0) {
            console.log("玩家已死亡，跳過獎勵顯示");
            return;
        }
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
                
                // ★★★ 修改 1：初始時禁止點擊 (防止飛行中誤觸) ★★★
                card.style.pointerEvents = 'none';
                
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

                // 【關鍵修正】監聽動畫結束，強制設定樣式並恢復點擊
                card.addEventListener('animationend', () => {
                    // 如果已經被點擊(正在退場)，就不干涉
                    if (card.classList.contains('clicked')) return;
                    
                    card.style.opacity = '1';
                    card.style.transform = 'translate(0, 0) rotateY(0deg) scale(1)';
                    
                    // ★★★ 修改 2：動畫結束後，恢復可點擊狀態 ★★★
                    card.style.pointerEvents = 'auto';
                    // (選用) 可以加個滑鼠游標變化，提示可以點了
                    card.style.cursor = 'pointer';
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

        // =================================================
        // 🛑 路徑 A：多人模式 (Multiplayer)
        //    只負責送出請求，不進行任何本地數值修改
        // =================================================
        if (isMultiplayerMode && socket) {
            
            // A-1. 特殊處理：復活 (REVIVE) 需要選目標
            if (rewardData.rewardType === 'REVIVE') {
                rewardLayer.classList.add('hidden');
                addBattleLog("請點擊一名 [死亡] 的隊友進行復活！", 'log-system');
                alert("請點擊一名 [死亡] 的隊友頭像進行復活！\n(可以直接點擊隊友卡片)");

                const cards = teammatesContainer.querySelectorAll('.tm-card');
                
                const handleTeammateSelect = (e) => {
                    const targetCard = e.currentTarget;
                    const targetId = targetCard.dataset.id;
                    
                    if (confirm("確定要復活這位隊友嗎？")) {
                        // 發送請求
                        socket.emit('player_selected_reward', { 
                            reward: rewardData,
                            targetSocketId: targetId
                        });

                        // 清理監聽
                        cards.forEach(c => {
                            c.removeEventListener('click', handleTeammateSelect);
                            c.classList.remove('selectable');
                        });

                        // 顯示等待狀態
                        rewardLayer.classList.remove('hidden');
                        rewardCardsContainer.innerHTML = '<div style="color: white; font-size: 1.5rem;">等待隊友選擇...</div>';
                    }
                };

                let foundDead = false;
                cards.forEach(c => {
                    c.classList.add('selectable'); 
                    c.addEventListener('click', handleTeammateSelect);
                    if (c.classList.contains('dead')) foundDead = true;
                });

                // 防呆：如果沒人死，直接送出 (後端會轉為補血)
                if (!foundDead) {
                    alert("目前無人陣亡，系統將自動為你恢復生命。");
                    cards.forEach(c => {
                        c.removeEventListener('click', handleTeammateSelect);
                        c.classList.remove('selectable');
                    });
                    
                    socket.emit('player_selected_reward', { reward: rewardData });
                    rewardLayer.classList.remove('hidden');
                    rewardCardsContainer.innerHTML = '<div style="color: white; font-size: 1.5rem;">等待隊友選擇...</div>';
                }
            } 
            
            // A-2. 一般獎勵 (屬性、金幣、經驗、HP/MP)
            else {
                // 直接發送請求
                socket.emit('player_selected_reward', { 
                    reward: rewardData
                });
                
                // 顯示等待狀態
                rewardCardsContainer.innerHTML = '<div style="color: white; font-size: 1.5rem;">等待隊友選擇...</div>';
            }

            // ★ 關鍵：直接 Return，不執行下方的單人邏輯
            return; 
        }


        // =================================================
        // 👤 路徑 B：單人模式 (Single Player)
        //    在本地直接計算數值並儲存
        // =================================================
        
        switch (rewardData.rewardType) {
            case 'HP': 
                if (rewardData.rewardPercent > 0) {
                    const heal = Math.floor(state.playerMaxHp * (rewardData.rewardPercent / 100));
                    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + heal);
                    addBattleLog(`恢復了 ${heal} 點生命！`, 'log-player');
                } else {
                    state.playerHp = Math.min(state.playerMaxHp, state.playerHp + rewardData.rewardValue);
                    addBattleLog(`恢復了 ${rewardData.rewardValue} 點生命！`, 'log-player');
                }
                break;
            case 'MP': 
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
                state.AdditionEXP += rewardData.rewardValue;
                alert(`獲得 ${rewardData.rewardValue} 經驗值 (將於結算時發放)`);
                break;
            case 'STR':
                state.AdditionState[0] += rewardData.rewardValue;
                alert(`${rewardData.name} 生效！(本次冒險屬性提升)`);
                break;
            case 'DEX':
                state.AdditionState[1] += rewardData.rewardValue;
                alert(`${rewardData.name} 生效！(本次冒險屬性提升)`);
                break;
            case 'CON':
                state.AdditionState[2] += rewardData.rewardValue;
                alert(`${rewardData.name} 生效！(本次冒險屬性提升)`);
                break;
            case 'INT':
                state.AdditionState[3] += rewardData.rewardValue;
                alert(`${rewardData.name} 生效！(本次冒險屬性提升)`);
                break;
            case 'REVIVE':
                state.playerHp += Math.round(state.playerMaxHp * 0.3);
                state.playerMp += Math.round(state.playerMaxMp * 0.3);

                if (state.playerHp > state.playerMaxHp) state.playerHp = state.playerMaxHp
                if (state.plaMaxMp > state.playerMaxMp) state.plaMaxMp = state.playerMaxMp
                break;
            default:
                console.log("未知的獎勵類型:", rewardData);
        }

        // 動畫結束後的行為 (單人)
        setTimeout(() => {
            recalculateDerivedStats()
            updatePlayerUI();
            updateTopBarUI();
            
            // 單人模式：直接進下一層
            rewardLayer.classList.add('hidden');
            state.currentFloor++;
            startNewFloor();
        }, 600);
    }

    async function enemyAttack() {
        // 注意：這裡不要檢查 isTurnLocked，因為這就是解鎖的時刻
        if (state.isGameOver || state.processingLevelUp) return;

        const SystemDodge = Math.ceil(Math.random() * 100)

        let dmg = Math.round(5 * Math.pow(1.05, state.currentFloor));
        playerDefense = Math.round(state.AdditionState[0] / 7 + state.AdditionState[2] / 3);
        DamageReduce = Math.max(0.2, 1 - (state.AdditionAttribute.dmgReduce / 100))
        DodgeRate = Math.min(state.AdditionAttribute.dodge + state.AdditionState[1] * 0.5 + state.AdditionState[3] * 0.2, 90)
        dmg = Math.max(Math.round((dmg - playerDefense) * DamageReduce), 1)

        if (DodgeRate >= SystemDodge) {
            dmg = 0
        }
        state.isTurnLocked = false; // 解鎖

        if (state.Status && state.Status.length > 0) {
            for (let i = state.Status.length - 1; i >= 0; i--) {
                const buff = state.Status[i];
                if (buff.duration != null && buff.duration > 0) {
                    buff.duration--;
                    if (buff.duration <= 0) {
                        // 移除buff效果
                        removeBuffEffect(buff);
                        state.Status.splice(i, 1);
                    }
                }
            }
        }

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



    // 隊伍 UI

    // ===========================
    //  新增：隊友 UI 輔助函式
    // ===========================
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
            
            const imgSrc = p.avatar;

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


    // ===========================
    // 背包 UI 渲染
    // ===========================
    function renderInventoryItems() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        const items = state.Inventory || [];
        // 只顯示 POTION
        const visibleItems = items.filter(i => i.category === 'POTION' && i.count > 0);

        if (visibleItems.length === 0) {
            grid.innerHTML = '<div style="color:#aaa; width:100%; text-align:center; padding:20px;">背包是空的</div>';
            return;
        }

        visibleItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'shop-item'; // 重用樣式
            const imgSrc = `/holylegend/images/items/${item.image}`;
            
            card.innerHTML = `
                <div class="item-img-box">
                    <img src="${imgSrc}" onerror="this.style.display='none';">
                    <div class="stock-badge">x ${item.count}</div>
                </div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-desc">${item.description}</div>
                </div>
                <button class="btn-buy" style="background-color:#2980b9; border-color:#1a5276;">使用</button>
            `;
            
            card.querySelector('button').onclick = () => handleUseItem(item);
            grid.appendChild(card);
        });
    }

    // 重新計算最大生命和魔力
    function recalculateDerivedStats() {
        const state = window.Game.state;

        // 2. 定義轉換公式 (您可以自由調整倍率)
        // 例如：1 點體質 = 5 點血，1 點力量 = 1 點血
        const HP_PER_CON = 0.7; 
        const HP_PER_STR = 0.3;
        const MP_PER_INT = 0.75;

        // 3. 取得累計的屬性加成 [STR, DEX, CON, INT]
        const [addStr, addDex, addCon, addInt] = state.AdditionState || [0, 0, 0, 0];

        // 4. 計算新的上限
        // 公式：基礎值 + (屬性 * 倍率)
        const bonusHp = (addCon * HP_PER_CON) + (addStr * HP_PER_STR) + state.AdditionAttribute.hpBonus;
        const bonusMp = (addInt * MP_PER_INT) + state.AdditionAttribute.mpBonus;

        const newMaxHp = state.playerBaseMaxHp + Math.floor(bonusHp);
        const newMaxMp = state.playerBaseMaxMp + Math.floor(bonusMp);

        // 5. 處理血量變化
        // 如果上限變高了，當前血量也要補上差額 (像是獲得了生命祝福)
        if (newMaxHp > state.playerMaxHp) {
            const diff = newMaxHp - state.playerMaxHp;
            state.playerHp += diff;
            addBattleLog(`生命上限提升 ${diff} 點！`, 'log-player');
        }
        
        if (newMaxMp > state.playerMaxMp) {
            const diff = newMaxMp - state.playerMaxMp;
            state.playerMp += diff;
        }

        // 6. 寫回狀態
        state.playerMaxHp = newMaxHp;
        state.playerMaxMp = newMaxMp;

        if (state.playerHp > newMaxHp) {
            state.playerHp = newMaxHp
        }

        if (state.playerMp > newMaxMp) {
            state.playerMp = newMaxMp
        }

        // 更新介面
        updatePlayerUI();
    }



    // 事件系統

    // ==========================================
    //  核心：動態生成事件卡片 (Dynamic Render)
    // ==========================================
    function createAndShowEventCard(eventData) {
        if (state.playerHp <= 0) {
            console.log("玩家已死亡，跳過獎勵顯示");
            return;
        }
        
        const layer = document.getElementById('event-layer');
        if (!layer) return;

        // 1. 清空容器 (確保不會有舊的卡片殘留)
        layer.innerHTML = ''; 
        layer.classList.remove('hidden');

        // 2. 準備數據
        const playerStats = window.Game.state.AdditionState || [0, 0, 0, 0];
        const reqIndex = defaultStat.indexOf(eventData.requirementType);
        const myValue = playerStats[reqIndex];
        const reqValue = eventData.requirementValue;

        // 計算機率 (基礎 50% + 差距*10%)
        let successRate = 0;
        let canTry = false;

        if (myValue >= reqValue) {
            canTry = true;
            const diff = myValue - reqValue;
            successRate = Math.min(100, 30 + (diff * 10));
        }

        // 決定機率顏色
        let chanceClass = 'chance-low';
        if (successRate >= 80) chanceClass = 'chance-high';
        else if (successRate >= 50) chanceClass = 'chance-mid';

        // ==========================================
        //  開始建構 DOM (就像堆積木)
        // ==========================================

        // A. 卡片容器
        const cardContainer = document.createElement('div');
        cardContainer.className = 'event-card-container';

        // B. 標題列
        const header = document.createElement('div');
        header.className = 'event-card-header';
        header.innerHTML = `<span class="event-type-badge">🎲 隨機遭遇</span>`;
        cardContainer.appendChild(header);

        // C. 內容區 body
        const body = document.createElement('div');
        body.className = 'event-card-body';

        // C-1. 圖片
        const imgFrame = document.createElement('div');
        imgFrame.className = 'event-image-frame';
        // 圖片載入錯誤處理
        const imgPath = `/holylegend/images/events/${eventData.image}`;
        imgFrame.innerHTML = `
            <img src="${imgPath}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
            <div class="event-img-placeholder" style="display:none;">🔮</div>
        `;
        body.appendChild(imgFrame);

        // C-2. 標題與描述
        const title = document.createElement('h3');
        title.className = 'event-title';
        title.innerText = eventData.name;
        body.appendChild(title);

        const desc = document.createElement('div');
        desc.className = 'event-desc';
        desc.innerHTML = eventData.description; // 允許 HTML (如換行)
        body.appendChild(desc);

        // C-3. 玩家屬性儀表板 (動態迴圈生成)
        const statsContainer = document.createElement('div');
        statsContainer.className = 'my-stats-container';
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stats-grid';

        STAT_CONFIG.forEach((config, idx) => {
            const statBox = document.createElement('div');
            statBox.className = 'stat-box';
            
            // 如果是檢定需要的屬性，加上高亮
            if (idx === reqIndex) {
                statBox.classList.add('highlight');
            }

            statBox.innerHTML = `
                <span class="icon">${config.icon}</span>
                <span class="val">${playerStats[idx]}</span>
            `;
            statsGrid.appendChild(statBox);
        });
        statsContainer.appendChild(statsGrid);
        body.appendChild(statsContainer);

        // C-4. 條件與機率顯示
        const reqDiv = document.createElement('div');
        reqDiv.className = 'event-requirements';
        
        // 狀態文字 (成功率 或 警告)
        let statusHtml = '';
        if (canTry) {
            statusHtml = `
                <div class="chance-display">
                    成功率: <span class="${chanceClass}">${successRate}%</span>
                </div>`;
        } else {
            statusHtml = `
                <div class="warning-text">
                    ❌ ${STAT_CONFIG[reqIndex].label} 不足 (需 ${reqValue})
                </div>`;
        }

        reqDiv.innerHTML = `
            <div>
                <span class="req-label">檢定條件:</span>
                <span class="req-value">${STAT_CONFIG[reqIndex].name} ≥ ${reqValue}</span>
            </div>
            ${statusHtml}
        `;
        body.appendChild(reqDiv);

        // C-5. 按鈕區
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'event-actions';

        // 嘗試按鈕
        const btnTry = document.createElement('button');
        btnTry.className = 'btn-action';
        btnTry.innerText = canTry ? `嘗試 (${successRate}%)` : '能力不足';
        btnTry.disabled = !canTry;
        
        btnTry.onclick = () => {
            handleTryEvent(eventData, successRate, btnTry);
        };

        // 離開按鈕
        const btnLeave = document.createElement('button');
        btnLeave.className = 'btn-leave';
        btnLeave.innerText = '離開';
        
        btnLeave.onclick = () => {
            handleLeaveEvent();
        };

        actionsDiv.appendChild(btnTry);
        actionsDiv.appendChild(btnLeave);
        body.appendChild(actionsDiv); // 將按鈕區加入 body (或 container 底部，看你 CSS 設計)

        // 組合完畢
        cardContainer.appendChild(body);
        layer.appendChild(cardContainer);
    }

    // ==========================================
    //  處理邏輯
    // ==========================================

    function handleTryEvent(eventData, rate, btnElement) {
        btnElement.disabled = true;
        btnElement.innerText = "檢定中...";

        setTimeout(() => {
            const roll = Math.random() * 100;
            const isSuccess = roll <= rate || false;

            // ★ 分歧：多人模式
            if (isMultiplayerMode && socket) {
                // 發送請求給 Server，讓 Server 鎖定其他人
                socket.emit('try_event_action', { 
                    eventId: eventData.id,
                    isSuccess: isSuccess // (備註：正式版應該由後端算，這裡先傳結果)
                });
                // 注意：這裡不關閉視窗，等待 Server 的 event_result 廣播
            } 
            // ★ 分歧：單人模式
            else {
                resolveSinglePlayerEvent(isSuccess, eventData);
                startNewFloor();
            }
        }, 800);
    }

    function handleLeaveEvent() {
        // ★ 分歧：多人模式 (離開 = 確認/等待)
        if (isMultiplayerMode && socket) {
            const btnLeave = document.querySelector('.event-actions .btn-leave');
            if (btnLeave) {
                btnLeave.disabled = true;
                btnLeave.innerText = "等待隊友...";
            }
            // 發送確認訊號
            socket.emit('player_confirm_event');
        } 
        // ★ 分歧：單人模式 (離開 = 結束)
        else {
            closeEventLayer();
            startNewFloor();
        }
    }

    function resolveSinglePlayerEvent(isSuccess, eventData) {
        closeEventLayer();
        const ReqType = eventData.requirementType;
        const RewardType = eventData.rewardType;
        const PunishType = eventData.punishType;

        const statIndex = defaultStat.indexOf(ReqType)
        const rewardIndex = defaultStat.indexOf(RewardType)
        const punishIndex = defaultStat.indexOf(PunishType)
        
        if (isSuccess) {
            if (defaultStat.includes(RewardType)) {
                alert(`✨ 檢定成功！\n${STAT_CONFIG[statIndex].label} 獲得提升！`);
                // 實際給予獎勵
                window.Game.state.AdditionState[rewardIndex] += eventData.rewardValue;
            }

            else if (RewardType == 'GOLD') {
                alert(`✨ 檢定成功！\n獲得額外金幣！`);
                window.Game.state.goldCollected += eventData.rewardValue;

            }

            else if (['HP', 'MP'].includes(RewardType)) {
                alert(`✨ 檢定成功！\n${RewardType} 恢復！`);

                if (RewardType == 'HP') {
                    window.Game.state.playerHp += eventData.rewardValue;
                    window.Game.state.playerHp = Math.min(window.Game.state.playerHp, window.Game.state.playerMaxHp)
                }
                
                else {
                    window.Game.state.playerMp += eventData.rewardValue;
                    window.Game.state.playerMp = Math.min(window.Game.state.playerMp, window.Game.state.playerMaxMp)
                }
            }

            else if (RewardType == 'EXP') {
                alert(`✨ 檢定成功！\n獲得額外經驗值！`);
                window.Game.state.AdditionEXP += eventData.rewardValue;
            }

            recalculateDerivedStats()

            
        } else {
            alert("💨 檢定失敗，你好像損失了什麼...。");

            if (defaultStat.includes(PunishType)) {
                // 實際給予獎勵
                window.Game.state.AdditionState[punishIndex] -= eventData.punishValue;
            }

            else if (PunishType == 'GOLD') {
                window.Game.state.goldCollected -= eventData.punishValue;
            }

            else if (['HP', 'MP'].includes(PunishType)) {
                if (PunishType == 'HP') {
                    window.Game.state.playerHp -= eventData.punishValue;
                    window.Game.state.playerHp = Math.max(window.Game.state.playerHp, 0)
                }
                
                else {
                    window.Game.state.playerMp -= eventData.punishValue;
                    window.Game.state.playerMp = Math.max(window.Game.state.playerMp, 0)
                }
            }
        }

        if (window.Game.updateLobbyUI) window.Game.updateLobbyUI(window.Game);
    }

    function closeEventLayer() {
        const layer = document.getElementById('event-layer');
        if (layer) {
            layer.classList.add('hidden');
            layer.innerHTML = ''; // 清空 DOM
        }
    }

    // ===========================
    // 商店 UI 與邏輯函式
    // ===========================

    function openShopLayer(msg) {
        shopLayer.classList.remove('hidden');
        updateLocalGoldDisplay();
        showMessage(msg, '#fff');
        if (btnCloseShop) {
            btnCloseShop.disabled = false;
            btnCloseShop.innerText = "X";
        }
    }

    function closeShopLayer() {
        shopLayer.classList.add('hidden');
    }

    function renderShopItems(items) {
        if (!itemsGrid) return;
        itemsGrid.innerHTML = '';
        if (!items || items.length === 0) {
            itemsGrid.innerHTML = '<div style="color:#aaa; width:100%; text-align:center;">商品已售完</div>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'shop-item';

            const isSoldOut = item.currentStock <= 0;
            const isDead = state.playerHp <= 0;
            const canAfford = state.goldCollected >= item.price;

            if (isSoldOut) card.classList.add('sold-out');
            if (isDead) card.classList.add('player-dead'); // 可選：加樣式用

            const imgSrc = `/holylegend/images/items/${item.image}`;
            const ClassName = item.requiredClassDetail ? `所需職業：${item.requiredClassDetail.nickname}` : ""

            card.innerHTML = `
                <div class="item-img-box">
                    <img src="${imgSrc}" onerror="this.style.display='none';">
                    <div class="stock-badge">剩 ${item.currentStock}</div>
                </div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-desc">${item.description}\n${ClassName}</div>
                    <div class="item-price" style="color:${canAfford ? '#ffd700' : '#e74c3c'}">💰${item.price}</div>
                </div>
                <button class="btn-buy" ${isSoldOut || isDead ? 'disabled' : ''}>
                    ${isDead ? '無法購買' : (isSoldOut ? '售罄' : '購買')}
                </button>
            `;

            const btnBuy = card.querySelector('.btn-buy');
            if (!isSoldOut && !isDead) {
                btnBuy.addEventListener('click', () => handleBuyItem(item));
            }

            itemsGrid.appendChild(card);
        });
    }

    function handleBuyItem(item) {
        if (state.goldCollected < item.price) {
            showMessage("金幣不足！", '#e74c3c');
            shakeShop();
            return;
        }

        if (isMultiplayerMode && socket) {
            // ★ 多人模式：預先扣款 (Optimistic UI)
            pendingBuyItem = item; // 暫存商品，等 server 確認
            state.goldCollected -= item.price;
            updateLocalGoldDisplay();
            
            socket.emit('player_buy_item', { itemId: item.id });
        } else {
            buyItemSinglePlayer(item);
        }
    }

    function buyItemSinglePlayer(item) {
        state.goldCollected -= item.price;
        item.currentStock--;
        let msg = `購買了 ${item.name}`;
        if (item.category === 'STAT_BOOST') { 
            applyEffectSinglePlayer(item); 
            msg += " (屬性已提升)"; 
        } 
        else { 
            if (!state.Inventory) state.Inventory = [];
            const existing = state.Inventory.find(i => i.id === item.id);
            if (existing) { 
                existing.count++; 
            } else { 
                state.Inventory.push(
                    { 
                        id: item.id, 
                        name: item.name, 
                        image: item.image, 
                        description: item.description, 
                        category: item.category, 
                        requiredClass: item.requiredClass,
                        effectType: item.effectType, 
                        effectValue: buff.value, 
                        isPercentage: item.isPercentage, 
                        count: 1 
                    }
                ); 
            }
            msg += " (已放入背包)";
        }
        updateLocalGoldDisplay();
        renderShopItems(window.Game.currentShopItems); 
        showMessage(msg, '#2ecc71');
    }

    function applyEffectSinglePlayer(item) {
        const type = item.effectType;
        const val = buff.value;
        const index = defaultStat.indexOf(type)

        if (STAT_CONFIG[index] !== undefined) {
             state.AdditionState[index] += val;
             // ★ 屬性改變後，立刻重算血魔上限
             recalculateDerivedStats();
        } 
        updatePlayerUI();
    }

    function handleUseItem(item) {
        // 0. 防呆檢查：如果遊戲結束、升級中或回合鎖定，不允許使用道具
        if (state.isGameOver || state.processingLevelUp || state.isTurnLocked) {
             alert("當前狀態無法使用道具！");
             return;
        }

        // 1. 關閉背包
        if (inventoryLayer) inventoryLayer.classList.add('hidden');

        // 2. 單人模式：直接使用
        if (!isMultiplayerMode) {
            useItemSinglePlayer(item);
            return;
        }

        // 3. 多人模式：選取目標 (Select Target)
        if (socket) {
            // 顯示提示文字
            addBattleLog(`準備使用 ${item.name}，請選擇對象...`, 'log-system');
            
            // 建立一個全螢幕提示遮罩 (防止誤觸其他) 或簡單 Alert
            // 這裡採用簡單 Alert 加上 DOM 操作
            alert(`請點擊隊友頭像以使用 ${item.name}！\n(點擊下方自己血條可對自己使用)`);

            // 讓隊友卡片可點擊
            const cards = teammatesContainer.querySelectorAll('.tm-card');
            const selfArea = document.querySelector('.tower-player-status'); // 自己的區域

            // 清理函式
            const cleanup = () => {
                cards.forEach(c => {
                    c.removeEventListener('click', handleTargetSelect);
                    c.classList.remove('selectable');
                });
                if (selfArea) {
                    selfArea.removeEventListener('click', handleSelfSelect);
                    selfArea.classList.remove('selectable');
                }
            };

            const handleTargetSelect = (e) => {
                const targetId = e.currentTarget.dataset.id;
                if (confirm(`確定對隊友使用 ${item.name} 嗎？`)) {
                    // ★ 1. 鎖定回合狀態 (防止重複行動)
                    waitingForTurn = true;
                    updateControlsState(); // 讓攻擊按鈕變灰
                    
                    // ★ 2. 發送請求
                    socket.emit('player_use_item', { 
                        itemId: item.id,
                        targetSocketId: targetId
                    });
                    cleanup();
                }
            };

            const handleSelfSelect = () => {
                if (confirm(`確定對自己使用 ${item.name} 嗎？`)) {
                    // ★ 1. 鎖定回合狀態
                    waitingForTurn = true;
                    updateControlsState();
                    
                    // ★ 2. 發送請求
                    socket.emit('player_use_item', { 
                        itemId: item.id,
                        targetSocketId: socket.id 
                    });
                    cleanup();
                }
            };

            // 綁定事件 & 樣式
            cards.forEach(c => {
                c.classList.add('selectable');
                c.addEventListener('click', handleTargetSelect);
            });

            if (selfArea) {
                selfArea.classList.add('selectable');
                selfArea.addEventListener('click', handleSelfSelect);
            }
        }
    }

    function useItemSinglePlayer(item) {
        let used = false;
        
        if (item.category === 'POTION') {
            if (item.effectType === 'HP') {
                if (state.playerHp >= state.playerMaxHp) return alert("生命值已滿");
                const heal = item.isPercentage ? Math.round(state.playerMaxHp * (buff.value/100)) : buff.value;
                state.playerHp = Math.min(state.playerMaxHp, state.playerHp + heal);
                used = true;
            } else if (item.effectType === 'MP') {
                if (state.playerMp >= state.playerMaxMp) return alert("魔力值已滿");
                const heal = item.isPercentage ? Math.round(state.playerMaxMp * (buff.value/100)) : buff.value;
                state.playerMp = Math.min(state.playerMaxMp, state.playerMp + heal);
                used = true;
            }
        }

        if (used) {
            item.count--;
            if (item.count <= 0) {
                state.Inventory = state.Inventory.filter(i => i.id !== item.id);
            }
            updatePlayerUI();
            addBattleLog(`使用了 ${item.name}`, 'log-player');
            
            // ★ 單人模式：使用道具也算一回合，觸發敵人攻擊
            state.isTurnLocked = true;
            updateControlsState();
            setTimeout(enemyAttack, 500);

        } else {
            // alert("無法使用此道具");
            // 如果沒使用，背包會再次打開，或者保持關閉
        }
    }

    function handleUseSkill(skillId) {
        // 0. 防呆檢查：如果遊戲結束、升級中或回合鎖定，不允許使用技能
        if (state.isGameOver || state.processingLevelUp || state.isTurnLocked) {
            alert("當前狀態無法使用技能！");
            return;
        }

        // 1. 關閉技能選單
        if (skillLayer) skillLayer.classList.add('hidden');

        // 2. 單人模式：直接使用
        if (!isMultiplayerMode) {
            useSkillSinglePlayer(skillId);
            return;
        }
    }

    async function useSkillSinglePlayer(skill, target = null) {
        if (!skill) return;

        // 判斷目標，若沒有傳入 target，且技能是 self / team，則自動指向自己
        let actionPerformed = false;
        const activeSkillLayer = document.getElementById('active-skill-layer')

        // 處理主動技能
        if (skill.skillType === 'active') {
            let total_damage = 0;

            if (skill.DamageType === 'physical' || skill.DamageType === 'magical') {
                const damageAIndex = defaultStat.indexOf(skill.DamageAStat)
                const damageBIndex = defaultStat.indexOf(skill.DamageBStat)
                // 計算傷害
                const atkStatA = skill.DamageAStat ? state.AdditionState[damageAIndex] : 0;
                const atkStatB = skill.DamageBStat ? state.AdditionState[damageBIndex] : 0;

                for (let i = 0; i < skill.DamageTime; i++) {
                    
                    let damage = Math.round(atkStatA * skill.DamageARatio + atkStatB * skill.DamageBRatio);

                    const system_critRate = Math.random() * 100
                    CritRate = state.AdditionAttribute.crit + state.AdditionState[1] * 0.25 + state.AdditionState[3] * 0.15
                    let CritMultiply = 1;

                    if (CritRate > system_critRate) CritMultiply = 2;

                    let damageMultiply = 1 + Math.random() * 0.5
                    let AttackMultiply = 1 + (state.AdditionAttribute.skillBonus / 100)

                    damage = Math.round(damage * damageMultiply * CritMultiply * AttackMultiply);

                    state.enemyHp -= damage;
                    total_damage += damage;
                }

                damage = total_damage;
                const consume = skill.consumeType ? skill.consumeAmount : 0

                if (skill.consumeType == 'mp') {
                    state.playerMp -= consume
                    if (state.playerMp < 0) {
                        state.playerMp = 0
                    }
                }

                if (skill.consumeType == 'hp') {
                    state.playerHp -= consume
                    if (state.playerHp < 0) {
                        state.playerHp = 0
                    }
                }

                addBattleLog(`${window.Game.InitData.nickname} 使用 ${skill.name} 造成 ${damage} 點傷害`, 'log-player');
                showDamageNumber(damage);
                actionPerformed = true;
            } else if (skill.DamageType === 'heal') {
                const damageAIndex = defaultStat.indexOf(skill.DamageAStat)
                const damageBIndex = defaultStat.indexOf(skill.DamageBStat)
                // 計算傷害
                const atkStatA = skill.DamageAStat ? state.AdditionState[damageAIndex] : 0;
                const atkStatB = skill.DamageBStat ? state.AdditionState[damageBIndex] : 0;
                
                let skillBonus = 1 + (state.AdditionAttribute.skillBonus / 100)
                let heal = Math.round((atkStatA * skill.DamageARatio + atkStatB * skill.DamageBRatio) * skillBonus);
                state.playerHp = Math.min(state.playerMaxHp, state.playerHp + heal);

                addBattleLog(`${window.Game.InitData.nickname} 使用 ${skill.name} 回復 ${heal} 點生命`, 'log-player');
                actionPerformed = true;
            }
        }
            
        // 處理增益技能 (buff)
        if (skill.skillType === 'buff') {     
            // 這裡假設有 applyBuff 函式，把 skill 的效果加到目標身上
            applyBuff(skill);
            // addBattleLog(`${window.Game.player.name} 使用 ${skill.name} 能力提升了`, 'log-player');
            actionPerformed = true;
            }

        if (actionPerformed) {
            // 單人模式：使用技能算一回合
            state.isTurnLocked = true;
            activeSkillLayer.classList.add('hidden')
            updateControlsState();
            updateEnemyUI();

            if (state.enemyHp <= 0) {
                handleMonsterDeath();
            } else {
                setTimeout(enemyAttack, 100); // 單人怪物反擊
            }

            updatePlayerUI();
        } else {
            console.warn("技能未生效或目標錯誤", skill);
        }
    }

    async function applyBuff(skill) {
        if (!skill || skill.skillType.toLowerCase() !== 'buff') return;

        if (!state.Status) state.Status = [];

        try {
            // 從伺服器抓取技能對應的狀態
            const response = await fetch('/holylegend/system/status');
            const result = await response.json();

            if (!result.success) return;

            const data = result.data;
            const statusList = data.filter(status => status.skillId == skill.id);

            statusList.forEach(status => {
                // 檢查是否已存在於目標狀態
                const existing = state.Status.find(s => s.id === status.id && s.targetId === target.id);
                if (existing) {
                    existing.duration = status.duration; // 重置回合數
                } else {
                    buff = status
                    state.Status.push(status);

                    // 套用 STAT 效果
                    if (buff.effectType === 'STAT') {
                        if (!state.AdditionState) state.AdditionState = {};
                        const key = defaultStat.indexOf(buff.statKey);
                        
                        if (key != -1) {
                            if (buff.valueType === 'Add') {
                                state.AdditionState[key] = (state.AdditionState[key] || 0) + buff.value;
                            } else if (buff.valueType === 'Multiply') {
                                state.AdditionState[key] = (state.AdditionState[key] || 1) * buff.value;
                            }
                        } else {
                            const key = additionMap[buff.statKey];
                            if (key) {
                                if (buff.valueType === 'Add') {
                                    state.AdditionAttribute[key] += buff.value;
                                } else if (buff.valueType == 'Multiply') {
                                    state.AdditionAttribute[key] = state.AdditionAttribute * buff.value
                                }
                            }
                        }
                    }

                    // 套用技能加成
                    if (buff.effectType === 'SKILL') {
                        if (!state.skillBuffs) state.skillBuffs = {};
                        state.skillBuffs[buff.statKey] = buff.value;
                    }

                    addBattleLog(`${window.Game.InitData.nickname || '目標'} 獲得狀態「${buff.name}」(${buff.duration} 回合)`, 'log-buff');
                }
            });
        } catch (e) {
            console.error("伺服器錯誤", e);
        }
    }

    function removeBuffEffect(buff) {
        let key = additionMap[buff.statKey]
        if (key) {
            if (buff.valueType === 'Add') {
                state.AdditionAttribute[key] -= buff.value;
            } else if (buff.valueType === 'Multiply') {
                state.AdditionAttribute[key] /= buff.value;
            }
        } else {
            key = defaultStat.indexOf(buff.statKey)

            if (buff.valueType === 'Add') {
                state.AdditionState[key] -= buff.value;
            } else if (buff.valueType === 'Multiply') {
                state.AdditionState[key] /= buff.value;
            }
        }
        
    }
    

    function updateLocalGoldDisplay() {
        if (goldDisplay) goldDisplay.innerText = state.goldCollected || 0;
    }

    function showMessage(msg, color) {
        if (messageDisplay) {
            messageDisplay.style.color = color || '#fff';
            messageDisplay.innerText = msg;
        }
    }

    function shakeShop() {
        const container = document.querySelector('.shop-card-container');
        if (container) {
            container.style.animation = 'none';
            container.offsetHeight; 
            container.style.animation = 'shake 0.3s';
        }
    }

    function initShakeStyle() {
        const style = document.createElement('style');
        style.innerHTML = `@keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-5px); } 100% { transform: translateX(0); } }`;
        document.head.appendChild(style);
    }
});