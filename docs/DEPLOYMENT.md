# PRODUCTION SETUP & DEPLOYMENT MANUAL
## Dube Man Innovation System

Follow these step-by-step instructions to configure, test, and deploy the Dube Man Innovation System MVP.

---

### 1. Prerequisite Packages & Runtime
Ensure you have the following installed:
- **Node.js**: v18.x or v20.x
- **NPM**: v9.x+
- **Supabase Account**: A free or paid cloud instance (or a local Docker-based Supabase daemon).

---

### 2. Local Installation & Development Commands

1. **Clone and Enter Directory**:
   ```bash
   cd dube-man-system/
   ```

2. **Install All Node Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` in the frontend path to `.env`:
   ```bash
   cp frontend/.env.example .env
   ```
   *Modify the file to include your personal Supabase URL and Anon API key.*

4. **Boot Development Environment**:
   ```bash
   npm run dev
   ```
   *The server binds to port `@3000` on localhost by default.*

5. **Generate Production Bundles**:
   ```bash
   npm run build
   ```

---

### 3. Setting Up Your Supabase Database

1. Sign in to the **[Supabase Console](https://supabase.com/)** and create a database instance name "dube-man-innovation".
2. Open the **SQL Editor** in the side navigation panel.
3. Open the file `database/schema.sql` inside this project codebase, copy the entire SQL script, and paste it into the editor.
4. Click **Run** to execute the script. This instantly builds:
   - Your primary tables (`users`, `products`, `customers`, `sales`, `printing_orders`, `computers`, `cafe_sessions`...).
   - Row-Level Security checks and profiles.
   - Database trigger handlers to automatically deduct inventories on sales.

---

### 4. Deploying to Vercel (Frontend)

1. **Commit and Push changes** to your GitHub repository.
2. Visit **[Vercel](https://vercel.com/)**, select **New Project**, and connect your GitHub repository.
3. Configure the following **Environment Variables** during project setup:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy the project! Vite will automatically compile your assets into static client code ready to be served globally.
