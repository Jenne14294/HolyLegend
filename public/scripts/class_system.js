document.addEventListener('DOMContentLoaded', () => {
    
    // --- 變數宣告 ---
    const lobbyLayer = document.getElementById('lobby-layer');
    const towerLayer = document.getElementById('tower-layer');
    const bg_audio = document.getElementById('bg-music-source');
    
    // 職業系統相關元素
    const jobLayer = document.getElementById('job-layer');
    const jobListContainer = document.getElementById('job-list-container');
    const btnCloseJob = document.getElementById('btn-close-job');
    // 抓取底部選單的第一個按鈕 (職業)
    const btnOpenJob = document.querySelector('.bottom-menu .menu-btn:first-child');


    // ===========================
    // 3. 職業切換系統 (Job System)
    // ===========================
    // 打開職業選單
    if (btnOpenJob) {
        btnOpenJob.addEventListener('click', () => {
            lobbyLayer.classList.add('hidden');
            jobLayer.classList.remove('hidden');
            fetchAndRenderJobs(); // 每次打開都重新抓資料
        });
    }

    // 關閉職業選單
    if (btnCloseJob) {
        btnCloseJob.addEventListener('click', () => {
            jobLayer.classList.add('hidden');
            lobbyLayer.classList.remove('hidden');
        });
    }

    // 抓取並渲染職業列表
    async function fetchAndRenderJobs() {
        if (!jobListContainer) return;
        jobListContainer.innerHTML = '<div class="loading-text">讀取中...</div>';
        
        try {
            const res = await fetch('/holylegend/system/classes');
            const result = await res.json();
            
            if (result.success) {
                renderJobCards(result.classData, result.userData);
            } else {
                jobListContainer.innerHTML = '<div class="loading-text">讀取失敗</div>';
            }
        } catch (e) {
            console.error(e);
            jobListContainer.innerHTML = '<div class="loading-text">連線錯誤</div>';
        }
    }

    // 生成卡片 HTML
    function renderJobCards(classes, user) {
        const jobListContainer = document.getElementById('job-list-container');
        if (!jobListContainer) return;

        jobListContainer.innerHTML = ''; 

        // 安全檢查
        if (!classes || !Array.isArray(classes)) {
            console.error("Classes data is missing:", classes);
            return;
        }

        classes.forEach(job => {
            // 1. 找進度
            const progress = user.UserClasses.find(uc => uc.jobId === job.id);
            const level = progress ? progress.level : 1;

            // 2. 判斷當前職業
            const isCurrent = job.id === user.jobId;

            // 3. 圖片路徑
            const roleName = job.name.charAt(0).toUpperCase() + job.name.slice(1).toLowerCase();
            const imgSrc = `/holylegend/images/classes/${roleName}_1.png`;

            // 4. 檢查轉職需求
            let isLocked = false;
            let lockReason = '';

            const reqProgressA = user.UserClasses.find(uc => uc.jobId === job.requireClassA);
            if (job.requireClassA && (!reqProgressA || reqProgressA.level < job.requireClassLevelA)) {
                isLocked = true;
                const reqClassDef = classes.find(c => c.id === job.requireClassA);
                lockReason = `需 ${reqClassDef ? reqClassDef.nickname : '職業A'} Lv.${job.requireClassLevelA}`;
            }

            const reqProgressB = user.UserClasses.find(uc => uc.jobId === job.requireClassB);
            if (!isLocked && job.requireClassB && (!reqProgressB || reqProgressB.level < job.requireClassLevelB)) {
                isLocked = true;
                const reqClassDef = classes.find(c => c.id === job.requireClassB);
                lockReason = `需 ${reqClassDef ? reqClassDef.nickname : '職業B'} Lv.${job.requireClassLevelB}`;
            }

            // 按鈕與狀態文字
            let btnText = '切換';
            let btnDisabled = false;
            let cardClass = 'job-card';

            if (isCurrent) {
                btnText = '當前使用';
                btnDisabled = true;
                cardClass += ' active';
            } else if (isLocked) {
                btnText = '未解鎖'; // 按鈕顯示簡短文字
                btnDisabled = true;
                cardClass += ' locked';
            }

            // 建立卡片 DOM
            const card = document.createElement('div');
            card.className = cardClass;

            // 如果鎖定，點擊卡片顯示詳細原因 (因為按鈕太小塞不下)
            if (isLocked) {
                card.title = lockReason; 
                card.onclick = () => alert(`解鎖條件：\n${lockReason}`);
            }

            card.innerHTML = `
                <!-- 圓形頭像 -->
                <div class="job-icon-frame">
                    <img src="${imgSrc}" onerror="this.src='/holylegend/images/classes/Novice_1.png'">
                </div>
                
                <!-- 職業名稱 -->
                <div class="job-name">${job.nickname}</div>

                <!-- 等級標籤 (懸浮在右下) -->
                <div class="job-level-badge">Lv.${level}</div>

                <!-- 底部按鈕 -->
                <button class="btn-pixel-small btn-select" 
                    ${btnDisabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            `;

            // 綁定切換事件
            const btn = card.querySelector('.btn-select');
            if (!isCurrent && !isLocked) {
                // 傳遞 job.name 或 job.id 給切換函式
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 避免觸發卡片點擊
                    switchJob(job.name);
                });
            }

            jobListContainer.appendChild(card);
        });
    }

    // 執行轉職 (修正為接收 ID)
    async function switchJob(targetJobName) {
        const jobLayer = document.getElementById('job-layer');
        const MainLayer = document.getElementById('lobby-layer');

        try {
            const res = await fetch('/holylegend/set_role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ★ 修正 3：這裡送出 { jobId: 1 }
                body: JSON.stringify({ role: targetJobName }) 
            });
            const result = await res.json();

            if (result.success) {
                const res = await fetch('/holylegend/system/status');
                const result = await res.json();

                if (result.success) {
                    const data = result.data;
   
                    window.Game.state.playerBaseMaxHp = data.maxHp;
                    window.Game.state.playerBaseMaxMp = data.maxMp;
                    window.Game.state.level = data.level;
                    window.Game.state.currentFloor = 1;
                    window.Game.state.jobId = data.classId;
                    window.Game.state.role = data.role; // 記錄職業
                    window.Game.state.AdditionState = data.AdditionState;
                    window.Game.state.AdditionEXP = 0;
                    window.Game.state.avatar = data.avatar;
                    window.Game.InitData.nickname = data.nickname;
                    window.Game.InitData.exp = data.exp;
                    window.Game.InitData.needEXP = data.needEXP;

                    window.Game.renderStats();
                    window.Game.updateLobbyUI(window.Game);
                    
                    alert('轉職成功！')
                    jobLayer.classList.add('hidden');
                    MainLayer.classList.remove('hidden');

                    const socket = window.Game.socket;

                    socket.emit('player_job_changed', {
                        // 只傳送需要的變動資料，Server 會處理廣播
                        newLevel: data.level,
                        newRole: data.role,
                        newMaxHp: data.maxHp,
                        newMaxMp: data.maxMp,
                        newAdditionState: data.AdditionState,
                        // 確保隊友能知道這個人現在的血量 (通常是滿血)
                        currentHp: data.hp, 
                        currentMp: data.mp,
                        avatar: data.avatar
                    });
                }

                
            } else {
                alert(result.msg || '轉職失敗');
            }
        } catch (e) {
            console.error(e);
            alert('伺服器錯誤');
        }
    }
});