

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

`https://l12x21y.github.io/xuhui-tool-0317/`

Notes:

- The build step automatically generates static data files into `public/api/data/*.json`
- In production, the frontend reads static JSON first, then falls back to API paths if available
