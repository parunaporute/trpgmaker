/********************************
 * sceneManager.js
 * シーン関連の主要ロジックをまとめる
 ********************************/

// --------------------------------------------------
// ▼ シナリオ読み込み
// --------------------------------------------------
window.loadScenarioData = async function (scenarioId) {
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

    // シーン一覧をDBから取得してメモリに整形
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

    // シーン履歴の表示フラグ
    if (typeof sc.showHistory === 'undefined') {
      sc.showHistory = false;
    }

    // UI再描画 (sceneUI.js に定義)
    updateSceneHistory();
    showLastScene();
    refreshEndingButtons();
    await renderItemChips();

  } catch (err) {
    console.error("シナリオ読み込み失敗:", err);
    alert("読み込み失敗:" + err.message);
  }
};

/**
 * DB の sceneEntries から
 * type='scene', type='image' をまとめて取得し、
 * window.scenes に整形格納する
 */
async function loadAllScenesForScenario(scenarioId) {
  window.scenes = [];
  const allEntries = await getSceneEntriesByScenarioId(scenarioId);

  // シーンと画像を仕分け
  const sceneRecords = allEntries.filter(e => e.type === "scene");
  const imageRecords = allEntries.filter(e => e.type === "image");

  // entryId 昇順
  sceneRecords.sort((a,b) => a.entryId - b.entryId);
  imageRecords.sort((a,b) => a.entryId - b.entryId);

  // シーンごとに images を紐づけ
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

    const imgs = imageRecords.filter(imgRec => imgRec.sceneId === sRec.sceneId);
    scObj.images = imgs.map(img => ({
      entryId: img.entryId,
      dataUrl: img.dataUrl,
      prompt: img.prompt || ""
    }));

    window.scenes.push(scObj);
  }
}

// --------------------------------------------------
// ▼ 次のシーン取得
// --------------------------------------------------
window.getNextScene = async function (useItem = false) {
  if (!window.apiKey) {
    alert("APIキー未設定");
    return;
  }

  const hasIntro = window.scenes.length > 0;
  let pinput = "";

  // 2回目以降のシーンであれば、プレイヤーの行動入力欄を参照
  if (hasIntro) {
    if (!useItem) {
      pinput = (document.getElementById("player-input")?.value || "").trim();
      if (!pinput) {
        alert("プレイヤー行動を入力してください");
        return;
      }
    }
  }

  // アイテム使用の場合
  if (useItem && window.selectedItem) {
    const nm = window.selectedItem.name || "不明アイテム";
    const ds = window.selectedItem.description || "説明不明";
    pinput = `「${nm}という名称の${ds}という説明のあるアイテムを使用します」`;
    window.selectedItem = null; // 使い終わったら解除
  }

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    // 1) プレイヤー行動を英訳
    let actionEn = "";
    if (pinput) {
      actionEn = await generateEnglishTranslation(pinput);
    }

    // 2) システム + ユーザープロンプト組み立て
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

    // セクション情報
    if (sections.length > 0) {
      systemText += "\n======\n";
      for (const sec of sections) {
        systemText += `【セクション${sec.number}】` + (sec.cleared ? "(クリア済み)" : "(未クリア)") + "\n";
        systemText += "条件: " + decompressCondition(sec.conditionZipped) + "\n\n";
      }
      systemText += "======\n";
    }

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
        const ptxt = buildPartyInsertionText(scenarioWd.party); // sceneExtras.js で定義
        msgs.push({ role: "user", content: ptxt });
      }
    }

    // 3) 過去シーンを ChatGPT へ渡す（要約＋未要約部分）
    const actionCount = window.scenes.filter(sc => sc.action && sc.action.content.trim()).length;
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
    const skipCount = (chunkEnd + 1) * 10;
    let aCnt = 0;
    for (const scn of window.scenes) {
      if (scn.action?.content.trim()) {
        aCnt++;
        if (aCnt <= skipCount) continue;
        const actText = scn.action.content_en?.trim() ? scn.action.content_en : scn.action.content;
        msgs.push({ role: "user", content: "player action:" + actText });
      }
      if (aCnt <= skipCount) continue;
      const scText = scn.content_en?.trim() ? scn.content_en : scn.content;
      msgs.push({ role: "assistant", content: scText });
    }

    // 今回の行動
    if (pinput) {
      msgs.push({ role: "user", content: "プレイヤーの行動:" + pinput });
    }

    // 4) ChatGPT呼び出し
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;
    const chatModel = "gpt-4";

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

    // 5) 日本語化
    const rawScene = data.choices[0].message.content || "";
    let finalSceneJa = rawScene;
    let finalSceneEn = "";
    if (!containsJapanese(rawScene)) {
      finalSceneJa = await generateJapaneseTranslation(rawScene);
      finalSceneEn = rawScene;
    } else {
      finalSceneEn = await generateEnglishTranslation(rawScene);
    }

    // 6) DBに保存
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
    window.scenes.push(newSceneObj);

    // 7) 挿絵用プロンプト
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

    // 10) シーン要約処理 (10アクション単位)
    await handleSceneSummaries();

    // 11) UIの再描画
    const playerInputEl = document.getElementById("player-input");
    if (!useItem && playerInputEl) {
      playerInputEl.value = "";
    }
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
};

// --------------------------------------------------
// ▼ 英日翻訳系
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
  const sorted = wd.sections.slice().sort((a,b) => a.number - b.number);
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
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${window.apiKey}` },
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

      // クリアしたらエンディングボタン表示更新
      refreshEndingButtons();
    } else {
      console.log("未達成と判定されました。");
    }
  } catch (err) {
    console.error("セクション判定API失敗:", err);
  }
}

// --------------------------------------------------
// ▼ 要約作成
// --------------------------------------------------
async function handleSceneSummaries() {
  const actionCount = window.scenes.filter(s => s.action && s.action.content.trim()).length;
  if (actionCount >= 15) {
    const chunkIndex = Math.floor((actionCount - 15) / 10);
    if (chunkIndex >= 0 && !window.sceneSummaries[chunkIndex]) {
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
      window.sceneSummaries[chunkIndex] = { en: enSummary, ja: jaSummary };
    }
  }
}

async function generateSummaryWithLimit(text, lines = 5, lang = "en") {
  if (!text.trim()) return "";
  let sys = "You are a talented summarizer. The final language must be English.";
  let user = `Summarize the following text in ${lines} lines of English:\n${text}`;

  if (lang === "ja") {
    sys = "あなたは優秀な要約者です。必ず日本語で。";
    user = `以下のテキストを${lines}行程度で簡潔にまとめてください:\n${text}`;
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
// ▼ 挿絵用英語プロンプト生成
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
// ▼ 共通処理
// --------------------------------------------------
window.onCancelFetch = function () {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
};

window.decompressCondition = function (zippedBase64) {
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
};

window.showLoadingModal = function (show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  if (show) {
    m.classList.add("active");
  } else {
    m.classList.remove("active");
  }
};
