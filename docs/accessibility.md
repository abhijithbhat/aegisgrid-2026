# Accessibility specification

AegisGrid targets WCAG 2.2 AA and is designed for a time-pressured desktop operator without excluding touch, zoom, keyboard, or assistive-technology use.

- Every interactive control has a semantic name and visible keyboard focus.
- The primary reading and tab order follows the decision sequence: situation → priority → evidence → action.
- Zone states use text, iconography, line patterns, and colour together.
- Critical meaning is never conveyed by motion alone; live updates use restrained status text and non-interruptive live regions.
- The interface reflows at the WCAG 400% zoom equivalent (a 320 CSS-pixel viewport), retains touch targets, and contains only genuinely two-dimensional data tables horizontally.
- The mobile navigation is removed from focus order while closed, traps focus while open, closes with Escape, and restores focus to its trigger.
- Incident and Data Lab tabs use roving focus with Arrow, Home, and End keyboard behavior.
- Animations stop under `prefers-reduced-motion`.
- Increased-contrast and forced-colours preferences retain visible boundaries, status distinctions, and focus indicators.
- Announcements and buttons avoid unexplained abbreviations; timestamps expose complete date/time labels.
- Charts and map regions have equivalent textual summaries.

Automated WCAG 2.2 A/AA axe checks cover every primary view at 1440 px, 390 px, and 320 px. Playwright also checks horizontal reflow, skip-link behavior, roving tabs, semantic landmarks and heading hierarchy, table headers, dynamic status/error announcements, WCAG text-spacing overrides, reduced-motion styling, increased contrast, and forced-colours focus visibility. Human QA should still verify screen-reader phrasing, platform-specific browser/assistive-technology combinations not covered by Chromium, and cognitive load with stadium operators.
