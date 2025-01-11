/********************************
 * scene.js - シナリオ/シーン管理関連
 ********************************/

// グローバル変数
window.apiKey = '';
window.scenario = '';
window.currentScene = 0;
window.sceneHistory = []; 
// 例: {type:'scene'|'action'|'image', sceneId?: string, content?:string, dataUrl?:string, prompt?:string}
window.currentRequestController = null;
window.cancelRequested = false;
window.editingImageEntry = null;

/** ユニークIDを生成 */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/** ゲーム開始 */
async function startGame(){
  window.scenario = document.getElementById('scenario-input').value.trim();
  if(!window.scenario){
    alert('シナリオを入力してください');
    return;
  }
  localStorage.setItem('scenario', window.scenario);

  document.querySelector('.input-section').style.display = 'none';
  document.querySelector('.game-section').style.display = 'block';

  displayScenarioTile();
  await getNextScene();
}

/** シナリオタイルの表示 */
function displayScenarioTile(){
  const historyContainer = document.getElementById('scene-history');
  if(!historyContainer) return;

  let scenarioTile = document.getElementById('scenario-tile');
  if(!scenarioTile){
    scenarioTile = document.createElement('div');
    scenarioTile.id = 'scenario-tile';
    scenarioTile.className = 'history-tile';
  } else {
    scenarioTile.innerHTML = '';
  }

  // シナリオ本文（contenteditable）
  const scenarioText = document.createElement('p');
  scenarioText.className = 'scenario-text';
  if(!window.apiKey){
    scenarioText.removeAttribute('contenteditable');
  } else {
    scenarioText.setAttribute('contenteditable','true');
  }

  // 表示上は「（シナリオは未入力です）」をプレースホルダーに
  const displayText = (window.scenario && window.scenario.trim() !== '')
    ? window.scenario
    : '（シナリオは未入力です）';
  scenarioText.innerHTML = DOMPurify.sanitize(displayText);

  // 変更があったら保存
  scenarioText.addEventListener('blur', () => {
    if(!window.apiKey) return;
    const rawText = scenarioText.textContent.trim();

    if(!rawText || rawText === '（シナリオは未入力です）'){
      window.scenario = '';
      localStorage.removeItem('scenario');
    } else {
      window.scenario = rawText;
      localStorage.setItem('scenario', rawText);
    }

    showLastScene();
  });

  scenarioTile.appendChild(scenarioText);

  // 履歴コンテナを一旦クリアし、シナリオタイルを追加
  historyContainer.innerHTML = '';
  historyContainer.appendChild(scenarioTile);
}

/** 次のシーンを取得 */
async function getNextScene(){
  if(!window.apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput = document.getElementById('player-input').value.trim();
  if(window.currentScene > 0 && !playerInput){
    alert('プレイヤーの行動を入力してください');
    return;
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  const messages = [
    {role:'system', content:'あなたはTRPGのゲームマスターです。HTMLタグOK。'},
    {role:'user', content:`シナリオ概要:${window.scenario}`}
  ];

  // これまでのシーンとプレイヤー行動をすべて messages に詰める
  window.sceneHistory.forEach(e=>{
    if(e.type === 'scene'){
      messages.push({role:'assistant', content:e.content});
    } else if(e.type === 'action'){
      messages.push({role:'user', content:`プレイヤーの行動:${e.content}`});
    }
  });

  // 今回の新しい行動
  if(playerInput){
    messages.push({role:'user', content:`プレイヤーの行動:${playerInput}`});
    window.sceneHistory.push({ type:'action', content:playerInput });
  }

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${window.apiKey}`
      },
      body:JSON.stringify({
        model:'gpt-4',
        messages
      }),
      signal
    });
    if(window.cancelRequested){
      showLoadingModal(false);
      return;
    }
    const data = await response.json();
    if(window.cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error){
      throw new Error(data.error.message);
    }

    // 次のシーン内容
    const nextScene = data.choices[0].message.content;

    // ユニークIDを付与
    const newSceneId = generateUniqueId();
    window.sceneHistory.push({
      type: 'scene',
      sceneId: newSceneId,
      content: nextScene
    });
    window.currentScene++;

    // IndexedDB保存 & currentSceneはlocalStorageに保存
    await saveSceneHistoryToIndexedDB(window.sceneHistory);
    localStorage.setItem('currentScene', window.currentScene);

    document.getElementById('player-input').value = '';

    updateSceneHistory();
    showLastScene();
  } catch(error) {
    if(error.name === 'AbortError'){
      console.warn('シーン取得キャンセル');
    } else {
      console.error('シーン取得失敗:', error);
      alert('シーン取得に失敗:\n' + error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/**
 * シーン履歴表示
 * - 通常は「最新シーン(末尾)」はメイン表示( showLastScene )に回すので除外するが、
 *   「APIキーが無いとき」は最新シーンも履歴に入れて表示する
 */
function updateSceneHistory(){
  const historyContainer = document.getElementById('scene-history');
  if(!historyContainer) return;

  // すでに作成していたシナリオタイルを復帰
  const scenarioTile = document.getElementById('scenario-tile');
  historyContainer.innerHTML = '';
  if(scenarioTile){
    historyContainer.appendChild(scenarioTile);
  }

  // 最新シーンのIDを取得
  const latestScene = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  const latestSceneId = latestScene ? latestScene.sceneId : null;

  // 履歴を表示
  window.sceneHistory.forEach((entry, index) => {
    // APIキーがあれば「最新シーン」は除外してメイン表示へ回す
    if(window.apiKey){
      if(entry.sceneId && entry.sceneId === latestSceneId){
        return;
      }
    }

    if(entry.type === 'scene'){
      // シーン表示
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      // シーン削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.marginBottom = '5px';
      deleteBtn.addEventListener('click', async ()=>{
        if(!window.apiKey) return;
        // シーン + それに紐づく画像を削除
        const delId = entry.sceneId;
        window.sceneHistory = window.sceneHistory.filter(e=>{
          if(e.type === 'scene' && e.sceneId === delId) return false;
          if(e.type === 'image' && e.sceneId === delId) return false;
          return true;
        });
        await saveSceneHistoryToIndexedDB(window.sceneHistory);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(deleteBtn);

      // シーン本文
      const sceneText = document.createElement('p');
      sceneText.className = 'scene-text';
      if(!window.apiKey){
        sceneText.removeAttribute('contenteditable');
      } else {
        sceneText.setAttribute('contenteditable','true');
      }
      sceneText.innerHTML = DOMPurify.sanitize(entry.content);
      sceneText.addEventListener('blur', async ()=>{
        if(!window.apiKey) return;
        entry.content = sceneText.textContent.trim();
        await saveSceneHistoryToIndexedDB(window.sceneHistory);
      });
      tile.appendChild(sceneText);

      historyContainer.appendChild(tile);

    } else if(entry.type === 'action'){
      // プレイヤー行動
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.marginBottom = '5px';
      deleteBtn.addEventListener('click', async ()=>{
        if(!window.apiKey) return;

        // 最新アクションなら、最新シーンも削除
        let lastActionIndex = -1;
        for(let i = window.sceneHistory.length - 1; i >= 0; i--){
          if(window.sceneHistory[i].type === 'action'){
            lastActionIndex = i;
            break;
          }
        }
        if(index === lastActionIndex){
          let lastSceneIndex = -1;
          for(let i = window.sceneHistory.length - 1; i >= 0; i--){
            if(window.sceneHistory[i].type === 'scene'){
              lastSceneIndex = i;
              break;
            }
          }
          if(lastSceneIndex !== -1){
            window.sceneHistory.splice(lastSceneIndex, 1);
          }
        }

        window.sceneHistory.splice(index,1);
        await saveSceneHistoryToIndexedDB(window.sceneHistory);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(deleteBtn);

      const actionText = document.createElement('p');
      actionText.className = 'action-text';
      if(!window.apiKey){
        actionText.removeAttribute('contenteditable');
      } else {
        actionText.setAttribute('contenteditable','true');
      }
      actionText.innerHTML = DOMPurify.sanitize(entry.content);
      actionText.addEventListener('blur', async ()=>{
        if(!window.apiKey) return;
        entry.content = actionText.textContent.trim();
        await saveSceneHistoryToIndexedDB(window.sceneHistory);
      });
      tile.appendChild(actionText);

      historyContainer.appendChild(tile);

    } else if(entry.type === 'image'){
      // 古いシーンの画像
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const img = document.createElement('img');
      img.src = entry.dataUrl;
      img.alt = '生成画像';
      img.style.maxWidth = '100%';
      tile.appendChild(img);

      // 画像再生成
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '再生成';
      regenBtn.addEventListener('click', ()=>{
        if(!window.apiKey) return;
        const idxInHistory = window.sceneHistory.indexOf(entry);
        if(idxInHistory >= 0){
          openImagePromptModal(entry.prompt, idxInHistory);
        }
      });
      tile.appendChild(regenBtn);

      // 画像削除
      const imgDeleteBtn = document.createElement('button');
      imgDeleteBtn.textContent = '画像だけ削除';
      imgDeleteBtn.addEventListener('click', async ()=>{
        if(!window.apiKey) return;
        const idxInHistory = window.sceneHistory.indexOf(entry);
        if(idxInHistory >= 0){
          window.sceneHistory.splice(idxInHistory,1);
          await saveSceneHistoryToIndexedDB(window.sceneHistory);
          updateSceneHistory();
          showLastScene();
        }
      });
      tile.appendChild(imgDeleteBtn);

      historyContainer.appendChild(tile);
    }
  });

  historyContainer.scrollTop = historyContainer.scrollHeight;
}

/** 最新のシーン(末尾) をメイン表示 (APIキーがある時のみ利用) */
function showLastScene(){
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  const storyDiv = document.getElementById('story');
  const lastSceneImagesDiv = document.getElementById('last-scene-images');
  if(!storyDiv || !lastSceneImagesDiv) return;

  if(lastSceneEntry){
    // シーン本文
    const safeHTML = DOMPurify.sanitize(lastSceneEntry.content);
    storyDiv.innerHTML = safeHTML;

    // 画像一覧クリア
    lastSceneImagesDiv.innerHTML = '';

    // 最新シーンに紐づく画像を表示
    const sId = lastSceneEntry.sceneId;
    const images = window.sceneHistory.filter(e=> e.type === 'image' && e.sceneId === sId);
    images.forEach(imgEntry => {
      const container = document.createElement('div');
      container.style.marginBottom = '10px';

      const img = document.createElement('img');
      img.src = imgEntry.dataUrl;
      img.alt = 'シーン画像';
      img.style.maxWidth = '100%';
      container.appendChild(img);

      // 画像再生成
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '再生成';
      regenBtn.addEventListener('click', ()=>{
        if(!window.apiKey) return;
        const idxInHistory = window.sceneHistory.indexOf(imgEntry);
        if(idxInHistory>=0){
          openImagePromptModal(imgEntry.prompt, idxInHistory);
        }
      });
      container.appendChild(regenBtn);

      // 画像削除
      const imgDeleteBtn = document.createElement('button');
      imgDeleteBtn.textContent = '画像削除';
      imgDeleteBtn.addEventListener('click', async ()=>{
        if(!window.apiKey) return;
        const idxInHistory = window.sceneHistory.indexOf(imgEntry);
        if(idxInHistory>=0){
          window.sceneHistory.splice(idxInHistory,1);
          await saveSceneHistoryToIndexedDB(window.sceneHistory);
          showLastScene();
          updateSceneHistory();
        }
      });
      container.appendChild(imgDeleteBtn);

      lastSceneImagesDiv.appendChild(container);
    });

    // APIキーがあるときのみボタン類を表示
    if(window.apiKey){
      document.getElementById('next-scene').style.display = 'inline-block';
      document.getElementById('player-input').style.display = 'inline-block';
      document.getElementById('player-action').textContent = 'プレイヤーがどんな行動を取るか？';
    } else {
      document.getElementById('next-scene').style.display = 'none';
      document.getElementById('player-input').style.display = 'none';
      document.getElementById('player-action').textContent = '';
    }
  } else {
    // シーンがまだ無い場合
    storyDiv.textContent = '';
    lastSceneImagesDiv.innerHTML = '';
    document.getElementById('next-scene').style.display = 'none';
    document.getElementById('player-input').style.display = 'none';
    document.getElementById('player-action').textContent = '';
  }
}

/** 次のシーン ボタン */
function nextScene(){
  getNextScene();
}

/** 履歴クリア */
async function clearHistory(){
  const isOk = confirm('履歴をすべて削除します。（シナリオは残ります）よろしいですか？');
  if(!isOk) return;

  // IndexedDB の sceneHistory をクリア
  if(window.sceneHistory && window.sceneHistory.length > 0){
    window.sceneHistory = [];
    await saveSceneHistoryToIndexedDB(window.sceneHistory);
  }
  localStorage.removeItem('currentScene');

  window.sceneHistory = [];
  window.currentScene = 0;

  document.getElementById('story').textContent = '';
  document.getElementById('player-action').textContent = '';
  document.getElementById('player-input').value = '';
  document.getElementById('next-scene').style.display = 'none';
  document.getElementById('player-input').style.display = 'none';

  // シナリオは削除しない (window.scenarioは残す)

  // 再表示
  if(window.apiKey && window.scenario){
    document.querySelector('.input-section').style.display = 'none';
    document.querySelector('.game-section').style.display = 'block';
  } else {
    document.querySelector('.input-section').style.display = 'block';
    document.querySelector('.game-section').style.display = 'none';
  }

  displayScenarioTile();
  updateSceneHistory();
}

/** キャンセルボタン */
function onCancelFetch(){
  window.cancelRequested = true;
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/** ローディングモーダル表示/非表示 */
function showLoadingModal(show){
  const modal = document.getElementById('loading-modal');
  if(!modal) return;
  modal.style.display = show ? 'flex' : 'none';
}
