document.addEventListener('DOMContentLoaded', () => {
    
    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const teamLayer = document.getElementById('team-layer');
    const btnOpenTeam = document.getElementById('btn-open-team'); 
    const btnCloseTeam = document.getElementById('btn-close-team');
    
    const btnCreate = document.getElementById('btn-create-team');
    const btnJoin = document.getElementById('btn-join-team');
    const btnReady = document.getElementById('btn-team-ready'); 
    
    // 離開隊伍按鈕
    const btnLeave = document.getElementById('btn-leave-team');

    // 列表與聊天
    const teamMembersList = document.getElementById('team-members-list');
    const chatInput = document.getElementById('chat-input');
    const btnChatSend = document.getElementById('btn-chat-send');
    const chatMessages = document.getElementById('chat-messages');
    const teamStatusText = document.querySelector('.team-status-text');

    // 狀態
    let myRoomId = null;
    let isLeader = false; 
    let isReady = false;
    let listenersAdded = false; // 防止重複綁定監聽器

    // 初始化：先渲染空的隊伍格子
    renderTeamMembers([]);
    updateButtonState('initial');

    // ===========================
    // 1. 初始化 Socket 監聽器
    // ===========================
    function initSocketListeners() {
        // 從 Game Core 取得 socket
        const socket = window.Game.socket;
        
        if (!socket) {
            console.error("Socket 未初始化，請檢查 game_core.js");
            return;
        }

        if (listenersAdded) return; // 如果已經綁定過，就跳過

        socket.on('connect', () => {
            console.log('Socket 連線成功 (Team System):', socket.id);
        });

        // 監聽：隊伍創建成功
        socket.on('team_created', (data) => {
            myRoomId = data.roomId;
            isLeader = true;
            isReady = false;
            
            alert(`隊伍創建成功！房間號碼：${myRoomId}`);
            renderTeamMembers(data.members);
            appendMessage('系統', `房間 ${myRoomId} 已建立，等待隊友加入...`, true);
            
            updateButtonState('in_room');
            
            // 恢復按鈕狀態
            if(btnCreate) btnCreate.disabled = false;
        });

        // 監聽：隊伍列表更新
        socket.on('team_update', (members) => {
            renderTeamMembers(members);
        });

        // 監聽：收到聊天訊息
        socket.on('chat_message', (msg) => {
            appendMessage(msg.sender, msg.text, msg.isSystem);
        });

        // 【新增】監聽：被踢出隊伍 (針對被踢的人)
        socket.on('kicked', () => {
            alert("你已被隊長踢出隊伍。");
            leaveRoom(true); // true 表示是被動離開，不需要再送 leave 請求
        });

        // 監聽：錯誤訊息
        socket.on('error_msg', (msg) => {
            alert(msg);
            // 如果出錯，恢復按鈕狀態
            if(btnCreate) btnCreate.disabled = false;
            if(btnJoin) btnJoin.disabled = false;
            
            // 如果因為加入失敗，確保狀態正確
            if (myRoomId && !isLeader) { // 只有加入者需要重置
                myRoomId = null;
                updateButtonState('initial');
            }
        });

        listenersAdded = true;
    }

    // ===========================
    // 2. 準備玩家資料
    // ===========================
    function getMyPlayerData() {
        let nickname = window.Game.InitData.nickname;

        
        // DOM 備援
        const nameEl = document.getElementById('lobbyName');
        const lvEl = document.getElementById('lobbyLevel');
        if (nameEl && nameEl.innerText) nickname = nameEl.innerText;
        if (lvEl && lvEl.innerText) level = parseInt(lvEl.innerText) || 1;
        
        const avatarEl = document.getElementById('lobbyAvatar');
        if (avatarEl && avatarEl.src) {
            window.Game.state.avatar = avatarEl.src;
        }

        return {
            nickname: window.Game.InitData.nickname,
            state: window.Game.state,
        };
    }

    // ===========================
    // 3. 介面開關邏輯
    // ===========================

    if (btnOpenTeam) {
        btnOpenTeam.addEventListener('click', () => {
            if (lobbyLayer) lobbyLayer.classList.add('hidden');
            if (teamLayer) teamLayer.classList.remove('hidden');
            
            // 初始化監聽器 (Socket 在 game_core 已經連線了)
            initSocketListeners();
        });
    }

    if (btnCloseTeam) {
        btnCloseTeam.addEventListener('click', () => {
            closeTeamLayer();
        });
    }

    if (btnLeave) {
        btnLeave.addEventListener('click', () => {
            if (myRoomId) {
                const msg = isLeader 
                    ? "你是隊長，離開將解散隊伍，確定嗎？" 
                    : "確定要離開目前的隊伍嗎？";

                if (confirm(msg)) {
                    leaveRoom(); 
                }
            }
        });
    }

    function leaveRoom(isForced = false) {
        const socket = window.Game.socket;
        
        // 通知 Server 離開 (如果有的話，或是直接 disconnect 重連)
        // 簡單做法：重新整理頁面最乾淨
        // 但如果不想重整，可以 emit 'leave_team' 事件 (需後端支援)
        
        // 這裡暫時模擬：
        myRoomId = null;
        isLeader = false;
        isReady = false;
        
        if (chatMessages) chatMessages.innerHTML = '';
        if (teamStatusText) teamStatusText.innerText = '目前隊伍 (0/4)';
        renderTeamMembers([]);

        updateButtonState('initial');
        
        // 實際上斷開重連比較乾淨，避免舊房間的訊息還會收到
        if (socket) {
            socket.disconnect();
            // Game Core 之後會需要重連，這裡簡單重整頁面可能更好
            // location.reload(); 
            // 或者重新連線：
            window.Game.socket.connect();
        }
    }

    function closeTeamLayer() {
        if (teamLayer) teamLayer.classList.add('hidden');
        if (lobbyLayer) lobbyLayer.classList.remove('hidden');
    }

    // ===========================
    // 4. 按鈕互動
    // ===========================
    
    // 創建隊伍
    if (btnCreate) {
        btnCreate.addEventListener('click', () => {
            const socket = window.Game.socket; // 【修正】取得 socket
            if (!socket) return alert("連線錯誤");

            btnCreate.disabled = true;
            
            const myData = getMyPlayerData();
            socket.emit('create_team', myData);
            
            setTimeout(() => { btnCreate.disabled = false; }, 3000);
        });
    }

    // 加入隊伍
    if (btnJoin) {
        btnJoin.addEventListener('click', () => {
            const socket = window.Game.socket; // 【修正】取得 socket
            if (!socket) return alert("連線錯誤");

            const inputId = prompt("請輸入 4 位數房間號碼：");
            if (inputId) {
                const roomId = inputId.trim(); 
                btnJoin.disabled = true;

                const myData = getMyPlayerData();
                socket.emit('join_team', { roomId, playerData: myData });
                
                myRoomId = roomId;
                isLeader = false;
                isReady = false;
                
                updateButtonState('in_room');

                setTimeout(() => { btnJoin.disabled = false; }, 3000);
            }
        });
    }

    // 準備按鈕
    if (btnReady) {
        btnReady.addEventListener('click', () => {
            const socket = window.Game.socket;
            if (!myRoomId || !socket) return;

            isReady = !isReady;
            
            if (isReady) {
                btnReady.innerText = "已準備 (取消)";
                btnReady.style.backgroundColor = "#e67e22";
                btnReady.style.borderStyle = "inset";
            } else {
                btnReady.innerText = "準備出發";
                btnReady.style.backgroundColor = "#2ecc71";
                btnReady.style.borderStyle = "solid";
            }

            socket.emit('respond_ready', isReady); // 修改為後端對應的事件
        });
    }

    // 發送聊天
    if (btnChatSend) {
        btnChatSend.addEventListener('click', () => {
            const socket = window.Game.socket;
            const text = chatInput.value.trim();
            if (text && socket) {
                socket.emit('send_message', text);
                chatInput.value = '';
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnChatSend.click();
        });
    }

    // ===========================
    // 5. 畫面渲染與輔助函式
    // ===========================

    function updateButtonState(state) {
        if (state === 'in_room') {
            if(btnCreate) { btnCreate.style.display = 'none'; btnCreate.disabled = false; }
            if(btnJoin) { btnJoin.style.display = 'none'; btnJoin.disabled = false; }
            if(btnReady) btnReady.style.display = 'block';
            if(btnLeave) btnLeave.style.display = 'block';
        } else {
            // initial
            if(btnCreate) { btnCreate.style.display = 'block'; btnCreate.disabled = false; }
            if(btnJoin) { btnJoin.style.display = 'block'; btnJoin.disabled = false; }
            if(btnReady) btnReady.style.display = 'none';
            if(btnLeave) btnLeave.style.display = 'none';
        }
    }

    function renderTeamMembers(members) {
        const memberList = members || [];
        const socket = window.Game.socket; // 需要用來比對 socket.id

        if (teamStatusText) {
            const text = myRoomId ? `目前隊伍 (${memberList.length}/4) - 房號: ${myRoomId}` : '目前隊伍 (0/4)';
            teamStatusText.innerText = text;
        }

        if (teamMembersList) {
            teamMembersList.innerHTML = ''; 

            memberList.forEach(p => {
                const imgSrc = p.state.avatar;

                const hpPct = p.state.maxHp ? (p.state.hp / p.state.maxHp) * 100 : 100;
                const mpPct = p.state.maxMp ? (p.state.mp / p.state.maxMp) * 100 : 100;

                const leaderBadge = p.isLeader ? '<span class="badge-leader">隊長</span>' : '';
                const readyStatus = p.isReady ? '<span style="color:#2ecc71; font-size:0.8rem;">(準備)</span>' : '';

                // 【重點】判斷是否顯示踢人按鈕
                // 條件：我是隊長 && 這張卡片不是我
                let kickBtnHtml = '';
                
                // 假設 p 物件裡有 socketId，這最準確。如果沒有，可以用 nickname 比對
                const isMe = (p.socketId === socket.id) || (p.nickname === window.Game.InitData.nickname);
                
                if (isLeader && !isMe) {
                    // 我們將目標的 socketId 或 nickname 存在 data attribute 中
                    // 建議後端 memberList 包含 socketId
                    const targetId = p.socketId || p.nickname; 
                    kickBtnHtml = `<button class="btn-kick" data-target="${targetId}">X</button>`;
                }

                const card = document.createElement('div');
                card.className = 'member-card';
                card.innerHTML = `
                    ${kickBtnHtml}
                    <div class="member-avatar-box">
                        <img src="${imgSrc}" class="member-avatar">
                        <div class="member-lv">${p.state.level}</div>
                    </div>
                    <div class="member-stats">
                        <div class="member-name">${p.nickname}_${p.state.role} ${leaderBadge} ${readyStatus}</div>
                        <div class="mini-bar-bg">
                            <div class="mini-bar-fill hp-fill" style="width: ${hpPct}%;"></div>
                        </div>
                        <div class="mini-bar-bg">
                            <div class="mini-bar-fill mp-fill" style="width: ${mpPct}%;"></div>
                        </div>
                    </div>
                `;
                
                // 【重點】綁定踢人按鈕事件
                const kickBtn = card.querySelector('.btn-kick');
                if (kickBtn) {
                    kickBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // 防止觸發其他卡片點擊效果
                        const targetId = kickBtn.dataset.target;
                        handleKickMember(targetId, p.nickname);
                    });
                }

                teamMembersList.appendChild(card);
            });

            // 補滿空位
            for (let i = memberList.length; i < 4; i++) {
                const emptyCard = document.createElement('div');
                emptyCard.className = 'member-card empty';
                emptyCard.innerHTML = `
                    <div class="member-avatar-box empty-avatar">?</div>
                    <div class="member-stats">
                        <div class="member-name waiting">等待加入...</div>
                    </div>
                `;
                teamMembersList.appendChild(emptyCard);
            }
        }
    }

    // 【新增】處理踢人邏輯
    function handleKickMember(targetId, targetName) {
        if (!confirm(`確定要將 [${targetName}] 踢出隊伍嗎？`)) return;

        const socket = window.Game.socket;
        if (socket && myRoomId) {
            // 發送踢人請求給 Server
            // Server 端需要監聽 'kick_member' 事件，並驗證發送者是否為該房間隊長
            socket.emit('kick_member', { 
                roomId: myRoomId, 
                targetSocketId: targetId // 建議後端用 socketId 踢人比較準
            });
        }
    }

    function appendMessage(sender, text, isSystem = false) {
        if (!chatMessages) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = isSystem ? 'chat-line system' : 'chat-line';
        
        let senderHtml = '';
        if (sender && !isSystem) {
            const myName = (window.INITIAL_PLAYER_DATA ? window.INITIAL_PLAYER_DATA.nickname : '');
            const isMe = sender === myName;
            const colorClass = isMe ? 'name-p2' : 'name-p1';
            senderHtml = `<span class="sender ${colorClass}">${sender}:</span>`;
        } else if (sender && isSystem) {
            senderHtml = `<span class="sender">[${sender}]</span>`;
        }
        
        msgDiv.innerHTML = `${senderHtml} ${text}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

});