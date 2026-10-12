import express from "express";
import { register, login, logout, logoutOthers, deleteAccount } from "../controllers/authController.js";
import { requireAuth } from "../controllers/requireAuth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.post("/logout-others", requireAuth, logoutOthers);
router.post("/delete-account", requireAuth, deleteAccount);

export default router;
