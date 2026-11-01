# 🐝 WASP - Expense Tracker & Wealth Dashboard (₹ INR)

A comprehensive, fully formatted Microsoft Excel expense management system and dynamic web application with real-time analytics, automated date calculations, category drilldowns, and cash vs. online balance tracking.

🌐 **Live Web Application**: [https://devjoti2003.github.io/wasp/](https://devjoti2003.github.io/wasp/)

---

## 🚀 Key Features

* **📱 Android Mobile App & Offline PWA**:
  * Installable as a native-like standalone app on **Android devices** (as well as tablets and desktops).
  * Runs full screen without browser URL bars, includes an official launcher icon in your Android app drawer and home screen.
  * Instant offline loading and persistence powered by a Service Worker (`sw.js`) and Web App Manifest (`manifest.json`).

* **📅 Multi-Month "Sheets" Architecture**:
  * Designed for daily use across consecutive months (e.g. October 2026, November 2026, December 2026, etc.).
  * Dedicated **Month Sheets Switcher Bar** to toggle between months in one tap.
  * Independent monthly money pools (Cash Allotted, Online Allotted, Total Money) and distinct monthly expense ledgers.
  * Option to carry over budget allotments automatically to new months.
  * Cross-month historical trend analytics on the Summary dashboard.

* **👤 Multi-User Registration & Authentication**:
  * Users can register with Full Name, Email, and Password, or Sign In securely.
  * Native Web Crypto API password hashing (SHA-256 + cryptographic salt) with password reveal toggle (`👁️`).
  * **User Data Segregation**: Every user's expenses, categories, and money pool allotments are completely isolated.
  * Seamless account switching, user profile avatar badge, and guest/demo mode support.

* **💳 Dual Payment Modes (Cash & Online)**:
  * Select payment mode (`Cash` or `Online`) via a dropdown menu for every expense.
  * Direct balance impact: Cash payments deduct from your **Cash Balance**, while Online payments deduct from your **Online Balance**.
  * Dynamic visual progress bars tracking Cash and overall money usage.

* **🏷️ Customizable Categories (including Gifts)**:
  * 11 organized expense categories: *Meals, Food, Travel, Stationery, Subscriptions, Books & Courses, Health, Entertainment, Hostel & Utilities, Gifts, and Other*.
  * Automated category metrics: total spend, percentage share of total budget, and transaction counts.
  * Direct category drill-down view with chronological transaction history.

* **📈 Rich Visual Dashboards & Charts**:
  * **Where Your Money Stands**: Donut chart tracking total spend, remaining cash, and online balance.
  * **Share of Total Spend**: Donut chart highlighting expenditure percentage per category.
  * **Category Comparison**: Horizontal bar chart comparing spend across all categories.
  * **Monthly Trend**: 6-month historical monthly spend comparison.

* **📑 Structured Sheets Architecture**:
  1. **Summary**: Central command dashboard with KPI summary cards, allocation tables, and visual charts.
  2. **Log**: Daily transaction ledger with automated date assembly from Day/Month/Year dropdowns and sorting helpers.
  3. **Sorted Ledger**: Fully automated, chronological ledger tracking running totals.
  4. **Category View**: Dynamic category drilldown with summary statistics.
  5. **Lists**: Reference source lists for dropdown data validation.

---

## 📁 Files

* `claude.xlsx` — The complete Master Excel Workbook with all formulas, charts, and data validations.
