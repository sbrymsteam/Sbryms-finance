const crypto = require('crypto');
const { FieldValue, getAdminServices } = require('./_push-common');

const timeZone = 'Asia/Dhaka';
const defaultFee = 100;
const finePerDay = 5;

function getDhakaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    iso: `${values.year}-${values.month}-${values.day}`
  };
}

function getPeriod(user, year, month, dateRange) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dueDay = dateRange === '1-15' ? 15 : lastDay;
  const dueDate = new Date(Date.UTC(year, month - 1, dueDay));
  const periodId = `${user.uid}_${year}_${month}_${dateRange}`;
  return {
    periodId,
    dueDate,
    dueDateIso: `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
    dateRange,
    dueDay
  };
}

function dateDifference(left, right) {
  return Math.floor((left.getTime() - right.getTime()) / 86400000);
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function createNotificationIfNeeded(db, notification) {
  const ref = db.collection('notifications').doc(notification.id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      transaction.create(ref, {
        to: notification.to,
        type: notification.type,
        title: notification.title,
        subject: notification.title,
        message: notification.message,
        amount: notification.amount,
        fine: notification.fine,
        daysLate: notification.daysLate,
        year: notification.year,
        month: notification.month,
        dateRange: notification.dateRange,
        paymentId: notification.paymentId || '',
        read: false,
        pushAttempted: false,
        createdAt: FieldValue.serverTimestamp()
      });
      return true;
    }
    return snapshot.data().pushAttempted !== true;
  });
}

async function pushNotification(services, notification) {
  const tokenSnapshot = await services.db.collectionGroup('pushTokens')
    .where('email', '==', notification.to)
    .get();
  const tokenDocs = tokenSnapshot.docs.filter(document => typeof document.data().token === 'string' && document.data().token);
  if (!tokenDocs.length) {
    await services.db.collection('notifications').doc(notification.id).update({ pushAttempted: true });
    return;
  }

  for (let offset = 0; offset < tokenDocs.length; offset += 500) {
    const batch = tokenDocs.slice(offset, offset + 500);
    const result = await services.messaging.sendEachForMulticast({
      tokens: batch.map(document => document.data().token),
      data: {
        type: 'app',
        title: notification.title,
        body: notification.message.slice(0, 240),
        appNotificationId: notification.id,
        url: '/notifications.html'
      },
      webpush: { headers: { Urgency: 'high' } },
      android: { priority: 'high', ttl: 86400000 }
    });
    const staleTokenDeletes = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      if ([
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered'
      ].includes(response.error && response.error.code)) {
        staleTokenDeletes.push(batch[index].ref.delete());
      }
    });
    await Promise.all(staleTokenDeletes);
  }
  await services.db.collection('notifications').doc(notification.id).update({ pushAttempted: true });
}

async function notify(services, notification) {
  if (await createNotificationIfNeeded(services.db, notification)) {
    await pushNotification(services, notification);
  }
}

function makeNotification(user, period, type, extras = {}) {
  const accountName = String(user.name || user.displayName || user.email.split('@')[0]).trim();
  const dateLabel = `${period.dueDate.toLocaleDateString('bn-BD', {
    day: 'numeric',
    month: 'long',
    timeZone
  })}`;
  const idBase = `${user.uid}-${period.periodId}`;
  if (type === 'deposit_reminder') {
    return {
      id: `deposit-reminder-${idBase}`,
      to: user.email,
      type,
      title: 'জমার শেষ তারিখের আর ২ দিন বাকি',
      message: `${accountName}, ${period.dateRange} সময়ের টাকা জমার শেষ তারিখ ${dateLabel}। আর ২ দিন বাকি। অনুগ্রহ করে সময়মতো টাকা জমা দিয়ে star জিতুন এবং জরিমানা থেকে বাঁচুন।`,
      year: period.year,
      month: period.month,
      dateRange: period.dateRange,
      amount: Number(extras.fee) || defaultFee
    };
  }
  return {
    id: `deposit-fine-${idBase}-${extras.daysLate}`,
    to: user.email,
    type: 'deposit_fine',
    title: 'জমার জরিমানা যোগ হয়েছে',
    message: `${accountName}, ${period.dateRange} জমা ${extras.daysLate} দিন দেরি হয়েছে। প্রতিদিন ৳${finePerDay} হিসেবে বর্তমান জরিমানা ৳${extras.fine}। দ্রুত payment করে জরিমানা আর বাড়া থেকে বাঁচুন।`,
    year: period.year,
    month: period.month,
    dateRange: period.dateRange,
    fine: extras.fine,
    daysLate: extras.daysLate,
    amount: extras.fine
  };
}

async function syncPaidPayments(services, users) {
  const usersByEmail = new Map(users.map(user => [user.email, user]));
  const payments = await services.db.collection('payments').where('status', '==', 'Paid').get();
  const writesByPath = new Map();
  const paidPayments = payments.docs.slice().sort((left, right) => {
    const timeValue = document => {
      const data = document.data() || {};
      const timestamp = data.paidAt || data.createdAt;
      return timestamp && typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : 0;
    };
    return timeValue(left) - timeValue(right);
  });
  paidPayments.forEach(document => {
    const payment = document.data() || {};
    const email = String(payment.profileEmail || payment.profile || '').trim().toLowerCase();
    if (!email) return;
    const user = usersByEmail.get(email);
    const primaryMonth = Number(payment.month);
    const primaryYear = Number(payment.year);
    const primaryRange = String(payment.dateRange || '').includes('16-') ? '16-end' : '1-15';
    const details = Array.isArray(payment.coveredDueDetails) && payment.coveredDueDetails.length
      ? payment.coveredDueDetails
      : [{ year: primaryYear, month: primaryMonth, dateRange: primaryRange, fee: payment.fee, fine: payment.fine }];
    details.forEach(detail => {
      const year = Number(detail.year) || primaryYear;
      const date = String(detail.date || '');
      const month = Number(detail.month)
        || (date ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(date.split(' ')[0]) + 1 : primaryMonth);
      const dateRange = String(detail.dateRange || (date.includes('16-') ? '16-end' : primaryRange)).includes('16-')
        ? '16-end'
        : '1-15';
      if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12) return;
      const periodId = `${user ? user.uid : document.id}_${year}_${month}_${dateRange}`;
      const dueDay = dateRange === '1-15' ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate();
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
      const publicRef = services.db.collection('deposit_periods').doc(periodId);
      const fee = Number(detail.fee) || Number(payment.fee) || defaultFee;
      const fine = Number(detail.fine) || Number(payment.fine) || 0;
      const daysLate = Number(detail.daysLate) || Math.floor(fine / finePerDay);
      const paidAt = payment.paidAt || payment.createdAt || FieldValue.serverTimestamp();
      writesByPath.set(publicRef.path, {
        ref: publicRef,
        data: {
          profileEmail: email,
          profileName: String(payment.profileName || user && (user.name || user.displayName) || email.split('@')[0]),
          year,
          month,
          dateRange,
          status: 'Paid',
          paymentId: document.id,
          fee,
          fine,
          total: fee + fine,
          paidAt,
          daysLate,
          star: detail.star || (daysLate ? 'cross' : 1),
          transactionId: String(payment.transactionId || ''),
          dueDate
        }
      });
      if (!user) return;
      const privateRef = services.db.collection('deposit_period_details').doc(`${user.uid}_${year}_${month}_${dateRange}`);
      writesByPath.set(privateRef.path, {
        ref: privateRef,
        data: {
          userId: user.uid,
          profileEmail: email,
          profileName: String(payment.profileName || user.name || user.displayName || email.split('@')[0]),
          year,
          month,
          dateRange,
          dueDate,
          status: 'Paid',
          fee,
          fine,
          total: fee + fine,
          paidAt,
          daysLate,
          star: detail.star || (daysLate ? 'cross' : 1),
          paymentId: document.id,
          updatedAt: FieldValue.serverTimestamp()
        }
      });
    });
  });
  const writes = Array.from(writesByPath.values());
  const changedWrites = [];
  for (let offset = 0; offset < writes.length; offset += 500) {
    const chunk = writes.slice(offset, offset + 500);
    const snapshots = await services.db.getAll(...chunk.map(write => write.ref));
    snapshots.forEach((snapshot, index) => {
      const write = chunk[index];
      const existing = snapshot.data() || {};
      if (!snapshot.exists || existing.status !== 'Paid' || existing.paymentId !== write.data.paymentId) {
        changedWrites.push(write);
      }
    });
  }
  for (let offset = 0; offset < changedWrites.length; offset += 400) {
    const batch = services.db.batch();
    changedWrites.slice(offset, offset + 400).forEach(write => batch.set(write.ref, write.data, { merge: true }));
    await batch.commit();
  }
}

module.exports = async function depositReminders(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';
  if (!cronSecret || !constantTimeEquals(authorization, `Bearer ${cronSecret}`)) {
    res.status(401).json({ error: 'Unauthorized cron request.' });
    return;
  }

  try {
    const services = getAdminServices();
    const today = getDhakaDate();
    const usersSnapshot = await services.db.collection('users').get();
    const users = usersSnapshot.docs
      .map(document => {
        const data = document.data() || {};
        const email = String(data.email || data.emailAddress || '').trim().toLowerCase();
        return { ...data, uid: document.id, email };
      })
      .filter(user => user.email.includes('@'));
    await syncPaidPayments(services, users);
    let periodsCreated = 0;
    let remindersQueued = 0;
    let fineUpdatesQueued = 0;

    for (const user of users) {
      for (const dateRange of ['1-15', '16-end']) {
        const period = getPeriod(user, today.year, today.month, dateRange);
        const daysUntilDue = dateDifference(period.dueDate, new Date(Date.UTC(today.year, today.month - 1, today.day)));
        if (daysUntilDue !== 2) continue;

        const periodRef = services.db.collection('deposit_periods').doc(period.periodId);
        const detailRef = services.db.collection('deposit_period_details').doc(period.periodId);
        const [existing, existingDetail] = await Promise.all([periodRef.get(), detailRef.get()]);
        if (existing.exists && ['Paid', 'Pending Confirmation'].includes(existing.data().status)) continue;
        const fee = existingDetail.exists ? Number(existingDetail.data().fee) || defaultFee : defaultFee;
        const batch = services.db.batch();
        batch.set(periodRef, {
          profileEmail: user.email,
          profileName: String(user.name || user.displayName || user.email.split('@')[0]),
          year: today.year,
          month: today.month,
          dateRange,
          status: 'Pending',
          fee,
          fine: 0,
          total: fee,
          paidAt: null,
          daysLate: 0,
          star: '',
          transactionId: '',
          dueDate: period.dueDateIso
        }, { merge: true });
        batch.set(detailRef, {
          userId: user.uid,
          profileEmail: user.email,
          profileName: String(user.name || user.displayName || user.email.split('@')[0]),
          year: today.year,
          month: today.month,
          dateRange,
          dueDate: period.dueDateIso,
          status: 'Pending',
          fee,
          fine: 0,
          total: fee,
          daysLate: 0,
          star: '',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        await batch.commit();
        if (!existing.exists) periodsCreated += 1;
        await notify(services, makeNotification(user, {
          ...period,
          year: today.year,
          month: today.month
        }, 'deposit_reminder', { fee }));
        remindersQueued += 1;
      }
    }

    const pendingSnapshot = await services.db.collection('deposit_period_details')
      .where('status', '==', 'Pending')
      .get();
    const usersByUid = new Map(users.map(user => [user.uid, user]));
    for (const document of pendingSnapshot.docs) {
      const data = document.data() || {};
      if (!data.dueDate) continue;
      const dueDateParts = String(data.dueDate).split('-').map(Number);
      if (dueDateParts.length !== 3 || dueDateParts.some(value => !Number.isInteger(value))) continue;
      const dueDate = new Date(Date.UTC(dueDateParts[0], dueDateParts[1] - 1, dueDateParts[2]));
      const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
      const daysLate = dateDifference(todayDate, dueDate);
      if (daysLate <= 0) continue;
      const fine = daysLate * finePerDay;
      const user = usersByUid.get(String(data.userId || ''));
      if (!user) continue;
      if (Number(data.daysLate) !== daysLate || Number(data.fine) !== fine) {
        await document.ref.update({
          daysLate,
          fine,
          total: (Number(data.fee) || defaultFee) + fine,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      await services.db.collection('deposit_periods').doc(document.id).set({
        profileEmail: data.profileEmail,
        profileName: data.profileName || user.name || user.displayName || 'Member',
        year: data.year,
        month: data.month,
        dateRange: data.dateRange,
        status: 'Pending',
        fee: Number(data.fee) || defaultFee,
        fine,
        total: (Number(data.fee) || defaultFee) + fine,
        paidAt: null,
        daysLate,
        star: 'cross',
        transactionId: '',
        dueDate: data.dueDate
      }, { merge: true });
      const period = {
        periodId: document.id,
        dueDate,
        dueDateIso: data.dueDate,
        dateRange: data.dateRange,
        year: Number(data.year),
        month: Number(data.month)
      };
      await notify(services, makeNotification(user, period, 'deposit_fine', { daysLate, fine }));
      fineUpdatesQueued += 1;
    }

    const retrySnapshot = await services.db.collection('notifications')
      .where('pushAttempted', '==', false)
      .limit(100)
      .get();
    let pushRetries = 0;
    for (const document of retrySnapshot.docs) {
      const data = document.data() || {};
      if (!['deposit_reminder', 'deposit_fine'].includes(data.type) || !data.to) continue;
      await pushNotification(services, { id: document.id, ...data });
      pushRetries += 1;
    }

    res.status(200).json({
      date: today.iso,
      usersChecked: users.length,
      periodsCreated,
      remindersQueued,
      fineUpdatesQueued,
      pushRetries
    });
  } catch (error) {
    console.error('Deposit reminder cron failed:', error);
    res.status(500).json({ error: 'Deposit reminders could not be processed.' });
  }
};
