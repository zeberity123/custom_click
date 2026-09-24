"""Extract exact PCM click samples; run only when changing the source recordings.

Usage: python scripts/extract_clicks.py PATH_TO_MEDIA
Requires numpy and scipy. Neither is needed to run the app.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

source_dir = Path(sys.argv[1])
source = next(source_dir.glob('1_*_176.wav'))
rate, audio = wavfile.read(source)
mono = audio[:, 0]
hot = np.flatnonzero(np.abs(mono.astype(np.int32)) > 3)
cuts = np.r_[0, np.flatnonzero(np.diff(hot) > rate * .025) + 1]
starts = hot[cuts]
out = Path(__file__).resolve().parent.parent / 'src' / 'assets'
out.mkdir(parents=True, exist_ok=True)
entries = {}
for pitch, onset in zip(['high', 'low'], starts[:2]):
    # Include the entire quiet tail, with no fades, pitch changes or normalization.
    clip = mono[onset:onset + round(rate * .12)]
    wavfile.write(out / f'click-{pitch}.wav', rate, clip)
    entries[pitch] = {
        'startFrame': int(onset), 'frames': len(clip),
        'pcmSha256': hashlib.sha256(clip.tobytes()).hexdigest(),
        'peak': int(np.max(np.abs(clip.astype(np.int32)))),
    }
metadata = {
    'source': source.name, 'sampleRate': rate, 'format': 'PCM signed 16-bit mono',
    'extraction': 'Left channel copied without alteration; source channels are identical.',
    'samples': entries,
}
(out / 'provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=True, indent=2))
