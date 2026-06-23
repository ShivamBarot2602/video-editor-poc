// Static registry of STT providers for the UI (dropdowns, badges, labels).
// Keep in sync with the server's provider registry (app/server/providers/index.js).
export const PROVIDERS = [
  { id: 'assemblyai',   label: 'AssemblyAI',   diarization: true,  note: 'Best diarization · code-mixing' },
  { id: 'deepgram',     label: 'Deepgram',     diarization: true,  note: 'Nova-3 · fast' },
  { id: 'gladia',       label: 'Gladia',       diarization: true,  note: 'Solaria-1 · diarization · code-switching' },
  { id: 'openai',       label: 'OpenAI',       diarization: true,  note: 'gpt-4o-transcribe · diarize' },
  { id: 'groq',         label: 'Groq',         diarization: false, note: 'Whisper Turbo · 100 MB cap' },
  { id: 'xai',          label: 'xAI Grok',     diarization: true,  note: 'Grok STT · 500 MB · diarization · 25 langs' },
  { id: 'mistral',      label: 'Mistral',      diarization: true,  note: 'Voxtral · $0.003/min · 3 hr cap' },
  { id: 'elevenlabs',   label: 'ElevenLabs',   diarization: true,  note: 'Scribe v2 · word timestamps · diarization' },
  { id: 'revai',        label: 'Rev AI',       diarization: true,  note: 'Reverb ASR · premium diarization' },
  { id: 'speechmatics', label: 'Speechmatics', diarization: true,  note: 'Enhanced · 55 langs · 1 GB cap' },
  { id: 'pyannote',     label: 'pyannoteAI',   diarization: true,  note: 'precision-2 · diarization + STT' },
  { id: 'sonix',        label: 'Sonix',        diarization: true,  note: '30 speakers · $10/hr' },
  { id: 'sarvam',       label: 'Sarvam AI',    diarization: true,  note: 'Saaras v3 · 22 Indic langs · code-mixing' },
  { id: 'ibm',          label: 'IBM Watson',   diarization: true,  note: 'Speech to Text · 100 langs · 1 GB cap' },
  { id: 'azure',        label: 'Azure Speech', diarization: true,  note: 'Speech Services · 100 langs · 1 GB cap' },
  { id: 'google',       label: 'Google Cloud', diarization: true,  note: 'Speech-to-Text · 100 langs · 1 GB cap' },
]
