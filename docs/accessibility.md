# Accessibility specification

AegisGrid targets WCAG 2.2 AA and is designed for a time-pressured desktop operator without excluding touch, zoom, keyboard, or assistive-technology use.

- Every interactive control has a semantic name and visible keyboard focus.
- The primary reading and tab order follows the decision sequence: situation → priority → evidence → action.
- Zone states use text, iconography, line patterns, and colour together.
- Critical meaning is never conveyed by motion alone; live updates use restrained status text and non-interruptive live regions.
- The interface supports 200% zoom, narrow viewports, touch targets, and horizontal containment for dense tables.
- The mobile navigation is removed from focus order while closed, traps focus while open, closes with Escape, and restores focus to its trigger.
- Incident and Data Lab tabs use roving focus with Arrow, Home, and End keyboard behavior.
- Animations stop under `prefers-reduced-motion`.
- Announcements and buttons avoid unexplained abbreviations; timestamps expose complete date/time labels.
- Charts and map regions have equivalent textual summaries.

Automated axe checks at desktop/mobile viewports and keyboard-path Playwright checks are included. Human QA should still verify screen-reader phrasing, 400% reflow, high-contrast mode, and cognitive load with stadium operators.
