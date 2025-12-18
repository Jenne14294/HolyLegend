document.addEventListener('DOMContentLoaded', () => {
    // 1. DOM 獲取
    const skillLayer = document.getElementById('skill-layer');
    const btnCloseSkill = document.getElementById('btn-close-skill');
    const btnOpenSkillUI = document.getElementById('btn-open-skill');
    const btnRefreshSkill = document.getElementById('btn-refresh-skill');
    
    // View 區塊
    const viewEquip = document.getElementById('view-equip');
    const viewSynthesis = document.getElementById('view-synthesis');
    const viewHandbook = document.getElementById('view-handbook');
    const viewInventory = document.getElementById('view-inventory');
    
    // 內部元素
    const invGrid = document.getElementById('skill-inventory-grid');
    const equippedCountEl = document.getElementById('equipped-count');
    const handbookGrid = document.getElementById('handbook-grid');
    const collectionRateEl = document.getElementById('collection-rate');
    
    // 合成相關
    const synthesisContainer = document.getElementById('synthesis-area'); 
    const btnDoSynthesis = document.getElementById('btn-do-synthesis');

    // 底部按鈕
    const btnOpenBag = document.getElementById('btn-open-bag');     
    const btnSynthesis = document.getElementById('btn-synthesis');  
    const btnUnequipAll = document.getElementById('btn-unequip-all');
    const btnHandbook = document.getElementById('btn-skill-book'); // 圖鑑按鈕

    const state = window.Game.state;
    const socket = window.Game.socket; 

    // ★★★ 關鍵：這些變數必須是 let，因為會被重新賦值 ★★★
    let currentMode = 'inventory'; 
    let hasUnsavedChanges = false;
    let synthesisSlots = [null, null, null];
    let cachedAllItems = null;

    // 定義 8 個插槽的固定座標 (圓形排列，半徑約 100px)
    // 解決 CSS hover 會導致 transform 位移跑掉的問題
    const SLOT_POSITIONS = [
        { x: 0, y: -70 },   // Slot 1
        { x: 50, y: -50 },  // Slot 2
        { x: 70, y: 0 },    // Slot 3
        { x: 50, y: 50 },   // Slot 4
        { x: 0, y: 70 },    // Slot 5
        { x: -50, y: 50 },  // Slot 6
        { x: -70, y: 0 },   // Slot 7
        { x: -50, y: -50 }  // Slot 8
    ];
    
    // ==========================================
    //  全域介面控制
    // ==========================================
    window.SkillSystem = {
        open: async() => {
            hasUnsavedChanges = false;
            
            switchMode('inventory'); // 預設開啟倉庫模式
            await getSkills();
            renderEquipment(); 
            renderInventory();
            Game.renderStats(); // ★ 開啟時計算屬性
            skillLayer.classList.remove('hidden');
        }
    };

    // 1. 開啟按鈕 (主畫面)
    if (btnOpenSkillUI) {
        btnOpenSkillUI.addEventListener('click', async () => {
            if (window.SkillSystem) window.SkillSystem.open();
        });
    }

    // 2. 關閉按鈕
    if (btnCloseSkill) {
        btnCloseSkill.addEventListener('click', async () => {
            try {
                const response = await fetch('/holylegend/game_lobby/save_skill', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inventory: state.Skills,
                        equipment: state.Equipment
                    })
                });
                const result = await response.json();

                if (result.success) {
                    skillLayer.classList.add('hidden');
                    Game.updateLobbyUI(window.Game)
                }

            } catch {
                console.error("符文儲存失敗", e);
            }
            
        });
    }

    if (btnRefreshSkill) {
        btnRefreshSkill.addEventListener('click', async () => {
            btnRefreshSkill.classList.add('rotating');
            btnRefreshSkill.disabled = true;
            await refreshData();
            setTimeout(() => {
                btnRefreshSkill.classList.remove('rotating');
                btnRefreshSkill.disabled = false;
            }, 500);
        });
    }

    // 3. 切換按鈕：背包
    if (btnOpenBag) {
        btnOpenBag.addEventListener('click', () => {
            switchMode('inventory');
        });
    }

    if (btnUnequipAll) {
        btnUnequipAll.addEventListener('click', () => {
            unequipAllSkills();
        });
    }

    // 4. 切換按鈕：合成
    if (btnSynthesis) {
        btnSynthesis.addEventListener('click', () => {
            switchMode('synthesis');
        });
    }

    if (btnHandbook) {
        btnHandbook.addEventListener('click', () => { 
            switchMode('handbook'); 
        });
    }

    function switchMode(mode) {
        currentMode = mode;
        
        // 1. 先全部隱藏視圖區塊
        viewEquip.classList.add('hidden');
        viewSynthesis.classList.add('hidden');
        viewHandbook.classList.add('hidden');
        viewInventory.classList.add('hidden');

        // 2. 根據模式顯示對應區塊與按鈕
        if (mode === 'inventory') {
            // --- 背包模式 ---
            viewEquip.classList.remove('hidden');     // 顯示裝備/屬性
            viewInventory.classList.remove('hidden'); // 顯示倉庫

            // 按鈕控制
            btnOpenBag.classList.add('hidden');       // 隱藏背包按鈕(自己)
            btnSynthesis.classList.remove('hidden');  // 顯示冶煉
            btnUnequipAll.classList.remove('hidden'); // 顯示一鍵卸下
            btnHandbook.classList.remove('hidden');   // 顯示圖鑑

            renderInventory(); 
            renderEquipment(); 
            Game.renderStats();
        } 
        else if (mode === 'synthesis') {
            // --- 冶煉模式 ---
            viewSynthesis.classList.remove('hidden'); // 顯示冶煉
            viewInventory.classList.remove('hidden'); // 顯示倉庫(選素材)

            // 按鈕控制
            btnOpenBag.classList.remove('hidden');    // 顯示背包(返回)
            btnSynthesis.classList.add('hidden');     // 隱藏冶煉按鈕(自己)
            btnUnequipAll.classList.add('hidden');    // 隱藏一鍵卸下
            btnHandbook.classList.remove('hidden');   // 顯示圖鑑

            // 初始化合成槽
            synthesisSlots = [null, null, null];
            renderSynthesisUI();
            renderInventory(); 
        }
        else if (mode === 'handbook') {
            // --- 圖鑑模式 ---
            viewHandbook.classList.remove('hidden');  // 顯示圖鑑

            // 按鈕控制
            btnOpenBag.classList.remove('hidden');    // 顯示背包(返回)
            btnSynthesis.classList.remove('hidden');     // 隱藏冶煉
            btnUnequipAll.classList.add('hidden');    // 隱藏一鍵卸下
            btnHandbook.classList.add('hidden');      // 隱藏圖鑑按鈕(自己)

            fetchAndRenderHandbook();
        }
    }

    // ==========================================
    //  模式切換邏輯
    // ==========================================
    function renderSynthesisUI() {
        if (!synthesisContainer) return;
        
        // 檢查是否可以合成 (3格都有東西且ID相同)
        const isReady = synthesisSlots.every(item => item !== null) &&
                        (synthesisSlots[0].id === synthesisSlots[1].id && synthesisSlots[1].id === synthesisSlots[2].id);

        synthesisContainer.innerHTML = `
            <div class="inventory-label">--- 符文熔煉 ---</div>
            
            <div class="syn-slots-row">
                ${synthesisSlots.map((item, idx) => `
                    <div class="syn-slot ${item ? 'filled' : ''}" data-index="${idx}">
                        ${item ? `<img src="/holylegend/images/items/${item.image}">` : ''}
                    </div>
                    ${idx < 2 ? '<div class="syn-plus">+</div>' : ''}
                `).join('')}
            </div>

            <div class="anvil-section">
                <!-- 鐵砧圖片 (請確保路徑正確) -->
                <img src="/holylegend/images/other/anvil.png" class="anvil-img">
                <button id="btn-do-synthesis" class="btn-do-synthesis" ${isReady ? '' : 'disabled'}>
                    ⚡ 開始熔煉
                </button>
            </div>
        `;

        // 綁定插槽移除事件
        const slots = synthesisContainer.querySelectorAll('.syn-slot');
        slots.forEach(slot => {
            slot.addEventListener('click', () => {
                const idx = parseInt(slot.dataset.index);
                removeFromSynthesis(idx);
            });
        });

        // 綁定合成按鈕
        const btnDo = document.getElementById('btn-do-synthesis');
        if (btnDo) {
            btnDo.addEventListener('click', performSynthesis);
        }
    }

    // ==========================================
    //  渲染裝備盤 (圓形 8 格) - 修正版
    // ==========================================
    function renderEquipment() {
        // ★ 修正：不再使用 replaceChild，而是直接更新 DOM，避免報錯
        const slots = document.querySelectorAll('.skill-slot');
        const equipment = state.Equipment || new Array(8).fill(null);
        let count = 0;

        slots.forEach((slot, index) => {
            const item = equipment[index];
            const pos = SLOT_POSITIONS[index];
            
            // ★ 強制設定行內樣式，固定位置，防止 CSS hover scale 造成位移
            if (pos) {
                slot.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
                // 如果您希望移除 hover 的放大效果，可以不加 scale
                // 因為行內樣式權重高，這會覆蓋 CSS 中的 :hover transform
            }
            

            // 重置內容與樣式
            slot.innerHTML = '';
            slot.classList.remove('filled');
            
            // 清除舊的點擊事件
            slot.onclick = null; 

            if (item) {
                const itemData = findItemData(item);
                
                if (itemData) {
                    let item_level = item.name.split(' ')[1]
                    if (!item_level) item_level = ""

                    let item_error = ""
                    if (item.requiredClass != state.jobId && item.requiredClass !== null) item_error = "！"

                    slot.classList.add('filled');
                    slot.innerHTML = `
                    <img src="/holylegend/images/items/${item.image}">
                    <div class="skill_level-badge">${item_level}</div>
                    <div class="skill_error-badge">${item_error}</div>
                    `;
                    count++;
                    
                    // ★ 綁定移除事件：點擊直接卸下
                    slot.onclick = () => {
                        unequipSkill(index);
                    };
                }
            } else {
                // 空插槽：點擊無反應，或者可以提示
                slot.onclick = () => {
                    // console.log(`Slot ${index + 1} is empty`);
                };
            }
        });

        if (equippedCountEl) equippedCountEl.innerText = count;
    }

    // ==========================================
    //  渲染技能倉庫 (可點擊裝備)
    // ==========================================
    // ==========================================
    //  ★ 修改：背包渲染 (支援兩種模式)
    // ==========================================
    function renderInventory() {
        if (!invGrid) return;
        invGrid.innerHTML = '';
        
        const items = state.Skills || [];
        // 只顯示技能石
        const skillStones = items.filter(i => 
            (i.category.includes('SKILL') || i.category === 'GENERAL_SKILL') 
        );

        if (skillStones.length === 0) {
            invGrid.innerHTML = '<div class="empty-msg">沒有可用的技能石</div>';
            return;
        }

        // 1. 先進行排序 (a.id - b.id 代表 ID 小的排前面)
        skillStones
            .sort((a, b) => a.id - b.id) 
            .forEach(item => {
                
                // 2. 以下維持你原本的邏輯
                let inSynthesisCount = 0;
                if (currentMode === 'synthesis') {
                    inSynthesisCount = synthesisSlots.filter(s => s && s.id === item.id).length;
                }

                const available = (item.quantity || item.count) - (item.equipped || 0) - inSynthesisCount;

                if (available > 0) {
                    let item_level = item.name.split(' ')[1]
                    if (!item_level) item_level = ""
                    const el = document.createElement('div');
                    el.className = 'inv-item';
                    el.innerHTML = `
                        <img src="/holylegend/images/items/${item.image}">
                        <div class="count-badge">${available}</div>
                        <div class="skill_level-badge">${item_level}</div>
                    `;
                    
                    el.onclick = () => { 
                        if (currentMode === 'inventory') {
                            equipSkill(item); 
                        } else {
                            addToSynthesis(item);
                        }
                    };
                    invGrid.appendChild(el);
                }
            });
    }

    function addToSynthesis(item) {
        // ★★★ 檢查等級：如果是 III 階 (Max Level)，不可放入 ★★★
        const info = getItemLevelInfo(item.name);

        if (info.level >= 3) {
            alert("此符文已達最高階 (III)，無法再進行熔煉！");
            return;
        }

        if (info.category == 'CLASS_SKILL') {
            alert("職業符文無法進行熔煉！");
            return;
        }

        const emptyIdx = synthesisSlots.findIndex(s => s === null);
        
        if (emptyIdx === -1) {
            return; // 滿了
        }

        const firstItem = synthesisSlots.find(s => s !== null);
        if (firstItem && firstItem.id !== item.id) {
            alert("合成必須使用 3 個相同的符文！");
            return;
        }

        synthesisSlots[emptyIdx] = item;
        renderSynthesisUI();
        renderInventory(); 
    }

    function removeFromSynthesis(index) {
        if (synthesisSlots[index] === null) return;
        synthesisSlots[index] = null;
        renderSynthesisUI(); renderInventory();
    }

    async function performSynthesis() {
        if (!confirm("確定要消耗這 3 顆符文進行熔煉嗎？")) return;

        const baseItem = synthesisSlots[0];
        
        // 1. 扣除背包數量 (永久扣除)
        // 因為 synthesisSlots 存的是參照，所以這裡要操作 state.Skills
        const invItem = state.Skills.find(i => i.id === baseItem.id);
        if (invItem) {
            invItem.quantity = (invItem.quantity || 0) - 3;
            // 如果歸零，這裡選擇不移除物件，只是 count=0，下次 fetch 會消失
        }

        // 2. 產生新物品
        // 假設邏輯：下階 ID = 當前 ID + 1 (例如 22->23)
        // 實際應由後端邏輯決定
        const newItemId = baseItem.id + 1;
        
        // 檢查背包是否已有該高階物品
        let newInvItem = state.Skills.find(i => i.id === newItemId);
        
        if (newInvItem) {
            newInvItem.quantity = (newInvItem.quantity || 0) + 1;
        } else {
            // 模擬新物品 (名稱加強)
            // 實際上應該去 DB 撈或是依賴 Socket 回傳，這裡做前端模擬
            try {
                const response = await fetch('/holylegend/system/items');
                const result = await response.json();

                if (result.success) {
                    const data = result.data;
                    const newItem = data.find(item => item.id == newItemId)

                    state.Skills.push({
                        id: newItemId,
                        name: newItem.name,
                        description: newItem.description,
                        image: newItem.image,
                        quantity: 1,
                        equipped: 0,
                        category: newItem.category,
                        effectType: newItem.effectType,
                        effectValue: newItem.effectValue,
                        isPercentage: newItem.isPercentage,
                        requiredClass: newItem.requiredClass
                    });
                }
            } catch (e) {
                console.error("伺服器錯誤", e)
            }
        }

        // 3. 重置
        synthesisSlots = [null, null, null];
        hasUnsavedChanges = true; // 標記存檔

        // 4. 更新介面
        renderSynthesisUI();
        renderInventory();
        alert("🔥 熔煉成功！");
    }

    // ==========================================
    //  邏輯操作
    // ==========================================

    async function equipSkill(item) {
        if (!state.Equipment || state.Equipment.length === 0) state.Equipment = new Array(8).fill(null);

        const emptyIndex = state.Equipment.findIndex(id => id === null);
        
        if (emptyIndex === -1) {
            alert("裝備欄已滿！請點擊上方的技能石卸下後再裝備。");
            return;
        }


        if (item.requiredClass !== null) {
            let samePassive = false
            if (item.requiredClass !== state.jobId) {
                alert("該職業無法裝備此符文");
                return;
            }


            for (let i = 0; i < 9; i++) {
                if (state.Equipment[i] && state.Equipment[i].id == item.id) {
                    samePassive = true
                    break;
                }
            }
            

            if (samePassive) {
                alert("該職業符文同類型只能裝備一個");
                return;
            }
        }

        

        // 執行裝備
        state.Equipment[emptyIndex] = item;
        
        // 扣除背包數量
        item.equipped++; 

        // TODO: 發送 Socket 給後端保存裝備狀態
        // socket.emit('equip_skill', { slot: emptyIndex, itemId: item.id });

        renderEquipment();
        renderInventory();
        Game.renderStats();
        
    }

    function unequipSkill(slotIndex) {
        const item = state.Equipment[slotIndex];
        if (!item) return;

        // 1. 執行卸下
        state.Equipment[slotIndex] = null;
        
        // 2. 加回背包
        // 嘗試在背包找現有的堆疊
        const invItem = state.Skills.find(i => i.id === item.id);
        
        if (invItem) {
            invItem.equipped--;
        } else {
            state.Skills.push(item);
        }

        // 3. 發送 Socket (TODO)
        // socket.emit('unequip_skill', { slot: slotIndex });

        renderEquipment();
        renderInventory();
        Game.renderStats();
    }

    function unequipAllSkills() {
        if (!state.Equipment) return;

        // 檢查是否有裝備任何東西
        const hasItem = state.Equipment.some(item => item !== null);
        if (!hasItem) return; // 本來就全空，不做事

        // 防呆確認 (避免誤觸)
        if (!confirm("確定要卸下所有已裝備的符文嗎？")) return;

        let somethingChanged = false;

        // 遍歷所有插槽 (0~7)
        for (let i = 0; i < 8; i++) {
            const item = state.Equipment[i];
            
            if (item) {
                // 1. 清空該插槽
                state.Equipment[i] = null;

                // 2. 加回背包數量
                // 根據您的邏輯，Equipment 存的是物件，我們用 ID 去 Inventory 找回引用
                const invItem = state.Skills.find(inv => inv.id === item.id);
                
                if (invItem) {
                    // 確保 count 是數字
                    invItem.equipped--;
                }
                
                somethingChanged = true;
            }
        }

        if (somethingChanged) {
            // 標記變更，關閉視窗時會存檔
            hasUnsavedChanges = true;

            // 重新渲染介面
            renderEquipment(); // 清空圓盤
            renderInventory(); // 背包數量加回來
            Game.renderStats();     // 數值歸零
        }
    }

    async function fetchAndRenderHandbook(filterType = 'ALL') {
        if (!handbookGrid) return;
        handbookGrid.innerHTML = '<div class="empty-msg">讀取古老的紀錄...</div>';

        try {
            if (!cachedAllItems) {
                const response = await fetch('/holylegend/system/items'); 
                const result = await response.json();
                if (result.success) cachedAllItems = result.data;
            }

            if (!cachedAllItems) return;

            const myInventoryIds = (state.Skills || []).map(i => i.id);
            handbookGrid.innerHTML = '';
            let collectedCount = 0;
            let totalCount = 0;

            cachedAllItems.forEach(item => {
                if (!['SKILL', 'CLASS_SKILL', 'GENERAL_SKILL'].includes(item.category)) return;
                if (filterType === 'CLASS' && item.category !== 'CLASS_SKILL') return;
                if (filterType === 'GENERAL' && item.category !== 'GENERAL_SKILL') return;

                totalCount++;
                const isUnlocked = myInventoryIds.includes(item.id);
                if (isUnlocked) collectedCount++;

                const card = document.createElement('div');
                let item_level = item.name.split(' ')[1]
                if (!item.name.includes('I')) {
                    item_level = ""
                }
                card.className = `inv-item handbook-item ${isUnlocked ? '' : 'locked'}`;
                card.innerHTML = `
                <img src="/holylegend/images/items/${item.image}">
                <div class="skill_level-badge">${item_level}</div>
                `;
                
                card.onclick = () => {
                    const name = isUnlocked ? item.name : "???";
                    const desc = isUnlocked ? item.description : "尚未獲得此符文";
                    const Class = isUnlocked ? `適用職業：${item.requiredClassDetail.nickname}` : "適用職業：???"
                    alert(`【${name}】\n${desc}\n${Class}`);
                };
                handbookGrid.appendChild(card);
            });

            const collectionRateEl = document.getElementById('collection-rate');
            if (collectionRateEl && totalCount > 0) {
                collectionRateEl.innerText = `${Math.floor((collectedCount / totalCount) * 100)}%`;
            }
        } catch (e) {
            console.error("圖鑑載入錯誤", e);
        }
    }
    
    window.filterHandbook = (type) => fetchAndRenderHandbook(type);

    // 輔助：找物品資料
    async function refreshData() {
        await getSkills()
        await getEquips()
        
        Game.renderStats()
        // 根據當前模式重繪
        switchMode(currentMode);
        
    }

    async function getSkills() {
        const response = await fetch('/holylegend/system/classes');
        const result = await response.json();

        let newSkills = [];

        if (result.success) {
            result.inventoryData.forEach(item => {
                newSkills.push({
                    id: item.itemId,
                    name: item.item.name,
                    image: item.item.image,
                    requiredClass: item.item.requiredClass,
                    category: item.item.category,
                    description: item.item.description,
                    effectType: item.item.effectType,
                    effectValue: item.item.effectValue,
                    isPercentage: item.item.isPercentage,
                    equipped: item.equipped,
                    quantity: item.quantity, 
                })
            })

            state.Skills = newSkills;
        }
    }

    async function getEquips() {
        const response = await fetch('/holylegend/system/classes');
        const result = await response.json();

        let newEquips = [];

        if (result.success) {
            for (let i = 1; i < 9; i++) {
                let baseKey = `slot${i}`
                const equipId = result.equipmentData[baseKey]

                if (!equipId) return;
                const item = result.inventoryData.find(item => item.item.id == equipId)

                if (item) {
                    newEquips.push({
                        id: item.itemId,
                        name: item.item.name,
                        image: item.item.image,
                        requiredClass: item.item.requiredClass,
                        category: item.item.category,
                        description: item.item.description,
                        effectType: item.item.effectType,
                        effectValue: item.item.effectValue,
                        isPercentage: item.item.isPercentage,
                        equipped: item.equipped,
                        quantity: item.quantity, 
                    })
                }
            }

            state.Equipment = newEquips;
        }
    }

    function getItemLevelInfo(name) {
        if (!name) return { baseName: '', level: 0 };

        const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5 };
        // Regex: 匹配結尾的 I, II, III...
        const match = name.match(/^(.*)\s(I|II|III|IV|V)$/);
        let category = "GENERAL_SKILL"

        if (!name.includes('I')) {
            category = "CLASS_SKILL"
        }
        
        if (match) {
            return {
                baseName: match[1], // "生命符文"
                roman: match[2],    // "I"
                level: romanMap[match[2]], // 1
                category: category
            };
        }
        return { baseName: name, roman: '', level: 0, category: category };
    }


    function findItemData(item) {
        if (!item.image) item.image = 'default_skill.png'
        return {id:item.id, image: item.image };
    }
});