// All dashboard calls go to /api/admin. The session lives in an HttpOnly cookie set at login;
// X-Admin is required by the server as a CSRF guard.
// Always same-origin: the API server also serves this dashboard (at /admin), and the session
// cookie is only kept for same-origin requests. Don't point this at a full http://host URL.
const BASE = "/api";
export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/admin${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Admin": "1" },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") onUnauthorized();
    throw new ApiError(res.status, data.error || "server_error");
  }
  return data;
}

const MESSAGES = {
  wrong_login: "Wrong username or password",
  locked: "Too many wrong tries. Try again in 15 minutes",
  wrong_password: "Current password is wrong",
  weak_password: "Password must be at least 8 characters",
  username_taken: "That username is already used",
  invalid_input:
    "Please fill in every field (username: 3+ letters, numbers, . _ -)",
  invalid_pin: "PIN must be 4–6 digits",
  invalid_user: "Enter a name and a phone number with at least 10 digits",
  invalid_customer:
    "Enter a customer name, and a rate and daily litres of 0 or more",
  phone_taken: "A user with this phone number already exists",
  cannot_delete_self: "You can't delete your own account",
  not_found: "Not found — it may have been deleted",
  offline: "Cannot reach the server",
};
export const errorText = (err) =>
  MESSAGES[err?.code] || "Something went wrong, please try again";
