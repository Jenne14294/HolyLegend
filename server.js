import { Server } from 'socket.io';

const rooms = {}; 
const battles = {}; 

export default function initSocket(server) {
    const io = new Server(server);

    io.on('connection', (socket) => {
        console.log('新玩家連線:', socket.id);
        
        let currentRoomId = null;
        let currentPlayer = null;

        // --- 隊伍系統 (保持不變) ---
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
                const floor = 1;
                const enemyMaxHp = 100 * floor * room.length; 
                
                // 1. 【同步修正】Server 端決定第一層怪物
                const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

                // 2. 【卡住修正】初始化玩家血量狀態
                // 我們需要知道每個 Socket ID 對應的血量，以便判斷死活
                const playerStates = {};
                room.forEach(p => {
                    playerStates[p.socketId] = {
                        hp: p.hp || 100,
                        maxHp: p.maxHp || 100,
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
                    // 初始存活名單
                    alivePlayerIds: room.map(p => p.socketId)
                };

                io.to(currentRoomId).emit('multiplayer_battle_start', {
                    enemyHp: enemyMaxHp,
                    enemyMaxHp: enemyMaxHp,
                    floor: floor,
                    monsterType: randomMonster
                });
            }
        });

        socket.on('player_action', (action) => {
            if (!currentRoomId || !battles[currentRoomId]) return;

            const battle = battles[currentRoomId];
            
            // 如果玩家已經死了，忽略他的動作 (防呆)
            if (battle.playerStates[socket.id]?.isDead) return;

            // 紀錄動作
            const damage = Math.floor(Math.random() * 10) + 10;
            const hasActed = battle.pendingActions.find(a => a.socketId === socket.id);
            if (!hasActed) {
                battle.pendingActions.push({ socketId: socket.id, damage: damage });
            }

            // 3. 【卡住修正】檢查是否「所有存活玩家」都已行動
            // 不再檢查 room.length，而是檢查 alivePlayerIds.length
            if (battle.pendingActions.length >= battle.alivePlayerIds.length) {
                
                // --- 回合結算 ---
                let totalDamage = 0;
                battle.pendingActions.forEach(a => totalDamage += a.damage);
                
                battle.enemyHp -= totalDamage;
                if (battle.enemyHp < 0) battle.enemyHp = 0;

                const isEnemyDead = battle.enemyHp <= 0;
                
                let targetSocketId = null;
                let damageTaken = 0;
                let deadPlayerSocketId = null; // 本回合死亡的玩家

                // 怪物反擊 (如果怪物沒死)
                if (!isEnemyDead && battle.alivePlayerIds.length > 0) {
                    // 隨機挑一個存活的倒楣鬼
                    const targetIndex = Math.floor(Math.random() * battle.alivePlayerIds.length);
                    targetSocketId = battle.alivePlayerIds[targetIndex];
                    damageTaken = 15; // 固定傷害

                    // 扣除 Server 端紀錄的血量
                    if (battle.playerStates[targetSocketId]) {
                        battle.playerStates[targetSocketId].hp -= damageTaken;
                        
                        // 判斷是否死亡
                        if (battle.playerStates[targetSocketId].hp <= 0) {
                            battle.playerStates[targetSocketId].hp = 0;
                            battle.playerStates[targetSocketId].isDead = true;
                            deadPlayerSocketId = targetSocketId;
                            
                            // 從存活名單移除，下一回合就不會等他了！
                            battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== targetSocketId);
                        }
                    }
                }

                // 4. 發送結果給全隊
                io.to(currentRoomId).emit('turn_result', {
                    damageDealt: totalDamage,
                    targetSocketId: targetSocketId,
                    damageTaken: damageTaken,
                    isEnemyDead: isEnemyDead,
                    deadPlayerId: deadPlayerSocketId, // 告訴前端誰死了
                    isAllDead: battle.alivePlayerIds.length === 0 // 是否全滅
                });

                // 清空動作
                battle.pendingActions = [];

                // 處理怪物死亡 -> 下一層
                if (isEnemyDead) {
                    setTimeout(() => {
                        battle.floor++;
                        // 復活所有玩家 (可選) 或者讓他們殘血進入下一層
                        // 這裡簡單做：全體復活補滿，方便測試
                        // Object.keys(battle.playerStates).forEach(id => {
                        //     battle.playerStates[id].hp = battle.playerStates[id].maxHp;
                        //     battle.playerStates[id].isDead = false;
                        // });
                        // battle.alivePlayerIds = Object.keys(battle.playerStates); // 重置存活名單

                        // 怪物增強
                        battle.enemyMaxHp = 100 * battle.floor * Object.keys(battle.playerStates).length;
                        battle.enemyHp = battle.enemyMaxHp;
                        
                        const monsters = ['slime', 'bat', 'skeleton', 'orc']; 
                        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

                        io.to(currentRoomId).emit('multiplayer_battle_start', {
                            enemyHp: battle.enemyMaxHp,
                            enemyMaxHp: battle.enemyMaxHp,
                            floor: battle.floor,
                            monsterType: randomMonster // 【同步修正】Server 決定下一隻怪物
                        });
                    }, 2000); 
                }
                
                // 處理全滅 -> 遊戲結束
                if (battle.alivePlayerIds.length === 0 && !isEnemyDead) {
                     io.to(currentRoomId).emit('game_over_all', { floor: battle.floor });
                     delete battles[currentRoomId];
                }
            }
        });

        socket.on('disconnect', () => { handleDisconnect(); });
        socket.on('leave_battle', () => { handleDisconnect(); });

        function handleDisconnect() {
            if (currentRoomId && rooms[currentRoomId]) {
                rooms[currentRoomId] = rooms[currentRoomId].filter(p => p.socketId !== socket.id);
                
                // 如果有人斷線，從戰鬥存活名單移除，避免卡住
                if (battles[currentRoomId]) {
                    const battle = battles[currentRoomId];
                    battle.alivePlayerIds = battle.alivePlayerIds.filter(id => id !== socket.id);
                    
                    if (rooms[currentRoomId].length === 0) {
                        delete battles[currentRoomId];
                        delete rooms[currentRoomId];
                    } else {
                        io.to(currentRoomId).emit('team_update', rooms[currentRoomId]);
                        // 如果剛好輪到這個人行動導致卡住，可以考慮強制觸發一次檢查 (這裡省略)
                    }
                } else {
                    if (rooms[currentRoomId].length > 0) {
                        io.to(currentRoomId).emit('team_update', rooms[currentRoomId]);
                    } else {
                        delete rooms[currentRoomId];
                    }
                }
            }
        }
    });

    return io;
}