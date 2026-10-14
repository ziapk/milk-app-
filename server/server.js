import express from "express";
import cors from "cors";
import path from "node:path";
import authRoutes from "./routes/authRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import appRoutes from "./routes/appRoutes.js";
import { downloadPage } from "./controllers/appController.js";
import { migrate } from "./migrate.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/admin", adminRoutes);
// In-app updates for the Android app: GET /api/app/latest and /api/app/download
app.use("/api/app", appRoutes);

// Public download page for the Android apps: /download (partner) and /download?app=admin
app.get("/download", downloadPage);

// Admin dashboard (built with `npm run build:admin` in the parent folder): http://<server>/admin
app.use("/admin", express.static(path.join(import.meta.dirname, "admin-dist")));

// Serve the built app (npm run build in the parent folder) so one server hosts everything.
app.use(express.static(path.join(import.meta.dirname, "../dist")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

await migrate();

const port = Number(process.env.PORT) || 8000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
