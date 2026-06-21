import { useRef } from 'react'
import type { RefObject } from 'react'
import type { GuidedCaptureConfig } from '../types'

type Props = {
  guidedCapture: GuidedCaptureConfig
  guidedPhotoUrl: string
  guidedCameraStarting: boolean
  guidedCameraError: string
  guidedVideoRef: RefObject<HTMLVideoElement | null>
  guidedCanvasRef: RefObject<HTMLCanvasElement | null>
  onCancel: () => void
  onCapture: () => void
  onRetake: () => void
  onUsePhoto: () => void
  onNativeCapture: (config: GuidedCaptureConfig) => void
  onRetryCamera: (config: GuidedCaptureConfig) => void
  onCameraReady: () => void
}

export function GuidedCameraModal({
  guidedCapture,
  guidedPhotoUrl,
  guidedCameraStarting,
  guidedCameraError,
  guidedVideoRef,
  guidedCanvasRef,
  onCancel,
  onCapture,
  onRetake,
  onUsePhoto,
  onNativeCapture,
  onRetryCamera,
  onCameraReady,
}: Props) {
  return (
    <div className="camera-modal" role="dialog" aria-modal="true" aria-label={guidedCapture.title}>
      <div className="camera-panel">
        <div className="camera-heading">
          <div>
            <strong>{guidedCapture.title}</strong>
            <span>{guidedCapture.instructions}</span>
          </div>
          <button className="secondary-button" type="button" onClick={onCancel}>
            Close
          </button>
        </div>
        <div className="camera-preview">
          {guidedPhotoUrl ? (
            <img src={guidedPhotoUrl} alt="Captured preview" />
          ) : (
            <>
              <video
                ref={guidedVideoRef}
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(e) => e.currentTarget.play().catch(() => undefined)}
                onCanPlay={onCameraReady}
              />
              {guidedCameraStarting && (
                <div className="camera-wait">
                  <span className="spinner" aria-hidden="true" />
                  <span>Starting camera...</span>
                </div>
              )}
            </>
          )}
          {!guidedPhotoUrl && <div className={`camera-frame ${guidedCapture.overlay}`} aria-hidden="true" />}
        </div>
        {guidedCameraError && <p className="camera-error">{guidedCameraError}</p>}
        <canvas ref={guidedCanvasRef} className="hidden-input" />
        <div className="camera-actions">
          {!guidedPhotoUrl && (
            <button className="secondary-button" type="button" onClick={() => onRetryCamera(guidedCapture)}>
              Retry In-App Camera
            </button>
          )}
          {!guidedPhotoUrl && !guidedCameraError && (
            <button className="shutter-button" type="button" onClick={onCapture} aria-label="Take picture">
              <span aria-hidden="true" />
              Take Picture
            </button>
          )}
          {guidedPhotoUrl && (
            <>
              <button className="secondary-button" type="button" onClick={onRetake}>
                Retake
              </button>
              <button type="button" onClick={onUsePhoto}>
                Use Photo
              </button>
            </>
          )}
          <button type="button" onClick={() => onNativeCapture(guidedCapture)}>
            Use Phone Camera
          </button>
        </div>
      </div>
    </div>
  )
}
