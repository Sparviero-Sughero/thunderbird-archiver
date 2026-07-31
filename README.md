# Thunderbird Archiver

Automatically archives old messages from selected Thunderbird accounts by using Thunderbird's native Archive action. Archive destinations and folder structures therefore follow each account's existing Thunderbird settings.

## Features

- Archive messages older than 2 months, 6 months, 1 year, or a custom number of days.
- Select one or more mail accounts.
- Run automatically once per day or manually from the toolbar/preferences.
- Optionally permanently delete old messages from Spam and Trash.
- Automatically follow Thunderbird's interface language, with 69 locale catalogs.
- Keep all data inside Thunderbird; the installed extension makes no network requests.

Archive, Trash, Junk, Drafts, Templates, and Outbox folders are excluded from archiving. When cleanup is enabled, old messages in Trash and Junk are permanently deleted and cannot be restored.

## Requirements

- Thunderbird 128 or newer.

## Install

Download the latest `.xpi` from [GitHub Releases](https://github.com/Sparviero-Sughero/thunderbird-archiver/releases), then in Thunderbird open **Add-ons and Themes**, choose **Install Add-on From File…**, and select it.

The latest generated package is also kept in [`dist/`](dist/).

For development, open **Add-ons and Themes → Debug Add-ons → Load Temporary Add-on** and select [`src/manifest.json`](src/manifest.json).

## Build

On PowerShell:

```powershell
.\tools\build.ps1
```

The package is written to `dist/`. Version tags matching `v*` trigger the GitHub Actions workflow, which builds the XPI and publishes a GitHub release automatically.

## Localization

Locale catalogs live in [`src/_locales`](src/_locales). The generation helper is kept outside the packaged extension in [`tools/generate-locales.ps1`](tools/generate-locales.ps1). English is the fallback locale.

## Privacy

The extension reads message metadata needed to find old messages and asks Thunderbird itself to archive or delete them. It does not transmit account or message data.

## License

[GNU General Public License v3.0](LICENSE)
