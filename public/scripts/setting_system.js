document.addEventListener('DOMContentLoaded', () => {

    // DOM 元素
    const lobbyLayer = document.getElementById('lobby-layer');
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

    // 取得 Game Core 參考
    const bgMusic = document.getElementById('bg-music-source');

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

});