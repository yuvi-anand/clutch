# Troubleshooting

Most problems are fixed by running one setup step again, from the Clutch folder (`cd ~/Clutch`):

```bash
scripts/setup.sh --ai
```

```bash
scripts/setup.sh --canvas
```

## Install

**"command not found: node" or "Node.js is too old"**
Install the LTS version from [nodejs.org](https://nodejs.org), close Terminal, open a new window and run `scripts/setup.sh` again.

**macOS says "Install Clutch.command" is from an unidentified developer**
Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. On older macOS, right-click the file and choose **Open**. You only have to do this once.

**"Permission denied" when running a script**
Run `chmod +x ~/Clutch/scripts/*.sh`, then try again.

**A pop-up asks to install "command line developer tools"**
You can click Install or Cancel. Clutch doesn't need them.

## Claude

**The sign-in page doesn't open, or sign-in fails**
Run `claude auth login` yourself, sign in with your @northeastern.edu email and choose **Continue with SSO**. Then run `scripts/setup.sh --ai`.

**"Claude didn't answer the test"**
- You may have hit your subscription's usage limit. Wait for it to reset (Claude tells you when), then run `scripts/setup.sh --ai`.
- Run `claude auth status`. If it doesn't say `"loggedIn": true`, sign in again (see above).

**Setup warns that Claude Code is signed in with an API key**
That bills per use instead of using your subscription. Answer **Y** to switch to your subscription.

**Generation is slow**
Long guides from lots of slides take 1–2 minutes. Pick fewer materials, or choose a cheat sheet instead of a full guide.

## Canvas

**"Canvas didn't accept that token"**
Make a fresh token (Canvas → Account → Settings → **+ New Access Token**). Copy the whole thing; Canvas shows it only once.

**A class is missing from the dashboard**
Clutch guesses which courses are this semester's. At the bottom of the dashboard, click **Show … other Canvas courses** and pick the class to bring it back (hover a class card and click **Hide** to remove one). For a class that isn't on Canvas, use **+ Add a class that isn't on Canvas**.

**A file says "couldn't read"**
Scanned PDFs without text, and some locked files, can't be read. Download the file and add it on the class page with **Upload files**.

## Running Clutch

**The browser says it can't connect to 127.0.0.1:3100**
Clutch isn't running. Double-click **Clutch** on your Desktop, or run `~/Clutch/scripts/start.sh`, and keep that Terminal window open.

**"Something else is using port 3100"**
Start Clutch on another port: `CLUTCH_PORT=3101 ~/Clutch/scripts/start.sh`

**It broke after an update**
Run `~/Clutch/scripts/update.sh` again. If the build fails, the details are in `~/Clutch/data/build.log`. Include that file when you [open an issue](https://github.com/yuvi-anand/clutch/issues/new/choose).

## Start over

Your guides and settings are in `~/Clutch/data/`. To reset everything, quit Clutch, delete that folder and run `scripts/setup.sh`.
