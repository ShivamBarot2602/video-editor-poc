import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import EditorFrame, { StatusChip, TimelinePlaceholder } from '../smartcrop/components/EditorFrame.jsx'
import AspectPicker from '../smartcrop/components/AspectPicker.jsx'
import LayoutPicker from '../smartcrop/components/LayoutPicker.jsx'
import ProcessingOverlay from '../smartcrop/components/ProcessingOverlay.jsx'
import FailedPanel from '../smartcrop/components/FailedPanel.jsx'
import EditorScreen from '../smartcrop/components/EditorScreen.jsx'
import VideoBox from '../smartcrop/components/VideoBox.jsx'
import { useProjectStatus } from '../smartcrop/hooks/useProjectStatus.js'
import { SCREENS, failureInfo, screenFor } from '../smartcrop/core/projectStatus.js'
import '../smartcrop/smartcrop.css'

// /smartcrop/:projectId — picks the screen from the project status (05 §2),
// so a reload at any step lands in the right place.

// Initial aspect/layout, shown but locked until the project is READY.
function LockedPickers({ initial }) {
  return (
    <>
      <AspectPicker value={initial?.aspect} disabled />
      <LayoutPicker aspect={initial?.aspect} value={initial?.layout} disabled />
    </>
  )
}

// Loading / not found / unreachable: the frame with a message in the stage.
function MessageFrame({ title = 'SmartCrop', children }) {
  return <EditorFrame title={title} stage={<VideoBox>{children}</VideoBox>} timeline={<TimelinePlaceholder />} />
}

function ProcessingScreen({ project, receivedAt }) {
  return (
    <EditorFrame
      title={project.title}
      status={<StatusChip icon={<LoaderCircle size={13} className="sc-spinner" />}>Processing</StatusChip>}
      actions={<button type="button" className="sc-pill-btn" disabled>Save</button>}
      stage={<ProcessingOverlay aspect={project.initial?.aspect} processing={project.processing} receivedAt={receivedAt} />}
      controls={<LockedPickers initial={project.initial} />}
      timeline={<TimelinePlaceholder />}
    />
  )
}

function FailedScreen({ project, onRetry }) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(null)
  const info = failureInfo(project)

  async function retry() {
    setRetrying(true)
    setRetryError(null)
    try {
      await onRetry()
    } catch (err) {
      setRetryError(err.message)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <EditorFrame
      title={project.title}
      status={<StatusChip tone="error" icon={<TriangleAlert size={13} />}>Failed</StatusChip>}
      stage={(
        <FailedPanel
          aspect={project.initial?.aspect}
          title={info.title}
          message={info.message}
          retryable={info.retryable}
          onRetry={retry}
          retrying={retrying}
          retryError={retryError}
        />
      )}
      timeline={<TimelinePlaceholder />}
    />
  )
}

export default function SmartcropEditor() {
  const { projectId } = useParams()
  const { project, receivedAt, error, notFound, loading, retry } = useProjectStatus(projectId)

  if (notFound) {
    return (
      <EditorFrame
        title="SmartCrop"
        stage={<FailedPanel title="Project not found" message="This project doesn't exist or was deleted." />}
        timeline={<TimelinePlaceholder />}
      />
    )
  }

  if (!project) {
    // Polling keeps retrying, so an unreachable server recovers on its own.
    return (
      <MessageFrame>
        <LoaderCircle size={30} className="sc-spinner" />
        <p className="sc-stage-sub">{loading ? 'Loading…' : `${error?.message} Retrying…`}</p>
      </MessageFrame>
    )
  }

  switch (screenFor(project)) {
    case SCREENS.PROCESSING: return <ProcessingScreen project={project} receivedAt={receivedAt} />
    case SCREENS.EDITOR: return <EditorScreen project={project} />
    default: return <FailedScreen project={project} onRetry={retry} />
  }
}
