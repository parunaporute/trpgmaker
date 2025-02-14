/********************************
 * scene.js (統合版/改修版)
 *  - シーンとアクションを1:1対応に変更
 *  - 画像は type='image' で別レコードとして管理
 ********************************/

// --------------------------------------------------
// ▼ グローバル変数
// --------------------------------------------------
window.apiKey = '';
/** シーン一覧。sceneオブジェクト = {
 *   sceneId: string,
 *   scenarioId: number,
 *   content: string,        // シーン本文(日本語)
 *   content_en: string,     // シーン本文(英語)
 *   action: {               // 1シーン1アクション
 *     content: string,
 *     content_en: string
 *   },
 *   images: [               // 画像一覧
 *     {
 *       entryId: number,
 *       dataUrl: string,
 *       prompt: string
 *     }, ...
 *   ]
 * }
 */
window.scenes = [];

window.currentScenarioId = null;
window.currentScenario = null;
window.currentRequestController = null;
window.cancelRequested = false;

window.scenarioType = null;
window.clearCondition = null;
window.sections = [];

// 要約をメモリ上でも管理
window.sceneSummaries = []; // sceneSummaries[chunkIndex] = { en: '...', ja: '...' }

// DOMPurify 用設定
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "hr", "h3", "h4", "h5", "span", "div", "strong", "em"],
  ALLOWED_ATTR: ["style"]
};

// --------------------------------------------------
// ▼ ページロード時の初期設定
// --------------------------------------------------
window.addEventListener("load", async () => {
  // IndexedDB初期化 & キャラクターデータ読み込み
  await initIndexedDB();
  const storedChars = await loadCharacterDataFromIndexedDB();
  window.characterData = storedChars || [];

  // トークン調整ボタン関連
  const tokenAdjustBtn = document.getElementById("token-adjust-button");
  if (tokenAdjustBtn) {
    tokenAdjustBtn.addEventListener("click", onOpenTokenAdjustModal);
  }
  const tokenAdjustOk = document.getElementById("token-adjust-ok-button");
  const tokenAdjustCancel = document.getElementById("token-adjust-cancel-button");
  if (tokenAdjustOk) tokenAdjustOk.addEventListener("click", onConfirmTokenAdjust);
  if (tokenAdjustCancel) {
    tokenAdjustCancel.addEventListener("click", () => {
      const mod = document.getElementById("token-adjust-modal");
      if (mod) mod.classList.remove("active");
    });
  }

  // ネタバレボタン（objectiveシナリオ用）
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

  // 「カードを取得する」ボタン (explorationシナリオ用)
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    getCardButton.addEventListener("click", async () => {
      const sceneSummary = await getLastSceneSummary();
      let onlyTitle = "";
      let onlyType = "";
      let addPrompt = "";

      // シーン要約から【名前】【タイプ】【外見】を抽出
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

      // プレビュー用モーダルを表示
      const previewModal = document.getElementById("card-preview-modal");
      const previewContainer = document.getElementById("preview-card-container");
      if (!previewModal || !previewContainer) return;

      previewContainer.innerHTML = "";
      const p = document.createElement("p");
      p.textContent =
        `【名前】：${onlyTitle}\n【タイプ】：${onlyType}\n【外見】：${addPrompt}\n\nこの内容で作成しますか？`;
      p.style.whiteSpace = "pre-wrap";
      previewContainer.appendChild(p);

      previewModal.classList.add("active");

      // 「ガチャ箱に追加」ボタン
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

      // 「キャンセル」ボタン
      const cancelBtn = document.getElementById("cancel-card-preview-button");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          previewModal.classList.remove("active");
        };
      }
    });
  }

  // 回答候補生成ボタン
  const generateActionCandidatesBtn = document.getElementById("generate-action-candidates-button");
  if (generateActionCandidatesBtn) {
    generateActionCandidatesBtn.addEventListener("click", onGenerateActionCandidates);
  }

  // パーティ確認用モーダル
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

  // アプリケーションバーへの「履歴」ボタン追加
  const applicationBar = document.querySelector(".application-bar");
  const changeBgButton = document.getElementById("change-bg-button");
  if (applicationBar) {
    // 履歴ボタン
    const historyBtn = document.createElement("button");
    historyBtn.id = "toggle-history-button";
    historyBtn.innerHTML = '<div class="iconmoon icon-newspaper"></div>履歴';
    applicationBar.insertBefore(historyBtn, changeBgButton);
    historyBtn.addEventListener("click", toggleHistory);

    // パーティボタン
    const partyButton = document.createElement("button");
    partyButton.id = "show-party-button";
    partyButton.innerHTML = '<div class="iconmoon icon-strategy"></div>PT';
    applicationBar.insertBefore(partyButton, changeBgButton);
    partyButton.addEventListener("click", showPartyModal);
  }
});

// --------------------------------------------------
// ▼ シナリオ読み込み
// --------------------------------------------------
async function loadScenarioData(scenarioId) {
  try {
    const sc = await getScenarioById(scenarioId);
    if (!sc) {
      alert("指定シナリオが存在しません。");
      return;
    }
    window.currentScenario = sc;
    window.currentScenarioId = scenarioId;

    const wd = sc.wizardData || {};
    window.scenarioType = wd.scenarioType;
    window.clearCondition = wd.clearCondition || "";
    window.sections = wd.sections || [];

    // シーン一覧をDBから取得し、メモリに整形
    await loadAllScenesForScenario(scenarioId);

    // 要約を読み込む
    for (let i = 0; i < 100; i++) {
      const sumRec = await getSceneSummaryByChunkIndex(i);
      if (!sumRec) break;
      window.sceneSummaries[i] = {
        en: sumRec.content_en,
        ja: sumRec.content_ja
      };
    }

    // ネタバレボタン or カード取得ボタンの表示制御
    if (window.scenarioType === "objective") {
      const sb = document.getElementById("spoiler-button");
      if (sb) sb.style.display = "inline-block";
      const sp = document.getElementById("clear-condition-text");
      if (sp) sp.textContent = window.clearCondition || "(クリア条件なし)";
    } else if (window.scenarioType === "exploration") {
      const gcb = document.getElementById("get-card-button");
      if (gcb) gcb.style.display = "inline-block";
    }

    // 「履歴表示フラグ」を復元
    if (typeof sc.showHistory === 'undefined') {
      sc.showHistory = false;
    }
    const histDiv = document.getElementById("scene-history");
    if (histDiv) {
      histDiv.style.display = sc.showHistory ? "block" : "none";
    }

    // セクション全クリアチェック
    refreshEndingButtons();

    // 画面更新
    updateSceneHistory();
    showLastScene();
  } catch (err) {
    console.error("シナリオ読み込み失敗:", err);
    alert("読み込み失敗:" + err.message);
  }
}

/**
 * DB の sceneEntries から、type='scene' / type='image' をまとめて取得し、
 * window.scenes を作り直す。
 */
async function loadAllScenesForScenario(scenarioId) {
  window.scenes = [];
  const allEntries = await getSceneEntriesByScenarioId(scenarioId);

  // シーンエントリ(type='scene') だけ先に取り出し
  const sceneRecords = allEntries.filter(e => e.type === "scene");
  // 画像(type='image') をマップ化
  const imageRecords = allEntries.filter(e => e.type === "image");

  // sceneRecords を entryId 昇順でソート
  sceneRecords.sort((a, b) => (a.entryId - b.entryId));
  // imageRecords も entryId 昇順で
  imageRecords.sort((a, b) => (a.entryId - b.entryId));

  // シーン毎に images を紐づける
  for (const sRec of sceneRecords) {
    const scObj = {
      sceneId: sRec.sceneId,
      scenarioId: sRec.scenarioId,
      content: sRec.content || "",
      content_en: sRec.content_en || "",
      action: {
        content: sRec.actionContent || "",
        content_en: sRec.actionContent_en || ""
      },
      images: []
    };
    // 同じ sceneId の image レコードを紐づけ
    const imgs = imageRecords.filter(imgRec => imgRec.sceneId === sRec.sceneId);
    const mappedImgs = imgs.map(img => ({
      entryId: img.entryId,
      dataUrl: img.dataUrl,
      prompt: img.prompt || ""
    }));
    scObj.images = mappedImgs;
    window.scenes.push(scObj);
  }
}

// --------------------------------------------------
// ▼ シーン生成＆次のシーン取得
// --------------------------------------------------
/**
 * プレイヤー入力をもとに次のシーンを生成する
 * 導入シーン後(2回目以降)は action が必ず入力される想定
 */
async function getNextScene() {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }

  // 現在のシーン数
  const hasIntro = window.scenes.length > 0; 
  // 最初のシーン(導入)が無ければ、actionは空文字でOK
  let pinput = "";
  if (hasIntro) {
    // 2回目以降
    pinput = (document.getElementById("player-input")?.value || "").trim();
    if (!pinput) {
      alert("プレイヤー行動を入力してください");
      return;
    }
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    // 1) まずプレイヤー行動を英訳（必要なら）
    let actionEn = "";
    if (pinput) {
      actionEn = await generateEnglishTranslation(pinput);
    }

    // 2) システム & ユーザープロンプト組み立て
    const wd = (window.currentScenario && window.currentScenario.wizardData) || {};
    const sections = wd.sections || [];
    let systemText =
      `あなたは経験豊かなやさしいTRPGのゲームマスターです。
以下を守ってください。
・背景黒が前提の装飾のタグを使う
・<<<< 絶対に出力は日本語で。Please answer in Japanese!!!! >>>>
・決して一つ前のレスポンスと同じ言い回しで終わらない
・メタな表現をしない(ゲームマスター視点の内容を書かない)
・シナリオ内の設定と整合性が取れるように
・同じことを言ってループしない
・ユーザーが困っている場合はヒントを与える
・時々パーティを会話させる
・次の行動を促すようなシーンを作り、行動の多様性を妨げない
`;

    // セクション情報を付与
    if (sections.length > 0) {
      systemText += "\n======\n";
      for (const sec of sections) {
        systemText += `【セクション${sec.number}】` + (sec.cleared ? "(クリア済み)" : "(未クリア)") + "\n";
        systemText += "条件: " + decompressCondition(sec.conditionZipped) + "\n\n";
      }
      systemText += "======\n";
    }

    // ベースの messages
    const msgs = [{ role: "system", content: systemText }];

    // シナリオ概要 + パーティ情報
    if (window.currentScenario) {
      const scenarioWd = window.currentScenario.wizardData || {};
      const summ = scenarioWd.scenarioSummaryEn?.trim()
        ? scenarioWd.scenarioSummaryEn
        : (scenarioWd.scenarioSummary || "");

      msgs.push({ role: "user", content: "シナリオ概要:" + summ });

      // パーティ情報
      if (scenarioWd.party && scenarioWd.party.length > 0) {
        const ptxt = buildPartyInsertionText(scenarioWd.party);
        msgs.push({ role: "user", content: ptxt });
      }
    }

    // 3) 過去のシーン＆アクションを ChatGPT へ渡す (要約済みの部分はまとめて)
    const actionCount = window.scenes.filter(s => s.action && s.action.content.trim() !== "").length;
    // (A) 先に要約を push
    const chunkEnd = Math.floor((actionCount - 15) / 10);
    for (let i = 0; i <= chunkEnd; i++) {
      if (i < 0) continue;
      if (window.sceneSummaries[i]) {
        const sumObj = window.sceneSummaries[i];
        msgs.push({
          role: "assistant",
          content: sumObj.en || sumObj.ja || "(no summary)"
        });
      }
    }
    // (B) 要約に含まれない分だけ raw を push
    const skipCount = (chunkEnd + 1) * 10;
    let aCnt = 0;
    // シーン順に
    for (const scn of window.scenes) {
      // アクション
      if (scn.action && scn.action.content.trim() !== "") {
        aCnt++;
        if (aCnt <= skipCount) {
          continue;
        }
        const actText = scn.action.content_en?.trim() ? scn.action.content_en : scn.action.content;
        msgs.push({ role: "user", content: "player action:" + actText });
      }
      // シーン本文
      if (aCnt <= skipCount) {
        continue;
      }
      const scText = scn.content_en?.trim() ? scn.content_en : scn.content;
      msgs.push({ role: "assistant", content: scText });
    }

    // 今回の行動(未挿入なら追加)
    if (pinput) {
      msgs.push({ role: "user", content: "プレイヤーの行動:" + pinput });
    }

    // 4) ChatGPT呼び出し
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
    let chatModel = "gpt-4";
    // 例えばモデルを切り替えたい場合はここを調整
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: chatModel,
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
    if (data.error) throw new Error(data.error.message);

    // 5) ChatGPTの返答が英語か日本語かを判定 → 日本語へ統一
    const rawScene = data.choices[0].message.content || "";
    let finalSceneJa = rawScene;
    let finalSceneEn = "";
    if (!containsJapanese(rawScene)) {
      // 英語っぽい
      finalSceneJa = await generateJapaneseTranslation(rawScene);
      finalSceneEn = rawScene;
    } else {
      // 日本語 → 英語バージョン
      finalSceneEn = await generateEnglishTranslation(rawScene);
    }

    // 6) 新しいシーンをDBに保存: (actionContent, sceneContent)
    // sceneIdを生成
    const sid = "scene_" + Date.now();
    const sRec = {
      scenarioId: window.currentScenarioId || 0,
      type: "scene",
      sceneId: sid,
      content: finalSceneJa,
      content_en: finalSceneEn,
      // アクションは pinput
      actionContent: pinput,
      actionContent_en: actionEn,
      prompt: "", // 画像生成用のpromptをあとで付与
      dataUrl: "" // 今回は使わない
    };
    const newId = await addSceneEntry(sRec);

    // メモリにも追加
    const newSceneObj = {
      sceneId: sid,
      scenarioId: sRec.scenarioId,
      content: finalSceneJa,
      content_en: finalSceneEn,
      action: {
        content: pinput,
        content_en: actionEn
      },
      images: []
    };

    window.scenes.push(newSceneObj);

    // 7) シーンから挿絵用プロンプトを生成してDB更新
    const imagePromptText = await generateImagePromptFromScene(finalSceneJa);
    if (imagePromptText) {
      sRec.prompt = imagePromptText;
      await updateSceneEntry(sRec); // prompt更新
    }

    // 8) シナリオ更新
    if (window.currentScenario) {
      await updateScenario({
        ...window.currentScenario,
        updatedAt: new Date().toISOString()
      });
    }

    // 9) セクション達成チェック
    await checkSectionClearViaChatGPT(pinput, finalSceneJa);

    // 10) 要約処理 (10アクション単位)
    await handleSceneSummaries();

    // 11) 画面再描画
    document.getElementById("player-input").value = "";
    updateSceneHistory();
    showLastScene();

    // 12) 回答候補コンテナクリア＆自動生成
    const candidatesContainer = document.getElementById("action-candidates-container");
    if (candidatesContainer) {
      candidatesContainer.innerHTML = "";
    }
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

// --------------------------------------------------
// ▼ 履歴のトグル表示
// --------------------------------------------------
async function toggleHistory() {
  if (!window.currentScenario) return;
  const hist = document.getElementById("scene-history");
  if (!hist) return;

  window.currentScenario.showHistory = !window.currentScenario.showHistory;
  hist.style.display = window.currentScenario.showHistory ? 'block' : 'none';

  await updateScenario(window.currentScenario);
}

// --------------------------------------------------
// ▼ エンディングボタンの表示切替
// --------------------------------------------------
function refreshEndingButtons() {
  const endingBtn = document.getElementById("ending-button");
  const clearEndingBtn = document.getElementById("clear-ending-button");
  if (!endingBtn || !clearEndingBtn) return;

  const allCleared = areAllSectionsCleared();
  if (allCleared) {
    endingBtn.style.display = "none";
    clearEndingBtn.style.display = "inline-block";
  } else {
    endingBtn.style.display = "inline-block";
    clearEndingBtn.style.display = "none";
  }
}
function areAllSectionsCleared() {
  if (!window.sections || !window.sections.length) return false;
  return window.sections.every(s => s.cleared);
}

// --------------------------------------------------
// ▼ エンディングモーダル関連
// --------------------------------------------------
async function showEndingModal(type) {
  const scenarioId = window.currentScenario?.scenarioId;
  if (!scenarioId) {
    alert("シナリオ未選択");
    return;
  }
  const existing = await getEnding(scenarioId, type);
  if (existing) {
    openEndingModal(type, existing.story);
  } else {
    const newStory = await generateEndingStory(type);
    if (!newStory) return;
    await saveEnding(scenarioId, type, newStory);
    openEndingModal(type, newStory);
  }
}

async function onClickRegenerateEnding() {
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

  const storyEl = document.getElementById("ending-modal-story");
  if (storyEl) {
    storyEl.textContent = newStory;
  }
}

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
  const scenarioSummary = wd.scenarioSummary || "(シナリオ概要なし)";
  const party = wd.party || [];

  // 最新10シーンを取得
  let lastScenes = [...window.scenes];
  if (lastScenes.length > 10) {
    lastScenes = lastScenes.slice(-10);
  }
  const combinedSceneText = lastScenes.map(s => s.content).join("\n------\n");

  // セクション情報
  const sectionTextArr = (wd.sections || []).map(s => {
    const cond = decompressCondition(s.conditionZipped);
    return `・セクション${s.number}(${s.cleared ? "クリア" : "未クリア"}): ${cond}`;
  });
  const joinedSections = sectionTextArr.join("\n");
  const endTypePrompt = isClear ? "ハッピーエンド" : "バッドエンド";

  let prompt = `
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
`;

  if (party.length !== 0) {
    prompt += `\n■パーティ構成\n`;
    prompt += party.map(p => `- ${p.name}(${p.type || "?"})`).join("\n");
  }

  prompt += `
■シーン履歴(最大10シーン)
${combinedSceneText}

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

// --------------------------------------------------
// ▼ 英訳・日訳
// --------------------------------------------------
/** 日本語(ja)が含まれているかどうか判定する補助関数 */
function containsJapanese(text) {
  return /[ぁ-んァ-ン一-龯]/.test(text);
}

/** 日本語->英語翻訳 */
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

/** 英語->日本語翻訳 */
async function generateJapaneseTranslation(englishText) {
  if (!englishText.trim()) return "";
  const sys = "あなたは優秀な翻訳家です。";
  const u = `以下の英文を自然な日本語に翻訳:\n${englishText}`;
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
    return englishText; // 失敗時は英語のまま
  }
}

// --------------------------------------------------
// ▼ セクション達成チェック
// --------------------------------------------------
async function checkSectionClearViaChatGPT(latestAction, latestScene) {
  const wd = window.currentScenario?.wizardData;
  if (!wd || !wd.sections) return;
  const sorted = wd.sections.slice().sort((a, b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);
  if (!firstUncleared) return;

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
      showToast(`セクション${firstUncleared.number}をクリアしました。`);
    } else {
      console.log("未達成と判定されました。");
    }
  } catch (err) {
    console.error("セクション判定API失敗:", err);
  }
}

// --------------------------------------------------
// ▼ パーティ情報文章化
// --------------------------------------------------
function buildPartyInsertionText(party) {
  let txt = "【パーティ編成情報】\n";

  // アバター
  const ava = party.find(e => e.role === "avatar");
  if (ava) {
    txt += "◆プレイヤー(アバター)\n";
    txt += buildCardDescription(ava);
    txt += "\n";
  }
  // パートナー
  const pt = party.filter(e => e.role === "partner");
  if (pt.length > 0) {
    txt += "◆パートナー\n";
    pt.forEach(p => {
      txt += buildCardDescription(p);
      txt += "\n";
    });
  }
  // その他
  const others = party.filter(e => !e.role || e.role === "none");
  if (others.length > 0) {
    const cset = others.filter(x => x.type === "キャラクター");
    const mset = others.filter(x => x.type === "モンスター");
    const iset = others.filter(x => x.type === "アイテム");

    if (cset.length > 0) {
      txt += "◆キャラクター\n";
      cset.forEach(c => {
        txt += buildCardDescription(c);
        txt += "\n";
      });
    }
    if (mset.length > 0) {
      txt += "◆モンスター\n";
      mset.forEach(m => {
        txt += buildCardDescription(m);
        txt += "\n";
      });
    }
    if (iset.length > 0) {
      txt += "◆アイテム\n";
      iset.forEach(i => {
        txt += buildCardDescription(i);
        txt += "\n";
      });
    }
  }

  txt +=
    "以上を踏まえて、プレイヤー、パートナーは味方NPC、アイテムは登場するアイテム、" +
    "キャラクターは中立NPC、モンスターは敵対NPCとして扱ってください。" +
    "シナリオ概要を優先するため、世界観が合わない場合は調整してもよいです。";
  return txt;
}

function buildCardDescription(card) {
  let result = "";
  result += ` - 【名前】${card.name}\n`;
  result += `   【レア度】${card.rarity || "★0"}\n`;
  if (card.type === "キャラクター" || card.type === "モンスター") {
    result += `   【状態】${card.state || "なし"}\n`;
  }
  result += `   【特技】${card.special || "なし"}\n`;
  result += `   【キャプション】${card.caption || "なし"}\n`;
  result += `   【外見】${card.imageprompt || "なし"}\n`;
  return result;
}

// --------------------------------------------------
// ▼ トークン調整ボタン関連
// --------------------------------------------------
function onOpenTokenAdjustModal() {
  let missingCount = 0;
  // 英語データ未生成のシーンのみカウント
  missingCount = window.scenes.filter(sc => !sc.content_en).length;
  const msg = `${missingCount}件のシーン/アクションに内部英語データがありません。生成しますか？`;
  document.getElementById("token-adjust-message").textContent = msg;
  document.getElementById("token-adjust-progress").textContent = "";
  const mod = document.getElementById("token-adjust-modal");
  mod.classList.add("active");
}

async function onConfirmTokenAdjust() {
  const mod = document.getElementById("token-adjust-modal");
  const prog = document.getElementById("token-adjust-progress");
  // ターゲット: content_enが無い or 空のシーン
  let targets = window.scenes.filter(sc => !sc.content_en || !sc.content_en.trim());

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
  for (const sceneObj of targets) {
    doneCount++;
    prog.textContent = `${doneCount}/${total}件処理中...`;
    const tr = await generateEnglishTranslation(sceneObj.content);
    sceneObj.content_en = tr;

    // DB更新
    const record = {
      scenarioId: sceneObj.scenarioId,
      sceneId: sceneObj.sceneId,
      type: "scene",
      content: sceneObj.content,
      content_en: sceneObj.content_en,
      actionContent: sceneObj.action.content,
      actionContent_en: sceneObj.action.content_en,
      prompt: "", // もともと保持している場合は要取得
      dataUrl: ""
    };

    // 既存のsceneEntriesレコードを検索
    // (フロー的には loadAllScenesForScenario() で作ったものなので、entryIdを覚えていない。
    //  そのため sceneId で再取得して更新する。)
    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
    if (sceneRec) {
      record.prompt = sceneRec.prompt;
      record.dataUrl = sceneRec.dataUrl;
      record.entryId = sceneRec.entryId; // update時に必要
    }
    await updateSceneEntry(record);
  }

  prog.textContent = `${total}/${total}件完了`;
  alert("英語データ生成が完了しました。");
  mod.classList.remove("active");
}

// --------------------------------------------------
// ▼ シーンやアクションのテキストを編集
// --------------------------------------------------
async function onSceneOrActionContentEdited(sceneObj, newText, isActionEdit) {
  if (!window.apiKey) return;
  const oldText = isActionEdit ? sceneObj.action.content : sceneObj.content;
  if (newText.trim() === oldText.trim()) {
    return;
  }
  showLoadingModal(true);
  try {
    const en = await generateEnglishTranslation(newText);

    if (isActionEdit) {
      sceneObj.action.content = newText;
      sceneObj.action.content_en = en;
    } else {
      sceneObj.content = newText;
      sceneObj.content_en = en;
    }

    // DB更新
    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
    if (sceneRec) {
      sceneRec.content = sceneObj.content;
      sceneRec.content_en = sceneObj.content_en;
      sceneRec.actionContent = sceneObj.action.content;
      sceneRec.actionContent_en = sceneObj.action.content_en;
      await updateSceneEntry(sceneRec);
    }
  } catch (err) {
    console.error("再翻訳失敗:", err);
  } finally {
    showLoadingModal(false);
  }
}

// --------------------------------------------------
// ▼ シーン履歴表示
// --------------------------------------------------
function updateSceneHistory() {
  const his = document.getElementById("scene-history");
  if (!his) return;
  his.innerHTML = "";

  // セクション表示
  const wd = window.currentScenario?.wizardData;
  let sections = [];
  if (wd && wd.sections) {
    sections = wd.sections;
  }
  let sorted = [...sections].sort((a, b) => a.number - b.number);
  const firstUncleared = sorted.find(s => !s.cleared);
  if (!firstUncleared && sorted.length > 0) {
    const tile = document.createElement("div");
    tile.className = "history-tile summary title";
    tile.textContent = "シナリオ達成!";
    his.appendChild(tile);
  }

  for (const s of sorted) {
    const t = document.createElement("div");
    if (s.number < (firstUncleared?.number || Infinity)) {
      t.className = "history-tile summary";
      t.textContent = `${decompressCondition(s.conditionZipped)}(クリア済み)`;
      refreshEndingButtons();
    } else if (s.number === firstUncleared?.number) {
      t.className = "history-tile summary";
      t.textContent = `セクション${s.number} (未クリア)`;
    }
    his.appendChild(t);
  }
  let tile = document.createElement("div");
  tile.className = "history-tile summary separator";
  his.appendChild(tile);

  // シナリオ概要
  const scenarioSummaryEl = document.createElement("div");
  scenarioSummaryEl.id = "scenario-summary";
  scenarioSummaryEl.innerHTML = wd?.scenarioSummary || "";
  his.appendChild(scenarioSummaryEl);

  // 導入シーン含む 全シーンを描画
  // (最新シーンは showLastScene() で別途表示するため、ここでは"最新シーン"以外を表示する)
  const lastScene = [...window.scenes].slice(-1)[0] || null;
  const skipId = lastScene ? lastScene.sceneId : null;

  const toShow = window.scenes.filter(sc => sc.sceneId !== skipId);
  for (const scn of toShow) {
    // 1つの「歴史タイル」(div)
    const tile = document.createElement("div");
    tile.className = "history-tile";

    // アクション
    if (scn.action?.content) {
      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(scn.action.content);
      at.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(scn, at.innerHTML.trim(), true);
      });
      tile.appendChild(at);
    }

    // シーン本文
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(scn.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(scn, st.innerHTML.trim(), false);
    });
    tile.appendChild(st);

    // 画像
    const scImages = scn.images || [];
    scImages.forEach(imgRec => {
      const img = document.createElement("img");
      img.src = imgRec.dataUrl;
      img.alt = "生成画像";
      img.style.maxHeight = "350px";
      img.style.width = "100%";
      img.style.objectFit = "contain";
      tile.appendChild(img);
    });

    // ▼ Wandボタン + ドロップダウン
    const c = document.createElement("div");
    c.className = "r-flexbox";
    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-magic-wand"></div>';
    c.appendChild(wandBtn);

    const dropdown = document.createElement("div");
    dropdown.className = "scene-dropdown-menu";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
     <button class="dropdown-item scene-delete">
       <div class="iconmoon icon-bin"></div>シーンを削除
     </button>
     <button class="dropdown-item scene-illustration">
       <div class="iconmoon icon-picture"></div>挿絵を生成
     </button>
   `;
    c.appendChild(dropdown);

    wandBtn.addEventListener("click", () => {
      dropdown.style.display =
        (dropdown.style.display === "none") ? "block" : "none";
    });

    // シーン削除
    const delBtn = dropdown.querySelector(".scene-delete");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(scn);
      });
    }
    // 挿絵生成
    const illustBtn = dropdown.querySelector(".scene-illustration");
    if (illustBtn) {
      illustBtn.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await generateImageForScene(scn);
      });
    }

    tile.appendChild(c);

    his.appendChild(tile);
  }

  his.scrollTop = his.scrollHeight;
}

// --------------------------------------------------
// ▼ 最新シーンを表示
// --------------------------------------------------
function showLastScene() {
  const storyDiv = document.getElementById("story");
  const lastSceneImagesDiv = document.getElementById("last-scene-images");
  const lastSceneAdded = document.getElementById("last-scene-added");
  
  if (!storyDiv || !lastSceneImagesDiv) return;

  const nextSceneBtn = document.getElementById("next-scene");
  const playerInput = document.getElementById("player-input");
  const playerActionLabel = document.getElementById("player-action");

  const lastScene = [...window.scenes].slice(-1)[0] || null;

  if (lastScene) {
    storyDiv.innerHTML = "";
    lastSceneAdded.innerHTML = "";
    // アクション（導入シーンの場合は空文字列）
    if (lastScene.action?.content) {
      const at = document.createElement("p");
      at.className = "action-text";
      at.setAttribute("contenteditable", window.apiKey ? "true" : "false");
      at.innerHTML = DOMPurify.sanitize(lastScene.action.content);
      at.addEventListener("blur", async () => {
        await onSceneOrActionContentEdited(lastScene, at.innerHTML.trim(), true);
      });
      storyDiv.appendChild(at);
    }

    // シーン本文
    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(lastScene, st.innerHTML.trim(), false);
    });
    storyDiv.appendChild(st);

    // ▼ Wandボタン + ドロップダウン
    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-magic-wand"></div>';
    lastSceneAdded.appendChild(wandBtn);

    const dropdown = document.createElement("div");
    dropdown.className = "scene-dropdown-menu";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <button class="dropdown-item last-scene-delete"><div class="iconmoon icon-bin"></div>シーンを削除</button>
      <button class="dropdown-item last-scene-illustration"><div class="iconmoon icon-picture"></div>挿絵を生成</button>
    `;
    lastSceneAdded.appendChild(dropdown);

    wandBtn.addEventListener("click", () => {
      dropdown.style.display =
        (dropdown.style.display === "none") ? "block" : "none";
    });

    // シーン削除
    const delItem = dropdown.querySelector(".last-scene-delete");
    if (delItem) {
      delItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(lastScene);
      });
    }
    // 挿絵を生成
    const illustItem = dropdown.querySelector(".last-scene-illustration");
    if (illustItem) {
      illustItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await generateImageForScene(lastScene);
      });
    }

    // 画像一覧
    lastSceneImagesDiv.innerHTML = "";
    for (const imgObj of lastScene.images) {
      const div = document.createElement("div");
      div.className = "image-container";

      const imgEl = document.createElement("img");
      imgEl.src = imgObj.dataUrl;
      imgEl.alt = "生成画像";
      imgEl.style.maxHeight = "50vh";
      imgEl.style.objectFit = "contain";
      div.appendChild(imgEl);

      lastSceneImagesDiv.appendChild(div);
    }

    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "inline-block";

      // 導入シーンがある場合、次シーンに向けたアクション入力欄を表示
      // ただし導入シーンがまだ1つもない時（=scenes.length===1になった直後）は
      //  そのシーンが導入シーンなので、次のアクションを入力してもらう
      if (lastScene.action?.content.trim() === "" && window.scenes.length === 1) {
        // 導入シーンのみ = 次のアクションを促す
        playerActionLabel.textContent = "プレイヤーはどんな行動をしますか？";
      } else {
        playerActionLabel.textContent = "プレイヤーはどんな行動をしますか？";
      }
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  } else {
    // シーンが無い場合 → 導入シーンを作る
    storyDiv.innerHTML = "";
    lastSceneImagesDiv.innerHTML = "";

    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "最初のシーン(導入)を作成します。";
    } else {
      nextSceneBtn.style.display = "none";
      playerInput.style.display = "none";
      playerActionLabel.textContent = "";
    }
  }
}

// --------------------------------------------------
// ▼ 挿絵生成
// --------------------------------------------------
async function generateImageForScene(sceneObj) {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  // DB上の prompt があれば使い、無ければシーン内容から生成
  let promptText = "";
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const sRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (!sRec) {
    alert("シーンレコードが見つかりません。");
    return;
  }
  promptText = sRec.prompt || "";
  if (!promptText.trim()) {
    // 改めて生成
    promptText = await generateImagePromptFromScene(sceneObj.content);
    sRec.prompt = promptText;
    await updateSceneEntry(sRec);
  }
  if (!promptText) {
    alert("生成に必要なプロンプトが得られませんでした。");
    return;
  }

  const finalPrompt =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    promptText;

  try {
    showLoadingModal(true);
    window.cancelRequested = false;
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      }),
      signal
    });
    const data = await resp.json();
    if (window.cancelRequested) {
      return;
    }
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // 新しい画像レコードをDBへ追加
    const newImgRec = {
      scenarioId: sceneObj.scenarioId,
      type: "image",
      sceneId: sceneObj.sceneId,
      content: "",      // 画像に対する説明等があれば入れるが現状は空
      content_en: "",   // 同上
      dataUrl,
      prompt: promptText
    };
    const newEntryId = await addSceneEntry(newImgRec);

    // メモリにも追加
    sceneObj.images.push({
      entryId: newEntryId,
      dataUrl,
      prompt: promptText
    });

    // 再描画
    updateSceneHistory();
    showLastScene();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("画像生成キャンセル");
    } else {
      console.error("画像生成失敗:", err);
      alert("画像生成に失敗:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

// --------------------------------------------------
// ▼ シーン削除
// --------------------------------------------------
async function deleteScene(sceneObj) {
  // DB上のシーンレコード削除 + 紐づく画像レコード削除
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const scRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (scRec) {
    await deleteSceneEntry(scRec.entryId);
  }
  // 画像レコードも削除
  const imgs = allEntries.filter(e => e.type === "image" && e.sceneId === sceneObj.sceneId);
  for (const iRec of imgs) {
    await deleteSceneEntry(iRec.entryId);
  }
  // メモリからも削除
  window.scenes = window.scenes.filter(s => s.sceneId !== sceneObj.sceneId);

  // 再描画
  updateSceneHistory();
  showLastScene();
}

// --------------------------------------------------
// ▼ 行動数に応じて要約を作成/削除
// --------------------------------------------------
async function handleSceneSummaries() {
  // アクション数(導入シーンは action.content="" なので数えない)
  const actionCount = window.scenes.filter(s => s.action && s.action.content.trim() !== "").length;

  // 新規要約作成チェック
  // 例: 15件以上になったら chunkIndex=0、25件以上で chunkIndex=1 … の要領
  if (actionCount >= 15) {
    const chunkIndex = Math.floor((actionCount - 15) / 10);
    if (chunkIndex >= 0) {
      if (!window.sceneSummaries[chunkIndex]) {
        // その範囲のシーンを抜き出し → rawテキストでまとめる
        const startAction = chunkIndex * 10 + 1; // 1-based
        const endAction = (chunkIndex + 1) * 10;

        let gathered = [];
        let aCounter = 0;
        for (const scn of window.scenes) {
          if (scn.action?.content.trim()) {
            aCounter++;
          }
          if (aCounter >= startAction && aCounter <= endAction) {
            // action + sceneをまとめる
            if (scn.action?.content.trim()) {
              gathered.push("A:" + scn.action.content);
            }
            gathered.push("S:" + scn.content);
          }
        }
        const textForSummary = gathered.join("\n");

        const enSummary = await generateSummaryWithLimit(textForSummary, 5, "en");
        const jaSummary = await generateSummaryWithLimit(textForSummary, 5, "ja");

        const sumRec = {
          chunkIndex,
          content_en: enSummary,
          content_ja: jaSummary
        };
        await addSceneSummaryRecord(sumRec);
        window.sceneSummaries[chunkIndex] = {
          en: enSummary,
          ja: jaSummary
        };
      }
    }
  }
  // 不要な要約削除（ここはお好みでカット/修正可）
  // 例: actionCount <= 15 なら chunkIndex=0 は不要、など
}

// 要約用
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

// --------------------------------------------------
// ▼ 回答候補を生成
// --------------------------------------------------
async function onGenerateActionCandidates() {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }
  const lastScene = [...window.scenes].slice(-1)[0];
  if (!lastScene) {
    alert("まだ導入シーンがありません。");
    return;
  }
  const lastSceneText = lastScene.content || "(シーン無し)";

  // 未クリアセクション
  const wd = window.currentScenario?.wizardData;
  let conditionText = "";
  if (wd && wd.sections && wd.sections.length > 0) {
    const sorted = wd.sections.slice().sort((a, b) => a.number - b.number);
    const firstUncleared = sorted.find(sec => !sec.cleared);
    if (firstUncleared) {
      conditionText = decompressCondition(firstUncleared.conditionZipped);
    }
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const prompt = `
      あなたはTRPGのGMです。
      下記シーンとセクションクリア条件を踏まえ、プレイヤーが可能な行動案を4つ提案してください。
      １：セクションのクリアに関係しそうなものを1つ
      ２：妥当なものを2つ
      ３：少し頭がおかしい行動案を1つ
      合計４行構成にしてください。
      順番はシャッフルしてください。
      言葉の表現でどれがクリアに関係しそうなのかわからないようにしてください。
      ---
      シーン：
      ${lastSceneText}
      ---
      クリア条件：
      ${conditionText}
    `;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": 'Bearer ' + window.apiKey
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

// --------------------------------------------------
// ▼ 全セクション表示モーダル
// --------------------------------------------------
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

// --------------------------------------------------
// ▼ パーティ確認モーダル
// --------------------------------------------------
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

  const scenario = window.currentScenario;
  if (!scenario?.wizardData?.party) {
    container.textContent = "パーティ情報がありません。";
    return;
  }

  const wizardPartyCards = scenario.wizardData.party;
  const dbCards = window.characterData || [];

  // IDが合えばDBの詳細をマージ
  const merged = wizardPartyCards.map(wCard => {
    const dbMatch = dbCards.find(dbC => dbC.id === wCard.id);
    if (!dbMatch) {
      return wCard;
    }
    return {
      ...dbMatch,
      ...wCard,
      imageData: dbMatch.imageData || wCard.imageData
    };
  });

  merged.forEach(card => {
    const cardEl = createPartyCardElement(card);
    container.appendChild(cardEl);
  });
}

function createPartyCardElement(c) {
  const cardEl = document.createElement("div");
  cardEl.className = "card ";
  // レア度文字列を数字のみにして結合
  const rarityNum = (c.rarity || "★0").replace("★", "").trim();
  cardEl.className += "rarity" + rarityNum;

  cardEl.setAttribute("data-id", c.id);
  cardEl.addEventListener("click", () => {
    cardEl.classList.toggle("flipped");
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cf = document.createElement("div");
  cf.className = "card-front";

  // 背景
  const bg = (c.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  if (bg) {
    cf.style.backgroundImage = bg;
  }

  const rv = rarityNum;
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

// --------------------------------------------------
// ▼ シーンテキストから挿絵用英語プロンプトを生成
// --------------------------------------------------
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

// --------------------------------------------------
// ▼ カスタム画像生成用モーダル
// --------------------------------------------------
function openImagePromptModal(scenePrompt = "", index = null) {
  window.editingImageEntry = null;
  if (index !== null) {
    // 旧コードで使用していた編集用、今は未使用かもしれませんが念のため
    console.log("openImagePromptModal with index:", index);
  } else {
    // 最後のシーンのpromptを初期表示したい など
    const lastScene = [...window.scenes].slice(-1)[0];
    if (lastScene) {
      // DB上のレコードから prompt を参照
      scenePrompt = (scenePrompt || "");
    }
  }
  const ip = document.getElementById("image-custom-prompt");
  if (ip) {
    ip.value = scenePrompt;
  }
  const modal = document.getElementById("image-prompt-modal");
  if (modal) {
    modal.classList.add("active");
  }
}

function closeImagePromptModal() {
  const modal = document.getElementById("image-prompt-modal");
  if (modal) {
    modal.classList.remove("active");
  }
  window.editingImageEntry = null;
}

async function onCustomImageGenerate() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  const userPromptText = (document.getElementById("image-custom-prompt")?.value || "").trim();
  if (!userPromptText) {
    alert("プロンプトが空です。");
    return;
  }

  const finalPrompt =
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
        prompt: finalPrompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    // 「最後のシーン」にカスタム画像を追加する例
    const lastScene = [...window.scenes].slice(-1)[0];
    if (!lastScene) {
      showLoadingModal(false);
      alert("シーンがありません。");
      return;
    }
    // DB 追加
    const imgRec = {
      scenarioId: lastScene.scenarioId,
      type: "image",
      sceneId: lastScene.sceneId,
      content: "",
      content_en: "",
      dataUrl,
      prompt: userPromptText
    };
    const newId = await addSceneEntry(imgRec);

    // メモリ上に追加
    lastScene.images.push({
      entryId: newId,
      dataUrl,
      prompt: userPromptText
    });

    updateSceneHistory();
    showLastScene();
  } catch (e) {
    console.error("カスタム画像生成失敗:", e);
    alert("カスタム画像生成失敗:\n" + e.message);
  } finally {
    showLoadingModal(false);
  }
}

// --------------------------------------------------
// ▼ 共通：圧縮テキスト解凍
// --------------------------------------------------
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

// --------------------------------------------------
// ▼ ローディングモーダル
// --------------------------------------------------
function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  if (show) {
    m.classList.add("active");
  } else {
    m.classList.remove("active");
  }
}

// キャンセル
function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

// --------------------------------------------------
// ▼ 最新シーンからカード作成用の【名前】【タイプ】【外見】を抽出
// --------------------------------------------------
async function getLastSceneSummary() {
  const lastScene = [...window.scenes].slice(-1)[0];
  if (!lastScene) return "シーンがありません。";

  const text = lastScene.content;
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
        "Authorization": 'Bearer ' + window.apiKey
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

// --------------------------------------------------
// ▼ 外部から利用できるように window.* に登録
// --------------------------------------------------
window.loadScenarioData = loadScenarioData;
window.onCancelFetch = onCancelFetch;
window.getNextScene = getNextScene;
window.generateImageForScene = generateImageForScene;
window.openImagePromptModal = openImagePromptModal;
window.closeImagePromptModal = closeImagePromptModal;
window.onCustomImageGenerate = onCustomImageGenerate;
