import { Server } from 'socket.io';

const rooms = {}; 
const battles = {}; 
const STAT_MAP = { 'STR': 0, 'DEX': 1, 'CON': 2, 'INT': 3 };

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

        socket.on('respond_ready', (payload) => {
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
                
                // 初始化戰鬥
                const floor = 1;
                const enemyMaxHp = 100 + (10 * ((floor - 1) * room.length)); 
                const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

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
                    monsterType: randomMonster,
                    pendingActions: [],
                    playerStates: playerStates,
                    alivePlayerIds: room.map(p => p.socketId),
                    isEnding: false // 【新增】防止重複結算的旗標
                    
                };

                io.to(currentRoomId).emit('multiplayer_battle_start', {
                    enemyHp: enemyMaxHp,
                    enemyMaxHp: enemyMaxHp,
                    floor: floor,
                    monsterType: randomMonster,
                    players: playersPublicInfo // ★ 傳送玩家列表
                });
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
            let critRate = (action.AdditionState.DEX * 0.25 + action.AdditionState.INT * 0.15)
            let CritMultiply = 1;

            if (system_critRate < critRate)
            {
                CritMultiply = 2;
            }

            let damageMultiply = 0.8 + Math.random() * 0.4
            damage = Math.round(damage * damageMultiply * CritMultiply);

            const hasActed = battle.pendingActions.find(a => a.socketId === socket.id);
            if (!hasActed) {
                battle.pendingActions.push({ socketId: socket.id, damage: damage });
            }

            // 檢查是否「所有存活玩家」都已行動
            if (battle.pendingActions.length >= battle.alivePlayerIds.length) {
                
                battle.processingTurn = true; // ★ 上鎖：開始結算，不接受新動作

                // --- 回合結算 ---
                let totalDamage = 0;
                battle.pendingActions.forEach(a => totalDamage += a.damage);
                
                battle.enemyHp -= totalDamage;
                if (battle.enemyHp < 0) battle.enemyHp = 0;

                const isEnemyDead = battle.enemyHp <= 0;
                
                let targetSocketId = null;
                let damageTaken = 0;
                let playerDefense = 0;
                let deadPlayerId = null;

                // 怪物反擊
                if (!isEnemyDead && battle.alivePlayerIds.length > 0) {
                    const targetIndex = Math.floor(Math.random() * battle.alivePlayerIds.length);
                    targetSocketId = battle.alivePlayerIds[targetIndex];
                    damageTaken = Math.round((5 + (2.5 * (battle.alivePlayerIds.length - 1))) * Math.pow(1.05,battle.floor)); 
                    playerDefense = Math.round(action.AdditionState[0] / 7 + action.AdditionState[2] / 3);

                    damageTaken = Math.max(1, damageTaken - playerDefense);

                    if (battle.playerStates[targetSocketId]) {
                        battle.playerStates[targetSocketId].hp -= damageTaken;
                        if (battle.playerStates[targetSocketId].hp <= 0) {
                            battle.playerStates[targetSocketId].hp = 0;
                            battle.playerStates[targetSocketId].isDead = true;
                            deadPlayerId = targetSocketId;
                            
                            // 移除存活名單
                            battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== targetSocketId);
                        }
                    }
                }

                // 檢查全滅
                const isAllDead = battle.alivePlayerIds.length === 0;

                // 準備回傳所有人的最新狀態
                const playersStatusUpdate = {};
                Object.keys(battle.playerStates).forEach(sid => {
                    playersStatusUpdate[sid] = {
                        hp: battle.playerStates[sid].hp,
                        isDead: battle.playerStates[sid].isDead
                    };
                });

                io.to(currentRoomId).emit('turn_result', {
                    damageDealt: totalDamage,
                    targetSocketId: targetSocketId,
                    damageTaken: damageTaken,
                    isEnemyDead: isEnemyDead,
                    deadPlayerId: deadPlayerId,
                    isAllDead: isAllDead,
                    playersStatus: playersStatusUpdate // 傳送最新血量表
                });

                battle.pendingActions = [];
                
                if (!isAllDead && !isEnemyDead) {
                    battle.processingTurn = false; // 如果還沒結束，解鎖
                }

                // --- 特殊狀態處理 ---
                
                if (isEnemyDead) {
                    // 伺服器端決定是否給獎勵 (15% 機率)
                    const eventRate = Math.floor(Math.random() * 100);
                    const rewardRate = Math.floor(Math.random() * 100);
                    const shopRate = Math.floor(Math.random() * 100);
                    // const shopRate = 0 

                    if (shopRate < 15) {
                        try {
                            // 呼叫 API 獲取商品
                            const response = await fetch('http://localhost:3000/holylegend/system/items');
                            const result = await response.json();
                            
                            if (result.success && result.data && result.data.length > 0) {
                                const pool = result.data;
                                
                                const itemCount = 6;
                                
                                const selectedItems = [];
                                // 隨機抽取
                                for (let i = 0; i < itemCount; i++) {
                                    if (pool.length === 0) break;
                                    const idx = Math.floor(Math.random() * pool.length);
                                    const itemTemplate = pool[idx];
                                    
                                    // 設定隨機庫存
                                    const stock = Math.ceil(Math.random() * (itemTemplate.maxStock || 3));
                                    
                                    selectedItems.push({
                                        ...itemTemplate,
                                        currentStock: stock
                                    });
                                    // 這裡選擇不移除 pool，允許重複商品出現
                                }

                                // ★ 存入共享商店狀態
                                battle.sharedShopItems = selectedItems;
                                battle.isShopActive = true;
                                battle.shopConfirmedPlayers = []; // 紀錄誰按了離開

                                // 廣播給所有人
                                io.to(currentRoomId).emit('trigger_shop', { items: selectedItems });
                                return;
                            }
                        } catch (e) {
                            console.error("商店生成失敗:", e);
                        }
                    }

                    else {
                        if (eventRate < 15) {
                            // --- 觸發事件流程 ---
                            const response = await fetch('http://localhost:3000/holylegend/system/events');
                            const result = await response.json();

                            const allEvents = result.data; // 資料庫裡的所有獎勵
                            const eventId = Math.floor(Math.random() * allEvents.length)
                            const event = allEvents[eventId]

                            if (!event) {
                                socket.emit('player_confirm_event');
                            }

                            else {
                                io.to(currentRoomId).emit('trigger_event', event);
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
                            
                            // const rewardRate = 0;
                        
                            // 初始化獎勵選擇狀態
                            battle.rewardSelection = {
                                isActive: false,
                                selectedPlayers: [] // 紀錄誰已經選好了
                            };

                            if (rewardRate <= 14) {
                                // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                                setTimeout(() => {
                                    io.to(currentRoomId).emit('multiplayer_show_rewards')
                                }, 1000); 

                            } else {
                                // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                                setTimeout(() => {
                                    startNextFloor(currentRoomId);
                                }, 2000); 
                            } 
                        }
                    }
                }
                
                if (isAllDead) {
                     battle.isEnding = true;
                     setTimeout(() => {
                         io.to(currentRoomId).emit('game_over_all', { floor: battle.floor });
                         delete battles[currentRoomId];
                         const room = rooms[currentRoomId];
                         if(room) room.forEach(p => p.isReady = false);
                     }, 1000);
                }
            }
        });

        socket.on('player_use_item', ({ itemId, targetSocketId }) => {
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
                    if (targetState.hp >= targetState.maxHp) return socket.emit('item_use_result', { success: false, msg: "目標生命值已滿" });
                    
                    const heal = item.isPercentage ? Math.round(targetState.maxHp * (item.effectValue/100)) : item.effectValue;
                    targetState.hp = Math.min(targetState.maxHp, targetState.hp + heal);
                    if (targetRoomData) targetRoomData.state.playerHp = targetState.hp; // 同步
                    used = true;
                }
                else if (item.effectType === 'MP') {
                    if (targetState.mp >= targetState.maxMp) return socket.emit('item_use_result', { success: false, msg: "目標魔力值已滿" });

                    const heal = item.isPercentage ? Math.round(targetState.maxMp * (item.effectValue/100)) : item.effectValue;
                    targetState.mp = Math.min(targetState.maxMp, targetState.mp + heal);
                    if (targetRoomData) targetRoomData.state.playerMp = targetState.mp; // 同步
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
                    processTurn(currentRoomId);
                }
            } else {
                socket.emit('item_use_result', { success: false, msg: "無法使用此道具" });
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
                    // 1. 屬性 (STR, DEX, CON, INT) -> 修改 p.state.AdditionState
                    if (STAT_MAP[type] !== undefined) {
                        if (!p.state.AdditionState) p.state.AdditionState = [0,0,0,0];
                        
                        if (isPunish) {
                            p.state.AdditionState[STAT_MAP[type]] -= val;
                            // 防止屬性變負數
                            if (p.state.AdditionState[STAT_MAP[type]] < 0) p.state.AdditionState[STAT_MAP[type]] = 0;
                        } else {
                            p.state.AdditionState[STAT_MAP[type]] += val;
                        }
                    } 
                    // 2. 經驗 (EXP) -> 修改 p.state.AdditionEXP
                    else if (type === 'EXP') {
                        if (!p.state.AdditionEXP) p.state.AdditionEXP = 0;
                        if (isPunish) p.state.AdditionEXP = Math.max(0, p.state.AdditionEXP - val);
                        else p.state.AdditionEXP += val;
                    }
                    // 3. 金幣 (GOLD) -> 修改 p.state.goldCollected
                    else if (type === 'GOLD') {
                        // 注意：這會假設 Server 端有正確的金幣數據。
                        // 如果前端打怪金幣沒即時同步給 Server，這裡可能會導致金幣覆蓋問題。
                        // 但為了讓事件金幣生效，我們必須更新它。
                        if (!p.state.goldCollected) p.state.goldCollected = 0;
                        if (isPunish) p.state.goldCollected = Math.max(0, p.state.goldCollected - val);
                        else p.state.goldCollected += val;
                    }
                    // 4. HP -> 修改 battle (戰鬥用) + p.state (存檔用)
                    else if (type === 'HP') {
                        const pState = battle.playerStates[p.socketId];
                        // ★ 修改：只有活著的人才受影響
                        if (pState && !pState.isDead) {
                            const change = isPunish ? -val : val;
                            pState.hp = Math.min(pState.maxHp, Math.max(0, pState.hp + change));
                            // 如果扣到死
                            if (pState.hp === 0) pState.isDead = true;
                            p.state.playerHp = pState.hp; // 同步
                        }
                    } 
                    // E. MP
                    else if (type === 'MP') {
                        const pState = battle.playerStates[p.socketId];
                        // ★ 修改：只有活著的人才受影響
                        if (pState && !pState.isDead) {
                            const change = isPunish ? -val : val;
                            pState.mp = Math.min(pState.maxMp, Math.max(0, pState.mp + change));
                            p.state.playerMp = pState.mp; // 同步
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
                    playerRoomData.state.AdditionState[STAT_MAP[rType]] += rValue;
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
                            
                            // 同步回 rooms (確保 startNextFloor 讀到正確數值)
                            if (targetRoomData) {
                                targetRoomData.state.playerHp = targetState.hp;
                                targetRoomData.state.playerMp = targetState.mp;
                            }

                            // 加回存活名單
                            if (!battle.alivePlayerIds.includes(finalTargetId)) { 
                                battle.alivePlayerIds.push(finalTargetId); 
                            }

                            // ★★★ 關鍵修正：強制讓被復活者「已選擇」 ★★★
                            // 因為被復活的人沒有跳出獎勵視窗，如果不加這行，系統會一直等他選獎勵，導致卡住
                            if (!battle.rewardSelection.selectedPlayers.includes(finalTargetId)) {
                                battle.rewardSelection.selectedPlayers.push(finalTargetId);
                            }

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
            
            // ... (後面的選人檢查與 startNextFloor 觸發保持不變) ...
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
                    if (!playerRoomData.state.AdditionState) playerRoomData.state.AdditionState = [0,0,0,0];
                    playerRoomData.state.AdditionState[STAT_MAP[type]] += val;
                    msg += " (能力已提升)";
                }
            } else {
                // B. 其他 (藥水/技能石)：存入背包
                if (!playerRoomData.state.Inventory) playerRoomData.state.Inventory = [];
                const inventory = playerRoomData.state.Inventory;

                console.log(inventory)

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
            const aliveCount = battle.alivePlayerIds.length;
            
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

        socket.on('disconnect', () => { handleDisconnect(); });

        function handleDisconnect() {
            if (currentRoomId && rooms[currentRoomId]) {
                rooms[currentRoomId] = rooms[currentRoomId].filter(p => p.socketId !== socket.id);
                
                if (rooms[currentRoomId].length === 0) {
                    delete battles[currentRoomId];
                    delete rooms[currentRoomId];
                } else {
                    io.to(currentRoomId).emit('team_update', rooms[currentRoomId]);
                }
            }
        }


        function startNextFloor(roomId) {
            const battle = battles[roomId];
            if (!battle) return;
            const room = rooms[roomId]; if (!room) return;

            battle.floor++;
            battle.enemyMaxHp = 100 + 10 * (battle.floor * room.length);
            battle.enemyHp = battle.enemyMaxHp;
            battle.processingTurn = false;
            battle.pendingActions = [];
            battle.rewardSelection = { isActive: false, selectedPlayers: [] };

            const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
            const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

            // ★ 步驟 1: 強制重建 alivePlayerIds (校正存活名單)
            // 只要血量 > 0，就算活著，防止之前的邏輯有漏洞
            battle.alivePlayerIds = [];

            // ★ 步驟 2: 準備發送給前端的數據
            const updatedPlayersInfo = room.map(p => {
                const combatState = battle.playerStates[p.socketId];

                // 再次同步，確保無誤
                if (combatState) { 
                    // ★ 雙重保險：如果 HP > 0，強制 isDead = false
                    if (combatState.hp > 0) combatState.isDead = false;
                    
                    // 如果還活著，加入名單
                    if (!combatState.isDead) {
                        battle.alivePlayerIds.push(p.socketId);
                    }

                    p.state.playerHp = combatState.hp; 
                    p.state.playerMp = combatState.mp; 
                }

                // 取出增量
                const goldDelta = p.state.goldCollected || 0;
                const expDelta = p.state.AdditionEXP || 0;

                // 重置增量
                p.state.goldCollected = 0;
                p.state.AdditionEXP = 0;

                return {
                    socketId: p.socketId,
                    nickname: p.nickname,
                    role: p.state.role,
                    
                    // 戰鬥數值：優先使用 combatState
                    maxHp: combatState ? combatState.maxHp : 100,
                    maxMp: combatState ? combatState.maxMp : 100,
                    
                    // ★ 這裡很重要：如果 combatState 存在，一定要用它的 hp
                    // 如果 combatState.hp 是 0，那前端就會顯示 0 (死掉)
                    // 如果剛剛復活了，這裡應該要是 maxHp * 0.3
                    hp: combatState ? combatState.hp : (p.state.playerHp || 100), 
                    mp: combatState ? combatState.mp : (p.state.playerMp || 100),
                    
                    AdditionState: p.state.AdditionState || [0, 0, 0, 0],
                    Inventory: p.state.Inventory || [],
                    goldCollected: goldDelta, 
                    AdditionEXP: expDelta,
                    avatar: p.state.avatar
                };
            });

            // 如果有人復活，alivePlayerIds 應該已經更新了
            // 廣播給前端
            io.to(roomId).emit('multiplayer_battle_start', {
                enemyHp: battle.enemyMaxHp, 
                enemyMaxHp: battle.enemyMaxHp, 
                floor: battle.floor, 
                monsterType: randomMonster, 
                players: updatedPlayersInfo
            });
        }

        async function processTurn(roomId) {
            const battle = battles[roomId];
            if (!battle) return;

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
            let deadPlayerId = null;

            // 2. 怪物反擊
            if (!isEnemyDead && battle.alivePlayerIds.length > 0) {
                const targetIndex = Math.floor(Math.random() * battle.alivePlayerIds.length); 
                targetSocketId = battle.alivePlayerIds[targetIndex];
                damageTaken = Math.round((5 + (2.5 * (battle.alivePlayerIds.length - 1))) * Math.pow(1.05, battle.floor)); 
                
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
            }

            const isAllDead = battle.alivePlayerIds.length === 0;
            
            // 3. 準備回傳所有人的最新狀態
            const playersStatusUpdate = {}; 
            Object.keys(battle.playerStates).forEach(sid => { 
                playersStatusUpdate[sid] = { 
                    hp: battle.playerStates[sid].hp, 
                    isDead: battle.playerStates[sid].isDead 
                }; 
            });

            io.to(roomId).emit('turn_result', { 
                damageDealt: totalDamage, targetSocketId, damageTaken, isEnemyDead, 
                deadPlayerId, isAllDead, playersStatus: playersStatusUpdate 
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
                    // const shopRate = Math.floor(Math.random() * 100);
                    const shopRate = 0 

                    if (shopRate < 15) {
                        try {
                            // 呼叫 API 獲取商品
                            const response = await fetch('http://localhost:3000/holylegend/system/items');
                            const result = await response.json();
                            
                            if (result.success && result.data && result.data.length > 0) {
                                const pool = result.data;
                                
                                const itemCount = 6;
                                
                                const selectedItems = [];
                                // 隨機抽取
                                for (let i = 0; i < itemCount; i++) {
                                    if (pool.length === 0) break;
                                    const idx = Math.floor(Math.random() * pool.length);
                                    const itemTemplate = pool[idx];
                                    
                                    // 設定隨機庫存
                                    const stock = Math.ceil(Math.random() * (itemTemplate.maxStock || 3));
                                    
                                    selectedItems.push({
                                        ...itemTemplate,
                                        currentStock: stock
                                    });
                                    // 這裡選擇不移除 pool，允許重複商品出現
                                }

                                // ★ 存入共享商店狀態
                                battle.sharedShopItems = selectedItems;
                                battle.isShopActive = true;
                                battle.shopConfirmedPlayers = []; // 紀錄誰按了離開

                                // 廣播給所有人
                                io.to(currentRoomId).emit('trigger_shop', { items: selectedItems });
                                return;
                            }
                        } catch (e) {
                            console.error("商店生成失敗:", e);
                        }
                    }

                    else {
                        if (eventRate < 15) {
                            // --- 觸發事件流程 ---
                            const response = await fetch('http://localhost:3000/holylegend/system/events');
                            const result = await response.json();

                            const allEvents = result.data; // 資料庫裡的所有獎勵
                            const eventId = Math.floor(Math.random() * allEvents.length)
                            const event = allEvents[eventId]

                            if (!event) {
                                socket.emit('player_confirm_event');
                            }

                            else {
                                io.to(currentRoomId).emit('trigger_event', event);
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
                            
                            // const rewardRate = 0;
                        
                            // 初始化獎勵選擇狀態
                            battle.rewardSelection = {
                                isActive: false,
                                selectedPlayers: [] // 紀錄誰已經選好了
                            };

                            if (rewardRate <= 14) {
                                // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                                setTimeout(() => {
                                    io.to(currentRoomId).emit('multiplayer_show_rewards')
                                }, 1000); 

                            } else {
                                // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                                setTimeout(() => {
                                    startNextFloor(currentRoomId);
                                }, 2000); 
                            } 
                        }
                    }
                }
            
            if (isAllDead) {
                  battle.isEnding = true;
                  setTimeout(() => { 
                      io.to(roomId).emit('game_over_all', { floor: battle.floor }); 
                      delete battles[roomId]; 
                      if(rooms[roomId]) rooms[roomId].forEach(p => p.isReady = false); 
                  }, 1000);
            }
        }
    });

    return io;
}
