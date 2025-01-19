/********************************
 * scene.js - シナリオ/シーン管理関連 (複数シナリオ対応)
 ********************************/

window.apiKey = '';
window.sceneHistory = [];
window.currentScenarioId = null;
window.currentScenario = null;
window.currentRequestController = null;
window.cancelRequested = false;
window.editingImageEntry = null;

// シナリオタイプやクリア条件（目的達成型/探索型の区別）
window.scenarioType = null;
window.clearCondition = null;

/** ユニークID生成 */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * パーティ情報を文章にまとめる。
 * 「プレイヤーの分身(role='avatar')」「パートナー(role='partner')」
 * それ以外（roleがnone）は、従来どおりtype(キャラクター/モンスター/アイテム)により区別。
 */
function buildPartyInsertionText(party) {
  let text = "【パーティ編成情報】\n";

  // 1) プレイヤーの分身(アバター)
  const avatar = party.find(e => e.role === "avatar");
  if (avatar) {
    text += `プレイヤーの分身(アバター): ${avatar.name}\n`;
    text += "このアバターは、TRPGでコマンドを入力している実プレイヤーとして扱います。\n\n";
  }

  // 2) パートナー(フレンドリーNPC)
  const partners = party.filter(e => e.role === "partner");
  if (partners.length > 0) {
    text += "パートナー(フレンドリーNPC):\n";
    partners.forEach((p) => {
      text += ` - ${p.name}\n`;
    });
    text += "これらのパートナーは、コマンドを入力しているTRPGプレイヤーにとって友好的なNPCとして扱います。\n\n";
  }

  // 3) 上記以外(role==="none")のカードを、従来の type で仕分け
  //    → キャラクター / モンスター / アイテム
  const others = party.filter(e => !e.role || e.role === "none");
  if (others.length > 0) {
    // ここから従来通り type="キャラクター" "モンスター" "アイテム" などをまとめる
    const charList = others.filter(e => e.type === "キャラクター");
    const monsterList = others.filter(e => e.type === "モンスター");
    const itemList = others.filter(e => e.type === "アイテム");

    if (charList.length > 0) {
      text += "◆【キャラクター】\n";
      charList.forEach(ch => {
        text += ` - ${ch.name}\n`;
      });
      text += "\n";
    }

    if (monsterList.length > 0) {
      text += "◆【モンスター】\n";
      monsterList.forEach(m => {
        text += ` - ${m.name}\n`;
      });
      text += "\n";
    }

    if (itemList.length > 0) {
      text += "◆【アイテム】\n";
      itemList.forEach(it => {
        text += ` - ${it.name}\n`;
      });
      text += "\n";
    }
  }

  text += "以上を踏まえて、シーン描写の中でアバターやパートナーが絡む場合は、" +
          "指定の通りに扱ってください。アバターは実プレイヤー、パートナーは味方NPCとなります。";

  return text;
}


/**
 * 指定シナリオIDをDBからロードして sceneHistory を構築
 */
async function loadScenarioData(scenarioId) {
  try {
    // シナリオ情報
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

    // 目的達成型ならネタバレボタン表示
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
 * プレイヤー行動をもとに次のシーンをChatGPTから取得
 */
async function getNextScene() {
  if (!window.apiKey) {
    alert('APIキーが設定されていません。');
    return;
  }
  const playerInput = (document.getElementById('player-input')?.value || "").trim();

  // 既にシーンがある場合は行動必須
  const hasScene = window.sceneHistory.some(e => e.type === 'scene');
  if (hasScene && !playerInput) {
    alert('プレイヤーの行動を入力してください');
    return;
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  // プロンプト用メッセージを積み上げ
  // -----------------------------------------
  // まずシステムプロンプト
  let systemText = "あなたはTRPGのゲームマスターです。HTMLタグOK。";
  const messages = [
    { role: 'system', content: systemText },
  ];

  // シナリオ概要
  if (window.currentScenario) {
    const wizardData = window.currentScenario.wizardData || {};
    const scenarioSummary = wizardData.scenarioSummary || "(概要なし)";
    messages.push({ role: 'user', content: `シナリオ概要:${scenarioSummary}` });

    // ★ パーティ情報（avatar / partner 含む）を挿入
    //   group==="Party" の要素を抽出して buildPartyInsertionText
    const charData = await loadCharacterDataFromIndexedDB();
    const party = charData.filter(e => e.group === "Party");
    const partyText = buildPartyInsertionText(party);
    messages.push({ role: 'user', content: partyText });
  }

  // 過去のシーン履歴をChatGPTに渡す
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

  // -----------------------------------------
  // GPTに投げる
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

    // 1) 行動を履歴に追加
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

    // 2) 次のシーンを履歴に追加
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

    // 画面更新
    updateSceneHistory();
    showLastScene();

    // シナリオ更新日時
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
 * シーン履歴を画面に表示する。
 * - 先頭に必ずシナリオ概要タイルを追加
 * - 最後のシーン(および関連画像)は履歴に表示しない
 * - それ以外のentryを古い順に表示
 */
function updateSceneHistory() {
  const historyContainer = document.getElementById('scene-history');
  if (!historyContainer) return;

  // 1) いったんクリア
  historyContainer.innerHTML = '';

  // 2) シナリオ概要タイルを最初に表示
  if (window.currentScenario && window.currentScenario.wizardData) {
    const scenarioSummary = window.currentScenario.wizardData.scenarioSummary || '（シナリオ概要なし）';
    const summaryTile = document.createElement('div');
    summaryTile.className = 'history-tile';
    summaryTile.innerHTML = DOMPurify.sanitize(scenarioSummary);
    historyContainer.appendChild(summaryTile);
  }

  // 3) 「最後のシーン」を特定（履歴に出さない）
  const reversed = [...window.sceneHistory].reverse();
  const lastSceneEntry = reversed.find(e => e.type === 'scene');
  let skipEntryIds = [];
  if (lastSceneEntry) {
    skipEntryIds.push(lastSceneEntry.entryId);

    // 最後のシーンに紐づく画像もスキップ
    window.sceneHistory.forEach(e => {
      if (e.type === 'image' && e.sceneId === lastSceneEntry.sceneId) {
        skipEntryIds.push(e.entryId);
      }
    });
  }

  // 4) フィルタリングして「最後のシーン以外」を古い順で表示
  const entriesToShow = window.sceneHistory
    .filter(e => !skipEntryIds.includes(e.entryId))
    .sort((a, b) => (a.entryId - b.entryId)); // entryId昇順(=古い順)

  entriesToShow.forEach(entry => {
    if (entry.type === 'scene') {
      // シーン
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.marginBottom = '5px';
      deleteBtn.addEventListener('click', async () => {
        if (!window.apiKey) return;

        const delSceneId = entry.sceneId;
        const toRemoveIds = [entry.entryId];
        // 同じsceneIdの画像も削除
        window.sceneHistory.forEach(e => {
          if (e.type === 'image' && e.sceneId === delSceneId) {
            toRemoveIds.push(e.entryId);
          }
        });
        // DB削除
        for (const rid of toRemoveIds) {
          await deleteSceneEntry(rid);
        }
        // メモリ削除
        window.sceneHistory = window.sceneHistory.filter(e => !toRemoveIds.includes(e.entryId));

        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(deleteBtn);

      // テキスト可変
      const sceneText = document.createElement('p');
      sceneText.className = 'scene-text';
      sceneText.setAttribute('contenteditable', window.apiKey ? 'true' : 'false');
      sceneText.innerHTML = DOMPurify.sanitize(entry.content);
      sceneText.addEventListener('blur', async () => {
        if (!window.apiKey) return;
        entry.content = sceneText.textContent.trim();
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
      // 行動
      const tile = document.createElement('div');
      tile.className = 'history-tile';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.style.backgroundColor = '#f44336';
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

      // 再生成
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

  // スクロール最下部へ
  historyContainer.scrollTop = historyContainer.scrollHeight;
}

/**
 * 最新シーン(末尾1件)をメイン表示し、ここも編集できるようにする
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
    // ここを編集可能にする
    storyDiv.innerHTML = '';

    // メインストーリー編集用の <p> 要素
    const sceneText = document.createElement('p');
    sceneText.className = 'scene-text';
    sceneText.setAttribute('contenteditable', window.apiKey ? 'true' : 'false');
    sceneText.innerHTML = DOMPurify.sanitize(lastSceneEntry.content);
    storyDiv.appendChild(sceneText);

    // blurでDBに保存
    sceneText.addEventListener('blur', async () => {
      if (!window.apiKey) return;
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

    // シーンに紐づく画像を表示
    lastSceneImagesDiv.innerHTML = '';
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

    // 入力関連の表示可否
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
    // シーンが無い場合 => シナリオ概要のみ
    storyDiv.innerHTML = '';
    lastSceneImagesDiv.innerHTML = '';

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

/** リクエスト中断 */
function onCancelFetch() {
  window.cancelRequested = true;
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
