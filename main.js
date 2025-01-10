/********************************
 * main.js - ページ全体の初期化・イベント登録
 ********************************/

window.onload = () => {
  // ローカルストレージから各種情報を取得
  const savedApiKey = localStorage.getItem('apiKey');
  if(savedApiKey){
    window.apiKey = savedApiKey;
    // APIキーが既にあればAPIキー入力エリアを隠す
    document.querySelector('.api-key-section').style.display = 'none';
  }

  const savedScenario = localStorage.getItem('scenario');
  const savedSceneHistory = localStorage.getItem('sceneHistory');
  const savedCurrentScene = localStorage.getItem('currentScene');

  if(savedScenario){
    window.scenario = savedScenario;
    const scenarioInput = document.getElementById('scenario-input');
    if(scenarioInput) {
      scenarioInput.value = window.scenario;
    }
  }
  if(savedSceneHistory){
    window.sceneHistory = JSON.parse(savedSceneHistory);
  }
  if(savedCurrentScene){
    window.currentScene = parseInt(savedCurrentScene, 10);
  }

  // シナリオがあればゲーム画面を表示、なければシナリオ入力画面を表示
  if(window.scenario && window.scenario.trim() !== ''){
    document.querySelector('.input-section').style.display = 'none';
    document.querySelector('.game-section').style.display = 'block';
  } else {
    document.querySelector('.input-section').style.display = 'block';
    document.querySelector('.game-section').style.display = 'none';
  }

  // シナリオタイルと履歴を表示、最後のシーンをメインに表示
  displayScenarioTile();
  updateSceneHistory();
  showLastScene();

  // 各種イベントリスナー
  document.getElementById('cancel-request-button')
    .addEventListener('click', onCancelFetch);

  document.getElementById('set-api-key-button')
    .addEventListener('click', () => {
      setApiKey();
    });

  document.getElementById('start-button')
    .addEventListener('click', () => {
      startGame();
    });

  document.getElementById('next-scene')
    .addEventListener('click', () => {
      nextScene();
    });

  document.getElementById('clear-history-button')
    .addEventListener('click', () => {
      clearHistory();
    });

  // 画像生成関連
  document.getElementById('image-auto-generate-button')
    .addEventListener('click', () => {
      generateImageFromCurrentScene();
    });

  document.getElementById('image-prompt-modal-button')
    .addEventListener('click', () => {
      openImagePromptModal();
    });

  document.getElementById('image-custom-generate-button')
    .addEventListener('click', () => {
      onCustomImageGenerate();
    });

  document.getElementById('image-custom-cancel-button')
    .addEventListener('click', () => {
      closeImagePromptModal();
    });
};

/** APIキー設定 */
function setApiKey(){
  window.apiKey = document.getElementById('api-key-input').value.trim();
  if(window.apiKey){
    localStorage.setItem('apiKey', window.apiKey);
    alert('APIキーが設定されました。');
    document.querySelector('.api-key-section').style.display = 'none';
    document.querySelector('.input-section').style.display = 'block';
  } else {
    alert('APIキーを入力してください。');
  }
}
