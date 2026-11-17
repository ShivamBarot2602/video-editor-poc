import { LoaderCircle } from 'lucide-react'
import VideoBox from './VideoBox.jsx'
import { useNow } from '../hooks/useNow.js'
import { STAGE_TEXT, elapsedSince, stageText } from '../core/projectStatus.js'
import { formatMs } from '../core/time.js'

const STAGES = Object.keys(STAGE_TEXT)

function StageSteps({ stage }) {
  const current = Math.max(0, STAGES.indexOf(stage))
  return (
    <div className="sc-steps" aria-hidden>
      {STAGES.map((s, i) => (
        <span key={s} className="sc-step" data-state={i < current ? 'done' : i === current ? 'active' : 'todo'} />
      ))}
    </div>
  )
}

// Processing screen (05 §2): spinner, stage text, elapsed time.
// `receivedAt` = when `processing` was fetched (Date.now()).
export default function ProcessingOverlay({ aspect, processing, receivedAt }) {
  const now = useNow()
  const stage = processing?.stage

  return (
    <VideoBox aspect={aspect}>
      <LoaderCircle size={30} className="spin" />
      <p className="sc-stage-text" role="status" aria-live="polite">{stageText(stage)}</p>
      <p className="sc-stage-sub">{formatMs(elapsedSince(processing, receivedAt, now))} elapsed</p>
      <StageSteps stage={stage} />
    </VideoBox>
  )
}
