export const PROVIDERS = [
  { id: 'assemblyai',   label: 'AssemblyAI',   diarization: true,  note: 'Best diarization · code-mixing' },
  { id: 'deepgram',     label: 'Deepgram',     diarization: true,  note: 'Nova-3 · fast' },
  { id: 'gladia',       label: 'Gladia',       diarization: true,  note: 'Solaria-1 · diarization · code-switching' },
  { id: 'openai',       label: 'OpenAI',       diarization: true,  note: 'gpt-4o-transcribe · diarize' },
  { id: 'groq',         label: 'Groq',         diarization: false, note: 'Whisper Turbo · 100 MB cap' },
  { id: 'mistral',      label: 'Mistral',      diarization: true,  note: 'Voxtral · $0.003/min · 3 hr cap' },
  { id: 'elevenlabs',   label: 'ElevenLabs',   diarization: true,  note: 'Scribe v2 · word timestamps · diarization' },
  { id: 'revai',        label: 'Rev AI',       diarization: true,  note: 'Reverb ASR · premium diarization' },
  { id: 'speechmatics', label: 'Speechmatics', diarization: true,  note: 'Enhanced · 55 langs · 1 GB cap' },
  { id: 'pyannote',     label: 'pyannoteAI',   diarization: true,  note: 'precision-2 · diarization + STT' },
  { id: 'sonix',        label: 'Sonix',        diarization: true,  note: '30 speakers · $10/hr' },
  { id: 'sarvam',       label: 'Sarvam AI',    diarization: true,  note: 'Saaras v3 · 22 Indic langs · code-mixing' },
]
