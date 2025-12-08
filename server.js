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
                 io.to(currentRoomId).emit('ready_check_canceled', { nickname: currentPlayer.nickname }); 
                 const room = rooms[currentRoomId]; 
                 if(room) room.forEach(p => p.isReady = false); 
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
                    // const eventRate = 0 

                    if (eventRate < 20) {
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
                        const rewardRate = Math.floor(Math.random() * 100);
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
                        const change = isPunish ? -val : val;
                        pState.hp = Math.min(pState.maxHp, Math.max(0, pState.hp + change));
                        p.state.playerHp = pState.hp; // 同步
                    } 
                    // 5. MP -> 修改 battle + p.state
                    else if (type === 'MP') {
                        const pState = battle.playerStates[p.socketId];
                        const change = isPunish ? -val : val;
                        pState.mp = Math.min(pState.maxMp, Math.max(0, pState.mp + change));
                        p.state.playerMp = pState.mp; // 同步
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

            const room = rooms[roomId]; // 取得房間內的玩家原始資料
            if (!room) return;

            battle.floor++;
            battle.enemyMaxHp = 100 + 10 * (battle.floor * room.length);
            battle.enemyHp = battle.enemyMaxHp;
            battle.processingTurn = false;
            
            // 清空上一輪的動作與選擇
            battle.pendingActions = [];
            battle.rewardSelection = { isActive: false, selectedPlayers: [] };

            const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
            const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

            // ★★★ 關鍵修正：重新組裝玩家列表，包含「最新」的 HP/MP ★★★
            // 我們必須從 battle.playerStates 讀取數據，因為那裡才是最新的
            const updatedPlayersInfo = room.map(p => {
                // ★★★ 關鍵修正：優先從 battle state 讀取最新的 HP/MP ★★★
                const combatState = battle.playerStates[p.socketId];
                
                // 為了保險，同步回 p.state
                if (combatState) {
                    p.state.playerHp = combatState.hp;
                    p.state.playerMp = combatState.mp;
                }

                // 取出金幣與經驗增量
                const goldDelta = p.state.goldCollected || 0;
                const expDelta = p.state.AdditionEXP || 0;

                // 重置增量 (避免重複加)
                p.state.goldCollected = 0;
                p.state.AdditionEXP = 0;

                return {
                    socketId: p.socketId,
                    nickname: p.nickname,
                    role: p.state.role,
                    maxHp: combatState ? combatState.maxHp : 100,
                    maxMp: combatState ? combatState.maxMp : 100,
                    
                    // ★ 這裡使用 combatState 的 hp/mp，確保是最新數值
                    hp: combatState ? combatState.hp : (p.state.playerHp || 100), 
                    mp: combatState ? combatState.mp : (p.state.playerMp || 100),
                    
                    AdditionState: p.state.AdditionState || [0, 0, 0, 0], // 屬性發送總量
                    goldCollected: goldDelta, // 發送增量
                    AdditionEXP: expDelta,    // 發送增量
                    avatar: p.state.avatar
                };
            });

            // 發送事件給前端，前端收到後會重繪介面
            io.to(roomId).emit('multiplayer_battle_start', {
                enemyHp: battle.enemyMaxHp,
                enemyMaxHp: battle.enemyMaxHp,
                floor: battle.floor,
                monsterType: randomMonster,
                players: updatedPlayersInfo // ★ 把這份最新的名單傳過去
            });
        }
    });

    return io;
}
