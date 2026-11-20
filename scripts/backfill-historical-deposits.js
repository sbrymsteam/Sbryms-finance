require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { Timestamp } = require('firebase-admin/firestore');
const { getAdminServices } = require('../api/_push-common');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEGACY_FEE_END_YEAR = 2024;
const IMPORT_START_YEAR = 2022;
const IMPORT_START_MONTH = 6;
const IMPORT_BATCH_SIZE = 150;

function getDhakaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function getDueDate(year, month, dateRange) {
  const day = dateRange === '1-15' ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    day,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

function buildPeriods(today) {
  const periods = [];
  for (let year = IMPORT_START_YEAR; year <= today.year; year += 1) {
    const firstMonth = year === IMPORT_START_YEAR ? IMPORT_START_MONTH : 1;
    for (let month = firstMonth; month <= 12; month += 1) {
      const ranges = year === IMPORT_START_YEAR && month === IMPORT_START_MONTH
        ? ['16-end']
        : ['1-15', '16-end'];
      for (const dateRange of ranges) {
        const dueDate = getDueDate(year, month, dateRange);
        if (year > LEGACY_FEE_END_YEAR && (year > today.year || dueDate.day > today.day && year === today.year && month === today.month)) {
          continue;
        }
        if (year > today.year || (year === today.year && month > today.month)) continue;
        periods.push({
          year,
          month,
          dateRange,
          date: `${MONTHS[month - 1]} ${dateRange === '1-15' ? '1-15' : `16-${dueDate.day}`}`,
          dueDate: dueDate.iso,
          fee: year <= LEGACY_FEE_END_YEAR ? 50 : 100
        });
      }
    }
  }
  return periods;
}

function normalizeRange(value) {
  return String(value || '').match(/(?:^|\D)16(?:\D|$)/) ? '16-end' : '1-15';
}

function getMonthFromDetail(detail, fallback) {
  const month = Number(detail.month);
  if (Number.isInteger(month) && month >= 1 && month <= 12) return month;
  const label = String(detail.date || '').split(' ')[0];
  const index = MONTHS.findIndex(item => item.toLowerCase() === label.toLowerCase());
  return index >= 0 ? index + 1 : fallback;
}

function getPaymentPeriodKeys(payment, uid) {
  const keys = new Set();
  const details = Array.isArray(payment.coveredDueDetails) ? payment.coveredDueDetails : [];
  details.forEach(detail => {
    const year = Number(detail.year || payment.year);
    const month = getMonthFromDetail(detail, Number(payment.month));
    const dateRange = normalizeRange(detail.dateRange || detail.date);
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      keys.add(`${uid}_${year}_${month}_${dateRange}`);
    }
  });
  if (Number.isInteger(Number(payment.year)) && Number.isInteger(Number(payment.month))) {
    keys.add(`${uid}_${Number(payment.year)}_${Number(payment.month)}_${normalizeRange(payment.dateRange || payment.date)}`);
  }
  return keys;
}

async function getSnapshotsInChunks(db, references, chunkSize = 100) {
  const snapshots = [];
  for (let offset = 0; offset < references.length; offset += chunkSize) {
    snapshots.push(...await db.getAll(...references.slice(offset, offset + chunkSize)));
  }
  return snapshots;
}

function makePaymentId(uid, period) {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `HIST-${safeUid}-${period.year}-${period.month}-${period.dateRange}`;
}

function makeWrites(user, period, paymentId, paidAt, existingPayment = {}) {
  const periodId = `${user.uid}_${period.year}_${period.month}_${period.dateRange}`;
  const daysLate = 0;
  const star = 'cross';
  const detail = {
    id: paymentId,
    date: period.date,
    year: period.year,
    month: period.month,
    dateRange: period.dateRange,
    fee: period.fee,
    fine: 0,
    total: period.fee,
    daysLate,
    status: 'Paid',
    paidAt,
    star,
    profileEmail: user.email,
    name: user.name
  };
  const payment = {
    ...existingPayment,
    id: paymentId,
    profile: user.email,
    profileEmail: user.email,
    profileUid: user.uid,
    profileName: user.name,
    year: period.year,
    month: period.month,
    dateRange: period.dateRange,
    date: period.date,
    fee: period.fee,
    fine: 0,
    total: period.fee,
    status: 'Paid',
    paidAt,
    paymentRecordId: paymentId,
    transactionId: existingPayment.transactionId || 'Historical deposit import',
    coveredDueDetails: [detail],
    createdAt: existingPayment.createdAt || paidAt
  };
  const publicSummary = {
    profileEmail: user.email,
    profileName: user.name,
    year: period.year,
    month: period.month,
    dateRange: period.dateRange,
    status: 'Paid',
    paymentId,
    fee: period.fee,
    fine: 0,
    total: period.fee,
    paidAt,
    daysLate,
    star,
    transactionId: payment.transactionId,
    dueDate: period.dueDate
  };
  const privateDetail = {
    userId: user.uid,
    profileEmail: user.email,
    profileName: user.name,
    year: period.year,
    month: period.month,
    dateRange: period.dateRange,
    status: 'Paid',
    fee: period.fee,
    fine: 0,
    total: period.fee,
    paidAt,
    daysLate,
    star,
    paymentId,
    updatedAt: paidAt,
    dueDate: period.dueDate
  };
  return { payment, publicSummary, privateDetail, periodId };
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--apply');
  if (unknownArgs.length) throw new Error(`Unknown argument: ${unknownArgs.join(' ')}`);

  const { db } = getAdminServices();
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs
    .map(document => {
      const data = document.data() || {};
      return {
        uid: document.id,
        email: String(data.email || data.emailAddress || '').trim().toLowerCase(),
        name: String(data.name || data.displayName || 'Member').trim() || 'Member'
      };
    })
    .filter(user => user.email.includes('@'));
  if (users.length !== 6) {
    throw new Error(`Expected exactly 6 Firebase member accounts, found ${users.length}; no records were changed.`);
  }

  const now = new Date();
  const paidAt = Timestamp.fromDate(now);
  const periods = buildPeriods(getDhakaDate(now));
  const targets = users.flatMap(user => periods.map(period => ({ user, period })));
  const paymentsByPeriod = new Map();
  for (const user of users) {
    const [byEmail, byProfile] = await Promise.all([
      db.collection('payments').where('profileEmail', '==', user.email).get(),
      db.collection('payments').where('profile', '==', user.email).get()
    ]);
    const paymentDocs = new Map([...byEmail.docs, ...byProfile.docs].map(document => [document.id, document]));
    for (const document of paymentDocs.values()) {
      const data = document.data() || {};
      getPaymentPeriodKeys(data, user.uid).forEach(key => {
        const matches = paymentsByPeriod.get(key) || [];
        matches.push({ ref: document.ref, data });
        paymentsByPeriod.set(key, matches);
      });
    }
  }

  const periodRefs = targets.flatMap(({ user, period }) => {
    const id = `${user.uid}_${period.year}_${period.month}_${period.dateRange}`;
    return [
      db.collection('deposit_periods').doc(id),
      db.collection('deposit_period_details').doc(id)
    ];
  });
  const periodSnapshots = await getSnapshotsInChunks(db, periodRefs);
  const periodData = new Map(periodSnapshots.map(snapshot => [snapshot.ref.path, snapshot.exists ? snapshot.data() : null]));
  const paymentRefsFromSummaries = periodSnapshots
    .filter(snapshot => snapshot.exists
      && snapshot.ref.parent.id === 'deposit_periods'
      && typeof snapshot.data().paymentId === 'string'
      && snapshot.data().paymentId)
    .map(snapshot => db.collection('payments').doc(snapshot.data().paymentId));
  const summaryPaymentSnapshots = await getSnapshotsInChunks(db, [...new Map(
    paymentRefsFromSummaries.map(reference => [reference.path, reference])
  ).values()]);
  const summaryPaymentsByPath = new Map(summaryPaymentSnapshots
    .filter(snapshot => snapshot.exists)
    .map(snapshot => [snapshot.ref.path, { ref: snapshot.ref, data: snapshot.data() || {} }]));
  const conflicts = [];
  const writes = [];

  for (const { user, period } of targets) {
    const periodId = `${user.uid}_${period.year}_${period.month}_${period.dateRange}`;
    const publicSummaryPath = db.collection('deposit_periods').doc(periodId).path;
    const publicSummary = periodData.get(publicSummaryPath);
    const summaryPayment = publicSummary && typeof publicSummary.paymentId === 'string'
      ? summaryPaymentsByPath.get(db.collection('payments').doc(publicSummary.paymentId).path)
      : null;
    const existingPayments = [...(paymentsByPeriod.get(periodId) || [])];
    if (summaryPayment && !existingPayments.some(payment => payment.ref.path === summaryPayment.ref.path)) {
      existingPayments.push(summaryPayment);
    }
    if (existingPayments.length > 1 || (existingPayments[0] && Array.isArray(existingPayments[0].data.coveredDueDetails)
      && existingPayments[0].data.coveredDueDetails.length > 1)) {
      conflicts.push(`${user.name}: ${period.date} ${period.year} has multiple or combined payment records`);
      continue;
    }
    const existingPayment = existingPayments[0] || null;
    if (existingPayment && String(existingPayment.data.profileEmail || existingPayment.data.profile || '').trim().toLowerCase() !== user.email) {
      conflicts.push(`${user.name}: ${period.date} ${period.year} points to a payment belonging to a different account`);
      continue;
    }
    const paymentId = existingPayment ? existingPayment.ref.id : makePaymentId(user.uid, period);
    const docs = makeWrites(user, period, paymentId, paidAt, existingPayment && existingPayment.data);
    writes.push({
      user,
      period,
      paymentRef: existingPayment
        ? existingPayment.ref
        : db.collection('payments').doc(paymentId),
      publicRef: db.collection('deposit_periods').doc(periodId),
      privateRef: db.collection('deposit_period_details').doc(periodId),
      ...docs
    });
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Matched Firebase accounts: ${users.map(user => user.name).join(', ')}`);
  console.log(`Periods per account: ${periods.length}; target period records: ${targets.length}`);
  console.log(`Legacy rate through 2024: ৳50; 2025 onward: ৳100; fine: ৳0; star: ✕; paid date: ${now.toISOString()}`);
  console.log(`Periods ready: ${writes.length}; conflicts: ${conflicts.length}`);
  conflicts.slice(0, 20).forEach(conflict => console.error(`Conflict: ${conflict}`));
  if (conflicts.length) throw new Error('Resolve the listed payment conflicts before applying any historical records.');
  if (!apply) {
    console.log('No records changed. Re-run with --apply after reviewing this dry run.');
    return;
  }

  for (let offset = 0; offset < writes.length; offset += IMPORT_BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(offset, offset + IMPORT_BATCH_SIZE).forEach(write => {
      batch.set(write.paymentRef, write.payment, { merge: true });
      batch.set(write.publicRef, write.publicSummary, { merge: true });
      batch.set(write.privateRef, write.privateDetail, { merge: true });
    });
    await batch.commit();
  }
  console.log(`Historical deposit backfill complete: ${writes.length} periods across ${users.length} accounts.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Historical deposit backfill failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildPeriods, getDhakaDate };
