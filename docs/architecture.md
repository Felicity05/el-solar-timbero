# Architecture decisions

## Strict TypeScript

Application code uses TypeScript with `strict: true`. JSX components use `.tsx`;
non-JSX modules use `.ts`. Build-tool configuration can remain `.mjs`.
The `@/*` alias resolves to `src/*`.

The compiler catches implicit `any`; ESLint rejects explicit `any`. Types are
erased at runtime, so incoming RSVP data will still require server-side validation.

Run `npm run typecheck` to generate Next.js route types and check types without
emitting JavaScript. Run `npm run lint` separately. Next.js handles compilation
and checks types during production builds; build errors must not be suppressed.

The root layout explicitly types its props, using React's `ReactNode` for
`children` to accept renderable content rather than only text or a single element.
