/********************************
 * scene.js - シナリオ/シーン管理関連
 ********************************/

// グローバル変数
window.apiKey = '';
window.scenario = '';
window.currentScene = 0;
window.sceneHistory = []; // {type:'scene'|'action'|'image', sceneId?: string, content?:string, url?:string, prompt?:string}
window.currentRequestController = null;
window.cancelRequested = false;
window.editingImageEntry = null;

// シーンごとにユニークIDを生成
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

  document.querySelector('.input-section').style.display='none';
  document.querySelector('.game-section').style.display='block';

  displayScenarioTile();
  await getNextScene();
}

/** シナリオタイルの表示 */
function displayScenarioTile(){
  const historyContainer=document.getElementById('scene-history');
  if(!historyContainer)return;

  let scenarioTile=document.getElementById('scenario-tile');
  if(!scenarioTile){
    scenarioTile=document.createElement('div');
    scenarioTile.id='scenario-tile';
    scenarioTile.className='history-tile';
  } else {
    scenarioTile.innerHTML='';
  }

  const deleteScenarioBtn=document.createElement('button');
  deleteScenarioBtn.textContent='削除';
  deleteScenarioBtn.style.marginBottom='5px';
  deleteScenarioBtn.addEventListener('click',()=>{
    window.scenario='';
    localStorage.removeItem('scenario');
    displayScenarioTile();
    updateSceneHistory();
  });
  scenarioTile.appendChild(deleteScenarioBtn);

  const scenarioText=document.createElement('p');
  scenarioText.className='scenario-text';
  scenarioText.setAttribute('contenteditable','true');
  scenarioText.innerHTML=DOMPurify.sanitize(window.scenario || '（シナリオは未入力です）');
  scenarioText.addEventListener('blur',()=>{
    window.scenario=scenarioText.textContent.trim();
    if(window.scenario){
      localStorage.setItem('scenario', window.scenario);
    } else {
      localStorage.removeItem('scenario');
    }
    showLastScene();
  });
  scenarioTile.appendChild(scenarioText);

  historyContainer.innerHTML='';
  historyContainer.appendChild(scenarioTile);
}

/** 次のシーンを取得 */
async function getNextScene(){
  if(!window.apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput=document.getElementById('player-input').value.trim();
  if(window.currentScene>0 && !playerInput){
    alert('プレイヤーの行動を入力してください');
    return;
  }

  window.cancelRequested=false;
  showLoadingModal(true);

  const messages=[
    {role:'system', content:'あなたはTRPGのゲームマスターです。HTMLタグOK。'},
    {role:'user', content:`シナリオ概要:${window.scenario}`}
  ];
  window.sceneHistory.forEach(e=>{
    if(e.type==='scene'){
      messages.push({role:'assistant', content:e.content});
    } else if(e.type==='action'){
      messages.push({role:'user', content:`プレイヤーの行動:${e.content}`});
    }
  });
  if(playerInput){
    messages.push({role:'user', content:`プレイヤーの行動:${playerInput}`});
    window.sceneHistory.push({type:'action', content:playerInput});
  }

  try {
    window.currentRequestController=new AbortController();
    const signal=window.currentRequestController.signal;

    const response=await fetch('https://api.openai.com/v1/chat/completions',{
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
    const data=await response.json();
    if(window.cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error){
      throw new Error(data.error.message);
    }
    const nextScene=data.choices[0].message.content;

    // シーンID付与
    const newSceneId=generateUniqueId();
    window.sceneHistory.push({
      type:'scene',
      sceneId: newSceneId,
      content: nextScene
    });
    window.currentScene++;

    localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
    localStorage.setItem('currentScene', window.currentScene);

    const safeSceneHTML=DOMPurify.sanitize(`次のシーン:<br>${nextScene}`);
    document.getElementById('story').innerHTML=safeSceneHTML;
    document.getElementById('player-action').textContent='プレイヤーがどんな行動を取るか？';
    document.getElementById('next-scene').style.display='inline-block';
    document.getElementById('player-input').style.display='inline-block';
    document.getElementById('player-input').value='';

    updateSceneHistory();
  } catch(error){
    if(error.name==='AbortError'){
      console.warn('シーン取得キャンセル');
    } else {
      console.error('シーン取得失敗:',error);
      alert('シーン取得に失敗:\n'+error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/** シーン履歴表示 (シーンと画像を同タイルに) */
function updateSceneHistory(){
  const historyContainer=document.getElementById('scene-history');
  if(!historyContainer)return;

  const scenarioTile=document.getElementById('scenario-tile');
  historyContainer.innerHTML='';

  if(scenarioTile){
    historyContainer.appendChild(scenarioTile);
  }

  window.sceneHistory.forEach((entry, index)=>{
    if(entry.type==='scene'){
      const tile=document.createElement('div');
      tile.className='history-tile';

      // 削除ボタン (シーン + 画像まとめて削除)
      const deleteBtn=document.createElement('button');
      deleteBtn.textContent='削除';
      deleteBtn.style.marginBottom='5px';
      deleteBtn.addEventListener('click',()=>{
        const delSceneId=entry.sceneId;
        window.sceneHistory = window.sceneHistory.filter(e=>{
          if(e.type==='scene' && e.sceneId===delSceneId) return false;
          if(e.type==='image' && e.sceneId===delSceneId) return false;
          return true;
        });
        localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
        updateSceneHistory();
      });
      tile.appendChild(deleteBtn);

      // シーン本文
      const sceneText=document.createElement('p');
      sceneText.className='scene-text';
      sceneText.innerHTML=DOMPurify.sanitize(entry.content);
      sceneText.setAttribute('contenteditable','true');
      sceneText.addEventListener('blur',()=>{
        entry.content=sceneText.textContent.trim();
        localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
        showLastScene();
      });
      tile.appendChild(sceneText);

      // 画像 (同じ sceneId のものをまとめる)
      const relatedImages = window.sceneHistory
        .filter(e=> e.type==='image' && e.sceneId===entry.sceneId);
      relatedImages.forEach((imgEntry) => {
        const img=document.createElement('img');
        img.src=imgEntry.url;
        img.alt='生成画像';
        img.style.maxWidth='100%';
        tile.appendChild(img);

        // 再生成
        const regenBtn=document.createElement('button');
        regenBtn.textContent='再生成';
        regenBtn.addEventListener('click',()=>{
          const idxInHistory= window.sceneHistory.indexOf(imgEntry);
          if(idxInHistory>=0){
            openImagePromptModal(imgEntry.prompt, idxInHistory);
          }
        });
        tile.appendChild(regenBtn);

        // 画像だけ削除
        const imgDeleteBtn=document.createElement('button');
        imgDeleteBtn.textContent='画像だけ削除';
        imgDeleteBtn.addEventListener('click',()=>{
          const idxInHistory= window.sceneHistory.indexOf(imgEntry);
          if(idxInHistory>=0){
            window.sceneHistory.splice(idxInHistory,1);
            localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
            updateSceneHistory();
          }
        });
        tile.appendChild(imgDeleteBtn);
      });

      historyContainer.appendChild(tile);

    } else if(entry.type==='action'){
      const tile=document.createElement('div');
      tile.className='history-tile';

      // 行動削除
      const deleteBtn=document.createElement('button');
      deleteBtn.textContent='削除';
      deleteBtn.style.marginBottom='5px';
      deleteBtn.addEventListener('click',()=>{
        window.sceneHistory.splice(index,1);
        localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
        updateSceneHistory();
      });
      tile.appendChild(deleteBtn);

      // 行動テキスト
      const actionText=document.createElement('p');
      actionText.className='action-text';
      actionText.innerHTML=DOMPurify.sanitize(entry.content);
      actionText.setAttribute('contenteditable','true');
      actionText.addEventListener('blur',()=>{
        entry.content=actionText.textContent.trim();
        localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
        showLastScene();
      });
      tile.appendChild(actionText);

      historyContainer.appendChild(tile);
    }
  });

  historyContainer.scrollTop=historyContainer.scrollHeight;
  showLastScene();
  displaySceneImagesInLeftPane();
}

/** 最後のシーンをメインに表示 */
function showLastScene(){
  const lastSceneEntry=[...window.sceneHistory].reverse().find(e=>e.type==='scene');
  if(lastSceneEntry){
    const safeHTML=DOMPurify.sanitize(`次のシーン:<br>${lastSceneEntry.content}`);
    document.getElementById('story').innerHTML=safeHTML;
    document.getElementById('next-scene').style.display='inline-block';
    document.getElementById('player-input').style.display='inline-block';
    document.getElementById('player-action').textContent='プレイヤーがどんな行動を取るか？';
  } else {
    document.getElementById('story').textContent='';
    document.getElementById('next-scene').style.display='none';
    document.getElementById('player-input').style.display='none';
    document.getElementById('player-action').textContent='';
  }
}

/** 次のシーン ボタン */
function nextScene(){
  getNextScene();
}

/** 履歴クリア */
function clearHistory(){
  const isOk=confirm('全部消えてしまいますが良いですか？');
  if(!isOk)return;

  localStorage.removeItem('sceneHistory');
  localStorage.removeItem('currentScene');
  localStorage.removeItem('scenario');

  window.sceneHistory=[];
  window.currentScene=0;
  window.scenario='';

  document.getElementById('story').textContent='';
  document.getElementById('player-action').textContent='';
  document.getElementById('player-input').value='';
  document.getElementById('next-scene').style.display='none';
  document.getElementById('player-input').style.display='none';

  document.querySelector('.input-section').style.display='block';
  document.querySelector('.game-section').style.display='none';

  displayScenarioTile();
  updateSceneHistory();
}

/** キャンセルボタン */
function onCancelFetch(){
  window.cancelRequested=true;
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/** ローディングモーダル表示/非表示 */
function showLoadingModal(show){
  const modal=document.getElementById('loading-modal');
  if(!modal)return;
  modal.style.display= show ? 'flex':'none';
}
