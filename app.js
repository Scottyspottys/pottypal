// Install PWA button behavior
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");

// hide by default
if (installBtn) installBtn.style.display = "none";

// Android/Chromium: show when event fires
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = "inline-flex";
});

installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = "none";
});

// iOS hint (no API)
document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".app-header");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isIOS && !isStandalone && header) {
    const tip = document.createElement("div");
    tip.className = "notice";
    tip.style.marginLeft = "auto";
    tip.style.fontSize = "13px";
    tip.textContent = "On iPhone: Share → Add to Home Screen to install";
    header.appendChild(tip);
  }
});
const CHESLEY = { lat: 44.301, lng: -81.102 };
const DELIVERY_RADIUS_KM = 30;
const PRICES = { standard: 170, flush: 230 };
const ENDPOINT_URL = ""; // optional webhook URL

const $ = (sel) => document.querySelector(sel);
const form = $("#orderForm");
const rememberEl = $("#rememberMe");
const geoNotice = $("#geoNotice");

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function distanceFromDeviceToChesley() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversine(pos.coords.latitude, pos.coords.longitude, CHESLEY.lat, CHESLEY.lng);
        resolve(d);
      },
      () => resolve(null),
      { timeout: 4000 }
    );
  });
}

function setNotice(kind, msg) {
  geoNotice.classList.remove("hidden", "bad", "good");
  if (kind === "bad") geoNotice.classList.add("bad");
  if (kind === "good") geoNotice.classList.add("good");
  geoNotice.textContent = msg;
}
function clearNotice() {
  geoNotice.classList.add("hidden");
  geoNotice.textContent = "";
}

const STORAGE_KEY = "pottypal.billing.v1";
function saveBilling() {
  if (!rememberEl.checked) return;
  const data = {
    name: form.name.value,
    company: form.company.value,
    billingAddress: form.billingAddress.value,
    email: form.email.value,
    phone: form.phone.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function loadBilling() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    ["name","company","billingAddress","email","phone"].forEach(k => {
      if (d[k]) form[k].value = d[k];
    });
  } catch {}
}
function clearBilling() {
  localStorage.removeItem(STORAGE_KEY);
  ["name","company","billingAddress","email","phone"].forEach(k => form[k].value = "");
}

async function validateRadius() {
  clearNotice();
  const deviceDist = await distanceFromDeviceToChesley();
  if (deviceDist !== null) {
    if (deviceDist <= DELIVERY_RADIUS_KM) {
      setNotice("good", `Looks good: ~${deviceDist.toFixed(1)} km from Chesley.`);
      return true;
    } else {
      setNotice("bad", `Heads up: You appear to be ~${deviceDist.toFixed(1)} km from Chesley (outside the ~${DELIVERY_RADIUS_KM} km area). You can still submit; we’ll confirm availability.`);
      return false;
    }
  }
  setNotice("", "Couldn’t check your distance automatically. Submit anyway; we’ll confirm.");
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const units = Math.max(1, parseInt(form.units.value || "1", 10));
  const unitType = form.unitType.value;
  await validateRadius();
  saveBilling();
  const payload = {
    source: "pottypal-pwa",
    timestamp: new Date().toISOString(),
    billing: {
      name: form.name.value,
      company: form.company.value,
      billingAddress: form.billingAddress.value,
      email: form.email.value,
      phone: form.phone.value,
    },
    job: {
      jobLocation: form.jobLocation.value,
      dateNeeded: form.dateNeeded.value,
      units,
      unitType,
      monthlyPriceCAD: PRICES[unitType],
      estMonthlySubtotalCAD: PRICES[unitType]*units,
      notes: form.notes.value
    },
    radiusKm: DELIVERY_RADIUS_KM,
    chesley: CHESLEY
  };

  try {
    if (ENDPOINT_URL) {
      const res = await fetch(ENDPOINT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      alert("Thanks! Your order has been submitted. We’ll confirm shortly.");
      form.reset();
      loadBilling();
      clearNotice();
    } else {
  // Build a clean, human-readable email body (no braces)
  const pretty = [
    "NEW POTTYPAL ORDER",
    "------------------------------",
    `Name: ${form.name.value}`,
    `Company: ${form.company.value || "-"}`,
    `Billing Address: ${form.billingAddress.value}`,
    `Email: ${form.email.value}`,
    `Phone: ${form.phone.value}`,
    "",
    "JOB DETAILS",
    "------------------------------",
    `Delivery Location: ${form.jobLocation.value}`,
    `Date Required: ${form.dateNeeded.value}`,
    `Units: ${units}`,
    `Unit Type: ${unitType === "standard" ? "Standard (w/ sanitizer) – $170/mo" : "Flush (w/ sink) – $230/mo"}`,
    `Est. Monthly Subtotal: $${price.toFixed(2)} CAD`,
    "",
    `Notes: ${form.notes.value || "-"}`,
    "",
    "SYSTEM",
    "------------------------------",
    `Radius note: Checked client-side against ~${DELIVERY_RADIUS_KM} km from Chesley`,
    `Submitted: ${new Date().toLocaleString()}`
  ].join("\n");

  const subject = encodeURIComponent("New Scotty’s Pottys Order via PottyPal");
  const body = encodeURIComponent(pretty);
  window.location.href = `mailto:scottyspottys11@gmail.com?subject=${subject}&body=${body}`;
}
  } catch (err) {
    alert("Sorry—couldn’t submit right now. Please try again or call 519-706-6000.");
  }
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Clear saved billing info from this device?")) {
    clearBilling();
    alert("Saved info cleared from this device.");
  }
});

(function init(){
  const today = new Date().toISOString().slice(0,10);
  document.getElementById("dateNeeded").min = today;
  loadBilling();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
