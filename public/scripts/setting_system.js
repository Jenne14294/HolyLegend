document.addEventListener('DOMContentLoaded', () => {

    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const settingsLayer = document.getElementById('settings-layer');
    
    // 按鈕 (假設選單按鈕是 footer 的第三個)
    const btnOpenSettings = document.querySelector('.bottom-menu .menu-btn:last-child');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    
    // 設定元件
    const avatarInput = document.getElementById('file-upload');
    const avatarPreview = document.getElementById('settings-avatar-preview');
    const nameInput = document.getElementById('settings-nickname-input');
    const btnSaveName = document.getElementById('btn-save-name');
    
    const toggleBgm = document.getElementById('toggle-bgm');
    const toggleSfx = document.getElementById('toggle-sfx');

    const btnLogout = document.getElementById('btn-logout');

    // 取得 Game Core 參考
    const bgMusic = document.getElementById('bg-music-source');

    const btnSaveShortcuts = document.getElementById('btn-save-shortcuts');
    const btnResetShortcuts = document.getElementById('btn-reset-shortcuts');

    const validKeys = new Set([
        'A','B','C','D','E','F','G','H','I','J','K','L','M',
        'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
        '0','1','2','3','4','5','6','7','8','9', ' ',
        'ENTER','ESCAPE','ARROWUP','ARROWDOWN','ARROWLEFT','ARROWRIGHT',
        'CONTROL', 'SHIFT'
    ]);


    // ===========================
    // 1. 開關選單
    // ===========================
    
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            // 填入當前資料
            const currentName = document.getElementById('lobbyName') ? document.getElementById('lobbyName').innerText : '';
            const currentAvatar = document.getElementById('lobbyAvatar') ? document.getElementById('lobbyAvatar').src : '';
            
            if (nameInput) nameInput.value = currentName;
            if (avatarPreview && currentAvatar) avatarPreview.src = currentAvatar;

            syncInputsFromBindings();

            lobbyLayer.classList.add('hidden');
            settingsLayer.classList.remove('hidden');
        });
    }

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            settingsLayer.classList.add('hidden');
            lobbyLayer.classList.remove('hidden');
        });
    }

    // ===========================
    // 2. 音樂/音效控制
    // ===========================

    if (toggleBgm) {
        toggleBgm.addEventListener('change', (e) => {
            const isMuted = !e.target.checked;
            
            if (bgMusic) {
                bgMusic.muted = isMuted;
                if (!isMuted) {
                    // 如果原本沒在播，嘗試播放
                    bgMusic.play().catch(e => console.warn(e));
                }
            }
            
            // 也可以存入 localStorage 以便下次記住
            localStorage.setItem('bgm_muted', isMuted);
        });
        
        // 初始化讀取設定
        const savedMute = localStorage.getItem('bgm_muted') === 'true';
        if (savedMute) {
            toggleBgm.checked = false;
            if (bgMusic) bgMusic.muted = true;
        }
    }

    if (toggleSfx) {
        toggleSfx.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            // 這裡可以設定一個全域變數讓其他腳本讀取
            window.Game.state.sfxEnabled = isEnabled;
            localStorage.setItem('sfx_enabled', isEnabled);
        });

        // 初始化
        window.Game.state.sfxEnabled = true; // 預設開啟
        const savedSfx = localStorage.getItem('sfx_enabled');
        if (savedSfx !== null) {
            const isEnabled = savedSfx === 'true';
            toggleSfx.checked = isEnabled;
            window.Game.state.sfxEnabled = isEnabled;
        }
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("確定要登出遊戲嗎？")) {
                // 1. 清除 Cookie (將過期時間設為過去)
                // 注意：path 必須設定為 '/' 確保清除正確
                document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                
                // 2. (選用) 斷開 Socket
                const socket = window.Game?.socket;
                if (socket) {
                    socket.disconnect();
                }
                
                // 3. 導回首頁
                window.location.href = '/holylegend';
            }
        });
    }
 

    // ===========================
    // 3. 頭像上傳 (預覽)
    // ===========================

    if (avatarInput) {
        avatarInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // 檢查檔案類型
            if (!file.type.startsWith('image/')) {
                alert('請上傳圖片檔案！');
                return;
            }

            // A. 本地預覽 (FileReader)
            const reader = new FileReader();
            reader.onload = function(event) {
                // 更新設定介面的預覽圖
                if (avatarPreview) avatarPreview.src = event.target.result;
            };
            reader.readAsDataURL(file);

            // B. 上傳至後端
            uploadAvatar(file);
        });
    }

    // ===========================
    // 4. 修改暱稱
    // ===========================

    if (btnSaveName) {
        btnSaveName.addEventListener('click', async () => {
            const newName = nameInput.value.trim();
            if (newName.length < 1) return alert('名字不能為空');
            if (newName.length > 6) return alert('名字不能超過六個字');
            
            // 鎖定按鈕
            btnSaveName.disabled = true;
            btnSaveName.innerText = '...';

            try {
                const res = await fetch('/holylegend/updateProfile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // ★ 修正 3：這裡送出 { jobId: 1 }
                    body: JSON.stringify({ name: newName }) 
                });
                const result = await res.json();

                if (result.success) {
                    const lobbyName = document.getElementById('lobbyName');
                    if (lobbyName) lobbyName.innerText = newName;
                }
                
            } catch (e) {
                console.error(e);
                alert('修改失敗');
            } finally {
                btnSaveName.disabled = false;
                btnSaveName.innerText = '修改';
            }
        });
    }


    if (btnSaveShortcuts) {
        btnSaveShortcuts.addEventListener('click', handleSaveShortcuts);
    }
    if (btnResetShortcuts) {
        btnResetShortcuts.addEventListener('click', handleResetShortcuts);
    }


    async function uploadAvatar(file) {
        // ★ 修正：不需要再從前端獲取 userId，後端會從 Cookie 解析
        const formData = new FormData();
        formData.append('avatar_image', file); 

        try {
            // 發送請求
            const response = await fetch('/holylegend/system/upload_avatar', {
                method: 'POST',
                // 因為是同源請求 (Same-origin)，瀏覽器會自動帶上 Cookie (auth_token)
                // 不需要設定 credentials: 'include' 除非是跨域
                body: formData 
            });

            const result = await response.json();

            if (result.success) {
                
                // 加上時間戳記以防止瀏覽器快取舊圖片
                const newAvatarUrl = `${result.data.path}?t=${new Date().getTime()}`;

                // 1. 更新設定頁面預覽
                if (avatarPreview) {
                    avatarPreview.src = newAvatarUrl;
                    avatarPreview.style.opacity = 1;
                }

                // 2. 更新大廳頭像
                const lobbyAvt = document.getElementById('lobbyAvatar');
                if (lobbyAvt) lobbyAvt.src = newAvatarUrl;

                // 3. (選用) 更新 Socket 狀態，讓隊友也能看到新頭像
                // if (window.Game.socket) {
                //     window.Game.socket.emit('update_player_info', { avatar: newAvatarUrl });
                // }

            } else {
                throw new Error(result.msg || result.message || '上傳失敗'); // 兼容 msg/message
            }

        } catch (error) {
            console.error('上傳錯誤:', error);
            // 如果是 401/403，verifyToken 會回傳錯誤訊息，這裡會捕捉到
            alert('上傳失敗: ' + error.message);
            // 失敗時恢復原本的預覽圖可能比較複雜，這裡暫時不還原，或可考慮重新整理
        }
    }

    document.querySelectorAll('.shortcut-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            // 停止事件冒泡，防止觸發遊戲內動作或被 preventDefault 攔截
            e.stopPropagation();
            e.preventDefault();

            if (e.key === 'Backspace') {
                input.value = '';
                return;
            }

            let pressedKey = e.key.toUpperCase(); 
            let displayKey = e.key.toUpperCase();
            
            // 特殊按鍵顯示優化
            if (pressedKey === ' ') {
                displayKey = 'SPACE';
            } else if (pressedKey === 'Control') {
                displayKey = 'CONTROL';
            } else if (pressedKey === 'Shift') {
                displayKey = 'SHIFT';
            }

            // 驗證是否在合法名單中
            // 檢查原始 key、小寫 key 以及 TitleCase 格式
            if (!validKeys.has(pressedKey) && 
                !validKeys.has(pressedKey.toLowerCase()) && 
                !validKeys.has(pressedKey.charAt(0).toUpperCase() + pressedKey.slice(1))) {
                return;
            }

            // 查重
            const allInputs = document.querySelectorAll('.shortcut-input');
            let isDuplicate = false;
            allInputs.forEach(other => {
                if (other !== input && other.value === displayKey) isDuplicate = true;
            });

            if (isDuplicate) {
                alert(`按鍵 "${displayKey}" 已被佔用`);
                return;
            }

            input.value = displayKey;
        });
    });

    function syncInputsFromBindings() {
        const inputs = document.querySelectorAll('.shortcut-input');
        const binds = JSON.parse(localStorage.getItem('game_keybinds')) || window.Game.keyBindings || {};

        inputs.forEach(input => {
            const action = input.dataset.action;
            // 尋找對應動作的按鍵 (格式為 { "z": "ATTACK" })
            const key = Object.keys(binds).find(k => binds[k] === action);
            if (key) {
                if (key === ' ') {
                    input.value = 'SPACE';
                } else {
                    input.value = key.toUpperCase();
                }
            } else {
                input.value = '';
            }
        });
    }

    /**
     * 儲存設定並寫入 localStorage
     */
    function handleSaveShortcuts() {
        const inputs = document.querySelectorAll('.shortcut-input');
        const newBinds = {};

        for (const input of inputs) {
            const action = input.dataset.action;
            let val = input.value;

            if (!val) {
                alert(`請為 [${action}] 設定一個按鍵！`);
                return;
            }

            // 轉換回 Game Core 識別的格式
            let storageKey;
            if (val === 'SPACE') {
                storageKey = ' ';
            } else if (val === 'CONTROL') {
                storageKey = 'Control';
            } else if (val === 'SHIFT') {
                storageKey = 'Shift';
            } else if (val === 'ENTER') {
                storageKey = 'Enter';
            } else if (val === 'ESCAPE') {
                storageKey = 'Escape';
            } else if (val.startsWith('ARROW')) {
                // 首字母大寫其餘小寫 (ArrowUp)
                storageKey = val.charAt(0) + val.slice(1).toLowerCase();
            } else {
                storageKey = val.toLowerCase();
            }
            
            newBinds[storageKey] = action;
        }

        window.Game.keyBindings = newBinds;
        localStorage.setItem('game_keybinds', JSON.stringify(newBinds));
        alert("快捷鍵設定已儲存！");
    }

    /**
     * 重置為預設設定
     */
    function handleResetShortcuts() {
        if (confirm("確定要恢復預設快捷鍵嗎？")) {
            // 使用核心預設值
            window.Game.keyBindings = { ...window.Game.initial_keybinds };
            localStorage.setItem('game_keybinds', JSON.stringify(window.Game.keyBindings));
            syncInputsFromBindings();
            alert("已恢復預設設定");
        }
    }

});