/********************************
 * main.js - ページ全体の初期化・イベント登録
 *   (複数シナリオ対応により大幅変更)
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
    document.querySelector('.input-section')?.setAttribute('style', 'display:none;');
    document.querySelector('.game-section')?.setAttribute('style', 'display:block;');

    await loadScenarioData(window.currentScenarioId);

    updateSceneHistory();
    showLastScene();
  }
  else {
    // 旧フリーシナリオの読み込み
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

    // APIキーが無い場合 => input-section, game-section を隠す
    if (!window.apiKey) {
      const inputSec = document.querySelector('.input-section');
      const gameSec = document.querySelector('.game-section');
      if (inputSec) inputSec.style.display = 'none';
      if (gameSec) gameSec.style.display = 'none';
    } else {
      if (window.scenario.trim() !== '') {
        // シナリオがあればゲーム画面
        document.querySelector('.input-section')?.setAttribute('style', 'display:none;');
        document.querySelector('.game-section')?.setAttribute('style', 'display:block;');
      } else {
        // なければ入力画面
        document.querySelector('.input-section')?.setAttribute('style', 'display:block;');
        document.querySelector('.game-section')?.setAttribute('style', 'display:none;');
      }
    }

    // シナリオタイルは本来 scenarioWizard 用 → 旧フリーシナリオなら displayScenarioTile?
    // ひとまず省略可

    // シーン履歴(旧フリーシナリオ)は localStorage に保持してないので空
    window.sceneHistory = [];
  }

  // スポイラーモーダル関連
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

  // 「カードを取得する」ボタン => scene.js の実装例を利用
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    getCardButton.addEventListener("click", async () => {
      // シーン全文を要約して… (旧例) => runGacha(1, addPrompt)
      alert("シーン取得からアイテム化、などのロジックは別途実装してください。");
    });
  }

  // 各種ボタン
  const startBtn = document.getElementById('start-button');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // 旧フリーシナリオ用
      window.scenario = (document.getElementById('scenario-input')?.value || "").trim();
      if (!window.scenario) {
        alert("シナリオを入力してください");
        return;
      }
      localStorage.setItem('scenario', window.scenario);

      document.querySelector('.input-section')?.setAttribute('style', 'display:none;');
      document.querySelector('.game-section')?.setAttribute('style', 'display:block;');
    });
  }

  const nextSceneBtn = document.getElementById('next-scene');
  if (nextSceneBtn) {
    nextSceneBtn.addEventListener('click', () => {
      getNextScene();
    });
  }

  // 画像生成関連
  const autoGenBtn = document.getElementById('image-auto-generate-button');
  if (autoGenBtn) {
    autoGenBtn.addEventListener('click', () => {
      generateImageFromCurrentScene();
    });
  }

  const promptModalBtn = document.getElementById('image-prompt-modal-button');
  if (promptModalBtn) {
    promptModalBtn.addEventListener('click', () => {
      openImagePromptModal();
    });
  }

  const customGenBtn = document.getElementById('image-custom-generate-button');
  if (customGenBtn) {
    customGenBtn.addEventListener('click', () => {
      onCustomImageGenerate();
    });
  }

  const customCancelBtn = document.getElementById('image-custom-cancel-button');
  if (customCancelBtn) {
    customCancelBtn.addEventListener('click', () => {
      closeImagePromptModal();
    });
  }

  const cancelRequestBtn = document.getElementById('cancel-request-button');
  if (cancelRequestBtn) {
    cancelRequestBtn.addEventListener('click', onCancelFetch);
  }

  // 戻るボタン
  const backMenuBtn = document.getElementById('back-to-menu');
  if (backMenuBtn) {
    backMenuBtn.addEventListener('click', () => {
      window.location.href = "index.html";
    });
  }
};
