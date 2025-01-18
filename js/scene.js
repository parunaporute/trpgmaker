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

  // シーンが既にある場合のみ、プレイヤー行動が未入力ならアラート
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

  // 複数シナリオの場合 => scenarioWizardで作った要約などをベースに
  if (window.currentScenario) {
    const wizardData = window.currentScenario.wizardData || {};
    const scenarioSummary = wizardData.scenarioSummary || "(概要なし)";
    messages.push({ role: 'user', content: `シナリオ概要:${scenarioSummary}` });
  } else {
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

    // 1) (プレイヤー行動があったなら) actionをsceneHistoryへ
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

/**
 * シーン履歴をUIに反映
 * ただし「最新の1件」は表示しないという仕様のため、表示配列から除外します。
 */
function updateSceneHistory() {
  const historyContainer = document.getElementById('scene-history');
  if (!historyContainer) return;

  // いったんクリア
  historyContainer.innerHTML = '';

  // 「最新の1件」は履歴表示しない
  if (window.sceneHistory.length <= 1) {
    // 1件以下なら何も表示しない
    return;
  }

  // 末尾1件を除いたエントリを表示対象に
  const displayEntries = window.sceneHistory.slice(0, -1);

  displayEntries.forEach((entry) => {
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

        const delSceneId = entry.sceneId;
        const toRemoveIds = [entry.entryId];
        // 紐づく画像も削除
        window.sceneHistory.forEach(e => {
          if (e.type === 'image' && e.sceneId === delSceneId) {
            toRemoveIds.push(e.entryId);
          }
        });
        // DB削除
        for (const rid of toRemoveIds) {
          await deleteSceneEntry(rid);
        }
        // メモリ上も除外
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

        await deleteSceneEntry(entry.entryId);
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
    storyDiv.innerHTML = '';
    lastSceneImagesDiv.innerHTML = '';

    // ウィザードで作成したシナリオなら要約を表示
    if (window.currentScenario && window.currentScenario.wizardData) {
      const summary = window.currentScenario.wizardData.scenarioSummary || "（シナリオ概要なし）";
      storyDiv.innerHTML = `
          <div style="margin-bottom: 10px; font-weight: bold;">
            ${DOMPurify.sanitize(summary)}
          </div>
        `;
    }

    if (window.apiKey) {
      nextSceneBtn.style.display = 'inline-block';
      playerInput.style.display = 'block';
      playerActionLabel.textContent = '最初のシーンを作るために行動を入力してください。';
    } else {
      nextSceneBtn.style.display = 'none';
      playerInput.style.display = 'none';
      playerActionLabel.textContent = '';
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
