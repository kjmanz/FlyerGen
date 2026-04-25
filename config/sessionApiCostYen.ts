/**
 * セッション表示用の「だいたい」目安（日本円）。
 * 実際の請求は各プロバイダのレート・トークン・画像解像度で変動します。
 * 必要に応じて数値だけ差し替えてください。
 */
export const SESSION_API_COST_DISCLAIMER =
  '参考値です。税・為替・料金改定・トークン量で実額と異なります。PDF 書き出しはブラウザ内処理のため API 料金はかかりません。';

/** 概算（円）。小数のキーは加算後にまとめて丸めます。 */
export const SESSION_API_COST_YEN = {
  /** チラシ画像 1 枚あたり（生成ジョブ完了時、出力枚数分） */
  flyerImageOut: 6,
  /** 裏面: 商品一覧からのタグ生成 1 回 */
  backTagFromProducts: 0.4,
  /** 品質チェック 1 画像あたり */
  qualityCheck: 0.4,
  /** キャンペーン文の AI 生成 1 回 */
  campaignAi: 0.15,
  /** 履歴の画像タグ一括: 1 画像あたり */
  tagFromImage: 0.35,
  /** Replicate によるアップスケール 1 回 */
  replicateUpscale: 0.3,
  /** Gemini 4K 再生成 1 回 */
  regen4k: 8,
  /** 範囲指定編集 1 回 */
  editImage: 5,
  /** 文字消去 1 回 */
  removeText: 4,
  /** 品番スペック検索 1 回 */
  productSpecSearch: 0.15,
} as const;
