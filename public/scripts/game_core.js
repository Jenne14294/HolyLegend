// 定義全域 Game 物件，讓其他腳本可以存取狀態
window.Game = {
    // 全域戰鬥狀態 (Shared State)
    state: {
        inCombat: false,
        isGameOver: false,
        processingLevelUp: false,
        currentFloor: 1,
        goldCollected: 0,
        playerHp: 100,
        playerMaxHp: 100,
        playerMp: 30,
        playerMaxMp: 30,
        enemyHp: 100,
        enemyMaxHp: 100,
        level: 1,
        role: 'novice', // 記錄當前職業
        avatar: '',
        AdditionState: [],
        AdditionEXP: 0,
        AdditionAttribute: {
            "dodge": 0,
            "crit": 0,
            "dmgReduce": 0,
            "hpBonus": 0,
            "mpBonus": 0,
            "regen": 0,
            "manaReflow": 0,
            "atkBonus": 0, 
            "skillBonus": 0,
            "expBonus": 0,
        },
        Inventory: [],
        Skills: [],
        Equipment: [],
    },

    InitData: {
        nickname: 'Player',
    },

    socket: null,
    
    // 共用工具：安全設定文字
    safeSetText: function(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    },

    // 共用工具：播放音樂
    playMusic: function(src) {
        const bgMusic = document.getElementById('bg-music-source');
        if (bgMusic) {
            // 如果原本就在播同一首，就不重新載入
            if (!bgMusic.src.includes(src)) {
                bgMusic.src = src;
            }
            bgMusic.volume = 0.4;
            bgMusic.play().catch(e => console.warn("音樂播放受阻:", e));
        }
    },

    // 共用工具：更新大廳 UI
    updateLobbyUI: function(data) {
        this.safeSetText('lobbyLevel', data.state.level);
        this.safeSetText('lobbyName', data.InitData.nickname);
        this.safeSetText('lobbyHpText', `${data.state.playerMaxHp}/${data.state.playerMaxHp}`);
        this.safeSetText('lobbyMpText', `${data.state.playerMaxMp}/${data.state.playerMaxMp}`);
        
        this.safeSetText('lobbyEXPText', `${data.InitData.exp}/${data.InitData.needEXP}`);
        
        const hpElem = document.getElementById('lobbyHpBar');
        const mpElem = document.getElementById('lobbyMpBar');
        const expElem = document.getElementById('lobbyEXPBar');
        if (hpElem) hpElem.style.width = `${(data.hp / data.maxHp) * 100}%`;
        if (mpElem) mpElem.style.width = `${(data.mp / data.maxMp) * 100}%`;
        if (expElem) expElem.style.width = `${(data.InitData.exp / data.InitData.needEXP) * 100}%`;
        
        
        const avatar = document.getElementById('lobbyAvatar');
        if (avatar && data.avatar) {
            // 首字大寫處理
            avatar.src = data.avatar;
        }      
    },

    updateLocalGoldDisplay: function() {
        if (goldDisplay && window.Game?.state) {
            goldDisplay.innerText = window.Game.state.goldCollected || 0;
        }
    },

    renderStats: function() {
        const state = window.Game.state;
        const equipments = state.Equipment || [];
        const extraStats = {
            "dodge": 0,
            "crit": 0,
            "dmgReduce": 0,
            "hpBonus": 0,
            "mpBonus": 0,
            "regen": 0,
            "manaReflow": 0,
            "atkBonus": 0, 
            "skillBonus": 0,
            "expBonus": 0,
        }

        // 3. 遍歷已裝備的技能石，累加效果
        equipments.forEach(item => {
            if (item) {
                switch (item.effectType) {
                    case 'CRIT': extraStats.crit += item.effectValue; break;
                    case 'DODGE': extraStats.dodge += item.effectValue; break;
                    case 'DMG_REDUCE': extraStats.dmgReduce += item.effectValue; break;
                    case 'HP_BONUS': extraStats.hpBonus += item.effectValue; break;
                    case 'MP_BONUS': extraStats.mpBonus += item.effectValue; break;
                    case 'REGEN': extraStats.regen += item.effectValue; break;
                    case 'MANA_RETURN': extraStats.manaReflow += item.effectValue; break;
                    case 'ATK_BONUS': extraStats.atkBonus += item.effectValue; break;
                    case 'SKILL_BONUS': extraStats.skillBonus += item.effectValue; break;
                    case 'EXP_BONUS': extraStats.expBonus += item.effectValue; break;
                }
            }            
            
        });


        // 2. 計算新的上限 = 基礎 + 加成
        const newMaxHp = state.playerBaseMaxHp + Math.floor(extraStats.hpBonus);
        const newMaxMp = state.playerBaseMaxMp + Math.floor(extraStats.mpBonus);

        // 3. 處理當前血量 (選擇性：是否要補滿增加的部分？)
        // 這裡的邏輯是：如果上限增加了，當前血量也按比例或固定值增加，避免看起來像扣血
        // 簡單做法：保持當前血量不變，除非超過上限(這不太可能發生在加成時)
        // 進階做法：加上差值 (獲得裝備時好像補血了一樣)
        if (newMaxHp > state.playerMaxHp) {
            state.playerHp = state.playerMaxHp;
        }

        if (newMaxMp > state.playerMaxMp) {
            state.playerMp = state.playerMaxMp;
        }

        // 4. 套用新上限
        state.playerMaxHp = newMaxHp;
        state.playerMaxMp = newMaxMp;
        state.playerHp = newMaxHp;
        state.playerMp = newMaxMp;

        // 4. 更新 DOM 文字
        this.safeSetText('val-hp-bonus', `+${Math.floor(extraStats.hpBonus)}`);
        this.safeSetText('val-mp-bonus', `+${Math.floor(extraStats.mpBonus)}`);
        this.safeSetText('val-dmg-red', `${Math.min(80, extraStats.dmgReduce).toFixed(1)}%`); // 上限 80%
        
        this.safeSetText('val-atk', `+${extraStats.atkBonus.toFixed(1)}%`);
        this.safeSetText('val-skill', `+${extraStats.skillBonus.toFixed(1)}%`);
        this.safeSetText('val-regen', `${extraStats.regen.toFixed(1)}/R`);
        
        this.safeSetText('val-dodge', `${extraStats.dodge.toFixed(1)}%`);
        this.safeSetText('val-crit', `${extraStats.crit.toFixed(1)}%`);
        this.safeSetText('val-exp', `+${extraStats.expBonus}%`);
        this.safeSetText('val-mana-reflow', `${extraStats.manaReflow.toFixed(1)}/R`);

        window.Game.state.AdditionAttribute = extraStats;
        return extraStats;
    }
};

let state = window.Game.state

document.addEventListener('DOMContentLoaded', () => {
    // 初始化 socketIO
    if (typeof io !== 'undefined') {
        window.Game.socket = io({
  	  path: '/holylegend/socket.io' // <--- 這一行也不能少
	});
	console.log("Game Core: Socket 初始化完成");
    } else {
        console.warn("Socket.io 客戶端庫未載入！");
    }
    // ===========================
    // 初始化：跟後端拿資料
    // ===========================
    async function initGame() {
        try {
            const data_response = await fetch('/holylegend/system/classes');
            const data_result = await data_response.json();

            const item_response = await fetch('/holylegend/system/items');
            const item_result = await item_response.json();
            if (data_result.success) {
                const InventoryData = data_result.inventoryData;
                // ★ 注意：EquipmentData 通常是陣列，要取第 0 筆，若沒有則給空物件避免報錯
                const EquipmentData = (data_result.equipmentData) || {};
                
                let NewSkill = [];
                let NewEquipment = [];
                
                if (item_result.success) {
                    const ItemData = item_result.data;
                    
                    // 1. 嘗試從 EquipmentData 建立裝備欄
                    for (let i = 1; i < 9; i++) {
                        let base_key = `slot${i}`;
                        
                        if (EquipmentData[base_key] != null) {
                            // 去 ItemData (原始資料) 找對應的物品
                            const item = ItemData.find(item => item.id == EquipmentData[base_key])
                            NewEquipment.push(item);
                        } else {
                            NewEquipment.push(null);
                        }
                    }
                    
                    // 2. 建立背包資料 (NewSkill)
                    InventoryData.forEach(item => {
                        NewSkill.push({
                            id: item.itemId, 
                            name: item.item.name, 
                            image: item.item.image, 
                            category: item.item.category, 
                            quantity: item.quantity, 
                            equipped: item.equipped,
                            description: item.item.description,
                            requiredClass: item.item.requiredClassId,
                            effectType: item.item.effectType,
                            effectValue: item.item.effectValue,
                            isPercentage: item.item.isPercentage,
                        });
                    })
                    
                    // ★★★ 新增：補救機制 ★★★
                    // 如果裝備欄全是 null，檢查背包是否有標記為「已裝備」的物品，自動填入
                    const isEquipEmpty = NewEquipment.every(slot => slot === null);
                    
                    if (isEquipEmpty) {
                        console.log("⚠️ 偵測到裝備資料為空，嘗試從背包還原狀態...");
                        let slotIdx = 0;
                        
                        NewSkill.forEach(skill => {
                            if (skill.equipped > 0) {
                                // 根據 equipped 數量，將物品填入空插槽
                                let count = skill.equipped;
                                while (count > 0 && slotIdx < 8) {
                                    // 確保該插槽是空的才填入
                                    if (NewEquipment[slotIdx] === null) {
                                        NewEquipment[slotIdx] = skill; // 使用背包內的物件引用
                                        count--;
                                    }
                                    slotIdx++;
                                }
                            }
                        });
                    }
                    // ★★★★★★★★★★★★★★★★★★★

                    state.Equipment = NewEquipment;
                    // 注意：這邊您用的是 Skills，請確保其他檔案 (skill_system.js) 也是用 Skills 或是 Inventory
                    state.Skills = NewSkill; 
                }
            }

            const response = await fetch('/holylegend/system/status');
            const result = await response.json();
            
            if (result.success) {
                let data = result.data;
                // 更新全域狀態
                Game.state.playerBaseMaxHp = data.maxHp;
                Game.state.playerBaseMaxMp = data.maxMp;
                Game.state.playerHp = data.hp;
                Game.state.playerMaxHp = data.maxHp;
                Game.state.playerMp = data.mp;
                Game.state.playerMaxMp = data.maxMp;
                Game.state.level = data.level;
                Game.state.currentFloor = 1;
                Game.state.role = data.role; // 記錄職業
                Game.state.AdditionState = data.AdditionState;
                Game.state.AdditionEXP = 0;
                Game.state.avatar = data.avatar;
                Game.InitData.nickname = data.nickname;
                Game.InitData.exp = data.exp;
                Game.InitData.needEXP = data.needEXP;
                
                
                // 更新 UI
                const AdditionAttribute = Game.renderStats();
                Game.state.AdditionAttribute = AdditionAttribute;

                Game.updateLobbyUI(Game);
            } else {
                console.warn("API 回傳失敗");
            }
        } catch (error) {
            console.error("無法連線到伺服器:", error);
            Game.updateLobbyUI(window.INITIAL_PLAYER_DATA);
        }
    }

    initGame();
});
