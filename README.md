# Clutch

Catch up on every class, from your own course materials.

Clutch connects to Canvas and shows what's due, what's missing and where your grades stand. It builds a day-by-day catch-up plan, and it writes study guides, practice sets, cheat sheets and quizzes from your own lecture slides, notes and worksheets.

It runs on your own computer. Your Canvas token, your API key and everything you make stay on your machine.

## What it does

- **Dashboard.** Every class this semester with your current grade, what's due in the next three weeks, anything Canvas marks missing, and low scores worth reviewing. Exam and quiz dates mentioned in syllabi and module headings show up too, even when they aren't Canvas assignments.
- **Catch-up plan.** A realistic day-by-day plan for the next two weeks, based on your deadlines, grades and syllabus policies (dropped lowest scores, late days). Each topic links straight into the study tool.
- **Study from your own materials.** Pick a class and say what feels shaky. Clutch finds the matching slides and notes, then makes a:
  - **Study guide:** explanations in your professor's notation, worked examples, common mistakes, practice problems and a hidden answer key
  - **Practice set:** exam-style problems with worked solutions
  - **Cheat sheet:** one printable page
  - **Quiz:** interactive questions with instant feedback. It tracks your weak spots and turns them into a follow-up guide.
- **Sources on everything.** Guides cite the file and page they came from, so you can check them against the slides.
- **Feedback button** on every page, saved to `data/feedback.jsonl`.

Clutch reads PDFs, PowerPoint (.pptx), Word (.docx), text and code files, and Canvas pages. For slides that are mostly math or diagrams, turn on **Read PDFs visually** to send the pages themselves to the model. Lecture recordings aren't supported yet.

## Setup

You need Node.js 20 or newer.

```bash
git clone https://github.com/yuvi-anand/clutch.git
cd clutch
npm install
npm run dev
```

Open http://127.0.0.1:3100 and go to **Connect**:

1. **Canvas access token.** In Canvas, open Account → Settings, scroll to Approved Integrations, click **+ New Access Token**, and paste the token into Clutch.
2. **Anthropic API key.** Create one at [console.anthropic.com](https://console.anthropic.com/settings/keys). The account needs prepaid credits (Plans & Billing). A study guide usually costs $0.20–$0.50 depending on how much material you pick. The app shows the cost of each one.

For everyday use, `npm run build && npm start` runs a faster production build at the same address. To look around with made-up sample data and no accounts, run `DEMO_MODE=1 npm run dev`. You can also set everything in `.env.local` instead of the Connect page (see `.env.example`).

## Privacy and security

- The app listens only on `127.0.0.1`, and its API refuses requests from other hosts and other websites.
- Your token and key live in `data/config.json`, which git ignores. The Canvas token is only ever sent to your Canvas, never to the file storage it redirects downloads to.
- Course text is cached in `data/cache/` so a file is only re-read when it changes. Guides, quizzes and plans are saved in `data/` as well.
- Clutch is a study aid. It won't write answers for currently assigned homework, projects or CTF challenges.

## How it works

A Next.js app with API routes:

| File | What it does |
| --- | --- |
| `src/lib/canvas.ts` | Canvas REST client: pagination and file downloads |
| `src/lib/agenda.ts` | Dashboard data: deadlines, missing work, exam dates from syllabi and modules |
| `src/lib/materials.ts`, `src/lib/extract.ts` | Course materials to text (PDF, PPTX, DOCX, Canvas pages), with page and slide markers |
| `src/lib/prompts.ts` | Tutor, plan, quiz and material-matching prompts |
| `src/lib/ai.ts`, `src/lib/models.ts` | Streaming model calls; picks the newest top-tier model automatically |

## Roadmap

- Browser extension, so no Canvas token is needed
- Lecture recordings (from captions or transcripts)
- Gradescope, Piazza and Pawtograder
- A hosted multi-user version
