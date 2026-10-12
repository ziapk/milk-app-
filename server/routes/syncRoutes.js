import express from "express";
import { sync } from "../controllers/syncController.js";
import { requireAuth } from "../controllers/requireAuth.js";

const router = express.Router();

router.post("/", requireAuth, sync);

export default router;
