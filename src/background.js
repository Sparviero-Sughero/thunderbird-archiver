const DEFAULT_SETTINGS = {
  agePreset: "6months",
  customDays: 180,
  selectedAccountIds: [],
  deleteOldSpamAndTrash: false,
};

const ALARM_NAME = "auto-archive-daily";
const EXCLUDED_SPECIAL_USES = new Set([
  "archives",
  "drafts",
  "junk",
  "templates",
  "trash",
  "outbox",
]);

let currentRun = null;

function daysForSettings(settings) {
  switch (settings.agePreset) {
    case "2months": return 60;
    case "1year": return 365;
    case "custom": return Math.max(1, Number.parseInt(settings.customDays, 10) || 1);
    default: return 180;
  }
}

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...await messenger.storage.local.get(DEFAULT_SETTINGS) };
}

function collectEligibleFolders(folder, ancestorExcluded = false, result = []) {
  const uses = folder.specialUse || [];
  const excluded = ancestorExcluded || uses.some(use => EXCLUDED_SPECIAL_USES.has(use));

  if (!excluded && !folder.isRoot && !folder.isVirtual && !folder.isUnified && !folder.isTag) {
    result.push(folder);
  }

  for (const child of folder.subFolders || []) {
    collectEligibleFolders(child, excluded, result);
  }
  return result;
}

function collectCleanupFolders(folder, insideSpamOrTrash = false, result = []) {
  const uses = folder.specialUse || [];
  const cleanup = insideSpamOrTrash || uses.includes("junk") || uses.includes("trash");

  if (cleanup && !folder.isRoot && !folder.isVirtual && !folder.isUnified && !folder.isTag) {
    result.push(folder);
  }

  for (const child of folder.subFolders || []) {
    collectCleanupFolders(child, cleanup, result);
  }
  return result;
}

async function getAllMessageIds(firstPage) {
  const ids = [];
  let page = firstPage;
  while (page) {
    ids.push(...(page.messages || []).map(message => message.id));
    if (!page.id) break;
    page = await messenger.messages.continueList(page.id);
  }
  return ids;
}

async function archiveFolder(folderId, cutoff) {
  let count = 0;
  const firstPage = await messenger.messages.query({ folderId, toDate: cutoff });
  const ids = await getAllMessageIds(firstPage);

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    if (batch.length) {
      await messenger.messages.archive(batch);
      count += batch.length;
    }
  }
  return count;
}

async function deleteOldMessages(folderId, cutoff) {
  let count = 0;
  const firstPage = await messenger.messages.query({ folderId, toDate: cutoff });
  const ids = await getAllMessageIds(firstPage);

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    if (batch.length) {
      // The boolean form supports Thunderbird 128. `true` means permanent deletion.
      await messenger.messages.delete(batch, true);
      count += batch.length;
    }
  }
  return count;
}

async function runArchive() {
  if (currentRun) return currentRun;

  currentRun = (async () => {
    const settings = await getSettings();
    const selectedIds = new Set(settings.selectedAccountIds);
    const cutoff = new Date(Date.now() - daysForSettings(settings) * 86400000);
    const accounts = await messenger.accounts.list(true);
    const selectedAccounts = accounts.filter(account => selectedIds.has(account.id));
    let archived = 0;
    let deleted = 0;
    const errors = [];

    for (const account of selectedAccounts) {
      const folders = collectEligibleFolders(account.rootFolder);
      for (const folder of folders) {
        try {
          archived += await archiveFolder(folder.id, cutoff);
        } catch (error) {
          errors.push(`${account.name} / ${folder.name}: ${error.message}`);
        }
      }

      if (settings.deleteOldSpamAndTrash) {
        const cleanupFolders = collectCleanupFolders(account.rootFolder);
        for (const folder of cleanupFolders) {
          try {
            deleted += await deleteOldMessages(folder.id, cutoff);
          } catch (error) {
            errors.push(`${account.name} / ${folder.name}: ${error.message}`);
          }
        }
      }
    }

    const result = {
      archived,
      deleted,
      errors,
      accountCount: selectedAccounts.length,
      finishedAt: new Date().toISOString(),
    };
    await messenger.storage.local.set({ lastRun: result });
    return result;
  })();

  try {
    return await currentRun;
  } finally {
    currentRun = null;
  }
}

async function ensureDailyAlarm() {
  const existing = await messenger.alarms.get(ALARM_NAME);
  if (!existing) {
    messenger.alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 1440 });
  }
}

messenger.runtime.onInstalled.addListener(ensureDailyAlarm);
messenger.runtime.onStartup.addListener(ensureDailyAlarm);
messenger.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) runArchive().catch(console.error);
});
messenger.action.onClicked.addListener(() => runArchive().catch(console.error));
messenger.runtime.onMessage.addListener(message => {
  if (message?.type === "runArchive") return runArchive();
});

ensureDailyAlarm().catch(console.error);
