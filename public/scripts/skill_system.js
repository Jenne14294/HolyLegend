document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素獲取
    const skillLayer = document.getElementById('skill-layer');
    const btnCloseSkill = document.getElementById('btn-close-skill');
    
    // 主畫面的入口按鈕
    const btnOpenSkillUI = document.getElementById('btn-open-skill');
    
    // 內部介面元素
    const forgeStage = document.querySelector('.forge-stage'); // ★ 新增：獲取裝備區容器
    const statsArea = document.getElementById('stats-area'); // ★ 新增 DOM
    const invArea = document.querySelector('.inventory-area');
    const invGrid = document.getElementById('skill-inventory-grid');
    const equippedCountEl = document.getElementById('equipped-count');
    
    // 底部切換按鈕
    const btnOpenBag = document.getElementById('btn-open-bag');     // 切換到倉庫
    const btnUnequipAll = document.getElementById('btn-unequip-all');   
    const btnSynthesis = document.getElementById('btn-synthesis');  // 切換到合成

    // 狀態變數
    const state = window.Game.state;
    let currentMode = 'inventory'; // 'inventory' (倉庫) 或 'synthesis' (合成)
    let synthesisContainer = null; // 合成介面的 DOM

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
    //  初始化：建立合成介面 HTML (若不存在)
    // ==========================================
    if (!document.getElementById('synthesis-area')) {
        synthesisContainer = document.createElement('div');
        synthesisContainer.id = 'synthesis-area';
        synthesisContainer.className = 'inventory-area hidden'; // 預設隱藏
        synthesisContainer.style.display = 'none';
        
        synthesisContainer.innerHTML = `
            <div class="inventory-label">--- 符文熔煉 ---</div>
            <div class="synthesis-box" style="text-align:center; margin-top:20px; color:#aaa;">
                <div style="font-size:3rem; margin-bottom:10px;">🔥</div>
                <p>將 3 顆低階符文</p>
                <p>熔煉為 1 顆高階符文</p>
                <div style="margin-top:20px; border: 2px dashed #555; padding: 20px; border-radius: 8px;">
                    (尚未開放)
                </div>
            </div>
        `;
        
        // 插入到 inventory-area 之後
        if (invArea && invArea.parentNode) {
            invArea.parentNode.insertBefore(synthesisContainer, document.querySelector('.skill-footer'));
        }
    } else {
        synthesisContainer = document.getElementById('synthesis-area');
    }

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

    // ==========================================
    //  模式切換邏輯
    // ==========================================
    function switchMode(mode) {
        currentMode = mode;

        if (mode === 'inventory') {
            // ★ 切換到倉庫模式：顯示裝備區
            if (forgeStage) forgeStage.style.display = 'flex';

            // 顯示倉庫，隱藏合成
            if (invArea) invArea.style.display = 'block';
            if (synthesisContainer) synthesisContainer.style.display = 'none';
            
            // 按鈕顯示控制：在倉庫時，隱藏「背包按鈕」，顯示「合成按鈕」
            if (btnOpenBag) btnOpenBag.style.display = 'none';
            if (btnSynthesis) btnSynthesis.style.display = 'block';

            renderInventory(); // 重繪倉庫
            renderEquipment(); // 重繪裝備 (確保顯示更新)
        } 
        else if (mode === 'synthesis') {
            // ★ 切換到合成模式：隱藏裝備區
            if (forgeStage) forgeStage.style.display = 'none';

            // 顯示合成，隱藏倉庫
            if (invArea) invArea.style.display = 'none';
            if (synthesisContainer) synthesisContainer.style.display = 'block';

            // 按鈕顯示控制：在合成時，顯示「背包按鈕」，隱藏「合成按鈕」
            if (btnOpenBag) btnOpenBag.style.display = 'block';
            if (btnSynthesis) btnSynthesis.style.display = 'none';
            
            // TODO: renderSynthesis() 
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
                    slot.classList.add('filled');
                    slot.innerHTML = `<img src="/holylegend/images/items/${itemData.image}">`;
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
    function renderInventory() {
        if (!invGrid) return;
        invGrid.innerHTML = '';
        
        // 過濾出技能石
        const items = state.Skills || [];
        const skillStones = items.filter(i => 
            (i.category === 'SKILL' || i.category === 'CLASS_SKILL' || i.category === 'GENERAL_SKILL') && (i.quantity - i.equipped) > 0
        );

        if (skillStones.length === 0) {
            invGrid.innerHTML = '<div class="empty-msg">沒有可用的技能石</div>';
            return;
        }

        skillStones.forEach(item => {
            const el = document.createElement('div');
            el.className = 'inv-item';
            el.innerHTML = `
                <img src="/holylegend/images/items/${item.image}">
                <div class="count-badge">${item.quantity - item.equipped}</div>
            `;
            
            // 點擊事件：裝備
            el.onclick = () => {
                equipSkill(item);
            };
            
            invGrid.appendChild(el);
        });
    }

    // ==========================================
    //  邏輯操作
    // ==========================================

    function equipSkill(item) {
        if (!state.Equipment || state.Equipment.length === 0) state.Equipment = new Array(8).fill(null);

        const emptyIndex = state.Equipment.findIndex(id => id === null);
        
        if (emptyIndex === -1) {
            alert("裝備欄已滿！請點擊上方的技能石卸下後再裝備。");
            return;
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

    // 輔助：找物品資料
    function findItemData(item) {
        if (!item.image) item.image = 'default_skill.png'
        return {id:item.id, image: item.image };
    }
});