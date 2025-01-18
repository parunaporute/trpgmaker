// menu.js

// （A）スクリプトのトップレベルで即時実行してしまうパターン
(async function initMenuPage() {
    // 1) APIキーを入力欄に表示
    const savedApiKey = localStorage.getItem("apiKey");
    if (savedApiKey) {
        document.getElementById("api-key-input").value = savedApiKey;
    }

    // 2) シナリオ一覧を取得して表示
    try {
        const scenarioList = await listAllScenarios();  // indexedDB.js の関数
        const container = document.getElementById("scenario-list-container");
        container.innerHTML = "";

        if (scenarioList.length === 0) {
            container.textContent = "進行中のシナリオはありません。";
        } else {
            scenarioList.forEach(scenario => {
                const div = document.createElement("div");
                div.style.margin = "10px 0";

                // シナリオ情報を表示
                const infoText = document.createElement("span");
                infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
                div.appendChild(infoText);

                // 「続きへ」ボタン
                const btn = document.createElement("button");
                btn.textContent = "続きへ";
                btn.addEventListener("click", () => {
                    window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
                });
                div.appendChild(btn);

                container.appendChild(div);
            });
        }
    } catch (err) {
        console.error("シナリオ一覧の取得に失敗:", err);
        const container = document.getElementById("scenario-list-container");
        container.textContent = "シナリオ一覧の取得に失敗しました。再読み込みしてください。";
    }
})();

// -------------------------------------------------------
// 以下はボタンのイベント登録（同じファイル内でOK）
// -------------------------------------------------------

// 「フリーシナリオ」ボタン
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

// 全エレメントをクリア
document.getElementById("clear-character-btn").addEventListener("click", async () => {
    const confirmClear = confirm("エレメント情報をクリアします。よろしいですか？");
    if (confirmClear) {
        window.characterData = [];
        await saveCharacterDataToIndexedDB(window.characterData);
        alert("エレメント情報をクリアしました。");
    }
});

// 履歴クリアボタン（旧フリーシナリオ用）
const clearHistoryBtn = document.getElementById('clear-history-button');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
        const isOk = confirm('履歴をすべて削除します。（シナリオも削除されます）よろしいですか？\n※これは旧フリーシナリオ用機能です。');
        if (!isOk) return;

        // 旧フリーシナリオの localStorage を削除
        localStorage.removeItem('scenario');
        localStorage.removeItem('currentScene');
        // 旧 sceneHistory ストアを消す対応が必要なら実装

        alert("旧フリーシナリオ情報をクリアしました。");
    });
}
