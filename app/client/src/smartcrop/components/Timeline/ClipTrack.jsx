import { memo } from 'react'
import { TIMELINE_PAD, fallbackSlot, spriteTile, visibleTiles } from '../../core/timeline.js'

// The one clip bar (identity edit = the whole video), filled with a thumbnail
// strip (spec 05 §5): tiles from the pipeline's sprite when there is one,
// otherwise the client-captured frames, which fill in as they arrive.

export const TILE_HEIGHT_PX = 64

function SpriteTile({ thumbnails, tile }) {
  const { backgroundPosition, backgroundSize } = spriteTile(thumbnails, tile.ms, TILE_HEIGHT_PX)
  return (
    <span
      className="sc-tile"
      style={{ left: tile.left, width: tile.width, backgroundImage: `url(${thumbnails.url})`, backgroundPosition, backgroundSize }}
    />
  )
}

function FallbackTile({ src, tile }) {
  return (
    <span
      className="sc-tile"
      data-loading={src ? undefined : 'true'}
      style={{ left: tile.left, width: tile.width, backgroundImage: src ? `url(${src})` : undefined }}
    />
  )
}

/**
 * media           GET /editor `media` ({ video: { width, height }, thumbnails })
 * fallbackThumbs  frames from useFallbackThumbnails, by slot (when no sprite)
 * fromX / toX     visible content range — only those tiles are rendered
 */
function ClipTrack({ durationMs, pxPerMs, media, fallbackThumbs, fromX, toX }) {
  const sprite = media.thumbnails
  const tileWidth = sprite
    ? spriteTile(sprite, 0, TILE_HEIGHT_PX).width
    : TILE_HEIGHT_PX * (media.video.width / media.video.height)
  const tiles = visibleTiles({ durationMs, pxPerMs, tileWidth, fromX, toX })
  const slots = fallbackThumbs.length

  return (
    <div className="sc-clip" style={{ left: TIMELINE_PAD, width: durationMs * pxPerMs }}>
      {tiles.map((tile) => (sprite
        ? <SpriteTile key={tile.index} thumbnails={sprite} tile={tile} />
        : <FallbackTile key={tile.index} tile={tile} src={slots ? fallbackThumbs[fallbackSlot(tile.ms, durationMs, slots)] : null} />
      ))}
    </div>
  )
}

export default memo(ClipTrack)
