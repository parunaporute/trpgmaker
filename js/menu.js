// menu.js

// 「シナリオ」ボタン押下で scenario.html へ遷移
document.getElementById("scenario").addEventListener("click", function () {
    window.location.href = "scenario.html";
});

// APIキー設定
document.getElementById("set-api-key-button").addEventListener("click", function () {
    const apiKey = document.getElementById("api-key-input").value.trim();
    if (apiKey) {
        localStorage.setItem("apiKey", apiKey);
        alert("APIキーが設定されました。");
    } else {
        alert("APIキーを入力してください。");
    }
});

// APIキークリア
document.getElementById("clear-api-key-button").addEventListener("click", function () {
    const confirmClear = confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？");
    if (confirmClear) {
        localStorage.removeItem("apiKey");
        alert("APIキーがクリアされました。");
    }
});

// ページ読み込み時にAPIキーを入力欄に表示
window.addEventListener("load", function () {
    const savedApiKey = localStorage.getItem("apiKey");
    if (savedApiKey) {
        document.getElementById("api-key-input").value = savedApiKey;
    }
});

/** パーティ作成ボタン押下時、partyCreate.htmlへ */
document.getElementById("party-create").addEventListener("click", () => {
    window.location.href = "partyCreate.html";
});

// エレメントクリアボタン
document.getElementById("clear-character-btn").addEventListener("click", async () => {
    const confirmClear = confirm("エレメント情報をクリアします。よろしいですか？");
    if (confirmClear) {
        window.characterData = [];
        await saveCharacterDataToIndexedDB(window.characterData);
        document.getElementById("card-container").innerHTML = "";
        alert("エレメント情報をクリアしました。");
    }
});

// 履歴クリアボタン
const clearHistoryBtn = document.getElementById('clear-history-button');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
        const isOk = confirm('履歴をすべて削除します。（シナリオも削除されます）よろしいですか？');
        if (!isOk) return;

        // IndexedDB の sceneHistory をクリア
        if (window.sceneHistory && window.sceneHistory.length > 0) {
            // IndexedDBのストアを直接クリアするためにトランザクションを利用
            if (window.indexedDB) {
                try {
                    const tx = db.transaction("sceneHistory", "readwrite");
                    const store = tx.objectStore("sceneHistory");
                    await new Promise((resolve, reject) => {
                        const clearRequest = store.clear();
                        clearRequest.onsuccess = () => resolve();
                        clearRequest.onerror = (err) => reject(err);
                    });
                } catch (err) {
                    console.error("IndexedDBクリア失敗:", err);
                }
            }
            window.sceneHistory = [];
            await saveSceneHistoryToIndexedDB(window.sceneHistory);
        }

        localStorage.removeItem('currentScene');

        // シナリオも削除する
        localStorage.removeItem('scenario');
        window.scenario = '';

        window.sceneHistory = [];
        window.currentScene = 0;

        document.getElementById('story').textContent = '';
        document.getElementById('player-action').textContent = '';
        document.getElementById('player-input').value = '';
        document.getElementById('next-scene').style.display = 'none';
        document.getElementById('player-input').style.display = 'none';

        // 状態に応じたセクションの表示切替
        // ※ シナリオが削除されているので input-section を表示、game-section を非表示とする
        document.querySelector('.input-section').style.display = 'block';
        document.querySelector('.game-section').style.display = 'none';

        // 履歴とシナリオタイル再表示
        displayScenarioTile();
        updateSceneHistory();
    });
}