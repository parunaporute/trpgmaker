// menu.js

// ▼ シナリオ削除用：選択中のscenarioIdを一時的に保存する変数
let scenarioIdToDelete = null;

// -----------------------------------------
// トースト表示用のユーティリティ関数
// -----------------------------------------
function showToast(message) {
  // 既に表示中のトーストがあれば削除する
  const oldToast = document.getElementById("toast-message");
  if (oldToast) {
    oldToast.remove();
  }
  
  // トースト用の要素を生成
  const toast = document.createElement("div");
  toast.id = "toast-message";
  toast.textContent = message;

  // スタイル（シンプルな例）
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  toast.style.color = "#fff";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "4px";
  toast.style.fontSize = "14px";
  toast.style.zIndex = "9999";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s ease";

  document.body.appendChild(toast);

  // 少し待ってからフェードイン
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // 3秒後にフェードアウトして消す
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

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

                // シナリオ情報
                const infoText = document.createElement("span");
                infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
                div.appendChild(infoText);

                // 「続きへ」ボタン
                const btnContinue = document.createElement("button");
                btnContinue.textContent = "続きへ";
                btnContinue.style.marginRight = "6px";
                btnContinue.addEventListener("click", () => {
                    window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
                });
                div.appendChild(btnContinue);

                // 「削除」ボタン
                const btnDelete = document.createElement("button");
                btnDelete.textContent = "削除";
                btnDelete.style.backgroundColor = "#f44336";
                btnDelete.addEventListener("click", () => {
                    // 削除確認モーダルを表示し、削除対象IDを保持
                    scenarioIdToDelete = scenario.scenarioId;
                    showDeleteScenarioModal(true);
                });
                div.appendChild(btnDelete);

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
// 以下はボタンなどのイベント登録
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
        showToast("APIキーが設定されました。");
    } else {
        showToast("APIキーを入力してください。");
    }
});

// APIキークリア
document.getElementById("clear-api-key-button").addEventListener("click", function () {
    const confirmClear = confirm("APIキーをクリアすると操作ができなくなります。よろしいですか？");
    if (confirmClear) {
        localStorage.removeItem("apiKey");
        showToast("APIキーがクリアされました。");
    }
});

// 全エレメントをクリア
document.getElementById("clear-character-btn").addEventListener("click", async () => {
    const confirmClear = confirm("エレメント情報をクリアします。よろしいですか？");
    if (confirmClear) {
        window.characterData = [];
        await saveCharacterDataToIndexedDB(window.characterData);
        showToast("エレメント情報をクリアしました。");
    }
});

// 旧フリーシナリオ用の履歴クリア
const clearHistoryBtn = document.getElementById('clear-history-button');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
        const isOk = confirm('履歴をすべて削除します。（シナリオも削除されます）よろしいですか？\n※これは旧フリーシナリオ用機能です。');
        if (!isOk) return;

        // 旧フリーシナリオの localStorage を削除
        localStorage.removeItem('scenario');
        localStorage.removeItem('currentScene');
        showToast("旧フリーシナリオ情報をクリアしました。");
    });
}

/* ----------------------------------------------------
   シナリオ削除用モーダルの制御 (index.html 内に実装)
---------------------------------------------------- */
function showDeleteScenarioModal(show) {
    const modal = document.getElementById("delete-scenario-modal");
    if (!modal) return;
    modal.style.display = show ? "flex" : "none";
}

// モーダル内「OK」ボタン
document.getElementById("delete-scenario-ok").addEventListener("click", async () => {
    if (scenarioIdToDelete == null) {
        showDeleteScenarioModal(false);
        return;
    }
    try {
        await deleteScenarioById(scenarioIdToDelete);  // indexedDB.js の関数
        showToast(`シナリオ(ID:${scenarioIdToDelete})を削除しました。`);
    } catch (err) {
        console.error(err);
        showToast("シナリオ削除に失敗:\n" + err.message);
    }
    scenarioIdToDelete = null;
    showDeleteScenarioModal(false);

    // 一覧を再描画するためページをリロード
    location.reload();
});

// モーダル内「キャンセル」ボタン
document.getElementById("delete-scenario-cancel").addEventListener("click", () => {
    scenarioIdToDelete = null;
    showDeleteScenarioModal(false);
});

document.getElementById("sample-btn").addEventListener("click", () => {
    showToast("ほげ");
});
