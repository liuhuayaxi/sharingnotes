"""Install the independent local QwenASR event companion; no timed sync."""
import subprocess
from pathlib import Path
if __name__=='__main__':
    home=Path.home();installer=home/'AIcreatedapplication/sharingnotes-monitor/install.py'
    if not installer.is_file():raise SystemExit('Install the independent sharingnotes-monitor companion first')
    subprocess.run([str(home/'AIcreatedapplication/QwenASR/.venv/bin/python'),str(installer)],check=True)
