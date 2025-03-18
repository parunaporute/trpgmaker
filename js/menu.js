/*************************************************
 * menu.js
 *************************************************/

/**
 * グローバルに「シナリオ一覧」をキャッシュしておく
 *  - ページロード後に一度だけ listAllScenarios() を呼び出す
 */
window.cachedScenarios = [];

// ページ初期処理
function fadeInPlay(audio) {
  audio.volume = 0;
  audio.play().then(() => {
    const fadeInInterval = setInterval(() => {
      if (audio.volume < 1.0) {
        audio.volume = Math.min(audio.volume + 0.01, 1);
      } else {
        clearInterval(fadeInInterval);
      }
    }, 100);
  }).catch(err => { /* ユーザー操作待ちなどで発生 */ });
}

window.addEventListener("DOMContentLoaded", async () => {
  const bgmAudio = document.getElementById("bgm");
  const stopBgmButton = document.getElementById("stop-bgm-button");

  if (!bgmAudio || !stopBgmButton) return;

  const isBgmStopped = localStorage.getItem("bgmStopped") === "true";

  if (!isBgmStopped) {
    fadeInPlay(bgmAudio);

    bgmAudio.addEventListener("playing", () => {
      document.removeEventListener("click", handleUserGesture);
    });

    function handleUserGesture() {
      if (bgmAudio.paused) {
        fadeInPlay(bgmAudio);
      }
    }
    document.addEventListener("click", handleUserGesture);
  }

  if (isBgmStopped) {
    stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-mute2"></div>`;
    stopBgmButton.style.backgroundColor = "rgb(255,115,68)";
  } else {
    stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-high"></div>`;
    stopBgmButton.style.backgroundColor = "#4caf50";
  }

  stopBgmButton.addEventListener("click", () => {
    if (bgmAudio.paused) {
      fadeInPlay(bgmAudio);
      localStorage.setItem("bgmStopped", "false");
      stopBgmButton.style.backgroundColor = "#4caf50";
      stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-high"></div>`;
    } else {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      localStorage.setItem("bgmStopped", "true");
      stopBgmButton.style.backgroundColor = "rgb(255,115,68)";
      stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-mute2"></div>`;
    }
  });

  // カスタムシナリオ
  const customBtn = document.getElementById("start-custom-scenario-button");
  if (customBtn) {
    customBtn.addEventListener("click", () => {
      window.location.href = "customScenario.html";
    });
  }

  // 「もっと詳しい説明はこちら」リンク
  const openApiInstructionsLink = document.getElementById("open-api-instructions");
  if (openApiInstructionsLink) {
    openApiInstructionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      // multiModal でAPIキー取得説明を表示
      multiModal.open({
        title: "APIキーの取得方法",
        contentHtml: `
          <p>OpenAIの公式サイトからAPIキーを取得する簡単な手順です。</p>
          <ol style="text-align:left; margin-bottom:20px; line-height:1.8;">
            <li><a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: #fff;">
              こちらの「API Keys」設定ページ</a>へ移動します。</li>
            <li>[Create new secret key]をクリックし、新しいキーを作成します。</li>
            <li>表示されたキーをコピーし、このアプリの「APIキーを入力」に貼り付けてください。</li>
          </ol>
        `,
        showCloseButton: true,
        appearanceType: "center",
        closeOnOutsideClick: true,
        cancelLabel: "閉じる"
      });
    });
  }

  try {
    await initIndexedDB();
    initAvatar();
    await initBackground("index");
    initMenuPage(); // 初期化
  } catch (e) {
    console.error("DB初期化エラー:", e);
  }
});

/** initMenuPage: ページ読み込み時に呼び出されるメイン初期化 */
window.initMenuPage = async function () {
  // すでに initIndexedDB() は呼ばれている前提

  // localStorage から APIキーを読み込む
  window.apiKey = localStorage.getItem("apiKey") || "";

  // DB から全シナリオを取得し、cachedScenarios に格納
  try {
    const all = await listAllScenarios();
    window.cachedScenarios = all;
  } catch (err) {
    console.error("シナリオ一覧の取得に失敗:", err);
    showToast("シナリオ一覧の取得に失敗しました。");
    window.cachedScenarios = [];
  }

  // characterDataのロード
  try {
    const stored = await loadCharacterDataFromIndexedDB();
    window.characterData = stored || [];
  } catch (err) {
    console.error("characterDataのロードに失敗:", err);
    window.characterData = [];
  }

  // 「非表示を表示する」がオンかオフかで、最初の描画を行う
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;

  // フィルタを適用して表示
  applyScenarioFilter(showHidden);

  // メニュー上のボタン類をセットアップ
  setupMenuButtons();
  initAccordion();
};

/**
 * 現在の「非表示を表示する」チェック状態に合わせ、
 * cachedScenarios のうち表示対象となるものを差分更新する
 */
function applyScenarioFilter(showHidden) {
  const container = document.getElementById("scenario-list-container");
  const noScenariosMsg = document.getElementById("no-scenarios-message");
  if (!container) return;

  // 1) 既存の DOM 上にある scenario-list をマッピング (scenarioId -> DOM要素)
  const existingRows = Array.from(container.querySelectorAll(".scenario-list"));
  const existingMap = {};
  existingRows.forEach((row) => {
    const sid = row.dataset.scenarioId;
    existingMap[sid] = row;
  });

  // 2) フィルタ条件に合うシナリオを選び出す
  const filtered = window.cachedScenarios.filter((s) => {
    return showHidden ? s.hideFromHistoryFlag : !s.hideFromHistoryFlag;
  });

  // 3) 「表示するべき scenarioId の集合」
  const filteredIds = new Set(filtered.map((s) => s.scenarioId));

  // 4) すでにDOMにあるがフィルタに合わなくなったものを削除
  for (const sid in existingMap) {
    if (!filteredIds.has(Number(sid))) {
      existingMap[sid].remove(); // DOMから削除
      delete existingMap[sid];
    }
  }

  // 5) フィルタに合うシナリオのうち、まだDOMに存在しないものを生成・append
  filtered.forEach((scenario) => {
    if (!existingMap[scenario.scenarioId]) {
      const row = createScenarioRow(scenario);
      container.appendChild(row);
      existingMap[scenario.scenarioId] = row;
    } else {
      // 既存行を念のため更新
      updateScenarioRow(existingMap[scenario.scenarioId], scenario);
    }
  });

  // 6) 0件ならコンテナを隠してメッセージ表示
  if (filtered.length === 0) {
    container.style.display = "none";
    noScenariosMsg.style.display = "block";
  } else {
    container.style.display = "";
    noScenariosMsg.style.display = "none";
  }
}

/**
 * 単一シナリオ行を生成して返す
 * scenario の状態に応じてボタンのラベルや色をセット
 */
function createScenarioRow(scenario) {
  const div = document.createElement("div");
  div.className = "scenario-list";
  // 部分更新・DOM検索用に scenarioId を data 属性に持たせる
  div.dataset.scenarioId = scenario.scenarioId;

  const infoText = document.createElement("span");
  infoText.className = "info";
  infoText.textContent = `ID:${scenario.scenarioId} / ${scenario.title} (更新:${scenario.updatedAt}) `;
  div.appendChild(infoText);

  // 今の「非表示を表示する」チェック状態を取得
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;

  // 「非表示を表示」チェックがオフの場合のみ「続きへ」「本棚へ」ボタン
  if (!showHidden) {
    // 続きへボタン
    const btnContinue = document.createElement("button");
    btnContinue.type = "button";
    btnContinue.textContent = "始める";
    btnContinue.addEventListener("click", () => {
      window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
    });
    div.appendChild(btnContinue);

    // 「本棚へ」/「収納済」トグルボタン
    const btnShelf = document.createElement("button");
    btnShelf.type = "button";
    btnShelf.classList.add("btn-shelf");

    if (!scenario.bookShelfFlag) {
      btnShelf.textContent = "本棚へ";
      btnShelf.style.backgroundColor = "";
    } else {
      btnShelf.textContent = "収納済";
      btnShelf.style.backgroundColor = "gray";
    }

    btnShelf.addEventListener("click", async () => {
      try {
        await toggleBookShelfFlag(scenario);
      } catch (err) {
        console.error(err);
        showToast("本棚フラグ切り替えに失敗:\n" + err.message);
      }
    });
    div.appendChild(btnShelf);
  }

  // 非表示フラグによって「非表示にする」or「表示する」ボタン
  if (!scenario.hideFromHistoryFlag) {
    const btnHide = document.createElement("button");
    btnHide.type = "button";
    btnHide.textContent = "非表示にする";
    btnHide.addEventListener("click", () => {
      showHideConfirmModal(scenario);
    });
    div.appendChild(btnHide);
  } else {
    const btnShow = document.createElement("button");
    btnShow.type = "button";
    btnShow.textContent = "表示する";
    btnShow.style.backgroundColor = "gray";
    btnShow.addEventListener("click", async () => {
      try {
        await toggleHideFromHistoryFlag(scenario, false);
        showToast(`シナリオ(ID:${scenario.scenarioId})を表示しました。`);
      } catch (err) {
        console.error(err);
        showToast("非表示フラグ切り替えに失敗:\n" + err.message);
      }
    });
    div.appendChild(btnShow);
  }

  // 「非表示を表示」チェックがオンの場合のみ「削除する」ボタン
  if (showHidden) {
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.textContent = "削除する";
    btnDelete.style.backgroundColor = "#f44336";
    btnDelete.addEventListener("click", () => {
      // multiModal で削除確認ダイアログを開く
      multiModal.open({
        title: "シナリオ削除の確認",
        contentHtml: `<p>このシナリオを削除します。よろしいですか？</p>`,
        showCloseButton: true,
        appearanceType: "center",
        closeOnOutsideClick: true,
        okLabel: "OK",
        cancelLabel: "キャンセル",
        onOk: async () => {
          try {
            await deleteScenarioById(scenario.scenarioId);
            showToast(`シナリオ(ID:${scenario.scenarioId})を削除しました。`);
            // cachedScenarios から削除
            window.cachedScenarios = window.cachedScenarios.filter(s => s.scenarioId !== scenario.scenarioId);
            // DOM要素も削除
            removeScenarioFromDOM(scenario.scenarioId);
          } catch (err) {
            console.error(err);
            showToast("シナリオ削除に失敗:\n" + err.message);
          }
        }
      });
    });
    div.appendChild(btnDelete);
  }

  return div;
}

/**
 * 既存のシナリオ行要素を丸ごと置き換える (DOMの部分再描画用)
 */
function updateScenarioRow(oldRow, scenario) {
  const newRow = createScenarioRow(scenario);
  oldRow.parentNode.replaceChild(newRow, oldRow);
  return newRow;
}

/**
 * DOMから指定のシナリオ行を削除する (scenarioIdベース)
 */
function removeScenarioFromDOM(scenarioId) {
  const row = document.querySelector(`.scenario-list[data-scenario-id="${scenarioId}"]`);
  if (row) {
    row.remove();
  }
}

/**
 * 「本棚フラグ」をトグルして部分的にDOM反映する
 */
async function toggleBookShelfFlag(scenario) {
  scenario.bookShelfFlag = !scenario.bookShelfFlag;
  scenario.updatedAt = new Date().toISOString();
  await updateScenario(scenario);

  // グローバル cachedScenarios も同期的に更新
  const index = window.cachedScenarios.findIndex((s) => s.scenarioId === scenario.scenarioId);
  if (index !== -1) {
    window.cachedScenarios[index] = { ...scenario };
  }

  // 表示中であれば行を更新
  const row = document.querySelector(`.scenario-list[data-scenario-id="${scenario.scenarioId}"]`);
  if (row) {
    updateScenarioRow(row, scenario);
  }
}

/**
 * 「hideFromHistoryFlag」をトグル (true=非表示, false=表示)
 */
async function toggleHideFromHistoryFlag(scenario, hideFlag) {
  scenario.hideFromHistoryFlag = hideFlag;
  scenario.updatedAt = new Date().toISOString();
  await updateScenario(scenario);

  // グローバル cachedScenarios も同期的に更新
  const index = window.cachedScenarios.findIndex((s) => s.scenarioId === scenario.scenarioId);
  if (index !== -1) {
    window.cachedScenarios[index] = { ...scenario };
  }

  // 現在のフィルタを取得して差分更新
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  const showHidden = showHiddenCheckbox ? showHiddenCheckbox.checked : false;
  applyScenarioFilter(showHidden);
}

/** 「非表示にする」ボタン押下時の確認モーダル表示 */
function showHideConfirmModal(scenario) {
  multiModal.open({
    title: "シナリオを非表示",
    contentHtml: `<p>このシナリオを履歴から非表示にします。よろしいですか？</p>`,
    showCloseButton: true,
    appearanceType: "center",
    closeOnOutsideClick: true,
    okLabel: "OK",
    cancelLabel: "キャンセル",
    onOk: async () => {
      try {
        await toggleHideFromHistoryFlag(scenario, true);
        showToast(`シナリオ(ID:${scenario.scenarioId})を非表示にしました。`);
      } catch (err) {
        console.error(err);
        showToast("非表示フラグ切り替えに失敗:\n" + err.message);
      }
    }
  });
}

/** メニュー内のボタン等のイベント設定 */
function setupMenuButtons() {
  // 「APIキー設定」または「キー設定済」のボタン
  const setApiKeyButton = document.getElementById("set-api-key-button");

  if (!window.apiKey) {
    setApiKeyButton.textContent = "APIキー設定";
  } else {
    setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
  }

  setApiKeyButton.addEventListener("click", () => {
    // multiModalで "APIキー設定" を開く
    let tempApiKey = window.apiKey || "";
    multiModal.open({
      title: "APIキー設定",
      contentHtml: `
        <div style="margin-bottom:10px;">
          <input type="text" id="temp-api-key-input" 
                 placeholder="APIキーを入力" 
                 style="width:100%; padding:8px;" 
                 value="${DOMPurify.sanitize(tempApiKey)}"
          />
        </div>
        <div style="padding:15px; margin-bottom:15px; background-color:#57575766;">
          <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: #fff;">
            こちら(OpenAIのページに飛びます)
          </a> から取得できます。<br>
          <a id="open-instructions-link" href="#" style="color: #fff; position: relative;">もっと詳しい説明はこちら</a>
        </div>
      `,
      appearanceType: "center",
      showCloseButton: true,
      closeOnOutsideClick: true,
      // 追加ボタン: 「クリア」
      additionalButtons: [
        {
          label: "クリア",
          onClick: () => {
            // "APIキークリア" の確認
            multiModal.open({
              title: "APIキーのクリア",
              contentHtml: "<p>APIキーをクリアすると操作ができなくなります。よろしいですか？</p>",
              showCloseButton: true,
              appearanceType: "center",
              closeOnOutsideClick: true,
              okLabel: "OK",
              cancelLabel: "キャンセル",
              onOk: () => {
                localStorage.removeItem("apiKey");
                window.apiKey = "";
                setApiKeyButton.textContent = "APIキー設定";
                showToast("APIキーをクリアしました。");
              }
            });
          }
        }
      ],
      cancelLabel: "閉じる",
      okLabel: "OK",
      // ★ 修正ポイント: onOpen でモーダル生成後にリンクへイベント付与
      onOpen: () => {
        setTimeout(() => {
          const link = document.getElementById("open-instructions-link");
          if (link) {
            link.addEventListener("click", (e) => {
              console.log("クリック！");
              e.preventDefault();
              // APIキー取得方法モーダルを更に別モーダルで開く
              multiModal.open({
                title: "APIキーの取得方法",
                contentHtml: `
                  <p>OpenAIの公式サイトからAPIキーを取得する簡単な手順です。</p>
                  <ol style="text-align:left; margin-bottom:20px; line-height:1.8;">
                    <li><a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" style="color: #fff;">
                      こちらの「API Keys」設定ページ</a>へ移動します。</li>
                    <li>[Create new secret key]をクリックし、新しいキーを作成します。</li>
                    <li>表示されたキーをコピーし、このアプリの「APIキーを入力」に貼り付けてください。</li>
                  </ol>
                `,
                showCloseButton: true,
                appearanceType: "center",
                closeOnOutsideClick: true,
                cancelLabel: "閉じる"
              });
            });
          }
        }, 0);
      },
      onOk: () => {
        const inputEl = document.getElementById("temp-api-key-input");
        if (!inputEl) return;
        const val = inputEl.value.trim();
        if (val) {
          localStorage.setItem("apiKey", val);
          window.apiKey = val;
          setApiKeyButton.innerHTML = `<span class="iconmoon icon-key"></span>`;
          showToast("APIキーを設定しました。");
        }
      },
      onCancel: () => { /* 何もしない */ }
    });
  });

  document.getElementById("clear-character-btn").addEventListener("click", async () => {
    multiModal.open({
      title: "全エレメントをクリア",
      contentHtml: "<p>エレメント情報をクリアします。よろしいですか？</p>",
      showCloseButton: true,
      appearanceType: "center",
      closeOnOutsideClick: true,
      okLabel: "OK",
      cancelLabel: "キャンセル",
      onOk: async () => {
        window.characterData = [];
        await saveCharacterDataToIndexedDB(window.characterData);
        showToast("エレメント情報をクリアしました。");
      }
    });
  });

  document.getElementById("show-warehouse-btn").addEventListener("click", () => {
    showWarehouseModal("menu");
  });

  document.getElementById("character-create").addEventListener("click", () => {
    window.location.href = "characterCreate.html";
  });

  document.getElementById("party-list").addEventListener("click", () => {
    window.location.href = "partyList.html";
  });

  document.getElementById("start-new-scenario-button").addEventListener("click", () => {
    window.location.href = "scenarioWizard.html";
  });

  // 「本棚」ボタン(全シナリオ一覧へ飛ぶもの)
  document.getElementById("show-bookshelf-btn").addEventListener("click", () => {
    window.location.href = "bookshelf.html";
  });

  // 「非表示を表示する」チェックボックスのイベント
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  if (showHiddenCheckbox) {
    // クリックされたとき、アコーディオンへの伝搬を止める
    showHiddenCheckbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    // チェック状態が変わったら差分更新
    showHiddenCheckbox.addEventListener("change", () => {
      const showHidden = showHiddenCheckbox.checked;
      applyScenarioFilter(showHidden);
    });
  }
}

/** アコーディオンの展開状態管理 */
function initAccordion() {
  const header = document.getElementById("ongoing-scenarios-header");
  const content = document.getElementById("ongoing-scenarios-content");
  if (!header || !content) return;

  // 前回の開閉状態を復元
  const savedState = localStorage.getItem("ongoingScenariosAccordionState");
  if (savedState === "open") {
    content.classList.add("open");
  }

  // ヘッダクリックで開閉トグル
  header.addEventListener("click", (e) => {
    // チェックボックス or そのラベルがクリックされた場合は開閉しない
    if (
      e.target.closest("#show-hidden-scenarios") ||
      e.target.closest("label[for='show-hidden-scenarios']")
    ) {
      return;
    }
    // 開閉
    content.classList.toggle("open");
    if (content.classList.contains("open")) {
      localStorage.setItem("ongoingScenariosAccordionState", "open");
    } else {
      localStorage.setItem("ongoingScenariosAccordionState", "closed");
    }
  });
}
