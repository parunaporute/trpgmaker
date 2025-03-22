/********************************
 * sceneExtras.js
 * エンディングやエンティティ(アイテム/登場人物)、
 * パーティ表示など補助的な機能をまとめる
 ********************************/

/* =============================
   エンディング関連
============================= */

window.showEndingModal = async function (type) {
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
};

// 2) multiModal版 openEndingModal
window.openEndingModal = function (type, story) {
  // typeが "clear" なら「クリアエンディング」、それ以外は「エンディング」
  const titleText = (type === "clear") ? "クリアエンディング" : "エンディング";

  // multiModal でモーダルを表示
  multiModal.open({
    title: titleText,
    contentHtml: `
      <pre id="ending-modal-story" style="white-space:pre-wrap;">${DOMPurify.sanitize(story)}</pre>
    `,
    showCloseButton: true,        // 右上×で閉じる
    closeOnOutsideClick: true,
    appearanceType: "center",
    // ボタン2つ: 「再生成」「閉じる」
    additionalButtons: [
      {
        label: "再生成",
        onClick: () => {
          // 再生成: type判定に工夫が必要
          onClickRegenerateEndingMulti(type);
        }
      }
    ],
    cancelLabel: "閉じる"  // 下部に「閉じる」ボタン
  });
};

// 3) onClickRegenerateEnding() を少し改造:
//    旧版では #ending-modal-title のテキストから typeを判定
//    → multiModal下ではHTML要素が消えているので
//    → openEndingModal側で引数を渡す or global変数を使う

window.onClickRegenerateEndingMulti = async function (type) {
  const scenarioId = window.currentScenario?.scenarioId;
  if (!scenarioId) return;
  // 旧コード:  #ending-modal-title.textContent.includes("クリア") → type="clear"
  // ここは既に type を引数で受け取るようにした

  // 1) 既存Ending削除
  await deleteEnding(scenarioId, type);

  // 2) 再生成
  const newStory = await generateEndingStory(type);
  if (!newStory) return;
  await saveEnding(scenarioId, type, newStory);

  // 3) multiModalを開き直す or 部分更新
  //    例: 開き直し
  openEndingModal(type, newStory);
};


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
  const scenarioSummary = wd.scenarioSummary || "(概要なし)";
  const party = wd.party || [];

  // 最新10シーン
  let lastScenes = [...window.scenes];
  if (lastScenes.length > 10) {
    lastScenes = lastScenes.slice(-10);
  }
  const combinedSceneText = lastScenes.map(s => s.content).join("\n------\n");

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

/** 全セクションがクリア済みかどうか */
window.areAllSectionsCleared = function () {
  if (!window.sections || !window.sections.length) return false;
  return window.sections.every(s => s.cleared);
};

/** エンディングボタン表示切り替え */
window.refreshEndingButtons = function () {
  const endingBtn = document.getElementById("ending-button");
  const clearEndingBtn = document.getElementById("clear-ending-button");
  if (!endingBtn || !clearEndingBtn) return;

  if (!window.sections || window.sections.length === 0) {
    endingBtn.style.display = "none";
    clearEndingBtn.style.display = "none";
    return;
  }

  // いずれか1つでもクリア済みか？
  const anyCleared = window.sections.some(sec => sec.cleared);
  // 全クリアか？
  const allCleared = areAllSectionsCleared();

  if (!anyCleared) {
    endingBtn.style.display = "none";
    clearEndingBtn.style.display = "none";
    return;
  }
  if (allCleared) {
    endingBtn.style.display = "none";
    clearEndingBtn.style.display = "inline-block";
  } else {
    endingBtn.style.display = "inline-block";
    clearEndingBtn.style.display = "none";
  }
};


/* =============================
   エンティティ関連
============================= */

/**
 * まとめてリスト描画＆アイテムチップス更新を行うヘルパー関数
 */
async function refreshEntitiesAndChips() {
  await renderEntitiesList();
  await renderItemChips();
}

/** シナリオ全体のテキストから新規エンティティ(アイテム/キャラ)を抽出して登録 */
window.onUpdateEntitiesFromAllScenes = async function () {
  if (!window.apiKey) {
    alert("APIキーが未設定です。");
    return;
  }
  const scenarioId = window.currentScenarioId;
  if (!scenarioId) {
    alert("シナリオIDが不明です");
    return;
  }
  const existingEntities = await getEntitiesByScenarioId(scenarioId);

  const actionCount = window.scenes.length;
  let chunkEnd = Math.floor((actionCount - 15) / 10);
  if (chunkEnd < 0) chunkEnd = 0;

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
    if (aCnt <= skipCount && aCnt !== 0) continue;

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

  const existingTextArr = existingEntities.map(ent => {
    return `${ent.name}: ${ent.description}`;
  });
  const existingDesc = existingTextArr.join("\n") || "（なし）";

  const systemContent = "あなたはTRPGアシスタントAIです。日本語で回答してください。";
  const userContent = `
以下はTRPGのシナリオ中に登場したテキストです。
すでに抽出済みのアイテム/キャラクター(人物)は下記のとおりです：
${existingDesc}

新たに見つかったアイテムや登場人物があれば、JSON配列で出力してください。
固有名詞も日本語にしてください。日本語にできないものはカタカナにしてください。
さらに、もしプレイヤーがすでにそのアイテムを入手したと判断できる場合は "acquired": true、それ以外は "acquired": false としてください。
例：
[{"category":"item","name":"木の杖","description":"～","acquired": false}, {"category":"character","name":"太郎","description":"～"}]

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

    const rawAnswer = data.choices[0].message.content;
    let newEntities = [];
    try {
      newEntities = JSON.parse(rawAnswer);
    } catch (e) {
      console.warn("JSONパース失敗:", e);
    }

    console.log(newEntities);

    const candidateListDiv = document.getElementById("entity-candidate-list");
    if (!newEntities || newEntities.length === 0) {
      if (candidateListDiv) {
        candidateListDiv.innerHTML = "新しく追加できそうなアイテム/人物はありませんでした。";
      }
      return;
    }

    for (const e of newEntities) {
      const rec = {
        scenarioId,
        category: (e.category === "character") ? "character" : "item",
        name: e.name || "名称不明",
        description: e.description || "",
        acquired: e.acquired === true,
        imageData: ""
      };
      await addEntity(rec);
    }
    // ▼ ここでまとめてUIを更新
    await refreshEntitiesAndChips();
    if (candidateListDiv) {
      candidateListDiv.innerHTML = "新しいアイテム/登場人物を自動登録しました。";
    }

  } catch (err) {
    console.error("onUpdateEntitiesFromAllScenes失敗:", err);
    alert("抽出に失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
};

/** 情報モーダルを開いて一覧表示 */
window.openEntitiesModal = async function () {
  const infoModal = document.getElementById("info-modal");
  if (!infoModal) return;
  await renderEntitiesList();

  const candidateListDiv = document.getElementById("entity-candidate-list");
  if (candidateListDiv) candidateListDiv.innerHTML = "";

  infoModal.classList.add("active");
};

window.renderEntitiesList = async function () {
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
};

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
  // アイテムかつ acquired=true の場合は名前に【使用可能】を付加
  let displayName = entity.name;
  if (entity.category === "item" && entity.acquired) {
    displayName += "【使用可能】";
  }

  infoSpan.innerHTML = `<h4>${displayName}</h4> ${entity.description}`;

  topWrapper.appendChild(infoSpan);

  row.appendChild(topWrapper);

  // 下段： Wandボタン + ドロップダウン
  const bottomWrapper = document.createElement("div");
  bottomWrapper.className = "l-flexbox";

  const wandBtn = document.createElement("button");
  wandBtn.className = "scene-menu-button";
  wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
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
      (dropdown.style.display === "none") ? "flex" : "none";
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
      // ▼ 削除後にまとめて更新
      await refreshEntitiesAndChips();
    });
  }

  topWrapper.appendChild(bottomWrapper);
  return row;
}

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

    // ▼ 画像生成後にまとめて更新
    await refreshEntitiesAndChips();
  } catch (err) {
    console.error("generateEntityImage失敗:", err);
    alert("画像生成失敗:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}


/* =============================
   パーティ表示 & 全セクション一覧
============================= */
window.showPartyModal = function () {
  multiModal.open({
    title: "パーティ情報",
    contentHtml: `
      <div id="party-modal-card-container" style="margin-top:10px;"></div>
    `,
    appearanceType: "center",
    showCloseButton: true,       // 右上×
    closeOnOutsideClick: true,
    cancelLabel: "閉じる",       // 下部「閉じる」
    onOpen: () => {
      // モーダルDOMが生成されたあと => カードを表示
      renderPartyCardsInModalMulti();
    }
  });
};

function renderPartyCardsInModalMulti() {
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

  // 例: merged
  const merged = wizardPartyCards.map(wCard => {
    const dbMatch = dbCards.find(dbC => dbC.id === wCard.id);
    if (!dbMatch) return wCard;
    return {
      ...dbMatch,
      ...wCard,
      imageData: dbMatch.imageData || wCard.imageData
    };
  });

  merged.forEach(card => {
    const cardEl = createPartyCardElement(card); // 元のまま
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

  const bezel = document.createElement("div");
  bezel.className = "bezel rarity" + rarityNum;
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
  nm.innerHTML = `<h3>${c.name}</h3>`;
  info.appendChild(nm);

  if (c.state) {
    const st = document.createElement("p");
    st.innerHTML = `<strong>状態：</strong>${c.state}`;
    info.appendChild(st);
  }
  const sp = document.createElement("p");
  sp.innerHTML = `<strong>特技：</strong>${c.special}`;
  info.appendChild(sp);

  const cap = document.createElement("p");
  cap.innerHTML = `<span>${c.caption || "なし"}</span>`;
  info.appendChild(cap);

  cf.appendChild(info);

  const cb = document.createElement("div");
  cb.className = "card-back";
  cb.innerHTML = `<strong>${c.type}</strong>`;

  cardInner.appendChild(cf);
  cardInner.appendChild(cb);
  cardEl.appendChild(cardInner);
  return cardEl;
}

window.closePartyModal = function () {
  const modal = document.getElementById("party-modal");
  if (modal) {
    modal.classList.remove("active");
  }
};

/** 全セクション閲覧 */
window.showAllSectionsModal = function () {
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
      text += "条件: " + decompressCondition(sec.conditionZipped) + "\n\n";
    }
    container.textContent = text;
  }
  modal.classList.add("active");
};

/** パーティ情報文章化（sceneManagerで利用） */
window.buildPartyInsertionText = function (party) {
  let txt = "【パーティ編成情報】\n";

  const ava = party.find(e => e.role === "avatar");
  if (ava) {
    txt += "◆プレイヤー(アバター)\n";
    txt += buildCardDescription(ava);
    txt += "\n";
  }
  const pt = party.filter(e => e.role === "partner");
  if (pt.length > 0) {
    txt += "◆パートナー\n";
    pt.forEach(p => {
      txt += buildCardDescription(p);
      txt += "\n";
    });
  }
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
};

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

/* =========================================================
   ▼ ここが今回の修正点：パーティモーダルの「閉じる」処理を追加
========================================================= */
window.addEventListener("load", () => {
  const closePartyModalBtn = document.getElementById("close-party-modal");
  if (closePartyModalBtn) {
    closePartyModalBtn.addEventListener("click", () => {
      const modal = document.getElementById("party-modal");
      if (modal) {
        modal.classList.remove("active");
      }
    });
  }
});
