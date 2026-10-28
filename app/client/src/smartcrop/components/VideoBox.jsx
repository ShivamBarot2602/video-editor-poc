// Dark box in the output aspect, standing in for the preview while there is
// nothing to play (processing, failed). Tall/square boxes fill the stage
// height; wide ones its width.
export default function VideoBox({ aspect = '9:16', children }) {
  const [w, h] = aspect.split(':').map(Number)
  return (
    <div
      className="sc-video-box"
      data-orientation={w > h ? 'wide' : 'tall'}
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      {children}
    </div>
  )
}
