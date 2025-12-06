import { Server } from 'socket.io';

const rooms = {}; 
const battles = {}; 

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

        socket.on('respond_ready', (isAccepted) => {
            if (!currentRoomId) return;
            
            if (!isAccepted) {
                io.to(currentRoomId).emit('ready_check_canceled', { nickname: currentPlayer.nickname });
                const room = rooms[currentRoomId];
                if(room) room.forEach(p => p.isReady = false);
                return; 
            }

            currentPlayer.isReady = true;
            io.to(currentRoomId).emit('update_ready_view', { socketId: socket.id, status: 'accepted' });

            const room = rooms[currentRoomId];
            const allReady = room.every(p => p.isReady);

            if (allReady) {
                // 【新增】準備玩家公開資訊列表 (供前端繪製頭像)
                const playersPublicInfo = room.map(p => ({
                    socketId: p.socketId,
                    nickname: p.nickname,
                    role: p.state.role,
                    maxHp: p.state.playerMaxHp,
                    maxMp: p.state.playerMaxMp,
                    hp: p.state.playerMaxHp, // 初始血量
                    mp: p.state.playerMaxMp   // 初始魔力
                }));
                
                // 初始化戰鬥
                const floor = 1;
                const enemyMaxHp = 100 + (10 * ((floor - 1) * room.length)); 
                const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

                // 初始化玩家血量狀態
                const playerStates = {};
                room.forEach(p => {
                    playerStates[p.socketId] = {
                        hp: p.state.playerHp || 100,
                        maxHp: p.state.playerMaxHp || 100,
                        mp: p.state.playerMp || 100,
                        maxMp: p.state.playerMaxMp || 100,
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

        socket.on('player_action', (action) => {
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
                let deadPlayerId = null;

                // 怪物反擊
                if (!isEnemyDead && battle.alivePlayerIds.length > 0) {
                    const targetIndex = Math.floor(Math.random() * battle.alivePlayerIds.length);
                    targetSocketId = battle.alivePlayerIds[targetIndex];
                    damageTaken = Math.round(5 + (2.5 * (battle.alivePlayerIds.length - 1))); 

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
                    const rewardRate = Math.floor(Math.random() * 100);
                    
                    // 初始化獎勵選擇狀態
                    battle.rewardSelection = {
                        isActive: false,
                        selectedPlayers: [] // 紀錄誰已經選好了
                    };

                    if (rewardRate <= 14) {
                        // --- 觸發獎勵流程 ---
                        battle.rewardSelection.isActive = true;
                        
                        setTimeout(() => {
                            // 通知前端顯示獎勵畫面
                            io.to(currentRoomId).emit('multiplayer_show_rewards');
                        }, 1000); 

                    } else {
                        // --- 沒有獎勵，直接進下一層 (維持原樣) ---
                        setTimeout(() => {
                            startNextFloor(currentRoomId);
                        }, 2000); 
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

        // 修改監聽事件，接收 data 參數
        socket.on('player_selected_reward', (data) => {
            if (!currentRoomId || !battles[currentRoomId]) return;
            const battle = battles[currentRoomId];

            if (battle.playerStates[socket.id] && data) {
                // 1. 處理【復活】 (REVIVE)
                // 必須在加血之前處理，因為復活通常是直接回滿
                if (data.reward.rewardType === 'REVIVE' || data.reward.rewardType === 'revive') {
                    battle.playerStates[socket.id].isDead = false;
                    battle.playerStates[socket.id].hp = battle.playerStates[socket.id].maxHp;
                    battle.playerStates[socket.id].mp = battle.playerStates[socket.id].maxMp;
                     
                     // ★ 重要：加回存活名單，否則下一層會被略過
                     if (!battle.alivePlayerIds.includes(socket.id)) {
                         battle.alivePlayerIds.push(socket.id);
                     }
                }
                // 2. 處理【HP 回復】 (HP / HP_PERCENT)
                else if (data.reward.rewardType  === 'HP') {
                    let healAmount = 0;

                    // 如果是百分比 (例如 0.3 代表 30%)
                    if (data.reward.rewardPercent > 0) {
                        const pct = parseFloat(data.reward.rewardPercent / 100) || 0; // 防呆
                        healAmount = battle.playerStates[socket.id].maxHp * pct;
                    } 
                    // 如果是固定數值 (例如 50 點)
                    else {
                        healAmount = parseInt(data.reward.rewardValue) || 0; // 防呆
                    }

                    battle.playerStates[socket.id].hp = Math.floor(battle.playerStates[socket.id].hp + healAmount);

                    // ★ 關鍵修正：不能超過最大血量
                    if (battle.playerStates[socket.id].hp > battle.playerStates[socket.id].maxHp) battle.playerStates[socket.id].hp = battle.playerStates[socket.id].maxHp;
                }
                // 3. 處理【MP 回復】 (MP / MP_PERCENT)
                else if (data.reward.rewardType === 'MP') {
                    let recoverAmount = 0;

                    if (data.reward.rewardPercent > 0 ) {
                        const pct = parseFloat(data.reward.rewardPercent / 100) || 0;
                        recoverAmount = battle.playerStates[socket.id].maxMp * pct;
                    } else {
                        recoverAmount = parseInt(data.reward.rewardValue) || 0;
                    }

                    battle.playerStates[socket.id].mp = Math.floor(battle.playerStates[socket.id].mp + recoverAmount);

                    // ★ 關鍵修正：不能超過最大魔力
                    if (battle.playerStates[socket.id].mp > battle.playerStates[socket.id].maxMp) battle.playerStates[socket.id].mp = battle.playerStates[socket.id].maxMp;
                }
                
                // (選用) 為了方便除錯，可以在後端印出來看看
                // console.log(`玩家 ${pState.nickname || socket.id} 狀態更新: HP=${pState.hp}/${pState.maxHp}`);
            }

            // ---------------------------

            // 記錄該玩家已選擇
            if (!battle.rewardSelection.selectedPlayers.includes(socket.id)) {
                battle.rewardSelection.selectedPlayers.push(socket.id);
            }

            // 檢查：是否「所有存活玩家」都選完了？
            // 注意：因為剛剛如果有人復活，alivePlayerIds 已經更新了，所以這裡的檢查會包含剛復活的人
            const allSelected = battle.alivePlayerIds.every(id => 
                battle.rewardSelection.selectedPlayers.includes(id)
            );

            if (allSelected) {
                // 所有人選完，進入下一層
                startNextFloor(currentRoomId);
            } else {
                // 還有隊友沒選，通知前端顯示等待訊息
                socket.emit('waiting_for_teammates', { 
                    current: battle.rewardSelection.selectedPlayers.length, 
                    total: battle.alivePlayerIds.length 
                });
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
                const combatState = battle.playerStates[p.socketId];
                
                // (選用) 同步回 rooms 資料，這樣如果有人斷線重連，能讀到正確數值
                if (combatState) {
                    p.state.playerHp = combatState.hp;
                    p.state.playerMp = combatState.mp;
                }

                return {
                    socketId: p.socketId,
                    nickname: p.nickname,
                    role: p.state.role,
                    maxHp: combatState ? combatState.maxHp : 100,
                    maxMp: combatState ? combatState.maxMp : 100,
                    // 這裡一定要傳送 combatState 的數值，因為剛剛在 player_selected_reward 更新的是它
                    hp: combatState ? combatState.hp : 100, 
                    mp: combatState ? combatState.mp : 100
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
