# Highway Academy Poster Generator — Server

## Deploy to Render.com (free)

1. Push this folder to a new GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click Deploy — takes ~2 minutes
6. Copy your Render URL (e.g. https://your-app.onrender.com)
7. Paste it into the HTML frontend when prompted

## Local development
```
npm install
node server.js
```
Server runs on http://localhost:3000
