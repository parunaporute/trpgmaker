/*************************************
 * customScenario.js
 * 
 * カスタムシナリオ作成ウィザード用スクリプト
 * ステップ0: パーティ選択
 * ステップ1: タイトル & シナリオ概要
 * ステップ2: セクション (複数入力可)
 * ステップ3: 導入シーン + 画像生成(任意)
 * 
 * 完了時: createNewScenario -> scene追加 -> (画像生成) -> トップへ
 *************************************/

let customWizardData = {
  partyId: 0,
  party: [],
  title: "",
  overview: "",
  sections: [],   // { number: 1, condition: "xxx" } という形
  intro: ""
};

/** 初期化 */
async function initCustomScenario() {
  // パーティ一覧の表示
  await loadAndDisplayPartyList();

  // イベント設定
  document.getElementById("custom-go-step1-btn").addEventListener("click", onGoStep1);
  document.getElementById("custom-back-to-step0-btn").addEventListener("click", onBackToStep0);
  document.getElementById("custom-go-step2-btn").addEventListener("click", onGoStep2);
  document.getElementById("custom-back-to-step1-btn").addEventListener("click", onBackToStep1);
  document.getElementById("custom-add-section-btn").addEventListener("click", onAddSection);
  document.getElementById("custom-go-step3-btn").addEventListener("click", onGoStep3);
  document.getElementById("custom-back-to-step2-btn").addEventListener("click", onBackToStep2);
  document.getElementById("custom-complete-btn").addEventListener("click", onCompleteWizard);

  // セクション表示を初期化
  renderSections();
}

/** ステップ0: パーティ選択UIに表示 */
async function loadAndDisplayPartyList() {
  try {
    // avatarData(“myAvatar”) を読み込む
    let avatarImageBase64 = "";
    const avatarTx = db.transaction("avatarData", "readonly");
    const avatarStore = avatarTx.objectStore("avatarData");
    const avatarReq = avatarStore.get("myAvatar");
    const avatarData = await new Promise(resolve => {
      avatarReq.onsuccess = () => resolve(avatarReq.result || null);
      avatarReq.onerror = () => resolve(null);
    });
    if (avatarData && avatarData.imageData) {
      avatarImageBase64 = avatarData.imageData;
    }

    // パーティ一覧
    const allParties = await listAllParties();
    const allChars = await loadCharacterDataFromIndexedDB();

    // パーティごとにカード1枚以上あるものだけ表示
    const filtered = [];
    for (const p of allParties) {
      const cards = allChars.filter(c => c.group === "Party" && c.partyId === p.partyId);
      if (cards.length < 1) continue;
      // アイコン画像
      let mainImage = "";
      const avatarCard = cards.find(c => c.role === "avatar" && c.imageData);
      if (avatarCard) {
        mainImage = avatarCard.imageData;
      } else {
        const firstImgCard = cards.find(c => c.imageData);
        if (firstImgCard) {
          mainImage = firstImgCard.imageData;
        }
      }
      filtered.push({
        partyId: p.partyId,
        name: p.name,
        updatedAt: p.updatedAt,
        avatarImage: mainImage
      });
    }
    // 日付降順
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // "あなたの分身"を先頭に( partyId = -1 とする )
    filtered.unshift({
      partyId: -1,
      name: "あなたの分身",
      updatedAt: "",
      avatarImage: avatarImageBase64
    });

    const container = document.getElementById("custom-wizard-party-list");
    container.innerHTML = "";

    // 1行ずつ
    filtered.forEach(p => {
      const row = document.createElement("div");
      row.className = "wizard-party-row";

      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "customPartyRadio";
      rb.value = p.partyId.toString();

      const uniqueId = "radio-party-" + p.partyId;
      rb.id = uniqueId;

      // 現在の選択
      if (customWizardData.partyId === p.partyId) {
        rb.checked = true;
      }

      const label = document.createElement("label");
      label.className = "wizard-party-label";
      label.setAttribute("for", uniqueId);

      if (p.avatarImage) {
        const img = document.createElement("img");
        img.src = p.avatarImage;
        img.alt = "PartyImage";
        label.appendChild(img);
      } else {
        const noImg = document.createElement("div");
        noImg.className = "no-image-box";
        noImg.textContent = "No Image";
        label.appendChild(noImg);
      }

      const ymd = p.updatedAt ? p.updatedAt.split("T")[0] : "";
      label.appendChild(document.createTextNode(
        p.partyId === -1 ? p.name : `${p.name} (更新:${ymd})`
      ));

      row.appendChild(rb);
      row.appendChild(label);

      container.appendChild(row);
    });

    // 「パーティなし」
    {
      const row = document.createElement("div");
      row.className = "wizard-party-row";

      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "customPartyRadio";
      rb.value = "0";
      const uniqueId = "radio-party-none";
      rb.id = uniqueId;

      if (!customWizardData.partyId) {
        rb.checked = true;
      }

      const label = document.createElement("label");
      label.className = "wizard-party-label";
      label.setAttribute("for", uniqueId);
      label.textContent = "パーティなし";

      row.appendChild(rb);
      row.appendChild(label);
      container.appendChild(row);
    }
  } catch (err) {
    console.error("パーティ一覧表示に失敗:", err);
  }
}

/** ステップ0 → ステップ1 */
function onGoStep1() {
  const checked = document.querySelector('input[name="customPartyRadio"]:checked');
  if (!checked) {
    alert("パーティを選択してください。");
    return;
  }
  customWizardData.partyId = parseInt(checked.value, 10);

  // 画面遷移
  document.getElementById("custom-step0").style.display = "none";
  document.getElementById("custom-step1").style.display = "block";
}

function onBackToStep0() {
  document.getElementById("custom-step1").style.display = "none";
  document.getElementById("custom-step0").style.display = "block";
}

/** ステップ1 → ステップ2 */
function onGoStep2() {
  const title = document.getElementById("custom-title-input").value.trim();
  const overview = document.getElementById("custom-overview-input").value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }
  customWizardData.title = title;
  customWizardData.overview = overview;

  document.getElementById("custom-step1").style.display = "none";
  document.getElementById("custom-step2").style.display = "block";
}

function onBackToStep1() {
  document.getElementById("custom-step2").style.display = "none";
  document.getElementById("custom-step1").style.display = "block";
}

/** セクション追加ボタン */
function onAddSection() {
  const newNumber = customWizardData.sections.length + 1;
  customWizardData.sections.push({
    number: newNumber,
    condition: ""
  });
  renderSections();
}

/** セクション一覧を表示 */
function renderSections() {
  const container = document.getElementById("custom-sections-container");
  container.innerHTML = "";

  // もし一つも無ければとりあえず1つは追加する
  if (customWizardData.sections.length === 0) {
    customWizardData.sections.push({ number: 1, condition: "" });
  }

  customWizardData.sections.forEach((sec, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom = "10px";

    const label = document.createElement("label");
    label.textContent = `セクション${sec.number}: `;
    label.style.display = "block";

    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.style.width = "100%";
    ta.placeholder = "動詞で始める形で...";
    ta.value = sec.condition;
    ta.addEventListener("input", () => {
      customWizardData.sections[idx].condition = ta.value;
    });

    div.appendChild(label);
    div.appendChild(ta);
    container.appendChild(div);
  });
}

/** ステップ2 → ステップ3 */
function onGoStep3() {
  // 入力チェック(一応)
  if (customWizardData.sections.length === 0) {
    alert("セクションを1つ以上追加してください。");
    return;
  }

  // 画面遷移
  document.getElementById("custom-step2").style.display = "none";
  document.getElementById("custom-step3").style.display = "block";
}

function onBackToStep2() {
  document.getElementById("custom-step3").style.display = "none";
  document.getElementById("custom-step2").style.display = "block";
}

/** 完了ボタン → シナリオ作成 */
async function onCompleteWizard() {
  const intro = document.getElementById("custom-intro-input").value.trim();
  customWizardData.intro = intro;

  const doGenerateImage = document.getElementById("custom-generate-image-checkbox").checked;

  showLoadingModal(true);

  try {
    // 1) party情報を取り込み
    await storePartyInWizardData();

    // 2) シナリオDB作成
    const scenarioId = await createNewScenario(customWizardData, customWizardData.title);

    // 3) セクション情報を scenarioId に反映
    //    wizardData.sectionsの condition を圧縮して保存するイメージ
    //    scenarioの wizardData に sections[] が入っているだけでOKなので updateScenario
    const scenarioObj = await getScenarioById(scenarioId);
    if (scenarioObj) {
      scenarioObj.wizardData.sections = customWizardData.sections.map(s => {
        // pako圧縮
        const zipped = zipString(s.condition);
        return {
          number: s.number,
          conditionZipped: zipped,
          cleared: false
        };
      });
      await updateScenario(scenarioObj);
    }

    // 4) 導入シーンがあれば sceneに書き込む
    if (intro) {
      const sceneId = "intro_" + Date.now();
      const record = {
        scenarioId: scenarioId,
        type: "scene",
        sceneId: sceneId,
        content: intro,
        content_en: "",
        actionContent: "",
        actionContent_en: "",
        prompt: "",
        dataUrl: ""
      };
      const newEntryId = await addSceneEntry(record);

      // 5) 画像生成チェックがONなら、直後に generateImageForScene
      if (doGenerateImage) {
        // scene.js で使う形の「シーンオブジェクト」
        const sceneObj = {
          scenarioId: scenarioId,
          sceneId: sceneId,
          content: intro,
          content_en: "",
          action: { content: "", content_en: "" },
          images: []
        };
        // generateImageForScene(...) で使うように、DBレコードを再取得しておく
        const allSceneEntries = await getSceneEntriesByScenarioId(scenarioId);
        const sceneRec = allSceneEntries.find(e => e.type === "scene" && e.sceneId === sceneId);
        if (sceneRec) {
          sceneObj.content = sceneRec.content;
        }
        // 画像生成
        await generateImageForScene(sceneObj);
      }
    }

    // 6) 完了 → トップへ
    alert("カスタムシナリオを作成しました。");
    window.location.href = "index.html";
  } catch (err) {
    console.error("カスタムシナリオ作成失敗:", err);
    alert("カスタムシナリオ作成に失敗しました:\n" + err.message);
  } finally {
    showLoadingModal(false);
  }
}

/** パーティ情報を customWizardData.party に詰める */
async function storePartyInWizardData() {
  const pid = customWizardData.partyId || 0;

  if (pid === 0) {
    // パーティ無し
    customWizardData.party = [];
    return;
  }

  if (pid === -1) {
    // 「あなたの分身」
    const avatarObj = await loadMyAvatarData();
    if (avatarObj) {
      const card = convertAvatarToPartyCard(avatarObj);
      customWizardData.party = [card];
    } else {
      customWizardData.party = [];
    }
    return;
  }

  // 通常パーティ
  const allChars = await loadCharacterDataFromIndexedDB();
  const partyCards = allChars.filter(c => c.group === "Party" && c.partyId === pid);
  const stripped = partyCards.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    rarity: c.rarity,
    state: c.state,
    special: c.special,
    caption: c.caption,
    backgroundcss: c.backgroundcss,
    imageprompt: c.imageprompt,
    role: c.role,
    imageData: c.imageData
  }));
  customWizardData.party = stripped;
}

function loadMyAvatarData() {
  return new Promise((resolve) => {
    if (!db) {
      console.warn("DB未初期化");
      resolve(null);
      return;
    }
    const tx = db.transaction("avatarData", "readonly");
    const store = tx.objectStore("avatarData");
    const req = store.get("myAvatar");
    req.onsuccess = () => {
      resolve(req.result || null);
    };
    req.onerror = () => {
      resolve(null);
    };
  });
}

function convertAvatarToPartyCard(avatarObj) {
  return {
    id: "avatar-" + Date.now(),
    name: avatarObj.name || "アバター",
    type: "キャラクター",
    rarity: avatarObj.rarity || "★1",
    state: "",
    special: avatarObj.skill || "",
    caption: avatarObj.serif || "",
    backgroundcss: "",
    imageprompt: "",
    role: "avatar",
    imageData: avatarObj.imageData || ""
  };
}

/** 文字列をpako圧縮(Base64化) */
function zipString(str) {
  const utf8 = new TextEncoder().encode(str);
  const def = pako.deflate(utf8);
  return btoa(String.fromCharCode(...def));
}

/** ローディングモーダルを出し入れ */
function showLoadingModal(show) {
  const m = document.getElementById("loading-modal");
  if (!m) return;
  if (show) {
    m.classList.add("active");
  } else {
    m.classList.remove("active");
  }
}

window.addEventListener("DOMContentLoaded", async function () {
  await initIndexedDB();
  // APIキー読み込み
  const savedApiKey = localStorage.getItem('apiKey');
  if (savedApiKey) {
    window.apiKey = savedApiKey;
  }
  await initBackground("customScenario");

  // メニューに戻るボタン
  document.getElementById("back-to-menu").addEventListener("click", function () {
    window.location.href = "index.html";
  });
});

window.addEventListener("load", async () => {
  initCustomScenario(); // ← customScenario.js 内の初期化
});
