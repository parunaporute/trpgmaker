/********************************
 * scene.js
 * シナリオ/シーン管理
 *  - シーン生成時、画像用のプロンプトもfunction callingで取得し「prompt」に保存
 *  - 自動生成/カスタム生成ボタンで prompt を使って画像を生成
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

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "hr", "h3", "h4", "h5", "span", "div", "strong", "em"],
  ALLOWED_ATTR: ["style"]
};

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
      dataUrl: e.dataUrl,
      // ★ 画像用プロンプトは "prompt" フィールドに格納
      prompt: e.prompt || ""
    }));

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

/** 次のシーンを生成し、履歴に追加 → 画像用プロンプトもfunction callingで作成 → その後セクション達成判定を行う */
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

  // システムプロンプト
  let systemText = "あなたはTRPGのゲームマスターです。背景黒が前提の装飾のタグを使って構いません。";
  const msgs = [{ role: "system", content: systemText }];

  // シナリオ概要 + パーティ情報
  if (window.currentScenario) {
    const wd = window.currentScenario.wizardData || {};
    const summ = wd.scenarioSummary || "(概要なし)";
    msgs.push({ role: "user", content: "シナリオ概要:" + summ });

    const charData = await loadCharacterDataFromIndexedDB();
    const party = charData.filter(e => e.group === "Party");
    const ptxt = buildPartyInsertionText(party);
    msgs.push({ role: "user", content: ptxt });
  }

  // 履歴
  window.sceneHistory.forEach(e => {
    if (e.type === "scene") {
      msgs.push({ role: "assistant", content: e.content });
    } else if (e.type === "action") {
      msgs.push({ role: "user", content: "プレイヤーの行動:" + e.content });
    }
  });

  // 今回の行動
  if (pinput) {
    msgs.push({ role: "user", content: "プレイヤーの行動:" + pinput });
  }

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: msgs
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

    const nextScene = data.choices[0].message.content || "";

    // (1) 行動を履歴に追加
    if (pinput) {
      const act = {
        scenarioId: window.currentScenarioId || 0,
        type: "action",
        content: pinput,
        sceneId: null
      };
      const actId = await addSceneEntry(act);
      window.sceneHistory.push({ entryId: actId, type: "action", content: pinput, prompt: "" });
      document.getElementById("player-input").value = "";
    }

    // (2) 新シーンを履歴に追加
    const sid = "scene_" + Date.now();
    // まずテキストを先に登録
    const se = {
      scenarioId: window.currentScenarioId || 0,
      type: "scene",
      sceneId: sid,
      content: nextScene,
      prompt: "" // 画像プロンプトは後で設定
    };
    const newSid = await addSceneEntry(se);
    const newSceneEntry = {
      entryId: newSid,
      type: "scene",
      sceneId: sid,
      content: nextScene,
      prompt: ""
    };
    window.sceneHistory.push(newSceneEntry);

    // (2.5) シーンの画像promptをfunction callingで生成
    const imagePromptText = await generateImagePromptFromScene(nextScene);
    if (imagePromptText) {
      // DB更新
      newSceneEntry.prompt = imagePromptText;
      const updateRec = {
        entryId: newSid,
        scenarioId: window.currentScenarioId || 0,
        type: "scene",
        sceneId: sid,
        content: nextScene,
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

    // 再描画
    updateSceneHistory();
    showLastScene();

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

/** シーン本文から画像用プロンプトをfunction callingで生成(ダミー実装) */
async function generateImagePromptFromScene(sceneText) {
  console.log("sceneTextシーンテキスト", sceneText);
  if (!window.apiKey) return "";
  try {
    const systemMsg = {
      role: "system",
      content: "あなたは画像生成のための短い英語プロンプトを作る関数を呼び出すアシスタントです。"
    };
    const userMsg = {
      role: "user",
      content: `
        以下のシーン文章をもとに、イラストを生成するための英語メインのキーワード列を作ってください。
        ただし、説明文や文章体は禁止。キーワードの羅列にしてください。
        NGワード: 'goblin'
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
        // function_call: ...
      })
    });
    const data = await resp.json();
    if (data.error) {
      console.warn("imagePrompt function callingエラー:", data.error);
      return "";
    }
    const result = (data.choices[0].message.content || "").trim();
    console.log("resultシーンテキスト", result);

    return result;
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
    return; // 全部クリア済
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
    console.log("セクション判定GPT回答=", answer);

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
    // 全クリア
    const tile = document.createElement("div");
    tile.className = "history-tile";
    tile.textContent = "シナリオ達成";
    his.appendChild(tile);
  } else if (sorted.length > 0) {
    // クリア済み部分だけ表示
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
      } else {
        // それより先は非表示
      }
    }
  }

  // 最後のシーンを除く行動/シーン/画像
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
      const tile = document.createElement("div");
      tile.className = "history-tile";

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
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const st = document.createElement("p");
      st.className = "scene-text";
      st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      st.innerHTML = DOMPurify.sanitize(e.content);
      st.addEventListener("blur", async () => {
        if (!window.apiKey) return;
        e.content = st.innerHTML.trim();
        const up = {
          entryId: e.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: "scene",
          sceneId: e.sceneId,
          content: e.content,
          prompt: e.prompt || ""
        };
        await updateSceneEntry(up);
      });
      tile.appendChild(st);

      his.appendChild(tile);

    } else if (e.type === "action") {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.style.backgroundColor = "#f44336";
      delBtn.style.marginBottom = "5px";
      delBtn.addEventListener("click", async () => {
        await deleteSceneEntry(e.entryId);
        window.sceneHistory = window.sceneHistory.filter(x => x.entryId !== e.entryId);
        updateSceneHistory();
        showLastScene();
      });
      tile.appendChild(delBtn);

      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(e.content);
      at.addEventListener("blur", async () => {
        if (!window.apiKey) return;
        e.content = at.innerHTML.trim();
        const up = {
          entryId: e.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: "action",
          content: e.content
        };
        await updateSceneEntry(up);
      });
      tile.appendChild(at);

      his.appendChild(tile);

    } else if (e.type === "image") {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      const img = document.createElement("img");
      img.src = e.dataUrl;
      img.alt = "生成画像";
      img.style.maxWidth = "100%";
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
        if (!window.apiKey) return;
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
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      if (!window.apiKey) return;
      lastScene.content = st.innerHTML.trim();
      const up = {
        entryId: lastScene.entryId,
        scenarioId: window.currentScenarioId || 0,
        type: "scene",
        sceneId: lastScene.sceneId,
        content: lastScene.content,
        prompt: lastScene.prompt || ""
      };
      await updateSceneEntry(up);
    });
    storyDiv.appendChild(st);

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
        if (!window.apiKey) return;
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
    // シーンが無い場合
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

/** パーティ情報の文章 */
function buildPartyInsertionText(party) {
  let txt = "【パーティ編成情報】\n";
  const ava = party.find(e => e.role === "avatar");
  if (ava) {
    txt += `アバター: ${ava.name}\n(実プレイヤー)\n\n`;
  }
  const pt = party.filter(e => e.role === "partner");
  if (pt.length > 0) {
    txt += "パートナー:\n";
    pt.forEach(p => txt += " - " + p.name + "\n");
    txt += "\n";
  }
  const others = party.filter(e => !e.role || e.role === "none");
  if (others.length > 0) {
    const cset = others.filter(x => x.type === "キャラクター");
    const mset = others.filter(x => x.type === "モンスター");
    const iset = others.filter(x => x.type === "アイテム");
    if (cset.length > 0) {
      txt += "◆キャラクター\n";
      cset.forEach(c => txt += " - " + c.name + "\n");
      txt += "\n";
    }
    if (mset.length > 0) {
      txt += "◆モンスター\n";
      mset.forEach(m => txt += " - " + m.name + "\n");
      txt += "\n";
    }
    if (iset.length > 0) {
      txt += "◆アイテム\n";
      iset.forEach(i => txt += " - " + i.name + "\n");
      txt += "\n";
    }
  }
  txt += "以上を踏まえて、アバターは実プレイヤー、パートナーは味方NPCとして扱ってください。";
  return txt;
}

/** pakoで解凍 */
function decompressCondition(zippedBase64) {
  if (!zippedBase64) return "(不明)";
  try {
    const bin = atob(zippedBase64);
    const uint8 = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
    const inf = pako.inflate(uint8);
    return new TextDecoder().decode(inf);
  } catch (e) {
    console.error("decompress失敗:", e);
    return "(解凍エラー)";
  }
}

/** ローディングモーダル表示 */
function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  m.style.display = show ? "flex" : "none";
}

/** リクエストキャンセル */
function onCancelFetch() {
  window.cancelRequested = true;
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}


/* --------------------------------------------
   画像生成ボタン：自動生成(現シーンから)
   1) 今のシーンにpromptがあれば、それを使う
   2) 無ければ「生成する為のプロンプトがありません」を表示
   3) 生成時は characterCreate.jsのgenerateCharacterImage の仕様に準拠
-------------------------------------------- */
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

  // ボディ文言は "Now generate the next anime wide image.\n↓↓↓↓\n" + prompt
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

    // 新しいimage entry追加
    const newEntry = {
      scenarioId: window.currentScenarioId || 0,
      type: "image",
      sceneId: lastSceneEntry.sceneId,
      content: "", // 画像にテキストなし
      dataUrl,
      // 画像生成時点のpromptを記録しておく
      prompt: lastSceneEntry.prompt
    };
    const newId = await addSceneEntry(newEntry);
    window.sceneHistory.push({
      entryId: newId,
      type: "image",
      sceneId: lastSceneEntry.sceneId,
      content: "",
      dataUrl,
      prompt: lastSceneEntry.prompt
    });

    // 表示更新
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
    // 既存画像の再生成
    window.editingImageEntry = { index };
    const entry = window.sceneHistory[index];
    if (entry && entry.type === "image") {
      scenePrompt = entry.prompt;
    }
  } else {
    // 新規
    const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
    if (lastSceneEntry && lastSceneEntry.prompt) {
      scenePrompt = lastSceneEntry.prompt;
    } else {
      scenePrompt = "";
    }
  }

  document.getElementById("image-custom-prompt").value = scenePrompt;
  document.getElementById("image-prompt-modal").style.display = "flex";
}

/** カスタム画像生成モーダルを閉じる */
function closeImagePromptModal() {
  document.getElementById("image-prompt-modal").style.display = "none";
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

  // 前提文 + userPromptText
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
      // 既存画像を再生成
      const idx = window.editingImageEntry.index;
      const entry = window.sceneHistory[idx];
      if (entry && entry.type === "image") {
        entry.dataUrl = dataUrl;
        entry.prompt = userPromptText;
        // DB更新
        const upRec = {
          entryId: entry.entryId,
          scenarioId: window.currentScenarioId || 0,
          type: "image",
          sceneId: entry.sceneId,
          content: "",
          dataUrl,
          prompt: userPromptText
        };
        await updateSceneEntry(upRec);
      }
    } else {
      // 新規画像
      const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
      if (!lastSceneEntry) {
        alert("シーンがありません。");
        showLoadingModal(false);
        return;
      }
      const newRec = {
        scenarioId: window.currentScenarioId || 0,
        type: "image",
        sceneId: lastSceneEntry.sceneId,
        content: "",
        dataUrl,
        prompt: userPromptText
      };
      const newId = await addSceneEntry(newRec);
      window.sceneHistory.push({
        entryId: newId,
        type: "image",
        sceneId: lastSceneEntry.sceneId,
        content: "",
        dataUrl,
        prompt: userPromptText
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


/* -------------------------------------------
   イベントリスナー (scenario.html 内) で呼ばれる
-------------------------------------------*/
window.generateImageFromCurrentScene = generateImageFromCurrentScenePrompt;
window.onCustomImageGenerate = onCustomImageGenerate;

