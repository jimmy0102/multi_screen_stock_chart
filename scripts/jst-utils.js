#!/usr/bin/env node

// JST（日本標準時）専用の日付ユーティリティ
// UTCのtoISOString()に依存しない実装

const { DateTime } = require('luxon');

function toJstDateTime(date) {
  if (date instanceof Date) {
    return DateTime.fromJSDate(date, { zone: 'Asia/Tokyo' });
  }

  if (typeof date === 'string') {
    return DateTime.fromISO(date, { zone: 'Asia/Tokyo' });
  }

  return DateTime.fromJSDate(new Date(date), { zone: 'Asia/Tokyo' });
}

/**
 * 任意の日付をJSTのYYYY-MM-DD形式に変換
 * @param {string|Date} date - 変換する日付
 * @returns {string} YYYY-MM-DD形式の日付文字列
 */
function toJstYmd(date) {
  return toJstDateTime(date).toFormat('yyyy-LL-dd');
}

/**
 * 株価データのバリデーション（0価格・負値・整合性チェック）
 * @param {Object} record - 株価レコード {open, high, low, close, volume}
 * @returns {boolean} 有効なデータかどうか
 */
function isValidBar(record) {
  const { open, high, low, close, volume } = record;
  
  // 基本的な正値チェック
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return false;
  }
  
  // OHLC整合性チェック
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return false;
  }
  
  // ボリュームは0でもOK（休場日前後など）
  if (volume < 0) {
    return false;
  }
  
  return true;
}


/**
 * JST基準で昨日の日付を取得
 * @returns {string} YYYY-MM-DD形式
 */
function getJstYesterday() {
  return DateTime.now()
    .setZone('Asia/Tokyo')
    .minus({ days: 1 })
    .toFormat('yyyy-LL-dd');
}

/**
 * JST基準で現在週の開始日（日曜日）を取得
 * @returns {string} YYYY-MM-DD形式
 */
function getJstCurrentWeekStart() {
  const now = DateTime.now().setZone('Asia/Tokyo');
  const sunday = now.minus({ days: now.weekday % 7 });
  return sunday.toFormat('yyyy-LL-dd');
}

/**
 * JST基準で現在月の開始日を取得
 * @returns {string} YYYY-MM-DD形式
 */
function getJstCurrentMonthStart() {
  return DateTime.now()
    .setZone('Asia/Tokyo')
    .startOf('month')
    .toFormat('yyyy-LL-dd');
}

function getJstToday() {
  return DateTime.now()
    .setZone('Asia/Tokyo')
    .toFormat('yyyy-LL-dd');
}

function isPotentialTradingDay(date) {
  const dt = toJstDateTime(date);
  // 土日は除外（1=月曜, 6=土曜, 7=日曜）
  return dt.weekday >= 1 && dt.weekday <= 5;
}

/**
 * JST基準で指定日が土曜日かどうかを判定
 * @param {string|Date} date - 判定する日付
 * @returns {boolean} 土曜日かどうか
 */
function isJstSaturday(date) {
  return toJstDateTime(date).weekday === 6; // Luxonでは月曜=1, 土曜=6
}

/**
 * JST基準で指定日が月初（1日）かどうかを判定
 * @param {string|Date} date - 判定する日付
 * @returns {boolean} 月初かどうか
 */
function isJstFirstOfMonth(date) {
  return toJstDateTime(date).day === 1;
}

/**
 * JST基準で指定日を含む週の開始日（日曜日）を取得
 * @param {string|Date} date - 基準日
 * @returns {string} YYYY-MM-DD形式
 */
function getJstWeekStart(date) {
  const dt = toJstDateTime(date);
  const sunday = dt.minus({ days: dt.weekday % 7 });
  return sunday.toFormat('yyyy-LL-dd');
}

/**
 * JST基準で指定日を含む月の開始日を取得
 * @param {string|Date} date - 基準日
 * @returns {string} YYYY-MM-DD形式
 */
function getJstMonthStart(date) {
  return toJstDateTime(date).startOf('month').toFormat('yyyy-LL-dd');
}

function getJstWeekEndFromStart(weekStart) {
  return toJstDateTime(weekStart)
    .startOf('day')
    .plus({ days: 6 })
    .toFormat('yyyy-LL-dd');
}

function getJstMonthEndFromStart(monthStart) {
  return toJstDateTime(monthStart)
    .startOf('day')
    .endOf('month')
    .toFormat('yyyy-LL-dd');
}


module.exports = {
  toJstDateTime,
  toJstYmd,
  isValidBar,
  getJstToday,
  getJstYesterday,
  getJstCurrentWeekStart,
  getJstCurrentMonthStart,
  isJstSaturday,
  isJstFirstOfMonth,
  getJstWeekStart,
  getJstMonthStart,
  getJstWeekEndFromStart,
  getJstMonthEndFromStart,
  isPotentialTradingDay
};
