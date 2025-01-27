/********************************
 * scenarioPage.js
 * - 「セクション」情報や「導入シーン」を可視化
 * - 「全セクションを閲覧する」ボタンでZIP解凍して表示
 * - 冒頭シーン(最初にDBへ登録されたscene)も履歴に出る
 ********************************/

window.addEventListener("load", async () => {
  // IndexedDB初期化 & characterDataロード
  await initIndexedDB();
  const storedChars = await loadCharacterDataFromIndexedDB();
  window.characterData = storedChars || [];

  // ネタバレ関連
  const spoilerModal = document.getElementById("spoiler-modal");
  const spoilerButton = document.getElementById("spoiler-button");
  const closeSpoilerModalBtn = document.getElementById("close-spoiler-modal");
  if (spoilerButton) {
    spoilerButton.addEventListener("click", () => {
      // .modal.active で表示
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

      // .modal.activeで表示
      previewModal.classList.add("active");

      const addBtn = document.getElementById("add-to-gachabox-button");
      if (addBtn) {
        addBtn.onclick = async () => {
          previewModal.classList.remove("active");
          const gachaModal = document.getElementById("gacha-modal");
          // gachaModal がある場合に .active で表示
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
});

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

  // scenario.jsの loadScenarioData() で window.currentScenario.wizardData がある想定
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

  // .modal.activeで表示
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

  modal.classList.add("active"); // 表示
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
  cardEl.className += "rarity" + c.rarity.replace("★", "").trim();

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
  cf.innerHTML = `<div class='bezel rarity${rv}'></div>`;

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

/** シーン要約からカード用【名前】【タイプ】【外見】を得る */
async function getLastSceneSummary() {
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
    m.classList.add("active");   // 表示
  } else {
    m.classList.remove("active"); // 非表示
  }
}
function onCancelFetch() {
  if (window.currentRequestController) {
    window.currentRequestController.abort();
  }
  showLoadingModal(false);
}
