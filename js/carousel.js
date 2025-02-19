function initCarousel() {
  const track = document.querySelector(".carousel-track");
  if (!track) return;

  let cells = Array.from(track.querySelectorAll(".carousel-cell"));
  if (cells.length < 1) return;

  const tabBtns = Array.from(document.querySelectorAll(".carousel-tab"));
  const viewport = document.querySelector(".carousel-viewport");

  // 1) 先頭と末尾のクローンを作る
  const firstClone = cells[0].cloneNode(true);
  const lastClone = cells[cells.length - 1].cloneNode(true);
  track.appendChild(firstClone);
  track.insertBefore(lastClone, track.firstElementChild);

  // 2) 再度セル一覧を取得 (クローン含む)
  let allCells = Array.from(track.querySelectorAll(".carousel-cell"));

  // 初期インデックス: 先頭クローンの直後(=1)
  let currentIndex = 1;
  let cellWidth = 0; // 後で測る
  let currentTranslate = 0;
  let prevTranslate = 0;
  let isDragging = false;
  let startX = 0;
  let animationId = 0;

  // 3) タブボタンクリックで移動
  tabBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      // i番目の本物セルへ
      // ただしクローン1枚目が先にあるため、実際は i+1
      currentIndex = i + 1;
      setPositionByIndex(true);
      updateActiveTab(i);
    });
  });

  function updateActiveTab(realIndex) {
    tabBtns.forEach(t => t.classList.remove("active"));
    if (tabBtns[realIndex]) tabBtns[realIndex].classList.add("active");
  }

  // 4) ウィンドウサイズ or レイアウト完了後に幅を測定
  function updateCellWidth() {
    // allCells[0] は先頭クローン。幅測るだけなのでどれでもOK
    const anyCell = allCells[0];
    if (!anyCell) return;
    cellWidth = anyCell.offsetWidth;
    if (!cellWidth) {
      // offsetWidthが0の場合、暫定対策: requestAnimationFrame等で再試行
      requestAnimationFrame(updateCellWidth);
      return;
    }
    setPositionByIndex(false);
  }

  window.addEventListener("resize", updateCellWidth);
  updateCellWidth(); // 初回

  // 5) ドラッグ / スワイプ
  track.addEventListener("pointerdown", dragStart);
  track.addEventListener("pointermove", dragAction);
  track.addEventListener("pointerup", dragEnd);
  track.addEventListener("pointercancel", dragEnd);
  track.addEventListener("pointerleave", dragEnd);

  // （または mouse/touch イベントでも可）

  function dragStart(e) {
    // textareaやbutton上でドラッグ開始されたらカルーセル移動はしない
    const tag = e.target.tagName.toLowerCase();
    if (["textarea", "input", "button", "select"].includes(tag)) {
      return;
    }
    isDragging = true;
    track.style.transition = "none";
    startX = e.clientX;
    prevTranslate = currentTranslate;
    animationId = requestAnimationFrame(animation);
  }

  function dragAction(e) {
    if (!isDragging) return;
    const currentX = e.clientX;
    const diff = currentX - startX;
    currentTranslate = prevTranslate + diff;
    e.preventDefault(); // スクロール制御
  }

  function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    cancelAnimationFrame(animationId);

    // スワイプ量
    const movedBy = currentTranslate - prevTranslate;
    const threshold = cellWidth * 0.1;
    if (movedBy < -threshold) {
      currentIndex++;
    } else if (movedBy > threshold) {
      currentIndex--;
    }
    setPositionByIndex(true);
  }

  function animation() {
    track.style.transform = `translateX(${currentTranslate}px)`;
    if (isDragging) requestAnimationFrame(animation);
  }

  // 6) インデックス位置に応じて移動 (スナップ)
  function setPositionByIndex(smooth) {
    if (smooth) {
      track.style.transition = "transform 0.3s";
    } else {
      track.style.transition = "none";
    }
    currentTranslate = -cellWidth * currentIndex;
    track.style.transform = `translateX(${currentTranslate}px)`;
  }

  // 7) 無限ループ: transition終了時に端かどうかチェック
  track.addEventListener("transitionend", () => {
    if (!cellWidth) return;

    // 先頭クローン(index=0)にいるなら、本物の末尾へ飛ぶ
    if (currentIndex === 0) {
      track.style.transition = "none";
      currentIndex = cells.length; // 本物の末尾index
      currentTranslate = -cellWidth * currentIndex;
      track.style.transform = `translateX(${currentTranslate}px)`;
    }
    // 末尾クローン(index=allCells.length-1)にいるなら、本物の先頭へ飛ぶ
    else if (currentIndex === allCells.length - 1) {
      track.style.transition = "none";
      currentIndex = 1; // 本物の先頭index
      currentTranslate = -cellWidth * currentIndex;
      track.style.transform = `translateX(${currentTranslate}px)`;
    }

    // タブの見た目を更新
    // 本物のセルは 1～cells.length なので、-1 してタブインデックスに
    let realIndex = currentIndex - 1;
    if (realIndex < 0) realIndex = 0;
    if (realIndex >= cells.length) realIndex = cells.length - 1;
    updateActiveTab(realIndex);
  });
}

// 複製セルに含まれるIDを削除
function removeDuplicateIDs() {
  // Flickityや独自ライブラリなどで複製されたセル（.is-cloned など）を探す
  const clonedCells = document.querySelectorAll(".carousel-cell.is-cloned");
  // クローンされたセル配下にいるすべての「id属性を持つ要素」からidを外す
  clonedCells.forEach(cell => {
    const elemsWithId = cell.querySelectorAll("[id]");
    elemsWithId.forEach(el => {
      el.removeAttribute("id");
    });
  });
}