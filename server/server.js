import express from "express";
import cors from "cors";
import path from "node:path";
import authRoutes from "./routes/authRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);

// Serve the built app (npm run build in the parent folder) so one server hosts everything.
app.use(express.static(path.join(import.meta.dirname, "../dist")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

const port = Number(process.env.PORT) || 8000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
