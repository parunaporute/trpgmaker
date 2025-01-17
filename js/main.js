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

  const savedScenario = localStorage.getItem('scenario');
  if (savedScenario) {
    window.scenario = savedScenario;
    if (window.scenario === '（シナリオは未入力です）') {
      window.scenario = '';
      localStorage.removeItem('scenario');
    }
    const scenarioInput = document.getElementById('scenario-input');
    if (scenarioInput) {
      scenarioInput.value = window.scenario;
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

/** APIキー設定 */
function setApiKey() {
  window.apiKey = document.getElementById('api-key-input').value.trim();
  if (window.apiKey) {
    localStorage.setItem('apiKey', window.apiKey);
    alert('APIキーが設定されました。');
    // ページをリロードして反映
    location.reload();
  } else {
    alert('APIキーを入力してください。');
  }
}

/** APIキークリア */
function clearApiKey() {
  const ok = confirm('APIキーをクリアすると操作ができなくなります。よろしいですか？');
  if (!ok) return;
  localStorage.removeItem('apiKey');
  window.apiKey = '';
  // ページをリロードして反映
  location.reload();
}

/** キャンセルボタン押下時の処理 */
function onCancelFetch() {
  window.cancelRequested = true;
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/** ローディングモーダルの表示／非表示 */
function showLoadingModal(show) {
  const modal = document.getElementById('loading-modal');
  if (!modal) return;
  modal.style.display = show ? 'flex' : 'none';
}
