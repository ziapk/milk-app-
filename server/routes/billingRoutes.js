import express from "express";
import { myBilling } from "../controllers/billingController.js";
import { requireAuth } from "../controllers/requireAuth.js";

const router = express.Router();

// POST like the rest of the app API (the app's api() helper only POSTs).
router.post("/mine", requireAuth, myBilling);

export default router;
