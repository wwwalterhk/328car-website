# OpenNext Starter

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Read the documentation at https://opennext.js.org/cloudflare.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Tailwind class to adjust page width
Yes. In Tailwind, max-w-6xl is wider than max-w-5xl.

Typical Tailwind defaults (unless you changed the config):

max-w-5xl ≈ 64rem (about 1024px)

max-w-6xl ≈ 72rem (about 1152px)

So switching from max-w-5xl → max-w-6xl increases the container width by 8rem (~128px), which will be noticeable, especially on desktop.

If you want “Apple-like” premium spacing, max-w-5xl usually reads better. If you want to show more cards per row with less scrolling, max-w-6xl is more practical.
