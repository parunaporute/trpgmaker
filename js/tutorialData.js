window.tutorials = [
  {
    id: "story1",
    title: "メイン画面のボタン説明",
    steps: [
      {
        type: "page",
        match: "index.html",
        message: "indexページのチュートリアル開始",
        subSteps: [
          {
            message: "ガチャボタン: キャラ生成画面へ移動します。",
            highlightSelector: "#character-create"
          },
          {
            message: "パーティボタン: 編成したキャラを管理します。",
            highlightSelector: "#party-list"
          },
          {
            message: "倉庫: ガチャ生成物をまとめて確認する画面。",
            highlightSelector: "#show-warehouse-btn"
          },
          {
            message: "あなたの分身: アバターを設定できます。",
            highlightSelector: "#you-avatar-btn"
          },
          {
            message: "本棚: シナリオのアップロード・管理を行います。",
            highlightSelector: "#show-bookshelf-btn"
          },
          {
            message: "新しいシナリオ: TRPGシナリオ作成ウィザードへ移動。",
            highlightSelector: "#start-new-scenario-button"
          }
        ]
      }
    ]
  }
];
