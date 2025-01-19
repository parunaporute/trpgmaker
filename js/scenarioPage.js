/********************************
 * scenarioPage.js
 * シナリオページ固有のUI操作
 * - 「回答候補を生成」機能
 * - 「カードを取得する」ボタンでプレビューモーダルを表示
 ********************************/

window.addEventListener("load", async () => {
  // 1. IndexedDB 初期化
  await initIndexedDB();

  // 2. もしwindow.characterDataが無ければ空配列を用意
  if (!window.characterData) {
    window.characterData = [];
  }

  // 3. IndexedDBからキャラクタ配列をロードし、上書き
  const stored = await loadCharacterDataFromIndexedDB();
  if (stored && stored.length > 0) {
    window.characterData = stored;
  }

  console.log(
    "scenarioPage.js: IndexedDB init & characterData loaded. length=",
    window.characterData.length
  );

  // メニューに戻るボタン（シナリオ画面 → index.html）
  const backToMenuBtn = document.getElementById("back-to-menu");
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // ネタバレ（目的達成型）
  const spoilerModal = document.getElementById("spoiler-modal");
  const spoilerButton = document.getElementById("spoiler-button");
  const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");
  if (spoilerButton) {
    spoilerButton.addEventListener("click", () => {
      spoilerModal.style.display = "flex";
    });
  }
  if (closeSpoilerModalBtn) {
    closeSpoilerModalBtn.addEventListener("click", () => {
      spoilerModal.style.display = "none";
    });
  }

  // -----------------------------
  // 「カードを取得する」ボタン押下 → プレビューモーダル
  // -----------------------------
  const getCardButton = document.getElementById("get-card-button");
  if (getCardButton) {
    getCardButton.addEventListener("click", async () => {
      // 1) 最新シーンからカード化に使えそうな情報を要約
      const sceneSummary = await getLastSceneSummary();

      // シーン要約中から【名前】や【タイプ】【外見】等を抜き出す（サンプル実装）
      const lines = sceneSummary.split("\n");
      let onlyTitle = "", onlyType = "", addPrompt = "";
      lines.forEach((line) => {
        const trimLine = line.trim();
        if (trimLine.startsWith("【名前】")) {
          onlyTitle = trimLine.replace("【名前】", "").replace("：", "").trim();
        } else if (trimLine.startsWith("【タイプ】")) {
          onlyType = trimLine.replace("【タイプ】", "").replace("：", "").trim();
        } else if (trimLine.startsWith("【外見】")) {
          addPrompt = trimLine.replace("【外見】", "").replace("：", "").trim();
        }
      });

      // 2) プレビューモーダルを表示（テキストでの説明）
      const previewModal = document.getElementById("card-preview-modal");
      const previewContainer = document.getElementById("preview-card-container");
      if (!previewModal || !previewContainer) return;

      // いったん内部をクリア
      previewContainer.innerHTML = "";

      // ここでは仮に「このカードの概要」をテキストで表示するサンプル
      const preText = document.createElement("p");
      preText.textContent = 
        `【名前】：${onlyTitle || "(未取得)"}\n` +
        `【タイプ】：${onlyType || "(未取得)"}\n` +
        `【外見(生成プロンプト)】：${addPrompt || "(未取得)"}\n\n` +
        "この内容でカードを生成しますか？"
      ;
      preText.style.whiteSpace = "pre-wrap";
      previewContainer.appendChild(preText);

      // モーダルを表示
      previewModal.style.display = "flex";

      // 「ガチャ箱に追加」ボタン
      const addBtn = document.getElementById("add-to-gachabox-button");
      if (addBtn) {
        addBtn.onclick = async () => {
          previewModal.style.display = "none";
          // 実際にカードを生成（1枚）してガチャ箱へ
          const gachaModal = document.getElementById("gacha-modal");
          if (gachaModal) {
            gachaModal.style.display = "flex";
          }
          try {
            await runGacha(1, addPrompt, onlyTitle, onlyType);
            alert("新しいカードをガチャ箱に追加しました。\n「エレメント作成」画面で確認できます。");
          } catch (err) {
            console.error(err);
            alert("カード生成に失敗しました:\n" + err.message);
          } finally {
            if (gachaModal) {
              gachaModal.style.display = "none";
            }
          }
        };
      }

      // 「キャンセル」ボタン
      const cancelBtn = document.getElementById("cancel-card-preview-button");
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          previewModal.style.display = "none";
        };
      }
    });
  }

  // -----------------------------
  // 「回答候補を生成」ボタン
  // -----------------------------
  const generateActionCandidatesBtn = document.getElementById("generate-action-candidates-button");
  if (generateActionCandidatesBtn) {
    generateActionCandidatesBtn.addEventListener("click", onGenerateActionCandidates);
  }
});

/**
 * 回答候補（プレイヤー行動案）を生成
 */
async function onGenerateActionCandidates() {
  if (!window.apiKey) {
    alert("APIキーが設定されていません。");
    return;
  }
  // 最新シーンを取得
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  const lastSceneText = lastSceneEntry ? lastSceneEntry.content : "(シーンがありません)";

  window.cancelRequested = false;
  showLoadingModal(true);

  try {
    window.currentRequestController = new AbortController();
    const signal = window.currentRequestController.signal;

    const prompt = `
      あなたはTRPGのゲームマスターです。
      次のシーンは下記の描写です。
      ---
      ${lastSceneText}
      ---
      この状況でプレイヤーが取り得る行動案を5つほど提案してください。
      箇条書き形式で短めにお願いします。
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role:"system", content:"あなたは優秀なTRPGのアシスタントです。"},
          { role:"user", content: prompt }
        ],
        temperature:0.7
      }),
      signal
    });

    const data = await response.json();
    if(data.error){
      throw new Error(data.error.message);
    }

    const content = data.choices[0].message.content.trim();
    // 「1. ～」のような形式で来るので行ごとにボタン生成
    const lines = content.split("\n").map(l=>l.trim()).filter(l=>l);

    const container = document.getElementById("action-candidates-container");
    if(!container) return;
    container.innerHTML = "";

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");  // 行頭の "1. "などを削除
      btn.style.display = "block";
      btn.style.margin = "5px 0";

      // クリックで #player-input に反映
      btn.addEventListener("click", ()=>{
        const playerInput = document.getElementById("player-input");
        if(playerInput){
          playerInput.value = btn.textContent;
        }
      });

      container.appendChild(btn);
    });

  } catch(err){
    if(err.name === "AbortError"){
      console.log("回答候補生成キャンセル");
    } else {
      console.error(err);
      alert("回答候補の生成に失敗しました:\n" + err.message);
    }
  } finally {
    showLoadingModal(false);
  }
}

/**
 * 最新シーンの内容を ChatGPT で要約し、カード用の【名前】【タイプ】【外見】を抽出する。
 */
async function getLastSceneSummary() {
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  if (!lastSceneEntry) return "シーンがありません。";

  const fullText = lastSceneEntry.content;

  const systemPrompt = `あなたは優秀なカード作成用プロンプト製造者です。以下のフォーマットでプロンプトを製造してください。
【名前】：...
【タイプ】：キャラクター、モンスター、アイテムのいずれか
【外見】：...
`;
  const userPrompt = `
以下のシナリオの1シーンから、エレメントにできそうな対象を1つだけ取り出し、
カード用の【名前】【タイプ】【外見】を生成してください。
---
${fullText}
---
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error("要約取得失敗:", err);
    return "(要約失敗)";
  }
}

/** ローディングモーダルの表示/非表示 */
function showLoadingModal(show){
  const modal = document.getElementById("loading-modal");
  if(!modal) return;
  modal.style.display = show ? "flex" : "none";
}

/** リクエストを中断 */
function onCancelFetch(){
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
