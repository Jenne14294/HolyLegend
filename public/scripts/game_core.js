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
        role: 'novice' // 記錄當前職業
    },
    
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
        this.safeSetText('lobbyLevel', data.level);
        this.safeSetText('lobbyName', data.nickname);
        this.safeSetText('lobbyHpText', `${data.hp}/${data.maxHp}`);
        this.safeSetText('lobbyMpText', `${data.mp}/${data.maxMp}`);
        
        const hpElem = document.getElementById('lobbyHpBar');
        const mpElem = document.getElementById('lobbyMpBar');
        if (hpElem) hpElem.style.width = `${(data.hp / data.maxHp) * 100}%`;
        if (mpElem) mpElem.style.width = `${(data.mp / data.maxMp) * 100}%`;

        const avatar = document.getElementById('lobbyAvatar');
        if (avatar && data.role) {
            // 首字大寫處理
            const roleName = data.role.charAt(0).toUpperCase() + data.role.slice(1).toLowerCase();
            avatar.src = `/holylegend/images/classes/${roleName}_1.png`;
            avatar.onerror = function() {
                this.src = '/holylegend/images/classes/Novice_1.png';
            };
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // ===========================
    // 初始化：跟後端拿資料
    // ===========================
    async function initGame() {
        try {
            const response = await fetch('/holylegend/game_lobby/status');
            const result = await response.json();

            console.log(result.data)
            
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
                
                // 更新 UI
                Game.updateLobbyUI(data);
                console.log("玩家資料載入成功:", data);
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