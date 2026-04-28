/**
 * AssemblyAI provider
 * Supports: speaker diarization, word timestamps, 99 languages, auto-detect, code-mixing
 * Limits: 2.2 GB upload / 5 GB URL, 10 hr max duration
 */
const { buildMetadata, formatTranscript } = require("./utils");

const PROVIDER = "assemblyai";
const MODEL = "universal-2";

module.exports = async function run({ audioPath, language }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  const { AssemblyAI } = require("assemblyai");
  const client = new AssemblyAI({ apiKey });

  const params = {
    audio: audioPath,
    speaker_labels: true,
    speech_models: ["universal-2"],
    ...(language
      ? { language_code: language }
      : {
          language_detection: true,
          language_detection_options: {
            code_switching: true,
          },
        }),
  };

  console.log(`  [assemblyai] Uploading and transcribing…`);
  const transcript = await client.transcripts.transcribe(params);

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI error: ${transcript.error}`);
  }

  const segments = (transcript.utterances || []).map((utt) => ({
    speaker: `SPEAKER_${utt.speaker}`,
    start: utt.start / 1000,
    end: utt.end / 1000,
    text: utt.text,
    words: (utt.words || []).map((w) => ({
      word: w.text,
      start: w.start / 1000,
      end: w.end / 1000,
    })),
  }));

  const speakers = [...new Set(segments.map((s) => s.speaker))].sort();

  return {
    metadata: buildMetadata({
      provider: PROVIDER,
      model: MODEL,
      detectedLanguage: transcript.language_code || language || "unknown",
      durationS: transcript.audio_duration ?? null,
      confidence: transcript.confidence
        ? Math.round(transcript.confidence * 10000) / 10000
        : null,
      speakers,
      segmentCount: segments.length,
      wordTimestamps: true,
    }),
    segments,
    full_transcript: formatTranscript(segments),
    _raw: transcript,
  };
};
