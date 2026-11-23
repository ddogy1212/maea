# AHEAD — Your Everyday Workbench

A practical, local-first day planner and focus desk. **No account, AI API, app build, analytics or server required.** Designed for students, busy people, and anyone who wants to transform scattered notices into actionable work.

AHEAD is a standalone app in `maea/ahead/`. The existing MAEA and ELSEWHERE apps are untouched.

## Get started

1. Paste tasks or multi-line class/club notices into the **INBOX**, e.g.

   ```text
   국어 수행 11/27 22:00까지
   내일 러시아어 단어 복습 30분
   중요 수학 숙제 금요일
   ```

2. Review the automatic preview. Click **할 일 3개 추가**. If an item has a future deadline, it appears under **예정**; current undated items appear under **오늘**.
3. Mark items completed, or tap **집중 ↗** to connect a task to a 25-, 45-, or 60-minute focus timer.
4. Use **백업·내보내기** to download an editable JSON backup or import deadlines into a calendar with an ICS file.

## Features

- **Fast multiline capture** with up to 20 tasks per batch. No server or ML. Input remains editable before adding.
- **Conservative date extraction:** 2026-11-27, 11/27, 11월 27일, 오늘, 내일, 모레, 금요일, 이번주 금요일, 다음주 금요일.
- **Time detection:** 22:00, 오후 11시, 오전 9시 반.
- **Classification** for subjects (국어, 수학, 영어, 러시아어 etc.), a conservative estimate for tasks, and optional importance markers.
- **Today / Upcoming / All / Done**, search, sorting by deadline and importance, complete/undo, edit/delete, "focus" selection.
- **Focus timer** based on wall clock timestamps (not interval accumulation) that resumes correctly after the app was hidden or reloaded.
- **7-day progress chart** of tasks completed, and clear real counts for today's pending and week's deadlines.
- **Complete backup and restore** through JSON, plus local calendar event export as an ICS file. All-day events are used when no specific deadline hour was supplied.
- **PWA**: installable on supported phones; shell works offline after first online load. The decorative Unsplash photographs and Google Fonts may not load offline.
- **Keyboard shortcuts**: Ctrl/⌘ + K to focus the inbox, Ctrl/⌘ + Enter to capture the current pasted text.

## Privacy

The app stores tasks and focus sessions locally in this browser, via localStorage. It doesn't sync to other devices and doesn't use a backend. Users should regularly export backups to preserve important data. Clearing browser data may permanently erase the local tasks. The app does not access or monitor your KakaoTalk notifications; it only processes text **you choose to paste**.

## Accuracy and limits

Date extraction is **rules-based**, not natural-language AI. The preview indicates inferred year/weekday dates with an asterisk, so check them before adding. Undetected dates remain without a deadline. An MM/DD date more than 30 days in the past is interpreted as next year; users can edit this before relying on reminders. No push notifications are delivered when the browser is closed. The focus timer calculates its remaining time upon reopening but cannot ring while the app is closed.

ICS events are generated for tasks with due dates; timed events represent a 15-minute **deadline marker**, not the estimated task duration. They use floating local times; import into the calendar in your local timezone.

Up to 500 tasks are kept locally. Import supports AHEAD-exported JSON backups (up to 3 MB); entries with existing IDs are not added twice. Focus session history is included in backup but not automatically restored during a task-only import. If you need a complete move across devices, the app can be extended to offer explicit session import as well.

## Running locally

From the repository root, serve the static files (service workers require HTTP or HTTPS):

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/ahead/`. If GitHub Pages is deployed successfully, the intended URL is `https://ddogy1212.github.io/maea/ahead/`.

Built with HTML, CSS, and vanilla JavaScript. No external dependencies in the application code. Decorative photography from [Unsplash](https://unsplash.com/license). Reference standards: [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [MDN PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps), [iCalendar RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545).

**The purpose is action, not endless planning.**
