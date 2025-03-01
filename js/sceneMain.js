/********************************
 * sceneMain.js
 *  - ページ全体の初期化・イベント登録
 *  - 複数シナリオ対応
 *  - ユニークスロット方式ロード対応
 ********************************/

window.addEventListener("DOMContentLoaded", () => {
  const autoCbx = document.getElementById("auto-generate-candidates-checkbox");
  if (autoCbx) {
    // 初期状態読み込み
    autoCbx.checked = (localStorage.getItem("autoGenerateCandidates") === "true");

    // 変更時に保存
    autoCbx.addEventListener("change", () => {
      localStorage.setItem("autoGenerateCandidates", autoCbx.checked);
    });
  }

  // シーン生成ボタン
  const nextSceneBtn = document.getElementById("next-scene");
  if (nextSceneBtn) {
    nextSceneBtn.addEventListener("click", () => {
      getNextScene();
    });
  }

  // 戻るボタン（暫定で history.back()）
  const backToMenuBtn = document.getElementById("back-to-menu");
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener("click", () => {
      history.back();
    });
  }
});

window.onload = async () => {
  // 1) IndexedDB初期化
  await initIndexedDB();

  // 2) APIキー読み込み
  const savedApiKey = localStorage.getItem('apiKey');
  if (savedApiKey) {
    window.apiKey = savedApiKey;
  }

  // 3) URLパラメータを解析
  const urlParams = new URLSearchParams(window.location.search);

  // ▼ まず「slotIndex=.. & action=load」があれば、ユニークスロットからロード
  const slotIndexStr = urlParams.get("slotIndex");
  const action = urlParams.get("action");

  if (slotIndexStr && action === "load") {
    // ユニークスロットロード: universalSaves ストアから取得
    const sIdx = parseInt(slotIndexStr, 10);
    const slotRec = await getUniversalSave(sIdx);
    if (!slotRec || !slotRec.data) {
      alert("指定されたスロットが存在しない、または空です。ロードできません。");
      return;
    }
    const scenarioIdToLoad = slotRec.data.scenarioId;
    if (!scenarioIdToLoad) {
      alert("スロットにシナリオ情報がありません。ロードできません。");
      return;
    }

    // DBにシナリオがあるか確認
    const scObj = await getScenarioById(scenarioIdToLoad);
    if (!scObj) {
      alert("スロット内のシナリオがDBに存在しません。ロード不可。");
      return;
    }

    // シナリオIDを切り替え
    window.currentScenarioId = scenarioIdToLoad;

    // doLoadScenarioFromSlot() でDBのシーン履歴を上書きし、画面を更新
    await doLoadScenarioFromSlot(slotRec.data);

    // UI切り替え: inputセクション非表示、ゲーム画面表示
    const inputSec = document.querySelector('.input-section');
    if (inputSec) inputSec.style.display = 'none';
    const gameSec = document.querySelector('.game-section');
    if (gameSec) gameSec.style.display = 'block';

    alert(`スロット${sIdx}をロードし、シナリオID ${scenarioIdToLoad} を表示しました。`);
    return; // ここで完了
  }

  // ▼ それ以外は、従来の「?scenarioId=」をチェック
  const scenarioIdStr = urlParams.get("scenarioId");
  const scenarioId = scenarioIdStr ? parseInt(scenarioIdStr, 10) : null;
  window.currentScenarioId = scenarioId || null;

  // 4) シナリオIDがあれば、DBから読み込んで画面を構築
  if (window.currentScenarioId) {
    // 旧の「入力セクション」は非表示、ゲーム画面のみ表示
    const inputSec = document.querySelector('.input-section');
    if (inputSec) inputSec.style.display = 'none';

    const gameSec = document.querySelector('.game-section');
    if (gameSec) gameSec.style.display = 'block';

    // sceneManager.js 側の loadScenarioData() でシナリオ＆履歴を取得して表示
    await loadScenarioData(window.currentScenarioId);
    // updateSceneHistory(); // 必要なら
  }

  // -------- ネタバレ関連 --------
  const spoilerModal = document.getElementById("spoiler-modal");
  const spoilerButton = document.getElementById("spoiler-button");
  const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");
  if (spoilerButton) {
    spoilerButton.addEventListener("click", () => {
      spoilerModal.style.display = "flex";
    });
  }
  if (closeSpoilerModalBtn) {
    closeSpoilerModalBtn.addEventListener("click", () => {
      spoilerModal.style.display = "none";
    });
  }

  // 画像生成 (自動)
  const autoGenBtn = document.getElementById('image-auto-generate-button');
  if (autoGenBtn) {
    autoGenBtn.addEventListener('click', () => {
      generateImageFromCurrentScene();
    });
  }

  // 画像生成 (カスタム)
  const promptModalBtn = document.getElementById('image-prompt-modal-button');
  if (promptModalBtn) {
    promptModalBtn.addEventListener('click', () => {
      openImagePromptModal();
    });
  }

  // カスタム画像生成 決定
  const customGenBtn = document.getElementById('image-custom-generate-button');
  if (customGenBtn) {
    customGenBtn.addEventListener('click', () => {
      onCustomImageGenerate();
    });
  }

  // カスタム画像生成 キャンセル
  const customCancelBtn = document.getElementById('image-custom-cancel-button');
  if (customCancelBtn) {
    customCancelBtn.addEventListener('click', () => {
      closeImagePromptModal();
    });
  }

  // リクエストキャンセル
  const cancelRequestBtn = document.getElementById('cancel-request-button');
  if (cancelRequestBtn) {
    cancelRequestBtn.addEventListener('click', onCancelFetch);
  }

  // メニューに戻るボタン
  const backMenuBtn = document.getElementById('back-to-menu');
  if (backMenuBtn) {
    backMenuBtn.addEventListener('click', () => {
      window.location.href = "index.html";
    });
  }

  // ▼ 全クリアボタン
  const clearAllSlotsBtn = document.getElementById("clear-all-slots-button");
  if (clearAllSlotsBtn) {
    clearAllSlotsBtn.addEventListener("click", onClearAllSlots);
  }
  // 背景の初期化
  await initBackground("scenario");
};
