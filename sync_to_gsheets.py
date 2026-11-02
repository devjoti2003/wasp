#!/usr/bin/env python3
"""
Continuous Sync Engine: Local Excel/Numbers -> Google Sheets
Spreadsheet ID: 1fYhyxU8h7x8eBFmRjKcgIlKxLG12LFFJ8d7bY3eHnmU
"""

import os
import sys
import json
import time
import datetime
import subprocess

SPREADSHEET_ID = "1fYhyxU8h7x8eBFmRjKcgIlKxLG12LFFJ8d7bY3eHnmU"
GSHEETS_CLI = "gsheets"
WORKSPACE_DIR = "/Users/devjotikundu/Desktop/untitled folder 3"
DESKTOP_DIR = "/Users/devjotikundu/Desktop"

DESKTOP_XLSX = os.path.join(DESKTOP_DIR, "NovemberExpenses.xlsx")
DESKTOP_NUMBERS = os.path.join(DESKTOP_DIR, "NovemberExpenses.numbers")
WORKSPACE_XLSX = os.path.join(WORKSPACE_DIR, "NovemberExpenses.xlsx")
LOG_FILE = os.path.join(WORKSPACE_DIR, "sync.log")

def log(msg):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] {msg}"
    print(formatted)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def sync_numbers_to_xlsx():
    """If Numbers file is newer than XLSX, export to XLSX."""
    if not os.path.exists(DESKTOP_NUMBERS):
        return
    
    num_mtime = os.path.getmtime(DESKTOP_NUMBERS)
    xlsx_mtime = os.path.getmtime(DESKTOP_XLSX) if os.path.exists(DESKTOP_XLSX) else 0

    if num_mtime > xlsx_mtime:
        log("NovemberExpenses.numbers is newer than XLSX; exporting via Numbers...")
        cmd = [
            "osascript", "-e", f"""
            tell application "Numbers"
                set doc to open POSIX file "{DESKTOP_NUMBERS}"
                delay 0.5
                export doc to POSIX file "{DESKTOP_XLSX}" as Microsoft Excel
                close doc saving no
            end tell
            """
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            log("Successfully exported Numbers to XLSX")
        except Exception as e:
            log(f"Export warning: {e}")

def run_sync():
    sync_numbers_to_xlsx()

    src_xlsx = DESKTOP_XLSX if os.path.exists(DESKTOP_XLSX) else WORKSPACE_XLSX
    if not os.path.exists(src_xlsx):
        log(f"Error: Source file {src_xlsx} not found.")
        return False

    log(f"Reading from {src_xlsx}...")
    import openpyxl

    wb = openpyxl.load_workbook(src_xlsx, data_only=False)
    ops = []

    # 1. Log sheet: B7:I106
    if "Log" in wb.sheetnames:
        ws_log = wb["Log"]
        log_data = []
        for r in range(7, 107):
            row_vals = []
            for c in range(2, 10):
                v = ws_log.cell(r, c).value
                row_vals.append(str(v) if v is not None else "")
            log_data.append(row_vals)
        ops.append({
            "op": "write",
            "range": "'Log'!B7:I106",
            "data": log_data
        })

    # 2. Split Log: B7:M106
    if "Split Log" in wb.sheetnames:
        ws_split = wb["Split Log"]
        split_data = []
        for r in range(7, 107):
            row_vals = []
            for c in range(2, 14):
                v = ws_split.cell(r, c).value
                if isinstance(v, (datetime.date, datetime.datetime)):
                    row_vals.append(v.strftime("%Y-%m-%d"))
                elif v is not None:
                    row_vals.append(str(v))
                else:
                    row_vals.append("")
            split_data.append(row_vals)
        ops.append({
            "op": "write",
            "range": "'Split Log'!B7:M106",
            "data": split_data
        })

    # 3. Debt Status: B8:I107
    if "Debt Status" in wb.sheetnames:
        ws_debt = wb["Debt Status"]
        debt_data = []
        for r in range(8, 108):
            row_vals = []
            for c in range(2, 10):
                v = ws_debt.cell(r, c).value
                row_vals.append(str(v) if v is not None else "")
            debt_data.append(row_vals)
        ops.append({
            "op": "write",
            "range": "'Debt Status'!B8:I107",
            "data": debt_data
        })

    # 4. Lists: A2:E50
    if "Lists" in wb.sheetnames:
        ws_lists = wb["Lists"]
        lists_data = []
        for r in range(2, 51):
            row_vals = []
            for c in range(1, 6):
                v = ws_lists.cell(r, c).value
                row_vals.append(str(v) if v is not None else "")
            lists_data.append(row_vals)
        ops.append({
            "op": "write",
            "range": "'Lists'!A2:E50",
            "data": lists_data
        })

    # Save payload to temp file
    batch_json_path = "/tmp/sync_batch_payload.json"
    with open(batch_json_path, "w") as f:
        json.dump(ops, f)

    # Execute batch update
    cmd = [GSHEETS_CLI, "mutate", "batch", SPREADSHEET_ID, "-f", batch_json_path]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=os.environ)

    if res.returncode == 0:
        log(f"Sync successful! Updated {len(ops)} sheets on Google Sheets.")
        return True
    else:
        log(f"Sync failed: {res.stderr}")
        return False

def watch_loop():
    log("Starting file watcher daemon for live auto-sync to Google Sheets...")
    files_to_watch = [
        DESKTOP_XLSX,
        DESKTOP_NUMBERS,
        WORKSPACE_XLSX
    ]
    
    last_mtimes = {}
    for f in files_to_watch:
        if os.path.exists(f):
            last_mtimes[f] = os.path.getmtime(f)
            
    log(f"Monitoring {len(last_mtimes)} files for changes: {[os.path.basename(f) for f in last_mtimes]}")
    
    while True:
        try:
            time.sleep(2)
            changed = False
            for f in files_to_watch:
                if os.path.exists(f):
                    current_mtime = os.path.getmtime(f)
                    if f not in last_mtimes:
                        last_mtimes[f] = current_mtime
                        changed = True
                    elif current_mtime > last_mtimes[f]:
                        last_mtimes[f] = current_mtime
                        changed = True
                        log(f"Detected modification in {os.path.basename(f)}")
            
            if changed:
                time.sleep(1) # Debounce
                run_sync()
        except KeyboardInterrupt:
            log("Watcher stopped.")
            break
        except Exception as e:
            log(f"Watcher loop error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    if "--watch" in sys.argv:
        watch_loop()
    else:
        success = run_sync()
        sys.exit(0 if success else 1)
