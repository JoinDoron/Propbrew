# Propbrew website brand system

Version 1.0 · 11 October 2026 · Website identity and customer experience

## Brand idea

**Daylight infrastructure. A future worth building.**

Propbrew brings clarity to the work that makes places better: operating estates, maintaining facilities and delivering construction projects. The brand should feel capable, open and optimistic. Its expression comes from light, architectural form, connected spaces and purposeful movement.

The public website leads with **“Great places. Better run.”** Supporting copy explains the product in familiar language: one place to coordinate property operations, payments, maintenance, residents and projects, with AI assistance where it helps people make better decisions.

The primary buyer is an estate or facility operator. Construction teams and portfolio owners are secondary routes. Residents need a clear sign-in path for daily tasks. These audiences share the brand but should each find a relevant next action quickly.

This guide defines the website identity. Product workspaces need their own density, permission and task conventions; per-tenant branding must preserve the recognisability and accessibility of operational controls.

## Primary identity

### Name and wordmark

- Write the product name **Propbrew** in prose and document titles.
- Use the lowercase **propbrew** wordmark in the primary visual lockup.
- Keep the name as one word. Use a consistent spelling across page titles, social previews, form labels, navigation and downloadable material.
- Pair the wordmark with a concise architectural mark. Use the full lockup in the website navigation and footer while recognition develops.

### Logo concept: the connected portal

The mark is a geometric **P** derived from an open doorway and connected plot planes. Its upright gives it a stable foundation; the open internal space suggests access, possibility and connection. The geometry must read as a distinct symbol at small sizes, with an unmistakable silhouette in a single colour.

The mark is designed to extend into plot patterns, clipped image frames and subtle motion. The relationship between these assets is what makes the identity coherent.

Usage rules:

- Default light-surface lockup: ink wordmark and cobalt mark.
- On cobalt: white wordmark; white or citron mark. A large citron mark is reserved for expressive brand statements, as in the closing CTA.
- On an ink surface: ivory wordmark with citron mark, as implemented in the footer.
- Use the standalone mark for the favicon, compact interface surfaces and avatar-sized contexts.
- Maintain clear space of at least one quarter of the mark's width around the complete lockup.
- Target a minimum standalone mark size of 20px in interface contexts; simplify detail for the favicon and verify its silhouette at 16px.
- Preserve the proportions and orientation. Avoid stretching, outlines, decorative shadows and gradients inside the primary logo.
- Do not place the lockup directly over a busy photograph. Provide a quiet area or a solid surface.

## Colour system

| Token | Value | Role | Usage |
|---|---|---|---|
| Cobalt | `#2346F0` | Primary action and brand signal | Main CTA, selected interaction, purposeful emphasis |
| Citron | `#D8F36A` | Optimism and possibility | Feature highlights, small labels, active plot planes, expressive sections |
| Warm ivory | `#F7F8F2` | Main canvas | Page background and open editorial space |
| Ink | `#14251C` | Grounding and readability | Headings, body copy, outlines and occasional dark sections |
| White | `#FFFFFF` | Clean working surface | Cards, product previews and text on cobalt |
| Muted sage | `#EAF0E4` | Quiet depth | Secondary surfaces, architectural pattern and section transitions |

Ivory and white carry most of the page. Ink creates hierarchy. Cobalt identifies the principal action. Citron is used in smaller expressive areas so the page retains a clear focus. Sage helps separate content without adding a competing brand colour.

Text pairing rules:

- Use white text on cobalt and ink text on citron.
- Use ink for essential content on ivory, white and sage.
- Use cobalt on ivory for links and selected emphasis when the context also makes the interaction clear.
- Do not use white text on citron.
- Do not communicate success, warning, selection or urgency through colour alone. Add a label, icon or other visible cue.

Calculated WCAG contrast ratios for the specified solid colours are approximately **6.55:1** for white on cobalt, **12.93:1** for ink on citron, **15.00:1** for ink on ivory and **6.13:1** for cobalt on ivory. White on citron is **1.24:1** and unsuitable for text. Opacity, gradients and overlays change these ratios; verify the final rendered combination.

## Typography

**Manrope** is the website's display and body family. Its open geometric forms support the architectural idea while remaining readable for everyday tasks. The existing product also retains **JetBrains Mono** for operational data; reserve it as a supporting precision face rather than the default website reading font. The current marketing previews use Manrope with tabular numerals.

| Role | Desktop direction | Mobile direction | Treatment |
|---|---|---|---|
| Hero headline | 66–108px | 53–84px | Manrope 600, tight tracking, compact line height |
| Section headline | 32–48px | 34px | Manrope 600, clear grouping |
| Capability heading | 33px | 31px | Manrope 600 |
| Hero introductory copy | 17px | 14px | Comfortable 1.7–1.8 line height and short measure |
| Main explanatory copy | 14px | 13–14px | Manrope, regular weight, 1.8–1.9 line height |
| Miniature illustrative records | 7–11px | 7–10px | Compact visual samples; never the only product explanation |

These sizes describe the delivered landing page. Use 16–18px body copy for future long-form pages. Use responsive sizing rather than fixed desktop dimensions. Headline line breaks should support meaning, and body measures should generally remain around 55–70 characters. Essential copy must stay readable without zooming. Miniature records are supporting illustrations, not a replacement for readable live product interfaces.

Load fonts through the project's supported font pipeline. Prefer local font assets when available, keep a useful system fallback and avoid blocking the first usable render on a font request.

## Layout and component language

- Use an **8px spacing rhythm**, with 4px steps for fine adjustments.
- Build large editorial sections around generous margins and deliberate alignment.
- Use **24px corner radii** for large visual containers and product-preview frames. Use smaller radii when a nested surface needs distinction.
- Use rounded pill controls for primary actions, navigation utilities and concise filters.
- Prefer thin, quiet borders to heavy shadows. Use a restrained shadow only where depth explains layering.
- Keep one clear visual priority in each section. Alternate broad compositions with concise information groups.
- Use Lucide line icons consistently, with a comparable stroke weight and optical size. Pair unfamiliar icons with words.
- Aim for controls at least 44px in their interactive dimension, visible focus indicators and meaningful accessible names.
- Design mobile as a first-class experience: coherent order, comfortable spacing, no sideways page overflow and no hover-dependent information.

Components should look related without every surface becoming a card. A full-width statement, open text block, large product scene and compact capability card each has a different job.

## Brand pattern and visual language

### Architectural plot pattern

The pattern comes from the logo's connected planes: plot boundaries, portals and shared corridors arranged on a simple grid. Use incomplete or offset groups to imply a system that can grow. The pattern should feel closer to a considered site plan than to ornamental wallpaper.

- Use sage or a low-contrast ink tint on ivory for quiet backgrounds.
- Use small cobalt and citron planes for selected areas or a focal point.
- Leave substantial empty space around copy and controls.
- Change scale and crop rather than introducing unrelated motifs.
- Reserve high-contrast pattern compositions for the brand showcase or a dedicated transition.

### Imagery

Show the places and people the product serves: well-kept estates, active facilities, construction teams and shared environments. Favour daylight, thoughtful framing, visible care and a sense of possibility. People should feel like participants in the work, with credible context and natural behaviour.

The delivered neighbourhood image expresses the future-facing hero through original illustrative architecture. Label it as an **illustrative concept** so visitors understand its purpose. It is a brand illustration and must not be presented as a customer property, completed project or live digital twin.

### Imagery provenance and generation brief

The neighbourhood artwork was generated for this Propbrew website task as an original AI-created illustration. Its preserved source is `public/brand/neighborhood-source.png`; the website export is `public/brand/neighborhood.webp`. It is not a photograph of a real site and does not represent a customer, completed development or operational portfolio.

The generation brief was **optimistic West African residential architecture in daylight, with sculptural buildings and a sense of a future worth building**. The visual direction connects the place-based product to the daylight infrastructure identity. No benchmark website image is used as the hero artwork.

Generation prompt used for this asset:

> Use case: stylized-concept. Original architectural brand photograph for Propbrew: an optimistic contemporary West African residential neighbourhood, with sculptural warm-white three-to-five-storey apartment blocks, deep terraces, curved corners, glass, roof gardens and solar panels, palms, layered tropical planting, ochre walking paths and courtyard pools. Aerial three-quarter view near roof height; bright tropical daylight, cobalt-blue sky, warm sunlight and deep green foliage. High-end photoreal architectural editorial; wide image that can be cropped into the vertical hero and feature. No fantasy skyscrapers, flying vehicles, holograms, neon, logos, text, UI or watermarks. Clearly an illustrative future vision, not a customer property.

Product visuals should show legible, coherent interactions. Use plausible Nigerian examples such as naira amounts, service charges, maintenance work and site progress. A seeded demo must visibly say **sample data** or **sample workspace**. Do not infer production readiness from a polished interface.

### Motion

Motion explains relationships: a plot becomes selected, an issue moves to the assigned team, evidence joins a record, or an approval updates a status. Use short transform and opacity transitions with gentle easing. Hover movement should be restrained, and entrances must leave the headline and CTA immediately usable.

Respect `prefers-reduced-motion`: remove decorative travel, continuous loops and large spatial transitions, while preserving instant state feedback. Provide a static equivalent for every essential demonstration. Avoid scroll hijacking, automatic audio and motion that makes text difficult to read.

## Website narrative and navigation

The website follows **outcome → interactive product proof → capability → AI evidence and human approval → Nigerian context → FAQ → CTA**.

| Stage | Visitor question | Website response |
|---|---|---|
| Hero | What does Propbrew help me do? | “Great places. Better run.” plus a concrete operational explanation and **Explore the demo** |
| Product proof | Can I understand how it works? | An interactive sample tour with legible tasks, status and sample-data labelling |
| Capabilities | Does this fit my work? | Estate/facility operations first; construction and portfolio paths second |
| AI | What does AI do, and can I review it? | A useful question, source evidence, a draft or recommendation, and a visible human approval step |
| Nigerian context | Will this work in my environment? | Relevant payment and communication context, mobile usability, and an honest account of availability |
| FAQ | What could prevent adoption? | Clear answers about onboarding, audience, demo status, data and support |
| Final CTA | What should I do next? | A repeated demo action and an actual contact route where implemented |

Keep navigation concise. The main public action is **Explore the demo**. A separate, plainly labelled **Resident sign in** or **Sign in** route serves returning users. Existing product navigation and authenticated tasks should be easy to reach.

Anchor links must land on meaningful sections and account for a fixed header. Mobile navigation must open, close and move focus predictably. Every visible CTA should have a working destination, and forms must explain submission status clearly.

## AI communication

Present AI as assistance grounded in the operator's work. Show specific tasks such as summarising outstanding maintenance, drafting a resident update or reviewing project documents. The demonstration should make the evidence and approval boundary visible.

Prefer concrete wording: **“Review the sources. Approve the next step.”** Describe features according to their actual implementation state. Distinguish available product behaviour, a sample demonstration and future scope. Avoid implying that AI independently makes financial, security or safety decisions.

## Nigerian and African market fit

The identity is globally legible and locally useful. Nigerian context should appear through understandable workflows, relevant language, currency and human examples. Give operators a credible view of collections, service issues, approval responsibilities and communication.

- Format Nigerian amounts clearly with `₦` and readable grouping.
- Explain the operational term when it may be unfamiliar to a resident or new buyer.
- Make mobile performance, readable text and touch controls part of the brand experience.
- Reflect low-connectivity or offline behaviour only when the product supports it, and explain pending sync or unavailable actions clearly.
- State the launch language scope accurately. Expand to further African markets through deliberate currency, language and operational adaptation.
- Communicate implementation and support responsibilities plainly. Familiarity and accountability help buyers assess adoption.

## Benchmark rationale

The research used the primary websites below. These are observations about structure and design, followed by Propbrew design judgments. The sites do not establish that a particular colour, layout or animation caused revenue, valuation or conversion performance. No benchmark's logo, illustration, product image or customer evidence is a Propbrew asset.

| Primary reference | Observation | Propbrew application |
|---|---|---|
| [Stripe](https://stripe.com/in) | Spacious white canvas, expressive ribbon, strong type and action; product families lead into audience paths, customer stories, pricing and implementation support. | Use one memorable motif with a calm information system. Explain the platform through a few coherent outcomes. |
| [Linear](https://linear.app/) | Product demonstrations show realistic work. Its chapters follow intake, planning, AI and delivery. | Show a connected workflow and recognisable states. Give operational precision visual prominence. |
| [Linear brand guidelines](https://linear.app/brand) | The guidance gives assets breathing room and prioritises the wordmark where space allows. | Define a flexible lockup and preserve space; build recognition before relying on the mark alone. |
| [Apple](https://www.apple.com/) | Large visual stages, short benefit statements, familiar exploration/purchase paths and region/support routes. | Make flagship capabilities feel deliberate. Use editorial restraint and purposeful compositions. |
| [Notion](https://www.notion.com/) | Large readable type, friendly illustration and actual product previews explain capture, retrieval and automation. Self-service and sales paths coexist. | Explain AI through useful jobs, and maintain warmth around a capable platform. |
| [Airbnb](https://www.airbnb.com/) | Category choice and destination/date/guest tasks precede long marketing copy; hosting has a distinct path. Listing data remained in loading placeholders during this visual inspection. | Returning users need immediate task entry. Separate resident access from the buyer's exploration journey. |
| [Paystack](https://paystack.com/) | African positioning, pale mint, dotted-map texture and local context sit alongside payment methods, reconciliation and support. | Make Nigerian relevance concrete through actual workflows, and use verified local evidence when available. |
| [Procore](https://www.procore.com/en-sg) | Contractor, owner and subcontractor routes accompany construction imagery, lifecycle capabilities and controlled AI workflows. | Give construction and portfolio buyers distinct paths without overwhelming the estate/facility lead story. |
| [AppFolio](https://www.appfolio.com/) | The narrative addresses residents, clients and teams, then connects platform claims to named customer accounts. | Explain benefits for the buyer and the daily user; connect claims to evidence as it becomes available. |

Craftwork's `npx -y @craftwork-design/wizard@latest` guidance was successfully loaded in an isolated temporary directory as a design input. No connected authenticated asset MCP or paid downloads were used. The resulting Propbrew direction and implementation choices belong to this project. This work prepares the website identity; deployment is outside this deliverable.

## Asset inventory and handoff

The following paths are the agreed website asset names. Verify the final implementation and preview before treating any export as approved.

| Path | Purpose |
|---|---|
| `public/brand/propbrew-mark.svg` | Primary standalone portal/plot mark |
| `public/brand/propbrew-logo.svg` | Portable outlined Manrope 800 wordmark lockup; no installed font required |
| `public/brand/propbrew-pattern.svg` | Architectural plot pattern |
| `public/brand/propbrew-social.png` | 1200 × 630 Open Graph/Twitter sharing image |
| `public/brand/propbrew-social.svg` | Editable vector source for the sharing image |
| `public/brand/neighborhood.webp` | Delivered original illustrative neighbourhood architecture for the hero |
| `public/brand/neighborhood-source.png` | Preserved source of the original generated hero artwork |
| `docs/PROPBREW_BRAND_SYSTEM.md` | Brand kit usage rules and benchmark rationale |

Use scalable vector files for the identity and pattern, with accessible labels where they carry meaning. Decorative background patterns should remain hidden from assistive technology. The hero image needs an appropriate alternative description, responsive sizing and efficient delivery.

Before release, inspect the website on desktop and mobile, check keyboard navigation and reduced motion, confirm the sample labels, test every CTA, and review image/font loading. Customer figures, endorsements, integration availability and production claims require real supporting evidence before publication.

## Verification record · 11 October 2026

- Desktop: visually reviewed the full page at 1440 × 1000; Manrope and both images loaded successfully.
- Mobile: reviewed 390 × 844 and 320 × 568; no horizontal document overflow. Preview tabs fit the narrowest tested screen.
- Short landscape: at 844 × 390, the menu is viewport-height and scrollable, so its bottom actions remain reachable.
- Interactions: Build/Serve tabs update the content and route; ArrowRight moves both selection and focus. FAQ disclosure opens correctly. Mobile menu supports initial focus, Tab wrapping, Escape, scroll-lock restoration and section-link dismissal.
- Demo: the main CTA opens the existing dashboard without changing data.
- Accessibility review: descriptive image alternatives, sample-data labels, keyboard controls, visible focus colours and improved muted-text contrast. Reduced-motion CSS disables animation and transitions; OS-level reduced-motion emulation and a formal accessibility audit were not performed.
- Automated verification: TypeScript and targeted ESLint pass; all 274 tests across 25 test files pass; whitespace checks pass.
- Sharing: Open Graph/Twitter metadata and a visually reviewed 1200 × 630 PNG are included. Set the existing `NEXT_PUBLIC_SITE_URL` configuration to the final public domain before publishing.
- Development-only note: React's debugging eval warning is blocked by the existing strict content security policy. The policy was not weakened; a production build is not claimed by this verification.

Preview captures: `docs/brand/propbrew-website-desktop.jpg`, `docs/brand/propbrew-website-full.jpg` and `docs/brand/propbrew-website-mobile.jpg`.

This is a completed local website identity implementation, not a production deployment, conversion guarantee, trademark clearance or confirmation that live integrations are activated.
