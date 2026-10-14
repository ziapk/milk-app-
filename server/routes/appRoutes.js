import express from "express";
import { latest, download } from "../controllers/appController.js";

const router = express.Router();

// ?app=partner (default) or ?app=admin

router.get("/latest", latest);
router.get("/download", download);

export default router;
