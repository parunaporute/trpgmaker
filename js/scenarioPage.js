/********************************
 * scenarioPage.js
 * シナリオページ固有のUI操作
 * - 「回答候補を生成」機能
 * - 「カードを取得する」ボタンでプレビューモーダルを表示
 * - ★ 追加: 「パーティーを確認」ボタン＆モーダル表示
 * - ★ 追加: 時々パーティ内キャラクターの画像をシーンとして追加
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

  // メニューに戻るボタン（シナリオ画面 → index.html）は scenario.html 内で定義済み

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
      const sceneSummary = await getLastSceneSummary();
      let onlyTitle = "";
      let onlyType = "";
      let addPrompt = "";

      // シーン要約から【名前】【タイプ】【外見】を抜き出す（簡易実装）
      const lines = sceneSummary.split("\n");
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

      // プレビューモーダル表示
      const previewModal = document.getElementById("card-preview-modal");
      const previewContainer = document.getElementById("preview-card-container");
      if (!previewModal || !previewContainer) return;

      previewContainer.innerHTML = "";

      const preText = document.createElement("p");
      preText.textContent =
        `【名前】：${onlyTitle || "(未取得)"}\n` +
        `【タイプ】：${onlyType || "(未取得)"}\n` +
        `【外見(生成プロンプト)】：${addPrompt || "(未取得)"}\n\n` +
        "この内容でカードを生成しますか？";
      preText.style.whiteSpace = "pre-wrap";
      previewContainer.appendChild(preText);

      previewModal.style.display = "flex";

      // 「ガチャ箱に追加」ボタン
      const addBtn = document.getElementById("add-to-gachabox-button");
      if (addBtn) {
        addBtn.onclick = async () => {
          previewModal.style.display = "none";
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

  // -----------------------------
  // ★ 追加: 「パーティーを確認」ボタン・モーダル
  // -----------------------------
  const showPartyBtn = document.getElementById("show-party-button");
  if (showPartyBtn) {
    showPartyBtn.addEventListener("click", () => {
      showPartyModal();
    });
  }

  const closePartyModalBtn = document.getElementById("close-party-modal");
  if (closePartyModalBtn) {
    closePartyModalBtn.addEventListener("click", () => {
      const modal = document.getElementById("party-modal");
      if (modal) {
        modal.style.display = "none";
      }
    });
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "あなたは優秀なTRPGのアシスタントです。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
      signal
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const content = data.choices[0].message.content.trim();
    const lines = content.split("\n").map(l => l.trim()).filter(l => l);

    const container = document.getElementById("action-candidates-container");
    if (!container) return;
    container.innerHTML = "";

    lines.forEach(line => {
      const btn = document.createElement("button");
      btn.textContent = line.replace(/^\d+\.\s*/, "");  // "1. "など行頭番号を削除
      btn.style.display = "block";
      btn.style.margin = "5px 0";

      // クリックしたら #player-input に反映
      btn.addEventListener("click", () => {
        const playerInput = document.getElementById("player-input");
        if (playerInput) {
          playerInput.value = btn.textContent;
        }
      });

      container.appendChild(btn);
    });

  } catch (err) {
    if (err.name === "AbortError") {
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
 * 直近のシーン内容を ChatGPT で要約し、カード用の【名前】【タイプ】【外見】を抽出する
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
function showLoadingModal(show) {
  const modal = document.getElementById("loading-modal");
  if (!modal) return;
  modal.style.display = show ? "flex" : "none";
}

/** リクエストを中断 */
function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}

/* -------------------------------------------
 * ★ 追加: 「パーティーを確認」モーダル表示
 * ------------------------------------------*/
function showPartyModal() {
  const modal = document.getElementById("party-modal");
  if (!modal) return;
  modal.style.display = "flex";

  // モーダル内にカードを表示
  renderPartyCardsInModal();
}

/** モーダル内にパーティのカードを表示（読み取り専用） */
function renderPartyCardsInModal() {
  const container = document.getElementById("party-modal-card-container");
  if (!container) return;

  container.innerHTML = "";

  // 最新のcharacterDataから、group==="Party" を抽出
  const partyCards = window.characterData.filter(c => c.group === "Party");
  if (partyCards.length === 0) {
    container.textContent = "パーティにはカードがありません。";
    return;
  }

  partyCards.forEach(card => {
    const cardEl = createPartyCardElement(card);
    container.appendChild(cardEl);
  });
}

/** パーティ用カードDOMを生成 */
function createPartyCardElement(card) {
  const cardEl = document.createElement("div");
  cardEl.className = "card";
  cardEl.setAttribute("data-id", card.id);

  // クリックで反転（選択モードなし）
  cardEl.addEventListener("click", () => {
    cardEl.classList.toggle("flipped");
  });

  const cardInner = document.createElement("div");
  cardInner.className = "card-inner";

  const cardFront = document.createElement("div");
  cardFront.className = "card-front";

  // 背景CSS
  const bgStyle = (card.backgroundcss || "")
    .replace("background-image:", "")
    .replace("background", "")
    .trim();
  cardFront.style = "background-image:" + bgStyle;

  // レアリティ
  const rarityValue = (typeof card.rarity === "string") ? card.rarity.replace("★", "").trim() : "0";
  cardFront.innerHTML = `<div class='bezel rarity${rarityValue}'></div>`;

  // タイプ
  const typeEl = document.createElement("div");
  typeEl.className = "card-type";
  typeEl.textContent = card.type || "不明";
  cardFront.appendChild(typeEl);

  // 画像
  const imageContainer = document.createElement("div");
  imageContainer.className = "card-image";
  if (card.imageData) {
    const imageEl = document.createElement("img");
    imageEl.src = card.imageData;
    imageEl.alt = card.name;
    imageContainer.appendChild(imageEl);
  }
  cardFront.appendChild(imageContainer);

  // 下部テキスト情報
  const infoContainer = document.createElement("div");
  infoContainer.className = "card-info";

  const nameEl = document.createElement("p");
  nameEl.innerHTML = "<h3>" + DOMPurify.sanitize(card.name) + "</h3>";
  infoContainer.appendChild(nameEl);

  if (card.state) {
    const stateEl = document.createElement("p");
    stateEl.innerHTML = "<strong>状態：</strong>" + DOMPurify.sanitize(card.state);
    infoContainer.appendChild(stateEl);
  }

  const specialEl = document.createElement("p");
  specialEl.innerHTML = "<strong>特技：</strong>" + DOMPurify.sanitize(card.special);
  infoContainer.appendChild(specialEl);

  const captionEl = document.createElement("p");
  captionEl.innerHTML = "<span>" + DOMPurify.sanitize(card.caption) + "</span>";
  infoContainer.appendChild(captionEl);

  cardFront.appendChild(infoContainer);

  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(card.type)}</strong>`;

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  cardEl.appendChild(cardInner);

  return cardEl;
}

/* -------------------------------------------
 * ★ 追加: 時々パーティ内「キャラクタータイプ」の画像を
 *         新たなシーンとして追加する処理 (ランダム発火)
 *
 *   - getNextScene() 完了後などに呼び出す
 *   - 20%の確率で発動
 *   - パーティ内の type==="キャラクター" で imageData があるものから1枚選ぶ
 *   - <img>を埋め込んだHTMLを content として「scene」エントリを追加
-------------------------------------------*/

async function maybeAddPartyCharacterScene() {
  // 20%の確率で発火
  if (Math.random() >= 0.2) {
    return;
  }

  // パーティ情報を取得
  const partyCharacters = window.characterData.filter(c =>
    c.group === "Party" &&
    (c.type === "キャラクター" || c.type === "character") && // 念のため英語表記もチェック
    c.imageData
  );

  if (partyCharacters.length === 0) {
    return;
  }

  // ランダムに1枚ピック
  const randomIndex = Math.floor(Math.random() * partyCharacters.length);
  const ch = partyCharacters[randomIndex];

  // 新しいシーンID
  const newSceneIdStr = generateUniqueId();
  const contentHtml = `
    <p><strong>パーティメンバー「${DOMPurify.sanitize(ch.name)}」のイメージ</strong></p>
    <img src="${ch.imageData}" alt="${DOMPurify.sanitize(ch.name)}" style="max-width:100%;">
  `;

  const newSceneEntry = {
    scenarioId: window.currentScenarioId || 0,
    type: 'scene',
    sceneId: newSceneIdStr,
    content: contentHtml
  };
  try {
    const newSceneEntryId = await addSceneEntry(newSceneEntry);
    window.sceneHistory.push({
      entryId: newSceneEntryId,
      type: 'scene',
      sceneId: newSceneIdStr,
      content: contentHtml
    });
  } catch (err) {
    console.error("パーティキャラクターシーン追加失敗:", err);
  }
}

/* -------------------------------------------
   以降は既存の scenario.js 内で定義している
   getNextScene 等と組み合わせる想定。
   シーン生成完了後のフックに maybeAddPartyCharacterScene() を追加する。
-------------------------------------------*/

/**
 * シーン取得 → 成功後にパーティ画像シーンを追加する
 *   （scene.js 側で定義されている getNextScene を
 *    こちら側で上書き or 差し替えするイメージ）
 *
 * ここでは、scene.js で書かれている実装を "wrap" した例を提示します。
 * 実際には scene.js 内の getNextScene を直接修正してもOKです。
 */

// --- scene.js で getNextScene が定義済みと仮定 ---
const originalGetNextScene = window.getNextScene; // 既存を退避

window.getNextScene = async function () {
  // まず元の処理を実行
  await originalGetNextScene();

  // 処理が成功(キャンセルされていなければ)したら
  if (!window.cancelRequested) {
    // パーティ画像を追加する
    await maybeAddPartyCharacterScene();
    // シーン履歴の再描画
    updateSceneHistory();
    showLastScene();
  }
};
