import importlib.metadata
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[2]
output = root / 'apps/desktop/src-tauri/resources/mivo/licenses'
output.mkdir(parents=True, exist_ok=True)
rows = []
for package in sorted(importlib.metadata.distributions(), key=lambda p: p.metadata['Name'].lower()):
    name = package.metadata['Name']
    licenses = []
    for item in package.files or []:
        if any(part.lower().startswith(('license', 'copying', 'notice')) for part in item.parts):
            source = Path(package.locate_file(item))
            if source.is_file():
                destination = output / 'python' / f'{name}-{package.version}' / str(item)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                licenses.append(destination.relative_to(output).as_posix())
    label = package.metadata.get('License-Expression') or package.metadata.get('License')
    if not label:
        label = '; '.join(c for c in package.metadata.get_all('Classifier', []) if c.startswith('License ::')) or 'SEE PACKAGE SOURCE'
    rows.append({'name': name, 'version': package.version, 'license': label, 'license_files': licenses,
                 'source': package.metadata.get_all('Project-URL', [])})
(output / 'python-build-environment.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
for source in [root / 'LICENSE', root / 'LICENSE.details', root / 'LICENSE-MIVO', root / 'NOTICE', root / 'THIRD_PARTY_NOTICES.md', root / 'mivo/THIRD_PARTY_NOTICES.md', root / 'mivo/runtime-lock.json']:
    if source.exists():
        shutil.copyfile(source, output / ('MIVO-' + source.name if source.parent.name == 'mivo' else source.name))
print(f'Copied license texts for {len(rows)} installed Python build/runtime distributions')
