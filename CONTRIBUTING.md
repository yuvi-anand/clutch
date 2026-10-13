# Contributing

Thanks for helping. Bug reports and feedback from students are the most useful thing right now.

## Feedback and bugs

- In the app: the **Feedback** button on every page saves to `data/feedback.jsonl`. Send that file to the maintainer if you're a tester.
- On GitHub: [open an issue](https://github.com/yuvi-anand/clutch/issues/new/choose). Never paste your Canvas token, grades or course files into an issue.

## Working on the code

```bash
git clone https://github.com/yuvi-anand/clutch.git
cd clutch
npm ci
DEMO_MODE=1 npm run dev   # sample data, no accounts needed
```

Before opening a pull request:

1. `npm run typecheck` passes, and `npm run build` succeeds.
2. You've tried the change in the browser, in demo mode or with your own accounts.
3. Nothing personal is committed. `data/` and `.env*.local` are ignored. Keep it that way.
4. Commit messages are short, lowercase and say what changed (`add a delete button to margin notes`).

## Ground rules for features

- Everything runs locally. No new servers, trackers or analytics.
- Secrets never reach the browser, logs or any host except the one they belong to.
- Clutch teaches; it doesn't do graded work. Prompts must keep refusing currently assigned homework, projects and CTFs.
