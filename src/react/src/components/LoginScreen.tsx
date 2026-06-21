import { useState, useRef, useEffect } from 'react'
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth'
import { auth } from '../firebase'

export function LoginScreen() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const confirmationRef = useRef<ConfirmationResult | null>(null)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    })
    return () => {
      recaptchaRef.current?.clear()
    }
  }, [])

  const sendCode = async () => {
    setError('')
    const cleaned = phone.trim().replace(/\s/g, '')
    if (!cleaned.startsWith('+')) {
      setError('Include country code, e.g. +1 555 123 4567')
      return
    }
    setSending(true)
    try {
      const verifier = recaptchaRef.current!
      confirmationRef.current = await signInWithPhoneNumber(auth, cleaned, verifier)
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code. Try again.')
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async () => {
    setError('')
    if (!confirmationRef.current) return
    setVerifying(true)
    try {
      await confirmationRef.current.confirm(otp.trim())
      // onAuthStateChanged in AuthContext picks up the new user automatically
    } catch {
      setError('Invalid code. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">KwestKarz</h1>
        <p className="login-subtitle">Fleet Management</p>

        {step === 'phone' && (
          <>
            <label className="login-label" htmlFor="phone-input">
              Phone number
            </label>
            <input
              id="phone-input"
              className="login-input"
              type="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              autoFocus
            />
            <button
              className="login-btn"
              onClick={sendCode}
              disabled={sending || !phone.trim()}
            >
              {sending ? 'Sending…' : 'Send verification code'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <p className="login-hint">
              Code sent to <strong>{phone}</strong>
            </p>
            <label className="login-label" htmlFor="otp-input">
              Verification code
            </label>
            <input
              id="otp-input"
              className="login-input"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
              autoFocus
            />
            <button
              className="login-btn"
              onClick={verifyCode}
              disabled={verifying || otp.trim().length < 4}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            <button
              className="login-link"
              onClick={() => { setStep('phone'); setOtp(''); setError('') }}
            >
              Use a different number
            </button>
          </>
        )}

        {error && <p className="login-error">{error}</p>}
        <div id="recaptcha-container" />
      </div>
    </div>
  )
}
