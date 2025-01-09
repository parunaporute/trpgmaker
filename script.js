/********************************
 * script.js - シーンと画像を同じタイルにまとめる
 ********************************/
let apiKey = '';
let scenario = '';
let currentScene = 0; // 何個目のシーンか
let sceneHistory = []; // {type:'scene'|'action'|'image', sceneId?: string, content?:string, url?:string, prompt?:string}

/** リクエスト中断用 */
let currentRequestController = null;
let cancelRequested = false;

/** 画像再生成用 */
let editingImageEntry = null;

/** シーンごとにユニークIDを生成 */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

window.onload = () => {
  const savedApiKey = localStorage.getItem('apiKey');
  if(savedApiKey){
    apiKey = savedApiKey;
    document.querySelector('.api-key-section').style.display='none';
  }
  const savedScenario = localStorage.getItem('scenario');
  const savedSceneHistory = localStorage.getItem('sceneHistory');
  const savedCurrentScene = localStorage.getItem('currentScene');

  if(savedScenario){
    scenario = savedScenario;
    const scenarioInput=document.getElementById('scenario-input');
    if(scenarioInput) scenarioInput.value=scenario;
  }
  if(savedSceneHistory){
    sceneHistory=JSON.parse(savedSceneHistory);
  }
  if(savedCurrentScene){
    currentScene=parseInt(savedCurrentScene,10);
  }

  if(scenario && scenario.trim()!==''){
    document.querySelector('.input-section').style.display='none';
    document.querySelector('.game-section').style.display='block';
  } else {
    document.querySelector('.input-section').style.display='block';
    document.querySelector('.game-section').style.display='none';
  }

  displayScenarioTile();
  updateSceneHistory();
  showLastScene();

  document.getElementById('cancel-request-button')
    .addEventListener('click', onCancelFetch);

  document.getElementById('set-api-key-button')
    .addEventListener('click', setApiKey);
  document.getElementById('start-button')
    .addEventListener('click', startGame);
  document.getElementById('next-scene')
    .addEventListener('click', nextScene);
  document.getElementById('clear-history-button')
    .addEventListener('click', clearHistory);

  // 画像生成
  document.getElementById('image-auto-generate-button')
    .addEventListener('click', generateImageFromCurrentScene);
  document.getElementById('image-prompt-modal-button')
    .addEventListener('click', ()=>openImagePromptModal());

  document.getElementById('image-custom-generate-button')
    .addEventListener('click', onCustomImageGenerate);
  document.getElementById('image-custom-cancel-button')
    .addEventListener('click', closeImagePromptModal);
};

/** 1) APIキー設定 */
function setApiKey(){
  apiKey = document.getElementById('api-key-input').value.trim();
  if(apiKey){
    localStorage.setItem('apiKey', apiKey);
    alert('APIキーが設定されました。');
    document.querySelector('.api-key-section').style.display='none';
    document.querySelector('.input-section').style.display='block';
  } else {
    alert('APIキーを入力してください。');
  }
}

/** 2) ゲーム開始 */
async function startGame(){
  scenario=document.getElementById('scenario-input').value.trim();
  if(!scenario){
    alert('シナリオを入力してください');
    return;
  }
  localStorage.setItem('scenario', scenario);

  document.querySelector('.input-section').style.display='none';
  document.querySelector('.game-section').style.display='block';

  displayScenarioTile();
  await getNextScene();
}

/** 3) 次のシーンを取得 */
async function getNextScene(){
  if(!apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput=document.getElementById('player-input').value.trim();
  if(currentScene>0 && !playerInput){
    alert('プレイヤーの行動を入力してください');
    return;
  }

  cancelRequested=false;
  showLoadingModal(true);

  const messages=[
    {role:'system', content:'あなたはTRPGのゲームマスターです。HTMLタグOK。'},
    {role:'user', content:`シナリオ概要:${scenario}`}
  ];
  sceneHistory.forEach(e=>{
    if(e.type==='scene'){
      messages.push({role:'assistant', content:e.content});
    } else if(e.type==='action'){
      messages.push({role:'user', content:`プレイヤーの行動:${e.content}`});
    }
  });
  if(playerInput){
    messages.push({role:'user', content:`プレイヤーの行動:${playerInput}`});
    sceneHistory.push({type:'action', content:playerInput});
  }

  try {
    currentRequestController=new AbortController();
    const signal=currentRequestController.signal;

    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model:'gpt-4',
        messages
      }),
      signal
    });
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    const data=await response.json();
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error){
      throw new Error(data.error.message);
    }
    const nextScene=data.choices[0].message.content;

    // シーンID付与
    const newSceneId=generateUniqueId();
    sceneHistory.push({
      type:'scene',
      sceneId: newSceneId,
      content: nextScene
    });
    currentScene++;

    localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
    localStorage.setItem('currentScene', currentScene);

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

/** 4) 履歴表示 (シーンと画像を同タイルに) */
function updateSceneHistory(){
  const historyContainer=document.getElementById('scene-history');
  if(!historyContainer)return;

  const scenarioTile=document.getElementById('scenario-tile');
  historyContainer.innerHTML='';

  if(scenarioTile){
    historyContainer.appendChild(scenarioTile);
  }

  // 1) 「シーン」と「行動」は従来どおり個別タイルに
  //    ただし シーンとその画像はまとめる
  // 2) ここでは先に「シーン」と「行動」を順に表示しつつ、
  //    「画像」は同じ sceneId を持つものをシーンタイルの中に入れる
  //    行動(type:'action')は別のタイルで表示

  // まず全エントリを順番に走査
  // シーンなら: シーンタイルを作って、中に画像まとめて表示
  // 行動なら: これまで通り個別タイル
  sceneHistory.forEach((entry, index)=>{
    if(entry.type==='scene'){
      // シーンタイル作成
      const tile=document.createElement('div');
      tile.className='history-tile';

      // 削除ボタン (シーン + 画像まとめて削除)
      const deleteBtn=document.createElement('button');
      deleteBtn.textContent='削除';
      deleteBtn.style.marginBottom='5px';
      deleteBtn.addEventListener('click',()=>{
        const delSceneId=entry.sceneId;
        sceneHistory = sceneHistory.filter(e=>{
          if(e.type==='scene' && e.sceneId===delSceneId) return false;
          if(e.type==='image' && e.sceneId===delSceneId) return false;
          return true;
        });
        localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
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
        localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
        showLastScene();
      });
      tile.appendChild(sceneText);

      // 画像 (同じ sceneId を持つ image をまとめる)
      const relatedImages = sceneHistory
        .filter(e=> e.type==='image' && e.sceneId===entry.sceneId);
      relatedImages.forEach((imgEntry) => {
        // 画像表示
        const img=document.createElement('img');
        img.src=imgEntry.url;
        img.alt='生成画像';
        img.style.maxWidth='100%';
        tile.appendChild(img);

        // 再生成
        const regenBtn=document.createElement('button');
        regenBtn.textContent='再生成';
        regenBtn.addEventListener('click',()=>{
          // どの要素か見つける
          const idxInHistory= sceneHistory.indexOf(imgEntry);
          if(idxInHistory>=0){
            openImagePromptModal(imgEntry.prompt, idxInHistory);
          }
        });
        tile.appendChild(regenBtn);

        // 画像個別削除 (シーンは残す)
        const imgDeleteBtn=document.createElement('button');
        imgDeleteBtn.textContent='画像だけ削除';
        imgDeleteBtn.addEventListener('click',()=>{
          const idxInHistory= sceneHistory.indexOf(imgEntry);
          if(idxInHistory>=0){
            sceneHistory.splice(idxInHistory,1);
            localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
            updateSceneHistory();
          }
        });
        tile.appendChild(imgDeleteBtn);
      });

      // シーンタイルを配置
      historyContainer.appendChild(tile);

    } else if(entry.type==='action'){
      // 行動は独立したタイル
      const tile=document.createElement('div');
      tile.className='history-tile';

      // 削除ボタン(行動だけ削除)
      const deleteBtn=document.createElement('button');
      deleteBtn.textContent='削除';
      deleteBtn.style.marginBottom='5px';
      deleteBtn.addEventListener('click',()=>{
        sceneHistory.splice(index,1);
        localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
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
        localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
        showLastScene();
      });
      tile.appendChild(actionText);

      historyContainer.appendChild(tile);
    }
    // それ以外(type:'image'だけの単独表示)は ここでは行わない
    // なぜなら、画像はシーンタイルにまとめて表示しているため
  });

  historyContainer.scrollTop=historyContainer.scrollHeight;
  showLastScene();
  displaySceneImagesInLeftPane();
}

/** 5) シナリオタイル */
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
    scenario='';
    localStorage.removeItem('scenario');
    displayScenarioTile();
    updateSceneHistory();
  });
  scenarioTile.appendChild(deleteScenarioBtn);

  const scenarioText=document.createElement('p');
  scenarioText.className='scenario-text';
  scenarioText.setAttribute('contenteditable','true');
  scenarioText.innerHTML=DOMPurify.sanitize(scenario||'（シナリオは未入力です）');
  scenarioText.addEventListener('blur',()=>{
    scenario=scenarioText.textContent.trim();
    if(scenario){
      localStorage.setItem('scenario', scenario);
    } else {
      localStorage.removeItem('scenario');
    }
    showLastScene();
  });
  scenarioTile.appendChild(scenarioText);

  historyContainer.innerHTML='';
  historyContainer.appendChild(scenarioTile);
}

/** 6) 最後のシーンをメインに表示 */
function showLastScene(){
  const lastSceneEntry=[...sceneHistory].reverse().find(e=>e.type==='scene');
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

/** 7) 次のシーン ボタン */
function nextScene(){
  getNextScene();
}

/** 8) 履歴クリア */
function clearHistory(){
  const isOk=confirm('全部消えてしまいますが良いですか？');
  if(!isOk)return;

  localStorage.removeItem('sceneHistory');
  localStorage.removeItem('currentScene');
  localStorage.removeItem('scenario');

  sceneHistory=[];
  currentScene=0;
  scenario='';

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
  cancelRequested=true;
  if(currentRequestController){
    currentRequestController.abort();
  }
  showLoadingModal(false);
}

function showLoadingModal(show){
  const modal=document.getElementById('loading-modal');
  if(!modal)return;
  modal.style.display= show ? 'flex':'none';
}

/* =========================
   自動生成(現シーン)
========================= */
async function generateImageFromCurrentScene(){
  if(!apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const lastSceneEntry=[...sceneHistory].reverse().find(e=>e.type==='scene');
  if(!lastSceneEntry){
    alert('まだシーンがありません。');
    return;
  }
  const promptText=`シーンのイメージ: ${lastSceneEntry.content}`;
  const sceneId=lastSceneEntry.sceneId;

  cancelRequested=false;
  showLoadingModal(true);

  try{
    currentRequestController=new AbortController();
    const signal=currentRequestController.signal;

    const response=await fetch('https://api.openai.com/v1/images/generations',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        prompt: promptText,
        n:1,
        size:'512x512'
      }),
      signal
    });
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    const data=await response.json();
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error){
      throw new Error(data.error.message);
    }

    const imageUrl=data.data[0].url;
    // 履歴に追加
    sceneHistory.push({
      type:'image',
      sceneId,
      prompt: promptText,
      url: imageUrl
    });
    localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
    updateSceneHistory();
  }catch(error){
    if(error.name==='AbortError'){
      console.warn('画像生成キャンセル');
    } else {
      console.error('画像生成失敗:',error);
      alert('画像生成失敗:\n'+error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/* =========================
   カスタムプロンプト生成
========================= */
function openImagePromptModal(prompt='', index=null){
  editingImageEntry=null;
  if(index!==null){
    // 再生成
    editingImageEntry={ index };
    const entry=sceneHistory[index];
    if(entry && entry.type==='image'){
      prompt=entry.prompt;
    }
  } else {
    // 新規
    const lastSceneEntry=[...sceneHistory].reverse().find(e=> e.type==='scene');
    if(lastSceneEntry){
      prompt=`${lastSceneEntry.content}`;
    } else {
      prompt=`` + scenario||'`highly detailed, photorealistic, cinematic lighting, 4k, Fantasy scene';
    }
  }
  document.getElementById('image-custom-prompt').value=prompt;
  document.getElementById('image-prompt-modal').style.display='flex';
}
function closeImagePromptModal(){
  document.getElementById('image-prompt-modal').style.display='none';
  editingImageEntry=null;
}
async function onCustomImageGenerate(){
  if(!apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const promptText= `` + document.getElementById('image-custom-prompt').value.trim()||'Fantasy scene';

  cancelRequested=false;
  showLoadingModal(true);
  closeImagePromptModal();

  try{
    currentRequestController=new AbortController();
    const signal=currentRequestController.signal;

    const response=await fetch('https://api.openai.com/v1/images/generations',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n:1,
        size:'1024x1024'
      }),
      signal
    });
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    const data=await response.json();
    if(cancelRequested){
      showLoadingModal(false);
      return;
    }
    if(data.error){
      throw new Error(data.error.message);
    }

    const imageUrl=data.data[0].url;

    if(editingImageEntry){
      // 再生成
      const idx=editingImageEntry.index;
      const entry=sceneHistory[idx];
      if(entry && entry.type==='image'){
        entry.url=imageUrl;
        entry.prompt=promptText;
      }
    } else {
      // 新規
      const lastSceneEntry=[...sceneHistory].reverse().find(e=> e.type==='scene');
      if(!lastSceneEntry){
        alert('シーンがありません。');
        return;
      }
      sceneHistory.push({
        type:'image',
        sceneId:lastSceneEntry.sceneId,
        prompt: promptText,
        url: imageUrl
      });
    }

    localStorage.setItem('sceneHistory', JSON.stringify(sceneHistory));
    updateSceneHistory();
  }catch(error){
    if(error.name==='AbortError'){
      console.warn('カスタム画像生成キャンセル');
    } else {
      console.error('カスタム画像生成失敗:',error);
      alert('カスタム画像生成失敗:\n'+error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/* =========================
   左ペインに「現シーン画像」を表示
========================= */
function displaySceneImagesInLeftPane(){
  const listDiv=document.getElementById('scene-image-list');
  if(!listDiv)return;
  listDiv.innerHTML='';

  const lastSceneEntry=[...sceneHistory].reverse().find(e=> e.type==='scene');
  if(!lastSceneEntry)return;

  const sId=lastSceneEntry.sceneId;
  const images=sceneHistory.filter(e=> e.type==='image' && e.sceneId===sId);
  images.forEach(imgEntry=>{
    const img=document.createElement('img');
    img.src=imgEntry.url;
    img.alt='シーン画像';
    img.style.maxWidth='100%';
    listDiv.appendChild(img);
  });
}
