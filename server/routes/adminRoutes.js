import express from "express";
import { overview, listUsers, createUser, userDetail, setDisabled, unlock, resetPin, logoutAll, deleteUser,
  listCustomers, createCustomer, updateCustomer } from "../controllers/adminController.js";
import { login, logout, me, changePassword, listAdmins, createAdmin, deleteAdmin } from "../controllers/adminAuthController.js";
import { requireAdmin } from "../controllers/requireAdmin.js";

const router = express.Router();

// Extra CSRF guard on top of the SameSite cookie: other sites can't add a custom header
// to a request without CORS permission.
router.use((req, res, next) => {
  if (req.get("x-admin") !== "1") return res.status(403).json({ error: "forbidden" });
  next();
});

router.post("/login", login);

router.use(requireAdmin);
router.post("/logout", logout);
router.get("/me", me);
router.post("/me/password", changePassword);

router.get("/overview", overview);
router.get("/users", listUsers);
router.post("/users", createUser);
router.get("/users/:id", userDetail);
router.post("/users/:id/disabled", setDisabled);
router.post("/users/:id/unlock", unlock);
router.post("/users/:id/reset-pin", resetPin);
router.post("/users/:id/logout", logoutAll);
router.delete("/users/:id", deleteUser);

router.get("/customers", listCustomers);
router.post("/users/:id/customers", createCustomer);
router.put("/users/:id/customers/:customerId", updateCustomer);

router.get("/admins", listAdmins);
router.post("/admins", createAdmin);
router.delete("/admins/:id", deleteAdmin);

export default router;
