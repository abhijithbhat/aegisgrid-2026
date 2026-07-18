# AegisGrid contributor guide

- Install: `npm install`
- Develop: `npm run dev`
- Build: `npm run build`
- Verify: `npm run verify`

Keep deterministic calculations in `src/lib/risk`, `src/lib/routing`, and `src/lib/incidents`. AI code may interpret or explain evidence, but must not calculate risk, routes, authorization, validation, or priority ordering. Validate every boundary with strict runtime schemas.

Run tests after every behavior change. Never commit credentials, hardcode provider output, add placeholder controls, or weaken upload limits. Maintain keyboard access, visible focus, non-colour status cues, reduced-motion support, and WCAG AA contrast.
