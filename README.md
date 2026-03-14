<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f25b73b8-bd71-46be-9385-8aa256c2f235

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This repo is configured to auto-deploy to GitHub Pages when pushing to `main`.

1. Open GitHub repo settings: `Settings -> Pages`
2. In **Build and deployment**, set **Source** to `GitHub Actions`
3. Push the latest `main` branch
4. Wait for workflow `Deploy to GitHub Pages` to finish

Expected site URL:

`https://l12x21y.github.io/xuhui-grid-heat-simulator/`

Notes:

- The build step automatically generates static data files into `public/api/data/*.json`
- In production, the frontend reads static JSON first, then falls back to API paths if available
