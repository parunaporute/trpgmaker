/********************************
 * image.js - 画像生成関連
 ********************************/

/** 自動生成(現シーン) */
async function generateImageFromCurrentScene(){
  if(!window.apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  if(!lastSceneEntry){
    alert('まだシーンがありません。');
    return;
  }
  const promptText = `シーンのイメージ: ${lastSceneEntry.content}`;
  const sceneId = lastSceneEntry.sceneId;

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${window.apiKey}`
      },
      body:JSON.stringify({
        prompt: promptText,
        n:1,
        size:'512x512'
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

    const imageUrl = data.data[0].url;
    window.sceneHistory.push({
      type:'image',
      sceneId,
      prompt: promptText,
      url: imageUrl
    });
    localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
    updateSceneHistory();
    showLastScene();
  } catch(error) {
    if(error.name === 'AbortError'){
      console.warn('画像生成キャンセル');
    } else {
      console.error('画像生成失敗:', error);
      alert('画像生成失敗:\n'+error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/** カスタム画像生成モーダルを開く */
function openImagePromptModal(prompt = '', index = null){
  window.editingImageEntry = null;
  if(index !== null){
    // 再生成の場合
    window.editingImageEntry = { index };
    const entry = window.sceneHistory[index];
    if(entry && entry.type === 'image'){
      prompt = entry.prompt;
    }
  } else {
    // 新規
    const lastSceneEntry = [...window.sceneHistory].reverse().find(e=> e.type === 'scene');
    if(lastSceneEntry){
      prompt = `${lastSceneEntry.content}`;
    } else {
      prompt = window.scenario || 'Fantasy scene';
    }
  }
  document.getElementById('image-custom-prompt').value = prompt;
  document.getElementById('image-prompt-modal').style.display = 'flex';
}

/** カスタム画像生成モーダルを閉じる */
function closeImagePromptModal(){
  document.getElementById('image-prompt-modal').style.display = 'none';
  window.editingImageEntry = null;
}

/** カスタム画像生成ボタン押下 */
async function onCustomImageGenerate(){
  if(!window.apiKey){
    alert('APIキーが設定されていません。');
    return;
  }
  const promptText = document.getElementById('image-custom-prompt').value.trim() || 'Fantasy scene';

  window.cancelRequested = false;
  showLoadingModal(true);
  closeImagePromptModal();

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${window.apiKey}`
      },
      body:JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n:1,
        size:'512x512'
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

    const imageUrl = data.data[0].url;

    if(window.editingImageEntry){
      // 既存画像を再生成
      const idx = window.editingImageEntry.index;
      const entry = window.sceneHistory[idx];
      if(entry && entry.type==='image'){
        entry.url = imageUrl;
        entry.prompt = promptText;
      }
    } else {
      // 新規
      const lastSceneEntry = [...window.sceneHistory].reverse().find(e=> e.type==='scene');
      if(!lastSceneEntry){
        alert('シーンがありません。');
        return;
      }
      window.sceneHistory.push({
        type:'image',
        sceneId: lastSceneEntry.sceneId,
        prompt: promptText,
        url: imageUrl
      });
    }

    localStorage.setItem('sceneHistory', JSON.stringify(window.sceneHistory));
    updateSceneHistory();
    showLastScene();
  } catch(error){
    if(error.name === 'AbortError'){
      console.warn('カスタム画像生成キャンセル');
    } else {
      console.error('カスタム画像生成失敗:', error);
      alert('カスタム画像生成失敗:\n'+error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}
