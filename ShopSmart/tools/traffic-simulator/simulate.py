#!/usr/bin/env python3
"""
ShopSmart traffic simulator.

Fake Indian customers (made with Faker) use the real ShopSmart backend through the API gateway:
they sign up with a consent choice, browse, search, save addresses, keep a wishlist, place
cash-on-delivery orders, cancel, return, review, change their marketing consent and delete
their accounts. A store admin moves orders through fulfilment, looks at customer records and
sends promotions. Every one of these actions produces real log lines in backend/logs/.

With --scenario demo the simulator also turns the demo violation switches on and off on a
timeline, so the logs contain labelled DPDP violations (answer key in backend/logs/ground-truth/).

Examples:
  python simulate.py --minutes 10
  python simulate.py --minutes 20 --scenario demo
  python simulate.py --minutes 5 --enable PII_IN_LOGS

All people are fictional. Emails use the reserved example.com / example.in / example.org
domains, and Aadhaar / PAN numbers are random values in the valid format, belonging to no one.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import threading
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

try:
    import requests
    from faker import Faker
except ImportError:  # pragma: no cover
    sys.exit("Missing packages. Run:  pip install requests faker")

SWITCHES = ["PII_IN_LOGS", "OUT_OF_SCOPE_PROCESSING", "RETENTION_BYPASS", "SCHEMA_DRIFT"]
AUTH = "/authentication-service/auth"
PRODUCTS = "/product-service/products"
CUSTOMERS = "/customer-service/customers"
ORDERS = "/order-service/orders"
NOTIFICATIONS = "/notification-service/notifications"
SAFE_DOMAINS = ["example.com", "example.in", "example.org"]
SEARCH_TERMS = ["shoe", "watch", "phone", "bag", "lamp", "tea", "yoga", "book", "rice", "serum", "headphones",
                "kurta", "mug", "toy", "bottle", "cooker", "s", "c", "mat", "laptop"]
RETURN_REASONS = ["Damaged or defective", "Wrong item received", "Not as described", "Size or fit issue",
                  "Quality not as expected", "No longer needed"]
REVIEW_TITLES = {5: ["Excellent", "Love it", "Worth every rupee"], 4: ["Very good", "Happy with it"],
                 3: ["Okay for the price", "Average"], 2: ["Not great"], 1: ["Disappointed"]}

# Verhoeff tables, used to give fake Aadhaar numbers a valid checksum.
_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def fake_aadhaar(rng: random.Random) -> str:
    digits = [rng.randint(2, 9)] + [rng.randint(0, 9) for _ in range(10)]
    c = 0
    for i, d in enumerate(reversed(digits)):
        c = _D[c][_P[(i + 1) % 8][d]]
    n = "".join(map(str, digits + [_INV[c]]))
    return f"{n[:4]} {n[4:8]} {n[8:]}"


def fake_pan(rng: random.Random) -> str:
    letters = string.ascii_uppercase
    return ("".join(rng.choice(letters) for _ in range(3)) + rng.choice("PCHFAT") + rng.choice(letters)
            + "".join(rng.choice(string.digits) for _ in range(4)) + rng.choice(letters))


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


@dataclass
class Account:
    email: str
    password: str
    name: str
    phone: str | None
    marketing: bool
    deleted: bool = False
    orders: list[int] = field(default_factory=list)


class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.counts: Counter = Counter()
        self.status: Counter = Counter()

    def add(self, key: str, n: int = 1):
        with self.lock:
            self.counts[key] += n

    def http(self, code: int):
        with self.lock:
            self.status[code] += 1


class Api:
    """One browser-like session: cookies (refresh token), bearer token, a fresh X-Trace-Id per call."""

    def __init__(self, base: str, stats: Stats, timeout: float = 20):
        self.base = base.rstrip("/")
        self.http = requests.Session()
        self.token: str | None = None
        self.stats = stats
        self.timeout = timeout

    def call(self, method: str, path: str, body=None, idem: str | None = None, retry_auth=True):
        headers = {"Accept": "application/json", "X-Trace-Id": str(uuid.uuid4())}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if idem:
            headers["Idempotency-Key"] = idem
        try:
            r = self.http.request(method, self.base + path, json=body, headers=headers, timeout=self.timeout)
        except requests.RequestException:
            self.stats.add("network_errors")
            return None, None
        self.stats.http(r.status_code)
        if r.status_code == 401 and retry_auth and self.token and not path.startswith(AUTH):
            if self.refresh():
                return self.call(method, path, body, idem, retry_auth=False)
        try:
            data = r.json() if r.content else None
        except ValueError:
            data = None
        return r.status_code, data

    def refresh(self) -> bool:
        code, data = self.call("POST", f"{AUTH}/refresh", retry_auth=False)
        if code == 200 and data:
            self.token = data.get("accessToken")
            return True
        return False

    def login(self, email: str, password: str) -> bool:
        code, data = self.call("POST", f"{AUTH}/login", {"email": email, "password": password}, retry_auth=False)
        if code == 200 and data:
            self.token = data.get("accessToken")
            return True
        return False

    def logout(self):
        self.call("POST", f"{AUTH}/logout", retry_auth=False)
        self.token = None


class Simulator:
    def __init__(self, args):
        self.args = args
        self.rng = random.Random(args.seed)
        self.fake = Faker("en_IN")
        Faker.seed(args.seed)
        self.stats = Stats()
        self.lock = threading.Lock()
        self.accounts: list[Account] = []
        self.products: list[dict] = []
        self.stop_at = time.time() + args.minutes * 60
        self.store_file = Path(args.accounts_file)
        self.load_accounts()

    # ------------------------------------------------------------------ data
    def load_accounts(self):
        if self.store_file.exists():
            try:
                for a in json.loads(self.store_file.read_text(encoding="utf-8")):
                    self.accounts.append(Account(**{k: a[k] for k in ("email", "password", "name", "phone", "marketing", "deleted")}))
            except (ValueError, KeyError, TypeError):
                print(f"[{now()}] Could not read {self.store_file}; starting with no saved customers.")

    def save_accounts(self):
        with self.lock:
            data = [{"email": a.email, "password": a.password, "name": a.name, "phone": a.phone,
                     "marketing": a.marketing, "deleted": a.deleted} for a in self.accounts]
        self.store_file.parent.mkdir(parents=True, exist_ok=True)
        self.store_file.write_text(json.dumps(data, indent=1), encoding="utf-8")

    def person(self):
        first, last = self.fake.first_name(), self.fake.last_name()
        email = f"{first}.{last}{self.rng.randint(10, 99999)}@{self.rng.choice(SAFE_DOMAINS)}".lower().replace(" ", "")
        phone = str(self.rng.randint(6, 9)) + "".join(str(self.rng.randint(0, 9)) for _ in range(9))
        return f"{first} {last}", email, phone

    def address(self, name: str, phone: str) -> dict:
        line2 = self.rng.choice(["", "", f"Near {self.fake.street_name()}", f"Flat {self.rng.randint(1, 40)}{self.rng.choice('ABCD')}"])
        roll = self.rng.random()
        if roll < self.args.aadhaar_rate:
            line2 = f"Aadhaar {fake_aadhaar(self.rng)} for delivery verification"
            self.stats.add("addresses_with_aadhaar")
        elif roll < self.args.aadhaar_rate + self.args.pan_rate:
            line2 = f"GST invoice PAN {fake_pan(self.rng)}"
            self.stats.add("addresses_with_pan")
        pincode = str(self.rng.randint(1, 9)) + "".join(str(self.rng.randint(0, 9)) for _ in range(5))
        return {"label": self.rng.choice(["Home", "Work", "Home"]), "fullName": name, "phone": phone,
                "line1": f"{self.rng.randint(1, 999)}, {self.fake.street_name()}"[:200], "line2": line2 or None,
                "city": self.fake.city()[:80], "state": self.fake.state()[:80], "pincode": pincode}

    def load_products(self, api: Api):
        code, data = api.call("GET", PRODUCTS)
        if code != 200 or not isinstance(data, list):
            sys.exit(f"Could not load products from {self.args.base}{PRODUCTS} (HTTP {code}). Is the backend running?")
        in_stock = [p for p in data if p.get("stockQuantity", 0) > 0]
        if in_stock:
            self.products = in_stock
        self.products_loaded_at = time.time()
        return data

    def maybe_reload_products(self, api: Api):
        if time.time() - getattr(self, "products_loaded_at", 0) > 60:
            self.products_loaded_at = time.time()
            code, data = api.call("GET", PRODUCTS)
            if code == 200 and isinstance(data, list):
                in_stock = [p for p in data if p.get("stockQuantity", 0) > 0]
                if in_stock:
                    self.products = in_stock

    # --------------------------------------------------------------- actions
    def browse(self, api: Api):
        roll = self.rng.random()
        if roll < 0.35:
            api.call("GET", f"{PRODUCTS}/search?q={self.rng.choice(SEARCH_TERMS)}&page=0&size=12")
        elif roll < 0.6:
            cat = self.rng.choice(self.products)["category"]
            sort = self.rng.choice(["relevance", "price_asc", "price_desc", "rating", "newest"])
            api.call("GET", f"{PRODUCTS}/search?category={cat}&sort={sort}&page=0&size=12")
        else:
            p = self.rng.choice(self.products)
            api.call("GET", f"{PRODUCTS}/{p['id']}")
            api.call("GET", f"{PRODUCTS}/{p['id']}/reviews?sort=recent&page=0&size=10")
        self.stats.add("browse")

    def sign_up(self) -> Account | None:
        api = Api(self.args.base, self.stats)
        name, email, phone = self.person()
        marketing = self.rng.random() < self.args.marketing_rate
        password = "Shop" + "".join(self.rng.choice(string.ascii_letters + string.digits) for _ in range(8)) + "7"
        body = {"name": name, "email": email, "password": password, "acceptPrivacyNotice": True,
                "marketingConsent": marketing}
        if self.rng.random() < 0.85:
            body["phone"] = phone
        code, data = api.call("POST", f"{AUTH}/register", body, retry_auth=False)
        if code != 201 or not data:
            self.stats.add("signup_failed")
            return None
        api.token = data.get("accessToken")
        acct = Account(email, password, name, body.get("phone"), marketing)
        with self.lock:
            self.accounts.append(acct)
        self.stats.add("signups")
        api.call("POST", f"{CUSTOMERS}/me/addresses", self.address(name, phone))
        self.stats.add("addresses")
        self.shop(api, acct)
        api.logout()
        return acct

    def session(self, acct: Account):
        api = Api(self.args.base, self.stats)
        if self.rng.random() < 0.05:
            api.login(acct.email, acct.password + "x")  # a mistyped password first
            self.stats.add("failed_logins")
        if not api.login(acct.email, acct.password):
            self.stats.add("login_failed")
            return
        self.stats.add("logins")
        api.call("GET", f"{CUSTOMERS}/me")
        api.call("GET", f"{NOTIFICATIONS}/me/unread-count")
        roll = self.rng.random()
        if roll < 0.08:
            new_phone = str(self.rng.randint(6, 9)) + "".join(str(self.rng.randint(0, 9)) for _ in range(9))
            api.call("PUT", f"{CUSTOMERS}/me", {"name": acct.name, "phone": new_phone})
            acct.phone = new_phone
            self.stats.add("profile_updates")
        elif roll < 0.18:
            api.call("POST", f"{CUSTOMERS}/me/addresses", self.address(acct.name, acct.phone or self.person()[2]))
            self.stats.add("addresses")
        if self.rng.random() < self.args.consent_change_rate:
            acct.marketing = not acct.marketing
            api.call("PUT", f"{CUSTOMERS}/me/consent", {"marketingConsent": acct.marketing})
            self.stats.add("consent_changes")
        self.shop(api, acct)
        self.after_sales(api, acct)
        if self.rng.random() < self.args.delete_rate * self.delete_boost():
            code, _ = api.call("POST", f"{CUSTOMERS}/me/deletion-request")
            if code == 200:
                acct.deleted = True
                self.stats.add("deletion_requests")
        api.logout()

    def shop(self, api: Api, acct: Account):
        for _ in range(self.rng.randint(0, 3)):
            self.browse(api)
        if self.rng.random() < 0.25:
            p = self.rng.choice(self.products)
            api.call("PUT", f"{CUSTOMERS}/me/wishlist/{p['id']}")
            self.stats.add("wishlist_adds")
        if self.rng.random() >= self.args.order_rate:
            return
        lines = [{"productId": p["id"], "quantity": self.rng.randint(1, 2)}
                 for p in self.rng.sample(self.products, k=min(len(self.products), self.rng.randint(1, 3)))]
        code, quote = api.call("POST", f"{ORDERS}/quote", {"items": lines})
        if code != 200 or not quote or not quote.get("valid", True):
            self.stats.add("quote_rejected")
            return
        code, addresses = api.call("GET", f"{CUSTOMERS}/me/addresses")
        if code != 200 or not addresses:
            addr = self.address(acct.name, acct.phone or self.person()[2])
            api.call("POST", f"{CUSTOMERS}/me/addresses", addr)
        else:
            addr = addresses[0]
        ship = {k: addr.get(k) for k in ("fullName", "phone", "line1", "line2", "city", "state", "pincode")}
        key = "sim-" + uuid.uuid4().hex[:20]
        body = {"items": lines, "shippingAddress": ship, "paymentMethod": "COD", "expectedTotal": quote.get("total")}
        code, order = api.call("POST", ORDERS, body, idem=key)
        if code in (200, 201) and order:
            acct.orders.append(order["id"])
            self.stats.add("orders")
            if self.rng.random() < 0.03:  # a double-click: same Idempotency-Key again
                api.call("POST", ORDERS, body, idem=key)
                self.stats.add("duplicate_submits")
        else:
            self.stats.add("order_rejected")

    def after_sales(self, api: Api, acct: Account):
        code, page = api.call("GET", f"{ORDERS}/me?page=0&size=10")
        if code != 200 or not page:
            return
        for o in page.get("content", []):
            status = o.get("status")
            if status in ("CONFIRMED", "PROCESSING") and self.rng.random() < 0.06:
                api.call("POST", f"{ORDERS}/me/{o['id']}/cancel", {"reason": "Changed my mind"})
                self.stats.add("cancellations")
            elif status == "DELIVERED":
                if self.rng.random() < 0.15:
                    reason = self.rng.choice(RETURN_REASONS)
                    api.call("POST", f"{ORDERS}/me/{o['id']}/return", {"reason": reason})
                    self.stats.add("return_requests")
                elif self.rng.random() < 0.4 and o.get("items"):
                    item = self.rng.choice(o["items"])
                    rating = self.rng.choices([5, 4, 3, 2, 1], weights=[40, 30, 15, 10, 5])[0]
                    api.call("PUT", f"{PRODUCTS}/{item['productId']}/reviews/me",
                             {"rating": rating, "title": self.rng.choice(REVIEW_TITLES[rating]),
                              "comment": self.fake.sentence(nb_words=12)})
                    self.stats.add("reviews")

    def delete_boost(self) -> float:
        return 6.0 if getattr(self, "boost_deletions", False) else 1.0

    # ----------------------------------------------------------------- admin
    def admin_loop(self, api: Api):
        last_campaign = time.time()
        while time.time() < self.stop_at:
            for status, target in (("SHIPPED", "DELIVERED"), ("PROCESSING", "SHIPPED"), ("CONFIRMED", "PROCESSING"),
                                   ("RETURN_REQUESTED", "RETURNED")):
                code, page = api.call("GET", f"{ORDERS}?page=0&size=10&status={status}")
                if code == 401 and not self.admin_login(api):
                    return
                for o in (page or {}).get("content", [])[:4]:
                    if self.rng.random() < 0.7:
                        api.call("PATCH", f"{ORDERS}/{o['id']}/status", {"status": target, "note": "Updated by fulfilment team"})
                        self.stats.add("admin_status_updates")
            if self.rng.random() < 0.5:
                code, catalogue = api.call("GET", PRODUCTS)
                for p in (catalogue or [])[:200] if isinstance(catalogue, list) else []:
                    if p.get("stockQuantity", 0) < 5:
                        api.call("PATCH", f"{PRODUCTS}/{p['id']}/stock", {"delta": 40, "reason": "Restock from supplier"})
                        self.stats.add("admin_restocks")
            if self.rng.random() < 0.3:
                code, people = api.call("GET", CUSTOMERS)
                self.stats.add("admin_customer_list_views")
                if code == 200 and people and self.rng.random() < 0.5:
                    api.call("GET", f"{CUSTOMERS}/{self.rng.choice(people)['id']}")
                    self.stats.add("admin_customer_views")
            if time.time() - last_campaign > self.args.campaign_every * 60:
                self.campaign(api)
                last_campaign = time.time()
            self.sleep(self.rng.uniform(8, 15))

    def admin_login(self, api: Api) -> bool:
        ok = api.login(self.args.admin_email, self.args.admin_password)
        if not ok:
            print(f"[{now()}] Admin sign-in failed for {self.args.admin_email}. Admin actions and scenarios are skipped.")
        return ok

    def campaign(self, api: Api):
        code, data = api.call("POST", f"{CUSTOMERS}/admin/campaigns", {"message": "New arrivals this week. Take a look."})
        if code == 200 and data:
            self.stats.add("campaigns")
            print(f"[{now()}] Promotion {data.get('campaignId')} sent to {data.get('recipients')} customers")

    def set_switch(self, api: Api, name: str, on: bool):
        code, _ = api.call("PUT", f"{CUSTOMERS}/admin/demo-violations/{name}", {"enabled": on})
        print(f"[{now()}] {'ON ' if on else 'OFF'} {name}" + ("" if code == 200 else f"  (failed: HTTP {code})"))

    def scenario_loop(self, api: Api):
        if self.args.scenario == "demo":
            total = self.args.minutes * 60
            # (start fraction, end fraction, switch); gaps between windows are normal traffic.
            plan = [(0.15, 0.32, "PII_IN_LOGS"), (0.38, 0.55, "OUT_OF_SCOPE_PROCESSING"),
                    (0.60, 0.80, "RETENTION_BYPASS"), (0.84, 0.95, "SCHEMA_DRIFT")]
            start = time.time()
            for begin, end, name in plan:
                self.sleep_until(start + begin * total)
                if time.time() >= self.stop_at:
                    break
                self.set_switch(api, name, True)
                if name == "OUT_OF_SCOPE_PROCESSING":
                    self.sleep(min(20, (end - begin) * total / 3))
                    self.campaign(api)
                if name == "RETENTION_BYPASS":
                    self.boost_deletions = True
                self.sleep_until(start + end * total)
                self.boost_deletions = False
                self.set_switch(api, name, False)
        elif self.args.enable:
            for name in self.args.enable:
                self.set_switch(api, name, True)

    # ------------------------------------------------------------------ run
    def sleep(self, seconds: float):
        time.sleep(max(0.0, min(seconds, self.stop_at - time.time())))

    def sleep_until(self, t: float):
        self.sleep(t - time.time())

    def customer_worker(self):
        api = Api(self.args.base, self.stats)
        while time.time() < self.stop_at:
            active = [a for a in self.accounts if not a.deleted]
            roll = self.rng.random()
            try:
                self.maybe_reload_products(api)
                if roll < 0.3:
                    self.browse(api)
                elif len(active) < self.args.customers or roll < 0.36:
                    self.sign_up()
                else:
                    self.session(self.rng.choice(active))
            except Exception as exc:  # keep the simulation running whatever one action does
                self.stats.add("action_errors")
                if self.args.verbose:
                    print(f"[{now()}] action failed: {exc!r}")
            self.sleep(self.rng.uniform(*self.args.pace))

    def run(self):
        print(f"[{now()}] ShopSmart traffic simulator: {self.args.minutes} min, {self.args.workers} customer workers, "
              f"scenario={self.args.scenario}, gateway={self.args.base}")
        probe = Api(self.args.base, self.stats)
        self.load_products(probe)
        print(f"[{now()}] Loaded {len(self.products)} products in stock.")
        admin = Api(self.args.base, self.stats)
        has_admin = self.admin_login(admin)
        if not has_admin and (self.args.scenario == "demo" or self.args.enable):
            print(f"[{now()}] Scenarios need the admin account; running normal traffic only.")
        threads = [threading.Thread(target=self.customer_worker, daemon=True) for _ in range(self.args.workers)]
        if has_admin:
            threads.append(threading.Thread(target=self.admin_loop, args=(admin,), daemon=True))
            scen_api = Api(self.args.base, self.stats)
            if scen_api.login(self.args.admin_email, self.args.admin_password):
                threads.append(threading.Thread(target=self.scenario_loop, args=(scen_api,), daemon=True))
        for t in threads:
            t.start()
        try:
            while time.time() < self.stop_at:
                time.sleep(min(30, max(0.5, self.stop_at - time.time())))
                c = self.stats.counts
                print(f"[{now()}] signups={c['signups']} logins={c['logins']} orders={c['orders']} "
                      f"returns={c['return_requests']} reviews={c['reviews']} deletions={c['deletion_requests']} "
                      f"requests={sum(self.stats.status.values())}")
        except KeyboardInterrupt:
            print(f"\n[{now()}] Stopping early...")
            self.stop_at = time.time()
        for t in threads:
            t.join(timeout=25)
        if has_admin and (self.args.scenario == "demo" or self.args.enable) and not self.args.leave_switches:
            reset = Api(self.args.base, self.stats)
            if reset.login(self.args.admin_email, self.args.admin_password):
                for name in SWITCHES:
                    reset.call("PUT", f"{CUSTOMERS}/admin/demo-violations/{name}", {"enabled": False})
                print(f"[{now()}] All demo switches turned off.")
        self.save_accounts()
        self.report()

    def report(self):
        c, s = self.stats.counts, self.stats.status
        print("\nSummary")
        for key in sorted(c):
            print(f"  {key:28} {c[key]}")
        print("  HTTP status counts         " + ", ".join(f"{k}: {v}" for k, v in sorted(s.items())))
        print(f"\nSaved {len(self.accounts)} fictional customers to {self.store_file} (reused next run).")
        print("Logs: backend/logs/   Answer key: backend/logs/ground-truth/   Export: python tools/export_logs.py")


def main():
    ap = argparse.ArgumentParser(description="Generate realistic ShopSmart traffic (and optional labelled DPDP violations).")
    ap.add_argument("--base", default=os.environ.get("SHOPSMART_GATEWAY", "http://localhost:8080"), help="API gateway URL")
    ap.add_argument("--minutes", type=float, default=10, help="how long to run (default 10)")
    ap.add_argument("--workers", type=int, default=4, help="parallel customers (default 4)")
    ap.add_argument("--customers", type=int, default=25, help="sign up new customers until this many exist")
    ap.add_argument("--pace", type=float, nargs=2, default=(0.5, 2.5), metavar=("MIN", "MAX"), help="seconds between actions")
    ap.add_argument("--scenario", choices=["none", "demo"], default="none",
                    help="demo: turn each violation switch on for a window of the run")
    ap.add_argument("--enable", nargs="*", choices=SWITCHES, default=[], help="turn these switches on for the whole run")
    ap.add_argument("--leave-switches", action="store_true", help="do not turn the switches off at the end")
    ap.add_argument("--admin-email", default=os.environ.get("ADMIN_EMAIL", "admin@shopsmart.local"))
    ap.add_argument("--admin-password", default=os.environ.get("ADMIN_PASSWORD", "AdminPass12345"))
    ap.add_argument("--marketing-rate", type=float, default=0.4, help="share of sign-ups that accept marketing")
    ap.add_argument("--order-rate", type=float, default=0.45, help="chance a shopping visit ends in an order")
    ap.add_argument("--delete-rate", type=float, default=0.02, help="chance a session ends with an account deletion request")
    ap.add_argument("--consent-change-rate", type=float, default=0.05, help="chance a session changes marketing consent")
    ap.add_argument("--aadhaar-rate", type=float, default=0.05, help="share of addresses that include a fake Aadhaar number")
    ap.add_argument("--pan-rate", type=float, default=0.03, help="share of addresses that include a fake PAN")
    ap.add_argument("--campaign-every", type=float, default=4, help="minutes between promotions (admin)")
    ap.add_argument("--accounts-file", default=str(Path(__file__).with_name("customers.json")))
    ap.add_argument("--seed", type=int, default=None, help="random seed for a repeatable run")
    ap.add_argument("--verbose", action="store_true")
    Simulator(ap.parse_args()).run()


if __name__ == "__main__":
    main()
