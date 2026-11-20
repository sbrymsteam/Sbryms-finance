require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { getAdminServices } = require('../api/_push-common');

const accountName = 'Arafathusainkamil';
const oldEmail = 'arafathusainkamil@gmail.com';
const newEmail = 'samsunnaharbusra6@gmail.com';

async function getAccount(db, auth) {
  const users = await db.collection('users').get();
  const matches = users.docs.filter(document => {
    const data = document.data() || {};
    const name = String(data.name || data.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = String(data.email || data.emailAddress || '').trim().toLowerCase();
    return name === accountName.toLowerCase() || email === oldEmail;
  });
  if (matches.length !== 1) {
    throw new Error(`Expected one ${accountName} profile matching ${oldEmail}; found ${matches.length}.`);
  }

  const userDocument = matches[0];
  const userData = userDocument.data() || {};
  const currentEmail = String(userData.email || userData.emailAddress || '').trim().toLowerCase();
  if (currentEmail !== oldEmail && currentEmail !== newEmail) {
    throw new Error(`${accountName} profile email changed unexpectedly; no records were modified.`);
  }

  const authUser = await auth.getUser(userDocument.id);
  if (authUser.email !== oldEmail && authUser.email !== newEmail) {
    throw new Error(`${accountName} Firebase Auth email changed unexpectedly; no records were modified.`);
  }

  const targetAuthUser = await auth.getUserByEmail(newEmail).then(
    user => user,
    error => {
      if (error.code === 'auth/user-not-found') return null;
      throw error;
    }
  );
  if (targetAuthUser && targetAuthUser.uid !== userDocument.id) {
    throw new Error('The new email is already assigned to another Firebase Auth account.');
  }

  const targetProfile = users.docs.find(document => {
    if (document.id === userDocument.id) return false;
    const data = document.data() || {};
    return [data.email, data.emailAddress]
      .some(value => String(value || '').trim().toLowerCase() === newEmail);
  });
  if (targetProfile) {
    throw new Error('The new email is already assigned to another Firestore user profile.');
  }

  return { userDocument, userData, authUser };
}

function addSnapshots(targets, snapshots, transform) {
  snapshots.forEach(snapshot => {
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    const update = transform(data);
    if (Object.keys(update).length) targets.set(snapshot.ref.path, { ref: snapshot.ref, update });
  });
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--apply');
  if (unknownArgs.length) throw new Error(`Unknown argument: ${unknownArgs.join(' ')}`);

  const { db, auth } = getAdminServices();
  const { userDocument, userData, authUser } = await getAccount(db, auth);
  const uid = userDocument.id;
  const targets = new Map();
  const collections = [
    db.collection('payments').where('profileEmail', '==', oldEmail).get(),
    db.collection('payments').where('profile', '==', oldEmail).get(),
    db.collection('payments').where('profileUid', '==', uid).get(),
    db.collection('deposit_periods').where('profileEmail', '==', oldEmail).get(),
    db.collection('deposit_period_details').where('profileEmail', '==', oldEmail).get(),
    db.collection('deposit_period_details').where('userId', '==', uid).get(),
    db.collection('notifications').where('to', '==', oldEmail).get(),
    userDocument.ref.collection('pushTokens').get()
  ];
  const [emailPayments, profilePayments, uidPayments, summaries, details, uidDetails, notifications, tokens] =
    await Promise.all(collections);

  addSnapshots(targets, [...emailPayments.docs, ...profilePayments.docs, ...uidPayments.docs], data => {
    const update = {};
    if (String(data.profileEmail || '').trim().toLowerCase() === oldEmail) update.profileEmail = newEmail;
    if (String(data.profile || '').trim().toLowerCase() === oldEmail) update.profile = newEmail;
    if (Array.isArray(data.coveredDueDetails)) {
      update.coveredDueDetails = data.coveredDueDetails.map(detail => (
        String(detail.profileEmail || '').trim().toLowerCase() === oldEmail
          ? { ...detail, profileEmail: newEmail }
          : detail
      ));
    }
    return update;
  });
  addSnapshots(targets, summaries.docs, data => (
    String(data.profileEmail || '').trim().toLowerCase() === oldEmail ? { profileEmail: newEmail } : {}
  ));
  addSnapshots(targets, [...details.docs, ...uidDetails.docs], data => (
    String(data.profileEmail || '').trim().toLowerCase() === oldEmail ? { profileEmail: newEmail } : {}
  ));
  addSnapshots(targets, notifications.docs, data => (
    String(data.to || '').trim().toLowerCase() === oldEmail ? { to: newEmail } : {}
  ));
  addSnapshots(targets, tokens.docs, data => (
    String(data.email || '').trim().toLowerCase() === oldEmail ? { email: newEmail } : {}
  ));

  const profileUpdate = {};
  if (String(userData.email || '').trim().toLowerCase() === oldEmail) profileUpdate.email = newEmail;
  if (String(userData.emailAddress || '').trim().toLowerCase() === oldEmail) profileUpdate.emailAddress = newEmail;
  if (Object.keys(profileUpdate).length) {
    targets.set(userDocument.ref.path, { ref: userDocument.ref, update: profileUpdate });
  }
  const writes = [...targets.values()];

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Account: ${accountName}; UID preserved: ${uid}`);
  console.log(`Firebase Auth email: ${authUser.email} -> ${newEmail}`);
  console.log(`Firestore documents to update: ${writes.length}`);
  console.log(`Matched references: ${targets.size} unique documents; conflicting target email: no`);
  if (!apply) {
    console.log('No records changed. Re-run with --apply to perform the confirmed email replacement.');
    return;
  }
  if (authUser.email === newEmail && !writes.length) {
    console.log('The account email and its Firestore references are already up to date.');
    return;
  }
  if (writes.length > 490) {
    throw new Error('The migration exceeds one atomic Firestore batch; no records were modified.');
  }

  const batch = db.batch();
  writes.forEach(({ ref, update }) => batch.update(ref, update));
  const previousEmailVerified = authUser.emailVerified;
  await auth.updateUser(uid, { email: newEmail, emailVerified: false });
  try {
    await batch.commit();
  } catch (error) {
    await auth.updateUser(uid, { email: oldEmail, emailVerified: previousEmailVerified });
    throw error;
  }
  console.log(`Account email changed successfully; updated ${writes.length} Firestore documents.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Account email change failed:', error.message);
    process.exitCode = 1;
  });
}
