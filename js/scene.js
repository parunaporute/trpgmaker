/********************************
 * scene.js - シナリオ/シーン管理関連 (複数シナリオ対応)
 *   セクション管理のため、従来の「シナリオ要約」を履歴先頭に表示する方式を廃止
 *   → 代わりに「まだクリアしていない最小セクション」をシーン履歴の最上部に表示する
 *   セクションをクリアすると次のセクションを追加表示、最後は「シナリオ達成」を履歴に表示
 ********************************/

window.apiKey = '';
window.sceneHistory = [];
window.currentScenarioId = null;
window.currentScenario = null;
window.currentRequestController = null;
window.cancelRequested = false;
window.editingImageEntry = null;

window.scenarioType = null;
window.clearCondition = null;

// ▼ シナリオに紐づくセクション配列（ZIP圧縮済み）
window.sections = [];  // [ {number, conditionZipped, cleared}, ... ]

/**
 * DBからシナリオ情報をロードし、シーン履歴とセクションを復元
 */
async function loadScenarioData(scenarioId) {
  try {
    const scenario = await getScenarioById(scenarioId);
    if (!scenario) {
      alert("指定されたシナリオIDが存在しません。");
      return;
    }
    window.currentScenario = scenario;

    // ウィザードデータからシナリオタイプなど復元
    const wd = scenario.wizardData || {};
    window.scenarioType = wd.scenarioType;
    window.clearCondition = wd.clearCondition || "";
    // セクション配列
    window.sections = wd.sections || [];

    // シーン履歴を取得
    const entries = await getSceneEntriesByScenarioId(scenarioId);
    window.sceneHistory = entries.map(e => ({
      entryId: e.entryId,
      type: e.type,
      sceneId: e.sceneId,
      content: e.content,
      dataUrl: e.dataUrl,
      prompt: e.prompt
    }));

    // ネタバレボタン
    if (window.scenarioType === "objective") {
      const sb = document.getElementById("spoiler-button");
      if (sb) sb.style.display = "inline-block";
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

/**
 * シーン生成
 */
async function getNextScene() {
  if (!window.apiKey) {
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput = (document.getElementById('player-input')?.value || "").trim();

  // シーンがある場合は行動必須
  const hasScene = window.sceneHistory.some(e => e.type === 'scene');
  if (hasScene && !playerInput) {
    alert('プレイヤーの行動を入力してください');
    return;
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  // システムプロンプト
  let systemText = "あなたはTRPGのゲームマスターです。HTMLタグOK。";
  const messages = [
    { role: 'system', content: systemText },
  ];

  // シナリオ概要（実際には使わず）
  if (window.currentScenario) {
    const wizardData = window.currentScenario.wizardData || {};
    // ここではパーティ情報を埋め込み
    const scenarioSummary = wizardData.scenarioSummary || "(概要)";
    messages.push({ role: 'user', content: `シナリオ概要:${scenarioSummary}` });

    // パーティ情報
    const charData = await loadCharacterDataFromIndexedDB();
    const party = charData.filter(e => e.group === "Party");
    const partyText = buildPartyInsertionText(party);
    messages.push({ role: 'user', content: partyText });
  }

  // 過去のシーン履歴
  window.sceneHistory.forEach(e => {
    if (e.type === 'scene') {
      messages.push({ role: 'assistant', content: e.content });
    } else if (e.type === 'action') {
      messages.push({ role: 'user', content: `プレイヤーの行動:${e.content}` });
    }
  });

  // 今回の行動
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

    const nextScene = data.choices[0].message.content;

    // 1) 行動履歴
    if (playerInput) {
      const actionEntry = {
        scenarioId: window.currentScenarioId || 0,
        type: 'action',
        content: playerInput,
        sceneId: null
      };
      const newActionId = await addSceneEntry(actionEntry);
      window.sceneHistory.push({
        entryId: newActionId,
        type: 'action',
        content: playerInput
      });
      document.getElementById('player-input').value = '';
    }

    // 2) 新しいシーン
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

    // シナリオ更新
    if (window.currentScenario) {
      await updateScenario({
        ...window.currentScenario,
        updatedAt: new Date().toISOString()
      });
    }

    updateSceneHistory();
    showLastScene();
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
 * シーン履歴を再構築する
 * 仕様:
 *  - ゲーム開始時 → 未クリアセクションの最小番号が1なら、それのみを履歴に表示
 *  - セクション1クリア後 → 履歴にセクション1が残り、かつセクション2が追加表示
 *  - セクション2クリア後 → 履歴にセクション1&2が残り、セクション3を表示
 *  - ...
 *  - 最後のセクションがクリアされた時点で「シナリオ達成」を履歴に追加表示
 * 
 * “セクションの表示” は「シナリオ概要の代わり」に先頭に配置
 */
function updateSceneHistory() {
  const historyContainer = document.getElementById('scene-history');
  if (!historyContainer) return;

  historyContainer.innerHTML = '';

  // 1) まず、最小の未クリアセクション番号を判定
  const sorted = [...window.sections].sort((a,b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);
  if (!firstUncleared) {
    // すべてクリア済み → 履歴の最上部に「シナリオ達成」のみ表示
    const tile = document.createElement('div');
    tile.className = 'history-tile';
    tile.textContent = "シナリオ達成";
    historyContainer.appendChild(tile);
  } else {
    // 未クリアセクションがある → そこまでのセクションは履歴に表示
    // つまり section.number <= firstUncleared.number をすべて
    for(const sec of sorted) {
      if(sec.number < firstUncleared.number) {
        // 過去にクリア済みセクションとして履歴に残す
        const t = document.createElement('div');
        t.className = 'history-tile';
        t.textContent = `セクション${sec.number} (クリア済み)`;
        historyContainer.appendChild(t);
      } else if(sec.number === firstUncleared.number) {
        // 今まさに取り組むセクション
        const t = document.createElement('div');
        t.className = 'history-tile';
        t.textContent = `セクション${sec.number} (未クリア)`;
        historyContainer.appendChild(t);
      } else {
        // それより先のセクションはまだ非表示
      }
    }
  }

  // 2) その下に、「行動/シーン/画像」などを順番に表示
  //  ただし、最後のシーン(現状)は showLastScene() で別枠に表示するため
  //  “最後のシーン+画像” はスキップする
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  const skipEntryIds = [];
  if (lastSceneEntry) {
    skipEntryIds.push(lastSceneEntry.entryId);
    // そのsceneIdの画像もスキップ
    window.sceneHistory.forEach(e => {
      if(e.type==='image' && e.sceneId===lastSceneEntry.sceneId){
        skipEntryIds.push(e.entryId);
      }
    });
  }

  // フィルタして古い順に
  const entriesToShow = window.sceneHistory
    .filter(e => !skipEntryIds.includes(e.entryId))
    .sort((a, b) => (a.entryId - b.entryId));

  for(const entry of entriesToShow) {
    // scene / action / image
    if(entry.type === 'scene'){
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      // 削除ボタン
      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.style.marginBottom = '5px';
      delBtn.addEventListener('click', async () => {
        const toRemoveIds = [entry.entryId];
        window.sceneHistory.forEach(e => {
          if(e.type==='image' && e.sceneId===entry.sceneId){
            toRemoveIds.push(e.entryId);
          }
        });
        for(const rid of toRemoveIds) {
          await deleteSceneEntry(rid);
        }
        window.sceneHistory = window.sceneHistory.filter(e => !toRemoveIds.includes(e.entryId));
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      // テキスト
      const p = document.createElement('p');
      p.className = 'scene-text';
      p.setAttribute('contenteditable', window.apiKey ? 'true':'false');
      p.innerHTML = DOMPurify.sanitize(entry.content);
      p.addEventListener('blur', async() => {
        if(!window.apiKey) return;
        entry.content = p.innerText.trim();
        const updated = {
          entryId: entry.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: 'scene',
          sceneId: entry.sceneId,
          content: entry.content
        };
        await updateSceneEntry(updated);
      });
      tile.appendChild(p);

      historyContainer.appendChild(tile);

    } else if(entry.type==='action'){
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.style.backgroundColor = '#f44336';
      delBtn.style.marginBottom = '5px';
      delBtn.addEventListener('click', async () => {
        await deleteSceneEntry(entry.entryId);
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== entry.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const a = document.createElement('p');
      a.className = 'action-text';
      a.setAttribute('contenteditable', window.apiKey ? 'true' : 'false');
      a.innerHTML = DOMPurify.sanitize(entry.content);
      a.addEventListener('blur', async() => {
        if(!window.apiKey) return;
        entry.content = a.innerText.trim();
        const updated = {
          entryId: entry.entryId,
          scenarioId: window.currentScenarioId||0,
          type:'action',
          content: entry.content
        };
        await updateSceneEntry(updated);
      });
      tile.appendChild(a);

      historyContainer.appendChild(tile);

    } else if(entry.type==='image'){
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const img = document.createElement('img');
      img.src = entry.dataUrl;
      img.alt = '生成画像';
      img.style.maxWidth = '100%';
      tile.appendChild(img);

      // 再生成
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '再生成';
      regenBtn.addEventListener('click', () => {
        if(!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(entry);
        if(idx >= 0){
          openImagePromptModal(entry.prompt, idx);
        }
      });
      tile.appendChild(regenBtn);

      // 削除
      const delBtn = document.createElement('button');
      delBtn.textContent = '画像だけ削除';
      delBtn.addEventListener('click', async() => {
        if(!window.apiKey) return;
        await deleteSceneEntry(entry.entryId);
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== entry.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      historyContainer.appendChild(tile);
    }
  }

  // スクロール最下部へ
  historyContainer.scrollTop = historyContainer.scrollHeight;
}

/**
 * 最新シーンをメイン表示
 */
function showLastScene() {
  const storyDiv = document.getElementById('story');
  const lastSceneImagesDiv = document.getElementById('last-scene-images');
  if (!storyDiv || !lastSceneImagesDiv) return;

  const nextSceneBtn = document.getElementById('next-scene');
  const playerInput = document.getElementById('player-input');
  const playerActionLabel = document.getElementById('player-action');

  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');

  if (lastSceneEntry) {
    storyDiv.innerHTML = '';

    const sceneText = document.createElement('p');
    sceneText.className = 'scene-text';
    sceneText.setAttribute('contenteditable', window.apiKey ? 'true':'false');
    sceneText.innerHTML = DOMPurify.sanitize(lastSceneEntry.content);
    sceneText.addEventListener('blur', async() => {
      if(!window.apiKey) return;
      lastSceneEntry.content = sceneText.innerText.trim();
      const updated = {
        entryId: lastSceneEntry.entryId,
        scenarioId: window.currentScenarioId || 0,
        type: 'scene',
        sceneId: lastSceneEntry.sceneId,
        content: lastSceneEntry.content
      };
      await updateSceneEntry(updated);
    });
    storyDiv.appendChild(sceneText);

    // そのシーンに紐づく画像
    lastSceneImagesDiv.innerHTML = '';
    const images = window.sceneHistory.filter(e => e.type==='image' && e.sceneId===lastSceneEntry.sceneId);
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
        if(!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(imgEntry);
        if(idx>=0){
          openImagePromptModal(imgEntry.prompt, idx);
        }
      });
      container.appendChild(regenBtn);

      // 画像削除
      const delBtn = document.createElement('button');
      delBtn.textContent = '画像削除';
      delBtn.addEventListener('click', async()=>{
        if(!window.apiKey) return;
        await deleteSceneEntry(imgEntry.entryId);
        window.sceneHistory = window.sceneHistory.filter(e => e.entryId !== imgEntry.entryId);
        showLastScene();
        updateSceneHistory();
      });
      container.appendChild(delBtn);

      lastSceneImagesDiv.appendChild(container);
    });

    if(window.apiKey){
      nextSceneBtn.style.display = 'inline-block';
      playerInput.style.display = 'inline-block';
      playerActionLabel.textContent = 'プレイヤーがどんな行動を取るか？';
    } else {
      nextSceneBtn.style.display = 'none';
      playerInput.style.display = 'none';
      playerActionLabel.textContent = '';
    }
  } else {
    // シーンが無い場合
    storyDiv.innerHTML = '';
    lastSceneImagesDiv.innerHTML = '';

    if(window.apiKey){
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

/** パーティ情報差し込み */
function buildPartyInsertionText(party) {
  let text = "【パーティ編成情報】\n";

  const avatar = party.find(e => e.role === "avatar");
  if (avatar) {
    text += `プレイヤーの分身(アバター): ${avatar.name}\n`;
    text += "実プレイヤーとして扱います。\n\n";
  }

  const partners = party.filter(e => e.role === "partner");
  if (partners.length > 0) {
    text += "パートナー(フレンドリーNPC):\n";
    partners.forEach((p) => {
      text += ` - ${p.name}\n`;
    });
    text += "\n";
  }

  const others = party.filter(e => !e.role || e.role==="none");
  if(others.length>0){
    const charList = others.filter(c => c.type==="キャラクター");
    const monsterList = others.filter(c => c.type==="モンスター");
    const itemList = others.filter(c => c.type==="アイテム");

    if(charList.length>0){
      text += "◆【キャラクター】\n";
      charList.forEach(c => {
        text += ` - ${c.name}\n`;
      });
      text += "\n";
    }
    if(monsterList.length>0){
      text += "◆【モンスター】\n";
      monsterList.forEach(m => {
        text += ` - ${m.name}\n`;
      });
      text += "\n";
    }
    if(itemList.length>0){
      text += "◆【アイテム】\n";
      itemList.forEach(i => {
        text += ` - ${i.name}\n`;
      });
      text += "\n";
    }
  }

  text += "以上を踏まえ、アバターは実プレイヤー、パートナーは味方NPCとして扱ってください。";
  return text;
}

/** 連携メソッド */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function showLoadingModal(show){
  const modal = document.getElementById('loading-modal');
  if(!modal) return;
  modal.style.display = show ? 'flex' : 'none';
}

function onCancelFetch(){
  window.cancelRequested = true;
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
