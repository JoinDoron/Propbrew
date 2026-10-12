# Propbrew public website release

The public website is deployed separately from activation of the operational platform.

## Release controls

- Set server-only `PROPBREW_WEBSITE_ONLY=1` for the website deployment.
- Production defaults to website-only even before environment settings are added. Only exact `PROPBREW_WEBSITE_ONLY=0` explicitly enables operational routing.
- Set `NEXT_PUBLIC_SITE_URL` to the assigned HTTPS website origin before building.
- Leave demo-identity flags and database, payment, messaging and AI credentials unset on this public website project.
- The interactive preview uses clearly labelled sample data. Operational links point to the homepage preview; sign-in and administration entry points are not advertised.
- The website release policy permits GET/HEAD on the homepage and known public assets, rejects all write methods with 405, hides API reads with 404, and redirects operational page requests to `/#platform`.
- Existing authentication/authorization checks remain in operational handlers. The website policy is a release boundary, not a replacement for production authentication.

## Source and release verification

Commit website identity, marketing components, assets, documentation and the release boundary only. Preserve unrelated in-progress database, integration and release-engineering changes locally. Build/deploy an isolated export of the committed Git tree so uncommitted code and local secrets cannot enter the release.

Before promoting the staged production build, verify the homepage, images/fonts, metadata origin, mobile navigation, tabs and FAQ. Verify GET requests to operational routes redirect, API reads return 404, and POST requests—including server actions on `/`—return 405. Check recent hosting error logs.

## Future platform activation

Do not explicitly disable website-only mode until managed authentication, tenant isolation, durable storage and financial/security controls have been separately verified and approved. Platform activation is outside the website release.

## Release record · 12 October 2026

- Repository: https://github.com/JoinDoron/Propbrew (`main`).
- Live website: https://propbrew-web-production.up.railway.app.
- Railway project: `Propbrew` in `joindoron's Projects`; service `propbrew-web`, production environment. It is separate from Databrew.
- GitHub main is connected for automatic website deployments. No database or operational provider secrets were added to the website service.
- Next.js and its ESLint configuration were upgraded to 16.4.0. Compatible transitive runtime fixes were applied without forced major upgrades. The committed production dependency audit reported zero advisories on the release date; this is not a guarantee about future advisories or complete container security.
- An isolated export of the committed source passed TypeScript, unit tests and the production build. Live HTTP checks verified the homepage, original/optimized images, styles, scripts, self-hosted fonts, metadata origin, robots/sitemap, read-only request policy and operational-route redirects.
- Browser interaction was paused at the user's request because another task was using Comet; no new live-browser visual or keyboard audit is claimed.
- Build logs still reported advisories in development/build dependencies. Review these separately before extending the site into an operational platform; do not apply unreviewed forced dependency upgrades.
- An earlier `unrealabs/propbrew` Vercel project was created during setup but not deployed. Its reserved Vercel address is not the published website and no operational credentials were configured there.
