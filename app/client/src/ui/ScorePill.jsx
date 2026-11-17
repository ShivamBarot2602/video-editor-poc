import { Sparkles } from 'lucide-react'

// 0–10 score badge. Tone (green / amber / red) is backed by the number itself,
// so it never relies on color alone.
export default function ScorePill({ score, label = 'Score' }) {
  const num = Number(score)
  const safe = Number.isFinite(num) ? num : 0
  const tone = safe >= 8 ? 'high' : safe >= 5 ? 'mid' : 'low'
  return (
    <span className={`score-pill score-${tone}`} title={`${label}: ${safe.toFixed(1)} / 10`}>
      <Sparkles size={10} /> {safe.toFixed(1)}
    </span>
  )
}
