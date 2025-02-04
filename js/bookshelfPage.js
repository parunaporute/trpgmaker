/****************************************
 * bookshelfPage.js
 * 本棚画面の初期化やUI操作
 ****************************************/
 
async function initBookshelfPage() {
  // 「メニューへ戻る」
  const backBtn = document.getElementById("back-to-menu");
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // シナリオ一覧を取得
  let allScenarios = [];
  try {
    allScenarios = await listAllScenarios();
  } catch (err) {
    console.error("シナリオ一覧の取得失敗:", err);
    return;
  }
  // bookShelfFlag === true のみ
  const shelfScenarios = allScenarios.filter(s => s.bookShelfFlag === true);

  // 本棚・リストを描画
  renderBooksOnShelf(shelfScenarios);
  renderBookshelfList(shelfScenarios);
}

/**
 * 本棚(横スクロール)
 *  - シナリオの「アクション数」を元に背表紙の厚みを変える
 *  - 「最後に追加された画像」をカバーに擬似利用
 */
async function renderBooksOnShelf(scenarios) {
  const shelfContainer = document.getElementById("bookshelf-container");
  shelfContainer.innerHTML = "";

  for (const scenario of scenarios) {
    // シナリオの action 数
    const entries = await getSceneEntriesByScenarioId(scenario.scenarioId);
    const actionCount = entries.filter(e => e.type === "action").length;
    const spineWidth = 20 + actionCount * 2;

    // 簡易的にタイトル5文字を背に
    const shortTitle = scenario.title?.substring(0, 15) || "(無題)";

    // 最後に追加された画像
    const images = entries.filter(e => e.type === "image");
    let coverImage = null;
    if (images.length > 0) {
      coverImage = images[images.length - 1]; 
    }

    // 背表紙要素 (bookSpine)
    const bookSpine = document.createElement("div");
    bookSpine.style.display = "inline-block";
    bookSpine.style.verticalAlign = "bottom";
    bookSpine.style.height = "200px";
    bookSpine.style.width = spineWidth + "px";
    bookSpine.style.marginRight = "1px";
    bookSpine.style.backgroundColor = "#774400";
    bookSpine.style.position = "relative";
    bookSpine.style.cursor = "pointer";
    // 角丸や内側の影等
    bookSpine.style.borderRadius = "3px";
    bookSpine.style.boxShadow = "inset 0 0 5px rgba(0,0,0,0.3)";
    bookSpine.style.overflow = "hidden";

    if (coverImage) {
      bookSpine.style.backgroundImage = `url(${coverImage.dataUrl})`;
      bookSpine.style.backgroundSize = "cover";
      bookSpine.style.backgroundPosition = "center";
      bookSpine.style.backgroundBlendMode = "multiply";
    }

    // ▼ タイトル用要素 (縦書きにする例)
    const titleEl = document.createElement("div");
    titleEl.textContent = shortTitle;

    // - writing-mode: vertical-rl; を使えば縦書き
    // - text-orientation: upright; で文字の向きを調整
    titleEl.style.position = "absolute";
    titleEl.style.left = "0px";
    titleEl.style.color = "#fff";
    titleEl.style.fontSize = "0.8rem";
    titleEl.style.writingMode = "vertical-rl";
    titleEl.style.textOrientation = "upright";

    
    // 背景色で文字が見辛い場合は、やや暗めの枠orシャドウ等も検討
    titleEl.style.textShadow = "1px 1px 2px #000";

    bookSpine.appendChild(titleEl);
    bookSpine.addEventListener("click", () => {
      focusBookshelfListItem(scenario.scenarioId);
    });

    shelfContainer.appendChild(bookSpine);
  }
}

/**
 * リスト表示
 */
function renderBookshelfList(scenarios) {
  const listContainer = document.getElementById("bookshelf-list-container");
  listContainer.innerHTML = "";

  if (!scenarios || scenarios.length === 0) {
    listContainer.textContent = "本棚は空です。";
    return;
  }

  for (const sc of scenarios) {
    const div = document.createElement("div");
    div.className = "scenario-list";
    div.style.border = "1px solid #777";
    div.style.borderRadius = "4px";
    div.style.marginBottom = "10px";
    div.style.padding = "10px";
    div.style.transition = "background-color 0.3s";
    div.setAttribute("data-scenario-id", sc.scenarioId);

    const infoText = document.createElement("div");
    infoText.textContent = `ID:${sc.scenarioId} / ${sc.title} (更新:${sc.updatedAt})`;
    div.appendChild(infoText);

    // 「アクティブへ」ボタン
    const btnActive = document.createElement("button");
    btnActive.textContent = "アクティブへ";
    btnActive.style.marginTop = "10px";
    btnActive.addEventListener("click", async () => {
      if (confirm("アクティブへ戻しますか？")) {
        // 本棚フラグをfalse、履歴もfalse
        sc.bookShelfFlag = false;
        sc.hideFromHistoryFlag = false;
        await updateScenario(sc);
        div.remove();
        initBookshelfPage();
      }
    });
    div.appendChild(btnActive);

    listContainer.appendChild(div);
  }
}

/** 
 * 背表紙をクリック → リストの該当箇所へスクロールしつつ強調
 */
function focusBookshelfListItem(scenarioId) {
  const listContainer = document.getElementById("bookshelf-list-container");
  const item = listContainer.querySelector(`[data-scenario-id="${scenarioId}"]`);
  if (item) {
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.style.backgroundColor = "#444";
    setTimeout(() => {
      item.style.backgroundColor = "";
    }, 1500);
  }
}

window.initBookshelfPage = initBookshelfPage;
