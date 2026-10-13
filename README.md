# Clutch

**Catch up on every class, from your own course materials.**

Clutch connects to Canvas and shows what's due, what's missing and where your grades stand. It builds a day-by-day catch-up plan, and it writes study guides, practice sets, cheat sheets and quizzes from your own lecture slides, notes and worksheets.

It runs on your computer and uses the Claude subscription you already have through Northeastern, so there's no API key and nothing to pay.

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey) ![node](https://img.shields.io/badge/node-%E2%89%A520.9-green) ![status](https://img.shields.io/badge/status-beta-orange)

- [Install](#install)
- [Using Clutch](#using-clutch)
- [What it does](#what-it-does)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Privacy and security](#privacy-and-security)
- [FAQ](#faq)
- [For developers](#for-developers)

---

## Install

**You need:** a Mac (or Linux, or Windows with WSL), your Northeastern Canvas login, and your Northeastern Claude account. Setup takes about 5 minutes.

### Option 1: one command (recommended)

Open **Terminal** (press ⌘ Space, type *Terminal*, press Enter), paste this and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/yuvi-anand/clutch/main/install.sh | bash
```

It downloads Clutch into a `Clutch` folder in your home folder and starts the guided setup.

### Option 2: download and double-click

1. [Download the ZIP](https://github.com/yuvi-anand/clutch/archive/refs/heads/main.zip) and unzip it. Move the folder somewhere permanent, like your home folder.
2. Open the folder and double-click **Install Clutch.command**.
   If macOS says it's from an unidentified developer, right-click the file, choose **Open**, then **Open** again.

### What setup does

Setup walks you through everything and asks before it installs anything:

| Step | What happens |
| --- | --- |
| **1. Node.js** | Checks for Node.js 20.9 or newer. It installs it with Homebrew if you have Homebrew; otherwise it opens the download page. |
| **2. Claude** | Installs the official Claude Code app if it's missing and opens a browser so you can sign in with your **@northeastern.edu** account (choose *Continue with SSO*). Then it sends a one-word test question to make sure it works. |
| **3. Canvas** | Opens your Canvas settings page and tells you where to click to make an access token. You paste it in, and setup checks it with Canvas. |
| **4. Finish** | Builds the app, offers to put a **Clutch** icon on your Desktop, and opens Clutch in your browser. |

You can skip the Canvas step and connect later on Clutch's **Connect** page. To redo a single step, run `./setup.sh --ai` or `./setup.sh --canvas` from the Clutch folder.

> **Why a token for Canvas?** Northeastern's Canvas doesn't let outside apps sign in for you. A personal access token is Canvas's built-in way to give an app read access to your own account. You can delete it any time under Canvas → Account → Settings → Approved Integrations.

## Using Clutch

- **Open it:** double-click **Clutch** on your Desktop, or run `~/Clutch/start.sh`. Your browser opens at <http://127.0.0.1:3100>.
- **Keep the Terminal window open** while you study. Closing it stops Clutch. Everything you made is saved.
- **First time:** open a class, say what feels shaky ("dynamic programming, I don't get the recurrences"), and pick what to make (study guide, practice set, cheat sheet or quiz). A guide takes 30–90 seconds.

## What it does

- **Dashboard.** Every class this semester with your current grade, what's due in the next three weeks, anything Canvas marks missing, and low scores worth reviewing. Exam and quiz dates mentioned in syllabi, module headings and course websites show up too, even when they aren't Canvas assignments.
- **Catch-up plan.** A realistic day-by-day plan for the next two weeks, based on your deadlines, grades and syllabus policies (dropped lowest scores, late days). Add your own commitments, like a trip, a club or interview prep, and the plan works around them.
- **Study from your own materials.** Pick a class and say what feels shaky. Clutch finds the matching slides and notes, then makes a:
  - **Study guide:** explanations in your professor's notation, worked examples, common mistakes, practice problems and a hidden answer key
  - **Practice set:** exam-style problems with worked solutions
  - **Cheat sheet:** one printable page
  - **Quiz:** interactive questions with instant feedback. It tracks your weak spots and turns them into a follow-up guide.
- **Margin notes.** Highlight any passage in a guide and click **Ask about this**. A short explanation appears as a sticky note beside it and is saved with the guide.
- **Classes that aren't on Canvas.** Click **+ Add a class that isn't on Canvas**, then add its website, upload files or paste notes.
- **Sources on everything.** Guides cite the file and page they came from, so you can check them against the slides.
- **Feedback button** on every page.

Clutch reads PDFs, PowerPoint (.pptx), Word (.docx), text and code files, Canvas pages and public course websites. Lecture recordings aren't supported yet.

## Updating and uninstalling

**Update:** run `~/Clutch/update.sh`, or paste the install command again. Your guides, notes and connections are kept.

**Uninstall:** delete the `Clutch` folder and the Desktop icon. To revoke Canvas access too, delete the token in Canvas (Account → Settings → Approved Integrations). Setup may have installed Claude Code and Node.js; they're ordinary apps you can keep or remove.

## Privacy and security

- **Nothing leaves your computer except the AI request.** Clutch has no server and no account of its own, and it collects no analytics. Course text goes only to Claude, through your own signed-in Claude Code, the same as if you'd pasted it into Claude yourself.
- **Your Canvas token stays local.** It's stored in `data/config.json` (readable only by you) and sent only to Canvas. It is never sent to the file storage Canvas redirects downloads to.
- **Local only.** The app listens only on `127.0.0.1`. Its API refuses requests from other devices and other websites.
- **Locked-down AI calls.** Clutch runs Claude Code with tools, plugins, settings files and chat history all turned off, so it can only answer the prompt it's given. It can't touch your files.
- **Your data** (guides, quizzes, plans, notes, feedback, cached course text) lives in the `data/` folder and is never committed to git.

Found a security problem? See [SECURITY.md](SECURITY.md).

**Academic integrity.** Clutch is a study aid. It explains your course material and writes practice problems. It won't write answers for currently assigned homework, projects or CTF challenges. Follow your course's AI policy.

## FAQ

**Does it cost anything?**
No. It uses your Northeastern Claude subscription. Generations count toward that subscription's normal usage limits, just like chatting with Claude.

**Do I need an API key?**
No. An Anthropic API key is supported as an alternative (on the Connect page), but it bills per use.

**Does it work on Windows?**
Through WSL: install [WSL with Ubuntu](https://learn.microsoft.com/windows/wsl/install), open Ubuntu, and run the install command there.

**Can I use it outside Northeastern?**
Yes. During setup, enter your school's Canvas address. You'll need your own Claude subscription.

**Something isn't working.**
See [TROUBLESHOOTING.md](TROUBLESHOOTING.md), or [open an issue](https://github.com/yuvi-anand/clutch/issues/new/choose).

## For developers

```bash
git clone https://github.com/yuvi-anand/clutch.git
cd clutch
npm ci
./setup.sh --ai        # or set things on the Connect page
npm run dev            # http://127.0.0.1:3100
```

`DEMO_MODE=1 npm run dev` runs with made-up sample data and no accounts. `npm run typecheck` type-checks. You can also configure Clutch through `.env.local` instead of the Connect page (see `.env.example`).

### How it works

A Next.js app whose API routes run on your machine:

| File | What it does |
| --- | --- |
| `src/lib/canvas.ts` | Canvas REST client: pagination and file downloads |
| `src/lib/agenda.ts`, `src/lib/events.ts` | Dashboard data: deadlines, missing work, exam dates from syllabi, modules and course sites |
| `src/lib/materials.ts`, `src/lib/extract.ts` | Course materials to text (PDF, PPTX, DOCX, Canvas pages, websites), with page and slide markers |
| `src/lib/prompts.ts` | Tutor, plan, quiz, margin-note and material-matching prompts |
| `src/lib/ai.ts`, `src/lib/localEngine.ts` | Runs a generation through the local AI command, or through the API when a key is set |
| `setup.sh`, `start.sh`, `update.sh`, `install.sh` | Guided setup, launcher, updater and one-line installer |

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to send changes.

## Roadmap

- Browser extension, so no Canvas token is needed
- Lecture recordings (from captions or transcripts)
- Gradescope, Piazza and Pawtograder
- A hosted version that needs no install

See [CHANGELOG.md](CHANGELOG.md) for what's new.
