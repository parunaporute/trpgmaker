/********************************
 * scene.js
 * シナリオ/シーン管理
 ********************************/

window.apiKey = '';
window.sceneHistory = [];
window.currentScenarioId = null;
window.currentScenario = null;
window.currentRequestController = null;
window.cancelRequested = false;

window.scenarioType = null;
window.clearCondition = null;
window.sections = [];

// 要約をメモリ上でも管理
window.sceneSummaries = []; // sceneSummaries[chunkIndex] = { en: '...', ja: '...' }

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "hr", "h3", "h4", "h5", "span", "div", "strong", "em"],
  ALLOWED_ATTR: ["style"]
};

/** 日本語チェック用関数 */
function containsJapanese(text) {
  // 平仮名 or カタカナが含まれているかどうか
  // 例: /[ぁ-んァ-ン]/ にマッチすれば日本語(少なくとも仮名)とみなす
  return /[ぁ-んァ-ン]/.test(text);
}

/** DBからシナリオ情報を読み込み */
async function loadScenarioData(scenarioId) {
  try {
    const sc = await getScenarioById(scenarioId);
    if (!sc) {
      alert("指定シナリオが存在しません。");
      return;
    }
    window.currentScenario = sc;

    const wd = sc.wizardData || {};
    window.scenarioType = wd.scenarioType;
    window.clearCondition = wd.clearCondition || "";
    window.sections = wd.sections || [];

    const ents = await getSceneEntriesByScenarioId(scenarioId);
    window.sceneHistory = ents.map(e => ({
      entryId: e.entryId,
      type: e.type,
      sceneId: e.sceneId,
      content: e.content,
      content_en: e.content_en || "", // 英訳
      dataUrl: e.dataUrl,
      prompt: e.prompt || ""
    }));

    // sceneSummaries の読み込み
    for (let i = 0; i < 100; i++) {
      const sumRec = await getSceneSummaryByChunkIndex(i);
      if (!sumRec) break;
      window.sceneSummaries[i] = {
        en: sumRec.content_en,
        ja: sumRec.content_ja
      };
    }

    // ネタバレ(目的達成型)
    if (window.scenarioType === "objective") {
      const sb = document.getElementById("spoiler-button");
      if (sb) sb.style.display = "inline-block";
      const sp = document.getElementById("clear-condition-text");
      if (sp) sp.textContent = window.clearCondition || "(クリア条件なし)";
    } else if (window.scenarioType === "exploration") {
      const gcb = document.getElementById("get-card-button");
      if (gcb) gcb.style.display = "inline-block";
    }
  } catch (err) {
    console.error("シナリオ読み込み失敗:", err);
    alert("読み込み失敗:" + err.message);
  }
}

/** 次のシーンを生成（日本語チェック・リトライ付き） */
async function getNextScene() {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  const pinput = (document.getElementById("player-input")?.value || "").trim();
  const hasScene = window.sceneHistory.some(e => e.type === "scene");
  if (hasScene && !pinput) {
    alert("プレイヤー行動を入力してください");
    return;
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  // まずユーザー行動の英訳を作成(必要なら)
  let actionEn = "";
  if (pinput) {
    actionEn = await generateEnglishTranslation(pinput);
  }

  // システムプロンプト1
  let systemText =
    `あなたは経験豊かなやさしいTRPGのゲームマスターです。
以下を守ってください。
・背景黒が前提の装飾のタグを使う
・<<<< 絶対に出力は日本語で。Please answer in Japanese!!!! >>>>
・決して一つ前のレスポンスと同じ言い回しで終わらない
・メタな表現をしない
  - ゲームマスター側の描写をしない
    -- 例：ゲームマスターは言った「…」
  - 決してセクションそのものをシーンに書いてはいけない。
    -- 例：「地下迷宮の謎を解き明かす」という「第2章」クリアを目指して、あなたは先へ進みます。
・ユーザーが困っている場合は、セクションをクリアできるようなヒントも出す
・同じことを言ってループしない
・ユーザーの行動を踏まえて、次の行動を促すようなシーンを作る
・時々パーティを会話させる
`;

  const wd = (window.currentScenario && window.currentScenario.wizardData) || {};
  const sections = wd.sections || [];
  if (sections.length > 0) {
    systemText += "\n======\n";
    for (const sec of sections) {
      systemText += `【セクション${sec.number}】` + (sec.cleared ? "(クリア済み)" : "(未クリア)") + "\n";
      systemText += "条件: " + decompressCondition(sec.conditionZipped) + "\n\n";
    }
    systemText += "======\n";
  }

  // メッセージ履歴
  const msgs = [{ role: "system", content: systemText }];

  // シナリオ概要 + パーティ情報
  if (window.currentScenario) {
    const scenarioWd = window.currentScenario.wizardData || {};
    // 英語があれば英語を使う、なければ日本語を使う
    const summ = scenarioWd.scenarioSummaryEn?.trim()
      ? scenarioWd.scenarioSummaryEn
      : (scenarioWd.scenarioSummary || "");
    msgs.push({ role: "user", content: "シナリオ概要:" + summ });

    const charData = await loadCharacterDataFromIndexedDB();
    const party = charData.filter(e => e.group === "Party");
    const ptxt = buildPartyInsertionText(party);
    msgs.push({ role: "user", content: ptxt });
  }

  // 今回含めた行動数
  const actionCount = window.sceneHistory.filter(e => e.type === "action").length + (pinput ? 1 : 0);

  // (A) 要約(複数)を先に push
  const chunkEnd = Math.floor((actionCount - 15) / 10);
  // 例: 15->0, 25->1, 35->2, 45->3
  for (let i = 0; i <= chunkEnd; i++) {
    if (i < 0) continue;
    if (window.sceneSummaries[i]) {
      // 英語があれば英語を使う
      const sumObj = window.sceneSummaries[i];
      msgs.push({
        role: "assistant",
        content: sumObj.en || sumObj.ja || "(no summary)"
      });
    }
  }

  // (B) 要約に含まれないシーン/行動だけ push
  const skipCount = (chunkEnd + 1) * 10;
  let actionCounter = 0;
  for (const e of window.sceneHistory) {
    if (e.type === "action") {
      actionCounter++;
      if (actionCounter <= skipCount) continue;
      // 英語があれば英語を使う
      const actText = e.content_en?.trim() ? e.content_en : e.content;
      msgs.push({ role: "user", content: "player action:" + actText });
    } else if (e.type === "scene") {
      if (actionCounter <= skipCount) {
        continue;
      }
      // 英語があれば英語を使う
      const scText = e.content_en?.trim() ? e.content_en : e.content;
      msgs.push({ role: "assistant", content: scText });
    }
  }

  // 今回の行動(未挿入なら追加)
  if (pinput) {
    msgs.push({ role: "user", content: "プレイヤーの行動:" + pinput });
  }

  let nextScene = "";
  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    // 最大3回リトライして日本語含有を確認
    let isSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      // GPT呼び出し
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${window.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: msgs,
          temperature: 0.7
        }),
        signal
      });

      if (window.cancelRequested) {
        showLoadingModal(false);
        return;
      }

      const data = await resp.json();
      if (window.cancelRequested) {
        showLoadingModal(false);
        return;
      }
      if (data.error) throw new Error(data.error.message);

      const candidate = data.choices[0].message.content || "";
      if (containsJapanese(candidate)) {
        nextScene = candidate;
        isSuccess = true;
        break; // 日本語を含むので成功
      } else {
        // 3回目ならあきらめてそれを使う
        if (attempt === 3) {
          nextScene = candidate;
          alert("日本語を検出できませんでしたが、3回目の結果で進行します。");
        }
      }
    }

    // (1) 行動をDBに保存
    if (pinput) {
      const act = {
        scenarioId: window.currentScenarioId || 0,
        type: "action",
        content: pinput,
        content_en: actionEn,
        sceneId: null
      };
      const actId = await addSceneEntry(act);
      window.sceneHistory.push({ ...act, entryId: actId });
      document.getElementById("player-input").value = "";
    }

    // (2) 新シーンをDBに追加
    const sid = "scene_" + Date.now();
    const sceneEn = await generateEnglishTranslation(nextScene);
    const se = {
      scenarioId: window.currentScenarioId || 0,
      type: "scene",
      sceneId: sid,
      content: nextScene,
      content_en: sceneEn,
      prompt: ""
    };
    const newSid = await addSceneEntry(se);
    const newSceneEntry = { ...se, entryId: newSid };
    window.sceneHistory.push(newSceneEntry);

    // (2.5) シーンの画像promptをfunction callingで生成
    const imagePromptText = await generateImagePromptFromScene(nextScene);
    if (imagePromptText) {
      newSceneEntry.prompt = imagePromptText;
      const updateRec = {
        ...newSceneEntry,
        prompt: imagePromptText
      };
      await updateSceneEntry(updateRec);
    }

    // (3) シナリオ更新
    if (window.currentScenario) {
      await updateScenario({
        ...window.currentScenario,
        updatedAt: new Date().toISOString()
      });
    }

    // (4) セクション達成チェック
    await checkSectionClearViaChatGPT(pinput, nextScene);

    // (5) 行動数判定して要約作成
    await handleSceneSummaries();

    // (6) 画面再描画
    updateSceneHistory();
    showLastScene();

    // (7) シーン生成のたびに回答候補コンテナをクリア
    const candidatesContainer = document.getElementById("action-candidates-container");
    if (candidatesContainer) {
      candidatesContainer.innerHTML = "";
    }

    // (8) 「自動的に生成する」チェックが入っていたら回答候補を生成
    const autoGenCheckbox = document.getElementById("auto-generate-candidates-checkbox");
    if (autoGenCheckbox && autoGenCheckbox.checked) {
      onGenerateActionCandidates(); 
    }

  } catch (e) {
    if (e.name === "AbortError") {
      console.warn("シーン取得キャンセル");
    } else {
      console.error(e);
      alert("シーン取得失敗:" + e.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/** 行動数に応じて要約を作成/削除する */
async function handleSceneSummaries() {
  const actionCount = window.sceneHistory.filter(e => e.type === "action").length;
  // 新規要約作成チェック
  if (actionCount >= 15) {
    // 15回目 -> chunkIndex=0 -> 1..10を要約
    // 25回目 -> chunkIndex=1 -> 11..20
    // ...
    // chunkIndex = floor((actionCount - 15)/10)
    const chunkIndex = Math.floor((actionCount - 15) / 10);
    if (chunkIndex >= 0) {
      // まだ sceneSummaries[chunkIndex] が無ければ作成
      if (!window.sceneSummaries[chunkIndex]) {
        // 要約対象のaction range
        const startAction = chunkIndex * 10 + 1;
        const endAction = (chunkIndex + 1) * 10;

        // 1～10件目のentryをまとめる (action+scene混在)
        //   ただし "action順に" 取り出す。面倒なので entryId でなく actionカウント順で拾う
        let gathered = [];
        let actionCounter = 0;
        for (const e of window.sceneHistory) {
          if (e.type === "action") {
            actionCounter++;
          }
          if (actionCounter >= startAction && actionCounter <= endAction) {
            gathered.push(e);
          }
        }
        const textForSummary = gathered.map(x => x.type === "action" ? `A:${x.content}` : `S:${x.content}`).join("\n");

        // 要約(英語5行 + 日本語5行)
        const enSummary = await generateSummaryWithLimit(textForSummary, 5, "en");
        const jaSummary = await generateSummaryWithLimit(textForSummary, 5, "ja");

        // DBに保存
        const sumRec = {
          chunkIndex,
          content_en: enSummary,
          content_ja: jaSummary
        };
        const newId = await addSceneSummaryRecord(sumRec);
        window.sceneSummaries[chunkIndex] = {
          en: enSummary,
          ja: jaSummary
        };
      }
    }
  }

  // 削除チェック
  // もし行動削除等で actionCount < 15 なら chunkIndex=0 を削除
  // さらに < 25 なら chunkIndex=1を削除, ...
  const checks = [15, 25, 35, 45, 55, 65, 75];
  // chunkIndex=0->15,1->25,2->35,3->45,...
  for (let i = 0; i < checks.length; i++) {
    const boundary = checks[i];
    if (actionCount <= boundary) {
      // chunkIndex i を削除
      await deleteSceneSummaryByChunkIndex(i);
      window.sceneSummaries[i] = null;
    }
  }
}

/** 与えられたテキストを、(英語or日本語)で N行程度に要約する */
async function generateSummaryWithLimit(text, lines = 5, lang = "en") {
  if (!text.trim()) return "";
  let sys = "You are a talented summarizer. The final language must be English.";
  let user = `
Summarize the following text in ${lines} lines of English:
${text}
`;
  if (lang === "ja") {
    sys = "あなたは優秀な要約者です。必ず日本語で。";
    user = `
以下のテキストを${lines}行程度で簡潔にまとめてください:
${text}
`;
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        temperature: 0.5
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error("要約失敗:", err);
    return "";
  }
}

/** シーン or 行動を編集したら英訳を作り直す */
async function onSceneOrActionContentEdited(entry, newText) {
  if (!window.apiKey) {
    return;
  }
  if (newText.trim() === entry.content.trim()) {
    return; // 変化なし
  }
  // 翻訳を作り直す
  // モーダルを一時的に表示
  showLoadingModal(true);
  try {
    const en = await generateEnglishTranslation(newText);
    entry.content = newText;
    entry.content_en = en;
    const up = {
      ...entry,
      content: newText,
      content_en: en
    };
    await updateSceneEntry(up);
  } catch (err) {
    console.error("再翻訳失敗:", err);
  } finally {
    showLoadingModal(false);
  }
}

/** シーン履歴を表示 */
function updateSceneHistory() {
  const his = document.getElementById("scene-history");
  if (!his) return;
  his.innerHTML = "";

  // 未クリアセクションの最小番号
  const wd = window.currentScenario?.wizardData;
  let sections = [];
  if (wd && wd.sections) {
    sections = wd.sections;
  }
  const sorted = [...sections].sort((a, b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);

  if (!firstUncleared && sorted.length > 0) {
    const tile = document.createElement("div");
    tile.className = "history-tile";
    tile.textContent = "シナリオ達成";
    his.appendChild(tile);
  } else if (sorted.length > 0) {
    for (const s of sorted) {
      if (s.number < (firstUncleared?.number || 99999)) {
        const t = document.createElement("div");
        t.className = "history-tile";
        t.textContent = `セクション${s.number} (クリア済み)`;
        his.appendChild(t);
      } else if (s.number === firstUncleared.number) {
        const t = document.createElement("div");
        t.className = "history-tile";
        t.textContent = `セクション${s.number} (未クリア)`;
        his.appendChild(t);
      }
    }
  }

  // 最後のシーンは後で showLastScene() 側で表示するので履歴には表示しない
  const lastScene = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  const skipIds = [];
  if (lastScene) {
    skipIds.push(lastScene.entryId);
    window.sceneHistory.forEach(x => {
      if (x.type === "image" && x.sceneId === lastScene.sceneId) {
        skipIds.push(x.entryId);
      }
    });
  }
  const showEntries = window.sceneHistory
    .filter(e => !skipIds.includes(e.entryId))
    .sort((a, b) => a.entryId - b.entryId);

  for (const e of showEntries) {
    if (e.type === "scene") {
      // 履歴に表示するシーン
      const tile = document.createElement("div");
      tile.className = "history-tile";

      // 削除ボタン
      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.style.marginBottom = "5px";
      delBtn.addEventListener("click", async () => {
        const removeIds = [e.entryId];
        window.sceneHistory.forEach(x => {
          if (x.type === "image" && x.sceneId === e.sceneId) {
            removeIds.push(x.entryId);
          }
        });
        for (const rid of removeIds) {
          await deleteSceneEntry(rid);
        }
        window.sceneHistory = window.sceneHistory.filter(x => !removeIds.includes(x.entryId));

        // 行動数を数えて要約削除
        await handleSceneSummaries();

        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      // シーン本文 (contenteditable)
      const st = document.createElement("p");
      st.className = "scene-text";
      st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      st.innerHTML = DOMPurify.sanitize(e.content);
      st.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(e, st.innerHTML.trim());
      });
      tile.appendChild(st);

      his.appendChild(tile);

    } else if (e.type === "action") {
      // 履歴に表示する行動
      const tile = document.createElement("div");
      tile.className = "history-tile";

      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.style.backgroundColor = "#f44336";
      delBtn.style.marginBottom = "5px";
      delBtn.addEventListener("click", async () => {
        await deleteSceneEntry(e.entryId);
        window.sceneHistory = window.sceneHistory.filter(x => x.entryId !== e.entryId);

        await handleSceneSummaries();
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(e.content);
      at.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(e, at.innerHTML.trim());
      });
      tile.appendChild(at);

      his.appendChild(tile);

    } else if (e.type === "image") {
      // 履歴に表示する画像
      const tile = document.createElement("div");
      tile.className = "history-tile";

      const img = document.createElement("img");
      img.src = e.dataUrl;
      img.alt = "生成画像";
      img.style.maxHeight = "250px";
      tile.appendChild(img);

      const reBtn = document.createElement("button");
      reBtn.textContent = "再生成";
      reBtn.addEventListener("click", () => {
        if (!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(e);
        if (idx >= 0) {
          openImagePromptModal(e.prompt, idx);
        }
      });
      tile.appendChild(reBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "画像だけ削除";
      delBtn.addEventListener("click", async () => {
        await deleteSceneEntry(e.entryId);
        window.sceneHistory = window.sceneHistory.filter(x => x.entryId !== e.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      his.appendChild(tile);
    }
  }
  his.scrollTop = his.scrollHeight;
}

/** 最新シーンを表示 */
function showLastScene() {
  const storyDiv = document.getElementById("story");
  const lastSceneImagesDiv = document.getElementById("last-scene-images");
  if (!storyDiv || !lastSceneImagesDiv) return;

  const nextSceneBtn = document.getElementById("next-scene");
  const playerInput = document.getElementById("player-input");
  const playerActionLabel = document.getElementById("player-action");

  const lastScene = [...window.sceneHistory].reverse().find(e => e.type === "scene");

  if (lastScene) {
    storyDiv.innerHTML = "";

    // シーン本文
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(lastScene, st.innerHTML.trim());
    });
    storyDiv.appendChild(st);

    // 「このシーンを削除」ボタン
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "このシーンを削除";
    deleteBtn.style.marginBottom = "10px";
    deleteBtn.addEventListener("click", async () => {
      // 最新シーンを削除
      const removeIds = [lastScene.entryId];
      // 画像もまとめて削除
      window.sceneHistory.forEach(x => {
        if (x.type === "image" && x.sceneId === lastScene.sceneId) {
          removeIds.push(x.entryId);
        }
      });

      for (const rid of removeIds) {
        await deleteSceneEntry(rid);
      }
      window.sceneHistory = window.sceneHistory.filter(x => !removeIds.includes(x.entryId));

      // 要約再計算
      await handleSceneSummaries();
      updateSceneHistory();
      showLastScene();
    });
    storyDiv.appendChild(deleteBtn);

    // 画像エリア
    lastSceneImagesDiv.innerHTML = "";
    const images = window.sceneHistory.filter(x => x.type === "image" && x.sceneId === lastScene.sceneId);
    images.forEach(imgEntry => {
      const c = document.createElement("div");
      c.style.marginBottom = "10px";

      const i = document.createElement("img");
      i.src = imgEntry.dataUrl;
      i.alt = "シーン画像";
      i.style.maxWidth = "100%";
      c.appendChild(i);

      const reBtn = document.createElement("button");
      reBtn.textContent = "再生成";
      reBtn.addEventListener("click", () => {
        if (!window.apiKey) return;
        const idx = window.sceneHistory.indexOf(imgEntry);
        if (idx >= 0) {
          openImagePromptModal(imgEntry.prompt, idx);
        }
      });
      c.appendChild(reBtn);

      const dBtn = document.createElement("button");
      dBtn.textContent = "画像削除";
      dBtn.addEventListener("click", async () => {
        await deleteSceneEntry(imgEntry.entryId);
        window.sceneHistory = window.sceneHistory.filter(x => x.entryId !== imgEntry.entryId);
        showLastScene();
        updateSceneHistory();
      });
      c.appendChild(dBtn);

      lastSceneImagesDiv.appendChild(c);
    });

    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "inline-block";
      playerActionLabel.textContent = "プレイヤーがどんな行動を？";
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  } else {
    // シーンが無い
    storyDiv.innerHTML = "";
    lastSceneImagesDiv.innerHTML = "";

    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "block";
      playerActionLabel.textContent = "最初のシーンを作るため行動を入力してください。";
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  }
}

/** 画像用プロンプト生成 */
async function generateImagePromptFromScene(sceneText) {
  if (!window.apiKey) return "";
  try {
    const systemMsg = {
      role: "system",
      content: "あなたは画像生成のための短い英語プロンプトを作るアシスタントです。"
    };
    const userMsg = {
      role: "user",
      content: `
以下のシーン文章をもとに、イラストを生成するための英語メインのキーワード列を作成してください。
説明文や文章体は禁止。
シーン:
${sceneText}
      `
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4-0613",
        messages: [systemMsg, userMsg],
        temperature: 0.7
      })
    });
    const data = await resp.json();
    if (data.error) {
      console.warn("imagePrompt function callingエラー:", data.error);
      return "";
    }
    return (data.choices[0].message.content || "").trim();
  } catch (e) {
    console.error("generateImagePromptFromScene失敗:", e);
    return "";
  }
}

/** セクション達成チェック */
async function checkSectionClearViaChatGPT(latestAction, latestScene) {
  const wd = window.currentScenario?.wizardData;
  if (!wd || !wd.sections) return;
  const sorted = wd.sections.slice().sort((a, b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);
  if (!firstUncleared) {
    return;
  }
  const conditionText = decompressCondition(firstUncleared.conditionZipped);

  const scenarioSummary = wd.scenarioSummary || "(概要なし)";
  const messages = [
    {
      role: "system",
      content: "あなたはTRPGゲームマスターのサポートAIです。回答はYESまたはNOのみでお願いします。"
    },
    {
      role: "user",
      content: `
シナリオ概要:
${scenarioSummary}

達成条件:
「${conditionText}」

最新の行動とシーン:
(行動) ${latestAction}
(シーン) ${latestScene}

この達成条件は、今の行動やシーン内容から見て、既に満たされましたか？
YESかNOのみで答えてください。判断が難しい時はYESにしてください。
`
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
        temperature: 0.0
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const answer = (data.choices[0].message.content || "").trim().toUpperCase();
    if (answer.startsWith("YES")) {
      firstUncleared.cleared = true;
      window.currentScenario.wizardData.sections = wd.sections;
      await updateScenario(window.currentScenario);
      alert(`セクション${firstUncleared.number}をクリアしました。`);
    } else {
      console.log("未達成と判定されました。");
    }
  } catch (err) {
    console.error("セクション判定API失敗:", err);
  }
}

/** パーティ文章 */
function buildPartyInsertionText(party) {
  let txt = "【パーティ編成情報】\n";
  const ava = party.find(e => e.role === "avatar");
  if (ava) {
    txt += `プレイヤー: ${ava.name}\n\n`;
  }
  const pt = party.filter(e => e.role === "partner");
  if (pt.length > 0) {
    txt += "パートナー:\n";
    pt.forEach(p => (txt += " - " + p.name + "\n"));
    txt += "\n";
  }
  const others = party.filter(e => !e.role || e.role === "none");
  if (others.length > 0) {
    const cset = others.filter(x => x.type === "キャラクター");
    const mset = others.filter(x => x.type === "モンスター");
    const iset = others.filter(x => x.type === "アイテム");
    if (cset.length > 0) {
      txt += "◆キャラクター\n";
      cset.forEach(c => (txt += " - " + c.name + "\n"));
      txt += "\n";
    }
    if (mset.length > 0) {
      txt += "◆モンスター\n";
      mset.forEach(m => (txt += " - " + m.name + "\n"));
      txt += "\n";
    }
    if (iset.length > 0) {
      txt += "◆アイテム\n";
      iset.forEach(i => (txt += " - " + i.name + "\n"));
      txt += "\n";
    }
  }
  txt += "以上を踏まえて、プレイヤー、パートナーは味方NPC、アイテムは登場するアイテム、キャラクターは中立NPC、モンスターは敵対NPCとして扱ってください。シナリオ概要を優先するため、世界観が合わない場合は調整してもよいです。例えば、レーザーガンは西部劇ならリボルバーになりますし、エイリアンは時代劇なら浮浪者になって良いです。";
  return txt;
}

function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  m.style.display = show ? "flex" : "none";
}

function onCancelFetch() {
  window.cancelRequested = true;
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/** 画像生成ボタン：自動生成(現シーンから) */
async function generateImageFromCurrentScenePrompt() {
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  if (!lastSceneEntry) {
    alert("まだシーンがありません。");
    return;
  }
  if (!lastSceneEntry.prompt) {
    alert("生成する為のプロンプトがありません");
    return;
  }
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }

  const promptText =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    lastSceneEntry.prompt;

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // 新しいimage entry
    const newEntry = {
      scenarioId: window.currentScenarioId || 0,
      type: "image",
      sceneId: lastSceneEntry.sceneId,
      content: "",
      content_en: "",
      dataUrl,
      prompt: lastSceneEntry.prompt
    };
    const newId = await addSceneEntry(newEntry);
    window.sceneHistory.push({
      ...newEntry,
      entryId: newId
    });

    updateSceneHistory();
    showLastScene();
  } catch (err) {
    console.error("画像生成失敗:", err);
    alert("画像生成に失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

/** カスタム画像生成モーダルを開く */
function openImagePromptModal(scenePrompt = "", index = null) {
  window.editingImageEntry = null;
  if (index !== null) {
    const entry = window.sceneHistory[index];
    if (entry && entry.type === "image") {
      scenePrompt = entry.prompt;
      window.editingImageEntry = { index };
    }
  } else {
    const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
    if (lastSceneEntry && lastSceneEntry.prompt) {
      scenePrompt = lastSceneEntry.prompt;
    }
  }
  document.getElementById("image-custom-prompt").value = scenePrompt;
  const modal = document.getElementById("image-prompt-modal");
  modal.classList.add("active");
}

/** カスタム画像生成モーダルを閉じる */
function closeImagePromptModal() {
  const modal = document.getElementById("image-prompt-modal");
  modal.classList.remove("active");
  window.editingImageEntry = null;
}

/** カスタム画像生成ボタン押下 */
async function onCustomImageGenerate() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  const userPromptText = document.getElementById("image-custom-prompt").value.trim();
  if (!userPromptText) {
    alert("プロンプトが空です。");
    return;
  }

  const promptText =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    userPromptText;

  showLoadingModal(true);
  closeImagePromptModal();

  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: promptText,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    if (window.editingImageEntry) {
      // 既存画像の再生成
      const idx = window.editingImageEntry.index;
      const entry = window.sceneHistory[idx];
      if (entry && entry.type === "image") {
        entry.dataUrl = dataUrl;
        entry.prompt = userPromptText;
        const upRec = {
          ...entry,
          dataUrl,
          prompt: userPromptText
        };
        await updateSceneEntry(upRec);
      }
    } else {
      // 新規画像
      const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
      if (!lastSceneEntry) {
        showLoadingModal(false);
        alert("シーンがありません。");
        return;
      }
      const newRec = {
        scenarioId: window.currentScenarioId || 0,
        type: "image",
        sceneId: lastSceneEntry.sceneId,
        content: "",
        content_en: "",
        dataUrl,
        prompt: userPromptText
      };
      const newId = await addSceneEntry(newRec);
      window.sceneHistory.push({
        ...newRec,
        entryId: newId
      });
    }

    updateSceneHistory();
    showLastScene();
  } catch (e) {
    console.error("カスタム画像生成失敗:", e);
    alert("カスタム画像生成失敗:\n" + e.message);
  } finally {
    showLoadingModal(false);
  }
}

/** 日本語->英語翻訳 */
async function generateEnglishTranslation(japaneseText) {
  if (!japaneseText.trim()) return "";
  const sys = "あなたは優秀な翻訳家です。";
  const u = `以下のテキストを自然な英語に翻訳:\n${japaneseText}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: u }
        ],
        temperature: 0.3
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error("翻訳失敗:", err);
    return "";
  }
}

// 外部公開
window.generateImageFromCurrentScene = generateImageFromCurrentScenePrompt;
window.onCustomImageGenerate = onCustomImageGenerate;
window.openImagePromptModal = openImagePromptModal;
window.closeImagePromptModal = closeImagePromptModal;
window.onCancelFetch = onCancelFetch;
window.getNextScene = getNextScene; // ほかのスクリプトから呼び出せるように
