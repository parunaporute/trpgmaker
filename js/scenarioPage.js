/********************************
 * scenarioPage.js
 * シナリオページ固有のUI操作
 * - 「回答候補を生成」機能
 * - 「カードを取得する」ボタンでシーン→アイテム化
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

  // メニューに戻るボタン
  const backToMenuBtn = document.getElementById("back-to-menu");
  if(backToMenuBtn){
    backToMenuBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // ネタバレ（クリア条件）
  const spoilerModal = document.getElementById("spoiler-modal");
  const spoilerButton = document.getElementById("spoiler-button");
  const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");

  if(spoilerButton){
    spoilerButton.addEventListener("click", () => {
      spoilerModal.style.display = "flex";
    });
  }
  if(closeSpoilerModalBtn){
    closeSpoilerModalBtn.addEventListener("click", () => {
      spoilerModal.style.display = "none";
    });
  }

  // 「カードを取得する」ボタン（探索型シナリオ用）
  const getCardButton = document.getElementById("get-card-button");
  if(getCardButton){
    getCardButton.addEventListener("click", async () => {
      // シーン全文を要約
      const sceneSummary = await getLastSceneSummary();

      // GPTから取得したテキストをパース
      const lines = sceneSummary.split("\n");
      let onlyTitle = "", onlyType = "", addPrompt = "";
      lines.forEach((line) => {
        line = line.trim();
        if (line.startsWith("【名前】")) {
          onlyTitle = line.replace("【名前】", "").replace("：", "").trim();
        } else if (line.startsWith("【タイプ】")) {
          onlyType = line.replace("【タイプ】", "").replace("：", "").trim();
        } else if (line.startsWith("【外見】")) {
          addPrompt = line.replace("【外見】", "").replace("：", "").trim();
        }
      });

      alert("要約結果:\n" + sceneSummary);

      // 実際には下記を有効にして倉庫へ送る:
      await runGacha(1, addPrompt, onlyTitle, onlyType);

      alert("シーンで新たなカードを取得しました。\n『エレメント作成』画面のガチャBOXに追加されます。");
    });
  }

  // 「回答候補を生成」ボタン（プレイヤー行動の候補）
  const generateActionCandidatesBtn = document.getElementById("generate-action-candidates-button");
  if(generateActionCandidatesBtn){
    generateActionCandidatesBtn.addEventListener("click", onGenerateActionCandidates);
  }
});

/**
 * 「回答候補を生成」ボタン押下
 * - 直近のシーンを踏まえ、プレイヤー行動の候補を5つ提案してもらう
 * - 結果をボタンとして表示し、クリックすると player-input に反映
 */
async function onGenerateActionCandidates(){
  if(!window.apiKey){
    alert("APIキーが設定されていません。");
    return;
  }

  // 最新シーンのテキストを取得
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === 'scene');
  const lastSceneText = lastSceneEntry ? lastSceneEntry.content : "(まだシーンがありません)";

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
          {role:"system", content:"あなたは優秀なTRPGのアシスタントです。"},
          {role:"user", content: prompt}
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
    // 例: 「1. ドアを調べる\n2. NPCに話しかける\n...」
    const lines = content.split("\n").map(l=>l.trim()).filter(l=>l);

    const container = document.getElementById("action-candidates-container");
    if(!container) return;
    container.innerHTML = "";

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");
      btn.style.display = "block";
      btn.style.margin = "5px 0";

      // クリックで #player-input にセット
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
 * 最新のシーン内容を要約し、【名前】【タイプ】【外見】形式で返す。
 * カード取得時に利用する。
 */
async function getLastSceneSummary() {
  const lastSceneEntry = [...window.sceneHistory].reverse().find(e => e.type === "scene");
  if (!lastSceneEntry) return "シーンがありません。";

  const fullText = lastSceneEntry.content;

  const systemPrompt = `あなたは優秀なカード作成用プロンプト製造者です。以下のフォーマットでプロンプトを製造してください。
【名前】：...
【タイプ】：キャラクター、モンスター、アイテム、のいずれか
【外見】：...
`;
  const userPrompt = `
以下のシナリオの1シーンから関連がありそうで見栄えがしそうなエレメントを1件だけ抜き出してください。
エレメントは
・シーンに出現するキャラクター
・シーンに出現する武器
・シーンに出現するアイテム
のいずれかです。
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


/** ローディングモーダル表示/非表示 */
function showLoadingModal(show){
  const modal = document.getElementById("loading-modal");
  if(!modal) return;
  modal.style.display = show ? "flex" : "none";
}

/** リクエストキャンセル */
function onCancelFetch(){
  if(window.currentRequestController){
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
