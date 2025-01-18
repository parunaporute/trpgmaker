/********************************
 * scene.js - シナリオ/シーン管理関連 (複数シナリオ対応)
 ********************************/

// グローバル変数
window.apiKey = '';
// 旧フリーシナリオ用
window.scenario = '';
window.currentScene = 0;
window.sceneHistory = [];

// 複数シナリオ用
window.currentScenarioId = null;      // URL param
window.currentScenario = null;        // { scenarioId, title, wizardData... }

window.currentRequestController = null;
window.cancelRequested = false;
window.editingImageEntry = null;

/** ユニークIDを生成(シーン区別用) */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/** onload などは main.js 側で呼ばれず、代わりに scenarioPage.js で呼ばれる場合もあるが、最終的には下記手順が行われる想定：
 *  1) initIndexedDB()
 *  2) parse URL param -> scenarioId
 *  3) if scenarioId => load that scenario & sceneHistory
 *  4) else => 旧フリーシナリオモード
 */

/** 指定シナリオをロードし、sceneHistoryに展開 */
async function loadScenarioData(scenarioId) {
  try {
    // シナリオ情報を取得
    const scenario = await getScenarioById(scenarioId);
    if (!scenario) {
      alert("指定されたシナリオIDが存在しません。");
      return;
    }
    window.currentScenario = scenario;

    // シナリオのWizardDataから scenarioType, clearCondition を復元
    const wd = scenario.wizardData || {};
    window.scenarioType = wd.scenarioType; // "objective" or "exploration"
    window.clearCondition = wd.clearCondition || "";

    // シーンエントリを読み込む
    const entries = await getSceneEntriesByScenarioId(scenarioId);
    // sceneHistory相当の配列を構築
    window.sceneHistory = entries.map(e => {
      // type:'scene'|'action'|'image'
      return {
        entryId: e.entryId,
        type: e.type,
        sceneId: e.sceneId,
        content: e.content,
        dataUrl: e.dataUrl,
        prompt: e.prompt
      };
    });

    // 目的達成型ならネタバレボタン表示
    if (window.scenarioType === "objective") {
      const sb = document.getElementById("spoiler-button");
      if (sb) sb.style.display = "inline-block";
      // ネタバレモーダルの文言
      const spTxt = document.getElementById("clear-condition-text");
      if (spTxt) {
        spTxt.textContent = window.clearCondition || "（クリア条件なし）";
      }
    }
    // 探索型なら「カードを取得する」ボタン表示
    else if (window.scenarioType === "exploration") {
      const gcb = document.getElementById("get-card-button");
      if (gcb) gcb.style.display = "inline-block";
    }

  } catch (err) {
    console.error("シナリオ読み込み失敗:", err);
    alert("シナリオ読み込み失敗:\n" + err.message);
  }
}

/** 新しいシーンを追加 (ChatGPT呼び出し) */
async function getNextScene() {
  if (!window.apiKey) {
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput = document.getElementById('player-input').value.trim();

  // シーンが既にある場合のみ、プレイヤー行動が未入力ならアラートを出す
  const hasScene = window.sceneHistory.some(e => e.type === 'scene');
  if (hasScene && !playerInput) {
    alert('プレイヤーの行動を入力してください');
    return;
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  const messages = [
    { role: 'system', content: 'あなたはTRPGのゲームマスターです。HTMLタグOK。' },
  ];

  // 複数シナリオの場合 => scenarioWizard で作った要約などをベースに
  if (window.currentScenario) {
    const wizardData = window.currentScenario.wizardData || {};
    const scenarioSummary = wizardData.scenarioSummary || "(概要なし)";
    messages.push({ role: 'user', content: `シナリオ概要:${scenarioSummary}` });
  }
  else {
    // 旧フリーシナリオ
    messages.push({ role: 'user', content: `シナリオ概要:${window.scenario}` });
  }

  // 過去のシーン履歴をすべて messages に
  window.sceneHistory.forEach(e => {
    if (e.type === 'scene') {
      messages.push({ role: 'assistant', content: e.content });
    } else if (e.type === 'action') {
      messages.push({ role: 'user', content: `プレイヤーの行動:${e.content}` });
    }
  });

  // 今回のプレイヤー行動
  if (playerInput) {
    messages.push({ role: 'user', content: `プレイヤーの行動:${playerInput}` });
  }

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages
      }),
      signal
    });
    if (window.cancelRequested) {
      showLoadingModal(false);
      return;
    }
    const data = await response.json();
    if (window.cancelRequested) {
      showLoadingModal(false);
      return;
    }
    if (data.error) {
      throw new Error(data.error.message);
    }

    // 次のシーン内容
    const nextScene = data.choices[0].message.content;

    // 1) (プレイヤー行動があったなら)actionをsceneHistoryへ
    if (playerInput) {
      const actionEntry = {
        scenarioId: window.currentScenarioId || 0, // 0は旧フリー
        type: 'action',
        content: playerInput,
        sceneId: null
      };
      const newActionId = await addSceneEntry(actionEntry);
      window.sceneHistory.push({
        entryId: newActionId,
        type: 'action',
        content: playerInput,
      });
      // 入力欄クリア
      document.getElementById('player-input').value = '';
    }

    // 2) sceneを追加
    const newSceneIdStr = generateUniqueId();
    const sceneEntry = {
      scenarioId: window.currentScenarioId || 0,
      type: 'scene',
      sceneId: newSceneIdStr,
      content: nextScene
    };
    const newSceneEntryId = await addSceneEntry(sceneEntry);
    window.sceneHistory.push({
      entryId: newSceneEntryId,
      type: 'scene',
      sceneId: newSceneIdStr,
      content: nextScene
    });

    updateSceneHistory();
    showLastScene();

    // シナリオ本体の updatedAt も更新
    if (window.currentScenario) {
      await updateScenario({
        ...window.currentScenario,
        updatedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('シーン取得キャンセル');
    } else {
      console.error('シーン取得失敗:', error);
      alert('シーン取得に失敗:\n' + error.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/** シーン履歴をUIに反映 */
function updateSceneHistory() {
  const historyContainer = document.getElementById('scene-history');
  if (!historyContainer) return;

  // フリーシナリオのシナリオタイルは不要or残しても良いが、簡易的に消す
  historyContainer.innerHTML = '';

  // 全エントリを表示
  window.sceneHistory.forEach((entry, index) => {
    if (entry.type === 'scene') {
      // シーン表示
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      // シーン削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.marginBottom = '5px';
      deleteBtn.addEventListener('click', async () => {
        if (!window.apiKey) return;

        // 自分を削除 + それに紐づく画像も削除
        const delSceneId = entry.sceneId;
        // sceneEntries上で sceneId===delSceneId && type==='image' も削除
        // (scene.js上では簡易に sceneHistoryから除外 + DB削除)
        const toRemoveIds = [];
        // 1. 自分
        toRemoveIds.push(entry.entryId);
        // 2. 紐づく画像
        window.sceneHistory.forEach(e => {
          if (e.type === 'image' && e.sceneId === delSceneId) {
            toRemoveIds.push(e.entryId);
          }
        });
        // まとめて削除
        for (const rid of toRemoveIds) {
          await deleteSceneEntry(rid);
        }
        // sceneHistoryから該当項目除外
        window.sceneHistory = window.sceneHistory.filter(e => !toRemoveIds.includes(e.entryId));

        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(deleteBtn);

      // シーン本文
      const sceneText = document.createElement('p');
      sceneText.className = 'scene-text';
      sceneText.setAttribute('contenteditable', window.apiKey ? 'true' : 'false');
      sceneText.innerHTML = DOMPurify.sanitize(entry.content);
      sceneText.addEventListener('blur', async () => {
        if (!window.apiKey) return;
        entry.content = sceneText.textContent.trim();
        // DB更新
        const updated = {
          entryId: entry.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: 'scene',
          sceneId: entry.sceneId,
          content: entry.content
        };
        await updateSceneEntry(updated);
      });
      tile.appendChild(sceneText);

      historyContainer.appendChild(tile);

    } else if (entry.type === 'action') {
      // プレイヤー行動
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.marginBottom = '5px';
      deleteBtn.addEventListener('click', async () => {
        if (!window.apiKey) return;

        // 削除
        await deleteSceneEntry(entry.entryId);
        // 最新アクションなら、直後のsceneも消す？ →必要なら実装
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== entry.entryId);

        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(deleteBtn);

      const actionText = document.createElement('p');
      actionText.className = 'action-text';
      actionText.setAttribute('contenteditable', window.apiKey ? 'true' : 'false');
      actionText.innerHTML = DOMPurify.sanitize(entry.content);
      actionText.addEventListener('blur', async () => {
        if (!window.apiKey) return;
        entry.content = actionText.textContent.trim();
        // DB更新
        const updated = {
          entryId: entry.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: 'action',
          content: entry.content
        };
        await updateSceneEntry(updated);
      });
      tile.appendChild(actionText);

      historyContainer.appendChild(tile);

    } else if (entry.type === 'image') {
      // 画像
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
      regenBtn.addEventListener('click', () => {
        if (!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(entry);
        if (idx >= 0) {
          openImagePromptModal(entry.prompt, idx);
        }
      });
      tile.appendChild(regenBtn);

      // 画像削除
      const imgDeleteBtn = document.createElement('button');
      imgDeleteBtn.textContent = '画像だけ削除';
      imgDeleteBtn.addEventListener('click', async () => {
        if (!window.apiKey) return;
        // DB削除
        await deleteSceneEntry(entry.entryId);
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== entry.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(imgDeleteBtn);

      historyContainer.appendChild(tile);
    }
  });

  historyContainer.scrollTop = historyContainer.scrollHeight;
}

/** 最新シーンをメイン表示 */
function showLastScene() {
  const storyDiv = document.getElementById('story');
  const lastSceneImagesDiv = document.getElementById('last-scene-images');
  if (!storyDiv || !lastSceneImagesDiv) return;

  const nextSceneBtn = document.getElementById('next-scene');
  const playerInput = document.getElementById('player-input');
  const playerActionLabel = document.getElementById('player-action');

  // 最新シーンを探す
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');

  if (lastSceneEntry) {
    storyDiv.innerHTML = DOMPurify.sanitize(lastSceneEntry.content);
    lastSceneImagesDiv.innerHTML = '';

    // 同じsceneIdの画像をまとめて表示
    const images = window.sceneHistory.filter(e => e.type === 'image' && e.sceneId === lastSceneEntry.sceneId);
    images.forEach(imgEntry => {
      const container = document.createElement('div');
      container.style.marginBottom = '10px';

      const img = document.createElement('img');
      img.src = imgEntry.dataUrl;
      img.alt = 'シーン画像';
      img.style.maxWidth = '100%';
      container.appendChild(img);

      // 再生成
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '再生成';
      regenBtn.addEventListener('click', () => {
        if (!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(imgEntry);
        if (idx >= 0) {
          openImagePromptModal(imgEntry.prompt, idx);
        }
      });
      container.appendChild(regenBtn);

      // 画像削除
      const delBtn = document.createElement('button');
      delBtn.textContent = '画像削除';
      delBtn.addEventListener('click', async () => {
        if (!window.apiKey) return;
        await deleteSceneEntry(imgEntry.entryId);
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== imgEntry.entryId);
        showLastScene();
        updateSceneHistory();
      });
      container.appendChild(delBtn);

      lastSceneImagesDiv.appendChild(container);
    });

    if (window.apiKey) {
      nextSceneBtn.style.display = 'inline-block';
      playerInput.style.display = 'inline-block';
      playerActionLabel.textContent = 'プレイヤーがどんな行動を取るか？';
    } else {
      nextSceneBtn.style.display = 'none';
      playerInput.style.display = 'none';
      playerActionLabel.textContent = '';
    }
  } else {
    // シーンがまだ無い場合

    // 1) 表示をクリア
    storyDiv.innerHTML = '';
    lastSceneImagesDiv.innerHTML = '';

    // 2) ウィザードで作成したシナリオなら、シナリオ要約を表示
    if (window.currentScenario && window.currentScenario.wizardData) {
      const summary = window.currentScenario.wizardData.scenarioSummary || "（シナリオ概要なし）";
      // ここで要約をHTML要素として差し込む（DOMPurifyでサニタイズ推奨）
      storyDiv.innerHTML = `
          <div style="margin-bottom: 10px; font-weight: bold;">
            ${DOMPurify.sanitize(summary)}
          </div>
        `;
    }

    // 3) 「最初のシーンを作るために行動を入力してください」等の文言と操作UI
    if (window.apiKey) {
      // 初回シーンを作るための入力欄を表示
      nextSceneBtn.style.display = 'inline-block';   // 次のシーンボタンを表示
      playerInput.style.display = 'block';           // プレイヤー入力欄を表示
      playerActionLabel.textContent = '最初のシーンを作るために行動を入力してください。';
    } else {
      // APIキーが無い場合はなにもできない
      nextSceneBtn.style.display = 'none';
      playerInput.style.display = 'none';
      playerActionLabel.textContent = '';
    }


    // 「シーンを生成する」ボタンを追加する例（旧フリーシナリオ向け）
    if (!window.currentScenario) {
      let generateBtn = document.getElementById('generate-scene-button');
      if (!generateBtn) {
        generateBtn = document.createElement('button');
        generateBtn.id = 'generate-scene-button';
        generateBtn.textContent = 'シーンを生成する';
        generateBtn.addEventListener('click', () => {
          generateBtn.remove();
          getNextScene();
        });
        storyDiv.appendChild(generateBtn);
      }
    }
  }
}

/** ローディングモーダル表示/非表示 */
function showLoadingModal(show) {
  const modal = document.getElementById('loading-modal');
  if (!modal) return;
  modal.style.display = show ? 'flex' : 'none';
}

/** キャンセルボタン */
function onCancelFetch() {
  window.cancelRequested = true;
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
