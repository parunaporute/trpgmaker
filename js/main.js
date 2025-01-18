/********************************
 * main.js - ページ全体の初期化・イベント登録
 ********************************/

window.onload = async () => {
  // まずIndexedDB初期化（sceneHistory と characterData の両方を利用）
  await initIndexedDB();

  // ローカルストレージから各種情報を取得
  const savedApiKey = localStorage.getItem('apiKey');
  if (savedApiKey) {
    window.apiKey = savedApiKey;
  }

  // ▼ ウィザードデータがあるかどうかをチェック
  let wizardData = null;
  const wizardDataStr = localStorage.getItem("wizardData");
  if(wizardDataStr){
    try {
      wizardData = JSON.parse(wizardDataStr);
    } catch(e){}
  }

  // scenario(フリー入力) を優先するが、URLクエリにfromWizard=true ならウィザードデータを使う
  const urlParams = new URLSearchParams(window.location.search);
  const fromWizard = urlParams.get("fromWizard") === "true";

  if(fromWizard && wizardData){
    // ウィザードのサマリを window.scenario に設定
    window.scenario = wizardData.scenarioSummary || "";
    // さらに scenarioType / clearCondition も持っておく
    window.scenarioType = wizardData.scenarioType;  // "objective" or "exploration"
    window.clearCondition = wizardData.clearCondition; // 目的達成型でのみ使う

    // localStorageにも一応保存（リロードに備える）
    localStorage.setItem('scenario', window.scenario);
    // ただし クリア条件は表シナリオに含めない
  } else {
    // フリーシナリオ時と同じ扱い
    const savedScenario = localStorage.getItem('scenario');
    if (savedScenario) {
      window.scenario = savedScenario;
      if (window.scenario === '（シナリオは未入力です）') {
        window.scenario = '';
        localStorage.removeItem('scenario');
      }
    }
  }

  // sceneHistory は IndexedDB から取得
  const loadedHistory = await loadSceneHistoryFromIndexedDB();
  window.sceneHistory = loadedHistory || [];

  // currentScene は localStorage から読み取る
  const savedCurrentScene = localStorage.getItem('currentScene');
  if (savedCurrentScene) {
    window.currentScene = parseInt(savedCurrentScene, 10);
  } else {
    window.currentScene = 0;
  }

  // scenarioType をチェックして、目的達成型ならネタバレボタン表示、探索型なら「カードを取得する」ボタンを表示
  if(window.scenarioType === "objective"){
    document.getElementById("spoiler-button").style.display = "inline-block";
    // クリア条件をモーダルに表示
    const spoilerTextEl = document.getElementById("clear-condition-text");
    if(spoilerTextEl){
      spoilerTextEl.textContent = window.clearCondition || "（クリア条件なし）";
    }
  } else if(window.scenarioType === "exploration"){
    document.getElementById("get-card-button").style.display = "inline-block";
  }

  // APIキーが無い場合 -> .input-section や .game-section を非表示
  if (!window.apiKey) {
    const inputSection = document.querySelector('.input-section');
    const gameSection = document.querySelector('.game-section');
    if (inputSection) inputSection.style.display = 'none';
    if (gameSection) gameSection.style.display = 'none';
  } else {
    // シナリオがあればゲーム画面を表示、なければシナリオ入力画面を表示
    if (window.scenario && window.scenario.trim() !== '') {
      if (document.querySelector('.input-section')) {
        document.querySelector('.input-section').style.display = 'none';
      }
      if (document.querySelector('.game-section')) {
        document.querySelector('.game-section').style.display = 'block';
      }
    } else {
      if (document.querySelector('.input-section')) {
        document.querySelector('.input-section').style.display = 'block';
      }
      if (document.querySelector('.game-section')) {
        document.querySelector('.game-section').style.display = 'none';
      }
    }
  }

  // シナリオタイルと履歴を表示、最後のシーンをメインに表示
  displayScenarioTile();
  updateSceneHistory();
  showLastScene();

  // 各種イベントリスナーの登録

  // 応答キャンセルボタン
  const cancelRequestBtn = document.getElementById('cancel-request-button');
  if (cancelRequestBtn) {
    cancelRequestBtn.addEventListener('click', onCancelFetch);
  }

  // APIキー設定
  const setApiKeyBtn = document.getElementById('set-api-key-button');
  if (setApiKeyBtn) {
    setApiKeyBtn.addEventListener('click', () => {
      setApiKey();
    });
  }

  // APIキークリア
  const clearApiKeyBtn = document.getElementById('clear-api-key-button');
  if (clearApiKeyBtn) {
    clearApiKeyBtn.addEventListener('click', () => {
      clearApiKey();
    });
  }

  // ゲーム開始ボタン
  const startBtn = document.getElementById('start-button');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startGame();
    });
  }

  // 次のシーンボタン
  const nextSceneBtn = document.getElementById('next-scene');
  if (nextSceneBtn) {
    nextSceneBtn.addEventListener('click', () => {
      nextScene();
    });
  }

  // 画像生成関連のボタン
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
};

/** もしプレイヤーに「クリア条件は？」など聞かれても答えないようにする場合は、scene.js の getNextScene()で
 *  messagesに追加する前にフィルタする等の実装を行う。今回はサンプルとしてコメントで示すのみ。
 */
