/********************************
 * main.js - ページ全体の初期化・イベント登録
 ********************************/

window.onload = async () => {
  // まずIndexedDB初期化
  await initIndexedDB();

  // ローカルストレージから各種情報を取得
  const savedApiKey = localStorage.getItem('apiKey');
  if(savedApiKey){
    window.apiKey = savedApiKey;
  }

  const savedScenario = localStorage.getItem('scenario');
  if(savedScenario){
    window.scenario = savedScenario;
    if(window.scenario === '（シナリオは未入力です）'){
      window.scenario = '';
      localStorage.removeItem('scenario');
    }
    const scenarioInput = document.getElementById('scenario-input');
    if(scenarioInput) {
      scenarioInput.value = window.scenario;
    }
  }

  // sceneHistory は IndexedDB から取得
  const loadedHistory = await loadSceneHistoryFromIndexedDB();
  window.sceneHistory = loadedHistory || [];

  // currentScene は localStorage から読み取る
  const savedCurrentScene = localStorage.getItem('currentScene');
  if(savedCurrentScene){
    window.currentScene = parseInt(savedCurrentScene, 10);
  } else {
    window.currentScene = 0;
  }

  // APIキーが無い場合 -> .input-section や .game-section をどうするか
  if(!window.apiKey){
    // APIキー入力欄だけは表示
    document.querySelector('.input-section').style.display = 'none';
    document.querySelector('.game-section').style.display = 'none';
  } else {
    // APIキーがある場合はAPIキー入力欄を非表示
    document.querySelector('.api-key-section').style.display = 'none';

    // シナリオがあればゲーム画面を表示、なければシナリオ入力画面を表示
    if(window.scenario && window.scenario.trim() !== ''){
      document.querySelector('.input-section').style.display = 'none';
      document.querySelector('.game-section').style.display = 'block';
    } else {
      document.querySelector('.input-section').style.display = 'block';
      document.querySelector('.game-section').style.display = 'none';
    }
  }

  // シナリオタイルと履歴を表示、最後のシーンをメインに表示
  displayScenarioTile();
  updateSceneHistory();
  showLastScene();

  // 各種イベントリスナー
  document.getElementById('cancel-request-button')
    .addEventListener('click', onCancelFetch);

  const setApiKeyBtn = document.getElementById('set-api-key-button');
  if(setApiKeyBtn){
    setApiKeyBtn.addEventListener('click', () => {
      setApiKey();
    });
  }

  const clearApiKeyBtn = document.getElementById('clear-api-key-button');
  if(clearApiKeyBtn){
    clearApiKeyBtn.addEventListener('click', () => {
      clearApiKey();
    });
  }

  const startBtn = document.getElementById('start-button');
  if(startBtn){
    startBtn.addEventListener('click', () => {
      startGame();
    });
  }

  const nextSceneBtn = document.getElementById('next-scene');
  if(nextSceneBtn){
    nextSceneBtn.addEventListener('click', () => {
      nextScene();
    });
  }

  const clearHistoryBtn = document.getElementById('clear-history-button');
  if(clearHistoryBtn){
    clearHistoryBtn.addEventListener('click', () => {
      clearHistory();
    });
  }

  // 画像生成関連
  const autoGenBtn = document.getElementById('image-auto-generate-button');
  if(autoGenBtn){
    autoGenBtn.addEventListener('click', () => {
      generateImageFromCurrentScene();
    });
  }

  const promptModalBtn = document.getElementById('image-prompt-modal-button');
  if(promptModalBtn){
    promptModalBtn.addEventListener('click', () => {
      openImagePromptModal();
    });
  }

  const customGenBtn = document.getElementById('image-custom-generate-button');
  if(customGenBtn){
    customGenBtn.addEventListener('click', () => {
      onCustomImageGenerate();
    });
  }

  const customCancelBtn = document.getElementById('image-custom-cancel-button');
  if(customCancelBtn){
    customCancelBtn.addEventListener('click', () => {
      closeImagePromptModal();
    });
  }
};

/** APIキー設定 */
function setApiKey(){
  window.apiKey = document.getElementById('api-key-input').value.trim();
  if(window.apiKey){
    localStorage.setItem('apiKey', window.apiKey);
    alert('APIキーが設定されました。');
    // ページをリロード
    location.reload();
  } else {
    alert('APIキーを入力してください。');
  }
}

/** APIキークリア */
function clearApiKey(){
  const ok = confirm('APIキーをクリアすると操作ができなくなります。よろしいですか？');
  if(!ok) return;
  localStorage.removeItem('apiKey');
  window.apiKey = '';
  // ページをリロード
  location.reload();
}
