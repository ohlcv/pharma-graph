# End-to-end tests (reserved)

This directory is **empty** today. It is reserved for real-browser tests
(e.g. Playwright, Cypress) once the project adopts one.

Until then, do not place vitest `.test.ts` files here — `vitest.config.ts`
will not pick them up, and the visual folder becomes a misleading trap.

If you add a real-browser suite:
- install Playwright (`npm i -D @playwright/test`)
- configure a separate `playwright.config.ts`
- keep files in this directory as `.spec.ts` (not `.test.ts`) so vitest
  stays blind to them
