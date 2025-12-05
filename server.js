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
                    hp: p.state.playerHp, // 初始血量
                    mp: p.state.playerMp   // 初始魔力
                }));
                
                // 初始化戰鬥
                const floor = 1;
                const enemyMaxHp = 100 * floor * room.length; 
                const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

                // 初始化玩家血量狀態
                const playerStates = {};
                room.forEach(p => {
                    playerStates[p.socketId] = {
                        hp: p.state.hp || 100,
                        maxHp: p.state.maxHp || 100,
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
            
            // 【修正 1】防止重複結算
            if (battle.isEnding) return;

            // 【修正 2】死人不能行動 (取消註解)
            // if (battle.playerStates[socket.id]?.isDead) return;

            // ★ 關鍵修正：同步前端傳來的最新血量
            if (action.currentHp !== undefined && battle.playerStates[socket.id]) {
                battle.playerStates[socket.id].hp = action.currentHp;
                // 如果前端說自己死了，後端就標記死亡
                if (action.currentHp <= 0) {
                    battle.playerStates[socket.id].isDead = true;
                    // 從存活名單移除，這樣回合結算就不會等他了
                    battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== socket.id);
                }
            }

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
                // 【新增】準備回傳給前端的「全體玩家最新狀態」
                // 這樣前端才能同步隊友的血量條
                const playersStatusUpdate = {};
                Object.keys(battle.playerStates).forEach(sid => {
                    playersStatusUpdate[sid] = {
                        hp: battle.playerStates[sid].hp,
                        isDead: battle.playerStates[sid].isDead
                    };
                });
                
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
                    damageTaken = Math.max(Math.round(5 * battle.alivePlayerIds.length * 0.75), 5);

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

                const isAllDead = battle.alivePlayerIds.length === 0;

                io.to(currentRoomId).emit('turn_result', {
                    damageDealt: totalDamage,
                    targetSocketId: targetSocketId,
                    damageTaken: damageTaken,
                    isEnemyDead: isEnemyDead,
                    deadPlayerId: deadPlayerId,
                    isAllDead: isAllDead,
                    playersStatus: playersStatusUpdate // ★ 傳送所有人的血量
                });

                battle.pendingActions = [];

                // 下一層
                if (isEnemyDead) {
                    setTimeout(() => {
                        // 復活所有玩家並補滿血量，讓大家能繼續玩
                        // (或者你可以設計成死掉的這層不能復活，看遊戲性)
                        battle.floor++;
                        const room = rooms[currentRoomId];

                        battle.enemyMaxHp = 100 + (battle.floor * 5 * room.length);
                        battle.enemyHp = battle.enemyMaxHp;
                        
                        const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

                        io.to(currentRoomId).emit('multiplayer_battle_start', {
                            enemyHp: battle.enemyMaxHp,
                            enemyMaxHp: battle.enemyMaxHp,
                            floor: battle.floor,
                            monsterType: randomMonster // 同步怪物圖片
                        });
                    }, 2000); 
                }
                
                // 全滅
                if (isAllDead) {
                    // 傳送最終層數給前端計算經驗
                    battle.isEnding = true; // 上鎖
                    io.to(currentRoomId).emit('game_over_all', { floor: battle.floor });
                     
                    // 戰鬥結束，重置房間狀態以便下一場
                    delete battles[currentRoomId];
                    const room = rooms[currentRoomId];
                    if(room) room.forEach(p => p.isReady = false);
                }
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
    });

    return io;
}
