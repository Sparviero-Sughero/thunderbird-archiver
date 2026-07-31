const DEFAULT_SETTINGS = {
  agePreset: "6months",
  customDays: 180,
  selectedAccountIds: [],
  deleteOldSpamAndTrash: false,
};

const form = document.querySelector("#settings-form");
const accountsContainer = document.querySelector("#accounts");
const customDays = document.querySelector("#custom-days");
const runButton = document.querySelector("#run-now");
const deleteSpamTrash = document.querySelector("#delete-spam-trash");
const status = document.querySelector("#status");

function message(key, substitutions) {
  return messenger.i18n.getMessage(key, substitutions) || key;
}

function localizePage() {
  const uiLanguage = messenger.i18n.getUILanguage();
  document.documentElement.lang = uiLanguage;
  document.documentElement.dir = /^(ar|fa|he)(-|$)/i.test(uiLanguage) ? "rtl" : "ltr";
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = message(element.dataset.i18n);
  }
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function selectedAccountIds() {
  return [...document.querySelectorAll('input[name="account"]:checked')].map(input => input.value);
}

async function saveSettings() {
  const agePreset = new FormData(form).get("agePreset");
  const days = Number.parseInt(customDays.value, 10);
  if (agePreset === "custom" && (!Number.isInteger(days) || days < 1)) {
    throw new Error(message("invalidCustomDays"));
  }
  const settings = {
    agePreset,
    customDays: Number.isInteger(days) && days > 0 ? days : 180,
    selectedAccountIds: selectedAccountIds(),
    deleteOldSpamAndTrash: deleteSpamTrash.checked,
  };
  await messenger.storage.local.set(settings);
  return settings;
}

async function load() {
  const [stored, accounts] = await Promise.all([
    messenger.storage.local.get({ ...DEFAULT_SETTINGS, lastRun: null }),
    messenger.accounts.list(),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const preset = document.querySelector(`input[name="agePreset"][value="${settings.agePreset}"]`);
  (preset || document.querySelector('input[value="6months"]')).checked = true;
  customDays.value = settings.customDays;
  deleteSpamTrash.checked = settings.deleteOldSpamAndTrash;
  const selected = new Set(settings.selectedAccountIds);

  accountsContainer.textContent = "";
  const usableAccounts = accounts.filter(account => !["nntp", "rss"].includes(account.type));
  if (!usableAccounts.length) {
    accountsContainer.textContent = message("noAccounts");
    return;
  }

  for (const account of usableAccounts) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const type = document.createElement("span");
    checkbox.type = "checkbox";
    checkbox.name = "account";
    checkbox.value = account.id;
    checkbox.checked = selected.has(account.id);
    type.className = "account-type";
    type.textContent = `(${account.type})`;
    label.append(checkbox, ` ${account.name} `, type);
    accountsContainer.append(label);
  }

  if (stored.lastRun?.finishedAt) {
    setStatus(message("lastRunStatus", [
      new Date(stored.lastRun.finishedAt).toLocaleString(),
      String(stored.lastRun.archived),
      String(stored.lastRun.deleted || 0),
    ]));
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await saveSettings();
    setStatus(message("settingsSaved"));
  } catch (error) {
    setStatus(error.message, true);
  }
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  setStatus(message("archivingStatus"));
  try {
    const settings = await saveSettings();
    if (!settings.selectedAccountIds.length) {
      throw new Error(message("selectAccountError"));
    }
    const result = await messenger.runtime.sendMessage({ type: "runArchive" });
    const resultText = message("runResult", [String(result.archived), String(result.deleted)]);
    const errorText = result.errors.length ? ` ${message("folderErrors", String(result.errors.length))}` : "";
    setStatus(`${resultText}${errorText}`, result.errors.length > 0);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    runButton.disabled = false;
  }
});

function updateCustomDaysState() {
  customDays.disabled = !document.querySelector('input[name="agePreset"][value="custom"]').checked;
}

document.querySelectorAll('input[name="agePreset"]').forEach(input => {
  input.addEventListener("change", updateCustomDaysState);
});

customDays.addEventListener("focus", () => {
  document.querySelector('input[name="agePreset"][value="custom"]').checked = true;
  customDays.disabled = false;
});

localizePage();
load().then(updateCustomDaysState).catch(error => setStatus(error.message, true));
