import { Server } from 'socket.io';
import { getEnemies, getEvents, getStatus, getItems } from './services/system.js';

const rooms = {}; 
const battles = {}; 
const STAT_MAP = { 'STR': 0, 'DEX': 1, 'CON': 2, 'INT': 3 };
const HP_PER_CON = 0.7; 
const HP_PER_STR = 0.3;
const MP_PER_INT = 0.75;

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

const disconnectTimers = {}; // ★ 你的錯誤就是少了這一行
const requestTimers = {};

export default function initSocket(server) {
    const io = new Server(server, {
      path: '/holylegend/socket.io' // <--- 這一行不能少
    });


    io.on('connection', (socket) => {       
        let currentRoomId = null;
        let currentPlayer = null;

        // --- 隊伍系統 ---
        socket.on('create_team', (playerData) => {
            const roomId = Math.floor(1000 + Math.random() * 9000).toString();
            socket.join(roomId);
            currentRoomId = roomId;
            currentPlayer = { ...playerData, socketId: socket.id, isLeader: true, isReady: false };
            rooms[roomId] = [currentPlayer];
            socket.emit('team_created', { roomId, members: rooms[roomId] });
        });

        socket.on('join_team', ({ roomId, playerData }) => {
            const room = rooms[roomId];
            if (!room) { return socket.emit('error_msg', '找不到此房間'); }
            if (room.length >= 4) { return socket.emit('error_msg', '隊伍已滿'); }

            socket.join(roomId);
            currentRoomId = roomId;
            currentPlayer = { ...playerData, socketId: socket.id, isLeader: false, isReady: false };
            room.push(currentPlayer);

            io.to(roomId).emit('team_update', room);
            io.to(roomId).emit('chat_message', { sender: '系統', text: `${playerData.nickname} 加入了隊伍！`, isSystem: true });
        });

        socket.on('player_job_changed', (data) => {
            if (!currentRoomId || !currentPlayer) return;

            const oldRole = currentPlayer.state.role;

            // 1. 更新 currentPlayer 的永久狀態 (p.state)
            if (data.newLevel) currentPlayer.state.level = data.newLevel;
            if (data.newRole) currentPlayer.state.role = data.newRole;
            if (data.newMaxHp) currentPlayer.state.playerMaxHp = data.newMaxHp;
            if (data.newMaxMp) currentPlayer.state.playerMaxMp = data.newMaxMp;
            if (data.avatar) currentPlayer.state.avatar = data.avatar;
            
            // 轉職成功後，HP/MP 通常會回滿，但我們以 Client 傳來的最新數值為主
            if (data.currentHp !== undefined) currentPlayer.state.playerHp = data.currentHp;
            if (data.currentMp !== undefined) currentPlayer.state.playerMp = data.currentMp;
            
            // 屬性更新 (這通常是整個陣列被覆蓋)
            if (data.newAdditionState) currentPlayer.state.AdditionState = data.newAdditionState;

            // 2. 更新戰鬥狀態 (如果正在爬塔)
            const battle = battles[currentRoomId];
            if (battle && battle.playerStates[socket.id]) {
                const combatState = battle.playerStates[socket.id];
                
                // 更新戰鬥中的 Max HP/MP (很重要，影響血條長度)
                combatState.maxHp = currentPlayer.state.playerMaxHp;
                combatState.maxMp = currentPlayer.state.playerMaxMp;
                
                // 更新當前 HP/MP
                combatState.hp = currentPlayer.state.playerHp;
                combatState.mp = currentPlayer.state.playerMp;

                // 確保復活旗標清除 (因為轉職通常意味著滿狀態復活)
                if (combatState.hp > 0) {
                    combatState.isDead = false;
                }
            }

            // 3. 通知隊友更新隊伍列表
            io.to(currentRoomId).emit('team_update', rooms[currentRoomId]);
            if (data.newRole == oldRole) return;
            io.to(currentRoomId).emit('chat_message', { 
                sender: '系統', 
                text: `${currentPlayer.nickname} 轉職成 [${data.newRole}]！`, 
                isSystem: true 
            });
        });

        // 修改後的 kick_member
        socket.on('kick_member', ({ roomId, targetSocketId }) => {
            // 1. 取得房間成員列表
            const roomMembers = rooms[roomId];
            if (!roomMembers) return;

            // 2. 驗證: 找出發送請求的人 (requester)，確認他是隊長
            const requester = roomMembers.find(p => p.socketId === socket.id);
            
            // 如果找不到人，或是這個人不是隊長，就拒絕執行
            if (!requester || !requester.isLeader) {
                socket.emit('error_msg', '權限不足：只有隊長可以踢人');
                return;
            }

            // 3. 執行踢人 (過濾掉目標 ID)
            const originalLength = roomMembers.length;
            rooms[roomId] = roomMembers.filter(m => m.socketId !== targetSocketId);

            // 如果長度沒變，代表沒踢到人(目標可能已經離開)，就不廣播了
            if (rooms[roomId].length === originalLength) return;
            
            // 4. 通知被踢的人 (觸發前端的 socket.on('kicked'))
            io.to(targetSocketId).emit('kicked');
            
            // 強制讓該 socket 離開 socket.io 的 room
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.leave(roomId);
            }

            // 5. 通知房間其他人更新列表
            io.to(roomId).emit('team_update', rooms[roomId]);
            
            // 發送系統訊息
            io.to(roomId).emit('chat_message', { sender: '系統', text: '一名隊員已被請離隊伍。', isSystem: true });
        });

        socket.on('change_leader', ({ roomId, targetSocketId}) => {
            // 1. 取得房間成員列表
            const roomMembers = rooms[roomId];
            if (!roomMembers) return;

            // 2. 驗證: 找出發送請求的人 (requester)，確認他是隊長
            const requester = roomMembers.find(p => p.socketId === socket.id);
            
            // 如果找不到人，或是這個人不是隊長，就拒絕執行
            if (!requester || !requester.isLeader) {
                socket.emit('error_msg', '權限不足：只有隊長可以指派隊長');
                return;
            }

            let targetName = ""

            roomMembers.forEach(p => {
                if (p.socketId == targetSocketId) {
                    p.isLeader = true;
                    targetName = p.nickname;
                }

                else {
                    p.isLeader = false;
                }
            });


            // 5. 通知房間其他人更新列表
            io.to(roomId).emit('team_update', rooms[roomId]);

            // 發送系統訊息
            io.to(roomId).emit('chat_message', { sender: '系統', text: `隊長已交接給 ${targetName}`, isSystem: true });
        });

        socket.on('send_message', (text) => {
            if (currentRoomId && currentPlayer) {
                io.to(currentRoomId).emit('chat_message', { sender: currentPlayer.nickname, text: text, isSystem: false });
            }
        });

        // --- 爬塔系統 ---

        socket.on('request_tower_start', () => {
            if (!currentRoomId || !currentPlayer.isLeader) return;
            const room = rooms[currentRoomId];
            room.forEach(p => p.isReady = false);
            io.to(currentRoomId).emit('init_ready_check', room);
        });

        socket.on('respond_ready', async (payload) => {
             if (!currentRoomId) return;
             
             // 相容舊寫法 (如果 payload 是布林值)
             const isReady = typeof payload === 'object' ? payload.ready : payload;
             const clientState = typeof payload === 'object' ? payload.latestState : null;

             // 1. 拒絕準備
             if (!isReady) { 
                currentPlayer.isReady = false;
                io.to(currentRoomId).emit('update_ready_view', { socketId: socket.id, status: 'declined' });
                return;
             }

             // 2. 接受準備
             currentPlayer.isReady = true;
             
             // ★★★ 關鍵修改：如果前端有傳來最新狀態，更新後端記憶體 ★★★
             // 這確保了第二局開始時，使用的是大廳的乾淨數值，而不是上一局的髒數據
             if (clientState) {
                 // 更新永久狀態
                 currentPlayer.state = {
                     ...currentPlayer.state, // 保留如 avatar 等欄位
                     ...clientState,         // 覆蓋數值
                     // 強制歸零累積資源 (雙重保險)
                     goldCollected: 0,
                     AdditionEXP: 0,
                     // 確保屬性陣列是新的副本，避免參照問題
                     AdditionState: [...(clientState.AdditionState || [0,0,0,0])]
                 };
             }

             io.to(currentRoomId).emit('update_ready_view', { socketId: socket.id, status: 'accepted' });

             // 3. 檢查全員準備
             const room = rooms[currentRoomId]; 
             const allReady = room.every(p => p.isReady);

            if (allReady) {
                 // 初始化第一層
                 const playersPublicInfo = room.map(p => {
                    // 再次確保狀態是滿的 (基於剛剛更新過的 state)
                    p.state.playerHp = p.state.playerMaxHp;
                    p.state.playerMp = p.state.playerMaxMp;
                     
                    return {
                         socketId: p.socketId,
                         nickname: p.nickname,
                         role: p.state.role,
                         avatar: p.state.avatar,
                         maxHp: p.state.playerMaxHp,
                         maxMp: p.state.playerMaxMp,
                         hp: p.state.playerMaxHp, 
                         mp: p.state.playerMaxMp,
                         AdditionEXP: 0,
                         goldCollected: 0,
                         AdditionState: p.state.AdditionState
                     };
                 });
                
                const floor = 1;

                // ==========================================
                // ★ 從資料庫獲取第 1 層的怪物
                // ==========================================
                let selectedMonsterDef = null;
                try {
                    const allMonsters = await getEnemies();
                    
                    // 第 1 樓必定是普通怪
                    let validMonsters = allMonsters.filter(m => 
                        floor >= m.minLayer && floor <= m.maxLayer && m.type === 'NORMAL'
                    );

                    if (validMonsters.length === 0) validMonsters = allMonsters;
                    if (validMonsters.length > 0) {
                        selectedMonsterDef = validMonsters[Math.floor(Math.random() * validMonsters.length)];
                    }

                } catch (e) {
                    console.error("多人遊戲初始化抓取怪物失敗:", e);
                }

                if (!selectedMonsterDef) {
                    selectedMonsterDef = {
                        id: 1, name: '未知史萊姆', image: 'slime_green.png',
                        HP: 25, ATK: 8, DEF: 1, MDEF: 1, Gold: 5, EXP: 10
                    };
                }

                // 計算多人模式血量：基礎血量 * (1 + 0.25 * (人數 - 1))
                const playerMultiplier = 1 + (0.25 * (room.length - 1));
                const enemyMaxHp = Math.round(selectedMonsterDef.HP * playerMultiplier);

                // 初始化玩家血量狀態
                const playerStates = {};
                room.forEach(p => {
                    playerStates[p.socketId] = {
                        hp: p.state.playerMaxHp || 100,
                        maxHp: p.state.playerMaxHp || 100,
                        mp: p.state.playerMaxMp || 30,
                        maxMp: p.state.playerMaxMp || 30,
                        isDead: false
                    };
                });

                battles[currentRoomId] = {
                    floor: floor,
                    enemyHp: enemyMaxHp,
                    enemyMaxHp: enemyMaxHp,
                    monsterType: selectedMonsterDef.image.split('.')[0], 

                    // 把整隻怪物的資料包進去，供後續戰鬥使用
                    enemy: {
                        id: selectedMonsterDef.id,
                        name: selectedMonsterDef.name,
                        image: selectedMonsterDef.image,
                        hp: enemyMaxHp,
                        maxHp: enemyMaxHp,
                        atk: selectedMonsterDef.ATK,
                        def: selectedMonsterDef.DEF,
                        mdef: selectedMonsterDef.MDEF,
                        gold: selectedMonsterDef.Gold,
                        exp: selectedMonsterDef.EXP
                    },

                    pendingActions: [],
                    playerStates: playerStates,
                    alivePlayerIds: room.map(p => p.socketId),
                    isEnding: false 
                };

                io.to(currentRoomId).emit('multiplayer_battle_start', {
                    floor: floor,
                    enemyHp: enemyMaxHp,
                    enemyMaxHp: enemyMaxHp,
                    monsterType: selectedMonsterDef.image.split('.')[0],
                    enemy: battles[currentRoomId].enemy, // 傳送完整新版怪物資料
                    players: playersPublicInfo 
                });
            }
        });

        socket.on('leave_tower', () => {
            const battle = battles[currentRoomId];

            if (!battle) return;

            delete battle.playerStates[socket.id];

            battle.alivePlayerIds =
                battle.alivePlayerIds.filter(id => id !== socket.id);

            socket.emit('leave_tower_success');

            io.to(currentRoomId).emit('chat_message', {
                sender: '系統',
                text: '玩家離開塔樓。',
                isSystem: true
            });

            // 沒人了才刪除戰鬥
            if (battle.alivePlayerIds.length === 0) {
                delete battles[currentRoomId];
            }
        });

        socket.on('player_action', async (action) => {
            if (!currentRoomId || !battles[currentRoomId]) return;

            const battle = battles[currentRoomId];
            if (battle.isEnding || battle.processingTurn) return; // 上鎖中
            
            // 死人不能行動
            if (battle.playerStates[socket.id]?.isDead) return;

            // 紀錄動作
            let damage = 0;

            action.AdditionState.forEach(value => {
                for (let i = 0; i < action.AdditionState.length; i++)
                {
                    damage += value * 0.25;
                }
            });

            const system_critRate = Math.random() * 100
            let critRate = action.AdditionAttribute.crit + (action.AdditionState.DEX * 0.25 + action.AdditionState.INT * 0.15)
            let CritMultiply = 1;

            if (system_critRate < critRate)
            {
                CritMultiply = 2;
            }
            
            let atkBonus =  1 + (action.AdditionAttribute.atkBonus / 100)
            let damageMultiply = 0.8 + Math.random() * 0.4
            damage = Math.max(1, Math.round(damage * damageMultiply * CritMultiply * atkBonus) - battle.enemy.def);

            const hasActed = battle.pendingActions.find(a => a.socketId === socket.id);
            if (!hasActed) {
                battle.pendingActions.push({ socketId: socket.id, damage: damage, type: 'attack' });
            }

            // 檢查是否「所有存活玩家」都已行動
            if (battle.pendingActions.length >= battle.alivePlayerIds.length) {
                await processTurn(currentRoomId)
            }
        });

        socket.on('player_use_item', async ({ itemId, targetSocketId }) => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            const pState = battle.playerStates[socket.id];
            
            // 0. 狀態檢查
            if (battle.isEnding || battle.processingTurn) return; // 正在結算中不能用
            if (pState?.isDead) return; // 死人不能用
            
            // ★ 檢查是否已行動 (如果這回合已經攻擊或用過道具，就不能再用)
            if (battle.pendingActions.find(a => a.socketId === socket.id)) {
                return socket.emit('item_use_result', { success: false, msg: "本回合已行動" });
            }

            const playerRoomData = rooms[currentRoomId].find(p => p.socketId === socket.id);
            if (!playerRoomData || !playerRoomData.state.Inventory) return;
            
            const inventory = playerRoomData.state.Inventory;
            const itemIndex = inventory.findIndex(i => i.id === itemId);
            const item = inventory[itemIndex];

            // 1. 檢查道具
            if (!item || item.count <= 0) {
                return socket.emit('item_use_result', { success: false, msg: "道具不足" });
            }

            // 2. 確定目標 (預設為自己，如果 targetSocketId 有傳且有效則用之)
            let finalTargetId = socket.id; 
            if (targetSocketId && battle.playerStates[targetSocketId]) {
                finalTargetId = targetSocketId;
            }
            const targetState = battle.playerStates[finalTargetId];
            const targetRoomData = rooms[currentRoomId].find(p => p.socketId === finalTargetId);
            const targetName = targetRoomData ? targetRoomData.nickname : '目標';

            // 3. 執行效果
            let used = false;
            
            if (item.category === 'POTION') {
                if (item.effectType === 'HP') {
                    // 對目標使用
                    if (targetState.isDead) return socket.emit('item_use_result', { success: false, msg: "無法對死亡目標使用治療" }); // 確保目標存活

                    if (targetState.hp >= targetState.maxHp) return socket.emit('item_use_result', { success: false, msg: "目標生命值已滿" });
                    
                    const heal = item.isPercentage ? Math.round(targetState.maxHp * (item.effectValue/100)) : item.effectValue;
                    targetState.hp = Math.min(targetState.maxHp, targetState.hp + heal);
                    if (targetRoomData) targetRoomData.state.playerHp = targetState.hp; // 同步
                    used = true;
                }
                else if (item.effectType === 'MP') {
                    if (targetState.isDead) return socket.emit('item_use_result', { success: false, msg: "無法對死亡目標使用" }); // 確保目標存活

                    if (targetState.mp >= targetState.maxMp) return socket.emit('item_use_result', { success: false, msg: "目標魔力值已滿" });

                    const heal = item.isPercentage ? Math.round(targetState.maxMp * (item.effectValue/100)) : item.effectValue;
                    targetState.mp = Math.min(targetState.maxMp, targetState.mp + heal);
                    if (targetRoomData) targetRoomData.state.playerMp = targetState.mp; // 同步
                    used = true;
                }

                else if (item.effectType === 'REVIVE') {
                    // 檢查：只有死人才能被復活
                    if (!targetState.isDead) {
                        return socket.emit('item_use_result', { success: false, msg: "目標尚未死亡，無法使用復活" });
                    }

                    const heal = item.isPercentage ? Math.round(targetState.maxHp * (item.effectValue/100)) : item.effectValue;
                    const recover = item.isPercentage ? Math.round(targetState.maxMp * (item.effectValue/100)) : item.effectValue;

                    // 復活：血量設為恢復量 (不是 +heal，因為原本是 0)
                    targetState.hp = Math.min(targetState.maxHp, heal); 
                    targetState.mp = Math.min(targetState.maxMp, targetState.mp + recover);
                    targetState.isDead = false;

                    // 同步回房間狀態
                    if (targetRoomData) {
                        targetRoomData.state.playerHp = targetState.hp;
                        targetRoomData.state.playerMp = targetState.mp;
                    }
                    
                    // ★★★ 關鍵：加回存活名單，這樣 processTurn 才會算他一份 ★★★
                    if (!battle.alivePlayerIds.includes(finalTargetId)) {
                        battle.alivePlayerIds.push(finalTargetId);
                    }

                    io.to(finalTargetId).emit('player_revived', { hp: targetState.hp, mp: targetState.mp });

                    used = true;
                }
            }

            if (used) {
                // 4. 扣除數量
                item.count -= 1;
                if (item.count <= 0) {
                    inventory.splice(itemIndex, 1); 
                }

                // 5. 通知前端成功
                socket.emit('item_use_result', { 
                    success: true, 
                    msg: `對 ${targetName} 使用了 ${item.name}`,
                    newInventory: inventory,
                    hp: pState.hp, // 回傳自己的狀態
                    mp: pState.mp
                });
                
                io.to(currentRoomId).emit('chat_message', { sender: '系統', text: `${playerRoomData.nickname} 對 ${targetName} 使用了 ${item.name}。`, isSystem: true });
                
                // ★★★ 關鍵：視為已行動，加入 pendingActions ★★★
                battle.pendingActions.push({ 
                    socketId: socket.id, 
                    type: 'use_item', 
                    damage: 0 // 使用道具通常沒有傷害
                });

                // ★★★ 關鍵：檢查是否全員行動完畢，觸發回合結算 ★★★
                if (battle.pendingActions.length >= battle.alivePlayerIds.length) {
                    await processTurn(currentRoomId);
                }
            } else {
                socket.emit('item_use_result', { success: false, msg: "無法使用此道具" });
            }
        });
        

        // 3. ★ 新增：玩家施放技能 ★
        socket.on('player_use_skill', async (data) => {
            const { skill, targetSocketId } = data;

            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            const pCombatState = battle.playerStates[socket.id];
            const pRoomData = rooms[currentRoomId].find(p => p.socketId === socket.id);
            const tRoomData = rooms[currentRoomId];

            // 防呆：死人、正在結算、或本回合已行動者不可施法
            if (battle.isEnding || battle.processingTurn || pCombatState?.isDead) return;
            if (battle.pendingActions.find(a => a.socketId === socket.id)) return;

            try {
                // 從資料庫讀取技能資訊 (包含關聯的增益效果)
                if (!skill) return;

                // 扣除消耗
                if (skill.consumeType === 'mp') {
                    pCombatState.mp -= skill.consumeAmount;
                    pRoomData.state.playerMp = pCombatState.mp;
                }

                let totalSkillDamage = 0;
                let targets = [];

                // 目標過濾邏輯
                if (targetSocketId === 'enemy') {
                    targets = ['enemy'];
                } else if (targetSocketId === 'team') {
                    targets = [...battle.alivePlayerIds]; // 全體存活隊員
                } else {
                    targets = [targetSocketId]; // 單一目標 (自己或指定隊友)
                }

                targets.forEach(async tId => {
                    if (tId === 'enemy') {
                        // 傷害公式計算 (基於技能表定義的屬性與倍率)
                        for (let i = 0; i < skill.DamageTime; i++) {
                            const statA = pRoomData.state.AdditionState[STAT_MAP[skill.DamageAStat]] || 0;
                            const statB = pRoomData.state.AdditionState[STAT_MAP[skill.DamageBStat]] || 0;
                            const baseDmg = (statA * skill.DamageARatio) + (statB * skill.DamageBRatio);

                            const system_critRate = Math.random() * 100
                            let critRate = pRoomData.state.AdditionAttribute.crit + (pRoomData.state.AdditionState.DEX * 0.25 + pRoomData.state.AdditionState.INT * 0.15)
                            let CritMultiply = 1;

                            if (system_critRate < critRate)
                            {
                                CritMultiply = 2;
                            }
                            
                            let skillBonus =  1 + (pRoomData.state.AdditionAttribute.skillBonus / 100)
                            let damageMultiply = 1 + Math.random() * 0.5

                            let finalDamage = Math.round(baseDmg * skillBonus * damageMultiply * CritMultiply);

                            if (skill.DamageType === 'PHYSICAL') {
                                finalDamage -= battle.enemy.def;
                            } else if (skill.DamageType === 'MAGIC') {
                                finalDamage -= battle.enemy.mdef;
                            }

                            totalSkillDamage += Math.max(1, finalDamage);
                        }
                        
                    } else {
                        const targetCombat = battle.playerStates[tId];
                        const targetRoom = rooms[currentRoomId].find(p => p.socketId === tId);
                        if (!targetCombat) return;

                        // 處理治療效果 (HEAL)
                        if (skill.DamageType === 'heal') {
                            const statA = pRoomData.state.AdditionState[STAT_MAP[skill.DamageAStat]] || 0;
                            const statB = pRoomData.state.AdditionState[STAT_MAP[skill.DamageBStat]] || 0;

                            const heal = Math.round((statA * skill.DamageARatio) + (statB * skill.DamageBRatio));
                            targetCombat.hp = Math.min(targetCombat.maxHp, targetCombat.hp + heal);
                            if (targetRoom) targetRoom.state.playerHp = targetCombat.hp;
                        }

                        // 處理復活效果 (REVIVE)
                        // if (skill.effectType === 'REVIVE' && targetCombat.isDead) {
                        //     targetCombat.isDead = false;
                        //     targetCombat.hp = Math.round(targetCombat.maxHp * 0.3);
                        //     if (!battle.alivePlayerIds.includes(tId)) battle.alivePlayerIds.push(tId);
                        //     io.to(tId).emit('player_revived', { hp: targetCombat.hp, mp: targetCombat.mp });
                        // }

                        // 處理 Buffs (Status)
                        if (skill.skillType == 'buff') {
                            const Statuses = await getStatus();

                            const buff = Statuses.find(s => s.skillId == skill.id);

                            if (!buff) {
                                console.error("找不到 Buff Status:", skill.id);
                                return;
                            }

                            const buffData = buff.toJSON();
                            delete buffData.skill; // 移除 include 的 Skill 關聯，避免循環引用

                            tRoomData.forEach(m => {
                                if (m.socketId == tId) {
                                    const existing = m.state.Status.find(
                                        s => s.id === buffData.id && s.castId === socket.id
                                    );

                                    if (existing) {
                                        existing.duration = buffData.duration; // 重置回合數
                                    } else {
                                        m.state.Status.push({
                                            ...buffData,
                                            castId: socket.id,
                                            castName: pRoomData.nickname
                                        });

                                        // 套用 STAT 效果
                                        if (buffData.effectType === 'STAT') {
                                            const key = defaultStat.indexOf(buffData.statKey);

                                            if (buffData.valueType === 'Add') {
                                                if (key != -1) {
                                                    m.state.AdditionState[key] =
                                                        (m.state.AdditionState[key] || 0) + buffData.value;
                                                } else {
                                                    const attrKey = additionMap[buffData.statKey];

                                                    if (attrKey) {
                                                        m.state.AdditionAttribute[attrKey] += buffData.value;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    recalculatePlayerStatus(
                                        m.state,
                                        battle.playerStates[m.socketId]
                                    );
                                }
                            });
                        }
                    }
                });

                // 將動作加入待結算列表
                battle.pendingActions.push({ 
                    socketId: socket.id, 
                    damage: totalSkillDamage, 
                    type: 'skill', 
                    skillName: skill.name 
                });

                socket.emit('skill_cast_result', { 
                    success: true, 
                    skillName: skill.name 
                });

                // 如果全體行動完畢則結算回合
                if (battle.pendingActions.length >= battle.alivePlayerIds.length) {
                    await processTurn(currentRoomId);
                }

            } catch (error) {
                console.error('技能處理失敗:', error);
            }
        });


        // =================================================
        //  ★ 新增：多人事件處理 (核心邏輯)
        // =================================================

        // 1. 玩家嘗試檢定 (Try)
        socket.on('try_event_action', ({ eventId, isSuccess }) => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            
            // 檢查鎖定：如果已經有人在檢定，拒絕
            if (battle.eventLock) return; 
            
            // 鎖定事件
            battle.eventLock = socket.id;
            const player = rooms[currentRoomId].find(p => p.socketId === socket.id);
            
            // 廣播鎖定狀態 (讓其他人按鈕變灰)
            io.to(currentRoomId).emit('event_locked', { nickname: player ? player.nickname : '隊友' });

            // 這裡簡單信任前端傳來的 isSuccess，嚴謹的話後端要再算一次
            const eventData = battle.currentEventData;
            
            setTimeout(() => {
                // 暫存結果，不立即發放
                battle.pendingEventResult = {
                    isSuccess: isSuccess,
                    executorName: player ? player.nickname : '隊友',
                    ...eventData
                };

                const msg = isSuccess 
                    ? `✨ ${player.nickname} 檢定成功！\n獲得 ${eventData.rewardType} +${eventData.rewardValue}\n(請等待全員確認)` 
                    : `💨 ${player.nickname} 檢定失敗...\n損失 ${eventData.punishType} ${eventData.punishValue}\n(請等待全員確認)`;
                
                io.to(currentRoomId).emit('event_result', { success: isSuccess, msg: msg });
            }, 500);
        });

        // 2. 玩家確認/離開 (Confirm)
        socket.on('player_confirm_event', () => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            
            // 加入確認名單
            if (!battle.eventConfirmedPlayers.includes(socket.id)) {
                battle.eventConfirmedPlayers.push(socket.id);
            }

            // 檢查：是否所有「存活」玩家都已確認？
            const aliveCount = battle.alivePlayerIds.length;
            
            if (battle.eventConfirmedPlayers.length >= aliveCount) {
                // --- 全員確認完畢，執行結算 ---
                
                const result = battle.pendingEventResult;
                // 防呆：如果結果不存在，跳過結算
                if (!result) {
                    io.to(currentRoomId).emit('close_event_window');
                    setTimeout(() => { startNextFloor(currentRoomId); }, 1000);
                    return;
                }

                const room = rooms[currentRoomId];

                // 判斷是獎勵還是懲罰
                const type = result.isSuccess ? result.rewardType : result.punishType;
                const val = result.isSuccess ? result.rewardValue : result.punishValue;
                const isPunish = !result.isSuccess;

                // ★★★ 關鍵更新邏輯：同步寫入 Server 端記憶體 ★★★
                room.forEach(p => {
                    const pState = battle.playerStates[p.socketId];
                    const isAlive = pState && !pState.isDead; 

                    // 1. 屬性 (STR, DEX, CON, INT) -> 修改 p.state.AdditionState 并 重算上限
                    if (STAT_MAP[type] !== undefined && isAlive) { 
                        // ★ 呼叫 updatePlayerAttribute 重算數值
                        updatePlayerAttribute(p.state, pState, type, val, isPunish);
                    } 
                    // 2. 經驗 (EXP) -> 修改 p.state.AdditionEXP
                    else if (type === 'EXP' && isAlive) { 
                        if (!p.state.AdditionEXP) p.state.AdditionEXP = 0;
                        if (isPunish) p.state.AdditionEXP = Math.max(0, p.state.AdditionEXP - val); else p.state.AdditionEXP += val;
                    } 
                    // 3. 金幣 (GOLD) -> 修改 p.state.goldCollected
                    else if (type === 'GOLD' && isAlive) { 
                        if (!p.state.goldCollected) p.state.goldCollected = 0;
                        if (isPunish) p.state.goldCollected = Math.max(0, p.state.goldCollected - val); else p.state.goldCollected += val;
                    } 
                    // 4. HP -> 修改 battle (戰鬥用) + p.state (存檔用)
                    else if (type === 'HP') {
                        if (pState) {
                             if (!isPunish && pState.isDead) return;
                             const change = isPunish ? -val : val;
                             pState.hp = Math.min(pState.maxHp, Math.max(0, pState.hp + change));
                             if (pState.hp === 0) pState.isDead = true;
                             p.state.playerHp = pState.hp; 
                        }
                    } 
                    // 5. MP -> 修改 battle + p.state
                    else if (type === 'MP') {
                        if (pState) {
                            if (!isPunish && pState.isDead) return;
                            const change = isPunish ? -val : val;
                            pState.mp = Math.min(pState.maxMp, Math.max(0, pState.mp + change));
                            p.state.playerMp = pState.mp; 
                        }
                    }
                });

                // 發送訊息
                const actionText = isPunish ? '受到懲罰' : '獲得獎勵';
                const sign = isPunish ? '-' : '+';
                io.to(currentRoomId).emit('chat_message', { 
                    sender: '系統', 
                    text: `事件結束：全隊 ${actionText} ${type} ${sign}${val}`, 
                    isSystem: true 
                });

                // 清理狀態
                battle.isEventActive = false;
                battle.eventLock = null;
                battle.pendingEventResult = null;
                battle.eventConfirmedPlayers = [];

                // 關閉視窗並進入下一層
                io.to(currentRoomId).emit('close_event_window');
                
                setTimeout(() => {
                    startNextFloor(currentRoomId);
                }, 1000);
            }
        });

        // (維持相容性)
        socket.on('ignore_event', () => { 
            // 若有人強制按離開(例如單人邏輯誤觸)，視為確認
            // 實際建議前端都走 player_confirm_event
        });

        // ---------------------------------------------------------
        // 2. 玩家選擇層數獎勵 (Reward System) - ★ 關鍵修改處 ★
        // ---------------------------------------------------------
        socket.on('player_selected_reward', (data) => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            const pState = battle.playerStates[socket.id];
            
            // 取得後端記憶體中的玩家資料 (用來存永久狀態)
            const playerRoomData = rooms[currentRoomId].find(p => p.socketId === socket.id);

            const rType = data.rewardType || (data.reward ? data.reward.rewardType : null);
            const rPercent = data.rewardPercent || (data.reward ? data.reward.rewardPercent : 0);
            const rValue = data.rewardValue || (data.reward ? data.reward.rewardValue : 0);
            const targetSocketId = data.targetSocketId || null;

            if (pState && rType && playerRoomData) {
                // --- 1. 屬性獎勵 (STR, DEX, CON, INT) ---
                if (STAT_MAP[rType] !== undefined) { 
                    updatePlayerAttribute(playerRoomData.state, pState, rType, rValue, false);
                }
                // --- 2. 經驗值獎勵 (EXP) ---
                else if (rType === 'EXP') {
                    if (!playerRoomData.state.AdditionEXP) playerRoomData.state.AdditionEXP = 0;
                    playerRoomData.state.AdditionEXP += rValue;
                }
                // --- 3. 金幣獎勵 (GOLD) ---
                else if (rType === 'GOLD') {
                    if (!playerRoomData.state.goldCollected) playerRoomData.state.goldCollected = 0;
                    playerRoomData.state.goldCollected += rValue;
                }
                // --- 4. 復活 (REVIVE) ---
                else if (rType === 'REVIVE' || rType === 'revive') {
                    const deadPlayerIds = Object.keys(battle.playerStates).filter(id => battle.playerStates[id].isDead);
                    
                    if (deadPlayerIds.length > 0) {
                        // ... (選目標邏輯保持不變) ...
                        let finalTargetId = null;
                        if (targetSocketId && deadPlayerIds.includes(targetSocketId)) { 
                            finalTargetId = targetSocketId; 
                        } else { 
                            const randomIndex = Math.floor(Math.random() * deadPlayerIds.length); 
                            finalTargetId = deadPlayerIds[randomIndex]; 
                        }

                        const targetState = battle.playerStates[finalTargetId];
                        const targetRoomData = rooms[currentRoomId].find(p => p.socketId === finalTargetId);

                        if (targetState) {
                            // 執行復活
                            targetState.isDead = false; 
                            targetState.hp = Math.round(targetState.maxHp * 0.3); 
                            targetState.mp = Math.round(targetState.maxMp * 0.3);
                            
                            if (targetRoomData) {
                                targetRoomData.state.playerHp = targetState.hp;
                                targetRoomData.state.playerMp = targetState.mp;
                            }

                            // 加回存活名單
                            if (!battle.alivePlayerIds.includes(finalTargetId)) { 
                                battle.alivePlayerIds.push(finalTargetId); 
                            }

                            // 強制讓被復活者「已選擇」
                            if (!battle.rewardSelection.selectedPlayers.includes(finalTargetId)) {
                                battle.rewardSelection.selectedPlayers.push(finalTargetId);
                            }

                            // ★★★ 新增：單獨通知被復活的玩家更新 UI ★★★
                            io.to(finalTargetId).emit('player_revived', { 
                                hp: targetState.hp, 
                                mp: targetState.mp 
                            });

                            const targetName = targetRoomData ? targetRoomData.nickname : '隊友';
                            io.to(currentRoomId).emit('chat_message', { sender: '系統', text: `${targetName} 被復活了！(HP/MP 恢復 30%)`, isSystem: true });
                        }
                    } else {
                        // 沒人死，補自己 (當作喝水)
                        pState.hp += Math.round(pState.maxHp * 0.3); 
                        pState.mp += Math.round(pState.maxMp * 0.3);
                        if (pState.hp > pState.maxHp) pState.hp = pState.maxHp; 
                        if (pState.mp > pState.maxMp) pState.mp = pState.maxMp;
                        
                        playerRoomData.state.playerHp = pState.hp;
                        playerRoomData.state.playerMp = pState.mp;
                    }
                } 
                // --- 5. HP/MP 回復 ---
                else if (rType == 'HP') {
                    let heal = 0; 
                    if (rPercent > 0) {
                        heal = Math.round(pState.maxHp * (parseFloat(rPercent) / 100 || 0)); 
                    } else { 
                        heal = parseInt(rValue) || 0; 
                    }

                    pState.hp += heal; if (pState.hp > pState.maxHp) pState.hp = pState.maxHp;
                    playerRoomData.state.playerHp = pState.hp; // 同步
                }
                else if (rType == 'MP') {
                    let recover = 0; 
                    if (rPercent > 0) {
                        recover = Math.round(pState.maxMp * (parseFloat(rPercent) / 100 || 0)); 
                    } else { 
                        recover = parseInt(rValue) || 0; 
                    }

                    pState.mp += recover; if (pState.mp > pState.maxMp) pState.mp = pState.maxMp;
                    playerRoomData.state.playerMp = pState.mp; // 同步
                }
            }
            
            if (!battle.rewardSelection.selectedPlayers.includes(socket.id)) { battle.rewardSelection.selectedPlayers.push(socket.id); }
            const allSelected = battle.alivePlayerIds.every(id => battle.rewardSelection.selectedPlayers.includes(id));
            if (allSelected) { 
                startNextFloor(currentRoomId); 
            } else { 
                socket.emit('waiting_for_teammates', { current: battle.rewardSelection.selectedPlayers.length, total: battle.alivePlayerIds.length }); 
            }
        });

        socket.on('player_buy_item', ({ itemId }) => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            const pState = battle.playerStates[socket.id];
            
            // 取得該玩家的永久數據 (Inventory 在這裡)
            const playerRoomData = rooms[currentRoomId].find(p => p.socketId === socket.id);
            if (!playerRoomData) return;

            // 1. 驗證商品
            const shopItem = battle.sharedShopItems.find(i => i.id === itemId);
            if (!shopItem) return socket.emit('shop_buy_result', { success: false, msg: "商品不存在" });
            if (shopItem.currentStock <= 0) return socket.emit('shop_buy_result', { success: false, msg: "已售罄" });

            // 2. 驗證金幣 (假設金幣已同步到後端，或是允許負數由前端扣)
            // 這裡我們直接扣 p.state.goldCollected，這會變成負數增量傳回前端
            const price = shopItem.price;
            
            // 3. 執行交易
            playerRoomData.state.goldCollected -= price;
            shopItem.currentStock -= 1; // 扣除共享庫存

            const cat = shopItem.category; // 'STAT_BOOST', 'POTION', etc.
            const type = shopItem.effectType; // 'STR', 'HP'...
            const val = shopItem.effectValue;

            let msg = `購買了 ${shopItem.name}`;

            // ★ 分流處理：強化 vs 背包
            if (cat === 'STAT_BOOST') {
                // A. 強化能力：直接作用
                if (STAT_MAP[type] !== undefined) {
                    updatePlayerAttribute(playerRoomData.state, pState, type, val, false);
                    msg += " (能力與上限提升)";
                }
            } else {
                // B. 其他 (藥水/技能石)：存入背包
                if (!playerRoomData.state.Inventory) playerRoomData.state.Inventory = [];
                const inventory = playerRoomData.state.Inventory;

                // ★ 堆疊邏輯：檢查是否有相同 ID 的物品
                const existingItem = inventory.find(i => i.id === shopItem.id);

                if (existingItem) {
                    // 如果有，數量 +1
                    existingItem.count = (existingItem.count || 1) + 1;
                } else {
                    // 如果沒有，新增物件 (只存需要的欄位，過濾掉 currentStock)
                    inventory.push({
                        id: shopItem.id,
                        name: shopItem.name,
                        description: shopItem.description,
                        image: shopItem.image,
                        category: shopItem.category,
                        requiredClass: shopItem.requiredClass,
                        effectType: shopItem.effectType,
                        effectValue: shopItem.effectValue,
                        isPercentage: shopItem.isPercentage,
                        count: 1
                    });
                }
                msg += " (已放入背包)";
            }

            // 4. 廣播更新：讓所有人的商店介面庫存減少
            io.to(currentRoomId).emit('shop_update', { items: battle.sharedShopItems });

            // 5. 回傳給買家
            socket.emit('shop_buy_result', { 
                success: true, 
                msg: msg,
                // 回傳背包數據，讓前端更新
                newInventory: playerRoomData.state.Inventory,
                currentGold: playerRoomData.state.goldCollected
            });
        });


        // ---------------------------------------------------------
        // ★ 新增：離開商店 (等待所有人)
        // ---------------------------------------------------------
        socket.on('player_leave_shop', () => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];
            
            
            if (!battle.shopConfirmedPlayers.includes(socket.id)) {
                battle.shopConfirmedPlayers.push(socket.id);
            }

            // 檢查：是否所有「存活」玩家都已離開？
            const aliveCount = Object.keys(battle.playerStates).length;
            
            if (battle.shopConfirmedPlayers.length >= aliveCount) {
                // 全部完成，關閉商店
                battle.isShopActive = false;
                battle.shopConfirmedPlayers = [];
                
                io.to(currentRoomId).emit('close_shop_window');
                
                setTimeout(() => {
                    startNextFloor(currentRoomId);
                }, 1000);
            }
        });

        // 離開戰鬥 (不解散房間，只是回到大廳)
        socket.on('leave_battle', () => {
            if (currentRoomId && battles[currentRoomId]) {
                // 如果戰鬥中有人跑了，視為死亡
                const battle = battles[currentRoomId];
                battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== socket.id);
                // 這裡簡化處理，不觸發全滅檢查，讓他自己去斷線邏輯
            }
        });

        socket.on('disconnect', () => { 
            console.log(`[Disconnect] Socket ${socket.id} 斷線，啟動保護機制`);
            if (currentRoomId && rooms[currentRoomId]) {
                disconnectTimers[socket.id] = setTimeout(() => {
                    console.log(`[Cleanup] 玩家 ${socket.id} 逾時未歸，執行清理`);
                    if (rooms[currentRoomId]) {
                        
                        // 1. 直接移除該玩家
                        rooms[currentRoomId] = rooms[currentRoomId].filter(p => p.socketId !== socket.id);
                        
                        if (rooms[currentRoomId].length === 0) { 
                            delete battles[currentRoomId]; 
                            delete rooms[currentRoomId]; 
                            // 清除該房間的計時器
                            if (requestTimers[currentRoomId]) {
                                clearTimeout(requestTimers[currentRoomId]);
                                delete requestTimers[currentRoomId];
                            }
                        } 
                        else { 
                            // ★★★ 2. 檢查隊伍中是否還有隊長 ★★★
                            const hasLeader = rooms[currentRoomId].some(p => p.isLeader);

                            // ★★★ 3. 如果沒有隊長 (代表剛剛離開的是隊長，或是異常狀態)，指派第一位繼任 ★★★
                            if (!hasLeader) {
                                rooms[currentRoomId][0].isLeader = true;
                                const newLeaderName = rooms[currentRoomId][0].nickname;
                                
                                io.to(currentRoomId).emit('chat_message', { 
                                    sender: '系統', 
                                    text: `隊長已離開，由 ${newLeaderName} 繼任為新隊長。`, 
                                    isSystem: true 
                                });
                            }

                            io.to(currentRoomId).emit('team_update', rooms[currentRoomId]); 
                            io.to(currentRoomId).emit('chat_message', { sender: '系統', text: `一名隊友斷線逾時，已離開隊伍。`, isSystem: true }); 
                        }
                    }
                    delete disconnectTimers[socket.id];
                }, 0);
                io.to(currentRoomId).emit('chat_message', { sender: '系統', text: `一名隊友斷線`, isSystem: true });
            }
        });


        async function startNextFloor(roomId) {
            const battle = battles[roomId];
            if (!battle) return;

            const room = rooms[roomId];
            if (!room) return;

            battle.floor++;
            battle.processingTurn = false;
            battle.pendingActions = [];
            battle.rewardSelection = { isActive: false, selectedPlayers: [] };

            try {
                const allMonsters = await getEnemies();
                const floor = battle.floor;
                let selectedMonster = null;

                // 2% 貪慾寶箱怪
                if (Math.random() * 100 < 2) {
                    selectedMonster = allMonsters.find(m => m.name === '貪慾寶箱怪');
                }

                if (!selectedMonster) {
                    let targetType = 'NORMAL';
                    const roll = Math.random() * 100;

                    if (floor % 10 === 0) {
                        targetType = 'BOSS';
                    } else if (roll < 3) {
                        targetType = 'BOSS';
                    } else if (roll < 23) {
                        targetType = 'ELITE';
                    }

                    let validMonsters = allMonsters.filter(m =>
                        floor >= m.minLayer &&
                        floor <= m.maxLayer &&
                        m.type === targetType
                    );

                    if (validMonsters.length === 0) {
                        validMonsters = allMonsters.filter(m =>
                            floor >= m.minLayer &&
                            floor <= m.maxLayer
                        );
                    }

                    if (validMonsters.length > 0) {
                        selectedMonster = validMonsters[Math.floor(Math.random() * validMonsters.length)];
                    } else {
                        console.error(`第 ${floor} 層沒有符合條件的怪物`);
                        selectedMonster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
                    }
                }

                const statMultiplier = Math.pow(1.05, floor - 1);
                const playerMultiplier = 1 + (0.35 * (room.length - 1));

                battle.enemy = {
                    id: selectedMonster.id,
                    name: selectedMonster.name,
                    image: selectedMonster.image,
                    hp: Math.round(selectedMonster.HP * statMultiplier * playerMultiplier),
                    maxHp: Math.round(selectedMonster.HP * statMultiplier * playerMultiplier),
                    atk: Math.round(selectedMonster.ATK * statMultiplier),
                    def: Math.round(selectedMonster.DEF * statMultiplier),
                    mdef: Math.round(selectedMonster.MDEF * statMultiplier),
                    exp: Math.round(selectedMonster.EXP * statMultiplier),
                    gold: Math.round(selectedMonster.Gold * Math.pow(1.001, floor - 1))
                };

                battle.enemyHp = battle.enemy.hp;
                battle.enemyMaxHp = battle.enemy.maxHp;

            } catch (err) {
                console.error("多人生成怪物失敗:", err);
            }

            battle.alivePlayerIds = [];

            const updatedPlayersInfo = room.map(p => {
                const combatState = battle.playerStates[p.socketId];

                if (combatState) {
                    if (combatState.hp > 0) combatState.isDead = false;
                    if (!combatState.isDead) battle.alivePlayerIds.push(p.socketId);

                    p.state.playerHp = combatState.hp;
                    p.state.playerMp = combatState.mp;
                    p.state.playerMaxHp = combatState.maxHp;
                    p.state.playerMaxMp = combatState.maxMp;
                }

                const goldDelta = p.state.goldCollected || 0;
                const expDelta = p.state.AdditionEXP || 0;

                p.state.goldCollected = 0;
                p.state.AdditionEXP = 0;

                return {
                    socketId: p.socketId,
                    nickname: p.nickname,
                    role: p.state.role,
                    maxHp: combatState ? combatState.maxHp : 100,
                    maxMp: combatState ? combatState.maxMp : 100,
                    hp: combatState ? combatState.hp : (p.state.playerHp || 100),
                    mp: combatState ? combatState.mp : (p.state.playerMp || 100),
                    AdditionState: p.state.AdditionState || [0,0,0,0],
                    Status: p.state.Status || [],
                    Inventory: p.state.Inventory || [],
                    goldCollected: goldDelta,
                    AdditionEXP: expDelta,
                    avatar: p.state.avatar
                };
            });

            io.to(roomId).emit('multiplayer_battle_start', {
                enemy: battle.enemy,
                enemyHp: battle.enemyHp,
                enemyMaxHp: battle.enemyMaxHp,
                floor: battle.floor,
                players: updatedPlayersInfo
            });
        }

        function updatePlayerAttribute(permState, combatState, type, val, isPunish = false) {
            // 0. 更新屬性值 (修改永久狀態)
            if (STAT_MAP[type] !== undefined) {
                if (!permState.AdditionState) permState.AdditionState = [0, 0, 0, 0];
                const idx = STAT_MAP[type];
                if (isPunish) {
                    permState.AdditionState[idx] = Math.max(0, permState.AdditionState[idx] - val);
                } else {
                    permState.AdditionState[idx] += val;
                }
            }

            recalculatePlayerStatus(permState, combatState)
        }

        function recalculatePlayerStatus(permState, combatState) {
            // 2. 取得累計的屬性加成
            const [addStr, addDex, addCon, addInt] = permState.AdditionState || [0, 0, 0, 0];
            const attr = permState.AdditionAttribute || {}; 

            // 3. 計算 "舊的" 上限 (為了算差值)
            const oldMaxHp = permState.playerMaxHp;
            const oldMaxMp = permState.playerMaxMp;

            // 4. 計算 "新的" 上限
            // 公式：基礎值 + (屬性 * 倍率)
            const bonusHp = (addCon * HP_PER_CON) + (addStr * HP_PER_STR) + (attr.hpBonus || 0);
            const bonusMp = (addInt * MP_PER_INT) + (attr.mpBonus || 0);

            const newMaxHp = Math.floor(permState.playerBaseMaxHp + bonusHp);
            const newMaxMp = Math.floor(permState.playerBaseMaxMp + bonusMp);

            // 5. 計算差值 (Diff)
            const hpDiff = newMaxHp - oldMaxHp;
            const mpDiff = newMaxMp - oldMaxMp;

            // 6. 決定 "當前數值" 基準
            // ★ 關鍵：如果有戰鬥狀態(combatState)，以戰鬥中的殘血為準；否則以永久狀態為準
            let currentHp = combatState ? combatState.hp : permState.playerHp;
            let currentMp = combatState ? combatState.mp : permState.playerMp;

            // 7. 應用差值 (只有活著的人才補差額，死人只加 Max)
            let newHp = currentHp;
            let newMp = currentMp;

            if (currentHp > 0) {
                newHp = currentHp + hpDiff;
            }
            // MP 即使死掉通常也可以加減，或者你也想限制
            newMp = currentMp + mpDiff;

            // 邊界檢查
            if (newHp < 0) newHp = 0;
            if (newHp > newMaxHp) newHp = newMaxHp; // 不能超過新上限
            
            if (newMp < 0) newMp = 0;
            if (newMp > newMaxMp) newMp = newMaxMp;

            // 8. 寫回永久狀態 (同步)
            permState.playerMaxHp = newMaxHp;
            permState.playerMaxMp = newMaxMp;
            permState.playerHp = newHp;
            permState.playerMp = newMp;

            // 9. 同步回戰鬥狀態
            if (combatState) {
                combatState.maxHp = newMaxHp;
                combatState.maxMp = newMaxMp;
                combatState.hp = newHp;
                combatState.mp = newMp;
            }
        }

        async function processTurn(roomId) {
            const battle = battles[roomId];
            const room = rooms[roomId]

            if (!battle || !room) return;

            battle.processingTurn = true; // 上鎖

            // 1. 計算總傷害
            let totalDamage = 0;
            battle.pendingActions.forEach(a => {
                if (a.damage) totalDamage += a.damage;
            });
            
            battle.enemyHp -= totalDamage; 
            if (battle.enemyHp < 0) battle.enemyHp = 0;

            const isEnemyDead = battle.enemyHp <= 0;
            
            let targetSocketId = null; 
            let damageTaken = 0; 
            let damageReduce = 0;
            let playerDefense = 0;
            let dodgeRate = 0;
            let deadPlayerId = null;

            // 2. 怪物反擊
            if (!isEnemyDead && battle.alivePlayerIds.length > 0) {
                const targetIndex = Math.floor(Math.random() * battle.alivePlayerIds.length); 
                targetSocketId = battle.alivePlayerIds[targetIndex];
                const target = room.find(p => p.socketId == targetSocketId)

                damageTaken = 5 + (2.5 * battle.alivePlayerIds.length * Math.pow(1.025, battle.floor)); 
                playerDefense = Math.round(target.state.AdditionState[0] / 5 + target.state.AdditionState[2] / 2)
                damageTaken -= playerDefense

                // 減傷
                damageReduce = target.state.AdditionAttribute.dmgReduce
                damageReduce = Math.max(0.2, 1 - (damageReduce / 100))
                damageTaken = Math.max(Math.round(damageTaken * damageReduce), 1)

                // 閃避
                const SystemDodge = Math.random() * 100
                dodgeRate = Math.min(target.state.AdditionAttribute.dodge + target.state.AdditionState[1] * 0.5 + target.state.AdditionState[3] * 0.2, 90)

                if (dodgeRate > SystemDodge) {
                    damageTaken = 0
                }
                
                // 簡單計算防禦 (這裡先不讀取 action，直接扣)
                if (battle.playerStates[targetSocketId]) {
                    battle.playerStates[targetSocketId].hp -= damageTaken;
                    if (battle.playerStates[targetSocketId].hp <= 0) { 
                        battle.playerStates[targetSocketId].hp = 0; 
                        battle.playerStates[targetSocketId].isDead = true; 
                        deadPlayerId = targetSocketId; 
                        battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== targetSocketId); 
                    }
                }

                room.forEach(p => {
                const pState = battle.playerStates[p.socketId];
                // 確保玩家還在戰鬥中且活著
                if (pState && !pState.isDead) {
                    const stats = p.state.AdditionAttribute || {};
                    const regen = stats.regen || 0;
                    const manaReflow = stats.manaReflow || 0; // 確保前端傳來的是這個變數名 (注意大小寫)

                    // 再生 (HP Regen)
                    if (regen > 0 && pState.hp < pState.maxHp) {
                        const heal = Math.round(pState.maxHp * (regen / 100));
                        pState.hp = Math.min(pState.maxHp, pState.hp + heal);
                    }

                    // 回魔 (Mana Reflow)
                    if (manaReflow > 0 && pState.mp < pState.maxMp) {
                        const mana = Math.round(pState.maxMp * (manaReflow / 100));
                        pState.mp = Math.min(pState.maxMp, pState.mp + mana);
                    }


                    if (p.state.Status && p.state.Status.length > 0) {
                        const pState = battle.playerStates[p.socketId];

                        for (let i = p.state.Status.length - 1; i >= 0; i--) {
                            const buff = p.state.Status[i];

                            if (buff.duration != null && buff.duration > 0) {
                                buff.duration--;

                                if (buff.duration <= 0) {

                                    if (buff.valueType === 'Add') {
                                        const attrKey = additionMap[buff.statKey];

                                        if (attrKey) {
                                            p.state.AdditionAttribute[attrKey] -= buff.value;
                                        } else {
                                            const statKey = defaultStat.indexOf(buff.statKey);

                                            if (statKey !== -1) {
                                                p.state.AdditionState[statKey] -= buff.value;
                                            }
                                        }
                                    }

                                    console.log("移除BUFF:", buff);

                                    recalculatePlayerStatus(
                                        p.state,
                                        pState
                                    );

                                    p.state.Status.splice(i, 1);
                                }
                            }
                        }
                    }
                    
                    // 同步回永久狀態 (選用，視設計而定，通常戰鬥結束才同步，但這裡同步較保險)
                    p.state.playerHp = pState.hp;
                    p.state.playerMp = pState.mp;
                }
            });
            }

            const isAllDead = battle.alivePlayerIds.length === 0;
            
            // 3. 準備回傳所有人的最新狀態
            const playersStatusUpdate = {}; 
            const PlayerStatus = {};

            Object.keys(battle.playerStates).forEach(sid => { 
                playersStatusUpdate[sid] = { 
                    hp: battle.playerStates[sid].hp, 
                    mp: battle.playerStates[sid].mp,
                    maxHp: battle.playerStates[sid].maxHp, 
                    maxMp: battle.playerStates[sid].maxMp,
                    isDead: battle.playerStates[sid].isDead,
                }; 

                room.forEach(p => {
                    if (p.socketId == sid) {
                        PlayerStatus[sid] = p.state
                    }
                })
            });

            let targetNickname = "未知玩家";

            if (targetSocketId && rooms[roomId]) {
                const targetPlayer = rooms[roomId].find(
                    p => p.socketId === targetSocketId
                );

                if (targetPlayer) {
                    targetNickname = targetPlayer.nickname;
                }
            }

            io.to(roomId).emit('turn_result', { 
                damageDealt: totalDamage, 
                targetSocketId, 
                targetNickname,
                damageTaken, 
                isEnemyDead, 
                deadPlayerId, 
                isAllDead, 
                playersStatus: playersStatusUpdate, 
                playerBuff: PlayerStatus
            });

            // 4. 清理
            battle.pendingActions = [];
            
            if (!isAllDead && !isEnemyDead) { 
                battle.processingTurn = false; // 解鎖
            }

            // 5. 戰鬥結束處理
            if (isEnemyDead) {
                // 伺服器端決定是否給獎勵 (15% 機率)
                    const eventRate = Math.floor(Math.random() * 100);
                    const rewardRate = Math.floor(Math.random() * 100);
                    const shopRate = Math.floor(Math.random() * 100);
                    // const rewardRate = 0 
                    // const eventRate = 100
                    // const shopRate = 100

                    if (shopRate < 15) {
                        try {
                            const pool = (await getItems()).map(item => item.toJSON());

                            const itemCount = 6;
                            const selectedItems = [];

                            for (let i = 0; i < itemCount; i++) {
                                if (pool.length === 0) break;

                                const idx = Math.floor(Math.random() * pool.length);
                                const itemTemplate = pool.splice(idx, 1)[0];

                                selectedItems.push({
                                    ...itemTemplate,
                                    currentStock: Math.ceil(Math.random() * (itemTemplate.maxStock || 3))
                                });
                            }

                            battle.sharedShopItems = selectedItems;
                            battle.isShopActive = true;
                            battle.shopConfirmedPlayers = [];

                            io.to(currentRoomId).emit('trigger_shop', { items: selectedItems });
                            return;

                        } catch (e) {
                            console.error("商店生成失敗:", e);
                        }
                    }

                    else {
                        if (eventRate < 15) {
                            // --- 觸發事件流程 ---
                            const allEvents = await getEvents();
                            const eventId = Math.floor(Math.random() * allEvents.length);
                            const event = allEvents[eventId];

                            if (!event) {
                                socket.emit('player_confirm_event');
                            } else {
                                const rawEvent = event.toJSON();
                                const floor = battle.floor;
                                const scaledEvent = {
                                    ...rawEvent,
                                    requirementValue: Math.floor(
                                        rawEvent.requirementValue * (1 + floor * 0.01)
                                    ),
                                    rewardValue: ['GOLD', 'EXP', 'HP', 'MP', 'STR', 'DEX', 'CON', 'INT'].includes(rawEvent.rewardType)
                                        ? Math.floor(rawEvent.rewardValue * (1 + floor * 0.05))
                                        : rawEvent.rewardValue,
                                    punishValue: ['GOLD', 'HP', 'MP'].includes(rawEvent.punishType)
                                        ? Math.floor(rawEvent.punishValue * (1 + floor * 0.01))
                                        : rawEvent.punishValue
                                };

                                battle.currentEventData = scaledEvent;
                                io.to(currentRoomId).emit('trigger_event', scaledEvent);
                            }


                            // 初始化事件狀態
                            battle.isEventActive = true;
                            battle.eventLock = null; // 誰正在嘗試
                            battle.eventConfirmedPlayers = []; // 誰按了確認/離開
                            battle.pendingEventResult = null; // 暫存結果
                            battle.currentEventData = event; // 存起來備用

                            // ★ return，不執行獎勵或下一層，等待事件交互
                            return;
                        }
                        else {
                            // 初始化獎勵選擇狀態
                            battle.rewardSelection = {
                                isActive: false,
                                selectedPlayers: [] // 紀錄誰已經選好了
                            };

                            if (rewardRate < 15) {
                                setTimeout(() => {
                                    io.to(currentRoomId).emit('multiplayer_show_rewards')
                                }, 100); 

                            } else {
                                // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                                setTimeout(() => {
                                    startNextFloor(currentRoomId);
                                }, 500); 
                            } 
                        }
                    }
                }
            
            if (isAllDead) {
                  battle.isEnding = true;
                  setTimeout(() => { 
                      io.to(roomId).emit('game_over_all', { floor: battle.floor, msg: "所有玩家都已死亡，遊戲結束。" }); 
                      delete battles[roomId]; 
                      if(rooms[roomId]) rooms[roomId].forEach(p => p.isReady = false); 
                  }, 1000);
            }
        }
    });

    return io;
}
