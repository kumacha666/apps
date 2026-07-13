/**
 * LifeLog フィードバックフォーム自動作成スクリプト
 *
 * セットアップ (初回のみ):
 *   npm install -g @google/clasp
 *   clasp login
 *   cd tools && clasp create --title "LifeLog Feedback" --type standalone
 *
 * 反映:
 *   cd tools && clasp push
 *   → GASエディタで createFeedbackForm を実行
 *   → ログに回答用URL・編集URL・集計URLが表示される
 */

function createFeedbackForm() {
  const form = FormApp.create('LifeLog フィードバック');
  form.setDescription(
    'LifeLogをお使いいただきありがとうございます！\n' +
    'アプリの改善のため、ぜひご意見をお聞かせください。'
  );
  form.setConfirmationMessage('ご回答ありがとうございます！いただいたフィードバックは今後の改善に活用させていただきます。');

  // Q1: 満足度（5段階）
  form.addScaleItem()
    .setTitle('このアプリの満足度を教えてください')
    .setBounds(1, 5)
    .setLabels('不満', '満足')
    .setRequired(true);

  // Q2: 使っているカテゴリ
  form.addCheckboxItem()
    .setTitle('どんなカテゴリを使っていますか？（複数選択可）')
    .setChoiceValues([
      'ファッション・コーディネート',
      '食事',
      'サプリメント',
      '運動',
      'ボディコンディション',
      'お買い物・支出',
      'その他（カスタム）'
    ])
    .setRequired(false);

  // Q3: 使いにくい点
  form.addParagraphTextItem()
    .setTitle('使いにくいと感じた点はありますか？')
    .setRequired(false);

  // Q4: 欲しい機能
  form.addParagraphTextItem()
    .setTitle('欲しい機能や改善の要望があれば教えてください')
    .setRequired(false);

  // Q5: 総合コメント
  form.addParagraphTextItem()
    .setTitle('その他、何でもお気軽にどうぞ')
    .setRequired(false);

  // 結果をログに出力
  const editUrl = form.getEditUrl();
  const publishedUrl = form.getPublishedUrl();
  const summaryUrl = form.getSummaryUrl();

  Logger.log('=== フォーム作成完了 ===');
  Logger.log('回答用URL: ' + publishedUrl);
  Logger.log('編集URL:   ' + editUrl);
  Logger.log('集計URL:   ' + summaryUrl);

  return {
    published: publishedUrl,
    edit: editUrl,
    summary: summaryUrl
  };
}
