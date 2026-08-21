import os
import math
import struct
import wave

def generate_wav(filename, frequency, duration=0.08, volume=0.8, noise_mix=0.3, double_click=False):
    sample_rate = 44100
    num_samples = int(sample_rate * duration)
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        
        import random
        random.seed(int(frequency))
        
        frames = []
        for i in range(num_samples):
            t = i / sample_rate
            
            if double_click:
                # Two sharp clicks for piece removal
                env1 = math.exp(-i / (sample_rate * 0.015))
                offset2 = int(sample_rate * 0.035)
                env2 = math.exp(-(i - offset2) / (sample_rate * 0.015)) if i >= offset2 else 0.0
                env = max(env1, env2 * 0.7)
            else:
                # Sharp exponential decay for stone wood impact
                env = math.exp(-i / (sample_rate * 0.012))
            
            # Sine wave tone + wood transient noise
            sine_val = math.sin(2 * math.pi * frequency * t)
            # Damped harmonics
            harmonic_val = 0.5 * math.sin(2 * math.pi * (frequency * 2.1) * t) * math.exp(-i / (sample_rate * 0.008))
            noise = (random.random() * 2.0 - 1.0) * noise_mix * math.exp(-i / (sample_rate * 0.005))
            
            sample = (sine_val + harmonic_val + noise) * env * volume
            # Clamp sample
            sample = max(-1.0, min(1.0, sample))
            
            # 16-bit signed integer conversion
            int_sample = int(sample * 32767)
            frames.append(struct.pack('<h', int_sample))
            
        wav_file.writeframes(b''.join(frames))
    print(f"Generated sound asset: {filename}")

if __name__ == "__main__":
    sounds_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "go-sounds")
    generate_wav(os.path.join(sounds_dir, "GoGame-Thwack1.wav"), frequency=540, duration=0.08, volume=0.85)
    generate_wav(os.path.join(sounds_dir, "GoGame-Thwack2.wav"), frequency=660, duration=0.07, volume=0.85)
    generate_wav(os.path.join(sounds_dir, "GoGame-Thwack3.wav"), frequency=480, duration=0.09, volume=0.85)
    generate_wav(os.path.join(sounds_dir, "GoGame-Thwack4.wav"), frequency=750, duration=0.06, volume=0.85)
    generate_wav(os.path.join(sounds_dir, "GoGame-PieceRemoved.mp3"), frequency=820, duration=0.12, volume=0.9, noise_mix=0.5, double_click=True)
