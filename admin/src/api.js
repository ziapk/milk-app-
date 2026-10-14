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

// Sends a file as the raw request body. XHR (not fetch) so the upload can report progress.
export function uploadFile(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/admin${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Admin", "1");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401) onUnauthorized();
      reject(new ApiError(xhr.status, data.error || "server_error"));
    };
    xhr.onerror = () => reject(new ApiError(0, "offline"));
    xhr.send(file);
  });
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
  invalid_supplier: 'Enter a supplier name and a rate of 0 or more',
  invalid_customer:
    "Enter a customer name, and a rate and daily litres of 0 or more",
  phone_taken: "A user with this phone number already exists",
  cannot_delete_self: "You can't delete your own account",
  not_found: "Not found — it may have been deleted",
  offline: "Cannot reach the server",
  not_apk: "That file is not a valid APK",
  wrong_app: "That APK is not the Partner app or the Admin app",
  debug_build: "That is a debug build. Upload the release APK",
  not_newer: "That version is not newer than the published one. Bump the version and build again",
  too_large: "The file is too large",
  no_release: "No release has been published yet",
  empty_message: "Write a reply first",
  invalid_fee: "Enter a fee of 0 or more and a month",
  invalid_payment: "Enter an amount more than 0 and a month (up to 2 years ahead)",
  invalid_billing: "Check the values: grace days 0–60, fee 0 or more",
  nothing_due: "Those months are already paid",
  before_start: "That month is before billing started for this partner",
  cannot_delete_fee: "The first fee can't be removed. Change the fee instead",
};
export const errorText = (err) =>
  MESSAGES[err?.code] || "Something went wrong, please try again";
