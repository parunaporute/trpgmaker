// scenarioPage.js
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
  
    // --------------- 以下、画面のイベント設定 ---------------
    document.getElementById("back-to-menu").addEventListener("click", () => {
      window.location.href = "index.html";
    });
  
    const spoilerModal = document.getElementById("spoiler-modal");
    const spoilerButton = document.getElementById("spoiler-button");
    const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");
  
    spoilerButton.addEventListener("click", () => {
      spoilerModal.style.display = "flex";
    });
    closeSpoilerModalBtn.addEventListener("click", () => {
      spoilerModal.style.display = "none";
    });
  
    // 「カードを取得する」ボタン
    const getCardButton = document.getElementById("get-card-button");
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
  
      alert(sceneSummary);
      // 実際には↓を有効にして倉庫へ送る:
      // await runGacha(1, addPrompt, onlyTitle, onlyType);
  
      alert("シーンで新たなカードを取得しました。\n『エレメント作成』画面のガチャBOXに追加されます。");
    });
  
    async function getLastSceneSummary() {
      // ① 最新シーンを取得
      const lastSceneEntry = [...window.sceneHistory]
        .reverse()
        .find((e) => e.type === "scene");
      if (!lastSceneEntry) return "シーンがありません。";
  
      const fullText = lastSceneEntry.content;
  
      // ② GPTに「短い要約を返して」とリクエスト
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
  });
  