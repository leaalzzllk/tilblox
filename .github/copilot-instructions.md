# TikBlox Project Notes

- The backend is TypeScript with Express; run `npm run dev`, `npm test`, and `npm run build` from the project root.
- TikTok chat ingestion is isolated in `src/tiktok.ts`; it currently uses the community `tiktok-live-connector` package and should not handle TikTok credentials.
- Roblox server scripts live in `roblox/`. Never expose `ROBLOX_BRIDGE_TOKEN` to client-side code.
- Keep the dashboard in Brazilian Portuguese and preserve the plain HTML/CSS/JS approach unless the project requirements change.
