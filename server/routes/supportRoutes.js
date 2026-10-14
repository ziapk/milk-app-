import express from "express";
import { contact, createTicket, myTickets, myThread, userReply, myFile } from "../controllers/supportController.js";
import { requireAuth } from "../controllers/requireAuth.js";

const router = express.Router();

// POST like the rest of the app API (the app's api() helper only POSTs).
router.post("/contact", contact); // public: also shown on the login screen
router.post("/", requireAuth, createTicket);
router.post("/mine", requireAuth, myTickets);
router.post("/file", requireAuth, myFile);
router.post("/:id", requireAuth, myThread);
router.post("/:id/reply", requireAuth, userReply);

export default router;
