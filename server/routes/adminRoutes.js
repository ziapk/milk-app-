import express from "express";
import { overview, listUsers, createUser, userDetail, setDisabled, unlock, resetPin, logoutAll, deleteUser,
  listCustomers, createCustomer, updateCustomer,
  listSuppliers, createSupplier, updateSupplier, supplierLedger } from "../controllers/adminController.js";
import { login, logout, me, changePassword, listAdmins, createAdmin, deleteAdmin } from "../controllers/adminAuthController.js";
import { requireAdmin } from "../controllers/requireAdmin.js";
import { currentRelease, uploadRelease, updateRelease } from "../controllers/appController.js";
import { billingList, billingUser, getBillingSettings, putBillingSettings, setFee, deleteFee, addPayment,
  deletePayment, setRules } from "../controllers/billingController.js";
import { adminTickets, adminFile, replyTicket, setTicketStatus, deleteTicket, getContact, saveContact } from "../controllers/supportController.js";

const router = express.Router();

// Support attachments load in <img>/<audio>, which can't send the X-Admin header. Read-only, so
// the session cookie alone is enough.
router.get("/support/files/:name", requireAdmin, adminFile);

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

router.get("/suppliers", listSuppliers);
router.post("/users/:id/suppliers", createSupplier);
router.put("/users/:id/suppliers/:supplierId", updateSupplier);
router.get("/users/:id/suppliers/:supplierId/ledger", supplierLedger);

// Monthly app fee (subscription) per partner.
router.get("/billing", billingList);
router.get("/billing/settings", getBillingSettings);
router.put("/billing/settings", putBillingSettings);
router.delete("/billing/payments/:paymentId", deletePayment);
router.get("/users/:id/billing", billingUser);
router.post("/users/:id/billing/fee", setFee);
router.delete("/users/:id/billing/fee/:feeId", deleteFee);
router.post("/users/:id/billing/payments", addPayment);
router.put("/users/:id/billing/rules", setRules);

router.get("/admins", listAdmins);
router.post("/admins", createAdmin);
router.delete("/admins/:id", deleteAdmin);

// Android app release (in-app updates): body of the POST is the raw APK file.
router.get("/release", currentRelease);
router.post("/release", uploadRelease);
router.put("/release/:app", updateRelease);

router.get("/support", adminTickets);
router.post("/support/:id/reply", replyTicket);
router.post("/support/:id/status", setTicketStatus);
router.delete("/support/:id", deleteTicket);
router.get("/support-contact", getContact);
router.put("/support-contact", saveContact);

export default router;
