🥔 𝐏𝐨𝐭𝐚𝐭𝐨𝐞𝐬 — 𝐌𝐮𝐥𝐭𝐢-𝐀𝐠𝐞𝐧𝐭 𝐀𝐈 𝐐𝐮𝐢𝐳 𝐀𝐬𝐬𝐢𝐬𝐭𝐚𝐧𝐭

A Chrome Extension (Manifest V3) powered by a 3-Agent Hybrid Consensus Pipeline (Google Gemini + dual Groq LLM agents) to solve online multiple-choice quizzes with high accuracy and per-tab isolation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 𝐇𝐨𝐰 𝐈𝐭 𝐖𝐨𝐫𝐤𝐬

```text
  [Page DOM Text]
         │
         ├──────────────────────────┐
         ▼                          ▼
┌─────────────────┐        ┌─────────────────┐
│    Solver 1     │        │    Solver 2     │
│ (Google Gemini) │        │   (Groq #1)     │
└────────┬────────┘        └────────┬────────┘
         │  (Parallel Execution)    │
         └────────────┬─────────────┘
                      ▼
             ┌─────────────────┐
             │   Judge Agent   │
             │   (Groq #2)     │
             └────────┬────────┘
                      ▼
       [Final Verdict & Auto-Select]
```

1. Parallel Solvers: Gemini and Groq #1 solve all visible questions independently at the same time.
2. Arbiter Judge: Groq #2 compares both answers against the page text, resolves disagreements, and selects the final correct option.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬

• Per-Tab Isolation: Runs exclusively in the tab where you open it; switching tabs hides the panel while background execution continues uninterrupted.
• Auto-Solve Loop: Selects the verified option, clicks per-question confirmation (Submit / Check) if present, and advances via Next.
• Submission Safeguard: Never clicks final exam buttons (Finish / Submit Quiz), halting safely for manual review.
• Fast & Resilient: Uses low-latency Flash models (thinkingBudget: 0), request timeouts, and automatic model failover.
• Local Privacy: API keys are stored locally in chrome.storage.local with zero external backend servers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 𝐀𝐏𝐈 𝐊𝐞𝐲𝐬 𝐒𝐞𝐭𝐮𝐩

You need 3 free API keys:

1. Solver 1 (Google Gemini) — Starts with AIza... or AQ....
   Get it from: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

2. Solver 2 (Groq #1) — Starts with gsk_...
   Get it from: [https://console.groq.com/keys](https://console.groq.com/keys)

3. Judge 3 (Groq #2) — Starts with gsk_...
   Get it from: [https://console.groq.com/keys](https://console.groq.com/keys)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 𝐐𝐮𝐢𝐜𝐤 𝐒𝐭𝐚𝐫𝐭

1. Open chrome://extensions in Google Chrome and enable Developer mode.
2. Click Load unpacked and select the project folder.
3. Open your quiz page, click the Potatoes 🥔 toolbar icon, and enter your 3 API keys.
4. Click Start Auto-Solve (use Stop anytime to halt).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Disclaimer: Built for educational purposes and exploring multi-agent LLM orchestration. Always follow your platform's academic integrity policies.
