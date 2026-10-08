# Sunnyside agency landing page

An implementation of the [Frontend Mentor Sunnyside agency landing page challenge](https://www.frontendmentor.io/challenges/agency-landing-page-7yVs3B6ef), using its supplied photography, icons, copy and design references.

Sunnyside is a fictional agency, so the page is static marketing content: a hero, two feature rows, two services, client testimonials and a project gallery. Navigation links jump to sections on the page. There are no forms, accounts or network writes.

## Development

Node 22.13 or later. Use `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`. Browser tests use installed Chrome and own port 4563.

Next 16.3.6, React 19.2.8, TypeScript 5.9.3 and Tailwind 4.2.1 are pinned to the family baseline. The page is a server component; only the small menu toggle is a client component.

## Sources

Original challenge files are preserved under `reference/`; supplied images moved byte-for-byte to `public/images/`. Sizes, spacing, type and the three arrangements follow the decoded Figma frames (Mobile 375, Tablet 768, Desktop 1440, the two Menu frames and Desktop - Active). Barlow 600 and Fraunces 700/900 are served through `next/font`. The logo and social icons are inlined from the supplied SVGs so they can follow `currentColor` (white in the hero, green in the footer, white on hover).

## Implementation choices

- The hamburger shows below 1024 px, as in the Mobile and Tablet frames. It's a real button with `aria-expanded`; the panel closes on Escape (focus returns to the button), an outside click, or choosing a link.
- "Learn more" links jump to the related section and are described by their row's heading, so the two identical labels stay distinguishable.
- The page background is white, as in the Figma frames (the JPG comps show a faint cream).
- The design sets testimonial roles at 14px and the Learn more and Contact labels at 15px. The family 16px floor raises them to 16px.
- Contrast: body copy, testimonial roles, the "Client testimonials" eyebrow, the footer links and the two service descriptions use darker shades of the design colours (4.5:1 or better for text, 3:1 for the large eyebrow) because the originals fall between 2.3:1 and 4.1:1. White hero text on the sky photo keeps the design colour as the challenge's identity and is flagged for review.
- One site name, "Sunnyside agency landing page", appears in the footer, `og:site_name` and `WebSite` JSON-LD. The canonical URL is the planned `agency-landing-page-fm.royeradames.com` production domain, which isn't attached yet.
