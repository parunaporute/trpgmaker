/********************************
 * scene.js (統合版/改修版)
 *  - シーンとアクションを1:1対応に変更
 *  - 画像は type='image' で別レコードとして管理
 *  - アイテム/登場人物を管理する "entities" ストアを利用
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

  // ▼ 情報ボタン追加
  if (applicationBar) {
    const infoButton = document.createElement("button");
    infoButton.id = "info-button";
    infoButton.innerHTML = '情報';
    applicationBar.insertBefore(infoButton, changeBgButton);
    infoButton.addEventListener("click", () => {
      openEntitiesModal();
    });
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
async function getNextScene() {
  /*
  // デバッグ用のDB確認関数
  async function debugAllRecordsFromStore(storeName) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const allData = await store.getAll(); // 全件取得
    console.log(`--- ${storeName} の全データ ---`);
    console.log(allData);
    await tx.done;
  }*/
  /* console.log("3秒待ってください...");
    setTimeout(() => {
      debugAllRecordsFromStore('sceneEntries');
    }, 3000); // 3,000ミリ秒（秒）
   */

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

    // 3) 過去のシーンを ChatGPT へ渡す
    const actionCount = window.scenes.length;
    // console.log("actionCount", actionCount);

    // (A) 先に要約を push
    const chunkEnd = Math.floor((actionCount - 15) / 10);
    for (let i = 0; i <= chunkEnd; i++) {
      // ("要約はあるようだ");
      if (i < 0) continue;
      if (window.sceneSummaries[i]) {
        const sumObj = window.sceneSummaries[i];
        msgs.push({
          role: "assistant",
          content: sumObj.en || sumObj.ja || "(no summary)"
        });
      }
    }
    // console.log("要約組み立て終了");
    // console.log("window.scenesの状態", window.scenes);

    // (B) 要約に含まれない分だけ raw を push
    const skipCount = (chunkEnd + 1) * 10;
    let aCnt = 0;
    for (const scn of window.scenes) {
      if (scn.action && scn.action.content.trim() !== "") {
        aCnt++;
        if (aCnt <= skipCount) continue;
        const actText = scn.action.content_en?.trim() ? scn.action.content_en : scn.action.content;
        msgs.push({ role: "user", content: "player action:" + actText });
      }
      if (aCnt <= skipCount) continue;
      const scText = scn.content_en?.trim() ? scn.content_en : scn.content;
      msgs.push({ role: "assistant", content: scText });
    }

    // 今回の行動(未挿入なら追加)
    if (pinput) {
      msgs.push({ role: "user", content: "プレイヤーの行動:" + pinput });
    }
    // console.log("メッセージ組み立て終了");
    // console.log("window.scenesの状態", window.scenes);

    // 4) ChatGPT呼び出し
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
    let chatModel = "gpt-4";
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
    // console.log("レスポンス取得");
    // console.log("window.scenesの状態", window.scenes);

    // 5) ChatGPTの返答が英語か日本語かを判定 → 日本語へ統一
    const rawScene = data.choices[0].message.content || "";
    let finalSceneJa = rawScene;
    let finalSceneEn = "";
    if (!containsJapanese(rawScene)) {
      finalSceneJa = await generateJapaneseTranslation(rawScene);
      finalSceneEn = rawScene;
    } else {
      finalSceneEn = await generateEnglishTranslation(rawScene);
    }

    // console.log("翻訳");
    // 6) 新しいシーンをDBに保存
    const sid = "scene_" + Date.now();
    const sRec = {
      scenarioId: window.currentScenarioId || 0,
      type: "scene",
      sceneId: sid,
      content: finalSceneJa,
      content_en: finalSceneEn,
      actionContent: pinput,
      actionContent_en: actionEn,
      prompt: "",
      dataUrl: ""
    };
    // console.log("DBへの格納データ", window.scenes);
    const newId = await addSceneEntry(sRec);
    sRec.entryId = newId;

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

    // console.log("メモリ用オブジェクト", newSceneObj);
    // console.log("window.scenesの状態前", window.scenes);
    window.scenes.push(newSceneObj);
    // console.log("-----");
    // console.log("window.scenesの状態後", window.scenes);
    // console.log("-----");

    // debugAllRecordsFromStore('sceneEntries');

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
    // console.log("window.scenesの状態後1", window.scenes);
    // 9) セクション達成チェック
    await checkSectionClearViaChatGPT(pinput, finalSceneJa);
    // console.log("window.scenesの状態後2", window.scenes);

    // 10) 要約処理 (10アクション単位)
    await handleSceneSummaries();
    // console.log("window.scenesの状態後3", window.scenes);

    // 11) 画面再描画
    document.getElementById("player-input").value = "";
    updateSceneHistory();
    showLastScene();
    // console.log("表示修正");
    // console.log("window.scenesの状態後4", window.scenes);

    // 12) 回答候補コンテナクリア＆自動生成
    const candidatesContainer = document.getElementById("action-candidates-container");
    if (candidatesContainer) {
      candidatesContainer.innerHTML = "";
    }
    // console.log("window.scenesの状態後5", window.scenes);

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

  // 最新10シーン
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
function containsJapanese(text) {
  return /[ぁ-んァ-ン一-龯]/.test(text);
}

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
    return englishText;
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
      prompt: "",
      dataUrl: ""
    };
    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const sceneRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
    if (sceneRec) {
      record.prompt = sceneRec.prompt;
      record.dataUrl = sceneRec.dataUrl;
      record.entryId = sceneRec.entryId;
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

  // 全シーンを描画 (最新は showLastScene で別描画)
  const lastScene = [...window.scenes].slice(-1)[0] || null;
  const skipId = lastScene ? lastScene.sceneId : null;

  const toShow = window.scenes.filter(sc => sc.sceneId !== skipId);
  for (const scn of toShow) {
    const tile = document.createElement("div");
    tile.className = "history-tile";

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

    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(scn.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(scn, st.innerHTML.trim(), false);
    });
    tile.appendChild(st);

    // ====== ここで画像サムネを表示 ======
    // scn.images配列をループし、画像を配置
    const scImages = scn.images || [];
    scImages.forEach((imgRec, index) => {
      // 画像タグを作成
      const img = document.createElement("img");
      img.src = imgRec.dataUrl;
      img.alt = "生成画像";
      // サムネのスタイル (例)
      img.style.maxHeight = "350px";
      img.style.width = "100%";
      img.style.objectFit = "contain";

      // **ここでクリック時にモーダルを開くイベントを追加**
      img.addEventListener("click", () => {
        // scn: このシーンオブジェクト
        // index: 画像の配列内インデックス
        openImageViewer(scn, index);
      });

      tile.appendChild(img);
    });

    // ▼ Wandボタン + ドロップダウン
    const c = document.createElement("div");
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

    c.className = "r-flexbox";
    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-magic-wand"></div>';
    c.appendChild(wandBtn);


    wandBtn.addEventListener("click", () => {
      dropdown.style.display =
        (dropdown.style.display === "none") ? "block" : "none";
    });

    const delBtn = dropdown.querySelector(".scene-delete");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(scn);
      });
    }
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

    const st = document.createElement("p");
    st.className = "scene-text";
    st.setAttribute("contenteditable", window.apiKey ? "true" : "false");
    st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
    st.addEventListener("blur", async () => {
      await onSceneOrActionContentEdited(lastScene, st.innerHTML.trim(), false);
    });
    storyDiv.appendChild(st);

    // ▼ Wandボタン + ドロップダウン
    const dropdown = document.createElement("div");
    dropdown.className = "scene-dropdown-menu";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <button class="dropdown-item last-scene-delete">
        <div class="iconmoon icon-bin"></div>シーンを削除
      </button>
      <button class="dropdown-item last-scene-illustration">
        <div class="iconmoon icon-picture"></div>挿絵を生成
      </button>
    `;
    lastSceneAdded.appendChild(dropdown);
    const wandBtn = document.createElement("button");
    wandBtn.className = "scene-menu-button";
    wandBtn.innerHTML = '<div class="iconmoon icon-magic-wand"></div>';
    lastSceneAdded.appendChild(wandBtn);


    wandBtn.addEventListener("click", () => {
      dropdown.style.display =
        (dropdown.style.display === "none") ? "block" : "none";
    });

    const delItem = dropdown.querySelector(".last-scene-delete");
    if (delItem) {
      delItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await deleteScene(lastScene);
      });
    }
    const illustItem = dropdown.querySelector(".last-scene-illustration");
    if (illustItem) {
      illustItem.addEventListener("click", async () => {
        dropdown.style.display = "none";
        await generateImageForScene(lastScene);
      });
    }

    // 画像一覧
    lastSceneImagesDiv.innerHTML = "";
    lastScene.images.forEach((imgObj, index) => {
      const div = document.createElement("div");
      div.className = "image-container";

      const imgEl = document.createElement("img");
      imgEl.src = imgObj.dataUrl;
      imgEl.alt = "生成画像";
      imgEl.style.maxHeight = "50vh";
      imgEl.style.objectFit = "contain";
      // **ここでクリックイベント**
      imgEl.addEventListener("click", () => {
        openImageViewer(lastScene, index);
      });

      div.appendChild(imgEl);
      lastSceneImagesDiv.appendChild(div);
    });
    if (window.apiKey) {
      nextSceneBtn.style.display = "inline-block";
      playerInput.style.display = "inline-block";

      if (lastScene.action?.content.trim() === "" && window.scenes.length === 1) {
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
  let promptText = "";
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const sRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (!sRec) {
    alert("シーンレコードが見つかりません。");
    return;
  }
  promptText = sRec.prompt || "";
  if (!promptText.trim()) {
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

    const newImgRec = {
      scenarioId: sceneObj.scenarioId,
      type: "image",
      sceneId: sceneObj.sceneId,
      content: "",
      content_en: "",
      dataUrl,
      prompt: promptText
    };
    const newEntryId = await addSceneEntry(newImgRec);

    sceneObj.images.push({
      entryId: newEntryId,
      dataUrl,
      prompt: promptText
    });

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
  const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
  const scRec = allEntries.find(e => e.type === "scene" && e.sceneId === sceneObj.sceneId);
  if (scRec) {
    await deleteSceneEntry(scRec.entryId);
  }
  const imgs = allEntries.filter(e => e.type === "image" && e.sceneId === sceneObj.sceneId);
  for (const iRec of imgs) {
    await deleteSceneEntry(iRec.entryId);
  }
  window.scenes = window.scenes.filter(s => s.sceneId !== sceneObj.sceneId);

  updateSceneHistory();
  showLastScene();
}

// --------------------------------------------------
// ▼ 要約作成/削除
// --------------------------------------------------
async function handleSceneSummaries() {
  const actionCount = window.scenes.filter(s => s.action && s.action.content.trim() !== "").length;

  if (actionCount >= 15) {
    const chunkIndex = Math.floor((actionCount - 15) / 10);
    if (chunkIndex >= 0) {
      if (!window.sceneSummaries[chunkIndex]) {
        const startAction = chunkIndex * 10 + 1;
        const endAction = (chunkIndex + 1) * 10;

        let gathered = [];
        let aCounter = 0;
        for (const scn of window.scenes) {
          if (scn.action?.content.trim()) {
            aCounter++;
          }
          if (aCounter >= startAction && aCounter <= endAction) {
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
}

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
    console.log("openImagePromptModal with index:", index);
  } else {
    const lastScene = [...window.scenes].slice(-1)[0];
    if (lastScene) {
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

    const lastScene = [...window.scenes].slice(-1)[0];
    if (!lastScene) {
      showLoadingModal(false);
      alert("シーンがありません。");
      return;
    }
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
// ▼ シナリオから取得ボタン
// --------------------------------------------------
async function onUpdateEntitiesFromAllScenes() {

  if (!window.apiKey) {
    alert("APIキーが未設定です。");
    return;
  }

  // すでにDB登録済みのエンティティ(アイテム/キャラ)情報を取得
  const existingEntities = await getEntitiesByScenarioId(window.currentScenarioId);

  // アクション数を数え、古い部分は要約を使う
  const actionCount = window.scenes.length;
  // 「直近15アクションは生のテキスト」より前の部分は 10 アクション単位で要約
  let chunkEnd = Math.floor((actionCount - 15) / 10);
  // アクション数が 15 未満で chunkEnd が負になる場合は 0 に補正
  if (chunkEnd < 0) {
    chunkEnd = 0;
  }

  let scenarioText = "";

  // 1) 古い部分(要約)
  for (let i = 0; i < chunkEnd; i++) {
    const sumObj = window.sceneSummaries[i];
    if (sumObj && (sumObj.en || sumObj.ja)) {
      scenarioText += sumObj.en || sumObj.ja;
      scenarioText += "\n";
    }
  }

  // 2) スキップ数
  const skipCount = chunkEnd * 10;

  // 3) 直近は生テキスト(英語優先)
  let aCnt = 0;
  for (const scn of window.scenes) {
    if (scn.action?.content.trim()) {
      aCnt++;
    }
    if (aCnt <= skipCount && aCnt != 0) continue;

    if (scn.action?.content.trim()) {
      const actionText = scn.action.content_en?.trim()
        ? scn.action.content_en
        : scn.action.content;
      scenarioText += `\n(プレイヤー行動)${actionText}\n`;
    }

    const sceneText = scn.content_en?.trim()
      ? scn.content_en
      : scn.content;
    scenarioText += `(シーン)${sceneText}\n`;
  }

  // 既存エンティティのテキスト
  const existingTextArr = existingEntities.map(ent => {
    return `${ent.name}: ${ent.description}`;
  });
  const existingDesc = existingTextArr.join("\n") || "（なし）";

  // ChatGPTへ指定する「システムメッセージ」は日本語でOK
  // （最終的な回答を日本語で求めるため。ただし英語にしても構いません）
  const systemContent = "あなたはTRPGアシスタントAIです。日本語で回答してください。";
  const userContent = `
以下はTRPGのシナリオ中に登場したテキストです。
すでに抽出済みのアイテム/キャラクター(人物)は下記のとおりです：
${existingDesc}

新たに見つかったアイテムや登場人物があれば、JSON配列で出力してください。
固有名詞も日本語にしてください。日本語にできないものはカタカナにしてください。
例：
[{"category":"item","name":"木の杖","description":"～"}, {"category":"character","name":"太郎","description":"～"}]

地域や場所を含めないでください。
すでにあるものに似ている場合は出力しないでください。重複しそうなものは省いてください。
シナリオ全体本文:
====================
${scenarioText}
====================
  `;

  try {
    showLoadingModal(true);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent }
        ],
        temperature: 0.5
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    // ChatGPTの応答をパースしてJSON配列として取得
    const rawAnswer = data.choices[0].message.content;
    let newEntities = [];
    try {
      newEntities = JSON.parse(rawAnswer);
      if (!Array.isArray(newEntities)) {
        console.warn("JSONが配列ではありません:", newEntities);
        alert("AI応答が配列ではありません。");
        newEntities = [];
      }
    } catch (e) {
      console.warn("JSONパース失敗。応答テキスト:", rawAnswer);
      alert("AI応答がJSON形式でないためパース失敗。");
      newEntities = [];
    }

    renderNewEntitiesCandidateList(newEntities);
  } catch (err) {
    console.error("onUpdateEntitiesFromAllScenes失敗:", err);
    alert("抽出に失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

function renderNewEntitiesCandidateList(newEntities) {
  const candidateListDiv = document.getElementById("entity-candidate-list");
  if (!candidateListDiv) return;

  const generateBtn = document.getElementById("entity-generate-button");
  if (generateBtn) {
    generateBtn.style.display = "none";
  }

  candidateListDiv.innerHTML = "";

  if (!newEntities || newEntities.length === 0) {
    candidateListDiv.textContent = "新たに見つかりそうなアイテム/登場人物はありません。";
    return;
  }

  newEntities.forEach((ent, idx) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.margin = "5px 0";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.style.marginRight = "8px";
    row.appendChild(cb);

    const label = document.createElement("label");
    label.textContent = `${ent.name}: ${ent.description}`;
    row.appendChild(label);

    candidateListDiv.appendChild(row);
    row.dataset.index = idx;
  });

  if (generateBtn) {
    candidateListDiv.appendChild(generateBtn);
    generateBtn.style.display = "block";

    generateBtn.onclick = async () => {
      const rows = candidateListDiv.querySelectorAll("div");
      const toSave = [];
      rows.forEach(r => {
        const cb = r.querySelector("input[type='checkbox']");
        if (cb && cb.checked) {
          const i = Number(r.dataset.index);
          toSave.push(newEntities[i]);
        }
      });
      if (toSave.length === 0) {
        alert("選択されたものがありません。");
        return;
      }

      await saveNewEntities(toSave);
      renderEntitiesList();
      candidateListDiv.innerHTML = "生成が完了しました。";
      generateBtn.style.display = "none";
    };
  }
}

async function saveNewEntities(entities) {
  for (const e of entities) {
    const rec = {
      scenarioId: window.currentScenarioId,
      category: e.category === "character" ? "character" : "item",
      name: e.name || "名称不明",
      description: e.description || "",
      imageData: ""
    };
    await addEntity(rec);
  }
}

// --------------------------------------------------
// ▼ 情報モーダル
// --------------------------------------------------
async function openEntitiesModal() {
  const infoModal = document.getElementById("info-modal");
  if (!infoModal) return;
  await renderEntitiesList();

  const candidateListDiv = document.getElementById("entity-candidate-list");
  if (candidateListDiv) candidateListDiv.innerHTML = "";

  infoModal.classList.add("active");
}

async function renderEntitiesList() {
  const listDiv = document.getElementById("entity-list-container");
  if (!listDiv) return;
  listDiv.innerHTML = "";

  const scenarioId = window.currentScenarioId;
  if (!scenarioId) {
    listDiv.textContent = "シナリオが未選択です。";
    return;
  }

  const allEnts = await getEntitiesByScenarioId(scenarioId);
  const items = allEnts.filter(e => e.category === "item");
  const chars = allEnts.filter(e => e.category === "character");

  if (items.length > 0) {
    const itemTitle = document.createElement("h3");
    itemTitle.textContent = "アイテム";
    listDiv.appendChild(itemTitle);

    items.forEach((ent, index) => {
      const odd = (index % 2 === 1);
      const row = createEntityRow(ent, odd);
      listDiv.appendChild(row);
    });
  }

  if (chars.length > 0) {
    const charTitle = document.createElement("h3");
    charTitle.textContent = "キャラクター";
    listDiv.appendChild(charTitle);

    chars.forEach((ent, index) => {
      const odd = (index % 2 === 1);
      const row = createEntityRow(ent, odd);
      listDiv.appendChild(row);
    });
  }

  if (items.length === 0 && chars.length === 0) {
    listDiv.textContent = "アイテムや登場人物はありません。";
  }
}

function createEntityRow(entity, isOdd) {
  const row = document.createElement("div");
  row.className = "info-row";
  row.style.marginBottom = "20px";

  const topWrapper = document.createElement("div");
  topWrapper.style.justifyContent = "space-between";
  topWrapper.style.alignItems = "center";
  topWrapper.style.overflow = "hidden";

  if (entity.imageData) {
    const thumb = document.createElement("img");
    thumb.src = entity.imageData;
    thumb.alt = entity.name;
    thumb.style.height = "150px";
    thumb.style.objectFit = "contain";
    if (isOdd) {
      thumb.style.float = "left";
      thumb.style.paddingRight = "20px";
    } else {
      thumb.style.float = "right";
      thumb.style.paddingLeft = "20px";
    }
    thumb.style.borderRadius = "50%";
    thumb.style.shapeOutside = "circle(50%)";
    topWrapper.appendChild(thumb);
  }

  const infoSpan = document.createElement("span");
  infoSpan.innerHTML = `<h4>${entity.name}</h4> ${entity.description}`;
  topWrapper.appendChild(infoSpan);

  row.appendChild(topWrapper);

  // 下段： Wandボタン + ドロップダウン
  const bottomWrapper = document.createElement("div");
  bottomWrapper.className = "l-flexbox";

  const wandBtn = document.createElement("button");
  wandBtn.className = "scene-menu-button";
  wandBtn.innerHTML = '<div class="iconmoon icon-magic-wand"></div>';
  bottomWrapper.appendChild(wandBtn);

  const dropdown = document.createElement("div");
  dropdown.className = "scene-dropdown-menu";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
     <button class="dropdown-item entity-generate">
       <div class="iconmoon icon-picture"></div>画像生成
     </button>
     <button class="dropdown-item entity-delete">
       <div class="iconmoon icon-bin"></div>削除
     </button>
  `;
  bottomWrapper.appendChild(dropdown);

  wandBtn.addEventListener("click", () => {
    dropdown.style.display =
      (dropdown.style.display === "none") ? "block" : "none";
  });

  const genBtn = dropdown.querySelector(".entity-generate");
  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      dropdown.style.display = "none";
      await generateEntityImage(entity);
    });
  }

  const delBtn = dropdown.querySelector(".entity-delete");
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      dropdown.style.display = "none";
      if (!confirm(`「${entity.name}」を削除しますか？`)) return;
      await deleteEntity(entity.entityId);
      renderEntitiesList();
    });
  }

  topWrapper.appendChild(bottomWrapper);
  return row;
}

// --------------------------------------------------
// ▼ エンティティ単体の画像生成
// --------------------------------------------------
async function generateEntityImage(entity) {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  const prompt = `
${entity.category === "item" ? "Item" : "Character"}: ${entity.name}
Description: ${entity.description}
No text in the image, Anime style, best quality
`.trim();

  const finalPrompt =
    "As a high-performance chatbot, you create the highest quality illustrations discreetly." +
    "Please do not include text in illustrations for any reason." +
    "If you can do that, I'll give you a super high tip." +
    "Now generate the next anime wide image.\n↓↓↓↓\n" +
    prompt;

  try {
    showLoadingModal(true);
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
        size: "1024x1024",
        response_format: "b64_json"
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const base64 = data.data[0].b64_json;
    const dataUrl = "data:image/png;base64," + base64;

    entity.imageData = dataUrl;
    await updateEntity(entity);

    renderEntitiesList();
  } catch (err) {
    console.error("generateEntityImage失敗:", err);
    alert("画像生成失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

// --------------------------------------------------
// ▼ キャンセル
// --------------------------------------------------
function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

// --------------------------------------------------
// ▼ シーンからカード作成用要約(おまけ)
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

// ▼ 画像ビューア状態管理用
// 画像ビューア用の状態管理
window.imageViewerState = {
  sceneObj: null,
  currentIndex: 0,
  images: [],
  isOpen: false,

  // ドラッグ/タップ判定用
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  isDragging: false,
  hasMoved: false,
  tapThreshold: 10 // 移動距離がこのpx以内なら「タップ」とみなす
};

function openImageViewer(sceneObj, startIndex) {
  window.imageViewerState.sceneObj = sceneObj;
  window.imageViewerState.currentIndex = startIndex;
  window.imageViewerState.images = sceneObj.images || [];
  window.imageViewerState.isOpen = true;

  const viewerModal = document.getElementById("image-viewer-modal");
  const imgEl = document.getElementById("viewer-image-element");

  // ポートレートかランドスケープかで、幅/高さを調整
  const orientationPortrait = (window.innerHeight >= window.innerWidth);
  if (orientationPortrait) {
    imgEl.style.width = "100%";
    imgEl.style.height = "auto";
  } else {
    imgEl.style.width = "auto";
    imgEl.style.height = "100%";
  }

  // 最初の画像を表示
  showImageInViewer();

  // ボタン類は初期的に非表示
  const controls = document.getElementById("viewer-controls");
  if (controls) controls.classList.add("hidden");

  // モーダルをアクティブに
  viewerModal.classList.add("active");

  // pointer系イベントをバインド（ドラッグ＆クリック判定）
  addViewerTouchEvents(imgEl);

  // 削除/ダウンロード/閉じるボタン
  const delBtn = document.getElementById("viewer-delete-button");
  if (delBtn) delBtn.onclick = onClickViewerDelete;
  const dlBtn = document.getElementById("viewer-download-button");
  if (dlBtn) dlBtn.onclick = onClickViewerDownload;
  const closeBtn = document.getElementById("viewer-close-button");
  if (closeBtn) closeBtn.onclick = closeImageViewer;
}

// 実際の画像を差し替えて表示
function showImageInViewer() {
  const { images, currentIndex } = window.imageViewerState;
  const viewerImg = document.getElementById("viewer-image-element");
  if (!viewerImg) return;
  if (!images[currentIndex]) return;

  viewerImg.src = images[currentIndex].dataUrl;
  viewerImg.style.transform = "translateX(0px)";
}

// スワイプ/ドラッグなどをまとめて管理
function addViewerTouchEvents(imgEl) {
  imgEl.onpointerdown = (e) => {
    e.preventDefault();
    window.imageViewerState.isDragging = true;
    window.imageViewerState.hasMoved = false;

    // 開始位置を記録
    window.imageViewerState.startX = e.clientX;
    window.imageViewerState.startY = e.clientY;
    window.imageViewerState.currentX = e.clientX;
    window.imageViewerState.currentY = e.clientY;

    // ドラッグ中も pointermove を捕まえられるように
    imgEl.setPointerCapture(e.pointerId);
  };

  imgEl.onpointermove = (e) => {
    if (!window.imageViewerState.isDragging) return;
    e.preventDefault();

    const dx = e.clientX - window.imageViewerState.startX;
    const dy = e.clientY - window.imageViewerState.startY;

    window.imageViewerState.currentX = e.clientX;
    window.imageViewerState.currentY = e.clientY;

    // 一定距離以上動いたら「hasMoved = true」
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > window.imageViewerState.tapThreshold) {
      window.imageViewerState.hasMoved = true;
    }

    // スワイプのときは X 方向に動かす
    const imgEl = document.getElementById("viewer-image-element");
    if (imgEl) {
      imgEl.style.transform = `translateX(${dx}px)`;
    }
  };

  imgEl.onpointerup = (e) => {
    if (!window.imageViewerState.isDragging) return;
    e.preventDefault();

    // pointerIdのキャプチャ解除
    imgEl.releasePointerCapture(e.pointerId);

    finishSwipeOrTap();
  };

  // pointercancel (OSやスクロール介入等で中断された場合)
  imgEl.onpointercancel = (e) => {
    if (!window.imageViewerState.isDragging) return;
    imgEl.releasePointerCapture(e.pointerId);
    finishSwipeOrTap(true); // キャンセル扱い
  };
}

// ドラッグ終了時に「タップ or スワイプ」判定
function finishSwipeOrTap(isCancel = false) {
  window.imageViewerState.isDragging = false;

  if (isCancel) {
    resetImagePosition();
    return;
  }

  // 「hasMoved === false」なら、小さい移動で終わった → タップ扱い
  if (!window.imageViewerState.hasMoved) {
    toggleViewerControls();
    return;
  }

  // ここからスワイプ処理
  const { startX, currentX } = window.imageViewerState;
  const dx = currentX - startX;
  const threshold = window.innerWidth * 0.3;

  if (Math.abs(dx) < threshold) {
    // バウンドバック
    resetImagePosition();
  } else {
    if (dx < 0) {
      // 左へ -> 次の画像
      goNextImage();
    } else {
      // 右へ -> 前の画像
      goPrevImage();
    }
  }
}

// バウンドバック
function resetImagePosition() {
  const imgEl = document.getElementById("viewer-image-element");
  if (!imgEl) return;
  imgEl.style.transition = "transform 0.2s";
  imgEl.style.transform = "translateX(0px)";
  setTimeout(() => {
    imgEl.style.transition = "";
  }, 200);
}

// 次へ
function goNextImage() {
  const { images, currentIndex } = window.imageViewerState;
  if (currentIndex < images.length - 1) {
    // 次がある
    animateSwipeTransition(-window.innerWidth);
    window.imageViewerState.currentIndex++;
  } else {
    // 端まできてる
    bounceBack(-1);
  }
}

// 前へ
function goPrevImage() {
  const { currentIndex } = window.imageViewerState;
  if (currentIndex > 0) {
    animateSwipeTransition(window.innerWidth);
    window.imageViewerState.currentIndex--;
  } else {
    // 先頭
    bounceBack(1);
  }
}

// スワイプアニメ後に画像を差し替えてリセット
function animateSwipeTransition(offset) {
  const imgEl = document.getElementById("viewer-image-element");
  if (!imgEl) return;
  imgEl.style.transition = "transform 0.2s";
  // いったん画面外に飛ばす
  imgEl.style.transform = `translateX(${offset}px)`;
  setTimeout(() => {
    showImageInViewer();
    imgEl.style.transition = "none";
  }, 200);
}

// バウンスアニメ
function bounceBack(direction) {
  const imgEl = document.getElementById("viewer-image-element");
  if (!imgEl) return;
  imgEl.style.transition = "transform 0.2s";
  imgEl.style.transform = `translateX(${direction * 60}px)`;
  setTimeout(() => {
    imgEl.style.transform = "translateX(0px)";
  }, 200);
  setTimeout(() => {
    imgEl.style.transition = "";
  }, 400);
}

// タップ時にコントロール表示/非表示をトグル
function toggleViewerControls() {
  const controls = document.getElementById("viewer-controls");
  if (!controls) return;
  controls.classList.toggle("hidden");
}

// 画像削除
async function onClickViewerDelete() {
  const { sceneObj, currentIndex, images } = window.imageViewerState;
  if (!images[currentIndex]) return;
  if (!confirm("この画像を削除します。よろしいですか？")) return;

  const entryId = images[currentIndex].entryId;
  try {
    await deleteSceneEntry(entryId); // IndexedDBから物理削除
    images.splice(currentIndex, 1); // メモリ上からも削除

    if (images.length === 0) {
      closeImageViewer();
      updateSceneHistory();
      showLastScene();
      return;
    }
    // インデックス補正
    if (currentIndex >= images.length) {
      window.imageViewerState.currentIndex = images.length - 1;
    }
    showImageInViewer();
    updateSceneHistory();
    showLastScene();
  } catch (err) {
    console.error("Delete error:", err);
    alert("削除に失敗しました: " + err.message);
  }
}

// ダウンロード
function onClickViewerDownload() {
  const { images, currentIndex } = window.imageViewerState;
  if (!images[currentIndex]) return;

  const link = document.createElement("a");
  link.href = images[currentIndex].dataUrl;
  link.download = "image.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 閉じる
function closeImageViewer() {
  window.imageViewerState.isOpen = false;
  const viewerModal = document.getElementById("image-viewer-modal");
  if (viewerModal) {
    viewerModal.classList.remove("active");
  }
}

// --------------------------------------------------
// ▼ window.* に登録
// --------------------------------------------------
window.loadScenarioData = loadScenarioData;
window.onCancelFetch = onCancelFetch;
window.getNextScene = getNextScene;
window.generateImageForScene = generateImageForScene;
window.openImagePromptModal = openImagePromptModal;
window.closeImagePromptModal = closeImagePromptModal;
window.onCustomImageGenerate = onCustomImageGenerate;

window.onUpdateEntitiesFromAllScenes = onUpdateEntitiesFromAllScenes;
window.openEntitiesModal = openEntitiesModal;
