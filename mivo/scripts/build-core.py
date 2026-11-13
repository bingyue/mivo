import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
if os.environ.get('MIVO_DISTRIBUTION_MODE', 'personal_noncommercial') != 'personal_noncommercial':
    raise SystemExit('Commercial derivatives require separate upstream permission.')
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--name', 'mivo-core',
                '--distpath', str(root / 'apps/desktop/src-tauri/resources/mivo/core'),
                '--workpath', str(root / '.mivo-local/pyinstaller'), '--specpath', str(root / '.mivo-local'),
                '--paths', str(root / 'mivo/core'), '--collect-all', 'faster_whisper',
                '--collect-all', 'ctranslate2', '--collect-all', 'onnxruntime', '--collect-all', 'tokenizers',
                '--hidden-import', 'mivo_core.asr', '--hidden-import', 'mivo_core.mcp_server',
                str(root / 'mivo/core/frozen_entry.py')], cwd=root, check=True)
