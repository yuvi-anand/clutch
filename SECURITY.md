# Security

Clutch runs on each student's own computer and holds a Canvas access token, so security reports are taken seriously.

## Reporting a problem

Please don't open a public issue for a vulnerability. Use GitHub's **[private vulnerability reporting](https://github.com/yuvi-anand/clutch/security/advisories/new)** instead, with steps to reproduce. You'll get a reply within a few days.

## What's in scope

- Anything that lets another website, another device or another user on the computer reach Clutch's API or read `data/`
- Anything that sends the Canvas token or an API key anywhere other than Canvas or Anthropic
- Ways a course file, Canvas page or website could make the AI command do something beyond answering the prompt

## How Clutch protects your data

- The server binds to `127.0.0.1` only. Every API route checks for a local `Host` header (to block DNS rebinding). Write requests must carry a custom header and a local `Origin`, which other sites can't send.
- `data/config.json` is created with mode `600`. The Canvas token is sent only to the Canvas origin you connected, and download redirects to other hosts never carry it.
- Website imports only fetch public `http(s)` addresses, never local or private network ones.
- The AI command runs with a minimal environment (none of Clutch's secrets). Claude Code runs with tools, MCP servers, settings files, slash commands and session history turned off.
