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
            const res = await fetch('/holylegend/game_lobby/classes');
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
        jobListContainer.innerHTML = ''; 

        // 安全檢查
        if (!classes || !Array.isArray(classes)) {
            console.error("Classes data is missing:", classes);
            return;
        }

        // ★ 注意這裡的變數名稱是 job
        classes.forEach(job => {
            // 正確找進度：找該職業的 UserClass！
            const progress = user.UserClasses.find(uc => uc.jobId === job.id);
            const level = progress ? progress.level : 1;

            // 2. 判斷當前職業
            const isCurrent = job.id === user.jobId;

            // 3. 圖片路徑
            const roleName = job.name.charAt(0).toUpperCase() + job.name.slice(1).toLowerCase();
            const imgSrc = `/holylegend/images/classes/${roleName}_1.png`;

            // 4. 【關鍵補回】檢查轉職需求
            let isLocked = false;
            let lockReason = '';

            const reqProgressA = user.UserClasses.find(uc => uc.jobId === job.requireClassA);
            if (job.requireClassA && (!reqProgressA || reqProgressA.level < job.requireClassLevelA)) {
                isLocked = true;
                const reqClassDef = classes.find(c => c.id === job.requireClassA);
                lockReason = `需 ${reqClassDef ? reqClassDef.nickname : '未知職業'} Lv.${job.requireClassLevelA}`;
            }

            const reqProgressB = user.UserClasses.find(uc => uc.jobId === job.requireClassB);
            if (!isLocked && job.requireClassB && (!reqProgressB || reqProgressB.level < job.requireClassLevelB)) {
                isLocked = true;
                const reqClassDef = classes.find(c => c.id === job.requireClassB);
                lockReason = `需 ${reqClassDef ? reqClassDef.nickname : '未知職業'} Lv.${job.requireClassLevelB}`;
            }


            // 按鈕狀態
            let btnText = '切換';
            let btnDisabled = false;
            let btnStyle = "";

            if (isCurrent) btnText = '當前', btnDisabled = true;
            else if (isLocked) btnText = lockReason, btnDisabled = true;


            // 建立卡片
            const card = document.createElement('div');
            card.className = `job-card ${isCurrent ? 'active' : ''}`;
            if (isLocked) card.style.opacity = "0.7";

            card.innerHTML = `
                <div class="job-icon-frame">
                    <img src="${imgSrc}" onerror="this.src='/holylegend/images/classes/Warrior_1.png'">
                </div>
                <div class="job-info">
                    <div class="job-name">${job.nickname}</div>
                    <div class="job-level">Lv. ${level}</div>
                </div>
                <button class="btn-pixel-small btn-select" 
                    ${btnDisabled ? 'disabled' : ''} 
                    style="${btnStyle}">
                    ${btnText}
                </button>
            `;

            // 綁定事件
            const btn = card.querySelector('.btn-select');
            if (!isCurrent && !isLocked) {
                // ★ 修正 1：這裡要用 job.id，不要用 jobDef (undefined)
                // ★ 修正 2：直接傳數字 ID，不要傳整個物件
                btn.addEventListener('click', () => switchJob(job.name));
            }

            jobListContainer.appendChild(card);
        });
    }

    // 執行轉職 (修正為接收 ID)
    async function switchJob(targetJobName) {
        try {
            const res = await fetch('/holylegend/set_role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ★ 修正 3：這裡送出 { jobId: 1 }
                body: JSON.stringify({ role: targetJobName }) 
            });
            const result = await res.json();

            if (result.success) {
                window.location.reload();

            } else {
                alert(result.msg || '轉職失敗');
            }
        } catch (e) {
            console.error(e);
            alert('伺服器錯誤');
        }
    }
});