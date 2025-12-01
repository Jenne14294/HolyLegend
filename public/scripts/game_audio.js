document.addEventListener('DOMContentLoaded', () => {
    const audioSource = document.getElementById('bg-music-source');
    
    if (audioSource) {
        // 1. 設定音量 (建議不要 100%，以免嚇到人)
        audioSource.volume = 0.4;

        // 2. 嘗試播放
        const playPromise = audioSource.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    // 成功播放 (可能是瀏覽器判定使用者之前已經有互動過)
                    console.log("背景音樂播放中...");
                })
                .catch(error => {
                    // 3. 失敗了 (被瀏覽器擋住)
                    console.log("自動播放被阻擋，等待使用者互動...");

                    // 定義一個「解鎖音樂」的函式
                    const unlockAudio = () => {
                        audioSource.play();
                        // 播放成功後，移除監聽器 (不用再監聽了)
                        document.removeEventListener('click', unlockAudio);
                        document.removeEventListener('touchstart', unlockAudio);
                        document.removeEventListener('keydown', unlockAudio);
                    };

                    // 4. 監聽全域的點擊/觸摸事件
                    // 只要玩家點了網頁任何地方 (例如選單、按鈕)，音樂就會開始
                    document.addEventListener('click', unlockAudio);
                    document.addEventListener('touchstart', unlockAudio);
                    document.addEventListener('keydown', unlockAudio);
                });
        }
    }
});