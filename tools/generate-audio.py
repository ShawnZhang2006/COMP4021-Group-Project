"""Regenerate the two original PCM sound effects using only Python's standard library."""
from pathlib import Path
import math
import random
import struct
import wave

DIRECTORY = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'audio'
DIRECTORY.mkdir(parents=True, exist_ok=True)
RATE = 22050
random.seed(4021)


def save(name, duration, synthesizer):
    samples = []
    for index in range(int(RATE * duration)):
        time = index / RATE
        value = max(-1, min(1, synthesizer(time)))
        samples.append(struct.pack('<h', int(value * 22000)))
    with wave.open(str(DIRECTORY / name), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b''.join(samples))


save('shoot.wav', .16, lambda t: (math.sin(2 * math.pi * (850 * t - 1300 * t * t)) * .7 + (random.random() - .5) * .14) * math.exp(-24 * t))


def chime(t):
    value = 0
    for frequency, delay in [(523.25, 0), (659.25, .12), (783.99, .24), (1046.5, .36)]:
        if t >= delay:
            local = t - delay
            value += math.sin(2 * math.pi * frequency * local) * min(1, local * 90) * math.exp(-4.5 * local) * .26
    return value


save('altar_complete.wav', 1.3, chime)
print('Generated shoot.wav and altar_complete.wav.')
