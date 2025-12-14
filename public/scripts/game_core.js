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
            "Dodge": 0,
            "Crit": 0,
            "Reduce": 0
        },
        Inventory: [],
        Skills: [],
        Equipment: {
            "slot_1": {},
            "slot_2": {},
            "slot_3": {},
            "slot_4": {},
            "slot_5": {},
            "slot_6": {},
            "slot_7": {},
            "slot_8": {},
            
        },
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
        const level = document.getElementById("lobbyLevel");
        this.safeSetText('lobbyLevel', data.level);
        this.safeSetText('lobbyName', data.nickname);
        this.safeSetText('lobbyHpText', `${data.hp}/${data.maxHp}`);
        this.safeSetText('lobbyMpText', `${data.mp}/${data.maxMp}`);
        this.safeSetText('lobbyEXPText', `${data.exp}/${data.needEXP}`);
        
        const hpElem = document.getElementById('lobbyHpBar');
        const mpElem = document.getElementById('lobbyMpBar');
        const expElem = document.getElementById('lobbyEXPBar');
        if (hpElem) hpElem.style.width = `${(data.hp / data.maxHp) * 100}%`;
        if (mpElem) mpElem.style.width = `${(data.mp / data.maxMp) * 100}%`;
        if (mpElem) expElem.style.width = `${(data.exp / data.needEXP) * 100}%`;
                

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
    }
};

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
            const response = await fetch('/holylegend/system/status');
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
                Game.state.avatar = data.avatar;
                Game.InitData.nickname = data.nickname;
                Game.state.AdditionAttribute
                
                // 更新 UI
                Game.updateLobbyUI(data);
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
