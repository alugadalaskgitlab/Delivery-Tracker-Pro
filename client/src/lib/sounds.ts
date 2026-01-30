const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine') {
  if (!audioContext) return;
  
  try {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.log('Audio play failed:', error);
  }
}

export function playNewDispatchSound() {
  playBeep(880, 0.15, 'sine');
  setTimeout(() => playBeep(1100, 0.15, 'sine'), 150);
  setTimeout(() => playBeep(1320, 0.2, 'sine'), 300);
}

export function playStatusUpdateSound() {
  playBeep(660, 0.1, 'sine');
  setTimeout(() => playBeep(880, 0.15, 'sine'), 100);
}

export function playArrivedSound() {
  playBeep(523, 0.12, 'triangle');
  setTimeout(() => playBeep(659, 0.12, 'triangle'), 120);
}

export function playLeftSound() {
  playBeep(784, 0.15, 'triangle');
  setTimeout(() => playBeep(1047, 0.2, 'triangle'), 150);
}

export function initializeAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}
