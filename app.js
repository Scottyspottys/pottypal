// --- Config ---
const PRICES = { standard: 170, flush: 230 };
const DELIVERY_FEE = 20; // one-time
const ENDPOINT_URL = ""; // optional webhook URL (Apps Script etc.)

// Install PWA button behavior (Android shows prompt; iOS gets a tip)
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
if (installBtn) installBtn.style.display = "none";
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

// --- Form & local storage ---
const $ = (sel) => document.querySelector(sel);
const form = $("#orderForm");
const rememberEl = $("#rememberMe");
const STORAGE_KEY = "pottypal.billing.v1";

function saveBilling() {
  if (!rememberEl?.checked) return;
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
    ["name","company","billingAddress","email","phone"].forEach(k => { if (d[k]) form[k].value = d[k]; });
  } catch {}
}
function clearBilling() {
  localStorage.removeItem(STORAGE_KEY);
  ["name","company","billingAddress","email","phone"].forEach(k => form[k].value = "");
}

// --- Submit handler (no radius logic) ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
 const units = Math.max(1, parseInt(form.units.value || "1", 10));
const unitType = form.unitType.value;
const price = PRICES[unitType] * units;         // monthly subtotal (rental only)
const firstInvoice = price + DELIVERY_FEE;      // rental + one-time delivery

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
    estMonthlySubtotalCAD: PRICES[unitType] * units,
    notes: form.notes.value
  }
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
    } else {
      // Pretty mailto fallback (clean text)
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

document.getElementById("clearBtn")?.addEventListener("click", () => {
  if (confirm("Clear saved billing info from this device?")) {
    clearBilling();
    alert("Saved info cleared from this device.");
  }
});

// Init
(function init(){
  const today = new Date().toISOString().slice(0,10);
  document.getElementById("dateNeeded").min = today;
  loadBilling();
})();

// Service worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
