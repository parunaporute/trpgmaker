/*
 * scenarioPage.js
 * - 「セクション」情報や「導入シーン」を可視化
 * - 全セクション閲覧/トークン調整などのUI制御
 * - エンディング(クリア/未クリア)ボタン～モーダル表示・再生成も担当
 */

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


// 画面起動時
window.addEventListener("load", async () => {
  // IndexedDB初期化 & characterDataロード
  await initIndexedDB();
  const storedChars = await loadCharacterDataFromIndexedDB();
  window.characterData = storedChars || [];

  // トークン調整ボタン
  const tokenAdjustBtn = document.getElementById("token-adjust-button");
  if (tokenAdjustBtn) {
    tokenAdjustBtn.addEventListener("click", onOpenTokenAdjustModal);
  }
  const tokenAdjustOk = document.getElementById("token-adjust-ok-button");
  const tokenAdjustCancel = document.getElementById("token-adjust-cancel-button");
  if (tokenAdjustOk) tokenAdjustOk.addEventListener("click", onConfirmTokenAdjust);
  if (tokenAdjustCancel) tokenAdjustCancel.addEventListener("click", () => {
    const mod = document.getElementById("token-adjust-modal");
    if (mod) mod.classList.remove("active");
  });

  // ネタバレ関連
  const spoilerModal = document.getElementById("spoiler-modal");
  const spoilerButton = document.getElementById("spoiler-button");
  const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");
  if (spoilerButton) {
    spoilerButton.addEventListener("click", () => {
      spoilerModal.classList.add("active");
    });
  }
  if (closeSpoilerModalBtn) {
    closeSpoilerModalBtn.addEventListener("click", () => {
      spoilerModal.classList.remove("active");
    });
  }

  // 「カードを取得する」ボタン
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    getCardButton.addEventListener("click", async () => {
      const sceneSummary = await getLastSceneSummary();
      let onlyTitle = "";
      let onlyType = "";
      let addPrompt = "";

      const lines = sceneSummary.split("\n");
      lines.forEach(line => {
        const t = line.trim();
        if (t.startsWith("【名前】")) {
          onlyTitle = t.replace("【名前】", "").replace("：", "").trim();
        } else if (t.startsWith("【タイプ】")) {
          onlyType = t.replace("【タイプ】", "").replace("：", "").trim();
        } else if (t.startsWith("【外見】")) {
          addPrompt = t.replace("【外見】", "").replace("：", "").trim();
        }
      });

      const previewModal = document.getElementById("card-preview-modal");
      const previewContainer = document.getElementById("preview-card-container");
      if (!previewModal || !previewContainer) return;

      previewContainer.innerHTML = "";
      const p = document.createElement("p");
      p.textContent =
        `【名前】：${onlyTitle}\n【タイプ】：${onlyType}\n【外見】：${addPrompt}\nこの内容で作成しますか？`;
      p.style.whiteSpace = "pre-wrap";
      previewContainer.appendChild(p);

      previewModal.classList.add("active");

      const addBtn = document.getElementById("add-to-gachabox-button");
      if (addBtn) {
        addBtn.onclick = async () => {
          previewModal.classList.remove("active");
          const gachaModal = document.getElementById("gacha-modal");
          if (gachaModal) gachaModal.classList.add("active");

          try {
            await runGacha(1, addPrompt, onlyTitle, onlyType);
            alert("ガチャ箱に追加しました。");
          } catch (e) {
            console.error(e);
            alert("カード生成失敗:" + e.message);
          } finally {
            if (gachaModal) gachaModal.classList.remove("active");
          }
        };
      }
      const cancelBtn = document.getElementById("cancel-card-preview-button");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          previewModal.classList.remove("active");
        };
      }
    });
  }

  // 回答候補生成
  const generateActionCandidatesBtn = document.getElementById("generate-action-candidates-button");
  if (generateActionCandidatesBtn) {
    generateActionCandidatesBtn.addEventListener("click", onGenerateActionCandidates);
  }

  // パーティモーダル
  const showPartyBtn = document.getElementById("show-party-button");
  if (showPartyBtn) {
    showPartyBtn.addEventListener("click", showPartyModal);
  }
  const closePartyModalBtn = document.getElementById("close-party-modal");
  if (closePartyModalBtn) {
    closePartyModalBtn.addEventListener("click", () => {
      const modal = document.getElementById("party-modal");
      if (modal) modal.classList.remove("active");
    });
  }

  // 全セクション閲覧
  const viewAllSectionsBtn = document.getElementById("view-all-sections-button");
  if (viewAllSectionsBtn) {
    viewAllSectionsBtn.addEventListener("click", showAllSectionsModal);
  }
  const closeAllSecBtn = document.getElementById("close-all-sections-modal");
  if (closeAllSecBtn) {
    closeAllSecBtn.addEventListener("click", () => {
      const allSecModal = document.getElementById("all-sections-modal");
      if (allSecModal) allSecModal.classList.remove("active");
    });
  }

  // エンディング関連ボタン
  const endingBtn = document.getElementById("ending-button");
  const clearEndingBtn = document.getElementById("clear-ending-button");
  if (endingBtn) {
    endingBtn.addEventListener("click", () => {
      showEndingModal("bad");
    });
  }
  if (clearEndingBtn) {
    clearEndingBtn.addEventListener("click", () => {
      showEndingModal("clear");
    });
  }

  // エンディングモーダルのボタン
  const endingModalClose = document.getElementById("ending-modal-close-button");
  if (endingModalClose) {
    endingModalClose.addEventListener("click", () => {
      const m = document.getElementById("ending-modal");
      if (m) m.classList.remove("active");
    });
  }
  const endingModalRegen = document.getElementById("ending-modal-regenerate-button");
  if (endingModalRegen) {
    endingModalRegen.addEventListener("click", onClickRegenerateEnding);
  }

});

/** 初期化用(シナリオ読み込み後に呼ばれる想定) */
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

    // シーン履歴
    const ents = await getSceneEntriesByScenarioId(scenarioId);
    window.sceneHistory = ents.map(e => ({
      entryId: e.entryId,
      type: e.type,
      sceneId: e.sceneId,
      content: e.content,
      content_en: e.content_en || "",
      dataUrl: e.dataUrl,
      prompt: e.prompt || ""
    }));

    // sceneSummaries
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

    // セクション全クリアチェック
    refreshEndingButtons();
  } catch (err) {
    console.error("シナリオ読み込み失敗:", err);
    alert("読み込み失敗:" + err.message);
  }
}

/** 「エンディング」ボタンを出すか、「クリアエンディング」ボタンを出すか */
function refreshEndingButtons() {
  const endingBtn = document.getElementById("ending-button");
  const clearEndingBtn = document.getElementById("clear-ending-button");

  if (!endingBtn || !clearEndingBtn) return;

  const allCleared = areAllSectionsCleared();

  if (allCleared) {
    // 全クリアなら「クリアエンディング」ボタンを表示
    endingBtn.style.display = "none";
    clearEndingBtn.style.display = "inline-block";
  } else {
    // そうでなければ「エンディング」ボタンを表示
    endingBtn.style.display = "inline-block";
    clearEndingBtn.style.display = "none";
  }
}

function areAllSectionsCleared() {
  if (!window.sections || !window.sections.length) return false;
  return window.sections.every(s => s.cleared);
}

/** エンディングモーダルを表示 */
async function showEndingModal(type) {
  // "clear" or "bad"

  const scenarioId = window.currentScenario?.scenarioId;
  if (!scenarioId) {
    alert("シナリオ未選択");
    return;
  }
  const existing = await getEnding(scenarioId, type);
  if (existing) {
    // IndexedDBに既存があればそれを表示
    openEndingModal(type, existing.story);
  } else {
    // 生成して保存
    const newStory = await generateEndingStory(type);
    if (!newStory) {
      return; // 生成失敗時は何もしない
    }
    await saveEnding(scenarioId, type, newStory);
    openEndingModal(type, newStory);
  }
}

/** エンディングモーダルを再生成 */
async function onClickRegenerateEnding() {
  // タイトル部から type を判定する
  const titleEl = document.getElementById("ending-modal-title");
  const scenarioId = window.currentScenario?.scenarioId;
  if (!titleEl || !scenarioId) return;

  let type = "bad";
  if (titleEl.textContent.includes("クリア")) {
    type = "clear";
  }
  // 一旦削除
  await deleteEnding(scenarioId, type);

  // 再生成
  const newStory = await generateEndingStory(type);
  if (!newStory) return;
  await saveEnding(scenarioId, type, newStory);

  // 再表示
  const storyEl = document.getElementById("ending-modal-story");
  if (storyEl) {
    storyEl.textContent = newStory;
  }
}

/** モーダルを開く */
function openEndingModal(type, story) {
  const modal = document.getElementById("ending-modal");
  const titleEl = document.getElementById("ending-modal-title");
  const storyEl = document.getElementById("ending-modal-story");

  if (type === "clear") {
    titleEl.textContent = "クリアエンディング";
  } else {
    titleEl.textContent = "エンディング";
  }
  storyEl.innerHTML = DOMPurify.sanitize(story, DOMPURIFY_CONFIG) || "";
  modal.classList.add("active");
}

/** エンディングストーリーをChatGPTで生成 */
async function generateEndingStory(type) {
  if (!window.apiKey) {
    alert("APIキーが未設定です");
    return "";
  }

  const scenario = window.currentScenario;
  if (!scenario) {
    alert("シナリオデータがありません");
    return "";
  }
  const wd = scenario.wizardData || {};
  const isClear = (type === "clear");
  // シナリオ概要
  const scenarioSummary = wd.scenarioSummary || "(シナリオ概要なし)";
  // パーティ構成
  const party = wd.party || [];

  // シーン履歴の文章をまとめる(なるべく簡潔にしすぎないよう指示)
  // ここでは最後10シーン程度を拾ったり、要約を2～3行で抑えないよう指示
  let sceneTexts = window.sceneHistory
    .filter(e => e.type === "scene")
    .map(e => e.content || "");
  if (sceneTexts.length > 10) {
    sceneTexts = sceneTexts.slice(-10);
  }
  const combinedScene = sceneTexts.join("\n------\n");

  // セクション情報
  const sectionTextArr = (wd.sections || []).map(s => {
    const cond = decompressCondition(s.conditionZipped);
    return `・セクション${s.number}(${s.cleared ? "クリア" : "未クリア"}): ${cond}`;
  });
  const joinedSections = sectionTextArr.join("\n");

  // "ハッピーエンド" or "バッドエンド" 指示
  const endTypePrompt = isClear ? "ハッピーエンド" : "バッドエンド";

  const prompt = `
以下の情報をもとに、
1)シナリオ概要
2)パーティ構成
3)あらすじ
4)セクション
5)その後の話

この5部構成でエンディングストーリーを作ってください。結末は必ず「${endTypePrompt}」にしてください。
あらすじ部分は、下記のシーン履歴をベースにしつつ、あまり簡潔になりすぎないように描写してください。

■シナリオ概要
${scenarioSummary}

■パーティ構成
${party.map(p => `- ${p.name}(${p.type || "?"})`).join("\n")}

■シーン履歴(最新～最大10シーン)
${combinedScene}

■セクション情報
${joinedSections}
`;

  try {
    showLoadingModal(true);
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
        messages: [
          { role: "system", content: "あなたは優秀なTRPGエンディング生成アシスタントです。日本語で回答してください。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
      signal
    });
    if (window.cancelRequested) {
      return "";
    }
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    return (data.choices[0].message.content || "").trim();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("エンディング生成キャンセル");
      return "";
    }
    console.error("エンディング生成失敗:", err);
    alert("エンディング生成に失敗:\n" + err.message);
    return "";
  } finally {
    showLoadingModal(false);
  }
}

/** セクション文字列の解凍 */
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

/** トークン調整ボタン押下 → モーダルを開く */
function onOpenTokenAdjustModal() {
  let missingCount = 0;
  missingCount = window.sceneHistory.filter(e => !e.content_en).length;
  const msg = `${missingCount}件のシーン/行動に内部英語データがありません。生成しますか？`;
  document.getElementById("token-adjust-message").textContent = msg;
  document.getElementById("token-adjust-progress").textContent = "";
  const mod = document.getElementById("token-adjust-modal");
  mod.classList.add("active");
}

/** トークン調整のOK→不足している英語をまとめて生成 */
async function onConfirmTokenAdjust() {
  const mod = document.getElementById("token-adjust-modal");
  const prog = document.getElementById("token-adjust-progress");
  let targets = window.sceneHistory.filter(e => !e.content_en && (e.type === "scene" || e.type === "action"));

  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  if (targets.length === 0) {
    alert("不足はありません。");
    mod.classList.remove("active");
    return;
  }

  let doneCount = 0;
  const total = targets.length;

  for (const entry of targets) {
    doneCount++;
    prog.textContent = `${doneCount}/${total}件処理中...`;
    // 英訳生成
    const tr = await generateEnglishTranslation(entry.content);
    entry.content_en = tr;

    // DB更新
    const updated = {
      ...entry,
      content_en: tr
    };
    await updateSceneEntry(updated);
  }
  prog.textContent = `${total}/${total}件完了`;
  alert("英語データ生成が完了しました。");

  // モーダルを閉じる
  mod.classList.remove("active");
}

/** 英語翻訳用: content -> content_en */
async function generateEnglishTranslation(japaneseText) {
  if (!japaneseText.trim()) return "";
  const sys = "あなたは優秀な翻訳家です。";
  const u = `以下の日本語テキストを自然な英語に翻訳してください:\n${japaneseText}\n`;
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

/** 回答候補 */
async function onGenerateActionCandidates() {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  const lastSceneText = lastSceneEntry ? lastSceneEntry.content : "(シーン無し)";

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const prompt = `
      あなたはTRPGのGMです。
      下記シーンを踏まえ、プレイヤーが可能な行動案を5つ提案してください。
      ---
      ${lastSceneText}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGアシスタント" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
      signal
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const content = data.choices[0].message.content || "";
    const lines = content.split("\n").map(l => l.trim()).filter(l => l);

    const container = document.getElementById("action-candidates-container");
    if (!container) return;
    container.innerHTML = "";

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");
      btn.style.display = "block";
      btn.style.margin = "5px 0";
      btn.addEventListener("click", () => {
        const playerInput = document.getElementById("player-input");
        if (playerInput) {
          playerInput.value = btn.textContent;
        }
      });
      container.appendChild(btn);
    });
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("候補生成キャンセル");
    } else {
      console.error(e);
      alert("候補生成失敗:" + e.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/** 全セクション表示モーダル */
function showAllSectionsModal() {
  const modal = document.getElementById("all-sections-modal");
  if (!modal) return;

  const wd = (window.currentScenario && window.currentScenario.wizardData) || {};
  const sections = wd.sections || [];

  const container = document.getElementById("all-sections-content");
  container.textContent = "";

  if (!sections.length) {
    container.textContent = "セクション情報がありません。";
  } else {
    let text = "";
    for (const sec of sections) {
      text += `【セクション${sec.number}】` + (sec.cleared ? "(クリア済み)" : "(未クリア)") + "\n";
      text += "条件: " + (decompressCondition(sec.conditionZipped)) + "\n\n";
    }
    container.textContent = text;
  }

  modal.classList.add("active");
}

/** ZIP解凍 */
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

/** パーティ確認モーダル */
function showPartyModal() {
  const modal = document.getElementById("party-modal");
  if (!modal) return;
  modal.classList.add("active");
  renderPartyCardsInModal();
}

function renderPartyCardsInModal() {
  const container = document.getElementById("party-modal-card-container");
  if (!container) return;
  container.innerHTML = "";

  const partyCards = window.characterData.filter(c => c.group === "Party");
  if (!partyCards.length) {
    container.textContent = "パーティにカードがありません。";
    return;
  }
  partyCards.forEach(card => {
    const cardEl = createPartyCardElement(card);
    container.appendChild(cardEl);
  });
}

function createPartyCardElement(c) {
  const cardEl = document.createElement("div");
  cardEl.className = "card ";
  cardEl.className += "rarity" + (c.rarity || "").replace("★", "").trim();

  cardEl.setAttribute("data-id", c.id);
  cardEl.addEventListener("click", () => {
    cardEl.classList.toggle("flipped");
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cf = document.createElement("div");
  cf.className = "card-front";

  const bg = (c.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bg) {
    cf.style.backgroundImage = bg;
  }

  const rv = (typeof c.rarity === "string") ? c.rarity.replace("★", "").trim() : "0";
  const bezel = document.createElement("div");
  bezel.className = "bezel rarity" + rv;
  cf.appendChild(bezel);

  let roleLabel = "";
  if (c.role === "avatar") roleLabel = "(アバター)";
  else if (c.role === "partner") roleLabel = "(パートナー)";

  const tEl = document.createElement("div");
  tEl.className = "card-type";
  tEl.textContent = (c.type || "不明") + roleLabel;
  cf.appendChild(tEl);

  const imgCont = document.createElement("div");
  imgCont.className = "card-image";
  if (c.imageData) {
    const im = document.createElement("img");
    im.src = c.imageData;
    im.alt = c.name;
    imgCont.appendChild(im);
  }
  cf.appendChild(imgCont);

  const info = document.createElement("div");
  info.className = "card-info";

  const nm = document.createElement("p");
  nm.innerHTML = "<h3>" + DOMPurify.sanitize(c.name) + "</h3>";
  info.appendChild(nm);

  if (c.state) {
    const st = document.createElement("p");
    st.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(c.state);
    info.appendChild(st);
  }
  const sp = document.createElement("p");
  sp.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(c.special);
  info.appendChild(sp);

  const cap = document.createElement("p");
  cap.innerHTML = "<span>" + DOMPurify.sanitize(c.caption) + "</span>";
  info.appendChild(cap);

  cf.appendChild(info);

  const cb = document.createElement("div");
  cb.className = "card-back";
  cb.innerHTML = `<strong>${DOMPurify.sanitize(c.type)}</strong>`;

  cardInner.appendChild(cf);
  cardInner.appendChild(cb);
  cardEl.appendChild(cardInner);
  return cardEl;
}

async function getLastSceneSummary() {
  // 一例として、最新のシーン文を要約
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  if (!lastSceneEntry) return "シーンがありません。";

  const text = lastSceneEntry.content;
  const systemPrompt = `
あなたは優秀なカード作成用プロンプト生成者。
以下フォーマットで【名前】【タイプ】【外見】を作ってください。`;
  const userPrompt = `
シーン文:
${text}
ここからエレメントにできそうな対象1つを抽出し、【名前】【タイプ】【外見】を生成してください。
`;

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    return data.choices[0].message.content || "";
  } catch (e) {
    console.error("要約失敗:", e);
    return "(要約失敗)";
  }
}

/** ローディング表示 */
function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  if (show) {
    m.classList.add("active");
  } else {
    m.classList.remove("active");
  }
}
function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

// --------------------------------------------------
// 以下、本来は scene.js 等にある次のシーン生成などの関数がある想定。
// ただし本ファイルでまとめる、あるいは scene.js を活用してもOK。
// --------------------------------------------------
window.loadScenarioData = loadScenarioData; // 外部から呼べるように
window.onCancelFetch = onCancelFetch;
