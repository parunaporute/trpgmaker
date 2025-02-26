(function () {
  // -------------------------------------------
  // A) スコープ内変数
  // -------------------------------------------
  let overlayEl = null;
  let dialogEl = null;
  let modalCheckInterval = null;

  // -------------------------------------------
  // B) DOMContentLoaded 後に開始
  // -------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    createBaseElements();  // オーバーレイ & ダイアログを生成 or 再利用
    await runTutorials();  // チュートリアル全体の開始
  });

  // -------------------------------------------
  // C) ベース要素生成
  // -------------------------------------------
  function createBaseElements() {
    // 既に存在すれば使い回し
    overlayEl = document.getElementById("tutorial-overlay");
    dialogEl = document.getElementById("tutorial-dialog");
    if (overlayEl && dialogEl) return;

    // (1) オーバーレイ
    overlayEl = document.createElement("div");
    overlayEl.id = "tutorial-overlay";
    overlayEl.classList.add("tutorial-overlay");
    // pointer-events: none; にして、下の要素操作を許可
    overlayEl.style.pointerEvents = "none";
    document.body.appendChild(overlayEl);

    // (2) ダイアログ
    dialogEl = document.createElement("div");
    dialogEl.id = "tutorial-dialog";
    dialogEl.classList.add("tutorial-dialog");
    // ダイアログ上は pointer-events: auto; でクリック可
    dialogEl.style.pointerEvents = "auto";
    document.body.appendChild(dialogEl);
  }

  // -------------------------------------------
  // D) チュートリアル全体の起動
  // -------------------------------------------
  async function runTutorials() {
    if (!window.tutorials || !Array.isArray(window.tutorials)) {
      console.warn("No tutorials found.");
      return;
    }

    // URLパラメータに forceTutorial があれば強制実行
    const forcedTutorialId = getQueryParam("forceTutorial");
    if (forcedTutorialId) {
      const target = window.tutorials.find(t => t.id === forcedTutorialId);
      if (target) {
        await runTutorialIfMatchPage(target);
      }
      return;
    }

    // 通常実行: 現在ページにマッチ & 未完了のストーリーを順番に
    const currentPage = getCurrentPageName();
    const pageTutorials = window.tutorials.filter(story =>
      story.steps.some(step => step.type === "page" && step.match === currentPage)
    );

    // ID末尾の数字が小さい順にソート
    pageTutorials.sort((a, b) => getStoryIdNumber(a.id) - getStoryIdNumber(b.id));

    for (const story of pageTutorials) {
      const isCompleted = localStorage.getItem("completeStory_" + story.id) === "true";
      if (!isCompleted) {
        await runTutorialIfMatchPage(story);
        break; // 1つ実行したらループ抜け
      }
    }
  }

  async function runTutorialIfMatchPage(story) {
    const currentPage = getCurrentPageName();
    const hasStepForPage = story.steps.some(
      step => step.type === "page" && step.match === currentPage
    );
    if (hasStepForPage) {
      await startTutorialSteps(story);
    }
  }

  // -------------------------------------------
  // E) チュートリアルステップ開始
  // -------------------------------------------
  async function startTutorialSteps(story) {
    // 1) 現在ページ用のstepを特定
    const step = story.steps.find(s => s.type === "page" && s.match === getCurrentPageName());
    if (!step) return;

    // 2) この step の「pageStepIndex」を特定する（複数stepの中で何番目か）
    //    ※ stepIndex は story.steps.indexOf(step) でもOK、ただし type===page で絞るなら別途filterする
    const pageSteps = story.steps.filter(s => s.type === "page");
    const currentIndex = pageSteps.indexOf(step);

    // 3) 前の step がある場合、前の step が完了しているかをチェック
    if (currentIndex > 0) {
      const prevStep = pageSteps[currentIndex - 1];
      if (!isPageStepDone(story.id, prevStep)) {
        // 前stepが完了していない → 今回のstepはまだ実行しない
        console.log(`[Tutorial] The previous page-step is not done yet. Skipping tutorial for this page.`);
        return;
      }
    }

    // 4) 既にこの step が終わっていたら表示しない
    if (isPageStepDone(story.id, step)) {
      console.log(`[Tutorial] This page-step is already done. Skipping.`);
      return;
    }

    // 5) subStepsが無ければ単発表示
    if (!step.subSteps || step.subSteps.length === 0) {
      const result = await showDialog(story.title, step.message, null);
      // OK or skipCheck なら、page-step終了と判断
      if (result.skipCheck || result.ok) {
        markPageStepDone(story, step);
      }
      return;
    }

    // 6) subSteps がある場合、順番に表示
    for (const sub of step.subSteps) {
      const result = await showDialog(story.title, sub.message, sub);
      if (result.skipCheck) {
        // 「次は表示しない」→ ここでチュートリアル全体を強制完了扱い
        localStorage.setItem("completeStory_" + story.id, "true");
        return;
      }
      if (!result.ok) {
        // キャンセル等 → 途中離脱 (pageStep完了せず終了)
        return;
      }
    }

    // 7) このページのsubSteps完了 → page-step完了
    markPageStepDone(story, step);
  }

  // -------------------------------------------
  // F) page-stepの完了フラグ管理
  // -------------------------------------------
  function isPageStepDone(storyId, step) {
    const stepIndex = getPageStepIndex(storyId, step);
    if (stepIndex < 0) return false; // stepが見つからない
    const key = `pageStepDone_${storyId}_${stepIndex}`;
    return localStorage.getItem(key) === "true";
  }

  function markPageStepDone(story, step) {
    const stepIndex = getPageStepIndex(story.id, step);
    if (stepIndex < 0) return;
    // 今のpage-step完了
    localStorage.setItem(`pageStepDone_${story.id}_${stepIndex}`, "true");

    // もしこれが story.steps のうち最後のtype===page だったら → 全体完了
    const pageSteps = story.steps.filter(s => s.type === "page");
    const currentIdx = pageSteps.indexOf(step);
    if (currentIdx === pageSteps.length - 1) {
      localStorage.setItem(`completeStory_${story.id}`, "true");
      console.log(`[Tutorial] story ${story.id} is fully completed.`);
    } else {
      console.log(`[Tutorial] page-step index=${currentIdx} done. More steps remain.`);
    }
  }

  function getPageStepIndex(storyId, step) {
    // story内で type==="page" のstepリストの何番目か
    // あるいは story.steps.indexOf(step) でも可
    const pageSteps = (window.tutorials.find(t => t.id === storyId) || {}).steps?.filter(s => s.type === "page") || [];
    return pageSteps.indexOf(step);
  }

  // -------------------------------------------
  // G) ダイアログ表示 (Promise で完了を返す)
  // -------------------------------------------
  function showDialog(title, message, subStep) {
    return new Promise((resolve) => {
      // ダイアログ HTML を組み立て
      dialogEl.innerHTML = buildDialogHTML(title, message, subStep);

      // 表示開始
      overlayEl.style.display = "block";
      dialogEl.style.display = "block";
      dialogEl.style.opacity = "0";

      // ボタン類
      const nextBtn = dialogEl.querySelector("#tutorial-next-btn");
      const cancelBtn = dialogEl.querySelector("#tutorial-cancel-btn");
      const skipCheck = dialogEl.querySelector("#tutorial-skip-checkbox");

      // 「完了ボタン」要素 (completeステップ用)
      const completeBtn = dialogEl.querySelector("#tutorial-complete-btn");

      // 「OKボタン非表示」指定なら
      if (subStep?.removeOkButton && nextBtn) {
        nextBtn.style.display = "none";
      }

      // もし「完了ボタン」(complete)があるなら、そのクリック時に resolve({ok:true}) して終わる
      if (completeBtn) {
        completeBtn.addEventListener("click", () => closeDialog({
          ok: true,
          cancel: false,
          skipCheck: false
        }));
      }

      // イベント
      if (nextBtn) {
        nextBtn.addEventListener("click", () => closeDialog({
          ok: true,
          cancel: false,
          skipCheck: !!skipCheck?.checked
        }));
      }
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => closeDialog({
          ok: false,
          cancel: true,
          skipCheck: !!skipCheck?.checked
        }));
      }

      // ハイライト関連
      let highlightEl = null;
      if (subStep?.highlightSelector) {
        highlightEl = document.querySelector(subStep.highlightSelector);
        if (highlightEl) {
          highlightEl.classList.add("tutorial-highlight");
          highlightEl.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
          waitForScrollEnd(highlightEl, () => {
            positionDialog(dialogEl, highlightEl);
            fadeInDialog();
          });
        } else {
          centerDialog(dialogEl);
          fadeInDialog();
        }
      } else {
        centerDialog(dialogEl);
        fadeInDialog();
      }

      // 特定要素クリック待ち
      let clickHandler = null;
      if (subStep?.waitForClickOn) {
        const targetEl = document.querySelector(subStep.waitForClickOn);
        if (targetEl) {
          clickHandler = () => {
            closeDialog({
              ok: true,
              cancel: false,
              skipCheck: !!skipCheck?.checked
            });
          };
          targetEl.addEventListener("click", clickHandler);
        }
      }

      // ここではモーダル監視はオフにした例
      //startModalCheck();

      function closeDialog(action) {
        // ハイライト解除
        if (highlightEl) {
          highlightEl.classList.remove("tutorial-highlight");
        }
        // クリック待ち解除
        if (clickHandler && subStep?.waitForClickOn) {
          const tEl = document.querySelector(subStep.waitForClickOn);
          tEl?.removeEventListener("click", clickHandler);
        }

        // 非表示
        dialogEl.style.display = "none";
        dialogEl.style.opacity = "0";
        overlayEl.style.display = "none";
        stopModalCheck();

        resolve(action);
      }

      function fadeInDialog() {
        requestAnimationFrame(() => {
          dialogEl.style.opacity = "1";
        });
      }
    });
  }

  function buildDialogHTML(title, message, subStep) {
    // もし subStep?.complete が true なら、完了ボタンのみ表示のレイアウトにする
    if (subStep?.complete) {
      return `
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
        <button id="tutorial-complete-btn" style="min-width:6rem;">完了</button>
      </div>
    `;
    }
    return `
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div style="margin:8px 0; display:flex; align-items:center;">
        <input type="checkbox" id="tutorial-skip-checkbox" />
        <label for="tutorial-skip-checkbox">次は表示しない</label>
      </div>
      <div style="display:flex; justify-content:center; gap:10px;">
        <button id="tutorial-next-btn">次へ</button>
        <button id="tutorial-cancel-btn">キャンセル</button>
      </div>
    `;
  }

  // -------------------------------------------
  // H) モーダル監視 (任意)
  // -------------------------------------------
  function startModalCheck() {
    stopModalCheck();
    modalCheckInterval = setInterval(() => {
      const isModalOpen = !!document.querySelector(".modal.active");
      // tutorualOverlayは常にクリック透過にしたい場合は "none" で固定
      overlayEl.style.pointerEvents = isModalOpen ? "none" : "none";
    }, 300);
  }

  function stopModalCheck() {
    if (modalCheckInterval) {
      clearInterval(modalCheckInterval);
      modalCheckInterval = null;
    }
  }

  // -------------------------------------------
  // I) 位置調整・ユーティリティ
  // -------------------------------------------
  function positionDialog(dialog, highlightEl) {
    const hlRect = highlightEl.getBoundingClientRect();
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;

    // 下に配置できるか判定
    const spaceBelow = window.innerHeight - hlRect.bottom;
    let topPos;
    if (spaceBelow > dh + 10) {
      topPos = hlRect.bottom + 10;
    } else {
      topPos = hlRect.top - dh - 10;
    }
    if (topPos < 0) topPos = 0;

    let leftPos = hlRect.left;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
    }
    if (leftPos < 0) leftPos = 0;

    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";

    // 被りがあれば横ずらし
    const boxRect = dialog.getBoundingClientRect();
    if (checkOverlap(hlRect, boxRect)) {
      shiftHorizontally(dialog, hlRect, boxRect);
      clipToViewport(dialog);
    } else {
      clipToViewport(dialog);
    }
  }

  function checkOverlap(r1, r2) {
    const overlapX = (r1.left < r2.right) && (r1.right > r2.left);
    const overlapY = (r1.top < r2.bottom) && (r1.bottom > r2.top);
    return overlapX && overlapY;
  }

  function shiftHorizontally(dialog, hlRect, boxRect) {
    const highlightCenterX = (hlRect.left + hlRect.right) / 2;
    const screenCenterX = window.innerWidth / 2;
    const dw = boxRect.width;
    let newLeft;
    if (highlightCenterX < screenCenterX) {
      newLeft = hlRect.right + 10;
    } else {
      newLeft = hlRect.left - dw - 10;
    }
    if (newLeft < 0) newLeft = 0;
    if (newLeft + dw > window.innerWidth) {
      newLeft = window.innerWidth - dw - 10;
    }
    dialog.style.left = newLeft + "px";
  }

  function clipToViewport(dialog) {
    const boxRect = dialog.getBoundingClientRect();
    let topPos = boxRect.top;
    let leftPos = boxRect.left;
    const dw = boxRect.width;
    const dh = boxRect.height;

    if (topPos < 0) topPos = 0;
    if (topPos + dh > window.innerHeight) {
      topPos = window.innerHeight - dh - 10;
      if (topPos < 0) topPos = 0;
    }
    if (leftPos < 0) leftPos = 0;
    if (leftPos + dw > window.innerWidth) {
      leftPos = window.innerWidth - dw - 10;
      if (leftPos < 0) leftPos = 0;
    }
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  function centerDialog(dialog) {
    const dw = dialog.offsetWidth;
    const dh = dialog.offsetHeight;
    let topPos = (window.innerHeight - dh) / 2;
    let leftPos = (window.innerWidth - dw) / 2;
    if (topPos < 0) topPos = 0;
    if (leftPos < 0) leftPos = 0;
    dialog.style.top = topPos + "px";
    dialog.style.left = leftPos + "px";
  }

  function waitForScrollEnd(el, callback) {
    let stableCount = 0;
    let lastTop = null;
    function step() {
      const rect = el.getBoundingClientRect();
      const currentTop = rect.top;
      if (lastTop !== null && Math.abs(currentTop - lastTop) < 0.5) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTop = currentTop;
      if (stableCount > 5) {
        callback();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // -------------------------------------------
  // J) 細かいユーティリティ
  // -------------------------------------------
  function getCurrentPageName() {
    return location.pathname.split("/").pop() || "";
  }
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }
  function getStoryIdNumber(storyId) {
    const match = storyId.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 999999;
  }
  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
