/********************************
 * main.js
 * - ページ全体の初期化・イベント登録
 * - 複数シナリオ対応
 * - 旧フリーシナリオモードの残存ロジックも保持
 ********************************/

window.onload = async () => {
  // 1) IndexedDB初期化
  await initIndexedDB();

  // 2) APIキー読み込み
  const savedApiKey = localStorage.getItem('apiKey');
  if (savedApiKey) {
    window.apiKey = savedApiKey;
  }

  // 3) URLパラメータで scenarioId を読み取る
  const urlParams = new URLSearchParams(window.location.search);
  const scenarioIdStr = urlParams.get("scenarioId");
  const scenarioId = scenarioIdStr ? parseInt(scenarioIdStr, 10) : null;

  window.currentScenarioId = scenarioId || null;

  // 4) もし scenarioId があれば => loadScenarioData => sceneHistory 表示
  if (window.currentScenarioId) {
    // シナリオIDがある => 新しい複数シナリオ方式

    // 画面の構成: シナリオ入力セクションを隠して、ゲーム画面セクションを表示
    const inputSec = document.querySelector('.input-section');
    if (inputSec) inputSec.style.display = 'none';
    const gameSec = document.querySelector('.game-section');
    if (gameSec) gameSec.style.display = 'block';

    // scene.js 側の「loadScenarioData」で DBからシナリオと履歴を取得し、window.sceneHistoryに格納
    await loadScenarioData(window.currentScenarioId);

    // 取得した sceneHistory を一覧表示
    updateSceneHistory();
    // 最新シーンをメイン表示
    showLastScene();
  }
  else {
    // シナリオIDが無い => 旧フリーシナリオモード

    // LocalStorageからシナリオを読み込み
    const savedScenario = localStorage.getItem('scenario');
    if (savedScenario) {
      window.scenario = savedScenario;
    } else {
      window.scenario = '';
    }
    const savedCurrentScene = localStorage.getItem('currentScene');
    if (savedCurrentScene) {
      window.currentScene = parseInt(savedCurrentScene, 10);
    } else {
      window.currentScene = 0;
    }

    // APIキーが無い場合 => 入力やゲーム画面を隠す
    if (!window.apiKey) {
      const inputSec = document.querySelector('.input-section');
      const gameSec = document.querySelector('.game-section');
      if (inputSec) inputSec.style.display = 'none';
      if (gameSec) gameSec.style.display = 'none';
    }
    else {
      // シナリオがある場合 => ゲーム画面を表示
      if (window.scenario.trim() !== '') {
        const inputSec = document.querySelector('.input-section');
        if (inputSec) inputSec.style.display = 'none';
        const gameSec = document.querySelector('.game-section');
        if (gameSec) gameSec.style.display = 'block';
      } else {
        // まだシナリオが無い => 入力画面を表示
        const inputSec = document.querySelector('.input-section');
        if (inputSec) inputSec.style.display = 'block';
        const gameSec = document.querySelector('.game-section');
        if (gameSec) gameSec.style.display = 'none';
      }
    }

    // 旧フリーシナリオでは sceneHistory はIndexedDBに保存していなかった想定 => 空のまま
    window.sceneHistory = [];
  }

  // ---------- ネタバレ（目的達成型）用 ----------
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

  // ---------- 「カードを取得する」ボタン（探索型向け） ----------
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    // ※「scenarioPage.js」でリスナーを付ける実装でも可
    // ここでは何もしない or scenarioPage.jsで付与
  }

  // ---------- 各種ボタンイベント ----------

  // 旧フリーシナリオ: ゲーム開始ボタン
  const startBtn = document.getElementById('start-button');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // フリーシナリオ用に localStorage へ保存
      window.scenario = (document.getElementById('scenario-input')?.value || "").trim();
      if (!window.scenario) {
        alert("シナリオを入力してください");
        return;
      }
      localStorage.setItem('scenario', window.scenario);

      // 入力画面を隠してゲーム画面を表示
      const inputSec = document.querySelector('.input-section');
      if (inputSec) inputSec.style.display = 'none';
      const gameSec = document.querySelector('.game-section');
      if (gameSec) gameSec.style.display = 'block';
    });
  }

  // 次のシーン
  const nextSceneBtn = document.getElementById('next-scene');
  if (nextSceneBtn) {
    nextSceneBtn.addEventListener('click', () => {
      getNextScene();
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

  // カスタム画像生成決定
  const customGenBtn = document.getElementById('image-custom-generate-button');
  if (customGenBtn) {
    customGenBtn.addEventListener('click', () => {
      onCustomImageGenerate();
    });
  }

  // カスタム画像生成キャンセル
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
};
